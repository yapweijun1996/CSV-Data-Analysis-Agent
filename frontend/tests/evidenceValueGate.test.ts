// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type {
    EvidenceHarnessContext,
    RuntimeSemanticUnderstanding,
    SqlEvidenceQueryPlan,
    SqlEvidenceQueryResultSummary,
} from '../types';
import { evaluateEvidenceValue } from '../services/agent/evidenceValueGate';

const baseSemanticUnderstanding: RuntimeSemanticUnderstanding = {
    businessGrains: ['Project'],
    candidateMetrics: ['Value'],
    timeGrains: [],
    helperDimensions: [],
    blockedDimensions: [],
    detailRowPolicy: 'exclude_non_detail_rows',
    businessGlossary: [],
    businessGrainConfidence: 'high',
    unsafeForBusinessNarrative: false,
};

const basePlan: SqlEvidenceQueryPlan = {
    title: 'Revenue by Description',
    queryMode: 'aggregate',
    intentSummary: 'Inspect revenue by description.',
    preferredResultShape: 'ranked_aggregate',
    query: {
        select: ['Description', 'total_value'],
        groupBy: ['Description'],
        aggregates: [{ function: 'sum', column: 'Value', as: 'total_value' }],
    },
};

const baseSummary: SqlEvidenceQueryResultSummary = {
    queryMode: 'aggregate',
    preferredResultShape: 'ranked_aggregate',
    rowCount: 5,
    columnCount: 2,
    columns: ['Description', 'total_value'],
    numericColumns: ['total_value'],
    categoricalColumns: ['Description'],
    timeColumns: [],
    distinctGroupCount: 5,
    totalValue: 100,
    isTimeSeriesCandidate: false,
    isWideCategorySet: false,
    hasSecondaryMetric: false,
    hasNegativeValues: false,
    previewRows: [
        { Description: 'Alpha', total_value: 30 },
        { Description: 'Beta', total_value: 25 },
        { Description: 'Gamma', total_value: 20 },
    ],
};

describe('evidenceValueGate', () => {
    it('rejects a non-temporal dimension whose grouped values are dates', () => {
        const result = evaluateEvidenceValue({
            semanticUnderstanding: {
                ...baseSemanticUnderstanding,
                businessGrains: ['Customer'],
            },
            evidencePlan: {
                ...basePlan,
                title: 'Sales by Customer',
                query: {
                    ...basePlan.query,
                    select: ['Customer', 'total_value'],
                    groupBy: ['Customer'],
                },
            },
            evidenceSummary: {
                ...baseSummary,
                columns: ['Customer', 'total_value'],
                categoricalColumns: [],
                timeColumns: ['Customer'],
                previewRows: [
                    { Customer: '31-12-2010', total_value: 30 },
                    { Customer: '02-01-2010', total_value: 25 },
                    { Customer: '01-12-2010', total_value: 20 },
                ],
            },
            aiEvaluation: {
                decision: 'pass',
                reasoning: 'The aggregation executed successfully.',
                chartWorthy: true,
            },
        });

        expect(result.decision).toBe('reject');
        expect(result.reasonCodes).toContain('dimension_value_type_mismatch');
        expect(result.semanticRisk).toBe('high');
    });

    it('does not flag date values when the groupBy column is explicitly temporal', () => {
        const result = evaluateEvidenceValue({
            semanticUnderstanding: {
                ...baseSemanticUnderstanding,
                businessGrains: ['Order Date'],
            },
            evidencePlan: {
                ...basePlan,
                title: 'Sales by Order Date',
                query: {
                    ...basePlan.query,
                    select: ['Order Date', 'total_value'],
                    groupBy: ['Order Date'],
                },
            },
            evidenceSummary: {
                ...baseSummary,
                columns: ['Order Date', 'total_value'],
                categoricalColumns: [],
                timeColumns: ['Order Date'],
                previewRows: [
                    { 'Order Date': '31-12-2010', total_value: 30 },
                    { 'Order Date': '02-01-2010', total_value: 25 },
                    { 'Order Date': '01-12-2010', total_value: 20 },
                ],
            },
        });

        expect(result.decision).toBe('pass');
        expect(result.reasonCodes).not.toContain('dimension_value_type_mismatch');
    });

    it('rejects sums over row-number helper fields before they can become evidence', () => {
        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: {
                ...basePlan,
                title: 'Quotation Distribution over Quotation Date',
                query: {
                    select: ['Quotation Date', 'sum_row_number'],
                    groupBy: ['Quotation Date'],
                    aggregates: [{ function: 'sum', column: 'Row Number', as: 'sum_row_number' }],
                },
            },
            evidenceSummary: {
                ...baseSummary,
                columns: ['Quotation Date', 'sum_row_number'],
                timeColumns: ['Quotation Date'],
                categoricalColumns: [],
                totalValue: 990,
            },
        });

        expect(result.decision).toBe('reject');
        expect(result.reasonCodes).toContain('helper_metric');
    });

    it('degrades blocked groupBy to table_only instead of hard reject', () => {
        const result = evaluateEvidenceValue({
            semanticUnderstanding: {
                ...baseSemanticUnderstanding,
                blockedDimensions: ['RowClass'],
            },
            evidencePlan: {
                ...basePlan,
                query: {
                    ...basePlan.query,
                    groupBy: ['RowClass'],
                    select: ['RowClass', 'total_value'],
                },
            },
            evidenceSummary: {
                ...baseSummary,
                columns: ['RowClass', 'total_value'],
                categoricalColumns: ['RowClass'],
                previewRows: [{ RowClass: 'Detail', total_value: 100 }],
            },
        });

        // Blocked dimensions produce lower-quality evidence → table_only, not reject.
        // Only duplicates remain as hard rejects.
        expect(result.decision).toBe('table_only');
        expect(result.reasonCodes).toContain('blocked_dimension');
    });

    it('rejects groupBy blocked only by harnessContext.blockGroupBy even when semanticUnderstanding.blockedDimensions is empty', () => {
        const result = evaluateEvidenceValue({
            semanticUnderstanding: {
                ...baseSemanticUnderstanding,
                blockedDimensions: [], // empty — harness is the sole signal
            },
            evidencePlan: {
                ...basePlan,
                query: {
                    ...basePlan.query,
                    groupBy: ['RowClass'],
                    select: ['RowClass', 'total_value'],
                },
            },
            evidenceSummary: {
                ...baseSummary,
                columns: ['RowClass', 'total_value'],
                categoricalColumns: ['RowClass'],
                previewRows: [{ RowClass: 'Detail', total_value: 100 }],
            },
            harnessContext: {
                preferGroupBy: ['Description'],
                blockGroupBy: ['RowClass'],
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: null,
                detailRowValue: null,
            },
        });

        // Blocked dimensions degrade to table_only, not hard reject.
        expect(result.decision).toBe('table_only');
        expect(result.reasonCodes).toContain('blocked_dimension');
    });

    it('downgrades to helper_dimension via harnessContext when grain is in blockGroupBy but not preferGroupBy', () => {
        const result = evaluateEvidenceValue({
            semanticUnderstanding: {
                ...baseSemanticUnderstanding,
                helperDimensions: [], // empty — harness is the sole signal
            },
            evidencePlan: {
                ...basePlan,
                query: {
                    ...basePlan.query,
                    groupBy: ['SeriesKey'],
                    select: ['SeriesKey', 'total_value'],
                },
            },
            evidenceSummary: {
                ...baseSummary,
                columns: ['SeriesKey', 'total_value'],
                categoricalColumns: ['SeriesKey'],
                previewRows: [
                    { SeriesKey: 'A', total_value: 30 },
                    { SeriesKey: 'B', total_value: 25 },
                    { SeriesKey: 'C', total_value: 20 },
                ],
            },
            harnessContext: {
                preferGroupBy: ['Description'],
                blockGroupBy: ['SeriesKey'],
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: null,
                detailRowValue: null,
            },
        });

        // SeriesKey is in blockGroupBy → blocked_dimension reason code is added.
        // Blocked dimensions degrade to table_only (not reject) so the evidence
        // is still available in tabular form.
        expect(result.decision).toBe('table_only');
        expect(result.reasonCodes).toContain('blocked_dimension');
    });

    it('detects hierarchy contamination and forces table_only on a successful query', () => {
        const harnessContext: EvidenceHarnessContext = {
            preferGroupBy: ['Description'],
            blockGroupBy: ['Code'],
            excludeFromAggregation: ['Total Revenue', 'Grand Total'],
            hierarchyColumn: 'Description',
            parentDescriptions: ['Total Revenue', 'Grand Total'],
            duplicateDescriptions: [],
            detailRowColumn: null,
            detailRowValue: null,
        };

        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: basePlan,
            evidenceSummary: {
                ...baseSummary,
                previewRows: [
                    { Description: 'Alpha', total_value: 30 },
                    { Description: 'Total Revenue', total_value: 100 },
                    { Description: 'Beta', total_value: 25 },
                ],
            },
            harnessContext,
        });

        expect(result.decision).toBe('table_only');
        expect(result.reasonCodes).toContain('hierarchy_contamination');
    });

    it('detects duplicate label contamination and forces table_only on a successful query', () => {
        const harnessContext: EvidenceHarnessContext = {
            preferGroupBy: ['Description'],
            blockGroupBy: [],
            excludeFromAggregation: ['Ops Costs'],
            hierarchyColumn: null,
            parentDescriptions: [],
            duplicateDescriptions: ['Ops Costs'],
            detailRowColumn: null,
            detailRowValue: null,
        };

        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: basePlan,
            evidenceSummary: {
                ...baseSummary,
                previewRows: [
                    { Description: 'Alpha', total_value: 30 },
                    { Description: 'Ops Costs', total_value: 25 },
                ],
            },
            harnessContext,
        });

        expect(result.decision).toBe('table_only');
        expect(result.reasonCodes).toContain('duplicate_label_contamination');
    });

    it('returns table_only with not_chart_worthy when AI gives pass but chartWorthy is false', () => {
        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: basePlan,
            evidenceSummary: baseSummary,
            aiEvaluation: {
                decision: 'pass',
                reasoning: 'The data is valid but not visually compelling.',
                chartWorthy: false,
            },
        });

        expect(result.decision).toBe('table_only');
        expect(result.reasonCodes).toContain('not_chart_worthy');
    });

    it('recovers chart-worthy business aggregates when AI only returns not_chart_worthy', () => {
        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: {
                ...basePlan,
                title: 'Sum Value by Project',
                intentSummary: 'Inspect project totals for detail rows.',
                query: {
                    select: ['Project', 'sum_value'],
                    groupBy: ['Project'],
                    aggregates: [{ function: 'sum', column: 'Value', as: 'sum_value' }],
                    where: {
                        predicates: [{ column: 'RowClass', operator: 'eq', value: 'fact' }],
                    },
                },
            },
            evidenceSummary: {
                ...baseSummary,
                columns: ['Project', 'sum_value'],
                categoricalColumns: ['Project'],
                numericColumns: ['sum_value'],
                previewRows: [
                    { Project: 'BDB LAB DESIGN', sum_value: 82428882.68 },
                    { Project: 'SOITEC', sum_value: 31499302 },
                    { Project: 'Unknown', sum_value: 24049187.58 },
                ],
                totalValue: 222616069.93,
            },
            aiEvaluation: {
                decision: 'table_only',
                reasoning: 'The evidence is valid but may not be chart worthy.',
                chartWorthy: false,
            },
            harnessContext: {
                preferGroupBy: ['Project'],
                blockGroupBy: ['Description', 'ProjectCode', 'SourceProjectCode', 'RowClass'],
                reportShapeClass: 'detail_table',
                detailRowPolicy: 'exclude_non_detail_rows',
                hierarchyMode: 'preserve',
                widePivotMode: 'none',
                signalConfidence: 'high',
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: 'RowClass',
                detailRowValue: 'fact',
            },
        });

        expect(result.decision).toBe('pass');
        expect(result.reasonCodes).not.toContain('not_chart_worthy');
    });

    it('preserves legacy behavior when no harness context is provided', () => {
        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: basePlan,
            evidenceSummary: baseSummary,
        });

        // No harness context → pure deterministic quality check.
        // With high confidence, no helper, not unsafe, 5 rows, 5 groups → pass
        expect(result.decision).toBe('pass');
        expect(result.reasonCodes).toEqual([]);
    });

    it('does not allow AI to raise decision above harness deterministic floor', () => {
        const harnessContext: EvidenceHarnessContext = {
            preferGroupBy: ['Description'],
            blockGroupBy: [],
            excludeFromAggregation: ['Grand Total'],
            hierarchyColumn: 'Description',
            parentDescriptions: ['Grand Total'],
            duplicateDescriptions: [],
            detailRowColumn: null,
            detailRowValue: null,
        };

        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: basePlan,
            evidenceSummary: {
                ...baseSummary,
                previewRows: [
                    { Description: 'Alpha', total_value: 30 },
                    { Description: 'Grand Total', total_value: 100 },
                ],
            },
            aiEvaluation: {
                decision: 'pass',
                reasoning: 'Looks good.',
                chartWorthy: true,
            },
            harnessContext,
        });

        // Harness flagged hierarchy contamination → at least table_only.
        // AI said pass, but harness floor cannot be raised.
        expect(result.decision).toBe('table_only');
        expect(result.reasonCodes).toContain('hierarchy_contamination');
    });

    it('applies harness contamination in deterministic fallback (no AI)', () => {
        const harnessContext: EvidenceHarnessContext = {
            preferGroupBy: ['Description'],
            blockGroupBy: [],
            excludeFromAggregation: ['Subtotal'],
            hierarchyColumn: 'Description',
            parentDescriptions: ['Subtotal'],
            duplicateDescriptions: [],
            detailRowColumn: null,
            detailRowValue: null,
        };

        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: basePlan,
            evidenceSummary: {
                ...baseSummary,
                previewRows: [
                    { Description: 'Alpha', total_value: 30 },
                    { Description: 'Subtotal', total_value: 55 },
                ],
            },
            harnessContext,
            // No aiEvaluation → deterministic fallback
        });

        expect(result.decision).toBe('table_only');
        expect(result.reasonCodes).toContain('hierarchy_contamination');
    });

    it('does not force table_only for hierarchy contamination when detail-row filter is applied', () => {
        const harnessContext: EvidenceHarnessContext = {
            preferGroupBy: ['Description'],
            blockGroupBy: ['Code'],
            excludeFromAggregation: ['Total Revenue', 'Grand Total'],
            hierarchyColumn: 'Description',
            parentDescriptions: ['Total Revenue', 'Grand Total'],
            duplicateDescriptions: [],
            detailRowColumn: 'RowClass',
            detailRowValue: 'fact',
        };

        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: {
                ...basePlan,
                query: {
                    ...basePlan.query,
                    where: {
                        predicates: [{ column: 'RowClass', operator: 'eq', value: 'fact' }],
                    },
                },
            },
            evidenceSummary: {
                ...baseSummary,
                previewRows: [
                    { Description: 'Alpha', total_value: 30 },
                    { Description: 'Total Revenue', total_value: 100 },
                    { Description: 'Beta', total_value: 25 },
                ],
            },
            harnessContext,
        });

        // RowClass filter already excludes parent/subtotal rows from the
        // result set — contamination checks are skipped entirely.
        expect(result.reasonCodes).not.toContain('hierarchy_contamination');
        expect(result.decision).toBe('pass');
    });

    it('does not force table_only for duplicate label contamination when detail-row filter is applied', () => {
        const harnessContext: EvidenceHarnessContext = {
            preferGroupBy: ['Description'],
            blockGroupBy: [],
            excludeFromAggregation: ['Ops Costs'],
            hierarchyColumn: null,
            parentDescriptions: [],
            duplicateDescriptions: ['Ops Costs'],
            detailRowColumn: 'RowClass',
            detailRowValue: 'fact',
        };

        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: {
                ...basePlan,
                query: {
                    ...basePlan.query,
                    where: {
                        predicates: [{ column: 'RowClass', operator: 'eq', value: 'fact' }],
                    },
                },
            },
            evidenceSummary: {
                ...baseSummary,
                previewRows: [
                    { Description: 'Alpha', total_value: 30 },
                    { Description: 'Ops Costs', total_value: 25 },
                ],
            },
            harnessContext,
        });

        expect(result.reasonCodes).not.toContain('duplicate_label_contamination');
        expect(result.decision).toBe('pass');
    });

    it('still forces table_only for hierarchy contamination when NO detail-row filter is present', () => {
        const harnessContext: EvidenceHarnessContext = {
            preferGroupBy: ['Description'],
            blockGroupBy: ['Code'],
            excludeFromAggregation: ['Total Revenue'],
            hierarchyColumn: 'Description',
            parentDescriptions: ['Total Revenue'],
            duplicateDescriptions: [],
            detailRowColumn: null,
            detailRowValue: null,
        };

        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: basePlan, // No WHERE clause — no RowClass filter
            evidenceSummary: {
                ...baseSummary,
                previewRows: [
                    { Description: 'Alpha', total_value: 30 },
                    { Description: 'Total Revenue', total_value: 100 },
                ],
            },
            harnessContext,
        });

        // Without detail-row filter, contamination forces table_only
        expect(result.decision).toBe('table_only');
        expect(result.reasonCodes).toContain('hierarchy_contamination');
    });

    it('does not flag contamination when previewRows do not contain parent labels', () => {
        const harnessContext: EvidenceHarnessContext = {
            preferGroupBy: ['Description'],
            blockGroupBy: [],
            excludeFromAggregation: ['Grand Total'],
            hierarchyColumn: 'Description',
            parentDescriptions: ['Grand Total'],
            duplicateDescriptions: [],
            detailRowColumn: null,
            detailRowValue: null,
        };

        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: basePlan,
            evidenceSummary: baseSummary, // previewRows have Alpha, Beta, Gamma — no contamination
            harnessContext,
        });

        expect(result.decision).toBe('pass');
        expect(result.reasonCodes).not.toContain('hierarchy_contamination');
    });

    it('downgrades hierarchical statements without detail-row filter or hierarchy-safe grouping', () => {
        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: basePlan,
            evidenceSummary: baseSummary,
            harnessContext: {
                preferGroupBy: ['Project'],
                blockGroupBy: [],
                reportShapeClass: 'hierarchical_statement',
                detailRowPolicy: 'exclude_non_detail_rows',
                hierarchyMode: 'preserve',
                widePivotMode: 'none',
                signalConfidence: 'high',
                excludeFromAggregation: ['Grand Total'],
                hierarchyColumn: 'Description',
                parentDescriptions: ['Grand Total'],
                duplicateDescriptions: [],
                detailRowColumn: 'RowClass',
                detailRowValue: 'fact',
            },
        });

        expect(result.decision).toBe('table_only');
        expect(result.reasonCodes).toContain('missing_detail_row_filter');
    });

    it('allows hierarchical statements to pass when a detail-row filter is applied', () => {
        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: {
                ...basePlan,
                query: {
                    ...basePlan.query,
                    where: {
                        predicates: [{ column: 'RowClass', operator: 'eq', value: 'fact' }],
                    },
                },
            },
            evidenceSummary: baseSummary,
            harnessContext: {
                preferGroupBy: ['Project'],
                blockGroupBy: [],
                reportShapeClass: 'hierarchical_statement',
                detailRowPolicy: 'exclude_non_detail_rows',
                hierarchyMode: 'preserve',
                widePivotMode: 'none',
                signalConfidence: 'high',
                excludeFromAggregation: ['Grand Total'],
                hierarchyColumn: 'Description',
                parentDescriptions: ['Grand Total'],
                duplicateDescriptions: [],
                detailRowColumn: 'RowClass',
                detailRowValue: 'fact',
            },
        });

        expect(result.decision).toBe('pass');
        expect(result.reasonCodes).not.toContain('missing_detail_row_filter');
    });

    it('caps reshape-required wide pivot evidence to table_only', () => {
        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: basePlan,
            evidenceSummary: baseSummary,
            harnessContext: {
                preferGroupBy: ['Description'],
                blockGroupBy: [],
                reportShapeClass: 'wide_pivot',
                detailRowPolicy: 'preserve_all_rows',
                hierarchyMode: 'none',
                widePivotMode: 'reshape_required',
                signalConfidence: 'high',
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: null,
                detailRowValue: null,
            },
        });

        expect(result.decision).toBe('table_only');
        expect(result.reasonCodes).toContain('reshape_required');
    });

    it('caps low-confidence steering evidence to table_only', () => {
        const result = evaluateEvidenceValue({
            semanticUnderstanding: baseSemanticUnderstanding,
            evidencePlan: basePlan,
            evidenceSummary: baseSummary,
            harnessContext: {
                preferGroupBy: ['Description'],
                blockGroupBy: [],
                reportShapeClass: 'detail_table',
                detailRowPolicy: 'preserve_all_rows',
                hierarchyMode: 'none',
                widePivotMode: 'none',
                signalConfidence: 'low',
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: null,
                detailRowValue: null,
            },
        });

        expect(result.decision).toBe('table_only');
        expect(result.reasonCodes).toContain('low_signal_confidence');
    });
});
