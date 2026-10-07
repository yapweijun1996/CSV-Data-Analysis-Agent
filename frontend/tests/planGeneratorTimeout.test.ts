// @vitest-environment node

/**
 * P0 Anti-Survivorship Resilience: planGenerator timeout guards
 *
 * Verifies that:
 * 1. generateAnalysisTopics: first attempt timeout → simplified prompt retry
 * 2. generateAnalysisTopics: both attempts timeout → deterministic fallback topics returned
 * 3. generateAnalysisTopics: first timeout → simplified retry succeeds → topics returned
 * 4. generateEvidenceQueryPlanWithRetry: per-attempt timeout treated as retryable error → next attempt succeeds
 *
 * Pattern: mock PlanGenerationTimeoutError by having runWithOverflowCompaction throw it
 * (since raceWithPlanTimeout propagates rejections from the original promise unchanged).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildDeterministicTopics,
    generateAnalysisTopics,
    generateEvidenceQueryPlanStepped,
    generateEvidenceQueryPlanWithRetry,
} from '../services/agent/planning/planGenerator';
import type { ColumnProfile, Settings } from '../types';
import type { AnalysisDatasetContext } from '../services/agent/planning/planGenerator';

// --- Mocks ---

const { runWithOverflowCompactionMock, generateTextMock, streamTextMock, createProviderModelMock, robustlyParseJsonObjectMock } = vi.hoisted(() => ({
    runWithOverflowCompactionMock: vi.fn(),
    generateTextMock: vi.fn(),
    streamTextMock: vi.fn(() => ({
        fullStream: (async function* () {})(),
        text: Promise.resolve(''),
        finishReason: Promise.resolve('stop'),
        output: Promise.resolve(undefined),
    })),
    createProviderModelMock: vi.fn(),
    robustlyParseJsonObjectMock: vi.fn(),
}));

const restoreJsonParserMock = () => {
    robustlyParseJsonObjectMock.mockImplementation((text: string) => {
        try { return JSON.parse(text); } catch { return {}; }
    });
};

vi.mock('../services/ai/overflowRetry', () => ({
    runWithOverflowCompaction: runWithOverflowCompactionMock,
}));

vi.mock('ai', () => ({
    Output: { object: vi.fn().mockReturnValue({}) },
    generateText: generateTextMock,
    jsonSchema: vi.fn().mockReturnValue({}),
    streamText: streamTextMock,
}));

vi.mock('../services/ai/providerConfig', () => ({
    createProviderModel: createProviderModelMock,
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

vi.mock('../services/ai/contextManager', () => ({
    createContextSection: vi.fn().mockReturnValue({ key: 'section', content: '' }),
    formatColumnNames: vi.fn().mockReturnValue(''),
    formatRows: vi.fn().mockReturnValue(''),
    prepareManagedContext: vi.fn().mockResolvedValue({ systemText: 'system', userText: 'user', diagnostics: [] }),
    reportContextDiagnostics: vi.fn(),
    trimRawDataSample: vi.fn().mockReturnValue([]),
}));

vi.mock('../services/dashboard/businessLabelResolver', () => ({
    formatColumnDisplayHints: vi.fn().mockReturnValue(''),
}));

vi.mock('../services/prompts/analysisPrompts', () => ({
    buildAnalysisPlannerSystemPrompt: vi.fn().mockReturnValue('system prompt'),
    buildPlanRetryFeedback: vi.fn().mockReturnValue(''),
    buildTopicPlanningUserPrompt: vi.fn().mockReturnValue('user prompt'),
    createAnalysisTopicsPrompt: vi.fn().mockReturnValue('topics prompt'),
}));

vi.mock('../services/ai/schemas/analysisSchemas', () => ({
    createAnalysisTopicsSchema: vi.fn().mockReturnValue({}),
    createSqlEvidenceQueryPlanSchema: vi.fn().mockReturnValue({}),
}));

vi.mock('../utils/jsonParser', () => ({
    robustlyParseJsonObject: robustlyParseJsonObjectMock,
}));

// --- Helpers to simulate timeout ---

// PlanGenerationTimeoutError is a private class in planGenerator.ts.
// We simulate it by having runWithOverflowCompaction throw a plain Error with
// the exact class name 'PlanGenerationTimeoutError' — which isPlanGenerationTimeout checks via instanceof.
// Since we can't import the private class, we instead need a different approach.
//
// The cleanest approach: the raceWithPlanTimeout race is driven by a real setTimeout.
// We pass _options.timeoutMs = 0 in tests. With timeoutMs=0, the timer fires on the
// next macrotask. But runWithOverflowCompaction is mocked to resolve immediately
// (microtask), which would WIN over the macrotask timeout.
//
// Instead, we mock runWithOverflowCompaction to NEVER resolve (hangs) and use
// very small timeoutMs (-1 treated as 0) so the race timer fires first.
// Using vi.useFakeTimers() gives us precise control.
//
// Simpler approach used here: import the actual PlanGenerationTimeoutError via
// dynamic inspection of the timeout mechanism.
//
// ACTUAL approach: Use a REAL pending promise + real timer with fake timers API.

// Helper: a promise that never resolves
const neverResolve = () => new Promise<never>(() => undefined);

// --- Test fixtures ---

const makeColumns = (): ColumnProfile[] => [
    { name: 'Department', type: 'categorical', uniqueValues: 8 },
    { name: 'Category', type: 'categorical', uniqueValues: 15 },
    { name: 'Revenue', type: 'currency', uniqueValues: 500 },
    { name: 'Cost', type: 'numerical', uniqueValues: 400 },
];

const makeDatasetContext = (): AnalysisDatasetContext => ({
    title: 'Sales Dataset',
    dimensionColumns: ['Department', 'Category'],
    metricColumns: ['Revenue', 'Cost'],
    preferredGrainColumns: ['Department'],
    preferredMetricTerms: ['Revenue'],
    blockedDimensions: [],
} as unknown as AnalysisDatasetContext);

const makeSettings = (): Settings => ({
    provider: 'openai',
    openAIApiKey: 'test-key',
    geminiApiKey: '',
    simpleModel: 'gpt-mini',
    complexModel: 'gpt-4',
    language: 'English',
    autoConfirmGoal: true,
    reportTemplate: 'executive_brief',
    runtimeAccessControl: {
        permissionMode: 'open',
        toolOverrides: {},
        workspaceRules: { deniedPathPrefixes: [] },
    },
});

const mockProviderModel = () => {
    createProviderModelMock.mockReturnValue({
        model: {},
        modelId: 'gpt-4',
    });
};

describe('buildDeterministicTopics', () => {
    it('returns metric-by-dimension topics sorted by cardinality', () => {
        const columns = makeColumns();
        const context = makeDatasetContext();
        const topics = buildDeterministicTopics(columns, context);

        // Should produce topics for top-cardinality dimensions
        expect(topics.length).toBeGreaterThan(0);
        // Topics should reference the first metric and available dimensions
        topics.forEach(t => {
            expect(t).toContain('Revenue');
        });
    });

    it('falls back to record-count topics when no metrics are available', () => {
        const noMetricCols: ColumnProfile[] = [
            { name: 'Department', type: 'categorical', uniqueValues: 8 },
        ];
        // Context must also have no metricColumns — otherwise buildDeterministicTopics
        // uses the context's metricColumns even if the column list has no metric columns.
        const noMetricContext = { ...makeDatasetContext(), metricColumns: [] } as unknown as AnalysisDatasetContext;
        const topics = buildDeterministicTopics(noMetricCols, noMetricContext);
        expect(topics).toEqual(['Record count by Department']);
    });

    it('respects blockedDimensions', () => {
        const context = { ...makeDatasetContext(), blockedDimensions: ['Department', 'Category'] };
        const topics = buildDeterministicTopics(makeColumns(), context as unknown as AnalysisDatasetContext);
        topics.forEach(t => {
            expect(t).not.toContain('Department');
            expect(t).not.toContain('Category');
        });
    });

    it('respects avoided metrics and dimensions from quality governance', () => {
        const context = {
            ...makeDatasetContext(),
            avoidGrainColumns: ['Department'],
            avoidMetricColumns: ['Revenue'],
            metricColumns: ['Revenue', 'Margin'],
        };
        const columns = [
            ...makeColumns(),
            { name: 'Margin', type: 'numerical', uniqueValues: 12, missingPercentage: 0, valueRange: [1, 10] },
        ] as ColumnProfile[];
        const topics = buildDeterministicTopics(columns, context as unknown as AnalysisDatasetContext);

        topics.forEach(topic => {
            expect(topic).not.toContain('Department');
            expect(topic).toContain('Margin');
        });
    });

    it('uses a safe record-count topic instead of structural metadata metrics', () => {
        const columns: ColumnProfile[] = [
            { name: 'CUSTOMER DELIVERY LOCATION', type: 'categorical', uniqueValues: 80 },
            { name: 'ResolvedRowRole', type: 'categorical', uniqueValues: 4 },
            { name: 'HierarchyDepth', type: 'numerical', uniqueValues: 3 },
        ];
        const context: AnalysisDatasetContext = {
            ...makeDatasetContext(),
            dimensionColumns: ['CUSTOMER DELIVERY LOCATION'],
            metricColumns: [],
            blockedDimensions: ['ResolvedRowRole'],
            avoidMetricColumns: [],
        };

        const topics = buildDeterministicTopics(columns, context);

        expect(topics).toEqual(['Record count by CUSTOMER DELIVERY LOCATION']);
    });

    it('never treats a numeric row-number helper as a business metric', () => {
        const columns: ColumnProfile[] = [
            { name: 'Quotation Date', type: 'date', uniqueValues: 7 },
            { name: 'Customer Name', type: 'categorical', uniqueValues: 5 },
            { name: 'Row Number', type: 'numerical', uniqueValues: 44, valueRange: [1, 44] },
        ];
        const context: AnalysisDatasetContext = {
            ...makeDatasetContext(),
            dimensionColumns: ['Quotation Date', 'Customer Name'],
            metricColumns: [],
            preferredMetricTerms: [],
            avoidMetricColumns: ['Row Number'],
        };

        const topics = buildDeterministicTopics(columns, context);

        expect(topics).toEqual([
            'Record count by Customer Name',
            'Record count trend by Quotation Date',
        ]);
        expect(topics.join(' ')).not.toContain('Row Number by');
    });

    it('uses preferred metric terms when formatted business metrics are not profiled as numeric yet', () => {
        const columns: ColumnProfile[] = [
            { name: 'CUSTOMER DELIVERY LOCATION', type: 'categorical', uniqueValues: 80 },
            { name: 'NET SALES SGD', type: 'categorical', uniqueValues: 200 },
            { name: 'HierarchyDepth', type: 'numerical', uniqueValues: 3 },
        ];
        const context: AnalysisDatasetContext = {
            ...makeDatasetContext(),
            dimensionColumns: ['CUSTOMER DELIVERY LOCATION'],
            metricColumns: [],
            preferredMetricTerms: ['NET SALES SGD'],
            avoidMetricColumns: ['HierarchyDepth'],
        };

        const topics = buildDeterministicTopics(columns, context);

        expect(topics).toEqual(['NET SALES SGD by CUSTOMER DELIVERY LOCATION']);
    });

    it('prioritizes a currency-typed metric over other physical measures', () => {
        const columns: ColumnProfile[] = [
            { name: 'month', type: 'date', uniqueValues: 439 },
            { name: 'town', type: 'categorical', uniqueValues: 27 },
            { name: 'floor_area_sqm', type: 'numerical', uniqueValues: 180 },
            { name: 'lease_commence_date', type: 'numerical', uniqueValues: 58 },
            { name: 'resale_price', type: 'currency', uniqueValues: 50_000 },
        ];
        const context: AnalysisDatasetContext = {
            ...makeDatasetContext(),
            dimensionColumns: ['month', 'town'],
            preferredGrainColumns: ['town'],
            preferredTimeColumns: ['month'],
            metricColumns: ['floor_area_sqm', 'lease_commence_date', 'resale_price'],
            preferredMetricTerms: ['floor_area_sqm', 'lease_commence_date', 'resale_price'],
        };

        const topics = buildDeterministicTopics(columns, context);

        expect(topics).toEqual([
            'resale_price by town',
            'resale_price trend by month',
        ]);
    });

    it('leads with the semantically preferred metric, not the one whose name sounds like money', () => {
        const columns: ColumnProfile[] = [
            { name: 'region', type: 'categorical', uniqueValues: 6 },
            { name: 'sales_index', type: 'numerical', uniqueValues: 50 },
            { name: 'dwell_minutes', type: 'numerical', uniqueValues: 50 },
        ];
        const context: AnalysisDatasetContext = {
            ...makeDatasetContext(),
            dimensionColumns: ['region'],
            metricColumns: ['sales_index', 'dwell_minutes'],
            preferredMetricTerms: ['dwell_minutes'],
        };

        expect(buildDeterministicTopics(columns, context)).toEqual(['dwell_minutes by region']);
    });
});

describe('generateAnalysisTopics — timeout guard (P0)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        restoreJsonParserMock();
        vi.useFakeTimers();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockProviderModel();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('returns deterministic fallback when both attempts time out', async () => {
        // First attempt: runWithOverflowCompaction throws ProviderTimeoutError
        // Second attempt (simplified): streamText throws ProviderTimeoutError
        // Result: deterministic topics from buildDeterministicTopics
        const { ProviderTimeoutError } = await import('../services/ai/providerActivityGuards');
        runWithOverflowCompactionMock.mockRejectedValue(new ProviderTimeoutError(50));
        streamTextMock.mockImplementation(() => { throw new ProviderTimeoutError(50); });

        const columns = makeColumns();
        const context = makeDatasetContext();

        const topics = await generateAnalysisTopics(
            columns, [], makeSettings(), 'Analyse sales', context,
            undefined, undefined, undefined, undefined,
            { timeoutMs: 50 },
        );

        // Must return deterministic topics (Revenue by Category/Department)
        expect(Array.isArray(topics)).toBe(true);
        expect(topics.length).toBeGreaterThan(0);
        topics.forEach(t => expect(t).toMatch(/Revenue by/));
    });

    it('returns simplified-retry topics when only first attempt times out', async () => {
        // First attempt: runWithOverflowCompaction throws ProviderTimeoutError
        // Second attempt (simplified): callSmallAiStep → streamGenerateText → streamText resolves with valid topics
        const { ProviderTimeoutError } = await import('../services/ai/providerActivityGuards');
        runWithOverflowCompactionMock.mockRejectedValue(new ProviderTimeoutError(50));
        streamTextMock.mockReturnValueOnce({
            fullStream: (async function* () {})(),
            text: Promise.resolve('{"topics":["Revenue by Region","Cost by Dept"]}'),
            finishReason: Promise.resolve('stop'),
            output: Promise.resolve(undefined),
        });

        const topics = await generateAnalysisTopics(
            makeColumns(), [], makeSettings(), null, makeDatasetContext(),
            undefined, undefined, undefined, undefined,
            { timeoutMs: 50 },
        );

        expect(topics).toContain('Revenue by Region');
        expect(topics).toContain('Cost by Dept');
    });

    it('returns topics normally when first attempt succeeds within timeout', async () => {
        runWithOverflowCompactionMock.mockResolvedValue({
            output: { topics: ['Revenue by Dept', 'Cost by Category'] },
            text: '',
        });

        const topics = await generateAnalysisTopics(
            makeColumns(), [], makeSettings(), null, makeDatasetContext(),
            undefined, undefined, undefined, undefined,
            { timeoutMs: 5000 },
        );

        expect(topics).toContain('Revenue by Dept');
        expect(topics).toContain('Cost by Category');
    });

    it('falls back to deterministic topics when the provider returns no executable topics', async () => {
        runWithOverflowCompactionMock.mockResolvedValue({
            output: { topics: [] },
            text: '',
        });

        const topics = await generateAnalysisTopics(
            makeColumns(), [], makeSettings(), 'Analyse sales', makeDatasetContext(),
            undefined, undefined, undefined, undefined,
            { timeoutMs: 5000 },
        );

        expect(topics).toEqual(buildDeterministicTopics(makeColumns(), makeDatasetContext()));
    });

    it('forwards AbortSignal to topic-generation provider calls', async () => {
        const controller = new AbortController();
        runWithOverflowCompactionMock.mockImplementation(async ({ execute }: { execute: (mode: string) => Promise<unknown> }) => await execute('normal'));
        streamTextMock.mockReturnValueOnce({
            fullStream: (async function* () {})(),
            text: Promise.resolve('{"topics":["Revenue by Department"]}'),
            finishReason: Promise.resolve('stop'),
            output: Promise.resolve(undefined),
        });

        const { callSmallAiStep } = await import('../services/agent/planning/planGenerator');
        await callSmallAiStep(
            makeSettings(),
            'Return JSON only.',
            'Generate one topic.',
            controller.signal,
        );

        expect(streamTextMock).toHaveBeenCalledWith(expect.objectContaining({
            abortSignal: controller.signal,
        }));
    });
});

describe('generateEvidenceQueryPlanWithRetry — timeout guard (P0)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        restoreJsonParserMock();
        vi.useFakeTimers();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockProviderModel();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('retries after a per-attempt timeout and returns plan on second attempt', async () => {
        const validPlanOutput = {
            title: 'Revenue by Department',
            queryMode: 'aggregate',
            intentSummary: 'SUM(Revenue) grouped by Department',
            preferredResultShape: 'ranked_aggregate',
            query: {
                select: ['Department', 'total_revenue'],
                groupBy: ['Department'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                orderBy: [{ column: 'total_revenue', direction: 'desc' }],
                limit: 10,
            },
        };

        // First attempt: throws ProviderTimeoutError → sets lastError → continues
        // Second attempt: resolves with valid plan
        const { ProviderTimeoutError } = await import('../services/ai/providerActivityGuards');
        runWithOverflowCompactionMock
            .mockRejectedValueOnce(new ProviderTimeoutError(50))
            .mockResolvedValueOnce({ output: validPlanOutput, text: '' });

        const plan = await generateEvidenceQueryPlanWithRetry(
            'Revenue by Department',
            makeColumns(),
            makeSettings(),
            undefined, undefined, undefined,
            makeDatasetContext(),
            [],
            undefined, undefined,
            undefined,
            { timeoutMs: 50 },
        );

        // Plan must be returned from the second attempt
        expect(plan.title).toBe('Revenue by Department');
        expect(plan.queryMode).toBe('aggregate');

        // runWithOverflowCompaction must have been called at least twice
        expect(runWithOverflowCompactionMock).toHaveBeenCalledTimes(2);
    });

    it('forwards AbortSignal to stepped evidence-planner provider calls', async () => {
        const controller = new AbortController();
        streamTextMock
            .mockReturnValueOnce({
                fullStream: (async function* () {})(),
                text: Promise.resolve('Department'),
                finishReason: Promise.resolve('stop'),
                output: Promise.resolve(undefined),
            })
            .mockReturnValueOnce({
                fullStream: (async function* () {})(),
                text: Promise.resolve('SUM(Revenue)'),
                finishReason: Promise.resolve('stop'),
                output: Promise.resolve(undefined),
            })
            .mockReturnValueOnce({
                fullStream: (async function* () {})(),
                text: Promise.resolve('NONE'),
                finishReason: Promise.resolve('stop'),
                output: Promise.resolve(undefined),
            });

        await generateEvidenceQueryPlanStepped(
            'Revenue by Department',
            makeColumns(),
            makeSettings(),
            'Prefer fact rows only.',
            makeDatasetContext(),
            null,
            null,
            { abortSignal: controller.signal },
        );

        expect(streamTextMock).toHaveBeenCalledWith(expect.objectContaining({
            abortSignal: controller.signal,
        }));
    });
});
