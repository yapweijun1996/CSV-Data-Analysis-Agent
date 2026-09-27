import type {
    AnalysisBrief,
    AnalysisMetricSemanticName,
    BaseMetricSemanticName,
    DeriveMetricByLabelFormula,
    DeriveMetricByLabelOperation,
    DerivedMetricSemanticName,
    MetricDefinition,
    MetricMappingRecommendation,
    MetricMappingValidationArtifact,
    MetricMappingValidationRequest,
    MetricValidationIssue,
    ToolExecutionResult,
} from '../../../types';
import { buildAnalysisIntentBrief } from '../analysisBrief';
import { validateAnalysisBrief, validateDeriveMetricOperationAgainstBrief } from '../analysisValidation';
import type { StoreApi } from '../types';
import { buildRuntimeRequestFingerprint } from '../runtime/runtimeHelpers';

const dedupeIssues = (issues: MetricValidationIssue[]) =>
    issues.filter((issue, index, entries) =>
        entries.findIndex(candidate =>
            candidate.code === issue.code
            && candidate.metricName === issue.metricName
            && candidate.message === issue.message,
        ) === index);

const buildLinearCombinationFormula = (metricName: AnalysisMetricSemanticName): DeriveMetricByLabelFormula | null => {
    if (metricName === 'profit') {
        return {
            kind: 'linear_combination',
            components: [
                { operator: 'add', matchAny: ['revenue'] },
                { operator: 'subtract', matchAny: ['cost'] },
            ],
        };
    }

    if (metricName === 'variance') {
        return {
            kind: 'linear_combination',
            components: [
                { operator: 'add', matchAny: ['actual'] },
                { operator: 'subtract', matchAny: ['budget'] },
            ],
        };
    }

    if (metricName === 'margin') {
        return {
            kind: 'ratio',
            numerator: [
                { operator: 'add', matchAny: ['revenue'] },
                { operator: 'subtract', matchAny: ['cost'] },
            ],
            denominator: [
                { operator: 'add', matchAny: ['revenue'] },
            ],
            scale: 100,
        };
    }

    return null;
};

const buildDerivedTemplate = (
    metricName: AnalysisMetricSemanticName,
    definition: MetricDefinition | null,
    brief: AnalysisBrief,
) => {
    if (!definition?.requiresDerivation) {
        return null;
    }

    const rowBinding = definition.bindings.find(binding => binding.source === 'row_label');
    const formula = buildLinearCombinationFormula(metricName);
    if (!rowBinding?.labelColumn || !rowBinding.valueColumn || !formula) {
        return null;
    }

    const groupByColumns = definition.grainCandidates.length > 0
        ? definition.grainCandidates.slice(0, 3)
        : brief.grainCandidates.slice(0, 3);

    return {
        groupByColumns,
        labelColumn: rowBinding.labelColumn,
        valueColumn: rowBinding.valueColumn,
        expectedInputs: rowBinding.matchedValues ?? [],
        outputMetricLabel: metricName.charAt(0).toUpperCase() + metricName.slice(1),
        formula,
    };
};

const validateProposedColumnMapping = (
    definition: MetricDefinition | null,
    request: MetricMappingValidationRequest,
): MetricValidationIssue[] => {
    const proposedMapping = request.proposedMapping;
    if (!proposedMapping || proposedMapping.sourceKind !== 'column') {
        return [];
    }

    const columnBindings = definition?.bindings.filter(binding => binding.source === 'column') ?? [];
    if (columnBindings.length === 0) {
        return [{
            code: 'metric_definition_missing',
            severity: 'error',
            metricName: request.metricName,
            message: `${request.metricName} is not modeled as a direct column metric in this dataset.`,
        }];
    }

    if (!columnBindings.some(binding => binding.column === proposedMapping.column)) {
        return [{
            code: 'metric_definition_missing',
            severity: 'error',
            metricName: request.metricName,
            message: `The proposed column "${proposedMapping.column}" does not match the detected ${request.metricName} metric binding.`,
        }];
    }

    return [];
};

const validateProposedRowLabelMapping = (
    request: MetricMappingValidationRequest,
    brief: AnalysisBrief,
    template: ReturnType<typeof buildDerivedTemplate>,
): MetricValidationIssue[] => {
    const proposedMapping = request.proposedMapping;
    if (!proposedMapping || proposedMapping.sourceKind !== 'row_label' || !template) {
        return [];
    }

    const operation: DeriveMetricByLabelOperation = {
        id: 'validate-metric-mapping',
        type: 'derive_metric_by_label',
        reason: 'Validate the proposed metric mapping against detected semantics.',
        metricName: request.metricName,
        groupByColumns: request.requestedGrain?.length ? request.requestedGrain : template.groupByColumns,
        labelColumn: proposedMapping.labelColumn ?? template.labelColumn,
        valueColumn: proposedMapping.valueColumn ?? template.valueColumn,
        outputMetricLabel: template.outputMetricLabel,
        expectedInputs: proposedMapping.expectedInputs ?? template.expectedInputs,
        formula: template.formula,
    };

    return validateDeriveMetricOperationAgainstBrief(brief, operation);
};

const validateRequestedGrain = (
    request: MetricMappingValidationRequest,
    definition: MetricDefinition | null,
): MetricValidationIssue[] => {
    if (!request.requestedGrain?.length || !definition) {
        return [];
    }

    const unsupported = request.requestedGrain.filter(column => !definition.grainCandidates.includes(column));
    if (unsupported.length === 0) {
        return [];
    }

    return [{
        code: 'grain_ambiguous',
        severity: 'warn',
        metricName: request.metricName,
        message: `The requested grain (${unsupported.join(', ')}) is outside the likely grain candidates for ${request.metricName}.`,
    }];
};

const chooseRecommendation = ({
    request,
    definition,
    blockers,
}: {
    request: MetricMappingValidationRequest;
    definition: MetricDefinition | null;
    blockers: string[];
}): { recommendedAction: MetricMappingRecommendation; suggestedNextTool?: MetricMappingValidationArtifact['suggestedNextTool'] } => {
    if (blockers.length > 0) {
        return {
            recommendedAction: 'clarify',
            suggestedNextTool: 'conversation.request_clarification',
        };
    }

    if (request.validationKind === 'derived' && definition?.requiresDerivation) {
        return {
            recommendedAction: 'derive_metric',
            suggestedNextTool: 'data.mutate',
        };
    }

    if (request.requestedGrain?.length || request.proposedMapping) {
        return {
            recommendedAction: 'visualize',
            suggestedNextTool: 'analysis.create_plan',
        };
    }

    return {
        recommendedAction: 'answer',
        suggestedNextTool: 'assistant_message',
    };
};

export const executeMetricMappingValidationAction = (
    request: MetricMappingValidationRequest,
    store: StoreApi,
): ToolExecutionResult => {
    const state = store.getState();
    if (!state.csvData || state.columnProfiles.length === 0) {
        return {
            status: 'error',
            toolName: 'analysis.validate_metric_mapping',
            message: 'No dataset is loaded for metric mapping validation.',
            shouldStop: false,
            retryHint: 'Load a dataset before validating business metric mappings.',
        };
    }

    const brief = buildAnalysisIntentBrief({
        columns: state.columnProfiles,
        csvData: state.csvData,
        dataPreparationPlan: state.dataPreparationPlan ?? null,
        datasetSemanticSnapshot: state.datasetSemanticSnapshot ?? null,
        semanticDatasetVersion: state.semanticDatasetVersion ?? null,
    });
    const metricDefinition = brief.metricDefinitions.find(metric => metric.name === request.metricName) ?? null;
    const deriveMetricTemplate = request.validationKind === 'derived'
        ? buildDerivedTemplate(request.metricName, metricDefinition, brief)
        : null;
    const requestMessage = state.activeTurn?.userMessage?.trim() || request.metricName;
    const requestFingerprint = buildRuntimeRequestFingerprint(requestMessage, {
        sessionId: state.sessionId,
        datasetId: state.currentDatasetId,
    });

    const validationIssues = dedupeIssues([
        ...validateAnalysisBrief(brief, [request.metricName]),
        ...validateRequestedGrain(request, metricDefinition),
        ...validateProposedColumnMapping(metricDefinition, request),
        ...validateProposedRowLabelMapping(request, brief, deriveMetricTemplate),
    ]);
    const blockers = validationIssues
        .filter(issue => issue.severity === 'error')
        .map(issue => issue.message);
    const { recommendedAction, suggestedNextTool } = chooseRecommendation({
        request,
        definition: metricDefinition,
        blockers,
    });

    const artifactMetadata: MetricMappingValidationArtifact = {
        artifactType: 'metric_mapping_validation',
        metricName: request.metricName,
        validationKind: request.validationKind,
        metricDefinition,
        validationIssues,
        blockers,
        recommendedAction,
        recommendedPath: brief.recommendedPath,
        suggestedNextTool,
        deriveMetricTemplate: deriveMetricTemplate ?? undefined,
        grain: metricDefinition?.grainCandidates ?? brief.grainCandidates,
        sourceArtifactIds: [],
        originRunId: state.activeTurn?.runId ?? null,
        originTurnId: state.activeTurn?.turnId ?? null,
        requestFingerprint,
        requestMessage,
    };

    store.setState({
        activeMetricMappingValidation: artifactMetadata,
    });

    const summary = blockers.length > 0
        ? blockers.join(' ')
        : `Validated the ${request.metricName} metric mapping. Recommended next step: ${recommendedAction}.`;
    const retryHint = blockers.length > 0
        ? 'Resolve the metric blockers with clarification before deriving or charting this business metric.'
        : null;

    return {
        status: blockers.length > 0 ? 'blocked' : 'success',
        toolName: 'analysis.validate_metric_mapping',
        message: summary,
        shouldStop: false,
        artifactMetadata: artifactMetadata as unknown as Record<string, unknown>,
        observation: {
            type: 'tool_result',
            status: blockers.length > 0 ? 'blocked' : 'success',
            summary,
            toolName: 'analysis.validate_metric_mapping',
            code: blockers.length > 0 ? 'validation_failed' : undefined,
            retryHint,
            detail: {
                artifactMetadata: artifactMetadata as unknown as Record<string, unknown>,
                validationIssues,
                blockers,
            },
        },
    };
};
