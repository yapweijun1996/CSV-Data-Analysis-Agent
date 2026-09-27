/**
 * cleaningPipelinePersistence.ts
 *
 * Finalizes and persists cleaned data after successful execution.
 * Handles label normalization, SQL precheck, and store commit.
 */

import type { AppStore } from '../../../store/useAppStore';
import type {
    CleaningSemanticIntent,
    ColumnProfile,
    CsvData,
    DataPreparationPlan,
    SandboxTransformationOutcome,
    SandboxTransformationProposal,
} from '../../../types';
import { applyDataOperations } from '../execution/dataOperationRunner';
import { createChatMessage } from '../../../utils/messageState';
import { updateCleaningRun } from '../cleaningRunState';
import type { StoreApi } from '../types';
import { profileDataWithWorker } from '../../workers/dataWorkerClient';
import { WORKSPACE_DATASET_CLEAN_CSV } from '../workspaceFileUtils';
import { ensureDuckDbSessionSync } from '../../duckdb/storeSessionSync';
import { runSqlPrecheck } from '../execution/sqlPrecheck';
import { createWorkerDiagnosticsTelemetryReporter } from '../../workers/workerDiagnostics';
import { applyPreparedLabelNormalization } from '../execution/labelNormalization';
import { buildDeterministicNormalizationPlan } from '../../ai/dataPreparer';
import { buildEffectiveColumnRegistryFromState } from '../../data/columnRegistry';
import {
    buildPlanExplanation,
    formatSqlPrecheckBlockMessage,
    translateCleaning,
    updateWorkspaceFiles,
} from './cleaningPipelineHelpers';
import { isStructuralMetadataColumn } from '../structuralMetadata';
import { commitVerifiedPrimaryTableTransformation } from '../../data/datasetBundle';
import { commitVerifiedSandboxTransformation } from '../../data/sandboxDatasetCommit';

const logCleaningPersistStage = (stage: string, startedAt: number, detail?: string) => {
    const suffix = detail ? ` | ${detail}` : '';
    console.log(`[Perf:CleaningPersist] ${stage}: ${Math.round(performance.now() - startedAt)}ms${suffix}`);
};

export const persistSuccessfulCleaning = async ({
    store,
    rawData,
    latestState,
    workingData,
    workingProfiles,
    plan,
    semanticIntent,
    sandboxCommit,
}: {
    store: StoreApi;
    rawData: CsvData;
    latestState: AppStore;
    workingData: CsvData;
    workingProfiles: ColumnProfile[];
    plan: DataPreparationPlan;
    semanticIntent?: CleaningSemanticIntent | null;
    sandboxCommit?: {
        proposal: SandboxTransformationProposal;
        outcome: SandboxTransformationOutcome;
    } | null;
}) => {
    const persistStartedAt = performance.now();
    const degradedSafeMode = latestState.cleaningRun?.recoveryState?.analysisMode === 'degraded_safe';
    const reportDiagnostics = createWorkerDiagnosticsTelemetryReporter(store);
    const deterministicNormalization = buildDeterministicNormalizationPlan(
        {
            explanation: plan.explanation,
            operations: [],
            outputColumns: workingProfiles,
            planStatus: 'schema_only',
            consistencyIssues: [],
        },
        workingProfiles,
        workingData.data,
    );

    let normalizedData = workingData;
    let normalizedProfiles = workingProfiles;
    let normalizedPlan: DataPreparationPlan = {
        ...plan,
        outputColumns: workingProfiles,
    };

    if (deterministicNormalization.plan.operations.length > 0) {
        const normalizationStartedAt = performance.now();
        normalizedData = {
            ...workingData,
            data: applyDataOperations(workingData.data, deterministicNormalization.plan.operations, { allowEmptyResult: false }).data,
        };
        normalizedProfiles = (await profileDataWithWorker(normalizedData.data, undefined, reportDiagnostics)).profiles;
        normalizedPlan = {
            ...normalizedPlan,
            operations: [...plan.operations, ...deterministicNormalization.plan.operations],
            outputColumns: normalizedProfiles,
            planStatus: 'operations',
            normalizedPlaceholderColumns: [
                ...(plan.normalizedPlaceholderColumns ?? []),
                ...deterministicNormalization.normalizedPlaceholderColumns,
            ],
            numericStringNormalizedColumns: [
                ...(plan.numericStringNormalizedColumns ?? []),
                ...deterministicNormalization.numericStringNormalizedColumns,
            ],
        };

        if (deterministicNormalization.normalizedPlaceholderColumns.length > 0) {
            latestState.logTelemetryEvent({
                stage: 'planner_ready',
                responseType: 'data_prep_placeholder_normalized',
                detail: `Normalized placeholder values in ${deterministicNormalization.normalizedPlaceholderColumns.join(', ')} before SQL readiness checks.`,
                meta: {
                    reasonCode: 'data_prep_placeholder_normalized',
                    normalizedPlaceholderColumns: deterministicNormalization.normalizedPlaceholderColumns,
                },
            });
        }
        if (deterministicNormalization.numericStringNormalizedColumns.length > 0) {
            latestState.logTelemetryEvent({
                stage: 'planner_ready',
                responseType: 'data_prep_numeric_string_casted',
                detail: `Cast numeric-looking string columns before SQL readiness checks: ${deterministicNormalization.numericStringNormalizedColumns.join(', ')}.`,
                meta: {
                    reasonCode: 'data_prep_numeric_string_casted',
                    numericStringNormalizedColumns: deterministicNormalization.numericStringNormalizedColumns,
                },
            });
        }
        logCleaningPersistStage(
            'deterministic_normalization',
            normalizationStartedAt,
            `ops=${deterministicNormalization.plan.operations.length}, rows=${normalizedData.data.length}`,
        );
    }

    const labelNormalizationStartedAt = performance.now();
    const labelNormalizationResult = applyPreparedLabelNormalization(normalizedData, normalizedProfiles);
    normalizedData = labelNormalizationResult.data;
    normalizedProfiles = labelNormalizationResult.operations.length > 0
        ? (await profileDataWithWorker(normalizedData.data, undefined, reportDiagnostics)).profiles
        : normalizedProfiles;
    const persistedPlan: DataPreparationPlan = {
        ...normalizedPlan,
        operations: [...normalizedPlan.operations, ...labelNormalizationResult.operations],
        outputColumns: normalizedProfiles,
        planStatus: normalizedPlan.planStatus === 'schema_only' && labelNormalizationResult.operations.length > 0
            ? 'operations'
            : normalizedPlan.planStatus,
        ...(labelNormalizationResult.metadata ? { labelNormalization: labelNormalizationResult.metadata } : {}),
    };
    logCleaningPersistStage(
        'label_normalization',
        labelNormalizationStartedAt,
        `ops=${labelNormalizationResult.operations.length}, rows=${normalizedData.data.length}`,
    );
    const persistedExplanation = [
        buildPlanExplanation(normalizedData.data.length, false, latestState.settings.language),
        persistedPlan.explanation,
        labelNormalizationResult.metadata?.summary ?? '',
    ].filter(Boolean).join(' ');

    const commitStateStartedAt = performance.now();
    store.setState(prev => ({
        datasetBundle: sandboxCommit
            ? commitVerifiedSandboxTransformation({
                bundle: prev.datasetBundle,
                preparedData: normalizedData,
                proposal: sandboxCommit.proposal,
                outcome: sandboxCommit.outcome,
                runId: prev.cleaningRun?.runId ?? null,
            })
            : commitVerifiedPrimaryTableTransformation({
                bundle: prev.datasetBundle,
                data: normalizedData,
                operations: persistedPlan.operations,
                runId: prev.cleaningRun?.runId ?? null,
            }),
        columnRegistry: buildEffectiveColumnRegistryFromState({
            ...prev,
            csvData: normalizedData,
            columnProfiles: normalizedProfiles,
            datasetSemanticSnapshot: null,
        }, {
            datasetOverride: normalizedData,
            columnProfilesOverride: normalizedProfiles,
            semanticSnapshotOverride: null,
        }),
        csvData: normalizedData,
        columnProfiles: normalizedProfiles,
        datasetSemanticSnapshot: null,
        semanticStatus: 'idle',
        semanticDatasetVersion: null,
        dataPreparationPlan: {
            ...persistedPlan,
            explanation: persistedExplanation,
        },
        workspaceFiles: updateWorkspaceFiles(prev.workspaceFiles, rawData, normalizedData),
        cleaningRun: updateCleaningRun(prev.cleaningRun, {
            lastVerificationReason: null,
            rollbackReason: null,
            semanticIntentStatus: semanticIntent ? 'passed' : prev.cleaningRun?.semanticIntentStatus ?? null,
            recoveryStatus: prev.cleaningRun?.recoveryStatus === 'running' ? 'passed' : prev.cleaningRun?.recoveryStatus ?? 'idle',
            targetShape: semanticIntent?.targetShape ?? prev.cleaningRun?.targetShape,
            userFacingMessage: degradedSafeMode
                ? translateCleaning(latestState.settings.language, 'cleaning_persist_safe_mode_summary')
                : prev.cleaningRun?.userFacingMessage ?? null,
            actionTakenMessage: degradedSafeMode
                ? translateCleaning(latestState.settings.language, 'cleaning_persist_snapshot_input')
                : prev.cleaningRun?.actionTakenMessage ?? null,
            nextStateMessage: degradedSafeMode
                ? translateCleaning(latestState.settings.language, 'cleaning_persist_labeled_safe')
                : prev.cleaningRun?.nextStateMessage ?? null,
        }),
    }));
    logCleaningPersistStage('commit_state', commitStateStartedAt, `rows=${normalizedData.data.length}, columns=${normalizedProfiles.length}`);

    const duckDbSyncStartedAt = performance.now();
    await ensureDuckDbSessionSync(store, normalizedData, reportDiagnostics);
    logCleaningPersistStage('duckdb_sync', duckDbSyncStartedAt);
    // Filter profiles before precheck: exclude empty columns (100% missing),
    // known constant columns, structural metadata columns (RowRole,
    // ResolvedRowRole, HierarchyDepth, SourceRowIndex, RowClass), and
    // pipeline-specific annotation columns (SectionLabel, HeaderPath,
    // CarryForwardAppliedColumns). These confuse evaluateAiSqlPrecheck into
    // returning 0 candidatePairs → false-positive "blocked" status.
    // Column exclusions are pattern-based, not hardcoded value checks.
    const PIPELINE_ANNOTATION_PATTERN = /^(sectionlabel|headerpath|carryforwardappliedcolumns)$/i;
    const precheckProfiles = normalizedProfiles.filter(p =>
        (p.missingPercentage ?? 0) < 100 &&
        (p.uniqueValues === undefined ? !p.valueRange || p.valueRange[0] !== p.valueRange[1] : p.uniqueValues > 1) &&
        !isStructuralMetadataColumn(p.name) &&
        !PIPELINE_ANNOTATION_PATTERN.test(p.name),
    );
    const sqlPrecheckStartedAt = performance.now();
    const sqlPrecheck = await runSqlPrecheck(normalizedData, precheckProfiles, latestState.settings, reportDiagnostics);
    logCleaningPersistStage(
        'sql_precheck',
        sqlPrecheckStartedAt,
        `status=${sqlPrecheck.status}, candidateProfiles=${precheckProfiles.length}`,
    );
    if ((sqlPrecheck.status === 'blocked' || sqlPrecheck.status === 'warning') && (persistedPlan.numericStringNormalizedColumns?.length ?? 0) > 0) {
        latestState.logTelemetryEvent({
            stage: 'planner_ready',
            responseType: sqlPrecheck.status === 'blocked'
                ? 'sql_precheck_blocked_after_numeric_cleanup'
                : 'sql_precheck_warning_after_numeric_cleanup',
            detail: sqlPrecheck.summary,
            meta: {
                numericStringNormalizedColumns: persistedPlan.numericStringNormalizedColumns,
                reasonCode: sqlPrecheck.status === 'blocked'
                    ? 'sql_precheck_blocked_after_numeric_cleanup'
                    : 'sql_precheck_warning_after_numeric_cleanup',
            },
        });
    }

    const finalizeStateStartedAt = performance.now();
    store.setState(prev => ({
        dataPreparationPlan: prev.dataPreparationPlan
            ? {
                ...prev.dataPreparationPlan,
                explanation: [
                    buildPlanExplanation(normalizedData.data.length, sqlPrecheck.status === 'blocked', latestState.settings.language),
                    persistedPlan.explanation,
                    labelNormalizationResult.metadata?.summary ?? '',
                ].filter(Boolean).join(' '),
                sqlPrecheck,
            }
            : prev.dataPreparationPlan,
        cleaningRun: updateCleaningRun(prev.cleaningRun, {
            sqlPrecheckStatus: sqlPrecheck.status,
            lastError: sqlPrecheck.status === 'blocked' ? sqlPrecheck.summary : null,
        }),
    }));
    logCleaningPersistStage('finalize_state', finalizeStateStartedAt, `sqlStatus=${sqlPrecheck.status}`);

    if (sqlPrecheck.status === 'blocked') {
        const sqlPrecheckMessage = formatSqlPrecheckBlockMessage(sqlPrecheck);
        latestState.addProgress?.(
            translateCleaning(latestState.settings.language, 'autonomous_cleaning_sql_precheck_blocked_progress', { message: sqlPrecheckMessage }),
            'warning',
            latestState.settings.complexModel,
        );
        store.setState(prev => ({
            cleaningRun: updateCleaningRun(prev.cleaningRun, {
                status: 'completed',
                sqlPrecheckStatus: 'blocked',
                lastError: sqlPrecheckMessage,
            }),
            chatHistory: [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    text: translateCleaning(prev.settings.language, 'autonomous_cleaning_sql_precheck_blocked_chat', { message: sqlPrecheckMessage }),
                    timestamp: new Date(),
                    type: 'ai_cleaning_step',
                    cleaningRunId: prev.cleaningRun?.runId,
                    cleaningStep: {
                        stepId: `sql-precheck-blocked-${Date.now()}`,
                        kind: 'verify',
                        toolName: 'sql.precheck',
                        path: WORKSPACE_DATASET_CLEAN_CSV,
                        status: 'blocked',
                        diffSummary: sqlPrecheckMessage,
                    },
                }),
            ],
        }));
        // Graceful degradation: do not return early — let downstream analysis
        // proceed with whatever valid data exists (categorical distributions, etc.).
    } else if (sqlPrecheck.status === 'warning') {
        const sqlPrecheckMessage = formatSqlPrecheckBlockMessage(sqlPrecheck);
        latestState.addProgress?.(
            translateCleaning(latestState.settings.language, 'autonomous_cleaning_sql_precheck_warning_progress', { message: sqlPrecheckMessage }),
            'warning',
            latestState.settings.complexModel,
        );
        store.setState(prev => ({
            cleaningRun: updateCleaningRun(prev.cleaningRun, {
                status: 'completed',
                sqlPrecheckStatus: 'warning',
                lastError: null,
            }),
            chatHistory: [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    text: translateCleaning(prev.settings.language, 'autonomous_cleaning_sql_precheck_warning_chat', { message: sqlPrecheckMessage }),
                    timestamp: new Date(),
                    type: 'ai_cleaning_step',
                    cleaningRunId: prev.cleaningRun?.runId,
                    cleaningStep: {
                        stepId: `sql-precheck-warning-${Date.now()}`,
                        kind: 'verify',
                        toolName: 'sql.precheck',
                        path: WORKSPACE_DATASET_CLEAN_CSV,
                        status: 'warning',
                        diffSummary: sqlPrecheckMessage,
                    },
                }),
            ],
        }));
    } else {
        store.setState(prev => ({
            cleaningRun: updateCleaningRun(prev.cleaningRun, {
                status: 'completed',
                lastError: null,
                numericReconciliationStatus: 'passed',
                sqlPrecheckStatus: 'passed',
            }),
            chatHistory: [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    text: degradedSafeMode
                        ? translateCleaning(prev.settings.language, 'cleaning_persist_safe_completed_chat', { rowCount: workingData.data.length })
                        : translateCleaning(prev.settings.language, 'autonomous_cleaning_completed_chat', { rowCount: workingData.data.length }),
                    timestamp: new Date(),
                    type: 'ai_cleaning_step',
                    cleaningRunId: prev.cleaningRun?.runId,
                    cleaningStep: {
                        stepId: `commit-${Date.now()}`,
                        kind: 'commit',
                        toolName: 'duckdb.sync',
                        path: WORKSPACE_DATASET_CLEAN_CSV,
                        status: 'done',
                        diffSummary: `Query-ready and numerically verified with ${workingData.data.length} rows.`,
                    },
                }),
            ],
        }));
    }
    logCleaningPersistStage('total', persistStartedAt, `rows=${normalizedData.data.length}`);
};
