import { AnalysisPlan, ColumnProfile } from '../types';
import { validateColumnExists } from './planValidation/columnValidator';
import { normalizePlanShape, normalizeMultiGroupColumn } from './planValidation/planNormalizer';
import { validateRequiredFields, validatePreFilter, validateStringProperty } from './planValidation/fieldValidator';
import { resolveStructuredComboDecision } from '../services/agent/planning/comboDecision';

type MutablePlan = Partial<AnalysisPlan> & { _internal_groupByColumns?: string[] };

const sanitizeText = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const chartRequiresGroupBy = (plan: MutablePlan) => {
    if (!plan.chartType) return false;
    return ['bar', 'line', 'pie', 'doughnut', 'combo'].includes(plan.chartType);
};

const pickSmallCardinalityColumn = (columns: ColumnProfile[]) => {
    return columns.reduce<ColumnProfile | null>((best, column) => {
        if (!best) return column;
        const bestCardinality = best.uniqueValues ?? Number.MAX_SAFE_INTEGER;
        const candidateCardinality = column.uniqueValues ?? Number.MAX_SAFE_INTEGER;
        return candidateCardinality < bestCardinality ? column : best;
    }, null);
};

const inferGroupByColumn = (plan: MutablePlan, columns: ColumnProfile[]): MutablePlan => {
    if (plan.groupByColumn || !chartRequiresGroupBy(plan)) return plan;

    const categoricalColumns = columns.filter(c => c.type === 'categorical');
    if (!categoricalColumns.length) return plan;

    const combinedText = `${plan.title ?? ''} ${plan.description ?? ''}`.toLowerCase();
    const normalizedText = sanitizeText(combinedText);

    let bestMatch: { column: ColumnProfile; score: number } | null = null;
    categoricalColumns.forEach(column => {
        const label = column.name.toLowerCase();
        const normalizedLabel = sanitizeText(column.name);
        let score = 0;

        if (label && combinedText.includes(label)) score += 3;
        if (normalizedLabel && normalizedText.includes(normalizedLabel)) score += 1;

        if (typeof column.uniqueValues === 'number') {
            // Prefer categorical fields that stay readable (roughly less than a few dozen buckets).
            const diff = Math.abs(column.uniqueValues - 12);
            score += 1 / (1 + diff);
        }

        if (!bestMatch || score > bestMatch.score) {
            bestMatch = { column, score };
        }
    });

    const fallback = pickSmallCardinalityColumn(categoricalColumns);
    const chosen = bestMatch && bestMatch.score > 0 ? bestMatch.column : fallback;
    if (chosen) {
        plan.groupByColumn = chosen.name;
    }
    return plan;
};

/**
 * Validates and normalizes an AnalysisPlan object.
 * This function now orchestrates validation steps from multiple sub-modules.
 *
 * @param plan The partial AnalysisPlan object to validate.
 * @param columns The available columns in the dataset for validation.
 * @returns An object containing `validPlan` (a normalized AnalysisPlan or null) and `errors` (an array of strings).
 */
export const normalizeAndValidatePlan = (plan: Partial<AnalysisPlan> & { _internal_groupByColumns?: string[] }, columns: ColumnProfile[]): { validPlan: AnalysisPlan | null; errors: string[] } => {
    if (!plan || typeof plan !== 'object') {
        return { validPlan: null, errors: ['Plan is not a valid object.'] };
    }

    const availableColumns = columns.map(c => c.name);
    let allErrors: string[] = [];

    // Create a mutable copy for normalization
    let normalizedPlan: MutablePlan = { ...plan };

    // 1. Normalize Plan shape (e.g., graceful degradation)
    normalizedPlan = normalizePlanShape(normalizedPlan);
    normalizedPlan = inferGroupByColumn(normalizedPlan, columns);
    
    // 2. Normalize multi-column grouping
    const { normalizedPlan: multiGroupPlan, errors: multiGroupErrors } = normalizeMultiGroupColumn(normalizedPlan, availableColumns);
    normalizedPlan = multiGroupPlan;
    allErrors.push(...multiGroupErrors);

    // 2.5 Normalize combo decisions before required-field validation.
    const comboDecision = resolveStructuredComboDecision({
        chartType: normalizedPlan.chartType,
        bindings: normalizedPlan,
        aggregation: normalizedPlan.aggregation,
        secondaryAggregation: normalizedPlan.secondaryAggregation,
        columns,
        isSqlFirst: false,
    });
    normalizedPlan.chartType = comboDecision.chartType;
    normalizedPlan.groupByColumn = comboDecision.bindings.groupByColumn;
    normalizedPlan.valueColumn = comboDecision.bindings.valueColumn;
    normalizedPlan.secondaryValueColumn = comboDecision.bindings.secondaryValueColumn;
    normalizedPlan.xValueColumn = comboDecision.bindings.xValueColumn;
    normalizedPlan.yValueColumn = comboDecision.bindings.yValueColumn;
    normalizedPlan.secondaryAggregation = comboDecision.secondaryAggregation;

    // 3. Validate required fields
    allErrors.push(...validateRequiredFields(normalizedPlan));
    
    // 4. Validate string properties
    validateStringProperty(normalizedPlan, 'groupByColumn', allErrors);
    validateStringProperty(normalizedPlan, 'valueColumn', allErrors);
    validateStringProperty(normalizedPlan, 'xValueColumn', allErrors);
    validateStringProperty(normalizedPlan, 'yValueColumn', allErrors);
    validateStringProperty(normalizedPlan, 'secondaryValueColumn', allErrors);
    
    // 5. Validate and normalize column names
    const columnsToValidate: (keyof AnalysisPlan)[] = [
        'valueColumn', 'xValueColumn', 'yValueColumn', 'secondaryValueColumn'
    ];
    // If not a composite key, validate groupByColumn
    if (typeof normalizedPlan.groupByColumn === 'string' && !normalizedPlan._internal_groupByColumns) {
        const { normalized, error } = validateColumnExists(normalizedPlan.groupByColumn, availableColumns);
        if (error) { allErrors.push(error); } else { (normalizedPlan as any).groupByColumn = normalized; }
    }

    columnsToValidate.forEach(prop => {
        const colName = normalizedPlan[prop] as string | undefined;
        if (colName) {
            const { normalized, error } = validateColumnExists(colName, availableColumns);
            if (error) {
                allErrors.push(error);
            } else {
                (normalizedPlan as any)[prop] = normalized; // Apply correct casing
            }
        }
    });
    
    // 6. Validate and normalize preFilter
    const { plan: filteredPlan, errors: filterErrors } = validatePreFilter(normalizedPlan, availableColumns);
    normalizedPlan = filteredPlan;
    allErrors.push(...filterErrors);

    if (allErrors.length > 0) {
        return { validPlan: null, errors: allErrors };
    }

    // Ensure description exists
    if (!normalizedPlan.description) {
        normalizedPlan.description = `Analysis of ${normalizedPlan.title}`;
    }

    return { validPlan: normalizedPlan as AnalysisPlan, errors: [] };
};
