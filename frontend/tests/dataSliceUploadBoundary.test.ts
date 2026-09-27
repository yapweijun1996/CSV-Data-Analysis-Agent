import { describe, expect, it } from 'vitest';
import { resolvePendingDatasetBundleRestore } from '../store/slices/dataSlice';
import type { DatasetBundle } from '../types';

describe('dataset upload boundary', () => {
    it('captures a pending history restore before the intake placeholder is committed', () => {
        const pendingBundle = { bundleId: 'bundle-restore' } as DatasetBundle;

        expect(resolvePendingDatasetBundleRestore({
            csvData: null,
            datasetBundle: pendingBundle,
        })).toBe(pendingBundle);
    });

    it('does not treat an already loaded dataset as a pending history restore', () => {
        expect(resolvePendingDatasetBundleRestore({
            csvData: { fileName: 'current.csv', data: [] },
            datasetBundle: { bundleId: 'bundle-current' } as DatasetBundle,
        })).toBeNull();
    });
});
