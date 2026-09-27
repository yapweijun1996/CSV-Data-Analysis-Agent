import type { ColumnProfile, CsvData, DataPreparationPlan, DeriveMetricByLabelOperation, ToolExecutionResult } from '../../../types';
import { buildAnalysisIntentBrief } from '../analysisBrief';
import { validateDeriveMetricOperationAgainstBrief } from '../analysisValidation';

const collectMetricDerivationPreflightIssues = ({
    columnProfiles,
    csvData,
    dataPreparationPlan,
    operation,
}: {
    columnProfiles: ColumnProfile[];
    csvData: CsvData | null | undefined;
    dataPreparationPlan: DataPreparationPlan | null | undefined;
    operation: DeriveMetricByLabelOperation;
}) => {
    const brief = buildAnalysisIntentBrief({
        columns: columnProfiles,
        csvData: csvData ?? null,
        dataPreparationPlan: dataPreparationPlan ?? null,
    });
    return validateDeriveMetricOperationAgainstBrief(brief, operation);
};

export const validateMetricDerivationPreflight = ({
    columnProfiles,
    csvData,
    dataPreparationPlan,
    operation,
}: {
    columnProfiles: ColumnProfile[];
    csvData: CsvData | null | undefined;
    dataPreparationPlan: DataPreparationPlan | null | undefined;
    operation: DeriveMetricByLabelOperation;
}): ToolExecutionResult | null => {
    const validationIssues = collectMetricDerivationPreflightIssues({
        columnProfiles,
        csvData,
        dataPreparationPlan,
        operation,
    });
    const blockingIssues = validationIssues.filter(issue => issue.severity === 'error');
    if (blockingIssues.length === 0) {
        return null;
    }

    const summary = blockingIssues.map(issue => issue.message).join(' ');
    const artifactMetadata = {
        artifactType: 'dataset_mutation_attempt',
        validationIssues,
        targetMetric: operation.outputMetricLabel,
    };

    return {
        status: 'blocked',
        toolName: 'data.mutate',
        message: summary,
        shouldStop: false,
        retryHint: 'Repair the metric mapping, label/value columns, or grouping grain before retrying derive_metric_by_label.',
        artifactMetadata,
        observation: {
            type: 'tool_result',
            status: 'blocked',
            summary,
            toolName: 'data.mutate',
            code: 'validation_failed',
            retryHint: 'Repair the metric mapping, label/value columns, or grouping grain before retrying derive_metric_by_label.',
            detail: {
                validationIssues,
                artifactMetadata,
            },
        },
    };
};
