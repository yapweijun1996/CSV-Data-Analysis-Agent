import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FinalSummary } from '../components/FinalSummary';

afterEach(cleanup);

const summary = {
    language: 'English' as const,
    text: 'Revenue increased in the current dataset.',
};

const currentDataset = {
    canonicalCsvData: null,
    csvData: {
        fileName: 'sales.csv',
        data: [{ Revenue: 1200 }],
    },
};

describe('FinalSummary provenance', () => {
    it('labels legacy narrative artifacts unverified', () => {
        render(
            <FinalSummary
                title="Overall Insights"
                summary={summary}
                language="English"
                currentDataset={currentDataset}
            />,
        );

        expect(screen.getByText('Unverified evidence')).toBeInTheDocument();
    });

    it('labels a narrative stale when its dataset version differs', () => {
        render(
            <FinalSummary
                title="Overall Insights"
                summary={summary}
                language="English"
                currentDataset={currentDataset}
                provenance={{
                    schemaVersion: 1,
                    datasetId: 'dataset-sales',
                    datasetVersion: 'version-old',
                    evidenceStatus: 'verified',
                    evidenceReasons: [],
                    method: {
                        operation: 'narrative_summary',
                        groupByColumns: [],
                        aggregations: [],
                        sourceColumns: ['Revenue'],
                        filterCount: 0,
                        pivotRows: [],
                        pivotColumns: [],
                    },
                    queryEvidence: null,
                    evidenceRefs: [],
                    createdAt: '2026-07-25T00:00:00.000Z',
                }}
            />,
        );

        expect(screen.getByText('Stale evidence')).toBeInTheDocument();
    });
});
