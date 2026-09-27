import { describe, expect, it } from 'vitest';
import { buildDeterministicEvidenceFallbackPlan } from '../services/agent/runtime/pi/deterministicEvidenceFallback';

describe('deterministic evidence fallback', () => {
    it('prefers a business amount and bounded business dimension over unit helpers', () => {
        const profiles = [
            { name: 'UOM', type: 'categorical' as const, uniqueValues: 3, missingPercentage: 0 },
            { name: 'Customer Country', type: 'categorical' as const, uniqueValues: 6, missingPercentage: 0 },
            { name: 'Order Qty', type: 'numerical' as const, missingPercentage: 0 },
            { name: 'Bal Amount', type: 'currency' as const, missingPercentage: 0 },
        ];
        const plan = buildDeterministicEvidenceFallbackPlan(profiles, {
            dimensionColumns: ['UOM', 'Customer Country'],
            metricColumns: ['Order Qty', 'Bal Amount'],
            businessGrains: ['Customer Country'],
            helperDimensions: ['UOM'],
        });

        expect(plan).toMatchObject({
            title: 'Total Bal Amount by Customer Country',
            aggregation: 'sum',
            bindings: {
                groupByColumn: 'Customer Country',
                valueColumn: 'Total Bal Amount',
            },
        });
    });

    it('returns null when no safe dimension and metric pair exists', () => {
        const plan = buildDeterministicEvidenceFallbackPlan([
            { name: 'RowClass', type: 'categorical' as const },
        ], {
            dimensionColumns: ['RowClass'],
            metricColumns: [],
            blockedDimensions: ['RowClass'],
        });
        expect(plan).toBeNull();
    });
});
