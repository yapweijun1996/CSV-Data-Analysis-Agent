
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { vectorStore } from '../../services/vectorStore';
import { VectorStoreDocument } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { flushPendingVectorMemoryDocs } from '../../services/agent/memory/vectorMemorySync';
import { IconClose } from '../../icons/IconClose';
import { IconMemory } from '../../icons/IconMemory';
import { IconDelete } from '../../icons/IconDelete';
import { IconSearch } from '../../icons/IconSearch';
import {
    IconAlertCircle, IconAnalysisCard, IconBookmark, IconCheckCircle, IconCopy,
    IconDatabase, IconLayers, IconNote, IconSpinner,
} from '../../icons/IconMemoryDashboard';
import { getTranslation } from '../../utils/localization';
import { confirmModal } from '../../services/ui/modalService';
import { showToast as toast } from '../../services/ui/toastService';
import { resolveReportMemoryScope } from '../../services/agent/memory/memoryScope';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

type SearchResult = {
    text: string;
    score: number;
    origin?: string;
};

type MemoryKind = 'dataset' | 'analysis' | 'note';
const COLLAPSE_THRESHOLD = 220;

const detectKind = (text: string): MemoryKind => {
    if (/^\s*\[Analysis Card\]/i.test(text)) return 'analysis';
    if (/^\s*Dataset\b/i.test(text)) return 'dataset';
    return 'note';
};

/** "session-41ca0d0e-66a1-..." -> "session-41ca0d0e…"; the full id stays in the tooltip and copy action. */
export const shortenId = (id: string): string => {
    if (id.length <= 18) return id;
    const match = /^([A-Za-z]+)-(.+)$/.exec(id);
    return match ? `${match[1]}-${match[2].slice(0, 8)}…` : `${id.slice(0, 12)}…${id.slice(-4)}`;
};

const KIND_STYLE: Record<MemoryKind, { icon: React.FC<React.SVGProps<SVGSVGElement>>; tint: string; labelKey: string }> = {
    dataset: { icon: IconDatabase, tint: 'bg-blue-100 text-blue-600', labelKey: 'memory_type_dataset' },
    analysis: { icon: IconAnalysisCard, tint: 'bg-indigo-100 text-indigo-600', labelKey: 'memory_type_analysis' },
    note: { icon: IconNote, tint: 'bg-slate-100 text-slate-600', labelKey: 'memory_type_note' },
};

const docTime = (doc: VectorStoreDocument): number => {
    const raw = doc.metadata?.origin?.createdAt ?? doc.metadata?.extractedAt;
    const time = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(time) ? time : 0;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractTerms = (query: string): string[] =>
    Array.from(new Set(query.toLowerCase().split(/\s+/).filter(term => term.length >= 2)));

const HighlightedText: React.FC<{ text: string; terms: string[] }> = ({ text, terms }) => {
    if (terms.length === 0) return <>{text}</>;
    const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
    return (
        <>
            {text.split(pattern).map((part, index) => index % 2 === 1
                ? <mark key={index} className="rounded bg-yellow-200 px-0.5 text-slate-900">{part}</mark>
                : <React.Fragment key={index}>{part}</React.Fragment>)}
        </>
    );
};

const IdValue: React.FC<{ id: string; copyLabel: string; onCopy: (id: string) => void }> = ({ id, copyLabel, onCopy }) => (
    <span className="inline-flex min-w-0 items-center gap-1">
        <span className="truncate font-mono text-[12px]" title={id}>{shortenId(id)}</span>
        <button
            type="button"
            onClick={() => onCopy(id)}
            title={`${copyLabel}: ${id}`}
            aria-label={`${copyLabel}: ${id}`}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-blue-600"
        >
            <IconCopy />
        </button>
    </span>
);

const MemoryCard: React.FC<{
    doc: VectorStoreDocument;
    t: (key: string, params?: Record<string, string | number>) => string;
    highlighted: boolean;
    onDelete: (id: string) => void;
    onCopy: (id: string) => void;
    terms: string[];
    language: string;
}> = ({ doc, t, highlighted, onDelete, onCopy, terms, language }) => {
    const [expanded, setExpanded] = useState(false);
    const kind = KIND_STYLE[detectKind(doc.text)];
    const KindIcon = kind.icon;
    const collapsible = doc.text.length > COLLAPSE_THRESHOLD;
    const scope = doc.metadata?.scope;
    const rows: Array<{ label: string; node: React.ReactNode }> = [
        { label: t('memory_origin'), node: <span className="break-words">{doc.metadata?.origin?.label ?? t('memory_origin_legacy')}</span> },
    ];
    const created = docTime(doc);
    if (created > 0) {
        const locale = language === 'Mandarin' ? 'zh-CN' : language === 'Japanese' ? 'ja-JP' : language === 'Malay' ? 'ms-MY' : language === 'Vietnamese' ? 'vi-VN' : 'en-US';
        rows.push({ label: t('memory_created'), node: <span>{new Date(created).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</span> });
    }
    if (scope) {
        rows.push(
            { label: t('memory_report'), node: <IdValue id={scope.reportId} copyLabel={t('memory_copy_id')} onCopy={onCopy} /> },
            { label: t('memory_dataset'), node: <IdValue id={scope.datasetId} copyLabel={t('memory_copy_id')} onCopy={onCopy} /> },
            { label: t('memory_version'), node: <IdValue id={scope.datasetVersion} copyLabel={t('memory_copy_id')} onCopy={onCopy} /> },
        );
    }
    return (
        <li
            id={`memory-doc-${doc.text.substring(0, 30)}`}
            className={`group flex gap-3 rounded-xl border bg-white p-3 shadow-sm transition-all duration-300 ${highlighted ? 'border-blue-500 ring-2 ring-blue-500' : 'border-slate-200'}`}
        >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${kind.tint}`} title={t(kind.labelKey)}>
                <KindIcon />
            </span>
            <div className="min-w-0 flex-1">
                <p className={`break-words text-sm leading-6 text-slate-800 ${collapsible && !expanded ? 'line-clamp-4' : ''}`}><HighlightedText text={doc.text} terms={terms} /></p>
                {collapsible && (
                    <button
                        type="button"
                        onClick={() => setExpanded(value => !value)}
                        aria-expanded={expanded}
                        className="mt-0.5 py-1 text-xs font-semibold text-blue-600 hover:underline"
                    >
                        {expanded ? t('memory_show_less') : t('memory_show_more')}
                    </button>
                )}
                <dl className="mt-2 grid grid-cols-[auto,minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg bg-blue-50/70 px-3 py-2 text-xs text-slate-600">
                    {rows.map(row => (
                        <React.Fragment key={row.label}>
                            <dt className="font-medium text-slate-500">{row.label}:</dt>
                            <dd className="min-w-0 text-slate-700">{row.node}</dd>
                        </React.Fragment>
                    ))}
                </dl>
            </div>
            <button
                type="button"
                onClick={() => onDelete(doc.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-100 hover:text-red-600 sm:opacity-50 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                title={t('memory_delete_item')}
                aria-label={t('memory_delete_item')}
            >
                <IconDelete />
            </button>
        </li>
    );
};

// Soft capacity limit for the visual progress bar (in KB)
const MEMORY_CAPACITY_KB = 5 * 1024; // 5 MB

export const MemoryPanel: React.FC = () => {
    const isOpen = useAppStore(state => state.isMemoryPanelOpen);
    const onClose = () => useAppStore.getState().setIsMemoryPanelOpen(false);

    const [documents, setDocuments] = useState<VectorStoreDocument[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [activeQuery, setActiveQuery] = useState('');
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
    const [kindFilter, setKindFilter] = useState<'all' | MemoryKind>('all');
    const [highlightedDocText, setHighlightedDocText] = useState<string | null>(null);
    const [modelStatus, setModelStatus] = useState(vectorStore.getStatus());
    const [modelError, setModelError] = useState(vectorStore.getLastError());
    const language = useAppStore(state => state.settings.language);
    const t = useCallback((key: string, params?: Record<string, string | number>) => getTranslation(key, language, params), [language]);
    const dialogRef = useDialogAccessibility<HTMLDivElement>(isOpen, onClose);

    const isModelReady = modelStatus === 'ready';
    const activeMemoryScope = resolveReportMemoryScope(useAppStore.getState());

    const refreshDocuments = useCallback(async () => {
        const scope = resolveReportMemoryScope(useAppStore.getState());
        const docs = await vectorStore.getDocumentsForScope(scope);
        setDocuments(docs);
    }, []);

    const syncModelState = useCallback(() => {
        setModelStatus(vectorStore.getStatus());
        setModelError(vectorStore.getLastError());
    }, []);

    const kindCounts = useMemo(() => {
        const counts: Record<MemoryKind, number> = { dataset: 0, analysis: 0, note: 0 };
        documents.forEach(doc => { counts[detectKind(doc.text)] += 1; });
        return counts;
    }, [documents]);
    const activeFilter = kindFilter !== 'all' && kindCounts[kindFilter] === 0 ? 'all' : kindFilter;
    const visibleDocuments = useMemo(() => {
        const filtered = activeFilter === 'all' ? documents : documents.filter(doc => detectKind(doc.text) === activeFilter);
        const direction = sortOrder === 'newest' ? -1 : 1;
        // Documents without a timestamp keep their stored order and sink to the end.
        return filtered
            .map((doc, index) => ({ doc, index, time: docTime(doc) }))
            .sort((a, b) => {
                if (a.time === 0 || b.time === 0) return a.time === b.time ? a.index - b.index : (a.time === 0 ? 1 : -1);
                return (a.time - b.time) * direction || a.index - b.index;
            })
            .map(entry => entry.doc);
    }, [documents, activeFilter, sortOrder]);
    const highlightTerms = useMemo(() => extractTerms(activeQuery), [activeQuery]);

    const memoryUsage = useMemo(() => {
        if (documents.length === 0) return 0;
        // Estimate the size of the stored documents
        // Size of text (assuming average 2 bytes per char for UTF-16)
        const textSize = documents.reduce((acc, doc) => acc + (doc.text.length * 2), 0);
        // Size of embeddings (384 dimensions * 4 bytes per float32)
        const embeddingSize = documents.length * 384 * 4;
        return (textSize + embeddingSize) / 1024; // in KB
    }, [documents]);

    // Track whether we've already triggered activation for this panel open.
    const activationTriggered = useRef(false);

    useEffect(() => {
        if (isOpen) {
            void refreshDocuments();
            syncModelState();

            // Trigger on-demand vector memory activation when the panel opens (PERF-103).
            if (!activationTriggered.current) {
                activationTriggered.current = true;
                const store = { getState: useAppStore.getState, setState: useAppStore.setState };
                void vectorStore.ensureVectorMemoryReady(
                    'memory_panel',
                    store as never,
                    async (s) => {
                        await flushPendingVectorMemoryDocs(s as never);
                        void refreshDocuments();
                        syncModelState();
                    },
                ).then(() => {
                    syncModelState();
                    void refreshDocuments();
                });
            }
        } else {
            // Reset state on close
            activationTriggered.current = false;
            setSearchQuery('');
            setSearchResults([]);
            setHasSearched(false);
            setActiveQuery('');
            setKindFilter('all');
            setHighlightedDocText(null);
        }
    }, [isOpen, refreshDocuments, syncModelState]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim() || modelStatus === 'loading') return;
        setIsSearching(true);
        setHighlightedDocText(null);
        setHasSearched(true);
        setActiveQuery(searchQuery);
        syncModelState();
        const scope = resolveReportMemoryScope(useAppStore.getState());
        if (!scope) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }
        const results = await vectorStore.search(searchQuery, 5, scope);
        setSearchResults(results.map(item => ({
            text: item.text,
            score: item.score,
            origin: item.metadata?.origin?.label,
        })));
        syncModelState();
        setIsSearching(false);
    };

    const handleCopy = useCallback(async (id: string) => {
        try {
            await navigator.clipboard.writeText(id);
            toast({ type: 'success', message: t('memory_copied') });
        } catch {
            toast({ type: 'error', message: t('memory_copy_failed') });
        }
    }, [t]);

    const handleDelete = async (id: string) => {
        const confirmed = await confirmModal({
            title: t('memory_delete_title'),
            message: t('memory_delete_message'),
            confirmLabel: t('memory_delete_confirm'),
            cancelLabel: t('memory_cancel'),
            tone: 'danger',
        });
        if (!confirmed) return;
        await vectorStore.deleteDocument(id);
        vectorStore.schedulePersist();
        useAppStore.setState({ vectorStoreDocuments: await vectorStore.getDocuments() });
        await refreshDocuments();
        toast({ type: 'success', message: t('memory_deleted_toast') });
    };

    const handleClearAll = async () => {
        const confirmed = await confirmModal({
            title: t('memory_clear_title'),
            message: t('memory_clear_message'),
            confirmLabel: t('memory_clear_report'),
            cancelLabel: t('memory_cancel'),
            tone: 'danger',
        });
        if (!confirmed) return;
        await Promise.all(documents.map(document => vectorStore.deleteDocument(document.id)));
        vectorStore.schedulePersist();
        useAppStore.setState({ vectorStoreDocuments: await vectorStore.getDocuments() });
        await refreshDocuments();
        setSearchResults([]);
        toast({ type: 'success', message: t('memory_cleared_toast') });
    };

    const handleSearchResultClick = (text: string) => {
        setHighlightedDocText(text);
        const element = document.getElementById(`memory-doc-${text.substring(0, 30)}`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    if (!isOpen) return null;

    const memoryUsagePercentage = Math.min((memoryUsage / MEMORY_CAPACITY_KB) * 100, 100);
    // Keep a sliver visible so a tiny but non-zero usage still reads as "some".
    const barWidth = memoryUsage > 0 ? Math.max(memoryUsagePercentage, 2) : 0;
    const statusText = modelStatus === 'idle' ? t('memory_model_idle')
        : modelStatus === 'loading' ? t('memory_model_loading')
        : modelStatus === 'ready' ? t('memory_model_ready')
        : `${t('memory_model_error')} ${modelError ?? ''}`.trim();

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 backdrop-blur-sm sm:p-4"
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="memory-dialog-title"
                tabIndex={-1}
                className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-blue-50/80 via-white to-white shadow-2xl sm:h-[85vh]"
                onClick={e => e.stopPropagation()}
            >
                <header className="shrink-0 px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600" aria-hidden="true">
                                <IconMemory />
                            </span>
                            <div className="min-w-0">
                                <h2 id="memory-dialog-title" className="text-xl font-bold text-slate-900 sm:text-2xl">{t('memory_title')}</h2>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
                                    <span>{t('memory_items_count', { count: documents.length })}</span>
                                    <span className="text-slate-300" aria-hidden="true">|</span>
                                    <span>{t('memory_usage', { size: memoryUsage.toFixed(2) })}</span>
                                </div>
                                {activeMemoryScope && (
                                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500">
                                        <span className="font-medium">{t('memory_active_scope')}:</span>
                                        {[
                                            [t('memory_report'), activeMemoryScope.reportId],
                                            [t('memory_dataset'), activeMemoryScope.datasetId],
                                            [t('memory_version'), activeMemoryScope.datasetVersion],
                                        ].map(([label, id]) => (
                                            <span key={label} className="rounded-full bg-white/80 px-2 py-0.5 ring-1 ring-slate-200" title={id}>
                                                {label} <span className="font-mono">{shortenId(id)}</span>
                                            </span>
                                        ))}
                                    </p>
                                )}
                            </div>
                        </div>
                        <button
                            data-dialog-initial-focus
                            onClick={onClose}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-100 hover:text-slate-900"
                            title={t('memory_close')}
                            aria-label={t('memory_close')}
                        >
                            <IconClose />
                        </button>
                    </div>
                    <div
                        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(memoryUsagePercentage)}
                    >
                        <div className="h-1.5 rounded-full bg-blue-600 transition-all" style={{ width: `${barWidth}%` }} />
                    </div>
                </header>

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 md:grid-cols-[minmax(0,5fr),minmax(0,7fr)] md:overflow-hidden">
                    {/* Left: similarity search */}
                    <section className="flex min-h-0 flex-col md:overflow-y-auto">
                        <div className="shrink-0 rounded-xl border border-blue-100 bg-white/80 p-4 shadow-sm">
                            <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                                <span className="text-blue-600"><IconLayers /></span>
                                {t('memory_search_title')}
                            </h3>
                            <p
                                className={`mt-2 flex items-start gap-2 text-sm ${modelStatus === 'error' ? 'text-red-600' : 'text-slate-600'}`}
                                role="status"
                            >
                                <span className={`mt-0.5 shrink-0 ${modelStatus === 'ready' ? 'text-green-500' : modelStatus === 'error' ? 'text-red-500' : 'text-slate-400'}`}>
                                    {modelStatus === 'ready' ? <IconCheckCircle />
                                        : modelStatus === 'error' ? <IconAlertCircle />
                                        : modelStatus === 'loading' ? <IconSpinner /> : <IconLayers />}
                                </span>
                                <span>{statusText}</span>
                            </p>
                            <form onSubmit={handleSearch} className="mt-3 flex flex-col gap-2 sm:flex-row">
                                <label className="relative min-w-0 flex-1">
                                    <span className="sr-only">{t('memory_search_aria')}</span>
                                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center"><IconSearch /></span>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder={isModelReady ? t('memory_search_placeholder') : modelStatus === 'loading' ? t('memory_search_placeholder_loading') : t('memory_search_placeholder_idle')}
                                        disabled={modelStatus === 'loading' || isSearching}
                                        className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
                                    />
                                </label>
                                <button
                                    type="submit"
                                    disabled={modelStatus === 'loading' || isSearching || !searchQuery.trim()}
                                    className="min-h-[44px] rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                                >
                                    {isSearching ? '...' : t('memory_search_button')}
                                </button>
                            </form>
                        </div>
                        <div className="mt-4 flex-1">
                            {searchResults.length > 0 ? (
                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium text-slate-600">{t('memory_top_results')}</h4>
                                    {searchResults.map((result) => (
                                        <button
                                            type="button"
                                            key={result.text}
                                            onClick={() => handleSearchResultClick(result.text)}
                                            className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left text-xs shadow-sm hover:border-blue-500 hover:ring-1 hover:ring-blue-500"
                                        >
                                            <span className="mb-1 flex items-center justify-between">
                                                <span className="font-semibold text-slate-700">{t('memory_match')}</span>
                                                <span className="font-bold text-blue-600">{(result.score * 100).toFixed(1)}%</span>
                                            </span>
                                            <span className="mb-2 block h-1 w-full rounded-full bg-slate-200">
                                                <span className="block h-1 rounded-full bg-blue-500" style={{ width: `${result.score * 100}%` }} />
                                            </span>
                                            <span className="line-clamp-3 block break-words italic text-slate-600">"<HighlightedText text={result.text} terms={highlightTerms} />"</span>
                                            {result.origin && (
                                                <span className="mt-1 block text-[11px] text-slate-500">{t('memory_origin')}: {result.origin}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ) : hasSearched && !isSearching ? (
                                <p className="text-sm text-slate-500">{t('memory_no_results')}</p>
                            ) : null}
                        </div>
                    </section>

                    {/* Right: stored memories */}
                    <section className="flex min-h-0 flex-col">
                        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                            <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                                <span className="text-blue-600"><IconBookmark /></span>
                                {t('memory_all_title', { count: documents.length })}
                            </h3>
                            {documents.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleClearAll}
                                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-red-600 hover:bg-red-50"
                                >
                                    <IconDelete />
                                    {t('memory_clear_report')}
                                </button>
                            )}
                        </div>
                        {documents.length > 0 && (
                            <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2" role="group" aria-label={t('memory_filter_label')}>
                                {([['all', t('memory_filter_all'), documents.length], ...(Object.keys(KIND_STYLE) as MemoryKind[])
                                    .filter(kind => kindCounts[kind] > 0)
                                    .map(kind => [kind, t(KIND_STYLE[kind].labelKey), kindCounts[kind]])] as Array<[string, string, number]>).map(([key, label, count]) => (
                                    <button
                                        type="button"
                                        key={key}
                                        aria-pressed={activeFilter === key}
                                        onClick={() => setKindFilter(key as 'all' | MemoryKind)}
                                        className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors ${activeFilter === key ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-700'}`}
                                    >
                                        {label} <span className={activeFilter === key ? 'text-blue-100' : 'text-slate-400'}>{count}</span>
                                    </button>
                                ))}
                                <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
                                    <span>{t('memory_sort_label')}</span>
                                    <select
                                        value={sortOrder}
                                        onChange={event => setSortOrder(event.target.value as 'newest' | 'oldest')}
                                        className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                    >
                                        <option value="newest">{t('memory_sort_newest')}</option>
                                        <option value="oldest">{t('memory_sort_oldest')}</option>
                                    </select>
                                </label>
                            </div>
                        )}
                        <div className="min-h-0 flex-1 md:overflow-y-auto md:pr-1">
                            {documents.length === 0 ? (
                                <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-slate-500">
                                    <p>{t('memory_empty')}</p>
                                </div>
                            ) : (
                                <ul className="space-y-3">
                                    {visibleDocuments.map(doc => (
                                        <MemoryCard
                                            key={doc.id}
                                            doc={doc}
                                            t={t}
                                            highlighted={highlightedDocText === doc.text}
                                            onDelete={handleDelete}
                                            onCopy={handleCopy}
                                            terms={highlightTerms}
                                            language={language}
                                        />
                                    ))}
                                </ul>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
