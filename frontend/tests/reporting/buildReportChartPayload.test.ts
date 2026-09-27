// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { ReportCardEvidence } from '../../types';
import { buildReportChartPayload } from '../../services/reporting/buildReportChartPayload';

const createCard = (): ReportCardEvidence => ({
    evidenceId: 'card.card-1',
    cardId: 'card-1',
    title: 'Revenue by Series Key',
    displayTitle: 'Revenue by Series Key',
    description: 'Compare revenue concentration across series keys.',
    artifactType: null,
    chartType: 'bar',
    groupByColumn: 'SeriesKey',
    valueColumn: 'Revenue',
    aggregation: 'sum',
    rowCount: 10,
    summary: { language: 'English', text: 'Revenue is concentrated in a few series keys.' },
    aggregatedDataSample: [],
    reportChartRows: [
        { SeriesKey: 'A', Revenue: 10 },
        { SeriesKey: 'B', Revenue: 90 },
        { SeriesKey: 'C', Revenue: 80 },
        { SeriesKey: 'D', Revenue: 70 },
        { SeriesKey: 'E', Revenue: 60 },
        { SeriesKey: 'F', Revenue: 50 },
        { SeriesKey: 'G', Revenue: 40 },
        { SeriesKey: 'H', Revenue: 30 },
        { SeriesKey: 'I', Revenue: 20 },
    ],
    semanticRole: 'business_dimension',
    helperExposureLevel: 'none',
    businessMeaningConfidence: 0.9,
    aggregationQualityFlags: [],
    isFallback: false,
});

describe('buildReportChartPayload', () => {
    it('ranks bar rows by absolute value and aggregates the tail into Other', () => {
        const payload = buildReportChartPayload(createCard());

        expect(payload?.displayLabels).toEqual(['B', 'C', 'D', 'E', 'F', 'Other']);
        expect(payload?.formattedValues[0]).toBe('90');
        expect(payload?.aggregationApplied).toBe(true);
        expect(payload?.aggregatedOtherValue).toBe(100);
    });

    it('downgrades mixed-sign circular charts into bars and disambiguates duplicate labels', () => {
        const card = createCard();
        card.chartType = 'pie';
        card.reportChartRows = [
            { SeriesKey: 'NULL_CODED', Revenue: 120 },
            { SeriesKey: 'NULL_CODED', Revenue: -20 },
            { SeriesKey: 'VALID_KEY', Revenue: 80 },
        ];

        const payload = buildReportChartPayload(card);

        expect(payload?.chartType).toBe('bar');
        expect(payload?.displayLabels).toEqual(['Null Coded', 'Valid', 'Null Coded (2)']);
        expect(payload?.chartWarnings).toContain('Circular charts were downgraded because the values are not strictly positive.');
    });

    it('sorts line payload by month ordinal order', () => {
        const card = createCard();
        card.chartType = 'line';
        card.groupByColumn = 'Month';
        card.valueColumn = 'Revenue';
        card.reportChartRows = [
            { Month: 'Mar', Revenue: 300 },
            { Month: 'Jan', Revenue: 100 },
            { Month: 'Feb', Revenue: 200 },
        ];

        const payload = buildReportChartPayload(card);

        // After ordinal sort the labels should be in canonical month order.
        expect(payload?.labels).toEqual(['Jan', 'Feb', 'Mar']);
        expect(payload?.numericValues).toEqual([100, 200, 300]);
    });

    it('sorts line payload by quarter ordinal order', () => {
        const card = createCard();
        card.chartType = 'line';
        card.groupByColumn = 'Quarter';
        card.valueColumn = 'Revenue';
        card.reportChartRows = [
            { Quarter: 'Q3', Revenue: 300 },
            { Quarter: 'Q1', Revenue: 100 },
            { Quarter: 'Q2', Revenue: 200 },
        ];

        const payload = buildReportChartPayload(card);

        expect(payload?.labels).toEqual(['Q1', 'Q2', 'Q3']);
        expect(payload?.numericValues).toEqual([100, 200, 300]);
    });

    it('sorts line payload by weekday ordinal order', () => {
        const card = createCard();
        card.chartType = 'line';
        card.groupByColumn = 'Day';
        card.valueColumn = 'Revenue';
        card.reportChartRows = [
            { Day: 'Wed', Revenue: 300 },
            { Day: 'Mon', Revenue: 100 },
            { Day: 'Tue', Revenue: 200 },
        ];

        const payload = buildReportChartPayload(card);

        expect(payload?.labels).toEqual(['Mon', 'Tue', 'Wed']);
        expect(payload?.numericValues).toEqual([100, 200, 300]);
    });

    it('keeps raw epoch labels for sorting while exposing readable display labels for date dimensions', () => {
        const card = createCard();
        card.chartType = 'line';
        card.groupByColumn = 'CUSTOMER ORDER DATE';
        card.valueColumn = 'Revenue';
        card.reportChartRows = [
            { 'CUSTOMER ORDER DATE': 1293926400000, Revenue: 200 },
            { 'CUSTOMER ORDER DATE': 1293753600000, Revenue: 100 },
            { 'CUSTOMER ORDER DATE': 1294012800000, Revenue: 300 },
        ];

        const payload = buildReportChartPayload(card);

        expect(payload?.labels).toEqual(['1293753600000', '1293926400000', '1294012800000']);
        expect(payload?.displayLabels).toEqual(['31/12/2010', '02/01/2011', '03/01/2011']);
        expect(payload?.numericValues).toEqual([100, 200, 300]);
    });

    it('downgrades pie to bar when too many categories', () => {
        const card = createCard();
        card.chartType = 'pie';
        card.reportChartRows = Array.from({ length: 10 }, (_, i) => ({
            SeriesKey: `Cat${i + 1}`,
            Revenue: (i + 1) * 10,
        }));

        const payload = buildReportChartPayload(card);

        expect(payload?.chartType).toBe('bar');
        expect(payload?.chartWarnings.some(w => w.includes('category count'))).toBe(true);
    });

    it('downgrades pie to bar when duplicate bucket labels are detected', () => {
        const card = createCard();
        card.chartType = 'pie';
        card.reportChartRows = [
            { SeriesKey: 'East', Revenue: 100 },
            { SeriesKey: 'West', Revenue: 200 },
            { SeriesKey: 'EAST', Revenue: 50 },
        ];

        const payload = buildReportChartPayload(card);

        expect(payload?.chartType).toBe('bar');
        expect(payload?.chartWarnings.some(w => w.includes('duplicate category'))).toBe(true);
    });

    it('downgrades line to bar when duplicate x-axis labels are detected', () => {
        const card = createCard();
        card.chartType = 'line';
        card.groupByColumn = 'Month';
        card.valueColumn = 'Revenue';
        card.reportChartRows = [
            { Month: 'Jan', Revenue: 100 },
            { Month: 'Feb', Revenue: 200 },
            { Month: 'Jan', Revenue: 150 },
        ];

        const payload = buildReportChartPayload(card);

        expect(payload?.chartType).toBe('bar');
        expect(payload?.chartWarnings.some(w => w.includes('duplicate x-axis'))).toBe(true);
    });
});
