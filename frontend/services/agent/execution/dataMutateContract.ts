import { getDataOperationManifest, normalizeDataOperation } from './dataOperationManifest';
import { normalizeDataMutatePayload } from './dataOperationRunner';

const isRecordLike = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export type DataMutateRepairHintCategory =
    | 'missing_replace_values_fields'
    | 'missing_derive_metric_formula'
    | 'missing_ratio_components'
    | 'invalid_group_by_or_columns';

type DataMutateRepairRule = {
    category: DataMutateRepairHintCategory;
    match: (errorText: string) => boolean;
    hint: (errorText: string) => string;
};

const DATA_MUTATE_REPAIR_RULES: DataMutateRepairRule[] = [
    {
        category: 'missing_replace_values_fields',
        match: errorText => /replace_values requires id, reason, column, and replacements\[\]/i.test(errorText),
        hint: () => 'Repair replace_values by sending one operation object with top-level id, reason, column, and replacements: [{ from, to }]. Do not hide the target column or replacements under unsupported wrapper keys.',
    },
    {
        category: 'missing_derive_metric_formula',
        match: errorText =>
            /derive_metric_by_label requires id, reason, groupByColumns, labelColumn, valueColumn, outputMetricLabel, and formula/i.test(errorText)
            || /derive_metric_by_label formula\.kind must be/i.test(errorText),
        hint: () => 'Repair derive_metric_by_label by reusing the validated template exactly. Include groupByColumns, labelColumn, valueColumn, outputMetricLabel, and a full formula object with a supported kind.',
    },
    {
        category: 'missing_ratio_components',
        match: errorText => /derive_metric_by_label ratio requires numerator and denominator components with matchAny labels/i.test(errorText),
        hint: () => 'Repair the ratio formula by providing both formula.numerator[] and formula.denominator[] arrays, and ensure every component includes matchAny labels.',
    },
    {
        category: 'invalid_group_by_or_columns',
        match: errorText =>
            /derive_metric_by_label groupByColumns must not include labelColumn/i.test(errorText)
            || /references missing column/i.test(errorText)
            || /requires a non-empty column name/i.test(errorText),
        hint: errorText => {
            const missingColumnMatch = errorText.match(/references missing column:\s*([^.\n]+)/i);
            const missingColumn = missingColumnMatch?.[1]?.trim();
            const columnHint = missingColumn
                ? ` Use only real dataset columns; "${missingColumn}" is not currently available.`
                : ' Use only real dataset columns, and keep groupByColumns separate from labelColumn/valueColumn.';
            return `Repair the target columns or grouping grain before retrying the mutation.${columnHint}`;
        },
    },
];

const getOperationLabel = (operation: Record<string, unknown>, index: number): string => {
    const operationId = typeof operation.id === 'string' ? operation.id.trim() : '';
    return operationId ? `"${operationId}"` : `index ${index + 1}`;
};

const validateOperation = (
    value: unknown,
    index: number,
    explanation: string,
    outputColumns: unknown[],
): string[] => {
    if (!isRecordLike(value)) {
        return [`operation ${index + 1} must be an object.`];
    }

    const normalizedPayload = normalizeDataMutatePayload({
        explanation,
        operations: [value],
        outputColumns,
        planStatus: 'operations',
        consistencyIssues: [],
    });
    if (normalizedPayload.plan?.operations.length === 1 && normalizedPayload.rawOperationCount === 1) {
        return [];
    }

    const type = typeof value.type === 'string' ? value.type.trim() : '';
    if (type && !getDataOperationManifest(type)) {
        return [`operation ${getOperationLabel(value, index)} (index ${index + 1}): Unsupported data operation type \"${type}\".`];
    }
    const normalized = normalizeDataOperation(value);
    if (!normalized.operation) {
        return normalized.errors.map(error => `operation ${getOperationLabel(value, index)} (index ${index + 1}): ${error}`);
    }

    return [`operation ${getOperationLabel(value, index)} (index ${index + 1}) must use a supported type and include its required fields.`];
};

export const validateDataMutatePayload = (args: Record<string, any>) => {
    const normalizedArgs = {
        explanation: typeof args?.explanation === 'string' ? args.explanation : '',
        operations: Array.isArray(args?.operations)
            ? args.operations
            : (args && 'operation' in args && args.operation !== undefined ? [args.operation] : null),
        outputColumns: Array.isArray(args?.outputColumns) ? args.outputColumns : [],
    };
    const errors: string[] = [];
    if (!normalizedArgs.explanation.trim()) errors.push('"explanation" is required.');
    if (!Array.isArray(normalizedArgs.operations)) errors.push('"operations" must be an array.');
    if (Array.isArray(normalizedArgs.operations) && normalizedArgs.operations.length > 8) errors.push('"operations" must contain 8 or fewer items.');

    if (errors.length > 0) return errors;

    const operationErrors = normalizedArgs.operations.flatMap((operation: unknown, index: number) =>
        validateOperation(operation, index, normalizedArgs.explanation, normalizedArgs.outputColumns),
    );
    if (operationErrors.length > 0) {
        return operationErrors;
    }

    const normalizedPayload = normalizeDataMutatePayload({
        explanation: normalizedArgs.explanation,
        operations: normalizedArgs.operations,
        outputColumns: normalizedArgs.outputColumns,
        planStatus: 'operations',
        consistencyIssues: [],
    });

    if (!normalizedPayload.plan || normalizedPayload.plan.operations.length === 0) {
        return ['data.mutate must include at least one valid deterministic operation.'];
    }

    if (normalizedPayload.rawOperationCount !== normalizedPayload.plan.operations.length) {
        return ['data.mutate included malformed operations. Every operation must use a supported type and include its required fields.'];
    }

    return [];
};

export const getDataMutateRepairGuidance = (
    errors: string | string[],
): {
    repairHint: string;
    repairHintCategory: DataMutateRepairHintCategory | null;
    repairHintCategories: DataMutateRepairHintCategory[];
} => {
    const errorList = Array.isArray(errors) ? errors : [errors];
    const repairMatches = errorList.flatMap(errorText =>
        DATA_MUTATE_REPAIR_RULES
            .filter(rule => rule.match(errorText))
            .map(rule => ({
                category: rule.category,
                hint: rule.hint(errorText),
            })),
    );
    const repairHintCategories = Array.from(new Set(repairMatches.map(match => match.category)));

    if (repairHintCategories.length === 0) {
        return {
            repairHint: 'Repair the malformed data.mutate payload, answer from existing evidence, or ask one concise clarification if the target transformation is still ambiguous.',
            repairHintCategory: null,
            repairHintCategories: [],
        };
    }

    const repairHint = Array.from(new Set(repairMatches.map(match => match.hint))).join(' ');
    return {
        repairHint,
        repairHintCategory: repairHintCategories[0] ?? null,
        repairHintCategories,
    };
};
