import { describe, it, expect } from 'vitest';
import {
    evaluatePostCleaningGateRelaxation,
    type PostCleaningGateEvidence,
} from '../services/agent/intakeDiagnosticsPolicy';

/** Minimal passing evidence — all gates satisfied. */
const passingEvidence: PostCleaningGateEvidence = {
    cleaningCompleted: true,
    sqlPrecheckPassed: true,
    cleanedRowCount: 1299,
    queryableMetricCount: 7,
    queryableDimensionCount: 2,
    residualUnknownRowCount: 19,
};

describe('evaluatePostCleaningGateRelaxation', () => {
    it('relaxes when all evidence signals pass', () => {
        const result = evaluatePostCleaningGateRelaxation(passingEvidence);
        expect(result.canRelax).toBe(true);
        expect(result.reason).toContain('Post-cleaning evidence passed');
        expect(result.evidence).toBe(passingEvidence);
    });

    it('blocks when cleaning has not completed', () => {
        const result = evaluatePostCleaningGateRelaxation({
            ...passingEvidence,
            cleaningCompleted: false,
        });
        expect(result.canRelax).toBe(false);
        expect(result.reason).toContain('Cleaning has not completed');
    });

    it('blocks when SQL precheck did not pass', () => {
        const result = evaluatePostCleaningGateRelaxation({
            ...passingEvidence,
            sqlPrecheckPassed: false,
        });
        expect(result.canRelax).toBe(false);
        expect(result.reason).toContain('SQL precheck');
    });

    it('blocks when cleaned dataset has zero rows', () => {
        const result = evaluatePostCleaningGateRelaxation({
            ...passingEvidence,
            cleanedRowCount: 0,
        });
        expect(result.canRelax).toBe(false);
        expect(result.reason).toContain('no rows');
    });

    it('relaxes to count-based analysis when dimensions exist without numeric metrics', () => {
        const result = evaluatePostCleaningGateRelaxation({
            ...passingEvidence,
            queryableMetricCount: 0,
        });
        expect(result.canRelax).toBe(true);
        expect(result.reason).toContain('count-based aggregation');
    });

    it('blocks when no queryable dimension columns exist', () => {
        const result = evaluatePostCleaningGateRelaxation({
            ...passingEvidence,
            queryableDimensionCount: 0,
        });
        expect(result.canRelax).toBe(false);
        expect(result.reason).toContain('dimension');
    });

    it('blocks when residual unknown rows exceed 50% of dataset', () => {
        const result = evaluatePostCleaningGateRelaxation({
            ...passingEvidence,
            cleanedRowCount: 100,
            residualUnknownRowCount: 51,
        });
        expect(result.canRelax).toBe(false);
        expect(result.reason).toContain('Residual unknown');
    });

    it('relaxes when residual unknown rows are exactly at 50% boundary', () => {
        const result = evaluatePostCleaningGateRelaxation({
            ...passingEvidence,
            cleanedRowCount: 100,
            residualUnknownRowCount: 50,
        });
        expect(result.canRelax).toBe(true);
    });

    it('relaxes with zero residual unknown rows', () => {
        const result = evaluatePostCleaningGateRelaxation({
            ...passingEvidence,
            residualUnknownRowCount: 0,
        });
        expect(result.canRelax).toBe(true);
    });

    it('returns evidence in every directive', () => {
        const failing = { ...passingEvidence, cleaningCompleted: false };
        const failResult = evaluatePostCleaningGateRelaxation(failing);
        expect(failResult.evidence).toBe(failing);

        const passResult = evaluatePostCleaningGateRelaxation(passingEvidence);
        expect(passResult.evidence).toBe(passingEvidence);
    });
});
