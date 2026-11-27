
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore, AppStore } from '../../store/useAppStore';
import { CURRENT_SESSION_KEY, getStorageBreakdown } from '../../services/storageService';
import { IconClose } from '../../icons/IconClose';
import { HistoryStackIcon, HistorySearchIcon, HistoryTrashIcon, HistoryChevronIcon } from './HistoryIcons';
import { getTranslation } from '../../utils/localization';
import { confirmModal } from '../../services/ui/modalService';
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
type HistoryTab = 'all' | 'recent' | 'versions';

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
    const [tab, setTab] = useState<HistoryTab>('all');
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
        const message = nonCurrentReports.length > 0
            ? getTranslation('history_confirm_purge_records', language, { count: nonCurrentReports.length })
            : getTranslation('history_confirm_purge_cache', language);
        const confirmed = await confirmModal({
            title: getTranslation('history_confirm_purge_title', language),
            message,
            confirmLabel: getTranslation('history_clear_all', language),
            cancelLabel: getTranslation('history_switch_cancel', language),
            tone: 'danger',
        });
        if (!confirmed) return;
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

    const searchedGroups = useMemo(
        () => groups.filter(g => {
            if (!search) return true;
            const q = search.toLowerCase();
            const title = g.latest.reportTitle?.toLowerCase() ?? '';
            return g.filename.toLowerCase().includes(q) || title.includes(q);
        }),
        [groups, search],
    );

    // Tabs only expose filters that real stored data can answer (recency and saved versions).
    const tabCounts = useMemo(() => {
        const now = Date.now();
        return {
            all: searchedGroups.length,
            recent: searchedGroups.filter(g => now - new Date(g.latest.updatedAt).getTime() <= RECENT_WINDOW_MS).length,
            versions: searchedGroups.filter(g => g.older.length > 0).length,
        } satisfies Record<HistoryTab, number>;
    }, [searchedGroups]);

    const filteredGroups = useMemo(() => {
        if (tab === 'all') return searchedGroups;
        if (tab === 'versions') return searchedGroups.filter(g => g.older.length > 0);
        const now = Date.now();
        return searchedGroups.filter(g => now - new Date(g.latest.updatedAt).getTime() <= RECENT_WINDOW_MS);
    }, [searchedGroups, tab]);

    if (!isOpen) return null;

    const handleDelete = async (id: string, filename: string) => {
        setOverflowMenuId(null);
        const confirmed = await confirmModal({
            title: getTranslation('history_confirm_delete_title', language),
            message: getTranslation('history_confirm_delete_message', language, { filename }),
            confirmLabel: getTranslation('history_delete', language),
            cancelLabel: getTranslation('history_switch_cancel', language),
            tone: 'danger',
        });
        if (confirmed) onDeleteReport(id);
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

    const tabs: [HistoryTab, string][] = [
        ['all', getTranslation('history_tab_all', language)],
        ['recent', getTranslation('history_tab_recent', language)],
        ['versions', getTranslation('history_tab_versions', language)],
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4 backdrop-blur-[2px]" onClick={onClose}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="history-dialog-title"
                tabIndex={-1}
                className="relative flex h-full max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="relative flex items-center justify-between gap-3 px-6 pb-3 pt-5">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-accent-100/80 via-accent-50/50 to-transparent" aria-hidden="true" />
                    <div className="relative flex items-center gap-3">
                        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-md shadow-accent-200">
                            <HistoryStackIcon className="h-6 w-6" />
                        </span>
                        <div>
                            <h2 id="history-dialog-title" className="text-lg font-semibold text-slate-900">
                                {getTranslation('history_title', language)}
                            </h2>
                            <p className="mt-0.5 text-xs text-slate-500">
                                {getTranslation('history_footer', language)}
                            </p>
                        </div>
                    </div>
                    <button
                        data-dialog-initial-focus
                        onClick={onClose}
                        className="relative flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-white hover:text-slate-900"
                        title={getTranslation('history_close', language)}
                        aria-label={getTranslation('history_close', language)}
                    >
                        <IconClose />
                    </button>
                </div>

                {/* Search */}
                <div className="px-6 pb-3">
                    <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm transition focus-within:border-accent-300 focus-within:ring-2 focus-within:ring-accent-100">
                        <HistorySearchIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={getTranslation('history_search_placeholder', language)}
                            aria-label={getTranslation('history_search_placeholder', language)}
                            className="min-h-[44px] w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
                        />
                    </label>
                </div>

                {/* Tabs + sort + clear all */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-100 px-6 pb-2">
                    <div role="tablist" aria-label={getTranslation('history_filter_label', language)} className="flex flex-wrap items-center gap-1.5">
                        {tabs.map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={tab === id}
                                onClick={() => setTab(id)}
                                className={`min-h-[36px] rounded-full px-3.5 text-xs font-semibold transition-colors ${
                                    tab === id
                                        ? 'bg-gradient-to-r from-accent-600 to-accent-600 text-white shadow-sm'
                                        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                {label} ({tabCounts[id]})
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1">
                        <label className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span>{getTranslation('history_sort', language)}</span>
                            <span className="relative">
                                <select
                                    value={sortField}
                                    onChange={e => { setSortField(e.target.value as SortField); setSortDirection(e.target.value === 'filename' ? 'asc' : 'desc'); }}
                                    aria-label={getTranslation('history_sort_aria', language)}
                                    className="min-h-[36px] cursor-pointer appearance-none rounded-lg bg-transparent py-1 pl-1.5 pr-6 text-xs font-medium text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-200"
                                >
                                    <option value="updatedAt">{getTranslation('history_sort_modified', language)}</option>
                                    <option value="createdAt">{getTranslation('history_sort_created', language)}</option>
                                    <option value="filename">{getTranslation('history_sort_name', language)}</option>
                                </select>
                                <HistoryChevronIcon className="pointer-events-none absolute right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                            </span>
                        </label>
                        <button
                            type="button"
                            onClick={() => setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc')}
                            title={getTranslation('history_sort_direction', language)}
                            aria-label={getTranslation('history_sort_direction', language)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-sm text-slate-500 hover:bg-slate-100"
                        >
                            <span aria-hidden="true">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                        </button>
                        <button
                            onClick={() => void handlePurge()}
                            disabled={isPurging}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-danger-600 transition-colors hover:bg-danger-50 hover:text-danger-700 disabled:cursor-wait disabled:opacity-50"
                            title={getTranslation('history_clear_all_title', language)}
                        >
                            <HistoryTrashIcon className="h-4 w-4" />
                            {isPurging
                                ? getTranslation('history_clearing', language)
                                : getTranslation('history_clear_all', language)}
                        </button>
                    </div>
                </div>

                {/* Storage usage */}
                <div className="flex items-center justify-between px-6 py-1.5">
                    {storageError ? (
                        <div role="alert" className="flex items-center gap-2 text-xs text-warning-800">
                            <span>{getTranslation('history_storage_unavailable', language)}</span>
                            <button
                                type="button"
                                onClick={() => void refreshStorageInfo()}
                                className="min-h-[44px] rounded px-2 font-semibold text-accent-700 hover:bg-accent-50"
                            >
                                {getTranslation('history_storage_retry', language)}
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowStorageInspector(prev => !prev)}
                            className="flex min-h-[36px] items-center gap-1.5 rounded-md px-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
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
                            <HistoryChevronIcon className={`h-3 w-3 transition-transform ${showStorageInspector ? '' : '-rotate-90'}`} />
                        </button>
                    )}
                </div>

                {/* Storage Inspector (expandable) */}
                {showStorageInspector && (
                    <div className="border-y border-slate-100 bg-slate-50/60 px-6 py-3">
                        <StorageBreakdown
                            activeSessionId={currentSessionId}
                            onStorageChanged={() => void refreshStorageInfo()}
                        />
                    </div>
                )}

                {/* Report list */}
                <div className="flex-grow overflow-y-auto px-4 pb-4">
                    {filteredGroups.length === 0 ? (
                        <div className="flex items-center justify-center h-full px-5">
                            <p className="text-sm text-slate-500">
                                {search || tab !== 'all'
                                    ? getTranslation('history_no_results', language)
                                    : getTranslation('history_empty', language)}
                            </p>
                        </div>
                    ) : (
                        <ul className="space-y-2.5">
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
                                    onDelete={(id, filename) => void handleDelete(id, filename)}
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
                    <div className="absolute inset-0 z-30 flex items-center justify-center rounded-3xl bg-scrim/40 backdrop-blur-[2px]">
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
                                    className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-700"
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
