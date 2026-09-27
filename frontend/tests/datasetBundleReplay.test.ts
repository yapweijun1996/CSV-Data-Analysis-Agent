import { describe, expect, it } from 'vitest';
import { createSingleTableDatasetBundle, commitVerifiedPrimaryTableTransformation } from '../services/data/datasetBundle';
import { replayDatasetBundlePrograms, replayVerifiedTransformationProgram } from '../services/data/datasetBundleReplay';

describe('dataset bundle transformation replay', () => {
    it('replays a committed declarative program without mutating original rows', () => {
        const source = { fileName: 'sales.csv', data: [{ amount: '10' }, { amount: '20' }] };
        const bundle = createSingleTableDatasetBundle({
            datasetId: 'dataset-1',
            sourceFingerprint: 'source-1',
            file: { name: 'sales.csv', size: 10, lastModified: 1 },
            data: source,
        });
        const operation = {
            id: 'cast-amount',
            type: 'cast_column' as const,
            reason: 'Numeric measure',
            column: 'amount',
            targetType: 'number' as const,
        };
        const committed = commitVerifiedPrimaryTableTransformation({
            bundle,
            data: { fileName: 'sales.csv', data: [{ amount: 10 }, { amount: 20 }] },
            operations: [operation],
            runId: 'run-1',
        })!;
        const outcome = replayVerifiedTransformationProgram({
            bundle: committed,
            program: committed.transformationPrograms[0],
            currentData: source,
        });

        expect(outcome.status).toBe('trusted');
        expect(outcome.data.data).toEqual([{ amount: 10 }, { amount: 20 }]);
        expect(source.data).toEqual([{ amount: '10' }, { amount: '20' }]);
        expect(outcome.committedTransformationIds).toHaveLength(1);
    });

    it('blocks output that does not reproduce the committed version', () => {
        const source = { fileName: 'sales.csv', data: [{ amount: '10' }] };
        const bundle = createSingleTableDatasetBundle({
            datasetId: 'dataset-1',
            sourceFingerprint: 'source-1',
            file: { name: 'sales.csv', size: 10, lastModified: 1 },
            data: source,
        });
        const program = {
            programId: 'program-1',
            bundleId: bundle.bundleId,
            inputVersion: bundle.datasetVersion,
            outputVersion: 'version-wrong',
            idempotencyKey: 'program-1',
            status: 'committed' as const,
            createdAt: new Date().toISOString(),
            steps: [{
                stepId: 'trim-1',
                kind: 'declarative' as const,
                operation: { id: 'trim-1', type: 'trim_whitespace' as const, reason: 'Trim', columns: '*' as const },
                inputTableIds: [bundle.primaryTableId],
                outputTableIds: [bundle.primaryTableId],
                idempotencyKey: 'trim-1',
            }],
        };

        const outcome = replayVerifiedTransformationProgram({ bundle, program, currentData: source });
        expect(outcome.status).toBe('blocked');
        expect(outcome.reasonCodes).toContain('transformation_output_version_mismatch');
        expect(outcome.data.data).toEqual(source.data);
    });

    it('falls back atomically to a fresh import when saved lineage is incompatible', () => {
        const source = { fileName: 'sales.csv', data: [{ amount: '10' }] };
        const bundle = createSingleTableDatasetBundle({
            datasetId: 'dataset-1',
            sourceFingerprint: 'source-1',
            file: { name: 'sales.csv', size: 10, lastModified: 1 },
            data: source,
        });
        bundle.transformationPrograms = [{
            programId: 'program-incompatible',
            bundleId: bundle.bundleId,
            inputVersion: bundle.datasetVersion,
            outputVersion: 'version-from-an-older-runtime',
            idempotencyKey: 'program-incompatible',
            status: 'committed',
            createdAt: '2026-07-27T00:00:00.000Z',
            steps: [{
                stepId: 'trim-1',
                kind: 'declarative',
                operation: { id: 'trim-1', type: 'trim_whitespace', reason: 'Trim', columns: '*' },
                inputTableIds: [bundle.primaryTableId],
                outputTableIds: [bundle.primaryTableId],
                idempotencyKey: 'trim-1',
            }],
        }];

        const outcome = replayDatasetBundlePrograms({ bundle, currentData: source });

        expect(outcome).toMatchObject({
            status: 'fresh_import_required',
            committedTransformationIds: [],
            reasonCodes: ['transformation_output_version_mismatch'],
        });
        expect(outcome.data.data).toEqual(source.data);
        expect(outcome.data.data).not.toBe(source.data);
    });
});
