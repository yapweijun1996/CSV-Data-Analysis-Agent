import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateSummaryMock, addDocumentMock, getDocumentsMock } = vi.hoisted(() => ({
    generateSummaryMock: vi.fn(),
    addDocumentMock: vi.fn(),
    getDocumentsMock: vi.fn(),
}));

vi.mock('../services/aiService', () => ({
    generateSummary: generateSummaryMock,
}));

vi.mock('../services/vectorStore', () => ({
    vectorStore: {
        searchIfReady: vi.fn().mockResolvedValue([]),
        addDocument: addDocumentMock,
        getDocuments: getDocumentsMock,
    },
}));

describe('cardCreator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        generateSummaryMock.mockResolvedValue({ language: 'English', text: 'Generated summary' });
        addDocumentMock.mockResolvedValue(undefined);
        getDocumentsMock.mockReturnValue([]);
    });

    it('prepends newly created cards so the latest chart appears first', async () => {
        const { createNewCard } = await import('../services/agent/execution/cardCreator');
        const existingCard = {
            id: 'card-existing',
            plan: {
                title: 'Existing Card',
                description: 'Existing description',
                chartType: 'bar',
            },
            aggregatedData: [{ Project: 'A', Cost: 100 }],
            summary: { language: 'English', text: 'Existing summary' },
            displayChartType: 'bar',
            isDataVisible: false,
            topN: null,
            hideOthers: false,
        };
        const state = {
            analysisCards: [existingCard],
            progressMessages: [],
            settings: {
                provider: 'google',
                geminiApiKey: 'key',
                openAIApiKey: '',
                simpleModel: 'gemini-3.1-flash-lite-preview',
                complexModel: 'gemini-3.1-flash-lite-preview',
                language: 'English',
                autoConfirmGoal: true,
            },
            columnProfiles: [],
            addProgress: vi.fn(),
            vectorStoreDocuments: [],
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const card = await createNewCard({
            title: 'Project Cost Distribution',
            description: 'Compare project cost totals.',
            chartType: 'bar',
            groupByColumn: 'Project',
            valueColumn: 'Cost',
            aggregation: 'sum',
        }, [{ Project: 'B', Cost: 250 }], store);

        await Promise.resolve();

        expect(state.analysisCards).toHaveLength(2);
        expect(state.analysisCards[0].id).toBe(card.id);
        expect(state.analysisCards[1].id).toBe('card-existing');
        expect(card.disableAnimation).toBe(true);
        expect(generateSummaryMock).not.toHaveBeenCalled();
        expect(card.summary.text).toContain('Project Cost Distribution');
        expect(state.progressMessages.at(-1)?.text).toBe('Generated View: Project Cost Distribution');
    });

    it('records dataset-version and transformation provenance on every new card', async () => {
        const { createNewCard } = await import('../services/agent/execution/cardCreator');
        const csvData = {
            fileName: 'project-cost.csv',
            data: [{ Project: 'B', Cost: 250 }],
        };
        const state = {
            currentDatasetId: 'dataset-project-cost',
            canonicalCsvData: null,
            csvData,
            dataPreparationPlan: {
                explanation: 'Prepared project cost.',
                operations: [{
                    id: 'op-cast-cost',
                    type: 'cast_column',
                    reason: 'Cast cost to number.',
                    column: 'Cost',
                    targetType: 'number',
                }],
                outputColumns: [],
                planStatus: 'operations',
                consistencyIssues: [],
            },
            analysisCards: [],
            progressMessages: [],
            settings: {
                language: 'English',
            },
            columnProfiles: [],
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const card = await createNewCard({
            title: 'Project Cost Distribution',
            description: 'Compare project cost totals.',
            chartType: 'bar',
            groupByColumn: 'Project',
            valueColumn: 'Cost',
            aggregation: 'sum',
        }, csvData.data, store);

        expect(card.provenance).toMatchObject({
            datasetId: 'dataset-project-cost',
            evidenceStatus: 'verified',
            method: {
                operation: 'bar',
                groupByColumns: ['Project'],
            },
        });
        expect(card.provenance?.datasetVersion).toBeTruthy();
        expect(card.provenance?.evidenceRefs).toContainEqual(expect.objectContaining({
            kind: 'transformation',
            id: 'op-cast-cost',
        }));
    });

    it('reuses a semantic duplicate from the same dataset version', async () => {
        const { createNewCard } = await import('../services/agent/execution/cardCreator');
        const csvData = {
            fileName: 'project-cost.csv',
            data: [{ Project: 'B', Cost: 250 }],
        };
        const state = {
            currentDatasetId: 'dataset-project-cost',
            canonicalCsvData: null,
            csvData,
            dataPreparationPlan: null,
            analysisCards: [],
            progressMessages: [],
            settings: { language: 'English' },
            columnProfiles: [],
            finalSummary: { language: 'English', text: 'Old summary' },
            finalSummaryProvenance: null,
            aiCoreAnalysisSummary: { language: 'English', text: 'Old core summary' },
            aiCoreAnalysisSummaryProvenance: null,
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };
        const plan = {
            title: 'Project Cost Distribution',
            description: 'Compare project cost totals.',
            chartType: 'bar' as const,
            groupByColumn: 'Project',
            valueColumn: 'Cost',
            aggregation: 'sum' as const,
        };

        const first = await createNewCard(plan, csvData.data, store);
        const duplicate = await createNewCard({
            ...plan,
            title: 'Cost by Project',
            description: 'Same business view with different copy.',
            chartType: 'pie',
        }, csvData.data, store);

        expect(duplicate.id).toBe(first.id);
        expect(state.analysisCards).toHaveLength(1);
        expect(state.progressMessages.at(-1)?.text).toBe('Reused View: Project Cost Distribution');
        expect(state.finalSummary).toBeNull();
        expect(state.aiCoreAnalysisSummary).toBeNull();
    });

    it('uses display-safe titles when helper fields need user-facing renaming', async () => {
        const { createNewCard } = await import('../services/agent/execution/cardCreator');
        const state = {
            analysisCards: [],
            progressMessages: [],
            settings: {
                provider: 'google',
                geminiApiKey: 'key',
                openAIApiKey: '',
                simpleModel: 'gemini-3.1-flash-lite-preview',
                complexModel: 'gemini-3.1-flash-lite-preview',
                language: 'English',
                autoConfirmGoal: true,
            },
            columnProfiles: [],
            addProgress: vi.fn(),
            vectorStoreDocuments: [],
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const card = await createNewCard({
            title: 'Total Financial Value by Fiscal Series Label',
            description: 'Compare total financial value across fiscal series labels.',
            chartType: 'bar',
            groupByColumn: 'SeriesLabelL1',
            valueColumn: 'Value',
            aggregation: 'sum',
        }, [{ SeriesLabelL1: '36 TUAS ROAD', Value: 250 }], store);

        expect(generateSummaryMock).not.toHaveBeenCalled();
        expect(card.summary.text).toContain('Total Financial Value by Series Label 1');
        expect(state.progressMessages.at(-1)?.text).toBe('Generated View: Total Financial Value by Series Label 1');
    });

    it('localizes fallback summaries using the active app language', async () => {
        const { createNewCard } = await import('../services/agent/execution/cardCreator');
        const state = {
            analysisCards: [],
            progressMessages: [],
            settings: {
                provider: 'google',
                geminiApiKey: 'key',
                openAIApiKey: '',
                simpleModel: 'gemini-3.1-flash-lite-preview',
                complexModel: 'gemini-3.1-flash-lite-preview',
                language: 'Mandarin',
                autoConfirmGoal: true,
            },
            columnProfiles: [],
            addProgress: vi.fn(),
            vectorStoreDocuments: [],
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const card = await createNewCard({
            title: 'Recovered Revenue by SourceColumnName',
            description: 'Fallback card',
            chartType: 'bar',
            groupByColumn: 'SourceColumnName',
            valueColumn: 'Value',
            aggregation: 'sum',
            isFallback: true,
        }, [{ SourceColumnName: '24216', Value: 250 }], store);

        expect(generateSummaryMock).not.toHaveBeenCalled();
        expect(card.summary.language).toBe('Mandarin');
        expect(card.summary.text).toContain('### 简化洞察');
        expect(card.summary.text).toContain('按 `Source Column` 聚合后的 `Recovered Revenue`');
        expect(state.progressMessages.at(-1)?.text).toBe('Generated View: Recovered Revenue by Source Column');
    });

    it('keeps every point visible by default for long temporal chart series', async () => {
        const { createNewCard } = await import('../services/agent/execution/cardCreator');
        const state = {
            analysisCards: [],
            progressMessages: [],
            settings: { language: 'English' },
            columnProfiles: [],
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };
        const rows = Array.from({ length: 36 }, (_, index) => ({
            month: `2024-${String((index % 12) + 1).padStart(2, '0')}`,
            avg_price: 400_000 + index,
        }));

        const card = await createNewCard({
            title: 'Average Price by Month',
            description: 'Monthly trend.',
            chartType: 'area',
            groupByColumn: 'month',
            valueColumn: 'avg_price',
            aggregation: 'avg',
        }, rows, store);

        expect(card.topN).toBeNull();
        expect(card.hideOthers).toBe(false);
    });
});
