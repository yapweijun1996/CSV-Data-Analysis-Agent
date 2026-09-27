import { describe, expect, it } from 'vitest';
import {
    classifyRowRoleFromSignals,
    computeRowRoleSignals,
} from '../services/agent/runtime/rowRoleSignals';

const makeRow = (values: Record<string, unknown>) => values;

describe('computeRowRoleSignals', () => {
    it('returns empty map for empty input', () => {
        const result = computeRowRoleSignals({
            rows: [],
            factColumns: ['amount'],
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: 0,
        });
        expect(result.size).toBe(0);
    });

    it('returns empty map when no fact columns', () => {
        const result = computeRowRoleSignals({
            rows: [makeRow({ name: 'foo' })],
            factColumns: [],
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: 1,
        });
        expect(result.size).toBe(0);
    });

    it('detects a leading aggregate row from multiple additive totals', () => {
        const rows = [
            makeRow({ period: '2025-03-01', name: '', id: '0', spend: '60', reach: '600', impressions: '900', ctr: '1.5' }),
            makeRow({ period: '2025-03-01', name: 'A', id: '101', spend: '10', reach: '100', impressions: '200', ctr: '1.0' }),
            makeRow({ period: '2025-03-01', name: 'B', id: '102', spend: '20', reach: '200', impressions: '300', ctr: '2.0' }),
            makeRow({ period: '2025-03-01', name: 'C', id: '103', spend: '30', reach: '300', impressions: '400', ctr: '1.5' }),
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['spend', 'reach', 'impressions', 'ctr'],
            descriptorColumns: ['period', 'name', 'id'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: rows.length,
        });

        expect(result.get(0)?.sumVerification).toMatchObject({
            isSumMatch: true,
            sumMatchType: 'grand_total',
            matchedColumns: ['spend', 'reach', 'impressions'],
        });
        expect(classifyRowRoleFromSignals(result.get(0)!)).toMatchObject({
            role: 'summary',
        });
    });

    it('does not classify a leading detail row when fewer than three totals match', () => {
        const rows = [
            makeRow({ name: 'A', spend: '10', reach: '100', impressions: '200' }),
            makeRow({ name: 'B', spend: '5', reach: '20', impressions: '30' }),
            makeRow({ name: 'C', spend: '3', reach: '40', impressions: '50' }),
            makeRow({ name: 'D', spend: '2', reach: '40', impressions: '120' }),
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['spend', 'reach', 'impressions'],
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: rows.length,
        });

        expect(result.get(0)?.sumVerification.isSumMatch).toBe(false);
    });

    it('treats an unsectioned terminal sum as a grand total', () => {
        const rows = [
            makeRow({ name: 'A', amount: '100', cost: '50' }),
            makeRow({ name: 'B', amount: '200', cost: '75' }),
            makeRow({ name: 'C', amount: '150', cost: '25' }),
            makeRow({ name: '', amount: '450', cost: '150' }), // subtotal: 100+200+150=450, 50+75+25=150
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['amount', 'cost'],
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: 4,
        });
        const subtotalSignal = result.get(3)!;
        expect(subtotalSignal.sumVerification.isSumMatch).toBe(true);
        expect(subtotalSignal.sumVerification.sumMatchType).toBe('grand_total');
        expect(subtotalSignal.sumVerification.matchedColumns).toContain('amount');
        expect(subtotalSignal.sumVerification.matchedColumns).toContain('cost');
        expect(subtotalSignal.sumVerification.sumMatchConfidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects grand total after section subtotals', () => {
        const rows = [
            // Section 1
            makeRow({ name: 'A', amount: '100', cost: '50' }),
            makeRow({ name: 'B', amount: '200', cost: '75' }),
            makeRow({ name: '', amount: '300', cost: '125' }), // section subtotal
            // Section break (blank)
            makeRow({ name: '', amount: '', cost: '' }),
            // Section 2
            makeRow({ name: 'C', amount: '150', cost: '25' }),
            makeRow({ name: 'D', amount: '50', cost: '100' }),
            makeRow({ name: '', amount: '200', cost: '125' }), // section subtotal
            // Grand total: 100+200+150+50 = 500, 50+75+25+100 = 250
            makeRow({ name: '', amount: '500', cost: '250' }),
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['amount', 'cost'],
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: 8,
        });

        // Section 1 subtotal
        const s1 = result.get(2)!;
        expect(s1.sumVerification.isSumMatch).toBe(true);
        expect(s1.sumVerification.sumMatchType).toBe('section_subtotal');

        // Section 2 subtotal
        const s2 = result.get(6)!;
        expect(s2.sumVerification.isSumMatch).toBe(true);
        expect(s2.sumVerification.sumMatchType).toBe('section_subtotal');

        // Grand total
        const grand = result.get(7)!;
        expect(grand.sumVerification.isSumMatch).toBe(true);
        expect(grand.sumVerification.sumMatchType).toBe('grand_total');
    });

    it('does not false-positive on regular detail rows', () => {
        const rows = [
            makeRow({ name: 'A', amount: '100', cost: '50' }),
            makeRow({ name: 'B', amount: '200', cost: '75' }),
            makeRow({ name: 'C', amount: '300', cost: '100' }), // NOT a subtotal — different values
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['amount', 'cost'],
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: 3,
        });
        const lastRow = result.get(2)!;
        expect(lastRow.sumVerification.isSumMatch).toBe(false);
    });

    it('does not treat zero-heavy continuation detail rows as subtotals when only zero columns align', () => {
        const rows = [
            makeRow({ customer: 'SKU Chemical Limited', q1: '0.00', q2: '2400.00', q3: '0.00', q4: '0.00', total: '2400.00' }),
            makeRow({ customer: '', q1: '0.00', q2: '3870.00', q3: '0.00', q4: '0.00', total: '3870.00' }),
            makeRow({ customer: '', q1: '0.00', q2: '1200.00', q3: '0.00', q4: '0.00', total: '1200.00' }),
            makeRow({ customer: '', q1: '0.00', q2: '7470.00', q3: '0.00', q4: '0.00', total: '7470.00' }),
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['q1', 'q2', 'q3', 'q4', 'total'],
            descriptorColumns: ['customer'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: rows.length,
        });

        expect(result.get(2)?.sumVerification.isSumMatch).toBe(false);
        expect(result.get(3)?.sumVerification.isSumMatch).toBe(true);
        expect(result.get(3)?.sumVerification.sumMatchType).toBe('grand_total');
    });

    it('keeps all-zero terminal grand totals eligible when every compared column matches', () => {
        const rows = [
            makeRow({ name: 'A', amount: '100', variance: '-100' }),
            makeRow({ name: 'B', amount: '-100', variance: '100' }),
            makeRow({ name: '', amount: '0', variance: '0' }),
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['amount', 'variance'],
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: rows.length,
        });

        expect(result.get(2)?.sumVerification.isSumMatch).toBe(true);
        expect(result.get(2)?.sumVerification.sumMatchType).toBe('grand_total');
    });

    it('keeps all-zero grand totals eligible when every compared column matches', () => {
        const rows = [
            makeRow({ name: 'A', amount: '100', variance: '-100' }),
            makeRow({ name: 'B', amount: '-100', variance: '100' }),
            makeRow({ name: '', amount: '0', variance: '0' }),
            makeRow({ name: '', amount: '', variance: '' }),
            makeRow({ name: 'C', amount: '50', variance: '-50' }),
            makeRow({ name: 'D', amount: '-50', variance: '50' }),
            makeRow({ name: '', amount: '0', variance: '0' }),
            makeRow({ name: '', amount: '0', variance: '0' }),
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['amount', 'variance'],
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: rows.length,
        });

        expect(result.get(6)?.sumVerification.sumMatchType).toBe('section_subtotal');
        expect(result.get(7)?.sumVerification.isSumMatch).toBe(true);
        expect(result.get(7)?.sumVerification.sumMatchType).toBe('grand_total');
    });

    it('detects singleton long text as note/footer signal', () => {
        const rows = [
            makeRow({ name: 'A', amount: '100', cost: '50' }),
            makeRow({ name: 'B', amount: '200', cost: '75' }),
            makeRow({ name: 'This is a very long text note printed on the report for informational purposes only.', amount: '', cost: '' }),
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['amount', 'cost'],
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: 3,
        });
        const noteRow = result.get(2)!;
        expect(noteRow.sparsity.isSingletonLongText).toBe(true);
        expect(noteRow.sparsity.edgePosition).toBe('tail');
    });

    it('detects descriptor-empty sparsity signal', () => {
        const rows = [
            makeRow({ name: 'A', amount: '100', cost: '50' }),
            makeRow({ name: 'B', amount: '200', cost: '75' }),
            makeRow({ name: '', amount: '300', cost: '125' }), // descriptor empty, facts populated
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['amount', 'cost'],
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: 3,
        });
        const sparseRow = result.get(2)!;
        expect(sparseRow.sparsity.descriptorEmpty).toBe(true);
        expect(sparseRow.sparsity.factColumnsPopulated).toBe(2);
    });

    it('computes position signals — followed by gap', () => {
        const rows = [
            makeRow({ name: 'A', amount: '100', cost: '50' }),
            makeRow({ name: '', amount: '', cost: '' }), // blank row
            makeRow({ name: 'B', amount: '200', cost: '75' }),
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['amount', 'cost'],
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: 3,
        });
        const firstRow = result.get(0)!;
        expect(firstRow.position.followedByGap).toBe(true);
        expect(firstRow.position.isLastInSection).toBe(true);
    });

    it('handles formatted numeric values (commas, currency symbols)', () => {
        const rows = [
            makeRow({ desc: 'A', sales: '1,000.50', cost: '500.25' }),
            makeRow({ desc: 'B', sales: '2,000.00', cost: '1,000.00' }),
            makeRow({ desc: '', sales: '3,000.50', cost: '1,500.25' }), // subtotal
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['sales', 'cost'],
            descriptorColumns: ['desc'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: 3,
        });
        const subtotal = result.get(2)!;
        expect(subtotal.sumVerification.isSumMatch).toBe(true);
        expect(subtotal.sumVerification.sumMatchType).toBe('grand_total');
    });

    it('resets section sums after a subtotal is consumed', () => {
        const rows = [
            makeRow({ name: 'A', amount: '100', cost: '50' }),
            makeRow({ name: 'B', amount: '200', cost: '75' }),
            makeRow({ name: '', amount: '300', cost: '125' }), // subtotal → section reset
            makeRow({ name: 'C', amount: '400', cost: '200' }),
            makeRow({ name: 'D', amount: '100', cost: '50' }),
            makeRow({ name: '', amount: '500', cost: '250' }), // second section subtotal: 400+100=500, 200+50=250
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['amount', 'cost'],
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: 6,
        });
        const s2 = result.get(5)!;
        expect(s2.sumVerification.isSumMatch).toBe(true);
        expect(s2.sumVerification.sumMatchType).toBe('section_subtotal');
    });

    it('requires at least 2 matching columns to avoid false positives', () => {
        const rows = [
            makeRow({ name: 'A', amount: '100' }),
            makeRow({ name: 'B', amount: '200' }),
            makeRow({ name: '', amount: '300' }), // only 1 fact column
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['amount'], // only 1 column — below threshold
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: 3,
        });
        const lastRow = result.get(2)!;
        expect(lastRow.sumVerification.isSumMatch).toBe(false);
    });

    it('resets section sums on group-header-like rows', () => {
        const rows = [
            makeRow({ name: 'A', amount: '100', cost: '50' }),
            makeRow({ name: 'B', amount: '200', cost: '75' }),
            makeRow({ name: 'Category X', amount: '', cost: '' }), // group header — resets section
            makeRow({ name: 'C', amount: '150', cost: '25' }),
            makeRow({ name: 'D', amount: '50', cost: '100' }),
            makeRow({ name: '', amount: '200', cost: '125' }), // section subtotal: 150+50=200, 25+100=125
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['amount', 'cost'],
            descriptorColumns: ['name'],
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: 6,
        });
        const subtotal = result.get(5)!;
        expect(subtotal.sumVerification.isSumMatch).toBe(true);
        expect(subtotal.sumVerification.sumMatchType).toBe('section_subtotal');
    });

    it('handles bodyStartIndex offset correctly', () => {
        const rows = [
            makeRow({ name: 'A', amount: '100', cost: '50' }),
            makeRow({ name: 'B', amount: '200', cost: '75' }),
            makeRow({ name: '', amount: '300', cost: '125' }),
        ];
        const result = computeRowRoleSignals({
            rows,
            factColumns: ['amount', 'cost'],
            descriptorColumns: ['name'],
            bodyStartIndex: 5, // offset
            summaryStartIndex: null,
            totalRowCount: 10,
        });
        // Keys should be absolute indices
        expect(result.has(5)).toBe(true);
        expect(result.has(6)).toBe(true);
        expect(result.has(7)).toBe(true);
        expect(result.get(7)!.sumVerification.isSumMatch).toBe(true);
    });
});

describe('classifyRowRoleFromSignals', () => {
    const makeSignals = (overrides: {
        sumMatch?: boolean;
        sumMatchType?: 'section_subtotal' | 'grand_total' | 'none';
        confidence?: number;
        singletonLongText?: boolean;
        edgePosition?: 'head' | 'tail' | 'interior';
        descriptorEmpty?: boolean;
        factPopulated?: number;
        isLastInSection?: boolean;
    }): Parameters<typeof classifyRowRoleFromSignals>[0] => ({
        sumVerification: {
            rowIndex: 0,
            isSumMatch: overrides.sumMatch ?? false,
            sumMatchConfidence: overrides.confidence ?? 0,
            matchedColumns: [],
            sumMatchType: overrides.sumMatchType ?? 'none',
        },
        sparsity: {
            rowIndex: 0,
            descriptorEmpty: overrides.descriptorEmpty ?? false,
            factColumnsPopulated: overrides.factPopulated ?? 0,
            isSingletonLongText: overrides.singletonLongText ?? false,
            isDocumentEdge: overrides.edgePosition !== 'interior',
            edgePosition: overrides.edgePosition ?? 'interior',
        },
        position: {
            rowIndex: 0,
            isLastInSection: overrides.isLastInSection ?? false,
            precedingDetailCount: 0,
            followedByGap: overrides.isLastInSection ?? false,
        },
    });

    it('classifies section subtotal', () => {
        const result = classifyRowRoleFromSignals(makeSignals({
            sumMatch: true,
            sumMatchType: 'section_subtotal',
            confidence: 1.0,
        }));
        expect(result.role).toBe('subtotal');
        expect(result.confidence).toBe(0.95);
    });

    it('classifies grand total', () => {
        const result = classifyRowRoleFromSignals(makeSignals({
            sumMatch: true,
            sumMatchType: 'grand_total',
            confidence: 1.0,
        }));
        expect(result.role).toBe('summary');
        expect(result.confidence).toBe(0.96);
    });

    it('classifies singleton long text at tail as footer', () => {
        const result = classifyRowRoleFromSignals(makeSignals({
            singletonLongText: true,
            edgePosition: 'tail',
        }));
        expect(result.role).toBe('footer');
        expect(result.confidence).toBe(0.92);
    });

    it('classifies singleton long text at head as note', () => {
        const result = classifyRowRoleFromSignals(makeSignals({
            singletonLongText: true,
            edgePosition: 'head',
        }));
        expect(result.role).toBe('note');
        expect(result.confidence).toBe(0.90);
    });

    it('classifies descriptor-empty + facts + last-in-section as summary_like', () => {
        const result = classifyRowRoleFromSignals(makeSignals({
            descriptorEmpty: true,
            factPopulated: 3,
            isLastInSection: true,
        }));
        expect(result.role).toBe('summary_like');
        expect(result.confidence).toBe(0.88);
    });

    it('returns null role when inconclusive', () => {
        const result = classifyRowRoleFromSignals(makeSignals({}));
        expect(result.role).toBeNull();
        expect(result.confidence).toBe(0);
    });

    it('singleton long text in interior is inconclusive', () => {
        const result = classifyRowRoleFromSignals(makeSignals({
            singletonLongText: true,
            edgePosition: 'interior',
        }));
        expect(result.role).toBeNull();
    });
});
