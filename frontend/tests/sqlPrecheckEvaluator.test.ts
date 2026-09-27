// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnProfile, CsvData, Settings } from '../types';
import { evaluateAiSqlPrecheck } from '../services/ai/sqlPrecheckEvaluator';
import { createTestSettings } from './testSettings';

const {
    createProviderModelMock,
    generateTextMock,
    isProviderConfiguredMock,
} = vi.hoisted(() => ({
    createProviderModelMock: vi.fn(() => ({ model: { provider: 'google', modelId: 'gemini-3.1-flash-lite-preview' }, modelId: 'gemini-3.1-flash-lite-preview' })),
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
    Output: {
        object: (value: unknown) => value,
    },
    jsonSchema: (value: unknown) => value,
}));

vi.mock('../services/ai/providerConfig', () => ({
    createProviderModel: createProviderModelMock,
    isProviderConfigured: isProviderConfiguredMock,
    resolveModelContextProfile: vi.fn(() => ({
        contextWindow: null,
        reserveTokens: 0,
        keepRecentTokens: 4000,
        strategy: 'fallback_static',
    })),
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

describe('evaluateAiSqlPrecheck', () => {
    const settings: Settings = createTestSettings({
        provider: 'google',
        geminiApiKey: 'key',
        simpleModel: 'gemini-3.1-flash-lite-preview',
        complexModel: 'gemini-3.1-flash-lite-preview',
        language: 'English',
        autoConfirmGoal: true,
    });

    const data: CsvData = {
        fileName: 'prepared.csv',
        data: [
            { Description: 'Revenue', Value: 1200, Code: 501001 },
            { Description: 'Cost of Sales', Value: 900, Code: 501002 },
            { Description: 'Gross Profit', Value: 300, Code: 501003 },
        ],
    };

    const columns: ColumnProfile[] = [
        { name: 'Description', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
        { name: 'Value', type: 'currency', uniqueValues: 3, missingPercentage: 0, valueRange: [300, 1200] },
        { name: 'Code', type: 'numerical', uniqueValues: 3, missingPercentage: 0, valueRange: [501001, 501003] },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        generateTextMock.mockResolvedValue({
            output: {
                status: 'passed',
                summary: 'Value by Description looks viable.',
                candidatePairs: [
                    {
                        dimension: 'Description',
                        metric: 'Value',
                        confidence: 'high',
                        reason: 'Description contains business labels and Value is the amount field.',
                    },
                    {
                        dimension: 'Code',
                        metric: 'Description',
                        confidence: 'low',
                        reason: 'Invalid pair that should be dropped.',
                    },
                ],
                findings: [
                    {
                        kind: 'high_fragmentation',
                        severity: 'warn',
                        metric: 'Value',
                        dimension: 'Description',
                        message: 'Long tail possible.',
                    },
                ],
            },
        });
    });

    it('returns sanitized AI candidate pairs and findings', async () => {
        const result = await evaluateAiSqlPrecheck({ data, columns, settings });

        expect(result).toMatchObject({
            status: 'passed',
            summary: 'Value by Description looks viable.',
            candidatePairs: [
                {
                    dimension: 'Description',
                    metric: 'Value',
                    confidence: 'high',
                },
            ],
        });
        expect(result?.findings).toHaveLength(1);
        const prompt = generateTextMock.mock.calls[0]?.[0].messages[1].content as string;
        expect(prompt).toContain('Assess SQL analysis readiness');
        expect(prompt).toContain('Prepared row sample:');
    });

    it('returns null when provider is not configured', async () => {
        isProviderConfiguredMock.mockReturnValueOnce(false);

        const result = await evaluateAiSqlPrecheck({ data, columns, settings });

        expect(result).toBeNull();
        expect(generateTextMock).not.toHaveBeenCalled();
    });
});
