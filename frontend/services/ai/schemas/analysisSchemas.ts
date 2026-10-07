// Inlined from types/preFilter.ts to avoid cross-chunk TDZ errors.
// Rollup places the canonical PRE_FILTER_OPERATORS in the app-agent chunk
// (due to barrel re-export dependency graph), but this file lives in app-ai.
// Importing it — even from the leaf module — still creates a cross-chunk
// binding that fails at initialization time. Inlining breaks the chain.
import type { PreFilterOperator } from '../../../types/preFilter';
const PRE_FILTER_OPERATORS: readonly PreFilterOperator[] = [
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'between', 'contains', 'starts_with', 'ends_with', 'in', 'not_in',
] as const;

// Inlined for the same cross-chunk TDZ reason as PRE_FILTER_OPERATORS above.
import type { AggregationType } from '../../../types/analysis';
const AGGREGATION_ENUM: readonly AggregationType[] = [
    'sum', 'count', 'avg', 'count_distinct', 'min', 'max', 'median', 'percentile',
] as const;

// Schema for Step 0: Choosing what to analyze.
export const createAnalysisTopicsSchema = (minTopics = 4, maxTopics = 8) => ({
    type: 'object',
    properties: {
        topics: {
            type: 'array',
            description: `An array of ${minTopics} to ${maxTopics} distinct, high-level analysis topics or questions, ordered from most to least useful.`,
            items: { type: 'string' },
        }
    },
    required: ['topics'],
} as const);

// Schema for Step 1: Building the aggregation specification.
export const createAggregationSpecSchema = (columnNames: string[]) => ({
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A concise, descriptive title for the analysis based on the topic.' },
    aggregation: { type: 'string', enum: [...AGGREGATION_ENUM], description: 'The aggregation function to apply. Required for bar, line, pie, combo charts.' },
    groupByColumn: { type: 'string', enum: columnNames, description: 'The column to group data by (categorical). Required for bar, line, pie, combo charts.' },
    valueColumn: { type: 'string', enum: columnNames, description: 'The column for aggregation (numerical). Not needed for "count".' },
    secondaryValueColumn: { type: 'string', enum: columnNames, description: 'For combo charts, the secondary column for aggregation (numerical).' },
    secondaryAggregation: { type: 'string', enum: [...AGGREGATION_ENUM], description: 'For combo charts, the aggregation for the secondary value column.' },
    xValueColumn: { type: 'string', enum: columnNames, description: 'The column for the X-axis of a scatter plot (numerical). Required for scatter plots.' },
    yValueColumn: { type: 'string', enum: columnNames, description: 'The column for the Y-axis of a scatter plot (numerical). Required for scatter plots.' },
    preFilter: {
        type: 'array',
        description: "Optional. An array of filters to apply to the data *before* aggregation.",
        items: {
            type: 'object',
            properties: {
                column: { type: 'string', enum: columnNames, description: "The column to filter on." },
                value: {
                    anyOf: [
                        { type: 'string' },
                        { type: 'number' },
                        { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
                    ],
                    description: "The value to filter for.",
                },
                operator: {
                    type: 'string',
                    enum: [...PRE_FILTER_OPERATORS],
                    description: "Optional filter operator. Defaults to exact match when omitted.",
                },
            },
            required: ['column', 'value']
        }
    },
  },
  required: ['title'],
  additionalProperties: false,
} as const);

// Schema for Step 4: Building the chart configuration from aggregated data.
export const createChartConfigSchema = () => ({
  type: 'object',
  properties: {
    chartType: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut', 'scatter', 'combo', 'radar', 'bubble'], description: 'The best chart type for visualizing this aggregated data.' },
    description: { type: 'string', description: 'A brief, user-facing explanation of what the analysis shows.' },
    defaultTopN: { type: 'integer', description: 'Optional. If the analysis has many categories, this suggests a default Top N view (e.g., 8).' },
    defaultHideOthers: { type: 'boolean', description: 'Optional. If using defaultTopN, suggests whether to hide the "Others" category by default.' },
  },
  required: ['chartType', 'description'],
  additionalProperties: false,
} as const);

// This is the original, monolithic schema, kept for reference or other parts of the app.
export const createPlanSchema = (columnNames: string[]) => ({
  type: 'object',
  properties: {
    chartType: { type: 'string', enum: ['bar', 'line', 'multi_line', 'pie', 'doughnut', 'scatter', 'combo', 'radar', 'bubble'], description: 'Type of chart to generate. Use multi_line when comparing multiple numeric columns (e.g., monthly values as separate series).' },
    title: { type: 'string', description: 'A concise title for the analysis.' },
    description: { type: 'string', description: 'A brief explanation of what the analysis shows.' },
    aggregation: { type: 'string', enum: [...AGGREGATION_ENUM], description: 'The aggregation function to apply. Omit for scatter charts.' },
    groupByColumn: { type: 'string', enum: columnNames, description: 'The column to group data by (categorical). Omit for scatter charts.' },
    valueColumn: { type: 'string', enum: columnNames, description: 'The column for aggregation (numerical). Not needed for "count" or multi_line.' },
    valueColumns: { type: 'array', items: { type: 'string', enum: columnNames }, description: 'Multiple value columns for multi-series charts. Use instead of valueColumn when comparing 3+ numeric columns (e.g., monthly period columns).' },
    xValueColumn: { type: 'string', enum: columnNames, description: 'The column for the X-axis of a scatter plot (numerical). Required for scatter plots.' },
    yValueColumn: { type: 'string', enum: columnNames, description: 'The column for the Y-axis of a scatter plot (numerical). Required for scatter plots.' },
    secondaryValueColumn: { type: 'string', enum: columnNames, description: 'For combo charts, the secondary column for aggregation (numerical).' },
    secondaryAggregation: { type: 'string', enum: [...AGGREGATION_ENUM], description: 'For combo charts, the aggregation for the secondary value column.' },
    defaultTopN: { type: 'integer', description: 'Optional. If the analysis has many categories, this suggests a default Top N view (e.g., 8).' },
    defaultHideOthers: { type: 'boolean', description: 'Optional. If using defaultTopN, suggests whether to hide the "Others" category by default.' },
    preFilter: {
        type: 'array',
        description: "Optional. An array of filters to apply to the data *before* aggregation. Use this to scope an analysis, e.g., to a specific Category or Region.",
        items: {
            type: 'object',
            properties: {
                column: { type: 'string', enum: columnNames, description: "The column to filter on." },
                value: {
                    anyOf: [
                        { type: 'string' },
                        { type: 'number' },
                        { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
                    ],
                    description: "The value to filter for.",
                },
                operator: {
                    type: 'string',
                    enum: [...PRE_FILTER_OPERATORS],
                    description: "Optional filter operator. Defaults to exact match when omitted.",
                },
            },
            required: ['column', 'value']
        }
    },
  },
  required: ['chartType', 'title', 'description'],
  additionalProperties: false,
} as const);

export const planSchema = {
  type: 'array',
  items: createPlanSchema([]), // Keep a generic version for non-dynamic uses if needed
} as const;

export const analysisPlanObjectSchema = createPlanSchema([]); // Generic version

export const createSqlAnalysisPlanSchema = (columnNames: string[]) => ({
  type: 'object',
  properties: {
    chartType: { type: 'string', enum: ['bar', 'line', 'multi_line', 'pie', 'doughnut', 'scatter', 'combo', 'radar', 'bubble'] },
    title: { type: 'string' },
    description: { type: 'string' },
    queryMode: { type: 'string', enum: ['aggregate', 'rowset'] },
    aggregation: { type: 'string', enum: [...AGGREGATION_ENUM] },
    secondaryAggregation: { type: 'string', enum: [...AGGREGATION_ENUM] },
    defaultTopN: { type: 'integer' },
    defaultHideOthers: { type: 'boolean' },
    bindings: {
      type: 'object',
      properties: {
        groupByColumn: { type: 'string', enum: columnNames },
        valueColumn: { type: 'string' },
        valueColumns: { type: 'array', items: { type: 'string' }, description: 'Multiple value columns for multi-series rendering.' },
        secondaryValueColumn: { type: 'string' },
        xValueColumn: { type: 'string', enum: columnNames },
        yValueColumn: { type: 'string', enum: columnNames },
      },
      required: [],
    },
    query: {
      type: 'object',
      properties: {
        select: { type: 'array', items: { type: 'string' } },
        groupBy: { type: 'array', items: { type: 'string', enum: columnNames } },
        aggregates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              function: { type: 'string', enum: ['sum', 'count', 'avg', 'count_distinct', 'min', 'max', 'median', 'percentile'] },
              column: { type: 'string', enum: columnNames },
              as: { type: 'string' },
              percentile: { type: 'number', minimum: 0, maximum: 1 },
              where: {
                type: 'object',
                properties: {
                  predicates: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        column: { type: 'string', enum: columnNames },
                        operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'starts_with', 'ends_with', 'in', 'is_null', 'not_null'] },
                        value: {},
                      },
                      required: ['column', 'operator'],
                    },
                  },
                  groups: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        predicates: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              column: { type: 'string', enum: columnNames },
                              operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'starts_with', 'ends_with', 'in', 'is_null', 'not_null'] },
                              value: {},
                            },
                            required: ['column', 'operator'],
                          },
                        },
                      },
                      required: ['predicates'],
                    },
                  },
                },
              },
            },
            required: ['function', 'as'],
          },
        },
        where: {
          type: 'object',
          properties: {
            predicates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  column: { type: 'string', enum: columnNames },
                  operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'starts_with', 'ends_with', 'in', 'is_null', 'not_null'] },
                  value: {},
                },
                required: ['column', 'operator'],
              },
            },
            groups: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  predicates: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        column: { type: 'string', enum: columnNames },
                        operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'starts_with', 'ends_with', 'in', 'is_null', 'not_null'] },
                        value: {},
                      },
                      required: ['column', 'operator'],
                    },
                  },
                },
                required: ['predicates'],
              },
            },
          },
        },
        orderBy: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string' },
              direction: { type: 'string', enum: ['asc', 'desc'] },
            },
            required: ['column', 'direction'],
          },
        },
        limit: { type: 'integer' },
      },
      required: [],
    },
  },
  required: ['chartType', 'title', 'description', 'queryMode', 'query', 'bindings'],
  additionalProperties: false,
} as const);

export const createSqlEvidenceQueryPlanSchema = (columnNames: string[]) => ({
  type: 'object',
  properties: {
    title: { type: 'string' },
    queryMode: { type: 'string', enum: ['aggregate', 'rowset'] },
    intentSummary: { type: 'string' },
    preferredResultShape: {
      type: 'string',
      enum: ['ranked_aggregate', 'time_series', 'rowset_scatter_candidate', 'detail_table'],
    },
    preFilter: {
      type: 'array',
      description: 'Optional canonical pre-aggregation filter contract that must also be reflected in the final SQL WHERE clause.',
      items: {
        type: 'object',
        properties: {
          column: { type: 'string', enum: columnNames },
          value: {},
          operator: {
            type: 'string',
            enum: [...PRE_FILTER_OPERATORS],
          },
        },
        required: ['column', 'value'],
        additionalProperties: false,
      },
    },
    query: {
      type: 'object',
      properties: {
        select: { type: 'array', items: { type: 'string' } },
        groupBy: { type: 'array', items: { type: 'string', enum: columnNames } },
        aggregates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              function: { type: 'string', enum: ['sum', 'count', 'avg', 'count_distinct', 'min', 'max', 'median', 'percentile'] },
              column: { type: 'string', enum: columnNames },
              as: { type: 'string' },
              percentile: { type: 'number', minimum: 0, maximum: 1 },
              where: {
                type: 'object',
                properties: {
                  predicates: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        column: { type: 'string', enum: columnNames },
                        operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'starts_with', 'ends_with', 'in', 'is_null', 'not_null'] },
                        value: {},
                      },
                      required: ['column', 'operator'],
                    },
                  },
                },
              },
            },
            required: ['function', 'as'],
          },
        },
        where: {
          type: 'object',
          properties: {
            predicates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  column: { type: 'string', enum: columnNames },
                  operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'starts_with', 'ends_with', 'in', 'is_null', 'not_null'] },
                  value: {},
                },
                required: ['column', 'operator'],
              },
            },
          },
        },
        orderBy: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string' },
              direction: { type: 'string', enum: ['asc', 'desc'] },
            },
            required: ['column', 'direction'],
          },
        },
        limit: { type: 'integer' },
      },
      required: ['select'],
      additionalProperties: false,
    },
  },
  required: ['title', 'queryMode', 'query', 'intentSummary'],
  additionalProperties: false,
} as const);

export const createSqlPresentationPlanSchema = (columnNames: string[]) => ({
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    presentationMode: { type: 'string', enum: ['table', 'chart', 'table_then_chart'] },
    chartType: { type: 'string', enum: ['bar', 'line', 'scatter', 'combo'] },
    defaultTopN: { type: 'integer' },
    defaultHideOthers: { type: 'boolean' },
    bindings: {
      type: 'object',
      properties: {
        // No enum constraints here — validated post-response in sqlPresentationPlanner.ts.
        // Removing enum: columnNames reduces schema payload by ~2000 tokens for large datasets.
        groupByColumn: { type: 'string' },
        valueColumn: { type: 'string' },
        secondaryValueColumn: { type: 'string' },
        xValueColumn: { type: 'string' },
        yValueColumn: { type: 'string' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  required: ['title', 'description', 'presentationMode'],
  additionalProperties: false,
} as const);

export const createEvidenceEvaluationSchema = () => ({
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['pass', 'table_only', 'reject'] },
    reasoning: { type: 'string', description: 'One sentence explaining the decision.' },
    chartWorthy: { type: 'boolean', description: 'Whether a chart would add value beyond a data table.' },
  },
  required: ['decision', 'reasoning', 'chartWorthy'],
  additionalProperties: false,
} as const);

export const createToolCreatePlanSchema = (columnNames: string[]) => ({
  oneOf: [
    createSqlAnalysisPlanSchema(columnNames),
    createPlanSchema(columnNames),
  ],
  description: 'Return either a SQL-first plan with queryMode/query/bindings or a classic executable plan with groupByColumn/valueColumn bindings. Do not return visualization-only fields without executable bindings.',
} as const);
