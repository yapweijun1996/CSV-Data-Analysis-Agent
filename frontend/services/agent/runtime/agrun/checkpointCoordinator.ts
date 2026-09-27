/**
 * AGRUN-009: serializes Agrun checkpoint writes with lifecycle invalidation.
 *
 * Agrun's checkpoint hook is deliberately fire-and-forget. The coordinator
 * therefore owns a per-session promise queue so a late checkpoint write can
 * never resurrect a checkpoint after completion, cancellation, or mutation.
 */
import { debugLog } from '../../../ai/llmLogger';
import {
    AGRUN_FOLLOW_UP_CHECKPOINT_MAX_AGE_MS,
    AGRUN_INITIAL_ANALYSIS_CHECKPOINT_MAX_AGE_MS,
    buildAgrunCheckpointMessageFingerprint,
    deleteAgrunCheckpoint,
    purgeAgrunCheckpoints,
    readAgrunCheckpoint,
    saveAgrunCheckpoint,
    type AgrunCheckpointHostState,
    type AgrunCheckpointRecord,
    type AgrunCheckpointRunKind,
} from './checkpointStore';
import type {
    AgrunRecord,
    FollowUpRuntimeStatus,
    InitialAnalysisRunStatus,
} from './types';

type ActiveCheckpointTurn = {
    datasetVersion: string | null;
    invalidated: boolean;
    messageFingerprint: string;
    runKind: AgrunCheckpointRunKind;
    turnId: string;
};

export interface AgrunCheckpointStorage {
    delete(sessionId: string): Promise<void>;
    purge(keepSessionIds?: Iterable<string>): Promise<number>;
    read(sessionId: string): Promise<AgrunCheckpointRecord | null>;
    save(
        record: Omit<AgrunCheckpointRecord, 'schemaVersion' | 'savedAt'>,
    ): Promise<AgrunCheckpointRecord>;
}

const defaultStorage: AgrunCheckpointStorage = {
    delete: deleteAgrunCheckpoint,
    purge: purgeAgrunCheckpoints,
    read: readAgrunCheckpoint,
    save: saveAgrunCheckpoint,
};

const sanitizeError = (error: unknown): Error => {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(
        message
            .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
            .replace(/\b(?:gw_|sk-|AIza)[A-Za-z0-9._-]{12,}\b/g, '[redacted credential]'),
    );
};

export class AgrunCheckpointCoordinator {
    private readonly active = new Map<string, ActiveCheckpointTurn>();
    private readonly queues = new Map<string, Promise<void>>();

    constructor(private readonly storage: AgrunCheckpointStorage = defaultStorage) {}

    begin(params: {
        datasetVersion: string | null;
        message: string;
        runKind?: AgrunCheckpointRunKind;
        sessionId: string;
        turnId: string;
    }): void {
        this.active.set(params.sessionId, {
            datasetVersion: params.datasetVersion,
            invalidated: false,
            messageFingerprint: buildAgrunCheckpointMessageFingerprint(params.message),
            runKind: params.runKind ?? 'follow_up',
            turnId: params.turnId,
        });
    }

    beginRecovery(record: AgrunCheckpointRecord): void {
        this.active.set(record.sessionId, {
            datasetVersion: record.datasetVersion,
            invalidated: false,
            messageFingerprint: record.messageFingerprint,
            runKind: record.runKind,
            turnId: record.turnId,
        });
    }

    checkpoint(
        sessionId: string,
        envelope: unknown,
        hostState?: AgrunCheckpointHostState,
    ): Promise<void> {
        return this.enqueue(sessionId, async () => {
            const active = this.active.get(sessionId);
            if (!active || active.invalidated) return;
            await this.storage.save({
                sessionId,
                turnId: active.turnId,
                runKind: active.runKind,
                datasetVersion: active.datasetVersion,
                messageFingerprint: active.messageFingerprint,
                hostState: hostState ?? {
                    runKind: 'follow_up',
                    actionCalls: 0,
                },
                envelope: envelope as AgrunRecord,
            });
        }).catch(error => {
            debugLog(
                'agrun_checkpoint_save_failure',
                { sessionId },
                sanitizeError(error),
            );
        });
    }

    updateHostState(
        sessionId: string,
        turnId: string,
        hostState: AgrunCheckpointHostState,
    ): Promise<void> {
        return this.enqueue(sessionId, async () => {
            const active = this.active.get(sessionId);
            if (
                !active
                || active.invalidated
                || active.turnId !== turnId
            ) {
                return;
            }
            const record = await this.storage.read(sessionId);
            if (!record || record.turnId !== turnId) return;
            await this.storage.save({
                sessionId: record.sessionId,
                turnId: record.turnId,
                runKind: record.runKind,
                datasetVersion: record.datasetVersion,
                messageFingerprint: record.messageFingerprint,
                hostState,
                envelope: record.envelope,
            });
        }).catch(error => {
            debugLog(
                'agrun_checkpoint_host_state_failure',
                { sessionId, turnId },
                sanitizeError(error),
            );
        });
    }

    async finish(
        sessionId: string,
        turnId: string,
        status: FollowUpRuntimeStatus | InitialAnalysisRunStatus,
    ): Promise<void> {
        const active = this.active.get(sessionId);
        if (!active || active.turnId !== turnId) return;
        if (status !== 'blocked') {
            active.invalidated = true;
            await this.enqueue(sessionId, () => this.storage.delete(sessionId));
            this.active.delete(sessionId);
            return;
        }
        await this.waitForSession(sessionId);
        this.active.delete(sessionId);
    }

    async invalidateForMutation(
        sessionId: string,
        turnId: string,
    ): Promise<void> {
        const active = this.active.get(sessionId);
        if (active?.turnId === turnId) {
            active.invalidated = true;
        }
        await this.enqueue(sessionId, () => this.storage.delete(sessionId));
    }

    async readValid(
        sessionId: string,
        datasetVersion: string | null,
        now = Date.now(),
        runKind: AgrunCheckpointRunKind = 'follow_up',
    ): Promise<AgrunCheckpointRecord | null> {
        const record = await this.storage.read(sessionId);
        if (!record) return null;
        if (record.runKind !== runKind) return null;
        const maxAge = runKind === 'initial_analysis'
            ? AGRUN_INITIAL_ANALYSIS_CHECKPOINT_MAX_AGE_MS
            : AGRUN_FOLLOW_UP_CHECKPOINT_MAX_AGE_MS;
        const expired = now - record.savedAt > maxAge;
        const wrongDataset = record.datasetVersion !== datasetVersion;
        if (expired || wrongDataset) {
            await this.discardSession(sessionId);
            return null;
        }
        return record;
    }

    async discardSession(sessionId: string): Promise<void> {
        const active = this.active.get(sessionId);
        if (active) active.invalidated = true;
        await this.enqueue(sessionId, () => this.storage.delete(sessionId));
        this.active.delete(sessionId);
    }

    purge(keepSessionIds: Iterable<string> = []): Promise<number> {
        return this.storage.purge(keepSessionIds);
    }

    private enqueue(
        sessionId: string,
        operation: () => Promise<void>,
    ): Promise<void> {
        const previous = this.queues.get(sessionId) ?? Promise.resolve();
        const next = previous.catch(() => undefined).then(operation);
        this.queues.set(sessionId, next);
        void next.finally(() => {
            if (this.queues.get(sessionId) === next) {
                this.queues.delete(sessionId);
            }
        }).catch(() => undefined);
        return next;
    }

    private waitForSession(sessionId: string): Promise<void> {
        return this.queues.get(sessionId) ?? Promise.resolve();
    }
}

export const agrunCheckpointCoordinator = new AgrunCheckpointCoordinator();
