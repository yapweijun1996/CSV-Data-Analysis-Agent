import { describe, expect, it } from 'vitest';
import { inferCompleteResultRowCount } from '../services/duckdb/queryResultCount';

describe('inferCompleteResultRowCount', () => {
    it('uses the returned row count when the result is smaller than its limit', () => {
        expect(inferCompleteResultRowCount(4, 100)).toBe(4);
    });

    it('requires an explicit count when the result reaches the limit', () => {
        expect(inferCompleteResultRowCount(100, 100)).toBeNull();
        expect(inferCompleteResultRowCount(0, 0)).toBeNull();
    });

    it('rejects invalid count metadata', () => {
        expect(inferCompleteResultRowCount(-1, 100)).toBeNull();
        expect(inferCompleteResultRowCount(1.5, 100)).toBeNull();
    });
});
