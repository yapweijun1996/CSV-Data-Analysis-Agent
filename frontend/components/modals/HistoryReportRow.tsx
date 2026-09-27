
import React from 'react';
import { getTranslation } from '../../utils/localization';
import { HistoryOverflowMenu } from './HistoryOverflowMenu';
import type { ReportListItem } from '../../types';

// ── Inline icons ───────────────────────────────────────────────────────

const FileIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
);

const ChevronIcon: React.FC<{ open: boolean }> = ({ open }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
    </svg>
);

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
    const hasTitle = Boolean(latest.reportTitle);
    const displayTitle = latest.reportTitle ?? group.filename;
    const dualDates = showDualDates(latest.createdAt, latest.updatedAt);

    const renderActionButton = (report: ReportListItem, isCurrent: boolean, compact?: boolean) => (
        <button
            onClick={() => isCurrent ? void onOpenReport(report.id) : void onLoad(report.id)}
            disabled={loadingId !== null}
            className={`min-h-[44px] rounded-lg border border-slate-200 bg-white text-xs font-medium transition-colors ${
                compact ? 'rounded-md px-2 py-1' : 'px-3 py-1.5'
            } ${loadingId === report.id ? 'text-slate-400 cursor-wait' : 'text-slate-700 hover:border-slate-300 hover:bg-slate-50'} ${
                loadingId !== null && loadingId !== report.id ? 'opacity-50 cursor-not-allowed' : ''
            }`}
        >
            {loadingId === report.id
                ? (getTranslation('history_loading', language) ?? 'Loading...')
                : isCurrent
                    ? getTranslation('history_open_report', language)
                    : getTranslation('history_load_session', language)}
        </button>
    );

    return (
        <li className="group/row">
            {/* Primary entry */}
            <div className={`flex items-start gap-3 px-5 py-3 transition-colors hover:bg-slate-50 ${isCurrent ? 'bg-blue-50/50' : ''}`}>
                <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${isCurrent ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                    <FileIcon />
                </div>
                <div className="min-w-0 flex-1">
                    {/* Title */}
                    <p className="truncate text-sm font-medium text-slate-800">
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
                                <span className="text-[11px] text-slate-300">&middot;</span>
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
                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                                {getTranslation('history_current_badge', language)}
                            </span>
                        )}
                        {older.length > 0 && (
                            <button
                                onClick={() => onToggleExpand(group.filename)}
                                className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 transition-colors hover:bg-slate-200"
                            >
                                <ChevronIcon open={isGroupExpanded} />
                                {getTranslation('history_older_versions', language, { count: older.length })}
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
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
                                {entry.reportTitle && (
                                    <p className="truncate text-xs text-slate-500">{entry.reportTitle}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                    {showDualDates(entry.createdAt, entry.updatedAt) ? (
                                        <>
                                            <span className="text-[11px] text-slate-400">
                                                {getTranslation('history_created_label', language)}: {formatDate(entry.createdAt)}
                                            </span>
                                            <span className="text-[11px] text-slate-300">&middot;</span>
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
