
import React, { useState, useEffect, useCallback } from 'react';
import {
    getStorageBreakdown,
    clearStore,
    clearAllCacheStorage,
    CURRENT_SESSION_KEY,
    type StorageBreakdownResult,
} from '../../services/storageService';

// ── Helpers ──────────────────────────────────────────────────────────────

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const STORE_COLORS: Record<string, string> = {
    reports: 'bg-blue-400',
    report_artifacts: 'bg-indigo-400',
    original_data: 'bg-amber-400',
    agent_memory_runs: 'bg-emerald-400',
    vector_memory: 'bg-purple-400',
    ai_consents: 'bg-cyan-400',
    settings: 'bg-slate-300',
    cache: 'bg-orange-400',
};

const STORE_DOT_COLORS: Record<string, string> = {
    reports: 'bg-blue-400',
    report_artifacts: 'bg-indigo-400',
    original_data: 'bg-amber-400',
    agent_memory_runs: 'bg-emerald-400',
    vector_memory: 'bg-purple-400',
    ai_consents: 'bg-cyan-400',
    settings: 'bg-slate-300',
    cache: 'bg-orange-400',
};

// ── Icons ────────────────────────────────────────────────────────────────

const TrashIcon: React.FC<{ className?: string }> = ({ className = 'h-3.5 w-3.5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
);

const RefreshIcon: React.FC<{ className?: string }> = ({ className = 'h-3.5 w-3.5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
    </svg>
);

// ── Protected store names (cannot be fully cleared) ──────────────────────

const UNCLEARABLE_STORES = new Set(['settings']);

// ── Component ────────────────────────────────────────────────────────────

interface StorageBreakdownProps {
    activeSessionId: string | null;
    onStorageChanged?: () => void;
}

export const StorageBreakdown: React.FC<StorageBreakdownProps> = ({ activeSessionId, onStorageChanged }) => {
    const [data, setData] = useState<StorageBreakdownResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [clearing, setClearing] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getStorageBreakdown();
            setData(result);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const handleClearStore = async (storeName: string) => {
        if (UNCLEARABLE_STORES.has(storeName)) return;
        const protectKeys = new Set<string>();
        if (storeName === 'reports') {
            protectKeys.add(CURRENT_SESSION_KEY);
            if (activeSessionId) protectKeys.add(activeSessionId);
        }
        if (storeName === 'original_data') {
            if (activeSessionId) protectKeys.add(activeSessionId);
            try {
                const tabId = sessionStorage.getItem('csv_agent_tab_session_id');
                if (tabId) protectKeys.add(tabId);
            } catch { /* ok */ }
        }

        setClearing(storeName);
        try {
            await clearStore(storeName, protectKeys.size > 0 ? protectKeys : undefined);
            await refresh();
            onStorageChanged?.();
        } finally {
            setClearing(null);
        }
    };

    const handleClearCache = async () => {
        setClearing('cache');
        try {
            await clearAllCacheStorage();
            await refresh();
            onStorageChanged?.();
        } finally {
            setClearing(null);
        }
    };

    if (loading && !data) {
        return (
            <div className="px-4 py-3 text-xs text-slate-400 text-center">
                Scanning storage...
            </div>
        );
    }

    if (!data) return null;

    // Build unified list for the bar chart
    const allSegments = [
        ...data.stores.map(s => ({
            key: s.storeName,
            label: s.label,
            bytes: s.estimatedBytes,
            count: s.recordCount,
            color: STORE_COLORS[s.storeName] ?? 'bg-slate-300',
            dotColor: STORE_DOT_COLORS[s.storeName] ?? 'bg-slate-300',
            clearable: !UNCLEARABLE_STORES.has(s.storeName) && s.recordCount > 0,
            isCache: false,
        })),
        {
            key: 'cache',
            label: 'Cache Storage (ONNX models)',
            bytes: data.cacheStorage.estimatedBytes,
            count: data.cacheStorage.cacheCount,
            color: STORE_COLORS.cache,
            dotColor: STORE_DOT_COLORS.cache,
            clearable: data.cacheStorage.cacheCount > 0,
            isCache: true,
        },
    ];

    const maxBytes = Math.max(...allSegments.map(s => s.bytes), 1);

    return (
        <div className="space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    Storage Inspector
                </span>
                <button
                    onClick={() => void refresh()}
                    disabled={loading}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                    title="Refresh"
                >
                    <RefreshIcon className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Stacked bar */}
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
                {allSegments.filter(s => s.bytes > 0).map(seg => (
                    <div
                        key={seg.key}
                        className={`${seg.color} transition-all`}
                        style={{ width: `${Math.max(1, (seg.bytes / data.rawOriginBytes) * 100)}%` }}
                        title={`${seg.label}: ${formatBytes(seg.bytes)}`}
                    />
                ))}
            </div>

            {/* Totals */}
            <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>IndexedDB: {formatBytes(data.totalIdbBytes)}</span>
                <span>Total (with cache): {formatBytes(data.rawOriginBytes)}</span>
            </div>

            {/* Per-store rows */}
            <div className="space-y-0.5">
                {allSegments.map(seg => (
                    <div
                        key={seg.key}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 group/row"
                    >
                        {/* Color dot */}
                        <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${seg.dotColor}`} />

                        {/* Label + count */}
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-700 truncate">{seg.label}</p>
                            <p className="text-[10px] text-slate-400">
                                {seg.isCache
                                    ? `${seg.count} cache${seg.count !== 1 ? 's' : ''}`
                                    : `${seg.count} record${seg.count !== 1 ? 's' : ''}`}
                            </p>
                        </div>

                        {/* Size bar + value */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${seg.color}`}
                                    style={{ width: `${Math.max(1, (seg.bytes / maxBytes) * 100)}%` }}
                                />
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 w-16 text-right">
                                {formatBytes(seg.bytes)}
                            </span>

                            {/* Clear button */}
                            {seg.clearable ? (
                                <button
                                    onClick={() => void (seg.isCache ? handleClearCache() : handleClearStore(seg.key))}
                                    disabled={clearing !== null}
                                    className="flex items-center justify-center h-5 w-5 rounded text-slate-300 opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-500 disabled:opacity-50 disabled:cursor-wait"
                                    title={`Clear ${seg.label}`}
                                >
                                    {clearing === seg.key ? (
                                        <span className="h-3 w-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <TrashIcon className="h-3 w-3" />
                                    )}
                                </button>
                            ) : (
                                <div className="w-5" />
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
