import { describe, it, expect } from 'vitest';
import { recommendChartType, ChartRecommendationInput } from '../utils/chartTypeUtils';

const make = (overrides: Partial<ChartRecommendationInput> = {}): ChartRecommendationInput => ({
    rowCount: 5,
    distinctGroupCount: 5,
    hasNegativeValues: false,
    isTimeSeries: false,
    metricCount: 1,
    ...overrides,
});

describe('recommendChartType', () => {
    it('recommends doughnut for 2 groups', () => {
        expect(recommendChartType(make({ rowCount: 2, distinctGroupCount: 2 }))).toBe('doughnut');
    });

    it('recommends pie for 3 groups', () => {
        expect(recommendChartType(make({ rowCount: 3, distinctGroupCount: 3 }))).toBe('pie');
    });

    it('recommends pie for 5 groups', () => {
        expect(recommendChartType(make({ rowCount: 5, distinctGroupCount: 5 }))).toBe('pie');
    });

    it('recommends doughnut for 6 groups', () => {
        expect(recommendChartType(make({ rowCount: 6, distinctGroupCount: 6 }))).toBe('doughnut');
    });

    it('recommends doughnut for 8 groups', () => {
        expect(recommendChartType(make({ rowCount: 8, distinctGroupCount: 8 }))).toBe('doughnut');
    });

    it('recommends bar for >8 groups', () => {
        expect(recommendChartType(make({ rowCount: 12, distinctGroupCount: 12 }))).toBe('bar');
    });

    it('recommends bar when values have negatives', () => {
        expect(recommendChartType(make({ rowCount: 3, distinctGroupCount: 3, hasNegativeValues: true }))).toBe('bar');
    });

    it('recommends line for time series ≤24 rows', () => {
        expect(recommendChartType(make({ rowCount: 12, distinctGroupCount: 12, isTimeSeries: true }))).toBe('line');
    });

    it('recommends area for time series >24 rows', () => {
        expect(recommendChartType(make({ rowCount: 30, distinctGroupCount: 30, isTimeSeries: true }))).toBe('area');
    });

    it('recommends combo for 2 metrics with ≤12 groups', () => {
        expect(recommendChartType(make({ rowCount: 8, distinctGroupCount: 8, metricCount: 2 }))).toBe('combo');
    });

    it('falls through to group-count logic for 2 metrics with >12 groups', () => {
        expect(recommendChartType(make({ rowCount: 15, distinctGroupCount: 15, metricCount: 2 }))).toBe('bar');
    });

    it('time series takes priority over combo', () => {
        expect(recommendChartType(make({ rowCount: 10, distinctGroupCount: 10, metricCount: 2, isTimeSeries: true }))).toBe('line');
    });

    it('negative values override pie-eligible group count', () => {
        expect(recommendChartType(make({ rowCount: 4, distinctGroupCount: 4, hasNegativeValues: true }))).toBe('bar');
    });
});
