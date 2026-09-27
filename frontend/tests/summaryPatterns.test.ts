import { describe, expect, it } from 'vitest';
import {
    isSummaryLike,
    isSubtotalLike,
    isTotalLike,
    hasSummaryToken,
    SUMMARY_LABEL_PATTERN,
    SUBTOTAL_ROW_PATTERN,
    TOTAL_ROW_PATTERN,
    SUMMARY_TOKEN_PATTERN,
} from '../services/agent/reportShapeUtils';

describe('isSummaryLike (SUMMARY_LABEL_PATTERN)', () => {
    it.each([
        'Total', 'TOTAL', 'total',
        'Subtotal', 'SUBTOTAL',
        'Grand Total', 'grand total', 'grand-total', 'grand_total',
        'Net Total', 'net-total', 'net_total',
    ])('matches "%s"', (value) => {
        expect(isSummaryLike(value)).toBe(true);
    });

    it.each([
        'Net Income', 'Total Revenue', 'subtotals', 'grand',
        'totals', 'Grand', 'Net', '', 'Other',
    ])('rejects "%s"', (value) => {
        expect(isSummaryLike(value)).toBe(false);
    });

    it('handles leading/trailing whitespace', () => {
        expect(isSummaryLike('  Total  ')).toBe(true);
        expect(isSummaryLike(' Grand Total ')).toBe(true);
    });
});

describe('isSubtotalLike (SUBTOTAL_ROW_PATTERN)', () => {
    it.each(['subtotal', 'SUBTOTAL', 'Subtotal', 'sub total', 'Sub-Total'])(
        'matches "%s"', (value) => {
            expect(isSubtotalLike(value)).toBe(true);
        },
    );

    it.each(['total', 'subtotals', 'grand total', ''])(
        'rejects "%s"', (value) => {
            expect(isSubtotalLike(value)).toBe(false);
        },
    );
});

describe('isTotalLike (TOTAL_ROW_PATTERN)', () => {
    it.each([
        'total', 'Total', 'TOTAL',
        'grand total', 'Grand Total',
        'net', 'Net',
        'total revenue', 'Total (Nett Amount)',
        'balance', 'Balance', 'BALANCE',
    ])('matches "%s"', (value) => {
        expect(isTotalLike(value)).toBe(true);
    });

    it.each([
        'subtotal', 'totals', '',
        'grand', 'balancing', 'net income', 'Net Profit', 'net assets',
    ])('rejects "%s"', (value) => {
        expect(isTotalLike(value)).toBe(false);
    });
});

describe('hasSummaryToken (SUMMARY_TOKEN_PATTERN)', () => {
    it.each([
        'Region | Total',
        'subtotal amount',
        'Grand Total: 500',
        'net total row',
        'summary of all items',
        'balance sheet',
        'Row>Total',
        'sub total value',
    ])('matches "%s"', (text) => {
        expect(hasSummaryToken(text)).toBe(true);
    });

    it.each([
        'totally different',
        'balancing act',
        '',
        'net income detail',
        'some random text',
    ])('rejects "%s"', (text) => {
        expect(hasSummaryToken(text)).toBe(false);
    });

    it('matches summary token in joined cell text', () => {
        const joined = ['Revenue', 'Cost', 'Total'].join(' | ');
        expect(hasSummaryToken(joined)).toBe(true);
    });

    it('does not match partial words', () => {
        expect(hasSummaryToken('totalitarian')).toBe(false);
    });
});

describe('pattern exports are correctly typed', () => {
    it('SUMMARY_LABEL_PATTERN is a RegExp', () => {
        expect(SUMMARY_LABEL_PATTERN).toBeInstanceOf(RegExp);
    });
    it('SUBTOTAL_ROW_PATTERN is a RegExp', () => {
        expect(SUBTOTAL_ROW_PATTERN).toBeInstanceOf(RegExp);
    });
    it('TOTAL_ROW_PATTERN is a RegExp', () => {
        expect(TOTAL_ROW_PATTERN).toBeInstanceOf(RegExp);
    });
    it('SUMMARY_TOKEN_PATTERN is a RegExp', () => {
        expect(SUMMARY_TOKEN_PATTERN).toBeInstanceOf(RegExp);
    });
});
