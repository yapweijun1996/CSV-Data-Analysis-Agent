import { describe, expect, it } from 'vitest';
import {
    METRIC_PATTERNS,
    METRIC_NAMES,
    matchesMetricPattern,
    EXPLICIT_DERIVED_PRIORITY_PATTERNS,
} from '../services/agent/analysisBrief';
import { classifySemanticCategories } from '../services/agent/runtime/outlierDetector';
import {
    isConditionalAggregateRepairIssue,
} from '../services/agent/execution/dataQueryRepairHints';
import {
    extractRequestedMetricValidationTargets,
} from '../services/agent/runtime/runtimeEvidencePolicy';

describe('shared metric vocabulary (Phase 6a)', () => {
    it('METRIC_PATTERNS covers all 7 semantic metric names', () => {
        expect(METRIC_NAMES).toEqual([
            'revenue', 'cost', 'profit', 'margin', 'budget', 'actual', 'variance',
        ]);
    });

    it('matchesMetricPattern recognizes standard financial terms', () => {
        expect(matchesMetricPattern('Total Revenue', 'revenue')).toBe(true);
        expect(matchesMetricPattern('Sales Amount', 'revenue')).toBe(true);
        expect(matchesMetricPattern('Operating Expense', 'cost')).toBe(true);
        expect(matchesMetricPattern('COGS', 'cost')).toBe(true);
        expect(matchesMetricPattern('Net Profit', 'profit')).toBe(true);
        expect(matchesMetricPattern('Gross Margin', 'margin')).toBe(true);
        expect(matchesMetricPattern('Budget FY25', 'budget')).toBe(true);
        expect(matchesMetricPattern('Actual Q1', 'actual')).toBe(true);
        expect(matchesMetricPattern('Variance YTD', 'variance')).toBe(true);
    });

    it('matchesMetricPattern returns false for unrelated text', () => {
        expect(matchesMetricPattern('Project Name', 'revenue')).toBe(false);
        expect(matchesMetricPattern('Date', 'cost')).toBe(false);
    });

    it('METRIC_PATTERNS.variance includes budget/actual combo patterns', () => {
        expect(METRIC_PATTERNS.variance.some(p => p.test('budget vs actual comparison'))).toBe(true);
        expect(METRIC_PATTERNS.variance.some(p => p.test('actual versus budget'))).toBe(true);
    });

    it('EXPLICIT_DERIVED_PRIORITY_PATTERNS covers profit and margin', () => {
        expect(EXPLICIT_DERIVED_PRIORITY_PATTERNS.profit.some(p => p.test('gross profit'))).toBe(true);
        expect(EXPLICIT_DERIVED_PRIORITY_PATTERNS.margin.some(p => p.test('gross margin'))).toBe(true);
    });
});

describe('classifySemanticCategories (Phase 6a — outlierDetector)', () => {
    it('classifies descriptions using regex fallback when no preClassified map', () => {
        const result = classifySemanticCategories([
            'Revenue', 'Cost of Goods Sold', 'Net Profit', 'Other Income',
        ]);
        expect(result['Revenue']).toBe('revenue');
        expect(result['Cost of Goods Sold']).toBe('cost');
        expect(result['Net Profit']).toBe('profit');
        expect(result['Other Income']).toBe('revenue');
    });

    it('uses preClassified map when provided (AI-first path)', () => {
        const preClassified = {
            'Revenue': 'revenue',
            'Direct Costs': 'cost',
            'EBITDA': 'profit',
        };
        const result = classifySemanticCategories(
            ['Revenue', 'Direct Costs', 'EBITDA', 'Miscellaneous'],
            preClassified,
        );
        expect(result['Revenue']).toBe('revenue');
        expect(result['Direct Costs']).toBe('cost');
        expect(result['EBITDA']).toBe('profit');
        // Miscellaneous not in preClassified → falls back to regex → 'operating'
        expect(result['Miscellaneous']).toBe('operating');
    });

    it('falls back to regex for descriptions not in preClassified', () => {
        const preClassified = { 'Revenue': 'revenue' };
        const result = classifySemanticCategories(
            ['Revenue', 'Salary Expense'],
            preClassified,
        );
        expect(result['Revenue']).toBe('revenue');
        expect(result['Salary Expense']).toBe('cost');
    });

    it('passes null preClassified gracefully (regex-only)', () => {
        const result = classifySemanticCategories(['Gross Margin'], null);
        expect(result['Gross Margin']).toBe('profit');
    });
});

describe('isConditionalAggregateRepairIssue (Phase 6a — generalized)', () => {
    it('still detects revenue/cost error text (regression)', () => {
        const errorText = `The query does not actually include a 'CASE WHEN' clause.
            'total_revenue' and 'total_cost' are calculating the same sum.`;
        expect(isConditionalAggregateRepairIssue(errorText)).toBe(true);
    });

    it('detects budget/actual error text (generalized)', () => {
        const errorText = `The query does not actually include a 'CASE WHEN' clause.
            'total_budget' and 'total_actual' are calculating the same sum.`;
        expect(isConditionalAggregateRepairIssue(errorText)).toBe(true);
    });

    it('detects generic conditional aggregation phrases', () => {
        expect(isConditionalAggregateRepairIssue('needs conditional aggregation')).toBe(true);
        expect(isConditionalAggregateRepairIssue('use CASE WHEN to separate')).toBe(true);
    });

    it('detects generalized "failing to distinguish between" with any metric pair', () => {
        expect(isConditionalAggregateRepairIssue(
            'failing to distinguish between budget and actual amounts',
        )).toBe(true);
    });

    it('detects generalized "aggregated all X values into a single" pattern', () => {
        expect(isConditionalAggregateRepairIssue(
            "aggregated all budget and actual values into a single 'TotalValue'",
        )).toBe(true);
    });

    it('returns false for unrelated error text', () => {
        expect(isConditionalAggregateRepairIssue('column not found: foo')).toBe(false);
        expect(isConditionalAggregateRepairIssue(null)).toBe(false);
        expect(isConditionalAggregateRepairIssue('')).toBe(false);
    });
});

describe('extractRequestedMetricValidationTargets (Phase 6a — consolidated)', () => {
    it('extracts revenue and cost from user message', () => {
        const result = extractRequestedMetricValidationTargets('validate revenue and cost mapping');
        expect(result.baseMetrics).toContain('revenue');
        expect(result.baseMetrics).toContain('cost');
        expect(result.explicitValidation).toBe(true);
    });

    it('detects variance when budget and actual are both mentioned', () => {
        const result = extractRequestedMetricValidationTargets('show budget vs actual');
        expect(result.baseMetrics).toContain('budget');
        expect(result.baseMetrics).toContain('actual');
        expect(result.derivedMetrics).toContain('variance');
    });

    it('extracts profit as derived metric', () => {
        const result = extractRequestedMetricValidationTargets('create a profit card');
        expect(result.derivedMetrics).toContain('profit');
        expect(result.needsValidation).toBe(true);
    });

    it('returns empty for unrelated message', () => {
        const result = extractRequestedMetricValidationTargets('show me the data');
        expect(result.baseMetrics).toEqual([]);
        expect(result.derivedMetrics).toEqual([]);
        expect(result.needsValidation).toBe(false);
    });
});
