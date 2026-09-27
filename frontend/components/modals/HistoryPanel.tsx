
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore, AppStore } from '../../store/useAppStore';
import { CURRENT_SESSION_KEY, getStorageBreakdown } from '../../services/storageService';
import { IconClose } from '../../icons/IconClose';
import { getTranslation } from '../../utils/localization';
import { HistoryReportRow, ReportGroup } from './HistoryReportRow';
import { StorageBreakdown } from './StorageBreakdown';
import type { ReportListItem } from '../../types';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

// ── Helpers ───────────────────────────────────────────────────────────

const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

// ── Sorting ────────────────────────────────────────────────────────────

type SortField = 'updatedAt' | 'createdAt' | 'filename';
type SortDirection = 'asc' | 'desc';

// ── Grouping logic ─────────────────────────────────────────────────────

function groupReportsByFilename(
    reports: ReportListItem[],
    currentSessionId: string | null,
    sortField: SortField,
    sortDirection: SortDirection,
): ReportGroup[] {
    const groups = new Map<string, ReportListItem[]>();
    for (const report of reports) {
        const key = report.filename;
        const list = groups.get(key) ?? [];
        list.push(report);
        groups.set(key, list);
    }

    return Array.from(groups.values())
        .map(entries => {
            const sorted = entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            // If current session is in this group, make it the "latest"
            const currentIdx = sorted.findIndex(r => r.id === currentSessionId);
            const latest = currentIdx >= 0 ? sorted[currentIdx] : sorted[0];
            const older = sorted.filter(r => r.id !== latest.id);
            return {
                filename: latest.filename,
                latest,
                older,
                isCurrent: latest.id === currentSessionId,
            };
        })
        .sort((a, b) => {
            // Current session always first
            if (a.isCurrent) return -1;
            if (b.isCurrent) return 1;
            const dir = sortDirection === 'asc' ? 1 : -1;
            if (sortField === 'filename') {
                return dir * a.filename.localeCompare(b.filename);
            }
            const aDate = new Date(a.latest[sortField]).getTime();
            const bDate = new Date(b.latest[sortField]).getTime();
            return dir * (aDate - bDate);
        });
}

// ── Main component ─────────────────────────────────────────────────────

export const HistoryPanel: React.FC = () => {
    const {
        isOpen, onClose, reports, onLoadReport, onDeleteReport, onPurgeStorage, onOpenReport, onExportPdf,
        currentSessionId, language, hasCsvData,
    } = useAppStore((state: AppStore) => ({
        isOpen: state.isHistoryPanelOpen,
        onClose: () => state.setIsHistoryPanelOpen(false),
        reports: state.reportsList,
        onLoadReport: state.handleLoadReport,
        onDeleteReport: state.handleDeleteReport,
        onPurgeStorage: state.handlePurgeStorage,
        onOpenReport: state.openPersistedReportArtifact,
        onExportPdf: state.exportPersistedReportPdf,
        currentSessionId: state.sessionId,
        language: state.settings.language,
        hasCsvData: Boolean(state.csvData),
    }), shallow);

    const [search, setSearch] = useState('');
    const [overflowMenuId, setOverflowMenuId] = useState<string | null>(null);
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [confirmLoadId, setConfirmLoadId] = useState<string | null>(null);
    const [sortField, setSortField] = useState<SortField>('updatedAt');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [storageInfo, setStorageInfo] = useState<{ idbLabel: string; idbBytes: number } | null>(null);
    const [storageError, setStorageError] = useState(false);
    const [isPurging, setIsPurging] = useState(false);
    const [showStorageInspector, setShowStorageInspector] = useState(false);
    const overflowRef = useRef<HTMLDivElement>(null);
    const dialogRef = useDialogAccessibility<HTMLDivElement>(
        isOpen,
        onClose,
        { restoreFocusSelector: '[data-history-trigger="true"]' },
    );

    // Fetch actual IDB storage breakdown when modal opens
    const refreshStorageInfo = async () => {
        setStorageError(false);
        try {
            const breakdown = await getStorageBreakdown();
            setStorageInfo({
                idbLabel: formatBytes(breakdown.totalIdbBytes),
                idbBytes: breakdown.totalIdbBytes,
            });
        } catch {
            setStorageInfo(null);
            setStorageError(true);
        }
    };
    useEffect(() => {
        if (!isOpen) return;
        void refreshStorageInfo();
    }, [isOpen]);

    const handlePurge = async () => {
        const nonCurrentReports = reports.filter(r => r.id !== currentSessionId && r.id !== CURRENT_SESSION_KEY);
        const msg = nonCurrentReports.length > 0
            ? `Delete all ${nonCurrentReports.length} history records and free up storage? This cannot be undone.`
            : 'Clear all cached data (original CSV backups, memory runs, artifacts) to free up storage?';
        if (!window.confirm(msg)) return;
        setIsPurging(true);
        try {
            await onPurgeStorage();
            await refreshStorageInfo();
        } finally {
            setIsPurging(false);
        }
    };

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const handleLoad = (id: string) => {
        if (hasCsvData) {
            setConfirmLoadId(id);
            return;
        }
        void doLoad(id);
    };

    const doLoad = async (id: string) => {
        setConfirmLoadId(null);
        setLoadingId(id);
        try {
            await onLoadReport(id);
        } finally {
            setLoadingId(null);
        }
    };

    useEffect(() => {
        if (!overflowMenuId) return;
        const handler = (e: MouseEvent) => {
            if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
                setOverflowMenuId(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [overflowMenuId]);

    const groups = useMemo(
        () => groupReportsByFilename(reports, currentSessionId, sortField, sortDirection),
        [reports, currentSessionId, sortField, sortDirection],
    );

    const filteredGroups = useMemo(
        () => groups.filter(g => {
            if (!search) return true;
            const q = search.toLowerCase();
            const title = g.latest.reportTitle?.toLowerCase() ?? '';
            return g.filename.toLowerCase().includes(q) || title.includes(q);
        }),
        [groups, search],
    );

    if (!isOpen) return null;

    const handleDelete = (id: string, filename: string) => {
        if (window.confirm(`Are you sure you want to delete the report for "${filename}"? This cannot be undone.`)) {
            onDeleteReport(id);
            setOverflowMenuId(null);
        }
    };

    const pad = (n: number) => String(n).padStart(2, '0');
    const fmtStd = (date: Date | string): string => {
        const d = new Date(date);
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    const formatDate = fmtStd;
    const formatDateFull = fmtStd;

    const isProtectedReport = (reportId: string) =>
        reportId === currentSessionId || reportId === CURRENT_SESSION_KEY;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="history-dialog-title"
                tabIndex={-1}
                className="relative flex h-full max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div>
                        <h2 id="history-dialog-title" className="text-lg font-semibold text-slate-900">
                            {getTranslation('history_title', language)}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                            {getTranslation('history_footer', language)}
                        </p>
                    </div>
                    <button
                        data-dialog-initial-focus
                        onClick={onClose}
                        className="flex h-[44px] w-[44px] items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        title={getTranslation('history_close', language)}
                        aria-label={getTranslation('history_close', language)}
                    >
                        <IconClose />
                    </button>
                </div>

                {/* Search */}
                {reports.length > 2 && (
                    <div className="border-b border-slate-100 px-5 py-3">
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={getTranslation('history_search_placeholder', language)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                        />
                    </div>
                )}

                {/* Sort controls + storage bar */}
                {(reports.length > 2 || true) && (
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-2">
                        {reports.length > 2 ? (
                            <div className="flex items-center gap-1 text-[11px]">
                                <span className="text-slate-400 mr-1">{getTranslation('history_sort', language)}</span>
                                {([
                                    ['updatedAt', getTranslation('history_sort_modified', language)],
                                    ['createdAt', getTranslation('history_sort_created', language)],
                                    ['filename', getTranslation('history_sort_name', language)],
                                ] as [SortField, string][]).map(([field, label]) => (
                                    <button
                                        key={field}
                                        onClick={() => toggleSort(field)}
                                        className={`rounded px-1.5 py-0.5 transition-colors ${sortField === field ? 'bg-blue-100 text-blue-700 font-medium' : 'text-slate-500 hover:bg-slate-100'}`}
                                    >
                                        {label}
                                        {sortField === field && (
                                            <span className="ml-0.5">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : <div />}
                        <div className="flex items-center gap-2">
                            {storageError ? (
                                <div role="alert" className="flex items-center gap-2 text-xs text-amber-800">
                                    <span>{getTranslation('history_storage_unavailable', language)}</span>
                                    <button
                                        type="button"
                                        onClick={() => void refreshStorageInfo()}
                                        className="min-h-[44px] rounded px-2 font-semibold text-blue-700 hover:bg-blue-50"
                                    >
                                        {getTranslation('history_storage_retry', language)}
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowStorageInspector(prev => !prev)}
                                    className="flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                                    title={storageInfo
                                        ? getTranslation('history_storage_inspect_title', language, { size: storageInfo.idbLabel })
                                        : getTranslation('history_storage_loading', language)}
                                    disabled={!storageInfo}
                                >
                                    {storageInfo ? (
                                        <>
                                            <span>{getTranslation('history_storage_label', language)}</span>
                                            <span aria-hidden="true">·</span>
                                            <span>{storageInfo.idbLabel}</span>
                                        </>
                                    ) : <span>{getTranslation('history_storage_loading', language)}</span>}
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={`h-3 w-3 transition-transform ${showStorageInspector ? '' : '-rotate-90'}`}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
                                    </svg>
                                </button>
                            )}
                            <button
                                onClick={() => void handlePurge()}
                                disabled={isPurging}
                                className="min-h-[44px] rounded-md px-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-50"
                                title={getTranslation('history_clear_all_title', language)}
                            >
                                {isPurging
                                    ? getTranslation('history_clearing', language)
                                    : getTranslation('history_clear_all', language)}
                            </button>
                        </div>
                    </div>
                )}

                {/* Storage Inspector (expandable) */}
                {showStorageInspector && (
                    <div className="border-b border-slate-100 px-5 py-3 bg-slate-50/50">
                        <StorageBreakdown
                            activeSessionId={currentSessionId}
                            onStorageChanged={() => void refreshStorageInfo()}
                        />
                    </div>
                )}

                {/* Report list */}
                <div className="flex-grow overflow-y-auto">
                    {filteredGroups.length === 0 ? (
                        <div className="flex items-center justify-center h-full px-5">
                            <p className="text-sm text-slate-500">
                                {search
                                    ? getTranslation('history_no_results', language)
                                    : getTranslation('history_empty', language)}
                            </p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {filteredGroups.map(group => (
                                <HistoryReportRow
                                    key={group.latest.id}
                                    group={group}
                                    language={language}
                                    loadingId={loadingId}
                                    isGroupExpanded={expandedGroup === group.filename}
                                    overflowMenuId={overflowMenuId}
                                    overflowRef={overflowRef}
                                    onToggleExpand={fn => setExpandedGroup(prev => prev === fn ? null : fn)}
                                    onLoad={handleLoad}
                                    onOpenReport={id => void onOpenReport(id)}
                                    onDelete={handleDelete}
                                    onExportPdf={id => void onExportPdf(id)}
                                    onOverflowToggle={setOverflowMenuId}
                                    isProtectedReport={isProtectedReport}
                                    formatDate={formatDate}
                                    formatDateFull={formatDateFull}
                                />
                            ))}
                        </ul>
                    )}
                </div>

                {/* Inline confirmation overlay */}
                {confirmLoadId && (
                    <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-slate-900/40 backdrop-blur-[2px]">
                        <div className="mx-6 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
                            <h3 className="text-sm font-semibold text-slate-800">
                                {getTranslation('history_switch_session', language)}
                            </h3>
                            <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                {getTranslation('history_switch_session_desc', language)}
                            </p>
                            <div className="mt-4 flex justify-end gap-2">
                                <button
                                    onClick={() => setConfirmLoadId(null)}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                                >
                                    {getTranslation('history_switch_cancel', language)}
                                </button>
                                <button
                                    onClick={() => void doLoad(confirmLoadId)}
                                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                                >
                                    {getTranslation('history_switch_confirm', language)}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
