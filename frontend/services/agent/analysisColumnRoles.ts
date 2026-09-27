import type {
    ColumnProfile,
    DataPreparationPlan,
    RuntimeSemanticUnderstanding,
} from '../../types';
import { isStructuralMetadataColumn } from './structuralMetadata';

export type AnalysisColumnRole =
    | 'structural_metadata'
    | 'helper_dimension'
    | 'repeated_bundle_member'
    | 'business_dimension'
    | 'business_metric';

// Structural: pipeline-generated helper dimension column names (exact-match vocabulary).
// These are injected by canonicalization, not present in user-uploaded data.
const HELPER_DIMENSION_NAMES = new Set([
    'sourcecolumnname', 'source column',
    'serieskey', 'series key',
    'rownumber', 'row number', 'rownum',
]);
// Structural: unnamed/auto-generated column names (format detection, not domain vocabulary).
const UNNAMED_COLUMN_PATTERN = /^_?unnamed(?:\s+column)?(?:[_\s]?\d+)?$/i;
// Structural: repeated column bundle detection (e.g., "Amount_2", "Value_3").
const REPEATED_SUFFIX_PATTERN = /^(.*)_(\d+)$/;
// Structural + domain: temporal dimension detection via column name keywords.
// Uses boundary matching (not exact-match) — regex appropriate.
const TIME_DIMENSION_NAME_PATTERN = /(?:^|[\s_])(date|time|day|week|month|quarter|year|period)(?:$|[\s_])/i;
// Structural: canonical context dimension column names from report structure pipeline.
// Exact-match vocabulary; Set-based lookup replaces anchored regex alternation.
const CANONICAL_CONTEXT_DIMENSION_NAMES = new Set([
    'sectionlabel', 'section label',
    'parentlabel', 'parent label',
    'sectionpath', 'section path',
    'headerpath', 'header path',
    'carryforwardappliedcolumns', 'carry forward applied columns',
]);

const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

export const isUnnamedHelperColumn = (columnName: string): boolean =>
    UNNAMED_COLUMN_PATTERN.test(columnName) || normalizeKey(columnName).startsWith('unnamedcolumn');

export const isTechnicalHelperDimensionColumn = (columnName: string): boolean =>
    HELPER_DIMENSION_NAMES.has(normalizeKey(columnName)) || HELPER_DIMENSION_NAMES.has(columnName.trim().toLowerCase());

export const isCanonicalContextDimensionColumn = (columnName: string): boolean =>
    CANONICAL_CONTEXT_DIMENSION_NAMES.has(normalizeKey(columnName))
    || CANONICAL_CONTEXT_DIMENSION_NAMES.has(columnName.trim().toLowerCase());

export const isTimeLikeDimensionColumn = (columnName: string): boolean =>
    TIME_DIMENSION_NAME_PATTERN.test(columnName) || TIME_DIMENSION_NAME_PATTERN.test(normalizeKey(columnName));

export const getRepeatedBundleBase = (
    columnName: string,
    allColumnNames: string[],
): string | null => {
    const match = columnName.match(REPEATED_SUFFIX_PATTERN);
    if (!match) {
        return null;
    }

    const [, rawBase, rawIndex] = match;
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 2) {
        return null;
    }

    const base = rawBase.trim();
    if (!base) {
        return null;
    }

    return allColumnNames.includes(base) ? base : null;
};

export const isRepeatedBundleMemberColumn = (
    columnName: string,
    allColumnNames: string[],
): boolean => Boolean(getRepeatedBundleBase(columnName, allColumnNames));

const isSemanticBusinessDimension = (
    columnName: string,
    semanticUnderstanding?: RuntimeSemanticUnderstanding | null,
): boolean => {
    if (!semanticUnderstanding) {
        return false;
    }
    if (semanticUnderstanding.businessGrains.includes(columnName)) {
        return true;
    }
    return false;
};

const isSemanticBusinessMetric = (
    columnName: string,
    semanticUnderstanding?: RuntimeSemanticUnderstanding | null,
): boolean => {
    if (!semanticUnderstanding) {
        return false;
    }
    return semanticUnderstanding.candidateMetrics.includes(columnName);
};

export const classifyAnalysisColumnRole = (
    column: ColumnProfile,
    columns: ColumnProfile[],
    semanticUnderstanding?: RuntimeSemanticUnderstanding | null,
): AnalysisColumnRole => {
    const allColumnNames = columns.map(candidate => candidate.name);

    if (isStructuralMetadataColumn(column.name)) {
        return 'structural_metadata';
    }

    if (
        isUnnamedHelperColumn(column.name)
        || isTechnicalHelperDimensionColumn(column.name)
        || isCanonicalContextDimensionColumn(column.name)
    ) {
        return 'helper_dimension';
    }

    if (isRepeatedBundleMemberColumn(column.name, allColumnNames)) {
        // Semantic understanding overrides naming heuristics: a column auto-renamed
        // with a _N suffix (e.g. PARTY_2 from duplicate header) may carry business
        // data (customer names, entity labels).  Trust the AI signal.
        if (isSemanticBusinessDimension(column.name, semanticUnderstanding)) {
            return 'business_dimension';
        }
        if (isSemanticBusinessMetric(column.name, semanticUnderstanding)) {
            return 'business_metric';
        }
        return 'repeated_bundle_member';
    }

    // --- AI semantic signals are authoritative (primary) ---
    // Check AI classification BEFORE regex name-based heuristics so that
    // the AI can override naming patterns when the data tells a different
    // story (e.g. "Period" might be a categorical label, not a date).

    // Only hard-block on blockedDimensions (strong signal).  helperDimensions
    // is a soft hint — let those columns fall through to the type-based default
    // so they can participate as business_dimension candidates.
    if (semanticUnderstanding?.blockedDimensions.includes(column.name)) {
        return ['numerical', 'currency', 'percentage'].includes(column.type)
            ? 'business_metric'
            : 'helper_dimension';
    }

    if (isSemanticBusinessMetric(column.name, semanticUnderstanding)) {
        return 'business_metric';
    }

    if (isSemanticBusinessDimension(column.name, semanticUnderstanding)) {
        return 'business_dimension';
    }

    // --- Regex fallback (only when AI didn't classify) ---
    // Time-like column name pattern is a reasonable heuristic when the AI
    // semantic snapshot didn't explicitly classify the column.
    if (isTimeLikeDimensionColumn(column.name)) {
        return 'business_dimension';
    }

    return ['numerical', 'currency', 'percentage'].includes(column.type)
        ? 'business_metric'
        : 'business_dimension';
};

export const buildAnalysisColumnRoleMap = (
    columns: ColumnProfile[],
    semanticUnderstanding?: RuntimeSemanticUnderstanding | null,
    options?: { replicatedMetricColumns?: string[] },
): Record<string, AnalysisColumnRole> => {
    const replicatedMetricColumns = new Set(
        (options?.replicatedMetricColumns ?? []).map(name => name.trim().toLowerCase()),
    );
    return Object.fromEntries(
        columns.map(column => {
            const role: AnalysisColumnRole = replicatedMetricColumns.has(column.name.trim().toLowerCase())
                ? 'repeated_bundle_member'
                : classifyAnalysisColumnRole(column, columns, semanticUnderstanding);
            return [column.name, role];
        }),
    );
};

const NUMERIC_COLUMN_TYPES = new Set(['numerical', 'currency', 'percentage']);

/**
 * Numeric keep-columns are copied once for every emitted long-table row by
 * unpivot_columns. They remain useful for inspection and provenance, but
 * aggregating them at the reshaped grain multiplies their source value by the
 * unpivot fan-out. Return their final column names so analysis can block them
 * as metrics without deleting them from the prepared dataset.
 */
export const findReplicatedUnpivotMetricColumns = (
    columns: ColumnProfile[],
    dataPreparationPlan?: DataPreparationPlan | null,
): string[] => {
    if (!dataPreparationPlan?.operations.some(operation => operation.type === 'unpivot_columns')) {
        return [];
    }

    const currentNumericColumns = new Map(
        columns
            .filter(column => NUMERIC_COLUMN_TYPES.has(column.type))
            .map(column => [column.name.trim().toLowerCase(), column.name]),
    );
    const replicatedNames = new Set<string>();

    dataPreparationPlan.operations.forEach(operation => {
        if (operation.type === 'unpivot_columns') {
            const sourceNames = new Set(operation.sourceColumns.map(name => name.trim().toLowerCase()));
            const generatedNames = new Set([
                operation.keyColumn,
                operation.valueColumn,
                operation.sourceColumnNameColumn,
                operation.sourceRowIndexColumn,
                operation.rowClassColumn,
                operation.hierarchyDepthColumn,
                ...(operation.labelColumns?.map(label => label.outputColumn) ?? []),
                operation.labelColumn,
            ].filter((name): name is string => Boolean(name)).map(name => name.trim().toLowerCase()));
            const keepColumns = operation.keepColumns?.length
                ? operation.keepColumns
                : columns
                    .map(column => column.name)
                    .filter(name => !sourceNames.has(name.trim().toLowerCase()))
                    .filter(name => !generatedNames.has(name.trim().toLowerCase()));

            keepColumns.forEach(name => replicatedNames.add(name.trim().toLowerCase()));
            return;
        }

        if (operation.type === 'rename_columns') {
            operation.mappings.forEach(mapping => {
                const from = mapping.from.trim().toLowerCase();
                if (!replicatedNames.delete(from)) return;
                replicatedNames.add(mapping.to.trim().toLowerCase());
            });
        }
    });

    return Array.from(replicatedNames)
        .map(name => currentNumericColumns.get(name))
        .filter((name): name is string => Boolean(name));
};
