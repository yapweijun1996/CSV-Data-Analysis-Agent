import { Agent, type AgentTool, type StreamFn } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import type { ColumnAdditivity, ColumnProfile, ResearchPlan } from '../../../../types';
import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import { emitAgentEvent } from '../../monitoring/agentMonitor';
import { emitSilentFailure } from '../../monitoring/silentFailureTracker';
import { getPreferredAnalysisDataset } from '../../reportStructureState';
import type { StoreApi } from '../../types';
import { createPiAppTools } from './piAppTools';
import { createPiCompactionTelemetry, createPiProviderContextTransform, createPiProviderStream, resolvePiModel, resolvePiThinkingLevel } from './piProvider';
import { applyColumnAdditivity, buildResearchPlan, MAX_PLAN_QUESTIONS, MIN_PLAN_QUESTIONS, validateColumnAdditivity, validateResearchQuestions } from './researchPlan';
import { createPiSkillTool } from './piSkillTool';

export const SUBMIT_RESEARCH_PLAN_TOOL = 'submit_research_plan';
const PLANNER_MAX_PROVIDER_TURNS = 9;
const PLANNER_MAX_DATA_TOOL_CALLS = 5;
const PLANNER_MAX_SUBMISSIONS = 3;
const PLANNER_TIME_BUDGET_MS = 75_000;
const MAX_COLUMNS_IN_PROMPT = 80;

const describeColumn = (column: ColumnProfile): string => {
    const parts: string[] = [column.type];
    if (typeof column.uniqueValues === 'number') parts.push(`${column.uniqueValues} distinct`);
    if (typeof column.missingPercentage === 'number' && column.missingPercentage > 0) {
        parts.push(`${Math.round(column.missingPercentage)}% missing`);
    }
    return `- ${column.name} (${parts.join(', ')})`;
};

const buildPlannerSystemPrompt = (params: {
    goal: string;
    fileName: string;
    rowCount: number | null;
    columns: ColumnProfile[];
}): string => [
    'You plan the first analysis of a CSV dataset for a business reader. You decide which questions are worth answering and how to measure them; the app then runs the queries and verifies the numbers.',
    `File: ${params.fileName}${params.rowCount !== null ? ` (${params.rowCount.toLocaleString()} rows)` : ''}`,
    `Research goal: ${params.goal}`,
    `Columns:\n${params.columns.slice(0, MAX_COLUMNS_IN_PROMPT).map(describeColumn).join('\n')}`,
    'How to work:',
    '1. Read the choose-metric-and-aggregation skill first, and any other listed skill that matches.',
    '2. Look at the data only as much as needed (data_describe, data_value_counts, data_missing, data_outliers, data_query) so your choices rest on what the columns actually contain.',
    `3. Call ${SUBMIT_RESEARCH_PLAN_TOOL} once with ${MIN_PLAN_QUESTIONS}-${MAX_PLAN_QUESTIONS} varied questions that a decision-maker would care about. Each question gets a short title, a one-sentence rationale, a dimension and/or a metric using exact column names, and the aggregation that matches the meaning of the metric (do not sum prices or rates; use median or average).`,
    '4. In the same call, fill `columns` for every numeric column you looked at or plan to use as a metric: additivity (additive = summing rows is meaningful, non_additive = it is not) and nature (flow, stock, ratio, unit_value, other), judged from what the values mean, not from the column name. A rate, ratio, unit price or point-in-time balance is non_additive.',
    '5. If the tool rejects a question, fix it and submit again.',
    'Use only the tools provided. Do not answer the questions yourself; plan them.',
].join('\n');

const optionalString = (description: string) => Type.Optional(Type.Union([Type.String(), Type.Null()], { description }));

const buildSubmitTool = (params: {
    columns: ColumnProfile[];
    datasetVersion: string;
    onAccepted: (plan: ResearchPlan, additivity: Record<string, ColumnAdditivity>) => void;
}): AgentTool => {
    let submissions = 0;
    return {
        name: SUBMIT_RESEARCH_PLAN_TOOL,
        label: 'Submit research plan',
        description: 'Submit the research questions for the first analysis. Column names must match the dataset exactly.',
        parameters: Type.Object({
            questions: Type.Array(Type.Object({
                title: Type.String({ description: 'Short business question, e.g. "Which towns have the highest typical price?"' }),
                rationale: Type.String({ description: 'One sentence on why this matters.' }),
                dimension: optionalString('Column to group by, or null.'),
                metric: optionalString('Numeric column to measure, or null when counting rows.'),
                aggregation: optionalString('sum, avg, median, count, count_distinct, min, max or percentile.'),
                comparison: optionalString('Optional comparison intent such as "trend over time".'),
            })),
            columns: Type.Optional(Type.Array(Type.Object({
                column: Type.String({ description: 'Exact numeric column name.' }),
                kind: Type.String({ description: 'additive or non_additive.' }),
                nature: Type.String({ description: 'flow, stock, ratio, unit_value or other.' }),
                rationale: Type.Optional(Type.String({ description: 'One short sentence.' })),
            }))),
        }),
        executionMode: 'sequential',
        replay: 'never',
        terminate: undefined,
        execute: async (_id, args) => {
            submissions += 1;
            if (submissions > PLANNER_MAX_SUBMISSIONS) {
                throw new Error('The plan was not accepted after several attempts. Stop planning.');
            }
            const validation = validateResearchQuestions(args, params.columns);
            const plan = buildResearchPlan(validation, params.datasetVersion);
            if (!plan) {
                const reasons = validation.rejected.map(item => `"${item.title}": ${item.reason}`).join(' ');
                throw new Error(`Need at least ${MIN_PLAN_QUESTIONS} valid questions; ${validation.questions.length} were valid. ${reasons}`.trim());
            }
            const additivity = validateColumnAdditivity((args as { columns?: unknown })?.columns, params.columns);
            params.onAccepted(plan, additivity.accepted);
            return {
                details: undefined,
                content: [{ type: 'text', text: JSON.stringify({
                    accepted: plan.questions.length,
                    rejected: plan.rejected,
                    columnsAccepted: Object.keys(additivity.accepted).length,
                    columnsRejected: additivity.rejected,
                }) }],
                terminate: true,
            };
        },
    } as AgentTool;
};

/**
 * Lets Pi decide what to investigate before the evidence stage runs. Pi can
 * use the read-only data tools and skills, then submits structured questions
 * that the app validates against the real columns. Any failure is non-fatal:
 * the existing planner runs instead, and the failure is only recorded.
 */
export const runPiResearchPlanner = async (params: {
    store: StoreApi;
    goal: string;
    datasetVersionFallback: string;
    signal: AbortSignal;
    streamFn?: StreamFn;
}): Promise<ResearchPlan | null> => {
    const { store, goal, signal } = params;
    const state = store.getState();
    const dataset = getPreferredAnalysisDataset(state);
    const columns = (state.columnProfiles ?? []) as ColumnProfile[];
    if (!dataset || columns.length === 0) return null;
    const datasetVersion = getCurrentAnalysisDatasetVersion(state) ?? params.datasetVersionFallback;

    let accepted: ResearchPlan | null = null;
    let acceptedAdditivity: Record<string, ColumnAdditivity> = {};
    let providerTurns = 0;
    const planningController = new AbortController();
    const forwardAbort = () => planningController.abort(signal.reason);
    signal.addEventListener('abort', forwardAbort, { once: true });
    if (signal.aborted) forwardAbort();
    const timer = setTimeout(() => planningController.abort(new Error('The research planner time budget expired.')), PLANNER_TIME_BUDGET_MS);

    // Read-only tools only: planning never changes data or creates cards.
    const dataTools = createPiAppTools(store, datasetVersion, {
        allowCardCreation: false,
        maxToolCalls: PLANNER_MAX_DATA_TOOL_CALLS,
        includeSkills: false,
    }).filter(tool => tool.name !== 'data_mutate');
    const tools: AgentTool[] = [
        ...dataTools,
        createPiSkillTool(store),
        buildSubmitTool({ columns, datasetVersion, onAccepted: (plan, additivity) => { accepted = plan; acceptedAdditivity = additivity; } }),
    ];

    const settings = state.settings;
    const agent = new Agent({
        initialState: {
            systemPrompt: buildPlannerSystemPrompt({
                goal,
                fileName: state.csvData?.fileName ?? 'dataset',
                rowCount: state.csvData?.backing?.rowCount ?? dataset.data?.length ?? null,
                columns,
            }),
            model: resolvePiModel(settings),
            thinkingLevel: resolvePiThinkingLevel(settings),
            tools,
        },
        streamFn: params.streamFn ?? createPiProviderStream(settings),
        transformContext: createPiProviderContextTransform(settings, createPiCompactionTelemetry(store)),
        toolExecution: 'sequential',
        finishTurn: () => {
            providerTurns += 1;
            return accepted || providerTurns >= PLANNER_MAX_PROVIDER_TURNS ? { action: 'end' } : undefined;
        },
    });
    const abortAgent = () => agent.abort();
    planningController.signal.addEventListener('abort', abortAgent, { once: true });

    try {
        await agent.prompt('Draft the research plan for this dataset now.');
        if (signal.aborted) throw signal.reason;
        if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
    } catch (error) {
        // A user cancellation must stop the whole run; anything else only skips the plan.
        if (signal.aborted) throw error;
        emitSilentFailure(store as never, error, {
            component: 'PiResearchPlanner',
            recoveryAction: 'existing_topic_planner_used',
            userNotified: false,
            detail: { providerTurns },
        });
        return null;
    } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', forwardAbort);
    }

    if (!accepted) {
        emitSilentFailure(store as never, new Error('Pi ended planning without an accepted plan.'), {
            component: 'PiResearchPlanner',
            recoveryAction: 'existing_topic_planner_used',
            userNotified: false,
            detail: { providerTurns },
        });
        return null;
    }
    store.setState(current => ({
        initialAnalysisPlan: accepted,
        // Pi's additivity judgements travel with the column profiles the evidence stage reads.
        ...(Object.keys(acceptedAdditivity).length > 0
            ? { columnProfiles: applyColumnAdditivity(current.columnProfiles ?? [], acceptedAdditivity) }
            : {}),
    }));
    emitAgentEvent(store, {
        runId: `pi-plan:${datasetVersion}`,
        phase: 'planning',
        step: 'pi_research_plan_ready',
        status: 'done',
        message: `Pi drafted ${(accepted as ResearchPlan).questions.length} research question(s).`,
        detail: { runtimeOwner: 'pi', rejected: (accepted as ResearchPlan).rejected.length },
    });
    return accepted;
};
