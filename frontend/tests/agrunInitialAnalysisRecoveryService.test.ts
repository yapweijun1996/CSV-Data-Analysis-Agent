import { describe, expect, it, vi } from 'vitest';
import {
    AgrunCheckpointCoordinator,
    type AgrunCheckpointStorage,
} from '../services/agent/runtime/agrun/checkpointCoordinator';
import {
    AGRUN_CHECKPOINT_SCHEMA_VERSION,
    buildAgrunCheckpointMessageFingerprint,
    type AgrunCheckpointRecord,
} from '../services/agent/runtime/agrun/checkpointStore';
import {
    createInitialAnalysisCheckpointHostState,
} from '../services/agent/runtime/agrun/initialAnalysisTypes';
import {
    recoverAgrunInitialAnalysisIfNeeded,
} from '../services/agent/runtime/agrun/initialAnalysisRuntimeService';
import { DEFAULT_AUTO_ANALYSIS_GOAL } from '../services/agent/analysisDefaults';
import { getCurrentAnalysisDatasetVersion } from '../services/agent/artifactProvenance';
import type {
    InitialAnalysisRuntimeAdapter,
} from '../services/agent/runtime/agrun/types';
import type { StoreApi } from '../services/agent/types';
import { createRuntimeTestStore } from './runtimeTestStore';

const createHarness = (record: AgrunCheckpointRecord) => {
    const records = new Map([[record.sessionId, record]]);
    const storage: AgrunCheckpointStorage = {
        delete: vi.fn(async sessionId => {
            records.delete(sessionId);
        }),
        purge: vi.fn(async () => 0),
        read: vi.fn(async sessionId => records.get(sessionId) ?? null),
        save: vi.fn(async checkpoint => ({
            ...checkpoint,
            savedAt: Date.now(),
            schemaVersion: AGRUN_CHECKPOINT_SCHEMA_VERSION,
        })),
    };
    return {
        records,
        coordinator: new AgrunCheckpointCoordinator(storage),
    };
};

const createStoreAndCheckpoint = (
    mutateHost?: (
        host: ReturnType<typeof createInitialAnalysisCheckpointHostState>,
    ) => void,
) => {
    const store = createRuntimeTestStore({
        confirmedAnalysisGoal: null,
    } as never) as unknown as StoreApi;
    const datasetVersion = getCurrentAnalysisDatasetVersion(store.getState())!;
    const hostState = createInitialAnalysisCheckpointHostState(
        'inspect_structure',
        { runtimeRunId: 'initial-run-1', traceId: 'initial-trace-1' },
    );
    mutateHost?.(hostState);
    const checkpoint: AgrunCheckpointRecord = {
        sessionId: store.getState().sessionId,
        turnId: 'initial-execution-1',
        runKind: 'initial_analysis',
        datasetVersion,
        messageFingerprint: buildAgrunCheckpointMessageFingerprint(
            DEFAULT_AUTO_ANALYSIS_GOAL,
        ),
        hostState,
        savedAt: Date.now(),
        schemaVersion: AGRUN_CHECKPOINT_SCHEMA_VERSION,
        envelope: {
            runState: {
                runId: 'initial-run-1',
                status: 'running',
            },
        },
    };
    return { checkpoint, datasetVersion, store };
};

describe('AGRUN-103 initial-analysis recovery service', () => {
    it('recovers a matching checkpoint through the existing adapter', async () => {
        const { checkpoint, datasetVersion, store } =
            createStoreAndCheckpoint();
        const harness = createHarness(checkpoint);
        const recover = vi.fn(async request => ({
            status: 'degraded' as const,
            currentDatasetVersion: request.datasetVersion,
            finalDatasetVersion: request.datasetVersion,
            trustedCardIds: [],
            warnings: [],
            runtimeRunId: 'initial-run-1',
            traceId: 'initial-trace-1',
        }));
        const adapter = {
            initialize: vi.fn(async () => undefined),
            run: vi.fn(),
            recover,
            cancel: vi.fn(),
        } as unknown as InitialAnalysisRuntimeAdapter;

        const outcome = await recoverAgrunInitialAnalysisIfNeeded(store, {
            adapter,
            checkpointCoordinator: harness.coordinator,
        });

        expect(outcome?.status).toBe('degraded');
        expect(recover).toHaveBeenCalledWith(
            expect.objectContaining({
                appSessionId: checkpoint.sessionId,
                datasetId: store.getState().currentDatasetId,
                datasetVersion,
                researchGoal: DEFAULT_AUTO_ANALYSIS_GOAL,
            }),
            checkpoint,
            store,
        );
    });

    it('discards a checkpoint when a committed transformation is absent from restored app state', async () => {
        const { checkpoint, store } = createStoreAndCheckpoint(hostState => {
            hostState.committedTransformationIds = ['missing-transform'];
        });
        const harness = createHarness(checkpoint);
        const adapter = {
            initialize: vi.fn(async () => undefined),
            run: vi.fn(),
            recover: vi.fn(),
            cancel: vi.fn(),
        } as unknown as InitialAnalysisRuntimeAdapter;

        const outcome = await recoverAgrunInitialAnalysisIfNeeded(store, {
            adapter,
            checkpointCoordinator: harness.coordinator,
        });

        expect(outcome).toBeNull();
        expect(adapter.recover).not.toHaveBeenCalled();
        expect(harness.records.has(checkpoint.sessionId)).toBe(false);
        expect(store.getState().addProgress).toHaveBeenCalledWith(
            expect.stringContaining('could not be resumed safely'),
            'warning',
        );
    });
});
