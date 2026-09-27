import { AnalysisPlan, AggregationType } from '../../types';
import { validateColumnExists } from './columnValidator';
import {
    isSupportedPreFilterOperator,
    normalizePreFilterOperator,
} from './preFilterSupport';

type MutablePlan = Partial<AnalysisPlan> & { _internal_groupByColumns?: string[] };
const PREFILTER_LOG_PREFIX = '[PlanValidator]';

/**
 * Validates that a string property on the plan object is indeed a string.
 * @param plan - The plan object to validate.
 * @param prop - The property key to check.
 * @param errors - The array to accumulate error messages.
 */
export const validateStringProperty = (plan: Partial<AnalysisPlan>, prop: keyof AnalysisPlan, errors: string[]) => {
    const value = plan[prop];
    if (value !== undefined && typeof value !== 'string') {
        errors.push(`'${prop}' must be a string, but got type ${typeof value}.`);
    }
};


/**
 * Validates that the plan contains all required fields based on its chart type.
 * @param plan The plan to validate.
 * @returns An array of error messages.
 */
export const validateRequiredFields = (plan: MutablePlan): string[] => {
    const errors: string[] = [];
    if (!plan.title) errors.push("Plan is missing required field: 'title'.");
    if (!plan.chartType) errors.push("Plan is missing required field: 'chartType'.");

    const validAggregations: AggregationType[] = ['sum', 'count', 'avg'];
    if (plan.aggregation && !validAggregations.includes(plan.aggregation as any)) {
        errors.push(`Invalid aggregation type '${plan.aggregation}'. Must be one of: ${validAggregations.join(', ')}.`);
    }
    if (plan.secondaryAggregation && !validAggregations.includes(plan.secondaryAggregation as any)) {
        errors.push(`Invalid secondary aggregation type '${plan.secondaryAggregation}'. Must be one of: ${validAggregations.join(', ')}.`);
    }

    switch (plan.chartType) {
        case 'bar':
        case 'line':
        case 'pie':
        case 'doughnut':
        case 'radar':
            if (!plan.groupByColumn) errors.push(`For a '${plan.chartType}' chart, 'groupByColumn' is required.`);
            if (!plan.aggregation) errors.push(`For a '${plan.chartType}' chart, 'aggregation' is required.`);
            if (plan.aggregation !== 'count' && !plan.valueColumn) {
                errors.push(`For a '${plan.aggregation}' aggregation, 'valueColumn' is required.`);
            }
            break;
        case 'combo':
            if (!plan.groupByColumn) errors.push("For a 'combo' chart, 'groupByColumn' is required.");
            if (!plan.aggregation) errors.push("For a 'combo' chart, 'aggregation' is required.");
            if (!plan.valueColumn) errors.push("For a 'combo' chart, 'valueColumn' is required.");
            if (!plan.secondaryAggregation) errors.push("For a 'combo' chart, 'secondaryAggregation' is required.");
            if (!plan.secondaryValueColumn) errors.push("For a 'combo' chart, 'secondaryValueColumn' is required.");
            if (plan.valueColumn && plan.secondaryValueColumn && plan.valueColumn.toLowerCase() === plan.secondaryValueColumn.toLowerCase()) {
                errors.push("For a 'combo' chart, 'valueColumn' and 'secondaryValueColumn' must be different.");
            }
            break;
        case 'scatter':
            if (!plan.xValueColumn) errors.push("For a 'scatter' chart, 'xValueColumn' is required.");
            if (!plan.yValueColumn) errors.push("For a 'scatter' chart, 'yValueColumn' is required.");
            break;
        case 'bubble':
            if (!plan.xValueColumn) errors.push("For a 'bubble' chart, 'xValueColumn' is required.");
            if (!plan.yValueColumn) errors.push("For a 'bubble' chart, 'yValueColumn' is required.");
            if (!plan.valueColumn) errors.push("For a 'bubble' chart, 'valueColumn' is required for bubble size.");
            break;
    }
    return errors;
};

/**
 * Validates and normalizes the preFilter array within a plan.
 * @param plan The plan to validate.
 * @param availableColumns The available column names in the dataset.
 * @returns A tuple containing the normalized plan and any errors.
 */
export const validatePreFilter = (plan: MutablePlan, availableColumns: string[]): { plan: MutablePlan, errors: string[] } => {
    const errors: string[] = [];
    if (!plan.preFilter) return { plan, errors };

    const rawPreFilter = Array.isArray(plan.preFilter)
        ? plan.preFilter
        : typeof plan.preFilter === 'object' && plan.preFilter !== null
            ? [plan.preFilter]
            : null;

    if (!rawPreFilter) {
        errors.push(`'preFilter' must be an array, but got type ${typeof plan.preFilter}.`);
        return { plan, errors };
    }

    if (!Array.isArray(plan.preFilter)) {
        console.warn(
            `${PREFILTER_LOG_PREFIX} Normalized object-shaped 'preFilter' into a single-item array.`,
            plan.preFilter,
        );
    }

    // Create a mutable copy for normalization
    const normalizedFilters = JSON.parse(JSON.stringify(rawPreFilter));

    normalizedFilters.forEach((filter: any, index: number) => {
        if (typeof filter !== 'object' || filter === null) {
            errors.push(`Filter at index ${index} is not a valid object.`);
            return;
        }

        const normalizedOperator = normalizePreFilterOperator(filter.operator);
        filter.operator = normalizedOperator.normalized;

        if (normalizedOperator.wasAliased && normalizedOperator.original) {
            console.warn(
                `${PREFILTER_LOG_PREFIX} Normalized preFilter operator "${normalizedOperator.original}" to "${filter.operator}".`,
                filter,
            );
        }

        if (!isSupportedPreFilterOperator(filter.operator)) {
            errors.push(`Filter at index ${index} has unsupported operator '${filter.operator}'.`);
        }

        if (!filter.column || typeof filter.column !== 'string') {
            errors.push(`Filter at index ${index} is missing a valid 'column' string.`);
        } else {
            const { normalized, error } = validateColumnExists(filter.column, availableColumns);
             if (error) {
                errors.push(error);
            } else {
                filter.column = normalized!; // Apply correct casing
            }
        }

        if (filter.value === undefined) {
            errors.push(`Filter at index ${index} is missing a 'value'.`);
            return;
        }

        if (filter.operator === 'in' && !Array.isArray(filter.value)) {
            filter.value = [filter.value];
        } else if (filter.operator === 'between') {
            if (!Array.isArray(filter.value) || filter.value.length < 2) {
                errors.push(`Filter at index ${index} with operator 'between' must pass an array with two values.`);
            }
        } else if (filter.operator !== 'in' && Array.isArray(filter.value)) {
            // Graceful degradation: unwrap single-element arrays instead of rejecting
            if (filter.value.length === 1) {
                filter.value = filter.value[0];
            } else {
                errors.push(`Filter at index ${index} must not pass an array value unless operator is 'in'.`);
            }
        }
    });

    if (errors.length > 0) return { plan, errors };

    plan.preFilter = normalizedFilters;
    return { plan, errors };
};
