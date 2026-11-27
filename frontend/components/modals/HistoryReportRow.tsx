
import React from 'react';
import { getTranslation } from '../../utils/localization';
import { HistoryOverflowMenu } from './HistoryOverflowMenu';
import type { ReportListItem } from '../../types';
import { isUsableReportTitle } from '../../services/agent/reportContext';
import { CsvFileIcon, csvToneFor, HistoryChartIcon, HistoryPlayIcon, HistoryChevronIcon } from './HistoryIcons';

// ── Types ──────────────────────────────────────────────────────────────

export interface ReportGroup {
    filename: string;
    latest: ReportListItem;
    older: ReportListItem[];
    isCurrent: boolean;
}

interface HistoryReportRowProps {
    group: ReportGroup;
    language: string;
    loadingId: string | null;
    isGroupExpanded: boolean;
    overflowMenuId: string | null;
    overflowRef: React.RefObject<HTMLDivElement | null>;
    onToggleExpand: (filename: string) => void;
    onLoad: (id: string) => void;
    onOpenReport: (id: string) => void;
    onDelete: (id: string, filename: string) => void;
    onExportPdf: (id: string) => void;
    onOverflowToggle: (id: string | null) => void;
    isProtectedReport: (id: string) => boolean;
    formatDate: (date: Date | string) => string;
    formatDateFull: (date: Date | string) => string;
}

// ── Helpers ────────────────────────────────────────────────────────────

const showDualDates = (created: Date | string, updated: Date | string): boolean =>
    Math.abs(new Date(updated).getTime() - new Date(created).getTime()) > 60_000;

// ── Component ──────────────────────────────────────────────────────────

export const HistoryReportRow: React.FC<HistoryReportRowProps> = ({
    group, language, loadingId, isGroupExpanded, overflowMenuId, overflowRef,
    onToggleExpand, onLoad, onOpenReport, onDelete, onExportPdf, onOverflowToggle,
    isProtectedReport, formatDate, formatDateFull,
}) => {
    const { latest, older, isCurrent } = group;
    // Saved reports from before the title heuristic can carry a period ("From 01-01-2026 To 30-06-2026") as title.
    const latestTitle = latest.reportTitle && isUsableReportTitle(latest.reportTitle) ? latest.reportTitle : null;
    const hasTitle = Boolean(latestTitle);
    const displayTitle = latestTitle ?? group.filename;
    const dualDates = showDualDates(latest.createdAt, latest.updatedAt);

    const renderActionButton = (report: ReportListItem, isCurrent: boolean, compact?: boolean) => {
        const busy = loadingId === report.id;
        const ActionIcon = isCurrent ? HistoryChartIcon : HistoryPlayIcon;
        return (
            <button
                onClick={() => isCurrent ? void onOpenReport(report.id) : void onLoad(report.id)}
                disabled={loadingId !== null}
                className={`inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-xl border bg-white text-xs font-semibold transition-colors ${
                    compact ? 'px-2.5 py-1' : 'px-3.5 py-1.5'
                } ${busy ? 'cursor-wait border-slate-200 text-slate-400' : 'border-indigo-200 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50'} ${
                    loadingId !== null && !busy ? 'cursor-not-allowed opacity-50' : ''
                }`}
            >
                {!busy && <ActionIcon className="h-4 w-4" />}
                {busy
                    ? (getTranslation('history_loading', language) ?? 'Loading...')
                    : isCurrent
                        ? getTranslation('history_open_report', language)
                        : getTranslation('history_load_session', language)}
            </button>
        );
    };

    return (
        <li className={`group/row overflow-hidden rounded-2xl border shadow-sm transition-shadow hover:shadow-md ${isCurrent ? 'border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50/60' : 'border-slate-200/80 bg-white'}`}>
            {/* Primary entry */}
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap">
                <CsvFileIcon tone={csvToneFor(group.filename)} className="mt-0.5 h-11 w-9 flex-shrink-0" />
                <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-auto">
                    {/* Title */}
                    <p className="truncate text-sm font-semibold text-slate-900">
                        {displayTitle}
                    </p>
                    {/* Filename subtitle (only when title exists and differs from filename) */}
                    {hasTitle && (
                        <p className="truncate text-xs text-slate-400 mt-0.5">
                            {group.filename}
                        </p>
                    )}
                    {/* Description */}
                    {latest.reportDescription && (
                        <p className="mt-1 text-xs leading-relaxed text-slate-400 line-clamp-2">
                            {latest.reportDescription}
                        </p>
                    )}
                    {/* Dates + badges */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
                        {dualDates ? (
                            <>
                                <span className="text-[11px] text-slate-400">
                                    {getTranslation('history_created_label', language)}: {formatDate(latest.createdAt)}
                                </span>
                                <span className="hidden text-[11px] text-slate-300 sm:inline">&middot;</span>
                                <span className="text-[11px] text-slate-400">
                                    {getTranslation('history_modified_label', language)}: {formatDate(latest.updatedAt)}
                                </span>
                            </>
                        ) : (
                            <span className="text-[11px] text-slate-400">
                                {formatDateFull(latest.updatedAt)}
                            </span>
                        )}
                        {isCurrent && (
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                {getTranslation('history_current_badge', language)}
                            </span>
                        )}
                        {older.length > 0 && (
                            <button
                                onClick={() => onToggleExpand(group.filename)}
                                className="inline-flex items-center gap-0.5 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-slate-50"
                            >
                                <HistoryChevronIcon className={`h-3.5 w-3.5 transition-transform ${isGroupExpanded ? '' : '-rotate-90'}`} />
                                {getTranslation('history_older_versions', language, { count: older.length })}
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex w-full flex-shrink-0 items-center justify-end gap-1 sm:w-auto">
                    {renderActionButton(latest, isCurrent)}
                    <HistoryOverflowMenu
                        reportId={latest.id}
                        reportFilename={group.filename}
                        isOpen={overflowMenuId === latest.id}
                        isProtected={isProtectedReport(latest.id)}
                        language={language}
                        overflowRef={overflowRef}
                        onToggle={onOverflowToggle}
                        onOpenReport={onOpenReport}
                        onExportPdf={onExportPdf}
                        onDelete={onDelete}
                    />
                </div>
            </div>

            {/* Older versions (collapsed by default) */}
            {isGroupExpanded && older.length > 0 && (
                <div className="border-t border-slate-50 bg-slate-50/50">
                    {older.map(entry => (
                        <div key={entry.id} className="flex items-center gap-3 px-5 py-2 pl-16 transition-colors hover:bg-slate-100/80">
                            <div className="min-w-0 flex-1">
                                {entry.reportTitle && isUsableReportTitle(entry.reportTitle) && (
                                    <p className="truncate text-xs text-slate-500">{entry.reportTitle}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                    {showDualDates(entry.createdAt, entry.updatedAt) ? (
                                        <>
                                            <span className="text-[11px] text-slate-400">
                                                {getTranslation('history_created_label', language)}: {formatDate(entry.createdAt)}
                                            </span>
                                            <span className="hidden text-[11px] text-slate-300 sm:inline">&middot;</span>
                                            <span className="text-[11px] text-slate-400">
                                                {getTranslation('history_modified_label', language)}: {formatDate(entry.updatedAt)}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-[11px] text-slate-400">
                                            {getTranslation('history_created_label', language)}: {formatDate(entry.createdAt)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                {renderActionButton(entry, false, true)}
                                <HistoryOverflowMenu
                                    reportId={entry.id}
                                    reportFilename={group.filename}
                                    isOpen={overflowMenuId === entry.id}
                                    isProtected={isProtectedReport(entry.id)}
                                    language={language}
                                    overflowRef={overflowRef}
                                    onToggle={onOverflowToggle}
                                    onOpenReport={onOpenReport}
                                    onExportPdf={onExportPdf}
                                    onDelete={onDelete}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </li>
    );
};
