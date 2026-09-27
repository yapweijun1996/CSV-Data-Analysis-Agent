import type { ColumnProfile } from '../../../types';
import { matchesMetricPattern } from '../analysisBrief';
import { duckDbWorkerClient } from '../../workers/duckDbWorkerClient';
import type {
    DescriptionTotal,
    DuckDbAnalysisBinding,
    OutlierInfo,
    MissingColumnPattern,
} from './investigationTypes';
import { QUERY_TIMEOUT_MS } from './investigationTypes';

// --- Phase 2c: Outlier Detection (IQR) ---

export const detectOutliers = (totals: DescriptionTotal[]): OutlierInfo[] => {
    if (totals.length < 5) return [];
    const values = totals.map(t => t.total).sort((a, b) => a - b);
    const q1Idx = Math.floor(values.length * 0.25);
    const q3Idx = Math.floor(values.length * 0.75);
    const q1 = values[q1Idx];
    const q3 = values[q3Idx];
    const iqr = q3 - q1;
    if (iqr === 0) return [];
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;

    return totals
        .filter(t => t.total < lowerFence || t.total > upperFence)
        .map(t => ({
            description: t.description,
            total: t.total,
            direction: t.total > upperFence ? 'high' as const : 'low' as const,
            iqrDistance: t.total > upperFence
                ? (t.total - q3) / iqr
                : (q1 - t.total) / iqr,
        }))
        .sort((a, b) => b.iqrDistance - a.iqrDistance);
};

// --- Phase 2d: Missing Data Pattern Detection ---

const MISSING_MODERATE_THRESHOLD = 0.05;
const MISSING_SEVERE_THRESHOLD = 0.20;

export const detectMissingDataPatterns = async (
    columns: ColumnProfile[],
    binding: DuckDbAnalysisBinding,
): Promise<MissingColumnPattern[]> => {
    // Only check columns that ColumnProfile already flags as having missing values
    const candidateCols = columns
        .filter(col => (col.missingPercentage ?? 0) > MISSING_MODERATE_THRESHOLD * 100)
        .slice(0, 10);
    if (candidateCols.length === 0) return [];

    const selectParts = candidateCols.flatMap(col => [
        `SUM(CASE WHEN "${col.name}" IS NULL THEN 1 ELSE 0 END) AS "${col.name}__null"`,
        `SUM(CASE WHEN TRIM(COALESCE(CAST("${col.name}" AS VARCHAR), '')) = '' THEN 1 ELSE 0 END) AS "${col.name}__blank"`,
        ...((['numerical', 'currency', 'percentage'].includes(col.type))
            ? [`SUM(CASE WHEN TRY_CAST("${col.name}" AS DOUBLE) = 0 THEN 1 ELSE 0 END) AS "${col.name}__zero"`]
            : []),
    ]);
    const sql = `SELECT ${selectParts.join(', ')}, COUNT(*) AS total_rows FROM "${binding.tableName}"`;
    const selectedColumns = [
        ...candidateCols.flatMap(col => [
            `${col.name}__null`,
            `${col.name}__blank`,
            ...((['numerical', 'currency', 'percentage'].includes(col.type)) ? [`${col.name}__zero`] : []),
        ]),
        'total_rows',
    ];

    try {
        const result = await duckDbWorkerClient.executeCompiledQuery({
            sql,
            countSql: 'SELECT 1 AS total',
            selectedColumns,
            appliedOrderBy: [],
            appliedLimit: 1,
        }, QUERY_TIMEOUT_MS);

        if (result.rows.length === 0) return [];
        const row = result.rows[0];
        const totalRows = Number(row['total_rows']) || 1;

        return candidateCols
            .map(col => {
                const nullCount = Number(row[`${col.name}__null`]) || 0;
                const blankCount = Number(row[`${col.name}__blank`]) || 0;
                const zeroCount = Number(row[`${col.name}__zero`]) || 0;
                const nullRate = nullCount / totalRows;
                const blankRate = blankCount / totalRows;
                const zeroRate = zeroCount / totalRows;
                const combinedMissing = nullRate + blankRate;
                if (combinedMissing < MISSING_MODERATE_THRESHOLD) return null;
                return {
                    column: col.name,
                    nullRate,
                    blankRate,
                    zeroRate,
                    severity: combinedMissing >= MISSING_SEVERE_THRESHOLD ? 'severe' as const : 'moderate' as const,
                };
            })
            .filter((p): p is MissingColumnPattern => p !== null);
    } catch {
        return [];
    }
};

// --- Phase 3: Semantic Classification ---
// Uses shared metric vocabulary from analysisBrief.ts (AI-first, regex fallback).

export const classifySemanticCategories = (
    descriptions: string[],
    preClassified?: Record<string, string> | null,
): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const desc of descriptions) {
        // AI-first: use pre-classified map when available.
        if (preClassified?.[desc]) {
            result[desc] = preClassified[desc];
            continue;
        }
        // Regex fallback using shared metric vocabulary.
        if (matchesMetricPattern(desc, 'profit') || matchesMetricPattern(desc, 'margin')) {
            result[desc] = 'profit';
        } else if (matchesMetricPattern(desc, 'revenue')) {
            result[desc] = 'revenue';
        } else if (matchesMetricPattern(desc, 'cost')) {
            result[desc] = 'cost';
        } else {
            result[desc] = 'operating';
        }
    }
    return result;
};
