/**
 * dataQueryContract.ts — barrel re-export hub
 *
 * Split into focused modules for single-responsibility:
 *   dataQueryDetection.ts      — query plan shape classification
 *   dataQueryNormalization.ts   — raw-to-typed normalization
 *   dataQueryRepairHints.ts     — error text → repair hint matching
 *   dataQueryValidation.ts      — deep structural validation
 *
 * All consumers continue importing from this file.
 */

export {
    hasQueryWhereClauses,
    hasFilterOperationClauses,
    hasSemanticQueryPlan,
    isPreviewDataQuery,
    getDataQueryTraceLabel,
} from './dataQueryDetection';

export {
    normalizeQueryOrderDirection,
    normalizeQueryAggregateFunction,
    normalizeDataQueryPlanLike,
    normalizeDataQueryPayload,
} from './dataQueryNormalization';

export {
    isOrGroupsRepairIssue,
    isConditionalAggregateRepairIssue,
    type DataQueryRepairHintCategory,
    getDataQueryRepairHintCategoryFromText,
    getDataQueryRepairGuidance,
} from './dataQueryRepairHints';

export { validateDataQueryPayload } from './dataQueryValidation';
