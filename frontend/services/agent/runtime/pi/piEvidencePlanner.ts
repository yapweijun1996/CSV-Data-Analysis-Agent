import { Agent, type AgentTool, type StreamFn } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import { createSqlEvidenceQueryPlanSchema } from '../../../ai/schemas/analysisSchemas';
import type { ColumnProfile, SqlEvidenceQueryPlan } from '../../../../types';
import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import { emitSilentFailure } from '../../monitoring/silentFailureTracker';
import { inferPreferredResultShape } from '../../planning/evidencePlanAdapter';
import { extractSemanticHints, type AnalysisDatasetContext } from '../../planning/planGenerator';
import type { PlannerSemanticIntent } from '../../planning/planGenerator';
import { normalizeAndValidateSqlEvidenceQueryPlan } from '../../planning/sqlPlanValidator';
import { detectPeriodColumnFamilies } from '../periodColumnDetector';
import type { StoreApi } from '../../types';
import { createPiAppTools } from './piAppTools';
import { createPiCompactionTelemetry, createPiProviderContextTransform, createPiProviderStream, resolvePiModel, resolvePiThinkingLevel } from './piProvider';
import { createPiSkillTool } from './piSkillTool';

export const SUBMIT_EVIDENCE_PLAN_TOOL = 'submit_evidence_plan';
// Tight limits: this runs once per research question inside the initial-analysis time budget.
const EVIDENCE_MAX_PROVIDER_TURNS = 4;
const EVIDENCE_MAX_DATA_TOOL_CALLS = 2;
const EVIDENCE_MAX_SUBMISSIONS = 3;
const EVIDENCE_TIME_BUDGET_MS = 50_000;
const MAX_COLUMNS_IN_PROMPT = 80;
const MAX_HARNESS_CHARS = 1_500;

const describeColumn = (column: ColumnProfile): string => {
    const parts: string[] = [column.type];
    if (typeof column.uniqueValues === 'number') parts.push(`${column.uniqueValues} distinct`);
    if (column.valueRange) parts.push(`range ${column.valueRange[0]} to ${column.valueRange[1]}`);
    return `- ${column.name} (${parts.join(', ')})`;
};

const buildSystemPrompt = (params: {
    topic: string;
    columns: ColumnProfile[];
    intent?: PlannerSemanticIntent | null;
    harnessSummary?: string | null;
    retryFeedback?: string | null;
}): string => [
    'You design one evidence query for a CSV analysis question. The app validates and runs the query; you decide what to measure and how.',
    `Question: ${params.topic}`,
    `Columns:\n${params.columns.slice(0, MAX_COLUMNS_IN_PROMPT).map(describeColumn).join('\n')}`,
    params.intent?.preferredGroupBy ? `Planned grouping: ${params.intent.preferredGroupBy}` : '',
    params.intent?.preferredMetric ? `Planned metric: ${params.intent.preferredMetric}` : '',
    params.harnessSummary ? `Earlier findings:\n${params.harnessSummary.slice(0, MAX_HARNESS_CHARS)}` : '',
    params.retryFeedback ? `Previous attempt feedback: ${params.retryFeedback}` : '',
    'How to work:',
    '1. Read the choose-metric-and-aggregation skill (and explore-with-data-query if you need to look at the data). Follow the aggregation named in the question, for example "median of price by town".',
    `2. Look at the data with at most ${EVIDENCE_MAX_DATA_TOOL_CALLS} data tool calls, only when the column choice is unclear.`,
    `3. Call ${SUBMIT_EVIDENCE_PLAN_TOOL} once with the query plan. Use exact column names. Every aggregate alias must appear in query.select.`,
    '4. If the tool reports errors, fix them and submit again.',
    'Do not answer the question yourself.',
].filter(Boolean).join('\n');

/**
 * Lets Pi design the evidence query for one research question, with the read-only
 * data tools and skills. The app still validates the plan with the same validator
 * as the one-shot planner. Returns null on any failure so the caller falls back
 * to the existing planner; a user cancellation is rethrown.
 */
export const runPiEvidencePlanner = async (params: {
    store: StoreApi;
    topic: string;
    columns: ColumnProfile[];
    datasetContext?: AnalysisDatasetContext | null;
    planningIntent?: PlannerSemanticIntent | null;
    harnessSummary?: string | null;
    retryFeedback?: string | null;
    signal?: AbortSignal;
    streamFn?: StreamFn;
}): Promise<SqlEvidenceQueryPlan | null> => {
    const { store, topic, columns } = params;
    if (columns.length === 0) return null;
    const state = store.getState();
    const datasetVersion = getCurrentAnalysisDatasetVersion(state);
    const columnNames = columns.map(column => column.name);
    const periodFamilies = detectPeriodColumnFamilies(columnNames);
    const semanticHints = extractSemanticHints(params.datasetContext);
    let accepted: SqlEvidenceQueryPlan | null = null;
    let providerTurns = 0;

    const controller = new AbortController();
    const forwardAbort = () => controller.abort(params.signal?.reason);
    params.signal?.addEventListener('abort', forwardAbort, { once: true });
    if (params.signal?.aborted) forwardAbort();
    const timer = setTimeout(() => controller.abort(new Error('The evidence planner time budget expired.')), EVIDENCE_TIME_BUDGET_MS);

    let submissions = 0;
    const submitTool = {
        name: SUBMIT_EVIDENCE_PLAN_TOOL,
        label: 'Submit evidence plan',
        description: 'Submit the evidence query plan for the question. Column names must match the dataset exactly.',
        parameters: Type.Unsafe<Record<string, unknown>>(createSqlEvidenceQueryPlanSchema(columnNames)),
        executionMode: 'sequential',
        replay: 'never',
        execute: async (_id: string, args: Record<string, unknown>) => {
            submissions += 1;
            if (submissions > EVIDENCE_MAX_SUBMISSIONS) throw new Error('The plan was not accepted after several attempts. Stop planning.');
            // No SUM-to-AVG rewriting here: the aggregation is the model's decision and the validator checks it.
            const withShape = { preferredResultShape: inferPreferredResultShape(topic, params.datasetContext ?? undefined), ...args };
            const { validPlan, errors } = normalizeAndValidateSqlEvidenceQueryPlan(withShape, columns, {
                topic,
                intent: params.planningIntent ?? undefined,
                semanticHints,
                lenient: true,
                periodFamilies,
            });
            if (!validPlan) throw new Error(`The plan is invalid: ${errors.join('; ')}`);
            accepted = validPlan;
            return { details: undefined, content: [{ type: 'text' as const, text: 'Plan accepted.' }], terminate: true };
        },
    } as AgentTool;

    const dataTools = createPiAppTools(store, datasetVersion, {
        allowCardCreation: false,
        maxToolCalls: EVIDENCE_MAX_DATA_TOOL_CALLS,
        includeSkills: false,
    }).filter(tool => tool.name !== 'data_mutate');

    const settings = state.settings;
    const agent = new Agent({
        initialState: {
            systemPrompt: buildSystemPrompt(params),
            model: resolvePiModel(settings),
            thinkingLevel: resolvePiThinkingLevel(settings),
            tools: [...dataTools, createPiSkillTool(store), submitTool],
        },
        streamFn: params.streamFn ?? createPiProviderStream(settings),
        transformContext: createPiProviderContextTransform(settings, createPiCompactionTelemetry(store)),
        toolExecution: 'sequential',
        finishTurn: () => {
            providerTurns += 1;
            return accepted || providerTurns >= EVIDENCE_MAX_PROVIDER_TURNS ? { action: 'end' } : undefined;
        },
    });
    const abortAgent = () => agent.abort();
    controller.signal.addEventListener('abort', abortAgent, { once: true });

    try {
        await agent.prompt('Design the evidence query for this question now.');
        if (params.signal?.aborted) throw params.signal.reason;
        if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
    } catch (error) {
        if (params.signal?.aborted) throw error;
        emitSilentFailure(store as never, error, {
            component: 'PiEvidencePlanner',
            recoveryAction: 'existing_evidence_planner_used',
            userNotified: false,
            detail: { providerTurns },
        });
        return null;
    } finally {
        clearTimeout(timer);
        params.signal?.removeEventListener('abort', forwardAbort);
    }
    return accepted;
};
