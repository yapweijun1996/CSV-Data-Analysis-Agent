import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsvTextWithDetection } from '../services/data/csvDialectDetector';
import { buildCsvDataFromIntakeIr, buildReportIntakeIr } from '../services/data/reportCsvIntake';
import { classifyBodyRows } from '../services/data/reportBodyRows';
import { buildIntakeDiagnosticsSnapshot, evaluateIntakeDiagnostics } from '../services/agent/intakeDiagnosticsPolicy';
import { resolveReportStructure } from '../services/agent/reportStructureResolver';

const intake = (name: string) => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/complexReports', name), 'utf8');
    const { rawRows, detection } = parseCsvTextWithDetection(source);
    const ir = buildReportIntakeIr(name, rawRows, detection);
    return { ir, data: buildCsvDataFromIntakeIr(ir) };
};

describe('complex report source row grain', () => {
    it.each([
        ['two-layer-42.csv', 3, 3],
        ['two-layer-60.csv', 3, 3],
        ['wide-90-interleaved.csv', 3, 3],
        ['interleaved-subtotals-8.csv', 6, 4],
    ])('excludes reconciled trailing subtotals from business rows: %s', (name, expectedData, expectedSummaries) => {
        const { ir, data } = intake(name);
        expect(ir.provisionalTable).not.toBeNull();
        const recognized = [...classifyBodyRows(ir.normalizedRows, ir.provisionalTable!)]
            .filter(([, result]) => result.kind === 'subtotal' || result.kind === 'total');
        expect(recognized).toHaveLength(expectedSummaries);
        expect(data.data).toHaveLength(expectedData);
        expect(data.summaryRows).toHaveLength(expectedSummaries);
        expect(JSON.stringify(data.data)).not.toMatch(/SUBTOTAL|GRAND_TOTAL|GRAND TOTAL/);
    });

    it('does not remove a real business row whose name says Total but amount does not reconcile', () => {
        const rows = [
            ['Item', 'Amount'],
            ['Alpha', '10.00'],
            ['Total Plumbing', '12.00'],
            ['Gamma', '8.00'],
        ];
        const ir = buildReportIntakeIr('business-total.csv', rows);
        const data = buildCsvDataFromIntakeIr(ir);
        expect(data.data).toHaveLength(3);
        expect(JSON.stringify(data.data)).toContain('Total Plumbing');
    });

    it('keeps legitimate period-wide series even when the final label is Total', () => {
        const rows = [
            ['Series', '2025', '2024', '2023', '2022'],
            ['North', '10', '20', '30', '40'],
            ['South', '5', '10', '15', '20'],
            ['Total', '15', '30', '45', '60'],
        ];
        const ir = buildReportIntakeIr('period-wide.csv', rows);
        const data = buildCsvDataFromIntakeIr(ir);
        expect(JSON.stringify(data.data)).toContain('North');
        expect(JSON.stringify(data.data)).toContain('South');
        expect(JSON.stringify(data.data)).toContain('Total');
    });
});

describe('dense header-layer width drift', () => {
    it('flags a 60-column dense outer band when selected header and body are 90 columns', () => {
        const { ir } = intake('width-drift-header-60-body-90.csv');
        expect(ir.provisionalTable?.headerLayerRowIndexes).toContain(1);
        expect(ir.provisionalTable?.headerRowIndex).toBe(2);
        expect(ir.diagnostics.headerShapeDrift).toBe(true);
        expect(ir.detection?.warnings?.some(warning => warning.code === 'header_shape_drift')).toBe(true);
    });

    it('blocks automatic analysis and requires human review for a dense mismatched header layer', () => {
        const { ir, data } = intake('width-drift-header-60-body-90.csv');
        const decision = evaluateIntakeDiagnostics(buildIntakeDiagnosticsSnapshot(data, data, ir));
        expect(decision).toMatchObject({
            severity: 'blocked',
            blockingReasonCode: 'header_shape_drift',
            shouldBlockAutomaticAnalysis: true,
        });
        const resolution = resolveReportStructure({ rawCsvData: data, csvData: data, rawIntakeIr: ir });
        expect(resolution.requiresHumanReview).toBe(true);
        expect(resolution.blockingReasons).toContain('header_shape_drift');
    });

    it.each(['two-layer-42.csv', 'two-layer-60.csv', 'wide-90-interleaved.csv'])(
        'does not flag a shape-aligned multi-level header: %s',
        name => {
            const { ir } = intake(name);
            expect(ir.diagnostics.headerShapeDrift).toBe(false);
        },
    );

    it('does not flag a sparse title line before a regular rectangular table', () => {
        const ir = buildReportIntakeIr('sparse-title.csv', [
            ['FICTIONAL REPORT TITLE'],
            ['Id', 'Owner', 'Quantity', 'Amount'],
            ['1', 'Alpha', '2', '10'],
            ['2', 'Beta', '3', '20'],
        ]);
        expect(ir.diagnostics.headerShapeDrift).toBe(false);
    });
});
