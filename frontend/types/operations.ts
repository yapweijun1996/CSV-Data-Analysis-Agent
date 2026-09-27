/**
 * Data operation types, cleaning programs, strategy candidates, and data preparation plans.
 */

import type { CsvCellValue } from './intake';
import type { ColumnProfile } from './analysis';
import type {
    DerivedMetricDeclaration,
    DerivedMetricValidationArtifact,
    NumericReconciliationReport,
    SqlPrecheckReport,
    LabelNormalizationMetadata,
} from './validation';

export type DataOperationType =
    | 'drop_rows_by_index'
    | 'drop_rows_by_condition'
    | 'drop_blank_rows'
    | 'promote_header_row'
    | 'rename_columns'
    | 'drop_columns'
    | 'trim_whitespace'
    | 'normalize_empty_values'
    | 'replace_values'
    | 'cast_column'
    | 'fill_missing'
    | 'dedupe_rows'
    | 'filter_rows'
    | 'derive_column'
    | 'derive_metric_by_label'
    | 'annotate_hierarchy'
    | 'split_column'
    | 'unpivot_columns';

export interface DataOperationBase {
    id: string;
    type: DataOperationType;
    reason: string;
}

export interface RenameColumnsOperation extends DataOperationBase {
    type: 'rename_columns';
    mappings: { from: string; to: string }[];
}

export interface DropRowsByIndexOperation extends DataOperationBase {
    type: 'drop_rows_by_index';
    indices: number[];
}

export interface DropRowsByConditionOperation extends DataOperationBase {
    type: 'drop_rows_by_condition';
    predicates?: FilterPredicate[];
    groups?: FilterPredicateGroup[];
}

export interface DropBlankRowsOperation extends DataOperationBase {
    type: 'drop_blank_rows';
}

export interface PromoteHeaderRowOperation extends DataOperationBase {
    type: 'promote_header_row';
    rowIndex: number;
}

export interface DropColumnsOperation extends DataOperationBase {
    type: 'drop_columns';
    columns: string[];
}

export interface TrimWhitespaceOperation extends DataOperationBase {
    type: 'trim_whitespace';
    columns: string[] | '*';
}

export interface NormalizeEmptyValuesOperation extends DataOperationBase {
    type: 'normalize_empty_values';
    columns: string[] | '*';
    emptyMarkers?: string[];
}

export interface ReplaceValuesOperation extends DataOperationBase {
    type: 'replace_values';
    column: string;
    replacements: { from: string; to: CsvCellValue }[];
    caseSensitive?: boolean;
}

export interface CastColumnOperation extends DataOperationBase {
    type: 'cast_column';
    column: string;
    targetType: 'number' | 'currency' | 'percentage' | 'date' | 'boolean' | 'string';
}

export interface FillMissingOperation extends DataOperationBase {
    type: 'fill_missing';
    column: string;
    strategy: 'constant' | 'forward_fill' | 'zero';
    value?: CsvCellValue;
}

export interface DedupeRowsOperation extends DataOperationBase {
    type: 'dedupe_rows';
    keyColumns: string[];
    keep: 'first';
}

export interface FilterPredicate {
    column: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'contains' | 'starts_with' | 'ends_with' | 'in' | 'not_in' | 'is_null' | 'not_null';
    value?: CsvCellValue | CsvCellValue[];
}

export interface FilterPredicateGroup {
    predicates: FilterPredicate[];
}

export interface FilterRowsOperation extends DataOperationBase {
    type: 'filter_rows';
    predicates?: FilterPredicate[];
    groups?: FilterPredicateGroup[];
}

export type DeriveOperand =
    | { kind: 'column'; column: string }
    | { kind: 'literal'; value: CsvCellValue };

export type DeriveExpression =
    | { kind: 'copy'; source: DeriveOperand }
    | { kind: 'math_binary'; operator: 'add' | 'subtract' | 'multiply' | 'divide'; left: DeriveOperand; right: DeriveOperand }
    | { kind: 'ratio'; numerator: DeriveOperand; denominator: DeriveOperand }
    | { kind: 'concat'; parts: DeriveOperand[]; separator?: string };

export interface DeriveColumnOperation extends DataOperationBase {
    type: 'derive_column';
    newColumn: string;
    expression: DeriveExpression;
    declaration?: DerivedMetricDeclaration;
    validationMode?: 'strict' | 'warn';
}

export interface DeriveMetricComponent {
    operator: 'add' | 'subtract';
    matchAny: string[];
    valueTransform?: 'raw' | 'absolute';
}

export type DeriveMetricByLabelFormula =
    | {
        kind: 'linear_combination';
        components: DeriveMetricComponent[];
    }
    | {
        kind: 'ratio';
        numerator: DeriveMetricComponent[];
        denominator: DeriveMetricComponent[];
        scale?: number;
    };

export interface DeriveMetricByLabelOperation extends DataOperationBase {
    type: 'derive_metric_by_label';
    groupByColumns: string[];
    labelColumn: string;
    valueColumn: string;
    outputMetricLabel: string;
    formula: DeriveMetricByLabelFormula;
    carryForwardColumns?: string[];
    metricName?: string;
    expectedInputs?: string[];
    validationMode?: 'strict' | 'warn';
    declaration?: DerivedMetricDeclaration;
}

export interface AnnotateHierarchyOperation extends DataOperationBase {
    type: 'annotate_hierarchy';
    rowClassColumn?: string;
    hierarchyDepthColumn?: string;
    sourceRowIndexColumn?: string;
}

export interface SplitColumnOperation extends DataOperationBase {
    type: 'split_column';
    column: string;
    delimiter: string;
    targetColumns: string[];
}

export interface UnpivotLabelMapping {
    sourceColumn: string;
    label: CsvCellValue;
}

export interface UnpivotLabelColumn {
    outputColumn: string;
    mappings: UnpivotLabelMapping[];
}

export interface UnpivotRowClassMapping {
    sourceRowIndex: number;
    rowClass: string;
}

export interface UnpivotHierarchyDepthMapping {
    sourceRowIndex: number;
    depth: number;
}

export interface UnpivotColumnsOperation extends DataOperationBase {
    type: 'unpivot_columns';
    sourceColumns: string[];
    keyColumn: string;
    valueColumn: string;
    keepColumns?: string[];
    labelColumn?: string;
    labelMappings?: UnpivotLabelMapping[];
    labelColumns?: UnpivotLabelColumn[];
    sourceColumnNameColumn?: string;
    sourceRowIndexColumn?: string;
    rowClassColumn?: string;
    rowClassMappings?: UnpivotRowClassMapping[];
    hierarchyDepthColumn?: string;
    hierarchyDepthMappings?: UnpivotHierarchyDepthMapping[];
}

export type DataOperation =
    | DropRowsByIndexOperation
    | DropRowsByConditionOperation
    | DropBlankRowsOperation
    | PromoteHeaderRowOperation
    | RenameColumnsOperation
    | DropColumnsOperation
    | TrimWhitespaceOperation
    | NormalizeEmptyValuesOperation
    | ReplaceValuesOperation
    | CastColumnOperation
    | FillMissingOperation
    | DedupeRowsOperation
    | FilterRowsOperation
    | DeriveColumnOperation
    | DeriveMetricByLabelOperation
    | AnnotateHierarchyOperation
    | SplitColumnOperation
    | UnpivotColumnsOperation;

export type AiCleaningStepMode = 'lossless' | 'reshape' | 'destructive';

export interface AiCleaningStep {
    id: string;
    mode: AiCleaningStepMode;
    reason: string;
    operations: DataOperation[];
}

export interface AiCleaningProgram {
    programId: string;
    explanation: string;
    steps: AiCleaningStep[];
    outputColumns: ColumnProfile[];
    source: 'llm_generated' | 'semantic_deterministic';
}

export type CleaningStrategySource =
    | 'agent_primary'
    | 'agent_retry'
    | 'sandbox_js'
    | 'sandbox_python'
    | 'hierarchy_annotation'
    | 'deterministic_cleanup';

export type CleaningStrategyRequirement =
    | 'hierarchical_shape'
    | 'wide_shape'
    | 'label_preservation';

export interface CleaningStrategyCandidate {
    strategyId: string;
    source: CleaningStrategySource;
    program: AiCleaningProgram;
    plan: DataPreparationPlan;
    intentSummary: string;
    requires: CleaningStrategyRequirement[];
    priority: number;
}

export interface CleaningStrategyPreflightResult {
    executable: boolean;
    reasonCode: string | null;
    userMessage: string;
    technicalDetail: string | null;
    fallbackRecommendation: CleaningStrategySource | null;
}

export interface AiCleaningProgramResult {
    primary: CleaningStrategyCandidate;
    candidates: CleaningStrategyCandidate[];
}

export interface DataPreparationPlan {
    explanation: string;
    operations: DataOperation[];
    outputColumns: ColumnProfile[];
    planStatus: 'operations' | 'schema_only' | 'inconsistent';
    consistencyIssues: string[];
    labelNormalization?: LabelNormalizationMetadata;
    normalizedPlaceholderColumns?: string[];
    numericStringNormalizedColumns?: string[];
    aiProgram?: AiCleaningProgram;
    numericReconciliation?: NumericReconciliationReport;
    derivedMetricValidations?: DerivedMetricValidationArtifact[];
    sqlPrecheck?: SqlPrecheckReport;
    sandbox?: {
        language: 'javascript' | 'python';
        codeRef: string;
        attempt: 2 | 3;
        validationDecision: 'trusted' | 'needs_confirmation' | 'blocked';
        validationReasonCodes: string[];
    };
    legacy?: {
        jsFunctionBody: string;
    };
}
