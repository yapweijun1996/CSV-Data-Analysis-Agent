import {
    CastColumnOperation,
    CsvCellValue,
    CsvRow,
    DataOperation,
    DeriveExpression,
    DeriveMetricByLabelFormula,
    DeriveMetricComponent,
    DeriveOperand,
    FillMissingOperation,
    FilterPredicateGroup,
    FilterPredicate,
    FilterRowsOperation,
} from '../../../types';
import { robustParseFloat } from '../../data/dataProfiler';
import { SUMMARY_LABEL_PATTERN } from '../reportShapeUtils';
import { detectReportShape } from '../reportShapeDetector';
import {
    getDataOperationManifest,
    normalizeDataOperation as normalizeManifestDataOperation,
} from './dataOperationManifest';
import {
    normalizeUnpivotHierarchyDepthMappings,
    normalizeUnpivotLabelColumns,
} from './unpivotOperationUtils';
import {
    flattenOperationRecord,
    inferReplaceValueColumn,
    normalizeReplaceValueReplacements,
    normalizeString,
} from './dataOperationNormalization';

const DEFAULT_EMPTY_MARKERS = ['', 'n/a', 'na', 'null', 'none', '-', '--'];
const FILTER_OPERATORS = new Set<FilterPredicate['operator']>([
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'contains',
    'starts_with',
    'ends_with',
    'in',
    'is_null',
    'not_null',
]);

export interface DataOperationExecutionLog {
    operationId: string;
    operationType: DataOperation['type'];
    reason: string;
    status: 'done' | 'error';
    rowCountBefore: number;
    rowCountAfter: number;
    columnCountBefore: number;
    columnCountAfter: number;
    detail?: Record<string, unknown>;
}

const DEFAULT_ROW_CLASS_COLUMN = 'RowClass';
const DEFAULT_HIERARCHY_DEPTH_COLUMN = 'HierarchyDepth';
const DEFAULT_SOURCE_ROW_INDEX_COLUMN = 'SourceRowIndex';

export const cloneRows = (rows: CsvRow[]): CsvRow[] => rows.map(row => ({ ...row }));
const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const getColumns = (rows: CsvRow[]): string[] => {
    const columns = new Set<string>();
    rows.forEach(row => {
        Object.keys(row).forEach(key => columns.add(key));
    });
    return [...columns];
};

/** Collapse internal whitespace runs so "A  B" matches "A B". */
const colKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

export const buildColumnLookup = (columns: string[]) => {
    const lookup = new Map<string, string>();
    columns.forEach(column => {
        lookup.set(colKey(column), column);
    });
    return lookup;
};

export const normalizeColumnName = (column: unknown, lookup: Map<string, string>, context: string) => {
    if (typeof column !== 'string' || !column.trim()) {
        throw new Error(`${context} requires a non-empty column name.`);
    }
    const normalized = lookup.get(colKey(column));
    if (!normalized) {
        throw new Error(`${context} references missing column: ${column}`);
    }
    return normalized;
};

const isMissingValue = (value: CsvCellValue): boolean => {
    if (value === null || value === undefined) return true;
    return typeof value === 'string' && value.trim() === '';
};

const isBlankRow = (row: CsvRow): boolean =>
    Object.values(row).every(value => isMissingValue(value));

const sanitizeHeaderName = (value: CsvCellValue, fallback: string, index: number): string => {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return fallback.trim() || `_unnamed_column_${index + 1}`;
    }
    return normalized;
};

const uniquifyHeaders = (headers: string[]): string[] => {
    const seen = new Map<string, number>();
    return headers.map(header => {
        const normalized = header.trim() || '_unnamed_column';
        const key = normalized.toLowerCase();
        const count = seen.get(key) ?? 0;
        seen.set(key, count + 1);
        return count === 0 ? normalized : `${normalized}_${count + 1}`;
    });
};

const buildDistinctKeyCount = (rows: CsvRow[], columns: string[]): number => {
    if (columns.length === 0) return 0;
    return new Set(rows.map(row => columns.map(column => String(row[column] ?? '')).join('||'))).size;
};

const normalizeMarker = (value: string) => value.trim().toLowerCase();

const getOperationColumns = (rows: CsvRow[], columns: string[] | '*'): string[] =>
    columns === '*' ? getColumns(rows) : columns;

const assertColumnsExist = (rows: CsvRow[], columns: string[], operation: DataOperation) => {
    const existing = new Set(getColumns(rows).map(column => column.toLowerCase()));
    const missing = columns.filter(column => !existing.has(column.toLowerCase()));
    if (missing.length > 0) {
        throw new Error(`Operation "${operation.id}" references missing columns: ${missing.join(', ')}`);
    }
};

const formatDate = (value: CsvCellValue): CsvCellValue => {
    if (isMissingValue(value)) return null;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
};

const formatBoolean = (value: CsvCellValue): CsvCellValue => {
    if (isMissingValue(value)) return null;
    const normalized = String(value).trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
    if (['false', 'no', 'n', '0'].includes(normalized)) return false;
    return null;
};

const castValue = (value: CsvCellValue, operation: CastColumnOperation): CsvCellValue => {
    if (operation.targetType === 'string') {
        return isMissingValue(value) ? null : String(value).trim();
    }
    if (operation.targetType === 'date') {
        return formatDate(value);
    }
    if (operation.targetType === 'boolean') {
        return formatBoolean(value);
    }
    const numeric = robustParseFloat(value);
    return numeric;
};

const resolveOperand = (row: CsvRow, operand: DeriveOperand): CsvCellValue =>
    operand.kind === 'literal' ? operand.value : row[operand.column] ?? null;

const deriveValue = (row: CsvRow, expression: DeriveExpression): CsvCellValue => {
    switch (expression.kind) {
        case 'copy':
            return resolveOperand(row, expression.source);
        case 'math_binary': {
            const left = robustParseFloat(resolveOperand(row, expression.left));
            const right = robustParseFloat(resolveOperand(row, expression.right));
            if (left === null || right === null) return null;
            switch (expression.operator) {
                case 'add':
                    return left + right;
                case 'subtract':
                    return left - right;
                case 'multiply':
                    return left * right;
                case 'divide':
                    return right === 0 ? null : left / right;
            }
            break;
        }
        case 'ratio': {
            const numerator = robustParseFloat(resolveOperand(row, expression.numerator));
            const denominator = robustParseFloat(resolveOperand(row, expression.denominator));
            if (numerator === null || denominator === null || denominator === 0) return null;
            return numerator / denominator;
        }
        case 'concat':
            return expression.parts
                .map(part => resolveOperand(row, part))
                .filter(value => value !== null && value !== undefined && String(value).length > 0)
                .map(value => String(value))
                .join(expression.separator ?? '');
    }
    return null;
};

const comparePredicate = (row: CsvRow, predicate: FilterPredicate): boolean => {
    const value = row[predicate.column] ?? null;
    switch (predicate.operator) {
        case 'is_null':
            return isMissingValue(value);
        case 'not_null':
            return !isMissingValue(value);
        case 'contains':
            return String(value ?? '').toLowerCase().includes(String(predicate.value ?? '').toLowerCase());
        case 'starts_with':
            return String(value ?? '').toLowerCase().startsWith(String(predicate.value ?? '').toLowerCase());
        case 'ends_with':
            return String(value ?? '').toLowerCase().endsWith(String(predicate.value ?? '').toLowerCase());
        case 'in': {
            const values = Array.isArray(predicate.value) ? predicate.value : [predicate.value];
            const normalized = String(value ?? '').toLowerCase();
            return values.some(candidate => String(candidate ?? '').toLowerCase() === normalized);
        }
        case 'eq':
            return String(value ?? '').toLowerCase() === String(predicate.value ?? '').toLowerCase();
        case 'neq':
            return String(value ?? '').toLowerCase() !== String(predicate.value ?? '').toLowerCase();
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
        case 'between': {
            const left = robustParseFloat(value);
            if (predicate.operator === 'between') {
                const values = Array.isArray(predicate.value) ? predicate.value : [];
                const lower = robustParseFloat(values[0]);
                const upper = robustParseFloat(values[1]);
                if (left === null || lower === null || upper === null) return false;
                return left >= lower && left <= upper;
            }
            const right = robustParseFloat(predicate.value);
            if (left === null || right === null) return false;
            if (predicate.operator === 'gt') return left > right;
            if (predicate.operator === 'gte') return left >= right;
            if (predicate.operator === 'lt') return left < right;
            return left <= right;
        }
    }
};

const buildRowTemplate = (row: CsvRow): CsvRow =>
    Object.fromEntries(Object.keys(row).map(column => [column, null]));

const getMetricComponentTotal = (
    rows: CsvRow[],
    labelColumn: string,
    valueColumn: string,
    component: DeriveMetricComponent,
) => {
    const matchTerms = component.matchAny.map(term => term.toLowerCase());
    const matchedRows = rows.filter(row => {
        const labelValue = String(row[labelColumn] ?? '').trim().toLowerCase();
        return matchTerms.some(term => labelValue.includes(term));
    });
    if (matchedRows.length === 0) {
        return null;
    }

    return matchedRows.reduce<number>((total, row) => {
        const parsed = robustParseFloat(row[valueColumn] ?? null);
        if (parsed === null) {
            return total;
        }
        const value = component.valueTransform === 'absolute' ? Math.abs(parsed) : parsed;
        return component.operator === 'subtract' ? total - value : total + value;
    }, 0);
};

const evaluateDerivedMetricFormula = (
    rows: CsvRow[],
    labelColumn: string,
    valueColumn: string,
    formula: DeriveMetricByLabelFormula,
) => {
    if (formula.kind === 'linear_combination') {
        const totals = formula.components.map(component => getMetricComponentTotal(rows, labelColumn, valueColumn, component));
        return totals.some(total => total === null)
            ? null
            : totals.reduce((sum, total) => sum + (total ?? 0), 0);
    }

    const numeratorTotals = formula.numerator.map(component => getMetricComponentTotal(rows, labelColumn, valueColumn, component));
    const denominatorTotals = formula.denominator.map(component => getMetricComponentTotal(rows, labelColumn, valueColumn, component));
    if (numeratorTotals.some(total => total === null) || denominatorTotals.some(total => total === null)) {
        return null;
    }

    const numerator = numeratorTotals.reduce((sum, total) => sum + (total ?? 0), 0);
    const denominator = denominatorTotals.reduce((sum, total) => sum + (total ?? 0), 0);
    if (denominator === 0) {
        return null;
    }
    return numerator / denominator * (Number.isFinite(formula.scale) ? formula.scale : 1);
};

const appendDerivedMetricRows = (
    rows: CsvRow[],
    operation: Extract<DataOperation, { type: 'derive_metric_by_label' }>,
) => {
    assertColumnsExist(rows, [
        ...operation.groupByColumns,
        operation.labelColumn,
        operation.valueColumn,
        ...(operation.carryForwardColumns ?? []),
    ], operation);

    const groups = new Map<string, CsvRow[]>();
    rows.forEach(row => {
        const key = JSON.stringify(operation.groupByColumns.map(column => row[column] ?? null));
        const existing = groups.get(key);
        if (existing) {
            existing.push(row);
            return;
        }
        groups.set(key, [row]);
    });

    const derivedRows = [...groups.values()].flatMap(groupRows => {
        const computedValue = evaluateDerivedMetricFormula(
            groupRows,
            operation.labelColumn,
            operation.valueColumn,
            operation.formula,
        );
        if (computedValue === null) {
            return [];
        }

        const seedRow = groupRows[0] ?? {};
        const derivedRow = buildRowTemplate(seedRow);
        operation.groupByColumns.forEach(column => {
            derivedRow[column] = seedRow[column] ?? null;
        });
        (operation.carryForwardColumns ?? []).forEach(column => {
            derivedRow[column] = seedRow[column] ?? null;
        });
        if (Object.prototype.hasOwnProperty.call(derivedRow, 'RowClass')) {
            derivedRow.RowClass = 'derived_metric';
        }
        derivedRow[operation.labelColumn] = operation.outputMetricLabel;
        derivedRow[operation.valueColumn] = computedValue;
        return [derivedRow];
    });

    return [...rows, ...derivedRows];
};

const comparePredicateGroup = (row: CsvRow, group: FilterPredicateGroup): boolean =>
    Array.isArray(group.predicates) && group.predicates.every(predicate => comparePredicate(row, predicate));

export const normalizeFilterPredicate = (value: unknown): FilterPredicate | null => {
    if (!isRecord(value)) return null;
    const column = typeof value.column === 'string' ? value.column.trim() : '';
    const operator = typeof value.operator === 'string' ? value.operator : '';
    if (!column || !FILTER_OPERATORS.has(operator as FilterPredicate['operator'])) {
        return null;
    }
    const predicate: FilterPredicate = {
        column,
        operator: operator as FilterPredicate['operator'],
    };
    if ('value' in value) {
        predicate.value = value.value as FilterPredicate['value'];
    }
    return predicate;
};

export const normalizeFilterPredicateGroup = (value: unknown): FilterPredicateGroup | null => {
    if (!isRecord(value) || !Array.isArray(value.predicates)) return null;
    const predicates = value.predicates
        .map(normalizeFilterPredicate)
        .filter((predicate): predicate is FilterPredicate => Boolean(predicate));
    if (predicates.length === 0) {
        return null;
    }
    return { predicates };
};

const normalizeCastTargetType = (value: unknown): CastColumnOperation['targetType'] | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'number' || normalized === 'currency' || normalized === 'percentage' || normalized === 'date' || normalized === 'boolean' || normalized === 'string') {
        return normalized as CastColumnOperation['targetType'];
    }
    if (normalized === 'numerical' || normalized === 'numeric' || normalized === 'float' || normalized === 'double' || normalized === 'decimal' || normalized === 'int' || normalized === 'integer') {
        return 'number';
    }
    return null;
};

const normalizeRenameMappings = (value: unknown): { from: string; to: string }[] => {
    if (Array.isArray(value)) {
        return value
            .filter(isRecord)
            .map(mapping => {
                const from = typeof mapping.from === 'string' ? mapping.from.trim() : '';
                const to = typeof mapping.to === 'string' ? mapping.to.trim() : '';
                return from && to ? { from, to } : null;
            })
            .filter((mapping): mapping is { from: string; to: string } => Boolean(mapping));
    }
    if (isRecord(value)) {
        return Object.entries(value)
            .map(([from, to]) => typeof to === 'string' && from.trim() && to.trim() ? { from: from.trim(), to: to.trim() } : null)
            .filter((mapping): mapping is { from: string; to: string } => Boolean(mapping));
    }
    return [];
};

const parseLegacyFilterCondition = (condition: string): FilterPredicate[] | null => {
    const normalized = condition.trim();
    const notNullMatch = normalized.match(/^row\[['"](.+?)['"]\]\s*!==?\s*null\s*&&\s*row\[['"]\1['"]\]\s*!==?\s*['"]{2}$/i);
    if (notNullMatch) {
        return [{ column: notNullMatch[1], operator: 'not_null' }];
    }
    const comparisonMatch = normalized.match(/^row\[['"](.+?)['"]\]\s*(===|==|!==|!=|>=|<=|>|<)\s*(.+)$/);
    if (!comparisonMatch) {
        return null;
    }
    const [, column, operator, rawValue] = comparisonMatch;
    const valueText = rawValue.trim();
    const quotedValue = valueText.match(/^['"](.*)['"]$/);
    const parsedValue = quotedValue
        ? quotedValue[1]
        : (valueText === 'null' ? null : (Number.isNaN(Number(valueText)) ? valueText : Number(valueText)));

    switch (operator) {
        case '===':
        case '==':
            return [{ column, operator: parsedValue === null ? 'is_null' : 'eq', value: parsedValue === null ? undefined : parsedValue }];
        case '!==':
        case '!=':
            return [{ column, operator: parsedValue === null ? 'not_null' : 'neq', value: parsedValue === null ? undefined : parsedValue }];
        case '>':
            return [{ column, operator: 'gt', value: parsedValue }];
        case '>=':
            return [{ column, operator: 'gte', value: parsedValue }];
        case '<':
            return [{ column, operator: 'lt', value: parsedValue }];
        case '<=':
            return [{ column, operator: 'lte', value: parsedValue }];
        default:
            return null;
    }
};

export const normalizeDataOperation = (value: unknown): DataOperation | null => {
    return normalizeManifestDataOperation(value).operation;
};

export const coerceAiOperationShape = (
    value: unknown,
    explanation: string,
    index: number,
): unknown => {
    const flattenedValue = flattenOperationRecord(value);
    if (!flattenedValue) return value;

    const candidate: Record<string, unknown> = { ...flattenedValue };
    const rawType = typeof candidate.type === 'string' ? candidate.type.trim() : '';
    const rawId = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const rawReason = typeof candidate.reason === 'string' ? candidate.reason.trim() : '';
    const normalizedReplacements = normalizeReplaceValueReplacements(
        candidate.replacements
        ?? candidate.replacement
        ?? candidate.replacementMap
        ?? candidate.mapping
        ?? candidate.mappings,
    );
    const inferredReplacement = normalizedReplacements.length > 0
        ? normalizedReplacements
        : (() => {
            const from = normalizeString(
                candidate.from
                ?? candidate.search
                ?? candidate.find
                ?? candidate.oldValue,
            );
            const to = candidate.to
                ?? candidate.replaceWith
                ?? candidate.replacement
                ?? candidate.newValue;
            return from.trim().length > 0 && to !== undefined
                ? [{ from, to }]
                : null;
        })();

    if (inferredReplacement) {
        candidate.replacements = inferredReplacement;
    }

    if (!normalizeString(candidate.column ?? candidate.columnName ?? candidate.field)) {
        const inferredColumn = inferReplaceValueColumn(candidate.replacements);
        if (inferredColumn) {
            candidate.column = inferredColumn;
        }
    }

    const inferTypeByShape = (): string => {
        if (rawId && getDataOperationManifest(rawId)?.type) {
            return rawId;
        }
        if (typeof candidate.newColumn === 'string' && isRecord(candidate.expression)) {
            return 'derive_column';
        }
        if (Array.isArray(candidate.groupByColumns)
            && typeof candidate.labelColumn === 'string'
            && typeof candidate.valueColumn === 'string'
            && typeof candidate.outputMetricLabel === 'string'
            && isRecord(candidate.formula)) {
            return 'derive_metric_by_label';
        }
        if (Array.isArray(candidate.sourceColumns)
            && typeof candidate.keyColumn === 'string'
            && typeof candidate.valueColumn === 'string') {
            return 'unpivot_columns';
        }
        if (typeof candidate.column === 'string' && Array.isArray(candidate.targetColumns) && typeof candidate.delimiter === 'string') {
            return 'split_column';
        }
        if (typeof candidate.column === 'string' && candidate.targetType !== undefined) {
            return 'cast_column';
        }
        if (typeof candidate.column === 'string' && Array.isArray(candidate.replacements)) {
            return 'replace_values';
        }
        if (typeof candidate.column === 'string' && typeof candidate.strategy === 'string') {
            return 'fill_missing';
        }
        if (Number.isInteger(candidate.rowIndex)) {
            return 'promote_header_row';
        }
        if (Array.isArray(candidate.indices) && candidate.indices.length > 0) {
            return 'drop_rows_by_index';
        }
        if (Array.isArray(candidate.keyColumns) && typeof candidate.keep === 'string') {
            return 'dedupe_rows';
        }
        if (candidate.mappings !== undefined || (isRecord(candidate.columns) && !Array.isArray(candidate.columns))) {
            return 'rename_columns';
        }
        return '';
    };

    const inferredType = rawType || inferTypeByShape();

    if (!rawType && inferredType) {
        candidate.type = inferredType;
    }

    if (!rawId && inferredType) {
        candidate.id = `${inferredType}_${index + 1}`;
    }

    if (!rawReason && inferredType) {
        candidate.reason = explanation.trim() || `Execute ${inferredType}.`;
    }

    return candidate;
};

const applyFillMissing = (rows: CsvRow[], operation: FillMissingOperation): CsvRow[] => {
    let lastSeen: CsvCellValue = null;
    return rows.map(row => {
        const nextRow = { ...row };
        const current = nextRow[operation.column] ?? null;
        if (!isMissingValue(current)) {
            lastSeen = current;
            return nextRow;
        }
        if (operation.strategy === 'zero') {
            nextRow[operation.column] = 0;
        } else if (operation.strategy === 'constant') {
            nextRow[operation.column] = operation.value ?? null;
        } else if (operation.strategy === 'forward_fill') {
            nextRow[operation.column] = lastSeen;
        }
        return nextRow;
    });
};

const resolveFilterOperationClauses = (
    rows: CsvRow[],
    operation: {
        id: string;
        predicates?: FilterPredicate[];
        groups?: FilterPredicateGroup[];
    },
) => {
    const predicates = Array.isArray(operation.predicates)
        ? operation.predicates.filter(predicate => predicate && typeof predicate.column === 'string' && typeof predicate.operator === 'string')
        : [];
    const groups = Array.isArray(operation.groups)
        ? operation.groups
            .filter(group => group && Array.isArray(group.predicates))
            .map(group => ({
                predicates: group.predicates.filter(predicate => predicate && typeof predicate.column === 'string' && typeof predicate.operator === 'string'),
            }))
            .filter(group => group.predicates.length > 0)
        : [];
    assertColumnsExist(rows, [
        ...predicates.map(predicate => predicate.column),
        ...groups.flatMap(group => group.predicates.map(predicate => predicate.column)),
    ], operation as DataOperation);
    if (predicates.length === 0 && groups.length === 0) {
        throw new Error(`Operation "${operation.id}" must include valid predicates or groups.`);
    }
    return { predicates, groups };
};

const matchesFilterOperation = (
    row: CsvRow,
    clauses: ReturnType<typeof resolveFilterOperationClauses>,
) => {
    const hasPredicates = clauses.predicates.length > 0;
    const hasGroups = clauses.groups.length > 0;
    const predicateMatch = !hasPredicates
        || clauses.predicates.every(predicate => comparePredicate(row, predicate));
    const groupMatch = !hasGroups
        || clauses.groups.some(group => comparePredicateGroup(row, group));
    return predicateMatch && groupMatch;
};

const applyOperation = (rows: CsvRow[], operation: DataOperation): CsvRow[] => {
    const draft = cloneRows(rows);
    switch (operation.type) {
        case 'drop_rows_by_index': {
            const outOfBounds = operation.indices.filter(i => i < 0 || i >= draft.length);
            if (outOfBounds.length > 0) {
                console.warn(
                    `[DataOperationMutator] drop_rows_by_index: ${outOfBounds.length} of ${operation.indices.length} indices are out of bounds (dataset has ${draft.length} rows). Out-of-bounds: [${outOfBounds.join(', ')}].`,
                );
            }
            const toDrop = new Set(operation.indices);
            return draft.filter((_, index) => !toDrop.has(index));
        }
        case 'drop_rows_by_condition': {
            const clauses = resolveFilterOperationClauses(draft, operation);
            return draft.filter(row => !matchesFilterOperation(row, clauses));
        }
        case 'drop_blank_rows':
            return draft.filter(row => !isBlankRow(row));
        case 'promote_header_row': {
            if (operation.rowIndex >= draft.length) {
                throw new Error(`Operation "${operation.id}" references missing row index ${operation.rowIndex}.`);
            }
            const currentColumns = getColumns(draft);
            if (currentColumns.length === 0) {
                throw new Error(`Operation "${operation.id}" requires at least one existing column.`);
            }
            const headerRow = draft[operation.rowIndex];
            const promotedHeaders = uniquifyHeaders(
                currentColumns.map((column, index) => sanitizeHeaderName(headerRow[column] ?? null, column, index)),
            );
            return draft
                .filter((_, index) => index !== operation.rowIndex)
                .map(row => {
                    const nextRow: CsvRow = {};
                    currentColumns.forEach((column, index) => {
                        nextRow[promotedHeaders[index]] = row[column] ?? null;
                    });
                    return nextRow;
                });
        }
        case 'rename_columns':
            assertColumnsExist(draft, operation.mappings.map(mapping => mapping.from), operation);
            return draft.map(row => {
                const nextRow: CsvRow = {};
                Object.entries(row).forEach(([key, value]) => {
                    const mapping = operation.mappings.find(entry => entry.from.toLowerCase() === key.toLowerCase());
                    nextRow[mapping?.to ?? key] = value;
                });
                return nextRow;
            });
        case 'drop_columns':
            assertColumnsExist(draft, operation.columns, operation);
            return draft.map(row => {
                const nextRow = { ...row };
                operation.columns.forEach(column => {
                    delete nextRow[column];
                });
                return nextRow;
            });
        case 'trim_whitespace': {
            const columns = getOperationColumns(draft, operation.columns);
            assertColumnsExist(draft, columns, operation);
            return draft.map(row => {
                const nextRow = { ...row };
                columns.forEach(column => {
                    if (typeof nextRow[column] === 'string') {
                        nextRow[column] = nextRow[column]!.trim();
                    }
                });
                return nextRow;
            });
        }
        case 'normalize_empty_values': {
            const columns = getOperationColumns(draft, operation.columns);
            assertColumnsExist(draft, columns, operation);
            const markers = new Set((operation.emptyMarkers ?? DEFAULT_EMPTY_MARKERS).map(normalizeMarker));
            return draft.map(row => {
                const nextRow = { ...row };
                columns.forEach(column => {
                    if (typeof nextRow[column] === 'string' && markers.has(normalizeMarker(nextRow[column] as string))) {
                        nextRow[column] = null;
                    }
                });
                return nextRow;
            });
        }
        case 'replace_values':
            assertColumnsExist(draft, [operation.column], operation);
            return draft.map(row => {
                const nextRow = { ...row };
                const current = nextRow[operation.column];
                const replacement = operation.replacements.find(entry => {
                    if (current === null || current === undefined) return false;
                    if (operation.caseSensitive) {
                        return String(current) === entry.from;
                    }
                    return String(current).toLowerCase() === entry.from.toLowerCase();
                });
                if (replacement) {
                    nextRow[operation.column] = replacement.to;
                }
                return nextRow;
            });
        case 'cast_column':
            assertColumnsExist(draft, [operation.column], operation);
            return draft.map(row => ({
                ...row,
                [operation.column]: castValue(row[operation.column] ?? null, operation),
            }));
        case 'fill_missing':
            assertColumnsExist(draft, [operation.column], operation);
            return applyFillMissing(draft, operation);
        case 'dedupe_rows':
            assertColumnsExist(draft, operation.keyColumns, operation);
            return draft.filter((row, index, allRows) => {
                const key = operation.keyColumns.map(column => String(row[column] ?? '')).join('||');
                return allRows.findIndex(candidate =>
                    operation.keyColumns.every(column => String(candidate[column] ?? '') === String(row[column] ?? ''))
                ) === index && key.length >= 0;
            });
        case 'filter_rows':
            {
                const clauses = resolveFilterOperationClauses(draft, operation);
                return draft.filter(row => matchesFilterOperation(row, clauses));
            }
        case 'derive_column':
            return draft.map(row => ({
                ...row,
                [operation.newColumn]: deriveValue(row, operation.expression),
            }));
        case 'derive_metric_by_label':
            return appendDerivedMetricRows(draft, operation);
        case 'annotate_hierarchy': {
            const profile = detectReportShape({
                fileName: 'annotate-hierarchy.csv',
                data: draft,
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            });
            const rowRoleMap = new Map(profile.rowRoles.map(candidate => [candidate.rowIndex, candidate]));
            const hasHierarchySignals = profile.primaryKind === 'hierarchical_statement'
                || profile.rowRoles.some(candidate =>
                    ['group_header', 'subtotal', 'total'].includes(candidate.role),
                );
            if (!hasHierarchySignals) {
                throw new Error(`Operation "${operation.id}" requires a hierarchical statement shape.`);
            }

            const rowClassColumn = operation.rowClassColumn ?? DEFAULT_ROW_CLASS_COLUMN;
            const hierarchyDepthColumn = operation.hierarchyDepthColumn ?? DEFAULT_HIERARCHY_DEPTH_COLUMN;
            const sourceRowIndexColumn = operation.sourceRowIndexColumn ?? DEFAULT_SOURCE_ROW_INDEX_COLUMN;

            return draft.map((row, index) => {
                const role = rowRoleMap.get(index);
                return {
                    ...row,
                    [rowClassColumn]: role?.role ?? 'fact',
                    [hierarchyDepthColumn]: role?.depth ?? 0,
                    [sourceRowIndexColumn]: index,
                };
            });
        }
        case 'split_column':
            assertColumnsExist(draft, [operation.column], operation);
            return draft.map(row => {
                const nextRow = { ...row };
                const parts = String(row[operation.column] ?? '').split(operation.delimiter);
                operation.targetColumns.forEach((column, index) => {
                    nextRow[column] = parts[index]?.trim() ?? null;
                });
                return nextRow;
            });
        case 'unpivot_columns':
            assertColumnsExist(draft, operation.sourceColumns, operation);
            if (operation.keepColumns && operation.keepColumns.length > 0) {
                assertColumnsExist(draft, operation.keepColumns, operation);
            }
            if (operation.sourceColumns.some(column => SUMMARY_LABEL_PATTERN.test(column.trim()))) {
                throw new Error(`Operation "${operation.id}" cannot unpivot summary columns such as Total or Subtotal.`);
            }
            return draft.flatMap((row, rowIndex) => {
                const keepColumns = operation.keepColumns && operation.keepColumns.length > 0
                    ? operation.keepColumns
                    : Object.keys(row).filter(column => !operation.sourceColumns.includes(column));
                const labelColumns = normalizeUnpivotLabelColumns(operation);
                const labelMaps = labelColumns.map(labelColumn => ({
                    outputColumn: labelColumn.outputColumn,
                    map: new Map(labelColumn.mappings.map(mapping => [mapping.sourceColumn, mapping.label])),
                }));
                const rowClassMap = new Map((operation.rowClassMappings ?? []).map(mapping => [mapping.sourceRowIndex, mapping.rowClass]));
                const hierarchyDepthMap = new Map(
                    normalizeUnpivotHierarchyDepthMappings(operation).map(mapping => [mapping.sourceRowIndex, mapping.depth]),
                );
                return operation.sourceColumns.map(column => {
                    const nextRow: CsvRow = {};
                    keepColumns.forEach(keepColumn => {
                        nextRow[keepColumn] = row[keepColumn] ?? null;
                    });
                    nextRow[operation.keyColumn] = column;
                    nextRow[operation.valueColumn] = row[column] ?? null;
                    labelMaps.forEach(labelColumn => {
                        nextRow[labelColumn.outputColumn] = labelColumn.map.get(column) ?? null;
                    });
                    if (operation.sourceColumnNameColumn) {
                        nextRow[operation.sourceColumnNameColumn] = column;
                    }
                    if (operation.sourceRowIndexColumn) {
                        nextRow[operation.sourceRowIndexColumn] = rowIndex;
                    }
                    if (operation.rowClassColumn) {
                        nextRow[operation.rowClassColumn] = rowClassMap.get(rowIndex) ?? null;
                    }
                    if (operation.hierarchyDepthColumn) {
                        nextRow[operation.hierarchyDepthColumn] = hierarchyDepthMap.get(rowIndex) ?? null;
                    }
                    return nextRow;
                });
            });
    }
};

const verifyOperationOutput = (before: CsvRow[], after: CsvRow[], operation: DataOperation) => {
    if (!Array.isArray(after) || after.some(row => row === null || typeof row !== 'object' || Array.isArray(row))) {
        throw new Error(`Operation "${operation.id}" produced an invalid dataset shape.`);
    }
    const columns = getColumns(after);
    const seen = new Set<string>();
    columns.forEach(column => {
        const key = column.toLowerCase();
        if (seen.has(key)) {
            throw new Error(`Operation "${operation.id}" produced duplicate columns.`);
        }
        seen.add(key);
    });
    if (before.length < 0 || after.length < 0) {
        throw new Error(`Operation "${operation.id}" produced an invalid row count.`);
    }
    if (operation.type === 'unpivot_columns') {
        const keepColumns = operation.keepColumns && operation.keepColumns.length > 0
            ? operation.keepColumns
            : getColumns(before).filter(column => !operation.sourceColumns.includes(column));
        const beforeKeyCount = buildDistinctKeyCount(before, keepColumns);
        const afterKeyCount = buildDistinctKeyCount(after, keepColumns);
        if (afterKeyCount < beforeKeyCount) {
            throw new Error(`Operation "${operation.id}" reduced distinct keep-column combinations after unpivot.`);
        }
    }
};

export const applyDataOperations = (
    inputRows: CsvRow[],
    operations: DataOperation[],
    options?: { allowEmptyResult?: boolean },
): { data: CsvRow[]; logs: DataOperationExecutionLog[] } => {
    let currentRows = cloneRows(inputRows);
    const logs: DataOperationExecutionLog[] = [];

    operations.forEach(operation => {
        const beforeRows = cloneRows(currentRows);
        const beforeColumns = getColumns(beforeRows);
        try {
            const nextRows = applyOperation(beforeRows, operation);
            verifyOperationOutput(beforeRows, nextRows, operation);
            if (!options?.allowEmptyResult && nextRows.length === 0) {
                throw new Error(`Operation "${operation.id}" produced an empty dataset.`);
            }
            currentRows = nextRows;
            logs.push({
                operationId: operation.id,
                operationType: operation.type,
                reason: operation.reason,
                status: 'done',
                rowCountBefore: beforeRows.length,
                rowCountAfter: nextRows.length,
                columnCountBefore: beforeColumns.length,
                columnCountAfter: getColumns(nextRows).length,
            });
        } catch (error) {
            logs.push({
                operationId: operation.id,
                operationType: operation.type,
                reason: operation.reason,
                status: 'error',
                rowCountBefore: beforeRows.length,
                rowCountAfter: beforeRows.length,
                columnCountBefore: beforeColumns.length,
                columnCountAfter: beforeColumns.length,
                detail: {
                    error: error instanceof Error ? error.message : String(error),
                },
            });
            throw error;
        }
    });

    return {
        data: currentRows,
        logs,
    };
};

export const applySpreadsheetFilterOperation = (
    inputRows: CsvRow[],
    operation: DataOperation,
): { data: CsvRow[]; logs: DataOperationExecutionLog[] } =>
    applyDataOperations(inputRows, [operation], { allowEmptyResult: true });
