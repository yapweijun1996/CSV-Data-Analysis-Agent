/**
 * cleaningPipelineHelpers.ts
 *
 * Constants, type definitions, and private helper functions
 * used by the autonomous cleaning pipeline.
 */

import { createId } from '../../../utils/createId';
import type { AppStore } from '../../../store/useAppStore';
import type {
    CleaningFailureDetail,
    CleaningStrategy,
    CleaningStrategyCandidate,
    ColumnProfile,
    CsvData,
    DataPreparationPlan,
    RuntimeRecoveryStatus,
} from '../../../types';
import { createChatMessage } from '../../../utils/messageState';
import { createCleaningRun, updateCleaningRun } from '../cleaningRunState';
import type { StoreApi } from '../types';
import { buildWorkspaceCsv, WORKSPACE_DATASET_CLEAN_CSV, WORKSPACE_DATASET_RAW_CSV } from '../workspaceFileUtils';
import { createAiCleaningProgramFromPlan } from '../execution/aiCleaningProgram';
import type { buildDeterministicCleaningFallbackAction } from './deterministicCleaningFallback';
import { buildCleaningVerificationReport, getVerificationSignalValue } from '../cleaningVerification';
import { getTranslation } from '../../../utils/localization';

export const MAX_LLM_CLEANING_ATTEMPTS = 2;
export const MAX_SEMANTIC_INTENT_ATTEMPTS = 2;
export const SAMPLE_SIZE = 20;
export const SQL_PRECHECK_FINDING_PREVIEW_LIMIT = 3;
export const STRUCTURAL_VERIFICATION_SIGNAL_KEYS = new Set([
    'label_layer_retention_complete',
    'multi_header_layer_retention_rate',
    'hierarchy_depth_retention_rate',
]);

export type AutonomousCleaningStrategyKind =
    | 'deterministic_cleanup'
    | 'deterministic_reshape'
    | 'llm_guided';

export const cloneCsvData = (data: CsvData): CsvData => ({
    ...data,
    data: data.data.map(row => ({ ...row })),
    metadataRows: [...(data.metadataRows ?? [])].map(row => [...row]),
    headerLayers: [...(data.headerLayers ?? [])].map(row => [...row]),
    summaryRows: [...(data.summaryRows ?? [])].map(row => ({ ...row })),
});

export const buildPlanExplanation = (
    rowCount: number,
    blockedByPrecheck: boolean,
    language: AppStore['settings']['language'],
) => blockedByPrecheck
    ? getTranslation('autonomous_cleaning_plan_explanation_blocked', language, { rowCount })
    : getTranslation('autonomous_cleaning_plan_explanation_passed', language, { rowCount });

export const updateWorkspaceFiles = (previous: AppStore['workspaceFiles'], rawData: CsvData, cleanedData: CsvData) => ({
    ...(previous ?? {}),
    [WORKSPACE_DATASET_RAW_CSV]: buildWorkspaceCsv(rawData),
    [WORKSPACE_DATASET_CLEAN_CSV]: buildWorkspaceCsv(cleanedData),
});

export const flattenProgramOperations = (plan: NonNullable<DataPreparationPlan['aiProgram']>) =>
    plan.steps.flatMap(step => step.operations);

export const createSnapshotId = () => createId('snapshot');

/**
 * Map a cleaning pipeline terminal reason to a recovery status.
 * Returns `null` when the reason does not clearly map (let the caller decide).
 */
export const resolveCleaningRecoveryStatus = (
    rollbackReason: string | null | undefined,
    succeeded: boolean,
): RuntimeRecoveryStatus => {
    if (succeeded && !rollbackReason) return 'ideal';

    switch (rollbackReason) {
        case 'deterministic_cleanup_failed':
            // Deterministic path failed but LLM fallback may have succeeded.
            return succeeded ? 'recovered' : 'degraded';
        case 'deterministic_recovery_failed':
            return 'degraded';
        case 'deterministic_shaping_failed':
            return 'degraded';
        case 'llm_budget_exhausted':
            return 'degraded';
        case 'semantic_intent_failed':
            return 'failed';
        case 'shape_verification_failed':
            return succeeded ? 'recovered' : 'degraded';
        case 'numeric_reconciliation_failed':
            return succeeded ? 'recovered' : 'degraded';
        default:
            return succeeded ? 'ideal' : 'failed';
    }
};

export const formatSqlPrecheckBlockMessage = (sqlPrecheck: { summary: string; findings: Array<{ severity?: string; message?: string }> }) => {
    const prioritizedMessages = sqlPrecheck.findings
        .filter(finding => finding.severity === 'block' && typeof finding.message === 'string' && finding.message.trim().length > 0)
        .map(finding => finding.message!.trim());

    const visibleMessages = prioritizedMessages.length > 0
        ? prioritizedMessages
        : sqlPrecheck.findings
            .filter(finding => (finding.severity === 'warn' || finding.severity === 'block') && typeof finding.message === 'string' && finding.message.trim().length > 0)
            .map(finding => finding.message!.trim());

    if (visibleMessages.length === 0) {
        return sqlPrecheck.summary;
    }

    const preview = visibleMessages.slice(0, SQL_PRECHECK_FINDING_PREVIEW_LIMIT).join(' | ');
    const remaining = visibleMessages.length - SQL_PRECHECK_FINDING_PREVIEW_LIMIT;
    return `${sqlPrecheck.summary} ${preview}${remaining > 0 ? ` | +${remaining} more.` : ''}`;
};

export const toOutputColumns = (outputColumns: Array<{ name: string; type: string }>): ColumnProfile[] =>
    outputColumns.map(column => ({
        name: column.name,
        type: column.type === 'date'
            ? 'date'
            : column.type === 'number' || column.type === 'numerical' || column.type === 'currency' || column.type === 'percentage'
                ? 'numerical'
                : column.type === 'boolean'
                    ? 'categorical'
                    : 'categorical',
        missingPercentage: 0,
    }));

export const toDeterministicProgram = (
    fallbackAction: ReturnType<typeof buildDeterministicCleaningFallbackAction>,
    fallbackProfiles: ColumnProfile[],
    explanationPrefix: string,
) => {
    if (fallbackAction?.type !== 'tool_call' || fallbackAction.toolName !== 'data.mutate') {
        return null;
    }

    const operations = Array.isArray(fallbackAction.args?.operations) ? fallbackAction.args.operations : [];
    const outputColumns = Array.isArray(fallbackAction.args?.outputColumns)
        ? toOutputColumns(fallbackAction.args.outputColumns)
        : fallbackProfiles;
    const plan: DataPreparationPlan = {
        explanation: typeof fallbackAction.args?.explanation === 'string'
            ? fallbackAction.args.explanation
            : explanationPrefix,
        operations,
        outputColumns,
        planStatus: operations.length > 0 ? 'operations' : 'schema_only',
        consistencyIssues: [],
    };
    const program = createAiCleaningProgramFromPlan(plan, outputColumns.length > 0 ? outputColumns : fallbackProfiles);
    program.source = 'semantic_deterministic';
    program.explanation = `${explanationPrefix} ${program.explanation}`.trim();
    return { plan, program };
};

export const isStructuralVerificationSignal = (signalKey: string | null | undefined) =>
    typeof signalKey === 'string' && STRUCTURAL_VERIFICATION_SIGNAL_KEYS.has(signalKey);

export const translateCleaning = (
    language: AppStore['settings']['language'],
    key: string,
    params?: Record<string, string | number>,
) => getTranslation(key, language, params);

// ─── Extracted from autonomousCleaningPipeline.ts (REFACTOR-101 P2-B) ───

export const MAX_CLEANING_LOOP_ROUNDS = 3;
export const NOISE_LEAKAGE_THRESHOLD = 0.02;
export const CLEANING_ITERATION_ARTIFACT_PATHS = [
    '/cleaning/row-inspection.json',
    '/cleaning/row-classification.json',
    '/cleaning/cleaning-loop-history.json',
];

export const getVerificationRates = (report: ReturnType<typeof buildCleaningVerificationReport>) => ({
    noiseLeakageRate: Number(getVerificationSignalValue(report, 'noise_leakage_rate') ?? 0),
    repeatedHeaderLeakageRate: Number(getVerificationSignalValue(report, 'repeated_header_leakage_rate') ?? 0),
});

export const logCleaningLoopStage = (
    round: number,
    stage: string,
    startedAt: number,
    detail?: string,
) => {
    const suffix = detail ? ` | ${detail}` : '';
    console.log(`[Perf:CleaningLoop][round ${round}] ${stage}: ${Math.round(performance.now() - startedAt)}ms${suffix}`);
};

export const buildIterationFailureSignature = (record: {
    rowCountAfter: number;
    residualUnknownRowCount: number;
    residualSummaryLikeRowCount: number;
    failureSignalKey: string | null;
}) => JSON.stringify({
    rowCountAfter: record.rowCountAfter,
    residualUnknownRowCount: record.residualUnknownRowCount,
    residualSummaryLikeRowCount: record.residualSummaryLikeRowCount,
    failureSignalKey: record.failureSignalKey,
});

export const buildDeterministicCleanupCandidate = (
    workingProfiles: AppStore['columnProfiles'],
    operations: NonNullable<DataPreparationPlan['operations']>,
    inspectionSummary: string,
): CleaningStrategyCandidate => {
    const deterministicPlan: DataPreparationPlan = {
        explanation: `Runtime deterministic cleanup removed high-confidence report-noise rows. ${inspectionSummary}`,
        operations,
        outputColumns: workingProfiles,
        planStatus: operations.length > 0 ? 'operations' : 'schema_only',
        consistencyIssues: [],
    };
    const program = createAiCleaningProgramFromPlan(deterministicPlan, workingProfiles);
    program.source = 'semantic_deterministic';
    return {
        strategyId: `deterministic-cleanup-${Date.now()}`,
        source: 'deterministic_cleanup',
        program,
        plan: deterministicPlan,
        intentSummary: 'Deterministic cleanup-only fallback for the current working dataset.',
        requires: [],
        priority: 99,
    };
};

export const buildAttemptRecord = (
    candidate: CleaningStrategyCandidate,
    round: number,
    reasonCode: string | null,
    executed: boolean,
) => ({
    strategyId: candidate.strategyId,
    source: candidate.source,
    requirement: candidate.requires[0] ?? null,
    round,
    reasonCode,
    executed,
});

export const updateRecoveryStateForAttempt = (
    store: StoreApi,
    candidate: CleaningStrategyCandidate,
    round: number,
    reasonCode: string | null,
    executed: boolean,
) => {
    store.setState(prev => ({
        cleaningRun: updateCleaningRun(prev.cleaningRun, {
            recoveryState: {
                activeStrategyId: executed ? candidate.strategyId : prev.cleaningRun?.recoveryState?.activeStrategyId ?? null,
                attemptedStrategies: [
                    ...(prev.cleaningRun?.recoveryState?.attemptedStrategies ?? []),
                    buildAttemptRecord(candidate, round, reasonCode, executed),
                ].slice(-12),
                lastReasonCode: reasonCode,
                recoveredBy: prev.cleaningRun?.recoveryState?.recoveredBy ?? null,
                analysisMode: prev.cleaningRun?.recoveryState?.analysisMode ?? 'normal',
            },
        }),
    }));
};

export const applyFailureDetail = (
    store: StoreApi,
    detail: CleaningFailureDetail,
) => {
    store.setState(prev => ({
        cleaningRun: updateCleaningRun(prev.cleaningRun, {
            userFacingMessage: detail.summary,
            actionTakenMessage: detail.actionTaken ?? null,
            dataSafetyMessage: detail.dataSafety ?? null,
            nextStateMessage: detail.nextState ?? null,
            technicalDetail: detail.technicalDetail ?? null,
        }),
    }));
};

export const setRunningState = (
    store: StoreApi,
    resume: boolean,
    strategy: CleaningStrategy,
    strategyKind: AutonomousCleaningStrategyKind,
) => {
    store.setState(prev => ({
        cleaningRun: updateCleaningRun(prev.cleaningRun ?? createCleaningRun(), {
            status: 'running',
            lastError: null,
            shouldAutoResume: false,
            strategyKind,
            strategy,
            preExecutionSnapshotId: prev.cleaningRun?.preExecutionSnapshotId ?? createSnapshotId(),
            numericReconciliationStatus: 'pending',
            sqlPrecheckStatus: 'pending',
            semanticIntentStatus: strategy === 'report_shape_strategy' ? 'pending' : null,
            recoveryStatus: 'idle',
            rollbackReason: null,
            userFacingMessage: null,
            actionTakenMessage: null,
            dataSafetyMessage: null,
            nextStateMessage: null,
            technicalDetail: null,
            recoveryState: {
                activeStrategyId: null,
                attemptedStrategies: [],
                lastReasonCode: null,
                recoveredBy: null,
                analysisMode: 'normal',
            },
            lastExecutionTrace: resume
                ? ['AI cleaning resumed from the latest cleaned snapshot.']
                : ['AI cleaning in progress.'],
        }),
        chatHistory: resume
            ? prev.chatHistory
            : [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    text: translateCleaning(prev.settings.language, 'autonomous_cleaning_running'),
                    timestamp: new Date(),
                    type: 'ai_cleaning_step',
                    cleaningRunId: prev.cleaningRun?.runId,
                    cleaningStep: {
                        stepId: `start-${Date.now()}`,
                        kind: 'inspect',
                        path: WORKSPACE_DATASET_CLEAN_CSV,
                        status: 'done',
                        diffSummary: 'Started autonomous AI cleaning pipeline.',
                    },
                }),
            ],
    }));
};
