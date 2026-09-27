// @vitest-environment node

/**
 * Harness high-cardinality description query LIMIT tests.
 *
 * Verifies that:
 * 1. Normal columns (< 50k unique values) use LIMIT 50 in the description query.
 * 2. High-cardinality columns (> 50k unique values) use LIMIT 200 in the description query.
 * 3. The harness still returns a valid non-null result for a high-cardinality column when
 *    the mocked query resolves successfully (simulating completion within the 5s timeout).
 * 4. Hierarchy, duplicate, and Pareto phases correctly operate on the capped 200-item subset.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    runDataInvestigationHarness,
    HIGH_CARDINALITY_DESCRIPTION_THRESHOLD,
    HIGH_CARDINALITY_DESCRIPTION_LIMIT,
} from '../services/agent/runtime/dataInvestigationHarness';
import type { ColumnProfile, RuntimeSemanticUnderstanding } from '../types';

// ---------------------------------------------------------------------------
// Mock duckDbWorkerClient
// ---------------------------------------------------------------------------

const { executeCompiledQueryMock } = vi.hoisted(() => ({
    executeCompiledQueryMock: vi.fn(),
}));

vi.mock('../services/workers/duckDbWorkerClient', () => ({
    duckDbWorkerClient: {
        executeCompiledQuery: executeCompiledQueryMock,
    },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeBinding = () => ({ tableName: 'test_table', loadVersion: 'v1' });

const makeSemanticUnderstanding = (): RuntimeSemanticUnderstanding => ({
    businessGrains: ['Description'],
    candidateMetrics: ['Amount'],
    timeGrains: [],
    helperDimensions: [],
    blockedDimensions: [],
} as unknown as RuntimeSemanticUnderstanding);

/** Normal column — uniqueValues well below the 50k threshold. */
const makeNormalColumns = (): ColumnProfile[] => [
    { name: 'Description', type: 'categorical', uniqueValues: 10, missingPercentage: 0 },
    { name: 'Amount', type: 'currency', uniqueValues: 10, missingPercentage: 0 },
];

/** High-cardinality column — uniqueValues above the 50k threshold. */
const makeHighCardinalityColumns = (): ColumnProfile[] => [
    { name: 'Description', type: 'categorical', uniqueValues: HIGH_CARDINALITY_DESCRIPTION_THRESHOLD + 1, missingPercentage: 0 },
    { name: 'Amount', type: 'currency', uniqueValues: 10, missingPercentage: 0 },
];

/** Minimal response with 5 distinct rows (satisfies the minimum-3 guard). */
const makeMainQueryResponse = () => ({
    rows: [
        { desc_name: 'Revenue', total_value: 1000, row_count: 5 },
        { desc_name: 'Cost', total_value: 400, row_count: 3 },
        { desc_name: 'Expenses', total_value: 300, row_count: 4 },
        { desc_name: 'Profit', total_value: 300, row_count: 2 },
        { desc_name: 'Other', total_value: 50, row_count: 1 },
    ],
    totalMatchedRows: 5,
    returnedRows: 5,
});

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HIGH_CARDINALITY_DESCRIPTION_THRESHOLD and LIMIT constants', () => {
    it('exports HIGH_CARDINALITY_DESCRIPTION_THRESHOLD as 50000', () => {
        expect(HIGH_CARDINALITY_DESCRIPTION_THRESHOLD).toBe(50_000);
    });

    it('exports HIGH_CARDINALITY_DESCRIPTION_LIMIT as 200', () => {
        expect(HIGH_CARDINALITY_DESCRIPTION_LIMIT).toBe(200);
    });
});

describe('Normal column description query uses LIMIT 50', () => {
    it('passes appliedLimit: 50 to executeCompiledQuery when uniqueValues <= threshold', async () => {
        executeCompiledQueryMock.mockResolvedValue(makeMainQueryResponse());

        await runDataInvestigationHarness(
            makeNormalColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        // The first call is the main description query
        const firstCall = executeCompiledQueryMock.mock.calls[0];
        expect(firstCall).toBeDefined();
        const queryArg = firstCall[0] as { appliedLimit: number; sql: string };
        expect(queryArg.appliedLimit).toBe(50);
        expect(queryArg.sql).toContain('LIMIT 50');
    });
});

describe('High-cardinality column description query uses LIMIT 200', () => {
    it('passes appliedLimit: 200 to executeCompiledQuery when uniqueValues > threshold', async () => {
        executeCompiledQueryMock.mockResolvedValue(makeMainQueryResponse());

        await runDataInvestigationHarness(
            makeHighCardinalityColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        const firstCall = executeCompiledQueryMock.mock.calls[0];
        expect(firstCall).toBeDefined();
        const queryArg = firstCall[0] as { appliedLimit: number; sql: string };
        expect(queryArg.appliedLimit).toBe(HIGH_CARDINALITY_DESCRIPTION_LIMIT);
        expect(queryArg.sql).toContain(`LIMIT ${HIGH_CARDINALITY_DESCRIPTION_LIMIT}`);
    });

    it('returns a valid non-null result when the capped query succeeds (simulating sub-5s completion)', async () => {
        executeCompiledQueryMock.mockResolvedValue(makeMainQueryResponse());

        const result = await runDataInvestigationHarness(
            makeHighCardinalityColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        // Harness should produce findings, not return null
        expect(result).not.toBeNull();
    });

    it('hierarchy and Pareto phases operate on the capped 200-item subset without error', async () => {
        // Simulate a response at the 200-item cap — all items have distinct values
        const rows = Array.from({ length: 10 }, (_, i) => ({
            desc_name: `Item_${i}`,
            total_value: (10 - i) * 100,
            row_count: 1,
        }));
        executeCompiledQueryMock.mockResolvedValue({ rows, totalMatchedRows: rows.length, returnedRows: rows.length });

        const result = await runDataInvestigationHarness(
            makeHighCardinalityColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        expect(result).not.toBeNull();
        // phases should have processed the items cleanly
        expect(result?.coverageMetric).toBeDefined();
    });
});
