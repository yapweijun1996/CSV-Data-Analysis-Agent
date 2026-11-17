import { describe, expect, it } from 'vitest';
import { hasUnfinishedCleaningRun } from '../services/agent/cleaningRunState';
import { normalizeRestoredAppState } from '../utils/messageState';
import type { CleaningRun } from '../types';

const createRun = (
    status: CleaningRun['status'],
    overrides: Partial<CleaningRun> = {},
): CleaningRun => ({
    runId: 'run-test',
    status,
    currentStep: 0,
    steps: [],
    lastModelResponse: null,
    startedAt: new Date('2026-03-11T00:00:00.000Z'),
    updatedAt: new Date('2026-03-11T00:00:00.000Z'),
    targetPath: '/dataset/cleaned.csv',
    shouldAutoResume: false,
    ...overrides,
});

describe('cleaning run restore state', () => {
    it.each([
        ['idle', false],
        ['completed', false],
        ['running', true],
        ['paused', true],
        ['failed', true],
    ] as const)('classifies a %s run as unfinished=%s', (status, expected) => {
        expect(hasUnfinishedCleaningRun(createRun(status))).toBe(expected);
    });

    it('canonicalizes only an empty legacy local-only placeholder', () => {
        const normalized = normalizeRestoredAppState({
            initialAnalysisFailureKind: 'cloud_consent_declined',
            cleaningRun: createRun('paused', {
                currentStep: 0,
                steps: [],
                shouldAutoResume: true,
            }),
        });

        expect(normalized.cleaningRun?.status).toBe('idle');
        expect(normalized.cleaningRun?.shouldAutoResume).toBe(false);
    });

    it('preserves a paused run that has real cleaning steps', () => {
        const normalized = normalizeRestoredAppState({
            initialAnalysisFailureKind: 'cloud_consent_declined',
            cleaningRun: createRun('paused', {
                currentStep: 1,
                steps: [{
                    stepId: 'step-1',
                    kind: 'inspect',
                    status: 'done',
                    timestamp: new Date('2026-03-11T00:00:00.000Z'),
                }],
                shouldAutoResume: false,
            }),
        });

        expect(normalized.cleaningRun?.status).toBe('paused');
        expect(normalized.cleaningRun?.steps).toHaveLength(1);
    });
});
