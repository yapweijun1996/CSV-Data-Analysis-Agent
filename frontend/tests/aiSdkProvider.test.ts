import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings, ToolDescriptor } from '../types';
import { buildAiSdkTools } from '../services/ai/aiSdkToolAdapter';
import { createTestSettings } from './testSettings';
import {
    createProviderModel,
    isProviderConfigured,
    resolveProviderApiKey,
    resolveProviderModelId,
} from '../services/ai/providerConfig';

const {
    createGoogleMock,
    createOpenAIMock,
    extractJsonMiddlewareMock,
    jsonSchemaMock,
    toolMock,
    wrapLanguageModelMock,
} = vi.hoisted(() => ({
    createGoogleMock: vi.fn(() => vi.fn((modelId: string) => ({ provider: 'google', modelId }))),
    createOpenAIMock: vi.fn(() => vi.fn((modelId: string) => ({ provider: 'openai', modelId }))),
    extractJsonMiddlewareMock: vi.fn(() => ({})),
    jsonSchemaMock: vi.fn((schema: unknown) => schema),
    toolMock: vi.fn((definition: unknown) => definition),
    wrapLanguageModelMock: vi.fn(({ model }: { model: unknown }) => model),
}));

vi.mock('ai', () => ({
    extractJsonMiddleware: extractJsonMiddlewareMock,
    jsonSchema: jsonSchemaMock,
    tool: toolMock,
    wrapLanguageModel: wrapLanguageModelMock,
}));

vi.mock('@ai-sdk/openai', () => ({
    createOpenAI: createOpenAIMock,
}));

vi.mock('@ai-sdk/google', () => ({
    createGoogleGenerativeAI: createGoogleMock,
}));

const openAiSettings: Settings = createTestSettings({
    provider: 'openai',
    openAIApiKey: 'openai-key',
    simpleModel: 'gpt-5-mini',
    complexModel: 'gpt-5.2',
    language: 'English',
    autoConfirmGoal: true,
});

const googleSettings: Settings = createTestSettings({
    provider: 'google',
    geminiApiKey: 'gemini-key',
    simpleModel: 'gemini-3-flash-preview',
    complexModel: 'gemini-3-flash-preview',
    language: 'English',
    autoConfirmGoal: true,
});

describe('AI SDK helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('resolves provider configuration from settings', () => {
        expect(resolveProviderApiKey(openAiSettings)).toBe('openai-key');
        expect(resolveProviderApiKey(googleSettings)).toBe('gemini-key');
        expect(resolveProviderModelId(openAiSettings)).toBe('gpt-5.2');
        expect(resolveProviderModelId(googleSettings, 'gemini-2.5-pro')).toBe('gemini-2.5-pro');
        expect(isProviderConfigured(openAiSettings)).toBe(true);
        expect(isProviderConfigured({ ...googleSettings, geminiApiKey: '   ' })).toBe(false);
    });

    it('creates OpenAI and Google models through the official provider factories', () => {
        const openAiModel = createProviderModel(openAiSettings);
        const googleModel = createProviderModel(googleSettings, 'gemini-2.5-pro');

        expect(createOpenAIMock).toHaveBeenCalledWith(
            expect.objectContaining({
                apiKey: 'openai-key',
                fetch: expect.any(Function),
            }),
        );
        expect(createGoogleMock).toHaveBeenCalledWith({ apiKey: 'gemini-key' });
        expect(openAiModel).toEqual({
            modelId: 'gpt-5.2',
            model: { provider: 'openai', modelId: 'gpt-5.2' },
        });
        expect(googleModel).toEqual({
            modelId: 'gemini-2.5-pro',
            model: { provider: 'google', modelId: 'gemini-2.5-pro' },
        });
    });

    it('builds official AI SDK tools and sanitizes incompatible Google union schemas', () => {
        const descriptors: ToolDescriptor[] = [
            {
                name: 'data.mutate',
                description: 'Apply deterministic dataset operations.',
                category: 'data',
                risk: 'high',
                enabledByDefault: true,
                inputSchema: {
                    type: 'object',
                    properties: {
                        explanation: { type: 'string' },
                        operations: {
                            type: 'array',
                            items: {
                                anyOf: [
                                    {
                                        type: 'object',
                                        properties: {
                                            type: { type: 'string', enum: ['unpivot_columns'] },
                                            sourceColumns: { type: 'array', items: { type: 'string' } },
                                            keepColumns: {
                                                anyOf: [
                                                    { type: 'string', enum: ['*'] },
                                                    { type: 'array', items: { type: 'string' } },
                                                ],
                                            },
                                        },
                                        required: ['type', 'sourceColumns'],
                                    },
                                    {
                                        type: 'object',
                                        properties: {
                                            type: { type: 'string', enum: ['drop_columns'] },
                                            columns: { type: 'array', items: { type: 'string' } },
                                        },
                                        required: ['type', 'columns'],
                                    },
                                ],
                            },
                        },
                    },
                    required: ['explanation', 'operations'],
                },
            },
        ];

        const googleTools = buildAiSdkTools(descriptors, { provider: 'google' });

        expect(Object.keys(googleTools)).toEqual(['data.mutate']);
        expect(toolMock).toHaveBeenCalledTimes(1);

        const definition = toolMock.mock.calls[0]?.[0] as { inputSchema?: Record<string, unknown> };
        const schema = definition.inputSchema as Record<string, unknown>;
        const properties = schema.properties as Record<string, unknown>;
        const operations = properties.operations as Record<string, unknown>;
        const operationItems = operations.items as Record<string, unknown>;
        const keepColumns = (operationItems.properties as Record<string, unknown>).keepColumns as Record<string, unknown>;

        expect(schema.type).toBe('object');
        expect(operationItems.anyOf).toBeUndefined();
        expect(operationItems.type).toBe('object');
        expect(Array.isArray(operationItems.required)).toBe(false);
        expect(keepColumns.anyOf).toBeUndefined();
        expect(jsonSchemaMock).toHaveBeenCalled();
    });
});
