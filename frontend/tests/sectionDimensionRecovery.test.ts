// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { recoverMisalignedSectionDimensions } from '../services/agent/sectionDimensionRecovery';

describe('recoverMisalignedSectionDimensions', () => {
    it('restores a grouped business dimension when it duplicates a temporal column', () => {
        const rows = [
            ['2026-01-01', '2026-01-01', 'Alpha Ltd'],
            ['2026-01-02', '2026-01-02', 'Alpha Ltd'],
            ['2026-01-03', '2026-01-03', 'Alpha Ltd'],
            ['2026-02-01', '2026-02-01', 'Beta Ltd'],
            ['2026-02-02', '2026-02-02', 'Beta Ltd'],
        ].map(([receivedDate, customer, sectionLabel], index) => ({
            'Received Date': receivedDate,
            Customer: customer,
            Amount: index + 1,
            SectionLabel: sectionLabel,
            CarryForwardAppliedColumns: '',
        }));

        const result = recoverMisalignedSectionDimensions(rows);

        expect(result.rows.map(row => row.Customer)).toEqual([
            'Alpha Ltd',
            'Alpha Ltd',
            'Alpha Ltd',
            'Beta Ltd',
            'Beta Ltd',
        ]);
        expect(result.recoveredCounts).toEqual({ Customer: 5 });
        expect(result.rows.every(row => row.CarryForwardAppliedColumns === 'Customer')).toBe(true);
    });

    it('does not replace legitimate values without a duplicated temporal signal', () => {
        const rows = Array.from({ length: 5 }, (_, index) => ({
            'Received Date': `2026-01-0${index + 1}`,
            Customer: `Customer ${index + 1}`,
            Amount: index + 1,
            SectionLabel: index < 3 ? 'North' : 'South',
        }));

        const result = recoverMisalignedSectionDimensions(rows);

        expect(result.rows).toEqual(rows);
        expect(result.recoveredCounts).toEqual({});
    });
});
