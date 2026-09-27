import type {
    CsvRow,
    DataOperation,
    DeriveMetricByLabelFormula,
    DerivedMetricValidationArtifact,
    DerivedMetricValidationSignal,
    MetricValidationTier,
} from '../../../types';
import { robustParseFloat } from '../../data/dataProfiler';
import {
    buildDerivedMetricDeclaration,
    getDerivedMetricNumericColumns,
    getRequiredDerivedMetricSourceColumns,
    type DerivedOperation,
} from './derivedMetricDeclaration';
import {
    buildDerivedMetricGroups,
    deriveRowMetricValue,
    derivedMetricValuesEqual,
    evaluateLabelDerivedMetric,
    resolveDerivedOperand,
} from './derivedMetricEvaluation';

export { buildDerivedMetricDeclaration } from './derivedMetricDeclaration';

const TIER_RANK: Record<MetricValidationTier, number> = {
    pass: 0,
    warn: 1,
    fail: 2,
};

const combineTier = (signals: DerivedMetricValidationSignal[]): MetricValidationTier =>
    signals.reduce<MetricValidationTier>(
        (current, signal) => TIER_RANK[signal.status] > TIER_RANK[current] ? signal.status : current,
        'pass',
    );

const unique = (values: string[]): string[] =>
    Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));

const tierHigherIsBetter = (
    rate: number,
    passThreshold: number,
    warnThreshold: number,
): MetricValidationTier => {
    if (rate >= passThreshold) return 'pass';
    if (rate >= warnThreshold) return 'warn';
    return 'fail';
};

const tierLowerIsBetter = (
    rate: number,
    passThreshold: number,
    warnThreshold: number,
): MetricValidationTier => {
    if (rate <= passThreshold) return 'pass';
    if (rate <= warnThreshold) return 'warn';
    return 'fail';
};

const numericBehaviorSignal = (
    rows: CsvRow[],
    numericColumns: string[],
): DerivedMetricValidationSignal => {
    const values = rows.flatMap(row =>
        numericColumns
            .map(column => row[column] ?? null)
            .filter(value => value !== null && value !== undefined && String(value).trim() !== ''),
    );
    const parseableCount = values.filter(value => robustParseFloat(value) !== null).length;
    const parseRate = values.length > 0 ? parseableCount / values.length : 0;
    return {
        code: 'numeric_behavior',
        status: tierHigherIsBetter(parseRate, 0.98, 0.9),
        message: values.length === 0
            ? `No non-empty numeric inputs were found in ${numericColumns.join(', ') || 'the declared inputs'}.`
            : `${(parseRate * 100).toFixed(1)}% of ${values.length} non-empty metric inputs are numeric.`,
        measuredRate: parseRate,
        passThreshold: 0.98,
        warnThreshold: 0.9,
    };
};

const denominatorSafetySignal = (
    rows: CsvRow[],
    operation: DerivedOperation,
): DerivedMetricValidationSignal => {
    let population = 0;
    let unsafe = 0;
    if (operation.type === 'derive_column') {
        const denominator = operation.expression.kind === 'ratio'
            ? operation.expression.denominator
            : operation.expression.kind === 'math_binary' && operation.expression.operator === 'divide'
                ? operation.expression.right
                : null;
        if (denominator) {
            population = rows.length;
            unsafe = rows.filter(row => {
                const value = robustParseFloat(resolveDerivedOperand(row, denominator));
                return value === null || value === 0;
            }).length;
        }
    } else if (operation.formula.kind === 'ratio') {
        const sourceRows = rows.filter(row =>
            String(row[operation.labelColumn] ?? '').trim().toLowerCase()
            !== operation.outputMetricLabel.trim().toLowerCase());
        const groups = buildDerivedMetricGroups(sourceRows, operation.groupByColumns);
        population = groups.size;
        unsafe = [...groups.values()].filter(groupRows => {
            const denominatorFormula: DeriveMetricByLabelFormula = {
                kind: 'linear_combination',
                components: operation.formula.kind === 'ratio' ? operation.formula.denominator : [],
            };
            const denominator = evaluateLabelDerivedMetric(groupRows, {
                ...operation,
                formula: denominatorFormula,
            });
            return denominator === null || denominator === 0;
        }).length;
    }

    if (population === 0) {
        return {
            code: 'denominator_safety',
            status: 'pass',
            message: 'The formula has no denominator, so denominator safety is not applicable.',
            measuredRate: 0,
            passThreshold: 0.02,
            warnThreshold: 0.05,
        };
    }
    const unsafeRate = unsafe / population;
    return {
        code: 'denominator_safety',
        status: tierLowerIsBetter(unsafeRate, 0.02, 0.05),
        message: `${unsafe} of ${population} evaluated ${population === rows.length ? 'rows' : 'groups'} have a missing or zero denominator.`,
        measuredRate: unsafeRate,
        passThreshold: 0.02,
        warnThreshold: 0.05,
    };
};

const reconciliationSignal = (
    inputRows: CsvRow[],
    outputRows: CsvRow[] | null,
    operation: DerivedOperation,
): DerivedMetricValidationSignal => {
    if (!outputRows) {
        return {
            code: 'reconciliation',
            status: 'pass',
            message: 'Execution reconciliation will run against the preview output before commit.',
        };
    }

    let expected = 0;
    let mismatched = 0;
    if (operation.type === 'derive_column') {
        expected = inputRows.length;
        outputRows.slice(0, inputRows.length).forEach((row, index) => {
            const expectedValue = deriveRowMetricValue(inputRows[index] ?? {}, operation.expression);
            const actualValue = row[operation.newColumn] ?? null;
            const expectedNumber = robustParseFloat(expectedValue);
            const actualNumber = robustParseFloat(actualValue);
            const matches = expectedNumber !== null && actualNumber !== null
                ? derivedMetricValuesEqual(expectedNumber, actualNumber)
                : expectedValue === actualValue;
            if (!matches) mismatched += 1;
        });
        mismatched += Math.abs(inputRows.length - Math.min(inputRows.length, outputRows.length));
    } else {
        const sourceRows = inputRows.filter(row =>
            String(row[operation.labelColumn] ?? '').trim().toLowerCase()
            !== operation.outputMetricLabel.trim().toLowerCase());
        const inputGroups = buildDerivedMetricGroups(sourceRows, operation.groupByColumns);
        const outputGroups = buildDerivedMetricGroups(
            outputRows.filter(row =>
                String(row[operation.labelColumn] ?? '').trim().toLowerCase()
                === operation.outputMetricLabel.trim().toLowerCase()),
            operation.groupByColumns,
        );
        expected = inputGroups.size;
        inputGroups.forEach((groupRows, key) => {
            const expectedValue = evaluateLabelDerivedMetric(groupRows, operation);
            const candidates = outputGroups.get(key) ?? [];
            const actualValue = candidates.length === 1
                ? robustParseFloat(candidates[0]?.[operation.valueColumn] ?? null)
                : null;
            if (expectedValue === null || actualValue === null
                || !derivedMetricValuesEqual(expectedValue, actualValue)) {
                mismatched += 1;
            }
        });
    }

    const mismatchRate = expected > 0 ? mismatched / expected : 1;
    return {
        code: 'reconciliation',
        status: tierLowerIsBetter(mismatchRate, 0.02, 0.05),
        message: `${mismatched} of ${expected} derived results failed deterministic reconciliation.`,
        measuredRate: mismatchRate,
        passThreshold: 0.02,
        warnThreshold: 0.05,
    };
};

export const validateDerivedMetricOperation = ({
    inputRows,
    operation,
    outputRows = null,
    inputVersionId,
    outputVersionId,
}: {
    inputRows: CsvRow[];
    operation: DerivedOperation;
    outputRows?: CsvRow[] | null;
    inputVersionId: string;
    outputVersionId?: string | null;
}): DerivedMetricValidationArtifact => {
    const declaration = buildDerivedMetricDeclaration(operation);
    const availableColumns = new Set(
        inputRows.flatMap(row => Object.keys(row)).map(column => column.toLowerCase()),
    );
    const requiredSourceColumns = getRequiredDerivedMetricSourceColumns(operation);
    const declaredSourceKeys = new Set(declaration.sourceColumns.map(column => column.toLowerCase()));
    const undeclaredColumns = requiredSourceColumns.filter(column =>
        !declaredSourceKeys.has(column.toLowerCase()));
    const missingColumns = unique([...requiredSourceColumns, ...declaration.sourceColumns])
        .filter(column => column !== 'source row' && !availableColumns.has(column.toLowerCase()));
    const inputSignal: DerivedMetricValidationSignal = {
        code: 'input_availability',
        status: missingColumns.length === 0 && undeclaredColumns.length === 0 ? 'pass' : 'fail',
        message: missingColumns.length > 0
            ? `Required or declared source columns are missing: ${missingColumns.join(', ')}.`
            : undeclaredColumns.length > 0
                ? `The declaration omits formula source columns: ${undeclaredColumns.join(', ')}.`
                : `All declared source columns are available: ${declaration.sourceColumns.join(', ')}.`,
    };
    const numericColumns = getDerivedMetricNumericColumns(operation);
    const numericSignal = numericColumns.length > 0
        ? numericBehaviorSignal(inputRows, numericColumns)
        : {
            code: 'numeric_behavior' as const,
            status: 'pass' as const,
            message: 'This declaration does not require numeric source behavior.',
        };
    const signals = [
        inputSignal,
        numericSignal,
        denominatorSafetySignal(inputRows, operation),
        reconciliationSignal(inputRows, outputRows, operation),
    ];
    const status = combineTier(signals);

    return {
        artifactType: 'derived_metric_validation',
        operationId: operation.id,
        declaration,
        status,
        requiresConfirmation: status === 'warn',
        signals,
        evidenceReferences: [
            { kind: 'dataset_version', id: inputVersionId, label: 'Input dataset version' },
            { kind: 'operation', id: operation.id, label: declaration.formula },
            {
                kind: 'validation',
                id: `derived-metric-validation:${operation.id}`,
                label: `${status} deterministic validation`,
            },
            ...(outputVersionId
                ? [{ kind: 'dataset_version' as const, id: outputVersionId, label: 'Output dataset version' }]
                : []),
        ],
    };
};

export const isDerivedMetricOperation = (operation: DataOperation): operation is DerivedOperation =>
    operation.type === 'derive_column' || operation.type === 'derive_metric_by_label';

export const isDerivedMetricWarningExplicitlyConfirmed = (userMessage: string | null | undefined): boolean => {
    const message = userMessage?.trim() ?? '';
    if (!message) return false;
    return /\b(?:confirm(?:ed)?|approve(?:d)?)\b.*\bwarning\b/i.test(message)
        || /\baccept(?:ed)?\s+(?:the\s+)?warning\b/i.test(message)
        || /\bproceed\s+despite\s+(?:the\s+)?warning\b/i.test(message)
        || /(?:确认|批准|接受).{0,12}警告/.test(message)
        || /忽略.{0,12}警告.{0,12}继续/.test(message);
};
