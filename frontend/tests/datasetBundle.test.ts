import { describe, expect, it } from 'vitest';
import type { CsvRow, DatasetTable, TransformationProgram } from '../types';
import {
    assessDatasetRelationship,
    canExecuteDatasetRelationship,
    commitVerifiedPrimaryTableTransformation,
    createMultiTableDatasetBundle,
    createSingleTableDatasetBundle,
    validateDatasetBundle,
    validateTransformationProgram,
    verifyDatasetBundleSource,
} from '../services/data/datasetBundle';

const makeTable = (tableId: string, rows: CsvRow[]): DatasetTable => ({
    tableId,
    bundleId: 'bundle-test',
    name: tableId,
    role: tableId === 'fact' ? 'fact' : 'dimension',
    schema: Object.keys(rows[0] ?? {}).map(name => ({ name, dataType: 'string', nullable: false })),
    rowCount: rows.length,
    storage: { mode: 'memory', ephemeral: false },
    sourceRange: null,
    datasetVersion: 'version-test',
});

describe('DatasetBundle', () => {
    it('creates a metadata-only primary table and preserves backing row count', () => {
        const bundle = createSingleTableDatasetBundle({
            datasetId: 'dataset-file-1',
            sourceFingerprint: 'file-1',
            file: { name: 'large.csv', size: 90_000_000, lastModified: 123 },
            data: {
                fileName: 'large.csv',
                data: [{ id: 1, amount: 10 }],
                backing: {
                    mode: 'duckdb_file',
                    loadVersion: 'load-1',
                    datasetVersion: 'version-1',
                    rowCount: 1_000_000,
                    sampleRowCount: 1,
                    byteSize: 90_000_000,
                    readOnly: true,
                    ephemeral: true,
                    opfsPath: 'csv-analysis-agent-temp/session/large.csv',
                },
            },
            now: '2026-07-27T00:00:00.000Z',
        });

        expect(bundle.tables).toHaveLength(1);
        expect(bundle.tables[0]).toMatchObject({
            rowCount: 1_000_000,
            storage: {
                mode: 'duckdb',
                opfsPath: 'csv-analysis-agent-temp/session/large.csv',
            },
        });
        expect('data' in bundle.tables[0]).toBe(false);
        expect(validateDatasetBundle(bundle)).toEqual([]);
    });

    it('represents verified fact and dimension boundaries without retaining rows', () => {
        const bundle = createMultiTableDatasetBundle({
            datasetId: 'dataset-1',
            sourceFingerprint: 'fingerprint-1',
            file: { name: 'combined.csv', size: 500, lastModified: 123 },
            tables: [
                {
                    name: 'Sales',
                    role: 'fact',
                    data: { fileName: 'sales.csv', data: [{ customerId: 'A', amount: 10 }] },
                    sourceRange: { startRow: 2, endRow: 20, headerRowIndexes: [1] },
                },
                {
                    name: 'Customers',
                    role: 'dimension',
                    data: { fileName: 'customers.csv', data: [{ customerId: 'A', name: 'Alpha' }] },
                    sourceRange: { startRow: 23, endRow: 30, headerRowIndexes: [22] },
                },
            ],
            primaryTableIndex: 0,
            structureResolution: {
                status: 'needs_confirmation',
                reasonCodes: ['multiple_table_boundaries_detected'],
                recoveryGuidance: ['Confirm the proposed table boundaries.'],
            },
        });

        expect(bundle.tables.map(table => table.role)).toEqual(['fact', 'dimension']);
        expect(bundle.structureResolution.status).toBe('needs_confirmation');
        expect(bundle.tables.every(table => !('data' in table))).toBe(true);
        expect(validateDatasetBundle(bundle)).toEqual([]);
    });

    it('trusts a complete many-to-one relationship without row amplification', () => {
        const factRows = [
            { customerId: 'A', amount: 10 },
            { customerId: 'A', amount: 20 },
            { customerId: 'B', amount: 30 },
        ];
        const dimensionRows = [
            { customerId: 'A', segment: 'Enterprise' },
            { customerId: 'B', segment: 'SMB' },
        ];
        const relationship = assessDatasetRelationship({
            fromTable: makeTable('fact', factRows),
            toTable: makeTable('customer', dimensionRows),
            fromRows: factRows,
            toRows: dimensionRows,
            fromKeys: ['customerId'],
            toKeys: ['customerId'],
        }, '2026-07-27T00:00:00.000Z');

        expect(relationship).toMatchObject({
            cardinality: 'many_to_one',
            foreignKeyCoverage: 1,
            duplicateAmplification: 1,
            decision: 'trusted',
            reasonCodes: ['relationship_safe'],
        });
        expect(canExecuteDatasetRelationship(relationship)).toBe(true);
    });

    it('requires confirmation for partial key coverage', () => {
        const factRows = [{ id: 'A' }, { id: 'B' }];
        const dimensionRows = [{ id: 'A' }];
        const relationship = assessDatasetRelationship({
            fromTable: makeTable('fact', factRows),
            toTable: makeTable('dimension', dimensionRows),
            fromRows: factRows,
            toRows: dimensionRows,
            fromKeys: ['id'],
            toKeys: ['id'],
        });

        expect(relationship.decision).toBe('needs_confirmation');
        expect(relationship.foreignKeyCoverage).toBe(0.5);
        expect(canExecuteDatasetRelationship(relationship)).toBe(false);
    });

    it('blocks many-to-many relationships and duplicate amplification', () => {
        const left = [{ id: 'A' }, { id: 'A' }];
        const right = [{ id: 'A' }, { id: 'A' }];
        const relationship = assessDatasetRelationship({
            fromTable: makeTable('left', left),
            toTable: makeTable('right', right),
            fromRows: left,
            toRows: right,
            fromKeys: ['id'],
            toKeys: ['id'],
        });

        expect(relationship.decision).toBe('blocked');
        expect(relationship.cardinality).toBe('many_to_many');
        expect(relationship.duplicateAmplification).toBe(2);
        expect(relationship.reasonCodes).toContain('relationship_many_to_many');
    });

    it('rejects invalid or non-idempotent transformation programs', () => {
        const program: TransformationProgram = {
            programId: 'program-1',
            bundleId: 'bundle-1',
            inputVersion: 'version-1',
            outputVersion: 'version-2',
            idempotencyKey: 'program-key',
            status: 'proposed',
            createdAt: '2026-07-27T00:00:00.000Z',
            steps: [
                {
                    stepId: 'step-1',
                    kind: 'declarative',
                    inputTableIds: ['input'],
                    outputTableIds: ['output'],
                    idempotencyKey: 'same-key',
                },
                {
                    stepId: 'step-1',
                    kind: 'sandbox_python',
                    inputTableIds: ['output'],
                    outputTableIds: [],
                    idempotencyKey: 'same-key',
                },
            ],
        };

        expect(validateTransformationProgram(program)).toEqual(expect.arrayContaining([
            'step_id_invalid',
            'step_idempotency_key_invalid',
            'step_table_binding_missing',
            'declarative_operation_missing',
            'sandbox_code_reference_missing',
        ]));
    });

    it('commits a verified transformation idempotently without changing source metadata', () => {
        const sourceData = { fileName: 'sales.csv', data: [{ amount: '10' }] };
        const bundle = createSingleTableDatasetBundle({
            datasetId: 'dataset-1',
            sourceFingerprint: 'source-fingerprint',
            file: { name: 'sales.csv', size: 10, lastModified: 123 },
            data: sourceData,
            now: '2026-07-27T00:00:00.000Z',
        });
        const input = {
            bundle,
            data: { fileName: 'sales.csv', data: [{ amount: 10 }] },
            operations: [{ id: 'cast-amount', type: 'cast_column' as const, reason: 'Numeric measure', column: 'amount', targetType: 'number' as const }],
            runId: 'run-1',
            now: '2026-07-27T00:01:00.000Z',
        };
        const once = commitVerifiedPrimaryTableTransformation(input)!;
        const twice = commitVerifiedPrimaryTableTransformation({ ...input, bundle: once })!;

        expect(once.source).toEqual(bundle.source);
        expect(once.datasetVersion).not.toBe(bundle.datasetVersion);
        expect(once.transformationPrograms).toHaveLength(1);
        expect(twice.transformationPrograms).toHaveLength(1);
        expect(twice.tables[0].schema[0].dataType).toBe('number');
    });

    it('requires the original source fingerprint before replay', async () => {
        const rows = [{ id: 1, amount: 10 }];
        const file = new File(['id,amount\n1,10'], 'sales.csv', { lastModified: 123 });
        const bundle = createSingleTableDatasetBundle({
            datasetId: 'dataset-1',
            sourceFingerprint: '6df59b7063cc7f0b',
            file,
            data: { fileName: 'sales.csv', data: rows },
        });
        bundle.source.fingerprint = (await import('../utils/datasetId'))
            .buildDatasetFingerprint(file.name, rows);

        await expect(verifyDatasetBundleSource({
            bundle,
            file,
            parsedData: { fileName: file.name, data: rows },
        })).resolves.toMatchObject({ matches: true, reasonCode: 'source_verified' });
        await expect(verifyDatasetBundleSource({
            bundle,
            file: new File(['id,amount\n2,20'], 'sales.csv', { lastModified: 123 }),
            parsedData: { fileName: 'sales.csv', data: [{ id: 2, amount: 20 }] },
        })).resolves.toMatchObject({ matches: false });
    });
});
