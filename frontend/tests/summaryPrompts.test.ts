import { describe, expect, it } from 'vitest';
import { createFinalSummaryPrompt } from '../services/prompts/chatPrompts';
import { createCoreAnalysisPrompt, createSummaryPrompt } from '../services/prompts/summaryPrompts';

describe('createSummaryPrompt', () => {
    it('uses a short preview-first format instead of the old report template', () => {
        const prompt = createSummaryPrompt('Cost Breakdown', 'Chart data goes here.', 'English');

        expect(prompt).toContain('Start immediately with 2-3 short bullet points');
        expect(prompt).toContain('### Expanded Analysis');
        expect(prompt).not.toContain('### Insight Overview');
        expect(prompt).not.toContain('### Metric Signals');
        expect(prompt).not.toContain('### Recommended Action');
    });

    it('includes evidence-first guardrails for ambiguous labels and unsupported business claims', () => {
        const prompt = createSummaryPrompt('Mixed Labels', 'Chart data goes here.', 'English');

        expect(prompt).toContain('Only state conclusions that are directly supported');
        expect(prompt).toContain('If the context includes a report title or parameter lines, use them as framing context');
        expect(prompt).toContain('refer to them neutrally as labels, entries, or values');
        expect(prompt).toContain('Do not escalate that into claims like core driver');
        expect(prompt).toContain('Mention budget variance, forecast, planning, or plan-vs-actual only');
    });
});

describe('createCoreAnalysisPrompt', () => {
    it('includes schema-level guardrails for ambiguous dataset semantics', () => {
        const prompt = createCoreAnalysisPrompt('Context text', 'English');

        expect(prompt).toContain('Only infer the dataset\'s subject matter');
        expect(prompt).toContain('If the context includes a report title or parameter lines, use them to sharpen the framing');
        expect(prompt).toContain('describe it conservatively as a dataset with several label/dimension columns');
        expect(prompt).toContain('Do not claim this is project data, budget data, maintenance data');
    });
});

describe('createFinalSummaryPrompt', () => {
    it('includes synthesis guardrails against unsupported business interpretation', () => {
        const prompt = createFinalSummaryPrompt('Summary A', 'English');

        expect(prompt).toContain('Only synthesize claims supported by source summaries');
        expect(prompt).toContain('keep them');
        expect(prompt).toContain('Do not upgrade to business entity types unless clearly supported');
        expect(prompt).toContain('explain the reporting structure rather than treating them as independent findings');
    });
});
