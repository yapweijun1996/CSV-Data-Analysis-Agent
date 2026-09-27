import { beforeEach, describe, expect, it } from 'vitest';
import { createSingleTableDatasetBundle } from '../services/data/datasetBundle';
import { commitVerifiedSandboxTransformation } from '../services/data/sandboxDatasetCommit';
import { clearSandboxTableRows, getSandboxTableRows } from '../services/data/sandboxTableRegistry';
import type { SandboxTransformationOutcome, SandboxTransformationProposal } from '../types';

const makeFixture = () => {
    const sourceData = {
        fileName: 'sales.csv',
        data: [
            { customerId: 'A', amount: '10' },
            { customerId: 'B', amount: '20' },
        ],
    };
    const bundle = createSingleTableDatasetBundle({
        datasetId: 'dataset-1',
        sourceFingerprint: 'source-1',
        file: { name: 'sales.csv', size: 100, lastModified: 123 },
        data: sourceData,
        now: '2026-07-27T00:00:00.000Z',
    });
    const proposal: SandboxTransformationProposal = {
        language: 'javascript',
        explanation: 'Split the customer lookup from the sales rows.',
        code: 'function transform(rows) { return rows; }',
        primaryTableId: 'sales',
        tables: [
            { tableId: 'sales', name: 'Sales', role: 'fact' },
            { tableId: 'customers', name: 'Customers', role: 'dimension', mergeKeys: ['customerId'] },
        ],
        preserveRowCount: true,
        maxRowDropRatio: 0,
        preserveNumericColumns: ['amount'],
    };
    const outcome: SandboxTransformationOutcome = {
        status: 'completed',
        runId: 'run-1',
        attempt: 2,
        language: 'javascript',
        codeRef: 'sandbox-javascript-test',
        durationMs: 12,
        output: {
            tables: [
                {
                    tableId: 'sales',
                    name: 'Sales',
                    role: 'fact',
                    rows: [
                        { customerId: 'A', amount: 10 },
                        { customerId: 'B', amount: 20 },
                    ],
                },
                {
                    tableId: 'customers',
                    name: 'Customers',
                    role: 'dimension',
                    mergeKeys: ['customerId'],
                    rows: [
                        { customerId: 'A', segment: 'Enterprise' },
                        { customerId: 'B', segment: 'SMB' },
                    ],
                },
            ],
            lineage: [
                { outputTableId: 'sales', outputRowIndex: 0, inputTableId: bundle.primaryTableId, inputRowIndexes: [0] },
                { outputTableId: 'sales', outputRowIndex: 1, inputTableId: bundle.primaryTableId, inputRowIndexes: [1] },
                { outputTableId: 'customers', outputRowIndex: 0, inputTableId: bundle.primaryTableId, inputRowIndexes: [0] },
                { outputTableId: 'customers', outputRowIndex: 1, inputTableId: bundle.primaryTableId, inputRowIndexes: [1] },
            ],
            relationships: [{
                relationshipId: 'sales-customers',
                fromTableId: 'sales',
                toTableId: 'customers',
                fromKeys: ['customerId'],
                toKeys: ['customerId'],
                expectedCardinality: 'many_to_one',
            }],
        },
        validation: {
            decision: 'trusted',
            reasonCodes: [],
            warnings: [],
            inputRowCount: 2,
            outputRowCount: 4,
            outputBytes: 100,
            preservedNumericTotals: { amount: { before: 30, after: 30, relativeDelta: 0 } },
        },
        error: null,
    };
    return { bundle, proposal, outcome };
};

describe('sandbox dataset commit', () => {
    beforeEach(() => clearSandboxTableRows());

    it('commits only verified tables and stores the normalized primary table rows', () => {
        const { bundle, proposal, outcome } = makeFixture();
        const preparedData = {
            fileName: 'sales.csv',
            data: [
                { customerId: 'A', amount: 10, normalized: true },
                { customerId: 'B', amount: 20, normalized: true },
            ],
        };
        const committed = commitVerifiedSandboxTransformation({
            bundle,
            preparedData,
            proposal,
            outcome,
            runId: 'run-1',
            now: '2026-07-27T00:01:00.000Z',
        })!;

        expect(committed).not.toBe(bundle);
        expect(committed.primaryTableId).toBe('sales');
        expect(committed.relationships[0]).toMatchObject({
            cardinality: 'one_to_one',
            decision: 'trusted',
        });
        expect(committed.transformationPrograms).toHaveLength(1);
        expect(committed.transformationPrograms[0].steps[0]).toMatchObject({
            kind: 'sandbox_js',
            sandboxCodeRef: 'sandbox-javascript-test',
        });
        expect(committed.tables.find(table => table.tableId === 'sales')?.schema)
            .toEqual(expect.arrayContaining([expect.objectContaining({ name: 'normalized', dataType: 'boolean' })]));
        expect(getSandboxTableRows(bundle.bundleId, 'sales')).toEqual(preparedData.data);
    });

    it('does not commit a sandbox relationship that would amplify rows', () => {
        const { bundle, proposal, outcome } = makeFixture();
        outcome.output!.tables[1].rows.push({ customerId: 'A', segment: 'Duplicate' });

        const committed = commitVerifiedSandboxTransformation({
            bundle,
            preparedData: { fileName: 'sales.csv', data: outcome.output!.tables[0].rows },
            proposal,
            outcome,
            runId: 'run-1',
        });

        expect(committed).toBe(bundle);
        expect(getSandboxTableRows(bundle.bundleId, 'sales')).toBeNull();
    });
});
