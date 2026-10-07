import type { QueryAggregateFunction, ToolManifest, ToolAvailabilityContext } from '../../../../types';
import {
    aggregateTableSchema,
    analysisPlanSchema,
    calculatedColumnSchema,
    cardIdSchema,
    cohortRetentionSchema,
    metricMappingValidationSchema,
    periodCompareSchema,
    pivotMatrixSchema,
    rootCauseBreakdownSchema,
    reviewCardsSchema,
    spreadsheetFilterSchema,
    statisticalAnalysisSchema,
} from '../toolManifestSchemas';
import {
    requireAnalysisCards,
    requireAnalysisStage,
    requireCards,
    requireDataset,
    validateAggregateTable,
    validateCalculatedColumnFormula,
    validateCardId,
} from '../toolManifestSupport';
import {
    datasetHasColumn,
    datasetHasNumericMetricValues,
    pivotAggregateRequiresMetric,
    pivotAggregateRequiresNumericMetric,
    resolveColumnName,
} from '../pivotMatrixSupport';

const queryAggregateFunctions = new Set<QueryAggregateFunction>([
    'count',
    'count_distinct',
    'sum',
    'avg',
    'min',
    'max',
    'median',
    'percentile',
]);

const asQueryAggregateFunction = (value: string): QueryAggregateFunction | null =>
    queryAggregateFunctions.has(value as QueryAggregateFunction)
        ? value as QueryAggregateFunction
        : null;

export const createAnalysisToolManifests = (columnNames: string[]): ToolManifest[] => [
    {
        name: 'analysis.create_plan',
        description: 'Create a new analysis card or chart plan.',
        category: 'analysis',
        risk: 'medium',
        enabledByDefault: true,
        inputSchema: analysisPlanSchema(columnNames),
        groups: ['analysis.plan'],
        promptHints: [
            'Use for new charts/views, not for modifying existing cards.',
            "For text-category scoping, set preFilter: [{ column: 'Description', operator: 'contains', value: 'Cost' }] before using a chart.",
            "For numeric scoping, use canonical operators like preFilter: [{ column: 'Amount', operator: 'gt', value: 0 }].",
            "To exclude multiple values (e.g. hierarchy subtotals), use preFilter: [{ column: 'STAFF NAME', operator: 'not_in', value: ['Hiroshi Fujita', 'CEO'] }]. Every predicate MUST have a non-empty column name and a valid operator. If you cannot construct a valid filter, omit preFilter entirely — do NOT pass an empty or malformed predicate.",
            'If the user asks for profit, margin, or variance and that derived metric is not already present, derive it first with data.mutate or card.add_calculated_column instead of inventing arithmetic inside analysis.create_plan.',
            'Return an executable plan, not a visualization-only sketch. Use either a SQL-first plan with queryMode, query, and bindings, or a classic plan with groupByColumn/valueColumn bindings.',
            'If you are visualizing aliases already produced by data.query, prefer a SQL-first plan that reuses that query output instead of rebuilding a raw-row count chart.',
            'Do not substitute visualization-only aliases such as xAxis, yAxis, metrics, values, columns, or valueColumns for executable bindings.',
        ],
        resultShape: 'Creates a new analysis card.',
        isAvailable: requireAnalysisStage,
        validate: args => args?.plan ? [] : ['"plan" is required.'],
        capabilities: { supportsSoftErrorRecovery: true },
    },
    {
        name: 'analysis.validate_metric_mapping',
        description: 'Validate whether a business metric mapping is stable before deriving or charting it.',
        category: 'analysis',
        risk: 'medium',
        enabledByDefault: true,
        inputSchema: metricMappingValidationSchema(columnNames),
        groups: ['analysis.validate'],
        promptHints: [
            'Use to validate business metric mappings such as profit, margin, variance, budget, or actual before deriving or charting them.',
            'Do not use this tool to directly build a card or mutate the dataset.',
            'If profit, margin, variance, or budget-vs-actual is requested and the metric mapping is not already confirmed, prefer this tool before analysis.create_plan.',
        ],
        resultShape: 'Returns a metric mapping validation artifact with blockers and the recommended next step.',
        isAvailable: requireAnalysisStage,
        validate: args => {
            const errors: string[] = [];
            const validationKind = typeof args?.validationKind === 'string' ? args.validationKind.trim().toLowerCase() : '';
            const metricName = typeof args?.metricName === 'string' ? args.metricName.trim().toLowerCase() : '';
            const baseMetrics = new Set(['revenue', 'cost', 'budget', 'actual']);
            const derivedMetrics = new Set(['profit', 'margin', 'variance']);
            if (!validationKind) {
                errors.push('"validationKind" is required.');
            } else if (!['base', 'derived'].includes(validationKind)) {
                errors.push('"validationKind" must be either "base" or "derived".');
            }
            if (!args?.metricName) {
                errors.push('"metricName" is required.');
            } else if (validationKind === 'base' && !baseMetrics.has(metricName)) {
                errors.push('"metricName" must be one of revenue, cost, budget, or actual when validationKind is "base".');
            } else if (validationKind === 'derived' && !derivedMetrics.has(metricName)) {
                errors.push('"metricName" must be one of profit, margin, or variance when validationKind is "derived".');
            }
            if (args?.proposedMapping?.sourceKind === 'column' && !args?.proposedMapping?.column) {
                errors.push('"proposedMapping.column" is required when sourceKind is "column".');
            }
            if (args?.proposedMapping?.sourceKind === 'row_label') {
                if (!args?.proposedMapping?.labelColumn) {
                    errors.push('"proposedMapping.labelColumn" is required when sourceKind is "row_label".');
                }
                if (!args?.proposedMapping?.valueColumn) {
                    errors.push('"proposedMapping.valueColumn" is required when sourceKind is "row_label".');
                }
            }
            return errors;
        },
    },
    {
        name: 'analysis.correlation',
        description: 'Run a bounded statistical analysis over selected columns.',
        category: 'analysis',
        risk: 'medium',
        enabledByDefault: true,
        inputSchema: statisticalAnalysisSchema(columnNames),
        groups: ['analysis.statistics'],
        promptHints: [
            'Use correlation or simple_regression when the user asks about relationships between two numeric columns.',
            'Use distribution or outlier_scan when the user asks about spread, skew, outliers, or anomalies in one numeric column.',
            'Use trend_line when the user asks about metric change over time and both dateColumn and valueColumn are stable.',
        ],
        resultShape: 'Creates a bounded statistical analysis card.',
        isAvailable: requireAnalysisStage,
        validate: args => args?.analysisType ? [] : ['Correlation analysis payload is required.'],
        capabilities: { piFollowUpCardCreation: true },
    },
    {
        name: 'analysis.pivot_matrix',
        description: 'Create a read-only pivot matrix from the current dataset.',
        category: 'analysis',
        risk: 'medium',
        enabledByDefault: true,
        inputSchema: pivotMatrixSchema(columnNames),
        groups: ['analysis.matrix'],
        promptHints: [
            'Use when the user explicitly asks for a pivot, matrix, crosstab, or two-axis summary table.',
            'This tool is read-only. Do not use data.mutate for pivot-style analysis output.',
            'Prefer a long, query-friendly source dataset and create the matrix as an analysis result.',
            'Always include rows, aggregate, title, and description in the payload.',
            'If aggregate is not count, also include metric and bind it to a real dataset column.',
            'For cross-tabulation, set `columns` (NOT `pivotColumns`) to the dimension whose unique values become matrix columns. Example: `{ rows: ["ProjectCode"], columns: ["Quarter"], metric: "Value", aggregate: "sum" }` produces one column per Quarter.',
            'Without `columns`, the tool produces a single aggregated value per row (no cross-tab). With `columns`, it produces a stacked matrix.',
            'If the user wants conditional comparison (e.g., Revenue vs Cost from the same Value column filtered by Description), prefer `analysis.create_plan` with SQL-first conditional aggregates instead — pivot_matrix cannot filter which column values to include.',
            'Do NOT send extra fields like `matrixValueColumns` or `pivotColumns` — only use the documented properties: rows, columns, metric, aggregate, title, description, topN, sort.',
        ],
        resultShape: 'Creates a pivot-style analysis card with a matrix artifact and a safe fallback chart.',
        capabilities: { piFollowUpCardCreation: true, singleMetricOnly: true, noColumnFilter: true },
        isAvailable: requireAnalysisStage,
        validate: (args, context) => {
            const errors: string[] = [];
            if (!Array.isArray(args?.rows) || args.rows.length === 0) {
                errors.push('"rows" must include at least one row dimension.');
            }
            const rows = Array.isArray(args?.rows) ? args.rows.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
            const columns = Array.isArray(args?.columns) ? args.columns.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];

            // Resolve column names with whitespace normalization (e.g., single vs double space)
            const cn = context.columnNames;
            rows.forEach(rowColumn => {
                if (!context.columnNames.includes(resolveColumnName(rowColumn, cn))) {
                    errors.push(`"rows" ('${rowColumn}') must reference one of [${context.columnNames.join(', ')}].`);
                }
            });
            columns.forEach(columnName => {
                if (!context.columnNames.includes(resolveColumnName(columnName, cn))) {
                    errors.push(`"columns" ('${columnName}') must reference one of [${context.columnNames.join(', ')}].`);
                }
            });

            const aggregate = typeof args?.aggregate === 'string'
                ? args.aggregate.trim()
                : '';
            const resolvedMetric = typeof args?.metric === 'string' ? resolveColumnName(args.metric.trim(), cn) : '';
            const metric = resolvedMetric;

            if (!aggregate) {
                errors.push('"aggregate" is required.');
            }
            const typedAggregate = aggregate ? asQueryAggregateFunction(aggregate) : null;

            if (aggregate && typedAggregate && pivotAggregateRequiresMetric(typedAggregate) && !metric) {
                errors.push(`Pivot ${aggregate} requires a metric column.`);
            }

            if (metric && !context.columnNames.includes(metric)) {
                errors.push(`"metric" ('${metric}') must reference one of [${context.columnNames.join(', ')}].`);
            }

            if (aggregate && metric && typedAggregate && pivotAggregateRequiresNumericMetric(typedAggregate)) {
                if (!datasetHasColumn(context.csvData, metric)) {
                    errors.push(`Metric column "${metric}" was not found in the current dataset.`);
                } else if (!datasetHasNumericMetricValues(context.csvData, metric)) {
                    errors.push(`Metric column "${metric}" contains no numeric values that can be used for pivot ${aggregate}.`);
                }
            }

            return errors;
        },
    },
    {
        name: 'analysis.period_compare',
        description: 'Compare a metric between the latest period and a previous benchmark period.',
        category: 'analysis',
        risk: 'medium',
        enabledByDefault: true,
        inputSchema: periodCompareSchema(columnNames),
        groups: ['analysis.compare'],
        promptHints: [
            'Use when the user asks for period-over-period, YoY, MoM, WoW, variance, or variance percentage analysis.',
            'Require a stable date column and time grain. If those are ambiguous, ask for clarification.',
        ],
        resultShape: 'Creates a comparison table/card with current, previous, variance, and variance percentage.',
        isAvailable: requireAnalysisStage,
        validate: args => args?.dateColumn ? [] : ['"dateColumn" is required.'],
        capabilities: { piFollowUpCardCreation: true },
    },
    {
        name: 'analysis.cohort_retention',
        description: 'Run a bounded cohort retention analysis using catalog-backed metric definitions.',
        category: 'analysis',
        risk: 'medium',
        enabledByDefault: true,
        inputSchema: cohortRetentionSchema(columnNames),
        groups: ['analysis.cohort'],
        promptHints: [
            'Use when the user asks for cohort retention, user retention, new users, or churn.',
            'Prefer catalog-backed field resolution over prompt-only reasoning.',
        ],
        resultShape: 'Creates a cohort retention matrix/card or a structured blocking result when required fields are missing.',
        isAvailable: requireAnalysisStage,
        validate: args => args?.timeUnit ? [] : ['"timeUnit" is required.'],
        capabilities: { piFollowUpCardCreation: true },
    },
    {
        name: 'analysis.root_cause_breakdown',
        description: 'Explain which dimensions contributed most to a metric change between two periods.',
        category: 'analysis',
        risk: 'medium',
        enabledByDefault: true,
        inputSchema: rootCauseBreakdownSchema(columnNames),
        groups: ['analysis.diagnose'],
        promptHints: [
            'Use when the user asks what drove a change, increase, decrease, or variance.',
            'Return contributor rows with current, previous, and contribution columns instead of a generic chart.',
        ],
        resultShape: 'Creates a root-cause contribution card and table.',
        isAvailable: requireAnalysisStage,
        validate: args => Array.isArray(args?.dimensionColumns) && args.dimensionColumns.length > 0 ? [] : ['"dimensionColumns" must include at least one dimension.'],
        capabilities: { piFollowUpCardCreation: true },
    },
    {
        name: 'card.aggregate_table',
        description: 'Reuse an existing card schema to create a quick follow-up aggregate.',
        category: 'card',
        risk: 'medium',
        enabledByDefault: true,
        inputSchema: aggregateTableSchema(columnNames),
        groups: ['card.aggregate'],
        promptHints: ['Prefer this over rewriting the dataset for follow-up comparisons.'],
        resultShape: 'Creates a new derived analysis card.',
        isAvailable: requireAnalysisCards,
        validate: (args, context) => validateAggregateTable(args, context),
    },
    {
        name: 'card.add_calculated_column',
        description: 'Add a derived metric to one existing card only.',
        category: 'card',
        risk: 'medium',
        enabledByDefault: true,
        inputSchema: calculatedColumnSchema,
        groups: ['card.mutate'],
        promptHints: [
            'Use for ratios or percentages on an existing card before mutating the whole dataset.',
            "Only use row-level formulas such as 'Revenue' - 'Cost' or ('Revenue' - 'Cost') / 'Revenue'.",
            'Use this only when the source metrics already exist as columns on the visible card. Do not use it to combine different row labels from a label/value table.',
            'Do not use SQL, SELECT statements, subqueries, or SUM/COUNT/AVG expressions in card.add_calculated_column.',
            'If you need grouped totals, subqueries, or a new derived result set, use data.query instead of card.add_calculated_column.',
        ],
        resultShape: 'Updates one card with a calculated column.',
        isAvailable: requireAnalysisCards,
        validate: (args, context) => [
            ...validateCardId(args?.cardId, context, 'cardId'),
            ...validateCalculatedColumnFormula(args?.formula),
        ],
    },
    {
        name: 'card.delete',
        description: 'Remove one analysis card from the dashboard.',
        category: 'card',
        risk: 'medium',
        enabledByDefault: true,
        inputSchema: cardIdSchema,
        groups: ['card.mutate'],
        promptHints: ['Use when a card is redundant, noisy, or explicitly unwanted.'],
        resultShape: 'Deletes one card from dashboard state.',
        isAvailable: requireAnalysisCards,
        validate: (args, context) => validateCardId(args?.cardId, context, 'cardId'),
    },
    {
        name: 'card.review',
        description: 'Run an AI review over current cards and propose improvements.',
        category: 'card',
        risk: 'medium',
        enabledByDefault: true,
        inputSchema: reviewCardsSchema,
        groups: ['card.review'],
        promptHints: [
            'Use when the user asks for a holistic review of existing cards.',
            'Do not use for raw dataset cleanliness, null-rate, duplicate, useless-column, or schema-quality review requests.',
            'For dataset cleaning reviews, prefer assistant_message from column profiles or data.query for bounded verification.',
        ],
        resultShape: 'Queues review suggestions in chat.',
        isAvailable: requireAnalysisCards,
        validate: (args, context) => {
            if (!Array.isArray(args?.targetCardIds)) return [];
            return args.targetCardIds.every((cardId: string) => context.cardIds.includes(cardId))
                ? []
                : ['"targetCardIds" contains card ids that are not on screen.'];
        },
    },
    {
        name: 'ui.highlight_card',
        description: 'Scroll to and visually highlight an existing card.',
        category: 'ui',
        risk: 'low',
        enabledByDefault: true,
        inputSchema: cardIdSchema,
        groups: ['ui.interaction'],
        promptHints: ['Use only for existing cards.'],
        resultShape: 'Highlights a card in the UI.',
        isAvailable: requireCards,
        validate: (args, context) => validateCardId(args?.cardId, context, 'cardId'),
    },
    {
        name: 'ui.change_chart_type',
        description: 'Change the chart type of an existing card.',
        category: 'ui',
        risk: 'low',
        enabledByDefault: true,
        inputSchema: {
            type: 'object',
            properties: {
                cardId: { type: 'string' },
                newType: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut', 'scatter', 'combo', 'radar', 'bubble'] },
            },
            required: ['cardId', 'newType'],
        },
        groups: ['ui.interaction'],
        promptHints: ['Only use supported chart types.'],
        resultShape: 'Updates card display chart type.',
        isAvailable: requireCards,
        validate: (args, context) => [
            ...validateCardId(args?.cardId, context, 'cardId'),
            ...(args?.newType ? [] : ['"newType" is required.']),
        ],
    },
    {
        name: 'ui.show_card_data',
        description: 'Toggle raw aggregated data visibility on an existing card.',
        category: 'ui',
        risk: 'low',
        enabledByDefault: true,
        inputSchema: {
            type: 'object',
            properties: {
                cardId: { type: 'string' },
                visible: { type: 'boolean' },
            },
            required: ['cardId', 'visible'],
        },
        groups: ['ui.interaction'],
        promptHints: ['Use when the user asks to inspect a card table.'],
        resultShape: 'Shows or hides one card data table.',
        isAvailable: requireCards,
        validate: (args, context) => [
            ...validateCardId(args?.cardId, context, 'cardId'),
            ...(typeof args?.visible === 'boolean' ? [] : ['"visible" must be a boolean.']),
        ],
    },
    {
        name: 'ui.filter_card',
        description: 'Apply an include filter to one existing card.',
        category: 'ui',
        risk: 'low',
        enabledByDefault: true,
        inputSchema: {
            type: 'object',
            properties: {
                cardId: { type: 'string' },
                column: { type: 'string', enum: columnNames },
                values: { type: 'array', items: { type: 'string' } },
            },
            required: ['cardId', 'column', 'values'],
        },
        groups: ['ui.interaction'],
        promptHints: ['Use for targeted visual filtering on one card.'],
        resultShape: 'Updates the filter state on one card.',
        isAvailable: requireCards,
        validate: (args, context) => [
            ...validateCardId(args?.cardId, context, 'cardId'),
            ...(args?.column ? [] : ['"column" is required.']),
            ...(Array.isArray(args?.values) ? [] : ['"values" must be an array.']),
        ],
    },
    {
        name: 'spreadsheet.filter',
        description: 'Apply a temporary raw-data filter in the data explorer.',
        category: 'spreadsheet',
        risk: 'low',
        enabledByDefault: true,
        inputSchema: spreadsheetFilterSchema,
        groups: ['spreadsheet.filter'],
        promptHints: [
            'Use only for simple temporary filtering.',
            'Prefer args.query as a concise text condition such as Description = \'CONSTRUCTION CONTRACT REVENUE\'.',
        ],
        resultShape: 'Filters the data explorer view.',
        isAvailable: requireDataset,
        validate: args => args?.query ? [] : ['"query" is required.'],
    },
];
