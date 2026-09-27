// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnProfile, CsvData, Settings } from '../types';
import { annotateDatasetSemantics } from '../services/ai/datasetSemanticAnnotator';
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
        const result = generateTextMock(...args);
        return {
            fullStream: (async function* () {})(),
            text: result.then((r: { text?: string }) => r.text ?? ''),
            finishReason: Promise.resolve('stop'),
            output: result.then((r: { output?: unknown }) => r.output),
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

describe('annotateDatasetSemantics', () => {
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
        data: Array.from({ length: 80 }, (_value, index) => ({
            Code: `50${index.toString().padStart(3, '0')}`,
            Description: index >= 72 ? `Subtotal ${index}` : `Project ${index}`,
            SeriesKey: `100${index % 8}`,
            Value: index * 100,
            SeriesLabelL1: `Entity ${index % 4}`,
        })),
        metadataRows: [
            ['Income Statement by Project'],
            ['Period: Jan 2026'],
        ],
        headerLayers: [['Code', 'Description', 'SeriesKey', 'Value', 'SeriesLabelL1']],
        summaryRows: [],
        headerDepth: 1,
    };

    const columns: ColumnProfile[] = [
        { name: 'Code', type: 'categorical', uniqueValues: 80, missingPercentage: 0 },
        { name: 'Description', type: 'categorical', uniqueValues: 80, missingPercentage: 0 },
        { name: 'SeriesKey', type: 'categorical', uniqueValues: 8, missingPercentage: 0 },
        { name: 'Value', type: 'currency', missingPercentage: 0 },
        { name: 'SeriesLabelL1', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        generateTextMock.mockResolvedValue({
            output: {
                datasetRole: 'mixed_report',
                rowAnnotations: [
                    { rowIndex: 72, rowRole: 'subtotal', confidence: 0.91, reason: 'Subtotal row.' },
                ],
                columnAnnotations: [
                    { columnName: 'Code', semanticRole: 'code', confidence: 0.9, reason: 'Identifier.' },
                    { columnName: 'Description', semanticRole: 'label', confidence: 0.9, reason: 'Label.' },
                    { columnName: 'Value', semanticRole: 'metric', confidence: 1, reason: 'Amount.' },
                ],
                summary: 'Prepared dataset contains detail and subtotal rows.',
            },
        });
    });

    it('builds a compact semantic annotation prompt and returns a sanitized snapshot', async () => {
        const snapshot = await annotateDatasetSemantics({
            data,
            columns,
            settings,
        });

        expect(snapshot?.datasetRole).toBe('mixed_report');
        expect(snapshot?.recommendedAnalysisView.excludedRowIndices).toEqual(
            Array.from({ length: 8 }, (_value, index) => 72 + index),
        );

        const prompt = generateTextMock.mock.calls[0]?.[0].messages[1].content as string;
        const rowIndexMatches = prompt.match(/"rowIndex":/g) ?? [];

        expect(prompt).toContain('Dataset context summary:');
        expect(prompt).toContain('Detected report shape: already_tabular');
        expect(prompt).toContain('Header hint: Code | Description | SeriesLabelL1 | SeriesKey | Value');
        expect(prompt).toContain('Dimension columns: Description, SeriesLabelL1');
        expect(prompt).toContain('Metric columns: Value');
        expect(prompt).not.toContain('"dimensionColumns"');
        expect(rowIndexMatches.length).toBeLessThanOrEqual(20);
    });

    it('prioritizes obvious subtotal rows in the candidate sample and backfills deterministic column roles', async () => {
        const middleSubtotalData: CsvData = {
            ...data,
            data: Array.from({ length: 80 }, (_value, index) => ({
                Code: `70${index.toString().padStart(3, '0')}`,
                Description: index === 39 ? 'Subtotal' : `Project ${index}`,
                SeriesKey: `200${index % 8}`,
                Value: index * 50,
                SeriesLabelL1: `Entity ${index % 4}`,
            })),
        };

        generateTextMock.mockResolvedValueOnce({
            output: {
                datasetRole: 'mixed_report',
                rowAnnotations: [],
                columnAnnotations: [],
                summary: 'Model returned sparse annotations.',
            },
        });

        const snapshot = await annotateDatasetSemantics({
            data: middleSubtotalData,
            columns,
            settings,
        });

        const prompt = generateTextMock.mock.calls[0]?.[0].messages[1].content as string;
        expect(prompt).toContain('"rowIndex": 39');
        expect(snapshot?.rowAnnotations).toEqual(expect.arrayContaining([
            expect.objectContaining({ rowIndex: 39, rowRole: 'subtotal' }),
        ]));
        expect(snapshot?.columnAnnotations).toEqual(expect.arrayContaining([
            expect.objectContaining({ columnName: 'Code', semanticRole: 'code' }),
            expect.objectContaining({ columnName: 'Value', semanticRole: 'metric' }),
        ]));
    });
});
