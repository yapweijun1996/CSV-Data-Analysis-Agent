// @vitest-environment node

/**
 * Tests for chart validation and repair in renderReportChartSvg.ts.
 *
 * Covers:
 * - validateChartPayload: empty arrays, array length mismatch, all-NaN values
 * - repairChartPayload: NaN replacement, array alignment, valueDomain correction,
 *   chartType downgrade
 * - renderReportChartSvg: fallback SVG on unrecoverable payload, render-after-repair
 */

import { describe, it, expect } from 'vitest';
import type { ReportChartPayload } from '../../types';
import {
    validateChartPayload,
    repairChartPayload,
    renderReportChartSvg,
} from '../../services/reporting/renderReportChartSvg';

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

const makePayload = (overrides: Partial<ReportChartPayload> = {}): ReportChartPayload => ({
    chartType: 'bar',
    title: 'Test Chart',
    groupByColumn: 'Region',
    valueColumn: 'Revenue',
    rows: [],
    sortedRows: [],
    labels: ['North', 'South', 'East'],
    displayLabels: ['North', 'South', 'East'],
    numericValues: [1000, 2000, 3000],
    formattedValues: ['1,000', '2,000', '3,000'],
    chartNarrative: 'Revenue by region.',
    valueDomain: 'positive',
    aggregationApplied: false,
    aggregatedOtherValue: null,
    chartWarnings: [],
    ...overrides,
});

// ---------------------------------------------------------------------------
// validateChartPayload
// ---------------------------------------------------------------------------

describe('validateChartPayload', () => {
    it('returns isValid=true for a well-formed payload', () => {
        const result = validateChartPayload(makePayload());
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('returns an error when numericValues is empty', () => {
        const result = validateChartPayload(makePayload({
            numericValues: [],
            formattedValues: [],
            displayLabels: [],
            labels: [],
        }));
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('numericValues is empty'))).toBe(true);
    });

    it('returns an error when displayLabels is empty', () => {
        const result = validateChartPayload(makePayload({
            displayLabels: [],
            labels: [],
        }));
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('displayLabels is empty'))).toBe(true);
    });

    it('returns an error when displayLabels and numericValues lengths differ', () => {
        const result = validateChartPayload(makePayload({
            displayLabels: ['North', 'South'],
            labels: ['North', 'South'],
            numericValues: [1000, 2000, 3000],
            formattedValues: ['1,000', '2,000', '3,000'],
        }));
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('does not match numericValues'))).toBe(true);
    });

    it('returns a warning (not error) when formattedValues length differs', () => {
        const result = validateChartPayload(makePayload({
            formattedValues: ['1,000', '2,000'],  // 2 vs 3 numericValues
        }));
        // Length mismatch in formattedValues alone is a warning, not a blocking error.
        expect(result.warnings.some(w => w.includes('formattedValues length'))).toBe(true);
        // Should still be valid (formattedValues length does not block rendering).
        expect(result.isValid).toBe(true);
    });

    it('returns an error when all numericValues are NaN', () => {
        const result = validateChartPayload(makePayload({
            numericValues: [NaN, NaN, NaN],
        }));
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('non-finite'))).toBe(true);
    });

    it('does not error when only some numericValues are NaN (mixed)', () => {
        const result = validateChartPayload(makePayload({
            numericValues: [NaN, 2000, 3000],
        }));
        // Not all non-finite — should be valid (repair can fix individual NaNs).
        expect(result.isValid).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// repairChartPayload
// ---------------------------------------------------------------------------

describe('repairChartPayload', () => {
    it('returns success and no changes for a valid payload', () => {
        const payload = makePayload();
        const result = repairChartPayload(payload);
        expect(result.success).toBe(true);
        expect(result.changes).toHaveLength(0);
        expect(result.payload.numericValues).toEqual([1000, 2000, 3000]);
    });

    it('replaces NaN values with 0', () => {
        const payload = makePayload({ numericValues: [NaN, 2000, 3000] });
        const result = repairChartPayload(payload);
        expect(result.success).toBe(true);
        expect(result.payload.numericValues[0]).toBe(0);
        expect(result.payload.numericValues[1]).toBe(2000);
        expect(result.changes.some(c => c.includes('replaced with 0'))).toBe(true);
    });

    it('replaces Infinity values with 0', () => {
        const payload = makePayload({ numericValues: [Infinity, -Infinity, 3000] });
        const result = repairChartPayload(payload);
        expect(result.payload.numericValues[0]).toBe(0);
        expect(result.payload.numericValues[1]).toBe(0);
    });

    it('truncates formattedValues when longer than numericValues', () => {
        const payload = makePayload({
            numericValues: [1000, 2000],
            formattedValues: ['1,000', '2,000', 'extra'],
            displayLabels: ['North', 'South'],
            labels: ['North', 'South'],
        });
        const result = repairChartPayload(payload);
        expect(result.payload.formattedValues).toHaveLength(2);
        expect(result.changes.some(c => c.includes('formattedValues truncated'))).toBe(true);
    });

    it('pads formattedValues when shorter than numericValues', () => {
        const payload = makePayload({
            numericValues: [1000, 2000, 3000],
            formattedValues: ['1,000'],
            displayLabels: ['North', 'South', 'East'],
            labels: ['North', 'South', 'East'],
        });
        const result = repairChartPayload(payload);
        expect(result.payload.formattedValues).toHaveLength(3);
        expect(result.changes.some(c => c.includes('formattedValues padded'))).toBe(true);
    });

    it('truncates displayLabels when longer than numericValues', () => {
        const payload = makePayload({
            numericValues: [1000, 2000],
            formattedValues: ['1,000', '2,000'],
            displayLabels: ['North', 'South', 'East'],
            labels: ['North', 'South', 'East'],
        });
        const result = repairChartPayload(payload);
        expect(result.payload.displayLabels).toHaveLength(2);
        expect(result.changes.some(c => c.includes('displayLabels truncated'))).toBe(true);
    });

    it('pads displayLabels with generated names when shorter than numericValues', () => {
        const payload = makePayload({
            numericValues: [1000, 2000, 3000],
            formattedValues: ['1,000', '2,000', '3,000'],
            displayLabels: ['North'],
            labels: ['North'],
        });
        const result = repairChartPayload(payload);
        expect(result.payload.displayLabels).toHaveLength(3);
        expect(result.payload.displayLabels[1]).toBe('Item 2');
        expect(result.payload.displayLabels[2]).toBe('Item 3');
        expect(result.changes.some(c => c.includes('displayLabels padded'))).toBe(true);
    });

    it('corrects valueDomain when it mismatches actual values', () => {
        const payload = makePayload({
            numericValues: [1000, -500, 3000],
            formattedValues: ['1,000', '-500', '3,000'],
            valueDomain: 'positive', // wrong — values include negative
        });
        const result = repairChartPayload(payload);
        expect(result.payload.valueDomain).toBe('mixed');
        expect(result.changes.some(c => c.includes('valueDomain corrected'))).toBe(true);
    });

    it('downgrades pie to bar when values include negative', () => {
        const payload = makePayload({
            chartType: 'pie',
            numericValues: [1000, -500, 3000],
            formattedValues: ['1,000', '-500', '3,000'],
            valueDomain: 'mixed',
        });
        const result = repairChartPayload(payload);
        expect(result.payload.chartType).toBe('bar');
        expect(result.changes.some(c => c.includes("chartType downgraded from 'pie'"))).toBe(true);
    });

    it('does not mutate the original payload object', () => {
        const payload = makePayload({ numericValues: [NaN, 2000, 3000] });
        repairChartPayload(payload);
        // Original must be unchanged.
        expect(payload.numericValues[0]).toBe(NaN);
    });
});

// ---------------------------------------------------------------------------
// renderReportChartSvg — validation + repair integration
// ---------------------------------------------------------------------------

describe('renderReportChartSvg validation + repair integration', () => {
    it('renders a valid payload directly (fast path)', () => {
        const svg = renderReportChartSvg(makePayload());
        expect(svg).toContain('<svg');
        expect(svg).not.toContain('Could not be rendered');
    });

    it('renders after repairing NaN values (repair path)', () => {
        const payload = makePayload({ numericValues: [NaN, 2000, 3000] });
        const svg = renderReportChartSvg(payload);
        // Should still produce a bar chart, not a fallback.
        expect(svg).toContain('<svg');
        expect(svg).not.toContain('Chart data could not be rendered');
    });

    it('renders after repairing mismatched formattedValues (repair path)', () => {
        const payload = makePayload({ formattedValues: ['1,000'] }); // wrong length
        const svg = renderReportChartSvg(payload);
        expect(svg).toContain('<svg');
        expect(svg).not.toContain('Chart data could not be rendered');
    });

    it('returns fallback SVG for unrecoverable empty payload', () => {
        const payload = makePayload({
            numericValues: [],
            formattedValues: [],
            displayLabels: [],
            labels: [],
        });
        const svg = renderReportChartSvg(payload);
        // Should return fallback placeholder SVG.
        expect(svg).toContain('<svg');
        expect(svg).toContain('Chart data could not be rendered');
    });

    it('fallback SVG includes the chart title for context', () => {
        const payload = makePayload({
            title: 'Revenue by Region',
            numericValues: [],
            formattedValues: [],
            displayLabels: [],
            labels: [],
        });
        const svg = renderReportChartSvg(payload);
        expect(svg).toContain('Revenue by Region');
    });

    it('fallback SVG is valid XML-safe (escapes special chars in title)', () => {
        const payload = makePayload({
            title: 'Revenue <B&W> Chart',
            numericValues: [],
            formattedValues: [],
            displayLabels: [],
            labels: [],
        });
        const svg = renderReportChartSvg(payload);
        // Raw angle brackets must not appear inside attribute values.
        expect(svg).not.toContain('aria-label="Revenue <B&W>');
        expect(svg).toContain('&lt;');
    });

    it('downgrades pie to bar for mixed-domain data and still renders', () => {
        const payload = makePayload({
            chartType: 'pie',
            numericValues: [1000, -500, 3000],
            formattedValues: ['1,000', '-500', '3,000'],
            valueDomain: 'mixed',
        });
        const svg = renderReportChartSvg(payload);
        // pie is downgraded to bar — should contain bar-chart markers.
        expect(svg).toContain('<svg');
        expect(svg).toContain('Zero baseline');
    });
});
