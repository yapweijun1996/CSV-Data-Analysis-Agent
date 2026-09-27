/**
 * Chart Caching Module (AGENT-301)
 *
 * Module-level PNG cache for rendered charts. Stores canvas snapshots
 * keyed by a deterministic hash of chart inputs, avoiding redundant
 * re-renders and providing instant PNG for export or vision model input.
 *
 * Stored outside React/Zustand to avoid bloating serializable state
 * with large data URL strings.
 *
 * Adapted from data-formulator chartCache.ts pattern.
 */

export interface ChartCacheEntry {
    /** PNG data URL from canvas.toDataURL('image/png') */
    pngDataUrl: string;
    /** Deterministic hash of chart inputs — used to detect stale entries */
    specKey: string;
    /** Timestamp for LRU eviction */
    capturedAt: number;
}

export interface ChartCacheKeyInput {
    chartType: string;
    dataRowCount: number;
    dataContentHash: string;
    groupByColumn?: string;
    valueColumn?: string;
    topN?: number | null;
    hideOthers?: boolean;
    showDataLabels?: boolean;
}

const MAX_CACHE_SIZE = 100;

const cache = new Map<string, ChartCacheEntry>();

/**
 * Build a fast content hash from data rows without iterating all rows.
 * Uses first row, last row, and row count as a fingerprint.
 */
export function computeDataContentHash(data: Record<string, unknown>[]): string {
    if (!data || data.length === 0) return '0::';
    const first = JSON.stringify(data[0]);
    const last = data.length > 1 ? JSON.stringify(data[data.length - 1]) : first;
    return `${data.length}:${first}:${last}`;
}

/**
 * Compute a deterministic cache key from chart inputs.
 * Properties are sorted to ensure identical inputs produce identical keys
 * regardless of object property order.
 */
export function computeChartCacheKey(input: ChartCacheKeyInput): string {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
        sorted[key] = input[key as keyof ChartCacheKeyInput];
    }
    return JSON.stringify(sorted);
}

export function getCachedChart(cardId: string): ChartCacheEntry | undefined {
    return cache.get(cardId);
}

export function setCachedChart(cardId: string, entry: ChartCacheEntry): void {
    // LRU eviction: if at capacity, remove oldest entry
    if (!cache.has(cardId) && cache.size >= MAX_CACHE_SIZE) {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [key, val] of cache) {
            if (val.capturedAt < oldestTime) {
                oldestTime = val.capturedAt;
                oldestKey = key;
            }
        }
        if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(cardId, entry);
}

export function invalidateChart(cardId: string): void {
    cache.delete(cardId);
}

export function clearChartCache(): void {
    cache.clear();
}

export function getChartCacheSize(): number {
    return cache.size;
}
