import type { Report, ReportListItem } from '../../types';

/** Update a single entry in the cached reports index without a full IDB scan. */
export const updateReportsIndexEntry = (report: Report) => {
    const cached = readCachedReportsIndex();
    if (!cached) return; // No cache yet — will be built on next full load.
    const idx = cached.findIndex(r => r.id === report.id);
    const eff = report.appState?.reportContextResolution?.effective;
    const entry: ReportListItem = {
        id: report.id,
        filename: report.filename,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        reportTitle: eff?.reportTitle ?? null,
        reportDescription: eff?.reportDescription ?? null,
    };
    if (idx >= 0) {
        cached[idx] = entry;
    } else {
        cached.push(entry);
    }
    persistReportsIndex(cached);
};
export const REPORTS_INDEX_CACHE_KEY = 'csv_agent_reports_index';

/** Persist lightweight report metadata to localStorage for instant reads. */
export const persistReportsIndex = (items: ReportListItem[]) => {
    try {
        const serialized = items.map(r => ({
            id: r.id,
            filename: r.filename,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
            updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
            reportTitle: r.reportTitle ?? null,
            reportDescription: r.reportDescription ?? null,
        }));
        localStorage.setItem(REPORTS_INDEX_CACHE_KEY, JSON.stringify(serialized));
    } catch { /* quota exceeded or private mode — non-fatal */ }
};

/** Read cached report index from localStorage (<1ms). */
export const readCachedReportsIndex = (): ReportListItem[] | null => {
    try {
        const raw = localStorage.getItem(REPORTS_INDEX_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Array<{
            id: string; filename: string; createdAt: string; updatedAt: string;
            reportTitle?: string | null; reportDescription?: string | null;
        }>;
        // One-time cache invalidation: force IDB rescan to populate new fields.
        if (parsed.length > 0 && !('reportTitle' in parsed[0])) return null;
        return parsed.map(r => ({
            id: r.id,
            filename: r.filename,
            createdAt: new Date(r.createdAt),
            updatedAt: new Date(r.updatedAt),
            reportTitle: r.reportTitle ?? null,
            reportDescription: r.reportDescription ?? null,
        }));
    } catch {
        return null;
    }
};
