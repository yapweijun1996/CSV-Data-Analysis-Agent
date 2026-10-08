import { describe, expect, it } from 'vitest';
import { describeInitialAnalysisFailure } from '../services/agent/runtime/pi/initialAnalysisFailure';
import { getTranslation } from '../utils/localization';

const stageNames = [
    'dataset.profileStructure', 'dataset.detectNoiseRows', 'dataset.suggestCleaningPlan',
    'dataset.applyTransform', 'dataset.validatePreparedData', 'dataset.bindQueryEngine',
    'analysis.researchQuestions', 'analysis.executeEvidence', 'analysis.finalizeArtifacts',
];
const inEnglish = (key: string, params?: Record<string, string | number>) => getTranslation(key, 'English', params);
const base = { stageNames, results: [], errorText: '', translate: inEnglish };

describe('describeInitialAnalysisFailure', () => {
    it('translates the failing stage reason from its warning code and keeps unknown codes as the summary', () => {
        const fail = (code: string) => describeInitialAnalysisFailure({
            ...base, translate: (key, params) => getTranslation(key, 'Mandarin', params),
            results: [{ decision: 'fail', toolName: 'analysis.executeEvidence', summary: 'English summary', warningCodes: [code] }],
        });
        expect(fail('evidence_run_failed')).toBe('第 8/9 阶段“分析”失败：证据查询结束时没有产出被接受的卡片。');
        expect(fail('evidence_run_timed_out')).toContain('证据查询结束时没有产出被接受的卡片。');
        expect(fail('some_new_code')).toBe('第 8/9 阶段“分析”失败：English summary');
    });

    it('names the failed stage and its summary instead of an earlier unrelated warning', () => {
        const text = describeInitialAnalysisFailure({
            ...base,
            results: [
                { decision: 'warn', toolName: 'dataset.profileStructure', summary: 'Read-only dataset.' },
                { decision: 'fail', toolName: 'analysis.executeEvidence', summary: 'No evidence query returned rows.' },
            ],
            fallbackWarning: 'Read-only dataset.',
        });
        expect(text).toBe('Stage 8/9 “Analyse” failed: No evidence query returned rows.');
    });

    it('reports the stage that was running when an error stopped the run', () => {
        const text = describeInitialAnalysisFailure({
            ...base, errorText: 'The shared AI service is busy.', stoppedStageIndex: 7, fallbackWarning: 'Read-only dataset.',
        });
        expect(text).toBe('Stopped at stage 8/9 “Analyse”: The shared AI service is busy.');
    });

    it('localises the stage name and the sentence', () => {
        const text = describeInitialAnalysisFailure({
            ...base, translate: (key, params) => getTranslation(key, 'Mandarin', params),
            errorText: 'busy', stoppedStageIndex: 6,
        });
        expect(text).toBe('在第 7/9 阶段“问题”中断：busy');
    });

    it('uses the last warning when every stage ran but nothing passed the evidence checks', () => {
        const text = describeInitialAnalysisFailure({
            ...base,
            results: [
                { decision: 'warn', toolName: 'analysis.executeEvidence', summary: '0 of 3 questions verified.' },
                { decision: 'pass', toolName: 'analysis.finalizeArtifacts', summary: 'done' },
            ],
        });
        expect(text).toBe('No result passed the evidence checks. Last warning from stage 8/9 “Analyse”: 0 of 3 questions verified.');
    });

    it('falls back to the first warning, then a generic line, and tolerates an unknown stage', () => {
        expect(describeInitialAnalysisFailure({ ...base, fallbackWarning: 'Note.' })).toBe('Note.');
        expect(describeInitialAnalysisFailure(base)).toBe('No result passed the evidence checks.');
        expect(describeInitialAnalysisFailure({
            ...base, results: [{ decision: 'fail', toolName: 'unknown.tool', summary: 'x' }],
        })).toBe('Stage 0/9 “?” failed: x');
    });
});
