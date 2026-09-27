import { describe, expect, it } from 'vitest';
import { resolveSuggestedPivotsForDataset } from '../services/agent/runtime/analysisSessionHelpers';
import type { CsvData } from '../types';

const findings = {
    runtimeDirectives: {
        suggestedPivots: [{
            rowDimension: 'town',
            columnDimension: 'flat_type',
            metric: 'resale_price',
            aggregate: 'sum' as const,
            crossProductSize: 100,
            confidence: 'high' as const,
            rowCardinality: 25,
            columnCardinality: 7,
        }],
    },
};

describe('resolveSuggestedPivotsForDataset', () => {
    it('suppresses sample-backed pivot suggestions for a full read-only dataset', () => {
        const data = {
            fileName: 'large.csv',
            headers: ['town', 'flat_type', 'resale_price'],
            data: [{ town: 'A', flat_type: '4 ROOM', resale_price: 500_000 }],
            backing: {
                mode: 'duckdb_file',
                loadVersion: 'load-large',
                datasetVersion: 'dataset-large',
                readOnly: true,
                rowCount: 982_589,
                sampleRowCount: 2_000,
                byteSize: 79_000_000,
                ephemeral: true,
            },
        } as CsvData;

        expect(resolveSuggestedPivotsForDataset(data, findings as never)).toEqual([]);
    });

    it('keeps pivot suggestions when the in-memory dataset is complete', () => {
        const data = {
            fileName: 'small.csv',
            headers: ['town', 'flat_type', 'resale_price'],
            data: [{ town: 'A', flat_type: '4 ROOM', resale_price: 500_000 }],
        } as CsvData;

        expect(resolveSuggestedPivotsForDataset(data, findings as never)).toEqual(
            findings.runtimeDirectives.suggestedPivots,
        );
    });
});
