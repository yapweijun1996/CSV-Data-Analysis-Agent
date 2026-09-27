// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    executePlanActionMock,
    getResolvedToolRegistryMock,
    handleExecutorActionMock,
    isSqlAnalysisPlanLikeMock,
    mapSqlAnalysisPlanToAnalysisPlanMock,
    preparePlanMock,
    recordMonitorEventMock,
    validateActionMock,
} = vi.hoisted(() => {
    const isSqlAnalysisPlanLikeFn = (plan: unknown): boolean => {
        if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return false;
        const candidate = plan as Record<string, unknown>;
        return (candidate.queryMode === 'aggregate' || candidate.queryMode === 'rowset')
            && Boolean(candidate.query && typeof candidate.query === 'object' && !Array.isArray(candidate.query))
            && Boolean(candidate.bindings && typeof candidate.bindings === 'object' && !Array.isArray(candidate.bindings));
    };
    const mapSqlAnalysisPlanToAnalysisPlanFn = (plan: any) => ({
        chartType: plan.chartType,
        title: plan.title,
        description: plan.description,
        aggregation: plan.aggregation,
        groupByColumn: plan.bindings.groupByColumn,
        valueColumn: plan.aggregation === 'count' && plan.bindings.valueColumn === 'count'
            ? undefined
            : plan.bindings.valueColumn,
        xValueColumn: plan.bindings.xValueColumn,
        yValueColumn: plan.bindings.yValueColumn,
        secondaryValueColumn: plan.bindings.secondaryValueColumn,
        secondaryAggregation: plan.secondaryAggregation,
        defaultTopN: plan.defaultTopN,
        defaultHideOthers: plan.defaultHideOthers,
    });
    return {
        executePlanActionMock: vi.fn(),
        getResolvedToolRegistryMock: vi.fn(),
        handleExecutorActionMock: vi.fn(),
        isSqlAnalysisPlanLikeMock: vi.fn(isSqlAnalysisPlanLikeFn),
        mapSqlAnalysisPlanToAnalysisPlanMock: vi.fn(mapSqlAnalysisPlanToAnalysisPlanFn),
        preparePlanMock: vi.fn(),
        recordMonitorEventMock: vi.fn(),
        validateActionMock: vi.fn(),
    };
});

vi.mock('../services/agent/execution/executorAgent', () => ({
    executePlanAction: executePlanActionMock,
    handleExecutorAction: handleExecutorActionMock,
    isSqlAnalysisPlanLike: isSqlAnalysisPlanLikeMock,
}));

vi.mock('../services/agent/planning/planGenerator', () => ({
    preparePlan: preparePlanMock,
    isSqlAutoAnalysisError: (err: unknown) =>
        err instanceof Error && 'code' in err && typeof (err as any).code === 'string',
}));

vi.mock('../services/agent/execution/sqlCardExecutor', () => ({
    mapSqlAnalysisPlanToAnalysisPlan: mapSqlAnalysisPlanToAnalysisPlanMock,
}));

vi.mock('../services/agent/monitoring/monitorAgent', () => ({
    recordMonitorEvent: recordMonitorEventMock,
}));

vi.mock('../services/ai/toolValidator', () => ({
    getResolvedToolRegistry: getResolvedToolRegistryMock,
    validateAction: validateActionMock,
}));

vi.mock('../services/agent/monitoring/agentMonitor', () => ({
    emitAgentEvent: vi.fn(),
}));

vi.mock('../services/agent/chatAgent', () => ({
    handleChatAction: vi.fn(),
}));

vi.mock('../services/agent/cleaningRunState', () => ({
    appendCleaningRunStep: vi.fn((run) => run),
    updateCleaningRun: vi.fn((run) => run),
}));

vi.mock('../services/agent/toolLogSanitizer', () => ({
    sanitizeToolLogDetail: vi.fn((_, detail) => detail),
}));

vi.mock('../services/agent/tools/toolGovernance', () => ({
    buildToolAvailabilityContext: vi.fn(() => ({})),
}));

describe('handleAiAction analysis.create_plan contract', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        preparePlanMock.mockImplementation(plan => plan);
        getResolvedToolRegistryMock.mockReturnValue({
            stage: 'analysis',
            allowedToolNames: ['analysis.create_plan'],
            blockedTools: [],
            descriptorMap: new Map([
                ['analysis.create_plan', { name: 'analysis.create_plan', category: 'analysis', risk: 'medium' }],
            ]),
            decisions: {
                'analysis.create_plan': {
                    allowed: true,
                    reason: 'allowed',
                    stage: 'analysis',
                    category: 'analysis',
                    risk: 'medium',
                },
            },
        });
        validateActionMock.mockReturnValue({
            isValid: true,
            errors: '',
            error: null,
        });
    });

    it('stops the turn when analysis.create_plan successfully creates a card', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        executePlanActionMock.mockResolvedValue({
            id: 'card-1',
            plan: {
                chartType: 'bar',
                title: 'Cost by Project Code',
                description: 'Compare cost totals by code.',
            },
            aggregatedData: [{ Code: 'A', Value: 100 }],
            summary: 'Summary',
            displayChartType: 'bar',
            isDataVisible: false,
            topN: null,
            hideOthers: false,
        });

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Create the requested card.',
            toolName: 'analysis.create_plan',
            args: {
                plan: {
                    chartType: 'bar',
                    title: 'Cost by Project Code',
                    description: 'Compare cost totals by code.',
                    groupByColumn: 'Code',
                    valueColumn: 'Value',
                    aggregation: 'sum',
                },
            },
        }, store as never);

        expect(result.status).toBe('success');
        expect(result.shouldStop).toBe(true);
        expect(result.observation?.summary).toContain('Created analysis card');
        expect(result.artifacts).toMatchObject({
            createdCardId: 'card-1',
            rowCount: 1,
            groupByColumn: 'Code',
            valueColumn: 'Value',
        });
    });

    it('blocks SQL-first derived metric plans on label/value datasets before card execution', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
            activeTurn: {
                userMessage: 'create a profit chart by project',
            },
            activeMetricMappingValidation: null,
            activeDataQuery: null,
            analysisCards: [],
            csvData: {
                data: [
                    { Project: 'Alpha', Description: 'Revenue', Value: 100 },
                    { Project: 'Alpha', Description: 'Cost of Sales', Value: 40 },
                ],
            },
            columnProfiles: [
                { name: 'Project', type: 'categorical' },
                { name: 'Description', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ],
            dataPreparationPlan: {
                explanation: 'Reshaped into a long metric table.',
                operations: [{ id: 'reshape', type: 'unpivot_columns', reason: 'Reshape report.' }],
                outputColumns: [],
            },
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Create the profitability card directly.',
            toolName: 'analysis.create_plan',
            args: {
                plan: {
                    chartType: 'bar',
                    title: 'Project Profitability Summary',
                    description: 'Show profitability by project.',
                    queryMode: 'aggregate',
                    bindings: {
                        groupByColumn: 'Project',
                        valueColumn: 'profitability_est',
                    },
                    query: {
                        groupBy: ['Project'],
                        aggregates: [
                            { function: 'sum', column: 'Value', as: 'profitability_est' },
                        ],
                        select: ['Project', 'profitability_est'],
                    },
                },
            },
        }, store as never);

        expect(result.status).toBe('blocked');
        expect(result.toolName).toBe('analysis.create_plan');
        expect(result.retryHint).toContain('analysis.validate_metric_mapping');
        expect(result.observation?.code).toBe('tool_contract');
        expect(executePlanActionMock).not.toHaveBeenCalled();
    });

    it('normalizes direct clarification tool calls before validation', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        getResolvedToolRegistryMock.mockReturnValue({
            stage: 'analysis',
            allowedToolNames: ['conversation.request_clarification'],
            blockedTools: [],
            descriptorMap: new Map([
                ['conversation.request_clarification', { name: 'conversation.request_clarification', category: 'conversation', risk: 'medium' }],
            ]),
            decisions: {
                'conversation.request_clarification': {
                    allowed: true,
                    reason: 'allowed',
                    stage: 'analysis',
                    category: 'conversation',
                    risk: 'medium',
                },
            },
        });
        validateActionMock.mockImplementation((action: any) => {
            expect(action.args).toMatchObject({
                question: 'Which dimensions define a unique record?',
                allowFreeText: true,
                options: [],
                clarificationMode: 'free_text',
            });
            return {
                isValid: true,
                errors: '',
                error: null,
            };
        });
        handleExecutorActionMock.mockResolvedValue({
            status: 'success',
            toolName: 'conversation.request_clarification',
            message: 'Clarification requested.',
            shouldStop: true,
            observation: {
                type: 'clarification',
                status: 'success',
                summary: 'Which dimensions define a unique record?',
                toolName: 'conversation.request_clarification',
            },
        });

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Ask the user which dimensions define a unique record?',
            toolName: 'conversation.request_clarification',
            args: {
                message: 'Which dimensions define a unique record?',
                options: [{ label: '', value: 'bad option' }],
            },
        }, store as never);

        expect(result.status).toBe('success');
        expect(validateActionMock).toHaveBeenCalledTimes(1);
        expect(handleExecutorActionMock).toHaveBeenCalledWith(expect.objectContaining({
            args: expect.objectContaining({
                question: 'Which dimensions define a unique record?',
                allowFreeText: true,
                clarificationMode: 'free_text',
            }),
        }), store, undefined);
        expect(recordMonitorEventMock).not.toHaveBeenCalledWith(store, expect.objectContaining({
            stage: 'executor_blocked',
        }));
    });

    it('autofills metricName for metric validation actions when the current turn implies one derived metric', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
            activeTurn: {
                userMessage: 'Analyze Revenue and Cost Variances',
            },
            activeMetricMappingValidation: null,
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        getResolvedToolRegistryMock.mockReturnValue({
            stage: 'analysis',
            allowedToolNames: ['analysis.validate_metric_mapping'],
            blockedTools: [],
            descriptorMap: new Map([
                ['analysis.validate_metric_mapping', { name: 'analysis.validate_metric_mapping', category: 'analysis', risk: 'medium' }],
            ]),
            decisions: {
                'analysis.validate_metric_mapping': {
                    allowed: true,
                    reason: 'allowed',
                    stage: 'analysis',
                    category: 'analysis',
                    risk: 'medium',
                },
            },
        });
        validateActionMock.mockImplementation((action: any) => {
            expect(action.args).toMatchObject({
                metricName: 'profit',
            });
            return {
                isValid: true,
                errors: '',
                error: null,
            };
        });
        handleExecutorActionMock.mockResolvedValue({
            status: 'success',
            toolName: 'analysis.validate_metric_mapping',
            message: 'Validated the profit metric mapping.',
            shouldStop: false,
            observation: {
                type: 'tool_result',
                status: 'success',
                summary: 'Validated the profit metric mapping.',
                toolName: 'analysis.validate_metric_mapping',
            },
        });

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Validate the requested metric mapping first.',
            toolName: 'analysis.validate_metric_mapping',
            args: {},
        }, store as never);

        expect(result.status).toBe('success');
        expect(handleExecutorActionMock).toHaveBeenCalledWith(expect.objectContaining({
            args: expect.objectContaining({
                metricName: 'profit',
            }),
        }), store, undefined);
    });

    it('prioritizes profit when validating a gross profit variance request', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
            activeTurn: {
                userMessage: 'Explain the gross profit variance by project',
            },
            activeMetricMappingValidation: null,
            pendingClarification: null,
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        getResolvedToolRegistryMock.mockReturnValue({
            stage: 'analysis',
            allowedToolNames: ['analysis.validate_metric_mapping'],
            blockedTools: [],
            descriptorMap: new Map([
                ['analysis.validate_metric_mapping', { name: 'analysis.validate_metric_mapping', category: 'analysis', risk: 'medium' }],
            ]),
            decisions: {
                'analysis.validate_metric_mapping': {
                    allowed: true,
                    reason: 'allowed',
                    stage: 'analysis',
                    category: 'analysis',
                    risk: 'medium',
                },
            },
        });
        validateActionMock.mockImplementation((action: any) => {
            expect(action.args).toMatchObject({
                metricName: 'profit',
                validationKind: 'derived',
            });
            return {
                isValid: true,
                errors: '',
                error: null,
            };
        });
        handleExecutorActionMock.mockResolvedValue({
            status: 'success',
            toolName: 'analysis.validate_metric_mapping',
            message: 'Validated the profit metric mapping.',
            shouldStop: false,
            observation: {
                type: 'tool_result',
                status: 'success',
                summary: 'Validated the profit metric mapping.',
                toolName: 'analysis.validate_metric_mapping',
            },
        });

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Validate the gross profit mapping before deriving anything else.',
            toolName: 'analysis.validate_metric_mapping',
            args: {},
        }, store as never);

        expect(result.status).toBe('success');
        expect(handleExecutorActionMock).toHaveBeenCalledWith(expect.objectContaining({
            args: expect.objectContaining({
                metricName: 'profit',
                validationKind: 'derived',
            }),
        }), store, undefined);
    });

    it('returns a blocked result when the plan runs but no card is created', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        executePlanActionMock.mockResolvedValue(null);

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Create the requested card.',
            toolName: 'analysis.create_plan',
            args: {
                plan: {
                    chartType: 'bar',
                    title: 'Cost by Project Code',
                    description: 'Compare cost totals by code.',
                    groupByColumn: 'Code',
                    valueColumn: 'Value',
                    aggregation: 'sum',
                },
            },
        }, store as never);

        expect(result.status).toBe('blocked');
        expect(result.shouldStop).toBe(false);
        expect(result.retryHint).toContain('Choose a different analysis plan');
        expect(result.observation?.summary).toContain('did not create a card');
        expect(recordMonitorEventMock).toHaveBeenCalledWith(store, expect.objectContaining({
            stage: 'executor_blocked',
            detail: expect.stringContaining('did not create a card.'),
            isError: false,
        }));
        expect(recordMonitorEventMock).not.toHaveBeenCalledWith(store, expect.objectContaining({
            stage: 'executor_error',
            detail: expect.stringContaining('did not create a card.'),
        }));
    });

    it('returns a blocked flat_metric result when create_plan hits a soft analysis failure', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const { PlanExecutionSoftError } = await import('../services/agent/execution/planExecutionErrors');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        executePlanActionMock.mockRejectedValue(new PlanExecutionSoftError(
            'empty_result',
            'Plan "Cost by Project Code" produced no rows.',
            { title: 'Cost by Project Code' },
        ));

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Create the requested card.',
            toolName: 'analysis.create_plan',
            args: {
                plan: {
                    chartType: 'bar',
                    title: 'Cost by Project Code',
                    description: 'Compare cost totals by code.',
                    groupByColumn: 'Code',
                    valueColumn: 'Value',
                    aggregation: 'sum',
                },
            },
        }, store as never);

        expect(result.status).toBe('blocked');
        expect(result.retryHint).toContain('broader filters');
        expect(result.observation?.code).toBe('empty_result');
        expect(result.observation?.detail).toMatchObject({ title: 'Cost by Project Code' });
        expect(recordMonitorEventMock).toHaveBeenCalledWith(store, expect.objectContaining({
            stage: 'executor_blocked',
            detail: 'Plan "Cost by Project Code" produced no rows.',
            isError: false,
        }));
    });

    it('passes SQL-first create_plan payloads through without preparePlan fallback and reports mapped bindings', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        executePlanActionMock.mockResolvedValue({
            id: 'card-sql-1',
            plan: {
                chartType: 'bar',
                title: 'Project Profitability',
                description: 'Compare project revenue and cost.',
            },
            aggregatedData: [{ SeriesLabelL1: 'Alpha', total_revenue: 100, total_cost: 40 }],
            summary: 'Summary',
            displayChartType: 'bar',
            isDataVisible: false,
            topN: null,
            hideOthers: false,
        });

        const sqlPlan = {
            chartType: 'bar',
            title: 'Project Profitability',
            description: 'Compare project revenue and cost.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            bindings: {
                groupByColumn: 'SeriesLabelL1',
                valueColumn: 'total_revenue',
                secondaryValueColumn: 'total_cost',
            },
            query: {
                groupBy: ['SeriesLabelL1'],
                aggregates: [
                    {
                        function: 'sum',
                        column: 'Value',
                        as: 'total_revenue',
                        where: {
                            predicates: [{ column: 'Description', operator: 'in', value: ['Revenue'] }],
                        },
                    },
                    {
                        function: 'sum',
                        column: 'Value',
                        as: 'total_cost',
                        where: {
                            predicates: [{ column: 'Description', operator: 'in', value: ['Cost of sales'] }],
                        },
                    },
                ],
                select: ['SeriesLabelL1', 'total_revenue', 'total_cost'],
            },
        };

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Create the SQL-backed profitability card.',
            toolName: 'analysis.create_plan',
            args: { plan: sqlPlan },
        }, store as never);

        expect(result.status).toBe('success');
        expect(result.shouldStop).toBe(true);
        expect(preparePlanMock).not.toHaveBeenCalled();
        expect(executePlanActionMock).toHaveBeenCalledWith(sqlPlan, store, { throwOnSoftFailure: true });
        expect(result.artifacts).toMatchObject({
            createdCardId: 'card-sql-1',
            rowCount: 1,
            groupByColumn: 'SeriesLabelL1',
            valueColumn: 'total_revenue',
        });
    });

    it('adapts visualization-only create_plan specs onto the active query result instead of falling back to count', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
            activeDataQuery: {
                explanation: 'Project profitability summary.',
                plan: {
                    groupBy: ['SeriesLabelL1'],
                    aggregates: [
                        { function: 'sum', column: 'Value', as: 'total_revenue' },
                        { function: 'sum', column: 'Value', as: 'total_cost' },
                    ],
                    select: ['SeriesLabelL1', 'total_revenue', 'total_cost'],
                },
                result: {
                    rows: [{ SeriesLabelL1: 'Alpha', total_revenue: 100, total_cost: 40 }],
                    totalMatchedRows: 1,
                    returnedRows: 1,
                    truncated: false,
                    selectedColumns: ['SeriesLabelL1', 'total_revenue', 'total_cost'],
                    appliedOrderBy: [],
                    appliedLimit: 10,
                    durationMs: 5,
                },
                appliedAt: new Date('2026-03-15T10:39:52.000Z'),
                source: 'execute_data_query',
                engine: 'duckdb',
                sqlPreview: 'SELECT SeriesLabelL1, total_revenue, total_cost FROM profitability',
                tableName: 'session_clean_dataset',
                loadVersion: 'dataset-1',
                fallbackReason: null,
                fallbackFilterOperation: null,
            },
            columnProfiles: [
                { name: 'SeriesLabelL1', type: 'categorical' },
                { name: 'Description', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ],
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        executePlanActionMock.mockResolvedValue({
            id: 'card-sql-2',
            plan: {
                chartType: 'bar',
                title: 'Project Profitability: Revenue vs Cost',
                description: 'Compare total revenue and total cost by project.',
            },
            aggregatedData: [{ SeriesLabelL1: 'Alpha', total_revenue: 100, total_cost: 40 }],
            summary: 'Summary',
            displayChartType: 'bar',
            isDataVisible: false,
            topN: null,
            hideOthers: false,
        });

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Visualize the current profitability result.',
            toolName: 'analysis.create_plan',
            args: {
                plan: {
                    chart: 'bar',
                    title: 'Project Profitability: Revenue vs Cost',
                    description: 'Compare total revenue and total cost by project.',
                    groupBy: 'SeriesLabelL1',
                    values: ['total_revenue', 'total_cost'],
                    metrics: ['total_revenue', 'total_cost'],
                    columns: ['SeriesLabelL1', 'total_revenue', 'total_cost'],
                },
            },
        }, store as never);

        expect(result.status).toBe('success');
        expect(preparePlanMock).not.toHaveBeenCalled();
        expect(executePlanActionMock).toHaveBeenCalledWith(expect.objectContaining({
            chartType: 'combo',
            title: 'Project Profitability: Revenue vs Cost',
            queryMode: 'aggregate',
            bindings: {
                groupByColumn: 'SeriesLabelL1',
                valueColumn: 'total_revenue',
                secondaryValueColumn: 'total_cost',
            },
            query: {
                groupBy: ['SeriesLabelL1'],
                aggregates: [
                    { function: 'sum', column: 'Value', as: 'total_revenue' },
                    { function: 'sum', column: 'Value', as: 'total_cost' },
                ],
                select: ['SeriesLabelL1', 'total_revenue', 'total_cost'],
            },
        }), store, { throwOnSoftFailure: true });
    });

    it('adapts xAxis/yAxis/valueColumns specs onto the active query result instead of rebuilding a count chart', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
            activeDataQuery: {
                explanation: 'Project profitability summary.',
                plan: {
                    groupBy: ['SeriesLabelL1'],
                    aggregates: [
                        { function: 'sum', column: 'Value', as: 'total_revenue' },
                        { function: 'sum', column: 'Value', as: 'total_cost' },
                    ],
                    select: ['SeriesLabelL1', 'total_revenue', 'total_cost'],
                },
                result: {
                    rows: [{ SeriesLabelL1: 'Alpha', total_revenue: 100, total_cost: 40 }],
                    totalMatchedRows: 1,
                    returnedRows: 1,
                    truncated: false,
                    selectedColumns: ['SeriesLabelL1', 'total_revenue', 'total_cost'],
                    appliedOrderBy: [],
                    appliedLimit: 10,
                    durationMs: 5,
                },
                appliedAt: new Date('2026-03-15T12:20:30.000Z'),
                source: 'execute_data_query',
                engine: 'duckdb',
                sqlPreview: 'SELECT SeriesLabelL1, total_revenue, total_cost FROM profitability',
                tableName: 'session_clean_dataset',
                loadVersion: 'dataset-1',
                fallbackReason: null,
                fallbackFilterOperation: null,
            },
            columnProfiles: [
                { name: 'SeriesLabelL1', type: 'categorical' },
                { name: 'Description', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ],
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        executePlanActionMock.mockResolvedValue({
            id: 'card-sql-3',
            plan: {
                chartType: 'combo',
                title: 'Project Profitability Analysis (Revenue vs Cost)',
                description: 'Comparison of Total Revenue vs Total Cost per project.',
            },
            aggregatedData: [{ SeriesLabelL1: 'Alpha', total_revenue: 100, total_cost: 40 }],
            summary: 'Summary',
            displayChartType: 'combo',
            isDataVisible: false,
            topN: null,
            hideOthers: false,
        });

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Visualize profitability by project.',
            toolName: 'analysis.create_plan',
            args: {
                plan: {
                    chartType: 'bar',
                    title: 'Project Profitability Analysis (Revenue vs Cost)',
                    description: 'Comparison of Total Revenue vs Total Cost per project.',
                    xAxis: 'SeriesLabelL1',
                    yAxis: ['total_revenue', 'total_cost'],
                    valueColumns: ['total_revenue', 'total_cost'],
                },
            },
        }, store as never);

        expect(result.status).toBe('success');
        expect(executePlanActionMock).toHaveBeenCalledWith(expect.objectContaining({
            chartType: 'combo',
            bindings: {
                groupByColumn: 'SeriesLabelL1',
                valueColumn: 'total_revenue',
                secondaryValueColumn: 'total_cost',
            },
        }), store, { throwOnSoftFailure: true });
    });

    it('allows create_plan to reuse already materialized derived metrics from the active query result', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
            activeTurn: {
                userMessage: 'create a profit chart by project',
            },
            activeMetricMappingValidation: {
                artifactType: 'metric_mapping_validation',
                metricName: 'profit',
                validationKind: 'derived',
                metricDefinition: null,
                validationIssues: [],
                blockers: [],
                recommendedAction: 'visualize',
                recommendedPath: 'derive_metric_by_label_then_plan',
                suggestedNextTool: 'analysis.create_plan',
                deriveMetricTemplate: null,
                grain: ['SeriesLabelL1'],
                sourceArtifactIds: [],
                originRunId: 'run-1',
                originTurnId: 'turn-1',
                requestFingerprint: 'fp-1',
                requestMessage: 'create a profit chart by project',
            },
            activeDataQuery: {
                explanation: 'Project profitability summary.',
                plan: {
                    groupBy: ['SeriesLabelL1'],
                    aggregates: [
                        { function: 'sum', column: 'Value', as: 'profit' },
                    ],
                    select: ['SeriesLabelL1', 'profit'],
                },
                result: {
                    rows: [{ SeriesLabelL1: 'Alpha', profit: 60 }],
                    totalMatchedRows: 1,
                    returnedRows: 1,
                    truncated: false,
                    selectedColumns: ['SeriesLabelL1', 'profit'],
                    appliedOrderBy: [],
                    appliedLimit: 10,
                    durationMs: 5,
                },
                appliedAt: new Date('2026-03-17T12:20:30.000Z'),
                source: 'execute_data_query',
                engine: 'duckdb',
                sqlPreview: 'SELECT SeriesLabelL1, profit FROM profitability',
                tableName: 'session_clean_dataset',
                loadVersion: 'dataset-1',
                fallbackReason: null,
                fallbackFilterOperation: null,
            },
            analysisCards: [],
            csvData: {
                data: [
                    { SeriesLabelL1: 'Alpha', Description: 'Profit', Value: 60 },
                ],
            },
            columnProfiles: [
                { name: 'SeriesLabelL1', type: 'categorical' },
                { name: 'Description', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ],
            dataPreparationPlan: {
                explanation: 'Reshaped into a long metric table.',
                operations: [{ id: 'reshape', type: 'unpivot_columns', reason: 'Reshape report.' }],
                outputColumns: [],
            },
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        executePlanActionMock.mockResolvedValue({
            id: 'card-sql-profit',
            plan: {
                chartType: 'bar',
                title: 'Project Profitability',
                description: 'Compare profit by project.',
            },
            aggregatedData: [{ SeriesLabelL1: 'Alpha', profit: 60 }],
            summary: 'Summary',
            displayChartType: 'bar',
            isDataVisible: false,
            topN: null,
            hideOthers: false,
        });

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Visualize the materialized profit metric.',
            toolName: 'analysis.create_plan',
            args: {
                plan: {
                    chartType: 'bar',
                    title: 'Project Profitability',
                    description: 'Compare profit by project.',
                    xAxis: 'SeriesLabelL1',
                    valueColumns: ['profit'],
                },
            },
        }, store as never);

        expect(result.status).toBe('success');
        expect(executePlanActionMock).toHaveBeenCalled();
    });

    it('adapts malformed SQL-like create_plan payloads with unsupported queryMode back onto the active query result', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
            activeDataQuery: {
                explanation: 'Project profitability summary.',
                plan: {
                    groupBy: ['SeriesLabelL1'],
                    aggregates: [
                        { function: 'sum', column: 'Value', as: 'total_revenue' },
                        { function: 'sum', column: 'Value', as: 'total_cost' },
                    ],
                    select: ['SeriesLabelL1', 'total_revenue', 'total_cost'],
                    orderBy: [{ column: 'total_revenue', direction: 'desc' }],
                    limit: 15,
                },
                result: {
                    rows: [{ SeriesLabelL1: 'Alpha', total_revenue: 100, total_cost: 40 }],
                    totalMatchedRows: 1,
                    returnedRows: 1,
                    truncated: false,
                    selectedColumns: ['SeriesLabelL1', 'total_revenue', 'total_cost'],
                    appliedOrderBy: [{ column: 'total_revenue', direction: 'desc' }],
                    appliedLimit: 15,
                    durationMs: 5,
                },
                appliedAt: new Date('2026-03-15T14:28:22.000Z'),
                source: 'execute_data_query',
                engine: 'duckdb',
                sqlPreview: 'SELECT SeriesLabelL1, total_revenue, total_cost FROM profitability',
                tableName: 'session_clean_dataset',
                loadVersion: 'dataset-1',
                fallbackReason: null,
                fallbackFilterOperation: null,
            },
            columnProfiles: [
                { name: 'SeriesLabelL1', type: 'categorical' },
                { name: 'Description', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ],
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        executePlanActionMock.mockResolvedValue({
            id: 'card-sql-4',
            plan: {
                chartType: 'combo',
                title: 'Project Profitability: Revenue vs. Cost',
                description: 'Compare total revenue and total cost by project.',
            },
            aggregatedData: [{ SeriesLabelL1: 'Alpha', total_revenue: 100, total_cost: 40 }],
            summary: 'Summary',
            displayChartType: 'combo',
            isDataVisible: false,
            topN: null,
            hideOthers: false,
        });

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Reuse the existing profitability query to render the chart.',
            toolName: 'analysis.create_plan',
            args: {
                plan: {
                    chartType: 'bar',
                    title: 'Project Profitability: Revenue vs. Cost',
                    description: 'A bar chart comparing total revenue against total cost for each project.',
                    queryMode: 'table',
                    bindings: {
                        groupByColumn: 'SeriesLabelL1',
                        valueColumn: 'total_revenue',
                        secondaryValueColumn: 'total_cost',
                    },
                    query: {
                        select: ['SeriesLabelL1', 'total_revenue', 'total_cost'],
                        orderBy: [{ column: 'total_revenue', direction: 'desc' }],
                        limit: 15,
                    },
                },
            },
        }, store as never);

        expect(result.status).toBe('success');
        expect(preparePlanMock).not.toHaveBeenCalled();
        expect(executePlanActionMock).toHaveBeenCalledWith(expect.objectContaining({
            queryMode: 'aggregate',
            query: {
                groupBy: ['SeriesLabelL1'],
                aggregates: [
                    { function: 'sum', column: 'Value', as: 'total_revenue' },
                    { function: 'sum', column: 'Value', as: 'total_cost' },
                ],
                select: ['SeriesLabelL1', 'total_revenue', 'total_cost'],
                orderBy: [{ column: 'total_revenue', direction: 'desc' }],
                limit: 15,
            },
            bindings: {
                groupByColumn: 'SeriesLabelL1',
                valueColumn: 'total_revenue',
                secondaryValueColumn: 'total_cost',
            },
        }), store, { throwOnSoftFailure: true });
    });

    it('does not record executor success when a non-plan tool returns an error result', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        getResolvedToolRegistryMock.mockReturnValue({
            stage: 'analysis',
            allowedToolNames: ['data.query'],
            blockedTools: [],
            descriptorMap: new Map([
                ['data.query', { name: 'data.query', category: 'data', risk: 'medium' }],
            ]),
            decisions: {
                'data.query': {
                    allowed: true,
                    reason: 'allowed',
                    stage: 'analysis',
                    category: 'data',
                    risk: 'medium',
                },
            },
        });
        handleExecutorActionMock.mockResolvedValue({
            status: 'error',
            toolName: 'data.query',
            message: 'Query failed.',
            shouldStop: false,
        });

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Run the query.',
            toolName: 'data.query',
            args: {
                explanation: 'Inspect the rows.',
                plan: { select: ['Region'], limit: 10 },
            },
        }, store as never);

        expect(result.status).toBe('error');
        expect(recordMonitorEventMock).toHaveBeenCalledWith(store, expect.objectContaining({
            stage: 'executor_error',
            detail: 'Query failed.',
            isError: true,
        }));
        expect(recordMonitorEventMock).not.toHaveBeenCalledWith(store, expect.objectContaining({
            stage: 'executor_success',
        }));
    });

    it('records executor_blocked instead of executor_error when a tool is denied by runtime policy', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        getResolvedToolRegistryMock.mockReturnValue({
            stage: 'analysis',
            allowedToolNames: ['conversation.request_clarification'],
            blockedTools: [{
                toolName: 'data.query',
                allowed: false,
                reason: 'Tool "data.query" was explicitly denied for this session.',
                stage: 'analysis',
                category: 'data',
                risk: 'medium',
                source: 'deny_override',
            }],
            descriptorMap: new Map([
                ['data.query', { name: 'data.query', category: 'data', risk: 'medium' }],
            ]),
            decisions: {
                'data.query': {
                    allowed: false,
                    reason: 'Tool "data.query" was explicitly denied for this session.',
                    stage: 'analysis',
                    category: 'data',
                    risk: 'medium',
                    source: 'deny_override',
                },
            },
        });
        validateActionMock.mockReturnValue({
            isValid: false,
            errors: 'Tool "data.query" was explicitly denied for this session.',
            error: {
                code: 'blocked_tool',
                message: 'Tool "data.query" was explicitly denied for this session.',
                toolName: 'data.query',
            },
        });

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Run the query.',
            toolName: 'data.query',
            args: {
                explanation: 'Inspect the rows.',
                plan: { select: ['Region'], limit: 10 },
            },
        }, store as never);

        expect(result.status).toBe('blocked');
        expect(recordMonitorEventMock).toHaveBeenCalledWith(store, expect.objectContaining({
            stage: 'executor_blocked',
            detail: 'Tool "data.query" was explicitly denied for this session.',
            isError: false,
        }));
        expect(recordMonitorEventMock).not.toHaveBeenCalledWith(store, expect.objectContaining({
            stage: 'executor_error',
            detail: 'Tool "data.query" was explicitly denied for this session.',
        }));
    });

    it('treats malformed tool payloads as blocked validation outcomes instead of executor errors', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        getResolvedToolRegistryMock.mockReturnValue({
            stage: 'analysis',
            allowedToolNames: ['data.query'],
            blockedTools: [],
            descriptorMap: new Map([
                ['data.query', { name: 'data.query', category: 'data', risk: 'medium' }],
            ]),
            decisions: {
                'data.query': {
                    allowed: true,
                    reason: 'allowed',
                    stage: 'analysis',
                    category: 'data',
                    risk: 'medium',
                    source: 'stage_allowlist',
                },
            },
        });
        validateActionMock.mockReturnValue({
            isValid: false,
            errors: '"plan.select" must list plain output column names only.',
            error: {
                code: 'malformed_tool_payload',
                message: '"plan.select" must list plain output column names only.',
                toolName: 'data.query',
            },
        });

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Run the query.',
            toolName: 'data.query',
            args: {
                explanation: 'Count the rows.',
                plan: { select: ['COUNT(*) AS total_rows'] },
            },
        }, store as never);

        expect(result.status).toBe('blocked');
        expect(result.observation?.status).toBe('blocked');
        expect(result.observation?.code).toBe('validation_failed');
        expect(result.retryHint).toContain('Repair the data.query payload instead of switching tools.');
        expect(result.retryHint).toContain('plain output column names only');
        expect(result.observation?.detail).toMatchObject({
            repairHintCategory: 'sqlish_select_expression',
        });
        expect(recordMonitorEventMock).toHaveBeenCalledWith(store, expect.objectContaining({
            stage: 'executor_blocked',
            detail: '"plan.select" must list plain output column names only.',
            isError: false,
        }));
        expect(recordMonitorEventMock).not.toHaveBeenCalledWith(store, expect.objectContaining({
            stage: 'executor_error',
            detail: '"plan.select" must list plain output column names only.',
        }));
    });

    it('treats missing-thought validation as a blocked runtime contract miss', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        getResolvedToolRegistryMock.mockReturnValue({
            stage: 'analysis',
            allowedToolNames: ['data.query'],
            blockedTools: [],
            descriptorMap: new Map([
                ['data.query', { name: 'data.query', category: 'data', risk: 'medium' }],
            ]),
            decisions: {
                'data.query': {
                    allowed: true,
                    reason: 'allowed',
                    stage: 'analysis',
                    category: 'data',
                    risk: 'medium',
                    source: 'stage_allowlist',
                },
            },
        });
        validateActionMock.mockReturnValue({
            isValid: false,
            errors: "Every action must include a non-empty 'thought'.",
            error: {
                code: 'invalid_action',
                message: "Every action must include a non-empty 'thought'.",
                toolName: 'data.query',
            },
        });

        const result = await handleAiAction({
            type: 'tool_call',
            toolName: 'data.query',
            args: {
                explanation: 'Inspect the rows.',
                plan: { select: ['Region'], limit: 10 },
            },
        } as never, store as never);

        expect(result.status).toBe('blocked');
        expect(result.observation?.code).toBe('validation_failed');
        expect(recordMonitorEventMock).toHaveBeenCalledWith(store, expect.objectContaining({
            stage: 'executor_blocked',
            detail: "Every action must include a non-empty 'thought'.",
            isError: false,
        }));
    });

    it('attaches repair guidance for malformed data.mutate payloads', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            chatHistory: [],
            cleaningRun: null,
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        getResolvedToolRegistryMock.mockReturnValue({
            stage: 'analysis',
            allowedToolNames: ['data.mutate'],
            blockedTools: [],
            descriptorMap: new Map([
                ['data.mutate', { name: 'data.mutate', category: 'data', risk: 'medium' }],
            ]),
            decisions: {
                'data.mutate': {
                    allowed: true,
                    reason: 'allowed',
                    stage: 'analysis',
                    category: 'data',
                    risk: 'medium',
                    source: 'stage_allowlist',
                },
            },
        });
        validateActionMock.mockReturnValue({
            isValid: false,
            errors: 'operation "std_revenue" (index 1): replace_values requires id, reason, column, and replacements[].',
            error: {
                code: 'malformed_tool_payload',
                message: 'operation "std_revenue" (index 1): replace_values requires id, reason, column, and replacements[].',
                toolName: 'data.mutate',
            },
        });

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Normalize revenue labels.',
            toolName: 'data.mutate',
            args: {
                explanation: 'Standardize revenue labels.',
                operations: [
                    {
                        id: 'std_revenue',
                        type: 'replace_values',
                        reason: 'Normalize revenue labels.',
                        replacements: [
                            { from: 'Net Sales / Revenue', to: 'Revenue' },
                        ],
                    },
                ],
            },
        }, store as never);

        expect(result.status).toBe('blocked');
        expect(result.retryHint).toContain('top-level id, reason, column, and replacements');
        expect(result.observation?.detail).toMatchObject({
            repairHintCategory: 'missing_replace_values_fields',
        });
    });
});
