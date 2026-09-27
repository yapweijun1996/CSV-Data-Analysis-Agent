import { describe, expect, it } from 'vitest';
import { applyPreparedLabelNormalization } from '../services/agent/execution/labelNormalization';
import type { ColumnProfile, CsvData } from '../types';

const columnProfiles: ColumnProfile[] = [
    { name: 'Project', type: 'categorical' },
    { name: 'Amount', type: 'numerical' },
];

const createData = (rows: Array<Record<string, string | number>>): CsvData => ({
    fileName: 'projects.csv',
    data: rows,
    metadataRows: [],
    summaryRows: [],
    headerDepth: 1,
});

describe('applyPreparedLabelNormalization', () => {
    it('auto-merges high-confidence label variants into replace_values operations', () => {
        const result = applyPreparedLabelNormalization(
            createData([
                { Project: ' BDB LAB DESIGN ', Amount: 10 },
                { Project: 'BDB LAB DESIGN', Amount: 20 },
                { Project: 'bdb lab design', Amount: 30 },
                { Project: 'SOITEC A&A @ PASIR RIS', Amount: 40 },
            ]),
            columnProfiles,
        );

        expect(result.operations).toHaveLength(1);
        expect(result.operations[0]).toMatchObject({
            type: 'replace_values',
            column: 'Project',
            replacements: [
                { from: ' BDB LAB DESIGN ', to: 'BDB LAB DESIGN' },
                { from: 'bdb lab design', to: 'BDB LAB DESIGN' },
            ],
        });
        expect(result.data.data.map(row => row.Project)).toEqual([
            'BDB LAB DESIGN',
            'BDB LAB DESIGN',
            'BDB LAB DESIGN',
            'SOITEC A&A @ PASIR RIS',
        ]);
        expect(result.metadata).toMatchObject({
            appliedColumns: ['Project'],
            appliedReplacementCount: 2,
        });
        expect(result.metadata?.appliedClusters).toEqual([
            {
                column: 'Project',
                canonicalValue: 'BDB LAB DESIGN',
                replacedValues: [' BDB LAB DESIGN ', 'bdb lab design'],
                rowCount: 2,
            },
        ]);
    });

    it('does not auto-merge lower-confidence label suggestions that only match after stripping separators', () => {
        const result = applyPreparedLabelNormalization(
            createData([
                { Project: 'AMAT @ TIC', Amount: 10 },
                { Project: 'AMAT TIC', Amount: 20 },
                { Project: 'SOITEC A&A', Amount: 30 },
            ]),
            columnProfiles,
        );

        expect(result.operations).toEqual([]);
        expect(result.data.data.map(row => row.Project)).toEqual([
            'AMAT @ TIC',
            'AMAT TIC',
            'SOITEC A&A',
        ]);
        expect(result.metadata?.deferredSuggestions).toEqual([
            {
                column: 'Project',
                suggestedCanonicalValue: 'AMAT @ TIC',
                candidateValues: ['AMAT @ TIC', 'AMAT TIC'],
                reason: 'Similar after removing punctuation and spacing, but not safe enough for automatic merge.',
            },
        ]);
    });

    it('picks the canonical display value by frequency, then longer value, then first occurrence', () => {
        const frequencyWinner = applyPreparedLabelNormalization(
            createData([
                { Project: 'YUSEN', Amount: 10 },
                { Project: 'yusen', Amount: 20 },
                { Project: 'YUSEN', Amount: 30 },
            ]),
            columnProfiles,
        );
        expect(frequencyWinner.metadata?.appliedClusters[0]?.canonicalValue).toBe('YUSEN');

        const longerWinner = applyPreparedLabelNormalization(
            createData([
                { Project: 'Takeda', Amount: 10 },
                { Project: 'TAKEDA.', Amount: 20 },
            ]),
            columnProfiles,
        );
        expect(longerWinner.metadata?.appliedClusters[0]?.canonicalValue).toBe('TAKEDA.');

        const firstSeenWinner = applyPreparedLabelNormalization(
            createData([
                { Project: 'Lonza', Amount: 10 },
                { Project: 'LONZA', Amount: 20 },
            ]),
            columnProfiles,
        );
        expect(firstSeenWinner.metadata?.appliedClusters[0]?.canonicalValue).toBe('Lonza');
    });
});
