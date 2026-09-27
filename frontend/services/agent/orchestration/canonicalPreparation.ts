import type { CsvData, DataPreparationPlan } from '../../../types';

/**
 * Reapplies safe cleaning outputs to a canonical dataset rebuilt from the raw
 * intake IR. Canonicalization owns row shape; the cleaning plan owns these
 * value-level transformations.
 */
export const applyPreparationPlanToCanonicalDataset = (
    dataset: CsvData | null,
    plan: DataPreparationPlan | null | undefined,
): CsvData | null => {
    if (!dataset || !plan) return dataset;

    const replacements = new Map<string, Map<string, string>>();
    for (const cluster of plan.labelNormalization?.appliedClusters ?? []) {
        const columnReplacements = replacements.get(cluster.column)
            ?? new Map<string, string>();
        for (const variant of cluster.replacedValues) {
            columnReplacements.set(variant, cluster.canonicalValue);
        }
        replacements.set(cluster.column, columnReplacements);
    }
    const numericColumns = new Set(plan.numericStringNormalizedColumns ?? []);
    if (replacements.size === 0 && numericColumns.size === 0) return dataset;

    return {
        ...dataset,
        data: dataset.data.map(row => {
            let changed = false;
            const nextRow = { ...row };

            for (const [column, columnReplacements] of replacements) {
                const value = String(row[column] ?? '');
                const replacement = columnReplacements.get(value);
                if (replacement !== undefined && replacement !== value) {
                    nextRow[column] = replacement;
                    changed = true;
                }
            }

            for (const column of numericColumns) {
                const value = nextRow[column];
                if (typeof value !== 'string' || !value.trim()) continue;
                const parsed = Number(value.replace(/[,$€£¥%\s]/g, ''));
                if (Number.isFinite(parsed)) {
                    nextRow[column] = parsed;
                    changed = true;
                }
            }

            return changed ? nextRow : row;
        }),
    };
};
