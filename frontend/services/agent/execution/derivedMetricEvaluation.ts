import type {
    CsvCellValue,
    CsvRow,
    DeriveExpression,
    DeriveMetricComponent,
    DeriveOperand,
} from '../../../types';
import { robustParseFloat } from '../../data/dataProfiler';
import type { DerivedOperation } from './derivedMetricDeclaration';

export const resolveDerivedOperand = (row: CsvRow, operand: DeriveOperand): CsvCellValue =>
    operand.kind === 'literal' ? operand.value : row[operand.column] ?? null;

export const deriveRowMetricValue = (row: CsvRow, expression: DeriveExpression): CsvCellValue => {
    if (expression.kind === 'copy') return resolveDerivedOperand(row, expression.source);
    if (expression.kind === 'concat') {
        return expression.parts
            .map(part => resolveDerivedOperand(row, part))
            .filter(value => value !== null && value !== undefined && String(value).length > 0)
            .map(String)
            .join(expression.separator ?? '');
    }

    const leftOperand = expression.kind === 'ratio' ? expression.numerator : expression.left;
    const rightOperand = expression.kind === 'ratio' ? expression.denominator : expression.right;
    const left = robustParseFloat(resolveDerivedOperand(row, leftOperand));
    const right = robustParseFloat(resolveDerivedOperand(row, rightOperand));
    if (left === null || right === null) return null;
    if (expression.kind === 'ratio') return right === 0 ? null : left / right;
    if (expression.operator === 'add') return left + right;
    if (expression.operator === 'subtract') return left - right;
    if (expression.operator === 'multiply') return left * right;
    return right === 0 ? null : left / right;
};

const getMetricComponentTotal = (
    rows: CsvRow[],
    labelColumn: string,
    valueColumn: string,
    component: DeriveMetricComponent,
): number | null => {
    const terms = component.matchAny.map(term => term.toLowerCase());
    const matches = rows.filter(row => {
        const label = String(row[labelColumn] ?? '').trim().toLowerCase();
        return terms.some(term => label.includes(term));
    });
    if (matches.length === 0) return null;
    const parsed = matches
        .map(row => robustParseFloat(row[valueColumn] ?? null))
        .filter((value): value is number => value !== null);
    if (parsed.length === 0) return null;
    const total = parsed.reduce((sum, value) =>
        sum + (component.valueTransform === 'absolute' ? Math.abs(value) : value), 0);
    return component.operator === 'subtract' ? -total : total;
};

export const evaluateLabelDerivedMetric = (
    rows: CsvRow[],
    operation: Extract<DerivedOperation, { type: 'derive_metric_by_label' }>,
): number | null => {
    const evaluateComponents = (components: DeriveMetricComponent[]) => {
        const totals = components.map(component =>
            getMetricComponentTotal(rows, operation.labelColumn, operation.valueColumn, component));
        return totals.some(total => total === null)
            ? null
            : totals.reduce((sum, total) => sum + (total ?? 0), 0);
    };
    if (operation.formula.kind === 'linear_combination') {
        return evaluateComponents(operation.formula.components);
    }
    const numerator = evaluateComponents(operation.formula.numerator);
    const denominator = evaluateComponents(operation.formula.denominator);
    if (numerator === null || denominator === null || denominator === 0) return null;
    return numerator / denominator * (Number.isFinite(operation.formula.scale) ? operation.formula.scale : 1);
};

export const buildDerivedMetricGroups = (
    rows: CsvRow[],
    columns: string[],
): Map<string, CsvRow[]> => {
    const groups = new Map<string, CsvRow[]>();
    rows.forEach(row => {
        const key = JSON.stringify(columns.map(column => row[column] ?? null));
        groups.set(key, [...(groups.get(key) ?? []), row]);
    });
    return groups;
};

export const derivedMetricValuesEqual = (left: number, right: number): boolean => {
    const scale = Math.max(1, Math.abs(left), Math.abs(right));
    return Math.abs(left - right) <= scale * 1e-9;
};
