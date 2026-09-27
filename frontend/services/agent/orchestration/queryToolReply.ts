import type { AppStore } from '../../../store/useAppStore';
import type { AiAction } from '../../../types';
import { isPreviewDataQuery } from '../execution/dataQueryContract';
import { getTranslation } from '../../../utils/localization';

const LOG_PREFIX = '[QueryToolReply]';
const QUERY_TOOL_NAMES = new Set(['data.query', 'spreadsheet.filter']);
const LOOKUP_RESOLUTION_TOOL_NAMES = new Set(['data.query', 'spreadsheet.filter', 'conversation.request_clarification']);
// --- Intent detection patterns (FAST PRE-SCREENING, not final authority) ---
// These regex patterns provide zero-latency intent classification for response
// formatting decisions. They are NOT used for routing (that's in dataAnalysisPolicy).
// The AI runtime loop is the authoritative intent classifier — these are fallback
// heuristics for cases where AI intent is unavailable or ambiguous.
// User-intent: English row lookup — verb+noun sequence matching with bidirectional order.
const ENGLISH_ROW_LOOKUP_REGEX = /\b(show|list|find|tell|display|get|search|related|match(?:ing)?|contain(?:s)?|filter)\b[\s\S]*\b(row|rows|record|records|line|lines)\b|\b(row|rows|record|records|line|lines)\b[\s\S]*\b(show|list|find|tell|display|get|search|related|match(?:ing)?|contain(?:s)?|filter)\b/;
// User-intent: Mandarin row lookup equivalent.
const MANDARIN_ROW_LOOKUP_REGEX = /(显示|列出|查找|找出|查看|筛选|过滤|相关|包含).*(行|记录|数据行)|(行|记录|数据行).*(显示|列出|查找|找出|查看|筛选|过滤|相关|包含)/;
// User-intent: English lookup request with quantifier/qualifier.
const ENGLISH_LOOKUP_REQUEST_REGEX = /\b(show|list|find|tell|display|get|search|lookup|pull|retrieve)\b[\s\S]{0,120}\b(all|every|matching|matched|related|contain(?:s|ing)?|named|called)\b/;
// User-intent: Mandarin lookup request equivalent.
const MANDARIN_LOOKUP_REQUEST_REGEX = /(显示|列出|查找|找出|查看|筛选|过滤|搜索|提取).*(所有|全部|匹配|相关|包含|等于|名为|叫做)|(所有|全部).*(显示|列出|查找|找出|查看|筛选|过滤|搜索|提取)/;
// User-intent: English filter/where-clause vocabulary.
const ENGLISH_FILTER_EXPLANATION_REGEX = /\b(where|match(?:ing|ed)?|contain(?:s|ing)?|filter(?:ed|ing)?|related|keyword|search|lookup|extract|equal(?:s)?|named|called)\b/i;
// User-intent: Mandarin filter equivalent.
const MANDARIN_FILTER_EXPLANATION_REGEX = /(匹配|包含|筛选|过滤|相关|关键词|搜索|查找|找出|提取|等于|名为|叫做)/;
// User-intent: aggregate/chart intent detection — bilingual.
const AGGREGATE_INTENT_REGEX = /\b(chart|graph|analy(?:ze|sis)|aggregate|group|sum|avg|count|trend|compare)\b|图表|分析|汇总|分组|统计|趋势|比较/;
// User-intent: English data quality vocabulary.
const ENGLISH_DATASET_QUALITY_REGEX = /\b(clean(?:ing)?|data quality|quality|dirty|useless|duplicate|duplicates|null(?:s)?|missing|empty|blank|constant|low variance|redundant|unnecessary|good|bad|ok|okay)\b/;
// Structural: dataset scope vocabulary (column/row/field/schema).
const ENGLISH_DATASET_SCOPE_REGEX = /\b(data|dataset|column|columns|field|fields|row|rows|schema)\b/;
// User-intent: review/inspect action vocabulary.
const ENGLISH_DATASET_REVIEW_REGEX = /\b(check|review|inspect|audit|assess|evaluate|validate)\b/;
// User-intent: Mandarin data quality vocabulary.
const MANDARIN_DATASET_QUALITY_REGEX = /(数据质量|清洗|清理|干净|脏数据|无用列|无用数据|冗余|多余|重复|空值|缺失值|空白|重复值)/;
// Structural: Mandarin dataset scope vocabulary.
const MANDARIN_DATASET_SCOPE_REGEX = /(数据集|数据|列|字段|行|表结构|schema)/;
// User-intent: English composite quality summary detection.
const ENGLISH_DATASET_QUALITY_SUMMARY_REGEX = /\b(clean(?:ing)?\b[\s\S]{0,24}\b(or not|ok|okay|good|bad)|data\b[\s\S]{0,16}\b(good|bad|ok|okay)|review data quality|data quality review|help me check the data|check the data|check data|review the data|review data|inspect the data|inspect data|audit the data|audit data|assess the data|assess data|evaluate the data|evaluate data|useless columns?|redundant columns?|need to clean|what should i clean|what to clean|any useless|which columns?.*(clean|drop|remove))\b/;
// User-intent: Mandarin composite quality summary detection.
const MANDARIN_DATASET_QUALITY_SUMMARY_REGEX = /(是否干净|数据干净吗|要不要清洗|需要清洗吗|无用列|冗余列|哪些列.*(清理|删除)|检查数据质量|评估数据质量|检查数据|看看数据)/;

const hasQueryToolOnlyBatch = (actions: AiAction[]) => {
    const toolCalls = actions.filter(action => action.type === 'tool_call');
    return toolCalls.length > 0 && toolCalls.every(action => QUERY_TOOL_NAMES.has(action.toolName));
};

const getRowLabel = (language: AppStore['settings']['language'], singularKey: string, pluralKey: string, count: number) =>
    getTranslation(count === 1 ? singularKey : pluralKey, language);

const formatReturnedSummary = (
    returnedRows: number,
    totalMatchedRows: number,
    language: AppStore['settings']['language'],
    singularKey: string,
    pluralKey: string,
) => {
    const returnedLabel = getRowLabel(language, singularKey, pluralKey, returnedRows);
    if (returnedRows === totalMatchedRows) {
        return `${returnedRows} ${returnedLabel}`;
    }
    const totalLabel = getRowLabel(language, singularKey, pluralKey, totalMatchedRows);
    return getTranslation('returned_of_total_label', language, {
        returned: returnedRows,
        total: totalMatchedRows,
        label: totalLabel,
    });
};

const summarizeAction = (action: AiAction) => {
    if (action.type === 'assistant_message') {
        return {
            type: action.type,
            messagePreview: action.message?.slice(0, 120) ?? '',
        };
    }

    return {
        type: action.type,
        toolName: action.toolName,
        explanation: action.args?.explanation ?? null,
        hasPlan: Boolean(action.args?.plan),
        plan: action.args?.plan
            ? {
                select: action.args.plan.select ?? [],
                hasWhere: Boolean(action.args.plan.where),
                groupBy: action.args.plan.groupBy ?? [],
                aggregates: action.args.plan.aggregates ?? [],
                orderBy: action.args.plan.orderBy ?? [],
                limit: action.args.plan.limit ?? null,
            }
            : null,
    };
};

export const isFreeTextRowLookupIntent = (message: string): boolean => {
    const normalized = message.trim().toLowerCase();
    if (!normalized) return false;
    if (AGGREGATE_INTENT_REGEX.test(normalized)) return false;
    return ENGLISH_ROW_LOOKUP_REGEX.test(normalized)
        || MANDARIN_ROW_LOOKUP_REGEX.test(message)
        || ENGLISH_LOOKUP_REQUEST_REGEX.test(normalized)
        || MANDARIN_LOOKUP_REQUEST_REGEX.test(message);
};

export const isDatasetQualityReviewIntent = (message: string): boolean => {
    const normalized = message.trim().toLowerCase();
    if (!normalized) return false;

    return (ENGLISH_DATASET_SCOPE_REGEX.test(normalized) && (ENGLISH_DATASET_QUALITY_REGEX.test(normalized) || ENGLISH_DATASET_REVIEW_REGEX.test(normalized)))
        || (MANDARIN_DATASET_SCOPE_REGEX.test(message) && MANDARIN_DATASET_QUALITY_REGEX.test(message));
};

export const shouldPreferProfileOnlyQualityReview = (message: string): boolean => {
    const normalized = message.trim().toLowerCase();
    if (!normalized) return false;

    return ENGLISH_DATASET_QUALITY_SUMMARY_REGEX.test(normalized)
        || MANDARIN_DATASET_QUALITY_SUMMARY_REGEX.test(message);
};

const impliesFilteredLookup = (value: unknown): boolean => {
    if (typeof value !== 'string' || !value.trim()) {
        return false;
    }

    return ENGLISH_FILTER_EXPLANATION_REGEX.test(value) || MANDARIN_FILTER_EXPLANATION_REGEX.test(value);
};

const actionImpliesFilteredLookup = (action: AiAction): boolean =>
    action.type === 'tool_call'
    && action.toolName === 'data.query'
    && (impliesFilteredLookup(action.args?.explanation) || impliesFilteredLookup(action.thought));

export const shouldRejectPreviewDataQuery = (message: string, actions: AiAction[]): boolean => {
    if (!hasQueryToolOnlyBatch(actions)) {
        return false;
    }

    const requiresLookupBehavior = isFreeTextRowLookupIntent(message);
    const shouldReject = actions.some(action => action.type === 'tool_call'
        && action.toolName === 'data.query'
        && isPreviewDataQuery(action.args?.plan, action.args?.fallbackFilterOperation)
        && (requiresLookupBehavior || actionImpliesFilteredLookup(action)));

    if (shouldReject) {
        console.log(`${LOG_PREFIX} Rejected preview data.query for lookup intent.`, {
            message,
            requiresLookupBehavior,
            actions: actions.map(summarizeAction),
        });
    }

    return shouldReject;
};

export const shouldRejectUnsupportedLookupResponse = (message: string, actions: AiAction[]): boolean => {
    if (!isFreeTextRowLookupIntent(message) || actions.length === 0) {
        return false;
    }

    const shouldReject = !actions.some(action => action.type === 'tool_call' && LOOKUP_RESOLUTION_TOOL_NAMES.has(action.toolName));
    if (shouldReject) {
        console.log(`${LOG_PREFIX} Rejected unsupported lookup response.`, {
            message,
            actions: actions.map(summarizeAction),
        });
    }
    return shouldReject;
};

export const isQueryToolOnlyBatch = (actions: AiAction[]): boolean => hasQueryToolOnlyBatch(actions);

export const buildObservedQueryReply = (state: AppStore, executedAction: AiAction): string | null => {
    const language = state.settings.language;

    if (executedAction.type !== 'tool_call') {
        return null;
    }

    if (executedAction.toolName === 'spreadsheet.filter') {
        const finalReply = state.activeSpreadsheetFilter?.finalReply?.trim() || state.aiFilterExplanation?.trim();
        console.log(`${LOG_PREFIX} Building observed spreadsheet.filter reply.`, {
            requestId: state.activeSpreadsheetFilter?.requestId ?? null,
            origin: state.activeSpreadsheetFilter?.origin ?? null,
            observation: state.activeSpreadsheetFilter?.observation ?? null,
            finalReply: finalReply ?? null,
        });
        if (finalReply) return finalReply;
        return getTranslation('spreadsheet_filter_applied_generic', language);
    }

    if (executedAction.toolName !== 'data.query' || !state.activeDataQuery) {
        return null;
    }

    const query = state.activeDataQuery;
    const isPreview = isPreviewDataQuery(query.plan, query.fallbackFilterOperation);
    const hasAggregate = Boolean(query.plan.groupBy?.length || query.plan.aggregates?.length);
    console.log(`${LOG_PREFIX} Building observed data.query reply.`, {
        explanation: query.explanation,
        engine: query.engine,
        isPreview,
        hasAggregate,
        returnedRows: query.result.returnedRows,
        totalMatchedRows: query.result.totalMatchedRows,
        sqlPreview: query.sqlPreview,
        plan: {
            select: query.plan.select ?? [],
            hasWhere: Boolean(query.plan.where),
            groupBy: query.plan.groupBy ?? [],
            aggregates: query.plan.aggregates ?? [],
            orderBy: query.plan.orderBy ?? [],
            limit: query.plan.limit ?? null,
        },
    });

    if (isPreview) {
        const previewSummary = formatReturnedSummary(
            query.result.returnedRows,
            query.result.totalMatchedRows,
            language,
            'preview_row_label_singular',
            'preview_row_label_plural',
        );
        return getTranslation('data_query_preview_reply', language, { summary: previewSummary });
    }

    if (hasAggregate) {
        const summaryRows = formatReturnedSummary(
            query.result.returnedRows,
            query.result.totalMatchedRows,
            language,
            'summary_row_label_singular',
            'summary_row_label_plural',
        );
        return getTranslation('data_query_summary_reply', language, { summary: summaryRows });
    }

    const matchedRows = formatReturnedSummary(
        query.result.returnedRows,
        query.result.totalMatchedRows,
        language,
        'row_label_singular',
        'row_label_plural',
    );
    return getTranslation('data_query_rows_reply', language, { summary: matchedRows });
};
