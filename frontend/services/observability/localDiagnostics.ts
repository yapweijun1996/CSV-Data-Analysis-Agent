import type {
    CloudAiProvider,
    LocalDiagnosticContext,
    LocalDiagnosticOutcome,
    LocalDiagnosticRecord,
} from '../../types';
import { createId } from '../../utils/createId';

export const LOCAL_DIAGNOSTIC_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const LOCAL_DIAGNOSTIC_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const LOCAL_DIAGNOSTIC_MAX_RECORD_BYTES = 512 * 1024;

const REDACTED = '[REDACTED]';
const CREDENTIAL_KEY_PATTERN = /(?:api[_-]?key|authorization|cookie|credential|password|secret|access[_-]?token|refresh[_-]?token|shared[_-]?gateway)/i;
const STRING_REDACTIONS: Array<[RegExp, string]> = [
    [/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, `Bearer ${REDACTED}`],
    [/\bAIza[0-9A-Za-z_-]{20,}\b/g, REDACTED],
    [/\bsk-[A-Za-z0-9_-]{16,}\b/g, REDACTED],
    [/((?:api[_-]?key|token|secret|password)\s*[=:]\s*)[^\s,;]+/gi, `$1${REDACTED}`],
];

type DiagnosticContextResolver = () => Partial<LocalDiagnosticContext> | null;
let contextResolver: DiagnosticContextResolver | null = null;
let diagnosticWriteQueue: Promise<void> = Promise.resolve();

export const configureLocalDiagnosticContext = (
    resolver: DiagnosticContextResolver | null,
): void => {
    contextResolver = resolver;
};

const redactString = (value: string): string => STRING_REDACTIONS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
);

/** Retains diagnostic payloads while always removing credentials recursively. */
export const redactLocalDiagnosticPayload = (
    value: unknown,
    seen = new WeakSet<object>(),
): unknown => {
    if (typeof value === 'string') return redactString(value);
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) {
        return value.map(item => redactLocalDiagnosticPayload(item, seen));
    }
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        CREDENTIAL_KEY_PATTERN.test(key)
            ? REDACTED
            : redactLocalDiagnosticPayload(item, seen),
    ]));
};

const estimateBytes = (value: unknown): number => {
    try {
        return new Blob([JSON.stringify(value)]).size;
    } catch {
        return 0;
    }
};

const boundPayload = (payload: unknown): { payload: unknown; estimatedBytes: number } => {
    const sanitized = redactLocalDiagnosticPayload(payload);
    const estimatedBytes = estimateBytes(sanitized);
    if (estimatedBytes <= LOCAL_DIAGNOSTIC_MAX_RECORD_BYTES) {
        return { payload: sanitized, estimatedBytes };
    }
    const serialized = JSON.stringify(sanitized);
    const bounded = {
        truncated: true,
        originalBytes: estimatedBytes,
        preview: serialized.slice(0, LOCAL_DIAGNOSTIC_MAX_RECORD_BYTES - 1024),
    };
    return { payload: bounded, estimatedBytes: estimateBytes(bounded) };
};

export const recordLocalDiagnostic = async (input: {
    runId?: string | null;
    phase?: string;
    attempt?: number;
    tool?: string;
    provider?: CloudAiProvider | 'local';
    model?: string | null;
    durationMs?: number | null;
    outcome: LocalDiagnosticOutcome;
    reasonCode?: string | null;
    payload?: unknown;
    now?: number;
}): Promise<LocalDiagnosticRecord> => {
    const context = contextResolver?.() ?? null;
    const now = input.now ?? Date.now();
    const bounded = boundPayload(input.payload ?? null);
    const record: LocalDiagnosticRecord = {
        id: createId('local-diagnostic'),
        recordedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + LOCAL_DIAGNOSTIC_RETENTION_MS).toISOString(),
        runId: input.runId ?? context?.runId ?? null,
        phase: input.phase ?? context?.phase ?? 'unknown',
        attempt: Math.max(1, Math.trunc(input.attempt ?? context?.attempt ?? 1)),
        tool: input.tool ?? context?.tool ?? 'unknown',
        provider: input.provider ?? 'local',
        model: input.model ?? null,
        durationMs: input.durationMs === undefined || input.durationMs === null
            ? null
            : Math.max(0, Math.round(input.durationMs)),
        outcome: input.outcome,
        reasonCode: input.reasonCode ?? null,
        payload: bounded.payload,
        estimatedBytes: bounded.estimatedBytes,
    };
    const storage = await import('../storageService');
    if ('saveLocalDiagnostic' in storage
        && typeof storage.saveLocalDiagnostic === 'function') {
        await storage.saveLocalDiagnostic(record, {
            now,
            maxTotalBytes: LOCAL_DIAGNOSTIC_MAX_TOTAL_BYTES,
        });
    }
    return record;
};

export const recordLocalDiagnosticBestEffort = (
    input: Parameters<typeof recordLocalDiagnostic>[0],
): void => {
    if (typeof indexedDB === 'undefined') return;
    diagnosticWriteQueue = diagnosticWriteQueue
        .then(async () => { await recordLocalDiagnostic(input); })
        .catch(error => {
            console.warn('[LocalDiagnostics] Could not persist a local diagnostic record.', error);
        });
};

export const loadRecentLocalDiagnostics = (
    limit = 200,
): Promise<LocalDiagnosticRecord[]> => import('../storageService').then(storage =>
    'getRecentLocalDiagnostics' in storage
    && typeof storage.getRecentLocalDiagnostics === 'function'
        ? storage.getRecentLocalDiagnostics(limit)
        : []);

export const __resetLocalDiagnosticContextForTests = (): void => {
    contextResolver = null;
    diagnosticWriteQueue = Promise.resolve();
};
