// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnProfile, Settings } from '../types';
import { generateAnalysisGoalCandidates } from '../services/ai/goalGenerator';
import { buildSemanticDatasetVersion } from '../services/agent/datasetSemantics';
import { createTestSettings } from './testSettings';

const {
    createProviderModelMock,
    generateTextMock,
    isProviderConfiguredMock,
} = vi.hoisted(() => ({
    createProviderModelMock: vi.fn(() => ({ model: { provider: 'google', modelId: 'gemini-3-flash-preview' }, modelId: 'gemini-3-flash-preview' })),
    generateTextMock: vi.fn(),
    isProviderConfiguredMock: vi.fn(() => true),
}));

vi.mock('ai', () => ({
    extractJsonMiddleware: vi.fn(() => ({})),
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
    Output: {
        object: vi.fn(() => ({})),
    },
    jsonSchema: vi.fn((schema: unknown) => schema),
    wrapLanguageModel: vi.fn(({ model }: { model: unknown }) => model),
}));

vi.mock('../services/ai/providerConfig', async importOriginal => {
    const actual = await importOriginal<typeof import('../services/ai/providerConfig')>();
    return {
        ...actual,
        createProviderModel: createProviderModelMock,
        isProviderConfigured: isProviderConfiguredMock,
        validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
        invalidateProviderHealthCache: () => {},
    };
});

describe('generateAnalysisGoalCandidates', () => {
    const settings: Settings = createTestSettings({
        provider: 'google',
        geminiApiKey: 'key',
        simpleModel: 'gemini-3-flash-preview',
        complexModel: 'gemini-3-flash-preview',
        language: 'English',
        autoConfirmGoal: true,
    });

    const columns: ColumnProfile[] = [
        { name: 'Project', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
        { name: 'Amount', type: 'currency', missingPercentage: 0, valueRange: [10, 40] },
    ];

    const sampleData = [
        { Project: 'Total', Amount: 40 },
        { Project: 'Alpha', Amount: 10 },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        generateTextMock.mockResolvedValue({
            output: {
                goals: [
                    { title: 'Review project totals', description: 'Compare amount by project.', confidence: 0.82 },
                    { title: 'Inspect outliers', description: 'Find unusual project values.', confidence: 0.61 },
                ],
            },
        });
    });

    it('injects current dataset semantics into goal generation prompts', async () => {
        const semanticDatasetVersion = buildSemanticDatasetVersion({
            fileName: 'prepared.csv',
            data: sampleData,
        } as never);

        await generateAnalysisGoalCandidates(
            columns,
            sampleData,
            settings,
            {
                rawCsvData: {
                    fileName: 'prepared.csv',
                    data: [{ Project: 'Total', Amount: '40' }, { Project: 'Alpha', Amount: '10' }],
                    metadataRows: [['Project Amount Report']],
                    summaryRows: [],
                    headerDepth: 1,
                },
                csvData: {
                    fileName: 'prepared.csv',
                    data: sampleData,
                    metadataRows: [],
                    summaryRows: [],
                    headerDepth: 1,
                },
                datasetSemanticSnapshot: {
                    datasetRole: 'mixed_report',
                    rowAnnotations: [
                        { rowIndex: 0, rowRole: 'grand_total', confidence: 0.98, reason: 'Aggregate total row.' },
                    ],
                    columnAnnotations: [
                        { columnName: 'Project', semanticRole: 'entity', confidence: 0.91, reason: 'Project label.' },
                        { columnName: 'Amount', semanticRole: 'metric', confidence: 0.96, reason: 'Numeric measure.' },
                    ],
                    recommendedAnalysisView: {
                        mode: 'soft_exclude',
                        includedRowIndices: [1],
                        excludedRowIndices: [0],
                        includedRowCount: 1,
                        excludedRowCount: 1,
                        reason: 'Hide non-detail total rows.',
                    },
                    summary: 'Mixed report with a grand total row.',
                    generatedAt: '2026-03-15T00:00:00.000Z',
                    modelId: 'gemini-test',
                    sourceDatasetVersion: semanticDatasetVersion,
                },
                semanticDatasetVersion,
            } as never,
        );

        const request = generateTextMock.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
        expect(request.messages[1]?.content).toContain('Dataset semantics:');
        expect(request.messages[1]?.content).toContain('Dataset role: mixed_report');
        expect(request.messages[1]?.content).toContain('Default analysis view hides 1 row(s) and keeps 1 row(s).');
        expect(request.messages[1]?.content).toContain('row 1: grand_total');
        expect(request.messages[1]?.content).toContain('Project: business_entity');
        expect(request.messages[1]?.content).toContain('Amount: metric');
        expect(request.messages[1]?.content).toContain('Header semantics: unknown');
        expect(request.messages[1]?.content).toContain('Preferred grain columns: Project');
        expect(request.messages[1]?.content).toContain('Preferred time columns: none');
        expect(request.messages[1]?.content).toContain('Preferred metric terms: Amount');
        expect(request.messages[1]?.content).toContain('Preferred business terms: Project Amount');
    });
});
