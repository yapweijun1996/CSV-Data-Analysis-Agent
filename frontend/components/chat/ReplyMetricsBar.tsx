import React, { useState } from 'react';
import type { ReplyTelemetry } from '../../types/chat';
import { buildReplyMetricItems } from '../../utils/replyTelemetry';
import { IconChevron } from '../../icons/IconChevron';

/** Per-reply metrics strip (TPS · TTFT · Duration · Tokens · Cost) with an expandable detail row. */
export const ReplyMetricsBar: React.FC<{ telemetry: ReplyTelemetry }> = ({ telemetry }) => {
    const [expanded, setExpanded] = useState(false);
    const items = buildReplyMetricItems(telemetry);
    const details: Array<[string, string]> = [
        ['Model', telemetry.model ?? 'N/A'],
        ['Reasoning', telemetry.reasoningEffort ?? 'N/A'],
        ['Input tokens', telemetry.inputTokens?.toLocaleString('en-US') ?? 'N/A'],
        ['Output tokens', telemetry.outputTokens?.toLocaleString('en-US') ?? 'N/A'],
    ];
    return (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-600" data-testid="reply-metrics-bar">
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
                aria-label="Toggle response details"
                className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-left md:min-h-0"
            >
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    {telemetry.scope === 'coordinator' && <span className="font-medium text-slate-500" title="Tokens and speed count only the coordinator model calls. Stage tools run separate model calls that are not included.">Coordinator</span>}
                    {items.map(([label, value], index) => (
                        <React.Fragment key={label}>
                            {index > 0 && <span aria-hidden="true" className="text-slate-300">·</span>}
                            <span>{label} <strong className="font-semibold text-slate-900">{value}</strong></span>
                        </React.Fragment>
                    ))}
                </span>
                <span className="flex-shrink-0 text-slate-400 [&_svg]:h-4 [&_svg]:w-4"><IconChevron isOpen={expanded} /></span>
            </button>
            {expanded && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 px-3 py-2 sm:grid-cols-3">
                    {details.map(([label, value]) => (
                        <div key={label} className="min-w-0">
                            <dt className="text-[11px] text-slate-400">{label}</dt>
                            <dd className="truncate font-medium text-slate-800" title={value}>{value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
};
