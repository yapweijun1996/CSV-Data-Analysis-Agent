import { describe, it, expect } from 'vitest';
import {
    resolveAiChartType,
    tryResolveAiChartType,
    isValidChartType,
    normalizeEncodingChannel,
} from '../services/agent/planning/chartTypeResolver';

describe('resolveAiChartType', () => {
    it('passes through canonical chart types unchanged', () => {
        expect(resolveAiChartType('bar')).toBe('bar');
        expect(resolveAiChartType('line')).toBe('line');
        expect(resolveAiChartType('scatter')).toBe('scatter');
        expect(resolveAiChartType('doughnut')).toBe('doughnut');
        expect(resolveAiChartType('multi_line')).toBe('multi_line');
        expect(resolveAiChartType('stacked_bar')).toBe('stacked_bar');
        expect(resolveAiChartType('horizontal_bar')).toBe('horizontal_bar');
    });

    it('resolves AI aliases to canonical types', () => {
        expect(resolveAiChartType('scatter plot')).toBe('scatter');
        expect(resolveAiChartType('scatter_plot')).toBe('scatter');
        expect(resolveAiChartType('scatterplot')).toBe('scatter');
        expect(resolveAiChartType('donut')).toBe('doughnut');
        expect(resolveAiChartType('donut_chart')).toBe('doughnut');
        expect(resolveAiChartType('bar chart')).toBe('bar');
        expect(resolveAiChartType('bar_chart')).toBe('bar');
        expect(resolveAiChartType('column')).toBe('bar');
        expect(resolveAiChartType('line_chart')).toBe('line');
        expect(resolveAiChartType('pie chart')).toBe('pie');
        expect(resolveAiChartType('spider')).toBe('radar');
        expect(resolveAiChartType('mixed')).toBe('combo');
        expect(resolveAiChartType('stacked bar chart')).toBe('stacked_bar');
        expect(resolveAiChartType('multiline')).toBe('multi_line');
        expect(resolveAiChartType('hbar')).toBe('horizontal_bar');
        expect(resolveAiChartType('polar')).toBe('polar_area');
    });

    it('is case insensitive', () => {
        expect(resolveAiChartType('Bar')).toBe('bar');
        expect(resolveAiChartType('BAR')).toBe('bar');
        expect(resolveAiChartType('Scatter Plot')).toBe('scatter');
        expect(resolveAiChartType('LINE_CHART')).toBe('line');
        expect(resolveAiChartType('DONUT')).toBe('doughnut');
    });

    it('trims whitespace', () => {
        expect(resolveAiChartType(' line ')).toBe('line');
        expect(resolveAiChartType('  bar  ')).toBe('bar');
        expect(resolveAiChartType('\tscatter\n')).toBe('scatter');
    });

    it('falls back to bar for unknown types', () => {
        expect(resolveAiChartType('waterfall')).toBe('bar');
        expect(resolveAiChartType('heatmap')).toBe('bar');
        expect(resolveAiChartType('treemap')).toBe('bar');
        expect(resolveAiChartType('sankey')).toBe('bar');
    });

    it('uses custom fallback when provided', () => {
        expect(resolveAiChartType('waterfall', 'line')).toBe('line');
        expect(resolveAiChartType('unknown', 'scatter')).toBe('scatter');
    });

    it('falls back for null and undefined', () => {
        expect(resolveAiChartType(null)).toBe('bar');
        expect(resolveAiChartType(undefined)).toBe('bar');
        expect(resolveAiChartType('')).toBe('bar');
        expect(resolveAiChartType('   ')).toBe('bar');
    });

    it('uses custom fallback for null/undefined', () => {
        expect(resolveAiChartType(null, 'line')).toBe('line');
        expect(resolveAiChartType(undefined, 'pie')).toBe('pie');
    });
});

describe('tryResolveAiChartType', () => {
    it('returns canonical type for known inputs', () => {
        expect(tryResolveAiChartType('bar')).toBe('bar');
        expect(tryResolveAiChartType('scatter plot')).toBe('scatter');
        expect(tryResolveAiChartType('donut')).toBe('doughnut');
    });

    it('returns undefined for unknown inputs', () => {
        expect(tryResolveAiChartType('waterfall')).toBeUndefined();
        expect(tryResolveAiChartType('heatmap')).toBeUndefined();
    });

    it('returns undefined for null/undefined/empty', () => {
        expect(tryResolveAiChartType(null)).toBeUndefined();
        expect(tryResolveAiChartType(undefined)).toBeUndefined();
        expect(tryResolveAiChartType('')).toBeUndefined();
    });
});

describe('isValidChartType', () => {
    it('returns true for all canonical chart types', () => {
        const canonicalTypes = [
            'bar', 'horizontal_bar', 'line', 'area', 'pie', 'doughnut',
            'polar_area', 'scatter', 'combo', 'radar', 'bubble',
            'stacked_bar', 'stacked_column', 'multi_line',
        ];
        for (const type of canonicalTypes) {
            expect(isValidChartType(type)).toBe(true);
        }
    });

    it('returns false for aliases (they are not canonical)', () => {
        expect(isValidChartType('donut')).toBe(false);
        expect(isValidChartType('scatter plot')).toBe(false);
        expect(isValidChartType('bar chart')).toBe(false);
    });

    it('returns false for unknown types', () => {
        expect(isValidChartType('waterfall')).toBe(false);
        expect(isValidChartType('heatmap')).toBe(false);
    });
});

describe('normalizeEncodingChannel', () => {
    it('maps known aliases to canonical channels', () => {
        expect(normalizeEncodingChannel('facet')).toBe('column');
        expect(normalizeEncodingChannel('color')).toBe('series');
        expect(normalizeEncodingChannel('colour')).toBe('series');
        expect(normalizeEncodingChannel('x_axis')).toBe('x');
        expect(normalizeEncodingChannel('y_axis')).toBe('y');
        expect(normalizeEncodingChannel('x-axis')).toBe('x');
        expect(normalizeEncodingChannel('y-axis')).toBe('y');
        expect(normalizeEncodingChannel('category')).toBe('x');
        expect(normalizeEncodingChannel('value')).toBe('y');
    });

    it('passes through unknown channels unchanged', () => {
        expect(normalizeEncodingChannel('x')).toBe('x');
        expect(normalizeEncodingChannel('y')).toBe('y');
        expect(normalizeEncodingChannel('series')).toBe('series');
        expect(normalizeEncodingChannel('custom')).toBe('custom');
    });

    it('is case insensitive', () => {
        expect(normalizeEncodingChannel('Facet')).toBe('column');
        expect(normalizeEncodingChannel('COLOR')).toBe('series');
        expect(normalizeEncodingChannel('X_AXIS')).toBe('x');
    });

    it('trims whitespace', () => {
        expect(normalizeEncodingChannel(' facet ')).toBe('column');
        expect(normalizeEncodingChannel('  color  ')).toBe('series');
    });
});
