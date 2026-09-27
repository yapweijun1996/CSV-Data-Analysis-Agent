import { describe, expect, it } from 'vitest';
import {
    getDataMutateRepairGuidance,
    validateDataMutatePayload,
} from '../services/agent/execution/dataMutateContract';

describe('validateDataMutatePayload', () => {
    it('accepts nested replace_values payloads that use params and a singular replacement object', () => {
        const errors = validateDataMutatePayload({
            explanation: 'Standardize cost labels before reconciliation.',
            operations: [
                {
                    id: 'std_cost',
                    type: 'replace_values',
                    reason: 'Normalize cost labels.',
                    params: {
                        column: 'Description',
                        replacement: {
                            search: 'Cost of Sales',
                            replaceWith: 'Cost of sales',
                        },
                    },
                },
            ],
            outputColumns: [],
        });

        expect(errors).toEqual([]);
    });

    it('builds repair guidance for missing replace_values fields and derive-metric formula issues', () => {
        const guidance = getDataMutateRepairGuidance([
            'operation "std_revenue" (index 1): replace_values requires id, reason, column, and replacements[].',
            'operation "derive_margin" (index 2): derive_metric_by_label requires id, reason, groupByColumns, labelColumn, valueColumn, outputMetricLabel, and formula.',
            'operation "derive_margin" (index 2): derive_metric_by_label ratio requires numerator and denominator components with matchAny labels.',
        ]);

        expect(guidance.repairHintCategory).toBe('missing_replace_values_fields');
        expect(guidance.repairHintCategories).toEqual([
            'missing_replace_values_fields',
            'missing_derive_metric_formula',
            'missing_ratio_components',
        ]);
        expect(guidance.repairHint).toContain('top-level id, reason, column, and replacements');
        expect(guidance.repairHint).toContain('validated template');
        expect(guidance.repairHint).toContain('formula.numerator[]');
    });

    it('builds repair guidance for invalid grouping or missing columns', () => {
        const guidance = getDataMutateRepairGuidance(
            'derive_metric_by_label groupByColumns must not include labelColumn. derive_metric_by_label references missing column: SeriesKey',
        );

        expect(guidance.repairHintCategory).toBe('invalid_group_by_or_columns');
        expect(guidance.repairHintCategories).toEqual(['invalid_group_by_or_columns']);
        expect(guidance.repairHint).toContain('real dataset columns');
        expect(guidance.repairHint).toContain('SeriesKey');
    });
});
