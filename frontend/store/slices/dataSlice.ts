import { captureSessionScope, ownsSessionScope, scopeStore, scopeCurrentExecution, type RunLease, type SessionScope } from '../../services/session/sessionOwnership';
import { getCurrentAnalysisDatasetVersion } from '../../services/agent/artifactProvenance';

// Agent and AI modules are loaded dynamically (via import()) to keep the
// app-agent chunk out of the cold-start import graph.  Every action handler
// is async, so dynamic imports add no API friction.

import type { StateCreator } from 'zustand';
import type { StoreApi } from '../../services/agent/types';
import { flushSync } from 'react-dom';
import type { AppStore } from '../useAppStore';
import { getPipelineOutcomeUserText, getTranslation } from '../../utils/localization';
import {
    ProgressMessage,
    CsvData,
    ExternalCsvPayloadEvent,
    InitialAnalysisOutcome,
    ReportBoundary,
    WorkspaceDataQueryRequest,
    WorkspaceQueryRunOutcome,
    QueryTraceEntry,
    DuckDbSessionStatus,
    DatasetSemanticSnapshot,
    UserColumnAnnotation,
    DatasetBundle,
} from '../../types';
import type { CanonicalReshapeProvenance } from '../../types/reportStructure';
import { profileDataWithWorker } from '../../services/workers/dataWorkerClient';
import { primeDuckDbDataset, DUCKDB_INIT_TIMEOUT_MS } from '../../services/duckdb/queryEngine';
import { duckDbWorkerClient } from '../../services/workers/duckDbWorkerClient';
import {
    createBindingDuckDbSessionStatus,
    createDuckDbSessionStatusFromBinding,
    createIdleDuckDbSessionStatus,
    isDuckDbSessionStatusEqual,
} from '../../services/duckdb/sessionStatus';
import { createProgressMessage } from '../../utils/messageState';
import { trimProgressMessages } from '../../utils/storeLimits';
import { createWorkerDiagnosticsTelemetryReporter } from '../../services/workers/workerDiagnostics';
import { getOriginalData } from '../../services/storageService';
import { buildColumnRegistry, buildEffectiveColumnRegistryFromState, getAllowedColumns } from '../../services/data/columnRegistry';
import { captureHistoryAnalysisSnapshot, getRestoredHistoryAnalysisState } from '../../services/agent/orchestration/historyAnalysisRestore';
import { hasPiInitialCheckpoint } from '../../services/agent/runtime/pi/piInitialCheckpoint';
import { formatCount, pluralizeCount } from '../../utils/displayText';
import { cancelStructureRepairReview } from '../../services/agent/structureRepairConfirmation';
import { discardCsvSourceScan } from '../../services/data/csvSourceScan';

export interface IDataSlice {
    addProgress: (message: string, type?: 'system' | 'warning' | 'error', model?: string, localize?: import('../../types/app').ProgressLocalization) => void;
    handleInitialAnalysis: (dataForAnalysis: CsvData, goal: string, options?: { trigger?: 'automatic' | 'manual' }) => Promise<InitialAnalysisOutcome>;
    proposeAnalysisGoals: (dataForAnalysis: CsvData) => Promise<void>;
    handleFileUpload: (file: File) => Promise<void>;
    ingestExternalCsvPayload: (event: ExternalCsvPayloadEvent) => Promise<void>;
    regenerateAnalyses: (newData: CsvData) => Promise<void>;
    resumeCleaningRun: () => Promise<void>;
    restartCleaningRun: () => Promise<void>;
    revertToOriginal: () => Promise<void>;
    ensureDatasetSemanticSnapshot: (dataset?: CsvData | null, options?: { force?: boolean; sessionScope?: SessionScope; runLease?: RunLease; assertCurrent?: () => void }) => Promise<DatasetSemanticSnapshot | null>;
    refreshDuckDbSession: (datasetOverride?: CsvData | null, sessionScope?: SessionScope, runLease?: RunLease, assertCurrent?: () => void) => Promise<DuckDbSessionStatus>;
    promoteToCanonicalDataset: (options: { reason: string; reshapeProvenance: CanonicalReshapeProvenance }) => void;
    runWorkspaceDataQuery: (payload: WorkspaceDataQueryRequest, expectedSource?: { dataset: CsvData; sessionId: string }) => Promise<WorkspaceQueryRunOutcome>;
    prepareStructureRepairReview: () => Promise<import('../../types/structureRepair').StructureRepairReview | null>;
    confirmStructureRepairMeaning: (reviewId: string, choice: string, rendered?: import('../../services/agent/structureRepairConfirmation').RenderedStructureRepairReview) => Promise<void>;
    resumeStructureRepairDraft: (reviewId: string) => Promise<void>;
    continueStructureRepairAnalysis: (reviewId: string, rendered?: import('../../services/agent/structureRepairConfirmation').RenderedStructureRepairReview) => Promise<void>;
    cancelStructureRepairReview: (reviewId?: string, onlyIfReviewing?: boolean) => void;
    saveReportStructureBoundaryOverride: (boundary: ReportBoundary) => Promise<void>;
    setColumnAnnotation: (annotation: UserColumnAnnotation) => void;
    removeColumnAnnotation: (columnName: string) => void;
}

export const resolvePendingDatasetBundleRestore = (
    state: Pick<AppStore, 'csvData' | 'datasetBundle'>,
): DatasetBundle | null => !state.csvData ? state.datasetBundle : null;

export const createDataSlice: StateCreator<AppStore, [], [], IDataSlice> = (set, get) => {
    const storeApi = { getState: get, setState: set };
    let uploadGeneration = 0;
    let inFlightSemanticSnapshot: Promise<DatasetSemanticSnapshot | null> | null = null;
    let inFlightSemanticScope: SessionScope | null = null;
    let inFlightSemanticOwner: typeof storeApi | null = null;
    let inFlightDuckDbScope: SessionScope | null = null;
    let inFlightDuckDbOwner: typeof storeApi | null = null;
    let inFlightSemanticDatasetVersion: string | null = null;
    let inFlightDuckDbSessionRefresh: Promise<DuckDbSessionStatus> | null = null;
    let inFlightDuckDbSessionDatasetVersion: string | null = null;
    let inFlightExternalPayloadId: string | null = null;
    const recentlyProcessedExternalPayloads = new Map<string, number>();
    let duckDbRefreshHelpersPromise: Promise<{
        getPreferredAnalysisDataset: typeof import('../../services/agent/reportStructureState').getPreferredAnalysisDataset;
        resolveDatasetBindingTarget: typeof import('../../services/agent/datasetBinding').resolveDatasetBindingTarget;
        isDuckDbSessionCurrentForDataset: typeof import('../../services/agent/datasetBinding').isDuckDbSessionCurrentForDataset;
    }> | null = null;
    const describeTransport = (transport: ExternalCsvPayloadEvent['meta']['transport']) => {
        switch (transport) {
            case 'postMessage':
                return 'postMessage';
            case 'localStorage':
                return 'localStorage';
            case 'sessionStorage':
                return 'sessionStorage';
            default:
                return 'external';
        }
    };

    const buildSyntheticFileName = (event: ExternalCsvPayloadEvent) => {
        const headerBase = (event.payload.header || 'ai-chart-report')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'ai-chart-report';
        const timestamp = new Date(event.meta.receivedAt).toISOString().replace(/[:]/g, '-');
        return `${headerBase}-${describeTransport(event.meta.transport)}-${timestamp}.csv`;
    };

    const markExternalPayloadProcessed = (payloadId: string) => {
        const now = Date.now();
        recentlyProcessedExternalPayloads.set(payloadId, now);
        for (const [candidateId, processedAt] of recentlyProcessedExternalPayloads.entries()) {
            if (now - processedAt > 60_000) {
                recentlyProcessedExternalPayloads.delete(candidateId);
            }
        }
    };

    const cloneCsvData = (data: CsvData): CsvData => ({
        ...data,
        data: data.data.map(row => ({ ...row })),
        metadataRows: [...(data.metadataRows ?? [])].map(row => [...row]),
        headerLayers: [...(data.headerLayers ?? [])].map(row => [...row]),
        summaryRows: [...(data.summaryRows ?? [])].map(row => ({ ...row })),
    });

    const buildRegistryForDataset = (
        dataset: CsvData | null | undefined,
        profilesOverride?: AppStore['columnProfiles'],
        semanticSnapshotOverride?: AppStore['datasetSemanticSnapshot'],
    ) => buildEffectiveColumnRegistryFromState(get(), {
        datasetOverride: dataset,
        columnProfilesOverride: profilesOverride,
        semanticSnapshotOverride,
    });

    const persistCurrentSessionSnapshot = async (reason: string, owner = storeApi) => {
        const state = owner.getState();
        const scope = captureSessionScope(owner);
        try {
            const { persistCurrentAppSessionSnapshot } = await import('../../services/persistence/currentSessionPersistence');
            await persistCurrentAppSessionSnapshot(state, { store: owner, scope });
        } catch (error) { console.warn(`[DataSlice] Persistence degraded after ${reason}.`, error); }
    };

    const proposeGoalsAfterAnalysisSummaries = async (
        analysisDataset: CsvData,
        analysisOutcome?: InitialAnalysisOutcome | null,
        owner: StoreApi = scopeCurrentExecution(storeApi),
        fence?: () => void,
    ) => {
        if (analysisOutcome?.summaryPromise) {
            await analysisOutcome.summaryPromise;
        }
        if (owner.isActive?.() === false) return;
        fence?.();
        await owner.getState().proposeAnalysisGoals(analysisDataset);
    };

    const getDuckDbRefreshHelpers = async () => {
        duckDbRefreshHelpersPromise ??= Promise.all([
            import('../../services/agent/reportStructureState'),
            import('../../services/agent/datasetBinding'),
        ]).then(([
            { getPreferredAnalysisDataset },
            { resolveDatasetBindingTarget, isDuckDbSessionCurrentForDataset },
        ]) => ({
            getPreferredAnalysisDataset,
            resolveDatasetBindingTarget,
            isDuckDbSessionCurrentForDataset,
        }));

        return duckDbRefreshHelpersPromise;
    };

    const refreshDuckDbSession = async (datasetOverride?: CsvData | null, sessionScope = captureSessionScope(storeApi), runLease?: RunLease, assertCurrent?: () => void): Promise<DuckDbSessionStatus> => {
        const owned = scopeStore(storeApi, sessionScope, runLease);
        // Legacy review can be revoked without changing the analysis version or session.
        const get = () => { assertCurrent?.(); return owned.getState(); };
        const set: typeof owned.setState = patch => { assertCurrent?.(); owned.setState(patch); };
        assertCurrent?.();
        const startVersion = getCurrentAnalysisDatasetVersion(storeApi.getState());
        const t0 = performance.now();
        const {
            getPreferredAnalysisDataset,
            resolveDatasetBindingTarget,
            isDuckDbSessionCurrentForDataset,
        } = await getDuckDbRefreshHelpers();
        if (!ownsSessionScope(storeApi, sessionScope)) return createIdleDuckDbSessionStatus();
        console.log(`[Perf:RefreshDuckDb] dynamic imports: ${Math.round(performance.now() - t0)}ms`);
        const t1 = performance.now();
        const preferredDataset = datasetOverride ?? getPreferredAnalysisDataset(get());
        const currentSnapshot = get().datasetSemanticSnapshot;
        const currentSemanticDatasetVersion = get().semanticDatasetVersion;
        const bindingTarget = resolveDatasetBindingTarget({
            mode: 'workspace',
            csvData: preferredDataset,
            snapshot: currentSnapshot,
            semanticDatasetVersion: currentSemanticDatasetVersion,
        });
        console.log(`[Perf:RefreshDuckDb] resolveBindingTarget: ${Math.round(performance.now() - t1)}ms`);
        if (!bindingTarget) {
            const idleStatus = createIdleDuckDbSessionStatus();
            set({ duckDbSessionStatus: idleStatus });
            return idleStatus;
        }
        const currentStatus = get().duckDbSessionStatus;
        if (currentStatus.status === 'ready' && isDuckDbSessionCurrentForDataset(currentStatus, bindingTarget.dataset)) {
            return currentStatus;
        }
        if (
            !assertCurrent && inFlightDuckDbSessionRefresh
            && inFlightDuckDbScope === sessionScope
            && (inFlightDuckDbOwner as { isActive?: () => boolean } | null)?.isActive?.() !== false
            && inFlightDuckDbSessionDatasetVersion === bindingTarget.datasetVersion
        ) {
            console.log(`[Perf:RefreshDuckDb] reusing in-flight refresh for ${bindingTarget.datasetVersion}`);
            return inFlightDuckDbSessionRefresh;
        }

        const refreshPromise = (async (): Promise<DuckDbSessionStatus> => {
            const reportDiagnostics = createWorkerDiagnosticsTelemetryReporter(owned);

            const bindingStatus = createBindingDuckDbSessionStatus(get().duckDbSessionStatus);
            if (!isDuckDbSessionStatusEqual(get().duckDbSessionStatus, bindingStatus)) {
                set({ duckDbSessionStatus: bindingStatus });
            }

            const t2 = performance.now();
            const registry = buildRegistryForDataset(bindingTarget.dataset);
            console.log(`[Perf:RefreshDuckDb] buildRegistryForDataset: ${Math.round(performance.now() - t2)}ms (${bindingTarget.dataset.data.length} rows)`);

            const t3 = performance.now();
            const binding = await primeDuckDbDataset(
                bindingTarget.dataset,
                runLease?.signal,
                reportDiagnostics,
                undefined,
                registry,
            );
            console.log(`[Perf:RefreshDuckDb] primeDuckDbDataset (await): ${Math.round(performance.now() - t3)}ms`);

            if (!ownsSessionScope(storeApi, sessionScope) || getCurrentAnalysisDatasetVersion(storeApi.getState()) !== startVersion) return createIdleDuckDbSessionStatus();
            const t4 = performance.now();
            const nextStatus = binding
                ? createDuckDbSessionStatusFromBinding(binding)
                : createIdleDuckDbSessionStatus();
            if (!isDuckDbSessionStatusEqual(get().duckDbSessionStatus, nextStatus)) {
                set({ duckDbSessionStatus: nextStatus });
            }
            console.log(`[Perf:RefreshDuckDb] set(duckDbSessionStatus): ${Math.round(performance.now() - t4)}ms`);
            if (binding?.engine === 'duckdb') {
                // Safeguard before any card is built: compare the loaded numeric columns with
                // the original text so a silently changed number can never be "Verified".
                try {
                    const { runNumericParseCheck } = await import('../../services/data/numericParseGuard');
                    await runNumericParseCheck(owned as never, bindingTarget.dataset);
                } catch (error) {
                    console.warn('[RefreshDuckDb] numeric parse check unavailable.', error);
                }
            }
            console.log(`[Perf:RefreshDuckDb] total: ${Math.round(performance.now() - t0)}ms`);

            if (binding?.engine === 'duckdb') {
                get().logAgentToolUsage({
                    tool: 'duckdb_query_engine',
                    description: 'DuckDB analyst workspace session is ready.',
                    detail: {
                        tableName: binding.tableName,
                        loadVersion: binding.loadVersion,
                        semanticDatasetApplied: bindingTarget.semanticDatasetApplied,
                    },
                });
            } else if (binding?.fallbackStage === 'bind_failed' || binding?.fallbackStage === 'query_failed') {
                get().logAgentToolUsage({
                    tool: 'duckdb_query_engine',
                    description: 'DuckDB analyst workspace session is degraded.',
                    detail: {
                        tableName: binding.tableName,
                        loadVersion: binding.loadVersion,
                        fallbackStage: binding.fallbackStage,
                        error: binding.fallbackReason,
                        semanticDatasetApplied: bindingTarget.semanticDatasetApplied,
                    },
                });
            }

            return nextStatus;
        })();

        inFlightDuckDbScope = sessionScope;
        inFlightDuckDbOwner = owned;
        inFlightDuckDbSessionRefresh = refreshPromise;
        inFlightDuckDbSessionDatasetVersion = bindingTarget.datasetVersion;

        try {
            return await refreshPromise;
        } finally {
            if (inFlightDuckDbSessionRefresh === refreshPromise) {
                inFlightDuckDbSessionRefresh = null;
                inFlightDuckDbSessionDatasetVersion = null;
            }
        }
    };

    const rebuildStructureArtifacts = async (humanBoundary?: ReportBoundary | null, owner = scopeCurrentExecution(storeApi), fence?: () => void) => {
        const { getState: get, setState: set } = owner;
        if (owner.isActive?.() === false) return;
        const datasetVersion = getCurrentAnalysisDatasetVersion(get());
        const [
            { resolveReportStructureArtifactsWithProposal },
            { getPreferredAnalysisDataset },
            { buildSemanticDatasetVersion },
        ] = await Promise.all([
            import('../../services/agent/orchestration/reportStructureOrchestrator'),
            import('../../services/agent/reportStructureState'),
            import('../../services/agent/datasetSemantics'),
        ]);
        if (owner.isActive?.() === false) return;
        fence?.();
        const state = get();
        const artifacts = await resolveReportStructureArtifactsWithProposal({
            rawCsvData: state.rawCsvData,
            csvData: state.csvData,
            rawIntakeIr: state.rawIntakeIr,
            cleaningRun: state.cleaningRun,
            dataPreparationPlan: state.dataPreparationPlan,
            columnProfiles: state.columnProfiles,
            humanBoundary: humanBoundary
                ?? (state.reportStructureResolution?.source === 'human_confirmed'
                    ? state.reportStructureResolution.humanBoundary
                    : null),
            settings: state.settings,
            telemetryTarget: {
                sessionId: state.sessionId,
                currentDatasetId: state.currentDatasetId,
            },
        });
        if (owner.isActive?.() === false || getCurrentAnalysisDatasetVersion(get()) !== datasetVersion) return;
        const prevPreferred = getPreferredAnalysisDataset(get());
        const nextPreferred = artifacts.canonicalCsvData ?? get().csvData;
        const prevVersion = prevPreferred ? buildSemanticDatasetVersion(prevPreferred) : null;
        const nextVersion = nextPreferred ? buildSemanticDatasetVersion(nextPreferred) : null;
        const datasetVersionChanged = prevVersion !== nextVersion;

        // No await between the final source/repair fence and canonical publication.
        fence?.();
        set(prev => ({
            reportStructureResolution: artifacts.reportStructureResolution,
            canonicalCsvData: artifacts.canonicalCsvData,
            canonicalBuildMeta: artifacts.canonicalBuildMeta,
            canonicalizationStatus: artifacts.canonicalizationStatus,
            pipelineOutcome: artifacts.pipelineOutcome,
            ...(datasetVersionChanged ? {
                datasetSemanticSnapshot: null,
                semanticStatus: 'idle' as const,
                semanticDatasetVersion: null,
                columnRegistry: buildRegistryForDataset(nextPreferred, get().columnProfiles, null),
            } : {}),
            activeDataQuery: null,
            duckDbSessionStatus: createBindingDuckDbSessionStatus(prev.duckDbSessionStatus),
        }));
        return true;
    };

    const runFilePipeline = async (file: File) => {
        const generation = ++uploadGeneration;
        discardCsvSourceScan(storeApi);
        const scope = captureSessionScope(storeApi);
        const owned = scopeStore(storeApi, scope);
        const { getState: get, setState: set } = owned;
        // Capture restore intent before the synchronous intake lock installs an
        // empty CsvData placeholder. Reading it afterwards makes every restore
        // look like a fresh import and can carry unrelated session state into
        // the newly selected dataset.
        const restoreBundle = resolvePendingDatasetBundleRestore(get());
        if (restoreBundle && hasPiInitialCheckpoint(get().sessionId)) {
            set({ isBusy: true });
            try {
                const { reattachPiInitialCheckpointSource } = await import('../../services/agent/runtime/pi/piInitialCheckpointRecovery');
                if (generation === uploadGeneration && ownsSessionScope(storeApi, scope)) await reattachPiInitialCheckpointSource(file, owned);
            } finally {
                if (generation === uploadGeneration && ownsSessionScope(storeApi, scope) && !get().activeExecution) set({ isBusy: false });
            }
            return;
        }
        const restoreSnapshot = restoreBundle ? captureHistoryAnalysisSnapshot(get()) : null;
        // Commit the intake lock before the first dynamic import. This function
        // is called directly from the upload event, so React can paint the busy
        // state as soon as the handler yields instead of leaving WebKit on the
        // stale landing screen throughout module loading and CSV inspection.
        flushSync(() => set({
            isBusy: true,
            csvData: { fileName: file.name, data: [] },
            currentView: 'file_upload',
        }));
        const { orchestrateFileUpload } = await import('../../services/agent/orchestration/fileOrchestrator');
        try {
            if (generation !== uploadGeneration || !ownsSessionScope(storeApi, scope)) return;
            for await (const update of orchestrateFileUpload(file, owned, { restoreBundle, restoreSnapshot })) {
                if (generation !== uploadGeneration || !ownsSessionScope(storeApi, scope)) return;
                switch (update.type) {
                    case 'progress':
                        get().addProgress(update.message, update.messageType, update.model, update.localize);
                        break;
                    case 'state':
                        if (update.payload.currentView === 'analysis_dashboard' && update.payload.csvData) {
                            // This import boundary also switches from the small
                            // landing tree to the lazy analysis workspace. Force
                            // that one critical commit before Pi starts so
                            // WebKit cannot retain the stale upload screen while
                            // the analysis microtask chain is running.
                            flushSync(() => { update.assertCurrent?.(); set(update.payload); });
                        } else {
                            update.assertCurrent?.();
                            set(update.payload);
                        }
                        break;
                }
            }
        } catch (error) {
            if (generation !== uploadGeneration || !ownsSessionScope(storeApi, scope)) return;
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[FileProcessor] File processing failed:`, error);
            get().addProgress(`File Processing Error: ${errorMessage}`, 'error');
            set({
                isBusy: false,
                chatLifecycleState: 'idle' as const,
                currentView: 'file_upload',
                csvData: null,
                canonicalCsvData: null,
                ...(restoreBundle ? { datasetBundle: restoreBundle } : {}),
                ...(restoreSnapshot ? getRestoredHistoryAnalysisState(restoreSnapshot, restoreSnapshot.workspaceFiles) : {}),
            });
        }
    };

    return {
        addProgress: (message: string, type: 'system' | 'warning' | 'error' = 'system', model?: string, localize?: import('../../types/app').ProgressLocalization) => {
            const newMessage: ProgressMessage = createProgressMessage({ text: message, type, timestamp: new Date(), model, ...(localize ? { localize } : {}) });
            set(state => ({ progressMessages: trimProgressMessages([...state.progressMessages, newMessage]) }));
        },

        handleInitialAnalysis: async (dataForAnalysis, goal, options) => {
            const owner = scopeCurrentExecution(storeApi);
            const { handleInitialAnalysis } = await import('../../services/agent/orchestration/initialAnalysisService');
            if (owner.isActive?.() === false) return { status: 'paused' };
            return handleInitialAnalysis(dataForAnalysis, goal, owner, options);
        },
        proposeAnalysisGoals: async (dataForAnalysis) => {
            const ownedStore = scopeCurrentExecution(storeApi);
            const { getState: get, setState: set } = ownedStore;
            const { proposeAnalysisGoals: proposeGoals } = await import('../../services/agent/planning/goalProposer');
            return proposeGoals(dataForAnalysis, ownedStore);
        },
        handleFileUpload: runFilePipeline,

        ingestExternalCsvPayload: async (event) => {
            if (!event || !event.payload || typeof event.payload.csv !== 'string') {
                get().addProgress('Received malformed CSV payload from legacy report page.', 'error');
                return;
            }
            if (event.payloadId === inFlightExternalPayloadId || recentlyProcessedExternalPayloads.has(event.payloadId)) {
                console.debug('[ExternalCsvBridge] Skipped duplicate payload at store ingestion.', {
                    payloadId: event.payloadId,
                    transport: event.meta.transport,
                });
                return;
            }
            const csvText = event.payload.csv;
            if (!csvText.trim()) {
                get().addProgress('External CSV payload was empty.', 'error');
                return;
            }
            const fileName = buildSyntheticFileName(event);
            get().addProgress(`Loading dataset shared via ${describeTransport(event.meta.transport)} bridge...`);
            const file = new File([csvText], fileName, { type: 'text/csv;charset=utf-8' });
            inFlightExternalPayloadId = event.payloadId;
            try {
                await runFilePipeline(file);
                markExternalPayloadProcessed(event.payloadId);
            } finally {
                if (inFlightExternalPayloadId === event.payloadId) {
                    inFlightExternalPayloadId = null;
                }
            }
        },

        regenerateAnalyses: async (newData) => {
            const ownedStore = scopeCurrentExecution(storeApi);
            const { getState: get, setState: set } = ownedStore;
            const { regenerateAnalysesWithNewData } = await import('../../services/agent/orchestration/sessionManager');
            await regenerateAnalysesWithNewData(newData, ownedStore);
        },

        ensureDatasetSemanticSnapshot: async (dataset, options) => {
            const sessionScope = options?.sessionScope ?? captureSessionScope(storeApi);
            const owned = scopeStore(storeApi, sessionScope, options?.runLease);
            const get = () => { options?.assertCurrent?.(); return owned.getState(); };
            const set: typeof owned.setState = patch => { options?.assertCurrent?.(); owned.setState(patch); };
            options?.assertCurrent?.();
            const startVersion = getCurrentAnalysisDatasetVersion(storeApi.getState());
            const [
                { getPreferredAnalysisDataset },
                { buildSemanticDatasetVersion, isCurrentSemanticFallback, isSemanticSnapshotCurrent, getSemanticHiddenRowCount, preserveAcceptedFactMembership },
                { resolveAnalysisDatasetProfiles },
                { annotateDatasetSemantics },
            ] = await Promise.all([
                import('../../services/agent/reportStructureState'),
                import('../../services/agent/datasetSemantics'),
                import('../../services/agent/analysisDatasetProfiles'),
                import('../../services/ai/datasetSemanticAnnotator'),
            ]);

            if (!ownsSessionScope(storeApi, sessionScope)) return null;
            const targetDataset = dataset ?? getPreferredAnalysisDataset(get());
            if (!targetDataset) {
                inFlightSemanticSnapshot = null;
                inFlightSemanticDatasetVersion = null;
                set({ datasetSemanticSnapshot: null, semanticStatus: 'idle', semanticDatasetVersion: null, columnRegistry: null });
                return null;
            }

            const datasetVersion = buildSemanticDatasetVersion(targetDataset);
            const existingSnapshot = get().datasetSemanticSnapshot;
            if (!options?.force && isSemanticSnapshotCurrent(existingSnapshot, datasetVersion)) {
                const snapshot = preserveAcceptedFactMembership(existingSnapshot!, targetDataset, get());
                if (snapshot !== existingSnapshot || get().semanticStatus !== 'ready') set({
                    semanticStatus: 'ready', datasetSemanticSnapshot: snapshot,
                    columnRegistry: buildRegistryForDataset(targetDataset, get().columnProfiles, snapshot),
                });
                return snapshot;
            }
            if (!options?.force && isCurrentSemanticFallback(
                get().semanticStatus,
                get().semanticDatasetVersion,
                datasetVersion,
            )) {
                return null;
            }
            if (!options?.assertCurrent && !options?.force && inFlightSemanticSnapshot && inFlightSemanticScope === sessionScope && (inFlightSemanticOwner as { isActive?: () => boolean } | null)?.isActive?.() !== false && inFlightSemanticDatasetVersion === datasetVersion) {
                return inFlightSemanticSnapshot;
            }

            const effectiveColumns = resolveAnalysisDatasetProfiles(targetDataset, get().columnProfiles);
            if (effectiveColumns !== get().columnProfiles) {
                set({
                    columnProfiles: effectiveColumns,
                    columnRegistry: buildRegistryForDataset(targetDataset, effectiveColumns, get().datasetSemanticSnapshot),
                });
            }

            set({ semanticStatus: 'running', semanticDatasetVersion: datasetVersion });

            const semanticPromise = (async (): Promise<DatasetSemanticSnapshot | null> => {
                const SEMANTIC_ANNOTATION_TIMEOUT_MS = 15_000;
                const semanticStart = performance.now();
                let snapshot;
                let annotationTimeout: ReturnType<typeof setTimeout> | undefined;
                try {
                    const state = get();
                    const annotationPromise = annotateDatasetSemantics({
                        data: targetDataset,
                        rawData: state.rawCsvData ?? state.csvData ?? targetDataset,
                        columns: effectiveColumns,
                        settings: state.settings,
                        reportContextResolution: state.reportContextResolution,
                        reportStructureResolution: state.reportStructureResolution,
                        telemetryTarget: { sessionId: state.sessionId, currentDatasetId: state.currentDatasetId },
                    });
                    const timeoutPromise = new Promise<null>(resolve =>
                        annotationTimeout = setTimeout(() => resolve(null), SEMANTIC_ANNOTATION_TIMEOUT_MS),
                    );
                    snapshot = await Promise.race([annotationPromise, timeoutPromise]);
                } catch (error) {
                    if (!owned.isActive?.() || getCurrentAnalysisDatasetVersion(storeApi.getState()) !== startVersion) return null;
                    console.warn(`[Perf:Semantic] Annotation failed after ${Math.round(performance.now() - semanticStart)}ms`, error);
                    set(s => s.semanticDatasetVersion === datasetVersion
                        ? {
                            datasetSemanticSnapshot: null,
                            semanticStatus: 'fallback',
                            semanticDatasetVersion: datasetVersion,
                            columnRegistry: buildRegistryForDataset(targetDataset, effectiveColumns, null),
                        }
                        : {});
                    return null;
                } finally {
                    clearTimeout(annotationTimeout);
                }

                if (!owned.isActive?.() || !ownsSessionScope(storeApi, sessionScope) || getCurrentAnalysisDatasetVersion(storeApi.getState()) !== startVersion) return null;
                if (!snapshot) {
                    console.warn(`[Perf:Semantic] Annotation timed out after ${Math.round(performance.now() - semanticStart)}ms`);
                    set(s => s.semanticDatasetVersion === datasetVersion
                        ? {
                            datasetSemanticSnapshot: null,
                            semanticStatus: 'fallback',
                            semanticDatasetVersion: datasetVersion,
                            columnRegistry: buildRegistryForDataset(targetDataset, effectiveColumns, null),
                        }
                        : {});
                    return null;
                }

                console.log(`[Perf:Semantic] Annotation completed: ${Math.round(performance.now() - semanticStart)}ms, ${targetDataset.data.length} rows`);
                const tSemanticSet = performance.now();
                snapshot = preserveAcceptedFactMembership(snapshot, targetDataset, get());
                const semanticRegistry = buildRegistryForDataset(targetDataset, effectiveColumns, snapshot);
                console.log(`[Perf:Semantic] buildRegistryForDataset (post-annotation): ${Math.round(performance.now() - tSemanticSet)}ms`);
                const tSemanticStateUpdate = performance.now();
                set(s => s.semanticDatasetVersion === datasetVersion
                    ? {
                        datasetSemanticSnapshot: snapshot,
                        semanticStatus: 'ready',
                        semanticDatasetVersion: datasetVersion,
                        columnRegistry: semanticRegistry,
                    }
                    : {});
                console.log(`[Perf:Semantic] set(snapshot+registry): ${Math.round(performance.now() - tSemanticStateUpdate)}ms`);

                const hiddenRowCount = getSemanticHiddenRowCount(snapshot, datasetVersion, targetDataset);
                if (hiddenRowCount > 0 && get().semanticDatasetVersion === datasetVersion) {
                    get().addProgress(`AI semantic view prepared. ${formatCount(hiddenRowCount)} non-detail ${pluralizeCount(hiddenRowCount, 'row')} will be hidden by default.`, 'system', snapshot.modelId);
                }
                return snapshot;
            })();

            inFlightSemanticScope = sessionScope;
            inFlightSemanticOwner = owned;
            inFlightSemanticSnapshot = semanticPromise;
            inFlightSemanticDatasetVersion = datasetVersion;
            try {
                return await semanticPromise;
            } finally {
                if (inFlightSemanticSnapshot === semanticPromise) {
                    inFlightSemanticSnapshot = null;
                    inFlightSemanticDatasetVersion = null;
                }
            }
        },

        refreshDuckDbSession,

        promoteToCanonicalDataset: ({ reason, reshapeProvenance }) => {
            const currentData = get().csvData;
            if (!currentData) return;

            const columns = buildRegistryForDataset(currentData)?.columns.map(entry => entry.physicalName) ?? [];
            set({
                canonicalCsvData: currentData,
                canonicalBuildMeta: {
                    shape: 'long_fact_table',
                    source: 'analysis_reshape',
                    rowCount: currentData.data.length,
                    columnCount: columns.length,
                    lineageColumns: columns,
                    summary: reason,
                    excludedRowCounts: {},
                    carryForwardAppliedCounts: {},
                    footerTotalsMatched: null,
                    reshapeProvenance,
                },
                canonicalizationStatus: 'ready',
                // DATA-603: reset semantic snapshot so it rebuilds against the long table
                datasetSemanticSnapshot: null,
                semanticStatus: 'idle',
                semanticDatasetVersion: null,
                columnRegistry: buildRegistryForDataset(currentData, get().columnProfiles, null),
            });
        },

        runWorkspaceDataQuery: async (payload, expectedSource) => {
            const ownedStore = scopeCurrentExecution(storeApi);
            const { getState: get, setState: set } = ownedStore;
            const admitted = get();
            const assertQuerySource = () => {
                const current = get();
                if (!ownedStore.isActive?.()) throw new Error('The session was replaced.');
                if (expectedSource && (current.sessionId !== expectedSource.sessionId || current.sessionId !== admitted.sessionId
                    || current.csvData !== admitted.csvData || current.canonicalCsvData !== admitted.canonicalCsvData)) {
                    throw new Error('workspace_query_source_changed');
                }
            };
            const [
                { getPreferredAnalysisDataset },
                { resolveDatasetBindingTarget, isDuckDbSessionCurrentForDataset },
                { compileWorkspaceDataQuery },
                { executeStructuredDataQuery },
            ] = await Promise.all([
                import('../../services/agent/reportStructureState'),
                import('../../services/agent/datasetBinding'),
                import('../../services/agent/execution/workspaceDataQuery'),
                import('../../services/agent/execution/dataQueryExecution'),
            ]);
            assertQuerySource();

            const resolveCurrentWorkspaceTarget = () => {
                const currentState = get();
                const preferredDataset = getPreferredAnalysisDataset(currentState);
                return {
                    state: currentState,
                    bindingTarget: resolveDatasetBindingTarget({
                        mode: 'workspace',
                        csvData: preferredDataset,
                        snapshot: currentState.datasetSemanticSnapshot,
                        semanticDatasetVersion: currentState.semanticDatasetVersion,
                    }),
                };
            };
            let { state, bindingTarget } = resolveCurrentWorkspaceTarget();
            if (!bindingTarget) throw new Error('Load a dataset before running an analyst workspace query.');
            if (expectedSource && bindingTarget.dataset !== expectedSource.dataset) throw new Error('workspace_query_source_changed');
            let sessionStatus = state.duckDbSessionStatus;

            for (let attempt = 0; attempt < 2; attempt += 1) {
                if (sessionStatus.status === 'ready' && isDuckDbSessionCurrentForDataset(sessionStatus, bindingTarget.dataset)) {
                    break;
                }
                sessionStatus = await get().refreshDuckDbSession(bindingTarget.dataset, undefined, undefined, assertQuerySource);
                assertQuerySource();

                const latest = resolveCurrentWorkspaceTarget();
                if (!latest.bindingTarget) {
                    throw new Error('Load a dataset before running an analyst workspace query.');
                }
                state = latest.state;
                if (latest.bindingTarget.datasetVersion !== bindingTarget.datasetVersion) {
                    bindingTarget = latest.bindingTarget;
                    sessionStatus = get().duckDbSessionStatus;
                    continue;
                }
                break;
            }
            if (sessionStatus.status !== 'ready' || !isDuckDbSessionCurrentForDataset(sessionStatus, bindingTarget.dataset)) {
                throw new Error('DuckDB session is not ready. Rebind the session and retry.');
            }

            const columnRegistry = buildRegistryForDataset(bindingTarget.dataset);
            const compiled = compileWorkspaceDataQuery(
                payload,
                {
                    selectableColumns: getAllowedColumns(columnRegistry, 'select').length > 0
                        ? getAllowedColumns(columnRegistry, 'select')
                        : state.columnProfiles.map(p => p.name),
                    groupableColumns: getAllowedColumns(columnRegistry, 'groupBy'),
                },
            );
            let committedTrace: QueryTraceEntry | null = null;
            const query = await executeStructuredDataQuery(ownedStore, {
                datasetOverride: bindingTarget.dataset,
                explanation: compiled.explanation,
                plan: compiled.plan,
                phase: 'analysis',
                origin: 'workspace',
                columnRegistryOverride: columnRegistry,
                templateId: compiled.templateId,
                formSnapshot: compiled.formSnapshot,
                policyReason: 'Database analyst workspace',
                toolCategory: 'data',
                appendChatTrace: false,
                appendCleaningRunTrace: false,
                scrollToRawDataExplorer: false,
                allowNativeFallback: false,
                progressMessage: `Running analyst workspace query: ${compiled.explanation}`,
                onTraceCommitted: trace => {
                    committedTrace = trace;
                },
            });
            const committedState = get();
            const committedTraceId = committedTrace?.id;
            const activeQueryCommitted = committedState.activeDataQuery === query;
            const historyCommitted = Boolean(
                committedTraceId
                && committedState.queryHistory.some(entry => entry.id === committedTraceId),
            );
            if (!activeQueryCommitted || !historyCommitted || !committedTraceId) {
                committedState.logAgentToolUsage({
                    tool: 'data.query',
                    description: 'Workspace query result was not committed.',
                    detail: {
                        errorCode: 'query_result_not_committed',
                        activeQueryCommitted,
                        historyCommitted,
                        templateId: payload.templateId,
                        loadVersion: query.loadVersion,
                    },
                });
                throw new Error('query_result_not_committed: The query finished, but its result was not committed. Retry the query.');
            }
            return {
                query,
                traceId: committedTraceId,
                committedAt: new Date(committedTrace.appliedAt),
            };
        },

        resumeCleaningRun: async () => {
            const ownedStore = scopeCurrentExecution(storeApi);
            const { getState: get, setState: set } = ownedStore;
            const [
                { updateAgentTaskStatus },
                { orchestrateAutonomousAiCleaning },
                { getPreferredAnalysisDataset },
                { DEFAULT_AUTO_ANALYSIS_GOAL },
            ] = await Promise.all([
                import('../../services/agent/monitoring/agentMonitor'),
                import('../../services/agent/orchestration/autonomousCleaningPipeline'),
                import('../../services/agent/reportStructureState'),
                import('../../services/agent/analysisDefaults'),
            ]);
            if (!ownedStore.isActive?.()) return;

            updateAgentTaskStatus(ownedStore, {
                status: 'thinking', title: 'Resuming cleaning', titleKey: 'ai_task_cleaning_title',
                subtitle: 'Continuing cleaning run...', totalSteps: 4, currentStep: 1,
            });
            try {
                await orchestrateAutonomousAiCleaning(ownedStore, { resume: true });
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Cleaning failed unexpectedly.';
                updateAgentTaskStatus(ownedStore, {
                    status: 'error', title: 'Cleaning failed', titleKey: 'ai_task_cleaning_failed',
                    subtitle: errorMessage, totalSteps: 4, currentStep: 1, error: errorMessage,
                });
                return;
            }
            if (get().cleaningRun?.status !== 'completed') {
                const errorMessage = get().cleaningRun?.userFacingMessage ?? get().cleaningRun?.lastError ?? 'Cleaning did not complete.';
                const technicalDetail = get().cleaningRun?.technicalDetail ?? get().cleaningRun?.lastError ?? errorMessage;
                updateAgentTaskStatus(ownedStore, {
                    status: 'error', title: 'Cleaning failed', titleKey: 'ai_task_cleaning_failed',
                    subtitle: errorMessage, totalSteps: 4, currentStep: 1, error: technicalDetail,
                });
            }
            if (get().cleaningRun?.status === 'completed' && get().csvData) {
                const transitionStart = performance.now();
                await rebuildStructureArtifacts(undefined, ownedStore);
                if (!ownedStore.isActive?.()) return;
                const analysisDataset = getPreferredAnalysisDataset(get());
                if (!ownedStore.isActive?.()) return;
                duckDbWorkerClient.initDuckDb(DUCKDB_INIT_TIMEOUT_MS).catch(() => {});
                await get().ensureDatasetSemanticSnapshot(analysisDataset);
                await get().refreshDuckDbSession();
                console.log(`[Perf:PostClean] resume cleaning→analysis-ready: ${Math.round(performance.now() - transitionStart)}ms`);
                if (analysisDataset) {
                    const pipelineOutcome = get().pipelineOutcome;
                    if (pipelineOutcome?.status === 'ready' || pipelineOutcome?.status === 'degraded_but_usable') {
                        const goal = get().confirmedAnalysisGoal ?? DEFAULT_AUTO_ANALYSIS_GOAL;
                        const analysisOutcome = await get().handleInitialAnalysis(analysisDataset, goal, { trigger: 'automatic' });
                        if (analysisOutcome.status !== 'paused' && analysisOutcome.status !== 'error') {
                            await proposeGoalsAfterAnalysisSummaries(analysisDataset, analysisOutcome, ownedStore);
                        }
                    } else {
                        await proposeGoalsAfterAnalysisSummaries(analysisDataset, undefined, ownedStore);
                    }
                }
            }
        },

        revertToOriginal: async () => {
            const ownedStore = scopeCurrentExecution(storeApi);
            const { getState: get, setState: set } = ownedStore;
            const [
                { createCleaningRun },
                { WORKSPACE_DATASET_CLEAN_CSV, WORKSPACE_DATASET_RAW_CSV, buildWorkspaceCsv },
            ] = await Promise.all([
                import('../../services/agent/cleaningRunState'),
                import('../../services/agent/workspaceFileUtils'),
            ]);
            if (!ownedStore.isActive?.()) return;

            const sessionId = get().sessionId;
            let originalData = sessionId ? await getOriginalData(sessionId) : null;
            if (!originalData) originalData = get().rawCsvData;
            if (!originalData) { get().addProgress(getTranslation('data_restore_unavailable', get().settings.language), 'error'); return; }

            const restoredData = cloneCsvData(originalData);
            const profileResult = await profileDataWithWorker(restoredData.data);
            const restoredRegistry = buildRegistryForDataset(restoredData, profileResult.profiles, null);
            set(prev => ({
                csvData: restoredData, canonicalCsvData: null, canonicalBuildMeta: null,
                canonicalizationStatus: 'idle', pipelineOutcome: null, reportStructureResolution: null,
                initialAnalysisFailureKind: null, initialAnalysisPlan: null,
                columnProfiles: profileResult.profiles, columnRegistry: restoredRegistry, datasetSemanticSnapshot: null,
                semanticStatus: 'idle', semanticDatasetVersion: null, activeDataQuery: null,
                activeMetricMappingValidation: null, activeSpreadsheetFilter: null,
                spreadsheetFilterFunction: null, aiFilterExplanation: null, queryHistory: [],
                analysisCards: [], activeAnalysisSession: null, latestAnalysisSession: null,
                visibleAnalysisTrace: [], finalSummary: null, aiCoreAnalysisSummary: null,
                duckDbSessionStatus: createBindingDuckDbSessionStatus(get().duckDbSessionStatus),
                reportGenerationProgress: null, isGeneratingReport: false,
                workspaceFiles: {
                    ...(prev.workspaceFiles ?? {}),
                    [WORKSPACE_DATASET_RAW_CSV]: buildWorkspaceCsv(restoredData),
                    [WORKSPACE_DATASET_CLEAN_CSV]: buildWorkspaceCsv(restoredData),
                },
                dataPreparationPlan: {
                    explanation: getTranslation('data_restore_explanation', get().settings.language),
                    operations: [], outputColumns: profileResult.profiles,
                    planStatus: 'schema_only', consistencyIssues: [],
                },
                cleaningRun: createCleaningRun(),
            }));
            get().addProgress(getTranslation('data_restore_success', get().settings.language));
            await get().refreshDuckDbSession();
        },

        restartCleaningRun: async () => {
            const ownedStore = scopeCurrentExecution(storeApi);
            const { getState: get, setState: set } = ownedStore;
            const [
                { createCleaningRun },
                { WORKSPACE_DATASET_CLEAN_CSV, WORKSPACE_DATASET_RAW_CSV, buildWorkspaceCsv },
                { updateAgentTaskStatus },
                { orchestrateAutonomousAiCleaning },
                { getPreferredAnalysisDataset },
                { DEFAULT_AUTO_ANALYSIS_GOAL },
            ] = await Promise.all([
                import('../../services/agent/cleaningRunState'),
                import('../../services/agent/workspaceFileUtils'),
                import('../../services/agent/monitoring/agentMonitor'),
                import('../../services/agent/orchestration/autonomousCleaningPipeline'),
                import('../../services/agent/reportStructureState'),
                import('../../services/agent/analysisDefaults'),
            ]);
            if (!ownedStore.isActive?.()) return;

            const rawCsvData = get().rawCsvData;
            if (!rawCsvData) { get().addProgress('Cannot restart cleaning because the original dataset is unavailable.', 'error'); return; }

            const currentState = get();
            const preferredDataset = getPreferredAnalysisDataset(currentState) ?? rawCsvData;
            const preferredWasCanonical = Boolean(currentState.canonicalCsvData && preferredDataset === currentState.canonicalCsvData);
            const resetCsvData = cloneCsvData(preferredDataset);
            const profileResult = await profileDataWithWorker(resetCsvData.data);
            const resetRegistry = buildRegistryForDataset(resetCsvData, profileResult.profiles, null);
            set(prev => ({
                csvData: resetCsvData,
                canonicalCsvData: preferredWasCanonical ? resetCsvData : null,
                canonicalBuildMeta: preferredWasCanonical ? prev.canonicalBuildMeta : null,
                canonicalizationStatus: preferredWasCanonical ? prev.canonicalizationStatus : 'idle',
                pipelineOutcome: null,
                reportStructureResolution: prev.reportStructureResolution,
                columnProfiles: profileResult.profiles, columnRegistry: resetRegistry, datasetSemanticSnapshot: null,
                semanticStatus: 'idle', semanticDatasetVersion: null, activeDataQuery: null,
                activeMetricMappingValidation: null, activeSpreadsheetFilter: null,
                spreadsheetFilterFunction: null, aiFilterExplanation: null, queryHistory: [],
                analysisCards: [], activeAnalysisSession: null, latestAnalysisSession: null,
                visibleAnalysisTrace: [], finalSummary: null, aiCoreAnalysisSummary: null,
                duckDbSessionStatus: createBindingDuckDbSessionStatus(get().duckDbSessionStatus),
                reportGenerationProgress: null, isGeneratingReport: false,
                workspaceFiles: {
                    ...(prev.workspaceFiles ?? {}),
                    [WORKSPACE_DATASET_RAW_CSV]: buildWorkspaceCsv(rawCsvData),
                    [WORKSPACE_DATASET_CLEAN_CSV]: buildWorkspaceCsv(resetCsvData),
                },
                dataPreparationPlan: {
                    explanation: 'AI-first cleaning session restarted. cleaned.csv has been reset to a fresh writable copy of the current prepared dataset snapshot.',
                    operations: [], outputColumns: profileResult.profiles,
                    planStatus: 'schema_only', consistencyIssues: [],
                },
                cleaningRun: createCleaningRun(),
            }));
            get().addProgress('Cleaning workflow reset to the current prepared dataset snapshot.');
            await persistCurrentSessionSnapshot('restart cleaning', ownedStore);
            await get().refreshDuckDbSession();
            updateAgentTaskStatus(ownedStore, {
                status: 'thinking', title: 'Restarting cleaning', titleKey: 'ai_task_cleaning_title',
                subtitle: 'Restarting cleaning run from the current prepared dataset...', totalSteps: 4, currentStep: 1,
            });
            try {
                await orchestrateAutonomousAiCleaning(ownedStore);
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Cleaning failed unexpectedly.';
                updateAgentTaskStatus(ownedStore, {
                    status: 'error', title: 'Cleaning failed', titleKey: 'ai_task_cleaning_failed',
                    subtitle: errorMessage, totalSteps: 4, currentStep: 1, error: errorMessage,
                });
                return;
            }
            if (get().cleaningRun?.status !== 'completed') {
                const errorMessage = get().cleaningRun?.userFacingMessage ?? get().cleaningRun?.lastError ?? 'Cleaning did not complete.';
                const technicalDetail = get().cleaningRun?.technicalDetail ?? get().cleaningRun?.lastError ?? errorMessage;
                updateAgentTaskStatus(ownedStore, {
                    status: 'error', title: 'Cleaning failed', titleKey: 'ai_task_cleaning_failed',
                    subtitle: errorMessage, totalSteps: 4, currentStep: 1, error: technicalDetail,
                });
            }
            if (get().cleaningRun?.status === 'completed' && get().csvData) {
                const transitionStart = performance.now();
                await rebuildStructureArtifacts(undefined, ownedStore);
                if (!ownedStore.isActive?.()) return;
                const analysisDataset = getPreferredAnalysisDataset(get());
                if (!ownedStore.isActive?.()) return;
                duckDbWorkerClient.initDuckDb(DUCKDB_INIT_TIMEOUT_MS).catch(() => {});
                await get().ensureDatasetSemanticSnapshot(analysisDataset);
                await get().refreshDuckDbSession();
                console.log(`[Perf:PostClean] restart cleaning→analysis-ready: ${Math.round(performance.now() - transitionStart)}ms`);
                if (analysisDataset) {
                    const pipelineOutcome = get().pipelineOutcome;
                    if (pipelineOutcome?.status === 'ready' || pipelineOutcome?.status === 'degraded_but_usable') {
                        const goal = get().confirmedAnalysisGoal ?? DEFAULT_AUTO_ANALYSIS_GOAL;
                        const analysisOutcome = await get().handleInitialAnalysis(analysisDataset, goal, { trigger: 'automatic' });
                        if (analysisOutcome.status !== 'paused' && analysisOutcome.status !== 'error') {
                            await proposeGoalsAfterAnalysisSummaries(analysisDataset, analysisOutcome, ownedStore);
                        }
                    } else {
                        await proposeGoalsAfterAnalysisSummaries(analysisDataset, undefined, ownedStore);
                    }
                }
            }
        },

        prepareStructureRepairReview: async () => {
            const owner = scopeCurrentExecution(storeApi);
            const { prepareStructureRepairReview } = await import('../../services/agent/structureRepairConfirmation');
            return prepareStructureRepairReview(owner);
        },
        confirmStructureRepairMeaning: async (reviewId, choice, rendered) => {
            const owner = scopeCurrentExecution(storeApi);
            const { confirmStructureRepairMeaning } = await import('../../services/agent/structureRepairConfirmation');
            await confirmStructureRepairMeaning(owner, reviewId, choice, rendered);
        },
        resumeStructureRepairDraft: async (reviewId) => {
            const owner = scopeCurrentExecution(storeApi);
            const { resumeStructureRepairDraft } = await import('../../services/agent/structureRepairConfirmation');
            await resumeStructureRepairDraft(owner, reviewId);
        },
        continueStructureRepairAnalysis: async (reviewId, rendered) => {
            const owner = scopeCurrentExecution(storeApi);
            const { continueStructureRepairAnalysis } = await import('../../services/agent/structureRepairConfirmation');
            await continueStructureRepairAnalysis(owner, reviewId, rendered);
        },
        cancelStructureRepairReview: (reviewId, onlyIfReviewing) => cancelStructureRepairReview(storeApi, reviewId, onlyIfReviewing),
        saveReportStructureBoundaryOverride: async (boundary) => {
            const ownedStore = scopeCurrentExecution(storeApi);
            const { getState: get, setState: set } = ownedStore;
            const { assertLegacyBoundaryAllowed, captureLegacyBoundaryFence } = await import('../../services/agent/structureRepairConfirmation');
            if (!ownedStore.isActive?.()) return;
            const fence = captureLegacyBoundaryFence(ownedStore);
            fence();
            await assertLegacyBoundaryAllowed(ownedStore);
            fence();
            const [
                { getPreferredAnalysisDataset },
                { resolveAnalysisDatasetProfiles },
                { DEFAULT_AUTO_ANALYSIS_GOAL },
            ] = await Promise.all([
                import('../../services/agent/reportStructureState'),
                import('../../services/agent/analysisDatasetProfiles'),
                import('../../services/agent/analysisDefaults'),
            ]);
            if (!ownedStore.isActive?.()) return;

            fence();
            await assertLegacyBoundaryAllowed(ownedStore);
            fence();
            if (!await rebuildStructureArtifacts(boundary, ownedStore, fence)) return;
            if (ownedStore.isActive?.() === false) return;
            fence();
            const publishedVersion = getCurrentAnalysisDatasetVersion(get());
            const downstreamFence = () => {
                fence();
                if (getCurrentAnalysisDatasetVersion(get()) !== publishedVersion) throw new Error('repair_source_changed');
            };
            // Close the modal immediately after rebuilding — analysis runs in the background.
            get().setIsReportBoundaryConfirmModalOpen(false);
            const pipelineOutcome = get().pipelineOutcome;
            const structureAccepted = pipelineOutcome?.status === 'ready'
                || pipelineOutcome?.status === 'degraded_but_usable';
            get().recordAgentEvent({
                phase: 'file',
                step: 'structure_confirmation_applied',
                status: structureAccepted ? 'done' : 'error',
                message: structureAccepted
                    ? 'The confirmed report boundary was applied to the prepared dataset.'
                    : 'The boundary confirmation was saved, but remaining verification issues still limit automatic analysis.',
                activity: {
                    kind: 'approval',
                    lifecycle: structureAccepted ? 'completed' : 'degraded',
                    source: 'approval',
                    eventType: 'structure_confirmation_applied',
                    title: structureAccepted ? 'Structure confirmed' : 'Structure confirmation degraded',
                    explanation: pipelineOutcome?.message,
                },
            });
            if (pipelineOutcome?.status === 'ready' || pipelineOutcome?.status === 'degraded_but_usable') {
                const analysisDataset = getPreferredAnalysisDataset(get());
                if (analysisDataset) {
                    const resolvedProfiles = resolveAnalysisDatasetProfiles(analysisDataset, get().columnProfiles);
                    set({
                        columnProfiles: resolvedProfiles,
                        columnRegistry: buildRegistryForDataset(analysisDataset, resolvedProfiles, get().datasetSemanticSnapshot),
                    });
                    if (!ownedStore.isActive?.()) return;
                    downstreamFence();
                    duckDbWorkerClient.initDuckDb(DUCKDB_INIT_TIMEOUT_MS).catch(() => {});
                    await get().ensureDatasetSemanticSnapshot(analysisDataset, { force: true, assertCurrent: downstreamFence });
                    downstreamFence();
                    await get().refreshDuckDbSession(undefined, undefined, undefined, downstreamFence);
                    downstreamFence();
                    const goal = get().confirmedAnalysisGoal ?? DEFAULT_AUTO_ANALYSIS_GOAL;
                    const analysisOutcome = await get().handleInitialAnalysis(analysisDataset, goal, { trigger: 'manual' });
                    downstreamFence();
                    if (analysisOutcome.status !== 'paused' && analysisOutcome.status !== 'error') {
                        await proposeGoalsAfterAnalysisSummaries(analysisDataset, analysisOutcome, ownedStore, downstreamFence);
                        downstreamFence();
                    }
                }
                get().addProgress('Report structure was confirmed and canonical data is ready for analysis.');
            } else {
                // The outcome message is a technical English string and the reason is an internal code;
                // the progress log is user-facing, so show the plain explanation.
                const plainText = getPipelineOutcomeUserText(pipelineOutcome, get().settings.language);
                get().addProgress(
                    plainText ?? pipelineOutcome?.message ?? 'Report structure review was saved.',
                    pipelineOutcome?.severity === 'blocked' ? 'warning' : 'system',
                );
            }
        },

        setColumnAnnotation: (annotation) => {
            set(prev => ({
                userColumnAnnotations: {
                    ...prev.userColumnAnnotations,
                    [annotation.columnName]: annotation,
                },
                columnRegistry: buildColumnRegistry({
                    data: prev.canonicalCsvData ?? prev.csvData,
                    columnProfiles: prev.columnProfiles,
                    semanticSnapshot: prev.datasetSemanticSnapshot,
                    userColumnAnnotations: {
                        ...prev.userColumnAnnotations,
                        [annotation.columnName]: annotation,
                    },
                    steering: prev.latestAnalysisSession?.analysisSteering,
                    existingRegistry: prev.columnRegistry,
                }),
            }));
            // Write to vector memory in the background.
            void import('../../services/agent/memory/vectorMemorySync').then(m =>
                m.upsertColumnAnnotationDoc(storeApi as never, annotation),
            );
        },

        removeColumnAnnotation: (columnName) => {
            set(prev => {
                const next = { ...prev.userColumnAnnotations };
                delete next[columnName];
                return {
                    userColumnAnnotations: next,
                    columnRegistry: buildColumnRegistry({
                        data: prev.canonicalCsvData ?? prev.csvData,
                        columnProfiles: prev.columnProfiles,
                        semanticSnapshot: prev.datasetSemanticSnapshot,
                        userColumnAnnotations: next,
                        steering: prev.latestAnalysisSession?.analysisSteering,
                        existingRegistry: prev.columnRegistry,
                    }),
                };
            });
            void import('../../services/agent/memory/vectorMemorySync').then(m =>
                m.removeColumnAnnotationDoc(storeApi as never, columnName),
            );
        },
    };
};
