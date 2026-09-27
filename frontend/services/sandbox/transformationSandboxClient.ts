import type {
    CsvRow,
    SandboxExecutionLimits,
    SandboxTransformationOutcome,
    SandboxTransformationOutput,
    SandboxTransformationProposal,
} from '../../types';
import { normalizeAbortError } from '../agent/runtime/runtimeAbort';
import JavaScriptSandboxWorker from '../workers/transformationSandboxWorker.ts?worker&module';
import { buildSandboxCodeRef, validateSandboxProposal } from './sandboxPolicy';
import { validateSandboxOutput } from './sandboxValidation';

export const DEFAULT_SANDBOX_LIMITS: SandboxExecutionLimits = {
    timeoutMs: 30_000,
    maxOutputBytes: 16 * 1024 * 1024,
    maxRowsPerBatch: 5_000,
};

type WorkerRequest = {
    id: number;
    language: SandboxTransformationProposal['language'];
    code: string;
    rows: CsvRow[];
    context: Record<string, unknown>;
    maxOutputBytes: number;
};

type WorkerResponse = {
    id: number;
    success: boolean;
    result?: SandboxTransformationOutput;
    error?: string;
};

export interface SandboxWorkerLike {
    postMessage(message: WorkerRequest): void;
    terminate(): void;
    onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
}

export type SandboxWorkerFactory = (language: SandboxTransformationProposal['language']) => SandboxWorkerLike;

const createDefaultWorker: SandboxWorkerFactory = language => {
    if (language === 'javascript') return new JavaScriptSandboxWorker();
    const workerUrl = new URL('sandbox/python-transformation-worker.js', document.baseURI);
    const worker = new Worker(workerUrl, { name: 'python-transformation-sandbox' });
    return worker;
};

class SandboxWorkerSession {
    private requestId = 0;
    private readonly worker: SandboxWorkerLike;

    constructor(
        language: SandboxTransformationProposal['language'],
        factory: SandboxWorkerFactory,
    ) {
        this.worker = factory(language);
    }

    run(
        request: Omit<WorkerRequest, 'id'>,
        timeoutMs: number,
        signal?: AbortSignal,
    ): Promise<SandboxTransformationOutput> {
        const id = ++this.requestId;
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (callback: () => void) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
                callback();
            };
            const onAbort = () => finish(() => reject(normalizeAbortError(signal?.reason)));
            const timer = setTimeout(() => finish(() => reject(new Error('sandbox_execution_timeout'))), timeoutMs);
            this.worker.onmessage = event => {
                if (event.data.id !== id) return;
                finish(() => {
                    if (!event.data.success || !event.data.result) {
                        reject(new Error(event.data.error || 'sandbox_execution_failed'));
                        return;
                    }
                    resolve(event.data.result);
                });
            };
            this.worker.onerror = event => finish(() => reject(event.error || new Error(event.message || 'sandbox_worker_crashed')));
            if (signal?.aborted) {
                onAbort();
                return;
            }
            signal?.addEventListener('abort', onAbort, { once: true });
            this.worker.postMessage({ ...request, id });
        });
    }

    close() {
        this.worker.terminate();
    }
}

const selectStratifiedSample = (rows: CsvRow[], maxRows = 60): CsvRow[] => {
    if (rows.length <= maxRows) return rows.map(row => ({ ...row }));
    const sample: CsvRow[] = [];
    for (let index = 0; index < maxRows; index += 1) {
        const sourceIndex = Math.floor((index * (rows.length - 1)) / (maxRows - 1));
        sample.push({ ...rows[sourceIndex] });
    }
    return sample;
};

const mergeBatchOutput = (
    aggregate: SandboxTransformationOutput,
    batch: SandboxTransformationOutput,
    proposal: SandboxTransformationProposal,
    inputOffset: number,
) => {
    for (const tableContract of proposal.tables) {
        const sourceTable = batch.tables.find(table => table.tableId === tableContract.tableId);
        if (!sourceTable) continue;
        let targetTable = aggregate.tables.find(table => table.tableId === tableContract.tableId);
        if (!targetTable) {
            targetTable = { ...tableContract, rows: [] };
            aggregate.tables.push(targetTable);
        }
        const mergeKeys = tableContract.mergeKeys ?? [];
        const existingKeys = mergeKeys.length > 0
            ? new Set(targetTable.rows.map(row => JSON.stringify(mergeKeys.map(key => row[key] ?? null))))
            : null;
        const acceptedIndexes = new Map<number, number>();
        sourceTable.rows.forEach((row, sourceIndex) => {
            const key = existingKeys ? JSON.stringify(mergeKeys.map(column => row[column] ?? null)) : null;
            if (key !== null && existingKeys?.has(key)) return;
            if (key !== null) existingKeys?.add(key);
            acceptedIndexes.set(sourceIndex, targetTable!.rows.length);
            targetTable!.rows.push({ ...row });
        });
        for (const record of batch.lineage.filter(item => item.outputTableId === tableContract.tableId)) {
            const acceptedOutputIndex = acceptedIndexes.get(record.outputRowIndex);
            if (acceptedOutputIndex === undefined) continue;
            aggregate.lineage.push({
                ...record,
                outputRowIndex: acceptedOutputIndex,
                inputRowIndexes: record.inputRowIndexes.map(index => index + inputOffset),
            });
        }
    }
    for (const relationship of batch.relationships) {
        if (!aggregate.relationships.some(existing => existing.relationshipId === relationship.relationshipId)) {
            aggregate.relationships.push({ ...relationship });
        }
    }
    aggregate.notes = [...(aggregate.notes ?? []), ...(batch.notes ?? [])].slice(0, 100);
};

const emptyValidation = (reasonCodes: string[]) => ({
    decision: 'blocked' as const,
    reasonCodes,
    warnings: [],
    inputRowCount: 0,
    outputRowCount: 0,
    outputBytes: 0,
    preservedNumericTotals: {},
});

export const executeSandboxTransformation = async (input: {
    runId: string;
    attempt: 2 | 3;
    inputTableId: string;
    rows: CsvRow[];
    proposal: SandboxTransformationProposal;
    limits?: Partial<SandboxExecutionLimits>;
    signal?: AbortSignal;
    workerFactory?: SandboxWorkerFactory;
}): Promise<SandboxTransformationOutcome> => {
    const startedAt = performance.now();
    const limits = { ...DEFAULT_SANDBOX_LIMITS, ...(input.limits ?? {}) };
    const codeRef = buildSandboxCodeRef(input.proposal.language, input.proposal.code);
    const policyErrors = validateSandboxProposal(input.proposal);
    if (policyErrors.length > 0) {
        return {
            status: 'blocked',
            runId: input.runId,
            attempt: input.attempt,
            language: input.proposal.language,
            codeRef,
            durationMs: performance.now() - startedAt,
            output: null,
            validation: emptyValidation(policyErrors),
            error: policyErrors.join(','),
        };
    }

    const session = new SandboxWorkerSession(input.proposal.language, input.workerFactory ?? createDefaultWorker);
    try {
        const sampleRows = selectStratifiedSample(input.rows);
        const sampleOutput = await session.run({
            language: input.proposal.language,
            code: input.proposal.code,
            rows: sampleRows,
            context: {
                phase: 'sample',
                inputTableId: input.inputTableId,
                attempt: input.attempt,
                ...(input.proposal.language === 'python'
                    ? { pyodideBaseUrl: new URL('pyodide/', document.baseURI).href }
                    : {}),
            },
            maxOutputBytes: Math.min(limits.maxOutputBytes, 2 * 1024 * 1024),
        }, limits.timeoutMs, input.signal);
        const sampleValidation = validateSandboxOutput({
            inputTableId: input.inputTableId,
            inputRows: sampleRows,
            proposal: input.proposal,
            output: sampleOutput,
            maxOutputBytes: Math.min(limits.maxOutputBytes, 2 * 1024 * 1024),
        });
        if (sampleValidation.decision === 'blocked') {
            return {
                status: 'blocked',
                runId: input.runId,
                attempt: input.attempt,
                language: input.proposal.language,
                codeRef,
                durationMs: performance.now() - startedAt,
                output: null,
                validation: sampleValidation,
                error: sampleValidation.reasonCodes.join(','),
            };
        }

        const aggregate: SandboxTransformationOutput = { tables: [], lineage: [], relationships: [], notes: [] };
        for (let offset = 0; offset < input.rows.length; offset += limits.maxRowsPerBatch) {
            if (input.signal?.aborted) throw normalizeAbortError(input.signal.reason);
            const batchRows = input.rows.slice(offset, offset + limits.maxRowsPerBatch).map(row => ({ ...row }));
            const batchOutput = await session.run({
                language: input.proposal.language,
                code: input.proposal.code,
                rows: batchRows,
                context: {
                    phase: 'full',
                    inputTableId: input.inputTableId,
                    attempt: input.attempt,
                    inputOffset: offset,
                    batchIndex: Math.floor(offset / limits.maxRowsPerBatch),
                    ...(input.proposal.language === 'python'
                        ? { pyodideBaseUrl: new URL('pyodide/', document.baseURI).href }
                        : {}),
                },
                maxOutputBytes: limits.maxOutputBytes,
            }, limits.timeoutMs, input.signal);
            const batchValidation = validateSandboxOutput({
                inputTableId: input.inputTableId,
                inputRows: batchRows,
                proposal: input.proposal,
                output: batchOutput,
                maxOutputBytes: limits.maxOutputBytes,
            });
            if (batchValidation.decision === 'blocked') {
                return {
                    status: 'blocked',
                    runId: input.runId,
                    attempt: input.attempt,
                    language: input.proposal.language,
                    codeRef,
                    durationMs: performance.now() - startedAt,
                    output: null,
                    validation: batchValidation,
                    error: batchValidation.reasonCodes.join(','),
                };
            }
            mergeBatchOutput(aggregate, batchOutput, input.proposal, offset);
        }

        const validation = validateSandboxOutput({
            inputTableId: input.inputTableId,
            inputRows: input.rows,
            proposal: input.proposal,
            output: aggregate,
            maxOutputBytes: limits.maxOutputBytes * Math.max(1, Math.ceil(input.rows.length / limits.maxRowsPerBatch)),
        });
        return {
            status: validation.decision === 'blocked' ? 'blocked' : 'completed',
            runId: input.runId,
            attempt: input.attempt,
            language: input.proposal.language,
            codeRef,
            durationMs: performance.now() - startedAt,
            output: validation.decision === 'blocked' ? null : aggregate,
            validation,
            error: validation.decision === 'blocked' ? validation.reasonCodes.join(',') : null,
        };
    } catch (error) {
        const cancelled = input.signal?.aborted || (error instanceof Error && error.name === 'AbortError');
        return {
            status: cancelled ? 'cancelled' : 'failed',
            runId: input.runId,
            attempt: input.attempt,
            language: input.proposal.language,
            codeRef,
            durationMs: performance.now() - startedAt,
            output: null,
            validation: emptyValidation([cancelled ? 'sandbox_cancelled' : 'sandbox_execution_failed']),
            error: error instanceof Error ? error.message : String(error),
        };
    } finally {
        session.close();
    }
};
