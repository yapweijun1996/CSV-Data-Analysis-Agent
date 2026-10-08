import { describe, expect, it } from 'vitest';
import { describeInitialAnalysisFailure } from '../services/agent/runtime/pi/initialAnalysisFailure';

const base = { totalStages: 9, results: [], errorText: '' };

describe('describeInitialAnalysisFailure', () => {
    it('names the failed stage and its summary instead of an earlier unrelated warning', () => {
        const text = describeInitialAnalysisFailure({
            ...base,
            results: [
                { decision: 'warn', toolName: 'dataset.profileStructure', summary: 'Read-only dataset.' },
                { decision: 'fail', toolName: 'analysis.executeEvidence', summary: 'No evidence query returned rows.' },
            ],
            fallbackWarning: 'Read-only dataset.',
        });
        expect(text).toBe('Stage analysis.executeEvidence: No evidence query returned rows.');
    });

    it('reports the stage that was running when an error stopped the run', () => {
        const text = describeInitialAnalysisFailure({
            ...base,
            errorText: 'The shared AI service is busy.',
            stoppedStage: { index: 7, name: 'analysis.executeEvidence' },
            fallbackWarning: 'Read-only dataset.',
        });
        expect(text).toBe('Stopped at stage 8/9 (analysis.executeEvidence): The shared AI service is busy.');
    });

    it('uses the last warning when every stage ran but nothing passed the evidence checks', () => {
        const text = describeInitialAnalysisFailure({
            ...base,
            results: [
                { decision: 'warn', toolName: 'analysis.executeEvidence', summary: '0 of 3 questions verified.' },
                { decision: 'pass', toolName: 'analysis.finalizeArtifacts', summary: 'done' },
            ],
        });
        expect(text).toContain('0 of 3 questions verified.');
        expect(text).toContain('analysis.executeEvidence');
    });

    it('falls back to the first warning, then a generic line', () => {
        expect(describeInitialAnalysisFailure({ ...base, fallbackWarning: 'Note.' })).toBe('Note.');
        expect(describeInitialAnalysisFailure(base)).toBe('No result passed the evidence checks.');
    });
});
