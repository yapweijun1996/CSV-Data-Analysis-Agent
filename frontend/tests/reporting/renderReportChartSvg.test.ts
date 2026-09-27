// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { ReportChartPayload } from '../../types';
import { renderReportChartSvg } from '../../services/reporting/renderReportChartSvg';

describe('renderReportChartSvg', () => {
    it('renders readable bar charts with a zero baseline for mixed positive and negative values', () => {
        const payload: ReportChartPayload = {
            chartType: 'bar',
            title: 'Total Recorded Value by Description',
            groupByColumn: 'Description',
            valueColumn: 'Value',
            rows: [],
            sortedRows: [],
            labels: [
                'UNUTILISED ANNUAL LEAVE',
                'GAIN / LOSS ON DISPOSAL OF ROU ASSET',
                'BAD DEBTS',
            ],
            displayLabels: [
                'Unutilised Annual Leave',
                'Gain / Loss On Disposal Of Rou Asset',
                'Bad Debts',
            ],
            numericValues: [125000, -79373.04, -8908.46],
            formattedValues: ['125,000', '-79,373.04', '-8,908.46'],
            chartNarrative: 'Personnel costs and asset adjustments drive the outflow mix.',
            valueDomain: 'mixed',
            aggregationApplied: false,
            aggregatedOtherValue: null,
            chartWarnings: [],
        };

        const svg = renderReportChartSvg(payload);

        expect(svg).toContain('Zero baseline');
        expect(svg).toContain('class="chart-row negative"');
        expect(svg).toContain('class="chart-row positive"');
        expect(svg).toContain('Unutilised Annual Leave');
        expect(svg).toContain('Gain / Loss On');
    });

    it('renders line charts with readable axis labels', () => {
        const payload: ReportChartPayload = {
            chartType: 'line',
            title: 'Revenue Trend',
            groupByColumn: 'Month',
            valueColumn: 'Revenue',
            rows: [],
            sortedRows: [],
            labels: ['January 2025', 'February 2025', 'March 2025'],
            displayLabels: ['January 2025', 'February 2025', 'March 2025'],
            numericValues: [1200, 1600, 1400],
            formattedValues: ['1,200', '1,600', '1,400'],
            chartNarrative: 'Revenue peaked in February before easing in March.',
            valueDomain: 'positive',
            aggregationApplied: false,
            aggregatedOtherValue: null,
            chartWarnings: [],
        };

        const svg = renderReportChartSvg(payload);

        expect(svg).toContain('Revenue trend');
        expect(svg).toContain('January 2025');
        expect(svg).toContain('1,600');
    });

    it('renders line chart labels in the normalised payload order', () => {
        const payload: ReportChartPayload = {
            chartType: 'line',
            title: 'Revenue Trend',
            groupByColumn: 'Month',
            valueColumn: 'Revenue',
            rows: [],
            sortedRows: [],
            labels: ['Jan', 'Feb', 'Mar'],
            displayLabels: ['Jan', 'Feb', 'Mar'],
            numericValues: [100, 200, 300],
            formattedValues: ['100', '200', '300'],
            chartNarrative: 'Steady growth.',
            valueDomain: 'positive',
            aggregationApplied: false,
            aggregatedOtherValue: null,
            chartWarnings: [],
        };

        const svg = renderReportChartSvg(payload);

        const janPos = svg.indexOf('Jan');
        const febPos = svg.indexOf('Feb');
        const marPos = svg.indexOf('Mar');
        expect(janPos).toBeLessThan(febPos);
        expect(febPos).toBeLessThan(marPos);
    });

    it('does not show zero reference line for positive-only line chart', () => {
        const payload: ReportChartPayload = {
            chartType: 'line',
            title: 'Revenue Trend',
            groupByColumn: 'Month',
            valueColumn: 'Revenue',
            rows: [],
            sortedRows: [],
            labels: ['Jan', 'Feb', 'Mar'],
            displayLabels: ['Jan', 'Feb', 'Mar'],
            numericValues: [1200, 1600, 1400],
            formattedValues: ['1,200', '1,600', '1,400'],
            chartNarrative: 'Revenue peaked.',
            valueDomain: 'positive',
            aggregationApplied: false,
            aggregatedOtherValue: null,
            chartWarnings: [],
        };

        const svg = renderReportChartSvg(payload);

        // positive-only line should not have a dashed zero reference line
        expect(svg).not.toContain('stroke-dasharray="4 4"');
    });

    it('shows zero reference line for mixed-domain line chart', () => {
        const payload: ReportChartPayload = {
            chartType: 'line',
            title: 'P&L Trend',
            groupByColumn: 'Month',
            valueColumn: 'NetIncome',
            rows: [],
            sortedRows: [],
            labels: ['Jan', 'Feb', 'Mar'],
            displayLabels: ['Jan', 'Feb', 'Mar'],
            numericValues: [500, -200, 300],
            formattedValues: ['500', '-200', '300'],
            chartNarrative: 'Mixed results.',
            valueDomain: 'mixed',
            aggregationApplied: false,
            aggregatedOtherValue: null,
            chartWarnings: [],
        };

        const svg = renderReportChartSvg(payload);

        expect(svg).toContain('stroke-dasharray="4 4"');
    });

    it('bar chart always shows zero baseline regardless of domain', () => {
        const payload: ReportChartPayload = {
            chartType: 'bar',
            title: 'Revenue by Region',
            groupByColumn: 'Region',
            valueColumn: 'Revenue',
            rows: [],
            sortedRows: [],
            labels: ['East', 'West'],
            displayLabels: ['East', 'West'],
            numericValues: [1000, 2000],
            formattedValues: ['1,000', '2,000'],
            chartNarrative: 'All positive.',
            valueDomain: 'positive',
            aggregationApplied: false,
            aggregatedOtherValue: null,
            chartWarnings: [],
        };

        const svg = renderReportChartSvg(payload);

        expect(svg).toContain('Zero baseline');
    });
});
