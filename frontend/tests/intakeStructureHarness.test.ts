import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    buildPreScanSignals,
    buildReportIntakeIr,
    rebuildIntakeIrWithBoundary,
    validateAiBoundary,
} from '../services/data/reportCsvIntake';

// Mock the AI detector module
vi.mock('../services/ai/intakeStructureDetector', () => ({
    detectIntakeStructureWithAi: vi.fn().mockResolvedValue(null),
}));

const parseInline = (text: string): string[][] =>
    text
        .split(/\r?\n/)
        .filter((line, index, lines) => !(index === lines.length - 1 && line === ''))
        .map(line => {
            const values: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i += 1) {
                const c = line[i];
                if (c === '"') {
                    if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1; } else { inQuotes = !inQuotes; }
                    continue;
                }
                if (c === ',' && !inQuotes) { values.push(current); current = ''; continue; }
                current += c;
            }
            values.push(current);
            return values;
        });

describe('intake structure harness', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('buildPreScanSignals', () => {
        it('classifies title, header, and data rows correctly for a simple report', () => {
            const rows = parseInline(
                'ACME CORPORATION INTERNATIONAL LIMITED,\n'
                + ',Sales Report For Financial Year 2024\n'
                + 'Year,Name,Amount,Tax,Total,Notes\n'
                + '2024,Widget,100,10,110,OK\n'
                + '2024,Gadget,200,20,220,OK\n',
            );
            const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
            const normalized = rows.map(r => {
                const n = [...r];
                while (n.length < colCount) n.push('');
                return n;
            });

            const signals = buildPreScanSignals(normalized);

            expect(signals.titleRowIndexes).toContain(0);
            expect(signals.headerCandidateIndexes).toContain(2);
            expect(signals.dataCandidateIndexes.length).toBeGreaterThanOrEqual(1);
            expect(signals.deterministicSelection).not.toBeNull();
            expect(signals.deterministicSelection?.rowIndex).toBe(2);
        });

        it('reports no header candidate for plain 2-column CSV', () => {
            const rows = [['Name', 'Value'], ['Alice', '10'], ['Bob', '20']];
            const signals = buildPreScanSignals(rows);

            expect(signals.headerCandidateIndexes).toHaveLength(0);
            expect(signals.deterministicSelection).toBeNull();
        });

        it('includes tail rows for footer detection', () => {
            const rows: string[][] = [];
            rows.push(['Company Name', '']);
            rows.push(['Year', 'Q1', 'Q2', 'Q3', 'Q4', 'Total']);
            for (let i = 0; i < 30; i += 1) {
                rows.push([`Item ${i}`, '10', '20', '30', '40', '100']);
            }
            rows.push(['', '18-03-2026@ 16:11 | m8 | 111.65.75.55', '']);

            const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
            const normalized = rows.map(r => {
                const n = [...r];
                while (n.length < colCount) n.push('');
                return n;
            });

            const signals = buildPreScanSignals(normalized);
            const tailSignal = signals.rowSignals.find(s => s.rowIndex === rows.length - 1);
            expect(tailSignal).toBeDefined();
            expect(tailSignal?.classification).toBe('footer');
        });
    });

    describe('rebuildIntakeIrWithBoundary', () => {
        it('replaces the deterministic boundary with an AI-provided one', () => {
            const rawRows = parseInline(
                'ACME CORP,\n'
                + ',Subtitle\n'
                + '2010,Opened,Confirmed,Pending,Success Rate,Fail Rate\n'
                + '"P01","15","14","1","93%","7%"\n'
                + '"P02","10","10","0","100%","0%"\n'
                + '"","Footer info",""\n',
            );
            const baseIr = buildReportIntakeIr('test.csv', rawRows);

            const rebuilt = rebuildIntakeIrWithBoundary(baseIr, {
                headerRowIndex: 2,
                bodyStartIndex: 3,
                summaryStartIndex: 5,
            }, 'ai');

            expect(rebuilt.provisionalTable).not.toBeNull();
            expect(rebuilt.provisionalTable?.headerRowIndex).toBe(2);
            expect(rebuilt.provisionalTable?.bodyStartIndex).toBe(3);
            expect(rebuilt.provisionalTable?.summaryStartIndex).toBe(5);
            expect(rebuilt.diagnostics.structureSource).toBe('ai');
            expect(rebuilt.diagnostics.singleColumnFallbackApplied).toBe(false);
        });

        it('preserves original raw rows and column count', () => {
            const rawRows = [
                ['Title', ''],
                ['A', 'B', 'C', 'D'],
                ['1', '2', '3', '4'],
            ];
            const baseIr = buildReportIntakeIr('test.csv', rawRows);
            const rebuilt = rebuildIntakeIrWithBoundary(baseIr, {
                headerRowIndex: 1,
                bodyStartIndex: 2,
                summaryStartIndex: 3,
            }, 'ai');

            expect(rebuilt.columnCount).toBe(baseIr.columnCount);
            expect(rebuilt.rawRows.length).toBe(baseIr.rawRows.length);
        });
    });

    describe('three-layer fallback chain', () => {
        it('deterministic succeeds → AI not needed', () => {
            const rawRows = parseInline(
                'ACME CORP,\n'
                + ',Subtitle\n'
                + '_unnamed,Date,Doc No,Party,Amount,Status,Notes,Extra\n'
                + '1.,01-01-2024,INV001,Customer A,1000,Paid,,\n'
                + '2.,02-01-2024,INV002,Customer B,2000,Pending,,\n',
            );
            const ir = buildReportIntakeIr('test.csv', rawRows);

            // Deterministic should find the header
            expect(ir.provisionalTable).not.toBeNull();
            expect(ir.diagnostics.singleColumnFallbackApplied).toBe(false);
            expect(ir.diagnostics.structureSource).toBe('deterministic');
            expect(ir.diagnostics.preScanSignals).toBeDefined();
        });

        it('deterministic fails → AI boundary valid → accepted', () => {
            // Simulate: deterministic failed, AI returns valid boundary
            const rawRows = [
                ['Title Row', ''],
                ['Subtitle', ''],
                ['2010', 'Col A', 'Col B', 'Col C'],
                ['P01', '10', '20', '30'],
                ['P02', '15', '25', '35'],
            ];
            const baseIr = buildReportIntakeIr('test.csv', rawRows);

            const aiBoundary = {
                headerRowIndex: 2,
                bodyStartIndex: 3,
                summaryStartIndex: 5,
                confidence: 0.9,
                reasoning: 'Row 2 contains column headers',
            };

            const validation = validateAiBoundary(aiBoundary, baseIr.normalizedRows);
            expect(validation.valid).toBe(true);

            const rebuilt = rebuildIntakeIrWithBoundary(baseIr, aiBoundary, 'ai');
            expect(rebuilt.provisionalTable?.headerRowIndex).toBe(2);
            expect(rebuilt.diagnostics.structureSource).toBe('ai');
        });

        it('deterministic fails → AI boundary invalid → falls back to deterministic', () => {
            const rawRows = [
                ['Title', ''],
                ['A', 'B', 'C', 'D'],
                ['1', '2', '3', '4'],
            ];
            const baseIr = buildReportIntakeIr('test.csv', rawRows);

            // AI returns invalid boundary (header at row 10, out of range)
            const badBoundary = {
                headerRowIndex: 10,
                bodyStartIndex: 11,
                summaryStartIndex: 15,
                confidence: 0.8,
                reasoning: 'Wrong',
            };

            const validation = validateAiBoundary(badBoundary, baseIr.normalizedRows);
            expect(validation.valid).toBe(false);
            expect(validation.rejectionReason).toContain('headerRowIndex');

            // Original IR is unchanged
            expect(baseIr.diagnostics.structureSource).toBe('deterministic');
        });
    });
});
