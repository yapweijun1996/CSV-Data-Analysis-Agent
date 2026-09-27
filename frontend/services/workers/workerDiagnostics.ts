import type { AnalysisEngine, CorrelationFields, DataQueryResult, DuckDbFallbackStage } from '../../types';
import { buildCorrelationFields } from '../agent/correlation';
import type { StoreApi } from '../agent/types';


export type WorkerFamily = 'data' | 'duckdb' | 'vector';
export type WorkerDiagnosticsPhase = 'success' | 'error' | 'timeout' | 'abort';

export interface WorkerDiagnosticsEntry {
    workerFamily: WorkerFamily;
    task: string;
    phase: WorkerDiagnosticsPhase;
    requestId: number;
    payloadBytes: number;
    resultBytes: number;
    roundTripMs: number;
    handlerMs: number;
    rowCount?: number;
    columnCount?: number;
    returnedRows?: number;
    totalMatchedRows?: number;
    selectedColumnCount?: number;
    truncated?: boolean;
    errorMessage?: string | null;
}

export type WorkerDiagnosticsReporter = (entry: WorkerDiagnosticsEntry) => void;

const TEXT_ENCODER = new TextEncoder();
const LARGE_PAYLOAD_THRESHOLD_BYTES = 256 * 1024;
const SLOW_HANDLER_THRESHOLD_MS = 50;
const ALWAYS_REPORT_TASKS = new Set([
    'data.executeDataQuery',
    'duckdb.executeCompiledQuery',
    'duckdb.loadCleanDataset',
    'duckdb.loadFileDataset',
]);

const getColumnCountFromRows = (rows: unknown[]): number | undefined => {
    const firstRow = rows.find(row => row && typeof row === 'object');
    if (!firstRow || typeof firstRow !== 'object') {
        return undefined;
    }
    return Object.keys(firstRow as Record<string, unknown>).length;
};

const isDataQueryResult = (value: unknown): value is DataQueryResult => {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value as Partial<DataQueryResult>;
    return Array.isArray(candidate.rows)
        && typeof candidate.totalMatchedRows === 'number'
        && typeof candidate.returnedRows === 'number'
        && Array.isArray(candidate.selectedColumns)
        && typeof candidate.truncated === 'boolean';
};

const getPayloadShape = (task: string, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
        return {};
    }
    const candidate = payload as Record<string, unknown>;
    if (Array.isArray(candidate.rows)) {
        return {
            rowCount: candidate.rows.length,
            columnCount: getColumnCountFromRows(candidate.rows),
        };
    }
    if (candidate.data && typeof candidate.data === 'object' && Array.isArray((candidate.data as { data?: unknown[] }).data)) {
        const rows = (candidate.data as { data: unknown[] }).data;
        return {
            rowCount: rows.length,
            columnCount: getColumnCountFromRows(rows),
        };
    }
    if (Array.isArray(candidate.profiles)) {
        return {
            columnCount: candidate.profiles.length,
        };
    }
    if (Array.isArray(candidate.selectedColumns)) {
        return {
            columnCount: candidate.selectedColumns.length,
            selectedColumnCount: candidate.selectedColumns.length,
        };
    }
    if (task === 'executeDataQuery' && candidate.options && typeof candidate.options === 'object') {
        const options = candidate.options as { allowedColumns?: string[] };
        if (Array.isArray(options.allowedColumns)) {
            return {
                columnCount: options.allowedColumns.length,
                selectedColumnCount: options.allowedColumns.length,
            };
        }
    }
    return {};
};

const getResultShape = (result: unknown) => {
    if (isDataQueryResult(result)) {
        return {
            rowCount: result.rows.length,
            columnCount: result.selectedColumns.length,
            returnedRows: result.returnedRows,
            totalMatchedRows: result.totalMatchedRows,
            selectedColumnCount: result.selectedColumns.length,
            truncated: result.truncated,
        };
    }
    if (Array.isArray(result)) {
        return {
            rowCount: result.length,
            columnCount: getColumnCountFromRows(result),
        };
    }
    if (result && typeof result === 'object') {
        const candidate = result as Record<string, unknown>;
        if (Array.isArray(candidate.rows)) {
            return {
                rowCount: candidate.rows.length,
                columnCount: getColumnCountFromRows(candidate.rows),
            };
        }
        if (Array.isArray(candidate.profiles)) {
            return {
                columnCount: candidate.profiles.length,
            };
        }
    }
    return {};
};

export const getWorkerDiagnosticsLabel = (workerFamily: WorkerFamily, task: string) =>
    `${workerFamily}.${task}`;

export const getNowMs = () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

/**
 * Lightweight byte-size estimate that avoids full JSON.stringify.
 * Samples the first row to derive an average row size, then extrapolates.
 * Falls back to JSON.stringify only for small non-array payloads.
 *
 * NOTE: This is dev-only diagnostics. Skip TextEncoder for speed —
 * JSON.stringify().length is a good-enough proxy (UTF-16 length ≈ byte count
 * for ASCII-dominant CSV data).
 */
export const estimateSerializableBytes = (value: unknown): number => {
    try {
        // Fast path: arrays of row objects (the common hot case for query results).
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
            const sampleLen = JSON.stringify(value[0])?.length ?? 100;
            return sampleLen * value.length + 2 + value.length;
        }
        // DataQueryResult-shaped objects: estimate from .rows if present.
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const candidate = value as Record<string, unknown>;
            if (Array.isArray(candidate.rows) && candidate.rows.length > 0) {
                const sampleLen = JSON.stringify(candidate.rows[0])?.length ?? 100;
                return sampleLen * candidate.rows.length + 200;
            }
        }
        // Small or scalar payloads: full stringify is cheap enough.
        const json = JSON.stringify(value);
        return json?.length ?? 0;
    } catch {
        return 0;
    }
};

export const shouldReportWorkerDiagnostics = (entry: WorkerDiagnosticsEntry) =>
    entry.phase !== 'success'
    || ALWAYS_REPORT_TASKS.has(getWorkerDiagnosticsLabel(entry.workerFamily, entry.task))
    || entry.roundTripMs >= SLOW_HANDLER_THRESHOLD_MS
    || entry.payloadBytes >= LARGE_PAYLOAD_THRESHOLD_BYTES
    || entry.resultBytes >= LARGE_PAYLOAD_THRESHOLD_BYTES;

export const reportWorkerDiagnostics = (
    reporter: WorkerDiagnosticsReporter | undefined,
    entry: WorkerDiagnosticsEntry,
) => {
    if (!reporter || !shouldReportWorkerDiagnostics(entry)) {
        return;
    }
    reporter(entry);
};

const formatByteLabel = (value: number) => `${Math.round(value / 1024)}KiB`;

export const createWorkerDiagnosticsTelemetryReporter = (
    store: StoreApi,
    overrides: CorrelationFields = {},
): WorkerDiagnosticsReporter => entry => {
    const state = store.getState();
    const correlation = buildCorrelationFields(state, overrides);
    state.logTelemetryEvent?.({
        stage: 'worker_diagnostics',
        responseType: getWorkerDiagnosticsLabel(entry.workerFamily, entry.task),
        detail: `${entry.phase} in ${Math.round(entry.roundTripMs)}ms (${formatByteLabel(entry.payloadBytes)} -> ${formatByteLabel(entry.resultBytes)})`,
        meta: {
            workerFamily: entry.workerFamily,
            task: entry.task,
            phase: entry.phase,
            workerRequestId: entry.requestId,
            payloadBytes: entry.payloadBytes,
            resultBytes: entry.resultBytes,
            roundTripMs: entry.roundTripMs,
            handlerMs: entry.handlerMs,
            rowCount: entry.rowCount ?? null,
            columnCount: entry.columnCount ?? null,
            returnedRows: entry.returnedRows ?? null,
            totalMatchedRows: entry.totalMatchedRows ?? null,
            selectedColumnCount: entry.selectedColumnCount ?? null,
            truncated: entry.truncated ?? null,
            errorMessage: entry.errorMessage ?? null,
        },
        sessionId: correlation.sessionId,
        datasetId: correlation.datasetId,
        runId: correlation.runId,
        turnId: correlation.turnId,
        stepId: correlation.stepId,
        toolCallId: correlation.toolCallId,
        cleaningRunId: correlation.cleaningRunId,
        requestId: correlation.requestId,
    });
};

export const logQueryStoreCommitDiagnostics = (
    store: StoreApi,
    payload: {
        engine: AnalysisEngine;
        storeCommitMs: number;
        returnedRows: number;
        totalMatchedRows: number;
        selectedColumnCount: number;
        truncated: boolean;
        resultBytes: number;
        fallbackReason?: string | null;
        fallbackStage?: DuckDbFallbackStage | null;
    },
    overrides: CorrelationFields = {},
) => {
    const state = store.getState();
    const correlation = buildCorrelationFields(state, overrides);
    state.logTelemetryEvent?.({
        stage: 'worker_diagnostics',
        responseType: 'query.store_commit',
        detail: `${payload.engine} query state commit in ${Math.round(payload.storeCommitMs)}ms`,
        meta: {
            engine: payload.engine,
            storeCommitMs: payload.storeCommitMs,
            returnedRows: payload.returnedRows,
            totalMatchedRows: payload.totalMatchedRows,
            selectedColumnCount: payload.selectedColumnCount,
            truncated: payload.truncated,
            resultBytes: payload.resultBytes,
            fallbackReason: payload.fallbackReason ?? null,
            fallbackStage: payload.fallbackStage ?? null,
        },
        sessionId: correlation.sessionId,
        datasetId: correlation.datasetId,
        runId: correlation.runId,
        turnId: correlation.turnId,
        stepId: correlation.stepId,
        toolCallId: correlation.toolCallId,
        cleaningRunId: correlation.cleaningRunId,
        requestId: correlation.requestId,
    });
};

export const buildWorkerDiagnosticsEntry = (params: {
    workerFamily: WorkerFamily;
    task: string;
    phase: WorkerDiagnosticsPhase;
    requestId: number;
    payloadBytes: number;
    payload: unknown;
    result: unknown;
    roundTripMs: number;
    handlerMs: number;
    errorMessage?: string | null;
}): WorkerDiagnosticsEntry => {
    const payloadShape = getPayloadShape(params.task, params.payload);
    const resultShape = getResultShape(params.result);
    return {
        workerFamily: params.workerFamily,
        task: params.task,
        phase: params.phase,
        requestId: params.requestId,
        payloadBytes: params.payloadBytes,
        // Skip expensive object traversal in production; keep it in dev for diagnostics.
        resultBytes: import.meta.env.DEV ? estimateSerializableBytes(params.result) : 0,
        roundTripMs: params.roundTripMs,
        handlerMs: params.handlerMs,
        rowCount: (payloadShape as { rowCount?: number }).rowCount ?? (resultShape as { rowCount?: number }).rowCount,
        columnCount: (payloadShape as { columnCount?: number }).columnCount ?? (resultShape as { columnCount?: number }).columnCount,
        returnedRows: (resultShape as { returnedRows?: number }).returnedRows,
        totalMatchedRows: (resultShape as { totalMatchedRows?: number }).totalMatchedRows,
        selectedColumnCount: (resultShape as { selectedColumnCount?: number }).selectedColumnCount
            ?? (payloadShape as { selectedColumnCount?: number }).selectedColumnCount,
        truncated: (resultShape as { truncated?: boolean }).truncated,
        errorMessage: params.errorMessage ?? null,
    };
};
