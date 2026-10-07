import { buildEvidenceSkillGuidance } from '../skills/evidencePromptSkills';
import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from '../../ai/streamGenerateText';
import { prepareSchemaForProvider } from '../../ai/googleSchemaAdapter';
import {
    isAggregationType,
    type AggregationType,
    type ColumnProfile,
    type CsvRow,
    type Settings,
    type SqlAnalysisPlan,
    type SqlEvidenceQueryPlan,
} from '../../../types';
import { createAnalysisTopicsSchema, createSqlEvidenceQueryPlanSchema } from '../../ai/schemas/analysisSchemas';
import { createProviderModel } from '../../ai/providerConfig';
import { withTransientRetry } from '../../ai/transientRetry';
import {
    ContextTelemetryTarget,
    createContextSection,
    prepareManagedContext,
    reportContextDiagnostics,
} from '../../ai/contextManager';
import { resolveAiChartType } from './chartTypeResolver';
import {
    AnalysisDatasetContext,
    PlanLearningHints,
    buildAnalysisPlannerSystemPrompt,
    buildPlanRetryFeedback,
    buildTopicPlanningUserPrompt,
    createAnalysisTopicsPrompt,
} from '../../prompts/analysisPrompts';
import { robustlyParseJsonObject } from '../../../utils/jsonParser';
import { compileQueryPlanToDuckDbSql } from '../../duckdb/queryCompiler';
import {
    collectEvidencePlanStabilityReasonCodes,
    normalizeAndValidateSqlAnalysisPlan,
    normalizeAndValidateSqlEvidenceQueryPlan,
    type TopicAlignmentSemanticHints,
} from './sqlPlanValidator';
import {
    applyEvidenceQuerySemanticDefaults,
    topicPrefersAverageAggregation,
} from './evidenceQuerySemantics';
import { isStructuralMetadataColumn } from '../structuralMetadata';
import { runWithOverflowCompaction } from '../../ai/overflowRetry';
import type { AnalysisPlan } from '../../../types';
import { formatAnalysisSteeringBundle } from '../analysisSteering';
import { isRuntimeAbortError, throwIfAborted } from '../runtime/runtimeAbort';
import { logPlannerStabilitySignal, PLANNER_STABILITY_REASON_CODES } from './plannerStability';
import { isTechnicalHelperDimensionColumn, isTimeLikeDimensionColumn } from '../analysisColumnRoles';
import { detectPeriodColumnFamilies } from '../runtime/periodColumnDetector';
import {
    normalizeTopicText, normalizeColumnWords, normalizeColumnKey,
    stripColumnQuotes, tokenizeForTopicMatch, topicMentionsColumn,
    inferCountTopicOperandTarget, COUNT_INTENT_PATTERN,
    TIME_INTENT_PATTERN, IDENTIFIER_LIKE_COLUMN_PATTERN,
    buildColumnNameMap, resolveExactColumnMatch,
} from './semanticTextMatching';
import { createPlannerSections } from './planningContextBuilder';
import { inferPreferredResultShape, adaptEvidencePlanToSqlAnalysisPlan } from './evidencePlanAdapter';

// --- Merged from sqlAnalysisErrors.ts ---

export type SqlAutoAnalysisErrorCode =
    | 'planning_invalid'
    | 'sql_compile_failed'
    | 'duckdb_unavailable'
    | 'duckdb_query_failed'
    | 'empty_result';

export class SqlAutoAnalysisError extends Error {
    code: SqlAutoAnalysisErrorCode;
    detail?: Record<string, unknown>;

    constructor(code: SqlAutoAnalysisErrorCode, message: string, detail?: Record<string, unknown>) {
        super(message);
        this.name = 'SqlAutoAnalysisError';
        this.code = code;
        this.detail = detail;
    }
}

export const isSqlAutoAnalysisError = (value: unknown): value is SqlAutoAnalysisError =>
    value instanceof SqlAutoAnalysisError;

// --- Merged from plannerAgent.ts ---

const normalizeAggregation = (aggregation?: string, valueColumn?: string): AggregationType | undefined => {
    if (!aggregation && valueColumn) return 'sum';
    if (!aggregation && !valueColumn) return 'count';
    if (aggregation === 'average') return 'avg';
    if (isAggregationType(aggregation)) return aggregation;
    return undefined;
};

export const preparePlan = (rawPlan: AnalysisPlan): AnalysisPlan => {
    const plan: AnalysisPlan = { ...rawPlan };
    plan.title = plan.title || 'AI Generated Analysis';
    plan.description = plan.description || `Analysis of ${plan.title}.`;
    plan.chartType = resolveAiChartType(plan.chartType);
    plan.aggregation = normalizeAggregation(plan.aggregation, plan.valueColumn);
    if (plan.chartType !== 'scatter' && !plan.groupByColumn && plan.valueColumn) {
        plan.groupByColumn = plan.valueColumn;
    }
    return plan;
};

// ---

const LOG_PREFIX = '[PlanGenerator]';
const MAX_ATTEMPTS = 3;
export const PLAN_GENERATION_TIMEOUT_MS = 30_000;

const PRIMARY_BUSINESS_METRIC_PATTERN = /(^|[\s_\-.])(amount|balance|cost|expense|income|margin|price|profit|revenue|sales|spend|turnover|value)([\s_\-.]|$)/i;
const SECONDARY_BUSINESS_METRIC_PATTERN = /(^|[\s_\-.])(count|quantity|qty|total|units|volume)([\s_\-.]|$)/i;
const SUPPORTING_MEASURE_PATTERN = /(^|[\s_\-.])(age|area|date|day|duration|floor|id|lease|month|number|sqm|square|year)([\s_\-.]|$)/i;

const scoreDeterministicMetric = (
    column: ColumnProfile,
    preferredRank: number | undefined,
    metricRank: number | undefined,
): number => {
    let score = 0;
    if (column.type === 'currency') score += 80;
    if (PRIMARY_BUSINESS_METRIC_PATTERN.test(column.name)) score += 70;
    if (SECONDARY_BUSINESS_METRIC_PATTERN.test(column.name)) score += 25;
    if (SUPPORTING_MEASURE_PATTERN.test(column.name)) score -= 35;
    if (preferredRank !== undefined) score += Math.max(1, 30 - preferredRank);
    if (metricRank !== undefined) score += Math.max(1, 15 - metricRank);
    return score;
};

// Timeout is now handled by streamGenerateText's activity-aware idle timer.
// PlanGenerationTimeoutError / raceWithPlanTimeout removed — see INFRA-105.
import { isProviderTimeoutError } from '../../ai/streamGenerateText';

// --- Deterministic topic fallback ---
// Used when all AI-based topic generation attempts fail or time out.
// Picks the highest-cardinality non-blocked categorical dimensions and pairs
// them with the first available metric to create "Metric by Dimension" topics.

export const buildDeterministicTopics = (
    columns: ColumnProfile[],
    datasetContext: AnalysisDatasetContext,
): string[] => {
    const blockedSet = new Set(datasetContext.blockedDimensions ?? []);
    const avoidedDimensions = new Set(datasetContext.avoidGrainColumns ?? []);
    const safeDimensionSet = new Set(datasetContext.dimensionColumns ?? []);
    const availableColumnSet = new Set(columns.map(column => column.name));
    const preferredDimensionOrder = [
        ...(datasetContext.preferredTimeColumns ?? []),
        ...(datasetContext.preferredGrainColumns ?? []),
        ...(datasetContext.businessGrains ?? []),
        ...(datasetContext.dimensionColumns ?? []),
    ];
    const preferredDimensionRank = new Map(
        preferredDimensionOrder.map((column, index) => [column, index]),
    );
    const dimensionCandidates = columns
        .filter(c => ['categorical', 'date', 'time'].includes(c.type))
        .filter(c => safeDimensionSet.size === 0 || safeDimensionSet.has(c.name))
        .filter(c => !blockedSet.has(c.name))
        .filter(c => !avoidedDimensions.has(c.name))
        .filter(c => (c.uniqueValues ?? 2) > 1);
    const businessDimensionScore = (column: ColumnProfile): number => {
        const preferredRank = preferredDimensionRank.get(column.name);
        const preferredScore = preferredRank === undefined
            ? 0
            : Math.max(1, 120 - preferredRank);
        const cardinality = column.uniqueValues ?? 0;
        const cardinalityScore = cardinality >= 2 && cardinality <= 50
            ? 60
            : cardinality <= 500
                ? 40
                : cardinality <= 2_000
                    ? 20
                    : 0;
        return preferredScore + cardinalityScore;
    };
    const timeDimension = dimensionCandidates
        .filter(column =>
            column.type === 'date'
            || column.type === 'time'
            || (datasetContext.preferredTimeColumns ?? []).includes(column.name)
            || isTimeLikeDimensionColumn(column.name))
        .sort((left, right) =>
            businessDimensionScore(right) - businessDimensionScore(left))[0];
    const categoricalDimensions = dimensionCandidates
        .filter(column => column.name !== timeDimension?.name)
        .sort((left, right) =>
            businessDimensionScore(right) - businessDimensionScore(left))
        .slice(0, timeDimension ? 2 : 3);
    const dims = [
        ...categoricalDimensions,
        ...(timeDimension ? [timeDimension] : []),
    ].slice(0, 3);
    const avoidedMetrics = new Set(datasetContext.avoidMetricColumns ?? []);
    const preferredMetricRank = new Map(
        (datasetContext.preferredMetricTerms ?? []).map((column, index) => [column, index]),
    );
    const metricColumnRank = new Map(
        (datasetContext.metricColumns ?? []).map((column, index) => [column, index]),
    );
    const rankedMetric = columns
        .filter(column =>
            (
                ['numerical', 'currency', 'percentage'].includes(column.type)
                || preferredMetricRank.has(column.name)
                || metricColumnRank.has(column.name)
            )
            && availableColumnSet.has(column.name)
            && !avoidedMetrics.has(column.name)
            && !isStructuralMetadataColumn(column.name)
            && !isTechnicalHelperDimensionColumn(column.name))
        .map((column, index) => ({
            column,
            index,
            score: scoreDeterministicMetric(
                column,
                preferredMetricRank.get(column.name),
                metricColumnRank.get(column.name),
            ),
        }))
        .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.column.name;
    const metric = rankedMetric
        // Graceful degradation: if ALL metrics are avoided, fall back to the
        // first non-structural metric rather than producing zero topics.
        // A deprioritized metric is better than no card at all.
        ?? datasetContext.metricColumns?.find(column => (
            !isStructuralMetadataColumn(column)
            && !isTechnicalHelperDimensionColumn(column)
            && !avoidedMetrics.has(column)
        ))
        ?? columns.find(c =>
            ['numerical', 'currency', 'percentage'].includes(c.type)
            && !isStructuralMetadataColumn(c.name)
            && !isTechnicalHelperDimensionColumn(c.name)
            && !avoidedMetrics.has(c.name),
        )?.name;
    if (dims.length === 0) return [];
    if (!metric) {
        return dims.map(dim =>
            dim.name === timeDimension?.name
                ? `Record count trend by ${dim.name}`
                : `Record count by ${dim.name}`);
    }
    const topics = dims.map(dim =>
        dim.name === timeDimension?.name
            ? `Average ${metric} trend by ${dim.name}`
            : `${metric} by ${dim.name}`);

    // When period column families exist (wide-pivot with monthly columns),
    // inject a monthly trend topic so the first auto-analysis round
    // produces a time-series line chart.
    const periodFamilies = datasetContext.analysisSteering?.periodColumnFamilies;
    if (periodFamilies && periodFamilies.length > 0) {
        const timeDim = dims.find(d => isTimeLikeDimensionColumn(d.name));
        if (timeDim && !topics.some(t => /\b(trend|over time|monthly)\b/i.test(t))) {
            topics.push(`${metric} monthly trend by ${timeDim.name}`);
        }
    }

    return topics;
};

export type { AnalysisDatasetContext } from '../../prompts/analysisPrompts';

export interface PlannerSemanticIntent {
    preferredGroupBy?: string | null;
    preferredMetric?: string | null;
    preferredFilterIntent?: string | null;
}

const extractSemanticHints = (ctx?: AnalysisDatasetContext | null): TopicAlignmentSemanticHints | undefined => {
    if (!ctx) return undefined;
    const hints: TopicAlignmentSemanticHints = {};
    if (ctx.metricColumns?.length) hints.knownMetricColumns = ctx.metricColumns;
    if (ctx.dimensionColumns?.length) hints.knownDimensionColumns = ctx.dimensionColumns;
    if (ctx.businessGrains?.length) hints.businessGrains = ctx.businessGrains;
    if (ctx.preferredMetricTerms?.length) hints.candidateMetrics = ctx.preferredMetricTerms;
    return Object.keys(hints).length > 0 ? hints : undefined;
};

// --- Topic text intent patterns (FAST HEURISTIC FALLBACK) ---
// These parse AI-generated topic strings to infer query shape and aggregation.
// They are heuristic helpers for the deterministic plan builder, not routing
// decisions. The AI planner is the primary authority — these patterns help
// the plan builder fill in defaults when the AI output is ambiguous.
// Text normalization, column matching, and intent patterns imported from ./semanticTextMatching.

const parseSteppedPredicateLine = (
    line: string,
    columnNameMap: Map<string, string>,
): { predicate: { column: string; operator: 'eq' | 'neq'; value: string } | null; error?: string } => {
    const match = line.match(/^\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`|\[([^\]]+)\]|([^=<>]+?))\s*(=|<>|!=)\s*(.+?)\s*$/);
    if (!match) {
        return { predicate: null };
    }

    const rawColumn = [match[1], match[2], match[3], match[4], match[5]].find(Boolean)?.trim() ?? '';
    const mappedColumn = resolveExactColumnMatch(rawColumn, columnNameMap);
    if (!mappedColumn) {
        return {
            predicate: null,
            error: `Unknown filter column "${rawColumn}" in stepped planner filter response.`,
        };
    }

    const rawValue = match[7]?.trim() ?? '';
    const normalizedValue = rawValue.replace(/^["'`](.*)["'`]$/s, '$1').trim();
    return {
        predicate: {
            column: mappedColumn,
            operator: match[6] === '=' ? 'eq' : 'neq',
            value: normalizedValue,
        },
    };
};

/** Simplified groupBy inference for stepped planner — uses boolean match, not scoring. */
const inferSteppedGroupByTarget = (topic: string, candidates: string[]) => {
    const normalizedTopic = normalizeTopicText(topic);
    const byMatch = normalizedTopic.match(/\b(?:by|per)\s+(.+)$/);
    if (!byMatch) {
        return null;
    }

    const tail = byMatch[1]?.trim();
    if (!tail) {
        return null;
    }

    return candidates.find(candidate => topicMentionsColumn(tail, candidate)) ?? null;
};

const suggestAlternativeDimensions = (columns: ColumnProfile[], learningHints?: PlanLearningHints) => {
    const blocked = new Set((learningHints?.avoidGroupBys ?? []).map(value => value.toLowerCase()));
    return columns
        .filter(column => (column.type === 'categorical' || column.type === 'date' || column.type === 'time'))
        .filter(column => !blocked.has(column.name.toLowerCase()))
        .sort((left, right) => (left.uniqueValues ?? Number.MAX_SAFE_INTEGER) - (right.uniqueValues ?? Number.MAX_SAFE_INTEGER))
        .slice(0, 6)
        .map(column => column.name);
};

const classifyCompileFailure = (message: string) =>
    message.toLowerCase().includes('query') || message.toLowerCase().includes('duckdb')
        ? 'sql_compile_failed'
        : 'planning_invalid';

const isTopicBlockedBySemanticUnderstanding = (
    topic: string,
    datasetContext: AnalysisDatasetContext,
) => (datasetContext.blockedDimensions ?? []).some(column => topicMentionsColumn(topic, column));

const isTopicDeprioritizedByQualityGovernance = (
    topic: string,
    datasetContext: AnalysisDatasetContext,
) => {
    const avoidColumns = new Set([
        ...(datasetContext.avoidGrainColumns ?? []),
        ...(datasetContext.avoidMetricColumns ?? []),
    ]);
    return Array.from(avoidColumns).some(column => topicMentionsColumn(topic, column));
};

const DECISION_OUTCOME_TOPIC_PATTERN = /(^|[\s_\-.])(amount|balance|cost|expense|income|margin|price|profit|revenue|sales|spend|turnover|value)([\s_\-.]|$)/i;
const TEMPORAL_ANALYSIS_TOPIC_PATTERN = /(^|[\s_\-.])(change|date|day|month|quarter|trend|week|year)([\s_\-.]|$)/i;
const MECHANICAL_BREAKDOWN_TOPIC_PATTERN = /\bby\s+(?:uom|curr(?:ency)?|unit\s+of\s+measure)\b/i;

const scoreTopicBusinessValue = (
    topic: string,
    datasetContext: AnalysisDatasetContext,
): number => {
    let score = 0;
    if (DECISION_OUTCOME_TOPIC_PATTERN.test(topic)) score += 4;
    if (TEMPORAL_ANALYSIS_TOPIC_PATTERN.test(topic)) score += 2;
    if (MECHANICAL_BREAKDOWN_TOPIC_PATTERN.test(topic)) score -= 3;

    const preferredDimensions = [
        ...(datasetContext.businessGrains ?? []),
        ...(datasetContext.preferredTimeColumns ?? []),
    ];
    if (preferredDimensions.some(column => topicMentionsColumn(topic, column))) score += 2;
    return score;
};

const isBlockedAggregateMetric = (
    columnName: string | undefined,
    aggregation: string,
    datasetContext?: AnalysisDatasetContext | null,
): boolean => Boolean(
    columnName
    && aggregation !== 'count'
    && aggregation !== 'count_distinct'
    && (
        isStructuralMetadataColumn(columnName)
        || isTechnicalHelperDimensionColumn(columnName)
        || (datasetContext?.avoidMetricColumns ?? []).includes(columnName)
        || (datasetContext?.analysisSteering?.blockedMetrics ?? []).includes(columnName)
        || datasetContext?.analysisSteering?.columnRoles?.[columnName] === 'helper_dimension'
        || datasetContext?.analysisSteering?.columnRoles?.[columnName] === 'structural_metadata'
    )
);

// Context section assembly extracted to planningContextBuilder.ts
// Evidence plan adaptation extracted to evidencePlanAdapter.ts

export const rankAnalysisTopics = (
    topics: string[],
    datasetContext: AnalysisDatasetContext,
) => Array.from(new Set(topics.map(t => t.trim()).filter(Boolean)))
    .filter(topic => !isTopicBlockedBySemanticUnderstanding(topic, datasetContext))
    .map((topic, index) => ({ topic, index }))
    // Sort deprioritized topics to the end rather than removing them entirely.
    // This allows soft-avoided dimensions to still produce cards when stronger
    // candidates are scarce, preventing the "0 SQL-first cards" scenario.
    .sort((a, b) => {
        const aDeprioritized = isTopicDeprioritizedByQualityGovernance(a.topic, datasetContext) ? 1 : 0;
        const bDeprioritized = isTopicDeprioritizedByQualityGovernance(b.topic, datasetContext) ? 1 : 0;
        if (aDeprioritized !== bDeprioritized) return aDeprioritized - bDeprioritized;
        const scoreDifference = scoreTopicBusinessValue(b.topic, datasetContext)
            - scoreTopicBusinessValue(a.topic, datasetContext);
        return scoreDifference || a.index - b.index;
    })
    .map(({ topic }) => topic);

export const generateAnalysisTopics = async (
    columns: ColumnProfile[],
    sampleData: CsvRow[],
    settings: Settings,
    goal: string | null,
    datasetContext: AnalysisDatasetContext,
    telemetryTarget?: ContextTelemetryTarget,
    explorationContext?: string | null,
    harnessSummary?: string | null,
    existingCardTitles?: string[],
    _options?: { timeoutMs?: number; abortSignal?: AbortSignal },
): Promise<string[]> => {
    const effectiveTimeout = _options?.timeoutMs ?? PLAN_GENERATION_TIMEOUT_MS;
    const abortSignal = _options?.abortSignal;
    const { model, modelId } = createProviderModel(settings, settings.complexModel);
    const systemPrompt = buildAnalysisPlannerSystemPrompt('topics');
    const hardBlockedDimensions = new Set(datasetContext.blockedDimensions ?? []);
    const availableDimensions = datasetContext.dimensionColumns.filter(
        d => !hardBlockedDimensions.has(d),
    );
    // Blocked dimensions contribute at half weight to the topic range calculation
    // to prevent funnel collapse when most dimensions are blocked.  The AI prompt
    // still only receives non-blocked dimensions; the evidence gate handles
    // quality governance downstream.
    const blockedDimensionCount = datasetContext.dimensionColumns.length - availableDimensions.length;
    const effectiveDimensionCount = availableDimensions.length
        + Math.ceil(blockedDimensionCount * 0.5);
    const [minTopics, maxTopics] = resolveAnalysisTopicRange(datasetContext, effectiveDimensionCount);
    const deterministicTopics = buildDeterministicTopics(columns, datasetContext);
    const countOnlyFallback = deterministicTopics.length > 0
        && deterministicTopics.every(topic => COUNT_INTENT_PATTERN.test(topic));
    if (countOnlyFallback) {
        return deterministicTopics;
    }
    const priorAnalysisSections = existingCardTitles?.length
        ? [createContextSection('prior_analysis', `Already completed analysis cards (do NOT repeat these):\n${existingCardTitles.map(t => `- ${t}`).join('\n')}`, 'high', 'sticky')]
        : [];

    try {
        const result = await runWithOverflowCompaction({
            provider: settings.provider,
            abortSignal,
            execute: async compactionMode => {
                throwIfAborted(abortSignal);
                const managed = await prepareManagedContext({
                    callType: 'planner',
                    systemText: systemPrompt,
                    baseUserText: 'Generate SQL-safe automatic analysis topics for this dataset.',
                    sections: [...createPlannerSections(columns, datasetContext, sampleData, undefined, explorationContext, harnessSummary), ...priorAnalysisSections],
                    settings,
                    modelId,
                    compactionMode,
                });
                reportContextDiagnostics(telemetryTarget, managed.diagnostics);

                return withTransientRetry(
                    (fb) => streamGenerateText({
                        model: fb ?? model,
                        messages: [
                            { role: 'system', content: managed.systemText },
                            {
                                role: 'user',
                                content: createAnalysisTopicsPrompt(
                                    managed.userText,
                                    goal,
                                    availableDimensions,
                                    existingCardTitles,
                                ),
                            },
                        ],
                        abortSignal,
                        output: Output.object({ schema: jsonSchema(prepareSchemaForProvider(createAnalysisTopicsSchema(minTopics, maxTopics), settings.provider) as Parameters<typeof jsonSchema>[0]) }),
                        activityTimeoutMs: effectiveTimeout,
                    }),
                    { settings, primaryModelId: modelId, label: 'planGenerator.topics', abortSignal },
                );
            },
        });

        const parsed = result.output !== undefined
            ? result.output as { topics: string[] }
            : robustlyParseJsonObject(result.text);
        const rankedTopics = rankAnalysisTopics(parsed.topics || [], datasetContext);
        if (rankedTopics.length > 0 || deterministicTopics.length === 0) {
            return rankedTopics;
        }
        console.warn(`${LOG_PREFIX} generateAnalysisTopics returned no executable topics, using deterministic fallback.`);
        return deterministicTopics;
    } catch (error) {
        if (isRuntimeAbortError(error, abortSignal)) throw error;
        if (!isProviderTimeoutError(error)) throw error;

        // First attempt timed out — retry once with a simplified short prompt
        console.warn(`${LOG_PREFIX} generateAnalysisTopics timed out (first attempt), retrying with simplified prompt.`);
        try {
            const colList = columns.map(c => `${c.name} (${c.type})`).join(', ');
            const text = await callSmallAiStep(
                settings,
                'You are a data analyst. Generate SQL-safe analysis topics. Return JSON only: {"topics": [...]}.',
                `Goal: ${goal ?? 'Explore the data'}\nColumns: ${colList}\nReturn 3-5 topics as JSON.`,
                abortSignal,
            );
            const parsed = robustlyParseJsonObject(text);
            const rankedTopics = rankAnalysisTopics(parsed.topics || [], datasetContext);
            if (rankedTopics.length > 0 || deterministicTopics.length === 0) {
                return rankedTopics;
            }
            console.warn(`${LOG_PREFIX} generateAnalysisTopics simplified retry returned no executable topics, using deterministic fallback.`);
            return deterministicTopics;
        } catch (retryError) {
            if (isProviderTimeoutError(retryError)) {
                console.warn(`${LOG_PREFIX} generateAnalysisTopics retry also timed out, using deterministic fallback.`);
                return deterministicTopics;
            }
            throw retryError;
        }
    }
};

export const resolveAnalysisTopicRange = (
    datasetContext: AnalysisDatasetContext,
    availableDimensionCount?: number,
): [number, number] => {
    const dimCount = availableDimensionCount ?? datasetContext.dimensionColumns.filter(
        d => !(datasetContext.blockedDimensions ?? []).includes(d),
    ).length;
    const baseRange: [number, number] = dimCount <= 1 ? [1, 2] : dimCount <= 2 ? [2, 4] : [4, 8];
    const steering = datasetContext.analysisSteering;
    const signalConfidence = steering?.signalConfidence ?? 'medium';
    const reportShapeClass = steering?.reportShapeClass ?? 'detail_table';

    if (signalConfidence === 'low') {
        return dimCount <= 1 ? [1, 1] : [1, Math.min(3, baseRange[1])];
    }

    if (reportShapeClass === 'hierarchical_statement' || reportShapeClass === 'wide_pivot') {
        return [Math.min(baseRange[0], 2), Math.min(4, baseRange[1])];
    }

    if (signalConfidence === 'high' && reportShapeClass === 'detail_table' && dimCount >= 3) {
        return [baseRange[0], Math.min(10, baseRange[1] + 1)];
    }

    return baseRange;
};

export const generateEvidenceQueryPlanWithRetry = async (
    topic: string,
    columns: ColumnProfile[],
    settings: Settings,
    learningHints?: PlanLearningHints,
    telemetryTarget?: ContextTelemetryTarget,
    retryFeedback?: string,
    datasetContext?: AnalysisDatasetContext,
    sampleData: CsvRow[] = [],
    explorationContext?: string | null,
    harnessSummary?: string | null,
    planningIntent?: PlannerSemanticIntent | null,
    _options?: { timeoutMs?: number; abortSignal?: AbortSignal },
): Promise<SqlEvidenceQueryPlan> => {
    const effectiveTimeout = _options?.timeoutMs ?? PLAN_GENERATION_TIMEOUT_MS;
    const abortSignal = _options?.abortSignal;
    const allColumnNames = columns.map(column => column.name);
    const periodFamilies = detectPeriodColumnFamilies(allColumnNames);
    const preferredDimensions = suggestAlternativeDimensions(columns, learningHints);
    const plannerDatasetContext: AnalysisDatasetContext = datasetContext ?? {
        title: 'Dataset',
        dimensionColumns: preferredDimensions,
        metricColumns: columns
            .filter(column => ['numerical', 'currency', 'percentage'].includes(column.type))
            .map(column => column.name),
        preferredGrainColumns: preferredDimensions,
        preferredMetricTerms: columns
            .filter(column => ['numerical', 'currency', 'percentage'].includes(column.type))
            .map(column => column.name),
    };
    let lastError: string | undefined = retryFeedback;
    const skillGuidance = buildEvidenceSkillGuidance();
    const planningIntentSummary = [
        planningIntent?.preferredGroupBy ? `Preferred groupBy from runtime hypothesis: ${planningIntent.preferredGroupBy}` : '',
        planningIntent?.preferredMetric ? `Preferred metric from runtime hypothesis: ${planningIntent.preferredMetric}` : '',
        planningIntent?.preferredFilterIntent ? `Preferred filter intent from runtime hypothesis: ${planningIntent.preferredFilterIntent}` : '',
    ].filter(Boolean).join('\n');

    // Strategy-aware retry: classify last failure to choose a different
    // planning strategy on subsequent attempts rather than blind re-prompting.
    let lastFailureCategory: 'structural' | 'semantic' | 'compilation' | 'unknown' = 'unknown';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        // On attempt 2+, augment the user prompt with a strategy directive
        // that guides the AI toward a simpler, more reliable query shape.
        const strategyDirective = attempt === 1 ? ''
            : attempt === 2 && lastFailureCategory === 'structural'
                ? '\n\nIMPORTANT: The previous attempt had structural issues. Use a SIMPLER query shape: one groupBy column, one aggregate, and ensure every aggregate alias appears in query.select. Do NOT attempt multi-aggregate plans.'
                : attempt === 2
                    ? '\n\nIMPORTANT: The previous attempt failed. Simplify the query: use a single primary metric, one groupBy dimension, and keep the plan minimal.'
                    : '\n\nCRITICAL: This is the final attempt. Use the SIMPLEST possible query: one groupBy, one SUM/COUNT aggregate, include all selected columns explicitly. Do NOT use complex multi-aggregate or derived-column patterns.';

        console.log(`${LOG_PREFIX} Generating evidence query plan for topic "${topic}", attempt ${attempt}/${MAX_ATTEMPTS}${attempt > 1 ? ` (strategy: ${lastFailureCategory})` : ''}`);
        try {
            const { model, modelId } = createProviderModel(settings, settings.complexModel);
            const result = await runWithOverflowCompaction({
                provider: settings.provider,
                abortSignal,
                execute: async compactionMode => {
                    throwIfAborted(abortSignal);
                    const managed = await prepareManagedContext({
                        callType: 'planner',
                        systemText: buildAnalysisPlannerSystemPrompt('evidence_query'),
                        baseUserText: `Create a SQL evidence query plan for the topic "${topic}".${strategyDirective}`,
                        sections: [
                            ...createPlannerSections(columns, plannerDatasetContext, sampleData, learningHints, explorationContext ?? undefined, harnessSummary),
                            ...(planningIntentSummary
                                ? [createContextSection('runtime_hypothesis_intent', planningIntentSummary, 'high', 'sticky')]
                                : []),
                            ...(skillGuidance
                                ? [createContextSection('analysis_skills', skillGuidance, 'medium', 'sticky')]
                                : []),
                        ],
                        settings,
                        modelId,
                        compactionMode,
                    });
                    reportContextDiagnostics(telemetryTarget, managed.diagnostics);

                    return withTransientRetry(
                        (fb) => streamGenerateText({
                            model: fb ?? model,
                            messages: [
                                { role: 'system', content: managed.systemText },
                                {
                                    role: 'user',
                                    content: buildTopicPlanningUserPrompt(
                                        topic,
                                        managed.userText,
                                        buildPlanRetryFeedback(lastError),
                                        learningHints,
                                    ),
                                },
                            ],
                            abortSignal,
                            output: Output.object({ schema: jsonSchema(prepareSchemaForProvider(createSqlEvidenceQueryPlanSchema(allColumnNames), settings.provider) as Parameters<typeof jsonSchema>[0]) }),
                            activityTimeoutMs: effectiveTimeout,
                        }),
                        { settings, primaryModelId: modelId, label: 'planGenerator.plan', abortSignal },
                    );
                },
            });

            const rawPlan = result.output !== undefined
                ? result.output
                : robustlyParseJsonObject(result.text);
            console.debug(`${LOG_PREFIX} Raw evidence plan from AI for "${topic}":`, rawPlan);

            const semanticDefaultsApplied = applyEvidenceQuerySemanticDefaults({
                preferredResultShape: inferPreferredResultShape(topic, plannerDatasetContext),
                ...rawPlan,
            }, columns, {
                topic,
                steering: plannerDatasetContext.analysisSteering ?? null,
            });
            const semanticHints = extractSemanticHints(plannerDatasetContext);
            const { validPlan, errors } = normalizeAndValidateSqlEvidenceQueryPlan(
                semanticDefaultsApplied,
                columns,
                {
                    topic,
                    intent: planningIntent ?? undefined,
                    semanticHints,
                    lenient: true,
                    periodFamilies,
                },
            );
            if (!validPlan) {
                lastError = `AI created an invalid SQL evidence query plan: ${errors.join(', ')}`;
                // Classify the failure for strategy-aware retry routing.
                const errorText = errors.join(' ').toLowerCase();
                if (errorText.includes('must appear in query.select') || errorText.includes('must reference') || errorText.includes('aggregate')) {
                    lastFailureCategory = 'structural';
                } else if (errorText.includes('does not match') || errorText.includes('topic wording') || errorText.includes('intent')) {
                    lastFailureCategory = 'semantic';
                } else {
                    lastFailureCategory = 'unknown';
                }
                continue;
            }
            const blockedAggregate = validPlan.query.aggregates?.find(aggregate => (
                isBlockedAggregateMetric(aggregate.column, aggregate.function, plannerDatasetContext)
            ));
            if (blockedAggregate) {
                lastError = `Aggregate metric "${blockedAggregate.column}" is a helper, structural, or explicitly avoided field and cannot be used with ${blockedAggregate.function.toUpperCase()}. Use COUNT(*) or a business metric instead.`;
                lastFailureCategory = 'semantic';
                continue;
            }
            const stabilityReasonCodes = collectEvidencePlanStabilityReasonCodes(validPlan, columns, {
                topic,
                intent: planningIntent ?? undefined,
                semanticHints,
            });
            if (stabilityReasonCodes.includes(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered)) {
                logPlannerStabilitySignal(
                    telemetryTarget,
                    PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered,
                    `Runtime hypothesis mismatched the final evidence plan for "${topic}", but topic semantics recovered a valid SQL-first plan.`,
                    {
                        topic,
                        reasonCodes: stabilityReasonCodes,
                        groupByColumn: validPlan.query.groupBy?.[0] ?? null,
                        metricColumn: validPlan.query.aggregates?.[0]?.column ?? null,
                        preferredGroupBy: planningIntent?.preferredGroupBy ?? null,
                        preferredMetric: planningIntent?.preferredMetric ?? null,
                    },
                );
            }

            try {
                compileQueryPlanToDuckDbSql(validPlan.query, {
                    allowedColumns: allColumnNames,
                    tableName: 'session_clean_dataset',
                    maxRows: validPlan.queryMode === 'rowset' ? 500 : 100,
                    maxColumns: 50,
                    maxOrderBy: 3,
                });
            } catch (error) {
                lastError = `SQL compilation failed: ${error instanceof Error ? error.message : String(error)}`;
                lastFailureCategory = 'compilation';
                continue;
            }

            return validPlan;
        } catch (error) {
            if (isRuntimeAbortError(error, abortSignal)) {
                throw error;
            }
            lastError = error instanceof Error ? error.message : String(error);
            lastFailureCategory = 'unknown';
        }
    }

    throw new SqlAutoAnalysisError(
        classifyCompileFailure(lastError ?? 'Unknown SQL-first planning error'),
        `AI failed to generate a valid SQL evidence query plan for topic "${topic}" after ${MAX_ATTEMPTS} attempts. Last error: ${lastError}`,
        { topic, lastFailureCategory },
    );
};

// --- Stepped evidence query plan generation ---
// Splits AI decision-making into 3 small focused calls + deterministic assembly.
// Each step gives AI minimal context and a simple task, preventing lightweight
// models from getting lost in large prompts.

export const callSmallAiStep = async (
    settings: Settings,
    systemPrompt: string,
    userPrompt: string,
    abortSignal?: AbortSignal,
    stepLabel?: string,
): Promise<string> => {
    throwIfAborted(abortSignal);
    const { model, modelId } = createProviderModel(settings, settings.complexModel);
    const promptChars = systemPrompt.length + userPrompt.length;
    const label = stepLabel ? `step:${stepLabel}` : 'callSmallAiStep';
    console.log(`[Perf:AI:Payload] ${label} | model=${modelId} | promptChars=${promptChars} | systemLen=${systemPrompt.length} | userLen=${userPrompt.length}`);
    const result = await withTransientRetry(
        (fb) => streamGenerateText({
            model: fb ?? model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            abortSignal,
            activityTimeoutMs: PLAN_GENERATION_TIMEOUT_MS,
        }),
        { settings, primaryModelId: modelId, label, abortSignal },
    );
    return (result.text ?? '').trim();
};

export const generateEvidenceQueryPlanStepped = async (
    topic: string,
    columns: ColumnProfile[],
    settings: Settings,
    harnessSummary?: string | null,
    datasetContext?: AnalysisDatasetContext | null,
    planningIntent?: PlannerSemanticIntent | null,
    retryFeedback?: string | null,
    _options?: { abortSignal?: AbortSignal; deterministicOnly?: boolean },
): Promise<SqlEvidenceQueryPlan> => {
    const abortSignal = _options?.abortSignal;
    const deterministicOnly = _options?.deterministicOnly === true;
    const steering = datasetContext?.analysisSteering ?? null;
    const blockedGroupBys = new Set([
        ...(datasetContext?.blockedDimensions ?? []),
        ...(steering?.blockGroupBy ?? []),
    ]);
    const softDeprioritized = new Set(steering?.softDeprioritizeGroupBy ?? []);
    const preferredGroupBys = new Set([
        ...(datasetContext?.preferredGrainColumns ?? []),
        ...(steering?.preferGroupBy ?? []),
    ]);
    const columnNameMap = buildColumnNameMap(columns);
    const dimensions = columns
        .filter(c => ['categorical', 'date', 'time'].includes(c.type))
        .filter(c => !blockedGroupBys.has(c.name))
        .sort((left, right) => {
            const leftPreferred = preferredGroupBys.has(left.name) ? 1 : 0;
            const rightPreferred = preferredGroupBys.has(right.name) ? 1 : 0;
            if (leftPreferred !== rightPreferred) {
                return rightPreferred - leftPreferred;
            }
            const leftSoft = softDeprioritized.has(left.name) ? 1 : 0;
            const rightSoft = softDeprioritized.has(right.name) ? 1 : 0;
            if (leftSoft !== rightSoft) {
                return leftSoft - rightSoft;
            }
            return (left.uniqueValues ?? 0) - (right.uniqueValues ?? 0);
        });
    const numericMetrics = columns
        .filter(c => (
            ['numerical', 'currency', 'percentage'].includes(c.type)
            && !isBlockedAggregateMetric(c.name, 'sum', datasetContext)
        ));
    const countIntent = COUNT_INTENT_PATTERN.test(topic);
    const inferredCountGroupBy = countIntent
        ? inferSteppedGroupByTarget(topic, dimensions.map(column => column.name))
        : null;
    const explicitGroupBy = inferredCountGroupBy
        ?? dimensions.find(column => column.name === planningIntent?.preferredGroupBy)?.name
        ?? inferSteppedGroupByTarget(topic, dimensions.map(column => column.name))
        ?? dimensions.find(column => topicMentionsColumn(topic, column.name))?.name
        ?? null;
    const inferredCountOperand = countIntent
        ? inferCountTopicOperandTarget(topic, columns.map(column => column.name))
        : null;
    const explicitMetricColumn = columns.find(column =>
        countIntent
            ? column.name === inferredCountOperand && column.name !== explicitGroupBy
            : column.name === planningIntent?.preferredMetric && column.name !== explicitGroupBy
    )?.name ?? columns.find(column =>
        countIntent
            ? column.name === planningIntent?.preferredGroupBy && column.name !== explicitGroupBy
            : false
    )?.name ?? columns.find(column =>
        column.name !== explicitGroupBy
        && topicMentionsColumn(topic, column.name),
    )?.name ?? null;
    const metrics = countIntent
        ? columns.filter(column => column.name !== explicitGroupBy)
        : numericMetrics;

    if (dimensions.length === 0 || metrics.length === 0) {
        throw new SqlAutoAnalysisError('planning_invalid', 'No usable dimensions or metrics found for stepped planning.', { topic });
    }

    const systemPrompt = 'You are a data analyst. Answer concisely with ONLY the requested value. No explanations.';

    // Step 1: Pick groupBy dimension — show data quality so AI can judge
    const dimList = dimensions.map(c => {
        const nullPct = c.missingPercentage != null ? `${Math.round(c.missingPercentage)}% null` : 'null% unknown';
        return `${c.name} (${c.uniqueValues ?? '?'} unique, ${nullPct})`;
    }).join('\n');
    let groupBy = explicitGroupBy;
    if (!groupBy) {
        if (deterministicOnly) {
            groupBy = dimensions[0]?.name ?? null;
        }
    }
    if (!groupBy) {
        const step1Response = await callSmallAiStep(settings, systemPrompt,
            `Topic: "${topic}"\n${retryFeedback ? `Retry guidance: ${retryFeedback}\n` : ''}${steering ? `Structured steering:\n${formatAnalysisSteeringBundle(steering)}\n` : ''}\nWhich ONE column is best for groupBy? Prefer columns with 0% null and do not choose blocked dimensions.\n${dimList}\n\nReply with ONLY the exact column name.`,
            abortSignal,
            `groupBy[${topic.slice(0, 25)}]`,
        );
        groupBy = resolveExactColumnMatch(step1Response, columnNameMap);
        if (!groupBy || !dimensions.some(column => column.name === groupBy)) {
            throw new SqlAutoAnalysisError('planning_invalid', `Stepped planner could not map groupBy response "${step1Response}" to a valid dimension.`, {
                topic,
                step: 'group_by_selection',
            });
        }
    }

    // Step 2: Pick aggregate function + metric column — show value ranges so AI can judge
    const metricList = metrics.map(c => {
        const range = c.valueRange ? `range: ${c.valueRange[0]} to ${c.valueRange[1]}` : '';
        return `${c.name}${range ? ` (${range})` : ''}`;
    }).join('\n');
    let aggFunction: 'sum' | 'count' | 'avg' | 'count_distinct';
    let aggColumn: string | undefined;
    if (countIntent && explicitMetricColumn) {
        aggColumn = explicitMetricColumn;
        aggFunction = IDENTIFIER_LIKE_COLUMN_PATTERN.test(explicitMetricColumn) ? 'count_distinct' : 'count';
    } else if (countIntent && !explicitMetricColumn) {
        aggColumn = undefined;
        aggFunction = 'count';
    } else if (explicitMetricColumn && numericMetrics.some(column => column.name === explicitMetricColumn)) {
        aggColumn = explicitMetricColumn;
        aggFunction = 'sum';
    } else if (!countIntent && metrics.length === 1) {
        aggColumn = metrics[0].name;
        aggFunction = 'sum';
    } else if (deterministicOnly) {
        aggColumn = metrics[0]?.name;
        aggFunction = countIntent ? 'count' : 'sum';
    } else {
        const step2Response = await callSmallAiStep(settings, systemPrompt,
            `Topic: "${topic}"\nGroupBy: ${groupBy}\n${retryFeedback ? `Retry guidance: ${retryFeedback}\n` : ''}Available metrics:\n${metricList}\n\nWhich metric and function (SUM, COUNT, AVG, COUNT_DISTINCT) best fits the topic?\nReply as: FUNCTION(exact column name) or COUNT(*) when counting records.`,
            abortSignal,
            `metric[${topic.slice(0, 25)}]`,
        );
        const functionMatch = step2Response.match(/\b(SUM|COUNT|AVG|COUNT_DISTINCT|MIN|MAX)\s*\(\s*([^)]+)\s*\)/i);
        const rawFunction = functionMatch?.[1]?.toLowerCase();
        aggFunction = rawFunction === 'count_distinct'
            ? 'count_distinct'
            : rawFunction === 'count'
                ? 'count'
                : rawFunction === 'avg'
                    ? 'avg'
                    : 'sum';
        const rawColumn = functionMatch?.[2]?.trim();
        aggColumn = rawColumn === '*' ? undefined : resolveExactColumnMatch(rawColumn ?? step2Response, columnNameMap) ?? undefined;
        if (aggColumn && !metrics.some(column => column.name === aggColumn)) {
            throw new SqlAutoAnalysisError('planning_invalid', `Stepped planner selected unsupported metric "${aggColumn}" for topic "${topic}".`, {
                topic,
                step: 'metric_selection',
            });
        }
        if (!countIntent && !aggColumn) {
            throw new SqlAutoAnalysisError('planning_invalid', `Stepped planner could not map metric response "${step2Response}" to a valid metric column.`, {
                topic,
                step: 'metric_selection',
            });
        }
    }
    if (
        aggColumn
        && aggFunction === 'sum'
        && (
            (deterministicOnly && /\b(?:average|avg|mean)\b/i.test(topic))
            || topicPrefersAverageAggregation(
                topic,
                aggColumn,
                columns.find(column => column.name === aggColumn),
            )
        )
    ) {
        aggFunction = 'avg';
    }
    const aggAlias = aggColumn
        ? `${aggFunction}_${aggColumn.toLowerCase().replace(/\s+/g, '_')}`
        : 'count_rows';

    // Step 3: Decide WHERE filters
    let wherePredicates: Array<{ column: string; operator: 'eq' | 'neq'; value: string }> = [];
    if (steering?.detailRowColumn && steering.detailRowValue) {
        wherePredicates.push({
            column: steering.detailRowColumn,
            operator: 'eq',
            value: steering.detailRowValue,
        });
    }
    if (!deterministicOnly && (harnessSummary || steering)) {
        const step3Response = await callSmallAiStep(settings, systemPrompt,
            `Topic: "${topic}"\nGroupBy: ${groupBy}\nAggregate: ${aggFunction.toUpperCase()}(${aggColumn ?? '*'})\n${retryFeedback ? `Retry guidance: ${retryFeedback}\n` : ''}${steering ? `Structured steering:\n${formatAnalysisSteeringBundle(steering)}\n` : ''}\nData findings:\n${harnessSummary ?? 'None'}\n\nWhat additional WHERE filters are needed? Reply as one predicate per line using the exact column name, for example:\n"Row Class" = fact\nCountry <> Internal\nOr reply NONE if no extra filters are needed.`,
            abortSignal,
            `filter[${topic.slice(0, 25)}]`,
        );
        if (step3Response.toUpperCase() !== 'NONE') {
            const filterLines = step3Response.split('\n').filter(l => l.includes('=') || l.includes('<>'));
            const parsedPredicates: typeof wherePredicates = [];
            for (const line of filterLines) {
                const parsed = parseSteppedPredicateLine(line, columnNameMap);
                if (parsed.error) {
                    throw new SqlAutoAnalysisError('planning_invalid', parsed.error, {
                        topic,
                        step: 'filter_selection',
                    });
                }
                if (parsed.predicate) {
                    parsedPredicates.push(parsed.predicate);
                }
            }
            wherePredicates = [...wherePredicates, ...parsedPredicates];
        }
    }

    // Step 4: Deterministic assembly — no AI needed
    const isTemporalGroupBy = dimensions.some(c => c.name === groupBy && c.type === 'date')
        || isTimeLikeDimensionColumn(groupBy);
    const preferredResultShape = isTemporalGroupBy
        ? 'time_series'
        : 'ranked_aggregate';
    const recommendedTopN = steering?.recommendedTopN && steering.recommendedTopN > 0
        ? steering.recommendedTopN
        : 10;
    const plan: SqlEvidenceQueryPlan = {
        title: topic,
        queryMode: 'aggregate',
        intentSummary: `${aggFunction.toUpperCase()}(${aggColumn ?? '*'}) grouped by ${groupBy}`,
        preferredResultShape,
        query: {
            select: [groupBy, aggAlias],
            groupBy: [groupBy],
            aggregates: [{ function: aggFunction, column: aggColumn, as: aggAlias }],
            where: wherePredicates.length > 0 ? { predicates: wherePredicates } : undefined,
            orderBy: isTemporalGroupBy
                ? [{ column: groupBy, direction: 'asc' as const }]
                : [{ column: aggAlias, direction: 'desc' as const }],
            limit: isTemporalGroupBy ? 500 : recommendedTopN,
        },
    };

    // Validate the assembled plan
    const allColumnNames = columns.map(c => c.name);
    const steppedPeriodFamilies = detectPeriodColumnFamilies(allColumnNames);
    const semanticDefaultsApplied = applyEvidenceQuerySemanticDefaults(plan, columns, {
        topic,
        steering,
    });
    const steppedSemanticHints = extractSemanticHints(datasetContext);
    const { validPlan, errors } = normalizeAndValidateSqlEvidenceQueryPlan(semanticDefaultsApplied, columns, {
        topic,
        intent: planningIntent ?? undefined,
        semanticHints: steppedSemanticHints,
        lenient: true,
        periodFamilies: steppedPeriodFamilies,
    });
    if (!validPlan) {
        throw new SqlAutoAnalysisError('planning_invalid',
            `Stepped plan assembly failed: ${errors.join(', ')}`, { topic });
    }
    const blockedAggregate = validPlan.query.aggregates?.find(aggregate => (
        isBlockedAggregateMetric(aggregate.column, aggregate.function, datasetContext)
    ));
    if (blockedAggregate) {
        throw new SqlAutoAnalysisError(
            'planning_invalid',
            `Stepped plan selected helper or avoided metric "${blockedAggregate.column}" for ${blockedAggregate.function.toUpperCase()}.`,
            { topic, step: 'metric_governance' },
        );
    }

    // Verify SQL compiles
    try {
        compileQueryPlanToDuckDbSql(validPlan.query, {
            allowedColumns: allColumnNames,
            tableName: 'session_clean_dataset',
            maxRows: validPlan.preferredResultShape === 'time_series' ? 500 : 100,
            maxColumns: 50,
            maxOrderBy: 3,
        });
    } catch (error) {
        throw new SqlAutoAnalysisError('sql_compile_failed',
            `Stepped plan SQL compilation failed: ${error instanceof Error ? error.message : String(error)}`, { topic });
    }

    return validPlan;
};

export const generateAndValidatePlanWithRetry = async (
    topic: string,
    columns: ColumnProfile[],
    settings: Settings,
    learningHints?: PlanLearningHints,
    telemetryTarget?: ContextTelemetryTarget,
    retryFeedback?: string,
    datasetContext?: AnalysisDatasetContext,
    sampleData: CsvRow[] = [],
): Promise<SqlAnalysisPlan> => {
    const evidencePlan = await generateEvidenceQueryPlanWithRetry(
        topic,
        columns,
        settings,
        learningHints,
        telemetryTarget,
        retryFeedback,
        datasetContext,
        sampleData,
    );

    const rawPlan = adaptEvidencePlanToSqlAnalysisPlan(evidencePlan, columns);
    const { validPlan, errors } = normalizeAndValidateSqlAnalysisPlan(rawPlan, columns);
    if (!validPlan) {
        throw new SqlAutoAnalysisError(
            'planning_invalid',
            `Evidence query plan for "${topic}" could not be adapted into a valid SQL-first presentation plan: ${errors.join(', ')}`,
            { topic },
        );
    }

    return validPlan;
};
