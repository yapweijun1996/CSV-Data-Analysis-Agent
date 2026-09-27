import { describe, expect, it } from 'vitest';
import { applyPreparationPlanToCanonicalDataset } from '../services/agent/orchestration/canonicalPreparation';

describe('canonical preparation overlays', () => {
    it('reapplies label normalization and numeric casting after canonical rebuild', () => {
        const result = applyPreparationPlanToCanonicalDataset({
            fileName: 'sample.csv',
            data: [
                { Town: ' woodlands ', Amount: '1,234.50' },
                { Town: 'Yishun', Amount: '' },
            ],
        }, {
            explanation: 'Normalize values.',
            operations: [],
            outputColumns: [],
            planStatus: 'operations',
            consistencyIssues: [],
            labelNormalization: {
                appliedClusters: [{
                    column: 'Town',
                    canonicalValue: 'Woodlands',
                    replacedValues: [' woodlands '],
                }],
            } as never,
            numericStringNormalizedColumns: ['Amount'],
        });

        expect(result?.data).toEqual([
            { Town: 'Woodlands', Amount: 1234.5 },
            { Town: 'Yishun', Amount: '' },
        ]);
    });
});
