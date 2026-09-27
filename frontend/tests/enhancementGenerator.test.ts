// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardContext, Settings } from '../types';
import { generateCardEnhancementSuggestions } from '../services/ai/enhancementGenerator';
import { createTestSettings } from './testSettings';

const {
    createProviderModelMock,
    generateTextMock,
    isProviderConfiguredMock,
    jsonSchemaMock,
    outputObjectMock,
} = vi.hoisted(() => ({
    createProviderModelMock: vi.fn(() => ({ model: { provider: 'google', modelId: 'gemini-3-flash-preview' } })),
    generateTextMock: vi.fn(),
    isProviderConfiguredMock: vi.fn(() => true),
    jsonSchemaMock: vi.fn((schema: unknown) => schema),
    outputObjectMock: vi.fn((options: unknown) => options),
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
        object: outputObjectMock,
    },
    jsonSchema: jsonSchemaMock,
}));

vi.mock('../services/ai/providerConfig', () => ({
    createProviderModel: createProviderModelMock,
    isProviderConfigured: isProviderConfiguredMock,
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

describe('generateCardEnhancementSuggestions', () => {
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
            title: 'Spend Distribution by Business Unit',
            aggregatedDataSample: [{ BU: 'A', Spend: 100 }],
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('filters out informational or malformed suggestions', async () => {
        generateTextMock.mockResolvedValue({
            output: {
                suggestions: [
                    {
                        cardId: 'card-1',
                        rationale: 'Informational only.',
                        priority: 'low',
                        action: 'none',
                    },
                    {
                        cardId: 'card-1',
                        rationale: 'Add unit share.',
                        priority: 'high',
                        action: 'add_calculated_column',
                        proposedColumnName: 'Spend Share',
                        formula: "'Spend' / 100",
                    },
                    {
                        cardId: 'card-1',
                        rationale: 'Missing formula.',
                        priority: 'medium',
                        action: 'add_calculated_column',
                        proposedColumnName: 'Broken Suggestion',
                    },
                ],
            },
        });

        const result = await generateCardEnhancementSuggestions(cardContext, settings);

        expect(result).toEqual([
            expect.objectContaining({
                cardId: 'card-1',
                action: 'add_calculated_column',
                proposedColumnName: 'Spend Share',
                formula: "'Spend' / 100",
            }),
        ]);
    });
});
