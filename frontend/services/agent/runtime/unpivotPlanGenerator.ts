/**
 * unpivotPlanGenerator.ts
 *
 * Generates a controlled `unpivot_columns` DataOperation plan from detected
 * PeriodColumnFamily signals. Converts wide-pivot month columns (e.g.
 * JAN 2010...DEC 2010) into a long table with Period / Value dimensions,
 * preserving row-level lineage and excluding TOTAL / summary columns.
 *
 * Follows the harness engineering pattern: detect → structured findings →
 * runtime directive (the plan). No SQL, no side effects.
 */

import type { ColumnProfile, UnpivotColumnsOperation } from '../../../types';
import type { PeriodColumnFamily } from './periodColumnDetector';
import { isStructuralMetadataColumn } from '../structuralMetadata';
import { isUnnamedHelperColumn } from '../analysisColumnRoles';

// --- Constants ---

/** Default output column name for the unpivoted period key. */
const DEFAULT_KEY_COLUMN = 'Period';

/** Default output column name for the unpivoted cell value. */
const DEFAULT_VALUE_COLUMN = 'Value';

/** Default output column name preserving the original wide column header. */
const DEFAULT_SOURCE_COLUMN_NAME = 'SourceColumnName';

/**
 * Column names added by the cleaning/structure pipeline that carry internal
 * metadata, not user data.  These should be excluded from unpivot keepColumns
 * so they don't pollute the reshaped long table or the DuckDB session.
 *
 * NOTE: registered structural metadata (RowClass, RowRole, etc.) is checked
 * via `isStructuralMetadataColumn` from structuralMetadata.ts.  The patterns
 * below cover additional pipeline-generated columns that are not registered
 * there (SectionLabel, HeaderPath, CarryForwardAppliedColumns, etc.).
 */
const CLEANING_PIPELINE_COLUMN_PATTERNS: RegExp[] = [
    /^SectionLabel$/i,
    /^HeaderPath$/i,
    /^CarryForwardAppliedColumns$/i,
    /^SourceColumnName$/i,
];

const isCleaningPipelineColumn = (name: string): boolean =>
    isStructuralMetadataColumn(name)
    || isUnnamedHelperColumn(name)
    || CLEANING_PIPELINE_COLUMN_PATTERNS.some(pattern => pattern.test(name.trim()));

/**
 * Patterns that identify aggregation / summary columns to exclude from the
 * period series unpivot. Case-insensitive full-match against the column name.
 */
const TOTAL_COLUMN_PATTERNS: RegExp[] = [
    /^total$/i,
    /^grand\s*total$/i,
    /^sub\s*total$/i,
    /^sum$/i,
    /^ytd$/i,
    /^year\s*total$/i,
    /^total\s+\d{4}$/i,           // "TOTAL 2010"
    /^annual\s*total$/i,
    /^cumulative$/i,
];

// --- Public API ---

export interface UnpivotPlanResult {
    /** The generated unpivot operation, or null if conditions are not met. */
    operation: UnpivotColumnsOperation | null;
    /** Human-readable reason when the plan is skipped. */
    skipReason: string | null;
    /** Columns excluded from the period series (matched TOTAL patterns). */
    excludedColumns: string[];
}

/**
 * Returns true if a column name matches a known total / summary pattern
 * and should be excluded from period-series unpivot.
 */
export const isTotalColumn = (columnName: string): boolean =>
    TOTAL_COLUMN_PATTERNS.some(pattern => pattern.test(columnName.trim()));

/**
 * Generates a controlled `unpivot_columns` plan for a single PeriodColumnFamily.
 *
 * @param family - The detected period column family.
 * @param allColumns - Full column profile list from the dataset.
 * @param options - Optional overrides for output column names.
 * @returns UnpivotPlanResult with the operation or a skip reason.
 */
export const generatePeriodUnpivotPlan = (
    family: PeriodColumnFamily,
    allColumns: ColumnProfile[],
    options?: {
        keyColumn?: string;
        valueColumn?: string;
        sourceColumnNameColumn?: string;
    },
): UnpivotPlanResult => {
    const keyColumn = options?.keyColumn ?? DEFAULT_KEY_COLUMN;
    const valueColumn = options?.valueColumn ?? DEFAULT_VALUE_COLUMN;
    const sourceColumnNameColumn = options?.sourceColumnNameColumn ?? DEFAULT_SOURCE_COLUMN_NAME;

    // Separate period columns from total/summary columns.
    const periodColumnSet = new Set(family.columns.map(c => c.toLowerCase()));
    const allColumnNames = allColumns.map(c => c.name);

    const excludedColumns: string[] = [];
    const sourceColumns: string[] = [];

    for (const col of family.columns) {
        if (isTotalColumn(col)) {
            excludedColumns.push(col);
        } else {
            sourceColumns.push(col);
        }
    }

    // Also check all columns for TOTAL-like names that are NOT in the family
    // but sit among the period columns (common in financial reports).
    for (const colName of allColumnNames) {
        if (periodColumnSet.has(colName.toLowerCase())) continue;
        if (isTotalColumn(colName) && !excludedColumns.includes(colName)) {
            excludedColumns.push(colName);
        }
    }

    if (sourceColumns.length < 2) {
        return {
            operation: null,
            skipReason: `Only ${sourceColumns.length} period column(s) after excluding totals — not enough for unpivot.`,
            excludedColumns,
        };
    }

    // keepColumns = all columns that are NOT part of the period family,
    // NOT identified as total/summary columns, and NOT structural metadata
    // injected by the cleaning pipeline (RowRole, SourceRowIndex, etc.).
    const sourceColumnLower = new Set(sourceColumns.map(c => c.toLowerCase()));
    const excludedLower = new Set(excludedColumns.map(c => c.toLowerCase()));

    const keepColumns = allColumnNames.filter(name => {
        const lower = name.toLowerCase();
        return !sourceColumnLower.has(lower)
            && !excludedLower.has(lower)
            && !isCleaningPipelineColumn(name);
    });

    const yearLabel = family.year ? ` (${family.year})` : '';
    const operation: UnpivotColumnsOperation = {
        id: `auto_period_unpivot${yearLabel}`,
        type: 'unpivot_columns',
        reason: `Reshape ${sourceColumns.length} wide period columns${yearLabel} into long table with ${keyColumn} / ${valueColumn} dimensions.`,
        sourceColumns,
        keyColumn,
        valueColumn,
        keepColumns,
        sourceColumnNameColumn,
    };

    return {
        operation,
        skipReason: null,
        excludedColumns,
    };
};

/**
 * Generates unpivot plans for ALL detected period column families.
 * Typically there is one family per year (e.g. monthly 2010),
 * but datasets spanning multiple years will yield multiple families.
 *
 * When multiple families exist, they are merged into a single unpivot
 * operation so the resulting long table has one unified Period column.
 */
export const generateAllPeriodUnpivotPlans = (
    families: PeriodColumnFamily[],
    allColumns: ColumnProfile[],
    options?: {
        keyColumn?: string;
        valueColumn?: string;
        sourceColumnNameColumn?: string;
    },
): UnpivotPlanResult => {
    if (families.length === 0) {
        return {
            operation: null,
            skipReason: 'No period column families detected.',
            excludedColumns: [],
        };
    }

    // For a single family, delegate directly.
    if (families.length === 1) {
        return generatePeriodUnpivotPlan(families[0], allColumns, options);
    }

    // Multiple families — merge all source columns into one plan.
    const keyColumn = options?.keyColumn ?? DEFAULT_KEY_COLUMN;
    const valueColumn = options?.valueColumn ?? DEFAULT_VALUE_COLUMN;
    const sourceColumnNameColumn = options?.sourceColumnNameColumn ?? DEFAULT_SOURCE_COLUMN_NAME;

    const allSourceColumns: string[] = [];
    const allExcludedColumns: string[] = [];
    const seenSource = new Set<string>();
    const seenExcluded = new Set<string>();

    for (const family of families) {
        for (const col of family.columns) {
            const lower = col.toLowerCase();
            if (isTotalColumn(col)) {
                if (!seenExcluded.has(lower)) {
                    seenExcluded.add(lower);
                    allExcludedColumns.push(col);
                }
            } else {
                if (!seenSource.has(lower)) {
                    seenSource.add(lower);
                    allSourceColumns.push(col);
                }
            }
        }
    }

    // Also scan all columns for standalone TOTAL columns.
    const allColumnNames = allColumns.map(c => c.name);
    for (const colName of allColumnNames) {
        const lower = colName.toLowerCase();
        if (seenSource.has(lower) || seenExcluded.has(lower)) continue;
        if (isTotalColumn(colName)) {
            seenExcluded.add(lower);
            allExcludedColumns.push(colName);
        }
    }

    if (allSourceColumns.length < 2) {
        return {
            operation: null,
            skipReason: `Only ${allSourceColumns.length} period column(s) across all families after excluding totals.`,
            excludedColumns: allExcludedColumns,
        };
    }

    const keepColumns = allColumnNames.filter(name => {
        const lower = name.toLowerCase();
        return !seenSource.has(lower)
            && !seenExcluded.has(lower)
            && !isCleaningPipelineColumn(name);
    });

    const yearLabels = families.map(f => f.year).filter(Boolean).join(', ');
    const operation: UnpivotColumnsOperation = {
        id: `auto_period_unpivot_merged`,
        type: 'unpivot_columns',
        reason: `Reshape ${allSourceColumns.length} wide period columns (${yearLabels || 'no year'}) into long table with ${keyColumn} / ${valueColumn} dimensions.`,
        sourceColumns: allSourceColumns,
        keyColumn,
        valueColumn,
        keepColumns,
        sourceColumnNameColumn,
    };

    return {
        operation,
        skipReason: null,
        excludedColumns: allExcludedColumns,
    };
};
