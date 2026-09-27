/**
 * AGRUN-007: projects bounded, user-visible app evidence into Agrun's native
 * sessionContext contract. The adapter never includes provider credentials,
 * raw CSV rows, internal reasoning, SQL, or unbounded chat history.
 */
import { resolveCardTrustDecision } from '../../cardTrustDecision';
import type { StoreApi } from '../../types';
import { getCsvDataRowCount } from '../../../../utils/datasetId';
import { safeJsonStringify } from '../../../../utils/serializable';
import type { AgrunRecord } from './types';
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
): string => (state.chatHistory ?? [])
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
): string => [
    'You are the follow-up data-analysis assistant embedded in the current app.',
    `Always answer in ${language}.`,
    'Use the host-provided session context and read-only app actions as the source of truth.',
    'Trust card evidence only according to its explicit verified, caveated, unverified, stale, or weak label.',
    'When the user refers to these, current, visible, or verified results, use the supplied card evidence; do not ask the user to paste information that is already present.',
    'If required evidence is genuinely missing, use an available read-only action or state exactly what is missing.',
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
        'Use these exact resolved dataset column names in read-only query actions. Do not omit a requested grouping column from the query result.',
    ].filter(Boolean).join('\n');
};

export const createAgrunFollowUpContextInput = (
    state: ReturnType<StoreApi['getState']>,
    appMemory: string[] = [],
    requestContext: {
        queryUnderstandingArtifact?: QueryUnderstandingArtifact;
        groundingResult?: GroundingResult;
    } = {},
): AgrunRecord => {
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

    return {
        // The pinned UMD runtime preserves systemPrompt across every planner
        // mode, while some direct-run projections omit sessionContext summary
        // fields. Carry the same bounded evidence in both contracts.
        systemPrompt: buildSystemPrompt(
            state.settings.language,
            compactedContext,
        ),
        sessionContext: {
            currentGoal: state.confirmedAnalysisGoal ?? 'Answer the current follow-up accurately.',
            currentTopic: fileName,
            compactedContext,
            recentTurns: formatRecentTurns(state),
            preferences: `Response language: ${state.settings.language}`,
        },
    };
};
