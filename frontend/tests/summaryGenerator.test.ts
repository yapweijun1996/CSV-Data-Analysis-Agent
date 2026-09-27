// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisCardData, CardContext, ColumnProfile, Settings } from '../types';
import { generateCoreAnalysisSummary, generateFinalSummary, generateSummary } from '../services/ai/summaryGenerator';
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
}));

vi.mock('../services/ai/providerConfig', () => ({
    createProviderModel: createProviderModelMock,
    isProviderConfigured: isProviderConfiguredMock,
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

describe('generateCoreAnalysisSummary', () => {
    const settings: Settings = createTestSettings({
        provider: 'google',
        geminiApiKey: 'key',
        simpleModel: 'gemini-3-flash-preview',
        complexModel: 'gemini-3-flash-preview',
        language: 'English',
        autoConfirmGoal: true,
    });

    const columns: ColumnProfile[] = [
        { name: 'Region', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
        { name: 'Revenue', type: 'numerical', missingPercentage: 0, valueRange: [10, 20] },
    ];

    const cardContext: CardContext[] = [
        {
            id: 'card-1',
            title: 'Revenue by Region',
            aggregatedDataSample: [{ Region: 'East', Revenue: 20 }],
        },
    ];

    const cards: AnalysisCardData[] = [
        {
            id: 'card-1',
            plan: {
                title: 'Revenue by Region',
                description: 'Compare revenue by region.',
                chartType: 'bar',
                groupByColumn: 'Region',
                valueColumn: 'Revenue',
                aggregation: 'sum',
            },
            aggregatedData: [{ Region: 'East', Revenue: 20 }],
            summary: {
                language: 'English',
                text: '- East is the largest label.\n\n### Expanded Analysis\n- More detail.',
            },
            displayChartType: 'bar',
            isDataVisible: false,
            topN: null,
            hideOthers: false,
            hiddenLabels: [],
            autoAnalysisEvaluation: {
                verdict: 'trusted',
                reasonCodes: [],
                detail: 'trusted',
                evaluatedAt: new Date().toISOString(),
                source: 'auto_analysis_evaluator_v1',
            },
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        generateTextMock.mockResolvedValue({ text: 'Initial analysis summary' });
    });

    it('uses the defined system prompt when building the core summary request', async () => {
        const result = await generateCoreAnalysisSummary(cardContext, columns, settings);

        expect(result).toEqual({ language: 'English', text: 'Initial analysis summary' });
        expect(generateTextMock).toHaveBeenCalledTimes(1);

        const request = generateTextMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
        expect(request.messages[0].role).toBe('system');
        expect(request.messages[0].content).toContain('You are a senior data analyst presenting an initial automated analysis briefing.');
        expect(request.messages[0].content).toContain('Only infer the business domain when column names or cards clearly support it. Stay neutral if ambiguous.');
        expect(request.messages[1].role).toBe('user');
    });

    it('uses an evidence-first system prompt for card summaries', async () => {
        generateTextMock.mockResolvedValue({ text: 'Card summary' });

        const result = await generateSummary(
            'Revenue by Region',
            [{ Region: 'East', Revenue: 20 }],
            settings,
            columns,
        );

        expect(result).toEqual({ language: 'English', text: 'Card summary' });

        const request = generateTextMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
        expect(request.messages[0].role).toBe('system');
        expect(request.messages[0].content).toContain('Only make claims that are directly supported by the chart data');
        expect(request.messages[0].content).toContain('refer to them neutrally as labels, entries, or values');
        expect(request.messages[0].content).toContain('Do not introduce unsupported business causes');
    });

    it('uses the structured executive brief system prompt for final summaries', async () => {
        generateTextMock.mockResolvedValue({ text: '### Key Findings\n1. **Revenue peak** — East leads at 500. Confidence: high\n   → Recommended Action: Investigate East drivers.' });

        const result = await generateFinalSummary(cards, settings);

        expect(result).toEqual({ language: 'English', text: expect.stringContaining('Key Findings') });

        const request = generateTextMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
        expect(request.messages[0].role).toBe('system');
        // New executive brief system prompt content
        expect(request.messages[0].content).toContain('structured executive brief');
        expect(request.messages[0].content).toContain('Key Findings');
        expect(request.messages[0].content).toContain('Recommended Action');
        expect(request.messages[0].content).toContain('Data Confidence Assessment');
        expect(request.messages[0].content).toContain('Only surface findings that are directly supported');
        // Neutral framing rule preserved
        expect(request.messages[0].content).toContain('preserve that framing');
        // Budget variance rule preserved
        expect(request.messages[0].content).toContain('Mention budget variance, forecast, or plan-vs-actual only');
        // Card narrative payload is passed
        expect(request.messages[1].content).toContain('"displayTitle": "Revenue by Region"');
        expect(request.messages[1].content).toContain('"semanticRole": "business_dimension"');
        expect(request.messages[1].content).toContain('"narrativeEligibility": "preferred"');
    });

    it('user prompt for executive brief requests numbered findings with recommended actions', async () => {
        generateTextMock.mockResolvedValue({ text: 'brief output' });

        await generateFinalSummary(cards, settings);

        const request = generateTextMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
        const userContent = request.messages[1].content;
        // User prompt must request the structured format
        expect(userContent).toContain('Key Findings');
        expect(userContent).toContain('Recommended Action');
        expect(userContent).toContain('Data Confidence Assessment');
        expect(userContent).toContain('3 to 5 findings total');
        // Anti-vague rules enforced in user prompt too
        expect(userContent).toContain('significant');
        expect(userContent).toContain('Concrete');
    });

    it('returns the model output as LocalizedText with correct language', async () => {
        generateTextMock.mockResolvedValue({ text: '### Key Findings\n1. **East leads** — 500 SGD. Confidence: high\n   → Action: drill down.' });

        const result = await generateFinalSummary(cards, { ...settings, language: 'Mandarin' } as never);

        expect(result.language).toBe('Mandarin');
        expect(result.text).toContain('Key Findings');
    });

    it('passes display-safe helper aliases into the core analysis summary context', async () => {
        generateTextMock.mockResolvedValue({ text: 'Initial analysis summary' });

        await generateCoreAnalysisSummary(
            [{
                id: 'card-2',
                title: 'Revenue by Project',
                description: 'Compare revenue by project.',
                groupByColumn: 'SeriesLabelL1',
                valueColumn: 'Value',
                aggregatedDataSample: [{ SeriesLabelL1: '36 TUAS ROAD', Value: 20 }],
            }],
            [
                { name: 'SeriesLabelL1', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Value', type: 'numerical', missingPercentage: 0, valueRange: [10, 20] },
            ],
            settings,
        );

        const request = generateTextMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
        expect(request.messages[1].content).toContain('User-facing column label hints');
        expect(request.messages[1].content).toContain('SeriesLabelL1 -> Project');
        expect(request.messages[1].content).toContain('"title": "Revenue by Project"');
    });

    it('injects report context into summary generation when raw report metadata is available', async () => {
        generateTextMock.mockResolvedValue({ text: 'Card summary' });

        await generateSummary(
            'Revenue by Region',
            [{ Region: 'East', Revenue: 20 }],
            settings,
            columns,
            {
                rawCsvData: {
                    fileName: 'revenue-report.csv',
                    data: [{ Region: 'East', Revenue: '20' }],
                    metadataRows: [
                        ['Revenue Report'],
                        ['Period: Jul 2025'],
                    ],
                    summaryRows: [['Generated on 2026-03-13']],
                    headerDepth: 1,
                },
                csvData: {
                    fileName: 'revenue-report.csv',
                    data: [{ Region: 'East', Revenue: 20 }],
                    metadataRows: [],
                    summaryRows: [],
                    headerDepth: 1,
                },
            } as never,
        );

        const request = generateTextMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
        expect(request.messages[1].content).toContain('Report context:');
        expect(request.messages[1].content).toContain('Report title: Revenue Report');
        expect(request.messages[1].content).toContain('Period: Jul 2025');
        expect(request.messages[1].content).toContain('Generated on 2026-03-13');
    });

    it('uses the validated effective report context downstream when AI extraction is low confidence', async () => {
        generateTextMock.mockResolvedValue({ text: 'Card summary' });

        await generateSummary(
            'Revenue by Region',
            [{ Region: 'East', Revenue: 20 }],
            settings,
            columns,
            {
                rawCsvData: {
                    fileName: 'revenue-report.csv',
                    data: [{ Region: 'East', Revenue: '20' }],
                    metadataRows: [['Fallback Revenue Report']],
                    summaryRows: [],
                    headerDepth: 1,
                },
                csvData: {
                    fileName: 'revenue-report.csv',
                    data: [{ Region: 'East', Revenue: 20 }],
                    metadataRows: [],
                    summaryRows: [],
                    headerDepth: 1,
                },
                reportContextResolution: {
                    aiExtracted: {
                        reportTitle: 'AI Guess Revenue Report',
                        reportDescription: 'Revenue report overview.',
                        parameterLines: ['Period: Jul 2025'],
                        footerLines: [],
                        candidateHeaderLine: null,
                        confidence: 'low',
                        reasoning: 'Weak evidence.',
                    },
                    fallback: {
                        sourceFile: 'revenue-report.csv',
                        reportTitle: 'Fallback Revenue Report',
                        reportDescription: null,
                        parameterLines: [],
                        footerLines: [],
                        candidateHeaderLine: null,
                        notes: [],
                        source: 'fallback',
                        confidence: null,
                    },
                    effective: {
                        sourceFile: 'revenue-report.csv',
                        reportTitle: 'Fallback Revenue Report',
                        reportDescription: null,
                        parameterLines: [],
                        footerLines: [],
                        candidateHeaderLine: null,
                        notes: [],
                        source: 'fallback',
                        confidence: 'low',
                    },
                    verification: {
                        passed: false,
                        usedFallback: true,
                        reason: 'low_confidence',
                        aiConfidence: 'low',
                        issues: [],
                    },
                    generatedAt: '2026-03-13T00:00:00.000Z',
                },
            } as never,
        );

        const request = generateTextMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
        expect(request.messages[1].content).toContain('Report title: Fallback Revenue Report');
        expect(request.messages[1].content).not.toContain('Report title: AI Guess Revenue Report');
    });

    it('emits silent_failure telemetry when generateSummary AI call throws', async () => {
        generateTextMock.mockRejectedValue(new Error('Network error'));
        const recordRuntimeEvent = vi.fn();
        const telemetryTarget = { recordRuntimeEvent };

        const result = await generateSummary(
            'Revenue by Region',
            [{ Region: 'East', Revenue: 20 }],
            settings,
            columns,
            telemetryTarget as never,
        );

        expect(result.text).toBe('Failed to generate AI summary.');
        expect(recordRuntimeEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'silent_failure',
                detail: expect.objectContaining({
                    component: 'SummaryGenerator',
                    recoveryAction: 'fallback_text_shown',
                    userNotified: false,
                }),
            }),
        );
    });

    it('emits silent_failure telemetry when generateCoreAnalysisSummary AI call throws', async () => {
        generateTextMock.mockRejectedValue(new Error('Model unavailable'));
        const recordRuntimeEvent = vi.fn();
        const telemetryTarget = { recordRuntimeEvent };

        const result = await generateCoreAnalysisSummary(cardContext, columns, settings, telemetryTarget as never);

        expect(result.text).toBe('An error occurred while the AI was forming its initial analysis.');
        expect(recordRuntimeEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'silent_failure',
                detail: expect.objectContaining({
                    component: 'SummaryGenerator',
                    recoveryAction: 'core_analysis_fallback_text_shown',
                }),
            }),
        );
    });

    it('emits silent_failure telemetry when generateFinalSummary AI call throws', async () => {
        generateTextMock.mockRejectedValue(new Error('Timeout'));
        const recordRuntimeEvent = vi.fn();
        const telemetryTarget = { recordRuntimeEvent };

        const result = await generateFinalSummary(cards, settings, telemetryTarget as never);

        expect(result.text).toBe('Failed to generate the final AI summary.');
        expect(recordRuntimeEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'silent_failure',
                detail: expect.objectContaining({
                    component: 'SummaryGenerator',
                    recoveryAction: 'final_summary_fallback_text_shown',
                }),
            }),
        );
    });

    it('does not throw when telemetryTarget has no recordRuntimeEvent (graceful no-op)', async () => {
        generateTextMock.mockRejectedValue(new Error('API error'));

        // telemetryTarget without recordRuntimeEvent — must not throw
        const result = await generateSummary(
            'Test Chart',
            [{ x: 1 }],
            settings,
            columns,
            {} as never,
        );
        expect(result.text).toBe('Failed to generate AI summary.');
    });

    it('falls back to neutral narrative payloads when only helper-heavy cards are available', async () => {
        generateTextMock.mockResolvedValue({ text: 'Final summary' });

        await generateFinalSummary([
            {
                id: 'helper-card',
                plan: {
                    title: 'Total Value by Source Row',
                    description: 'Compare total value by source row.',
                    chartType: 'bar',
                    groupByColumn: 'SourceRowIndex',
                    valueColumn: 'Value',
                    aggregation: 'sum',
                },
                aggregatedData: [{ SourceRowIndex: 0, Value: 22191666.85 }],
                summary: {
                    language: 'English',
                    text: 'Source row 0 is the highest entry.',
                },
                displayChartType: 'bar',
                isDataVisible: false,
                topN: null,
                hideOthers: false,
                hiddenLabels: [],
                autoAnalysisEvaluation: {
                    verdict: 'trusted',
                    reasonCodes: [],
                    detail: 'trusted',
                    evaluatedAt: new Date().toISOString(),
                    source: 'auto_analysis_evaluator_v1',
                },
            },
        ], settings);

        const request = generateTextMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
        expect(request.messages[1].content).toContain('"displayTitle": "Total Value by Source Row"');
        expect(request.messages[1].content).toContain('"narrativeEligibility": "avoid_if_possible"');
        expect(request.messages[1].content).toContain('"helperExposureLevel": "high"');
    });
});
