// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisCardData } from '../types';
import { generateAllSummaries } from '../services/agent/execution/summaryManager';

const aiServiceMocks = vi.hoisted(() => ({
    generateSummary: vi.fn(),
    generateCoreAnalysisSummary: vi.fn(),
    generateFinalSummary: vi.fn(),
    generateProactiveInsights: vi.fn(),
}));

vi.mock('../services/aiService', () => ({
    generateSummary: aiServiceMocks.generateSummary,
    generateCoreAnalysisSummary: aiServiceMocks.generateCoreAnalysisSummary,
    generateFinalSummary: aiServiceMocks.generateFinalSummary,
    generateProactiveInsights: aiServiceMocks.generateProactiveInsights,
}));

const createCard = (overrides: Partial<AnalysisCardData> = {}): AnalysisCardData => ({
    id: overrides.id ?? 'card-1',
    plan: {
        chartType: 'bar',
        title: overrides.plan?.title ?? 'Revenue by Region',
        description: overrides.plan?.description ?? 'Normal card',
        groupByColumn: overrides.plan?.groupByColumn ?? 'Region',
        valueColumn: overrides.plan?.valueColumn ?? 'Revenue',
        aggregation: overrides.plan?.aggregation ?? 'sum',
        isFallback: overrides.plan?.isFallback ?? false,
    },
    aggregatedData: overrides.aggregatedData ?? [{ Region: 'East', Revenue: 1200 }],
    summary: overrides.summary ?? { language: 'English', text: 'Normal summary' },
    displayChartType: overrides.displayChartType ?? 'bar',
    isDataVisible: overrides.isDataVisible ?? false,
    topN: overrides.topN ?? null,
    hideOthers: overrides.hideOthers ?? false,
    hiddenLabels: overrides.hiddenLabels ?? [],
    autoAnalysisEvaluation: overrides.autoAnalysisEvaluation ?? {
        verdict: 'trusted',
        reasonCodes: [],
        detail: 'trusted',
        evaluatedAt: new Date().toISOString(),
        source: 'auto_analysis_evaluator_v1',
    },
});

const createStore = (analysisCards: AnalysisCardData[]) => {
    const state: any = {
        isChangingGoal: false,
        analysisCards,
        columnProfiles: [
            { name: 'Region', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Revenue', type: 'numerical', missingPercentage: 0, valueRange: [900, 1200] },
        ],
        settings: {
            provider: 'google',
            geminiApiKey: 'key',
            openAIApiKey: '',
            simpleModel: 'gemini-3-flash-preview',
            complexModel: 'gemini-3-flash-preview',
            language: 'English',
            autoConfirmGoal: true,
        },
        chatHistory: [],
        aiCoreAnalysisSummary: null,
        finalSummary: null,
        addProgress: vi.fn(),
    };

    return {
        state,
        store: {
            getState: () => state,
            setState: (partial: any) => {
                const next = typeof partial === 'function' ? partial(state) : partial;
                Object.assign(state, next);
            },
        },
    };
};

describe('generateAllSummaries', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        aiServiceMocks.generateSummary.mockResolvedValue({
            language: 'English',
            text: 'Generated card summary',
        });
    });

    it('uses deterministic fallback messaging when every card is a fallback card', async () => {
        const fallbackCard = createCard({
            plan: {
                chartType: 'bar',
                title: 'Recovered: Procurement Costs by Supplier',
                description: 'Fallback card',
                groupByColumn: 'Document Number',
                valueColumn: 'Qty',
                aggregation: 'sum',
                isFallback: true,
            },
            summary: { language: 'English', text: '### Fallback Notice\n- Existing fallback summary' },
        });
        const { state, store } = createStore([fallbackCard]);

        await generateAllSummaries(store as any);

        expect(aiServiceMocks.generateCoreAnalysisSummary).not.toHaveBeenCalled();
        expect(aiServiceMocks.generateFinalSummary).not.toHaveBeenCalled();
        expect(aiServiceMocks.generateProactiveInsights).not.toHaveBeenCalled();
        expect(state.aiCoreAnalysisSummary?.text).toContain('Fallback-only analysis run detected');
        expect(state.finalSummary?.text).toContain('### Simplified Analysis Summary');
        expect(state.chatHistory).toHaveLength(1);
    });

    it('filters fallback cards out of AI summary inputs and appends a reliability note', async () => {
        const normalCard = createCard({
            id: 'card-normal',
            plan: {
                chartType: 'bar',
                title: 'Revenue by Region',
                description: 'Normal card',
                groupByColumn: 'Region',
                valueColumn: 'Revenue',
                aggregation: 'sum',
                isFallback: false,
            },
        });
        const fallbackCard = createCard({
            id: 'card-fallback',
            plan: {
                chartType: 'bar',
                title: 'Recovered: Revenue by Supplier',
                description: 'Fallback card',
                groupByColumn: 'Document Number',
                valueColumn: 'Qty',
                aggregation: 'sum',
                isFallback: true,
            },
        });
        const { state, store } = createStore([normalCard, fallbackCard]);

        aiServiceMocks.generateCoreAnalysisSummary.mockResolvedValue({ language: 'English', text: 'Core summary' });
        aiServiceMocks.generateFinalSummary.mockResolvedValue({ language: 'English', text: 'Executive summary' });
        aiServiceMocks.generateProactiveInsights.mockResolvedValue(null);

        await generateAllSummaries(store as any);

        expect(aiServiceMocks.generateCoreAnalysisSummary).toHaveBeenCalledTimes(1);
        expect(aiServiceMocks.generateCoreAnalysisSummary.mock.calls[0][0]).toHaveLength(1);
        expect(aiServiceMocks.generateFinalSummary).toHaveBeenCalledTimes(1);
        expect(aiServiceMocks.generateFinalSummary.mock.calls[0][0]).toHaveLength(1);
        expect(state.aiCoreAnalysisSummary?.text).toContain('Reliability Note');
        expect(state.finalSummary?.text).toContain('Reliability Note');
    });

    it('includes caveated non-fallback cards in headline summary synthesis', async () => {
        const caveatedCard = createCard({
            id: 'card-caveated',
            autoAnalysisEvaluation: {
                verdict: 'caveated',
                reasonCodes: ['aggregation_quality_warning'],
                detail: 'aggregation_quality_warning',
                evaluatedAt: new Date().toISOString(),
                source: 'auto_analysis_evaluator_v1',
            },
        });
        const { state, store } = createStore([caveatedCard]);

        aiServiceMocks.generateCoreAnalysisSummary.mockResolvedValue({ language: 'English', text: 'Core summary' });
        aiServiceMocks.generateFinalSummary.mockResolvedValue({ language: 'English', text: 'Executive summary' });
        aiServiceMocks.generateProactiveInsights.mockResolvedValue(null);

        await generateAllSummaries(store as any);

        expect(aiServiceMocks.generateCoreAnalysisSummary).toHaveBeenCalledTimes(1);
        expect(aiServiceMocks.generateCoreAnalysisSummary.mock.calls[0][0]).toHaveLength(1);
        expect(aiServiceMocks.generateFinalSummary).toHaveBeenCalledTimes(1);
        expect(aiServiceMocks.generateFinalSummary.mock.calls[0][0]).toHaveLength(1);
        expect(aiServiceMocks.generateProactiveInsights).toHaveBeenCalledTimes(1);
        expect(state.aiCoreAnalysisSummary?.text).toBe('Core summary');
        expect(state.finalSummary?.text).toBe('Executive summary');
        expect(state.addProgress).not.toHaveBeenCalledWith(
            'No trusted analysis cards are available. Skipping headline summary synthesis.',
            'warning',
        );
    });

    it('excludes caveated cards from headline narratives when trusted evidence exists', async () => {
        const trustedCard = createCard({ id: 'card-trusted' });
        const caveatedCard = createCard({
            id: 'card-caveated-pivot',
            plan: {
                chartType: 'stacked_bar',
                title: 'Balance Qty by Request Date and Ship Mode',
                description: 'Sparse pivot requiring review',
                groupByColumn: 'Request Date',
                valueColumn: 'Balance Qty',
                aggregation: 'sum',
                isFallback: false,
            },
            autoAnalysisEvaluation: {
                verdict: 'caveated',
                reasonCodes: ['aggregation_quality_warning'],
                detail: 'null_group_labels',
                evaluatedAt: new Date().toISOString(),
                source: 'auto_analysis_evaluator_v1',
            },
        });
        const { store } = createStore([trustedCard, caveatedCard]);

        aiServiceMocks.generateCoreAnalysisSummary.mockResolvedValue({ language: 'English', text: 'Core summary' });
        aiServiceMocks.generateFinalSummary.mockResolvedValue({ language: 'English', text: 'Executive summary' });
        aiServiceMocks.generateProactiveInsights.mockResolvedValue(null);

        await generateAllSummaries(store as any);

        const coreContext = aiServiceMocks.generateCoreAnalysisSummary.mock.calls[0][0];
        const finalCards = aiServiceMocks.generateFinalSummary.mock.calls[0][0];
        expect(coreContext).toHaveLength(1);
        expect(coreContext[0]?.id).toBe('card-trusted');
        expect(finalCards).toHaveLength(1);
        expect(finalCards[0]?.id).toBe('card-trusted');
    });

    it('uses evidence-only deterministic summaries for count-only data without numeric measures', async () => {
        const customerCard = createCard({
            id: 'card-customer-count',
            plan: {
                chartType: 'bar',
                title: 'Count Rows by Customer Name',
                description: 'Customer distribution',
                groupByColumn: 'Customer Name',
                valueColumn: 'Count Rows',
                aggregation: 'count',
                isFallback: false,
            },
            aggregatedData: [
                { 'Customer Name': 'Allylink', 'Count Rows': 21 },
                { 'Customer Name': 'Mafaxon', 'Count Rows': 8 },
                { 'Customer Name': 'Maelig', 'Count Rows': 7 },
                { 'Customer Name': 'Other', 'Count Rows': 8 },
            ],
            autoAnalysisEvaluation: {
                verdict: 'caveated',
                reasonCodes: ['aggregation_quality_warning'],
                detail: 'count-only evidence',
                evaluatedAt: new Date().toISOString(),
                source: 'auto_analysis_evaluator_v1',
            },
        });
        const { state, store } = createStore([customerCard]);
        state.columnProfiles = [
            { name: 'Customer Name', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
            { name: 'Quotation Date', type: 'date', uniqueValues: 7, missingPercentage: 0 },
        ];

        await generateAllSummaries(store as any);

        expect(aiServiceMocks.generateSummary).not.toHaveBeenCalled();
        expect(aiServiceMocks.generateCoreAnalysisSummary).not.toHaveBeenCalled();
        expect(aiServiceMocks.generateFinalSummary).not.toHaveBeenCalled();
        expect(aiServiceMocks.generateProactiveInsights).not.toHaveBeenCalled();
        expect(state.finalSummary?.text).toContain('Allylink');
        expect(state.finalSummary?.text).toContain('21 of 44 records (47.7%)');
        expect(state.finalSummary?.text).toContain('record-count analysis cards');
        expect(state.finalSummary?.text).toContain('does not aggregate price, cost, profit, or revenue');
        expect(state.aiCoreAnalysisSummary?.text).not.toContain('Selling Price');
        expect(state.aiCoreAnalysisSummary?.text).not.toContain('Gross Profit');
        expect(state.chatHistory).toHaveLength(1);
        expect(state.addProgress).toHaveBeenCalledWith(
            expect.stringContaining('Count-only evidence detected'),
            'warning',
        );
    });

    it('recognizes count-only evidence from the canonical Count Rows metric label', async () => {
        const countCard = createCard({
            plan: {
                chartType: 'bar',
                title: 'Count Rows by Quotation Number',
                description: 'Quotation distribution',
                groupByColumn: 'Quotation Number',
                valueColumn: 'Count Rows',
                aggregation: undefined,
                isFallback: false,
            },
            aggregatedData: [
                { 'Quotation Number': 'SQ1089R1', 'Count Rows': 8 },
                { 'Quotation Number': 'SQ1097R2', 'Count Rows': 7 },
            ],
        });
        const { state, store } = createStore([countCard]);

        await generateAllSummaries(store as any);

        expect(aiServiceMocks.generateSummary).not.toHaveBeenCalled();
        expect(aiServiceMocks.generateCoreAnalysisSummary).not.toHaveBeenCalled();
        expect(aiServiceMocks.generateFinalSummary).not.toHaveBeenCalled();
        expect(state.finalSummary?.text).toContain('SQ1089R1');
        expect(state.finalSummary?.text).toContain('8 of 15 records');
    });

    it('localizes fallback summaries and reliability notes in Mandarin', async () => {
        const normalCard = createCard({
            id: 'card-normal-zh',
        });
        const fallbackCard = createCard({
            id: 'card-fallback-zh',
            plan: {
                chartType: 'bar',
                title: 'Recovered: Revenue by Supplier',
                description: 'Fallback card',
                groupByColumn: 'SourceColumnName',
                valueColumn: 'Value',
                aggregation: 'sum',
                isFallback: true,
            },
            aggregatedData: [{ SourceColumnName: '24216', Value: 1200 }],
        });

        const localizedStore = createStore([normalCard, fallbackCard]);
        localizedStore.state.settings.language = 'Mandarin';

        aiServiceMocks.generateCoreAnalysisSummary.mockResolvedValue({ language: 'Mandarin', text: '核心摘要' });
        aiServiceMocks.generateFinalSummary.mockResolvedValue({ language: 'Mandarin', text: '最终摘要' });
        aiServiceMocks.generateProactiveInsights.mockResolvedValue(null);

        await generateAllSummaries(localizedStore.store as any);

        expect(localizedStore.state.aiCoreAnalysisSummary?.text).toContain('可信度说明');
        expect(localizedStore.state.finalSummary?.text).toContain('可信度说明');

        const fallbackOnlyStore = createStore([fallbackCard]);
        fallbackOnlyStore.state.settings.language = 'Mandarin';

        await generateAllSummaries(fallbackOnlyStore.store as any);

        expect(fallbackOnlyStore.state.aiCoreAnalysisSummary?.text).toContain('检测到仅包含回退视图的分析运行');
        expect(fallbackOnlyStore.state.finalSummary?.text).toContain('### 简化分析摘要');
    });
});
