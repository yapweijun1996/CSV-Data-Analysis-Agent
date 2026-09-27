import { DataPreparationPlan, DataOperation, CsvRow } from '../../../types';
import { coerceAiOperationShape, normalizeDataOperation } from './dataOperationMutator';

// Re-exports for backward compatibility
export type { DataOperationExecutionLog } from './dataOperationMutator';
export { applyDataOperations, applySpreadsheetFilterOperation } from './dataOperationMutator';
export type { DataQueryExecutionOptions } from './dataQueryExecutor';
export { createQueryPlanFromFilterOperation, executeDataQuery } from './dataQueryExecutor';

export const normalizeDataPreparationPlan = (value: unknown): DataPreparationPlan | null => {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    const explanation = typeof candidate.explanation === 'string' ? candidate.explanation : '';
    const outputColumns = Array.isArray(candidate.outputColumns) ? candidate.outputColumns : [];
    const rawOperations = Array.isArray(candidate.operations)
        ? candidate.operations
        : ('operation' in candidate && candidate.operation !== undefined ? [candidate.operation] : []);
    const operations = rawOperations
        .map((operation, index) => coerceAiOperationShape(operation, explanation, index))
        .map(normalizeDataOperation)
        .filter((operation): operation is DataOperation => Boolean(operation));
    if (rawOperations.length > 0 && operations.length === 0 && outputColumns.length === 0 && !explanation.trim()) {
        return null;
    }
    const legacyJsFunctionBody = typeof candidate.jsFunctionBody === 'string' && candidate.jsFunctionBody.trim().length > 0
        ? candidate.jsFunctionBody
        : null;
    const planStatus = candidate.planStatus === 'operations' || candidate.planStatus === 'schema_only' || candidate.planStatus === 'inconsistent'
        ? candidate.planStatus
        : operations.length > 0
            ? 'operations'
            : 'schema_only';
    const consistencyIssues = Array.isArray(candidate.consistencyIssues)
        ? candidate.consistencyIssues.filter((issue): issue is string => typeof issue === 'string' && issue.trim().length > 0)
        : [];
    const aiProgram = candidate.aiProgram && typeof candidate.aiProgram === 'object'
        ? candidate.aiProgram as DataPreparationPlan['aiProgram']
        : undefined;
    const numericReconciliation = candidate.numericReconciliation && typeof candidate.numericReconciliation === 'object'
        ? candidate.numericReconciliation as DataPreparationPlan['numericReconciliation']
        : undefined;
    const sqlPrecheck = candidate.sqlPrecheck && typeof candidate.sqlPrecheck === 'object'
        ? candidate.sqlPrecheck as DataPreparationPlan['sqlPrecheck']
        : undefined;
    const labelNormalization = candidate.labelNormalization && typeof candidate.labelNormalization === 'object'
        ? candidate.labelNormalization as DataPreparationPlan['labelNormalization']
        : undefined;
    const derivedMetricValidations = Array.isArray(candidate.derivedMetricValidations)
        ? candidate.derivedMetricValidations as DataPreparationPlan['derivedMetricValidations']
        : undefined;

    return {
        explanation,
        operations,
        outputColumns,
        planStatus,
        consistencyIssues,
        ...(labelNormalization ? { labelNormalization } : {}),
        ...(derivedMetricValidations ? { derivedMetricValidations } : {}),
        ...(aiProgram ? { aiProgram } : {}),
        ...(numericReconciliation ? { numericReconciliation } : {}),
        ...(sqlPrecheck ? { sqlPrecheck } : {}),
        ...(legacyJsFunctionBody ? { legacy: { jsFunctionBody: legacyJsFunctionBody } } : {}),
    };
};

export const normalizeDataMutatePayload = (
    value: unknown,
): { plan: DataPreparationPlan | null; rawOperationCount: number } => {
    const candidate = value && typeof value === 'object'
        ? value as Record<string, unknown>
        : null;
    const rawOperationCount = Array.isArray(candidate?.operations)
        ? candidate.operations.length
        : (candidate && 'operation' in candidate && candidate.operation !== undefined ? 1 : 0);
    return {
        plan: normalizeDataPreparationPlan(value),
        rawOperationCount,
    };
};
