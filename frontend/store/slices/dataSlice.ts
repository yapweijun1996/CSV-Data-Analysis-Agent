
// Agent and AI modules are loaded dynamically (via import()) to keep the
// app-agent chunk out of the cold-start import graph.  Every action handler
// is async, so dynamic imports add no API friction.

import type { StateCreator } from 'zustand';
import { flushSync } from 'react-dom';
import type { AppStore } from '../useAppStore';
import { getTranslation } from '../../utils/localization';
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

export interface IDataSlice {
    addProgress: (message: string, type?: 'system' | 'warning' | 'error', model?: string) => void;
    handleInitialAnalysis: (dataForAnalysis: CsvData, goal: string, options?: { trigger?: 'automatic' | 'manual' }) => Promise<InitialAnalysisOutcome>;
    proposeAnalysisGoals: (dataForAnalysis: CsvData) => Promise<void>;
    handleFileUpload: (file: File) => Promise<void>;
    ingestExternalCsvPayload: (event: ExternalCsvPayloadEvent) => Promise<void>;
    regenerateAnalyses: (newData: CsvData) => Promise<void>;
    reproposeAnalysisGoals: () => void;
    resumeCleaningRun: () => Promise<void>;
    restartCleaningRun: () => Promise<void>;
    revertToOriginal: () => Promise<void>;
    ensureDatasetSemanticSnapshot: (dataset?: CsvData | null, options?: { force?: boolean }) => Promise<DatasetSemanticSnapshot | null>;
    refreshDuckDbSession: (datasetOverride?: CsvData | null) => Promise<DuckDbSessionStatus>;
    promoteToCanonicalDataset: (options: { reason: string; reshapeProvenance: CanonicalReshapeProvenance }) => void;
    runWorkspaceDataQuery: (payload: WorkspaceDataQueryRequest) => Promise<WorkspaceQueryRunOutcome>;
    saveReportStructureBoundaryOverride: (boundary: ReportBoundary) => Promise<void>;
    setColumnAnnotation: (annotation: UserColumnAnnotation) => void;
    removeColumnAnnotation: (columnName: string) => void;
}

export const resolvePendingDatasetBundleRestore = (
    state: Pick<AppStore, 'csvData' | 'datasetBundle'>,
): DatasetBundle | null => !state.csvData ? state.datasetBundle : null;

export const createDataSlice: StateCreator<AppStore, [], [], IDataSlice> = (set, get) => {
    const storeApi = { getState: get, setState: set };
    let inFlightSemanticSnapshot: Promise<DatasetSemanticSnapshot | null> | null = null;
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

    const persistCurrentSessionSnapshot = async (reason: string) => {
        const state = get();
        if (!state.sessionId || !state.csvData || state.csvData.data.length === 0) {
            return;
        }

        try {
            const [
                { buildPersistedReportRecord },
                { CURRENT_SESSION_KEY, saveReport },
            ] = await Promise.all([
                import('../../services/persistence/persistedAppState'),
                import('../../services/storageService'),
            ]);

            const currentReport = buildPersistedReportRecord(state, {
                id: state.sessionId,
                filename: state.csvData.fileName || 'Current Session',
            });

            await saveReport(currentReport);
            await saveReport({
                ...currentReport,
                id: CURRENT_SESSION_KEY,
            });
        } catch (error) {
            console.warn(`[DataSlice] Failed to persist the current session snapshot after ${reason}.`, error);
        }
    };

    const proposeGoalsAfterAnalysisSummaries = async (
        analysisDataset: CsvData,
        analysisOutcome?: InitialAnalysisOutcome | null,
    ) => {
        if (analysisOutcome?.summaryPromise) {
            await analysisOutcome.summaryPromise;
        }
        await get().proposeAnalysisGoals(analysisDataset);
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

    const refreshDuckDbSession = async (datasetOverride?: CsvData | null): Promise<DuckDbSessionStatus> => {
        const t0 = performance.now();
        const {
            getPreferredAnalysisDataset,
            resolveDatasetBindingTarget,
            isDuckDbSessionCurrentForDataset,
        } = await getDuckDbRefreshHelpers();
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
            inFlightDuckDbSessionRefresh
            && inFlightDuckDbSessionDatasetVersion === bindingTarget.datasetVersion
        ) {
            console.log(`[Perf:RefreshDuckDb] reusing in-flight refresh for ${bindingTarget.datasetVersion}`);
            return inFlightDuckDbSessionRefresh;
        }

        const refreshPromise = (async (): Promise<DuckDbSessionStatus> => {
            const reportDiagnostics = createWorkerDiagnosticsTelemetryReporter(storeApi);

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
                undefined,
                reportDiagnostics,
                undefined,
                registry,
            );
            console.log(`[Perf:RefreshDuckDb] primeDuckDbDataset (await): ${Math.round(performance.now() - t3)}ms`);

            const t4 = performance.now();
            const nextStatus = binding
                ? createDuckDbSessionStatusFromBinding(binding)
                : createIdleDuckDbSessionStatus();
            if (!isDuckDbSessionStatusEqual(get().duckDbSessionStatus, nextStatus)) {
                set({ duckDbSessionStatus: nextStatus });
            }
            console.log(`[Perf:RefreshDuckDb] set(duckDbSessionStatus): ${Math.round(performance.now() - t4)}ms`);
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

    const rebuildStructureArtifacts = async (humanBoundary?: ReportBoundary | null) => {
        const [
            { resolveReportStructureArtifactsWithProposal },
            { getPreferredAnalysisDataset },
            { buildSemanticDatasetVersion },
        ] = await Promise.all([
            import('../../services/agent/orchestration/reportStructureOrchestrator'),
            import('../../services/agent/reportStructureState'),
            import('../../services/agent/datasetSemantics'),
        ]);
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
        const prevPreferred = getPreferredAnalysisDataset(get());
        const nextPreferred = artifacts.canonicalCsvData ?? get().csvData;
        const prevVersion = prevPreferred ? buildSemanticDatasetVersion(prevPreferred) : null;
        const nextVersion = nextPreferred ? buildSemanticDatasetVersion(nextPreferred) : null;
        const datasetVersionChanged = prevVersion !== nextVersion;

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
    };

    const runFilePipeline = async (file: File) => {
        // Capture restore intent before the synchronous intake lock installs an
        // empty CsvData placeholder. Reading it afterwards makes every restore
        // look like a fresh import and can carry unrelated session state into
        // the newly selected dataset.
        const restoreBundle = resolvePendingDatasetBundleRestore(get());
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
            for await (const update of orchestrateFileUpload(file, storeApi, { restoreBundle, restoreSnapshot })) {
                switch (update.type) {
                    case 'progress':
                        get().addProgress(update.message, update.messageType, update.model);
                        break;
                    case 'state':
                        if (update.payload.currentView === 'analysis_dashboard' && update.payload.csvData) {
                            // This import boundary also switches from the small
                            // landing tree to the lazy analysis workspace. Force
                            // that one critical commit before Pi starts so
                            // WebKit cannot retain the stale upload screen while
                            // the analysis microtask chain is running.
                            flushSync(() => set(update.payload));
                        } else {
                            set(update.payload);
                        }
                        break;
                }
            }
        } catch (error) {
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
        addProgress: (message: string, type: 'system' | 'warning' | 'error' = 'system', model?: string) => {
            const newMessage: ProgressMessage = createProgressMessage({ text: message, type, timestamp: new Date(), model });
            set(state => ({ progressMessages: trimProgressMessages([...state.progressMessages, newMessage]) }));
        },

        handleInitialAnalysis: async (dataForAnalysis, goal, options) => {
            const { handleInitialAnalysis } = await import('../../services/agent/orchestration/initialAnalysisService');
            return handleInitialAnalysis(dataForAnalysis, goal, storeApi, options);
        },
        proposeAnalysisGoals: async (dataForAnalysis) => {
            const { proposeAnalysisGoals: proposeGoals } = await import('../../services/agent/planning/goalProposer');
            return proposeGoals(dataForAnalysis, storeApi);
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
            const { regenerateAnalysesWithNewData } = await import('../../services/agent/orchestration/sessionManager');
            await regenerateAnalysesWithNewData(newData, storeApi);
        },

        reproposeAnalysisGoals: async () => {
            const { reproposeAnalysisGoals: reproposeGoalsService } = await import('../../services/agent/orchestration/sessionManager');
            reproposeGoalsService(storeApi);
        },

        ensureDatasetSemanticSnapshot: async (dataset, options) => {
            const [
                { getPreferredAnalysisDataset },
                { buildSemanticDatasetVersion, isCurrentSemanticFallback, isSemanticSnapshotCurrent, getSemanticHiddenRowCount },
                { resolveAnalysisDatasetProfiles },
                { annotateDatasetSemantics },
            ] = await Promise.all([
                import('../../services/agent/reportStructureState'),
                import('../../services/agent/datasetSemantics'),
                import('../../services/agent/analysisDatasetProfiles'),
                import('../../services/ai/datasetSemanticAnnotator'),
            ]);

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
                if (get().semanticStatus !== 'ready') set({ semanticStatus: 'ready' });
                return existingSnapshot ?? null;
            }
            if (!options?.force && isCurrentSemanticFallback(
                get().semanticStatus,
                get().semanticDatasetVersion,
                datasetVersion,
            )) {
                return null;
            }
            if (!options?.force && inFlightSemanticSnapshot && inFlightSemanticDatasetVersion === datasetVersion) {
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
                        setTimeout(() => resolve(null), SEMANTIC_ANNOTATION_TIMEOUT_MS),
                    );
                    snapshot = await Promise.race([annotationPromise, timeoutPromise]);
                } catch (error) {
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
                }

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
                    get().addProgress(`AI semantic view prepared. ${hiddenRowCount} non-detail row(s) will be hidden by default.`, 'system', snapshot.modelId);
                }
                return snapshot;
            })();

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

        runWorkspaceDataQuery: async (payload) => {
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
            let sessionStatus = state.duckDbSessionStatus;

            for (let attempt = 0; attempt < 2; attempt += 1) {
                if (sessionStatus.status === 'ready' && isDuckDbSessionCurrentForDataset(sessionStatus, bindingTarget.dataset)) {
                    break;
                }
                sessionStatus = await refreshDuckDbSession(bindingTarget.dataset);

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
            const query = await executeStructuredDataQuery(storeApi, {
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

            updateAgentTaskStatus(storeApi, {
                status: 'thinking', title: 'Resuming cleaning', titleKey: 'ai_task_cleaning_title',
                subtitle: 'Continuing cleaning run...', totalSteps: 4, currentStep: 1,
            });
            try {
                await orchestrateAutonomousAiCleaning(storeApi, { resume: true });
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Cleaning failed unexpectedly.';
                updateAgentTaskStatus(storeApi, {
                    status: 'error', title: 'Cleaning failed', titleKey: 'ai_task_cleaning_failed',
                    subtitle: errorMessage, totalSteps: 4, currentStep: 1, error: errorMessage,
                });
                return;
            }
            if (get().cleaningRun?.status !== 'completed') {
                const errorMessage = get().cleaningRun?.userFacingMessage ?? get().cleaningRun?.lastError ?? 'Cleaning did not complete.';
                const technicalDetail = get().cleaningRun?.technicalDetail ?? get().cleaningRun?.lastError ?? errorMessage;
                updateAgentTaskStatus(storeApi, {
                    status: 'error', title: 'Cleaning failed', titleKey: 'ai_task_cleaning_failed',
                    subtitle: errorMessage, totalSteps: 4, currentStep: 1, error: technicalDetail,
                });
            }
            if (get().cleaningRun?.status === 'completed' && get().csvData) {
                const transitionStart = performance.now();
                await rebuildStructureArtifacts();
                const analysisDataset = getPreferredAnalysisDataset(get());
                duckDbWorkerClient.initDuckDb(DUCKDB_INIT_TIMEOUT_MS).catch(() => {});
                await get().ensureDatasetSemanticSnapshot(analysisDataset);
                await refreshDuckDbSession();
                console.log(`[Perf:PostClean] resume cleaning→analysis-ready: ${Math.round(performance.now() - transitionStart)}ms`);
                if (analysisDataset) {
                    const pipelineOutcome = get().pipelineOutcome;
                    if (pipelineOutcome?.status === 'ready' || pipelineOutcome?.status === 'degraded_but_usable') {
                        const goal = get().confirmedAnalysisGoal ?? DEFAULT_AUTO_ANALYSIS_GOAL;
                        const analysisOutcome = await get().handleInitialAnalysis(analysisDataset, goal, { trigger: 'automatic' });
                        if (analysisOutcome.status !== 'paused' && analysisOutcome.status !== 'error') {
                            await proposeGoalsAfterAnalysisSummaries(analysisDataset, analysisOutcome);
                        }
                    } else {
                        await proposeGoalsAfterAnalysisSummaries(analysisDataset);
                    }
                }
            }
        },

        revertToOriginal: async () => {
            const [
                { createCleaningRun },
                { WORKSPACE_DATASET_CLEAN_CSV, WORKSPACE_DATASET_RAW_CSV, buildWorkspaceCsv },
            ] = await Promise.all([
                import('../../services/agent/cleaningRunState'),
                import('../../services/agent/workspaceFileUtils'),
            ]);

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
            await refreshDuckDbSession();
        },

        restartCleaningRun: async () => {
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
            await persistCurrentSessionSnapshot('restart cleaning');
            await refreshDuckDbSession();
            updateAgentTaskStatus(storeApi, {
                status: 'thinking', title: 'Restarting cleaning', titleKey: 'ai_task_cleaning_title',
                subtitle: 'Restarting cleaning run from the current prepared dataset...', totalSteps: 4, currentStep: 1,
            });
            try {
                await orchestrateAutonomousAiCleaning(storeApi);
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Cleaning failed unexpectedly.';
                updateAgentTaskStatus(storeApi, {
                    status: 'error', title: 'Cleaning failed', titleKey: 'ai_task_cleaning_failed',
                    subtitle: errorMessage, totalSteps: 4, currentStep: 1, error: errorMessage,
                });
                return;
            }
            if (get().cleaningRun?.status !== 'completed') {
                const errorMessage = get().cleaningRun?.userFacingMessage ?? get().cleaningRun?.lastError ?? 'Cleaning did not complete.';
                const technicalDetail = get().cleaningRun?.technicalDetail ?? get().cleaningRun?.lastError ?? errorMessage;
                updateAgentTaskStatus(storeApi, {
                    status: 'error', title: 'Cleaning failed', titleKey: 'ai_task_cleaning_failed',
                    subtitle: errorMessage, totalSteps: 4, currentStep: 1, error: technicalDetail,
                });
            }
            if (get().cleaningRun?.status === 'completed' && get().csvData) {
                const transitionStart = performance.now();
                await rebuildStructureArtifacts();
                const analysisDataset = getPreferredAnalysisDataset(get());
                duckDbWorkerClient.initDuckDb(DUCKDB_INIT_TIMEOUT_MS).catch(() => {});
                await get().ensureDatasetSemanticSnapshot(analysisDataset);
                await refreshDuckDbSession();
                console.log(`[Perf:PostClean] restart cleaning→analysis-ready: ${Math.round(performance.now() - transitionStart)}ms`);
                if (analysisDataset) {
                    const pipelineOutcome = get().pipelineOutcome;
                    if (pipelineOutcome?.status === 'ready' || pipelineOutcome?.status === 'degraded_but_usable') {
                        const goal = get().confirmedAnalysisGoal ?? DEFAULT_AUTO_ANALYSIS_GOAL;
                        const analysisOutcome = await get().handleInitialAnalysis(analysisDataset, goal, { trigger: 'automatic' });
                        if (analysisOutcome.status !== 'paused' && analysisOutcome.status !== 'error') {
                            await proposeGoalsAfterAnalysisSummaries(analysisDataset, analysisOutcome);
                        }
                    } else {
                        await proposeGoalsAfterAnalysisSummaries(analysisDataset);
                    }
                }
            }
        },

        saveReportStructureBoundaryOverride: async (boundary) => {
            const [
                { getPreferredAnalysisDataset },
                { resolveAnalysisDatasetProfiles },
                { DEFAULT_AUTO_ANALYSIS_GOAL },
            ] = await Promise.all([
                import('../../services/agent/reportStructureState'),
                import('../../services/agent/analysisDatasetProfiles'),
                import('../../services/agent/analysisDefaults'),
            ]);

            await rebuildStructureArtifacts(boundary);
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
                    duckDbWorkerClient.initDuckDb(DUCKDB_INIT_TIMEOUT_MS).catch(() => {});
                    await get().ensureDatasetSemanticSnapshot(analysisDataset, { force: true });
                    await refreshDuckDbSession();
                    const goal = get().confirmedAnalysisGoal ?? DEFAULT_AUTO_ANALYSIS_GOAL;
                    const analysisOutcome = await get().handleInitialAnalysis(analysisDataset, goal, { trigger: 'manual' });
                    if (analysisOutcome.status !== 'paused' && analysisOutcome.status !== 'error') {
                        await proposeGoalsAfterAnalysisSummaries(analysisDataset, analysisOutcome);
                    }
                }
                get().addProgress('Report structure was confirmed and canonical data is ready for analysis.');
            } else {
                get().addProgress(pipelineOutcome?.message ?? 'Report structure review was saved.', pipelineOutcome?.severity === 'blocked' ? 'warning' : 'system');
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
