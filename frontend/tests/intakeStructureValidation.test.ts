import { describe, expect, it } from 'vitest';
import { validateAiBoundary } from '../services/data/reportCsvIntake';

const makeRows = (count: number, cellsPerRow = 6): string[][] =>
    Array.from({ length: count }, (_, i) =>
        Array.from({ length: cellsPerRow }, (__, j) => `r${i}c${j}`),
    );

describe('validateAiBoundary', () => {
    it('accepts a valid boundary', () => {
        const rows = makeRows(20);
        const result = validateAiBoundary(
            { headerRowIndex: 2, bodyStartIndex: 3, summaryStartIndex: 18 },
            rows,
        );
        expect(result.valid).toBe(true);
        expect(result.rejectionReason).toBeNull();
    });

    it('rejects headerRowIndex out of range (negative)', () => {
        const result = validateAiBoundary(
            { headerRowIndex: -1, bodyStartIndex: 3, summaryStartIndex: 18 },
            makeRows(20),
        );
        expect(result.valid).toBe(false);
        expect(result.rejectionReason).toContain('headerRowIndex');
    });

    it('rejects headerRowIndex out of range (>= rowCount)', () => {
        const result = validateAiBoundary(
            { headerRowIndex: 20, bodyStartIndex: 21, summaryStartIndex: 22 },
            makeRows(20),
        );
        expect(result.valid).toBe(false);
        expect(result.rejectionReason).toContain('headerRowIndex');
    });

    it('rejects bodyStartIndex <= headerRowIndex', () => {
        const result = validateAiBoundary(
            { headerRowIndex: 5, bodyStartIndex: 5, summaryStartIndex: 18 },
            makeRows(20),
        );
        expect(result.valid).toBe(false);
        expect(result.rejectionReason).toContain('bodyStartIndex');
    });

    it('rejects bodyStartIndex before headerRowIndex', () => {
        const result = validateAiBoundary(
            { headerRowIndex: 5, bodyStartIndex: 3, summaryStartIndex: 18 },
            makeRows(20),
        );
        expect(result.valid).toBe(false);
        expect(result.rejectionReason).toContain('bodyStartIndex');
    });

    it('rejects summaryStartIndex before bodyStartIndex', () => {
        const result = validateAiBoundary(
            { headerRowIndex: 2, bodyStartIndex: 5, summaryStartIndex: 4 },
            makeRows(20),
        );
        expect(result.valid).toBe(false);
        expect(result.rejectionReason).toContain('summaryStartIndex');
    });

    it('rejects summaryStartIndex > rowCount', () => {
        const result = validateAiBoundary(
            { headerRowIndex: 2, bodyStartIndex: 3, summaryStartIndex: 25 },
            makeRows(20),
        );
        expect(result.valid).toBe(false);
        expect(result.rejectionReason).toContain('summaryStartIndex');
    });

    it('accepts summaryStartIndex equal to rowCount (no summary section)', () => {
        const result = validateAiBoundary(
            { headerRowIndex: 2, bodyStartIndex: 3, summaryStartIndex: 20 },
            makeRows(20),
        );
        expect(result.valid).toBe(true);
    });

    it('rejects header row with fewer than 3 non-empty cells', () => {
        const rows = makeRows(20);
        rows[2] = ['Title', '', '', '', '', ''];
        const result = validateAiBoundary(
            { headerRowIndex: 2, bodyStartIndex: 3, summaryStartIndex: 18 },
            rows,
        );
        expect(result.valid).toBe(false);
        expect(result.rejectionReason).toContain('non-empty cells');
    });

    it('rejects when no body rows exist between body start and summary start', () => {
        const result = validateAiBoundary(
            { headerRowIndex: 2, bodyStartIndex: 5, summaryStartIndex: 5 },
            makeRows(20),
        );
        expect(result.valid).toBe(false);
        expect(result.rejectionReason).toContain('No body rows');
    });

    it('rejects headerLayerIndex outside valid range', () => {
        const result = validateAiBoundary(
            {
                headerRowIndex: 3,
                bodyStartIndex: 5,
                summaryStartIndex: 18,
                headerLayerIndexes: [2, 6],
            },
            makeRows(20),
        );
        expect(result.valid).toBe(false);
        expect(result.rejectionReason).toContain('headerLayerIndex');
    });

    it('accepts valid headerLayerIndexes before bodyStartIndex', () => {
        const result = validateAiBoundary(
            {
                headerRowIndex: 3,
                bodyStartIndex: 5,
                summaryStartIndex: 18,
                headerLayerIndexes: [2, 4],
            },
            makeRows(20),
        );
        expect(result.valid).toBe(true);
    });

    it('rejects repeatedHeaderRowIndex before bodyStartIndex', () => {
        const result = validateAiBoundary(
            {
                headerRowIndex: 2,
                bodyStartIndex: 5,
                summaryStartIndex: 18,
                repeatedHeaderRowIndexes: [3],
            },
            makeRows(20),
        );
        expect(result.valid).toBe(false);
        expect(result.rejectionReason).toContain('repeatedHeaderRowIndex');
    });

    it('accepts valid repeatedHeaderRowIndexes within body range', () => {
        const result = validateAiBoundary(
            {
                headerRowIndex: 2,
                bodyStartIndex: 5,
                summaryStartIndex: 18,
                repeatedHeaderRowIndexes: [10, 15],
            },
            makeRows(20),
        );
        expect(result.valid).toBe(true);
    });

    it('rejects non-integer headerRowIndex', () => {
        const result = validateAiBoundary(
            { headerRowIndex: 2.5, bodyStartIndex: 3, summaryStartIndex: 18 },
            makeRows(20),
        );
        expect(result.valid).toBe(false);
    });
});
