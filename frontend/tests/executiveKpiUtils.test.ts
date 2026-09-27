import { describe, expect, it } from 'vitest';
import { pluralizeLabel, toDisplayLabel } from '../services/dashboard/executiveKpiUtils';

describe('executiveKpiUtils', () => {
    it('uses a business-readable label for the standard CCY abbreviation', () => {
        expect(toDisplayLabel('CCY', 'Group')).toBe('Currency');
        expect(pluralizeLabel(toDisplayLabel('CCY', 'Group'))).toBe('Currencies');
    });
    it('strips trailing punctuation before applying display-label title casing', () => {
        expect(toDisplayLabel('the source column of the income statement data.', 'Fallback')).toBe(
            'The Source Column Of The Income Statement Data',
        );
    });

    it('does not create punctuation-driven pluralization artifacts', () => {
        expect(pluralizeLabel('The Source Column Of The Income Statement Data.')).toBe(
            'The Source Column Of The Income Statement Data',
        );
    });

    it('keeps neutral helper labels fixed instead of pluralizing them', () => {
        expect(pluralizeLabel('Source Column.')).toBe('Source Column');
        expect(pluralizeLabel('Series Label 1.')).toBe('Series Label 1');
    });
});
