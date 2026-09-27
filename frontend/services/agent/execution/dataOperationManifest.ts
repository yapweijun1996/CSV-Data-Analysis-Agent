import type {
    CastColumnOperation,
    CsvCellValue,
    DataOperation,
    DataOperationManifest,
    DataOperationType,
    DeriveColumnOperation,
    DeriveExpression,
    DeriveMetricComponent,
    DeriveMetricByLabelOperation,
    DeriveMetricByLabelFormula,
    DeriveOperand,
    DropRowsByConditionOperation,
    FilterPredicate,
    FilterPredicateGroup,
    FillMissingOperation,
    RenameColumnsOperation,
} from '../../../types';
import {
    createOperationSchema,
    deriveOperandSchema,
    derivedMetricDeclarationSchema,
    deriveMetricByLabelFormulaSchema,
    dropRowsByConditionOperationSchema,
    filterRowsOperationSchema,
    unpivotHierarchyDepthMappingSchema,
    unpivotLabelColumnSchema,
    unpivotLabelMappingSchema,
    unpivotRowClassMappingSchema,
} from './dataOperationSchemas';
import {
    flattenOperationRecord,
    inferReplaceValueColumn,
    isRecordLike as isRecord,
    normalizeCastTargetType,
    normalizeFilterPredicate,
    normalizeFilterPredicateGroup,
    normalizeReplaceValueReplacements,
    normalizeRenameMappings,
    normalizeString,
    parseLegacyFilterCondition,
} from './dataOperationNormalization';
import {
    normalizeUnpivotHierarchyDepthMappings,
    normalizeUnpivotLabelColumns,
} from './unpivotOperationUtils';
import { buildDerivedMetricDeclaration } from './derivedMetricDeclaration';

const normalizeDeriveOperand = (value: unknown): DeriveOperand | null => {
    if (!isRecord(value)) return null;
    if (normalizeString(value.kind) === 'column') {
        const column = normalizeString(value.column);
        return column ? { kind: 'column', column } : null;
    }
    if (normalizeString(value.kind) === 'literal' && Object.prototype.hasOwnProperty.call(value, 'value')) {
        return { kind: 'literal', value: value.value as CsvCellValue };
    }
    return null;
};

const normalizeDeriveExpression = (value: unknown): DeriveExpression | null => {
    if (!isRecord(value)) return null;
    const kind = normalizeString(value.kind);
    if (kind === 'copy') {
        const source = normalizeDeriveOperand(value.source);
        return source ? { kind, source } : null;
    }
    if (kind === 'concat') {
        const parts = Array.isArray(value.parts)
            ? value.parts.map(normalizeDeriveOperand).filter((part): part is DeriveOperand => Boolean(part))
            : [];
        return parts.length > 0
            ? { kind, parts, ...(typeof value.separator === 'string' ? { separator: value.separator } : {}) }
            : null;
    }
    if (kind === 'ratio') {
        const numerator = normalizeDeriveOperand(value.numerator);
        const denominator = normalizeDeriveOperand(value.denominator);
        return numerator && denominator ? { kind, numerator, denominator } : null;
    }
    if (kind === 'math_binary') {
        const operator = normalizeString(value.operator);
        const left = normalizeDeriveOperand(value.left);
        const right = normalizeDeriveOperand(value.right);
        if (!left || !right || !['add', 'subtract', 'multiply', 'divide'].includes(operator)) {
            return null;
        }
        return {
            kind,
            operator: operator as Extract<DeriveExpression, { kind: 'math_binary' }>['operator'],
            left,
            right,
        };
    }
    return null;
};

const operationManifests: DataOperationManifest[] = [
    {
        type: 'drop_rows_by_index',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('drop_rows_by_index', { indices: { type: 'array', items: { type: 'integer' } } }, ['indices']),
        requiredFields: ['id', 'type', 'reason', 'indices'],
        summarize: () => 'drop_rows_by_index requires indices',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const indices = Array.isArray(value.indices) ? value.indices.map(Number).filter(index => Number.isInteger(index) && index >= 0) : [];
            return id && reason && indices.length > 0
                ? { operation: { id, reason, type: 'drop_rows_by_index', indices }, errors: [] }
                : { operation: null, errors: ['drop_rows_by_index requires id, reason, and at least one valid index.'] };
        },
    },
    {
        type: 'drop_blank_rows',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('drop_blank_rows', {}, []),
        requiredFields: ['id', 'type', 'reason'],
        summarize: () => 'drop_blank_rows removes empty rows',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            return id && reason
                ? { operation: { id, reason, type: 'drop_blank_rows' }, errors: [] }
                : { operation: null, errors: ['drop_blank_rows requires id and reason.'] };
        },
    },
    {
        type: 'drop_rows_by_condition',
        stages: ['cleaning', 'analysis'],
        schema: dropRowsByConditionOperationSchema,
        requiredFields: ['id', 'type', 'reason', 'predicates/groups'],
        summarize: () => 'drop_rows_by_condition requires predicates[] or groups[]',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const predicates = Array.isArray(value.predicates)
                ? value.predicates.map(normalizeFilterPredicate).filter((predicate): predicate is FilterPredicate => Boolean(predicate))
                : (typeof value.condition === 'string' ? parseLegacyFilterCondition(value.condition) ?? undefined : undefined);
            const groups = Array.isArray(value.groups)
                ? value.groups.map(normalizeFilterPredicateGroup).filter((group): group is FilterPredicateGroup => Boolean(group))
                : undefined;
            return id && reason && ((predicates?.length ?? 0) > 0 || (groups?.length ?? 0) > 0)
                ? { operation: { id, reason, type: 'drop_rows_by_condition', ...(predicates?.length ? { predicates } : {}), ...(groups?.length ? { groups } : {}) } as DropRowsByConditionOperation, errors: [] }
                : { operation: null, errors: ['drop_rows_by_condition requires id, reason, and predicates[] or groups[].'] };
        },
    },
    {
        type: 'promote_header_row',
        stages: ['cleaning'],
        schema: createOperationSchema('promote_header_row', { rowIndex: { type: 'integer' } }, ['rowIndex']),
        requiredFields: ['id', 'type', 'reason', 'rowIndex'],
        summarize: () => 'promote_header_row requires rowIndex',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const rowIndex = Number(value.rowIndex);
            return id && reason && Number.isInteger(rowIndex) && rowIndex >= 0
                ? { operation: { id, reason, type: 'promote_header_row', rowIndex }, errors: [] }
                : { operation: null, errors: ['promote_header_row requires id, reason, and a non-negative rowIndex.'] };
        },
    },
    {
        type: 'rename_columns',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('rename_columns', { mappings: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } } }, ['mappings']),
        requiredFields: ['id', 'type', 'reason', 'mappings'],
        summarize: () => 'rename_columns requires mappings[]',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const mappings = normalizeRenameMappings(value.mappings ?? value.columns);
            return id && reason && mappings.length > 0
                ? { operation: { id, reason, type: 'rename_columns', mappings }, errors: [] }
                : { operation: null, errors: ['rename_columns requires id, reason, and mappings[].'] };
        },
    },
    {
        type: 'drop_columns',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('drop_columns', { columns: { type: 'array', items: { type: 'string' } } }, ['columns']),
        requiredFields: ['id', 'type', 'reason', 'columns'],
        summarize: () => 'drop_columns requires columns[]',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const columns = Array.isArray(value.columns) ? value.columns.map(normalizeString).filter(Boolean) : [];
            return id && reason && columns.length > 0
                ? { operation: { id, reason, type: 'drop_columns', columns }, errors: [] }
                : { operation: null, errors: ['drop_columns requires id, reason, and columns[].'] };
        },
    },
    {
        type: 'trim_whitespace',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('trim_whitespace', { columns: { anyOf: [{ type: 'string', enum: ['*'] }, { type: 'array', items: { type: 'string' } }] } }, ['columns']),
        requiredFields: ['id', 'type', 'reason', 'columns'],
        summarize: () => 'trim_whitespace requires columns or "*"',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const columns = value.columns === '*' || Array.isArray(value.columns) ? value.columns as string[] | '*' : '*';
            return id && reason ? { operation: { ...(value as any), id, reason, type: 'trim_whitespace', columns }, errors: [] } : { operation: null, errors: ['trim_whitespace requires id and reason.'] };
        },
    },
    {
        type: 'normalize_empty_values',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('normalize_empty_values', { columns: { anyOf: [{ type: 'string', enum: ['*'] }, { type: 'array', items: { type: 'string' } }] }, emptyMarkers: { type: 'array', items: { type: 'string' } } }, ['columns']),
        requiredFields: ['id', 'type', 'reason', 'columns'],
        summarize: () => 'normalize_empty_values requires columns or "*"',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const columns = value.columns === '*' || Array.isArray(value.columns) ? value.columns as string[] | '*' : '*';
            return id && reason ? { operation: { ...(value as any), id, reason, type: 'normalize_empty_values', columns }, errors: [] } : { operation: null, errors: ['normalize_empty_values requires id and reason.'] };
        },
    },
    {
        type: 'replace_values',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('replace_values', { column: { type: 'string' }, caseSensitive: { type: 'boolean' }, replacements: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, to: {} }, required: ['from', 'to'] } } }, ['column', 'replacements']),
        requiredFields: ['id', 'type', 'reason', 'column', 'replacements'],
        summarize: () => 'replace_values requires column and replacements[]',
        normalize: value => {
            const candidate = flattenOperationRecord(value);
            if (!candidate) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(candidate.id);
            const reason = normalizeString(candidate.reason);
            const replacements = normalizeReplaceValueReplacements(
                candidate.replacements
                ?? candidate.replacement
                ?? candidate.replacementMap
                ?? candidate.mapping
                ?? candidate.mappings,
            );
            const column = normalizeString(candidate.column ?? candidate.columnName ?? candidate.field)
                || inferReplaceValueColumn(candidate.replacements ?? candidate.replacement);
            return id && reason && column && replacements.length > 0
                ? { operation: { ...(candidate as any), id, reason, type: 'replace_values', column, replacements }, errors: [] }
                : { operation: null, errors: ['replace_values requires id, reason, column, and replacements[].'] };
        },
    },
    {
        type: 'cast_column',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('cast_column', { column: { type: 'string' }, targetType: { type: 'string', enum: ['number', 'currency', 'percentage', 'date', 'boolean', 'string'] } }, ['column', 'targetType']),
        requiredFields: ['id', 'type', 'reason', 'column', 'targetType'],
        summarize: () => 'cast_column requires column and targetType',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const column = normalizeString(value.column);
            const targetType = normalizeCastTargetType(value.targetType);
            return id && reason && column && targetType ? { operation: { ...(value as any), id, reason, type: 'cast_column', column, targetType }, errors: [] } : { operation: null, errors: ['cast_column requires id, reason, column, and targetType.'] };
        },
    },
    {
        type: 'fill_missing',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('fill_missing', { column: { type: 'string' }, strategy: { type: 'string', enum: ['constant', 'forward_fill', 'zero'] }, value: {} }, ['column', 'strategy']),
        requiredFields: ['id', 'type', 'reason', 'column', 'strategy'],
        summarize: () => 'fill_missing requires column and strategy',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const column = normalizeString(value.column);
            const strategy = normalizeString(value.strategy) as FillMissingOperation['strategy'];
            return id && reason && column && ['constant', 'forward_fill', 'zero'].includes(strategy) ? { operation: { ...(value as any), id, reason, type: 'fill_missing', column, strategy }, errors: [] } : { operation: null, errors: ['fill_missing requires id, reason, column, and strategy.'] };
        },
    },
    {
        type: 'dedupe_rows',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('dedupe_rows', { keyColumns: { type: 'array', items: { type: 'string' } }, keep: { type: 'string', enum: ['first'] } }, ['keyColumns', 'keep']),
        requiredFields: ['id', 'type', 'reason', 'keyColumns', 'keep'],
        summarize: () => 'dedupe_rows requires keyColumns and keep',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const keyColumns = Array.isArray(value.keyColumns) ? value.keyColumns.map(normalizeString).filter(Boolean) : [];
            const keep = normalizeString(value.keep);
            return id && reason && keyColumns.length > 0 && keep === 'first' ? { operation: { id, reason, type: 'dedupe_rows', keyColumns, keep: 'first' }, errors: [] } : { operation: null, errors: ['dedupe_rows requires id, reason, keyColumns, and keep="first".'] };
        },
    },
    {
        type: 'filter_rows',
        stages: ['cleaning', 'analysis'],
        schema: filterRowsOperationSchema,
        requiredFields: ['id', 'type', 'reason', 'predicates/groups'],
        summarize: () => 'filter_rows requires predicates[] or groups[]',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const predicates = Array.isArray(value.predicates)
                ? value.predicates.map(normalizeFilterPredicate).filter((predicate): predicate is FilterPredicate => Boolean(predicate))
                : (typeof value.condition === 'string' ? parseLegacyFilterCondition(value.condition) ?? undefined : undefined);
            const groups = Array.isArray(value.groups)
                ? value.groups.map(normalizeFilterPredicateGroup).filter((group): group is FilterPredicateGroup => Boolean(group))
                : undefined;
            return id && reason && ((predicates?.length ?? 0) > 0 || (groups?.length ?? 0) > 0)
                ? { operation: { id, reason, type: 'filter_rows', ...(predicates?.length ? { predicates } : {}), ...(groups?.length ? { groups } : {}) }, errors: [] }
                : { operation: null, errors: ['filter_rows requires id, reason, and predicates[] or groups[].'] };
        },
    },
    {
        type: 'derive_column',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('derive_column', {
            newColumn: { type: 'string' },
            expression: { type: 'object', properties: { kind: { type: 'string', enum: ['copy', 'math_binary', 'ratio', 'concat'] }, source: deriveOperandSchema, left: deriveOperandSchema, right: deriveOperandSchema, numerator: deriveOperandSchema, denominator: deriveOperandSchema, parts: { type: 'array', items: deriveOperandSchema }, separator: { type: 'string' }, operator: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] } }, required: ['kind'] },
            declaration: derivedMetricDeclarationSchema,
            validationMode: { type: 'string', enum: ['strict', 'warn'] },
        }, ['newColumn', 'expression']),
        requiredFields: ['id', 'type', 'reason', 'newColumn', 'expression'],
        summarize: () => 'derive_column requires newColumn and expression',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const newColumn = normalizeString(value.newColumn);
            const expression = normalizeDeriveExpression(value.expression);
            if (!id || !reason || !newColumn || !expression) {
                return { operation: null, errors: ['derive_column requires id, reason, newColumn, and expression.'] };
            }
            const normalized = {
                ...(value as any),
                id,
                reason,
                type: 'derive_column',
                newColumn,
                expression,
                validationMode: normalizeString(value.validationMode) === 'warn' ? 'warn' : 'strict',
            } as DeriveColumnOperation;
            return {
                operation: {
                    ...normalized,
                    declaration: buildDerivedMetricDeclaration(normalized),
                },
                errors: [],
            };
        },
    },
    {
        type: 'derive_metric_by_label',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('derive_metric_by_label', {
            groupByColumns: { type: 'array', items: { type: 'string' } },
            labelColumn: { type: 'string' },
            valueColumn: { type: 'string' },
            outputMetricLabel: { type: 'string' },
            carryForwardColumns: { type: 'array', items: { type: 'string' } },
            formula: deriveMetricByLabelFormulaSchema,
            metricName: { type: 'string' },
            expectedInputs: { type: 'array', items: { type: 'string' } },
            validationMode: { type: 'string', enum: ['strict', 'warn'] },
            declaration: derivedMetricDeclarationSchema,
        }, ['groupByColumns', 'labelColumn', 'valueColumn', 'outputMetricLabel', 'formula']),
        requiredFields: ['id', 'type', 'reason', 'groupByColumns', 'labelColumn', 'valueColumn', 'outputMetricLabel', 'formula'],
        summarize: () => 'derive_metric_by_label requires groupByColumns, labelColumn, valueColumn, outputMetricLabel, and a linear_combination or ratio formula',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const groupByColumns = Array.isArray(value.groupByColumns) ? value.groupByColumns.map(normalizeString).filter(Boolean) : [];
            const labelColumn = normalizeString(value.labelColumn);
            const valueColumn = normalizeString(value.valueColumn);
            const outputMetricLabel = normalizeString(value.outputMetricLabel);
            const carryForwardColumns = Array.isArray(value.carryForwardColumns) ? value.carryForwardColumns.map(normalizeString).filter(Boolean) : undefined;
            const rawFormula = isRecord(value.formula) ? value.formula : null;

            if (!id || !reason || groupByColumns.length === 0 || !labelColumn || !valueColumn || !outputMetricLabel || !rawFormula) {
                return { operation: null, errors: ['derive_metric_by_label requires id, reason, groupByColumns, labelColumn, valueColumn, outputMetricLabel, and formula.'] };
            }
            if (labelColumn.toLowerCase() === valueColumn.toLowerCase()) {
                return { operation: null, errors: ['derive_metric_by_label must use different labelColumn and valueColumn fields.'] };
            }
            if (groupByColumns.some(column => column.toLowerCase() === labelColumn.toLowerCase())) {
                return { operation: null, errors: ['derive_metric_by_label groupByColumns must not include labelColumn.'] };
            }

            const normalizeComponents = (components: unknown): DeriveMetricComponent[] => Array.isArray(components)
                ? components
                    .filter(isRecord)
                    .map(component => ({
                        operator: normalizeString(component.operator) === 'subtract' ? 'subtract' : 'add',
                        matchAny: Array.isArray(component.matchAny) ? component.matchAny.map(normalizeString).filter(Boolean) : [],
                        valueTransform: normalizeString(component.valueTransform) === 'absolute' ? 'absolute' : 'raw',
                    } satisfies DeriveMetricComponent))
                    .filter(component => component.matchAny.length > 0)
                : [];

            let formula: DeriveMetricByLabelFormula | null = null;
            if (normalizeString(rawFormula.kind) === 'linear_combination') {
                const components = normalizeComponents(rawFormula.components);
                if (components.length === 0) {
                    return { operation: null, errors: ['derive_metric_by_label linear_combination requires at least one formula component with matchAny labels.'] };
                }
                formula = { kind: 'linear_combination', components };
            } else if (normalizeString(rawFormula.kind) === 'ratio') {
                const numerator = normalizeComponents(rawFormula.numerator);
                const denominator = normalizeComponents(rawFormula.denominator);
                if (numerator.length === 0 || denominator.length === 0) {
                    return { operation: null, errors: ['derive_metric_by_label ratio requires numerator and denominator components with matchAny labels.'] };
                }
                const scale = Number(rawFormula.scale);
                formula = {
                    kind: 'ratio',
                    numerator,
                    denominator,
                    ...(Number.isFinite(scale) ? { scale } : {}),
                };
            }

            if (!formula) {
                return { operation: null, errors: ['derive_metric_by_label formula.kind must be "linear_combination" or "ratio".'] };
            }

            const normalized: DeriveMetricByLabelOperation = {
                    id,
                    reason,
                    type: 'derive_metric_by_label',
                    groupByColumns,
                    labelColumn,
                    valueColumn,
                    outputMetricLabel,
                    ...(carryForwardColumns?.length ? { carryForwardColumns } : {}),
                    formula,
                    ...(normalizeString(value.metricName) ? { metricName: normalizeString(value.metricName) } : {}),
                    ...(Array.isArray(value.expectedInputs)
                        ? { expectedInputs: value.expectedInputs.map(normalizeString).filter(Boolean) }
                        : {}),
                    validationMode: normalizeString(value.validationMode) === 'warn' ? 'warn' : 'strict',
                };
            return {
                operation: {
                    ...normalized,
                    declaration: buildDerivedMetricDeclaration({
                        ...normalized,
                        declaration: isRecord(value.declaration)
                            ? value.declaration as DeriveMetricByLabelOperation['declaration']
                            : undefined,
                    }),
                },
                errors: [],
            };
        },
    },
    {
        type: 'annotate_hierarchy',
        stages: ['cleaning'],
        schema: createOperationSchema('annotate_hierarchy', {
            rowClassColumn: { type: 'string' },
            hierarchyDepthColumn: { type: 'string' },
            sourceRowIndexColumn: { type: 'string' },
        }, []),
        requiredFields: ['id', 'type', 'reason'],
        summarize: () => 'annotate_hierarchy adds row class, hierarchy depth, and source row index columns for hierarchical statements',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const rowClassColumn = normalizeString(value.rowClassColumn);
            const hierarchyDepthColumn = normalizeString(value.hierarchyDepthColumn);
            const sourceRowIndexColumn = normalizeString(value.sourceRowIndexColumn);
            return id && reason
                ? {
                    operation: {
                        id,
                        reason,
                        type: 'annotate_hierarchy',
                        ...(rowClassColumn ? { rowClassColumn } : {}),
                        ...(hierarchyDepthColumn ? { hierarchyDepthColumn } : {}),
                        ...(sourceRowIndexColumn ? { sourceRowIndexColumn } : {}),
                    },
                    errors: [],
                }
                : { operation: null, errors: ['annotate_hierarchy requires id and reason.'] };
        },
    },
    {
        type: 'split_column',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('split_column', { column: { type: 'string' }, delimiter: { type: 'string' }, targetColumns: { type: 'array', items: { type: 'string' } } }, ['column', 'delimiter', 'targetColumns']),
        requiredFields: ['id', 'type', 'reason', 'column', 'delimiter', 'targetColumns'],
        summarize: () => 'split_column requires column, delimiter, and targetColumns',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const column = normalizeString(value.column);
            const delimiter = typeof value.delimiter === 'string' ? value.delimiter : '';
            const targetColumns = Array.isArray(value.targetColumns) ? value.targetColumns.map(normalizeString).filter(Boolean) : [];
            return id && reason && column && delimiter && targetColumns.length > 0 ? { operation: { id, reason, type: 'split_column', column, delimiter, targetColumns }, errors: [] } : { operation: null, errors: ['split_column requires id, reason, column, delimiter, and targetColumns.'] };
        },
    },
    {
        type: 'unpivot_columns',
        stages: ['cleaning', 'analysis'],
        schema: createOperationSchema('unpivot_columns', {
            sourceColumns: { type: 'array', items: { type: 'string' } },
            keyColumn: { type: 'string' },
            valueColumn: { type: 'string' },
            keepColumns: { type: 'array', items: { type: 'string' } },
            labelColumn: { type: 'string' },
            labelMappings: { type: 'array', items: unpivotLabelMappingSchema },
            labelColumns: { type: 'array', items: unpivotLabelColumnSchema },
            sourceColumnNameColumn: { type: 'string' },
            sourceRowIndexColumn: { type: 'string' },
            rowClassColumn: { type: 'string' },
            rowClassMappings: { type: 'array', items: unpivotRowClassMappingSchema },
            hierarchyDepthColumn: { type: 'string' },
            hierarchyDepthMappings: { type: 'array', items: unpivotHierarchyDepthMappingSchema },
        }, ['sourceColumns', 'keyColumn', 'valueColumn']),
        requiredFields: ['id', 'type', 'reason', 'sourceColumns', 'keyColumn', 'valueColumn'],
        summarize: () => 'unpivot_columns requires sourceColumns, keyColumn, and valueColumn; optional multi-label, source coordinate, row class, and hierarchy depth fields preserve report semantics',
        normalize: value => {
            if (!isRecord(value)) return { operation: null, errors: ['Operation must be an object.'] };
            const id = normalizeString(value.id);
            const reason = normalizeString(value.reason);
            const sourceColumns = Array.isArray(value.sourceColumns) ? value.sourceColumns.map(normalizeString).filter(Boolean) : [];
            const keyColumn = normalizeString(value.keyColumn);
            const valueColumn = normalizeString(value.valueColumn);
            const keepColumns = Array.isArray(value.keepColumns) ? value.keepColumns.map(normalizeString).filter(Boolean) : undefined;
            const labelColumn = normalizeString(value.labelColumn);
            const labelMappings = Array.isArray(value.labelMappings)
                ? value.labelMappings
                    .filter(item => isRecord(item))
                    .map(item => ({
                        sourceColumn: normalizeString(item.sourceColumn),
                        label: item.label ?? null,
                    }))
                    .filter(item => item.sourceColumn)
                : undefined;
            const labelColumns = normalizeUnpivotLabelColumns({
                labelColumn,
                labelMappings,
                labelColumns: Array.isArray(value.labelColumns)
                    ? value.labelColumns
                        .filter(item => isRecord(item))
                        .map(item => ({
                            outputColumn: normalizeString(item.outputColumn),
                            mappings: Array.isArray(item.mappings)
                                ? item.mappings
                                    .filter(entry => isRecord(entry))
                                    .map(entry => ({
                                        sourceColumn: normalizeString(entry.sourceColumn),
                                        label: entry.label ?? null,
                                    }))
                                    .filter(entry => entry.sourceColumn)
                                : [],
                        }))
                    : undefined,
            });
            const sourceColumnNameColumn = normalizeString(value.sourceColumnNameColumn);
            const sourceRowIndexColumn = normalizeString(value.sourceRowIndexColumn);
            const rowClassColumn = normalizeString(value.rowClassColumn);
            const rowClassMappings = Array.isArray(value.rowClassMappings)
                ? value.rowClassMappings
                    .filter(item => isRecord(item))
                    .map(item => ({
                        sourceRowIndex: Number(item.sourceRowIndex),
                        rowClass: normalizeString(item.rowClass),
                    }))
                    .filter(item => Number.isInteger(item.sourceRowIndex) && item.sourceRowIndex >= 0 && item.rowClass)
                : undefined;
            const hierarchyDepthColumn = normalizeString(value.hierarchyDepthColumn);
            const hierarchyDepthMappings = normalizeUnpivotHierarchyDepthMappings({
                hierarchyDepthMappings: Array.isArray(value.hierarchyDepthMappings)
                    ? value.hierarchyDepthMappings
                        .filter(item => isRecord(item))
                        .map(item => ({
                            sourceRowIndex: Number(item.sourceRowIndex),
                            depth: Number(item.depth),
                        }))
                    : undefined,
            });
            return id && reason && sourceColumns.length > 0 && keyColumn && valueColumn
                ? {
                    operation: {
                        id,
                        reason,
                        type: 'unpivot_columns',
                        sourceColumns,
                        keyColumn,
                        valueColumn,
                        ...(keepColumns?.length ? { keepColumns } : {}),
                        ...(labelColumn ? { labelColumn } : {}),
                        ...(labelMappings?.length ? { labelMappings } : {}),
                        ...(labelColumns.length > 0 ? { labelColumns } : {}),
                        ...(sourceColumnNameColumn ? { sourceColumnNameColumn } : {}),
                        ...(sourceRowIndexColumn ? { sourceRowIndexColumn } : {}),
                        ...(rowClassColumn ? { rowClassColumn } : {}),
                        ...(rowClassMappings?.length ? { rowClassMappings } : {}),
                        ...(hierarchyDepthColumn ? { hierarchyDepthColumn } : {}),
                        ...(hierarchyDepthMappings.length > 0 ? { hierarchyDepthMappings } : {}),
                    },
                    errors: [],
                }
                : { operation: null, errors: ['unpivot_columns requires id, reason, sourceColumns, keyColumn, and valueColumn.'] };
        },
    },
];

const operationManifestMap = new Map<DataOperationType, DataOperationManifest>(
    operationManifests.map(manifest => [manifest.type, manifest]),
);

export const getDataOperationManifest = (type: string) =>
    operationManifestMap.get(type as DataOperationType) ?? null;

export const getDataOperationSchema = () => ({
    anyOf: operationManifests.map(manifest => manifest.schema),
});

export const getDataOperationSchemaForTypes = (types: DataOperationType[]) => ({
    anyOf: operationManifests
        .filter(manifest => types.includes(manifest.type))
        .map(manifest => manifest.schema),
});

export const getOperationContractSummary = (stages?: Array<'cleaning' | 'analysis'>) =>
    operationManifests
        .filter(manifest => !stages || manifest.stages.some(stage => stages.includes(stage)))
        .map(manifest => `${manifest.type}: ${manifest.summarize()}`);

export const normalizeDataOperation = (value: unknown) => {
    const candidate = flattenOperationRecord(value);
    if (!candidate) return { operation: null, errors: ['Operation must be an object.'] };
    const type = normalizeString(candidate.type);
    const manifest = getDataOperationManifest(type);
    if (!manifest) {
        return { operation: null, errors: [`Unsupported data operation type "${type || 'unknown'}".`] };
    }
    return manifest.normalize(candidate);
};
