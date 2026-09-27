import type { ColumnProfile, DataPreparationPlanGenerationOptions, DataOperation, AiCleaningStep } from '../../types';
import type { ContextTelemetryTarget } from './contextManager';

export const MUTATION_CLAIM_PATTERN = /\b(remov(?:e|ed|ing)|drop(?:s|ped|ping)?|filter(?:s|ed|ing)?|cast(?:s|ed|ing)?|convert(?:s|ed|ing)?|standardiz(?:e|es|ed|ing)|standardis(?:e|es|ed|ing)|rename(?:s|d|ing)?|dedup(?:e|es|ed|ing)?|split(?:s|ting)?|unpivot(?:s|ed|ing)?|trim(?:s|med|ming)?|normaliz(?:e|es|ed|ing)|normalis(?:e|es|ed|ing)|fill(?:s|ed|ing)?|deriv(?:e|es|ed|ing))\b/i;
export const MAX_DATA_PREP_ATTEMPTS = 2;
export const WIDE_TABLE_NUMERIC_COLUMN_THRESHOLD = 12;
export const WIDE_TABLE_NUMERIC_SHARE_THRESHOLD = 0.55;
export const MULTI_HEADER_NUMERIC_COLUMN_THRESHOLD = 6;
export const MULTI_HEADER_NUMERIC_SHARE_THRESHOLD = 0.4;
export const WIDE_TABLE_SAMPLE_ROW_LIMIT = 4;
export const WIDE_TABLE_SAMPLE_MATRIX_COLUMNS = 4;
export const WIDE_TABLE_SAMPLE_BUSINESS_METRIC_COLUMNS = 3;
export const RETRY_EXAMPLE_LIMIT = 3;
export const RETRY_DETAIL_MAX_CHARS = 220;
export const DIGIT_HEAVY_COLUMN_PATTERN = /^\d{4,}$/;
export const IDENTIFIER_COLUMN_PATTERN = /(code|account|acct|document|project|job|site|description|name|label|category|series|type)/i;
export const BUSINESS_METRIC_COLUMN_PATTERN = /(total|amount|revenue|sales|cost|expense|profit|margin|balance|value)/i;
export const DIMENSION_HINT_PATTERN = /(brand|category|description|name|label|group|type|customer|vendor|supplier|uom)/i;
export const CODE_LIKE_COLUMN_PATTERN = /(code|id|number|num|no|sku|document|account|acct|stock[ _-]?code)/i;
export const PLACEHOLDER_MARKERS = ['', '-', '--', "'-", "' -", 'n/a', 'na', 'null', 'nil', 'none'];
export const WIDE_TABLE_VALUE_CAST_ORDER_ERROR = 'Wide-table plans may cast "Value" only after an unpivot_columns step emits valueColumn "Value".';
export const LABEL_LAYER_RETENTION_SIGNAL = 'label_layer_retention_complete';
export const LABEL_LAYER_RETENTION_REASON = 'Multi-header label layers were not preserved during reshaping.';
export const LOSSLESS_STABILIZER_PRUNABLE_OPERATION_TYPES = new Set<DataOperation['type']>([
    'cast_column',
    'replace_values',
    'trim_whitespace',
    'normalize_empty_values',
]);
export const LOSSLESS_STABILIZER_RESHAPE_OPERATION_TYPES = new Set<DataOperation['type']>([
    'unpivot_columns',
    'split_column',
]);
export const LOSSLESS_STABILIZER_DESTRUCTIVE_OPERATION_TYPES = new Set<DataOperation['type']>([
    'drop_rows_by_index',
    'drop_rows_by_condition',
    'drop_blank_rows',
    'drop_columns',
    'filter_rows',
    'dedupe_rows',
]);

export type ResolvedDataPreparationPlanGenerationOptions = Omit<Required<DataPreparationPlanGenerationOptions>, 'abortSignal'> & {
    abortSignal?: AbortSignal;
};

export const DEFAULT_DATA_PREPARATION_OPTIONS: ResolvedDataPreparationPlanGenerationOptions = {
    maxAttempts: MAX_DATA_PREP_ATTEMPTS,
    allowInternalRetry: true,
    allowDeterministicFallback: true,
    allowHierarchyAnnotationFallback: true,
};

export const normalizeColumnName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
export const normalizeCellValue = (value: unknown): string => String(value ?? '').trim();
export const normalizeMarker = (value: unknown): string => normalizeCellValue(value).toLowerCase();
export const isFilledValue = (value: unknown): boolean => normalizeCellValue(value).length > 0;
export const isNumericType = (type: ColumnProfile['type']) =>
    type === 'numerical' || type === 'currency' || type === 'percentage';
export const isMeaningfulHeaderLayer = (row: unknown[] | null | undefined) =>
    Array.isArray(row) && row.some(value => String(value ?? '').trim().length > 0);

export const resolveDataPreparationOptions = (
    options?: DataPreparationPlanGenerationOptions,
): ResolvedDataPreparationPlanGenerationOptions => {
    const merged = {
        ...DEFAULT_DATA_PREPARATION_OPTIONS,
        ...(options ?? {}),
    };

    if (!merged.allowInternalRetry) {
        merged.maxAttempts = 1;
    }

    merged.maxAttempts = Math.max(1, Math.floor(merged.maxAttempts));
    return merged;
};

export const emitDataPreparationTelemetry = (
    telemetryTarget: ContextTelemetryTarget | undefined,
    responseType:
        | 'data_prep_first_attempt_failed'
        | 'data_prep_self_correction_used'
        | 'data_prep_deterministic_fallback_used'
        | 'data_prep_hierarchy_fallback_used'
        | 'data_prep_hierarchy_annotation_normalized'
        | 'data_prep_wide_reshape_normalized'
        | 'data_prep_schema_only_auto_healed'
        | 'data_prep_plan_salvaged_hierarchy'
        | 'data_prep_plan_salvaged_wide_cast_order'
        | 'data_prep_plan_salvaged_wide_fallback'
        | 'data_prep_pre_return_verification_failed'
        | 'data_prep_placeholder_normalized'
        | 'data_prep_numeric_string_casted'
        | 'data_prep_lossless_op_pruned'
        | 'data_prep_stage_timing'
        | 'data_prep_slow_path_diagnostic',
    detail: string,
    meta?: Record<string, unknown>,
) => telemetryTarget?.logTelemetryEvent?.({
    stage: 'planner_ready',
    responseType,
    detail,
    meta: {
        reasonCode: typeof meta?.reasonCode === 'string' ? meta.reasonCode : responseType,
        ...(meta ?? {}),
    },
});

export type DataPreparationFailureReasonCode =
    | 'provider_no_output'
    | 'timeout_model_call'
    | 'shape_mismatch'
    | 'semantic_miss'
    | 'operation_execution'
    | 'consistency_validation';

export const classifyDataPreparationFailureReason = (error: unknown): DataPreparationFailureReasonCode => {
    const message = error instanceof Error ? error.message : String(error);
    if (/no output generated/i.test(message)) {
        return 'provider_no_output';
    }
    if (/timed out|timeout|abort/i.test(message)) {
        return 'timeout_model_call';
    }
    if (/verification failed|collapsed to a single descriptor group|wide crosstab|hierarchy depth/i.test(message)) {
        return 'shape_mismatch';
    }
    if (/semantic/i.test(message)) {
        return 'semantic_miss';
    }
    if (/consistency/i.test(message)) {
        return 'consistency_validation';
    }
    return 'operation_execution';
};

export const emitDataPreparationStageTiming = (
    telemetryTarget: ContextTelemetryTarget | undefined,
    stage: string,
    elapsedMs: number,
    meta?: Record<string, unknown>,
) => emitDataPreparationTelemetry(
    telemetryTarget,
    'data_prep_stage_timing',
    `${stage} completed in ${elapsedMs}ms.`,
    {
        reasonCode: 'data_prep_stage_timing',
        stage,
        elapsedMs,
        ...(meta ?? {}),
    },
);

export type WideTableProfile = {
    isWide: boolean;
    identifierColumns: ColumnProfile[];
    repeatedMatrixColumns: ColumnProfile[];
    businessMetricColumns: ColumnProfile[];
};

export const inferOperationMode = (operations: DataOperation[]): AiCleaningStep['mode'] => {
    if (operations.some(operation => LOSSLESS_STABILIZER_RESHAPE_OPERATION_TYPES.has(operation.type))) {
        return 'reshape';
    }
    if (operations.some(operation => LOSSLESS_STABILIZER_DESTRUCTIVE_OPERATION_TYPES.has(operation.type))) {
        return 'destructive';
    }
    return 'lossless';
};
