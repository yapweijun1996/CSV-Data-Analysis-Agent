import React, { useEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore, type AppStore } from '../../store/useAppStore';
import {
    selectAiDebugBundle,
    selectDebugFlows,
    selectDebugOperatorSummary,
    selectDebugTimelineEntries,
    selectIrDiagnostics,
    selectPlannerFailureBundle,
    selectRecentPayloadSnapshotsExport,
    selectRuntimeLogsExport,
    selectSqlFailureBundle,
} from '../../services/agent/debugSelectors';
import { copyText } from '../../services/utils/copyText';
import { DebugLogEntryCard } from './debug-logs/DebugLogEntryCard';
import { DebugLogsToolbar } from './debug-logs/DebugLogsToolbar';
import { DebugLogsSidebar } from './debug-logs/DebugLogsSidebar';
import { AnalysisStepsPanel } from '../AnalysisStepsPanel';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { loadRecentLocalDiagnostics } from '../../services/observability/localDiagnostics';
import type { LocalDiagnosticRecord } from '../../types';

type DebugFilter = 'all' | 'tool' | 'telemetry' | 'event';
type DebugViewMode = 'timeline' | 'flows' | 'trace' | 'local';
type CopyStatus = 'idle' | 'runtime-copied' | 'payloads-copied' | 'planner-copied' | 'sql-copied' | 'flow-copied' | 'trace-copied' | 'ai-debug-copied' | 'error';

export const DebugLogsModal: React.FC = () => {
    const isOpen = useAppStore((state: AppStore) => state.isDebugLogsModalOpen);

    if (!isOpen) {
        return null;
    }

    return <OpenDebugLogsModal />;
};

const OpenDebugLogsModal: React.FC = () => {
    // Sync shadow telemetry buffers into the store on mount so the modal shows fresh data.
    useEffect(() => {
        const state = useAppStore.getState();
        state.syncTelemetryToStore();
        state.syncTelemetryEventsToStore();
    }, []);

    const {
        setIsDebugLogsModalOpen,
        setIsDataPreparationModalOpen,
        setIsWorkspaceModalOpen,
        agentToolLogs,
        telemetryEvents,
        agentEvents,
        currentDatasetId,
        sessionId,
        activeTurn,
        cleaningRun,
        activeSpreadsheetFilter,
        confirmedAnalysisGoal,
        settings,
        csvData,
        columnProfiles,
        analysisCards,
        queryHistory,
        duckDbSessionStatus,
        chatHistory,
        dataPreparationPlan,
        latestAnalysisSession,
        visibleAnalysisTrace,
        runtimeEvents,
        runtimeRunHistory,
        language,
    } = useAppStore((state: AppStore) => ({
        setIsDebugLogsModalOpen: state.setIsDebugLogsModalOpen,
        setIsDataPreparationModalOpen: state.setIsDataPreparationModalOpen,
        setIsWorkspaceModalOpen: state.setIsWorkspaceModalOpen,
        agentToolLogs: state.agentToolLogs,
        telemetryEvents: state.telemetryEvents,
        agentEvents: state.agentEvents,
        currentDatasetId: state.currentDatasetId,
        sessionId: state.sessionId,
        activeTurn: state.activeTurn,
        cleaningRun: state.cleaningRun,
        activeSpreadsheetFilter: state.activeSpreadsheetFilter,
        confirmedAnalysisGoal: state.confirmedAnalysisGoal,
        settings: state.settings,
        csvData: state.csvData,
        columnProfiles: state.columnProfiles,
        analysisCards: state.analysisCards,
        queryHistory: state.queryHistory,
        duckDbSessionStatus: state.duckDbSessionStatus,
        chatHistory: state.chatHistory,
        dataPreparationPlan: state.dataPreparationPlan,
        latestAnalysisSession: state.latestAnalysisSession,
        visibleAnalysisTrace: state.visibleAnalysisTrace,
        runtimeEvents: state.runtimeEvents,
        runtimeRunHistory: state.runtimeRunHistory,
        language: state.settings.language,
    }), shallow);
    const closeModal = () => setIsDebugLogsModalOpen(false);
    const openWorkflow = () => setIsDataPreparationModalOpen(true);
    const openWorkspace = () => setIsWorkspaceModalOpen(true);
    const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [activeFilter, setActiveFilter] = useState<DebugFilter>('all');
    const [activeView, setActiveView] = useState<DebugViewMode>('flows');
    const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
    const [expandedSnapshots, setExpandedSnapshots] = useState<Record<string, boolean>>({});
    const [localDiagnostics, setLocalDiagnostics] = useState<LocalDiagnosticRecord[]>([]);
    const [localDiagnosticsError, setLocalDiagnosticsError] = useState(false);
    const dialogRef = useDialogAccessibility<HTMLDivElement>(
        true,
        closeModal,
        { restoreFocusSelector: '[data-advanced-trigger="true"]' },
    );

    const debugLogScope = useMemo(() => ({
        sessionId,
        currentDatasetId,
        activeTurn,
        cleaningRun,
        activeSpreadsheetFilter,
        agentToolLogs,
        telemetryEvents,
        agentEvents,
    }), [activeSpreadsheetFilter, activeTurn, agentEvents, agentToolLogs, cleaningRun, currentDatasetId, sessionId, telemetryEvents]);

    const entries = useMemo(() => selectDebugTimelineEntries(debugLogScope), [debugLogScope]);
    const requestFlows = useMemo(() => selectDebugFlows(debugLogScope), [debugLogScope]);

    const filteredEntries = useMemo(() => {
        if (activeFilter === 'all') {
            return entries;
        }
        return entries.filter(entry => entry.type === activeFilter);
    }, [activeFilter, entries]);

    const debugState = useMemo(() => ({
        sessionId,
        currentDatasetId,
        activeTurn,
        cleaningRun,
        activeSpreadsheetFilter,
        telemetryEvents,
        agentToolLogs,
        agentEvents,
        confirmedAnalysisGoal,
        settings,
        csvData,
        columnProfiles,
        analysisCards,
        queryHistory,
        duckDbSessionStatus,
        chatHistory,
        dataPreparationPlan,
        runtimeEvents,
        runtimeRunHistory,
    } as AppStore), [
        sessionId,
        currentDatasetId,
        activeTurn,
        cleaningRun,
        activeSpreadsheetFilter,
        telemetryEvents,
        agentToolLogs,
        agentEvents,
        confirmedAnalysisGoal,
        settings,
        csvData,
        columnProfiles,
        analysisCards,
        queryHistory,
        duckDbSessionStatus,
        chatHistory,
        dataPreparationPlan,
        runtimeEvents,
        runtimeRunHistory,
    ]);

    const runtimeLogsExport = useMemo(() => selectRuntimeLogsExport(debugState), [debugState]);

    const recentPayloadSnapshotsExport = useMemo(() => selectRecentPayloadSnapshotsExport({
        sessionId,
        currentDatasetId,
        activeTurn,
        cleaningRun,
        activeSpreadsheetFilter,
        telemetryEvents,
        agentToolLogs,
        agentEvents,
        analysisCards,
        columnProfiles,
    }), [activeSpreadsheetFilter, activeTurn, agentEvents, agentToolLogs, analysisCards, cleaningRun, columnProfiles, currentDatasetId, sessionId, telemetryEvents]);

    const irDiagnostics = useMemo(() => selectIrDiagnostics({
        analysisCards,
        columnProfiles,
    }), [analysisCards, columnProfiles]);

    const plannerFailureBundle = useMemo(() => selectPlannerFailureBundle(debugState), [debugState]);

    const sqlFailureBundle = useMemo(() => selectSqlFailureBundle(debugState), [debugState]);
    const operatorSummary = useMemo(() => selectDebugOperatorSummary({
        runtimeEvents,
        runtimeRunHistory,
        latestAnalysisSession,
    }), [latestAnalysisSession, runtimeEvents, runtimeRunHistory]);

    useEffect(() => {
        setLocalDiagnosticsError(false);
        void loadRecentLocalDiagnostics().then(setLocalDiagnostics).catch(() => {
            setLocalDiagnostics([]);
            setLocalDiagnosticsError(true);
        });
    }, []);

    const handleCopy = async (fn: () => string, status: CopyStatus) => {
        if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
        try {
            await copyText(fn());
            setCopyStatus(status);
        } catch (error) {
            console.error('[DebugLogsModal] Copy failed.', error);
            setCopyStatus('error');
        }
        copyResetTimerRef.current = setTimeout(() => setCopyStatus('idle'), 3000);
    };

    const handleCopyAnalysisTrace = () => handleCopy(() => JSON.stringify({
        session: latestAnalysisSession
            ? {
                sessionId: latestAnalysisSession.sessionId,
                status: latestAnalysisSession.status,
                stepsUsed: latestAnalysisSession.stepsUsed,
                maxSteps: latestAnalysisSession.maxSteps,
                stopReason: latestAnalysisSession.stopReason,
                acceptedOutputs: latestAnalysisSession.acceptedOutputs,
                rejectedOutputs: latestAnalysisSession.rejectedOutputs,
            }
            : null,
        trace: visibleAnalysisTrace,
    }, null, 2), 'trace-copied');

    const handleCopyFlowPayload = async (flowId: string) => {
        const flow = requestFlows.find(entry => entry.groupId === flowId);
        if (!flow) return;
        await handleCopy(() => JSON.stringify({
            groupId: flow.groupId,
            groupType: flow.groupType,
            updatedAt: flow.updatedAt.toISOString(),
            phase: flow.phase,
            failure: flow.failure,
            correlation: flow.correlation,
            payloadSnapshots: flow.payloadSnapshots,
        }, null, 2), 'flow-copied');
    };

    const togglePayloadSnapshot = (entryKey: string) => {
        setExpandedSnapshots(current => ({
            ...current,
            [entryKey]: !current[entryKey],
        }));
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm" onClick={closeModal}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label="Diagnostic logs"
                tabIndex={-1}
                className="relative h-screen w-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef4fb_48%,#e7eef7_100%)] flex flex-col"
                onClick={event => event.stopPropagation()}
            >
                <DebugLogsToolbar
                    copyStatus={copyStatus}
                    hasPlannerFailure={plannerFailureBundle.hasFailure}
                    hasSqlFailure={sqlFailureBundle.hasFailure}
                    hasAnalysisTrace={visibleAnalysisTrace.length > 0}
                    onCopyRuntimeLogs={() => handleCopy(() => runtimeLogsExport, 'runtime-copied')}
                    onCopyRecentPayloads={() => handleCopy(() => recentPayloadSnapshotsExport, 'payloads-copied')}
                    onCopyPlannerFailureBundle={() => handleCopy(() => plannerFailureBundle.markdown, 'planner-copied')}
                    onCopySqlFailureBundle={() => handleCopy(() => sqlFailureBundle.markdown, 'sql-copied')}
                    onCopyAnalysisTrace={handleCopyAnalysisTrace}
                    onCopyAiDebugBundle={() => handleCopy(() => selectAiDebugBundle(useAppStore.getState()), 'ai-debug-copied')}
                    onOpenWorkflow={() => { closeModal(); openWorkflow(); }}
                    onOpenWorkspace={() => { closeModal(); openWorkspace(); }}
                    onClose={closeModal}
                />

                <div className="flex-1 min-h-0 overflow-hidden px-4 pb-4 pt-4 lg:px-5 xl:px-6">
                    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                        <DebugLogsSidebar
                            currentDatasetId={currentDatasetId}
                            toolLogCount={agentToolLogs.length}
                            telemetryCount={telemetryEvents.length}
                            eventCount={agentEvents.length}
                            flowCount={requestFlows.length}
                            localDiagnosticCount={localDiagnostics.length}
                            activeView={activeView}
                            activeFilter={activeFilter}
                            irDiagnostics={irDiagnostics}
                            operatorSummary={operatorSummary}
                            onViewChange={setActiveView}
                            onFilterChange={setActiveFilter}
                        />

                        <section className="min-h-0 overflow-hidden rounded-card border border-slate-200 bg-white shadow-sm">
                            <div className="border-b border-slate-200 px-4 py-3">
                                <p className="text-sm font-semibold text-slate-900">
                                    {activeView === 'timeline' ? 'Recent log stream' : activeView === 'flows' ? 'Grouped flow view' : activeView === 'trace' ? 'Analysis trace' : 'Local diagnostics'}
                                </p>
                                <p className="mt-1 text-sm text-slate-500">
                                    {activeView === 'timeline' ? `${filteredEntries.length} entries shown` : activeView === 'flows' ? `${requestFlows.length} grouped flows shown` : activeView === 'trace' ? `${visibleAnalysisTrace.length} steps` : `${localDiagnostics.length} records retained for up to 7 days`}
                                </p>
                            </div>
                            <div className="h-full overflow-y-auto p-4">
                                {activeView === 'local' ? (
                                    <div className="space-y-3 pb-10">
                                        <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                            These local-only diagnostics may contain prompts, selected samples, and model responses. Credentials are always redacted. Do not attach this view to a public issue; use the sanitized support bundle instead.
                                        </p>
                                        {localDiagnosticsError ? (
                                            <p role="alert" className="rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                                                Local diagnostics could not be read. Close and reopen Logs to retry.
                                            </p>
                                        ) : localDiagnostics.length === 0 ? (
                                            <div className="flex min-h-[280px] items-center justify-center text-center text-slate-500">
                                                No persisted local diagnostics yet.
                                            </div>
                                        ) : localDiagnostics.map(record => (
                                            <details key={record.id} className={`rounded-card border p-3 ${record.outcome === 'failed' || record.outcome === 'blocked' ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-slate-50'}`}>
                                                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                                                    {record.phase} · {record.tool} · {record.outcome}
                                                </summary>
                                                <dl className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                                                    <div><dt className="font-semibold text-slate-900">Run</dt><dd className="break-all">{record.runId ?? 'N/A'}</dd></div>
                                                    <div><dt className="font-semibold text-slate-900">Recorded</dt><dd>{record.recordedAt}</dd></div>
                                                    <div><dt className="font-semibold text-slate-900">Provider / model</dt><dd>{record.provider} · {record.model ?? 'N/A'}</dd></div>
                                                    <div><dt className="font-semibold text-slate-900">Attempt / duration</dt><dd>{record.attempt} · {record.durationMs ?? 'N/A'} ms</dd></div>
                                                    <div><dt className="font-semibold text-slate-900">Reason</dt><dd className="break-all">{record.reasonCode ?? 'N/A'}</dd></div>
                                                    <div><dt className="font-semibold text-slate-900">Expires</dt><dd>{record.expiresAt}</dd></div>
                                                </dl>
                                                <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(record.payload, null, 2)}</pre>
                                            </details>
                                        ))}
                                    </div>
                                ) : activeView === 'trace' ? (
                                    visibleAnalysisTrace.length === 0 ? (
                                        <div className="flex h-full min-h-[280px] items-center justify-center text-center text-slate-500">
                                            No analysis trace available yet.
                                        </div>
                                    ) : (
                                        <div className="pb-10">
                                            <AnalysisStepsPanel
                                                session={latestAnalysisSession}
                                                trace={visibleAnalysisTrace}
                                                language={language}
                                            />
                                        </div>
                                    )
                                ) : requestFlows.length === 0 && filteredEntries.length === 0 ? (
                                    <div className="flex h-full min-h-[280px] items-center justify-center text-center text-slate-500">
                                        No logs available for this filter yet.
                                    </div>
                                ) : (
                                    <div className="space-y-4 pb-10">
                                        {activeView === 'flows' ? (
                                            requestFlows.length === 0 ? (
                                                <div className="flex h-full min-h-[280px] items-center justify-center text-center text-slate-500">
                                                    No grouped flows are available yet.
                                                </div>
                                            ) : (
                                                requestFlows.map(flow => (
                                                    <section key={flow.groupId} className={`rounded-card border p-4 ${flow.failure ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-slate-50/80'}`}>
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div>
                                                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{flow.groupType.replace('_', ' ')} · {flow.groupId}</p>
                                                                <p className="mt-1 text-sm font-semibold text-slate-900">{flow.title}</p>
                                                                <p className="mt-1 text-sm text-slate-600">{flow.summary}</p>
                                                            </div>
                                                            <button
                                                                onClick={() => handleCopyFlowPayload(flow.groupId)}
                                                                className="rounded-card border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                                                            >
                                                                Copy Flow Payload
                                                            </button>
                                                        </div>
                                                        <div className="mt-4 grid gap-2 text-sm text-slate-700">
                                                            <div><span className="font-semibold text-slate-900">Phase:</span> {flow.phase ?? 'unknown'}</div>
                                                            <div><span className="font-semibold text-slate-900">Counts:</span> tools {flow.counts.toolLogs}, telemetry {flow.counts.telemetryEvents}, events {flow.counts.agentEvents}</div>
                                                            {flow.traceSummary?.reasonCode && <div><span className="font-semibold text-slate-900">Reason code:</span> {flow.traceSummary.reasonCode}</div>}
                                                            {flow.traceSummary?.retryClass && <div><span className="font-semibold text-slate-900">Retry class:</span> {flow.traceSummary.retryClass}</div>}
                                                            {flow.traceSummary?.failureClass && <div><span className="font-semibold text-slate-900">Failure class:</span> {flow.traceSummary.failureClass}</div>}
                                                            {flow.traceSummary?.abortMode && <div><span className="font-semibold text-slate-900">Abort:</span> {flow.traceSummary.abortMode} · {flow.traceSummary.abortSource ?? 'unknown'} · {flow.traceSummary.abortPropagationStatus ?? 'unknown'}</div>}
                                                            <div><span className="font-semibold text-slate-900">Tools:</span> {flow.toolNames.join(', ') || 'N/A'}</div>
                                                            <div><span className="font-semibold text-slate-900">Correlation:</span> <code className="text-xs">{JSON.stringify(flow.correlation)}</code></div>
                                                            <div><span className="font-semibold text-slate-900">Observations:</span> {flow.observations[0] ?? 'N/A'}</div>
                                                            <div><span className="font-semibold text-slate-900">Final reply:</span> {flow.finalReply ?? 'N/A'}</div>
                                                        </div>
                                                    </section>
                                                ))
                                            )
                                        ) : (
                                            filteredEntries.map(entry => {
                                                const entryKey = `${entry.type}-${entry.id}`;

                                                return (
                                                    <DebugLogEntryCard
                                                        key={entryKey}
                                                        entry={entry}
                                                        isSnapshotExpanded={Boolean(expandedSnapshots[entryKey])}
                                                        onToggleSnapshot={() => togglePayloadSnapshot(entryKey)}
                                                    />
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
};
