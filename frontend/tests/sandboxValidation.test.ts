import { describe, expect, it } from 'vitest';
import type { SandboxTransformationOutput, SandboxTransformationProposal } from '../types';
import { validateSandboxOutput } from '../services/sandbox/sandboxValidation';

const proposal: SandboxTransformationProposal = {
    language: 'javascript',
    explanation: 'Copy rows safely.',
    code: 'function transform(rows, context) { return {}; }',
    primaryTableId: 'fact',
    tables: [{ tableId: 'fact', name: 'Fact', role: 'fact' }],
    preserveRowCount: true,
    maxRowDropRatio: 0,
    preserveNumericColumns: ['amount'],
};

const output = (): SandboxTransformationOutput => ({
    tables: [{ tableId: 'fact', name: 'Fact', role: 'fact', rows: [{ id: 'a', amount: 10 }, { id: 'b', amount: 20 }] }],
    lineage: [
        { outputTableId: 'fact', outputRowIndex: 0, inputTableId: 'input', inputRowIndexes: [0] },
        { outputTableId: 'fact', outputRowIndex: 1, inputTableId: 'input', inputRowIndexes: [1] },
    ],
    relationships: [],
});

describe('sandbox output validation', () => {
    it('trusts a complete row-lineage and numeric reconciliation result', () => {
        const result = validateSandboxOutput({
            inputTableId: 'input',
            inputRows: [{ id: 'a', amount: 10 }, { id: 'b', amount: 20 }],
            proposal,
            output: output(),
            maxOutputBytes: 100_000,
        });
        expect(result.decision).toBe('trusted');
        expect(result.preservedNumericTotals.amount.after).toBe(30);
    });

    it('blocks missing lineage and numeric amplification', () => {
        const invalid = output();
        invalid.lineage.pop();
        invalid.tables[0].rows[0].amount = 1000;
        const result = validateSandboxOutput({
            inputTableId: 'input',
            inputRows: [{ id: 'a', amount: 10 }, { id: 'b', amount: 20 }],
            proposal,
            output: invalid,
            maxOutputBytes: 100_000,
        });
        expect(result.decision).toBe('blocked');
        expect(result.reasonCodes).toEqual(expect.arrayContaining([
            'sandbox_row_lineage_missing',
            'sandbox_numeric_reconciliation_failed',
        ]));
    });

    it('caveats row removal within the declared tolerance and blocks excess loss', () => {
        const dropped = output();
        dropped.tables[0].rows.pop();
        dropped.lineage.pop();
        const caveatedProposal = { ...proposal, preserveRowCount: false, maxRowDropRatio: 0.5, preserveNumericColumns: [] };
        const caveated = validateSandboxOutput({
            inputTableId: 'input',
            inputRows: [{ id: 'a' }, { id: 'b' }],
            proposal: caveatedProposal,
            output: dropped,
            maxOutputBytes: 100_000,
        });
        expect(caveated.decision).toBe('needs_confirmation');

        const blocked = validateSandboxOutput({
            inputTableId: 'input',
            inputRows: [{ id: 'a' }, { id: 'b' }],
            proposal: { ...caveatedProposal, maxRowDropRatio: 0.1 },
            output: dropped,
            maxOutputBytes: 100_000,
        });
        expect(blocked.reasonCodes).toContain('sandbox_row_drop_limit_exceeded');
    });

    it('verifies derived-field formula, unit contract, nulls, and zero denominators before commit', () => {
        const derivedProposal: SandboxTransformationProposal = {
            ...proposal,
            preserveNumericColumns: [],
            derivedFields: [{
                tableId: 'fact',
                fieldName: 'marginRate',
                operation: 'ratio',
                inputColumns: ['profit', 'revenue'],
                unit: 'ratio_0_1',
                grain: 'one sales row',
                allowNull: true,
                zeroDenominator: 'null',
            }],
        };
        const validOutput: SandboxTransformationOutput = {
            tables: [{
                tableId: 'fact',
                name: 'Fact',
                role: 'fact',
                rows: [
                    { id: 'a', profit: 20, revenue: 100, marginRate: 0.2 },
                    { id: 'b', profit: 10, revenue: 0, marginRate: null },
                ],
            }],
            lineage: [
                { outputTableId: 'fact', outputRowIndex: 0, inputTableId: 'input', inputRowIndexes: [0] },
                { outputTableId: 'fact', outputRowIndex: 1, inputTableId: 'input', inputRowIndexes: [1] },
            ],
            relationships: [],
        };
        const inputRows = [
            { id: 'a', profit: 20, revenue: 100 },
            { id: 'b', profit: 10, revenue: 0 },
        ];

        expect(validateSandboxOutput({
            inputTableId: 'input',
            inputRows,
            proposal: derivedProposal,
            output: validOutput,
            maxOutputBytes: 100_000,
        }).decision).toBe('trusted');

        validOutput.tables[0].rows[0].marginRate = 20;
        expect(validateSandboxOutput({
            inputTableId: 'input',
            inputRows,
            proposal: derivedProposal,
            output: validOutput,
            maxOutputBytes: 100_000,
        }).reasonCodes).toContain('sandbox_derived_field_formula_failed');
    });
});
