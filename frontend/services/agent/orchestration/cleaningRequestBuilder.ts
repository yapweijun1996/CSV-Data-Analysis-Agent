import type { ModelMessage } from 'ai';
import type { AiAction, ToolDescriptor } from '../../../types';
import { buildToolAvailabilityContext, buildToolGovernanceSnapshot } from '../tools/toolGovernance';
import { buildBuiltinToolRegistry, resolveAllowedTools } from '../tools/toolRegistry';
import type { StoreApi } from '../types';
import { getWideCrosstabReason } from '../cleaningVerification';
import {
    WORKSPACE_DATASET_CLEAN_CSV,
    WORKSPACE_DATASET_RAW_CSV,
    WORKSPACE_INTAKE_IR_JSON,
    WORKSPACE_REPORT_CONTEXT_JSON,
    WORKSPACE_RUNTIME_TABLE_ASSESSMENT_JSON,
    buildWorkspaceCsv,
} from '../workspaceFileUtils';
import { getCleaningOperationContractSummary } from './cleaningRuntimePolicy';
import type { CleaningStrategyDecision } from './cleaningStrategyResolver';
import { buildIntakeDiagnosticsSnapshot, evaluateIntakeDiagnostics } from '../intakeDiagnosticsPolicy';
import {
    getAllowedCleaningToolNames,
    getCleaningPhaseInstruction,
    type CleaningPhase,
    type CleaningRuntimeState,
} from './cleaningRuntimePolicy';
import { shouldRequireRawFirstInspection } from './rawReportContract';
import { buildCleaningRuntimePrompts } from '../../prompts/runtime/cleaningRuntimePrompts';

const PREVIEW_LENGTH = 2500;

export type CleaningLlmRequest = {
    messages: ModelMessage[];
    tools: ToolDescriptor[];
    toolChoice?: 'auto' | 'required' | 'none' | { type: 'tool'; toolName: string };
    stream: false;
};

const truncate = (value: string, maxLength = PREVIEW_LENGTH) =>
    value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n... [truncated]`;

const stringifyPreview = (value: unknown, maxLength = 1200) =>
    truncate(JSON.stringify(value, null, 2), maxLength);

const summarizePreferredAction = (decision: CleaningStrategyDecision) => {
    if (decision.preferredAction?.type !== 'tool_call') return '(none)';
    return stringifyPreview({
        toolName: decision.preferredAction.toolName,
        args: decision.preferredAction.args ?? {},
    }, 1400);
};

const getWideCrosstabCorrection = (store: StoreApi) => {
    const reason = getWideCrosstabReason(store.getState().rawCsvData, store.getState().csvData);
    if (!reason) return null;
    return `${reason} Use data.mutate with deterministic operations, preferably unpivot_columns, to convert identifier columns such as Code and Description into a long table with one key/value pair per row.`;
};

export const serializeCleaningRequestForTelemetry = (request: CleaningLlmRequest) => ({
    toolChoice: request.toolChoice ?? null,
    stream: Boolean(request.stream),
    roleMessages: request.messages.map(message => ({
        role: message.role,
        content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
    })),
    tools: request.tools ?? null,
    responseSchema: null,
});

export const buildCleaningRequest = (
    store: StoreApi,
    runtime: CleaningRuntimeState,
    selfCorrectionFeedback: string | null,
    strategyDecision: CleaningStrategyDecision,
): { request: CleaningLlmRequest; toolPolicySnapshot: ReturnType<typeof buildToolGovernanceSnapshot> } => {
    const state = store.getState();
    const phase = runtime.phase as Exclude<CleaningPhase, 'done' | 'failed'>;
    const provider = state.settings.provider;
    const allColumnNames = state.columnProfiles.map(profile => profile.name);
    const resolvedRegistry = resolveAllowedTools(
        buildBuiltinToolRegistry(allColumnNames),
        buildToolAvailabilityContext(state, {
            cardIds: [],
            hasCards: false,
            cleaningCompleted: false,
            toolStage: 'cleaning',
        }),
    );
    const allowedToolNames = getAllowedCleaningToolNames(phase, provider, resolvedRegistry);
    const tools = resolvedRegistry.exposedTools.filter(tool => allowedToolNames.has(tool.name));
    const allowedDecisions = resolvedRegistry.allowedTools.filter(decision => allowedToolNames.has(decision.toolName));
    const phaseBlockedDecisions = resolvedRegistry.allowedTools
        .filter(decision => !allowedToolNames.has(decision.toolName))
        .map(decision => ({
            ...decision,
            allowed: false,
            source: 'availability' as const,
            reason: `Tool "${decision.toolName}" is not exposed during the ${phase} phase.`,
        }));
    const rawPreview = truncate(buildWorkspaceCsv(state.rawCsvData));
    const cleanedPreview = truncate(buildWorkspaceCsv(state.csvData));
    const reportContextPreview = typeof state.workspaceFiles?.[WORKSPACE_REPORT_CONTEXT_JSON] === 'string'
        ? truncate(String(state.workspaceFiles[WORKSPACE_REPORT_CONTEXT_JSON]), 1500)
        : '';
    const intakeDiagnostics = buildIntakeDiagnosticsSnapshot(state.rawCsvData, state.csvData, state.rawIntakeIr, runtime.tableAssessment);
    const intakeGuard = evaluateIntakeDiagnostics(intakeDiagnostics);
    const intakeDiagnosticsPreview = stringifyPreview({
        strategy: intakeDiagnostics.strategy,
        confidence: intakeDiagnostics.confidence,
        delimiter: intakeDiagnostics.delimiter,
        quoteChar: intakeDiagnostics.quoteChar,
        warnings: intakeDiagnostics.warnings,
        candidateCount: intakeDiagnostics.candidateCount,
        parserErrorCount: intakeDiagnostics.parserErrorCount,
        sampledNonEmptyLines: intakeDiagnostics.sampledNonEmptyLines,
        topScore: intakeDiagnostics.topScore,
        runnerUpScore: intakeDiagnostics.runnerUpScore,
        selectedHeaderRowIndex: intakeDiagnostics.selectedHeaderRowIndex,
        bodyStartIndex: intakeDiagnostics.bodyStartIndex,
        summaryStartIndex: intakeDiagnostics.summaryStartIndex,
        metadataRowCount: intakeDiagnostics.metadataRowCount,
        parameterRowCount: intakeDiagnostics.parameterRowCount,
        repeatedHeaderRowCount: intakeDiagnostics.repeatedHeaderRowCount,
        segmentCountsByKind: intakeDiagnostics.segmentCountsByKind,
        singleColumnFallbackApplied: intakeDiagnostics.singleColumnFallbackApplied,
        bodyEvidenceKind: intakeDiagnostics.bodyEvidenceKind,
    });
    const wideCrosstabReason = getWideCrosstabReason(state.rawCsvData, state.csvData);
    const requiresRawFirstInspect = runtime.phase === 'inspect'
        && shouldRequireRawFirstInspection(state.rawCsvData, state.rawIntakeIr);
    const operationContractSummary = getCleaningOperationContractSummary().join('\n');
    const recentActions = (state.workspaceActionHistory ?? [])
        .slice(-8)
        .map(entry => `${entry.operation} ${entry.path} ${entry.success ? 'ok' : 'failed'}: ${entry.message}`)
        .join('\n');
    const phaseContextPreview = stringifyPreview({
        strategy: {
            kind: strategyDecision.kind,
            targetShape: strategyDecision.targetShape ?? null,
            reason: strategyDecision.reason,
            verificationGap: strategyDecision.verificationGap,
            guidance: strategyDecision.promptGuidance,
            preferredAction: summarizePreferredAction(strategyDecision),
        },
        irGate: strategyDecision.irGate
            ? {
                stableSingleLayerDetail: strategyDecision.irGate.isStableSingleLayerDetail,
                allowsDeterministicCleanup: strategyDecision.irGate.allowsDeterministicCleanup,
                allowsDeterministicReshape: strategyDecision.irGate.allowsDeterministicReshape,
                requiresInspectFirst: strategyDecision.irGate.requiresInspectFirst,
                reason: strategyDecision.irGate.reason,
            }
            : null,
        intake: {
            diagnostics: JSON.parse(intakeDiagnosticsPreview),
            guidance: intakeGuard.cleaningPromptSummary,
            warnDuringCleaning: intakeGuard.shouldWarnDuringCleaning,
            blockAutomaticAnalysis: intakeGuard.shouldBlockAutomaticAnalysis,
        },
        runtimeAssessment: runtime.tableAssessment
            ? {
                source: runtime.tableAssessment.source,
                status: runtime.tableAssessment.status,
                headerRowIndex: runtime.tableAssessment.headerRowIndex,
                bodyStartIndex: runtime.tableAssessment.bodyStartIndex,
                requiresReshape: runtime.tableAssessment.requiresReshape,
                requiresCleanupOnly: runtime.tableAssessment.requiresCleanupOnly,
                reason: runtime.tableAssessment.reason,
            }
            : null,
        wideCrosstabReason,
    }, 2400);
    const { systemPrompt, userPrompt } = buildCleaningRuntimePrompts({
        phase,
        providerPhaseInstruction: getCleaningPhaseInstruction(phase, provider),
        cleanPath: WORKSPACE_DATASET_CLEAN_CSV,
        rawPath: WORKSPACE_DATASET_RAW_CSV,
        reportContextPath: WORKSPACE_REPORT_CONTEXT_JSON,
        intakeIrPath: WORKSPACE_INTAKE_IR_JSON,
        runtimeAssessmentPath: WORKSPACE_RUNTIME_TABLE_ASSESSMENT_JSON,
        operationContractSummary,
        requiresRawFirstInspect,
        shouldWarnDuringCleaning: intakeGuard.shouldWarnDuringCleaning,
        shouldBlockAutomaticAnalysis: intakeGuard.shouldBlockAutomaticAnalysis,
        wideCrosstabReason,
        phaseContextPreview,
        reportContextPreview: truncate(reportContextPreview || '(not available)', 900),
        rawPreview,
        cleanedPreview,
        recentActions,
        selfCorrectionFeedback,
    });

    return {
        request: {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            tools,
            toolChoice: phase === 'inspect'
                ? { type: 'tool', toolName: 'workspace.read' }
                : phase === 'verify'
                    ? { type: 'tool', toolName: 'workspace.read' }
                    : { type: 'tool', toolName: 'data.mutate' },
            stream: false,
        },
        toolPolicySnapshot: buildToolGovernanceSnapshot({
            stage: resolvedRegistry.stage,
            phase,
            allowedTools: allowedDecisions,
            blockedTools: [...resolvedRegistry.blockedTools, ...phaseBlockedDecisions],
            diagnostics: resolvedRegistry.diagnostics,
        }),
    };
};

export const buildDeterministicRepairFeedback = (decision: CleaningStrategyDecision, fallbackDetail?: string | null) =>
    [
        decision.verificationGap ? `Repair the current verification gap: ${decision.verificationGap}.` : '',
        fallbackDetail ?? '',
        decision.promptGuidance,
    ].filter(Boolean).join(' ');

export const getWideCrosstabRepairGuidance = (store: StoreApi) => getWideCrosstabCorrection(store);
