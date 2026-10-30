// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { inferUnitFromHeader, resolveUnitMeaning, validateUnitMeanings, type UnitMeaning } from '../services/data/unitMeaning';

const mapping = (unit: string, overrides: Partial<UnitMeaning> = {}): UnitMeaning => ({
    unit, provenance: 'confirmed', source: 'user', datasetVersion: 'v1', ...overrides,
});

describe('unit meaning', () => {
    it.each(['SGD', 'USD', 'EUR'])('infers an explicit ISO suffix %s', code => {
        expect(inferUnitFromHeader(`Amount (${code})`)).toBe(code);
    });

    it.each(['', 'Amount', 'Amount USD', 'Amount ($)', 'Amount (¥)', 'Amount $ (USD)', 'Amount (USD) (SGD)', 'Amount (USD) actual (SGD)', 'Amount (ZZZ)'])
    ('does not infer from ambiguous, conflicting or missing evidence: %s', header => {
        expect(inferUnitFromHeader(header)).toBeUndefined();
    });

    it('rejects stale, blank, ambiguous and conflicting mappings', () => {
        expect(validateUnitMeanings([mapping('SGD')], 'v2')).toEqual({ status: 'missing' });
        expect(validateUnitMeanings([mapping('')], 'v1')).toEqual({ status: 'missing' });
        expect(validateUnitMeanings([mapping('$')], 'v1')).toEqual({ status: 'missing' });
        expect(validateUnitMeanings([mapping('¥')], 'v1')).toEqual({ status: 'missing' });
        expect(validateUnitMeanings([mapping('SGD'), mapping('USD')], 'v1')).toEqual({ status: 'mixed' });
        expect(validateUnitMeanings([mapping('SGD'), null], 'v1')).toEqual({ status: 'missing' });
        expect(validateUnitMeanings([], 'v1')).toEqual({ status: 'missing' });
    });

    it('preserves inferred provenance even when other evidence is confirmed', () => {
        expect(resolveUnitMeaning([mapping('SGD')], 'v1')).toEqual({ status: 'trusted', unit: 'SGD' });
        expect(resolveUnitMeaning([mapping('SGD'), mapping('SGD', { provenance: 'inferred', source: 'header' })], 'v1'))
            .toEqual({ status: 'inferred', unit: 'SGD' });
        expect(resolveUnitMeaning([mapping('EUR', { provenance: 'inferred', source: 'unit_column' })], 'v1'))
            .toEqual({ status: 'inferred', unit: 'EUR' });
    });

    it('requires explicit confirmation for dimensionless and never infers from a user source', () => {
        expect(resolveUnitMeaning([mapping('dimensionless')], 'v1')).toEqual({ status: 'trusted', unit: 'dimensionless' });
        expect(resolveUnitMeaning([mapping('dimensionless', { provenance: 'inferred', source: 'header' })], 'v1')).toEqual({ status: 'missing' });
        expect(resolveUnitMeaning([mapping('SGD', { provenance: 'inferred' })], 'v1')).toEqual({ status: 'missing' });
    });
});
