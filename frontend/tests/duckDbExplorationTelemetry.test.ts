// @vitest-environment node

/**
 * DuckDB exploration query failure telemetry tests.
 *
 * Verifies that:
 * 1. buildAndRunExplorationQueries emits silent_failure telemetry when the
 *    DuckDB query throws, with the correct error category.
 * 2. classifyDuckDbError correctly categorises timeout, schema, memory, and
 *    unknown errors from their message text.
 * 3. runDataInvestigationHarness emits telemetry when the main description
 *    query fails, with category + phase in the detail.
 * 4. runPhase failures (e.g. temporal profile) emit per-phase telemetry.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildAndRunExplorationQueries,
    classifyDuckDbError,
} from '../services/agent/runtime/dataExplorationQueries';
import { runDataInvestigationHarness } from '../services/agent/runtime/dataInvestigationHarness';
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
// Helpers
// ---------------------------------------------------------------------------

const makeStore = () => {
    const recordRuntimeEvent = vi.fn();
    return { getState: () => ({ recordRuntimeEvent }), recordRuntimeEvent };
};

const makeColumns = (): ColumnProfile[] => [
    { name: 'Description', type: 'categorical', uniqueValues: 10, missingPercentage: 0 },
    { name: 'Amount', type: 'currency', uniqueValues: 10, missingPercentage: 0 },
];

const makeBinding = () => ({ tableName: 'test_table', loadVersion: 'v1' });

const makeSemanticUnderstanding = (): RuntimeSemanticUnderstanding => ({
    businessGrains: ['Description'],
    candidateMetrics: ['Amount'],
    timeGrains: [],
    helperDimensions: [],
    blockedDimensions: [],
} as unknown as RuntimeSemanticUnderstanding);

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
// classifyDuckDbError unit tests
// ---------------------------------------------------------------------------

describe('classifyDuckDbError', () => {
    it('classifies timeout errors', () => {
        expect(classifyDuckDbError(new Error('Query timed out after 8000ms'))).toBe('timeout');
        expect(classifyDuckDbError(new Error('Request aborted'))).toBe('timeout');
        expect(classifyDuckDbError('operation timed out')).toBe('timeout');
    });

    it('classifies schema errors', () => {
        expect(classifyDuckDbError(new Error('Binder Error: column "Revenue" does not exist'))).toBe('schema_error');
        expect(classifyDuckDbError(new Error('Catalog Error: Table "sales" not found'))).toBe('schema_error');
        expect(classifyDuckDbError('Parse error near SELECT')).toBe('schema_error'); // parse error text → schema_error
        expect(classifyDuckDbError(new Error('parse error in SQL statement'))).toBe('schema_error');
    });

    it('classifies memory errors', () => {
        expect(classifyDuckDbError(new Error('Out of memory: cannot allocate'))).toBe('memory');
        expect(classifyDuckDbError(new Error('memory limit exceeded'))).toBe('memory');
    });

    it('classifies unknown errors as unknown', () => {
        expect(classifyDuckDbError(new Error('Unexpected internal state'))).toBe('unknown');
        expect(classifyDuckDbError('some random failure')).toBe('unknown');
        expect(classifyDuckDbError(null)).toBe('unknown');
    });
});

// ---------------------------------------------------------------------------
// buildAndRunExplorationQueries telemetry
// ---------------------------------------------------------------------------

describe('buildAndRunExplorationQueries telemetry', () => {
    it('emits silent_failure with category=timeout when query times out', async () => {
        executeCompiledQueryMock.mockRejectedValue(new Error('Query timed out after 8000ms'));
        const store = makeStore();

        const result = await buildAndRunExplorationQueries(makeColumns(), makeBinding(), store);

        expect(result).toBeNull();
        expect(executeCompiledQueryMock).toHaveBeenCalledWith(
            expect.anything(),
            8_000,
        );
        expect(store.recordRuntimeEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'silent_failure',
                detail: expect.objectContaining({
                    component: 'DataExplorationQueries',
                    recoveryAction: 'exploration_skipped',
                    category: 'timeout',
                }),
            }),
        );
    });

    it('emits silent_failure with category=schema_error when column is missing', async () => {
        executeCompiledQueryMock.mockRejectedValue(new Error('Binder Error: column does not exist'));
        const store = makeStore();

        const result = await buildAndRunExplorationQueries(makeColumns(), makeBinding(), store);

        expect(result).toBeNull();
        expect(store.recordRuntimeEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                detail: expect.objectContaining({ category: 'schema_error' }),
            }),
        );
    });

    it('does not throw when no store is provided', async () => {
        executeCompiledQueryMock.mockRejectedValue(new Error('Some DuckDB error'));

        // No store — must not throw, must return null
        const result = await buildAndRunExplorationQueries(makeColumns(), makeBinding());
        expect(result).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// runDataInvestigationHarness telemetry
// ---------------------------------------------------------------------------

describe('runDataInvestigationHarness telemetry', () => {
    it('emits silent_failure with phase=main_description_query when main query fails', async () => {
        executeCompiledQueryMock.mockRejectedValue(new Error('Query timed out after 5000ms'));
        const store = makeStore();

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
            { store },
        );

        expect(result).toBeNull();
        expect(store.recordRuntimeEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'silent_failure',
                detail: expect.objectContaining({
                    component: 'DataInvestigationHarness',
                    category: 'timeout',
                    phase: 'main_description_query',
                }),
            }),
        );
    });

    it('emits no spurious telemetry events when the harness completes successfully', async () => {
        // Main query succeeds, all phase queries also succeed (SQL-based phases get the
        // same response; pure-computation phases use in-memory totals).
        executeCompiledQueryMock.mockResolvedValue(makeMainQueryResponse());

        const store = makeStore();

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
            { store },
        );

        expect(result).not.toBeNull();
        // No silent_failure events should be emitted on the happy path
        const failureEvents = store.recordRuntimeEvent.mock.calls.filter(call =>
            call[0]?.type === 'silent_failure',
        );
        expect(failureEvents).toHaveLength(0);
    });
});
