import type {
    AnalysisBrief,
    AnalysisMetricSemanticName,
    DeriveMetricByLabelOperation,
    MetricDefinition,
    MetricValidationIssue,
} from '../../types';

const TARGET_METRIC_TASKS = new Set<AnalysisMetricSemanticName>(['profit', 'margin', 'variance']);
type FormulaInputSemantic = 'revenue' | 'cost' | 'budget' | 'actual';

const FORMULA_INPUT_PATTERNS: Record<FormulaInputSemantic, RegExp[]> = {
    revenue: [
        /\brevenue\b/i,
        /\bcontract revenue\b/i,
        /\bnet\s+sales\b/i,
        /\bincome\b/i,
        /\bturnover\b/i,
    ],
    cost: [
        /\bcost\b/i,
        /\bcogs\b/i,
        /\baws\b/i,
        /\bexpense\b/i,
    ],
    budget: [
        /\bbudget\b/i,
        /\bforecast\b/i,
        /\bplan(?:ned)?\b/i,
    ],
    actual: [
        /\bactual\b/i,
        /\bbooked\b/i,
        /\breali[sz]ed\b/i,
    ],
};

const dedupeIssues = (issues: MetricValidationIssue[]) =>
    issues.filter((issue, index, items) =>
        items.findIndex(candidate =>
            candidate.code === issue.code
            && candidate.metricName === issue.metricName
            && candidate.message === issue.message,
        ) === index);

const hasRowLabelBinding = (definition: MetricDefinition) =>
    definition.bindings.some(binding => binding.source === 'row_label');

const hasColumnBinding = (definition: MetricDefinition) =>
    definition.bindings.some(binding => binding.source === 'column');

const findSemanticConflicts = (
    tokens: string[] | undefined,
    forbiddenSemantics: FormulaInputSemantic[],
) => {
    const normalizedTokens = (tokens ?? []).map(token => token.trim()).filter(Boolean);
    return normalizedTokens.filter(token =>
        forbiddenSemantics.some(semantic =>
            FORMULA_INPUT_PATTERNS[semantic].some(pattern => pattern.test(token)),
        ),
    );
};

const buildFormulaSemanticIssues = (
    operation: DeriveMetricByLabelOperation,
    metricName: AnalysisMetricSemanticName,
): MetricValidationIssue[] => {
    const issues: MetricValidationIssue[] = [];
    const label = operation.outputMetricLabel || metricName;
    const formula = operation.formula;

    const pushConflict = (
        conflictedTokens: string[],
        message: string,
    ) => {
        if (conflictedTokens.length === 0) {
            return;
        }
        issues.push({
            code: 'metric_definition_missing',
            severity: 'error',
            metricName,
            message: `${message}: ${conflictedTokens.join(', ')}.`,
        });
    };

    if (formula.kind === 'linear_combination') {
        if (metricName === 'profit' || metricName === 'margin') {
            formula.components.forEach(component => {
                if (component.operator === 'add') {
                    pushConflict(
                        findSemanticConflicts(component.matchAny, ['cost']),
                        `The derive_metric_by_label formula for ${label} adds cost-like labels that should be subtracted`,
                    );
                }
                if (component.operator === 'subtract') {
                    pushConflict(
                        findSemanticConflicts(component.matchAny, ['revenue']),
                        `The derive_metric_by_label formula for ${label} subtracts revenue-like labels that should be added`,
                    );
                }
            });
        }

        if (metricName === 'variance') {
            formula.components.forEach(component => {
                if (component.operator === 'add') {
                    pushConflict(
                        findSemanticConflicts(component.matchAny, ['budget']),
                        `The derive_metric_by_label formula for ${label} adds budget-like labels that should be subtracted`,
                    );
                }
                if (component.operator === 'subtract') {
                    pushConflict(
                        findSemanticConflicts(component.matchAny, ['actual']),
                        `The derive_metric_by_label formula for ${label} subtracts actual-like labels that should be added`,
                    );
                }
            });
        }
    }

    if (formula.kind === 'ratio' && metricName === 'margin') {
        formula.numerator.forEach(component => {
            if (component.operator === 'add') {
                pushConflict(
                    findSemanticConflicts(component.matchAny, ['cost']),
                    `The derive_metric_by_label numerator for ${label} adds cost-like labels that should be subtracted`,
                );
            }
            if (component.operator === 'subtract') {
                pushConflict(
                    findSemanticConflicts(component.matchAny, ['revenue']),
                    `The derive_metric_by_label numerator for ${label} subtracts revenue-like labels that should be added`,
                );
            }
        });

        formula.denominator.forEach(component => {
            pushConflict(
                findSemanticConflicts(component.matchAny, ['cost', 'budget', 'actual']),
                `The derive_metric_by_label denominator for ${label} must use revenue-like labels only`,
            );
        });
    }

    return issues;
};

export const validateAnalysisBrief = (
    brief: AnalysisBrief,
    requestedMetrics: AnalysisMetricSemanticName[] = [],
): MetricValidationIssue[] => {
    const issues: MetricValidationIssue[] = [];

    requestedMetrics.forEach(metricName => {
        const definition = brief.metricDefinitions.find(metric => metric.name === metricName);
        if (!definition) {
            issues.push({
                code: 'metric_definition_missing',
                severity: 'error',
                metricName,
                message: `No stable metric definition was detected for ${metricName}.`,
            });
            return;
        }

        if (definition.grainCandidates.length === 0) {
            issues.push({
                code: 'grain_ambiguous',
                severity: 'warn',
                metricName,
                message: `The likely grain for ${metricName} is still ambiguous.`,
            });
        }

        if (hasRowLabelBinding(definition) && hasColumnBinding(definition)) {
            issues.push({
                code: 'mixed_metric_sources',
                severity: 'warn',
                metricName,
                message: `${metricName} mixes column-based and row-label semantics; validate the mapping before charting.`,
            });
        }

        if (definition.bindings.some(binding => binding.source === 'row_label' && !binding.valueColumn)) {
            issues.push({
                code: 'missing_numeric_value',
                severity: 'error',
                metricName,
                message: `${metricName} row-label mapping is missing a numeric value column.`,
            });
        }

        if (definition.bindings.some(binding => binding.source === 'row_label' && (binding.matchedValues?.length ?? 0) > 1)) {
            issues.push({
                code: 'duplicate_grain_risk',
                severity: 'warn',
                metricName,
                message: `${metricName} maps multiple row labels and may require duplicate-grain validation before visualization.`,
            });
        }
    });

    if (requestedMetrics.some(metric => TARGET_METRIC_TASKS.has(metric)) && brief.datasetShape === 'unknown') {
        issues.push({
            code: 'unsupported_metric_request',
            severity: 'error',
            message: 'The dataset shape is still unknown, so the requested business metric cannot be validated yet.',
        });
    }

    return dedupeIssues(issues);
};

export const validateDeriveMetricOperationAgainstBrief = (
    brief: AnalysisBrief,
    operation: DeriveMetricByLabelOperation,
): MetricValidationIssue[] => {
    const issues: MetricValidationIssue[] = [];
    const targetMetric = String(operation.metricName ?? operation.outputMetricLabel).trim().toLowerCase() as AnalysisMetricSemanticName;
    const definition = brief.metricDefinitions.find(metric => metric.name === targetMetric);

    if (!definition) {
        issues.push({
            code: 'metric_definition_missing',
            severity: 'error',
            metricName: targetMetric,
            message: `No stable metric definition was detected for ${operation.outputMetricLabel}.`,
        });
        return dedupeIssues(issues);
    }

    const rowLabelBindings = definition.bindings.filter(binding => binding.source === 'row_label');
    if (rowLabelBindings.length === 0) {
        issues.push({
            code: 'unsupported_metric_request',
            severity: 'error',
            metricName: definition.name,
            message: `${operation.outputMetricLabel} is not modeled as a row-label derived metric for this dataset.`,
        });
    }

    if (!rowLabelBindings.some(binding => binding.labelColumn === operation.labelColumn)) {
        issues.push({
            code: 'metric_definition_missing',
            severity: 'error',
            metricName: definition.name,
            message: `The derive_metric_by_label labelColumn "${operation.labelColumn}" does not match the detected metric semantics.`,
        });
    }

    if (!rowLabelBindings.some(binding => binding.valueColumn === operation.valueColumn)) {
        issues.push({
            code: 'missing_numeric_value',
            severity: 'error',
            metricName: definition.name,
            message: `The derive_metric_by_label valueColumn "${operation.valueColumn}" does not match the detected numeric metric column.`,
        });
    }

    const unsupportedGroupBy = operation.groupByColumns.filter(column => !brief.grainCandidates.includes(column));
    if (unsupportedGroupBy.length > 0) {
        issues.push({
            code: 'grain_ambiguous',
            severity: 'warn',
            metricName: definition.name,
            message: `The requested grouping columns (${unsupportedGroupBy.join(', ')}) are outside the likely grain candidates.`,
        });
    }

    if (Array.isArray(operation.expectedInputs) && operation.expectedInputs.length > 0) {
        const matchedInputs = new Set(rowLabelBindings.flatMap(binding => binding.matchedValues ?? []).map(value => value.toLowerCase()));
        const missingInputs = operation.expectedInputs.filter(input => !matchedInputs.has(input.toLowerCase()));
        if (missingInputs.length > 0) {
            issues.push({
                code: 'metric_definition_missing',
                severity: 'warn',
                metricName: definition.name,
                message: `Expected metric inputs were not all detected in the source labels: ${missingInputs.join(', ')}.`,
            });
        }
    }

    issues.push(...buildFormulaSemanticIssues(operation, definition.name));

    return dedupeIssues(issues);
};
