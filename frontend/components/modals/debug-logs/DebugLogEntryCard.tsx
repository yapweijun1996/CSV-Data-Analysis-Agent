import React from 'react';
import { type DebugEntryType, type DebugLogEntryViewModel } from '../../../services/agent/debugLogEntries';

const entryToneClasses: Record<DebugEntryType, string> = {
    tool: 'border-sky-200 bg-sky-50/40',
    telemetry: 'border-emerald-200 bg-emerald-50/40',
    event: 'border-amber-200 bg-amber-50/40',
};

const formatTime = (value: Date) => new Date(value).toLocaleString();
const formatJson = (value: unknown) => JSON.stringify(value, null, 2);
const traceSeverityClasses = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-rose-200 bg-rose-50 text-rose-800',
} as const;

interface DebugLogEntryCardProps {
    entry: DebugLogEntryViewModel;
    isSnapshotExpanded: boolean;
    onToggleSnapshot: () => void;
}

export const DebugLogEntryCard: React.FC<DebugLogEntryCardProps> = ({
    entry,
    isSnapshotExpanded,
    onToggleSnapshot,
}) => (
    <article className={`rounded-card border p-4 ${entryToneClasses[entry.type]}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/70 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                        {entry.type}
                    </span>
                    <span className="rounded-full border border-white/70 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                        {entry.label}
                    </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900">{entry.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{entry.subtitle}</p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
                <span className="text-xs text-slate-500">{formatTime(entry.timestamp)}</span>
                <button
                    onClick={onToggleSnapshot}
                    className="rounded-full border border-white/80 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 transition-colors hover:bg-slate-100"
                >
                    {isSnapshotExpanded ? 'Hide payload snapshot' : 'Show payload snapshot'}
                </button>
            </div>
        </div>
        {entry.traceSummary && (
            <div className="mt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Trace contract</p>
                <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${traceSeverityClasses[entry.traceSummary.severity]}`}>
                        {entry.traceSummary.contractVersion}
                    </span>
                    {entry.traceSummary.reasonCode && (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                            reasonCode: {entry.traceSummary.reasonCode}
                        </span>
                    )}
                    {entry.traceSummary.retryClass && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                            retryClass: {entry.traceSummary.retryClass}
                        </span>
                    )}
                    {entry.traceSummary.failureClass && (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-800">
                            failureClass: {entry.traceSummary.failureClass}
                        </span>
                    )}
                    {entry.traceSummary.abortMode && (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                            abortMode: {entry.traceSummary.abortMode}
                        </span>
                    )}
                    {entry.traceSummary.abortSource && (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                            abortSource: {entry.traceSummary.abortSource}
                        </span>
                    )}
                    {entry.traceSummary.abortPropagationStatus && (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                            propagation: {entry.traceSummary.abortPropagationStatus}
                        </span>
                    )}
                </div>
            </div>
        )}
        {entry.detail && Object.keys(entry.detail).length > 0 && (
            <div className="mt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Detail preview</p>
                <pre className="overflow-x-auto rounded-card border border-white/80 bg-white/85 p-3 text-xs text-slate-600">
                    {formatJson(entry.detail)}
                </pre>
            </div>
        )}
        {isSnapshotExpanded && (
            <div className="mt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Payload snapshot</p>
                <pre className="overflow-x-auto rounded-card border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
                    {formatJson(entry.payloadSnapshot)}
                </pre>
            </div>
        )}
    </article>
);
