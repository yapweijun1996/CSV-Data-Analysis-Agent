
import React, { useEffect, useRef, Suspense, lazy, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { FileUpload } from './components/FileUpload';
import { AppHeader } from './components/AppHeader';

const ChatPanel = lazy(() => import('./components/ChatPanel').then(m => ({ default: m.ChatPanel })));
const AnalysisPanel = lazy(() => import('./components/AnalysisPanel').then(m => ({ default: m.AnalysisPanel })));
const SpreadsheetPanel = lazy(() => import('./components/SpreadsheetPanel').then(m => ({ default: m.SpreadsheetPanel })));
import { useAppStore, AppStore } from './store/useAppStore';
import { AutoSaveManager } from './components/AutoSaveManager';
import { IconLoadingSpinner } from './icons/IconLoadingSpinner';
import { ExternalPayloadListener } from './components/ExternalPayloadListener';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAutoHideHeader } from './hooks/useAutoHideHeader';
import {
    shouldAllowAgentThinkingSurface,
    shouldAllowDatabaseSurface,
    shouldAllowLogsSurface,
    shouldAllowLongTermMemorySurface,
    shouldAllowSettingsSurface,
    shouldAllowWorkflowSurface,
    shouldAllowWorkspaceSurface,
    shouldShowAgentThinkingModal,
    shouldShowLongTermMemory,
} from './config/runtimeConfig';
import { isRecoverableChunkLoadError } from './utils/staleChunkRecovery';
import { formatUserError } from './utils/userErrorMessage';
import { ToastHost } from './components/ui/ToastHost';
import { ModalHost } from './components/ui/ModalHost';
import { ReportProblemModal } from './components/modals/ReportProblemModal';
import { UpdateOverlay } from './components/UpdateOverlay';
import { toast } from './services/ui/toastService';
import { useDialogAccessibility } from './hooks/useDialogAccessibility';
import { getTranslation } from './utils/localization';
import { PwaStatusBanner } from './components/PwaStatusBanner';
import { loadMcpServers } from './services/storage/mcpServers';

const SettingsModal = lazy(() => import('./components/modals/SettingsModal').then(module => ({ default: module.SettingsModal })));
const HistoryPanel = lazy(() => import('./components/modals/HistoryPanel').then(module => ({ default: module.HistoryPanel })));
const MemoryPanel = lazy(() => import('./components/modals/MemoryPanel').then(module => ({ default: module.MemoryPanel })));
const AgentMonitorModal = lazy(() => import('./components/modals/AgentMonitorModal').then(module => ({ default: module.AgentMonitorModal })));
const DatabaseModal = lazy(() => import('./components/modals/DatabaseModal').then(module => ({ default: module.DatabaseModal })));
const WorkspaceModal = lazy(() => import('./components/modals/WorkspaceModal').then(module => ({ default: module.WorkspaceModal })));
const DataPreparationWorkflowModal = lazy(() => import('./components/modals/DataPreparationWorkflowModal').then(module => ({ default: module.DataPreparationWorkflowModal })));
const DebugLogsModal = lazy(() => import('./components/modals/DebugLogsModal').then(module => ({ default: module.DebugLogsModal })));
const ReportBoundaryConfirmModal = lazy(() => import('./components/modals/ReportBoundaryConfirmModal').then(module => ({ default: module.ReportBoundaryConfirmModal })));
const ApiKeyRequiredModal = lazy(() => import('./components/modals/ApiKeyRequiredModal').then(module => ({ default: module.ApiKeyRequiredModal })));
const CloudAiConsentModal = lazy(() => import('./components/modals/CloudAiConsentModal').then(module => ({ default: module.CloudAiConsentModal })));

// PERF-309: Gate SpreadsheetPanel during analysis + summary to avoid 2.2s re-render per setState.
// useSpreadsheetLogic + TabulatorTable cost 2.2s on every Zustand setState notification.
// Gate covers both hypothesis loop (aiTaskStatus active) AND summary phase (finalSummary null).
// aiTaskStatus goes 'done' before summaries start, so we also check finalSummary.
const SpreadsheetPanelGate: React.FC<{ isVisible: boolean }> = React.memo(({ isVisible }) => {
    const isPipelineActive = useAppStore(state => {
        const task = state.aiTaskStatus;
        const isTaskRunning = Boolean(task && task.status !== 'done' && task.status !== 'error');
        // Summary phase: aiTaskStatus is 'done' but finalSummary not yet generated.
        // analysisCards exist but finalSummary is null → summaries still in progress.
        const isSummaryPending = state.analysisCards.length > 0 && !state.finalSummary;
        return isTaskRunning || isSummaryPending;
    });

    // PERF-101: Reset to collapsed when pipeline completes to avoid 7s Tabulator rebuild.
    // SpreadsheetPanel renders TabulatorTable only when isVisible=true (line 131).
    // By forcing collapsed state on remount, the panel shows only the header bar (~0ms).
    const prevActiveRef = useRef(isPipelineActive);
    useEffect(() => {
        if (prevActiveRef.current && !isPipelineActive) {
            useAppStore.getState().setIsSpreadsheetVisible(false);
        }
        prevActiveRef.current = isPipelineActive;
    }, [isPipelineActive]);

    if (isPipelineActive) {
        return null;
    }
    return <SpreadsheetPanel key="spreadsheet" isVisible={isVisible} />;
});

const App: React.FC = () => {
    const {
        init,
        currentView,
        csvData,
        hasRestoredAnalysis,
        restoredFileName,
        isAppInitializing,
        isAsideVisible,
        asideWidth,
        isResizing,
        handleAsideMouseDown,
        isSpreadsheetVisible,
        resultsViewMode,
        isSettingsModalOpen,
        isHistoryPanelOpen,
        isDatabaseModalOpen,
        isWorkspaceModalOpen,
        isDataPreparationModalOpen,
        isDebugLogsModalOpen,
        isMemoryPanelOpen,
        isAgentModalOpen,
        isReportBoundaryConfirmModalOpen,
        isApiKeyRequiredModalOpen,
        pendingCloudAiConsent,
        language,
    } = useAppStore(
        (state: AppStore) => ({
            init: state.init,
            currentView: state.currentView,
            csvData: state.csvData,
            // History keeps results and lineage but not CSV rows: show the saved analysis read-only.
            hasRestoredAnalysis: !state.csvData && Boolean(state.datasetBundle) && ((state.analysisCards?.length ?? 0) > 0 || Boolean(state.finalSummary)),
            restoredFileName: state.datasetBundle?.source.fileName ?? '',
            isAppInitializing: state.isAppInitializing,
            isAsideVisible: state.isAsideVisible,
            asideWidth: state.asideWidth,
            isResizing: state.isResizing,
            handleAsideMouseDown: state.handleAsideMouseDown,
            isSpreadsheetVisible: state.isSpreadsheetVisible,
            resultsViewMode: state.resultsViewMode ?? 'simple',
            isSettingsModalOpen: state.isSettingsModalOpen,
            isHistoryPanelOpen: state.isHistoryPanelOpen,
            isDatabaseModalOpen: state.isDatabaseModalOpen,
            isWorkspaceModalOpen: state.isWorkspaceModalOpen,
            isDataPreparationModalOpen: state.isDataPreparationModalOpen,
            isDebugLogsModalOpen: state.isDebugLogsModalOpen,
            isMemoryPanelOpen: state.isMemoryPanelOpen,
            isAgentModalOpen: state.isAgentModalOpen,
            isReportBoundaryConfirmModalOpen: state.isReportBoundaryConfirmModalOpen,
            isApiKeyRequiredModalOpen: state.isApiKeyRequiredModalOpen,
            pendingCloudAiConsent: state.pendingCloudAiConsent,
            language: state.settings.language,
        }),
        shallow
    );

    const setIsAsideVisible = useAppStore(state => state.setIsAsideVisible);
    const handleNewSession = useAppStore(state => state.handleNewSession);
    const logTelemetryEvent = useAppStore(state => state.logTelemetryEvent);
    const [isMobileLayout, setIsMobileLayout] = useState(false);
    const mobileAssistantRef = useDialogAccessibility<HTMLElement>(
        isMobileLayout && isAsideVisible,
        () => setIsAsideVisible(false),
        { restoreFocusSelector: '[data-mobile-assistant-trigger="true"]' },
    );

    useEffect(() => {
        void init();
    }, [init]);

    // Reconnect the MCP servers the user enabled in Settings. The MCP client stays out of the main bundle unless one exists.
    useEffect(() => {
        if (!loadMcpServers().some(server => server.enabled)) return;
        let stop: (() => void) | undefined, cancelled = false;
        void import('./services/agent/connectors/mcpAppStore').then(module => { if (!cancelled) stop = module.startMcpAutoConnect(); });
        return () => { cancelled = true; stop?.(); };
    }, []);

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const media = window.matchMedia('(max-width: 767px)');
        const sync = () => setIsMobileLayout(media.matches);
        sync();
        media.addEventListener('change', sync);
        return () => media.removeEventListener('change', sync);
    }, []);

    // Global async error boundary: catches unhandled promise rejections that
    // escape every other try-catch in the pipeline. Shows a non-blocking
    // Mandarin toast so the user is informed and can choose to restart.
    // Chunk-load errors are excluded — those are handled by staleChunkRecovery.
    useEffect(() => {
        const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
            if (isRecoverableChunkLoadError(event.reason)) return;

            const userError = formatUserError(event.reason, { surface: 'general', language });

            console.error('[App] Unhandled promise rejection caught by global error boundary:', event.reason);
            logTelemetryEvent({
                stage: 'executor_error',
                responseType: 'unhandled_rejection',
                detail: userError.technicalDetail,
            });
            toast.error(userError.fullText, {
                id: 'global-unhandled-rejection',
                detail: userError.technicalDetail,
                actions: [
                    { label: getTranslation('global_error_restart_button', language), onClick: () => { void handleNewSession(); } },
                    { label: getTranslation('global_error_dismiss_button', language), onClick: () => undefined },
                ],
            });
        };

        window.addEventListener('unhandledrejection', handleUnhandledRejection);
        return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    }, [language, logTelemetryEvent, handleNewSession]);

    const showAgentThinking = shouldShowAgentThinkingModal();
    const showLongTermMemory = shouldShowLongTermMemory();
    const canUseSettingsSurface = shouldAllowSettingsSurface();
    const canUseDatabaseSurface = shouldAllowDatabaseSurface();
    const canUseWorkspaceSurface = shouldAllowWorkspaceSurface();
    const canUseWorkflowSurface = shouldAllowWorkflowSurface();
    const canUseLogsSurface = shouldAllowLogsSurface();
    const canUseAgentThinkingSurface = shouldAllowAgentThinkingSurface();
    const canUseLongTermMemorySurface = shouldAllowLongTermMemorySurface();

    // Load lazily once, then retain same-source drafts and an in-flight preview across close/reopen.
    // DatabaseModal itself resets all transient state on source/session replacement.
    const hasOpenedDatabaseRef = useRef(false);
    if (isDatabaseModalOpen) hasOpenedDatabaseRef.current = true;
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const { headerRef, headerHeight, isHeaderHidden } = useAutoHideHeader({ scrollContainerRef });

    const renderMainContent = () => {
        if (hasRestoredAnalysis && currentView !== 'file_upload' && !isAppInitializing) {
            return (
                <ErrorBoundary language={language}>
                    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-amber-300 bg-amber-50 p-4 text-left">
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-amber-950">{getTranslation('restored_view_title', language)}</p>
                            <p className="mt-1 text-sm leading-6 text-amber-900">{getTranslation('restored_view_detail', language, { fileName: restoredFileName })}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => useAppStore.setState({ currentView: 'file_upload' })}
                            className="min-h-[44px] shrink-0 whitespace-nowrap rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100"
                        >
                            {getTranslation('restored_view_action', language)}
                        </button>
                    </div>
                    <Suspense fallback={null}>
                        <AnalysisPanel />
                    </Suspense>
                </ErrorBoundary>
            );
        }
        if (currentView === 'file_upload' || !csvData) {
            return (
                <div className="min-h-min" style={{ height: `calc(100% - ${headerHeight}px)` }}>
                    <FileUpload isWorkspaceRestoring={isAppInitializing} />
                </div>
            );
        }
        if (isAppInitializing) {
            return (
                <div className="flex h-full items-center justify-center">
                    <div className="flex items-center text-slate-500">
                        <IconLoadingSpinner className="mr-2" /> Restoring workspace...
                    </div>
                </div>
            );
        }
        return (
            <ErrorBoundary language={language}>
                <div>
                    <Suspense fallback={
                        <div className="flex min-h-64 items-center justify-center" role="status">
                            <div className="flex items-center text-slate-500">
                                <IconLoadingSpinner className="mr-2" /> Loading analysis workspace...
                            </div>
                        </div>
                    }>
                        <AnalysisPanel />
                    </Suspense>
                    <div className="mt-8">
                        <Suspense fallback={null}>
                            {resultsViewMode === 'explore' && (
                                <SpreadsheetPanelGate isVisible={isSpreadsheetVisible} />
                            )}
                        </Suspense>
                    </div>
                </div>
            </ErrorBoundary>
        );
    }

    return (
        <div className="flex flex-col md:flex-row h-screen bg-slate-50 text-slate-800">
            <ExternalPayloadListener />
            <AutoSaveManager />
            <PwaStatusBanner />

            <ToastHost />
            <ModalHost />
            <ReportProblemModal />
            <UpdateOverlay />
            <Suspense fallback={null}>
                {canUseSettingsSurface && isSettingsModalOpen && <SettingsModal />}
                {showAgentThinking && canUseAgentThinkingSurface && isAgentModalOpen && <AgentMonitorModal />}
                {isHistoryPanelOpen && <HistoryPanel />}
                {canUseDatabaseSurface && hasOpenedDatabaseRef.current && <DatabaseModal />}
                {canUseWorkspaceSurface && isWorkspaceModalOpen && <WorkspaceModal />}
                {canUseWorkflowSurface && isDataPreparationModalOpen && <DataPreparationWorkflowModal />}
                {isReportBoundaryConfirmModalOpen && <ReportBoundaryConfirmModal />}
                {isApiKeyRequiredModalOpen && <ApiKeyRequiredModal />}
                {pendingCloudAiConsent && <CloudAiConsentModal />}
                {canUseLogsSurface && isDebugLogsModalOpen && <DebugLogsModal />}
                {showLongTermMemory && canUseLongTermMemorySurface && isMemoryPanelOpen && <MemoryPanel />}
            </Suspense>
            <main
                className="relative flex flex-1 flex-col overflow-hidden px-4 pb-4 pt-0"
            >
                <div
                    id="app-main-scroll-container"
                    ref={scrollContainerRef}
                    className="min-h-0 flex-1 overflow-y-auto"
                >
                    <div
                        ref={headerRef as React.RefObject<HTMLDivElement>}
                        className="sticky top-0 z-20 bg-slate-50 pb-4 transition-transform duration-200"
                        style={{ transform: isHeaderHidden ? `translateY(-${headerHeight}px)` : 'translateY(0)' }}
                    >
                        <AppHeader />
                    </div>
                    {renderMainContent()}
                </div>
            </main>

            {isAsideVisible && (
                <>
                    <div
                        onMouseDown={handleAsideMouseDown}
                        onDoubleClick={() => setIsAsideVisible(false)}
                        data-aside-resizer="true"
                        className="group relative hidden w-2.5 cursor-col-resize items-center justify-center md:flex"
                        title="Drag to resize, double-click to hide"
                    >
                        {/* Full-height accent line appears on hover/drag so users can tell the panel is resizable. */}
                        <div
                            aria-hidden="true"
                            className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors duration-150 ${isResizing ? 'bg-accent-600' : 'bg-transparent group-hover:bg-accent-500'}`}
                        />
                        <div
                            aria-hidden="true"
                            className={`relative h-8 w-1 rounded-full transition-colors duration-150 ${isResizing ? 'bg-accent-600' : 'bg-slate-300 group-hover:bg-accent-500'}`}
                        />
                    </div>
                    <aside
                        ref={mobileAssistantRef}
                        role={isMobileLayout ? 'dialog' : 'complementary'}
                        aria-modal={isMobileLayout ? 'true' : undefined}
                        aria-label={isMobileLayout ? getTranslation('assistant', language) : undefined}
                        className="fixed inset-0 z-40 flex h-[100dvh] w-full flex-col border-l border-slate-200 bg-white md:static md:z-auto md:h-full md:w-[var(--aside-width)]"
                        style={{ '--aside-width': `${asideWidth}px` } as React.CSSProperties}
                    >
                        <Suspense fallback={<div role="status" className="p-4 text-sm text-slate-600">{getTranslation('chat_loading', language)}</div>}>
                            <ChatPanel />
                        </Suspense>
                    </aside>
                </>
            )}
        </div>
    );
};

export default App;
