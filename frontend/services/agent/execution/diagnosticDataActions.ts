/**
 * Executor functions for diagnostic data tools:
 * data.describe, data.value_counts, data.outliers, data.missing
 *
 * Uses the unified SQL harness layer (executeUnifiedQuery) with
 * intent-based templates instead of hardcoded SQL strings.
 */

import type { AiAction, ColumnProfile, ToolExecutionResult } from '../../../types';
import type { StoreApi } from '../types';
import { resolveCurrentDuckDbBinding } from '../datasetBinding';
import { getPreferredAnalysisDataset } from '../reportStructureState';
import { executeUnifiedQuery } from '../../duckdb/unifiedQueryExecutor';
import type { QueryIntent } from '../../duckdb/queryIntent';

const LOG_PREFIX = '[DiagnosticData]';
const QUERY_TIMEOUT_MS = 8000;

const resolveBinding = (store: StoreApi) => {
    const state = store.getState();
    const preferredDataset = getPreferredAnalysisDataset(state);
    const binding = resolveCurrentDuckDbBinding({
        mode: 'analysis',
        csvData: preferredDataset,
        snapshot: state.datasetSemanticSnapshot,
        semanticDatasetVersion: state.semanticDatasetVersion,
        sessionStatus: state.duckDbSessionStatus,
        activeDataQuery: state.activeDataQuery ?? null,
    });
    if (!binding?.tableName) return null;
    return binding;
};

const numericTypes = new Set(['numerical', 'currency', 'percentage']);

const getNumericColumns = (profiles: ColumnProfile[], requested?: string[]) => {
    const numeric = profiles.filter(c => numericTypes.has(c.type));
    if (!requested || requested.length === 0) return numeric;
    return numeric.filter(c => requested.includes(c.name));
};

// --- data.describe ---

export const executeDataDescribeAction = async (
    action: AiAction,
    store: StoreApi,
): Promise<ToolExecutionResult> => {
    const state = store.getState();
    if (action.type !== 'tool_call' || !state.csvData) {
        return { status: 'error', toolName: 'data.describe', message: 'No dataset loaded.', shouldStop: false };
    }
    const binding = resolveBinding(store);
    if (!binding) {
        return { status: 'error', toolName: 'data.describe', message: 'DuckDB binding unavailable.', shouldStop: false };
    }

    const args = action.args ?? {};
    const cols = getNumericColumns(state.columnProfiles, args.columns as string[] | undefined);
    if (cols.length === 0) {
        return { status: 'error', toolName: 'data.describe', message: 'No numeric columns found to describe.', shouldStop: false };
    }

    const intent: QueryIntent = {
        kind: 'describe',
        purpose: `Summary statistics for ${cols.length} numeric column(s)`,
        params: { columns: cols.map(c => c.name) },
        options: { timeout: QUERY_TIMEOUT_MS },
    };

    try {
        const queryResult = await executeUnifiedQuery(intent, {
            binding,
            columnProfiles: state.columnProfiles,
        });

        const explanation = args.explanation || `Summary statistics for ${cols.length} numeric column(s).`;
        console.log(`${LOG_PREFIX} data.describe returned ${queryResult.returnedRows} column stats.`);

        return {
            status: 'success',
            toolName: 'data.describe',
            message: explanation,
            shouldStop: false,
            observation: {
                type: 'tool_result',
                status: 'success',
                summary: `Computed summary statistics for ${queryResult.returnedRows} numeric column(s): ${cols.map(c => c.name).join(', ')}.`,
                toolName: 'data.describe',
                detail: { columns: cols.map(c => c.name), rowCount: queryResult.returnedRows },
            },
            artifacts: {
                activeDataQuery: {
                    explanation,
                    result: {
                        rows: queryResult.rows,
                        totalMatchedRows: queryResult.totalMatchedRows,
                        returnedRows: queryResult.returnedRows,
                        truncated: false,
                        selectedColumns: queryResult.selectedColumns,
                        appliedOrderBy: [],
                        appliedLimit: cols.length,
                        durationMs: queryResult.durationMs,
                    },
                    plan: {},
                },
            },
        };
    } catch (error) {
        return { status: 'error', toolName: 'data.describe', message: `Describe query failed: ${error instanceof Error ? error.message : String(error)}`, shouldStop: false };
    }
};

// --- data.value_counts ---

export const executeDataValueCountsAction = async (
    action: AiAction,
    store: StoreApi,
): Promise<ToolExecutionResult> => {
    const state = store.getState();
    if (action.type !== 'tool_call' || !state.csvData) {
        return { status: 'error', toolName: 'data.value_counts', message: 'No dataset loaded.', shouldStop: false };
    }
    const binding = resolveBinding(store);
    if (!binding) {
        return { status: 'error', toolName: 'data.value_counts', message: 'DuckDB binding unavailable.', shouldStop: false };
    }

    const args = action.args ?? {};
    const column = String(args.column ?? '').trim();
    if (!column) {
        return { status: 'error', toolName: 'data.value_counts', message: '"column" is required.', shouldStop: false, retryHint: 'Provide a column name.' };
    }
    if (!state.columnProfiles.some(c => c.name === column)) {
        return { status: 'error', toolName: 'data.value_counts', message: `Column "${column}" not found.`, shouldStop: false };
    }

    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
    const intent: QueryIntent = {
        kind: 'value_counts',
        purpose: `Value counts for "${column}" (top ${limit})`,
        params: { column, limit },
        options: { timeout: QUERY_TIMEOUT_MS },
    };

    try {
        const queryResult = await executeUnifiedQuery(intent, {
            binding,
            allowedColumns: state.columnProfiles.map(c => c.name),
            columnProfiles: state.columnProfiles,
        });

        const explanation = args.explanation || `Value counts for "${column}" (top ${limit}).`;
        console.log(`${LOG_PREFIX} data.value_counts returned ${queryResult.returnedRows} values for "${column}".`);

        return {
            status: 'success',
            toolName: 'data.value_counts',
            message: explanation,
            shouldStop: false,
            observation: {
                type: 'tool_result',
                status: 'success',
                summary: `Top ${queryResult.returnedRows} values for "${column}".`,
                toolName: 'data.value_counts',
                detail: { column, rowCount: queryResult.returnedRows },
            },
            artifacts: {
                activeDataQuery: {
                    explanation,
                    result: {
                        rows: queryResult.rows,
                        totalMatchedRows: queryResult.totalMatchedRows,
                        returnedRows: queryResult.returnedRows,
                        truncated: false,
                        selectedColumns: queryResult.selectedColumns,
                        appliedOrderBy: [{ column: 'count', direction: 'desc' as const }],
                        appliedLimit: limit,
                        durationMs: queryResult.durationMs,
                    },
                    plan: {},
                },
            },
        };
    } catch (error) {
        return { status: 'error', toolName: 'data.value_counts', message: `Value counts query failed: ${error instanceof Error ? error.message : String(error)}`, shouldStop: false };
    }
};

// --- data.outliers ---

export const executeDataOutliersAction = async (
    action: AiAction,
    store: StoreApi,
): Promise<ToolExecutionResult> => {
    const state = store.getState();
    if (action.type !== 'tool_call' || !state.csvData) {
        return { status: 'error', toolName: 'data.outliers', message: 'No dataset loaded.', shouldStop: false };
    }
    const binding = resolveBinding(store);
    if (!binding) {
        return { status: 'error', toolName: 'data.outliers', message: 'DuckDB binding unavailable.', shouldStop: false };
    }

    const args = action.args ?? {};
    const column = String(args.column ?? '').trim();
    if (!column) {
        return { status: 'error', toolName: 'data.outliers', message: '"column" is required.', shouldStop: false, retryHint: 'Provide a numeric column name.' };
    }
    const profile = state.columnProfiles.find(c => c.name === column);
    if (!profile || !numericTypes.has(profile.type)) {
        return { status: 'error', toolName: 'data.outliers', message: `Column "${column}" is not numeric.`, shouldStop: false };
    }

    const intent: QueryIntent = {
        kind: 'outliers',
        purpose: `IQR outlier detection for "${column}"`,
        params: { column },
        options: { timeout: QUERY_TIMEOUT_MS },
    };

    try {
        const queryResult = await executeUnifiedQuery(intent, {
            binding,
            columnProfiles: state.columnProfiles,
        });

        const explanation = args.explanation || `IQR outlier detection for "${column}".`;
        const statsRow = queryResult.rows[0];
        const q1 = statsRow ? Number(statsRow['__q1']) : 0;
        const q3 = statsRow ? Number(statsRow['__q3']) : 0;
        const iqr = statsRow ? Number(statsRow['__iqr']) : 0;

        console.log(`${LOG_PREFIX} data.outliers found ${queryResult.returnedRows} outlier(s) in "${column}" (Q1=${q1}, Q3=${q3}, IQR=${iqr}).`);

        return {
            status: 'success',
            toolName: 'data.outliers',
            message: explanation,
            shouldStop: false,
            observation: {
                type: 'tool_result',
                status: 'success',
                summary: `Found ${queryResult.returnedRows} outlier(s) in "${column}". Q1=${q1.toFixed(2)}, Q3=${q3.toFixed(2)}, IQR=${iqr.toFixed(2)}, fences=[${(q1 - 1.5 * iqr).toFixed(2)}, ${(q3 + 1.5 * iqr).toFixed(2)}].`,
                toolName: 'data.outliers',
                detail: { column, outlierCount: queryResult.returnedRows, q1, q3, iqr },
            },
            artifacts: {
                activeDataQuery: {
                    explanation,
                    result: {
                        rows: queryResult.rows,
                        totalMatchedRows: queryResult.totalMatchedRows,
                        returnedRows: queryResult.returnedRows,
                        truncated: false,
                        selectedColumns: queryResult.selectedColumns,
                        appliedOrderBy: [],
                        appliedLimit: 50,
                        durationMs: queryResult.durationMs,
                    },
                    plan: {},
                },
            },
        };
    } catch (error) {
        return { status: 'error', toolName: 'data.outliers', message: `Outlier query failed: ${error instanceof Error ? error.message : String(error)}`, shouldStop: false };
    }
};

// --- data.missing ---

export const executeDataMissingAction = async (
    action: AiAction,
    store: StoreApi,
): Promise<ToolExecutionResult> => {
    const state = store.getState();
    if (action.type !== 'tool_call' || !state.csvData) {
        return { status: 'error', toolName: 'data.missing', message: 'No dataset loaded.', shouldStop: false };
    }
    const binding = resolveBinding(store);
    if (!binding) {
        return { status: 'error', toolName: 'data.missing', message: 'DuckDB binding unavailable.', shouldStop: false };
    }

    const args = action.args ?? {};
    const requestedCols = args.columns as string[] | undefined;
    const targetCols = requestedCols && requestedCols.length > 0
        ? state.columnProfiles.filter(c => requestedCols.includes(c.name))
        : state.columnProfiles;

    if (targetCols.length === 0) {
        return { status: 'error', toolName: 'data.missing', message: 'No matching columns found.', shouldStop: false };
    }

    const intent: QueryIntent = {
        kind: 'missing',
        purpose: `Missing data profile for ${targetCols.length} column(s)`,
        params: { columns: targetCols.map(c => c.name) },
        options: { timeout: QUERY_TIMEOUT_MS },
    };

    try {
        const queryResult = await executeUnifiedQuery(intent, {
            binding,
            columnProfiles: state.columnProfiles,
        });

        const explanation = args.explanation || `Missing data profile for ${targetCols.length} column(s).`;
        const issueCount = queryResult.rows.filter(r => Number(r['null_rate']) + Number(r['blank_rate']) > 0.05).length;

        console.log(`${LOG_PREFIX} data.missing profiled ${queryResult.returnedRows} columns, ${issueCount} with >5% missing.`);

        return {
            status: 'success',
            toolName: 'data.missing',
            message: explanation,
            shouldStop: false,
            observation: {
                type: 'tool_result',
                status: 'success',
                summary: `Profiled ${queryResult.returnedRows} column(s). ${issueCount} column(s) have >5% missing values.`,
                toolName: 'data.missing',
                detail: { columnCount: queryResult.returnedRows, issueCount },
            },
            artifacts: {
                activeDataQuery: {
                    explanation,
                    result: {
                        rows: queryResult.rows,
                        totalMatchedRows: queryResult.totalMatchedRows,
                        returnedRows: queryResult.returnedRows,
                        truncated: false,
                        selectedColumns: queryResult.selectedColumns,
                        appliedOrderBy: [],
                        appliedLimit: targetCols.length,
                        durationMs: queryResult.durationMs,
                    },
                    plan: {},
                },
            },
        };
    } catch (error) {
        return { status: 'error', toolName: 'data.missing', message: `Missing data query failed: ${error instanceof Error ? error.message : String(error)}`, shouldStop: false };
    }
};
