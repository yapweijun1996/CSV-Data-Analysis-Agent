import type {
    AnalysisCardData,
    AppState,
    CardContext,
    CardReference,
    ChatMessage,
    ColumnProfile,
    CsvRow,
    DataPreparationPlan,
    DatasetKnowledge,
    Settings,
    TranscriptVisibility,
} from '../../types';
import { safeJsonStringify } from '../../utils/serializable';
import { getDataQueryTraceLabel } from '../agent/execution/dataQueryContract';
import { evaluateAutoAnalysisCards } from '../agent/autoAnalysisEvaluation';
import { resolveLongSessionContextPolicy, resolveToolOutputCutoff } from '../agent/runtime/runtimePolicySettings';
import { truncateContextText } from './contextManager';
import { buildDataQueryResultDigest } from '../agent/execution/dataQueryResultDigest';

export const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

export const normalizeInsightGroupBy = (insight: {
    groupBy?: unknown;
    groupByColumn?: unknown;
    groupByColumns?: unknown;
}): string[] => {
    const candidate = insight.groupBy ?? insight.groupByColumns ?? insight.groupByColumn;
    if (Array.isArray(candidate)) {
        return candidate
            .filter((value): value is string => typeof value === 'string')
            .map(value => value.trim())
            .filter(Boolean);
    }
    if (typeof candidate === 'string' && candidate.trim()) {
        return [candidate.trim()];
    }
    return [];
};

export const formatCompactRowSample = (rows: CsvRow[], maxRows = 3) =>
    rows.length > 0 ? safeJsonStringify(rows.slice(0, maxRows), 2) : '[]';

export const summarizeOlderToolOutputs = (omittedCount: number, label: string) =>
    omittedCount > 0
        ? `Older ${label} summarized: ${omittedCount} earlier item(s) were omitted from detailed context.`
        : null;

export const trimChatHistory = (
    chatHistory: ChatMessage[],
    maxMessages = resolveLongSessionContextPolicy().recentChatWindow,
): ChatMessage[] =>
    chatHistory.slice(-maxMessages);

export const trimRelatedCards = (
    relatedCards: CardReference[],
    maxCards = resolveLongSessionContextPolicy().relatedCards,
): CardReference[] =>
    relatedCards.slice(0, maxCards);

export const trimMemoryHits = (
    memoryHits: string[],
    maxHits = resolveLongSessionContextPolicy().memoryHits,
): string[] =>
    memoryHits.slice(0, maxHits);

export const trimRawDataSample = (
    rows: CsvRow[],
    maxRows = resolveLongSessionContextPolicy().rawSampleRows,
): CsvRow[] =>
    rows.slice(0, maxRows);

export const trimCardContext = (
    cardContext: CardContext[],
    maxCards = resolveLongSessionContextPolicy().cardContextCards,
    maxRows = resolveLongSessionContextPolicy().cardContextRows,
): CardContext[] =>
    cardContext.slice(0, maxCards).map(card => ({
        ...card,
        aggregatedDataSample: card.aggregatedDataSample.slice(0, maxRows),
    }));

export const trimAnalysisCards = (
    cards: AnalysisCardData[],
    maxCards = resolveLongSessionContextPolicy().cardContextCards,
    maxRows = resolveLongSessionContextPolicy().cardContextRows,
): AnalysisCardData[] =>
    cards.slice(0, maxCards).map(card => ({
        ...card,
        aggregatedData: card.aggregatedData.slice(0, maxRows),
    }));

// ---------------------------------------------------------------------------
// Transcript hygiene: sanitize ChatMessage[] for model consumption
// ---------------------------------------------------------------------------

const MODEL_TRANSCRIPT_ENTRY_CAP = 280;

const FULL_VISIBILITY_TYPES = new Set<NonNullable<ChatMessage['type']>>([
    'user_message',
    'ai_message',
    'ai_clarification',
    'ai_goal_clarification',
    'ai_proactive_insight',
    'ai_enhancement_suggestion',
]);

const HIDDEN_VISIBILITY_TYPES = new Set<NonNullable<ChatMessage['type']>>([
    'ai_thinking',
    'ai_thought',
    'ai_plan_start',
]);

export const inferContextVisibility = (message: ChatMessage): TranscriptVisibility => {
    if (message.contextVisibility) return message.contextVisibility;
    const type = message.type ?? (message.sender === 'user' ? 'user_message' : 'ai_message');
    if (FULL_VISIBILITY_TYPES.has(type)) return 'full';
    if (HIDDEN_VISIBILITY_TYPES.has(type)) return 'hidden';
    return 'summarized';
};

const summarizeMutationConfirmation = (message: ChatMessage): string => {
    const count = message.mutationConfirmation?.matchedRowCount ?? 0;
    return `Assistant staged a row deletion confirmation for ${count} rows; pending confirmation exists.`;
};

const summarizeQueryTrace = (message: ChatMessage): string => {
    const trace = message.queryTrace;
    if (!trace) return `Assistant ran a query.`;
    return `Assistant ran a ${trace.phase} query via ${trace.engine}; rows ${trace.returnedRows}/${trace.totalMatchedRows}.`;
};

const summarizeCleaningStep = (message: ChatMessage): string => {
    const step = message.cleaningStep;
    if (!step) return `Cleaning step reported.`;
    const toolSuffix = step.toolName ? ` via ${step.toolName}` : '';
    return `Cleaning ${step.kind} step is ${step.status}${toolSuffix}.`;
};

const summarizeCleaningFailure = (message: ChatMessage): string => {
    const text = (message.text || '').slice(0, MODEL_TRANSCRIPT_ENTRY_CAP);
    return `Cleaning runtime reported an error: ${text}.`;
};

export interface SanitizedTranscriptEntry {
    sender: 'user' | 'ai';
    text: string;
    type: NonNullable<ChatMessage['type']>;
}

const buildSummaryText = (message: ChatMessage): string => {
    if (message.modelText !== undefined && message.modelText !== null) {
        return message.modelText;
    }
    switch (message.type) {
        case 'ai_mutation_confirmation':
            return summarizeMutationConfirmation(message);
        case 'ai_query_trace':
            return summarizeQueryTrace(message);
        case 'ai_cleaning_step':
            return summarizeCleaningStep(message);
        case 'ai_cleaning_failure':
            return summarizeCleaningFailure(message);
        default:
            return (message.text || '').slice(0, MODEL_TRANSCRIPT_ENTRY_CAP);
    }
};

const capEntryText = (text: string): string =>
    text.length <= MODEL_TRANSCRIPT_ENTRY_CAP
        ? text
        : text.slice(0, MODEL_TRANSCRIPT_ENTRY_CAP) + '...';

export const sanitizeChatHistoryForModel = (chatHistory: ChatMessage[]): SanitizedTranscriptEntry[] => {
    const entries: SanitizedTranscriptEntry[] = [];
    let prevNormalizedKey = '';

    for (const message of chatHistory) {
        const visibility = inferContextVisibility(message);
        if (visibility === 'hidden') continue;

        const type = message.type ?? (message.sender === 'user' ? 'user_message' : 'ai_message');
        let text: string;

        if (visibility === 'full') {
            text = message.modelText ?? message.text;
        } else {
            text = capEntryText(buildSummaryText(message));
        }

        const normalizedKey = `${message.sender}:${text.replace(/\s+/g, ' ').trim()}`;
        if (normalizedKey === prevNormalizedKey && normalizedKey.length > 2) continue;
        prevNormalizedKey = normalizedKey;

        entries.push({ sender: message.sender, text, type });
    }

    return entries;
};

const formatTranscriptEntry = (entry: SanitizedTranscriptEntry): string =>
    `${entry.sender === 'ai' ? 'Assistant' : 'User'}: ${entry.text}`;

export const formatSanitizedTranscript = (
    entries: SanitizedTranscriptEntry[],
): string =>
    entries.length > 0
        ? entries.map(formatTranscriptEntry).join('\n')
        : 'No recent conversation.';

export const trimSanitizedTranscript = (
    entries: SanitizedTranscriptEntry[],
    maxEntries = resolveLongSessionContextPolicy().recentChatWindow,
): SanitizedTranscriptEntry[] =>
    entries.slice(-maxEntries);

export const formatChatHistory = (chatHistory: ChatMessage[]): string => {
    const sanitized = sanitizeChatHistoryForModel(chatHistory);
    return formatSanitizedTranscript(sanitized);
};

export const formatCollapsedChatHistory = (
    chatHistory: ChatMessage[],
    settings?: Partial<Settings> | null,
): string => {
    const windowSize = resolveLongSessionContextPolicy(settings).recentChatWindow;
    const sanitized = sanitizeChatHistoryForModel(chatHistory);
    return formatSanitizedTranscript(sanitized.slice(-windowSize));
};

export const formatColumnProfiles = (columns: ColumnProfile[]): string =>
    columns.length > 0 ? safeJsonStringify(columns, 2) : '[]';

export const formatColumnQualitySummary = (columns: ColumnProfile[], maxColumns = 24): string => {
    if (columns.length === 0) {
        return 'No column quality profile is available.';
    }

    const lines = columns.slice(0, maxColumns).map(column => {
        const missing = typeof column.missingPercentage === 'number'
            ? `${column.missingPercentage.toFixed(1)}% missing`
            : 'missing n/a';
        const unique = typeof column.uniqueValues === 'number'
            ? `${column.uniqueValues} unique`
            : 'unique n/a';
        const range = column.valueRange
            ? `, range ${column.valueRange[0]} to ${column.valueRange[1]}`
            : '';
        return `- ${column.name}: ${column.type}, ${missing}, ${unique}${range}`;
    });

    if (columns.length > maxColumns) {
        lines.push(`- ... ${columns.length - maxColumns} more columns not shown`);
    }

    return lines.join('\n');
};

export const formatColumnNames = (columns: ColumnProfile[]): string =>
    columns.length > 0 ? columns.map(column => column.name).join(', ') : 'None available';

export const formatRows = (rows: CsvRow[]): string =>
    rows.length > 0 ? safeJsonStringify(rows, 2) : '[]';

export const formatRelatedCards = (relatedCards: CardReference[]): string =>
    relatedCards.length > 0
        ? relatedCards.map(card => `- (${card.relevance.toFixed(2)}) ${card.displayTitle || card.title} | Group By: ${card.groupByColumn || 'n/a'} | Value: ${card.valueColumn || 'n/a'} | Aggregation: ${card.aggregation || 'n/a'} | Card ID: ${card.id}`).join('\n')
        : 'No high-confidence matches were found for this query.';

export const formatCardContext = (cardContext: CardContext[]): string =>
    cardContext.length > 0 ? safeJsonStringify(cardContext, 2) : 'No cards yet.';

export const formatCardTitles = (cards: AnalysisCardData[]): string =>
    cards.length > 0 ? cards.map(card => card.plan.title).join(', ') : 'No cards created yet.';

export const formatLongTermMemory = (memoryHits: string[]): string =>
    memoryHits.length > 0 ? memoryHits.join('\n---\n') : 'No relevant long-term memory.';

type VisibleEvidenceState = Pick<
AppState,
'contextualSummary' | 'activeDataQuery' | 'activeMetricMappingValidation' | 'activeSpreadsheetFilter' | 'analysisCards' | 'queryHistory' | 'chatHistory' | 'cleaningRun' | 'activeTurn'
>;

const formatActiveDataQueryEvidence = (state: VisibleEvidenceState) => {
    const activeDataQuery = state.activeDataQuery;
    if (!activeDataQuery) {
        return 'No active data.query result.';
    }

    const result = activeDataQuery.result;
    const hasCompleteBoundedRows = result.truncated !== true
        && result.returnedRows <= 25
        && result.rows.length === result.returnedRows;
    const rowEvidenceLabel = hasCompleteBoundedRows
        ? 'Result rows (complete)'
        : 'Preview rows (partial)';
    const rowEvidence = hasCompleteBoundedRows
        ? formatRows(result.rows)
        : formatCompactRowSample(result.rows);

    return [
        `Explanation: ${activeDataQuery.explanation}`,
        `Engine: ${activeDataQuery.engine}`,
        `Selected columns: ${result.selectedColumns.join(', ') || 'none'}`,
        `Rows: ${result.returnedRows}/${result.totalMatchedRows}`,
        `Order: ${result.appliedOrderBy.length > 0
            ? result.appliedOrderBy.map(order => `${order.column} ${order.direction}`).join(', ')
            : 'none'}`,
        `Full-result digest:\n${safeJsonStringify(buildDataQueryResultDigest(
            result.rows,
            result.selectedColumns,
        ), 2)}`,
        `${rowEvidenceLabel}:\n${rowEvidence}`,
    ].join('\n');
};

const formatActiveSpreadsheetFilterEvidence = (state: VisibleEvidenceState) => {
    const activeSpreadsheetFilter = state.activeSpreadsheetFilter;
    if (!activeSpreadsheetFilter) {
        return 'No active spreadsheet filter.';
    }

    return [
        `Query: ${activeSpreadsheetFilter.query}`,
        `Matched rows: ${activeSpreadsheetFilter.observation.matchedRowCount}`,
        `Selected column: ${activeSpreadsheetFilter.observation.selectedColumn ?? 'n/a'}`,
        `Operator: ${activeSpreadsheetFilter.observation.operator ?? 'n/a'}`,
        `Value: ${activeSpreadsheetFilter.observation.value === null || activeSpreadsheetFilter.observation.value === undefined
            ? 'n/a'
            : safeJsonStringify(activeSpreadsheetFilter.observation.value)}`,
        `Preview rows:\n${formatCompactRowSample(activeSpreadsheetFilter.observation.previewRows)}`,
    ].join('\n');
};

const formatActiveMetricMappingValidationEvidence = (state: VisibleEvidenceState) => {
    const artifact = state.activeMetricMappingValidation;
    if (!artifact) {
        return 'No active metric mapping validation.';
    }

    const grain = Array.isArray(artifact.grain) ? artifact.grain : [];
    const blockers = Array.isArray(artifact.blockers) ? artifact.blockers : [];

    return [
        `Metric: ${artifact.metricName}`,
        `Recommended action: ${artifact.recommendedAction}`,
        `Recommended path: ${artifact.recommendedPath}`,
        `Grain: ${grain.join(', ') || 'none'}`,
        `Blockers: ${blockers.join(' | ') || 'none'}`,
    ].join('\n');
};

const formatLatestRuntimeBlockerEvidence = (
    state: VisibleEvidenceState,
    settings?: Partial<Settings> | null,
) => {
    const observation = state.activeTurn?.lastObservation;
    if (!observation || (observation.status !== 'blocked' && observation.status !== 'error')) {
        return 'No active runtime blocker.';
    }

    const policy = resolveLongSessionContextPolicy(settings);
    return [
        `Status: ${observation.status}`,
        `Summary: ${truncateContextText(observation.summary, policy.maxObservationChars)}`,
        `Retry hint: ${truncateContextText(observation.retryHint || 'n/a', policy.maxObservationChars)}`,
    ].join('\n');
};

const formatCleaningRuntimeEvidence = (
    state: VisibleEvidenceState,
    settings?: Partial<Settings> | null,
) => {
    const cleaningRun = state.cleaningRun;
    if (!cleaningRun) {
        return 'No active cleaning runtime.';
    }

    const policy = resolveLongSessionContextPolicy(settings);
    return [
        `Status: ${cleaningRun.status}`,
        `Strategy: ${cleaningRun.strategyKind ?? 'n/a'}`,
        `Verification gap: ${cleaningRun.lastVerificationReason ?? 'n/a'}`,
        `Last error: ${truncateContextText(cleaningRun.lastError ?? 'n/a', policy.maxObservationChars)}`,
    ].join('\n');
};

const formatAnalysisCardEvidence = (cards: AnalysisCardData[]) => {
    if (cards.length === 0) {
        return 'No cards are currently visible.';
    }

    const evaluationByCardId = new Map(
        evaluateAutoAnalysisCards(cards).cards.map(card => [card.cardId, card]),
    );

    return trimAnalysisCards(cards).map(card => {
        const verdict = card.autoAnalysisEvaluation?.verdict ?? evaluationByCardId.get(card.id)?.verdict ?? 'unknown';
        const verdictDetail = (card.autoAnalysisEvaluation?.reasonCodes.length ?? evaluationByCardId.get(card.id)?.reasonCodes.length ?? 0) > 0
            ? ` (${card.autoAnalysisEvaluation?.detail ?? evaluationByCardId.get(card.id)?.detail})`
            : '';
        const valueGate = card.evidenceValueGate;
        const valueGateLine = valueGate
            ? `  Value gate: ${valueGate.decision}${valueGate.reasonCodes.length > 0 ? ` [${valueGate.reasonCodes.join(', ')}]` : ''}${valueGate.detail ? ` — ${valueGate.detail}` : ''}`
            : null;
        return [
            `- ${card.plan.title}`,
            `  Chart: ${card.displayChartType}`,
            `  Group/value: ${card.plan.groupByColumn ?? 'n/a'} / ${card.plan.valueColumn ?? card.plan.yValueColumn ?? 'n/a'}`,
            `  Rows: ${card.aggregatedData.length}`,
            `  Evidence: ${verdict}${verdictDetail}`,
            valueGateLine,
            `  Sample:\n${formatCompactRowSample(card.aggregatedData)}`,
        ].filter(Boolean).join('\n');
    }).join('\n\n');
};

const formatRecentQueryEvidence = (
    state: VisibleEvidenceState,
    settings?: Partial<Settings> | null,
) => {
    const toolOutputCutoff = resolveToolOutputCutoff(settings);
    const recentQueries = state.queryHistory.slice(-toolOutputCutoff);
    const omittedCount = Math.max(0, state.queryHistory.length - recentQueries.length);
    if (recentQueries.length === 0) {
        return 'No recent query trace.';
    }

    return [
        summarizeOlderToolOutputs(omittedCount, 'query traces'),
        ...recentQueries.map(entry => [
            `- ${entry.explanation}`,
            `  Engine: ${entry.engine}`,
            `  Rows: ${entry.result.returnedRows}/${entry.result.totalMatchedRows}`,
            `  Order: ${entry.result.appliedOrderBy.length > 0
                ? entry.result.appliedOrderBy.map(order => `${order.column} ${order.direction}`).join(', ')
                : 'none'}`,
            `  Preview rows:\n${formatCompactRowSample(entry.result.previewRows)}`,
        ].join('\n')),
    ]
        .filter((value): value is string => Boolean(value))
        .join('\n\n');
};

const buildVisibleEvidenceState = (
    state: Partial<VisibleEvidenceState>,
): VisibleEvidenceState => ({
    contextualSummary: state.contextualSummary ?? null,
    activeDataQuery: state.activeDataQuery ?? null,
    activeMetricMappingValidation: state.activeMetricMappingValidation ?? null,
    activeSpreadsheetFilter: state.activeSpreadsheetFilter ?? null,
    analysisCards: state.analysisCards ?? [],
    queryHistory: state.queryHistory ?? [],
    chatHistory: state.chatHistory ?? [],
    cleaningRun: state.cleaningRun ?? null,
    activeTurn: state.activeTurn ?? null,
});

export const formatVisibleEvidenceSummary = (
    state: Partial<VisibleEvidenceState>,
    settings?: Partial<Settings> | null,
): string => {
    const visibleEvidenceState = buildVisibleEvidenceState(state);
    const sections = [
        `Contextual summary:\n${visibleEvidenceState.contextualSummary?.trim() || 'No contextual summary yet.'}`,
        `Latest runtime blocker:\n${formatLatestRuntimeBlockerEvidence(visibleEvidenceState, settings)}`,
        `Cleaning runtime:\n${formatCleaningRuntimeEvidence(visibleEvidenceState, settings)}`,
        `Active data query:\n${formatActiveDataQueryEvidence(visibleEvidenceState)}`,
        `Active metric mapping validation:\n${formatActiveMetricMappingValidationEvidence(visibleEvidenceState)}`,
        `Active spreadsheet filter:\n${formatActiveSpreadsheetFilterEvidence(visibleEvidenceState)}`,
        `Visible cards:\n${formatAnalysisCardEvidence(visibleEvidenceState.analysisCards)}`,
        `Recent query trace:\n${formatRecentQueryEvidence(visibleEvidenceState, settings)}`,
    ];

    return sections.join('\n\n');
};

export const formatCompactVisibleEvidenceSummary = (
    state: Partial<VisibleEvidenceState>,
    settings?: Partial<Settings> | null,
): string => {
    const visibleEvidenceState = buildVisibleEvidenceState(state);
    const sections = [
        `Contextual summary:\n${visibleEvidenceState.contextualSummary?.trim() || 'No contextual summary yet.'}`,
        `Latest runtime blocker:\n${formatLatestRuntimeBlockerEvidence(visibleEvidenceState, settings)}`,
        `Cleaning runtime:\n${formatCleaningRuntimeEvidence(visibleEvidenceState, settings)}`,
        `Active data query:\n${formatActiveDataQueryEvidence(visibleEvidenceState)}`,
        `Active spreadsheet filter:\n${formatActiveSpreadsheetFilterEvidence(visibleEvidenceState)}`,
        `Visible cards:\n${formatAnalysisCardEvidence(visibleEvidenceState.analysisCards)}`,
        `Recent query trace:\n${formatRecentQueryEvidence(visibleEvidenceState, settings)}`,
    ];

    return sections.join('\n\n');
};

// ─── AGENT-104: Three-layer evidence formatters ─────────────────

/**
 * Layer 1: Session trace — past queries, contextual summary, cleaning, blockers.
 * Everything that represents "what happened so far" but is NOT a current on-screen artifact.
 */
export const formatVisibleTrace = (
    state: Partial<VisibleEvidenceState>,
    settings?: Partial<Settings> | null,
): string => {
    const visibleEvidenceState = buildVisibleEvidenceState(state);
    const sections = [
        `Contextual summary:\n${visibleEvidenceState.contextualSummary?.trim() || 'No contextual summary yet.'}`,
        `Latest runtime blocker:\n${formatLatestRuntimeBlockerEvidence(visibleEvidenceState, settings)}`,
        `Cleaning runtime:\n${formatCleaningRuntimeEvidence(visibleEvidenceState, settings)}`,
        `Recent query trace:\n${formatRecentQueryEvidence(visibleEvidenceState, settings)}`,
    ];
    return sections.join('\n\n');
};

/**
 * Layer 2: Grounded artifacts — concrete data visible on screen right now.
 * activeDataQuery, metric validation, spreadsheet filter, analysis cards.
 */
export const formatGroundedArtifacts = (
    state: Partial<VisibleEvidenceState>,
    settings?: Partial<Settings> | null,
): string => {
    const visibleEvidenceState = buildVisibleEvidenceState(state);
    const sections = [
        `Active data query:\n${formatActiveDataQueryEvidence(visibleEvidenceState)}`,
        `Active metric mapping validation:\n${formatActiveMetricMappingValidationEvidence(visibleEvidenceState)}`,
        `Active spreadsheet filter:\n${formatActiveSpreadsheetFilterEvidence(visibleEvidenceState)}`,
        `Visible cards:\n${formatAnalysisCardEvidence(visibleEvidenceState.analysisCards)}`,
    ];
    return sections.join('\n\n');
};

export const formatDetailedRecentQueryTrace = (
    queryHistory: AppState['queryHistory'],
    settings?: Partial<Settings> | null,
): string => {
    const { toolOutputCutoff, maxSqlPreviewChars } = resolveLongSessionContextPolicy(settings);
    const recentEntries = queryHistory.slice(-toolOutputCutoff);
    const omittedCount = Math.max(0, queryHistory.length - recentEntries.length);

    if (recentEntries.length === 0) {
        return 'No recent database queries.';
    }

    return [
        summarizeOlderToolOutputs(omittedCount, 'database tool outputs'),
        ...recentEntries.map(entry => `${getDataQueryTraceLabel(entry.phase, entry.plan)} | ${entry.explanation} | ${entry.engine} | rows ${entry.result.returnedRows}/${entry.result.totalMatchedRows} | ${entry.result.durationMs}ms${entry.fallbackReason ? ` | fallback: ${entry.fallbackReason}` : ''}${entry.sqlPreview ? `\nSQL: ${truncateContextText(entry.sqlPreview, maxSqlPreviewChars)}` : ''}`),
    ]
        .filter((value): value is string => Boolean(value))
        .join('\n\n');
};

export const formatRecentWorkspaceActionEvidence = (
    workspaceActionHistory: AppState['workspaceActionHistory'],
    settings?: Partial<Settings> | null,
): string => {
    const { toolOutputCutoff, maxWorkspaceActionChars } = resolveLongSessionContextPolicy(settings);
    const recentActions = workspaceActionHistory.slice(-toolOutputCutoff);
    const omittedCount = Math.max(0, workspaceActionHistory.length - recentActions.length);

    return [
        summarizeOlderToolOutputs(omittedCount, 'workspace tool outputs'),
        ...recentActions.map(action => {
            const timestamp = action.timestamp instanceof Date
                ? action.timestamp.toISOString()
                : String(action.timestamp);
            return `${timestamp} ${action.operation} ${action.path} ${action.success ? 'ok' : 'failed'}: ${truncateContextText(action.message, maxWorkspaceActionChars)}`;
        }),
    ]
        .filter((value): value is string => Boolean(value))
        .join('\n') || 'No recent workspace actions.';
};

export const formatDatasetKnowledge = (datasetKnowledge?: DatasetKnowledge): string => {
    if (!datasetKnowledge) {
        return 'DatasetKnowledge unavailable.';
    }

    const highValueDimensions = (Array.isArray(datasetKnowledge.highValueDimensions) ? datasetKnowledge.highValueDimensions : [])
        .slice(0, 5)
        .map(item => `${item.name} (${item.reason})`)
        .join('; ') || 'None';

    const suspiciousMetrics = (Array.isArray(datasetKnowledge.suspiciousMetrics) ? datasetKnowledge.suspiciousMetrics : [])
        .slice(0, 5)
        .map(item => `${item.name}: ${item.reason}`)
        .join('; ') || 'None';

    const recentInsights = (Array.isArray(datasetKnowledge.groupByInsights) ? datasetKnowledge.groupByInsights : [])
        .slice(-5)
        .map(insight => {
            const groupBy = normalizeInsightGroupBy(insight);
            const groupByLabel = groupBy.join(', ') || 'n/a';
            return `• ${groupByLabel} vs ${insight.metric || 'value'} -> ${insight.verdict} (${insight.commentary || insight.dropReason || 'no note'})`;
        })
        .join('\n') || 'None';

    return [
        `Summary: ${datasetKnowledge.summary || 'Dataset cleaned and analyzed.'}`,
        `Rows: ${datasetKnowledge.facts.cleanedRowCount} of ${datasetKnowledge.facts.originalRowCount}, Columns: ${datasetKnowledge.facts.cleanedColumnCount}`,
        `Primary dimensions: ${datasetKnowledge.facts.primaryDimensions.join(', ') || 'n/a'}`,
        `Primary metrics: ${datasetKnowledge.facts.primaryMetrics.join(', ') || 'n/a'}`,
        `High-value dimensions: ${highValueDimensions}`,
        `Suspicious metrics: ${suspiciousMetrics}`,
        `Recent group-by insights:\n${recentInsights}`,
    ].join('\n');
};

export const formatDataPreparationExplanation = (plan: DataPreparationPlan | null): string => {
    if (!plan) {
        return 'No AI-driven data preparation was performed.';
    }

    const numericStatus = plan.numericReconciliation
        ? (plan.numericReconciliation.passed ? 'passed' : 'failed')
        : 'not_run';
    const sqlPrecheckStatus = plan.sqlPrecheck?.status ?? 'not_run';
    const sqlPlannerAction = plan.sqlPrecheck?.plannerGuidance?.nextAction ?? 'not_set';
    const preferredSqlPairs = plan.sqlPrecheck?.plannerGuidance?.preferredPairs.length
        ? plan.sqlPrecheck.plannerGuidance.preferredPairs
            .map(pair => `${pair.metric} by ${pair.dimension}`)
            .join(', ')
        : 'n/a';
    return `Explanation: ${plan.explanation}\nNumeric reconciliation: ${numericStatus}\nSQL precheck: ${sqlPrecheckStatus}\nSQL planner action: ${sqlPlannerAction}\nPreferred SQL pairs: ${preferredSqlPairs}`;
};

export const formatDataPreparationOperations = (plan: DataPreparationPlan | null): string => {
    if (!plan || plan.operations.length === 0) return '';
    return `Operations Executed:\n${plan.operations.map(operation => `- ${operation.type}: ${operation.reason}`).join('\n')}`;
};

export const formatDataPreparationCode = (plan: DataPreparationPlan | null): string =>
    plan?.legacy?.jsFunctionBody ? `Legacy Code Preview:\n\`\`\`javascript\n${plan.legacy.jsFunctionBody}\n\`\`\`` : '';
