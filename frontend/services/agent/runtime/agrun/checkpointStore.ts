/**
 * AGRUN-009: local crash-recovery checkpoint persistence.
 *
 * The app remains the session and cross-turn compaction owner. Agrun emits
 * single-turn run-state envelopes, which are stored separately from reports
 * and are invalidated at terminal outcomes, dataset changes, or mutation
 * execution.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
    assertInitialAnalysisBudgetState,
    isInitialAnalysisPhase,
    type InitialAnalysisCheckpointHostState,
} from './initialAnalysisTypes';
import type { AgrunRecord } from './types';

export const AGRUN_CHECKPOINT_DB_NAME = 'csv-ai-assistant-agrun-checkpoints';
export const AGRUN_CHECKPOINT_DB_VERSION = 1;
export const AGRUN_CHECKPOINT_STORE_NAME = 'checkpoints';
export const AGRUN_CHECKPOINT_SCHEMA_VERSION = 3;
export const AGRUN_FOLLOW_UP_CHECKPOINT_MAX_AGE_MS = 15 * 60 * 1_000;
export const AGRUN_INITIAL_ANALYSIS_CHECKPOINT_MAX_AGE_MS = 30 * 60 * 1_000;
export const AGRUN_CHECKPOINT_MAX_AGE_MS =
    AGRUN_FOLLOW_UP_CHECKPOINT_MAX_AGE_MS;
export const AGRUN_CHECKPOINT_MAX_BYTES = 2 * 1024 * 1024;

export type AgrunCheckpointRunKind = 'follow_up' | 'initial_analysis';

export interface AgrunFollowUpCheckpointHostState {
    runKind?: 'follow_up';
    actionCalls: number;
}

export type AgrunCheckpointHostState =
    | AgrunFollowUpCheckpointHostState
    | InitialAnalysisCheckpointHostState;

export interface AgrunCheckpointRecord {
    sessionId: string;
    turnId: string;
    runKind: AgrunCheckpointRunKind;
    datasetVersion: string | null;
    messageFingerprint: string;
    hostState: AgrunCheckpointHostState;
    savedAt: number;
    schemaVersion: typeof AGRUN_CHECKPOINT_SCHEMA_VERSION;
    envelope: AgrunRecord;
}

interface AgrunCheckpointDb extends DBSchema {
    [AGRUN_CHECKPOINT_STORE_NAME]: {
        key: string;
        value: AgrunCheckpointRecord;
    };
}

const SECRET_KEY_PATTERN =
    /(?:api[_-]?key|authorization|cookie|password|secret|access[_-]?token|refresh[_-]?token|bearer[_-]?token)/i;
const PROVIDER_CREDENTIAL_PATTERN =
    /\b(?:sk-|gw_|AIza)[A-Za-z0-9._-]{12,}\b/g;
const BEARER_PATTERN = /\bBearer\s+\S+/gi;
const CREDENTIAL_QUERY_PATTERN =
    /([?&](?:api_?key|key|token)=)[^&\s]+/gi;
const INITIAL_ANALYSIS_PAYLOAD_KEY_PATTERN =
    /^(?:apiKey|authorization|cookie|csvData|data|file|fileContents|prompt|queryResults|rawCsvData|rows)$/i;

let dbPromise: Promise<IDBPDatabase<AgrunCheckpointDb>> | null = null;

const hasIndexedDb = (): boolean =>
    typeof globalThis.indexedDB !== 'undefined';

const cloneValue = <T>(value: T): T => {
    if (typeof globalThis.structuredClone === 'function') {
        return globalThis.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
};

const redactString = (value: string): string =>
    value
        .replace(BEARER_PATTERN, 'Bearer [redacted]')
        .replace(PROVIDER_CREDENTIAL_PATTERN, '[redacted credential]')
        .replace(CREDENTIAL_QUERY_PATTERN, '$1[redacted]');

export const sanitizeAgrunCheckpointValue = (
    value: unknown,
    seen = new WeakSet<object>(),
    options: {
        omitInitialAnalysisPayloads?: boolean;
    } = {},
): unknown => {
    if (typeof value === 'string') return redactString(value);
    if (
        value === null
        || value === undefined
        || typeof value === 'number'
        || typeof value === 'boolean'
    ) {
        return value;
    }
    if (typeof value !== 'object') return String(value);
    if (seen.has(value)) return '[circular]';
    seen.add(value);

    if (Array.isArray(value)) {
        const sanitized = value.map(item =>
            sanitizeAgrunCheckpointValue(item, seen, options));
        seen.delete(value);
        return sanitized;
    }

    const sanitized = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
            key,
            options.omitInitialAnalysisPayloads
                && INITIAL_ANALYSIS_PAYLOAD_KEY_PATTERN.test(key)
                ? '[omitted]'
                : SECRET_KEY_PATTERN.test(key)
                ? '[redacted]'
                : sanitizeAgrunCheckpointValue(nested, seen, options),
        ]),
    );
    seen.delete(value);
    return sanitized;
};

const normalizeMessageForFingerprint = (message: string): string =>
    message.trim().toLowerCase().replace(/\s+/g, ' ');

export const buildAgrunCheckpointMessageFingerprint = (
    message: string,
): string => {
    const normalized = normalizeMessageForFingerprint(message);
    let hash = 0x811c9dc5;
    for (let index = 0; index < normalized.length; index += 1) {
        hash ^= normalized.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `message-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const getDb = (): Promise<IDBPDatabase<AgrunCheckpointDb>> => {
    if (!dbPromise) {
        dbPromise = openDB<AgrunCheckpointDb>(
            AGRUN_CHECKPOINT_DB_NAME,
            AGRUN_CHECKPOINT_DB_VERSION,
            {
                upgrade(db) {
                    if (!db.objectStoreNames.contains(AGRUN_CHECKPOINT_STORE_NAME)) {
                        db.createObjectStore(AGRUN_CHECKPOINT_STORE_NAME, {
                            keyPath: 'sessionId',
                        });
                    }
                },
                blocking() {
                    void dbPromise?.then(db => db.close()).catch(() => undefined);
                    dbPromise = null;
                },
                terminated() {
                    dbPromise = null;
                },
            },
        ).catch(error => {
            dbPromise = null;
            throw error;
        });
    }
    return dbPromise;
};

const requireStringArray = (
    value: unknown,
    field: string,
): string[] => {
    if (
        !Array.isArray(value)
        || value.some(item => typeof item !== 'string' || !item.trim())
    ) {
        throw new Error(`Agrun initial checkpoint ${field} must be a string array.`);
    }
    return Array.from(new Set(value));
};

const normalizeInitialAnalysisHostState = (
    value: AgrunCheckpointHostState,
): InitialAnalysisCheckpointHostState => {
    if (
        value.runKind !== 'initial_analysis'
        || !isInitialAnalysisPhase(value.phase)
        || !Number.isInteger(value.phaseAttempt)
        || value.phaseAttempt < 1
        || value.phaseAttempt > 3
        || typeof value.runtimeRunId !== 'string'
        || !value.runtimeRunId.trim()
        || typeof value.traceId !== 'string'
        || !value.traceId.trim()
    ) {
        throw new Error('Agrun initial checkpoint host state is invalid.');
    }
    assertInitialAnalysisBudgetState(value.budget);
    return {
        ...value,
        runtimeRunId: value.runtimeRunId.trim(),
        traceId: value.traceId.trim(),
        committedTransformationIds: requireStringArray(
            value.committedTransformationIds,
            'committedTransformationIds',
        ),
        materializedCardFingerprints: requireStringArray(
            value.materializedCardFingerprints,
            'materializedCardFingerprints',
        ),
        warningCodes: requireStringArray(value.warningCodes, 'warningCodes'),
        completedToolNames: requireStringArray(
            value.completedToolNames,
            'completedToolNames',
        ),
    };
};

const validateRecord = (
    record: Omit<AgrunCheckpointRecord, 'schemaVersion' | 'savedAt'>,
): AgrunCheckpointRecord => {
    const sessionId = record.sessionId.trim();
    const turnId = record.turnId.trim();
    const messageFingerprint = record.messageFingerprint.trim();
    if (!sessionId || !turnId || !messageFingerprint) {
        throw new Error('Agrun checkpoint identity fields are required.');
    }

    const runKind = record.runKind === 'initial_analysis'
        ? 'initial_analysis'
        : 'follow_up';
    const envelope = sanitizeAgrunCheckpointValue(
        record.envelope,
        new WeakSet<object>(),
        { omitInitialAnalysisPayloads: runKind === 'initial_analysis' },
    ) as AgrunRecord;
    const hostState = sanitizeAgrunCheckpointValue(
        record.hostState,
    ) as AgrunCheckpointHostState;
    const serialized = JSON.stringify({ envelope, hostState });
    const serializedBytes = new TextEncoder().encode(serialized).byteLength;
    if (serializedBytes > AGRUN_CHECKPOINT_MAX_BYTES) {
        throw new Error(
            `Agrun checkpoint exceeds ${AGRUN_CHECKPOINT_MAX_BYTES} bytes.`,
        );
    }
    const runState = envelope.runState;
    if (
        !runState
        || typeof runState !== 'object'
        || Array.isArray(runState)
        || typeof (runState as AgrunRecord).runId !== 'string'
    ) {
        throw new Error('Agrun checkpoint envelope is missing runState.runId.');
    }

    return {
        ...record,
        sessionId,
        turnId,
        runKind,
        messageFingerprint,
        hostState: runKind === 'initial_analysis'
            ? normalizeInitialAnalysisHostState(hostState)
            : {
                runKind: 'follow_up',
                actionCalls: Number.isInteger(
                    (hostState as AgrunFollowUpCheckpointHostState)?.actionCalls,
                )
                    ? Math.max(
                        0,
                        (hostState as AgrunFollowUpCheckpointHostState).actionCalls,
                    )
                    : 0,
            },
        envelope: cloneValue(envelope),
        savedAt: Date.now(),
        schemaVersion: AGRUN_CHECKPOINT_SCHEMA_VERSION,
    };
};

export const saveAgrunCheckpoint = async (
    record: Omit<AgrunCheckpointRecord, 'schemaVersion' | 'savedAt'>,
): Promise<AgrunCheckpointRecord> => {
    const next = validateRecord(record);
    if (!hasIndexedDb()) return cloneValue(next);
    await (await getDb()).put(AGRUN_CHECKPOINT_STORE_NAME, next);
    return cloneValue(next);
};

export const readAgrunCheckpoint = async (
    sessionId: string,
): Promise<AgrunCheckpointRecord | null> => {
    if (!hasIndexedDb()) return null;
    const record = await (await getDb()).get(
        AGRUN_CHECKPOINT_STORE_NAME,
        sessionId,
    );
    if (!record || record.schemaVersion !== AGRUN_CHECKPOINT_SCHEMA_VERSION) {
        return null;
    }
    return cloneValue(record);
};

export const deleteAgrunCheckpoint = async (
    sessionId: string,
): Promise<void> => {
    if (!hasIndexedDb()) return;
    await (await getDb()).delete(AGRUN_CHECKPOINT_STORE_NAME, sessionId);
};

export const purgeAgrunCheckpoints = async (
    keepSessionIds: Iterable<string> = [],
): Promise<number> => {
    if (!hasIndexedDb()) return 0;
    const keep = new Set(
        Array.from(keepSessionIds, value => value.trim()).filter(Boolean),
    );
    const db = await getDb();
    const records = await db.getAll(AGRUN_CHECKPOINT_STORE_NAME);
    let deleted = 0;
    const transaction = db.transaction(AGRUN_CHECKPOINT_STORE_NAME, 'readwrite');
    for (const record of records) {
        if (keep.has(record.sessionId)) continue;
        await transaction.store.delete(record.sessionId);
        deleted += 1;
    }
    await transaction.done;
    return deleted;
};

export const __resetAgrunCheckpointStoreForTests = (): void => {
    void dbPromise?.then(db => db.close()).catch(() => undefined);
    dbPromise = null;
};
