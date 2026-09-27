import type {
    AppState,
    MetricDerivationTemplate,
    PivotDecision,
    PivotPreference,
    RuntimeStepContract,
    ToolName,
} from '../../../types';
import type { AnalystCapabilitySelection } from '../../../types';
import { resolveAnalystCapabilitySelection } from './analystCapabilityResolver';

import type { IntentClassificationFindings, QueryUnderstandingArtifact, GroundingResult } from './intentClassificationTypes';

export type RuntimeContractState = Pick<
    AppState,
    'sessionId' | 'currentDatasetId' | 'activeDataQuery' | 'activeMetricMappingValidation' | 'activeSpreadsheetFilter' | 'analysisCards' | 'queryHistory' | 'contextualSummary' | 'csvData' | 'columnProfiles' | 'dataPreparationPlan' | 'datasetSemanticSnapshot' | 'semanticDatasetVersion' | 'runtimeRunHistory'
> & {
    /** Intent classification findings from the chat intent harness (optional). */
    intentFindings?: IntentClassificationFindings;
    /** Rich query understanding artifact from AGENT-101 (optional). */
    queryUnderstandingArtifact?: QueryUnderstandingArtifact;
    /** Follow-up grounding result from AGENT-102 (optional). */
    groundingResult?: GroundingResult;
};

export const ALL_RUNTIME_TOOLS: ToolName[] = [
    'analysis.create_plan',
    'analysis.correlation',
    'analysis.pivot_matrix',
    'analysis.period_compare',
    'analysis.cohort_retention',
    'analysis.root_cause_breakdown',
    'analysis.validate_metric_mapping',
    'card.aggregate_table',
    'card.add_calculated_column',
    'card.delete',
    'card.review',
    'card.suggestion.apply',
    'card.suggestion.dismiss',
    'ui.highlight_card',
    'ui.change_chart_type',
    'ui.show_card_data',
    'ui.filter_card',
    'cleaning.resume',
    'cleaning.restart',
    'data.mutate',
    'data.query',
    'spreadsheet.filter',
    'workspace.list',
    'workspace.tree',
    'workspace.read',
    'workspace.search',
    'workspace.grep',
    'workspace.head',
    'workspace.diff',
    'workspace.replace',
    'workspace.write',
    'workspace.append',
    'conversation.request_clarification',
];

// AGENT-105: Tool set constants delegate to the centralized 3-phase policy pipeline.
// Legacy names preserved for backward compatibility.
import { getToolsForPhase, getToolsForFocusedAnalysis } from './runtimeToolPolicy';

/**
 * Strict recovery set for contracts that must ask a question before any other
 * runtime action. This intentionally stays narrower than the converse phase,
 * which also supports direct card edits and lightweight evidence queries.
 */
export const CLARIFICATION_ONLY_TOOLS: ToolName[] = ['conversation.request_clarification'];
/** @deprecated Use getToolsForPhase('explore') */
export const DATA_QUERY_RECOVERY_TOOLS: ToolName[] = getToolsForPhase('explore');
/** @deprecated Use getToolsForPhase('explore') */
export const READ_ONLY_RUNTIME_TOOLS: ToolName[] = getToolsForPhase('explore');
export const FOCUSED_ANALYSIS_SUPPORT_TOOLS: ToolName[] = ['data.query', 'spreadsheet.filter'];
/** @deprecated Use getToolsForPhase('analyze') */
export const VISUALIZATION_RUNTIME_TOOLS: ToolName[] = getToolsForPhase('analyze');
export const DEFAULT_ANTI_REPEAT_HINT = 'Do not repeat the same action unless the arguments, columns, filters, or supporting evidence materially change.';

export const dedupeTools = (tools: ToolName[]) => Array.from(new Set(tools));
export const dedupeStrings = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
export const safeStringList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
export const formatJsonBlock = (value: unknown) => JSON.stringify(value, null, 2);
export const buildGenericToolSet = (): ToolName[] => [...ALL_RUNTIME_TOOLS];
export const buildReadOnlyToolSet = (): ToolName[] => getToolsForPhase('explore');
export const buildVisualizationToolSet = (): ToolName[] => getToolsForPhase('analyze');
export const buildFocusedAnalysisToolSet = (...tools: ToolName[]): ToolName[] =>
    dedupeTools([...getToolsForFocusedAnalysis(tools[0]), ...tools.slice(1)]);
export const preserveMetricDerivationTemplate = (contract: RuntimeStepContract): MetricDerivationTemplate | null =>
    contract.taskMode === 'derive_metric'
        ? contract.metricDerivationTemplate ?? null
        : null;

export const createStepContract = ({
    goalSummary,
    taskMode,
    completionMode,
    expectedOutcome,
    oodaePhase,
    clarificationState,
    allowedToolNames,
    allowAssistantResponse,
    preferClarification,
    instruction,
    antiRepeatHint,
    toolPhase,
    visibleEvidenceSummary,
    visibleTraceSummary,
    groundedArtifactSummary,
    answerableEvidenceSummary,
    knownBlockers,
    analysisBriefSummary,
    metricBlockers,
    metricDerivationTemplate,
    pivotPreference,
    pivotDecision,
    observationSnapshot,
    taskCommitment,
    fallbackPolicy,
    doneCriteria,
    clarificationBudget,
    recoveryDirective,
    reconciliation,
}: {
    goalSummary: string;
    taskMode: RuntimeStepContract['taskMode'];
    completionMode: RuntimeStepContract['completionMode'];
    expectedOutcome: RuntimeStepContract['expectedOutcome'];
    oodaePhase?: RuntimeStepContract['oodaePhase'];
    clarificationState?: RuntimeStepContract['clarificationState'];
    allowedToolNames: ToolName[];
    allowAssistantResponse: boolean;
    preferClarification: boolean;
    instruction: string;
    antiRepeatHint?: string;
    toolPhase?: string | null;
    visibleEvidenceSummary?: string | null;
    visibleTraceSummary?: string | null;
    groundedArtifactSummary?: string | null;
    answerableEvidenceSummary?: string | null;
    knownBlockers?: string[];
    analysisBriefSummary?: string | null;
    metricBlockers?: string[];
    metricDerivationTemplate?: MetricDerivationTemplate | null;
    pivotPreference?: PivotPreference;
    pivotDecision?: PivotDecision | null;
    observationSnapshot?: RuntimeStepContract['observationSnapshot'];
    taskCommitment?: RuntimeStepContract['taskCommitment'];
    fallbackPolicy?: RuntimeStepContract['fallbackPolicy'];
    doneCriteria?: RuntimeStepContract['doneCriteria'];
    clarificationBudget?: RuntimeStepContract['clarificationBudget'];
    recoveryDirective?: RuntimeStepContract['recoveryDirective'];
    reconciliation?: RuntimeStepContract['reconciliation'];
}): RuntimeStepContract => {
    const dedupedAllowedTools = dedupeTools(allowedToolNames);
    return {
        goalSummary,
        taskMode,
        completionMode,
        expectedOutcome,
        oodaePhase: oodaePhase ?? 'orient',
        clarificationState: clarificationState ?? 'resolved',
        allowedToolNames: dedupedAllowedTools,
        denyOverrides: ALL_RUNTIME_TOOLS.filter(toolName => !dedupedAllowedTools.includes(toolName)),
        allowAssistantResponse,
        preferClarification,
        antiRepeatHint: antiRepeatHint ?? DEFAULT_ANTI_REPEAT_HINT,
        toolPhase: toolPhase ?? null,
        visibleEvidenceSummary: visibleEvidenceSummary ?? null,
        visibleTraceSummary: visibleTraceSummary ?? null,
        groundedArtifactSummary: groundedArtifactSummary ?? null,
        answerableEvidenceSummary: answerableEvidenceSummary ?? null,
        knownBlockers: knownBlockers?.filter(Boolean) ?? [],
        analysisBriefSummary: analysisBriefSummary ?? null,
        metricBlockers: metricBlockers?.filter(Boolean) ?? [],
        metricDerivationTemplate: metricDerivationTemplate ?? null,
        pivotPreference: pivotPreference ?? 'none',
        pivotDecision: pivotDecision ?? null,
        analystCapabilitySelection: null,
        instruction,
        observationSnapshot: observationSnapshot ?? null,
        taskCommitment: taskCommitment ?? null,
        fallbackPolicy: fallbackPolicy ?? null,
        doneCriteria: doneCriteria ?? null,
        clarificationBudget: clarificationBudget ?? null,
        recoveryDirective: recoveryDirective ?? null,
        reconciliation: reconciliation ?? null,
    };
};

// Tools that must stay in allowedToolNames when the contract expects a card outcome,
// regardless of analyst capability narrowing. Without these the agent has no path to
// produce a card and enters a dead loop (blocked tool + blocked prose).
const CARD_OUTCOME_ESSENTIAL_TOOLS: ToolName[] = [
    'analysis.create_plan',
    'data.query',
    'data.mutate',
];

export const withAnalystCapabilitySelection = (
    contract: RuntimeStepContract,
    selection: AnalystCapabilitySelection | null | undefined,
): RuntimeStepContract => {
    if (
        contract.completionMode === 'final_response'
        || contract.completionMode === 'clarification'
        || JSON.stringify(contract.allowedToolNames ?? []) === JSON.stringify(CLARIFICATION_ONLY_TOOLS)
    ) {
        return {
            ...contract,
            analystCapabilitySelection: null,
        };
    }

    if (!selection) {
        return {
            ...contract,
            analystCapabilitySelection: null,
        };
    }

    const packagedToolNames = dedupeTools(
        (selection.recipe?.allowedToolNames ?? selection.skill?.allowedToolNames ?? [])
            .filter(toolName => contract.allowedToolNames?.includes(toolName)),
    );

    if (packagedToolNames.length === 0) {
        return {
            ...contract,
            analystCapabilitySelection: null,
        };
    }

    // When the contract expects a card, preserve essential card-producing tools
    // that were in the original contract but excluded by the capability intersection.
    // This prevents the dead loop where expectedOutcome='card' but all card tools
    // are denied by the narrowed selection.
    if (contract.expectedOutcome === 'card') {
        for (const essential of CARD_OUTCOME_ESSENTIAL_TOOLS) {
            if (contract.allowedToolNames?.includes(essential) && !packagedToolNames.includes(essential)) {
                packagedToolNames.push(essential);
            }
        }
    }

    return {
        ...contract,
        allowedToolNames: packagedToolNames,
        denyOverrides: ALL_RUNTIME_TOOLS.filter(toolName => !packagedToolNames.includes(toolName)),
        analystCapabilitySelection: {
            ...selection,
            resolvedToolNames: packagedToolNames,
        },
    };
};

export const resolveAndApplyAnalystCapabilitySelection = (
    contract: RuntimeStepContract,
    message: string,
    state?: Partial<RuntimeContractState>,
) => withAnalystCapabilitySelection(
    contract,
    resolveAnalystCapabilitySelection({
        message,
        contract,
        state,
    }),
);
