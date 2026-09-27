import React, { useMemo } from 'react';
import type {
    AgentActivityKind,
    AgentActivityLifecycle,
    AgentEvent,
} from '../../types';
import { selectReportScopedActivity } from '../../services/agent/activity/agentActivity';

const lifecycleClasses: Record<AgentActivityLifecycle, string> = {
    queued: 'border-slate-200 bg-slate-100 text-slate-700',
    running: 'border-blue-200 bg-blue-100 text-blue-800',
    waiting: 'border-violet-200 bg-violet-100 text-violet-800',
    degraded: 'border-amber-200 bg-amber-100 text-amber-800',
    failed: 'border-rose-200 bg-rose-100 text-rose-800',
    cancelled: 'border-slate-300 bg-slate-200 text-slate-700',
    completed: 'border-emerald-200 bg-emerald-100 text-emerald-800',
};

const kindLabels: Record<AgentActivityKind, string> = {
    intake: 'Intake',
    preparation: 'Preparation',
    research: 'Research',
    follow_up: 'Follow-up',
    tool: 'Tool',
    approval: 'Approval',
    artifact: 'Artifact',
    terminal: 'Outcome',
};

type AgentActivityViewProps = {
    events: AgentEvent[];
    sessionId?: string | null;
    datasetId?: string | null;
    limit?: number;
    compact?: boolean;
    emptyMessage?: string;
};

export const AgentActivityView: React.FC<AgentActivityViewProps> = ({
    events,
    sessionId,
    datasetId,
    limit = 50,
    compact = false,
    emptyMessage = 'No assistant activity has been recorded for this report yet.',
}) => {
    const activity = useMemo(
        () => selectReportScopedActivity(events, { sessionId, datasetId }).slice(-limit),
        [datasetId, events, limit, sessionId],
    );

    if (activity.length === 0) {
        return (
            <p className="rounded-card border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                {emptyMessage}
            </p>
        );
    }

    return (
        <ol
            className={compact ? 'space-y-2' : 'space-y-3'}
            aria-label="Assistant activity"
            aria-live="polite"
        >
            {activity.map(event => {
                const descriptor = event.activity!;
                return (
                    <li
                        key={event.id}
                        data-agent-activity-kind={descriptor.kind}
                        data-agent-lifecycle={descriptor.lifecycle}
                        className={`rounded-card border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'}`}
                    >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    {kindLabels[descriptor.kind]}
                                </span>
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${lifecycleClasses[descriptor.lifecycle]}`}>
                                    {descriptor.lifecycle}
                                </span>
                            </div>
                            <time className="text-xs text-slate-400" dateTime={event.timestamp.toISOString()}>
                                {event.timestamp.toLocaleString()}
                            </time>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{descriptor.title}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{event.message}</p>
                        {descriptor.explanation && (
                            <p className="mt-2 text-xs text-slate-500">{descriptor.explanation}</p>
                        )}
                    </li>
                );
            })}
        </ol>
    );
};
