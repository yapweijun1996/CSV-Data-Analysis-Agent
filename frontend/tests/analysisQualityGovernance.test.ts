// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { ColumnProfile, CsvData } from '../types';
import type { AnalysisDatasetContext } from '../services/prompts/analysisPrompts';
import { analyzeDatasetQualityGovernance } from '../services/agent/analysisQualityGovernance';

describe('analysisQualityGovernance', () => {
    const data: CsvData = {
        fileName: 'quality.csv',
        data: [
            { Region: 'Unknown', Product: 'A', Revenue: '1,200.00', SparseDim: '' },
            { Region: 'Unknown', Product: 'B', Revenue: '900.00', SparseDim: '' },
            { Region: 'East', Product: 'C', Revenue: '850.00', SparseDim: '' },
            { Region: 'West', Product: 'D', Revenue: '730.00', SparseDim: '' },
        ],
    };

    const columns: ColumnProfile[] = [
        { name: 'Region', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
        { name: 'Product', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
        { name: 'SparseDim', type: 'categorical', uniqueValues: 1, missingPercentage: 100 },
        { name: 'Revenue', type: 'currency', missingPercentage: 0, hasFormattedNumbers: true, valueRange: [730, 1200] },
    ];

    const context: AnalysisDatasetContext = {
        title: 'Quality Dataset',
        dimensionColumns: ['Region', 'Product', 'SparseDim'],
        metricColumns: ['Revenue'],
        preferredGrainColumns: ['Product'],
        avoidGrainColumns: [],
        blockedDimensions: [],
    };

    it('blocks and avoids dimensions from generic quality signals', () => {
        const result = analyzeDatasetQualityGovernance(columns, data, context);

        expect(result.blockedDimensions).toContain('SparseDim');
        expect(result.avoidDimensions).toContain('Region');
        expect(result.qualityHintsSummary).toContain('Block these groupBy dimensions');
        expect(result.qualityHintsSummary).toContain('Avoid low-quality dimensions');
    });

    it('deprioritizes risky metrics and emits dataset-level signals', () => {
        const result = analyzeDatasetQualityGovernance(columns, data, context, {
            rowExpansionRatio: 8,
            totalCardCount: 2,
            trustedCardCount: 0,
        });

        // hasFormattedNumbers alone no longer triggers avoid — DuckDB handles
        // formatted numbers via TRY_CAST + REPLACE. Only when combined with
        // high missing rate should it trigger avoid.
        expect(result.avoidMetrics).not.toContain('Revenue');
        expect(result.datasetSignals).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'row_expansion_warning' }),
            expect.objectContaining({ code: 'high_unclassified_share' }),
            expect.objectContaining({ code: 'zero_trusted_cards' }),
        ]));
    });

    it('avoids zero-variance metrics', () => {
        const zeroColumns: ColumnProfile[] = [
            { name: 'Region', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
            { name: 'Sales', type: 'numerical', missingPercentage: 0, valueRange: [0, 0] },
            { name: 'YTD Sales', type: 'currency', missingPercentage: 0, hasFormattedNumbers: true, valueRange: [500, 10000] },
        ];
        const zeroContext: AnalysisDatasetContext = {
            title: 'Zero Variance Dataset',
            dimensionColumns: ['Region'],
            metricColumns: ['Sales', 'YTD Sales'],
            preferredGrainColumns: ['Region'],
            avoidGrainColumns: [],
            blockedDimensions: [],
        };
        const result = analyzeDatasetQualityGovernance(zeroColumns, data, zeroContext);
        expect(result.avoidMetrics).toContain('Sales');
        expect(result.avoidMetrics).not.toContain('YTD Sales');
    });
});
