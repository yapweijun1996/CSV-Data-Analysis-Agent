// Import directly from the leaf module to avoid cross-chunk TDZ errors in production.
import { PRE_FILTER_OPERATORS } from '../../../types/preFilter';
import { createToolCreatePlanSchema } from '../../ai/schemas/analysisSchemas';

export const reviewCardsSchema = {
    type: 'object',
    properties: {
        targetCardIds: {
            type: 'array',
            items: { type: 'string' },
        },
        goal: { type: 'string' },
    },
};

export const clarificationSchema = {
    type: 'object',
    properties: {
        question: { type: 'string' },
        allowFreeText: { type: 'boolean' },
        options: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    label: { type: 'string' },
                    value: { type: 'string' },
                },
                required: ['label', 'value'],
            },
        },
        pendingPlan: { type: 'object' },
        targetProperty: { type: 'string' },
        resumeContext: {
            type: 'object',
            properties: {
                turnId: { type: 'string' },
                resumeMessagePrefix: { type: 'string' },
                optionLabel: { type: 'string' },
                originalUserRequest: { type: 'string' },
                selectedPath: { type: 'string' },
                mustPreserveOutcome: { type: 'string', enum: ['answer', 'table', 'card', 'derived_metric'] },
                clarificationQuestionFingerprint: { type: 'string' },
                blockedReason: { type: 'string' },
                resumeTargetRunId: { type: 'string' },
                resumeTargetTurnId: { type: 'string' },
                resumeOriginalUserMessage: { type: 'string' },
            },
        },
    },
    required: ['question'],
};

export const emptyObjectSchema = {
    type: 'object',
    properties: {},
    additionalProperties: false,
};

export const suggestionActionSchema = {
    type: 'object',
    properties: {
        suggestionId: { type: 'string' },
    },
    required: ['suggestionId'],
};

export const aggregateTableSchema = (columnNames: string[]) => ({
    type: 'object',
    properties: {
        cardId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        chartType: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut', 'scatter', 'combo', 'radar', 'bubble'] },
        groupByColumn: { type: 'string', enum: columnNames },
        valueColumn: { type: 'string', enum: columnNames },
        aggregation: { type: 'string', enum: ['sum', 'count', 'avg', 'count_distinct', 'min', 'max', 'median', 'percentile'] },
        preFilter: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    column: { type: 'string', enum: columnNames },
                    value: {
                        anyOf: [
                            { type: 'string' },
                            { type: 'number' },
                            { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
                        ],
                    },
                    operator: {
                        type: 'string',
                        enum: [...PRE_FILTER_OPERATORS],
                    },
                },
                required: ['column', 'value'],
            },
        },
    },
});

export const calculatedColumnSchema = {
    type: 'object',
    properties: {
        cardId: { type: 'string' },
        newColumnName: { type: 'string' },
        formula: { type: 'string' },
        updateChart: {
            type: 'object',
            properties: {
                useAs: { type: 'string', enum: ['primaryY', 'secondaryY'] },
                newChartType: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut', 'scatter', 'combo', 'radar', 'bubble'] },
            },
            required: ['useAs'],
        },
    },
    required: ['cardId', 'newColumnName', 'formula'],
};

export const statisticalAnalysisSchema = (columnNames: string[]) => ({
    type: 'object',
    properties: {
        analysisType: { type: 'string', enum: ['correlation', 'distribution', 'outlier_scan', 'trend_line', 'simple_regression'] },
        column: { type: 'string', enum: columnNames },
        columnA: { type: 'string', enum: columnNames },
        columnB: { type: 'string', enum: columnNames },
        dateColumn: { type: 'string', enum: columnNames },
        valueColumn: { type: 'string', enum: columnNames },
        title: { type: 'string' },
        description: { type: 'string' },
    },
    required: ['analysisType', 'title', 'description'],
});

export const pivotMatrixSchema = (columnNames: string[]) => ({
    type: 'object',
    properties: {
        rows: {
            type: 'array',
            description: 'Row dimension columns. Each unique combination of these columns becomes one row in the pivot matrix.',
            minItems: 1,
            items: { type: 'string', enum: columnNames },
        },
        columns: {
            type: 'array',
            description: 'Column dimension columns for cross-tabulation. Each unique value in these columns becomes a separate numeric column in the matrix. Omit for a single-value-per-row summary. Use when you want a true matrix (e.g., rows=ProjectCode, columns=Quarter → one column per quarter).',
            items: { type: 'string', enum: columnNames },
        },
        metric: {
            type: 'string',
            description: 'The numeric column to aggregate. Required when aggregate is not "count".',
            enum: columnNames,
        },
        aggregate: {
            type: 'string',
            description: 'Aggregation function applied to the metric column within each cell.',
            enum: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'median', 'percentile'],
        },
        title: { type: 'string' },
        description: { type: 'string' },
        topN: { type: 'integer', minimum: 1, maximum: 100 },
        sort: {
            type: 'object',
            properties: {
                by: { type: 'string', enum: ['row_total', 'label'] },
                direction: { type: 'string', enum: ['asc', 'desc'] },
            },
            required: ['by', 'direction'],
        },
    },
    required: ['rows', 'aggregate', 'title', 'description'],
});

export const periodCompareSchema = (columnNames: string[]) => ({
    type: 'object',
    properties: {
        dateColumn: { type: 'string', enum: columnNames },
        metricColumn: { type: 'string', enum: columnNames },
        aggregate: { type: 'string', enum: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'median', 'percentile'] },
        grain: { type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'] },
        comparisonMode: { type: 'string', enum: ['previous_period', 'previous_year'] },
        segmentColumns: {
            type: 'array',
            items: { type: 'string', enum: columnNames },
        },
        title: { type: 'string' },
        description: { type: 'string' },
        topN: { type: 'integer', minimum: 1, maximum: 100 },
    },
    required: ['dateColumn', 'aggregate', 'grain', 'comparisonMode', 'title', 'description'],
});

export const cohortRetentionSchema = (columnNames: string[]) => ({
    type: 'object',
    properties: {
        metricName: { type: 'string', enum: ['active_user_count', 'retention', 'churn', 'new_user_count'] },
        dateColumn: { type: 'string', enum: columnNames },
        userIdColumn: { type: 'string', enum: columnNames },
        signupDateColumn: { type: 'string', enum: columnNames },
        segmentColumn: { type: 'string', enum: columnNames },
        timeUnit: { type: 'string', enum: ['day', 'week', 'month'] },
        periods: { type: 'integer', minimum: 1, maximum: 24 },
        title: { type: 'string' },
        description: { type: 'string' },
    },
    required: ['timeUnit', 'title', 'description'],
});

export const rootCauseBreakdownSchema = (columnNames: string[]) => ({
    type: 'object',
    properties: {
        dateColumn: { type: 'string', enum: columnNames },
        metricColumn: { type: 'string', enum: columnNames },
        aggregate: { type: 'string', enum: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'median', 'percentile'] },
        grain: { type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'] },
        comparisonMode: { type: 'string', enum: ['previous_period', 'previous_year'] },
        dimensionColumns: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', enum: columnNames },
        },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        title: { type: 'string' },
        description: { type: 'string' },
    },
    required: ['dateColumn', 'aggregate', 'grain', 'comparisonMode', 'dimensionColumns', 'title', 'description'],
});

export const metricMappingValidationSchema = (columnNames: string[]) => ({
    type: 'object',
    oneOf: [
        {
            type: 'object',
            properties: {
                validationKind: { type: 'string', enum: ['base'] },
                metricName: {
                    type: 'string',
                    enum: ['revenue', 'cost', 'budget', 'actual'],
                },
                requestedGrain: {
                    type: 'array',
                    items: { type: 'string', enum: columnNames },
                },
                proposedMapping: {
                    type: 'object',
                    properties: {
                        sourceKind: { type: 'string', enum: ['column', 'row_label'] },
                        column: { type: 'string', enum: columnNames },
                        labelColumn: { type: 'string', enum: columnNames },
                        valueColumn: { type: 'string', enum: columnNames },
                        expectedInputs: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                    },
                },
            },
            required: ['validationKind', 'metricName'],
        },
        {
            type: 'object',
            properties: {
                validationKind: { type: 'string', enum: ['derived'] },
                metricName: {
                    type: 'string',
                    enum: ['profit', 'margin', 'variance'],
                },
                requestedGrain: {
                    type: 'array',
                    items: { type: 'string', enum: columnNames },
                },
                proposedMapping: {
                    type: 'object',
                    properties: {
                        sourceKind: { type: 'string', enum: ['column', 'row_label'] },
                        column: { type: 'string', enum: columnNames },
                        labelColumn: { type: 'string', enum: columnNames },
                        valueColumn: { type: 'string', enum: columnNames },
                        expectedInputs: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                    },
                },
            },
            required: ['validationKind', 'metricName'],
        },
    ],
});

export const cardIdSchema = { type: 'object', properties: { cardId: { type: 'string' } }, required: ['cardId'] };

export const cardRefineSchema = {
    type: 'object',
    properties: {
        cardId: { type: 'string' },
        changes: {
            type: 'object',
            properties: {
                topN: { type: 'integer', minimum: 1, maximum: 200 },
                chartType: {
                    type: 'string',
                    enum: ['bar', 'line', 'pie', 'doughnut', 'scatter', 'combo', 'radar', 'bubble'],
                },
                filter: {
                    type: 'object',
                    properties: {
                        column: { type: 'string' },
                        values: {
                            type: 'array',
                            items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
                        },
                    },
                    required: ['column', 'values'],
                },
                isDataVisible: { type: 'boolean' },
                summary: { type: 'string', description: 'Replace the card AI summary text.' },
            },
        },
    },
    required: ['cardId', 'changes'],
};

export const spreadsheetFilterSchema = {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
};

export const workspaceListSchema = {
    type: 'object',
    properties: {
        path: { type: 'string' },
        recursive: { type: 'boolean' },
        limit: { type: 'integer' },
    },
};

export const workspacePathSchema = {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
};

export const workspaceSearchSchema = {
    type: 'object',
    properties: {
        path: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'integer' },
        caseSensitive: { type: 'boolean' },
    },
    required: ['query'],
};

export const workspaceHeadSchema = {
    type: 'object',
    properties: {
        path: { type: 'string' },
        limit: { type: 'integer' },
    },
    required: ['path'],
};

export const workspaceDiffSchema = {
    type: 'object',
    properties: {
        path: { type: 'string' },
        comparePath: { type: 'string' },
        limit: { type: 'integer' },
    },
    required: ['path'],
};

export const workspaceReplaceSchema = {
    type: 'object',
    properties: {
        path: { type: 'string' },
        oldText: { type: 'string' },
        newText: { type: 'string' },
        replaceAll: { type: 'boolean' },
    },
    required: ['path', 'oldText', 'newText'],
};

export const workspaceWriteSchema = {
    type: 'object',
    properties: {
        path: { type: 'string' },
        content: { type: 'string' },
    },
    required: ['path', 'content'],
};

export const analysisPlanSchema = (columnNames: string[]) => ({
    type: 'object',
    properties: { plan: createToolCreatePlanSchema(columnNames) },
    required: ['plan'],
});

export const dataReshapeSchema = {
    type: 'object',
    properties: {
        reason: {
            type: 'string',
            description: 'Why reshaping is appropriate for this dataset.',
        },
        sourceColumns: {
            type: 'array',
            description: 'Column names to unpivot (the wide period/series columns).',
            items: { type: 'string' },
            minItems: 2,
        },
        keepColumns: {
            type: 'array',
            description: 'Dimension columns to preserve as-is (e.g. Stock Code, Description).',
            items: { type: 'string' },
        },
        keyColumn: {
            type: 'string',
            description: 'Output column name for the unpivoted key (default: "Period").',
        },
        valueColumn: {
            type: 'string',
            description: 'Output column name for the unpivoted value (default: "Value").',
        },
    },
    required: ['reason', 'sourceColumns', 'keepColumns'],
};

export const dataKeepWideSchema = {
    type: 'object',
    properties: {
        reason: {
            type: 'string',
            description: 'Why the dataset should remain in wide format for analysis.',
        },
    },
    required: ['reason'],
};
