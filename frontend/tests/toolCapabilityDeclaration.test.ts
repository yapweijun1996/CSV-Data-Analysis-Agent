// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildBuiltinToolManifests } from '../services/agent/tools/toolManifestRegistry';

describe('tool capability declarations', () => {
    const manifests = buildBuiltinToolManifests(['Region', 'Revenue', 'Cost']);
    const findManifest = (name: string) => manifests.find(m => m.name === name);

    it('analysis.pivot_matrix declares singleMetricOnly capability', () => {
        const manifest = findManifest('analysis.pivot_matrix');

        expect(manifest).toBeDefined();
        expect(manifest?.capabilities?.singleMetricOnly).toBe(true);
    });

    it('analysis.pivot_matrix declares noColumnFilter capability', () => {
        const manifest = findManifest('analysis.pivot_matrix');

        expect(manifest?.capabilities?.noColumnFilter).toBe(true);
    });

    it('analysis.create_plan declares supportsSoftErrorRecovery capability', () => {
        const manifest = findManifest('analysis.create_plan');

        expect(manifest).toBeDefined();
        expect(manifest?.capabilities?.supportsSoftErrorRecovery).toBe(true);
    });

    it('data.query declares supportsOrGroups and supportsConditionalAggregate capabilities', () => {
        const manifest = findManifest('data.query');

        expect(manifest).toBeDefined();
        expect(manifest?.capabilities?.supportsOrGroups).toBe(true);
        expect(manifest?.capabilities?.supportsConditionalAggregate).toBe(true);
    });

    it('declares the five Pi canary actions as read-only in the manifest source of truth', () => {
        const canaryNames = manifests
            .filter(manifest => manifest.capabilities?.piFollowUpReadOnly === true)
            .map(manifest => manifest.name)
            .sort();

        expect(canaryNames).toEqual([
            'data.describe',
            'data.query',
            'workspace.list',
            'workspace.read',
            'workspace.search',
        ]);
        canaryNames.forEach(name => {
            expect(findManifest(name)?.capabilities?.readOnly).toBe(true);
        });
    });

    it('tools without explicit capabilities have undefined capabilities field', () => {
        const manifest = findManifest('data.value_counts');

        expect(manifest).toBeDefined();
        expect(manifest?.capabilities).toBeUndefined();
    });
});
