import { describe, it, expect } from 'vitest';
import { isFooterLikeRow, isBlankRow, getNonEmptyValues } from '../services/agent/reportShapeUtils';
import { isMetadataRow, isReportTitleRow } from '../services/agent/reportShapeHeaderBands';
import { detectTabularRowRole, inferTabularShapeContext } from '../services/agent/reportShapeTabular';
import { detectMatrixRowRole } from '../services/agent/reportShapeHierarchy';
import type { CsvData, CsvRow } from '../types';

const buildCsvData = (rows: CsvRow[], fileName = 'test.csv'): CsvData => ({
    data: rows,
    fileName,
});

const buildRow = (values: Record<string, string>): CsvRow => values;

describe('structural footer/noise detection — Phase 4', () => {
    describe('isFooterLikeRow — structural detection', () => {
        it('detects singleton long text as footer', () => {
            const row = buildRow({ A: 'Printed by admin on 01-01-2024 at 10:30 AM', B: '', C: '' });
            expect(isFooterLikeRow(row)).toBe(true);
        });

        it('detects sparse row with date format as footer', () => {
            const row = buildRow({ A: 'Reporting Date', B: '01-01-2024', C: '' });
            expect(isFooterLikeRow(row)).toBe(true);
        });

        it('does NOT detect short section header as footer', () => {
            const row = buildRow({ A: 'Revenue', B: '', C: '', D: '' });
            expect(isFooterLikeRow(row)).toBe(false);
        });

        it('does NOT detect data row with numbers as footer', () => {
            const row = buildRow({ Item: 'Widget', Amount: '1500', Tax: '150' });
            expect(isFooterLikeRow(row)).toBe(false);
        });

        it('detects blank row is not footer (it is blank)', () => {
            const row = buildRow({ A: '', B: '', C: '' });
            expect(isBlankRow(row)).toBe(true);
            expect(isFooterLikeRow(row)).toBe(false);
        });
    });

    describe('isMetadataRow — structural detection', () => {
        it('detects long sparse row as metadata', () => {
            const row = buildRow({ A: 'MONTHLY ORDER TAKE IN REPORT FOR YEAR 2024', B: '' });
            expect(isMetadataRow(row)).toBe(true);
        });

        it('detects sparse row with date as metadata', () => {
            const row = buildRow({ A: 'Report Date', B: '15/03/2024' });
            expect(isMetadataRow(row)).toBe(true);
        });

        it('detects sparse row with colon as metadata', () => {
            const row = buildRow({ A: 'Currency:', B: 'USD' });
            expect(isMetadataRow(row)).toBe(true);
        });

        it('does NOT detect multi-value row as metadata', () => {
            const row = buildRow({ A: 'Item', B: 'Widget', C: 'Amount' });
            const values = getNonEmptyValues(row);
            expect(values.length).toBe(3);
            expect(isMetadataRow(row)).toBe(false);
        });
    });

    describe('isReportTitleRow — structural detection', () => {
        it('detects sparse long title', () => {
            const row = buildRow({ A: 'ACME CORPORATION LIMITED', B: '' });
            expect(isReportTitleRow(row)).toBe(true);
        });

        it('does NOT detect short label as title', () => {
            const row = buildRow({ A: 'Revenue', B: '' });
            expect(isReportTitleRow(row)).toBe(false);
        });
    });

    describe('detectTabularRowRole — structural comment detection', () => {
        const baseRows = Array.from({ length: 10 }, (_, i) => ({
            Code: `A0${i}`,
            Desc: `Item ${i}`,
            Amount: String(1000 + i * 100),
        }));
        const context = inferTabularShapeContext(buildCsvData(baseRows));

        it('classifies sparse row with colon as comment', () => {
            const row = buildRow({ Code: '', Desc: 'Period: Jan 2024', Amount: '' });
            const result = detectTabularRowRole(row, context);
            expect(result.role).toBe('comment');
        });

        it('classifies sparse row with long text as noise (caught by footer detection)', () => {
            // Singleton long text (≥24 chars) is caught by isFooterLikeRow → noise.
            const row = buildRow({ Code: '', Desc: 'Statement of Operations for FY2024', Amount: '' });
            const result = detectTabularRowRole(row, context);
            expect(result.role).toBe('noise');
        });

        it('classifies sparse row with medium-length text as comment', () => {
            // 20 chars — long enough for structural comment, short enough to avoid footer detection.
            const row = buildRow({ Code: '', Desc: 'Q1 2024 Performance', Amount: '' });
            const result = detectTabularRowRole(row, context);
            expect(result.role).toBe('comment');
        });

        it('classifies short label without colon as group_header', () => {
            const row = buildRow({ Code: '', Desc: 'Revenue', Amount: '' });
            const result = detectTabularRowRole(row, context);
            expect(result.role).toBe('group_header');
        });

        it('classifies row with numeric values as fact', () => {
            const row = buildRow({ Code: 'X01', Desc: 'Widget', Amount: '5000' });
            const result = detectTabularRowRole(row, context);
            expect(result.role).toBe('fact');
        });
    });

    describe('detectMatrixRowRole — structural comment detection', () => {
        it('classifies singleton long text as noise (caught by footer detection)', () => {
            // Singleton long text (≥24 chars) is caught by isFooterLikeRow → noise.
            const row = buildRow({ A: 'Generated on 01-01-2024 by system admin user', B: '', C: '' });
            const result = detectMatrixRowRole(row, null);
            expect(result.role).toBe('noise');
        });

        it('classifies sparse non-numeric row with colon as comment', () => {
            const row = buildRow({ A: 'Currency: USD', B: '', C: '' });
            const result = detectMatrixRowRole(row, null);
            expect(result.role).toBe('comment');
        });

        it('does NOT classify blank row as comment', () => {
            const row = buildRow({ A: '', B: '', C: '' });
            const result = detectMatrixRowRole(row, null);
            expect(result.role).toBe('noise');
        });
    });
});
