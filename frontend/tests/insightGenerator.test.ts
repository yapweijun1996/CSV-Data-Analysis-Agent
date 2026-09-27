// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardContext, DisplayAnalysisNarrativeInput, Settings } from '../types';
import { generateProactiveInsights, validateInsightGrounding } from '../services/ai/insightGenerator';
import { createTestSettings } from './testSettings';

const {
    createProviderModelMock,
    generateTextMock,
    isProviderConfiguredMock,
} = vi.hoisted(() => ({
    createProviderModelMock: vi.fn(() => ({ model: { provider: 'google', modelId: 'gemini-3-flash-preview' } })),
    generateTextMock: vi.fn(),
    isProviderConfiguredMock: vi.fn(() => true),
}));

vi.mock('ai', () => ({
    Output: { object: vi.fn(() => ({ kind: 'object' })) },
    generateText: generateTextMock,
    streamText: vi.fn((...args: unknown[]) => {
        const resultPromise = generateTextMock(...args);
        return {
            fullStream: (async function* () {})(),
            text: resultPromise.then((r: any) => r?.text ?? ''),
            finishReason: Promise.resolve('stop'),
            output: resultPromise.then((r: any) => r?.output ?? undefined),
        };
    }),
    jsonSchema: vi.fn(schema => schema),
}));

vi.mock('../services/ai/providerConfig', () => ({
    createProviderModel: createProviderModelMock,
    isProviderConfigured: isProviderConfiguredMock,
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

describe('generateProactiveInsights', () => {
    const settings: Settings = createTestSettings({
        provider: 'google',
        geminiApiKey: 'key',
        simpleModel: 'gemini-3-flash-preview',
        complexModel: 'gemini-3-flash-preview',
        language: 'English',
        autoConfirmGoal: true,
    });

    const cardContext: CardContext[] = [
        {
            id: 'card-1',
            title: 'Revenue by Project',
            description: 'Compare revenue by project.',
            summary: 'Project revenue is concentrated in one label.',
            groupByColumn: 'Project',
            valueColumn: 'Revenue',
            aggregatedDataSample: [{ Project: 'BDB LAB DESIGN', Revenue: 1200 }],
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        generateTextMock.mockResolvedValue({
            output: {
                insight: '**Top project revenue**',
                cardId: 'card-1',
            },
            text: '',
        });
    });

    it('passes IR narrative signals into the proactive insight prompt and prefers business cards', async () => {
        const narrativeInputs: DisplayAnalysisNarrativeInput[] = [
            {
                cardId: 'card-1',
                displayTitle: 'Revenue by Project',
                displayDescription: 'Compare revenue by project.',
                safeNarrativeLabels: {
                    title: 'Revenue by Project',
                    dimension: 'Project',
                    metric: 'Revenue',
                },
                semanticRole: 'business_dimension',
                autoAnalysisVerdict: 'trusted',
                helperExposureLevel: 'none',
                businessMeaningConfidence: 0.84,
                aggregationQualityFlags: [],
                narrativeEligibility: 'preferred',
                selectionScore: 102,
                selectionReasons: ['business_dimension'],
                summary: 'Project revenue is concentrated in one label.',
                aggregatedDataSample: [{ Project: 'BDB LAB DESIGN', Revenue: 1200 }],
                isFallback: false,
            },
            {
                cardId: 'card-helper',
                displayTitle: 'Total Value by Source Column',
                displayDescription: 'Compare total value by source column.',
                safeNarrativeLabels: {
                    title: 'Total Value by Source Column',
                    dimension: 'Source Column',
                    metric: 'Total Value',
                },
                semanticRole: 'helper_dimension',
                autoAnalysisVerdict: 'trusted',
                helperExposureLevel: 'high',
                businessMeaningConfidence: 0.3,
                aggregationQualityFlags: ['helper_dimension_heavy', 'neutral_only_labels'],
                narrativeEligibility: 'allowed_neutral',
                selectionScore: 12,
                selectionReasons: ['helper_dimension_penalty'],
                summary: 'Source column 24216 is the highest label.',
                aggregatedDataSample: [{ SourceColumn: '24216', Value: 2400 }],
                isFallback: false,
            },
        ];

        const result = await generateProactiveInsights(cardContext, settings, undefined, narrativeInputs);

        expect(result).toEqual({
            insight: '**Top project revenue**',
            cardId: 'card-1',
        });

        const request = generateTextMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
        expect(request.messages[0].content).toContain('Prefer cards where `narrativeEligibility` is `preferred`');
        expect(request.messages[1].content).toContain('"displayTitle": "Revenue by Project"');
        expect(request.messages[1].content).toContain('"businessMeaningConfidence": 0.84');
        expect(request.messages[1].content).toContain('"semanticRole": "business_dimension"');
        expect(request.messages[1].content).toContain('"selectionScore": 102');
    });

    it('keeps helper-only insight prompts in neutral wording mode', async () => {
        const helperOnlyInputs: DisplayAnalysisNarrativeInput[] = [
            {
                cardId: 'card-helper',
                displayTitle: 'Total Value by Source Row',
                displayDescription: 'Compare total value by source row.',
                safeNarrativeLabels: {
                    title: 'Total Value by Source Row',
                    dimension: 'Source Row',
                    metric: 'Total Value',
                },
                semanticRole: 'helper_row_index',
                autoAnalysisVerdict: 'trusted',
                helperExposureLevel: 'high',
                businessMeaningConfidence: 0.15,
                aggregationQualityFlags: ['helper_dimension_heavy'],
                narrativeEligibility: 'avoid_if_possible',
                selectionScore: -18,
                selectionReasons: ['helper_row_penalty'],
                summary: 'Source row 0 is the highest entry.',
                aggregatedDataSample: [{ SourceRow: 0, Value: 22191666.85 }],
                isFallback: false,
            },
        ];

        await generateProactiveInsights(cardContext, settings, undefined, helperOnlyInputs);

        const request = generateTextMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
        expect(request.messages[0].content).toContain('keep the wording neutral');
        expect(request.messages[1].content).toContain('"narrativeEligibility": "avoid_if_possible"');
        expect(request.messages[1].content).toContain('"helperExposureLevel": "high"');
    });

    it('suppresses insight with domain concepts absent from data', async () => {
        generateTextMock.mockResolvedValue({
            output: {
                insight: '**Supply chain risk** in secondary logistics hub shows bottleneck',
                cardId: 'card-1',
            },
            text: '',
        });
        const result = await generateProactiveInsights(cardContext, settings);
        expect(result).toBeNull();
    });

    it('allows insight that paraphrases actual data labels', async () => {
        generateTextMock.mockResolvedValue({
            output: {
                insight: '**Revenue concentration**: BDB LAB DESIGN accounts for 85% of total Project revenue',
                cardId: 'card-1',
            },
            text: '',
        });
        const result = await generateProactiveInsights(cardContext, settings);
        expect(result).not.toBeNull();
        expect(result!.insight).toContain('BDB LAB DESIGN');
    });

    it('returns null when AI produces empty insight', async () => {
        generateTextMock.mockResolvedValue({
            output: { insight: '', cardId: '' },
            text: '',
        });
        const result = await generateProactiveInsights(cardContext, settings);
        expect(result).toBeNull();
    });
});

describe('validateInsightGrounding', () => {
    const sampleInputs: DisplayAnalysisNarrativeInput[] = [{
        cardId: 'card-1',
        displayTitle: 'Revenue by Project',
        displayDescription: '',
        summary: 'Project revenue is concentrated.',
        safeNarrativeLabels: { title: 'Revenue by Project', dimension: 'Project', metric: 'Revenue' },
        semanticRole: 'business_dimension',
        autoAnalysisVerdict: 'trusted',
        helperExposureLevel: 'none',
        businessMeaningConfidence: 0.8,
        aggregationQualityFlags: [],
        narrativeEligibility: 'preferred',
        selectionScore: 100,
        selectionReasons: [],
        aggregatedDataSample: [{ Project: 'JEWEL', Revenue: 6249000 }],
        isFallback: false,
    }];

    it('accepts grounded insight referencing actual data labels', () => {
        const r = validateInsightGrounding('JEWEL project dominates revenue at 72%', sampleInputs);
        expect(r.grounded).toBe(true);
        expect(r.ungroundedTerms).toHaveLength(0);
    });

    it('rejects insight with supply chain hallucination', () => {
        const r = validateInsightGrounding('Supply chain risk in logistics hub threatens margins', sampleInputs);
        expect(r.grounded).toBe(false);
        expect(r.ungroundedTerms.length).toBeGreaterThan(0);
    });

    it('allows generic business terms as safe paraphrase', () => {
        const r = validateInsightGrounding('Revenue concentration risk: top project accounts for 72% of total', sampleInputs);
        expect(r.grounded).toBe(true);
    });
});
