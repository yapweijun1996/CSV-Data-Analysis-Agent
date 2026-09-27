import type {
    DataOperation,
    DeriveExpression,
    DeriveOperand,
    DerivedMetricDeclaration,
} from '../../../types';

export type DerivedOperation = Extract<DataOperation, { type: 'derive_column' | 'derive_metric_by_label' }>;

const unique = (values: string[]): string[] =>
    Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));

const getOperandColumns = (operand: DeriveOperand): string[] =>
    operand.kind === 'column' ? [operand.column] : [];

const getExpressionColumns = (expression: DeriveExpression): string[] => {
    if (expression.kind === 'copy') return getOperandColumns(expression.source);
    if (expression.kind === 'concat') return expression.parts.flatMap(getOperandColumns);
    if (expression.kind === 'ratio') {
        return [
            ...getOperandColumns(expression.numerator),
            ...getOperandColumns(expression.denominator),
        ];
    }
    return [
        ...getOperandColumns(expression.left),
        ...getOperandColumns(expression.right),
    ];
};

export const getRequiredDerivedMetricSourceColumns = (operation: DerivedOperation): string[] =>
    operation.type === 'derive_column'
        ? getExpressionColumns(operation.expression)
        : [
            ...operation.groupByColumns,
            operation.labelColumn,
            operation.valueColumn,
            ...(operation.carryForwardColumns ?? []),
        ];

export const getDerivedMetricNumericColumns = (operation: DerivedOperation): string[] => {
    if (operation.type === 'derive_metric_by_label') return [operation.valueColumn];
    if (operation.expression.kind === 'copy' || operation.expression.kind === 'concat') return [];
    return unique(getExpressionColumns(operation.expression));
};

export const buildDerivedMetricDeclaration = (
    operation: DerivedOperation,
): DerivedMetricDeclaration => {
    const sourceColumns = getRequiredDerivedMetricSourceColumns(operation);
    const inferredUnits = operation.type === 'derive_column'
        ? operation.expression.kind === 'ratio'
            || (operation.expression.kind === 'math_binary' && operation.expression.operator === 'divide')
            ? 'ratio'
            : `same as ${sourceColumns[0] ?? 'source values'}`
        : operation.formula.kind === 'ratio'
            ? operation.formula.scale === 100 ? 'percent' : 'ratio'
            : `same as ${operation.valueColumn}`;
    const metricName = operation.type === 'derive_column'
        ? operation.newColumn
        : operation.outputMetricLabel;
    const grain = operation.type === 'derive_column'
        ? ['source row']
        : operation.groupByColumns;
    const formula = operation.type === 'derive_column'
        ? JSON.stringify(operation.expression)
        : JSON.stringify(operation.formula);

    return {
        metricName: operation.declaration?.metricName?.trim() || metricName,
        formula: operation.declaration?.formula?.trim() || formula,
        operation: operation.declaration?.operation?.trim()
            || (operation.type === 'derive_column' ? operation.expression.kind : operation.formula.kind),
        sourceColumns: unique(operation.declaration?.sourceColumns?.length
            ? operation.declaration.sourceColumns
            : sourceColumns),
        grain: unique(operation.declaration?.grain?.length ? operation.declaration.grain : grain),
        units: operation.declaration?.units?.trim() || inferredUnits,
        assumptions: unique(operation.declaration?.assumptions?.length
            ? operation.declaration.assumptions
            : [
                operation.reason,
                operation.type === 'derive_metric_by_label'
                    ? 'Metric labels are matched case-insensitively using the declared formula terms.'
                    : 'Each source row is evaluated independently.',
            ]),
        businessMeaning: operation.declaration?.businessMeaning?.trim() || operation.reason,
    };
};
