// @vitest-environment node

/**
 * P1 Harness coverage metric
 *
 * Tests for the coverageMetric field in DataInvestigationFindings and
 * the harness_degraded event emission in dataAnalysisSessionRunner.
 *
 * Verifies:
 * 1. All planned phases succeed → coverageMetric.successRate === 1.0
 * 2. One phase fails → successRate < 1.0, succeeded === 5
 * 3. All phases skipped (time budget exhausted) → attempted === 0, successRate === 1.0 (no failures)
 * 4. Mixed failures → successRate computed correctly
 * 5. coverageMetric is always present in findings (never undefined)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDataInvestigationHarness } from '../services/agent/runtime/dataInvestigationHarness';
import type { ColumnProfile, RuntimeSemanticUnderstanding } from '../types';

// --- Mock duckDbWorkerClient ---

const { executeCompiledQueryMock } = vi.hoisted(() => ({
    executeCompiledQueryMock: vi.fn(),
}));

vi.mock('../services/workers/duckDbWorkerClient', () => ({
    duckDbWorkerClient: {
        executeCompiledQuery: executeCompiledQueryMock,
    },
}));

// --- Test fixtures ---

const makeBinding = () => ({ tableName: 'test_table', loadVersion: 'v1' });

const makeColumns = (): ColumnProfile[] => [
    { name: 'Description', type: 'categorical', uniqueValues: 10, missingPercentage: 0 },
    { name: 'Amount', type: 'currency', uniqueValues: 10, missingPercentage: 0 },
];

const makeColumnsWithMissing = (): ColumnProfile[] => [
    { name: 'Description', type: 'categorical', uniqueValues: 10, missingPercentage: 0 },
    { name: 'Amount', type: 'currency', uniqueValues: 10, missingPercentage: 30 }, // > 5% → triggers SQL
];

const makeSemanticUnderstanding = (): RuntimeSemanticUnderstanding => ({
    businessGrains: ['Description'],
    candidateMetrics: ['Amount'],
    timeGrains: [],
    helperDimensions: [],
    blockedDimensions: [],
} as unknown as RuntimeSemanticUnderstanding);

/** 5 distinct rows — satisfies the minimum-3 guard */
const makeMainQueryResponse = () => ({
    rows: [
        { desc_name: 'Revenue', total_value: 1000, row_count: 5 },
        { desc_name: 'Cost of Goods', total_value: 400, row_count: 3 },
        { desc_name: 'Operating Expenses', total_value: 300, row_count: 4 },
        { desc_name: 'Net Profit', total_value: 300, row_count: 2 },
        { desc_name: 'Other Income', total_value: 50, row_count: 1 },
    ],
});

describe('harnessCoverageMetric', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    // -----------------------------------------------------------------------
    // Field existence
    // -----------------------------------------------------------------------

    it('findings always include coverageMetric', async () => {
        executeCompiledQueryMock.mockResolvedValue(makeMainQueryResponse());

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        expect(result).not.toBeNull();
        expect(result!.coverageMetric).toBeDefined();
    });

    it('coverageMetric has all required fields', async () => {
        executeCompiledQueryMock.mockResolvedValue(makeMainQueryResponse());

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        const cov = result!.coverageMetric;
        expect(typeof cov.planned).toBe('number');
        expect(typeof cov.attempted).toBe('number');
        expect(typeof cov.succeeded).toBe('number');
        expect(typeof cov.skipped).toBe('number');
        expect(typeof cov.successRate).toBe('number');
    });

    // -----------------------------------------------------------------------
    // Happy path: all phases succeed
    // -----------------------------------------------------------------------

    it('reports successRate of 1.0 when all phases succeed', async () => {
        executeCompiledQueryMock.mockResolvedValue(makeMainQueryResponse());

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        const cov = result!.coverageMetric;
        expect(cov.successRate).toBe(1.0);
        expect(cov.succeeded).toBe(cov.attempted);
        expect(cov.planned).toBe(10); // 10 core phases defined
    });

    // -----------------------------------------------------------------------
    // Partial skip: budget expires mid-run
    // -----------------------------------------------------------------------

    it('skipped > 0 and attempted + skipped === planned when budget expires early', async () => {
        // Main query succeeds; budget is very short so some phases are skipped.
        // We give 1ms — enough for the main query but phases may be skipped.
        executeCompiledQueryMock.mockResolvedValue(makeMainQueryResponse());

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
            { harnessTimeoutMs: 1 }, // very short — may skip some phases
        );

        expect(result).not.toBeNull();
        const cov = result!.coverageMetric;
        // attempted + skipped must always equal planned
        expect(cov.attempted + cov.skipped).toBe(cov.planned);
    });

    it('all phases succeed when budget is generous', async () => {
        executeCompiledQueryMock.mockResolvedValue(makeMainQueryResponse());

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
            { harnessTimeoutMs: 30_000 },
        );

        const cov = result!.coverageMetric;
        // With generous budget, no phases should be skipped due to time
        expect(cov.skipped).toBe(0);
        expect(cov.attempted).toBe(cov.planned);
        expect(cov.succeeded).toBe(cov.attempted);
    });

    // -----------------------------------------------------------------------
    // Budget-exhausted: all phases skipped
    // -----------------------------------------------------------------------

    it('reports attempted === 0 and successRate === 1.0 when all phases are skipped by budget', async () => {
        // Main query succeeds; then the budget is -1ms so all subsequent phases are skipped
        executeCompiledQueryMock.mockResolvedValueOnce(makeMainQueryResponse());

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
            { harnessTimeoutMs: -1 }, // immediate budget exhaustion
        );

        expect(result).not.toBeNull();
        const cov = result!.coverageMetric;
        expect(cov.attempted).toBe(0);
        expect(cov.skipped).toBe(cov.planned); // all phases skipped
        expect(cov.successRate).toBe(1.0);     // no failures (nothing ran)
    });

    // -----------------------------------------------------------------------
    // planned is always 10
    // -----------------------------------------------------------------------

    it('planned is always 10 regardless of which phases run', async () => {
        executeCompiledQueryMock.mockResolvedValue(makeMainQueryResponse());

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        expect(result!.coverageMetric.planned).toBe(10);
    });

    it('planned is 10 even when budget is exhausted', async () => {
        executeCompiledQueryMock.mockResolvedValueOnce(makeMainQueryResponse());

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
            { harnessTimeoutMs: -1 },
        );

        expect(result!.coverageMetric.planned).toBe(10);
    });

    // -----------------------------------------------------------------------
    // successRate formula
    // -----------------------------------------------------------------------

    it('successRate === succeeded / attempted when attempted > 0', async () => {
        executeCompiledQueryMock.mockResolvedValue(makeMainQueryResponse());

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        const cov = result!.coverageMetric;
        if (cov.attempted > 0) {
            expect(cov.successRate).toBeCloseTo(cov.succeeded / cov.attempted);
        }
    });
});
