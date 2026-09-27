import { AnalysisPlan, ChartType } from '../../types';
import { validateColumnExists } from './columnValidator';

// Define a mutable type to modify the plan object internally
type MutablePlan = Partial<AnalysisPlan> & { _internal_groupByColumns?: string[] };

/**
 * Normalizes the shape of the plan, handling some graceful degradation logic.
 * @param plan The plan to normalize.
 * @returns The normalized plan.
 */
const chartsNeedingAggregation: ChartType[] = ['bar', 'line', 'pie', 'doughnut', 'radar', 'combo'];
const COUNT_INTENT_PATTERN = /\b(count|counts|number of|how many|frequency|frequencies|records?|rows?|entries|occurrences?)\b/i;

const hasCountIntent = (plan: MutablePlan) =>
    COUNT_INTENT_PATTERN.test(`${plan.title ?? ''} ${plan.description ?? ''}`);

const ensureAggregationDefaults = (plan: MutablePlan): void => {
    if (!plan.chartType || !chartsNeedingAggregation.includes(plan.chartType)) return;
    if (!plan.aggregation) {
        if (plan.valueColumn) {
            plan.aggregation = 'sum';
        } else if (hasCountIntent(plan)) {
            plan.aggregation = 'count';
        }
    }
    if (plan.aggregation === 'count') {
        delete plan.valueColumn;
    }
};

export const normalizePlanShape = (plan: MutablePlan): MutablePlan => {
    ensureAggregationDefaults(plan);
    return plan;
};

/**
 * Handles multi-column grouping by converting it to a single composite key.
 * @param plan The plan to normalize.
 * @param availableColumns The available column names in the dataset.
 * @returns A tuple containing the normalized plan and any errors.
 */
export const normalizeMultiGroupColumn = (plan: MutablePlan, availableColumns: string[]): { normalizedPlan: MutablePlan, errors: string[] } => {
    const errors: string[] = [];
    if (Array.isArray(plan.groupByColumn)) {
        const multiGroupColumns = plan.groupByColumn;
        const validatedMultiGroupColumns: string[] = [];
        
        multiGroupColumns.forEach(col => {
            const { normalized, error } = validateColumnExists(col, availableColumns);
            if (error) {
                errors.push(error);
            } else if (normalized) {
                validatedMultiGroupColumns.push(normalized);
            }
        });
        
        if (errors.length === 0) {
            // Store the original columns for the executor and create a composite key for grouping
            plan._internal_groupByColumns = validatedMultiGroupColumns;
            plan.groupByColumn = validatedMultiGroupColumns.join(' - ');
        }
    }
    return { normalizedPlan: plan, errors };
};
