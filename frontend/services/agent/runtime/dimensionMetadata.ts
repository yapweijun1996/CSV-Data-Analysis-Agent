import type { ColumnProfile } from '../../../types';
import { isStructuralMetadataColumn } from '../structuralMetadata';
import {
    isRepeatedBundleMemberColumn,
    isTechnicalHelperDimensionColumn,
    isTimeLikeDimensionColumn,
    isUnnamedHelperColumn,
    type AnalysisColumnRole,
} from '../analysisColumnRoles';
import type {
    CrossDimensionCardinality,
    DimensionCompleteness,
    HierarchyGroup,
    MissingColumnPattern,
    PivotCandidate,
} from './investigationTypes';

// --- Cross-Dimension Cardinality Check ---

const CROSS_DIM_PIVOT_THRESHOLD = 100;  // product > 100 → flat bar chart becomes unreadable
const CROSS_DIM_MAX_RESULTS = 10;       // return at most 10 pairs

/**
 * Pure function: computes the cardinality product for every pair of categorical
 * groupBy candidates and flags combinations where the product exceeds the pivot
 * threshold. Exported for unit testing — no SQL required.
 *
 * Only considers columns with a known `uniqueValues` count > 1 to avoid
 * flagging degenerate single-value columns.
 */
export const computeCrossDimensionCardinality = (
    columns: ColumnProfile[],
    blockedDimensions: string[] = [],
): CrossDimensionCardinality[] => {
    const eligible = columns.filter(col =>
        col.type === 'categorical'
        && !blockedDimensions.includes(col.name)
        && (col.uniqueValues ?? 0) > 1,
    );

    if (eligible.length < 2) return [];

    const results: CrossDimensionCardinality[] = [];
    for (let i = 0; i < eligible.length; i++) {
        for (let j = i + 1; j < eligible.length; j++) {
            const a = eligible[i];
            const b = eligible[j];
            const product = (a.uniqueValues ?? 1) * (b.uniqueValues ?? 1);
            results.push({
                dimA: a.name,
                dimB: b.name,
                product,
                recommendPivotOnly: product > CROSS_DIM_PIVOT_THRESHOLD,
            });
        }
    }

    return results
        .sort((a, b) => b.product - a.product)
        .slice(0, CROSS_DIM_MAX_RESULTS);
};

// --- Dimension Completeness Check ---

export const COMPLETENESS_DEPRIORITIZE_THRESHOLD = 0.70;  // < 70% completeness → soft deprioritize
export const COMPLETENESS_SUMMARY_THRESHOLD = 0.90;        // < 90% → worth mentioning in summary

/**
 * Pure function: computes the completeness rate for each candidate groupBy column
 * using the profiler's `missingPercentage` estimate (no SQL needed).
 * Exported for unit testing.
 *
 * Covers categorical, date, and time columns — anything that may be used as a
 * groupBy dimension. Columns without a `missingPercentage` are assumed complete.
 */
export const computeDimensionCompleteness = (
    columns: ColumnProfile[],
    blockedDimensions: string[] = [],
): DimensionCompleteness[] => {
    return columns
        .filter(col =>
            ['categorical', 'date', 'time'].includes(col.type)
            && !blockedDimensions.includes(col.name),
        )
        .map(col => {
            const completenessRate = col.missingPercentage !== undefined
                ? Math.max(0, Math.min(1, 1 - col.missingPercentage / 100))
                : 1.0;
            return {
                column: col.name,
                completenessRate,
                deprioritize: completenessRate < COMPLETENESS_DEPRIORITIZE_THRESHOLD,
            };
        })
        .sort((a, b) => a.completenessRate - b.completenessRate); // worst first
};

// --- Phase 4b: Detect Pivot Candidates ---

const PIVOT_MAX_UNIQUE_VALUES = 100;
const PIVOT_MIN_UNIQUE_VALUES = 2;
const PIVOT_MAX_CROSS_PRODUCT = 1000;
const PIVOT_MAX_NULL_RATE = 0.10;
const PIVOT_MAX_CANDIDATES = 2;

export const detectPivotCandidates = (
    columns: ColumnProfile[],
    blockedDimensions: string[],
    hierarchyGroups: HierarchyGroup[],
    missingDataPatterns: MissingColumnPattern[],
    businessGrains: string[],
    options?: {
        columnRoles?: Record<string, AnalysisColumnRole>;
        preferredMetrics?: string[];
        blockedMetrics?: string[];
    },
): PivotCandidate[] => {
    const allColumnNames = columns.map(column => column.name);
    const columnRoles = options?.columnRoles ?? {};
    const blockedMetrics = new Set(options?.blockedMetrics ?? []);
    const preferredMetrics = new Set(options?.preferredMetrics ?? []);
    // Collect eligible dimension columns: categorical columns + business grains
    // (business grains like ProjectCode may be typed 'numerical' by the profiler
    // because they contain numeric codes, but they are still valid pivot dimensions)
    const grainSet = new Set(businessGrains);
    const categoricalCols = columns.filter(col =>
        (col.type === 'categorical' || grainSet.has(col.name))
        && !blockedDimensions.includes(col.name)
        && !isStructuralMetadataColumn(col.name)
        && !isUnnamedHelperColumn(col.name)
        && !isTechnicalHelperDimensionColumn(col.name)
        && !isRepeatedBundleMemberColumn(col.name, allColumnNames)
        && (columnRoles[col.name] ?? 'business_dimension') === 'business_dimension'
        && (col.uniqueValues ?? 0) >= PIVOT_MIN_UNIQUE_VALUES
        && (col.uniqueValues ?? 999) <= PIVOT_MAX_UNIQUE_VALUES,
    );

    if (categoricalCols.length < 2) return [];

    // Collect candidate metric columns
    const metricCols = columns.filter(col =>
        ['numerical', 'currency', 'percentage'].includes(col.type),
    ).filter(col =>
        !isStructuralMetadataColumn(col.name)
        && !isUnnamedHelperColumn(col.name)
        && !isTechnicalHelperDimensionColumn(col.name)
        && !isRepeatedBundleMemberColumn(col.name, allColumnNames)
        && (columnRoles[col.name] ?? 'business_metric') === 'business_metric'
        && !blockedMetrics.has(col.name)
        && !isTimeLikeDimensionColumn(col.name),
    );
    if (metricCols.length === 0) return [];

    // Build hierarchy parent set for exclusion
    const hierarchyParentCols = new Set<string>();
    const hierarchyChildCols = new Set<string>();
    for (const group of hierarchyGroups) {
        hierarchyParentCols.add(group.parent);
        for (const child of group.children) {
            hierarchyChildCols.add(child.description);
        }
    }

    // Build null rate lookup
    const nullRateByColumn = new Map<string, number>();
    for (const pattern of missingDataPatterns) {
        nullRateByColumn.set(pattern.column, pattern.nullRate + pattern.blankRate);
    }

    // Score and filter candidate pairs
    const candidates: (PivotCandidate & { score: number })[] = [];

    for (let i = 0; i < categoricalCols.length; i++) {
        for (let j = i + 1; j < categoricalCols.length; j++) {
            const colA = categoricalCols[i];
            const colB = categoricalCols[j];

            // Skip if null rate is too high
            if ((nullRateByColumn.get(colA.name) ?? 0) > PIVOT_MAX_NULL_RATE) continue;
            if ((nullRateByColumn.get(colB.name) ?? 0) > PIVOT_MAX_NULL_RATE) continue;

            const crossProduct = (colA.uniqueValues ?? 1) * (colB.uniqueValues ?? 1);
            if (crossProduct > PIVOT_MAX_CROSS_PRODUCT) continue;

            // Prefer the column with more unique values as the row dimension (more rows)
            // and the column with fewer unique values as the column dimension (fewer columns)
            const [rowCol, colCol] = (colA.uniqueValues ?? 0) >= (colB.uniqueValues ?? 0)
                ? [colA, colB]
                : [colB, colA];

            // Score: business grains are preferred
            const rowIsGrain = grainSet.has(rowCol.name) ? 1 : 0;
            const colIsGrain = grainSet.has(colCol.name) ? 1 : 0;
            const grainScore = rowIsGrain + colIsGrain;
            const confidence: PivotCandidate['confidence'] = grainScore >= 2 ? 'high' : 'medium';

            // Pick the best metric: prefer currency > numerical, then by name heuristics
            const bestMetric = [...metricCols].sort((a, b) => {
                const aPreferred = preferredMetrics.has(a.name) ? 1 : 0;
                const bPreferred = preferredMetrics.has(b.name) ? 1 : 0;
                if (aPreferred !== bPreferred) return bPreferred - aPreferred;
                if (a.type === 'currency' && b.type !== 'currency') return -1;
                if (b.type === 'currency' && a.type !== 'currency') return 1;
                return 0;
            })[0];

            const aggregate: PivotCandidate['aggregate'] = bestMetric.type === 'currency' ? 'sum' : 'sum';

            // Composite score: grain membership (0-2) * 100 + inverse cross-product
            const score = grainScore * 100 + (PIVOT_MAX_CROSS_PRODUCT - crossProduct);

            candidates.push({
                rowDimension: rowCol.name,
                columnDimension: colCol.name,
                metric: bestMetric.name,
                aggregate,
                crossProductSize: crossProduct,
                confidence,
                rowCardinality: rowCol.uniqueValues ?? 1,
                columnCardinality: colCol.uniqueValues ?? 1,
                score,
            });
        }
    }

    return candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, PIVOT_MAX_CANDIDATES)
        .map(({ score: _score, ...candidate }) => candidate);
};

// --- Wide Pivot Shape Detection ---

const WIDE_PIVOT_MIN_COLUMNS = 10;
const WIDE_PIVOT_NUMERIC_RATIO = 0.5; // >50% of non-dimension cols are numerical

/**
 * Pure function: returns true when the column set looks like a wide cross-tab pivot
 * (e.g. an income statement where each column is a project, or a period comparison
 * where each column is a month). Signals:
 *   - total columns > WIDE_PIVOT_MIN_COLUMNS
 *   - first 1-2 columns are categorical (dimension/label columns)
 *   - >50% of the remaining columns are numerical
 *
 * Exported for unit testing.
 */
export const detectWidePivotShape = (columns: ColumnProfile[]): boolean => {
    if (columns.length <= WIDE_PIVOT_MIN_COLUMNS) return false;
    const firstTwo = columns.slice(0, 2);
    const categoricalLeadCount = firstTwo.filter(c => c.type === 'categorical').length;
    if (categoricalLeadCount === 0) return false;
    const rest = columns.slice(categoricalLeadCount);
    if (rest.length < WIDE_PIVOT_MIN_COLUMNS) return false;
    const numericInRest = rest.filter(c => ['numerical', 'currency', 'percentage'].includes(c.type)).length;
    return numericInRest / rest.length > WIDE_PIVOT_NUMERIC_RATIO;
};
