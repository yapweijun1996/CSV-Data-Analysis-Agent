import type { ColumnProfile, DataPreparationPlan, DataOperation, CsvData, FilterPredicate, DeriveOperand } from '../../types';
import { truncateContextText } from './contextManager';
import {
    normalizeColumnName,
    normalizeCellValue,
    MUTATION_CLAIM_PATTERN,
    RETRY_EXAMPLE_LIMIT,
    RETRY_DETAIL_MAX_CHARS,
    WIDE_TABLE_VALUE_CAST_ORDER_ERROR,
} from './dataPreparerConstants';
import { buildColumnTypeLookup } from './deterministicNormalizer';

export const alignSchemaOnlyOutputColumns = (baselineColumns: ColumnProfile[], outputColumns: ColumnProfile[]) => {
    const outputLookup = new Map(
        outputColumns.map(column => [normalizeColumnName(column.name), column] as const),
    );

    return baselineColumns.map(column => {
        const candidate = outputLookup.get(normalizeColumnName(column.name));
        return candidate
            ? {
                ...column,
                ...candidate,
                name: column.name,
            }
            : column;
    });
};

const buildHeaderLayerAliasMap = (
    baselineColumns: ColumnProfile[],
    sourceData?: CsvData | null,
) => {
    const aliasMap = new Map<string, string>();
    const columnNames = baselineColumns.map(column => column.name);
    const headerLayers = sourceData?.headerLayers ?? [];

    headerLayers.forEach(layer => {
        layer.forEach((rawLabel, index) => {
            const actualColumnName = columnNames[index];
            const alias = normalizeCellValue(rawLabel);
            if (!actualColumnName || alias.length === 0) {
                return;
            }

            const normalizedAlias = normalizeColumnName(alias);
            const normalizedActual = normalizeColumnName(actualColumnName);
            if (normalizedAlias === normalizedActual || aliasMap.has(normalizedAlias)) {
                return;
            }

            aliasMap.set(normalizedAlias, actualColumnName);
        });
    });

    return aliasMap;
};

const rewriteFilterPredicateColumns = (
    predicates: FilterPredicate[] | undefined,
    resolveColumnName: (columnName: string) => string,
): FilterPredicate[] | undefined => predicates?.map(predicate => ({
    ...predicate,
    column: resolveColumnName(predicate.column),
}));

const rewriteDeriveOperand = (
    operand: DeriveOperand,
    resolveColumnName: (columnName: string) => string,
): DeriveOperand => operand.kind === 'column'
    ? { ...operand, column: resolveColumnName(operand.column) }
    : operand;

const rewriteOperationColumnAliases = (
    operation: DataOperation,
    resolveColumnName: (columnName: string) => string,
): DataOperation => {
    switch (operation.type) {
        case 'rename_columns':
            return {
                ...operation,
                mappings: operation.mappings.map(mapping => ({
                    ...mapping,
                    from: resolveColumnName(mapping.from),
                })),
            };
        case 'drop_columns':
            return {
                ...operation,
                columns: operation.columns.map(resolveColumnName),
            };
        case 'trim_whitespace':
        case 'normalize_empty_values':
            return {
                ...operation,
                columns: operation.columns === '*'
                    ? '*'
                    : operation.columns.map(resolveColumnName),
            };
        case 'replace_values':
        case 'cast_column':
        case 'fill_missing':
        case 'split_column':
            return {
                ...operation,
                column: resolveColumnName(operation.column),
            };
        case 'dedupe_rows':
            return {
                ...operation,
                keyColumns: operation.keyColumns.map(resolveColumnName),
            };
        case 'filter_rows':
        case 'drop_rows_by_condition':
            return {
                ...operation,
                predicates: rewriteFilterPredicateColumns(operation.predicates, resolveColumnName),
                groups: operation.groups?.map(group => ({
                    ...group,
                    predicates: rewriteFilterPredicateColumns(group.predicates, resolveColumnName) ?? [],
                })),
            };
        case 'derive_column':
            return {
                ...operation,
                expression: operation.expression.kind === 'copy'
                    ? {
                        ...operation.expression,
                        source: rewriteDeriveOperand(operation.expression.source, resolveColumnName),
                    }
                    : operation.expression.kind === 'concat'
                        ? {
                            ...operation.expression,
                            parts: operation.expression.parts.map(part => rewriteDeriveOperand(part, resolveColumnName)),
                        }
                        : operation.expression.kind === 'math_binary'
                            ? {
                                ...operation.expression,
                                left: rewriteDeriveOperand(operation.expression.left, resolveColumnName),
                                right: rewriteDeriveOperand(operation.expression.right, resolveColumnName),
                            }
                            : {
                                ...operation.expression,
                                numerator: rewriteDeriveOperand(operation.expression.numerator, resolveColumnName),
                                denominator: rewriteDeriveOperand(operation.expression.denominator, resolveColumnName),
                            },
            };
        case 'derive_metric_by_label':
            return {
                ...operation,
                groupByColumns: operation.groupByColumns.map(resolveColumnName),
                labelColumn: resolveColumnName(operation.labelColumn),
                valueColumn: resolveColumnName(operation.valueColumn),
                carryForwardColumns: operation.carryForwardColumns?.map(resolveColumnName),
            };
        case 'unpivot_columns':
            return {
                ...operation,
                sourceColumns: operation.sourceColumns.map(resolveColumnName),
                keepColumns: operation.keepColumns?.map(resolveColumnName),
                labelMappings: operation.labelMappings?.map(mapping => ({
                    ...mapping,
                    sourceColumn: resolveColumnName(mapping.sourceColumn),
                })),
                labelColumns: operation.labelColumns?.map(labelColumn => ({
                    ...labelColumn,
                    mappings: labelColumn.mappings.map(mapping => ({
                        ...mapping,
                        sourceColumn: resolveColumnName(mapping.sourceColumn),
                    })),
                })),
            };
        default:
            return operation;
    }
};

export const rewritePlanColumnAliasesFromHeaderLayers = (
    candidatePlan: DataPreparationPlan,
    baselineColumns: ColumnProfile[],
    sourceData?: CsvData | null,
) => {
    const baselineLookup = new Set(baselineColumns.map(column => normalizeColumnName(column.name)));
    const aliasMap = buildHeaderLayerAliasMap(baselineColumns, sourceData);
    if (aliasMap.size === 0) {
        return {
            plan: candidatePlan,
            rewrites: [] as Array<{ from: string; to: string }>,
        };
    }

    const rewrites: Array<{ from: string; to: string }> = [];
    const resolveColumnName = (columnName: string) => {
        const normalized = normalizeColumnName(columnName);
        if (baselineLookup.has(normalized)) {
            return columnName;
        }
        const aliased = aliasMap.get(normalized);
        if (!aliased) {
            return columnName;
        }
        rewrites.push({ from: columnName, to: aliased });
        return aliased;
    };

    const rewrittenPlan: DataPreparationPlan = {
        ...candidatePlan,
        operations: candidatePlan.operations.map(operation => rewriteOperationColumnAliases(operation, resolveColumnName)),
        outputColumns: candidatePlan.outputColumns.map(column => {
            const rewrittenName = resolveColumnName(column.name);
            return rewrittenName === column.name ? column : { ...column, name: rewrittenName };
        }),
    };

    return {
        plan: rewrittenPlan,
        rewrites: rewrites.filter((rewrite, index, array) =>
            array.findIndex(candidate => candidate.from === rewrite.from && candidate.to === rewrite.to) === index,
        ),
    };
};

export const compareSchemaOnlyOutput = (baselineColumns: ColumnProfile[], outputColumns: ColumnProfile[]) => {
    const issues: string[] = [];
    const baselineLookup = buildColumnTypeLookup(baselineColumns);
    const outputLookup = buildColumnTypeLookup(outputColumns);

    const baselineNames = new Set(baselineColumns.map(column => normalizeColumnName(column.name)));
    const outputNames = new Set(outputColumns.map(column => normalizeColumnName(column.name)));

    const removedColumns = [...baselineNames].filter(name => !outputNames.has(name));
    const addedColumns = [...outputNames].filter(name => !baselineNames.has(name));

    if (removedColumns.length > 0) {
        issues.push(`Schema-only plan removed columns: ${removedColumns.join(', ')}`);
    }
    if (addedColumns.length > 0) {
        issues.push(`Schema-only plan added columns: ${addedColumns.join(', ')}`);
    }

    outputColumns.forEach(column => {
        const baselineType = baselineLookup.get(normalizeColumnName(column.name));
        if (!baselineType) return;
        if (baselineType !== column.type) return;
    });

    return issues;
};

export const hasSchemaOnlyTypeRefinement = (baselineColumns: ColumnProfile[], outputColumns: ColumnProfile[]) => {
    const baselineLookup = new Map(
        baselineColumns.map(column => [normalizeColumnName(column.name), column.type] as const),
    );

    return outputColumns.some(column => baselineLookup.get(normalizeColumnName(column.name)) !== column.type);
};

const buildStableSchemaOnlyExplanation = (baselineColumns: ColumnProfile[], outputColumns: ColumnProfile[]) =>
    hasSchemaOnlyTypeRefinement(baselineColumns, outputColumns)
        ? 'Prepared rows remain unchanged while refining schema types for analysis.'
        : 'Prepared rows remain unchanged and the tabular schema is preserved for analysis.';

export const stabilizeZeroOperationSchemaOnlyPlan = (
    plan: DataPreparationPlan,
    baselineColumns: ColumnProfile[],
): DataPreparationPlan => {
    if (plan.operations.length > 0) {
        return plan;
    }

    const outputColumns = plan.outputColumns?.length > 0 ? plan.outputColumns : baselineColumns;
    const schemaIssues = compareSchemaOnlyOutput(baselineColumns, outputColumns);
    const explanationClaimsMutation = MUTATION_CLAIM_PATTERN.test(plan.explanation);

    if (!explanationClaimsMutation && schemaIssues.length === 0) {
        return {
            ...plan,
            outputColumns,
        };
    }

    const alignedOutputColumns = alignSchemaOnlyOutputColumns(baselineColumns, outputColumns);

    return {
        ...plan,
        explanation: buildStableSchemaOnlyExplanation(baselineColumns, alignedOutputColumns),
        outputColumns: alignedOutputColumns,
        planStatus: 'schema_only',
        consistencyIssues: [],
    };
};

const summarizeColumnListIssue = (message: string, pattern: RegExp, label: string) => {
    const match = message.match(pattern);
    if (!match?.[1]) {
        return null;
    }

    const columns = match[1]
        .split(',')
        .map(column => column.trim())
        .filter(Boolean);

    return [
        `${label}_count=${columns.length}`,
        `${label}_examples=${columns.slice(0, RETRY_EXAMPLE_LIMIT).join(',') || 'none'}`,
    ];
};

export const buildRetryFeedback = (error: Error | undefined): string | null => {
    if (!error) {
        return null;
    }

    const message = error.message || '';
    const feedbackLines: string[] = [];
    const removedSummary = summarizeColumnListIssue(
        message,
        /Schema-only plan removed columns:\s*(.+?)(?=\s+Schema-only plan added columns:|\s+Schema-only plan explanation claims executed mutations despite having zero operations\.|$)/,
        'schema_only_removed_columns',
    );
    const addedSummary = summarizeColumnListIssue(
        message,
        /Schema-only plan added columns:\s*(.+?)(?=\s+Schema-only plan explanation claims executed mutations despite having zero operations\.|$)/,
        'schema_only_added_columns',
    );

    if (removedSummary) {
        feedbackLines.push(...removedSummary);
    }
    if (addedSummary) {
        feedbackLines.push(...addedSummary);
    }
    if (message.includes('Schema-only plan explanation claims executed mutations despite having zero operations.')) {
        feedbackLines.push('mutation_claim_in_explanation=true');
    }
    if (message.includes(WIDE_TABLE_VALUE_CAST_ORDER_ERROR)) {
        feedbackLines.push('wide_table_value_requires_unpivot=true');
        feedbackLines.push('Do not assume derived long-table columns such as Value, SeriesKey, or SeriesLabelL* already exist.');
        feedbackLines.push('If you need Value, first emit it with unpivot_columns using valueColumn="Value", then cast it in a later operation.');
    }

    if (feedbackLines.length === 0) {
        feedbackLines.push(`execution_error_summary=${truncateContextText(message, RETRY_DETAIL_MAX_CHARS)}`);
    }

    feedbackLines.push('Fix the prior inconsistency. Keep the schema unchanged unless emitted operations explicitly change it.');
    return feedbackLines.join('\n');
};
