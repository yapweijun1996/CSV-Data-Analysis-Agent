import React from 'react';
import type { ExecutiveKpi } from '../../services/dashboard/executiveKpis';

interface ExecutiveKpiRowProps {
    title: string;
    subtitle: string;
    kpis: ExecutiveKpi[];
    actionLabel: string;
    onKpiAction?: (kpi: ExecutiveKpi) => void;
}

/* ── tone → visual accent ────────────────────────────────────── */

const toneCardClasses: Record<ExecutiveKpi['tone'], string> = {
    primary: 'border-blue-100 bg-gradient-to-br from-blue-50/60 via-white to-white',
    neutral: 'border-slate-200 bg-white',
    accent: 'border-teal-100 bg-gradient-to-br from-teal-50/50 via-white to-white',
    warning: 'border-amber-100 bg-gradient-to-br from-amber-50/50 via-white to-white',
};

const toneAccentClasses: Record<ExecutiveKpi['tone'], string> = {
    primary: 'bg-blue-500',
    neutral: 'bg-slate-400',
    accent: 'bg-teal-500',
    warning: 'bg-amber-500',
};

const toneIconBg: Record<ExecutiveKpi['tone'], string> = {
    primary: 'bg-blue-100 text-blue-600',
    neutral: 'bg-slate-100 text-slate-500',
    accent: 'bg-teal-100 text-teal-600',
    warning: 'bg-amber-100 text-amber-600',
};

/* ── hierarchy → sizing ──────────────────────────────────────── */

const hierarchyClasses: Record<ExecutiveKpi['hierarchy'], string> = {
    primary: 'p-5',
    secondary: 'p-5',
    insight: 'p-5',
};

const valueClasses: Record<ExecutiveKpi['hierarchy'], string> = {
    primary: 'text-3xl md:text-4xl',
    secondary: 'text-2xl md:text-3xl',
    insight: 'text-2xl md:text-3xl',
};

/* ── delta pill ──────────────────────────────────────────────── */

const deltaClasses: Record<NonNullable<ExecutiveKpi['delta']>['direction'], string> = {
    up: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    down: 'border-rose-200 bg-rose-50 text-rose-700',
    flat: 'border-slate-200 bg-slate-100 text-slate-700',
};

/* ── small inline SVG icons per tone ─────────────────────────── */

const ToneIcon: React.FC<{ tone: ExecutiveKpi['tone'] }> = ({ tone }) => {
    const paths: Record<ExecutiveKpi['tone'], React.ReactNode> = {
        primary: (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        ),
        neutral: (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        ),
        accent: (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        ),
        warning: (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        ),
    };

    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" className="h-4 w-4" aria-hidden="true">
            {paths[tone]}
        </svg>
    );
};

/* ── delta badge ─────────────────────────────────────────────── */

const renderDelta = (kpi: ExecutiveKpi) => {
    if (!kpi.delta) return null;
    return (
        <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${deltaClasses[kpi.delta.direction]}`}>
            <span>{kpi.delta.value}</span>
            <span className="font-normal">{kpi.delta.label}</span>
        </div>
    );
};

/* ── main component ──────────────────────────────────────────── */

const ExecutiveKpiRowComponent: React.FC<ExecutiveKpiRowProps> = ({ title, subtitle, kpis, actionLabel, onKpiAction }) => {
    if (kpis.length === 0) {
        return null;
    }

    return (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-label={title}>
            <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
                <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {kpis.map(kpi => {
                    const isActionable = kpi.action?.type === 'show-card' && Boolean(kpi.sourceCardId) && Boolean(onKpiAction);

                    const cardClasses = [
                        'group relative flex h-full w-full flex-col overflow-hidden rounded-xl border text-left transition-all duration-150',
                        toneCardClasses[kpi.tone],
                        hierarchyClasses[kpi.hierarchy],
                        isActionable
                            ? 'cursor-pointer hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
                            : 'shadow-sm',
                    ].join(' ');

                    const content = (
                        <>
                            {/* colored top accent bar */}
                            <span className={`absolute inset-x-0 top-0 h-[3px] ${toneAccentClasses[kpi.tone]}`} aria-hidden="true" />

                            {/* header: icon + label */}
                            <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center justify-center rounded-md p-1 ${toneIconBg[kpi.tone]}`}>
                                    <ToneIcon tone={kpi.tone} />
                                </span>
                                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{kpi.label}</p>
                            </div>
                            <p className="mt-2 text-[11px] font-medium text-slate-600">
                                {kpi.scope.label}
                                {kpi.scope.filterSummary ? ` · ${kpi.scope.filterSummary}` : ''}
                            </p>

                            {/* value */}
                            <p className={`mt-3 break-words font-semibold leading-tight text-slate-900 ${valueClasses[kpi.hierarchy]}`}>
                                {kpi.value}
                            </p>

                            {/* delta badge */}
                            {renderDelta(kpi)}

                            {/* detail text */}
                            <p className="mt-2 text-sm leading-relaxed text-slate-500">{kpi.detail}</p>

                            {/* action link — always bottom-right for consistency */}
                            {isActionable && (
                                <span className="mt-auto flex items-center gap-1 pt-3 text-xs font-semibold text-blue-600 transition-colors group-hover:text-blue-800">
                                    {actionLabel}
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                                        className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                                        <path fillRule="evenodd"
                                            d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z"
                                            clipRule="evenodd" />
                                    </svg>
                                </span>
                            )}
                        </>
                    );

                    if (isActionable) {
                        return (
                            <button
                                key={kpi.id}
                                type="button"
                                className={cardClasses}
                                onClick={() => onKpiAction?.(kpi)}
                            >
                                {content}
                            </button>
                        );
                    }

                    return (
                        <article key={kpi.id} className={cardClasses}>
                            {content}
                        </article>
                    );
                })}
            </div>
        </section>
    );
};

export const ExecutiveKpiRow = React.memo(ExecutiveKpiRowComponent);
