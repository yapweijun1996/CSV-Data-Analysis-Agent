import { describe, it, expect, beforeEach } from 'vitest';
import {
    computeChartCacheKey,
    computeDataContentHash,
    getCachedChart,
    setCachedChart,
    invalidateChart,
    clearChartCache,
    getChartCacheSize,
} from '../utils/chartCache';

beforeEach(() => {
    clearChartCache();
});

describe('computeDataContentHash', () => {
    it('returns empty hash for empty array', () => {
        expect(computeDataContentHash([])).toBe('0::');
    });

    it('includes row count, first row, and last row', () => {
        const data = [{ a: 1 }, { a: 2 }, { a: 3 }];
        const hash = computeDataContentHash(data);
        expect(hash).toContain('3:');
        expect(hash).toContain(JSON.stringify({ a: 1 }));
        expect(hash).toContain(JSON.stringify({ a: 3 }));
    });

    it('returns same hash for same data', () => {
        const data = [{ x: 10 }, { x: 20 }];
        expect(computeDataContentHash(data)).toBe(computeDataContentHash(data));
    });

    it('returns different hash when data changes', () => {
        const a = [{ x: 10 }, { x: 20 }];
        const b = [{ x: 10 }, { x: 30 }];
        expect(computeDataContentHash(a)).not.toBe(computeDataContentHash(b));
    });

    it('handles single-row data', () => {
        const data = [{ a: 1 }];
        const hash = computeDataContentHash(data);
        expect(hash).toContain('1:');
    });
});

describe('computeChartCacheKey', () => {
    it('produces same key for identical inputs', () => {
        const input = { chartType: 'bar', dataRowCount: 10, dataContentHash: 'abc' };
        expect(computeChartCacheKey(input)).toBe(computeChartCacheKey(input));
    });

    it('produces same key regardless of property order', () => {
        const a = computeChartCacheKey({ chartType: 'bar', dataRowCount: 10, dataContentHash: 'abc' });
        const b = computeChartCacheKey({ dataContentHash: 'abc', chartType: 'bar', dataRowCount: 10 });
        expect(a).toBe(b);
    });

    it('produces different key for different inputs', () => {
        const a = computeChartCacheKey({ chartType: 'bar', dataRowCount: 10, dataContentHash: 'abc' });
        const b = computeChartCacheKey({ chartType: 'line', dataRowCount: 10, dataContentHash: 'abc' });
        expect(a).not.toBe(b);
    });

    it('includes optional fields in the key', () => {
        const base = { chartType: 'bar', dataRowCount: 10, dataContentHash: 'abc' };
        const withTopN = { ...base, topN: 5 };
        expect(computeChartCacheKey(base)).not.toBe(computeChartCacheKey(withTopN));
    });
});

describe('cache operations', () => {
    const entry = { pngDataUrl: 'data:image/png;base64,abc', specKey: 'key1', capturedAt: 1000 };

    it('setCachedChart + getCachedChart round-trip', () => {
        setCachedChart('card-1', entry);
        const cached = getCachedChart('card-1');
        expect(cached).toEqual(entry);
    });

    it('getCachedChart returns undefined for unknown card', () => {
        expect(getCachedChart('unknown')).toBeUndefined();
    });

    it('invalidateChart removes the entry', () => {
        setCachedChart('card-1', entry);
        expect(getCachedChart('card-1')).toBeDefined();
        invalidateChart('card-1');
        expect(getCachedChart('card-1')).toBeUndefined();
    });

    it('invalidateChart is safe for non-existent entries', () => {
        expect(() => invalidateChart('nonexistent')).not.toThrow();
    });

    it('clearChartCache empties all entries', () => {
        setCachedChart('card-1', entry);
        setCachedChart('card-2', { ...entry, specKey: 'key2' });
        expect(getChartCacheSize()).toBe(2);
        clearChartCache();
        expect(getChartCacheSize()).toBe(0);
    });

    it('overwrites existing entry for same cardId', () => {
        setCachedChart('card-1', entry);
        const updated = { ...entry, specKey: 'key-updated' };
        setCachedChart('card-1', updated);
        expect(getCachedChart('card-1')?.specKey).toBe('key-updated');
        expect(getChartCacheSize()).toBe(1);
    });
});

describe('LRU eviction', () => {
    it('evicts oldest entry when cache exceeds 100', () => {
        // Fill cache to capacity
        for (let i = 0; i < 100; i++) {
            setCachedChart(`card-${i}`, {
                pngDataUrl: `data:${i}`,
                specKey: `key-${i}`,
                capturedAt: i,
            });
        }
        expect(getChartCacheSize()).toBe(100);

        // Add one more — should evict card-0 (oldest capturedAt=0)
        setCachedChart('card-100', {
            pngDataUrl: 'data:100',
            specKey: 'key-100',
            capturedAt: 100,
        });
        expect(getChartCacheSize()).toBe(100);
        expect(getCachedChart('card-0')).toBeUndefined();
        expect(getCachedChart('card-100')).toBeDefined();
        expect(getCachedChart('card-1')).toBeDefined(); // card-1 still present
    });

    it('does not evict when updating existing entry', () => {
        for (let i = 0; i < 100; i++) {
            setCachedChart(`card-${i}`, {
                pngDataUrl: `data:${i}`,
                specKey: `key-${i}`,
                capturedAt: i,
            });
        }

        // Update existing entry — should not trigger eviction
        setCachedChart('card-50', {
            pngDataUrl: 'data:50-updated',
            specKey: 'key-50-updated',
            capturedAt: 200,
        });
        expect(getChartCacheSize()).toBe(100);
        expect(getCachedChart('card-0')).toBeDefined(); // oldest still present
    });
});
