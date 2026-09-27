import { getDataOperationSchema, getDataOperationSchemaForTypes } from '../../agent/execution/dataOperationManifest';
import type { DataOperationType } from '../../../types';

// Inlined from services/agent/execution/dataOperationSchemas.ts to avoid
// cross-chunk TDZ errors. Rollup places the agent module in app-agent, but
// this file (app-ai) uses these schemas at top-level const initialization.
const filterPredicateSchema = {
    type: 'object',
    properties: {
        column: { type: 'string', minLength: 1 },
        operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'starts_with', 'ends_with', 'in', 'is_null', 'not_null'] },
        value: {},
    },
    required: ['column', 'operator'],
};

const filterPredicateGroupSchema = {
    type: 'object',
    properties: {
        predicates: {
            type: 'array',
            items: filterPredicateSchema,
        },
    },
    required: ['predicates'],
};

const filterRowsOperationSchema = {
    type: 'object',
    properties: {
        id: { type: 'string', description: 'Unique operation identifier.' },
        type: { type: 'string', enum: ['filter_rows'] },
        reason: { type: 'string', description: 'Reason for applying this filter.' },
        predicates: {
            type: 'array',
            items: filterPredicateSchema,
        },
        groups: {
            type: 'array',
            description: 'Optional OR groups. Each group is AND-only internally; the overall result matches if any group matches.',
            items: filterPredicateGroupSchema,
        },
    },
    required: ['id', 'type', 'reason'],
    anyOf: [{ required: ['predicates'] }, { required: ['groups'] }],
};

export const columnProfileSchema = {
    type: 'object',
    properties: {
        name: { type: 'string', description: "The column name." },
        type: { type: 'string', enum: ['numerical', 'categorical', 'date', 'time', 'currency', 'percentage'], description: "The data type of the column. Identify specific types like 'date', 'currency', etc., where possible." },
    },
    required: ['name', 'type'],
};

export const queryWhereSchema = {
    type: 'object',
    properties: {
        predicates: {
            type: 'array',
            minItems: 1,
            items: filterPredicateSchema,
        },
        groups: {
            type: 'array',
            minItems: 1,
            items: {
                type: 'object',
                properties: {
                    predicates: {
                        type: 'array',
                        minItems: 1,
                        items: filterPredicateSchema,
                    },
                },
                required: ['predicates'],
            },
        },
    },
    anyOf: [
        { required: ['predicates'] },
        { required: ['groups'] },
    ],
};

export const queryOrderBySchema = {
    type: 'object',
    properties: {
        column: { type: 'string', minLength: 1 },
        direction: { type: 'string', enum: ['asc', 'desc'] },
    },
    required: ['column', 'direction'],
};

export const postAggregatePredicateSchema = {
    type: 'object',
    properties: {
        column: { type: 'string', minLength: 1 },
        operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'not_null'] },
        value: {},
    },
    required: ['column', 'operator'],
};

export const queryAggregateSchema = {
    anyOf: [
        {
            type: 'object',
            properties: {
                function: { type: 'string', enum: ['count'] },
                column: { type: 'string', minLength: 1, description: 'Optional source column. Omit for row-count aggregation.' },
                as: { type: 'string', minLength: 1, description: 'Required output alias for this aggregate column.' },
                where: { ...queryWhereSchema, description: 'Optional aggregate-scoped filter. Use this when each aggregate must summarize a different subset of source rows.' },
            },
            required: ['function', 'as'],
        },
        {
            type: 'object',
            properties: {
                function: { type: 'string', enum: ['count_distinct', 'sum', 'avg', 'min', 'max', 'median'] },
                column: { type: 'string', minLength: 1, description: 'Required source column for numeric aggregates.' },
                as: { type: 'string', minLength: 1, description: 'Required output alias for this aggregate column.' },
                where: { ...queryWhereSchema, description: 'Optional aggregate-scoped filter. Use this when each aggregate must summarize a different subset of source rows.' },
            },
            required: ['function', 'column', 'as'],
        },
        {
            type: 'object',
            properties: {
                function: { type: 'string', enum: ['percentile'] },
                column: { type: 'string', minLength: 1, description: 'Required source column for percentile aggregation.' },
                as: { type: 'string', minLength: 1, description: 'Required output alias for this aggregate column.' },
                percentile: { type: 'number', minimum: 0, maximum: 1 },
                where: { ...queryWhereSchema, description: 'Optional aggregate-scoped filter. Use this when each aggregate must summarize a different subset of source rows.' },
            },
            required: ['function', 'column', 'as', 'percentile'],
        },
    ],
};

export const queryPlanSchema = {
    type: 'object',
    properties: {
        select: {
            type: 'array',
            description: 'Optional whitelist of columns to return.',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
        },
        where: queryWhereSchema,
        groupBy: {
            type: 'array',
            description: 'Optional grouping columns for read-only summary queries. If present, pair them with aggregates.',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
        },
        aggregates: {
            type: 'array',
            description: 'Optional aggregate definitions for grouped or grand-total queries. Use bounded aggregate functions and give every aggregate a stable alias.',
            minItems: 1,
            items: queryAggregateSchema,
        },
        postAggregateFilter: {
            type: 'object',
            properties: {
                predicates: {
                    type: 'array',
                    minItems: 1,
                    items: postAggregatePredicateSchema,
                },
                groups: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        properties: {
                            predicates: {
                                type: 'array',
                                minItems: 1,
                                items: postAggregatePredicateSchema,
                            },
                        },
                        required: ['predicates'],
                    },
                },
            },
            anyOf: [
                { required: ['predicates'] },
                { required: ['groups'] },
            ],
        },
        orderBy: {
            type: 'array',
            description: 'Optional list of bounded sort clauses. Every orderBy column must also appear in select.',
            minItems: 1,
            items: queryOrderBySchema,
        },
        limit: {
            type: 'integer',
            description: 'Optional maximum rows to return. Runtime will clamp this to a safety limit.',
            minimum: 0,
        },
    },
    anyOf: [
        { required: ['select'] },
        { required: ['where'] },
        { required: ['groupBy'] },
        { required: ['aggregates'] },
        { required: ['postAggregateFilter'] },
        { required: ['orderBy'] },
        { required: ['limit'] },
    ],
};

// Lazy schema builders — getDataOperationSchema / getDataOperationSchemaForTypes
// live in app-agent chunk. Calling them at top-level const initialization
// triggers a TDZ when Rollup evaluates app-ai first. Wrapping in getters
// defers the call until first property access (always after all chunks init).

let _dataPreparationSchema: Record<string, unknown> | null = null;

export const getDataPreparationSchema = () => {
    if (!_dataPreparationSchema) {
        _dataPreparationSchema = {
            type: 'object',
            properties: {
                explanation: { type: 'string', description: "A brief, user-facing explanation of the transformations that will be applied to the data." },
                operations: {
                    type: 'array',
                    description: 'A short sequence of deterministic data operations. Keep the list empty if no permanent cleaning is needed.',
                    items: getDataOperationSchema(),
                    maxItems: 8,
                },
                outputColumns: {
                    type: 'array',
                    description: "A list of column profiles describing the structure of the data AFTER the transformation. If no transformation is performed, this should be the same as the input column profiles.",
                    items: columnProfileSchema,
                },
            },
            required: ['explanation', 'operations', 'outputColumns'],
        };
    }
    return _dataPreparationSchema;
};

/** @deprecated Use getDataPreparationSchema() instead — kept for backward compat. */
export const dataPreparationSchema = new Proxy({} as Record<string, unknown>, {
    get: (_target, prop) => getDataPreparationSchema()[prop as string],
    ownKeys: () => Reflect.ownKeys(getDataPreparationSchema()),
    getOwnPropertyDescriptor: (_target, prop) =>
        Reflect.getOwnPropertyDescriptor(getDataPreparationSchema(), prop),
    has: (_target, prop) => prop in getDataPreparationSchema(),
});

const dataPreparationProviderOperationTypes: DataOperationType[] = [
    'drop_rows_by_index',
    'drop_rows_by_condition',
    'drop_blank_rows',
    'promote_header_row',
    'rename_columns',
    'drop_columns',
    'trim_whitespace',
    'normalize_empty_values',
    'replace_values',
    'cast_column',
    'fill_missing',
    'dedupe_rows',
    'filter_rows',
    'split_column',
    'unpivot_columns',
];

let _baseProviderSchema: Record<string, unknown> | null = null;

const resolveBaseProviderSchema = () => {
    if (!_baseProviderSchema) {
        const base = getDataPreparationSchema() as { properties: { operations: Record<string, unknown> }; [k: string]: unknown };
        _baseProviderSchema = {
            ...base,
            properties: {
                ...base.properties,
                operations: {
                    ...base.properties.operations,
                    items: getDataOperationSchemaForTypes(dataPreparationProviderOperationTypes),
                },
            },
        };
    }
    return _baseProviderSchema;
};

/** @deprecated Use getDataPreparationProviderSchema(options) instead — kept for backward compat. */
export const dataPreparationProviderSchema = new Proxy({} as Record<string, unknown>, {
    get: (_target, prop) => resolveBaseProviderSchema()[prop as string],
    ownKeys: () => Reflect.ownKeys(resolveBaseProviderSchema()),
    getOwnPropertyDescriptor: (_target, prop) =>
        Reflect.getOwnPropertyDescriptor(resolveBaseProviderSchema(), prop),
    has: (_target, prop) => prop in resolveBaseProviderSchema(),
});

const compactColumnProfileSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['numerical', 'categorical', 'date', 'time', 'currency', 'percentage'] },
    },
    required: ['name', 'type'],
};

const compactFilterPredicateSchema = {
    type: 'object',
    properties: {
        column: { type: 'string' },
        operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'starts_with', 'ends_with', 'in', 'is_null', 'not_null'] },
        value: { type: 'string' },
    },
    required: ['column', 'operator'],
};

const compactFilterPredicateGroupSchema = {
    type: 'object',
    properties: {
        predicates: {
            type: 'array',
            items: compactFilterPredicateSchema,
        },
    },
    required: ['predicates'],
};

const compactRenameMappingSchema = {
    type: 'object',
    properties: {
        from: { type: 'string' },
        to: { type: 'string' },
    },
    required: ['from', 'to'],
};

const compactUnpivotLabelMappingSchema = {
    type: 'object',
    properties: {
        sourceColumn: { type: 'string' },
        label: { type: 'string' },
    },
    required: ['sourceColumn', 'label'],
};

const compactUnpivotLabelColumnSchema = {
    type: 'object',
    properties: {
        outputColumn: { type: 'string' },
        mappings: {
            type: 'array',
            items: compactUnpivotLabelMappingSchema,
        },
    },
    required: ['outputColumn', 'mappings'],
};

const compactUnpivotRowClassMappingSchema = {
    type: 'object',
    properties: {
        sourceRowIndex: { type: 'integer' },
        rowClass: { type: 'string' },
    },
    required: ['sourceRowIndex', 'rowClass'],
};

const compactUnpivotHierarchyDepthMappingSchema = {
    type: 'object',
    properties: {
        sourceRowIndex: { type: 'integer' },
        depth: { type: 'integer' },
    },
    required: ['sourceRowIndex', 'depth'],
};

const compactWideTableProviderOperationTypes: DataOperationType[] = [
    'drop_rows_by_index',
    'drop_rows_by_condition',
    'drop_blank_rows',
    'promote_header_row',
    'rename_columns',
    'drop_columns',
    'trim_whitespace',
    'normalize_empty_values',
    'cast_column',
    'unpivot_columns',
];

const compactWideTableOperationSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        reason: { type: 'string' },
        type: { type: 'string', enum: compactWideTableProviderOperationTypes },
        indices: {
            type: 'array',
            items: { type: 'integer' },
        },
        predicates: {
            type: 'array',
            items: compactFilterPredicateSchema,
        },
        groups: {
            type: 'array',
            items: compactFilterPredicateGroupSchema,
        },
        rowIndex: { type: 'integer' },
        mappings: {
            type: 'array',
            items: compactRenameMappingSchema,
        },
        columns: {
            type: 'array',
            items: { type: 'string' },
        },
        emptyMarkers: {
            type: 'array',
            items: { type: 'string' },
        },
        column: { type: 'string' },
        targetType: { type: 'string', enum: ['number', 'currency', 'percentage', 'date', 'boolean', 'string'] },
        sourceColumns: {
            type: 'array',
            items: { type: 'string' },
        },
        keyColumn: { type: 'string' },
        valueColumn: { type: 'string' },
        keepColumns: {
            type: 'array',
            items: { type: 'string' },
        },
        labelColumn: { type: 'string' },
        labelMappings: {
            type: 'array',
            items: compactUnpivotLabelMappingSchema,
        },
        labelColumns: {
            type: 'array',
            items: compactUnpivotLabelColumnSchema,
        },
        sourceColumnNameColumn: { type: 'string' },
        sourceRowIndexColumn: { type: 'string' },
        rowClassColumn: { type: 'string' },
        rowClassMappings: {
            type: 'array',
            items: compactUnpivotRowClassMappingSchema,
        },
        hierarchyDepthColumn: { type: 'string' },
        hierarchyDepthMappings: {
            type: 'array',
            items: compactUnpivotHierarchyDepthMappingSchema,
        },
    },
    required: ['id', 'type', 'reason'],
};

const compactWideTableDataPreparationProviderSchema = {
    type: 'object',
    properties: {
        explanation: { type: 'string' },
        operations: {
            type: 'array',
            items: compactWideTableOperationSchema,
            maxItems: 8,
        },
        outputColumns: {
            type: 'array',
            items: compactColumnProfileSchema,
        },
    },
    required: ['explanation', 'operations', 'outputColumns'],
};

export const getDataPreparationProviderSchema = (options?: { compactWideTable?: boolean }) =>
    options?.compactWideTable ? compactWideTableDataPreparationProviderSchema : dataPreparationProviderSchema;

export const reportContextExtractionSchema = {
    type: 'object',
    properties: {
        reportTitle: {
            type: 'string',
            description: 'A concise human-readable report title. You may rephrase or clean up raw text for readability, but it must be grounded in visible CSV evidence.',
        },
        reportDescription: {
            type: 'string',
            description: 'A 1-2 sentence description of what this CSV dataset contains (domain, time period, scope). Ground in visible evidence from metadata, headers, and body sample.',
        },
        parameterLines: {
            type: 'array',
            description: 'Up to 5 report parameter or filter lines that were preserved outside the body table.',
            items: { type: 'string' },
            maxItems: 5,
        },
        footerLines: {
            type: 'array',
            description: 'Up to 5 footer, memo, or remark lines that belong below the body table.',
            items: { type: 'string' },
            maxItems: 5,
        },
        candidateHeaderLine: {
            type: 'array',
            description: 'A likely tabular header row or header-layer labels. Return an empty array if unknown.',
            items: { type: 'string' },
            maxItems: 20,
        },
        confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'How confident you are that the extracted report context is correct.',
        },
        reasoning: {
            type: 'string',
            description: 'A short explanation of which report evidence supported the extraction.',
        },
    },
    required: ['reportTitle', 'reportDescription', 'parameterLines', 'footerLines', 'candidateHeaderLine', 'confidence', 'reasoning'],
};

export const datasetSemanticAnnotationSchema = {
    type: 'object',
    properties: {
        datasetRole: {
            type: 'string',
            enum: ['detail_table', 'summary_report', 'mixed_report', 'unknown'],
            description: 'Overall semantic role of the prepared dataset.',
        },
        rowAnnotations: {
            type: 'array',
            description: 'Semantic judgments for the provided candidate rows only. Do not invent row indices that were not provided.',
            maxItems: 80,
            items: {
                type: 'object',
                properties: {
                    rowIndex: { type: 'integer', minimum: 0 },
                    rowRole: {
                        type: 'string',
                        enum: ['detail', 'subtotal', 'grand_total', 'group_header', 'footer', 'note', 'bucket', 'noise', 'unknown'],
                    },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    reason: { type: 'string' },
                    confidenceBand: {
                        type: 'string',
                        enum: ['high', 'medium', 'low'],
                    },
                    evidenceSources: {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: ['ai_prompt_context', 'sample_values', 'type_profile', 'report_context', 'deterministic_pattern'],
                        },
                    },
                    excludeFromDefaultAnalysis: { type: 'boolean' },
                    unsafeForNarrative: { type: 'boolean' },
                },
                required: ['rowIndex', 'rowRole', 'confidence', 'reason'],
            },
        },
        columnAnnotations: {
            type: 'array',
            description: 'Semantic role guesses for columns in the prepared dataset.',
            maxItems: 80,
            items: {
                type: 'object',
                properties: {
                    columnName: { type: 'string' },
                    semanticRole: {
                        type: 'string',
                        enum: ['business_entity', 'business_dimension', 'metric', 'time_dimension', 'descriptor', 'code', 'helper_dimension', 'note', 'unknown'],
                    },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    reason: { type: 'string' },
                    rawHeader: { type: 'string' },
                    businessLabel: { type: 'string' },
                    sampleValueHints: {
                        type: 'array',
                        items: { type: 'string' },
                        maxItems: 5,
                    },
                    isPrimaryGrainCandidate: { type: 'boolean' },
                    isMetricCandidate: { type: 'boolean' },
                    isBusinessSafe: { type: 'boolean' },
                    confidenceBand: {
                        type: 'string',
                        enum: ['high', 'medium', 'low'],
                    },
                    evidenceSources: {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: ['ai_prompt_context', 'sample_values', 'type_profile', 'report_context', 'deterministic_pattern'],
                        },
                    },
                },
                required: ['columnName', 'semanticRole', 'confidence', 'reason'],
            },
        },
        headerSemantics: {
            type: 'object',
            properties: {
                reportTitle: { type: 'string' },
                reportType: {
                    type: 'string',
                    enum: ['financial_statement', 'project_report', 'operational_report', 'detail_listing', 'unknown'],
                },
                headerRoleHints: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            headerValue: { type: 'string' },
                            role: {
                                type: 'string',
                                enum: ['grain', 'metric', 'helper', 'filter_scope', 'unknown'],
                            },
                            confidence: { type: 'number', minimum: 0, maximum: 1 },
                            reason: { type: 'string' },
                        },
                        required: ['headerValue', 'role', 'confidence', 'reason'],
                    },
                    maxItems: 20,
                },
                scopeHints: {
                    type: 'object',
                    properties: {
                        period: { type: 'string' },
                        businessUnit: { type: 'string' },
                        region: { type: 'string' },
                        scenario: { type: 'string' },
                    },
                },
                businessTerminology: {
                    type: 'array',
                    items: { type: 'string' },
                    maxItems: 12,
                },
                headerConfidence: { type: 'number', minimum: 0, maximum: 1 },
                confidenceBand: {
                    type: 'string',
                    enum: ['high', 'medium', 'low'],
                },
                evidenceSources: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['ai_prompt_context', 'sample_values', 'type_profile', 'report_context', 'deterministic_pattern'],
                    },
                },
                conflictDetected: { type: 'boolean' },
                reason: { type: 'string' },
            },
            required: ['reportTitle', 'reportType', 'headerRoleHints', 'scopeHints', 'businessTerminology', 'headerConfidence', 'reason'],
        },
        summary: {
            type: 'string',
            description: 'Short explanation of the semantic structure and any likely non-detail rows.',
        },
    },
    required: ['datasetRole', 'rowAnnotations', 'columnAnnotations', 'headerSemantics', 'summary'],
};

export const sqlPrecheckAssessmentSchema = {
    type: 'object',
    properties: {
        status: {
            type: 'string',
            enum: ['passed', 'blocked'],
            description: 'Whether the prepared dataset looks ready for grouped SQL analysis.',
        },
        summary: {
            type: 'string',
            description: 'Short explanation of the precheck decision.',
        },
        candidatePairs: {
            type: 'array',
            description: 'Up to 3 metric/dimension pairs that look suitable for grouped SQL cards.',
            maxItems: 3,
            items: {
                type: 'object',
                properties: {
                    dimension: { type: 'string' },
                    metric: { type: 'string' },
                    confidence: {
                        type: 'string',
                        enum: ['high', 'medium', 'low'],
                    },
                    reason: { type: 'string' },
                },
                required: ['dimension', 'metric', 'confidence', 'reason'],
            },
        },
        findings: {
            type: 'array',
            description: 'Specific blockers or warnings that explain the decision.',
            maxItems: 8,
            items: {
                type: 'object',
                properties: {
                    kind: {
                        type: 'string',
                        enum: [
                            'null_heavy_metric',
                            'constant_metric',
                            'zero_total_metric',
                            'flat_grouped_metric',
                            'low_distinct_dimension',
                            'parse_failures_remaining',
                            'high_fragmentation',
                            'no_viable_candidates',
                        ],
                    },
                    severity: {
                        type: 'string',
                        enum: ['warn', 'block'],
                    },
                    message: { type: 'string' },
                    column: { type: 'string' },
                    metric: { type: 'string' },
                    dimension: { type: 'string' },
                },
                required: ['kind', 'severity', 'message'],
            },
        },
    },
    required: ['status', 'summary', 'candidatePairs', 'findings'],
};

export const filterFunctionSchema = {
    type: 'object',
    properties: {
        explanation: { type: 'string', description: "A brief, user-facing explanation of the filter that was created from the natural language query." },
        operation: {
            type: 'object',
            description: 'Exactly one deterministic filter_rows operation. At least one of predicates or groups must be present.',
            properties: {
                id: { type: 'string', description: 'Stable operation identifier.' },
                type: { type: 'string', enum: ['filter_rows'] },
                reason: { type: 'string', description: 'Short explanation for why this filter is needed.' },
                predicates: {
                    type: 'array',
                    items: filterPredicateSchema,
                },
                groups: {
                    type: 'array',
                    items: filterPredicateGroupSchema,
                },
            },
            required: ['id', 'type', 'reason'],
        },
    },
    required: ['explanation', 'operation']
} as const;

export const dataQuerySchema = {
    type: 'object',
    properties: {
        explanation: { type: 'string', minLength: 1, description: 'A brief, user-facing explanation of the read-only query.' },
        plan: queryPlanSchema,
        fallbackFilterOperation: filterRowsOperationSchema,
    },
    required: ['explanation', 'plan'],
} as const;

// --- Diagnostic tool schemas ---

export const dataDescribeSchema = {
    type: 'object',
    properties: {
        explanation: { type: 'string', minLength: 1, description: 'A brief explanation of what summary statistics to compute.' },
        columns: { type: 'array', items: { type: 'string' }, description: 'Optional list of numeric columns to describe. Defaults to all numeric columns.' },
    },
    required: ['explanation'],
} as const;

export const dataValueCountsSchema = {
    type: 'object',
    properties: {
        explanation: { type: 'string', minLength: 1, description: 'A brief explanation of what frequency distribution to compute.' },
        column: { type: 'string', minLength: 1, description: 'The categorical column to count values for.' },
        limit: { type: 'number', minimum: 1, maximum: 100, description: 'Maximum number of values to return. Defaults to 20.' },
    },
    required: ['explanation', 'column'],
} as const;

export const dataOutliersSchema = {
    type: 'object',
    properties: {
        explanation: { type: 'string', minLength: 1, description: 'A brief explanation of what outlier detection to perform.' },
        column: { type: 'string', minLength: 1, description: 'The numeric column to detect outliers in.' },
    },
    required: ['explanation', 'column'],
} as const;

export const dataMissingSchema = {
    type: 'object',
    properties: {
        explanation: { type: 'string', minLength: 1, description: 'A brief explanation of what missing data analysis to perform.' },
        columns: { type: 'array', items: { type: 'string' }, description: 'Optional list of columns to analyze. Defaults to all columns.' },
    },
    required: ['explanation'],
} as const;
