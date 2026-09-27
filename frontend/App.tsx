
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
import { GlobalErrorToast } from './components/GlobalErrorToast';
import { useDialogAccessibility } from './hooks/useDialogAccessibility';
import { getTranslation } from './utils/localization';
import { PwaStatusBanner } from './components/PwaStatusBanner';

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
        globalErrorToast,
        setGlobalErrorToast,
    } = useAppStore(
        (state: AppStore) => ({
            init: state.init,
            currentView: state.currentView,
            csvData: state.csvData,
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
            globalErrorToast: state.globalErrorToast,
            setGlobalErrorToast: state.setGlobalErrorToast,
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
            setGlobalErrorToast({
                // Combine message + suggestion so the toast body is complete
                message: userError.fullText,
                errorSummary: userError.technicalDetail,
            });
        };

        window.addEventListener('unhandledrejection', handleUnhandledRejection);
        return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    }, [language, logTelemetryEvent, setGlobalErrorToast]);

    const showAgentThinking = shouldShowAgentThinkingModal();
    const showLongTermMemory = shouldShowLongTermMemory();
    const canUseSettingsSurface = shouldAllowSettingsSurface();
    const canUseDatabaseSurface = shouldAllowDatabaseSurface();
    const canUseWorkspaceSurface = shouldAllowWorkspaceSurface();
    const canUseWorkflowSurface = shouldAllowWorkflowSurface();
    const canUseLogsSurface = shouldAllowLogsSurface();
    const canUseAgentThinkingSurface = shouldAllowAgentThinkingSurface();
    const canUseLongTermMemorySurface = shouldAllowLongTermMemorySurface();

    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const { headerRef, headerHeight, isHeaderHidden } = useAutoHideHeader({ scrollContainerRef });

    const renderMainContent = () => {
        if (currentView === 'file_upload' || !csvData) {
            return (
                <div className="h-full">
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

            {/* Global async error boundary toast */}
            {globalErrorToast && (
                <GlobalErrorToast
                    toast={globalErrorToast}
                    language={language}
                    onDismiss={() => setGlobalErrorToast(null)}
                    onStartOver={() => { setGlobalErrorToast(null); void handleNewSession(); }}
                />
            )}
            <Suspense fallback={null}>
                {canUseSettingsSurface && isSettingsModalOpen && <SettingsModal />}
                {showAgentThinking && canUseAgentThinkingSurface && isAgentModalOpen && <AgentMonitorModal />}
                {isHistoryPanelOpen && <HistoryPanel />}
                {canUseDatabaseSurface && isDatabaseModalOpen && <DatabaseModal />}
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
                        className="hidden md:flex group items-center justify-center w-2.5 cursor-col-resize"
                        title="Drag to resize, double-click to hide"
                    >
                        <div
                            className={`w-0.5 h-8 bg-slate-300 rounded-full transition-colors duration-200 group-hover:bg-brand-secondary ${isResizing ? '!bg-blue-600' : ''}`}
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
                        <Suspense fallback={null}>
                            <ChatPanel />
                        </Suspense>
                    </aside>
                </>
            )}
        </div>
    );
};

export default App;
