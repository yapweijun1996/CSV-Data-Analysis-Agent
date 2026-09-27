// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveCleaningRecoveryStatus } from '../services/agent/orchestration/cleaningPipelineHelpers';

describe('resolveCleaningRecoveryStatus', () => {
    it('returns ideal when succeeded with no rollback reason', () => {
        expect(resolveCleaningRecoveryStatus(null, true)).toBe('ideal');
        expect(resolveCleaningRecoveryStatus(undefined, true)).toBe('ideal');
    });

    it('returns recovered when deterministic_cleanup_failed but pipeline succeeded', () => {
        expect(resolveCleaningRecoveryStatus('deterministic_cleanup_failed', true)).toBe('recovered');
    });

    it('returns degraded when deterministic_cleanup_failed and pipeline failed', () => {
        expect(resolveCleaningRecoveryStatus('deterministic_cleanup_failed', false)).toBe('degraded');
    });

    it('returns degraded when deterministic_recovery_failed', () => {
        expect(resolveCleaningRecoveryStatus('deterministic_recovery_failed', false)).toBe('degraded');
        expect(resolveCleaningRecoveryStatus('deterministic_recovery_failed', true)).toBe('degraded');
    });

    it('returns degraded when deterministic_shaping_failed', () => {
        expect(resolveCleaningRecoveryStatus('deterministic_shaping_failed', false)).toBe('degraded');
    });

    it('returns degraded when llm_budget_exhausted', () => {
        expect(resolveCleaningRecoveryStatus('llm_budget_exhausted', false)).toBe('degraded');
    });

    it('returns failed when semantic_intent_failed', () => {
        expect(resolveCleaningRecoveryStatus('semantic_intent_failed', false)).toBe('failed');
        expect(resolveCleaningRecoveryStatus('semantic_intent_failed', true)).toBe('failed');
    });

    it('returns recovered when shape_verification_failed but succeeded afterward', () => {
        expect(resolveCleaningRecoveryStatus('shape_verification_failed', true)).toBe('recovered');
    });

    it('returns degraded when shape_verification_failed and not succeeded', () => {
        expect(resolveCleaningRecoveryStatus('shape_verification_failed', false)).toBe('degraded');
    });

    it('returns recovered when numeric_reconciliation_failed but succeeded', () => {
        expect(resolveCleaningRecoveryStatus('numeric_reconciliation_failed', true)).toBe('recovered');
    });

    it('returns failed for unknown reason when not succeeded', () => {
        expect(resolveCleaningRecoveryStatus('some_unknown_reason', false)).toBe('failed');
    });

    it('returns ideal for unknown reason when succeeded', () => {
        expect(resolveCleaningRecoveryStatus('some_unknown_reason', true)).toBe('ideal');
    });
});
