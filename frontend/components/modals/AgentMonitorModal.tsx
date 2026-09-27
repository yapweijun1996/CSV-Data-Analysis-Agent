
import React, { useEffect, useMemo, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../../store/useAppStore';
import { IconClose } from '../../icons/IconClose';
import { AiTaskStatusBubble } from '../AiTaskStatusBubble';
import { AgentMemoryView } from '../agent-monitor/AgentMemoryView';
import { DatasetKnowledgeView } from '../agent-monitor/DatasetKnowledgeView';
import { AgentActivityView } from '../agent-activity/AgentActivityView';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

export const AgentMonitorModal: React.FC = () => {
    // Sync shadow telemetry buffers into the store on mount so the modal shows fresh data.
    useEffect(() => {
        const state = useAppStore.getState();
        state.syncTelemetryToStore();
        state.syncTelemetryEventsToStore();
    }, []);

    const {
        isAgentModalOpen,
        setIsAgentModalOpen,
        agentEvents,
        agentToolLogs,
        aiTaskStatus,
        agentMemoryRun,
        agentMemoryHistory,
        selectedMemoryRunId,
        liveAgentMemoryRun,
        selectAgentMemoryRun,
        cardEnhancementSuggestions,
        isCardReviewInProgress,
        runCardEnhancementReview,
        applyCardEnhancementSuggestion,
        dismissCardEnhancementSuggestion,
        sessionId,
        currentDatasetId,
    } = useAppStore(state => ({
        isAgentModalOpen: state.isAgentModalOpen,
        setIsAgentModalOpen: state.setIsAgentModalOpen,
        agentEvents: state.agentEvents,
        agentToolLogs: state.agentToolLogs,
        aiTaskStatus: state.aiTaskStatus,
        agentMemoryRun: state.agentMemoryRun,
        agentMemoryHistory: state.agentMemoryHistory,
        selectedMemoryRunId: state.selectedMemoryRunId,
        liveAgentMemoryRun: state.liveAgentMemoryRun,
        selectAgentMemoryRun: state.selectAgentMemoryRun,
        cardEnhancementSuggestions: state.cardEnhancementSuggestions,
        isCardReviewInProgress: state.isCardReviewInProgress,
        runCardEnhancementReview: state.runCardEnhancementReview,
        applyCardEnhancementSuggestion: state.applyCardEnhancementSuggestion,
        dismissCardEnhancementSuggestion: state.dismissCardEnhancementSuggestion,
        sessionId: state.sessionId,
        currentDatasetId: state.currentDatasetId,
    }), shallow);
    const [activeTab, setActiveTab] = useState<'timeline' | 'tools' | 'memory' | 'knowledge'>('timeline');
    const closeModal = () => setIsAgentModalOpen(false);
    const dialogRef = useDialogAccessibility<HTMLDivElement>(isAgentModalOpen, closeModal);

    const historyOptions = useMemo(
        () => [...agentMemoryHistory].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        [agentMemoryHistory],
    );

    const timeline = useMemo(() => {
        if (agentMemoryRun?.timeline && selectedMemoryRunId) {
            return [...agentMemoryRun.timeline].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        }
        return [...agentEvents].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }, [agentEvents, agentMemoryRun, selectedMemoryRunId]);

    const toolLogs = useMemo(() => {
        return [...agentToolLogs].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }, [agentToolLogs]);

    if (!isAgentModalOpen) return null;

    const selectedRunValue = selectedMemoryRunId ?? 'live';
    const handleRunSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        selectAgentMemoryRun(value === 'live' ? null : value);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60" onClick={closeModal}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="agent-monitor-dialog-title"
                tabIndex={-1}
                className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-card border border-slate-200 bg-white shadow-2xl"
                onClick={event => event.stopPropagation()}
            >
                <header className="border-b border-slate-200 px-4 py-3">
                    <p className="text-xs uppercase text-slate-500 tracking-wider">Assistant activity</p>
                    <h2 id="agent-monitor-dialog-title" className="text-xl font-semibold text-slate-900 leading-tight mt-1">Run progress and outcomes</h2>
                    <p className="text-sm text-slate-500 mt-1">Visible lifecycle events, tools, memory, and dataset knowledge in one place.</p>
                </header>
                <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="grid grid-cols-2 rounded-card bg-slate-100 p-0.5 sm:flex sm:rounded-full">
                        {(['timeline', 'tools', 'memory', 'knowledge'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`min-h-[44px] px-3 py-2 text-sm font-medium rounded-full transition ${
                                    activeTab === tab ? 'bg-white shadow text-slate-900' : 'text-slate-500'
                                }`}
                            >
                                {tab === 'timeline'
                                    ? 'Activity'
                                    : tab === 'tools'
                                        ? 'Tools'
                                        : tab === 'memory'
                                            ? 'Memory'
                                            : 'Dataset Knowledge'}
                            </button>
                        ))}
                    </div>
                    <div className="flex min-w-0 flex-col text-xs text-slate-500 sm:max-w-[16rem]">
                        <label className="mb-1 font-semibold">Memory Run</label>
                        <select
                            className="text-sm border border-slate-200 rounded-md px-2 py-1 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                            value={selectedRunValue}
                            onChange={handleRunSelect}
                        >
                            <option value="live">
                                Live analysis {liveAgentMemoryRun ? '(latest finished)' : '(in progress)'}
                            </option>
                            {historyOptions.map(run => (
                                <option key={run.runId} value={run.runId}>
                                    {new Date(run.createdAt).toLocaleString()}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <button
                    data-dialog-initial-focus
                    onClick={closeModal}
                    className="absolute right-4 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Close agent monitor"
                >
                    <IconClose />
                </button>
                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                    {activeTab === 'timeline' ? (
                        <>
                            {aiTaskStatus && <AiTaskStatusBubble task={aiTaskStatus} />}
                            <AgentActivityView
                                events={timeline}
                                sessionId={selectedMemoryRunId ? null : sessionId}
                                datasetId={selectedMemoryRunId ? null : currentDatasetId}
                                emptyMessage="The agent has not logged any activity yet. Once a run begins, its start, steps, waits, recovery, and terminal outcome will appear here."
                            />
                        </>
                    ) : activeTab === 'tools' ? (
                        <div className="space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-900">AI Review & Suggestions</h3>
                                    <p className="text-sm text-slate-500">Have the agent scan all cards and propose enhancements.</p>
                                </div>
                                <button
                                    onClick={() => runCardEnhancementReview()}
                                    disabled={isCardReviewInProgress}
                                    className={`px-4 py-2 rounded-md text-sm font-medium shadow transition ${
                                        isCardReviewInProgress ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                >
                                    {isCardReviewInProgress ? 'Reviewing...' : 'Review Cards'}
                                </button>
                            </div>
                            {cardEnhancementSuggestions.length === 0 ? (
                                <p className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-md p-4 text-center">
                                    No AI enhancement suggestions yet. Run a review to generate recommendations.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {cardEnhancementSuggestions.map(suggestion => (
                                        <div key={suggestion.id} className="border border-slate-200 rounded-card p-4 bg-white shadow-sm">
                                            <div className="flex items-center justify-between">
                                                <div className="text-sm font-semibold text-slate-900">
                                                    {suggestion.cardTitle || suggestion.cardId}
                                                </div>
                                                <span
                                                    className={`text-xs px-2 py-0.5 rounded-full ${
                                                        suggestion.priority === 'high'
                                                            ? 'bg-red-100 text-red-700'
                                                            : suggestion.priority === 'medium'
                                                                ? 'bg-yellow-100 text-yellow-700'
                                                                : 'bg-slate-100 text-slate-600'
                                                    }`}
                                                >
                                                    {suggestion.priority.toUpperCase()}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{suggestion.rationale}</p>
                                            {suggestion.action === 'add_calculated_column' && suggestion.proposedColumnName && suggestion.formula && (
                                                <div className="mt-3 text-xs bg-slate-50 border border-slate-200 rounded-md p-2">
                                                    <p className="font-semibold text-slate-600 mb-1">Proposed Column</p>
                                                    <p className="text-slate-700"><strong>{suggestion.proposedColumnName}</strong> = {suggestion.formula}</p>
                                                </div>
                                            )}
                                            <div className="mt-3 flex items-center gap-2 text-xs">
                                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wide">
                                                    {suggestion.status}
                                                </span>
                                                {suggestion.status === 'failed' && (
                                                    <span className="text-red-600 font-medium">Action failed. Try again.</span>
                                                )}
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <button
                                                    disabled={suggestion.status === 'applied' || suggestion.status === 'applying'}
                                                    onClick={() => applyCardEnhancementSuggestion(suggestion.id)}
                                                    className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                                                        suggestion.status === 'applied'
                                                            ? 'bg-green-100 text-green-700 cursor-default'
                                                            : suggestion.status === 'applying'
                                                                ? 'bg-slate-200 text-slate-500 cursor-progress'
                                                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                                    }`}
                                                >
                                                    {suggestion.status === 'applied'
                                                        ? 'Applied'
                                                        : suggestion.status === 'applying'
                                                            ? 'Applying...'
                                                            : 'Apply Suggestion'}
                                                </button>
                                                {suggestion.status !== 'applied' && suggestion.status !== 'dismissed' && (
                                                    <button
                                                        onClick={() => dismissCardEnhancementSuggestion(suggestion.id)}
                                                        className="px-3 py-1.5 rounded-md text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-50"
                                                    >
                                                        Dismiss
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="pt-4 border-t border-slate-200">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-semibold text-slate-800">Tool Usage Log</h4>
                                    <span className="text-xs text-slate-500">Most recent first</span>
                                </div>
                                {toolLogs.length === 0 ? (
                                    <p className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-md p-3 text-center">
                                        No automated tools have been triggered yet for this session.
                                    </p>
                                ) : (
                                    <ul className="divide-y divide-slate-200 border border-slate-200 rounded-card bg-white overflow-hidden max-h-72 overflow-y-auto">
                                        {toolLogs.map(log => (
                                            <li key={log.id} className="p-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">{log.tool}</span>
                                                    <span className="text-xs text-slate-400">{log.timestamp.toLocaleString()}</span>
                                                </div>
                                                <p className="text-sm text-slate-800 mt-1">{log.description}</p>
                                                {log.detail && (
                                                    <details className="mt-3 rounded-card border border-slate-200 bg-slate-50">
                                                        <summary className="min-h-[44px] cursor-pointer px-3 py-3 text-xs font-semibold text-slate-600">
                                                            Technical payload
                                                        </summary>
                                                        <pre className="max-h-56 overflow-auto border-t border-slate-200 p-3 text-[11px] text-slate-600">
                                                            {JSON.stringify(log.detail, null, 2)}
                                                        </pre>
                                                    </details>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    ) : activeTab === 'memory' ? (
                        <AgentMemoryView />
                    ) : (
                        <DatasetKnowledgeView />
                    )}
                </div>
            </div>
        </div>
    );
};
