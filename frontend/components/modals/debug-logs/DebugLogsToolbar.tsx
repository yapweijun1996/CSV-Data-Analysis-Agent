import React from 'react';
import { IconClose } from '../../../icons/IconClose';

type CopyStatus = 'idle' | 'runtime-copied' | 'payloads-copied' | 'planner-copied' | 'sql-copied' | 'flow-copied' | 'trace-copied' | 'ai-debug-copied' | 'error';

interface DebugLogsToolbarProps {
    copyStatus: CopyStatus;
    hasPlannerFailure: boolean;
    hasSqlFailure: boolean;
    hasAnalysisTrace: boolean;
    onCopyRuntimeLogs: () => void;
    onCopyRecentPayloads: () => void;
    onCopyPlannerFailureBundle: () => void;
    onCopySqlFailureBundle: () => void;
    onCopyAnalysisTrace: () => void;
    onCopyAiDebugBundle: () => void;
    onOpenWorkflow: () => void;
    onOpenWorkspace: () => void;
    onClose: () => void;
}

const copyStatusLabel: Record<CopyStatus, string> = {
    'runtime-copied': 'Runtime logs copied',
    'payloads-copied': 'Recent payloads copied',
    'planner-copied': 'Planner bundle copied',
    'sql-copied': 'SQL bundle copied',
    'flow-copied': 'Flow payload copied',
    'trace-copied': 'Analysis trace copied',
    'ai-debug-copied': 'AI debug bundle copied',
    'error': 'Copy failed',
    'idle': 'Copy ready',
};

export const DebugLogsToolbar: React.FC<DebugLogsToolbarProps> = ({
    copyStatus,
    hasPlannerFailure,
    hasSqlFailure,
    hasAnalysisTrace,
    onCopyRuntimeLogs,
    onCopyRecentPayloads,
    onCopyPlannerFailureBundle,
    onCopySqlFailureBundle,
    onCopyAnalysisTrace,
    onCopyAiDebugBundle,
    onOpenWorkflow,
    onOpenWorkspace,
    onClose,
}) => (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="flex flex-col gap-2 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Debug logs</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-950 leading-tight">Runtime logs and telemetry</h2>
                <p className="mt-1 text-sm text-slate-600">Use this modal to inspect recent tool usage, telemetry responses, and agent events for the current report. Expand any log entry to inspect its full payload snapshot.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                    copyStatus === 'error'
                        ? 'bg-red-100 text-red-700'
                        : copyStatus !== 'idle'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-700'
                }`}>
                    {copyStatusLabel[copyStatus]}
                </span>
                <details className="relative">
                    <summary className="flex min-h-[44px] cursor-pointer items-center rounded-card border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                        Advanced exports
                    </summary>
                    <div className="absolute right-0 z-30 mt-2 grid max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] gap-2 overflow-y-auto rounded-card border border-slate-200 bg-white p-3 shadow-xl">
                        <p className="text-xs text-slate-600">Each action copies the named diagnostic scope only.</p>
                        <button onClick={onCopyAiDebugBundle} className="min-h-[44px] rounded-card border border-indigo-300 bg-indigo-50 px-3 py-2 text-left text-sm font-semibold text-indigo-800">Copy AI debug bundle</button>
                        <button onClick={onCopyRecentPayloads} className="min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700">Copy recent payloads</button>
                        <button onClick={onCopyRuntimeLogs} className="min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700">Copy runtime logs</button>
                        <button onClick={onCopyPlannerFailureBundle} disabled={!hasPlannerFailure} className="min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 disabled:opacity-50">Copy planner failure bundle</button>
                        <button onClick={onCopySqlFailureBundle} disabled={!hasSqlFailure} className="min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 disabled:opacity-50">Copy SQL failure bundle</button>
                        <button onClick={onCopyAnalysisTrace} disabled={!hasAnalysisTrace} className="min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 disabled:opacity-50">Copy analysis trace</button>
                    </div>
                </details>
                <button
                    onClick={onOpenWorkflow}
                    className="rounded-card border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                    Workflow
                </button>
                <button
                    onClick={onOpenWorkspace}
                    className="rounded-card bg-slate-950 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
                >
                    Artifacts
                </button>
                <button
                    data-dialog-initial-focus
                    onClick={onClose}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-card p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Close debug logs modal"
                >
                    <IconClose />
                </button>
            </div>
        </div>
    </header>
);
