
import type { AppStore } from '../../../store/useAppStore';
import { CsvData, DatasetBundle } from '../../../types';
import { deleteReport, getReport, saveReport, CURRENT_SESSION_KEY, getAgentMemoryRuns, saveOriginalData } from '../../storageService';
import { vectorStore } from '../../vectorStore';
import { processAndCleanFile } from '../fileProcessor';
import { emitAgentEvent, updateAgentTaskStatus } from '../monitoring/agentMonitor';
import { isProviderConfigured } from '../../ai/providerConfig';
import { StoreApi } from '../types';
import { getTranslation } from '../../../utils/localization';
import { createCleaningRun } from '../cleaningRunState';
import { createChatMessage } from '../../../utils/messageState';
import { createBindingDuckDbSessionStatus, createIdleDuckDbSessionStatus } from '../../duckdb/sessionStatus';
import { getCsvDataRowCount, getCsvDatasetVersion } from '../../../utils/datasetId';
import { DUCKDB_INIT_TIMEOUT_MS } from '../../duckdb/queryEngine';
import { duckDbWorkerClient } from '../../workers/duckDbWorkerClient';
import { DEFAULT_AUTO_ANALYSIS_GOAL } from '../analysisDefaults';
import { getPreferredAnalysisDataset } from '../reportStructureState';
import { hasDeclinedCloudAiConsent } from '../../privacy/cloudAiConsent';
import { isInitialAnalysisProviderFailure } from '../runtime/pi/initialAnalysisFailure';
import { persistCurrentAppSessionSnapshot } from '../../persistence/currentSessionPersistence';
import { replayDatasetBundlePrograms } from '../../data/datasetBundleReplay';
import { canRestoreHistoryAnalysis, getRestoredHistoryAnalysisState, type HistoryAnalysisSnapshot } from './historyAnalysisRestore';
import { orchestrateAutonomousAiCleaning } from './autonomousCleaningPipeline';

// Define the update types the orchestrator can produce
export type FileOrchestrationUpdate = 
  | { type: 'progress'; message: string; messageType?: 'system' | 'warning' | 'error'; model?: string }
  | { type: 'state'; payload: Partial<AppStore> };

const LOG_PREFIX = '[FileOrchestrator]';

const yieldToBrowser = (): Promise<void> => new Promise(resolve => {
    if (typeof MessageChannel === 'undefined') {
        setTimeout(resolve, 0);
        return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
    };
    channel.port2.postMessage(undefined);
});

type FilePipelineStage =
    | 'import_ready'
    | 'duckdb_refresh'
    | 'vector_hydration'
    | 'cleaning'
    | 'structure_review'
    | 'semantic_annotation'
    | 'goal_proposal';

const emitFilePipelineEvent = (
    store: StoreApi,
    stage: FilePipelineStage,
    status: 'in_progress' | 'done' | 'error',
    message: string,
    detail?: Record<string, unknown>,
) => emitAgentEvent(store, {
    phase: 'file',
    step: `pipeline_${stage}`,
    status,
    message,
    detail,
});

const runPostImportPipeline = (
    store: StoreApi,
    datasetId: string,
    persistOriginalSnapshot: () => Promise<void>,
) => {
    const markCleaningTerminalFailure = (message: string) => {
        store.setState(prev => ({
            cleaningRun: prev.cleaningRun
                ? {
                    ...prev.cleaningRun,
                    status: 'failed',
                    lastError: message,
                    updatedAt: new Date(),
                    shouldAutoResume: false,
                }
                : prev.cleaningRun,
        }));
    };
    store.setState(prev => ({
        cleaningRun: prev.cleaningRun
            ? { ...prev.cleaningRun, status: 'running' }
            : prev.cleaningRun,
    }));
    emitFilePipelineEvent(
        store,
        'import_ready',
        'done',
        'The imported dataset is ready for governed automatic analysis.',
        { datasetId, runtimeOwner: 'pi' },
    );
    void (async () => {
        const state = store.getState();
        const dataset = getPreferredAnalysisDataset(state);
        if (!dataset) {
            const message = 'The imported dataset is unavailable for analysis.';
            markCleaningTerminalFailure(message);
            updateAgentTaskStatus(store, {
                status: 'error',
                title: 'Analysis failed',
                titleKey: 'ai_task_analysis_failed',
                subtitle: message,
                totalSteps: 1,
                currentStep: 1,
                error: message,
            });
            store.setState({
                isBusy: false,
                initialAnalysisStatus: 'error',
                initialAnalysisFailureKind: 'analysis',
            });
            emitFilePipelineEvent(store, 'goal_proposal', 'error', message);
            return;
        }

        emitFilePipelineEvent(
            store,
            'goal_proposal',
            'in_progress',
            'Pi Harness is running the governed initial analysis.',
            { datasetId, runtimeOwner: 'pi' },
        );
        try {
            const outcome = await state.handleInitialAnalysis(
                dataset,
                DEFAULT_AUTO_ANALYSIS_GOAL,
                { trigger: 'automatic' },
            );
            const failed = outcome.status === 'error';
            if (failed) {
                markCleaningTerminalFailure(
                    outcome.message ?? 'The governed initial analysis did not complete.',
                );
            }
            emitFilePipelineEvent(
                store,
                'goal_proposal',
                failed ? 'error' : 'done',
                outcome.message
                    ?? (outcome.status === 'degraded'
                        ? 'Automatic analysis completed with visible limitations.'
                        : 'Automatic analysis is ready.'),
                {
                    datasetId,
                    runtimeOwner: 'pi',
                    status: outcome.status,
                },
            );
            if (!failed && outcome.status !== 'paused') {
                const analysisDataset = getPreferredAnalysisDataset(
                    store.getState(),
                );
                if (analysisDataset) {
                    await store.getState().proposeAnalysisGoals(
                        analysisDataset,
                    );
                }
            }
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);
            markCleaningTerminalFailure(message);
            store.setState({
                isBusy: false,
                isGeneratingReport: false,
                initialAnalysisStatus: 'error',
                initialAnalysisFailureKind: isInitialAnalysisProviderFailure(error) ? 'provider' : 'analysis',
            });
            updateAgentTaskStatus(store, {
                status: 'error',
                title: 'Analysis failed',
                titleKey: 'ai_task_analysis_failed',
                subtitle: message,
                totalSteps: 1,
                currentStep: 1,
                error: message,
            });
            emitFilePipelineEvent(
                store,
                'goal_proposal',
                'error',
                `Unexpected initial-analysis error: ${message}`,
                { datasetId, runtimeOwner: 'pi' },
            );
        } finally {
            await persistOriginalSnapshot();
        }
    })();
};

/**
 * Yields updates to the caller so that core logic is decoupled from state management.
 * @param file The CSV file uploaded by the user.
 * @param store Zustand store API for accessing settings and other state.
 */
export async function* orchestrateFileUpload(
    file: File,
    store: StoreApi,
    options: { restoreBundle?: DatasetBundle | null; restoreSnapshot?: HistoryAnalysisSnapshot | null } = {},
): AsyncGenerator<FileOrchestrationUpdate, void, unknown> {
    const { getState, setState } = store;
    const _orchestrationStart = performance.now();
    console.log(`${LOG_PREFIX} Starting orchestration for file:`, file.name);
    if (getState().clearAgentEvents) {
        getState().clearAgentEvents();
    }
    if (getState().clearTelemetry) {
        getState().clearTelemetry();
    }
    emitAgentEvent(store, {
        phase: 'file',
        step: 'upload_received',
        status: 'in_progress',
        message: `Received file "${file.name}" and preparing ingestion.`,
        detail: { fileName: file.name, size: file.size },
    });
    // Lock intake before the first awaited storage operation. Async-generator
    // updates are not visible to the caller until the first yield, so leaving
    // this state deferred allowed startup maintenance to open competing
    // IndexedDB transactions on WebKit and made a valid upload look inert.
    setState({
        isBusy: true,
        csvData: { fileName: file.name, data: [] },
        currentView: 'file_upload',
    });
    console.log(`${LOG_PREFIX} Intake state locked.`, {
        currentView: getState().currentView,
        isBusy: getState().isBusy,
        fileName: getState().csvData?.fileName ?? null,
    });

    // Step 1: Handle session initialization
    if (getState().csvData?.data.length > 0) {
        const existingSession = await getReport(CURRENT_SESSION_KEY);
        if (existingSession) {
            await saveReport({ ...existingSession, id: `report-${existingSession.createdAt.getTime()}`, updatedAt: new Date() });
            console.log(`${LOG_PREFIX} Archived previous session.`);
        }
    }
    vectorStore.clear();
    await deleteReport(CURRENT_SESSION_KEY);

    // PERF-501: Start DuckDB WASM download + compile in the background immediately.
    // By the time cleaning finishes and the first prime is needed, the engine is
    // already warm — cutting ~25s off the first-query cold start.
    // Non-fatal: if this fails, primeDuckDbDataset() retries at first query time
    // and falls back to native engine gracefully.
    duckDbWorkerClient.initDuckDb(DUCKDB_INIT_TIMEOUT_MS).catch((error: unknown) => {
        console.warn(`${LOG_PREFIX} Background DuckDB init failed (will retry at first query):`, error instanceof Error ? error.message : error);
    });

    // PERF-506: Preload heavy analysis modules while CSV parsing + DuckDB WASM run.
    // reportStructureState has 8+ transitive imports that take ~4.6s to parse on
    // first load. Starting fetch+parse now — during file processing — ensures
    // modules are cached by the time refreshDuckDbSession needs them later.
    void Promise.all([
        import('../reportStructureState'),
        import('../datasetBinding'),
    ]);

    yield {
        type: 'state',
        payload: {
            ...getState(),
            isBusy: true,
            csvData: { fileName: file.name, data: [] },
            rawCsvData: null,
            rawIntakeIr: null,
            reportStructureResolution: null,
            canonicalCsvData: null,
            canonicalBuildMeta: null,
            canonicalizationStatus: 'idle',
            pipelineOutcome: null,
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
            semanticStatus: 'idle',
            semanticDatasetVersion: null,
            columnRegistry: null,
            duckDbSessionStatus: createIdleDuckDbSessionStatus(),
            activeDataQuery: null,
            activeMetricMappingValidation: null,
            activeSpreadsheetFilter: null,
            spreadsheetFilterFunction: null,
            aiFilterExplanation: null,
            queryHistory: [],
            analysisCards: [],
            chatHistory: options.restoreBundle ? getState().chatHistory : [],
            progressMessages: [],
            contextualSummary: null,
            pendingClarification: null,
            resolvedClarifications: null,
            pendingMutationConfirmation: null,
            activeTurn: null,
            queuedChatTurns: [],
            queuedAgentRuns: [],
            cancelRequestedTurnId: null,
            runtimeEvents: [],
            runtimeRunHistory: [],
            activeAnalysisSession: null,
            latestAnalysisSession: null,
            visibleAnalysisTrace: [],
            finalSummary: null,
            aiCoreAnalysisSummary: null,
            confirmedAnalysisGoal: null,
            cleaningRun: null,
            vectorMemoryState: 'cold',
            pendingVectorMemoryDocs: [],
            reportMemoryScope: null,
            datasetBundle: null,
            lastInsightExtractedAtTurn: 0,
        },
    };
    
    // Step 2: Delegate to the file processor
    const _fileProcessStart = performance.now();
    const processor = processAndCleanFile(file, store);
    
    // Use yield* to delegate to the sub-generator with correct type inference
    const processorResult = yield* processor;

    let {
        dataForAnalysis,
        rawData,
        rawIntakeIr,
        reportStructureResolution,
        canonicalCsvData,
        canonicalBuildMeta,
        canonicalizationStatus,
        pipelineOutcome,
        initialDataSample,
        columnProfiles,
        columnRegistry,
        dataPrepPlan,
        dataQualityIssues,
        datasetId,
        workspaceFiles,
        reportContextResolution,
        datasetBundle,
    } = processorResult;

    let sourceVerified = false;
    let verifiedReplay = false;
    if (options.restoreBundle) {
        const sourceMatches = options.restoreBundle.source.fileName === datasetBundle.source.fileName
            && options.restoreBundle.source.byteSize === datasetBundle.source.byteSize
            && options.restoreBundle.source.fingerprint === datasetBundle.source.fingerprint;
        if (!sourceMatches) {
            throw new Error('The selected CSV does not match the saved source fingerprint. Select the original file to restore this analysis.');
        }
        sourceVerified = true;
        const replay = replayDatasetBundlePrograms({
            bundle: options.restoreBundle,
            currentData: dataForAnalysis,
        });
        if (replay.status === 'replayed') {
            verifiedReplay = true;
            dataForAnalysis = replay.data;
            canonicalCsvData = null;
            datasetBundle = options.restoreBundle;
            const replayedOperations = options.restoreBundle.transformationPrograms.flatMap(program =>
                program.steps.flatMap(step => step.operation ? [step.operation] : []));
            dataPrepPlan = dataPrepPlan
                ? {
                    ...dataPrepPlan,
                    operations: replayedOperations,
                    planStatus: replayedOperations.length > 0 ? 'operations' : dataPrepPlan.planStatus,
                }
                : {
                    explanation: 'Replayed the verified transformation lineage from history.',
                    operations: replayedOperations,
                    outputColumns: columnProfiles,
                    planStatus: replayedOperations.length > 0 ? 'operations' : 'schema_only',
                    consistencyIssues: [],
                };
            yield {
                type: 'progress',
                message: 'Verified the original source fingerprint and replayed the saved transformation lineage.',
            };
        } else {
            yield {
                type: 'progress',
                messageType: 'warning',
                message: `The saved transformation lineage could not be reproduced (${replay.reasonCodes.join(', ')}). The original CSV was imported unchanged and a fresh governed analysis will run.`,
            };
            emitAgentEvent(store, {
                phase: 'file',
                step: 'transformation_replay_skipped',
                status: 'done',
                message: 'Saved transformation lineage was incompatible with the current runtime; continuing from the verified original CSV.',
                detail: { reasonCodes: replay.reasonCodes },
            });
        }
    }

    const materialDataset = canonicalCsvData ?? dataForAnalysis;
    const restoredAnalysis = canRestoreHistoryAnalysis(
        options.restoreSnapshot,
        verifiedReplay,
        getCsvDatasetVersion(materialDataset),
    ) && options.restoreSnapshot.analysisDatasetVersion === getCsvDatasetVersion(materialDataset)
        ? options.restoreSnapshot
        : null;
    const persistOriginalSnapshot = async () => {
        const sessionId = getState().sessionId;
        if (!sessionId || dataForAnalysis.backing?.ephemeral) return;
        try {
            await saveOriginalData(sessionId, rawData);
        } catch (error) {
            console.warn(`${LOG_PREFIX} Could not persist original data for rollback.`, error);
        }
    };
    const reportMemoryScope = {
        reportId: getState().sessionId,
        datasetId,
        datasetVersion: getCsvDatasetVersion(materialDataset),
    };
    // Memory history is optional context. WebKit can leave an IndexedDB read
    // pending behind an earlier source-snapshot write, so it must never delay
    // the imported dataset becoming visible or the analysis lifecycle starting.
    const memoryHistoryPromise = getAgentMemoryRuns(reportMemoryScope);

    console.log(`[Perf:Pipeline] File processing (parse + AI boundary + clean): ${Math.round(performance.now() - _fileProcessStart)}ms`);
    emitAgentEvent(store, {
        phase: 'file',
        step: 'upload_processed',
        status: 'done',
        message: `File "${file.name}" processed. ${getCsvDataRowCount(dataForAnalysis)} imported rows are ready for analysis.`,
        detail: {
            rowCount: getCsvDataRowCount(dataForAnalysis),
            columnCount: columnProfiles.length,
            planStatus: dataPrepPlan?.planStatus ?? null,
        },
    });
    emitFilePipelineEvent(store, 'import_ready', 'done', `Imported dataset is ready for downstream pipeline orchestration.`, {
        datasetId,
        rowCount: getCsvDataRowCount(dataForAnalysis),
    });
    
    // Step 3: Process the result and continue orchestration.
    // Unlock the UI as soon as data is ready.
    yield { type: 'state', payload: { 
        csvData: dataForAnalysis,
        rawCsvData: rawData,
        rawIntakeIr,
        reportContextResolution,
        datasetSemanticSnapshot: null,
        semanticStatus: 'idle',
        semanticDatasetVersion: null,
        initialDataSample,
        columnProfiles,
        columnRegistry,
        dataPreparationPlan: dataPrepPlan,
        dataQualityIssues,
        activeDataQuery: null,
        activeMetricMappingValidation: null,
        activeSpreadsheetFilter: null,
        spreadsheetFilterFunction: null,
        aiFilterExplanation: null,
        queryHistory: [],
        activeAnalysisSession: null,
        latestAnalysisSession: null,
        visibleAnalysisTrace: [],
        agentMemoryRun: null,
        liveAgentMemoryRun: null,
        agentMemoryHistory: [],
        selectedMemoryRunId: null,
        currentDatasetId: datasetId,
        datasetBundle,
        reportMemoryScope,
        reportStructureResolution,
        canonicalCsvData,
        canonicalBuildMeta,
        canonicalizationStatus,
        pipelineOutcome,
        workspaceFiles,
        isBusy: false, // Make UI interactive
        currentView: 'analysis_dashboard',
        initialAnalysisStatus: 'idle',
        initialAnalysisFailureKind: null,
        cleaningRun: createCleaningRun(),
        duckDbSessionStatus: createBindingDuckDbSessionStatus(getState().duckDbSessionStatus),
        ...(restoredAnalysis ? getRestoredHistoryAnalysisState(restoredAnalysis, workspaceFiles) : {}),
    } };
    console.log(`${LOG_PREFIX} Imported dataset state committed.`, {
        currentView: getState().currentView,
        isBusy: getState().isBusy,
        rowCount: getCsvDataRowCount(getState().csvData),
    });
    // The consumer has committed the imported dataset. Give React and WebKit
    // one browser task to paint it before the Pi lifecycle starts its own
    // CPU- and promise-heavy stage chain.
    await yieldToBrowser();

    void memoryHistoryPromise.then(memoryHistory => {
        const activeScope = getState().reportMemoryScope;
        if (
            activeScope?.reportId === reportMemoryScope.reportId
            && activeScope.datasetId === reportMemoryScope.datasetId
            && activeScope.datasetVersion === reportMemoryScope.datasetVersion
        ) {
            setState({ agentMemoryHistory: memoryHistory });
        }
    }).catch(error => {
        console.warn(`${LOG_PREFIX} Could not restore optional AI memory history.`, error);
    });

    let verifiedAnalysis = restoredAnalysis;
    let restoredCanonicalDataset: CsvData | null = null;
    if (!verifiedAnalysis && sourceVerified && options.restoreSnapshot) {
        try {
            await orchestrateAutonomousAiCleaning(store);
            // The intake's canonical preview may still point at pre-cleaning
            // rows. Cleaning commits the verified primary table to csvData.
            const preparedDataset = getState().csvData;
            const preparedMatches = (
                getState().cleaningRun?.status === 'completed'
                && preparedDataset
                && canRestoreHistoryAnalysis(
                    options.restoreSnapshot,
                    true,
                    getCsvDatasetVersion(preparedDataset),
                )
            );
            const analysisVersion = options.restoreSnapshot.analysisDatasetVersion;
            const cleanedIsAnalysis = preparedMatches
                && analysisVersion === getCsvDatasetVersion(preparedDataset);
            const importedIsAnalysis = preparedMatches
                && analysisVersion === getCsvDatasetVersion(materialDataset);
            if (cleanedIsAnalysis || importedIsAnalysis) {
                verifiedAnalysis = options.restoreSnapshot;
                restoredCanonicalDataset = cleanedIsAnalysis ? null : materialDataset;
                setState({
                    ...getRestoredHistoryAnalysisState(verifiedAnalysis, getState().workspaceFiles),
                    canonicalCsvData: restoredCanonicalDataset,
                });
            }
        } catch (error) {
            console.warn(`${LOG_PREFIX} Could not reproduce the saved prepared dataset; starting a fresh analysis.`, error);
        }
    }

    if (verifiedAnalysis) {
        updateAgentTaskStatus(store, {
            status: 'done',
            title: 'Saved analysis restored',
            subtitle: 'The source fingerprint and prepared dataset version matched the saved report.',
            totalSteps: 1,
            currentStep: 1,
        });
        yield {
            type: 'progress',
            message: 'Restored saved cards and report after verifying the source and prepared dataset version.',
        };
        void getState().refreshDuckDbSession().catch(error => {
            console.warn(`${LOG_PREFIX} Query session refresh after history restore failed.`, error);
        });
        if (verifiedAnalysis.vectorStoreDocuments.length > 0
            && verifiedAnalysis.vectorStoreDocuments.every(doc => Array.isArray(doc.embedding) && doc.embedding.length > 0)) {
            void vectorStore.rehydrate(verifiedAnalysis.vectorStoreDocuments).catch(error => {
                console.warn(`${LOG_PREFIX} Optional memory rehydration after history restore failed.`, error);
            });
        }
        await persistOriginalSnapshot();
        try {
            await persistCurrentAppSessionSnapshot(getState());
        } catch (error) {
            console.warn(`${LOG_PREFIX} Could not persist the restored current session.`, error);
        }
        return;
    }

    if (options.restoreSnapshot && sourceVerified) {
        yield {
            type: 'progress',
            messageType: 'warning',
            message: 'The original source matched, but the prepared dataset version could not be reproduced. Saved cards were not reused; a fresh analysis will run.',
        };
    }

    // FIX: `isApiKeySet` is not a property on the store state. It must be derived from the `settings` object.
    const settings = getState().settings;

    if (hasDeclinedCloudAiConsent(datasetId, settings.provider)) {
        const message = getTranslation('cloud_ai_local_only_message', settings.language);
        setState(prev => ({
            initialAnalysisStatus: 'degraded',
            cleaningRun: {
                ...createCleaningRun(),
                status: 'paused',
                lastError: message,
                userFacingMessage: message,
            },
            chatHistory: [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    text: message,
                    timestamp: new Date(),
                    type: 'ai_message',
                }),
            ],
        }));
        updateAgentTaskStatus(store, {
            status: 'done',
            title: 'Local import ready',
            subtitle: message,
            totalSteps: 1,
            currentStep: 1,
        });
        try {
            if (!dataForAnalysis.backing?.ephemeral) {
                await persistOriginalSnapshot();
                await persistCurrentAppSessionSnapshot(getState());
            }
        } catch (error) {
            const persistenceMessage = 'Local import is ready, but automatic recovery could not be saved. Keep this tab open or retry the import.';
            getState().addProgress(persistenceMessage, 'warning');
            emitAgentEvent(store, {
                phase: 'file',
                step: 'local_import_persistence',
                status: 'error',
                message: persistenceMessage,
                detail: {
                    error: error instanceof Error ? error.message : String(error),
                },
            });
        }
    } else if (isProviderConfigured(settings)) {
        runPostImportPipeline(store, datasetId, persistOriginalSnapshot);
    } else {
        setState(prev => ({
            cleaningRun: {
                ...createCleaningRun(),
                status: 'paused',
                lastError: 'AI cleaning requires a configured API key.',
            },
            chatHistory: [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    text: 'Dataset imported, but cleaning is paused because no API key is configured.',
                    timestamp: new Date(),
                    type: 'ai_message',
                }),
            ],
        }));
        // If no API key is set, prompt the user to contact technical support
        yield { type: 'state', payload: { isApiKeyRequiredModalOpen: true } };
        await persistOriginalSnapshot();
    }
}
