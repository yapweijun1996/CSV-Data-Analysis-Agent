// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CsvData, Settings } from '../types';
import { extractAiReportContext } from '../services/ai/reportContextExtractor';
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

describe('extractAiReportContext', () => {
    const settings: Settings = createTestSettings({
        provider: 'google',
        geminiApiKey: 'key',
        simpleModel: 'gemini-3-flash-preview',
        complexModel: 'gemini-3-flash-preview',
        language: 'English',
        autoConfirmGoal: true,
    });

    const data: CsvData = {
        fileName: 'report.csv',
        data: [{ Project: 'Alpha', Amount: '1000' }],
        metadataRows: [
            ['Revenue Report'],
            ['Period: Jul 2025'],
        ],
        headerLayers: [['Project', 'Amount']],
        summaryRows: [{ note: 'Generated on 2026-03-13' }],
        headerDepth: 1,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        generateTextMock.mockResolvedValue({
            output: {
                reportTitle: 'Revenue Report',
                reportDescription: 'Revenue report by project for Jul 2025.',
                parameterLines: ['Period: Jul 2025', 'Period: Jul 2025'],
                footerLines: ['Generated on 2026-03-13'],
                candidateHeaderLine: ['Project', 'Amount'],
                confidence: 'high',
                reasoning: 'The title and parameter line are explicit in metadata rows.',
            },
        });
    });

    it('returns structured AI report context and sanitizes duplicates', async () => {
        const result = await extractAiReportContext(data, settings);

        expect(result).toMatchObject({
            reportTitle: 'Revenue Report',
            parameterLines: ['Period: Jul 2025'],
            footerLines: ['Generated on 2026-03-13'],
            candidateHeaderLine: ['Project', 'Amount'],
            confidence: 'high',
        });
        expect(generateTextMock).toHaveBeenCalledTimes(1);
    });

    it('merges preserved metadata parameter lines when AI omits them', async () => {
        generateTextMock.mockResolvedValueOnce({
            output: {
                reportTitle: 'Revenue Report',
                reportDescription: 'Revenue report by project.',
                parameterLines: [],
                footerLines: [],
                candidateHeaderLine: ['Project', 'Amount'],
                confidence: 'high',
                reasoning: 'The title is explicit, but the parameter lines are not returned.',
            },
        });

        const result = await extractAiReportContext(data, settings);

        expect(result?.parameterLines).toEqual(['Period: Jul 2025']);
        expect(result?.reportTitle).toBe('Revenue Report');
    });

    it('strips a repeated report-title prefix and rejects entity-only lines during fallback merge', async () => {
        generateTextMock.mockResolvedValueOnce({
            output: {
                reportTitle: 'Sales Order Daily Report',
                reportDescription: 'Daily sales order report for IPS Inc Japan, covering full year 2010.',
                parameterLines: [
                    'Sales Order Daily Report Reporting Date : 01-01-2010Through 31-12-2010',
                    'IPS Inc Japan Limited',
                ],
                footerLines: [],
                candidateHeaderLine: ['SO Number', 'Sales Amount Base'],
                confidence: 'high',
                reasoning: 'The heading line contains the title and reporting date.',
            },
        });

        const result = await extractAiReportContext({
            ...data,
            metadataRows: [
                ['KINETICS INDUSTRIES (DEMO 2011) LIMITED'],
                ['Sales Order Daily Report Reporting Date : 01-01-2010Through 31-12-2010'],
            ],
        }, settings);

        expect(result?.parameterLines).toEqual(['Reporting Date : 01-01-2010Through 31-12-2010']);
    });

    it('returns null when no provider is configured', async () => {
        isProviderConfiguredMock.mockReturnValueOnce(false);

        const result = await extractAiReportContext(data, settings);

        expect(result).toBeNull();
        expect(generateTextMock).not.toHaveBeenCalled();
    });
});
