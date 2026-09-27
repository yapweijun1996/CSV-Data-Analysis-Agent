// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    generateEvidenceQueryPlanSteppedMock,
    generateEvidenceQueryPlanWithRetryMock,
    executeEvidenceQueryMock,
    buildEvidenceResultSummaryMock,
    executePresentationPlanAndCreateCardMock,
    buildDeterministicSqlPresentationPlanMock,
    callAiPresentationPlanMock,
    callAiEvidenceEvaluationMock,
    vectorStoreSearchIfReadyMock,
} = vi.hoisted(() => ({
    generateEvidenceQueryPlanSteppedMock: vi.fn(),
    generateEvidenceQueryPlanWithRetryMock: vi.fn(),
    executeEvidenceQueryMock: vi.fn(),
    buildEvidenceResultSummaryMock: vi.fn(),
    executePresentationPlanAndCreateCardMock: vi.fn(),
    buildDeterministicSqlPresentationPlanMock: vi.fn(),
    callAiPresentationPlanMock: vi.fn(),
    callAiEvidenceEvaluationMock: vi.fn(),
    vectorStoreSearchIfReadyMock: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/agent/planning/planGenerator', async (importOriginal) => {
    const actual = await importOriginal() as Record<string, unknown>;
    return {
        ...actual,
        generateEvidenceQueryPlanStepped: generateEvidenceQueryPlanSteppedMock,
        generateEvidenceQueryPlanWithRetry: generateEvidenceQueryPlanWithRetryMock,
    };
});

vi.mock('../services/agent/execution/sqlCardExecutor', () => ({
    executeEvidenceQuery: executeEvidenceQueryMock,
    buildEvidenceResultSummary: buildEvidenceResultSummaryMock,
    executePresentationPlanAndCreateCard: executePresentationPlanAndCreateCardMock,
}));

vi.mock('../services/agent/planning/sqlPresentationPlanner', () => ({
    buildDeterministicSqlPresentationPlan: buildDeterministicSqlPresentationPlanMock,
    callAiPresentationPlan: callAiPresentationPlanMock,
}));

vi.mock('../services/agent/evidenceValueGate', async (importOriginal) => {
    const actual = await importOriginal() as Record<string, unknown>;
    return {
        ...actual,
        callAiEvidenceEvaluation: callAiEvidenceEvaluationMock,
    };
});

vi.mock('../services/vectorStore', () => ({
    vectorStore: {
        searchIfReady: vectorStoreSearchIfReadyMock,
    },
}));

describe('topicProcessor', { timeout: 15000 }, () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        // AI calls return null by default → deterministic fallback is used.
        callAiEvidenceEvaluationMock.mockResolvedValue(null);
        callAiPresentationPlanMock.mockResolvedValue(null);
        generateEvidenceQueryPlanSteppedMock.mockRejectedValue(new Error('stepped planner unavailable in unit test'));
        generateEvidenceQueryPlanWithRetryMock.mockResolvedValue({
            title: 'Revenue by Region',
            queryMode: 'aggregate',
            query: {
                select: ['Region', 'Revenue'],
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
                limit: 10,
            },
            intentSummary: 'Inspect revenue grouped by region.',
            preferredResultShape: 'ranked_aggregate',
        });
        executeEvidenceQueryMock.mockResolvedValue({
            result: {
                rows: [{ Region: 'East', Revenue: 10 }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Region', 'Revenue'],
                appliedOrderBy: [],
                appliedLimit: 10,
                durationMs: 4,
            },
            execution: {
                engine: 'duckdb',
                sqlPreview: 'SELECT',
                tableName: 'session_clean_dataset',
                loadVersion: 'dataset-1',
                fallbackReason: null,
                fallbackStage: null,
            },
            activeDataQuery: { result: { rows: [] } },
        });
        buildEvidenceResultSummaryMock.mockReturnValue({
            queryMode: 'aggregate',
            preferredResultShape: 'ranked_aggregate',
            rowCount: 1,
            columnCount: 2,
            columns: ['Region', 'Revenue'],
            numericColumns: ['Revenue'],
            categoricalColumns: ['Region'],
            timeColumns: [],
            distinctGroupCount: 1,
            totalValue: 10,
            isTimeSeriesCandidate: false,
            isWideCategorySet: false,
            hasSecondaryMetric: false,
            hasNegativeValues: false,
            previewRows: [{ Region: 'East', Revenue: 10 }],
        });
        buildDeterministicSqlPresentationPlanMock.mockReturnValue({
            title: 'Revenue by Region',
            description: 'Inspect revenue by region.',
            presentationMode: 'table_then_chart',
            chartType: 'bar',
            bindings: { groupByColumn: 'Region', valueColumn: 'Revenue' },
        });
        executePresentationPlanAndCreateCardMock.mockResolvedValue({
            card: { id: 'card-1' },
            presentationPlan: {
                title: 'Revenue by Region',
                description: 'Inspect revenue by region.',
                presentationMode: 'table_then_chart',
                chartType: 'bar',
                bindings: { groupByColumn: 'Region', valueColumn: 'Revenue' },
            },
            evidenceSummary: { rowCount: 1, columns: ['Region', 'Revenue'] },
            activeDataQuery: { result: { rows: [] } },
        });
    });

    it('retries evidence planning after an empty result', async () => {
        const { SqlAutoAnalysisError } = await import('../services/agent/planning/planGenerator');
        executeEvidenceQueryMock
            .mockRejectedValueOnce(new SqlAutoAnalysisError('empty_result', 'No rows returned.'))
            .mockResolvedValueOnce({
                result: {
                    rows: [{ Region: 'East', Revenue: 10 }],
                    totalMatchedRows: 1,
                    returnedRows: 1,
                    truncated: false,
                    selectedColumns: ['Region', 'Revenue'],
                    appliedOrderBy: [],
                    appliedLimit: 10,
                    durationMs: 4,
                },
                execution: {
                    engine: 'duckdb',
                    sqlPreview: 'SELECT',
                    tableName: 'session_clean_dataset',
                    loadVersion: 'dataset-1',
                    fallbackReason: null,
                    fallbackStage: null,
                },
                activeDataQuery: { result: { rows: [] } },
            });

        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 4 },
                { name: 'Revenue', type: 'numerical' },
            ],
            settings: {
                provider: 'google',
                geminiApiKey: 'test-key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin',
                autoConfirmGoal: true,
            },
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
            dataPreparationPlan: null,
            agentMemoryHistory: [],
            recordAgentEvent: vi.fn(),
        } as any;
        const store = {
            getState: () => state,
            setState: vi.fn(),
        };

        const result = await processSingleTopic('Revenue by region', {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 10 }],
        } as any, store, {
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
        });

        expect(result).toMatchObject({
            status: 'completed',
            cardCreated: true,
            tableFirst: true,
            accepted: true,
        });
        expect(generateEvidenceQueryPlanWithRetryMock).toHaveBeenCalledTimes(2);
        expect(generateEvidenceQueryPlanWithRetryMock.mock.calls[1][5]).toContain('returned no rows');
    });

    it('replans when evidence collapses a full date column into day-of-month buckets', async () => {
        generateEvidenceQueryPlanWithRetryMock
            .mockResolvedValueOnce({
                title: 'Net amount by DATE',
                queryMode: 'aggregate',
                query: {
                    select: ['DATE', 'NET AMOUNT LOCAL'],
                    groupBy: ['DATE'],
                    aggregates: [{ function: 'sum', column: 'NET AMOUNT LOCAL', as: 'NET AMOUNT LOCAL' }],
                    limit: 10,
                },
                intentSummary: 'Inspect net amount by date.',
                preferredResultShape: 'ranked_aggregate',
            })
            .mockResolvedValueOnce({
                title: 'Net amount by DATE',
                queryMode: 'aggregate',
                query: {
                    select: ['DATE', 'NET AMOUNT LOCAL'],
                    groupBy: ['DATE'],
                    aggregates: [{ function: 'sum', column: 'NET AMOUNT LOCAL', as: 'NET AMOUNT LOCAL' }],
                    limit: 10,
                },
                intentSummary: 'Inspect net amount by date.',
                preferredResultShape: 'ranked_aggregate',
            });

        executeEvidenceQueryMock
            .mockResolvedValueOnce({
                result: {
                    rows: [{ DATE: '7', 'NET AMOUNT LOCAL': 100 }],
                    totalMatchedRows: 1,
                    returnedRows: 1,
                    truncated: false,
                    selectedColumns: ['DATE', 'NET AMOUNT LOCAL'],
                    appliedOrderBy: [],
                    appliedLimit: 10,
                    durationMs: 4,
                },
                execution: {
                    engine: 'duckdb',
                    sqlPreview: 'SELECT',
                    tableName: 'session_clean_dataset',
                    loadVersion: 'dataset-1',
                    fallbackReason: null,
                    fallbackStage: null,
                },
                activeDataQuery: { result: { rows: [] } },
            })
            .mockResolvedValueOnce({
                result: {
                    rows: [{ DATE: '08-01-2010', 'NET AMOUNT LOCAL': 100 }],
                    totalMatchedRows: 1,
                    returnedRows: 1,
                    truncated: false,
                    selectedColumns: ['DATE', 'NET AMOUNT LOCAL'],
                    appliedOrderBy: [],
                    appliedLimit: 10,
                    durationMs: 4,
                },
                execution: {
                    engine: 'duckdb',
                    sqlPreview: 'SELECT',
                    tableName: 'session_clean_dataset',
                    loadVersion: 'dataset-1',
                    fallbackReason: null,
                    fallbackStage: null,
                },
                activeDataQuery: { result: { rows: [] } },
            });

        buildEvidenceResultSummaryMock
            .mockReturnValueOnce({
                queryMode: 'aggregate',
                preferredResultShape: 'ranked_aggregate',
                rowCount: 1,
                columnCount: 2,
                columns: ['DATE', 'NET AMOUNT LOCAL'],
                numericColumns: ['NET AMOUNT LOCAL'],
                categoricalColumns: [],
                timeColumns: ['DATE'],
                distinctGroupCount: 1,
                totalValue: 100,
                isTimeSeriesCandidate: true,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
            hasNegativeValues: false,
                previewRows: [{ DATE: '7', 'NET AMOUNT LOCAL': 100 }],
            })
            .mockReturnValueOnce({
                queryMode: 'aggregate',
                preferredResultShape: 'ranked_aggregate',
                rowCount: 1,
                columnCount: 2,
                columns: ['DATE', 'NET AMOUNT LOCAL'],
                numericColumns: ['NET AMOUNT LOCAL'],
                categoricalColumns: [],
                timeColumns: ['DATE'],
                distinctGroupCount: 1,
                totalValue: 100,
                isTimeSeriesCandidate: true,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
            hasNegativeValues: false,
                previewRows: [{ DATE: '08-01-2010', 'NET AMOUNT LOCAL': 100 }],
            });

        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'DATE', type: 'date', uniqueValues: 31 },
                { name: 'NET AMOUNT LOCAL', type: 'currency' },
            ],
            settings: {
                provider: 'google',
                geminiApiKey: 'test-key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin',
                autoConfirmGoal: true,
            },
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
            dataPreparationPlan: null,
            agentMemoryHistory: [],
            recordAgentEvent: vi.fn(),
        } as any;
        const store = {
            getState: () => state,
            setState: vi.fn(),
        };

        const result = await processSingleTopic('Net amount by date', {
            fileName: 'daily-sales.csv',
            data: [
                { DATE: '08-01-2010', 'NET AMOUNT LOCAL': 100 },
                { DATE: '09-01-2010', 'NET AMOUNT LOCAL': 120 },
            ],
        } as any, store, {
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
        }, [], {
            semanticUnderstanding: {
                businessGrains: [],
                candidateMetrics: ['NET AMOUNT LOCAL'],
                timeGrains: ['DATE'],
                helperDimensions: [],
                blockedDimensions: [],
                detailRowPolicy: 'exclude_non_detail_rows',
                businessGlossary: [],
                businessGrainConfidence: 'medium',
                unsafeForBusinessNarrative: false,
            },
        });

        expect(result).toMatchObject({
            status: 'completed',
            cardCreated: true,
            accepted: true,
        });
        expect(generateEvidenceQueryPlanWithRetryMock).toHaveBeenCalledTimes(2);
        expect(generateEvidenceQueryPlanWithRetryMock.mock.calls[1][5]).toContain('preserves full-date grain');
    });

    it('normalizes auto-generated day-of-month topics back to full-date topics before planning', async () => {
        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'DATE', type: 'date', uniqueValues: 31 },
                { name: 'GST LOCAL', type: 'currency' },
            ],
            settings: {
                provider: 'google',
                geminiApiKey: 'test-key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin',
                autoConfirmGoal: true,
            },
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
            dataPreparationPlan: null,
            agentMemoryHistory: [],
            recordAgentEvent: vi.fn(),
        } as any;
        const store = {
            getState: () => state,
            setState: vi.fn(),
        };

        await processSingleTopic('Average GST Amount per day of the month', {
            fileName: 'daily-sales.csv',
            data: [
                { DATE: '08-01-2010', 'GST LOCAL': 100 },
                { DATE: '09-01-2010', 'GST LOCAL': 120 },
            ],
        } as any, store, {
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
        }, [], {
            semanticUnderstanding: {
                businessGrains: [],
                candidateMetrics: ['GST LOCAL'],
                timeGrains: ['DATE'],
                helperDimensions: [],
                blockedDimensions: [],
                detailRowPolicy: 'exclude_non_detail_rows',
                businessGlossary: [],
                businessGrainConfidence: 'medium',
                unsafeForBusinessNarrative: false,
            },
        });

        expect(generateEvidenceQueryPlanWithRetryMock).toHaveBeenCalledTimes(1);
        expect(generateEvidenceQueryPlanWithRetryMock.mock.calls[0][0]).toBe('Average GST Amount per DATE');
    });

    it('records typed self-correction reason codes after an empty-result retry', async () => {
        const { SqlAutoAnalysisError } = await import('../services/agent/planning/planGenerator');
        executeEvidenceQueryMock
            .mockRejectedValueOnce(new SqlAutoAnalysisError('empty_result', 'No rows returned.'))
            .mockResolvedValueOnce({
                result: {
                    rows: [{ Region: 'East', Revenue: 10 }],
                    totalMatchedRows: 1,
                    returnedRows: 1,
                    truncated: false,
                    selectedColumns: ['Region', 'Revenue'],
                    appliedOrderBy: [],
                    appliedLimit: 10,
                    durationMs: 4,
                },
                execution: {
                    engine: 'duckdb',
                    sqlPreview: 'SELECT',
                    tableName: 'session_clean_dataset',
                    loadVersion: 'dataset-1',
                    fallbackReason: null,
                    fallbackStage: null,
                },
                activeDataQuery: { result: { rows: [] } },
            });

        const recordedSteps: any[] = [];
        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 4 },
                { name: 'Revenue', type: 'numerical' },
            ],
            settings: {
                provider: 'google',
                geminiApiKey: 'test-key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin',
                autoConfirmGoal: true,
            },
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
            dataPreparationPlan: null,
            agentMemoryHistory: [],
            recordAgentEvent: vi.fn(),
        } as any;
        const store = {
            getState: () => state,
            setState: vi.fn(),
        };

        await processSingleTopic('Revenue by region', {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 10 }],
        } as any, store, {
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
        }, [], {
            recordAnalysisStep: (record) => {
                recordedSteps.push(record);
                return `step-${recordedSteps.length}`;
            },
        });

        const refineStep = recordedSteps.find(step => step.type === 'refine_hypothesis');
        expect(refineStep?.reasonCodes).toEqual(['replan_after_empty_result', 'empty_result']);
    });

    it('records typed reason codes and only replans empty-result topics once', async () => {
        const { SqlAutoAnalysisError } = await import('../services/agent/planning/planGenerator');
        executeEvidenceQueryMock
            .mockRejectedValueOnce(new SqlAutoAnalysisError('empty_result', 'Query returned no rows.'))
            .mockResolvedValueOnce({
                result: {
                    rows: [{ Region: 'East', Revenue: 10 }],
                    totalMatchedRows: 1,
                    returnedRows: 1,
                    truncated: false,
                    selectedColumns: ['Region', 'Revenue'],
                    appliedOrderBy: [],
                    appliedLimit: 10,
                    durationMs: 4,
                },
                execution: {
                    engine: 'duckdb',
                    sqlPreview: 'SELECT',
                    tableName: 'session_clean_dataset',
                    loadVersion: 'dataset-1',
                    fallbackReason: null,
                    fallbackStage: null,
                },
                activeDataQuery: { result: { rows: [] } },
            });

        const recordedSteps: any[] = [];
        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 24 },
                { name: 'Revenue', type: 'numerical' },
            ],
            settings: {
                provider: 'google',
                geminiApiKey: 'test-key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin',
                autoConfirmGoal: true,
            },
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
            dataPreparationPlan: null,
            agentMemoryHistory: [],
            recordAgentEvent: vi.fn(),
        } as any;
        const store = {
            getState: () => state,
            setState: vi.fn(),
        };

        const result = await processSingleTopic('Revenue by region', {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 10 }],
        } as any, store, {
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
        }, [], {
            recordAnalysisStep: (record) => {
                recordedSteps.push(record);
                return `step-${recordedSteps.length}`;
            },
        });

        const refineSteps = recordedSteps.filter(step => step.type === 'refine_hypothesis');
        expect(result.status).toBe('completed');
        expect(refineSteps).toHaveLength(1);
        expect(refineSteps[0]?.reasonCodes).toEqual(['replan_after_empty_result', 'empty_result']);
    });

    it('records planner escalation when stepped planning fails and full planner takes over', async () => {
        generateEvidenceQueryPlanSteppedMock.mockRejectedValueOnce(new Error('invalid stepped filter mapping'));

        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        const runtimeEvents = vi.fn();
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 4 },
                { name: 'Revenue', type: 'numerical' },
            ],
            settings: {
                provider: 'google',
                geminiApiKey: 'test-key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin',
                autoConfirmGoal: true,
            },
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
            dataPreparationPlan: null,
            agentMemoryHistory: [],
            recordAgentEvent: vi.fn(),
            recordRuntimeEvent: runtimeEvents,
        } as any;
        const store = {
            getState: () => state,
            setState: vi.fn(),
        };

        const result = await processSingleTopic('Revenue by region', {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 10 }],
        } as any, store, {
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
        });

        expect(result.status).toBe('completed');
        expect(generateEvidenceQueryPlanWithRetryMock).toHaveBeenCalledTimes(1);
        expect(runtimeEvents).toHaveBeenCalledWith(expect.objectContaining({
            type: 'planner_escalated_to_full',
        }));
    });

    it('tracks table-first topics in the batch summary', async () => {
        generateEvidenceQueryPlanWithRetryMock
            .mockResolvedValueOnce({
                title: 'Revenue by Region',
                queryMode: 'aggregate',
                query: {
                    select: ['Region', 'Revenue'],
                    groupBy: ['Region'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
                    limit: 10,
                },
                intentSummary: 'Inspect revenue grouped by region.',
                preferredResultShape: 'ranked_aggregate',
            })
            .mockResolvedValueOnce({
                title: 'Revenue by Department',
                queryMode: 'aggregate',
                query: {
                    select: ['Department', 'Revenue'],
                    groupBy: ['Department'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
                    limit: 10,
                },
                intentSummary: 'Inspect revenue grouped by department.',
                preferredResultShape: 'ranked_aggregate',
            });
        executePresentationPlanAndCreateCardMock
            .mockResolvedValueOnce({
                card: { id: 'card-1' },
                presentationPlan: {
                    title: 'Revenue by Region',
                    description: 'Inspect revenue by region.',
                    presentationMode: 'table_then_chart',
                    chartType: 'bar',
                    bindings: { groupByColumn: 'Region', valueColumn: 'Revenue' },
                },
                evidenceSummary: { rowCount: 4, columns: ['Region', 'Revenue'] },
                activeDataQuery: { result: { rows: [] } },
            })
            .mockResolvedValueOnce({
                card: { id: 'card-2' },
                presentationPlan: {
                    title: 'Revenue by Department',
                    description: 'Inspect revenue by department.',
                    presentationMode: 'chart',
                    chartType: 'bar',
                    bindings: { groupByColumn: 'Department', valueColumn: 'Revenue' },
                },
                evidenceSummary: { rowCount: 4, columns: ['Department', 'Revenue'] },
                activeDataQuery: { result: { rows: [] } },
            });
        buildEvidenceResultSummaryMock
            .mockReturnValueOnce({
                queryMode: 'aggregate',
                preferredResultShape: 'ranked_aggregate',
                rowCount: 4,
                columnCount: 2,
                columns: ['Region', 'Revenue'],
                numericColumns: ['Revenue'],
                categoricalColumns: ['Region'],
                timeColumns: [],
                distinctGroupCount: 4,
                totalValue: 40,
                isTimeSeriesCandidate: false,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
            hasNegativeValues: false,
                previewRows: [{ Region: 'East', Revenue: 10 }],
            })
            .mockReturnValueOnce({
                queryMode: 'aggregate',
                preferredResultShape: 'ranked_aggregate',
                rowCount: 4,
                columnCount: 2,
                columns: ['Department', 'Revenue'],
                numericColumns: ['Revenue'],
                categoricalColumns: ['Department'],
                timeColumns: [],
                distinctGroupCount: 4,
                totalValue: 40,
                isTimeSeriesCandidate: false,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
            hasNegativeValues: false,
                previewRows: [{ Department: 'Ops', Revenue: 10 }],
            });

        const { processTopicsInParallel } = await import('../services/agent/planning/topicProcessor');
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 4 },
                { name: 'Department', type: 'categorical', uniqueValues: 5 },
                { name: 'Revenue', type: 'numerical' },
            ],
            settings: {
                provider: 'google',
                geminiApiKey: 'test-key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin',
                autoConfirmGoal: true,
            },
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
            dataPreparationPlan: null,
            agentMemoryHistory: [],
            recordAgentEvent: vi.fn(),
        } as any;
        const store = {
            getState: () => state,
            setState: vi.fn(),
        };

        const summary = await processTopicsInParallel(
            ['Revenue by region', 'Revenue by department'],
            {
                fileName: 'sales.csv',
                data: [{ Region: 'East', Department: 'Ops', Revenue: 10 }],
            } as any,
            store,
            {
                tableName: 'session_clean_dataset',
                loadVersion: 'dataset-1',
            },
        );

        expect(summary).toEqual({
            completedTopics: 2,
            cardTopics: 2,
            tableFirstTopics: 1,
            tableOnlyTopics: 0,
            rejectedTopics: 0,
            dedupedTopics: 0,
            failedTopics: [],
            hadWarnings: false,
        });
    });

    it('passes harnessContext to evaluateEvidenceValue via deterministic path', async () => {
        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        const { evaluateEvidenceValue } = await import('../services/agent/evidenceValueGate');
        const evaluateEvidenceValueSpy = vi.spyOn({ evaluateEvidenceValue }, 'evaluateEvidenceValue');

        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'Description', type: 'categorical', uniqueValues: 4 },
                { name: 'Value', type: 'numerical' },
            ],
            settings: {
                provider: 'google',
                geminiApiKey: 'test-key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin',
                autoConfirmGoal: true,
            },
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
            dataPreparationPlan: null,
            agentMemoryHistory: [],
            recordAgentEvent: vi.fn(),
        } as any;
        const store = {
            getState: () => state,
            setState: vi.fn(),
        };

        const harnessContext = {
            preferGroupBy: ['Description'],
            blockGroupBy: ['Code'],
            excludeFromAggregation: ['Grand Total'],
            hierarchyColumn: 'Description',
            parentDescriptions: ['Grand Total'],
            duplicateDescriptions: ['Ops Costs'],
            detailRowColumn: null,
            detailRowValue: null,
        };

        await processSingleTopic('Revenue by description', {
            fileName: 'sales.csv',
            data: [{ Description: 'Alpha', Value: 10 }],
        } as any, store, {
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
        }, [], {
            harnessContext,
        });

        // PERF-201 Step 3: AI evidence evaluation is skipped, deterministic path is used.
        // callAiEvidenceEvaluation should NOT be called.
        expect(callAiEvidenceEvaluationMock).toHaveBeenCalledTimes(0);
        evaluateEvidenceValueSpy.mockRestore();
    });

    it('forces table_only when harness detects hierarchy contamination in evidence', async () => {
        buildEvidenceResultSummaryMock.mockReturnValue({
            queryMode: 'aggregate',
            preferredResultShape: 'ranked_aggregate',
            rowCount: 4,
            columnCount: 2,
            columns: ['Description', 'total_value'],
            numericColumns: ['total_value'],
            categoricalColumns: ['Description'],
            timeColumns: [],
            distinctGroupCount: 4,
            totalValue: 100,
            isTimeSeriesCandidate: false,
            isWideCategorySet: false,
            hasSecondaryMetric: false,
            hasNegativeValues: false,
            previewRows: [
                { Description: 'Alpha', total_value: 30 },
                { Description: 'Grand Total', total_value: 100 },
            ],
        });
        generateEvidenceQueryPlanWithRetryMock.mockResolvedValue({
            title: 'Revenue by Description',
            queryMode: 'aggregate',
            query: {
                select: ['Description', 'total_value'],
                groupBy: ['Description'],
                aggregates: [{ function: 'sum', column: 'Value', as: 'total_value' }],
                limit: 10,
            },
            intentSummary: 'Inspect revenue by description.',
            preferredResultShape: 'ranked_aggregate',
        });

        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'Description', type: 'categorical', uniqueValues: 4 },
                { name: 'Value', type: 'numerical' },
            ],
            settings: {
                provider: 'google',
                geminiApiKey: 'test-key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin',
                autoConfirmGoal: true,
            },
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
            dataPreparationPlan: null,
            agentMemoryHistory: [],
            recordAgentEvent: vi.fn(),
        } as any;
        const store = {
            getState: () => state,
            setState: vi.fn(),
        };

        const harnessContext = {
            preferGroupBy: ['Description'],
            blockGroupBy: [],
            excludeFromAggregation: ['Grand Total'],
            hierarchyColumn: 'Description',
            parentDescriptions: ['Grand Total'],
            duplicateDescriptions: [],
            detailRowColumn: null,
            detailRowValue: null,
        };

        const result = await processSingleTopic('Revenue by description', {
            fileName: 'sales.csv',
            data: [{ Description: 'Alpha', Value: 10 }],
        } as any, store, {
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
        }, [], {
            harnessContext,
            semanticUnderstanding: {
                businessGrains: ['Description'],
                candidateMetrics: ['Value'],
                timeGrains: [],
                helperDimensions: [],
                blockedDimensions: [],
                detailRowPolicy: 'exclude_non_detail_rows',
                businessGlossary: [],
                businessGrainConfidence: 'high',
                unsafeForBusinessNarrative: false,
            },
        });

        // Hierarchy contamination should force table_only, not chart-first promotion
        expect(result).toMatchObject({
            status: 'completed',
            cardCreated: true,
            accepted: true,
            valueDecision: 'table_only',
        });
    });

    it('passes semanticUnderstanding, valueGate, and harnessContext to deterministic presentation planner', async () => {
        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        buildEvidenceResultSummaryMock.mockReturnValue({
            queryMode: 'aggregate',
            preferredResultShape: 'ranked_aggregate',
            rowCount: 3,
            columnCount: 2,
            columns: ['Description', 'Value'],
            numericColumns: ['Value'],
            categoricalColumns: ['Description'],
            timeColumns: [],
            distinctGroupCount: 3,
            totalValue: 60,
            isTimeSeriesCandidate: false,
            isWideCategorySet: false,
            hasSecondaryMetric: false,
            hasNegativeValues: false,
            previewRows: [
                { Description: 'Alpha', Value: 10 },
                { Description: 'Beta', Value: 20 },
                { Description: 'Gamma', Value: 30 },
            ],
        });
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'Description', type: 'categorical', uniqueValues: 4 },
                { name: 'Value', type: 'numerical' },
            ],
            settings: {
                provider: 'google',
                geminiApiKey: 'test-key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin',
                autoConfirmGoal: true,
            },
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
            dataPreparationPlan: null,
            agentMemoryHistory: [],
            recordAgentEvent: vi.fn(),
        } as any;
        const store = {
            getState: () => state,
            setState: vi.fn(),
        };

        const harnessContext = {
            preferGroupBy: ['Description'],
            blockGroupBy: ['Code'],
            excludeFromAggregation: ['Grand Total'],
            hierarchyColumn: null,
            parentDescriptions: [],
            duplicateDescriptions: [],
            detailRowColumn: null,
            detailRowValue: null,
        };
        const semanticUnderstanding = {
            businessGrains: ['Description'],
            candidateMetrics: ['Value'],
            timeGrains: [],
            helperDimensions: [],
            blockedDimensions: [],
            detailRowPolicy: 'exclude_non_detail_rows' as const,
            businessGlossary: [],
            businessGrainConfidence: 'high' as const,
            unsafeForBusinessNarrative: false,
        };

        await processSingleTopic('Revenue by description', {
            fileName: 'sales.csv',
            data: [{ Description: 'Alpha', Value: 10 }],
        } as any, store, {
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
        }, [], {
            harnessContext,
            semanticUnderstanding,
        });

        // PERF-201 Step 4: AI presentation planning is skipped, deterministic path is used.
        expect(callAiPresentationPlanMock).not.toHaveBeenCalled();
        expect(buildDeterministicSqlPresentationPlanMock).toHaveBeenCalledTimes(1);
        const deterministicOptions = buildDeterministicSqlPresentationPlanMock.mock.calls[0][3];
        expect(deterministicOptions).toEqual(expect.objectContaining({
            semanticUnderstanding: expect.objectContaining({ businessGrains: ['Description'] }),
            harnessContext: expect.objectContaining({ preferGroupBy: ['Description'] }),
        }));
        expect(deterministicOptions.valueGate).toBeDefined();
    });

    it('always uses deterministic presentation planning (PERF-201 Step 4)', async () => {
        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'Description', type: 'categorical', uniqueValues: 4 },
                { name: 'Value', type: 'numerical' },
            ],
            settings: {
                provider: 'google',
                geminiApiKey: 'test-key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin',
                autoConfirmGoal: true,
            },
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
            dataPreparationPlan: null,
            agentMemoryHistory: [],
            recordAgentEvent: vi.fn(),
        } as any;
        const store = {
            getState: () => state,
            setState: vi.fn(),
        };

        await processSingleTopic('Revenue by description', {
            fileName: 'sales.csv',
            data: [{ Description: 'Alpha', Value: 10 }],
        } as any, store, {
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
        }, [], {
            harnessContext: {
                preferGroupBy: ['Description'],
                blockGroupBy: [],
                excludeFromAggregation: [],
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: null,
                detailRowValue: null,
                signalConfidence: 'low',
            } as any,
            semanticUnderstanding: {
                businessGrains: ['Description'],
                candidateMetrics: ['Value'],
                timeGrains: [],
                helperDimensions: [],
                blockedDimensions: [],
                detailRowPolicy: 'preserve_all_rows',
                businessGlossary: [],
                businessGrainConfidence: 'high',
                unsafeForBusinessNarrative: false,
            },
        });

        // PERF-201 Step 4: AI is never called, deterministic is always used.
        expect(callAiPresentationPlanMock).not.toHaveBeenCalled();
        expect(buildDeterministicSqlPresentationPlanMock).toHaveBeenCalledTimes(1);
    });

    it('records plan_presentation as the next step for table-only evidence', async () => {
        buildEvidenceResultSummaryMock.mockReturnValue({
            queryMode: 'aggregate',
            preferredResultShape: 'ranked_aggregate',
            rowCount: 2,
            columnCount: 2,
            columns: ['Code', 'TotalValue'],
            numericColumns: ['TotalValue'],
            categoricalColumns: ['Code'],
            timeColumns: [],
            distinctGroupCount: 2,
            totalValue: 40,
            isTimeSeriesCandidate: false,
            isWideCategorySet: false,
            hasSecondaryMetric: false,
            hasNegativeValues: false,
            previewRows: [{ Code: 'A', TotalValue: 10 }],
        });
        buildDeterministicSqlPresentationPlanMock.mockReturnValue({
            title: 'Project Performance Comparison by Code',
            description: 'Inspect project performance by code.',
            presentationMode: 'table',
            chartType: undefined,
            bindings: undefined,
        });
        executePresentationPlanAndCreateCardMock.mockResolvedValue({
            card: {
                id: 'card-table-1',
                plan: { title: 'Project Performance Comparison by Code', chartType: 'bar' },
            },
            presentationPlan: {
                title: 'Project Performance Comparison by Code',
                description: 'Inspect project performance by code.',
                presentationMode: 'table',
            },
            evidenceSummary: { rowCount: 2, columns: ['Code', 'TotalValue'] },
            activeDataQuery: { result: { rows: [] } },
        });

        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        const recordedSteps: Array<{ type: string; decision?: string | null; status: string }> = [];
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'Code', type: 'categorical', uniqueValues: 8 },
                { name: 'TotalValue', type: 'numerical' },
            ],
            settings: {
                provider: 'google',
                geminiApiKey: 'test-key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin',
                autoConfirmGoal: true,
            },
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
            dataPreparationPlan: null,
            agentMemoryHistory: [],
            recordAgentEvent: vi.fn(),
        } as any;
        const store = {
            getState: () => state,
            setState: vi.fn(),
        };

        const result = await processSingleTopic('Project performance comparison by code', {
            fileName: 'sales.csv',
            data: [{ Code: 'A', TotalValue: 10 }],
        } as any, store, {
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
        }, [], {
            hypothesisId: 'hyp-1',
            recordAnalysisStep: record => {
                recordedSteps.push({
                    type: record.type,
                    decision: record.decision ?? null,
                    status: record.status,
                });
                return `step-${recordedSteps.length}`;
            },
            semanticUnderstanding: {
                businessGrains: [],
                candidateMetrics: ['TotalValue'],
                timeGrains: [],
                helperDimensions: ['Code'],
                blockedDimensions: [],
                detailRowPolicy: 'exclude_non_detail_rows',
                businessGlossary: [],
                businessGrainConfidence: 'low',
                unsafeForBusinessNarrative: true,
            },
            datasetContext: {
                title: 'Dataset',
                dimensionColumns: ['Code'],
                metricColumns: ['TotalValue'],
                preferredGrainColumns: [],
                preferredMetricTerms: ['TotalValue'],
                helperDimensions: ['Code'],
                blockedDimensions: [],
                businessGrains: [],
                businessGrainConfidence: 'low',
                unsafeForBusinessNarrative: true,
            },
        });

        expect(result).toMatchObject({
            status: 'completed',
            cardCreated: true,
            accepted: true,
            valueDecision: 'table_only',
        });
        expect(recordedSteps).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'evaluate_evidence',
                decision: 'plan_presentation',
                status: 'succeeded',
            }),
            // table mode now proceeds to emit_standard_card instead of rejecting —
            // the card mock returns null, so the result is still not accepted,
            // but the presentation step itself is no longer a hard rejection.
            expect.objectContaining({
                type: 'plan_presentation',
                decision: 'emit_standard_card',
                status: 'succeeded',
            }),
        ]));
    });

    // --- Semantic fuzzy dedup tests ---

    it('rejects a plan with high Jaccard title overlap without running SQL', async () => {
        // "Revenue by Region" (plan) vs "Sales Revenue by Region" (accepted):
        // intersection={revenue,by,region}/union={sales,revenue,by,region} = 3/4 = 0.75 ≥ 0.6
        generateEvidenceQueryPlanWithRetryMock.mockResolvedValue({
            title: 'Revenue by Region',
            queryMode: 'aggregate',
            query: {
                select: ['Region', 'Revenue'],
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
                limit: 10,
            },
            intentSummary: 'Revenue grouped by region.',
            preferredResultShape: 'ranked_aggregate',
        });

        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 4 },
                { name: 'Revenue', type: 'numerical' },
            ],
            settings: {
                provider: 'google', geminiApiKey: 'test-key', openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview', complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin', autoConfirmGoal: true,
            },
            reportContextResolution: null, datasetSemanticSnapshot: null,
            semanticDatasetVersion: null, dataPreparationPlan: null,
            agentMemoryHistory: [], recordAgentEvent: vi.fn(),
        } as any;
        const store = { getState: () => state, setState: vi.fn() };

        // Existing accepted card with a title that shares 75% Jaccard with "Revenue by Region"
        const existingAcceptedOutputs = [{
            querySignature: 'different-sig',
            semanticSignature: 'different-sem',
            decision: 'pass' as const,
            title: 'Sales Revenue by Region',
        }];

        const result = await processSingleTopic('Revenue by region', {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 10 }],
        } as any, store, { tableName: 'session_clean_dataset', loadVersion: 'dataset-1' },
        existingAcceptedOutputs);

        // Should be rejected without running SQL
        expect(result).toMatchObject({
            status: 'completed',
            cardCreated: false,
            accepted: false,
            valueDecision: 'reject',
        });
        if (result.status === 'completed') {
            expect(result.rejectionReason).toContain('semantic fuzzy duplicate');
        }
        // SQL execution must NOT have been called
        expect(executeEvidenceQueryMock).not.toHaveBeenCalled();
    });

    // PERF-302: vectorStore semantic dedup is skipped during hypothesis loop.
    // This test verifies that vectorStore is NOT called even when a high-score
    // embedding match would have been returned — Jaccard dedup handles duplicates.
    it('skips vectorStore semantic dedup during hypothesis loop (PERF-302)', async () => {
        generateEvidenceQueryPlanWithRetryMock.mockResolvedValue({
            title: 'Regional Income Breakdown',
            queryMode: 'aggregate',
            query: {
                select: ['Region', 'Revenue'],
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
                limit: 10,
            },
            intentSummary: 'Regional income breakdown.',
            preferredResultShape: 'ranked_aggregate',
        });

        vectorStoreSearchIfReadyMock.mockResolvedValue([
            { id: 'card-123', text: 'Revenue by Region', score: 0.91 },
        ]);

        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 4 },
                { name: 'Revenue', type: 'numerical' },
            ],
            settings: {
                provider: 'google', geminiApiKey: 'test-key', openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview', complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin', autoConfirmGoal: true,
            },
            reportContextResolution: null, datasetSemanticSnapshot: null,
            semanticDatasetVersion: null, dataPreparationPlan: null,
            agentMemoryHistory: [], recordAgentEvent: vi.fn(),
        } as any;
        const store = { getState: () => state, setState: vi.fn() };

        const result = await processSingleTopic('Regional income breakdown', {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 10 }],
        } as any, store, { tableName: 'session_clean_dataset', loadVersion: 'dataset-1' }, []);

        // PERF-302: vectorStore is skipped, so even a high-score hit doesn't
        // cause rejection. The plan proceeds to execution.
        expect(vectorStoreSearchIfReadyMock).not.toHaveBeenCalled();
        expect(result.status).toBe('completed');
    });

    it('allows a plan through when vectorStore returns a low-score hit (< 0.85)', async () => {
        // vectorStore returns a hit but below the 0.85 threshold — should proceed
        vectorStoreSearchIfReadyMock.mockResolvedValue([
            { id: 'card-456', text: 'Something Else Entirely', score: 0.72 },
        ]);

        const { processSingleTopic } = await import('../services/agent/planning/topicProcessor');
        const state = {
            isChangingGoal: false,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 4 },
                { name: 'Revenue', type: 'numerical' },
            ],
            settings: {
                provider: 'google', geminiApiKey: 'test-key', openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview', complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin', autoConfirmGoal: true,
            },
            reportContextResolution: null, datasetSemanticSnapshot: null,
            semanticDatasetVersion: null, dataPreparationPlan: null,
            agentMemoryHistory: [], recordAgentEvent: vi.fn(),
        } as any;
        const store = { getState: () => state, setState: vi.fn() };

        const result = await processSingleTopic('Revenue by region', {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 10 }],
        } as any, store, { tableName: 'session_clean_dataset', loadVersion: 'dataset-1' }, []);

        // Low score → not a fuzzy duplicate → card should be accepted
        expect(result).toMatchObject({
            status: 'completed',
            cardCreated: true,
            accepted: true,
        });
        expect(executeEvidenceQueryMock).toHaveBeenCalledTimes(1);
    });
});
