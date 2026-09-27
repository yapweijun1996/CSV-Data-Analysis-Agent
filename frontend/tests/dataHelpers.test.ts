import { describe, expect, it } from 'vitest';
import { applyTopNWithOthers } from '../utils/dataHelpers';

describe('applyTopNWithOthers', () => {
    it('keeps the top N rows visible and appends Others as an extra bucket', () => {
        const result = applyTopNWithOthers(
            [
                { label: 'A', value: 50 },
                { label: 'B', value: 40 },
                { label: 'C', value: 30 },
                { label: 'D', value: 20 },
            ],
            'label',
            'value',
            2,
        );

        expect(result).toEqual([
            { label: 'A', value: 50 },
            { label: 'B', value: 40 },
            { label: 'Others', value: 50 },
        ]);
    });
});
