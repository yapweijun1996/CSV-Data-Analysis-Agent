import { describe, expect, it } from 'vitest';
import { keepInitialAnalysisStageFrame } from '../services/agent/monitoring/analysisStageFrame';
import { formatCompactNumber, compactIfLarge } from '../utils/compactNumber';
import { formatAxisValue } from '../utils/analysisCardPresentation';
import { buildTotalMetricLabel, formatMetricValue } from '../services/dashboard/executiveKpiUtils';
import type { AiTaskStatusMessage } from '../types';

const stage = (overrides: Partial<AiTaskStatusMessage> = {}): AiTaskStatusMessage => ({
    status: 'acting', title: 'Analysing your data', titleKey: 'analysis_initial_stage_8_title',
    subtitleKey: 'analysis_initial_stage_8_desc', totalSteps: 9, currentStep: 8, ...overrides,
});
const hypothesis = (overrides: Partial<AiTaskStatusMessage> = {}): AiTaskStatusMessage => ({
    status: 'thinking', title: 'Verifying analysis hypotheses', titleKey: 'ai_task_verifying_hypotheses',
    subtitle: 'Completed 1 / 3 hypotheses', subtitleKey: 'ai_task_verifying_hypotheses_progress',
    subtitleParams: { completed: 1, total: 3 }, totalSteps: 3, currentStep: 1, ...overrides,
});

describe('initial analysis stage frame', () => {
    it('keeps the stage title and step while a sub-task reports its own progress', () => {
        const merged = keepInitialAnalysisStageFrame(stage(), hypothesis());

        expect(merged).toMatchObject({
            titleKey: 'analysis_initial_stage_8_title', currentStep: 8, totalSteps: 9,
            subtitleKey: 'ai_task_verifying_hypotheses_progress', subtitleParams: { completed: 1, total: 3 },
        });
    });

    it('keeps the frame across repeated sub-task updates', () => {
        const first = keepInitialAnalysisStageFrame(stage(), hypothesis())!;
        const second = keepInitialAnalysisStageFrame(first, hypothesis({ subtitleParams: { completed: 2, total: 3 } }))!;
        expect(second.currentStep).toBe(8);
        expect(second.subtitleParams).toEqual({ completed: 2, total: 3 });
    });

    it('lets the next stage, terminal states and unrelated tasks through', () => {
        const nextStage = stage({ titleKey: 'analysis_initial_stage_9_title', currentStep: 9 });
        expect(keepInitialAnalysisStageFrame(stage(), nextStage)).toBe(nextStage);
        const done = hypothesis({ status: 'done' });
        expect(keepInitialAnalysisStageFrame(stage(), done)).toBe(done);
        expect(keepInitialAnalysisStageFrame(stage({ status: 'done' }), hypothesis())).toMatchObject({ titleKey: 'ai_task_verifying_hypotheses' });
        expect(keepInitialAnalysisStageFrame(hypothesis(), hypothesis({ subtitle: 'x' }))).toMatchObject({ titleKey: 'ai_task_verifying_hypotheses' });
        expect(keepInitialAnalysisStageFrame(stage(), null)).toBeNull();
    });
});

describe('compact numbers', () => {
    it('abbreviates large values and leaves small ones alone', () => {
        expect(formatCompactNumber(297_838_107_220)).toBe('297.8B');
        expect(formatCompactNumber(71_287_611_937.61)).toBe('71.3B');
        expect(compactIfLarge(9_999, 10_000)).toBeNull();
        expect(compactIfLarge(Number.NaN, 10_000)).toBeNull();
    });

    it('abbreviates chart axis ticks from ten thousand up, not small ticks or labels', () => {
        expect(formatAxisValue(80_000_000_000)).toBe('80B');
        expect(formatAxisValue(20_000)).toBe('20K');
        expect(formatAxisValue(500)).toBe('500');
        expect(formatAxisValue('04 TO 06')).toBe('04 TO 06');
    });

    it('abbreviates headline KPI values from a million, but not percentages or small values', () => {
        expect(formatMetricValue(297_838_107_220, 'resale_price', [])).toBe('297.8B');
        expect(formatMetricValue(33_000_000, 'amount', [])).toBe('33M');
        expect(formatMetricValue(12_345, 'amount', [])).toBe('12,345');
        expect(formatMetricValue(0.4, 'win_rate', [])).toBe('40%');
    });

    it('does not repeat "Sum" in a total label', () => {
        expect(buildTotalMetricLabel('Sum Resale Price')).toBe('Total Resale Price');
        expect(buildTotalMetricLabel('Sum of Amount')).toBe('Total Amount');
        expect(buildTotalMetricLabel('Total Revenue')).toBe('Total Revenue');
        expect(buildTotalMetricLabel('Revenue')).toBe('Total Revenue');
    });
});
