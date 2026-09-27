import type {
    AiCleaningProgram,
    AiCleaningStep,
    AiCleaningStepMode,
    ColumnProfile,
    CsvRow,
    DataOperation,
    DataPreparationPlan,
    NumericReconciliationReport,
} from '../../../types';
import { buildSchemaSnapshot, diffSchemas, profileData } from '../../data/dataProfiler';
import { applyDataOperations, type DataOperationExecutionLog } from './dataOperationRunner';
import {
    buildNumericReconciliationReport,
    reconcileAiCleaningStep,
} from './numericReconciliation';
import { createId } from '../../../utils/createId';

export interface AiCleaningExecutionResult {
    data: CsvRow[];
    logs: DataOperationExecutionLog[];
    program: AiCleaningProgram;
    numericReconciliation: NumericReconciliationReport;
    schemaDiff: ReturnType<typeof diffSchemas>;
}

const RESHAPE_OPERATION_TYPES = new Set<DataOperation['type']>([
    'unpivot_columns',
    'split_column',
]);

const DESTRUCTIVE_OPERATION_TYPES = new Set<DataOperation['type']>([
    'drop_rows_by_index',
    'drop_rows_by_condition',
    'drop_blank_rows',
    'drop_columns',
    'filter_rows',
    'dedupe_rows',
]);

const inferStepMode = (operations: DataOperation[]): AiCleaningStepMode => {
    if (operations.some(operation => RESHAPE_OPERATION_TYPES.has(operation.type))) {
        return 'reshape';
    }
    if (operations.some(operation => DESTRUCTIVE_OPERATION_TYPES.has(operation.type))) {
        return 'destructive';
    }
    return 'lossless';
};

const normalizeNumericProfiles = (profiles?: ColumnProfile[]) =>
    profiles?.map(profile => ({
        name: profile.name,
        type: profile.type,
        uniqueValues: profile.uniqueValues ?? 0,
        missingPercentage: profile.missingPercentage ?? 0,
        valueRange: profile.valueRange ?? [0, 0],
    }));

export const createAiCleaningProgramFromPlan = (
    plan: DataPreparationPlan,
    outputColumns: ColumnProfile[],
): AiCleaningProgram => {
    const groupedSteps = plan.operations.reduce<AiCleaningStep[]>((steps, operation, index) => {
        const mode = inferStepMode([operation]);
        steps.push({
            id: `step_${index + 1}_${operation.type}`,
            mode,
            reason: operation.reason,
            operations: [operation],
        });
        return steps;
    }, []);

    return {
        programId: createId('ai-cleaning-program'),
        explanation: plan.explanation,
        steps: groupedSteps,
        outputColumns,
        source: 'llm_generated',
    };
};

export const executeAiCleaningProgram = (
    inputRows: CsvRow[],
    program: AiCleaningProgram,
    profiles?: ColumnProfile[],
): AiCleaningExecutionResult => {
    let currentRows = inputRows.map(row => ({ ...row }));
    const allLogs: DataOperationExecutionLog[] = [];
    const stepReports = [];
    const normalizedProfiles = normalizeNumericProfiles(profiles);

    for (const step of program.steps) {
        const beforeRows = currentRows.map(row => ({ ...row }));
        const execution = applyDataOperations(beforeRows, step.operations, { allowEmptyResult: false });
        const stepReport = reconcileAiCleaningStep(step, beforeRows, execution.data, normalizedProfiles);
        stepReports.push(stepReport);
        currentRows = execution.data.map(row => ({ ...row }));
        allLogs.push(...execution.logs);
    }

    const numericReconciliation = buildNumericReconciliationReport(
        inputRows,
        currentRows,
        stepReports,
        normalizedProfiles,
    );
    const beforeProfiles = buildSchemaSnapshot(profileData(inputRows).profiles);
    const afterProfiles = buildSchemaSnapshot(profileData(currentRows).profiles);

    return {
        data: currentRows,
        logs: allLogs,
        program,
        numericReconciliation,
        schemaDiff: diffSchemas(beforeProfiles, afterProfiles),
    };
};
