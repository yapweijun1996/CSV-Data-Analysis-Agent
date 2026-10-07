// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { rankAnalysisTopics, resolveAnalysisTopicRange } from '../services/agent/planning/planGenerator';

describe('planGenerator topic ranking', () => {
    it('deduplicates identical topics preserving first occurrence', () => {
        const ranked = rankAnalysisTopics(
            [
                'Revenue by Region',
                'Revenue by Bucket',
                'Revenue by Region',
                'Count of records by Bucket',
            ],
            {
                title: 'Metrics',
                dimensionColumns: ['Region', 'Bucket'],
                metricColumns: ['Revenue'],
                preferredGrainColumns: ['Bucket'],
                avoidGrainColumns: [],
                preferredMetricTerms: ['Revenue'],
            },
        );

        expect(ranked).toEqual([
            'Revenue by Region',
            'Revenue by Bucket',
            'Count of records by Bucket',
        ]);
    });

    it('trims whitespace and deduplicates normalised entries', () => {
        const ranked = rankAnalysisTopics(
            ['  Revenue by Region  ', 'Revenue by Region', 'Count by Region'],
            {
                title: 'Revenue',
                dimensionColumns: ['Region'],
                metricColumns: ['Revenue'],
                preferredGrainColumns: ['Region'],
                avoidGrainColumns: [],
                preferredMetricTerms: ['Revenue'],
            },
        );

        expect(ranked).toEqual(['Revenue by Region', 'Count by Region']);
    });

    it('preserves input order for topics that are not blocked or duplicated', () => {
        const topics = ['C by X', 'A by X', 'B by X'];
        const ranked = rankAnalysisTopics(topics, {
            title: 'Dataset',
            dimensionColumns: ['X'],
            metricColumns: ['A', 'B', 'C'],
            preferredGrainColumns: ['X'],
            avoidGrainColumns: [],
            preferredMetricTerms: ['A', 'B', 'C'],
        });

        expect(ranked).toEqual(topics);
    });

    it('filters blocked helper dimensions from the default topic ranking', () => {
        const ranked = rankAnalysisTopics(
            [
                'Revenue by SeriesKey',
                'Revenue by Project',
                'Value by RowClass',
            ],
            {
                title: 'Project Revenue',
                dimensionColumns: ['Project', 'SeriesKey', 'RowClass'],
                metricColumns: ['Value'],
                preferredGrainColumns: ['Project'],
                avoidGrainColumns: ['SeriesKey', 'RowClass'],
                preferredMetricTerms: ['Revenue'],
                blockedDimensions: ['SeriesKey', 'RowClass'],
                businessGrains: ['Project'],
                businessGrainConfidence: 'high',
                unsafeForBusinessNarrative: false,
            },
        );

        expect(ranked).toEqual(['Revenue by Project']);
    });

    it('deprioritizes quality-governed dimensions and metrics to end instead of filtering', () => {
        const ranked = rankAnalysisTopics(
            [
                'Revenue by Region',
                'Margin by Customer',
                'Revenue by Customer',
            ],
            {
                title: 'Revenue Quality',
                dimensionColumns: ['Region', 'Customer'],
                metricColumns: ['Revenue', 'Margin'],
                preferredGrainColumns: ['Customer'],
                avoidGrainColumns: ['Region'],
                avoidMetricColumns: ['Margin'],
                preferredMetricTerms: ['Revenue', 'Margin'],
                qualityHintsSummary: 'Avoid low-quality dimensions and risky metrics.',
            },
        );

        // Quality-governed topics are sorted to the end, not removed.
        // 'Revenue by Customer' is not deprioritized, so it comes first.
        expect(ranked[0]).toBe('Revenue by Customer');
        expect(ranked).toHaveLength(3);
        expect(ranked).toContain('Revenue by Region');
        expect(ranked).toContain('Margin by Customer');
    });

    it('keeps the order the topic AI gave and applies no word-based scoring', () => {
        const topics = [
            'Sum Quantity by UOM',
            'Monthly Sales Amount Base trend by SO Received Date',
            'Total Sales Amount Base by Customer',
        ];
        const ranked = rankAnalysisTopics(topics, {
            title: 'Sales Order Daily Report',
            dimensionColumns: ['Customer', 'UOM', 'SO Received Date'],
            metricColumns: ['Quantity', 'Sales Amount Base'],
            preferredGrainColumns: ['Customer'],
            preferredTimeColumns: ['SO Received Date'],
            businessGrains: ['Customer'],
            avoidGrainColumns: [],
            preferredMetricTerms: ['Sales Amount Base'],
        });

        expect(ranked).toEqual(topics);
    });
});

describe('resolveAnalysisTopicRange', () => {
    it('narrows topic count for low-confidence steering', () => {
        expect(resolveAnalysisTopicRange({
            title: 'Low confidence',
            dimensionColumns: ['Region', 'Customer', 'Project'],
            metricColumns: ['Revenue'],
            preferredGrainColumns: ['Region'],
            avoidGrainColumns: [],
            preferredMetricTerms: ['Revenue'],
            analysisSteering: {
                preferGroupBy: ['Region'],
                blockGroupBy: [],
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: null,
                detailRowValue: null,
                reportShapeClass: 'detail_table',
                detailRowPolicy: 'preserve_all_rows',
                hierarchyMode: 'none',
                widePivotMode: 'none',
                signalSources: ['investigation_harness'],
                signalConfidence: 'low',
            },
        })).toEqual([1, 3]);
    });

    it('keeps hierarchical reports conservative even with many dimensions', () => {
        expect(resolveAnalysisTopicRange({
            title: 'Hierarchy',
            dimensionColumns: ['Description', 'Parent', 'Project', 'Account'],
            metricColumns: ['Value'],
            preferredGrainColumns: ['Description'],
            avoidGrainColumns: [],
            preferredMetricTerms: ['Value'],
            analysisSteering: {
                preferGroupBy: ['Description'],
                blockGroupBy: [],
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: ['Revenue'],
                duplicateDescriptions: [],
                detailRowColumn: 'RowClass',
                detailRowValue: 'fact',
                reportShapeClass: 'hierarchical_statement',
                detailRowPolicy: 'exclude_non_detail_rows',
                hierarchyMode: 'preserve',
                widePivotMode: 'annotation_fallback',
                signalSources: ['investigation_harness'],
                signalConfidence: 'medium',
            },
        })).toEqual([2, 4]);
    });
});
