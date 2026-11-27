/** Project bounded app evidence into the browser Pi turn prompt. */
import { excludeRetriedTurn } from '../../../../utils/replyVersions';
import { resolveAvailableSkills } from '../../skills/skillRegistry';
import { buildSkillsPromptSection } from '../../skills/skillsPrompt';
import { resolveCardTrustDecision } from '../../cardTrustDecision';
import type { StoreApi } from '../../types';
import { getCsvDataRowCount } from '../../../../utils/datasetId';
import { safeJsonStringify } from '../../../../utils/serializable';
import type {
    GroundingResult,
    QueryUnderstandingArtifact,
} from '../intentClassificationTypes';

const MAX_CONTEXT_CHARS = 12_000;
const MAX_CARD_COUNT = 6;
const MAX_CARD_ROWS = 3;
const MAX_RECENT_TURNS = 6;
const MAX_RECENT_TURN_CHARS = 800;
const MAX_SUMMARY_CHARS = 1_800;
const MAX_MEMORY_CHARS = 1_800;
const MAX_CARD_SAMPLE_CHARS = 1_000;
const MAX_SYSTEM_EVIDENCE_CHARS = 8_000;
const TRUST_PRIORITY = {
    verified: 0,
    caveated: 1,
    unverified: 2,
    stale: 3,
    weak: 4,
} as const;

const truncate = (value: string, maxChars: number): string =>
    value.length <= maxChars
        ? value
        : `${value.slice(0, Math.max(0, maxChars - 14))}… [truncated]`;

const formatCardEvidence = (
    state: ReturnType<StoreApi['getState']>,
): string => {
    const cards = (state.analysisCards ?? [])
        .map((card, index) => ({
            card,
            index,
            trust: resolveCardTrustDecision(
                card,
                state.semanticDatasetVersion,
            ),
        }))
        .sort((left, right) =>
            TRUST_PRIORITY[left.trust.status] - TRUST_PRIORITY[right.trust.status]
            || left.index - right.index)
        .slice(0, MAX_CARD_COUNT);
    if (cards.length === 0) return 'No analysis cards are currently visible.';

    return cards.map(({ card, trust }) => {
        const groupBy = card.plan.groupByColumn ?? 'n/a';
        const value = card.plan.valueColumn
            ?? card.plan.yValueColumn
            ?? 'n/a';
        const sample = truncate(
            safeJsonStringify(
                card.aggregatedData.slice(0, MAX_CARD_ROWS),
            ),
            MAX_CARD_SAMPLE_CHARS,
        );
        return [
            `- [${trust.status}] ${card.plan.title}`,
            `  Group/value: ${groupBy} / ${value}`,
            `  Aggregation: ${card.plan.aggregation ?? 'n/a'}`,
            `  Result rows: ${card.aggregatedData.length}`,
            `  Evidence sample: ${sample}`,
        ].join('\n');
    }).join('\n');
};

const formatRecentTurns = (
    state: ReturnType<StoreApi['getState']>,
): string => excludeRetriedTurn(state.chatHistory ?? [], state.pendingReplyRetryId)
    .filter(message =>
        (message.sender === 'user' || message.sender === 'ai')
        && message.type !== 'ai_thought'
        && message.type !== 'ai_query_trace')
    .slice(-MAX_RECENT_TURNS)
    .map(message => {
        const role = message.sender === 'user' ? 'User' : 'Assistant';
        return `${role}: ${truncate(message.text.trim(), MAX_RECENT_TURN_CHARS)}`;
    })
    .filter(line => !line.endsWith(': '))
    .join('\n');

const buildSystemPrompt = (
    language: ReturnType<StoreApi['getState']>['settings']['language'],
    compactedContext: string,
    allowCardCreation: boolean,
    cardTarget: number,
): string => [
    'You are the follow-up data-analysis assistant embedded in the current app.',
    `Always answer in ${language}.`,
    allowCardCreation && cardTarget > 1
        ? `Use the host-provided session context and app actions as the source of truth. The user asked for an open-ended analysis: create up to ${cardTarget} dashboard cards with analysis_create_plan, each covering a clearly different angle (different grouping or measure) and avoiding cards that duplicate the visible card evidence. Prefer SQL-first plans for a file-backed dataset. Stop after ${cardTarget} cards. Other card tools: analysis_pivot_matrix (two-axis summary or crosstab), analysis_period_compare (period-over-period), analysis_cohort_retention, analysis_root_cause_breakdown (what drove a change), analysis_correlation (relationships, distribution, outliers, trend); pick one only when it matches the request, otherwise use analysis_create_plan. Never claim a card was saved unless that tool succeeds.`
        : allowCardCreation
        ? 'Use the host-provided session context and app actions as the source of truth. The user requested a new dashboard card: use analysis_create_plan to create it, preferably with a SQL-first plan for a file-backed dataset. Query results in chat alone do not fulfill this request. Other card tools: analysis_pivot_matrix (two-axis summary or crosstab), analysis_period_compare (period-over-period), analysis_cohort_retention, analysis_root_cause_breakdown (what drove a change), analysis_correlation (relationships, distribution, outliers, trend); pick one only when it matches the request, otherwise use analysis_create_plan. Never claim a card was saved unless that tool succeeds.'
        : 'Use the host-provided session context and read-only app actions as the source of truth.',
    'Trust card evidence only according to its explicit verified, caveated, unverified, stale, or weak label.',
    'When the user refers to these, current, visible, or verified results, use the supplied card evidence; do not ask the user to paste information that is already present.',
    'If required evidence is genuinely missing, use an available app action or state exactly what is missing.',
    'Keep SQL, trace IDs, internal enums, and implementation details out of the main answer unless the user asks for technical details.',
    'Host evidence for this turn:',
    truncate(compactedContext, MAX_SYSTEM_EVIDENCE_CHARS),
].join('\n');

const formatResolvedRequestContract = (
    artifact?: QueryUnderstandingArtifact,
    groundingResult?: GroundingResult,
): string => {
    if (!artifact) return '';

    return [
        'App-resolved request contract:',
        `- Task: ${artifact.taskSignal}`,
        `- Required current-turn query scopes: ${JSON.stringify(artifact.requestedQueryScopes ?? [])}`,
        'Historical results resolve references only. Execute fresh data_query tools for requested query scopes. A requested computation instead requires your own complete-table code_run followed by computation_validate; a preview query or provider calculation cannot complete that computation.',
        `- Required computation scope: ${JSON.stringify(artifact.requestedComputationScope ?? null)}`,
        `- Derived calculation: ${JSON.stringify(artifact.queryCalculation ?? null)}`,
        `- Expected output: ${artifact.expectedOutput}`,
        artifact.referencedColumns.length > 0
            ? `- Referenced dataset columns: ${artifact.referencedColumns.join(', ')}`
            : '',
        artifact.groupingColumns.length > 0
            ? `- Grouping columns: ${artifact.groupingColumns.join(', ')}`
            : '',
        artifact.aggregationFunctions.length > 0
            ? `- Aggregations: ${artifact.aggregationFunctions.join(', ')}`
            : '',
        artifact.filterDescription
            ? `- Filters: ${artifact.filterDescription}`
            : '',
        ...(groundingResult?.resolvedAnchors ?? []).map(anchor =>
            `- Resolved reference: ${anchor.raw} -> ${anchor.resolved}${anchor.column ? ` (${anchor.column})` : ''}`),
        'Use these exact resolved dataset column names in app actions. Do not omit a requested grouping column from the query result.',
    ].filter(Boolean).join('\n');
};

export const createPiFollowUpSystemPrompt = (
    state: ReturnType<StoreApi['getState']>,
    appMemory: string[] = [],
    requestContext: {
        queryUnderstandingArtifact?: QueryUnderstandingArtifact;
        groundingResult?: GroundingResult;
        allowCardCreation?: boolean;
        cardTarget?: number;
        codingTask?: import('./piTaskContract').AgentTaskContract;
        taskPlan?: import('./piTaskPlan').TypedTaskPlan;
        skillsPrompt?:string;
    } = {},
): string => {
    const fileName = state.csvData?.fileName || 'Current dataset';
    const preparedRowCount = getCsvDataRowCount(state.canonicalCsvData ?? state.csvData);
    const cardEvidence = formatCardEvidence(state);
    const contextualSummary = state.contextualSummary?.trim()
        || state.aiCoreAnalysisSummary?.text?.trim()
        || state.finalSummary?.text?.trim()
        || '';
    const compactedContext = truncate([
        `Dataset: ${fileName}`,
        `Prepared rows: ${preparedRowCount}`,
        `Dataset version: ${state.semanticDatasetVersion ?? 'unavailable'}`,
        formatResolvedRequestContract(
            requestContext.queryUnderstandingArtifact,
            requestContext.groundingResult,
        ),
        'Visible card evidence:',
        cardEvidence,
        contextualSummary
            ? `Current summary: ${truncate(contextualSummary, MAX_SUMMARY_CHARS)}`
            : '',
        appMemory.length > 0
            ? `App-owned long-term memory:\n${truncate(
                appMemory.map(entry => `- ${entry}`).join('\n'),
                MAX_MEMORY_CHARS,
            )}`
            : '',
    ].filter(Boolean).join('\n\n'), MAX_CONTEXT_CHARS);

    return [
        buildSystemPrompt(state.settings.language, compactedContext, requestContext.allowCardCreation ?? false, requestContext.cardTarget ?? 1),
        `Current goal: ${state.confirmedAnalysisGoal ?? 'Answer the current follow-up accurately.'}`,
        `Recent turns:\n${formatRecentTurns(state)}`,
        requestContext.skillsPrompt??buildSkillsPromptSection(resolveAvailableSkills(state.workspaceFiles).skills),
        ...(requestContext.codingTask ? [
            `Host typed task plan: ${JSON.stringify(requestContext.taskPlan)}. Follow its current phase. Every tool result carries an updated taskPlan. If phase is resolve_scope, use task_scope_repair when offered for a classifier contradiction, otherwise request clarification. Do not write/execute programs until resolved. A successful scope repair supersedes the initial classifier filter description; use its host-resolved scope and new revision. nextTools are dependency steps, not permission to batch them. Copy returned refs only; a plan cannot grant execution or approval. Preserve complete fact membership, source scale, zeros and losses. Inspect actual cells before proposing any exclusion; a company/name containing Total is not a subtotal.`,
            'Governed coding task: inspect with workspace_read/list and load relevant skills. You may write or replace revisioned /workspace/*.js function bodies and immutable JSON inputs, then run code_run using exact path/revision/SHA-256 refs returned by workspace tools.',
            'Only independent reads may be batched. End the assistant turn after each dependency-producing tool and wait for its result before the next dependent call: workspace_write -> code_run -> candidate_stage -> candidate_validate -> candidate_request_approval, or code_run -> computation_validate. Never emit write and run together or put a placeholder in the unknown future receipt/hash. Meaning inference declares conversions; your repair program must actually apply them to produce typed rows before candidate validation.',
            'The program is a synchronous function BODY, not a Node module: use a top-level return; module, exports and tables globals do not exist. JavaScript receives input[name].content for artifact bindings and input[name].rows for table bindings. Every code_run request requires inputs (use [] for table-only work), program and output refs; add tables bindings for complete current rows. Return JSON (or a string for text output). Use real receipt errors/stdout/stderr to repair and rerun. No async, network, packages, shell or accepted dataset writes are available. Do not invent stdout, receipt IDs or validation.',
            'For complete current rows, code_run accepts tables:[{name,tableId}]; input[name].rows is the complete table or execution is blocked. whole_table is the default. stateful_stream uses explicit JSON carry and contiguous partition reset/finish; follow the code_run schema. Never treat a workspace/source preview or row_map declaration as a full-data repair.',
            'For dataset repair without a configured host meaning contract, infer grain, unit, conversions and subtotal scope automatically: inspect complete source/table, then call candidate_infer_meaning BEFORE any code_run. Do not first ask the user to confirm business semantics. Host compiles the source reference and checks complete coverage, grain, types and grouped reconciliation. Interpretations remain AI-inferred assumptions; unsupported inference blocks and preserves accepted data. Then write your own code, stage and independently validate. Exact candidate mutation approval remains required.',
            `Current task table handles: ${JSON.stringify((state.datasetBundle?.tables??[]).slice(0,20).map(table=>({tableId:table.tableId,name:table.name,rowCount:table.rowCount,datasetVersion:table.datasetVersion,storage:table.storage?.mode})))}`,
            'After candidate_validate succeeds, use candidate_request_approval with the exact candidateId and explicit primaryTable. Human review releases the old run; approval resumes the same logical task on the committed version. Retain the task goal and execute fresh verification on the committed binding: computation_validate for a computation scope, otherwise data_query.',
            'code_run stages experimental artifacts. For a fixed supported computation scope, call computation_validate on the successful jobId; host independent validation is required for facts. Otherwise execute data_query matching the current typed scope for factual data answers. Bounded source ranges are not evidence of complete-table coverage. Clarify ambiguity with conversation_request_clarification.',
            ...(requestContext.codingTask.scope.answer.computation?['The current answer scope requires a complete statistical computation. PRECONDITION: if the goal also requires canonical fact-table repair, first complete candidate inference, your own candidate-envelope execution, staging, independent validation and exact approval. Numeric strings in accepted rows require this typed repair; inference and local Number() conversions do not publish it. Run the following statistical sequence only on the eligible committed table. For an already typed read-only dataset, proceed directly. Statistical sequence: (1) workspace_write your own synchronous JavaScript function body; (2) copy that returned artifact path/revision/SHA-256 exactly into code_run.program, pass inputs:[] and the complete table binding, and use a fresh JSON output path; (3) pass the actual returned jobId to computation_validate; (4) only then complete. A listed task/goal file is not a program. Never use a made-up program or placeholder hash. Follow the method output schema in the computation_validate tool. A data_query preview can help inspect columns but never substitutes for the program and independent computation receipt. The computation itself does not repair or publish dataset rows. For a read-only request, do not request mutation approval. If the user also requires a repaired canonical fact table, first infer meaning, stage and independently validate your repair, obtain exact candidate approval, then write and validate a separate computation on the committed version. A pre-commit computation cannot satisfy that combined request.']:[]),
            `Task budget and scope: ${JSON.stringify({ taskId: requestContext.codingTask.taskId, revision: requestContext.codingTask.revision, budget: requestContext.codingTask.budget, scope: requestContext.codingTask.scope.answer })}`,
        ] : []),
    ].filter(Boolean).join('\n\n');
};
