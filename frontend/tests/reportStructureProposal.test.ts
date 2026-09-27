import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMultiHeaderIntakeIr } from './reportShapeFixtures/cases';
import { createTestSettings } from './testSettings';

const generateTextMock = vi.fn();
const isProviderConfiguredMock = vi.fn();
const createProviderModelMock = vi.fn();

vi.mock('ai', () => ({
    Output: {
        object: (value: unknown) => value,
    },
    generateText: (...args: unknown[]) => generateTextMock(...args),
    streamText: (...args: unknown[]) => {
        const result = generateTextMock(...args);
        return {
            fullStream: (async function* () {})(),
            text: result.then((r: { text?: string }) => r.text ?? ''),
            finishReason: Promise.resolve('stop'),
            output: result.then((r: { output?: unknown }) => r.output),
        };
    },
    jsonSchema: (value: unknown) => value,
}));

vi.mock('../services/ai/providerConfig', () => ({
    isProviderConfigured: (...args: unknown[]) => isProviderConfiguredMock(...args),
    createProviderModel: (...args: unknown[]) => createProviderModelMock(...args),
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

vi.mock('../services/ai/googleSchemaAdapter', () => ({
    prepareSchemaForProvider: (value: unknown) => value,
}));

vi.mock('../services/ai/contextManager', () => ({
    createContextSection: (name: string, content: string) => ({ name, content }),
    prepareManagedContext: async (input: { systemText: string; sections: Array<{ content: string }> }) => ({
        systemText: input.systemText,
        userText: input.sections.map(section => section.content).join('\n'),
        diagnostics: null,
    }),
    reportContextDiagnostics: vi.fn(),
}));

vi.mock('../services/ai/overflowRetry', () => ({
    runWithOverflowCompaction: async (input: { execute: (mode: 'compact') => Promise<unknown> }) => input.execute('compact'),
}));

describe('reportStructureProposal', () => {
    beforeEach(() => {
        generateTextMock.mockReset();
        isProviderConfiguredMock.mockReset();
        createProviderModelMock.mockReset();
        createProviderModelMock.mockReturnValue({ modelId: 'mock-model', model: {} });
    });

    it('returns null when the provider is not configured', async () => {
        isProviderConfiguredMock.mockReturnValue(false);
        const { detectReportStructureProposalWithAi } = await import('../services/ai/reportStructureProposal');
        const intakeIr = createMultiHeaderIntakeIr();
        const boundary = {
            headerRowIndex: intakeIr.provisionalTable!.headerRowIndex,
            headerLayerRowIndexes: [...intakeIr.provisionalTable!.headerLayerRowIndexes],
            bodyStartIndex: intakeIr.provisionalTable!.bodyStartIndex,
            summaryStartIndex: intakeIr.provisionalTable!.summaryStartIndex,
            parameterRowIndexes: [...intakeIr.provisionalTable!.parameterRowIndexes],
            repeatedHeaderRowIndexes: [...intakeIr.provisionalTable!.repeatedHeaderRowIndexes],
        };

        const proposal = await detectReportStructureProposalWithAi({
            rawIntakeIr: intakeIr,
            boundary,
            settings: createTestSettings(),
        });

        expect(proposal).toBeNull();
    });

    it('drops malformed AI proposal payloads', async () => {
        isProviderConfiguredMock.mockReturnValue(true);
        generateTextMock.mockResolvedValue({ output: { confidence: 0.8, reasoning: 'incomplete' } });
        const { detectReportStructureProposalWithAi } = await import('../services/ai/reportStructureProposal');
        const intakeIr = createMultiHeaderIntakeIr();
        const boundary = {
            headerRowIndex: intakeIr.provisionalTable!.headerRowIndex,
            headerLayerRowIndexes: [...intakeIr.provisionalTable!.headerLayerRowIndexes],
            bodyStartIndex: intakeIr.provisionalTable!.bodyStartIndex,
            summaryStartIndex: intakeIr.provisionalTable!.summaryStartIndex,
            parameterRowIndexes: [...intakeIr.provisionalTable!.parameterRowIndexes],
            repeatedHeaderRowIndexes: [...intakeIr.provisionalTable!.repeatedHeaderRowIndexes],
        };

        const proposal = await detectReportStructureProposalWithAi({
            rawIntakeIr: intakeIr,
            boundary,
            settings: createTestSettings({ geminiApiKey: 'test-key' }),
        });

        expect(proposal).toBeNull();
    });

    it('normalizes a valid AI proposal payload', async () => {
        isProviderConfiguredMock.mockReturnValue(true);
        generateTextMock.mockResolvedValue({
            output: {
                purpose: {
                    summary: 'Track order-line progress and commercial values.',
                    confidence: 0.84,
                },
                grain: {
                    columns: ['Buyer Confirmation'],
                    description: 'One prepared row per buyer-confirmation line.',
                    confidence: 0.82,
                },
                fields: [
                    {
                        columnName: 'Buyer Confirmation',
                        role: 'identifier',
                        confidence: 0.9,
                        reasoning: 'Visible order-line identifier.',
                    },
                ],
                pivot: {
                    shape: 'row_table',
                    dimensionColumns: ['Buyer Confirmation'],
                    measureColumns: [],
                    labelColumns: [],
                    confidence: 0.82,
                },
                bodyRowRoles: [{ rowIndex: 6, role: 'detail', confidence: 0.88 }],
                carryForwardColumns: ['Buyer Confirmation'],
                sectionLabelColumns: ['Description'],
                detailInclusionRoles: ['detail'],
                confidence: 0.81,
                reasoning: 'Use parent dimensions as carry-forward fields.',
            },
        });
        const { detectReportStructureProposalWithAi } = await import('../services/ai/reportStructureProposal');
        const intakeIr = createMultiHeaderIntakeIr();
        const boundary = {
            headerRowIndex: intakeIr.provisionalTable!.headerRowIndex,
            headerLayerRowIndexes: [...intakeIr.provisionalTable!.headerLayerRowIndexes],
            bodyStartIndex: intakeIr.provisionalTable!.bodyStartIndex,
            summaryStartIndex: intakeIr.provisionalTable!.summaryStartIndex,
            parameterRowIndexes: [...intakeIr.provisionalTable!.parameterRowIndexes],
            repeatedHeaderRowIndexes: [...intakeIr.provisionalTable!.repeatedHeaderRowIndexes],
        };

        const proposal = await detectReportStructureProposalWithAi({
            rawIntakeIr: intakeIr,
            boundary,
            settings: createTestSettings({ geminiApiKey: 'test-key' }),
        });

        expect(proposal?.carryForwardColumns).toEqual(['Buyer Confirmation']);
        expect(proposal?.sectionLabelColumns).toEqual(['Description']);
        expect(proposal?.detailInclusionRoles).toEqual(['detail']);
        expect(proposal?.bodyRowRoles).toHaveLength(1);
        expect(proposal?.purpose.summary).toContain('order-line');
        expect(proposal?.grain.columns).toEqual(['Buyer Confirmation']);
        expect(proposal?.fields[0]?.role).toBe('identifier');
        expect(proposal?.pivot.shape).toBe('row_table');
    });
});
