// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { reshapeWidePivotBeforeAnalysis } from '../services/agent/runtime/reshapeBeforeAnalysis';
import type { EvidenceHarnessContext, ColumnProfile } from '../types';

// Stub handleAiAction and recordRuntimeEvent so the module doesn't call
// real AI / store infrastructure.
vi.mock('../services/agent/actionHandler', () => ({
    handleAiAction: vi.fn().mockResolvedValue({ status: 'success', message: 'ok' }),
}));
vi.mock('../services/agent/runtime/runtimeHelpers', () => ({
    recordRuntimeEvent: vi.fn(),
}));

const buildMinimalStore = () => ({
    getState: () => ({
        csvData: { data: [], headers: [] },
        columnProfiles: [],
        addProgress: vi.fn(),
        logAgentToolUsage: vi.fn(),
        recordRuntimeEvent: vi.fn(),
    }),
    setState: vi.fn(),
} as any);

const buildColumnProfiles = (names: string[]): ColumnProfile[] =>
    names.map(name => ({
        name,
        type: name.match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i) ? 'numerical' : 'categorical',
        uniqueValues: 10,
        missingPercentage: 0,
    } as ColumnProfile));

const buildHarnessContext = (overrides?: Partial<EvidenceHarnessContext>): EvidenceHarnessContext => ({
    preferGroupBy: ['STAFF CODE'],
    blockGroupBy: [],
    softDeprioritizeGroupBy: [],
    preferredDimensions: ['STAFF CODE'],
    blockedDimensions: [],
    preferredMetrics: [],
    blockedMetrics: [],
    columnRoles: {},
    excludeFromAggregation: [],
    hierarchyColumn: null,
    parentDescriptions: [],
    duplicateDescriptions: [],
    detailRowColumn: null,
    detailRowValue: null,
    detailRowFilter: null,
    promotedChartType: null,
    blockedChartTypes: [],
    suggestedHideOthers: false,
    recommendedTopN: null,
    pivotOnlyCombinations: [],
    widePivotShape: true,
    widePivotMode: 'reshape_required',
    periodColumnFamilies: [{
        pattern: 'monthly',
        year: '2010',
        columns: [
            'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
            'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
        ],
        quarterMap: {
            Q1: ['JAN 2010', 'FEB 2010', 'MAR 2010'],
            Q2: ['APR 2010', 'MAY 2010', 'JUN 2010'],
            Q3: ['JUL 2010', 'AUG 2010', 'SEP 2010'],
            Q4: ['OCT 2010', 'NOV 2010', 'DEC 2010'],
        },
        ytdColumns: [
            'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
            'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
        ],
    }],
    formattedNumberColumns: [],
    pairingSignals: [],
    duplicateSignatureHints: [],
    reportShapeClass: 'wide_pivot',
    detailRowPolicy: 'preserve_all_rows',
    hierarchyMode: 'none',
    signalSources: ['investigation_harness'],
    signalConfidence: 'medium',
    ...overrides,
});

describe('reshapeBeforeAnalysis', () => {
    const allColumns = [
        'STAFF CODE', 'STAFF NAME',
        'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
        'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
    ];
    const profiles = buildColumnProfiles(allColumns);

    it('skips reshape when harnessContext is null', async () => {
        const result = await reshapeWidePivotBeforeAnalysis(null, profiles, buildMinimalStore());
        expect(result.applied).toBe(false);
        expect(result.reason).toContain('No harness context');
    });

    it('skips reshape when widePivotShape is false', async () => {
        const ctx = buildHarnessContext({ widePivotShape: false });
        const result = await reshapeWidePivotBeforeAnalysis(ctx, profiles, buildMinimalStore());
        expect(result.applied).toBe(false);
        expect(result.reason).toContain('not a wide pivot');
    });

    it('skips reshape when widePivotMode is not reshape_required', async () => {
        const ctx = buildHarnessContext({ widePivotMode: 'none' });
        const result = await reshapeWidePivotBeforeAnalysis(ctx, profiles, buildMinimalStore());
        expect(result.applied).toBe(false);
        expect(result.reason).toContain('"none"');
    });

    it('skips reshape when no period column families exist', async () => {
        const ctx = buildHarnessContext({ periodColumnFamilies: [] });
        const result = await reshapeWidePivotBeforeAnalysis(ctx, profiles, buildMinimalStore());
        expect(result.applied).toBe(false);
        expect(result.reason).toContain('No period column families');
    });

    it('applies reshape and returns correct sourceColumns and keepColumns', async () => {
        const ctx = buildHarnessContext();
        const result = await reshapeWidePivotBeforeAnalysis(ctx, profiles, buildMinimalStore());

        expect(result.applied).toBe(true);
        expect(result.sourceColumns).toHaveLength(12);
        expect(result.sourceColumns).toContain('JAN 2010');
        expect(result.sourceColumns).toContain('DEC 2010');
        expect(result.keepColumns).toEqual(['STAFF CODE', 'STAFF NAME']);
        expect(result.periodFamily).toBeTruthy();
        expect(result.periodFamily!.year).toBe('2010');
    });

    it('calls handleAiAction with unpivot_columns operation', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        (handleAiAction as any).mockClear();

        const ctx = buildHarnessContext();
        await reshapeWidePivotBeforeAnalysis(ctx, profiles, buildMinimalStore());

        expect(handleAiAction).toHaveBeenCalledOnce();
        const call = (handleAiAction as any).mock.calls[0];
        const action = call[0];
        expect(action.toolName).toBe('data.mutate');
        const ops = action.args.operations;
        expect(ops).toHaveLength(1);
        expect(ops[0].type).toBe('unpivot_columns');
        expect(ops[0].sourceColumns).toHaveLength(12);
        expect(ops[0].keyColumn).toBe('Period');
        expect(ops[0].valueColumn).toBe('Value');
        expect(ops[0].keepColumns).toEqual(['STAFF CODE', 'STAFF NAME']);
    });

    it('returns applied=false when handleAiAction returns failure', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        (handleAiAction as any).mockResolvedValueOnce({ status: 'error', message: 'DuckDB not available' });

        const ctx = buildHarnessContext();
        const result = await reshapeWidePivotBeforeAnalysis(ctx, profiles, buildMinimalStore());

        expect(result.applied).toBe(false);
        expect(result.reason).toContain('DuckDB not available');
    });

    it('handles multiple period families by using the largest one', async () => {
        const ctx = buildHarnessContext({
            periodColumnFamilies: [
                {
                    pattern: 'monthly',
                    year: '2009',
                    columns: ['OCT 2009', 'NOV 2009', 'DEC 2009'],
                    quarterMap: { Q1: [], Q2: [], Q3: [], Q4: ['OCT 2009', 'NOV 2009', 'DEC 2009'] },
                    ytdColumns: ['OCT 2009', 'NOV 2009', 'DEC 2009'],
                },
                {
                    pattern: 'monthly',
                    year: '2010',
                    columns: [
                        'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
                        'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
                    ],
                    quarterMap: {
                        Q1: ['JAN 2010', 'FEB 2010', 'MAR 2010'],
                        Q2: ['APR 2010', 'MAY 2010', 'JUN 2010'],
                        Q3: ['JUL 2010', 'AUG 2010', 'SEP 2010'],
                        Q4: ['OCT 2010', 'NOV 2010', 'DEC 2010'],
                    },
                    ytdColumns: [
                        'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
                        'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
                    ],
                },
            ],
        });

        const allCols = [
            'STAFF CODE', 'STAFF NAME',
            'OCT 2009', 'NOV 2009', 'DEC 2009',
            'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
            'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
        ];
        const allProfiles = buildColumnProfiles(allCols);

        const result = await reshapeWidePivotBeforeAnalysis(ctx, allProfiles, buildMinimalStore());

        expect(result.applied).toBe(true);
        // Should use the 2010 family (12 cols) as the primary, but unpivot ALL period columns (15 total)
        expect(result.sourceColumns).toHaveLength(15);
        expect(result.periodFamily!.year).toBe('2010');
        expect(result.keepColumns).toEqual(['STAFF CODE', 'STAFF NAME']);
    });

    it('prefers suggestedUnpivotPlan when provided', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        (handleAiAction as any).mockClear();

        const ctx = buildHarnessContext();
        // The harness plan excludes TOTAL columns and uses different column names
        const suggestedPlan = {
            id: 'auto_period_unpivot (2010)',
            type: 'unpivot_columns' as const,
            reason: 'Harness-generated plan',
            sourceColumns: [
                'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
                'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
            ],
            keyColumn: 'Period',
            valueColumn: 'Value',
            keepColumns: ['STAFF CODE', 'STAFF NAME'],
            sourceColumnNameColumn: 'SourceColumnName',
        };
        const result = await reshapeWidePivotBeforeAnalysis(ctx, profiles, buildMinimalStore(), suggestedPlan);

        expect(result.applied).toBe(true);
        // Verify the action used the harness plan's columns
        const call = (handleAiAction as any).mock.calls[0];
        const ops = call[0].args.operations;
        expect(ops[0].sourceColumns).toEqual(suggestedPlan.sourceColumns);
        expect(ops[0].keyColumn).toBe('Period');
        expect(ops[0].valueColumn).toBe('Value');
        expect(ops[0].keepColumns).toEqual(['STAFF CODE', 'STAFF NAME']);
    });

    it('falls back to family-based plan when suggestedUnpivotPlan is null', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        (handleAiAction as any).mockClear();

        const ctx = buildHarnessContext();
        const result = await reshapeWidePivotBeforeAnalysis(ctx, profiles, buildMinimalStore(), null);

        expect(result.applied).toBe(true);
        expect(result.sourceColumns).toHaveLength(12);
        // Should derive from family columns, not from a plan
        const call = (handleAiAction as any).mock.calls[0];
        const ops = call[0].args.operations;
        expect(ops[0].sourceColumns).toHaveLength(12);
    });

    it('suggestedUnpivotPlan with excluded TOTAL columns produces fewer sourceColumns', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        (handleAiAction as any).mockClear();

        // Family includes 12 months, but harness plan excludes TOTAL
        const ctx = buildHarnessContext();
        const suggestedPlan = {
            id: 'auto_period_unpivot (2010)',
            type: 'unpivot_columns' as const,
            reason: 'Harness plan excludes TOTAL',
            sourceColumns: [
                'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
                'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
            ],
            keyColumn: 'Period',
            valueColumn: 'Value',
            // keepColumns does NOT include TOTAL (it was excluded)
            keepColumns: ['STAFF CODE', 'STAFF NAME'],
            sourceColumnNameColumn: 'SourceColumnName',
        };

        const profilesWithTotal = buildColumnProfiles([...allColumns, 'TOTAL']);
        const result = await reshapeWidePivotBeforeAnalysis(ctx, profilesWithTotal, buildMinimalStore(), suggestedPlan);

        expect(result.applied).toBe(true);
        // keepColumns from the plan should NOT include TOTAL
        const call = (handleAiAction as any).mock.calls[0];
        const ops = call[0].args.operations;
        expect(ops[0].keepColumns).toEqual(['STAFF CODE', 'STAFF NAME']);
        expect(ops[0].keepColumns).not.toContain('TOTAL');
    });
});
