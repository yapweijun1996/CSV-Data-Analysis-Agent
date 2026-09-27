/**
 * Analysis skill executors (pivot, period compare, cohort, root cause, statistical).
 * Utilities and result builders extracted to analysisUtilities.ts and analysisResultBuilders.ts.
 */

import type {
    AnalysisArtifactMetadata,
    AnalysisPlan,
    CohortRetentionRequest,
    CsvData,
    CsvRow,
    PeriodCompareRequest,
    PivotMatrixRequest,
    RootCauseBreakdownRequest,
    StatisticalAnalysisRequest,
    ToolExecutionResult,
} from '../../../types';
import type { StoreApi } from '../types';
import { executePlanAndCreateCard } from './cardExecutor';
import { robustParseFloat } from '../../data/dataProfiler';
import { resolveMetricCatalog } from './metricCatalog';
import { getRecommendedPivotChartType } from '../../../utils/chartTypeUtils';
import { resolveColumnName } from '../tools/pivotMatrixSupport';
import { getEffectivePivotMatrixValueColumns, MAX_STACKED_PIVOT_COLUMNS } from '../../../utils/pivotMatrixCharting';
import {
    type Grain,
    type CohortUnit,
    mean,
    median,
    percentile,
    standardDeviation,
    pearsonCorrelation,
    parseDate,
    startOfPeriod,
    shiftPeriod,
    toPeriodKey,
    diffInPeriods,
    compareText,
    formatPercent,
    formatNumber,
    getNumericValues,
    aggregateRows,
    detectCorrelationStrength,
    buildRegression,
    getPivotDimensionValidationError,
    getPivotMetricValidationError,
} from './analysisUtilities';
import {
    buildBlockedResult,
    buildSuccessResult,
    createAnalysisCard,
    appendAnalysisMessage,
} from './analysisResultBuilders';
import { getTranslation } from '../../../utils/localization';
import { evaluatePivotQuality } from './pivotQuality';
import { classifyAnalysisColumnRole, isTimeLikeDimensionColumn } from '../analysisColumnRoles';

const getLang = (store: StoreApi) => store.getState().settings?.language ?? 'English';

const LOG_PREFIX = '[AnalysisSkillExecutor]';
const DEFAULT_MATRIX_VALUE_KEY = 'row_total';

const getPivotSemanticContractViolation = (
    request: PivotMatrixRequest,
    store: StoreApi,
): string | null => {
    const state = store.getState();
    const columns = state.columnProfiles ?? [];
    if (columns.length === 0) {
        return null;
    }

    const steering = state.activeAnalysisSession?.analysisSteering
        ?? state.latestAnalysisSession?.analysisSteering
        ?? null;
    const blockedDimensions = new Set([
        ...(steering?.blockedDimensions ?? steering?.blockGroupBy ?? []),
        ...(steering?.softDeprioritizeGroupBy ?? []),
    ]);
    const blockedMetrics = new Set(steering?.blockedMetrics ?? []);
    const columnRoles = steering?.columnRoles ?? {};
    const columnByName = new Map(columns.map(column => [column.name, column] as const));

    for (const dimension of [...request.rows, ...(request.columns ?? [])]) {
        if (blockedDimensions.has(dimension)) {
            return `Pivot dimension "${dimension}" is blocked by the analysis semantic contract.`;
        }
        const column = columnByName.get(dimension);
        if (!column) {
            continue;
        }
        const role = columnRoles[dimension] ?? classifyAnalysisColumnRole(column, columns);
        if (role !== 'business_dimension') {
            return `Pivot dimension "${dimension}" is not a business-safe analysis dimension.`;
        }
    }

    const metric = request.metric?.trim();
    if (!metric) {
        return null;
    }
    if (blockedMetrics.has(metric) || isTimeLikeDimensionColumn(metric)) {
        return `Pivot metric "${metric}" is blocked by the analysis semantic contract.`;
    }
    const metricColumn = columnByName.get(metric);
    if (!metricColumn) {
        return null;
    }
    const metricRole = columnRoles[metric] ?? classifyAnalysisColumnRole(metricColumn, columns);
    if (metricRole !== 'business_metric') {
        return `Pivot metric "${metric}" is not a business-safe analysis metric.`;
    }

    return null;
};

export const executeStatisticalAnalysis = async (
    request: StatisticalAnalysisRequest,
    store: StoreApi,
): Promise<ToolExecutionResult> => {
    const { csvData } = store.getState();
    if (!csvData) {
        return buildBlockedResult('analysis.correlation', 'No dataset is loaded for statistical analysis.');
    }

    if (request.analysisType === 'correlation' || request.analysisType === 'simple_regression') {
        if (!request.columnA || !request.columnB) {
            return buildBlockedResult('analysis.correlation', 'Correlation-style analysis requires both columnA and columnB.');
        }

        const xValues: number[] = [];
        const yValues: number[] = [];
        csvData.data.forEach(row => {
            const xValue = robustParseFloat(row[request.columnA!]);
            const yValue = robustParseFloat(row[request.columnB!]);
            if (xValue !== null && yValue !== null) {
                xValues.push(xValue);
                yValues.push(yValue);
            }
        });

        if (xValues.length < 3) {
            return buildBlockedResult('analysis.correlation', `Not enough valid numeric pairs were found for "${request.columnA}" and "${request.columnB}".`);
        }

        const correlation = pearsonCorrelation(xValues, yValues);
        const regression = buildRegression(xValues, yValues);
        const card = await executePlanAndCreateCard({
            chartType: 'scatter',
            title: request.title,
            description: request.description,
            xValueColumn: request.columnA,
            yValueColumn: request.columnB,
            artifactType: request.analysisType === 'simple_regression' ? 'simple_regression' : 'trend_line',
            artifactMetadata: {
                artifactType: request.analysisType === 'simple_regression' ? 'simple_regression' : 'trend_line',
                narrative: `r=${correlation.toFixed(3)}, slope=${regression.slope.toFixed(3)}, intercept=${regression.intercept.toFixed(3)}`,
            },
        }, csvData as CsvData, store);

        if (!card) {
            return buildBlockedResult('analysis.correlation', `Unable to create the ${request.analysisType} card.`);
        }

        const analysisTypeLabel = getTranslation(
            request.analysisType === 'simple_regression' ? 'skill_correlation_type_regression' : 'skill_correlation_type_correlation',
            getLang(store),
        );
        appendAnalysisMessage(
            store,
            getTranslation('skill_correlation_complete', getLang(store), {
                analysisType: analysisTypeLabel,
                columnA: request.columnA,
                columnB: request.columnB,
                correlation: correlation.toFixed(3),
                strength: detectCorrelationStrength(correlation),
                slope: regression.slope.toFixed(3),
            }),
            card.id,
        );

        return buildSuccessResult({
            toolName: 'analysis.correlation',
            card,
            message: `Created ${request.analysisType} analysis card.`,
            artifactMetadata: {
                artifactType: request.analysisType === 'simple_regression' ? 'simple_regression' : 'trend_line',
                narrative: `r=${correlation.toFixed(3)}, slope=${regression.slope.toFixed(3)}, intercept=${regression.intercept.toFixed(3)}`,
            },
            detail: {
                analysisType: request.analysisType,
                correlation,
                slope: regression.slope,
                intercept: regression.intercept,
            },
        });
    }

    if (request.analysisType === 'distribution') {
        if (!request.column) {
            return buildBlockedResult('analysis.correlation', 'Distribution analysis requires a numeric column.');
        }
        const values = getNumericValues(csvData.data, request.column);
        if (values.length < 5) {
            return buildBlockedResult('analysis.correlation', `Not enough valid numeric values were found for "${request.column}".`);
        }

        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const binCount = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(values.length))));
        const range = maxValue - minValue || 1;
        const binSize = range / binCount;
        const bins = Array.from({ length: binCount }, (_, index) => ({
            label: `${(minValue + (index * binSize)).toFixed(2)} - ${(minValue + ((index + 1) * binSize)).toFixed(2)}`,
            count: 0,
        }));

        values.forEach(value => {
            const rawIndex = Math.floor((value - minValue) / binSize);
            const safeIndex = Math.min(binCount - 1, Math.max(0, rawIndex));
            bins[safeIndex]!.count += 1;
        });

        const chartRows = bins.map(bin => ({
            bin: bin.label,
            frequency: bin.count,
        }));

        const card = await createAnalysisCard({
            plan: {
                chartType: 'bar',
                title: request.title,
                description: request.description,
                groupByColumn: 'bin',
                valueColumn: 'frequency',
                aggregation: 'count',
                artifactType: 'distribution',
                artifactMetadata: {
                    artifactType: 'distribution',
                    narrative: `Mean ${formatNumber(mean(values))}, median ${formatNumber(median(values))}, std dev ${formatNumber(standardDeviation(values))}.`,
                },
            },
            data: chartRows,
            store,
        });

        appendAnalysisMessage(
            store,
            getTranslation('skill_distribution_complete', getLang(store), {
                column: request.column!,
                mean: formatNumber(mean(values)),
                median: formatNumber(median(values)),
                stddev: formatNumber(standardDeviation(values)),
            }),
            card.id,
        );

        return buildSuccessResult({
            toolName: 'analysis.correlation',
            card,
            message: 'Created distribution analysis card.',
            artifactMetadata: {
                artifactType: 'distribution',
                narrative: `Mean ${formatNumber(mean(values))}, median ${formatNumber(median(values))}, std dev ${formatNumber(standardDeviation(values))}.`,
            },
        });
    }

    if (request.analysisType === 'outlier_scan') {
        if (!request.column) {
            return buildBlockedResult('analysis.correlation', 'Outlier scan requires a numeric column.');
        }
        const numericRows = csvData.data
            .map((row, index) => ({
                index,
                value: robustParseFloat(row[request.column!]),
            }))
            .filter((row): row is { index: number; value: number } => row.value !== null && Number.isFinite(row.value));

        if (numericRows.length < 8) {
            return buildBlockedResult('analysis.correlation', `Not enough valid numeric values were found for "${request.column}" to run outlier detection.`);
        }

        const values = numericRows.map(row => row.value);
        const avg = mean(values);
        const stdDev = standardDeviation(values);
        if (stdDev === 0) {
            return buildBlockedResult('analysis.correlation', `Column "${request.column}" has zero variance, so outlier detection is not meaningful.`);
        }

        const outliers = numericRows
            .map(({ index, value }) => ({
                row_index: index,
                value,
                z_score: (value - avg) / stdDev,
            }))
            .filter(row => Math.abs(row.z_score) >= 2.5)
            .sort((left, right) => Math.abs(right.z_score) - Math.abs(left.z_score))
            .slice(0, 15);

        if (outliers.length === 0) {
            return buildBlockedResult('analysis.correlation', `No material outliers were detected for "${request.column}" at the configured threshold.`);
        }

        const card = await createAnalysisCard({
            plan: {
                chartType: 'bar',
                title: request.title,
                description: request.description,
                groupByColumn: 'row_index',
                valueColumn: 'z_score',
                aggregation: 'avg',
                artifactType: 'outlier_scan',
                artifactMetadata: {
                    artifactType: 'outlier_scan',
                    dataTableFirst: true,
                    narrative: `Detected ${outliers.length} outliers using |z| >= 2.5.`,
                },
                defaultDataVisible: false,
                disableTopNControls: true,
            },
            data: outliers,
            store,
        });

        appendAnalysisMessage(
            store,
            getTranslation('skill_outlier_complete', getLang(store), {
                column: request.column!,
                count: outliers.length,
            }),
            card.id,
        );

        return buildSuccessResult({
            toolName: 'analysis.correlation',
            card,
            message: 'Created outlier scan card.',
            artifactMetadata: {
                artifactType: 'outlier_scan',
                dataTableFirst: true,
                narrative: `Detected ${outliers.length} outliers using |z| >= 2.5.`,
            },
        });
    }

    if (request.analysisType === 'trend_line') {
        if (!request.dateColumn || !request.valueColumn) {
            return buildBlockedResult('analysis.correlation', 'Trend analysis requires both dateColumn and valueColumn.');
        }

        const periodMap = new Map<string, CsvRow[]>();
        csvData.data.forEach(row => {
            const parsedDate = parseDate(row[request.dateColumn!]);
            if (!parsedDate) {
                return;
            }
            const periodKey = toPeriodKey(parsedDate, 'month');
            const bucket = periodMap.get(periodKey) ?? [];
            bucket.push(row);
            periodMap.set(periodKey, bucket);
        });

        const trendRows = [...periodMap.entries()]
            .sort(([left], [right]) => compareText(left, right))
            .map(([period, rows]) => ({
                period,
                value: aggregateRows(rows, 'sum', request.valueColumn) ?? 0,
            }));

        if (trendRows.length < 2) {
            return buildBlockedResult('analysis.correlation', `Not enough dated rows were found for "${request.dateColumn}" to build a trend.`);
        }

        const card = await createAnalysisCard({
            plan: {
                chartType: 'line',
                title: request.title,
                description: request.description,
                groupByColumn: 'period',
                valueColumn: 'value',
                aggregation: 'sum',
                artifactType: 'trend_line',
                artifactMetadata: {
                    artifactType: 'trend_line',
                    narrative: `Trend built across ${trendRows.length} monthly buckets.`,
                },
            },
            data: trendRows,
            store,
        });

        appendAnalysisMessage(store, getTranslation('skill_trend_complete', getLang(store), { count: trendRows.length }), card.id);

        return buildSuccessResult({
            toolName: 'analysis.correlation',
            card,
            message: 'Created trend analysis card.',
            artifactMetadata: {
                artifactType: 'trend_line',
                narrative: `Trend built across ${trendRows.length} monthly buckets.`,
            },
        });
    }

    return buildBlockedResult('analysis.correlation', `Unsupported analysis type: ${request.analysisType}`);
};

export const executePivotMatrixAnalysis = async (
    request: PivotMatrixRequest,
    store: StoreApi,
): Promise<ToolExecutionResult> => {
    // Prefer canonical dataset (fact rows only) to avoid double-counting subtotals.
    const state = store.getState();
    const { canonicalCsvData, csvData: cleanData } = state;
    const csvData = canonicalCsvData ?? cleanData;
    if (!csvData) {
        return buildBlockedResult('analysis.pivot_matrix', 'No dataset is loaded for pivot analysis.');
    }

    // Resolve column names with whitespace normalization (e.g., AI sends single space, actual has double space).
    const availableCols = csvData.data.length > 0 ? Object.keys(csvData.data[0]) : [];
    request = {
        ...request,
        rows: request.rows.map(r => resolveColumnName(r, availableCols)),
        columns: request.columns?.map(c => resolveColumnName(c, availableCols)),
        metric: request.metric ? resolveColumnName(request.metric, availableCols) : request.metric,
    };

    const metricColumn = request.metric?.trim() || undefined;
    const dimensionValidationError = getPivotDimensionValidationError(request, csvData);
    if (dimensionValidationError) {
        return buildBlockedResult('analysis.pivot_matrix', dimensionValidationError, 'Use real dataset columns for the pivot rows and columns.', {
            code: 'validation_failed',
            detail: {
                reason: 'invalid_pivot_dimension',
                rows: request.rows,
                columns: request.columns ?? [],
            },
        });
    }
    const metricValidationError = getPivotMetricValidationError(request, csvData);
    if (metricValidationError) {
        return buildBlockedResult('analysis.pivot_matrix', metricValidationError, undefined, {
            code: 'validation_failed',
            detail: {
                metric: request.metric ?? null,
                aggregate: request.aggregate,
            },
        });
    }
    const semanticContractViolation = getPivotSemanticContractViolation(request, store);
    if (semanticContractViolation) {
        return buildBlockedResult('analysis.pivot_matrix', semanticContractViolation, 'Use business-safe dimensions and metrics selected by the runtime analysis steering.', {
            code: 'validation_failed',
            detail: {
                rows: request.rows,
                columns: request.columns ?? [],
                metric: request.metric ?? null,
            },
        });
    }

    const steering = state.activeAnalysisSession?.analysisSteering
        ?? state.latestAnalysisSession?.analysisSteering
        ?? null;
    const detailRowFilter = steering?.detailRowFilter
        ?? (steering?.detailRowColumn && steering.detailRowValue
            ? { column: steering.detailRowColumn, value: steering.detailRowValue }
            : null);
    const pivotInputRows = detailRowFilter
        ? csvData.data.filter(row => String(row[detailRowFilter.column] ?? '').trim().toLowerCase()
            === detailRowFilter.value.trim().toLowerCase())
        : csvData.data;

    if (detailRowFilter && pivotInputRows.length === 0) {
        return buildBlockedResult(
            'analysis.pivot_matrix',
            `The required detail-row filter ${detailRowFilter.column} = ${detailRowFilter.value} matched no rows.`,
            'Refresh the analysis steering before retrying the pivot so subtotal rows are not aggregated.',
            {
                code: 'empty_result',
                detail: {
                    reason: 'detail_row_filter_empty',
                    detailRowFilter,
                },
            },
        );
    }

    const rowMap = new Map<string, Map<string, CsvRow[]>>();
    const columnKeys = new Set<string>();
    const columnDimensionColumns = request.columns ?? [];
    const hasColumnDimension = columnDimensionColumns.length > 0;

    pivotInputRows.forEach(row => {
        const rowKey = request.rows.map(column => String(row[column] ?? 'Unknown')).join(' / ') || 'Unknown';
        const columnKey = hasColumnDimension
            ? columnDimensionColumns.map(column => String(row[column] ?? 'Unknown')).join(' / ')
            : 'Value';
        const rowBucket = rowMap.get(rowKey) ?? new Map<string, CsvRow[]>();
        const cellRows = rowBucket.get(columnKey) ?? [];
        cellRows.push(row);
        rowBucket.set(columnKey, cellRows);
        rowMap.set(rowKey, rowBucket);
        if (hasColumnDimension) {
            columnKeys.add(columnKey);
        }
    });

    const orderedColumnKeys = hasColumnDimension ? [...columnKeys].sort(compareText) : [];
    const matrixRows = [...rowMap.entries()].map(([rowLabel, columnMap]) => {
        const resultRow: CsvRow = { row_label: rowLabel };
        let rowTotal: number | null = null;

        if (hasColumnDimension) {
            orderedColumnKeys.forEach(columnKey => {
                const aggregatedValue = aggregateRows(columnMap.get(columnKey) ?? [], request.aggregate, metricColumn);
                resultRow[columnKey] = aggregatedValue;
                if (typeof aggregatedValue === 'number') {
                    rowTotal = (rowTotal ?? 0) + aggregatedValue;
                }
            });
        } else {
            const rowValues = [...columnMap.values()].flat();
            rowTotal = aggregateRows(rowValues, request.aggregate, metricColumn);
        }

        resultRow[DEFAULT_MATRIX_VALUE_KEY] = rowTotal;
        return resultRow;
    });

    matrixRows.sort((left, right) => {
        if (request.sort?.by === 'label') {
            return request.sort.direction === 'desc'
                ? compareText(right.row_label, left.row_label)
                : compareText(left.row_label, right.row_label);
        }
        const leftTotal = robustParseFloat(left[DEFAULT_MATRIX_VALUE_KEY]) ?? 0;
        const rightTotal = robustParseFloat(right[DEFAULT_MATRIX_VALUE_KEY]) ?? 0;
        return request.sort?.direction === 'asc' ? leftTotal - rightTotal : rightTotal - leftTotal;
    });

    const limitedRows = request.topN && request.topN > 0 ? matrixRows.slice(0, request.topN) : matrixRows;
    if (limitedRows.length === 0) {
        return buildBlockedResult('analysis.pivot_matrix', 'The pivot request did not produce any rows.', 'Use a broader slice or a different row/column combination.', {
            code: 'empty_result',
            detail: {
                rows: request.rows,
                columns: request.columns ?? [],
            },
        });
    }

    const matrixColumns = hasColumnDimension
        ? ['row_label', ...orderedColumnKeys, DEFAULT_MATRIX_VALUE_KEY]
        : ['row_label', DEFAULT_MATRIX_VALUE_KEY];
    const matrixValueColumns = hasColumnDimension ? orderedColumnKeys : [];
    const pivotArtifactMetadata: AnalysisArtifactMetadata = {
        artifactType: 'pivot_matrix',
        dataTableFirst: true,
        matrixColumns,
        matrixValueColumns,
        matrixRowLabel: request.rows.join(' / '),
        matrixColumnLabel: columnDimensionColumns.length > 0 ? columnDimensionColumns.join(' / ') : undefined,
        matrixMetricLabel: metricColumn ?? (request.aggregate === 'count' ? 'Count' : undefined),
        narrative: `Pivoted ${request.rows.join(', ')} by ${request.columns?.join(', ') || 'all rows'} with ${request.aggregate}.`,
    };
    const pivotChartPlan: AnalysisPlan = {
        chartType: 'bar',
        title: request.title,
        description: request.description,
        artifactType: 'pivot_matrix',
        groupByColumn: 'row_label',
        valueColumn: DEFAULT_MATRIX_VALUE_KEY,
        aggregation: 'sum',
        preFilter: detailRowFilter
            ? [{ column: detailRowFilter.column, operator: 'eq', value: detailRowFilter.value }]
            : undefined,
        artifactMetadata: pivotArtifactMetadata,
    };
    const effectiveMatrixValueColumnCount = hasColumnDimension
        ? getEffectivePivotMatrixValueColumns(pivotChartPlan, limitedRows).length
        : 0;
    const pivotQuality = evaluatePivotQuality({
        rows: limitedRows,
        matrixValueColumns,
        requestedColumnDimensions: columnDimensionColumns,
    });
    if (pivotQuality.status === 'blocked') {
        // A requested column dimension can collapse to one effective value. In
        // that case the evidence is still a valid grouping of the requested
        // metric, but it is not a useful matrix. Preserve that metric and
        // collapse to a single-series grouped card. Never substitute unrelated
        // sibling numeric columns under the original metric title.
        if (pivotQuality.code === 'flat_metric') {
            const safeRows = limitedRows.map(row => ({
                row_label: row.row_label,
                [DEFAULT_MATRIX_VALUE_KEY]: row[DEFAULT_MATRIX_VALUE_KEY],
            }));
            const safeMetadata: AnalysisArtifactMetadata = {
                ...pivotArtifactMetadata,
                matrixColumns: ['row_label', DEFAULT_MATRIX_VALUE_KEY],
                matrixValueColumns: [],
                matrixColumnLabel: undefined,
                narrative: `The requested ${columnDimensionColumns.join(', ')} pivot collapsed to one effective value, so the card preserves ${request.aggregate}(${metricColumn ?? 'rows'}) grouped by ${request.rows.join(', ')}.`,
            };
            const card = await createAnalysisCard({
                plan: {
                    chartType: 'bar',
                    title: request.title,
                    description: request.description,
                    groupByColumn: 'row_label',
                    valueColumn: DEFAULT_MATRIX_VALUE_KEY,
                    aggregation: 'sum',
                    preFilter: detailRowFilter
                        ? [{ column: detailRowFilter.column, operator: 'eq', value: detailRowFilter.value }]
                        : undefined,
                    artifactType: 'pivot_matrix',
                    artifactMetadata: safeMetadata,
                    defaultDataVisible: false,
                    defaultTopN: request.topN && request.topN > 0 ? request.topN : 8,
                    defaultHideOthers: true,
                    disableTopNControls: false,
                },
                data: safeRows,
                store,
            });
            appendAnalysisMessage(
                store,
                getTranslation('skill_pivot_complete', getLang(store), {
                    rows: request.rows.join(' / '),
                    columnCount: 1,
                }),
                card.id,
            );
            return buildSuccessResult({
                toolName: 'analysis.pivot_matrix',
                card,
                message: 'Created a single-metric grouped card because the requested pivot column did not vary.',
                artifactMetadata: safeMetadata,
            });
        }

        return buildBlockedResult(
            'analysis.pivot_matrix',
            pivotQuality.message ?? 'The pivot request did not produce a usable matrix.',
            'Try a different row/column pairing, or use analysis.create_plan for a normal grouped card.',
            {
                code: pivotQuality.code,
                detail: pivotQuality.detail,
            },
        );
    }
    pivotArtifactMetadata.effectiveMatrixValueColumnCount = effectiveMatrixValueColumnCount;
    pivotArtifactMetadata.recommendedTotalOnlyDueToWideColumns = effectiveMatrixValueColumnCount > MAX_STACKED_PIVOT_COLUMNS;
    pivotArtifactMetadata.defaultCompressedStackedView = effectiveMatrixValueColumnCount > MAX_STACKED_PIVOT_COLUMNS;
    const defaultPivotChartType = hasColumnDimension
        ? getRecommendedPivotChartType(pivotChartPlan, limitedRows)
        : 'bar';

    const card = await createAnalysisCard({
        plan: {
            chartType: defaultPivotChartType,
            title: request.title,
            description: request.description,
            groupByColumn: 'row_label',
            valueColumn: DEFAULT_MATRIX_VALUE_KEY,
            aggregation: 'sum',
            preFilter: detailRowFilter
                ? [{ column: detailRowFilter.column, operator: 'eq', value: detailRowFilter.value }]
                : undefined,
            artifactType: 'pivot_matrix',
            artifactMetadata: pivotArtifactMetadata,
            defaultDataVisible: false,
            defaultTopN: request.topN && request.topN > 0 ? request.topN : 8,
            defaultHideOthers: true,
            disableTopNControls: false,
        },
        data: limitedRows,
        store,
    });

    appendAnalysisMessage(
        store,
        getTranslation('skill_pivot_complete', getLang(store), {
            rows: request.rows.join(' / '),
            columnCount: orderedColumnKeys.length,
        }),
        card.id,
    );

    return buildSuccessResult({
        toolName: 'analysis.pivot_matrix',
        card,
        message: 'Created pivot matrix card.',
        artifactMetadata: {
            ...pivotArtifactMetadata,
        },
    });
};

const buildSegmentLabel = (row: CsvRow, segmentColumns: string[] | undefined, fallback = 'All Rows') => {
    if (!segmentColumns?.length) {
        return fallback;
    }
    return segmentColumns.map(column => `${column}: ${String(row[column] ?? 'Unknown')}`).join(' | ');
};

export const executePeriodCompareAnalysis = async (
    request: PeriodCompareRequest,
    store: StoreApi,
): Promise<ToolExecutionResult> => {
    const { csvData } = store.getState();
    if (!csvData) {
        return buildBlockedResult('analysis.period_compare', 'No dataset is loaded for period comparison.');
    }

    const segmentPeriodRows = new Map<string, Map<string, CsvRow[]>>();
    const periodStarts = new Map<string, Date>();

    csvData.data.forEach(row => {
        const parsedDate = parseDate(row[request.dateColumn]);
        if (!parsedDate) {
            return;
        }
        const periodStart = startOfPeriod(parsedDate, request.grain);
        const periodKey = toPeriodKey(parsedDate, request.grain);
        const segmentLabel = buildSegmentLabel(row, request.segmentColumns);
        const segmentBuckets = segmentPeriodRows.get(segmentLabel) ?? new Map<string, CsvRow[]>();
        const bucketRows = segmentBuckets.get(periodKey) ?? [];
        bucketRows.push(row);
        segmentBuckets.set(periodKey, bucketRows);
        segmentPeriodRows.set(segmentLabel, segmentBuckets);
        periodStarts.set(periodKey, periodStart);
    });

    const orderedPeriods = [...periodStarts.entries()].sort((left, right) => left[1].getTime() - right[1].getTime());
    const currentEntry = orderedPeriods.at(-1);
    if (!currentEntry) {
        return buildBlockedResult('analysis.period_compare', `No valid dates were found in "${request.dateColumn}".`);
    }

    const currentPeriod = currentEntry[0];
    const previousPeriod = request.comparisonMode === 'previous_year'
        ? toPeriodKey(shiftPeriod(currentEntry[1], 'year', -1), request.grain)
        : orderedPeriods.at(-2)?.[0] ?? null;

    if (!previousPeriod) {
        return buildBlockedResult('analysis.period_compare', 'At least two comparison periods are required to build a period comparison.');
    }

    const comparisonRows = [...segmentPeriodRows.entries()]
        .map(([segmentLabel, buckets]) => {
            const currentValue = aggregateRows(buckets.get(currentPeriod) ?? [], request.aggregate, request.metricColumn);
            const previousValue = aggregateRows(buckets.get(previousPeriod) ?? [], request.aggregate, request.metricColumn);
            const safeCurrent = currentValue ?? 0;
            const safePrevious = previousValue ?? 0;
            const variance = safeCurrent - safePrevious;
            const variancePct = safePrevious === 0 ? null : variance / Math.abs(safePrevious);
            return {
                segment_label: segmentLabel,
                current_period: currentPeriod,
                previous_period: previousPeriod,
                current_value: safeCurrent,
                previous_value: safePrevious,
                variance,
                variance_pct: variancePct,
            };
        })
        .sort((left, right) => Math.abs((right.variance as number) ?? 0) - Math.abs((left.variance as number) ?? 0));

    const limitedRows = request.topN && request.topN > 0 ? comparisonRows.slice(0, request.topN) : comparisonRows;
    if (limitedRows.length === 0) {
        return buildBlockedResult('analysis.period_compare', 'The period comparison did not produce any rows.');
    }

    const totalCurrent = limitedRows.reduce((sum, row) => sum + (row.current_value || 0), 0);
    const totalPrevious = limitedRows.reduce((sum, row) => sum + (row.previous_value || 0), 0);
    const totalVariancePct = totalPrevious === 0 ? null : (totalCurrent - totalPrevious) / Math.abs(totalPrevious);

    const card = await createAnalysisCard({
        plan: {
            chartType: 'bar',
            title: request.title,
            description: request.description,
            groupByColumn: 'segment_label',
            valueColumn: 'variance',
            aggregation: 'sum',
            artifactType: 'period_compare',
            artifactMetadata: {
                artifactType: 'period_compare',
                dataTableFirst: true,
                comparisonMetricColumns: ['current_value', 'previous_value', 'variance', 'variance_pct'],
                narrative: `Compared ${currentPeriod} vs ${previousPeriod}. Total variance ${formatNumber(totalCurrent - totalPrevious)} (${formatPercent(totalVariancePct)}).`,
            },
            defaultDataVisible: false,
            disableTopNControls: true,
        },
        data: limitedRows,
        store,
    });

    appendAnalysisMessage(
        store,
        getTranslation('skill_period_compare_complete', getLang(store), {
            current: currentPeriod,
            previous: previousPeriod,
            variance: formatNumber(totalCurrent - totalPrevious),
            variancePct: formatPercent(totalVariancePct),
        }),
        card.id,
    );

    return buildSuccessResult({
        toolName: 'analysis.period_compare',
        card,
        message: 'Created period comparison card.',
        artifactMetadata: {
            artifactType: 'period_compare',
            dataTableFirst: true,
            comparisonMetricColumns: ['current_value', 'previous_value', 'variance', 'variance_pct'],
            narrative: `Compared ${currentPeriod} vs ${previousPeriod}. Total variance ${formatNumber(totalCurrent - totalPrevious)} (${formatPercent(totalVariancePct)}).`,
        },
        detail: {
            currentPeriod,
            previousPeriod,
        },
    });
};


export const executeCohortRetentionAnalysis = async (
    request: CohortRetentionRequest,
    store: StoreApi,
): Promise<ToolExecutionResult> => {
    const { csvData, columnProfiles } = store.getState();
    if (!csvData) {
        return buildBlockedResult('analysis.cohort_retention', 'No dataset is loaded for cohort analysis.');
    }

    const columns = columnProfiles.map(profile => profile.name);
    const resolution = resolveMetricCatalog(columns, request);
    if (resolution.blockers.length > 0) {
        return buildBlockedResult(
            'analysis.cohort_retention',
            resolution.blockers.join(' '),
            'Provide stable signup date, activity date, and user id columns before running cohort retention.',
        );
    }

    const activityDateColumn = request.dateColumn ?? resolution.resolvedFields.date;
    const userIdColumn = request.userIdColumn ?? resolution.resolvedFields.user_id;
    const signupDateColumn = request.signupDateColumn ?? resolution.resolvedFields.user_signup_date;
    const segmentColumn = request.segmentColumn ?? resolution.resolvedFields.segment;
    const maxPeriods = Math.max(1, Math.min(request.periods ?? 6, 12));

    if (!activityDateColumn || !userIdColumn || !signupDateColumn) {
        return buildBlockedResult('analysis.cohort_retention', 'Cohort retention requires activity date, signup date, and user id columns.');
    }

    const cohortUsers = new Map<string, Set<string>>();
    const retainedUsers = new Map<string, Set<string>>();

    csvData.data.forEach(row => {
        const userId = String(row[userIdColumn] ?? '').trim();
        const activityDate = parseDate(row[activityDateColumn]);
        const signupDate = parseDate(row[signupDateColumn]);
        if (!userId || !activityDate || !signupDate) {
            return;
        }

        const periodIndex = diffInPeriods(signupDate, activityDate, request.timeUnit);
        if (periodIndex < 0 || periodIndex > maxPeriods) {
            return;
        }

        const cohortKey = toPeriodKey(signupDate, request.timeUnit);
        const segmentValue = segmentColumn ? String(row[segmentColumn] ?? 'Unknown') : '';
        const cohortLabel = segmentColumn ? `${cohortKey} | ${segmentValue}` : cohortKey;
        const cohortBucket = cohortUsers.get(cohortLabel) ?? new Set<string>();
        cohortBucket.add(userId);
        cohortUsers.set(cohortLabel, cohortBucket);

        const retainedKey = `${cohortLabel}::${periodIndex}`;
        const retainedBucket = retainedUsers.get(retainedKey) ?? new Set<string>();
        retainedBucket.add(userId);
        retainedUsers.set(retainedKey, retainedBucket);
    });

    const cohortPeriodLabels = Array.from({ length: maxPeriods + 1 }, (_, index) => `period_${index}_rate`);
    const cohortRows = [...cohortUsers.entries()]
        .map(([cohortLabel, users]) => {
            const row: CsvRow = {
                cohort_period: cohortLabel,
                cohort_size: users.size,
            };
            cohortPeriodLabels.forEach((label, index) => {
                const retainedCount = retainedUsers.get(`${cohortLabel}::${index}`)?.size ?? 0;
                const rate = users.size === 0 ? 0 : retainedCount / users.size;
                row[label] = resolution.definition.metricName === 'churn' ? 1 - rate : rate;
            });
            row.latest_retention_rate = row[cohortPeriodLabels[cohortPeriodLabels.length - 1]!] ?? 0;
            return row;
        })
        .sort((left, right) => compareText(left.cohort_period, right.cohort_period));

    if (cohortRows.length === 0) {
        return buildBlockedResult('analysis.cohort_retention', 'The cohort request did not produce any valid cohorts.');
    }

    const card = await createAnalysisCard({
        plan: {
            chartType: 'bar',
            title: request.title,
            description: request.description,
            groupByColumn: 'cohort_period',
            valueColumn: 'latest_retention_rate',
            aggregation: 'avg',
            artifactType: 'cohort_retention',
            artifactMetadata: {
                artifactType: 'cohort_retention',
                dataTableFirst: true,
                cohortPeriods: cohortPeriodLabels,
                narrative: `${resolution.definition.label} analysis across ${cohortRows.length} cohorts.`,
            },
            defaultDataVisible: false,
            disableTopNControls: true,
        },
        data: cohortRows,
        store,
    });

    appendAnalysisMessage(
        store,
        getTranslation('skill_cohort_complete', getLang(store), {
            label: resolution.definition.label,
            count: cohortRows.length,
            maxPeriods,
        }),
        card.id,
    );

    return buildSuccessResult({
        toolName: 'analysis.cohort_retention',
        card,
        message: 'Created cohort retention card.',
        artifactMetadata: {
            artifactType: 'cohort_retention',
            dataTableFirst: true,
            cohortPeriods: cohortPeriodLabels,
            narrative: `${resolution.definition.label} analysis across ${cohortRows.length} cohorts.`,
        },
        detail: {
            metricName: resolution.definition.metricName,
        },
    });
};

export const executeRootCauseBreakdownAnalysis = async (
    request: RootCauseBreakdownRequest,
    store: StoreApi,
): Promise<ToolExecutionResult> => {
    const { csvData } = store.getState();
    if (!csvData) {
        return buildBlockedResult('analysis.root_cause_breakdown', 'No dataset is loaded for root-cause analysis.');
    }

    const dimensionPeriodRows = new Map<string, Map<string, CsvRow[]>>();
    const periodStarts = new Map<string, Date>();

    csvData.data.forEach(row => {
        const parsedDate = parseDate(row[request.dateColumn]);
        if (!parsedDate) {
            return;
        }
        const periodStart = startOfPeriod(parsedDate, request.grain);
        const periodKey = toPeriodKey(parsedDate, request.grain);
        const dimensionLabel = request.dimensionColumns.map(column => `${column}: ${String(row[column] ?? 'Unknown')}`).join(' | ');
        const dimensionBuckets = dimensionPeriodRows.get(dimensionLabel) ?? new Map<string, CsvRow[]>();
        const bucketRows = dimensionBuckets.get(periodKey) ?? [];
        bucketRows.push(row);
        dimensionBuckets.set(periodKey, bucketRows);
        dimensionPeriodRows.set(dimensionLabel, dimensionBuckets);
        periodStarts.set(periodKey, periodStart);
    });

    const orderedPeriods = [...periodStarts.entries()].sort((left, right) => left[1].getTime() - right[1].getTime());
    const currentEntry = orderedPeriods.at(-1);
    if (!currentEntry) {
        return buildBlockedResult('analysis.root_cause_breakdown', `No valid dates were found in "${request.dateColumn}".`);
    }

    const currentPeriod = currentEntry[0];
    const previousPeriod = request.comparisonMode === 'previous_year'
        ? toPeriodKey(shiftPeriod(currentEntry[1], 'year', -1), request.grain)
        : orderedPeriods.at(-2)?.[0] ?? null;

    if (!previousPeriod) {
        return buildBlockedResult('analysis.root_cause_breakdown', 'At least two comparison periods are required for root-cause analysis.');
    }

    const contributorRows = [...dimensionPeriodRows.entries()]
        .map(([dimensionLabel, buckets]) => {
            const currentValue = aggregateRows(buckets.get(currentPeriod) ?? [], request.aggregate, request.metricColumn) ?? 0;
            const previousValue = aggregateRows(buckets.get(previousPeriod) ?? [], request.aggregate, request.metricColumn) ?? 0;
            const variance = currentValue - previousValue;
            return {
                dimension_label: dimensionLabel,
                current_value: currentValue,
                previous_value: previousValue,
                variance,
            };
        });

    const totalVariance = contributorRows.reduce((sum, row) => sum + row.variance, 0);
    const rankedRows = contributorRows
        .map(row => ({
            ...row,
            contribution_pct: totalVariance === 0 ? 0 : row.variance / totalVariance,
        }))
        .sort((left, right) => Math.abs(right.contribution_pct) - Math.abs(left.contribution_pct))
        .slice(0, Math.max(1, Math.min(request.limit ?? 12, 20)));

    if (rankedRows.length === 0) {
        return buildBlockedResult('analysis.root_cause_breakdown', 'The root-cause request did not produce any contributor rows.');
    }

    const card = await createAnalysisCard({
        plan: {
            chartType: 'bar',
            title: request.title,
            description: request.description,
            groupByColumn: 'dimension_label',
            valueColumn: 'contribution_pct',
            aggregation: 'avg',
            artifactType: 'root_cause_breakdown',
            artifactMetadata: {
                artifactType: 'root_cause_breakdown',
                dataTableFirst: true,
                comparisonMetricColumns: ['current_value', 'previous_value', 'variance', 'contribution_pct'],
                narrative: `Explained ${formatNumber(totalVariance)} of total variance across ${rankedRows.length} contributors.`,
            },
            defaultDataVisible: false,
            disableTopNControls: true,
        },
        data: rankedRows,
        store,
    });

    appendAnalysisMessage(
        store,
        getTranslation('skill_root_cause_complete', getLang(store), {
            current: currentPeriod,
            previous: previousPeriod,
            variance: formatNumber(totalVariance),
        }),
        card.id,
    );

    return buildSuccessResult({
        toolName: 'analysis.root_cause_breakdown',
        card,
        message: 'Created root-cause breakdown card.',
        artifactMetadata: {
            artifactType: 'root_cause_breakdown',
            dataTableFirst: true,
            comparisonMetricColumns: ['current_value', 'previous_value', 'variance', 'contribution_pct'],
            narrative: `Explained ${formatNumber(totalVariance)} of total variance across ${rankedRows.length} contributors.`,
        },
        detail: {
            currentPeriod,
            previousPeriod,
            totalVariance,
        },
    });
};
