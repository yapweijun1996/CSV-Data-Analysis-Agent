import { describe, expect, it } from 'vitest';
import { getPivotMatrixRepairGuidance } from '../services/agent/tools/pivotMatrixSupport';

describe('getPivotMatrixRepairGuidance', () => {
    it('returns a targeted repair hint when aggregate is missing', () => {
        const guidance = getPivotMatrixRepairGuidance('"aggregate" is required.');

        expect(guidance.repairHintCategory).toBe('missing_pivot_aggregate');
        expect(guidance.repairHintCategories).toEqual(['missing_pivot_aggregate']);
        expect(guidance.repairHint).toContain('including aggregate explicitly');
        expect(guidance.repairHint).toContain('aggregate="count"');
        expect(guidance.repairHint).toContain('aggregate="sum"');
    });

    it('returns a targeted repair hint when a non-count aggregate omits metric', () => {
        const guidance = getPivotMatrixRepairGuidance('Pivot sum requires a metric column.');

        expect(guidance.repairHintCategory).toBe('missing_pivot_metric');
        expect(guidance.repairHintCategories).toEqual(['missing_pivot_metric']);
        expect(guidance.repairHint).toContain('Aggregate "sum" requires metric');
        expect(guidance.repairHint).toContain('aggregate="count" can omit metric');
    });
});
