import { describe, expect, it } from 'vitest';
import type { AiCleaningProgram, ColumnProfile, CsvRow } from '../types';
import { executeAiCleaningProgram } from '../services/agent/execution/aiCleaningProgram';

const numericProfiles: ColumnProfile[] = [
    { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
    { name: 'Jan', type: 'currency', missingPercentage: 0, valueRange: [100, 200] },
    { name: 'Feb', type: 'currency', missingPercentage: 0, valueRange: [150, 300] },
];

describe('executeAiCleaningProgram', () => {
    it('keeps sums unchanged for lossless cast steps', () => {
        const rows: CsvRow[] = [
            { Project: 'A', Amount: '$100.00' },
            { Project: 'B', Amount: '$250.00' },
        ];
        const program: AiCleaningProgram = {
            programId: 'program-lossless',
            explanation: 'Cast the Amount column.',
            source: 'llm_generated',
            outputColumns: [
                { name: 'Project', type: 'categorical' },
                { name: 'Amount', type: 'currency' },
            ],
            steps: [
                {
                    id: 'step-cast',
                    mode: 'lossless',
                    reason: 'Cast currency text into numeric values.',
                    operations: [
                        {
                            id: 'cast_amount',
                            type: 'cast_column',
                            reason: 'Cast currency text into numeric values.',
                            column: 'Amount',
                            targetType: 'currency',
                        },
                    ],
                },
            ],
        };

        const result = executeAiCleaningProgram(rows, program, program.outputColumns);

        expect(result.numericReconciliation.passed).toBe(true);
        expect(result.numericReconciliation.failures).toEqual([]);
        expect(result.data[0].Amount).toBe(100);
        expect(result.data[1].Amount).toBe(250);
    });

    it('ignores structural metadata columns during lossless numeric reconciliation', () => {
        const rows: CsvRow[] = [
            { Project: 'A', Amount: '100', SourceRowIndex: 0, HierarchyDepth: 1 },
            { Project: 'B', Amount: '250', SourceRowIndex: 1, HierarchyDepth: 1 },
        ];
        const program: AiCleaningProgram = {
            programId: 'program-structural-lossless',
            explanation: 'Rewrite structural metadata while preserving business metrics.',
            source: 'llm_generated',
            outputColumns: [
                { name: 'Project', type: 'categorical' },
                { name: 'Amount', type: 'currency' },
                { name: 'SourceRowIndex', type: 'numerical' },
                { name: 'HierarchyDepth', type: 'numerical' },
            ],
            steps: [
                {
                    id: 'step-rewrite-structural',
                    mode: 'lossless',
                    reason: 'Rebuild structural metadata after report cleanup.',
                    operations: [
                        {
                            id: 'rewrite_row_index',
                            type: 'replace_values',
                            reason: 'Renumber structural coordinates after cleanup.',
                            column: 'SourceRowIndex',
                            replacements: [
                                { from: '0', to: '10' },
                                { from: '1', to: '11' },
                            ],
                        },
                        {
                            id: 'rewrite_depth',
                            type: 'replace_values',
                            reason: 'Normalize hierarchy metadata labels.',
                            column: 'HierarchyDepth',
                            replacements: [{ from: '1', to: '2' }],
                        },
                    ],
                },
            ],
        };

        const result = executeAiCleaningProgram(rows, program, program.outputColumns);

        expect(result.numericReconciliation.passed).toBe(true);
        expect(result.numericReconciliation.failures).toEqual([]);
        expect(result.data[0].SourceRowIndex).toBe('10');
        expect(result.data[1].HierarchyDepth).toBe('2');
    });

    it('preserves per-source totals for unpivot reshape steps', () => {
        const rows: CsvRow[] = [
            { Project: 'A', Jan: '100', Feb: '150' },
            { Project: 'B', Jan: '200', Feb: '300' },
        ];
        const program: AiCleaningProgram = {
            programId: 'program-reshape',
            explanation: 'Unpivot monthly columns.',
            source: 'llm_generated',
            outputColumns: [
                { name: 'Project', type: 'categorical' },
                { name: 'Period', type: 'categorical' },
                { name: 'SourceColumnName', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ],
            steps: [
                {
                    id: 'step-unpivot',
                    mode: 'reshape',
                    reason: 'Move month columns into a long table.',
                    operations: [
                        {
                            id: 'unpivot_months',
                            type: 'unpivot_columns',
                            reason: 'Move month columns into a long table.',
                            sourceColumns: ['Jan', 'Feb'],
                            keyColumn: 'Period',
                            valueColumn: 'Value',
                            keepColumns: ['Project'],
                            sourceColumnNameColumn: 'SourceColumnName',
                        },
                    ],
                },
            ],
        };

        const result = executeAiCleaningProgram(rows, program, numericProfiles);

        expect(result.numericReconciliation.passed).toBe(true);
        expect(result.numericReconciliation.failures).toEqual([]);
        expect(result.data).toHaveLength(4);
    });

    it('records destructive impact instead of silently discarding numeric deltas', () => {
        const rows: CsvRow[] = [
            { Project: 'A', Amount: '100' },
            { Project: 'B', Amount: '250' },
        ];
        const program: AiCleaningProgram = {
            programId: 'program-destructive',
            explanation: 'Filter one row.',
            source: 'llm_generated',
            outputColumns: [
                { name: 'Project', type: 'categorical' },
                { name: 'Amount', type: 'currency' },
            ],
            steps: [
                {
                    id: 'step-filter',
                    mode: 'destructive',
                    reason: 'Keep only project A.',
                    operations: [
                        {
                            id: 'filter_a',
                            type: 'filter_rows',
                            reason: 'Keep only project A.',
                            predicates: [{ column: 'Project', operator: 'eq', value: 'A' }],
                        },
                    ],
                },
            ],
        };

        const result = executeAiCleaningProgram(rows, program, program.outputColumns);

        expect(result.numericReconciliation.passed).toBe(true);
        expect(result.numericReconciliation.destructiveImpacts).toHaveLength(1);
        expect(result.numericReconciliation.destructiveImpacts[0].rowsRemoved).toBe(1);
        expect(result.numericReconciliation.destructiveImpacts[0].affectedColumns[0].sumDelta).toBe(-250);
    });

    it('fails reconciliation when a lossless step changes numeric values', () => {
        const rows: CsvRow[] = [
            { Project: 'A', Amount: '100' },
            { Project: 'B', Amount: '250' },
        ];
        const program: AiCleaningProgram = {
            programId: 'program-invalid-lossless',
            explanation: 'Incorrectly replace one amount.',
            source: 'llm_generated',
            outputColumns: [
                { name: 'Project', type: 'categorical' },
                { name: 'Amount', type: 'currency' },
            ],
            steps: [
                {
                    id: 'step-replace',
                    mode: 'lossless',
                    reason: 'Replace a numeric value even though this should be lossless.',
                    operations: [
                        {
                            id: 'replace_amount',
                            type: 'replace_values',
                            reason: 'Replace a numeric value even though this should be lossless.',
                            column: 'Amount',
                            replacements: [{ from: '100', to: '999' }],
                        },
                    ],
                },
            ],
        };

        const result = executeAiCleaningProgram(rows, program, program.outputColumns);

        expect(result.numericReconciliation.passed).toBe(false);
        expect(result.numericReconciliation.failures[0]?.reason).toBe('numeric_mismatch');
    });

    it('skips unnamed numeric-looking columns during strict lossless reconciliation', () => {
        const rows: CsvRow[] = [
            { Campaign: 'A', _unnamed_column_2: '100', Spend: '100' },
            { Campaign: 'B', _unnamed_column_2: '250', Spend: '250' },
        ];
        const program: AiCleaningProgram = {
            programId: 'program-unnamed-lossless',
            explanation: 'Normalize an unnamed helper column while preserving spend.',
            source: 'llm_generated',
            outputColumns: [
                { name: 'Campaign', type: 'categorical' },
                { name: '_unnamed_column_2', type: 'numerical' },
                { name: 'Spend', type: 'currency' },
            ],
            steps: [
                {
                    id: 'step-unnamed-rewrite',
                    mode: 'lossless',
                    reason: 'Rewrite the unnamed helper column.',
                    operations: [
                        {
                            id: 'replace_unnamed',
                            type: 'replace_values',
                            reason: 'Rewrite the unnamed helper column.',
                            column: '_unnamed_column_2',
                            replacements: [{ from: '100', to: '999' }],
                        },
                    ],
                },
            ],
        };

        const result = executeAiCleaningProgram(rows, program, program.outputColumns);

        expect(result.numericReconciliation.passed).toBe(true);
        expect(result.numericReconciliation.failures).toEqual([]);
    });
});
