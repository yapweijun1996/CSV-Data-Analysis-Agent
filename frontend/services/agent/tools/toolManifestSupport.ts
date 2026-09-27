import type {
    AggregateTableRequest,
    ClarificationRequest,
    ToolAvailabilityContext,
    WorkspaceFileAction,
} from '../../../types';

export type AvailabilityState = { available: boolean; reason?: string };

export const CARD_CHART_TYPES = ['bar', 'line', 'pie', 'doughnut', 'scatter', 'combo', 'radar', 'bubble'];
export const AGGREGATIONS = ['sum', 'count', 'avg'];
const SQLISH_CALCULATED_COLUMN_PREFIX = /^\s*(select|with)\b/i;
const SQLISH_CALCULATED_COLUMN_CLAUSE = /\b(from|where|group\s+by|order\s+by|having|join|union|intersect|except)\b/i;
const SQLISH_CALCULATED_COLUMN_AGGREGATE = /\b(count|sum|avg|min|max)\s*\(/i;
const SQLISH_CALCULATED_COLUMN_SUBQUERY = /\(\s*select\b/i;

export const requireDataset = (context: ToolAvailabilityContext): AvailabilityState => context.hasCsvData
    ? { available: true }
    : { available: false, reason: 'No dataset is loaded.' };

export const requireCleaningRun = (context: ToolAvailabilityContext): AvailabilityState => context.hasCleaningRun
    ? { available: true }
    : { available: false, reason: 'No cleaning run is available.' };

export const requireAnalysisStage = (context: ToolAvailabilityContext): AvailabilityState => {
    if (!context.hasCsvData) {
        return { available: false, reason: 'No dataset is loaded.' };
    }
    return context.cleaningCompleted
        ? { available: true }
        : { available: false, reason: 'Dataset is still in cleaning stage.' };
};

export const requireCards = (context: ToolAvailabilityContext): AvailabilityState => context.hasCards
    ? { available: true }
    : { available: false, reason: 'No analysis cards are available.' };

export const requireAnalysisCards = (context: ToolAvailabilityContext): AvailabilityState => {
    const stage = requireAnalysisStage(context);
    if (!stage.available) return stage;
    return requireCards(context);
};

export const validateCardId = (cardId: string | undefined, context: ToolAvailabilityContext, fieldName: string): string[] => {
    if (!cardId) {
        return [`"${fieldName}" is required.`];
    }
    if (!context.cardIds.includes(cardId)) {
        return [`"${fieldName}" ('${cardId}') must reference one of [${context.cardIds.join(', ')}].`];
    }
    return [];
};

export const validateClarification = (clarification: ClarificationRequest | undefined): string[] => {
    const errors: string[] = [];
    if (!clarification) return ['Clarification payload is required.'];
    if (!clarification.question || !clarification.question.trim()) {
        errors.push('"question" is required.');
    }
    const normalizedOptions = Array.isArray(clarification.options) ? clarification.options : [];
    const hasOptions = normalizedOptions.length > 0;
    if (!hasOptions && !clarification.allowFreeText) {
        errors.push('"options" must be a non-empty array.');
    }
    if (hasOptions) {
        const invalidOption = normalizedOptions.find(option =>
            !option
            || typeof option.label !== 'string'
            || !option.label.trim()
            || typeof option.value !== 'string'
            || !option.value.trim(),
        );
        if (invalidOption) {
            errors.push('Each clarification option must include a non-empty label and value.');
        }
    }
    return errors;
};

export const validateSuggestionId = (suggestionId: string | undefined, context: ToolAvailabilityContext): string[] => {
    if (!suggestionId) {
        return ['"suggestionId" is required.'];
    }
    if (!context.suggestionIds?.includes(suggestionId)) {
        return [`"suggestionId" ('${suggestionId}') must reference an active suggestion.`];
    }
    return [];
};

export const validateAggregateTable = (tableAction: AggregateTableRequest | undefined, context: ToolAvailabilityContext): string[] => {
    if (!tableAction) return ['Aggregate table payload is required.'];
    return tableAction.cardId ? validateCardId(tableAction.cardId, context, 'cardId') : [];
};

export const validateCalculatedColumnFormula = (formula: unknown): string[] => {
    if (typeof formula !== 'string' || !formula.trim()) {
        return ['"formula" is required.'];
    }

    const normalizedFormula = formula.trim();
    const isSqlishFormula = SQLISH_CALCULATED_COLUMN_PREFIX.test(normalizedFormula)
        || SQLISH_CALCULATED_COLUMN_CLAUSE.test(normalizedFormula)
        || SQLISH_CALCULATED_COLUMN_AGGREGATE.test(normalizedFormula)
        || SQLISH_CALCULATED_COLUMN_SUBQUERY.test(normalizedFormula);

    if (!isSqlishFormula) {
        return [];
    }

    return [
        '"formula" must be a row-level card expression, not SQL or a subquery. Use single-quoted column references like \'Revenue\' - \'Cost\'. For aggregates, subqueries, cross-row calculations, or derived result sets, use data.query instead of card.add_calculated_column.',
    ];
};

export const validateCardRefine = (args: Record<string, any> | undefined, context: ToolAvailabilityContext): string[] => {
    if (!args) return ['"cardId" and "changes" are required.'];
    const errors = validateCardId(args.cardId, context, 'cardId');
    if (errors.length > 0) return errors;
    if (!args.changes || typeof args.changes !== 'object' || Array.isArray(args.changes)) {
        return ['"changes" must be an object with at least one of: topN, chartType, filter, isDataVisible, summary.'];
    }
    const { topN, chartType, filter, summary } = args.changes;
    if (topN !== undefined && (typeof topN !== 'number' || !Number.isInteger(topN) || topN < 1)) {
        errors.push('"changes.topN" must be a positive integer.');
    }
    const validChartTypes = ['bar', 'line', 'pie', 'doughnut', 'scatter', 'combo', 'radar', 'bubble'];
    if (chartType !== undefined && !validChartTypes.includes(chartType)) {
        errors.push(`"changes.chartType" must be one of: ${validChartTypes.join(', ')}.`);
    }
    if (filter !== undefined) {
        if (!filter.column || typeof filter.column !== 'string') {
            errors.push('"changes.filter.column" is required and must be a string.');
        }
        if (!Array.isArray(filter.values)) {
            errors.push('"changes.filter.values" must be an array.');
        }
    }
    if (summary !== undefined && (typeof summary !== 'string' || summary.trim().length === 0)) {
        errors.push('"changes.summary" must be a non-empty string.');
    }
    return errors;
};

export const validateWorkspacePayload = (operation: WorkspaceFileAction['operation'], args: Record<string, any>): string[] => {
    const errors: string[] = [];
    if (['read', 'replace', 'write', 'append'].includes(operation) && !args.path) {
        errors.push(`"path" is required for "${operation}".`);
    }
    if (['search', 'grep'].includes(operation) && !args.query) {
        errors.push(`"query" is required for "${operation}".`);
    }
    if (operation === 'head' && !args.path) {
        errors.push('"path" is required for "head".');
    }
    if (operation === 'diff' && !args.path) {
        errors.push('"path" is required for "diff".');
    }
    if ((operation === 'write' || operation === 'append') && args.content === undefined) {
        errors.push(`"content" is required for "${operation}".`);
    }
    if (operation === 'replace' && (args.oldText === undefined || args.newText === undefined)) {
        errors.push('"oldText" and "newText" are required for "replace".');
    }
    return errors;
};
