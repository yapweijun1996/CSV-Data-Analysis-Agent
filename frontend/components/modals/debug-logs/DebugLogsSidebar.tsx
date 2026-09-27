import React from 'react';
import type { DebugOperatorSummary } from '../../../services/agent/debugSelectors';

type DebugFilter = 'all' | 'tool' | 'telemetry' | 'event';
type DebugViewMode = 'timeline' | 'flows' | 'trace' | 'local';

interface IrDiagnosticEntry {
    cardId: string;
    displayTitle: string;
    semanticRole: string;
    narrativeEligibility: string;
    businessMeaningConfidence: number;
    selectionScore: number;
    helperExposureLevel: string;
    aggregationQualityFlags: string[];
    selectionReasons: string[];
}

interface DebugLogsSidebarProps {
    currentDatasetId: string | null;
    toolLogCount: number;
    telemetryCount: number;
    eventCount: number;
    flowCount: number;
    localDiagnosticCount: number;
    activeView: DebugViewMode;
    activeFilter: DebugFilter;
    irDiagnostics: IrDiagnosticEntry[];
    operatorSummary: DebugOperatorSummary;
    onViewChange: (view: DebugViewMode) => void;
    onFilterChange: (filter: DebugFilter) => void;
}

const filterPillClasses: Record<DebugFilter, string> = {
    all: 'border-slate-300 bg-white text-slate-700',
    tool: 'border-sky-200 bg-sky-50 text-sky-800',
    telemetry: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    event: 'border-amber-200 bg-amber-50 text-amber-800',
};

export const DebugLogsSidebar: React.FC<DebugLogsSidebarProps> = ({
    currentDatasetId,
    toolLogCount,
    telemetryCount,
    eventCount,
    flowCount,
    localDiagnosticCount,
    activeView,
    activeFilter,
    irDiagnostics,
    operatorSummary,
    onViewChange,
    onFilterChange,
}) => {
    const latestOutcome = operatorSummary.latestOutcome;
    const isBlockingFailure = latestOutcome?.lifecycleState === 'failed';
    const latestIssueLabel = isBlockingFailure
        ? 'Latest blocking failure'
        : latestOutcome?.degraded
            ? 'Latest degradation reason'
            : 'Latest diagnostic reason';

    return (
    <aside className="space-y-4 overflow-y-auto">
        <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Current session</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">{currentDatasetId || 'No dataset id'}</h3>
            <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-card border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-500">Tool logs</p>
                    <p className="mt-1 font-semibold text-slate-900">{toolLogCount}</p>
                </div>
                <div className="rounded-card border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-500">Telemetry</p>
                    <p className="mt-1 font-semibold text-slate-900">{telemetryCount}</p>
                </div>
                <div className="rounded-card border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-500">Agent events</p>
                    <p className="mt-1 font-semibold text-slate-900">{eventCount}</p>
                </div>
            </div>
        </section>

        <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Filters</p>
            <div className="mt-4 flex flex-wrap gap-2">
                {(['timeline', 'flows', 'trace', 'local'] as const).map(view => (
                    <button
                        key={view}
                        onClick={() => onViewChange(view)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                            activeView === view ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}
                    >
                        {view}
                    </button>
                ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                {(['all', 'tool', 'telemetry', 'event'] as const).map(filter => (
                    <button
                        key={filter}
                        onClick={() => onFilterChange(filter)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                            activeFilter === filter ? filterPillClasses[filter] : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}
                    >
                        {filter}
                    </button>
                ))}
            </div>
        </section>

        <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Grouped flows</p>
            <p className="mt-2 text-sm text-slate-600">{flowCount} grouped flow{flowCount === 1 ? '' : 's'} by request/run/step context.</p>
            <p className="mt-2 text-sm text-slate-600">{localDiagnosticCount} bounded local diagnostic record{localDiagnosticCount === 1 ? '' : 's'} retained for up to 7 days.</p>
        </section>

        <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Operator Summary</p>
            <div className="mt-3 space-y-3 text-sm">
                <div className="rounded-card border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-500">Latest outcome</p>
                    <p className="mt-1 font-semibold text-slate-900">
                        {latestOutcome
                            ? `${latestOutcome.lifecycleState ?? 'unknown'} · ${latestOutcome.recoveryStatus ?? 'unclassified'}${latestOutcome.actualOutcomeShape ? ` · ${latestOutcome.actualOutcomeShape}` : ''}${latestOutcome.degraded ? ' · degraded' : ''}`
                            : 'No runtime outcome recorded'}
                    </p>
                </div>
                <div className={`rounded-card border p-3 ${isBlockingFailure ? 'border-red-200 bg-red-50' : latestOutcome?.degraded ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                    <p className="text-slate-500">{latestIssueLabel}</p>
                    <p className="mt-1 break-words font-semibold text-slate-900">{operatorSummary.latestFailureReason ?? 'None'}</p>
                </div>
                <div className="rounded-card border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-500">Latest fallback path</p>
                    <p className="mt-1 font-semibold text-slate-900 break-words">{operatorSummary.latestFallbackPath ?? 'None'}</p>
                </div>
                <div className="rounded-card border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-500">Retry budget</p>
                    <p className="mt-1 font-semibold text-slate-900">
                        {operatorSummary.latestRetry
                            ? `${operatorSummary.latestRetry.count}${operatorSummary.latestRetry.ceiling !== null ? ` / ${operatorSummary.latestRetry.ceiling}` : ''}${operatorSummary.latestRetry.reasonCode ? ` · ${operatorSummary.latestRetry.reasonCode}` : ''}`
                            : 'No retries recorded'}
                    </p>
                </div>
            </div>
        </section>

        {irDiagnostics.length > 0 && (
            <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">IR diagnostics</p>
                <p className="mt-2 text-sm text-slate-600">{irDiagnostics.length} derived card interpretation{irDiagnostics.length === 1 ? '' : 's'} from the current analysis cards.</p>
                <div className="mt-4 space-y-3">
                    {irDiagnostics.map(entry => (
                        <div key={entry.cardId} className="rounded-card border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                            <p className="font-semibold text-slate-900">{entry.displayTitle}</p>
                            <p className="mt-1"><span className="font-semibold text-slate-900">Role:</span> {entry.semanticRole}</p>
                            <p className="mt-1"><span className="font-semibold text-slate-900">Narrative:</span> {entry.narrativeEligibility} · confidence {entry.businessMeaningConfidence.toFixed(2)} · score {entry.selectionScore}</p>
                            <p className="mt-1"><span className="font-semibold text-slate-900">Helper exposure:</span> {entry.helperExposureLevel}</p>
                            <p className="mt-1"><span className="font-semibold text-slate-900">Flags:</span> {entry.aggregationQualityFlags.join(', ') || 'none'}</p>
                            <p className="mt-1"><span className="font-semibold text-slate-900">Reasons:</span> {entry.selectionReasons.join(', ') || 'none'}</p>
                        </div>
                    ))}
                </div>
            </section>
        )}
    </aside>
    );
};
