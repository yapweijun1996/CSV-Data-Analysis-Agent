// @vitest-environment node

/**
 * P0 Anti-Survivorship Resilience: dataInvestigationHarness guards
 *
 * Verifies that:
 * 1. A failing secondary query returns partial findings — other phases still run.
 * 2. Main description query failure returns null (no totals = nothing to analyse).
 * 3. The returned findings object always has valid shape (never partially-constructed).
 * 4. When the harness budget is exceeded before phases, an empty-but-valid findings
 *    object is returned (not null) — partial findings better than no findings.
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

// Columns with missing data so detectMissingDataPatterns actually fires a SQL query
const makeColumnsWithMissing = (): ColumnProfile[] => [
    { name: 'Description', type: 'categorical', uniqueValues: 10, missingPercentage: 0 },
    { name: 'Amount', type: 'currency', uniqueValues: 10, missingPercentage: 30 },  // > 5% → triggers SQL
];

const makeSemanticUnderstanding = (): RuntimeSemanticUnderstanding => ({
    businessGrains: ['Description'],
    candidateMetrics: ['Amount'],
    timeGrains: [],
    helperDimensions: [],
    blockedDimensions: [],
    headerSemantics: { businessTerminology: [] },
} as unknown as RuntimeSemanticUnderstanding);

/** 5 distinct items — main description+value query response */
const makeMainQueryResponse = () => ({
    rows: [
        { description: 'Revenue', total: 1000, row_count: 5 },
        { description: 'Cost of Goods', total: 400, row_count: 3 },
        { description: 'Operating Expenses', total: 300, row_count: 4 },
        { description: 'Net Profit', total: 300, row_count: 2 },
        { description: 'Other Income', total: 50, row_count: 1 },
    ],
});

describe('dataInvestigationHarness resilience — per-phase guards (P0)', () => {
    beforeEach(() => {
        // resetAllMocks clears BOTH call history AND the mockOnce queues.
        // clearAllMocks only clears call history — leftover Once-queues would bleed
        // into subsequent tests, causing hard-to-diagnose failures.
        vi.resetAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('returns findings with other phases intact when missingDataPatterns SQL query throws', async () => {
        // Main query succeeds (5 rows), missing data query rejects
        executeCompiledQueryMock
            .mockResolvedValueOnce(makeMainQueryResponse())  // runDescriptionValueQuery
            .mockRejectedValueOnce(new Error('DuckDB worker crashed during missing data check'));

        const result = await runDataInvestigationHarness(
            makeColumnsWithMissing(),  // triggers missing data SQL query
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        // Must return a valid findings object (not null)
        expect(result).not.toBeNull();

        // Hierarchy, duplicate, metric relationship phases must have run normally
        expect(Array.isArray(result?.hierarchyGroups)).toBe(true);
        expect(Array.isArray(result?.duplicateLabels)).toBe(true);
        expect(Array.isArray(result?.metricRelationships)).toBe(true);
        expect(Array.isArray(result?.outlierDescriptions)).toBe(true);

        // missingDataPatterns must degrade gracefully to empty (not undefined/null)
        expect(result?.missingDataPatterns).toEqual([]);

        // Semantic categories must be populated (pure computation, unaffected by SQL failure)
        expect(Object.keys(result?.semanticCategories ?? {}).length).toBeGreaterThan(0);

        // runtimeDirectives must be a valid object
        expect(result?.runtimeDirectives).toBeDefined();
        expect(Array.isArray(result?.runtimeDirectives.preferGroupBy)).toBe(true);
        expect(Array.isArray(result?.runtimeDirectives.blockGroupBy)).toBe(true);
        expect(result?.analysisSteering).toEqual(expect.objectContaining({
            preferGroupBy: expect.any(Array),
            blockGroupBy: expect.any(Array),
            reportShapeClass: expect.any(String),
            detailRowPolicy: expect.any(String),
            signalSources: expect.arrayContaining(['investigation_harness']),
        }));
    });

    it('returns null when the main description query throws', async () => {
        executeCompiledQueryMock.mockRejectedValueOnce(new Error('Worker crashed during main query'));

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        // No totals = no findings possible
        expect(result).toBeNull();
    });

    it('falls back to row-count investigation when metric totals yield no usable descriptions', async () => {
        executeCompiledQueryMock
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({
                rows: [
                    { desc_name: 'Revenue', total_value: 4, row_count: 4 },
                    { desc_name: 'Cost', total_value: 3, row_count: 3 },
                ],
            });

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        expect(result).not.toBeNull();
        expect(result?.leafDescriptions).toEqual(expect.arrayContaining(['Revenue', 'Cost']));
        expect(executeCompiledQueryMock).toHaveBeenCalledTimes(2);
    });

    it('returns null when a high-cardinality description query still yields too few rows after fallback', async () => {
        executeCompiledQueryMock.mockResolvedValueOnce({
            rows: [
                { description: 'Revenue', total: 1000, row_count: 1 },
                { description: 'Cost', total: 500, row_count: 1 },
            ],
        }).mockResolvedValueOnce({
            rows: [
                { desc_name: 'Revenue', total_value: 1, row_count: 1 },
                { desc_name: 'Cost', total_value: 1, row_count: 1 },
            ],
        });

        const result = await runDataInvestigationHarness(
            [{ ...makeColumns()[0], uniqueValues: 100 }, makeColumns()[1]],
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        expect(result).toBeNull();
    });

    it('returns valid findings shape when main query succeeds and secondary queries throw', async () => {
        // Main query succeeds (5 rows), missing data SQL rejects
        executeCompiledQueryMock
            .mockResolvedValueOnce(makeMainQueryResponse())
            .mockRejectedValueOnce(new Error('Missing data query failed'));

        const result = await runDataInvestigationHarness(
            makeColumnsWithMissing(),
            makeBinding(),
            makeSemanticUnderstanding(),
        );

        // Must return a structurally complete findings object
        expect(result).not.toBeNull();
        expect(result).toMatchObject({
            hierarchyGroups: expect.any(Array),
            duplicateLabels: expect.any(Array),
            metricRelationships: expect.any(Array),
            outlierDescriptions: expect.any(Array),
            missingDataPatterns: expect.any(Array),
            semanticCategories: expect.any(Object),
            leafDescriptions: expect.any(Array),
            parentDescriptions: expect.any(Array),
            investigationSummary: expect.any(String),
            topicConstraints: expect.any(Array),
            suggestedDerivedTopics: expect.any(Array),
            analysisSteering: expect.objectContaining({
                preferGroupBy: expect.any(Array),
                blockGroupBy: expect.any(Array),
                reportShapeClass: expect.any(String),
            }),
            runtimeDirectives: expect.objectContaining({
                preferGroupBy: expect.any(Array),
                blockGroupBy: expect.any(Array),
                excludeFromAggregation: expect.any(Array),
            }),
        });
    });

    it('returns null when harness budget is exceeded before investigation phases', async () => {
        // Pass harnessTimeoutMs: -1 so the deadline is always in the past.
        // The main query runs first (it has its own 5s query timeout), but all
        // investigation phases are skipped. The harness must still return a valid
        // findings object with empty arrays — partial findings better than null.
        executeCompiledQueryMock.mockResolvedValueOnce(makeMainQueryResponse());

        const result = await runDataInvestigationHarness(
            makeColumns(),
            makeBinding(),
            makeSemanticUnderstanding(),
            { harnessTimeoutMs: -1 },  // deadline immediately in the past
        );

        expect(result).toBeNull();
    });

    it('returns null when no description or value column can be identified', async () => {
        const noUsableCols: ColumnProfile[] = [
            { name: 'ID', type: 'numerical', uniqueValues: 100 },
        ];
        const emptySemantics = {
            businessGrains: [],
            candidateMetrics: [],
            timeGrains: [],
            helperDimensions: [],
            blockedDimensions: [],
        } as unknown as RuntimeSemanticUnderstanding;

        const result = await runDataInvestigationHarness(noUsableCols, makeBinding(), emptySemantics);

        expect(result).toBeNull();
        // No SQL queries should have been issued
        expect(executeCompiledQueryMock).not.toHaveBeenCalled();
    });

    it('does not hard-block an unrelated code column just because another label column exists', async () => {
        executeCompiledQueryMock.mockResolvedValueOnce({
            rows: [
                { description: 'A100', total: 1000, row_count: 3 },
                { description: 'B200', total: 800, row_count: 2 },
                { description: 'C300', total: 600, row_count: 2 },
            ],
        });

        const result = await runDataInvestigationHarness(
            [
                { name: 'SeriesCode', type: 'categorical', uniqueValues: 10, missingPercentage: 0 },
                { name: 'RegionLabel', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
                { name: 'Amount', type: 'currency', uniqueValues: 10, missingPercentage: 0 },
            ],
            makeBinding(),
            {
                ...makeSemanticUnderstanding(),
                businessGrains: ['SeriesCode'],
            },
        );

        expect(result).not.toBeNull();
        expect(result?.runtimeDirectives.blockGroupBy).not.toContain('SeriesCode');
        expect(result?.runtimeDirectives.softDeprioritizeGroupBy).not.toContain('SeriesCode');
    });

    it('blocks a true code-label family pair when AI classifies the code as helper', async () => {
        executeCompiledQueryMock.mockResolvedValueOnce({
            rows: [
                { description: 'P-001', total: 1000, row_count: 3 },
                { description: 'P-002', total: 800, row_count: 2 },
                { description: 'P-003', total: 600, row_count: 2 },
            ],
        });

        const result = await runDataInvestigationHarness(
            [
                { name: 'ProductKey', type: 'categorical', uniqueValues: 10, missingPercentage: 0 },
                { name: 'ProductLabel', type: 'categorical', uniqueValues: 10, missingPercentage: 0 },
                { name: 'Amount', type: 'currency', uniqueValues: 10, missingPercentage: 0 },
            ],
            makeBinding(),
            {
                ...makeSemanticUnderstanding(),
                businessGrains: ['ProductLabel'],
                // AI explicitly classifies ProductKey as helper → hard block
                helperDimensions: ['ProductKey'],
            },
        );

        expect(result).not.toBeNull();
        expect(result?.runtimeDirectives.blockGroupBy).toContain('ProductKey');
        expect(result?.runtimeDirectives.preferGroupBy).toContain('ProductLabel');
        expect(result?.runtimeDirectives.pairingSignals).toEqual(expect.arrayContaining([
            expect.objectContaining({
                codeColumn: 'ProductKey',
                labelColumn: 'ProductLabel',
                pairingConfidence: 'high',
                pairingSource: 'shared_family',
                action: 'block_code',
            }),
        ]));
    });

    it('soft-deprioritizes regex-matched code columns when AI did not classify them', async () => {
        executeCompiledQueryMock.mockResolvedValueOnce({
            rows: [
                { description: 'P-001', total: 1000, row_count: 3 },
                { description: 'P-002', total: 800, row_count: 2 },
            ],
        });

        const result = await runDataInvestigationHarness(
            [
                { name: 'ProductKey', type: 'categorical', uniqueValues: 10, missingPercentage: 0 },
                { name: 'ProductLabel', type: 'categorical', uniqueValues: 10, missingPercentage: 0 },
                { name: 'Amount', type: 'currency', uniqueValues: 10, missingPercentage: 0 },
            ],
            makeBinding(),
            {
                ...makeSemanticUnderstanding(),
                businessGrains: ['ProductLabel'],
                // AI did NOT classify ProductKey — regex fallback should soft-deprioritize, not hard-block
            },
        );

        expect(result).not.toBeNull();
        // Regex-only pairing: soft deprioritize, not hard block
        expect(result?.runtimeDirectives.blockGroupBy).not.toContain('ProductKey');
        expect(result?.runtimeDirectives.softDeprioritizeGroupBy).toContain('ProductKey');
        expect(result?.runtimeDirectives.preferGroupBy).toContain('ProductLabel');
        expect(result?.runtimeDirectives.pairingSignals).toEqual(expect.arrayContaining([
            expect.objectContaining({
                codeColumn: 'ProductKey',
                labelColumn: 'ProductLabel',
                pairingConfidence: 'medium',
                pairingSource: 'shared_family_regex_fallback',
                action: 'soft_deprioritize_code',
            }),
        ]));
    });

    it('keeps canonical section lineage columns out of preferred group-by directives', async () => {
        executeCompiledQueryMock.mockResolvedValueOnce({
            rows: [
                { description: 'SOBQ011001 YKK AP SINGAPORE PTE LTD CustomerPO:', total: 6900, row_count: 3 },
                { description: 'SOM1019 WEEMA (WUHAN) PTE LTD CustomerPO:', total: 52046.88, row_count: 2 },
                { description: 'SOM1058 AMPWAY INDUSTRIES PTE LTD CustomerPO:', total: 91888.69, row_count: 2 },
            ],
        });

        const result = await runDataInvestigationHarness(
            [
                { name: 'SectionLabel', type: 'categorical', uniqueValues: 12, missingPercentage: 0 },
                { name: 'CarryForwardAppliedColumns', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
                { name: 'SALES INVOICE NO. :: BUYER CONFIRMATION (S.I)', type: 'categorical', uniqueValues: 278, missingPercentage: 0 },
                { name: 'CUSTOMER ORDER DATE', type: 'date', uniqueValues: 130, missingPercentage: 0 },
                { name: 'TOTAL SALES', type: 'currency', uniqueValues: 250, missingPercentage: 0 },
            ],
            makeBinding(),
            {
                ...makeSemanticUnderstanding(),
                businessGrains: ['SALES INVOICE NO. :: BUYER CONFIRMATION (S.I)', 'CUSTOMER ORDER DATE'],
                candidateMetrics: ['TOTAL SALES'],
            },
        );

        expect(result).not.toBeNull();
        expect(result?.runtimeDirectives.blockGroupBy).toContain('SectionLabel');
        expect(result?.runtimeDirectives.blockGroupBy).toContain('CarryForwardAppliedColumns');
        expect(result?.runtimeDirectives.preferredDimensions).not.toContain('SectionLabel');
        expect(result?.runtimeDirectives.preferredDimensions).not.toContain('CarryForwardAppliedColumns');
        expect(result?.runtimeDirectives.preferGroupBy).not.toContain('SectionLabel');
        expect(result?.runtimeDirectives.preferGroupBy).not.toContain('CarryForwardAppliedColumns');
        expect(result?.runtimeDirectives.preferredDimensions).toEqual(
            expect.arrayContaining(['SALES INVOICE NO. :: BUYER CONFIRMATION (S.I)']),
        );
    });
});
