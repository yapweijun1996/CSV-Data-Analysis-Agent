// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildColumnRegistry, isNonAdditiveMetric } from '../services/data/columnRegistry';
import { isRatioLikeMetric } from '../services/agent/planning/evidenceQuerySemantics';
import { applyColumnAdditivity, validateColumnAdditivity } from '../services/agent/runtime/pi/researchPlan';
import type { ColumnProfile } from '../types';

const profiles = [
    { name: 'town', type: 'categorical' },
    { name: 'margin', type: 'currency' },
    { name: 'closing_balance', type: 'currency' },
    { name: 'share', type: 'percentage' },
] as unknown as ColumnProfile[];

describe('validateColumnAdditivity', () => {
    it('keeps valid judgements and attaches them to profiles', () => {
        const { accepted, rejected } = validateColumnAdditivity([
            { column: 'Margin', kind: 'additive', nature: 'flow', rationale: 'Dollar profit per sale.' },
        ], profiles);
        expect(rejected).toEqual([]);
        const [, margin] = applyColumnAdditivity(profiles, accepted);
        expect(margin.additivity).toMatchObject({ kind: 'additive', nature: 'flow' });
    });

    it('rejects unknown, non-numeric, malformed and contradictory entries', () => {
        const { accepted, rejected } = validateColumnAdditivity([
            { column: 'nope', kind: 'additive', nature: 'flow' },
            { column: 'town', kind: 'additive', nature: 'flow' },
            { column: 'margin', kind: 'maybe', nature: 'flow' },
            { column: 'margin', kind: 'additive', nature: 'ratio' },
        ], profiles);
        expect(accepted).toEqual({});
        expect(rejected).toHaveLength(4);
    });

    it('never lets a percentage column be additive', () => {
        const { accepted } = validateColumnAdditivity([{ column: 'share', kind: 'additive', nature: 'flow' }], profiles);
        expect(accepted.share.kind).toBe('non_additive');
    });
});

describe('additivity precedence', () => {
    const annotated = (name: string, kind: 'additive' | 'non_additive') => ({
        ...profiles.find(profile => profile.name === name)!,
        additivity: { kind, nature: kind === 'additive' ? 'flow' : 'ratio', rationale: '' },
    }) as ColumnProfile;

    it("Pi's judgement overrides the column-name guess in both directions", () => {
        expect(isNonAdditiveMetric('margin', profiles[1])).toBe(true); // name prior
        expect(isNonAdditiveMetric('margin', annotated('margin', 'additive'))).toBe(false);
        expect(isNonAdditiveMetric('closing_balance', annotated('closing_balance', 'additive'))).toBe(false);
        expect(isNonAdditiveMetric('revenue', { name: 'revenue', type: 'currency', additivity: { kind: 'non_additive', nature: 'stock', rationale: '' } })).toBe(true);
    });

    it('feeds the registry aggregation hint and the ratio check', () => {
        const data = { fileName: 'x.csv', data: [{ town: 'A', margin: 1, closing_balance: 2, share: 3 }] } as never;
        const hint = (list: ColumnProfile[], name: string) =>
            buildColumnRegistry({ data, columnProfiles: list })!.columns.find(entry => entry.physicalName === name)!.allowedUsages.aggregationHint;

        expect(hint(profiles, 'margin')).toBe('non_additive');
        expect(hint([annotated('margin', 'additive'), ...profiles.filter(profile => profile.name !== 'margin')], 'margin')).toBe('additive');
        expect(isRatioLikeMetric('margin', annotated('margin', 'additive'))).toBe(false);
        expect(isRatioLikeMetric('margin', profiles[1])).toBe(true);
    });
});
