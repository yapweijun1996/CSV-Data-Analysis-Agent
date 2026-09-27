import type { AppStore } from '../../../store/useAppStore';
import type {
    AiCleaningProgramResult,
    CleaningFailureDetail,
    CleaningSemanticIntent,
    CleaningStrategyCandidate,
    CsvData,
    DataPreparationPlan,
} from '../../../types';
import { createChatMessage } from '../../../utils/messageState';
import { buildDiverseSample } from '../../../utils/dataHelpers';
import { updateCleaningRun } from '../cleaningRunState';
import type { StoreApi } from '../types';
import { profileDataWithWorker, executeAiCleaningProgramWithWorker } from '../../workers/dataWorkerClient';
import {
    buildCleaningVerificationReport,
    isRecoverableCleaningSignalKey,
    verifyCleanedDatasetShape,
} from '../cleaningVerification';
import { generateAiCleaningProgram } from '../../ai/cleaningProgramGenerator';
import { validateOperationsAgainstRawReportContract } from './rawReportContract';
import { detectReportShape } from '../reportShapeDetector';
import { buildDeterministicCleaningFallbackAction } from './deterministicCleaningFallback';
import { buildCleaningSemanticIntent, isComplexReportShape } from './cleaningSemanticIntent';
import { evaluateCleaningIrGate } from './cleaningIrGate';
import { buildDeterministicInspectionCleanupOperations, inspectCsvRows, summarizeRowInspection } from '../rowInspectionService';
import {
    MAX_SEMANTIC_INTENT_ATTEMPTS,
    MAX_CLEANING_LOOP_ROUNDS,
    NOISE_LEAKAGE_THRESHOLD,
    CLEANING_ITERATION_ARTIFACT_PATHS,
    SAMPLE_SIZE,
    type AutonomousCleaningStrategyKind,
    cloneCsvData,
    buildPlanExplanation,
    flattenProgramOperations,
    toDeterministicProgram,
    isStructuralVerificationSignal,
    translateCleaning,
    setRunningState,
    getVerificationRates,
    logCleaningLoopStage,
    buildIterationFailureSignature,
    buildDeterministicCleanupCandidate,
    updateRecoveryStateForAttempt,
    applyFailureDetail,
} from './cleaningPipelineHelpers';
import { persistSuccessfulCleaning } from './cleaningPipelinePersistence';
import {
    buildCleaningFailureDetail,
    buildHierarchyMismatchFailureDetail,
    evaluateCleaningStrategyEligibility,
} from './cleaningStrategyRecovery';
import { emitFailure, attemptGracefulDegradation } from './cleaningPipelineTermination';
import { getPreferredAnalysisDataset } from '../reportStructureState';
import { trySandboxCleaningFallback } from './sandboxCleaningFallback';

export const orchestrateAutonomousAiCleaning = async (
    store: StoreApi,
    options?: { resume?: boolean; abortSignal?: AbortSignal },
) => {
    const { getState } = store;
    const initialState = getState();
    const rawData = initialState.rawCsvData;
    const cleaningInputDataset = getPreferredAnalysisDataset(initialState)
        ?? initialState.rawCsvData
        ?? null;
    const baseData = cleaningInputDataset;

    if (!rawData || !baseData) {
        return;
    }

    const rawProfile = detectReportShape(rawData);
    const rawIntakeIr = initialState.rawIntakeIr ?? null;

    // ── IR-first gate: single source of truth for routing ──
    const irGate = evaluateCleaningIrGate({
        rawCsvData: rawData,
        rawIntakeIr,
        reportShapeProfile: rawProfile,
    });

    // ── Always start with inspect-first ──
    // RuntimeTableAssessment is not yet available at pipeline init.
    // The pipeline always enters inspect phase first. Only after runtime
    // inspect produces a confirmed assessment can we route to deterministic
    // cleanup/reshape. Initial fallback action is computed but deferred.
    const initialFallbackAction = buildDeterministicCleaningFallbackAction(rawData, rawIntakeIr);

    // Route using IR gate, with isComplexReportShape as auxiliary only.
    // Default: always start as llm_guided (inspect-first).
    // The runtime loop will re-evaluate after inspect produces a RuntimeTableAssessment.
    const isComplex = isComplexReportShape(rawData, rawProfile);
    let strategy: 'report_shape_strategy' | 'simple_detail_strategy';
    let initialStrategyKind: AutonomousCleaningStrategyKind;

    // Default entry point: always inspect-first
    strategy = 'simple_detail_strategy';
    initialStrategyKind = 'llm_guided';

    // All paths start as llm_guided (inspect-first). The LLM loop enters
    // inspect phase, reads raw.csv + cleaned.csv, and produces a
    // RuntimeTableAssessment. Only AFTER the assessment is confirmed does the
    // loop route to deterministic cleanup or reshape.
    // strategy stays simple_detail_strategy at init; the LLM loop re-evaluates
    // after inspect and may escalate to report_shape_strategy post-assessment.

    setRunningState(store, options?.resume === true, strategy, initialStrategyKind);

    // Persist IR gate diagnostics for downstream visibility
    store.setState(prev => ({
        cleaningRun: updateCleaningRun(prev.cleaningRun, {
            irStableSingleLayerDetail: irGate.isStableSingleLayerDetail,
            irAllowsDeterministicCleanup: irGate.allowsDeterministicCleanup,
            irAllowsDeterministicReshape: irGate.allowsDeterministicReshape,
            irRequiresInspectFirst: irGate.requiresInspectFirst,
            irRoutingReason: irGate.reason,
        }),
    }));

    let workingData = cloneCsvData(baseData);
    let workingProfiles = [...initialState.columnProfiles];
    try {
        const inputProfileResult = await profileDataWithWorker(workingData.data);
        workingProfiles = inputProfileResult.profiles;
    } catch (error) {
        console.warn('[CleaningPipeline] Failed to profile preferred cleaning dataset at pipeline start. Falling back to current store profiles.', error);
    }

    // ── Deterministic: drop 100% empty columns before any AI cleaning ──
    const completelyEmptyColumns = workingProfiles
        .filter(profile => (profile.missingPercentage ?? 0) >= 100)
        .map(profile => profile.name);
    if (completelyEmptyColumns.length > 0) {
        const dropSet = new Set(completelyEmptyColumns);
        workingData = {
            ...workingData,
            data: workingData.data.map(row => {
                const next = { ...row };
                completelyEmptyColumns.forEach(col => delete next[col]);
                return next;
            }),
        };
        workingProfiles = workingProfiles.filter(p => !dropSet.has(p.name));
        console.info(`[CleaningPipeline] Deterministically dropped ${completelyEmptyColumns.length} completely empty column(s): ${completelyEmptyColumns.join(', ')}`);
    }

    // ── Deterministic: backfill zeros in zero-placeholder columns ──
    // When intake detected columns with ≥30% zero-placeholder markers ('-, etc.),
    // replace empty cells in those columns with '0' so profiling counts them as
    // numeric zeros rather than missing values.
    const zeroPlaceholderIndexes = initialState.rawIntakeIr?.diagnostics.zeroPlaceholderColumnIndexes;
    if (zeroPlaceholderIndexes && zeroPlaceholderIndexes.length > 0) {
        const currentHeaders = Object.keys(workingData.data[0] ?? {});
        const zeroFillColumns = zeroPlaceholderIndexes
            .filter(index => index < currentHeaders.length)
            .map(index => currentHeaders[index])
            .filter(col => workingProfiles.some(p => p.name === col));
        if (zeroFillColumns.length > 0) {
            const zeroFillSet = new Set(zeroFillColumns);
            workingData = {
                ...workingData,
                data: workingData.data.map(row => {
                    const next = { ...row };
                    for (const col of zeroFillColumns) {
                        const val = String(next[col] ?? '').trim();
                        if (val === '') next[col] = '0';
                    }
                    return next;
                }),
            };
            // Update profiles: reduce missingPercentage for backfilled columns
            workingProfiles = workingProfiles.map(p => {
                if (!zeroFillSet.has(p.name)) return p;
                return { ...p, missingPercentage: 0 };
            });
            console.info(`[CleaningPipeline] Backfilled zeros in ${zeroFillColumns.length} zero-placeholder column(s): ${zeroFillColumns.join(', ')}`);
        }
    }

    let lastError = initialState.cleaningRun?.lastError ? new Error(initialState.cleaningRun.lastError) : undefined;
    let loopRound = 0;

    // ─── Direct deterministic paths removed ───
    // All paths now go through the LLM Guided Cleaning Loop below.
    // The loop enters inspect phase first, produces a RuntimeTableAssessment,
    // then routes to deterministic cleanup/reshape or continues LLM-guided.

    // ─── Report Shape Strategy Path (disabled: all paths go through LLM loop) ───
    // eslint-disable-next-line no-constant-condition
    if (false) {
        const latestState = getState();
        latestState.addProgress?.(
            translateCleaning(latestState.settings.language, 'autonomous_cleaning_semantic_intent'),
            'system',
            latestState.settings.complexModel,
        );

        let semanticIntent: CleaningSemanticIntent | null = null;
        for (let semanticAttempt = 1; semanticAttempt <= MAX_SEMANTIC_INTENT_ATTEMPTS; semanticAttempt += 1) {
            const snapshot = await latestState.ensureDatasetSemanticSnapshot(rawData, { force: semanticAttempt > 1 });
            if (snapshot) {
                semanticIntent = buildCleaningSemanticIntent({
                    data: rawData,
                    profile: rawProfile,
                    snapshot,
                });
                break;
            }
        }

        if (!semanticIntent) {
            const finalFailureMessage = `semantic_intent_failed: Unable to derive a valid semantic cleaning intent after ${MAX_SEMANTIC_INTENT_ATTEMPTS} attempts.`;
            store.setState(prev => ({
                cleaningRun: updateCleaningRun(prev.cleaningRun, {
                    status: 'failed',
                    lastError: finalFailureMessage,
                    rollbackReason: 'semantic_intent_failed',
                    semanticIntentStatus: 'failed',
                }),
                chatHistory: [
                    ...prev.chatHistory,
                    createChatMessage({
                        sender: 'ai',
                        text: translateCleaning(prev.settings.language, 'autonomous_cleaning_failed_rollback', { message: finalFailureMessage }),
                        timestamp: new Date(),
                        type: 'ai_cleaning_failure',
                        isError: true,
                        cleaningRunId: prev.cleaningRun?.runId,
                        resolved: false,
                    }),
                ],
            }));
            return;
        }

        store.setState(prev => ({
            cleaningRun: updateCleaningRun(prev.cleaningRun, {
                semanticIntentStatus: 'passed',
                targetShape: semanticIntent.targetShape,
                lastModelResponse: semanticIntent.summary,
            }),
        }));
        const deterministicProgram = toDeterministicProgram(
            initialFallbackAction,
            workingProfiles,
            'AI semantic cleaning selected deterministic report shaping for this report structure.',
        );

        if (!deterministicProgram) {
            emitFailure(store, 'deterministic_shaping_failed: No bounded deterministic report shaping program was available for the detected report structure.', 'deterministic_shaping_failed', { recoveryStatus: 'failed' });
            return;
        }

        latestState.addProgress?.(
            translateCleaning(latestState.settings.language, 'autonomous_cleaning_deterministic_shaping'),
            'system',
            latestState.settings.complexModel,
        );
        store.setState(prev => ({
            cleaningRun: updateCleaningRun(prev.cleaningRun, {
                strategyKind: 'deterministic_reshape',
                recoveryStatus: 'running',
            }),
        }));

        try {
            const execution = await executeAiCleaningProgramWithWorker(rawData.data, deterministicProgram.program, workingProfiles);
            const reconciliation = execution.numericReconciliation;
            if (!reconciliation.passed) {
                const failureSummary = reconciliation.failures[0]?.detail
                    ?? 'Strict numeric reconciliation failed after deterministic report shaping.';
                throw new Error(failureSummary);
            }

            const nextData: CsvData = {
                ...rawData,
                data: execution.data.map(row => ({ ...row })),
            };
            const profileResult = await profileDataWithWorker(nextData.data);
                const verifiedPlan: DataPreparationPlan = {
                    ...deterministicProgram.plan,
                    explanation: buildPlanExplanation(nextData.data.length, false, latestState.settings.language),
                    outputColumns: profileResult.profiles,
                aiProgram: deterministicProgram.program,
                numericReconciliation: reconciliation,
            };
            const verification = verifyCleanedDatasetShape(rawData, nextData, verifiedPlan);
            if (!verification.passed) {
                const verificationMessage = [
                    verification.reason ?? 'Deterministic report shaping failed verification.',
                    verification.detail,
                ].filter(Boolean).join(' ');
                const rollbackReason = isStructuralVerificationSignal(verification.signalKey)
                    ? 'deterministic_recovery_failed'
                    : 'deterministic_shaping_failed';
                emitFailure(store, verificationMessage, rollbackReason, { recoveryStatus: 'failed' });
                return;
            }

            await persistSuccessfulCleaning({
                store,
                rawData,
                latestState,
                workingData: nextData,
                workingProfiles: profileResult.profiles,
                plan: verifiedPlan,
                semanticIntent,
            });
            return;
        } catch (error) {
            const lastDeterministicError = error instanceof Error ? error : new Error(String(error));
            emitFailure(store, `deterministic_shaping_failed: ${lastDeterministicError.message}`, 'deterministic_shaping_failed', { recoveryStatus: 'failed' });
            return;
        }
    }

    // ─── Bounded Cleaning Loop ───
    while (loopRound < MAX_CLEANING_LOOP_ROUNDS) {
        if (options?.abortSignal?.aborted) {
            throw options.abortSignal.reason instanceof Error
                ? options.abortSignal.reason
                : new DOMException('Cleaning was cancelled.', 'AbortError');
        }
        const latestState = getState();
        loopRound += 1;
        const roundStartedAt = performance.now();
        latestState.addProgress?.(
            translateCleaning(latestState.settings.language, 'autonomous_cleaning_attempt_progress', {
                attempt: loopRound,
                maxAttempts: MAX_CLEANING_LOOP_ROUNDS,
            }),
            'system',
            latestState.settings.complexModel,
        );

        try {
            const inspectStartedAt = performance.now();
            const previousInspection = latestState.cleaningRun?.latestRowInspection;
            const maxValidIndex = workingData.data.length - 1;
            const focusRowIndexes = loopRound > 1
                ? [
                    ...(previousInspection?.residualUnknownRowIndexes ?? []),
                    ...(previousInspection?.residualSummaryLikeRowIndexes ?? []),
                ].filter((value, index, array) =>
                    array.indexOf(value) === index && value >= 0 && value <= maxValidIndex,
                )
                : [];
            const inspection = inspectCsvRows(workingData, {
                source: 'cleaned',
                focusRowIndexes: focusRowIndexes.length > 0 ? focusRowIndexes : undefined,
            });
            const inspectionSummary = summarizeRowInspection(inspection);
            const requiresStructuralRepair = irGate.allowsDeterministicReshape
                || rawProfile.primaryKind !== 'already_tabular';
            const allowDeterministicNoiseDrop = irGate.allowsDeterministicCleanup
                && !irGate.allowsDeterministicReshape
                && rawProfile.primaryKind === 'already_tabular';
            const deterministicOperations = buildDeterministicInspectionCleanupOperations(inspection, {
                allowGroupAndNoteDrop: allowDeterministicNoiseDrop,
                workingData: allowDeterministicNoiseDrop ? workingData.data : undefined,
            });
            logCleaningLoopStage(
                loopRound,
                'inspect',
                inspectStartedAt,
                `rows=${workingData.data.length}, residualUnknown=${inspection.residualUnknownRowIndexes.length}, residualSummary=${inspection.residualSummaryLikeRowIndexes.length}, deterministicOps=${deterministicOperations.length}`,
            );

            const iterationBase = {
                round: loopRound,
                inspectionStatus: 'completed' as const,
                rowCountBefore: workingData.data.length,
                rowCountAfter: workingData.data.length,
                droppedRowIndexes: deterministicOperations.flatMap(operation =>
                    operation.type === 'drop_rows_by_index' ? operation.indices : []),
                residualUnknownRowCount: inspection.residualUnknownRowIndexes.length,
                residualSummaryLikeRowCount: inspection.residualSummaryLikeRowIndexes.length,
                usedAi: false,
                verificationPassed: false,
                verificationReason: null,
                failureSignalKey: null,
                recoveryPath: deterministicOperations.length > 0
                    ? 'deterministic_cleanup' as const
                    : 'none' as const,
                noiseLeakageRate: null,
                repeatedHeaderLeakageRate: null,
                artifactPaths: CLEANING_ITERATION_ARTIFACT_PATHS,
                summary: inspectionSummary,
            };

            store.setState(prev => ({
                cleaningRun: updateCleaningRun(prev.cleaningRun, {
                    loopCount: loopRound,
                    inspectionStatus: 'completed',
                    residualUnknownRowCount: inspection.residualUnknownRowIndexes.length,
                    residualSummaryLikeRowCount: inspection.residualSummaryLikeRowIndexes.length,
                    latestRowInspection: inspection,
                    lastFailedStage: null,
                    iterationArtifacts: [
                        ...(prev.cleaningRun?.iterationArtifacts ?? []).filter(record => record.round !== loopRound),
                        iterationBase,
                    ],
                }),
            }));

            if (loopRound >= 2 && lastError) {
                const sandboxResult = await trySandboxCleaningFallback({
                    store,
                    rawData,
                    workingData,
                    workingProfiles,
                    round: loopRound as 2 | 3,
                    previousFailure: lastError,
                    signal: options?.abortSignal,
                });
                if (sandboxResult.status === 'committed') {
                    logCleaningLoopStage(loopRound, 'round_total', roundStartedAt, 'completed_via_sandbox');
                    return;
                }
                if (sandboxResult.status === 'cancelled') {
                    throw sandboxResult.error ?? new DOMException('Cleaning was cancelled.', 'AbortError');
                }
                lastError = sandboxResult.error ?? new Error('sandbox_verification_failed');
                logCleaningLoopStage(loopRound, 'round_total', roundStartedAt, `sandbox_retry=${lastError.message}`);
                continue;
            }

            if (
                !requiresStructuralRepair
                &&
                inspection.residualUnknownRowIndexes.length === 0
                && inspection.residualSummaryLikeRowIndexes.length === 0
            ) {
                const stablePlan: DataPreparationPlan = {
                    explanation: `Row inspection found no residual report-noise rows. ${inspectionSummary}`,
                    operations: [],
                    outputColumns: workingProfiles,
                    planStatus: 'schema_only',
                    consistencyIssues: [],
                };
                const verifyStartedAt = performance.now();
                const verification = verifyCleanedDatasetShape(rawData, workingData, stablePlan);
                logCleaningLoopStage(
                    loopRound,
                    'verify_stable',
                    verifyStartedAt,
                    `passed=${verification.passed}${verification.signalKey ? `, signal=${verification.signalKey}` : ''}`,
                );
                if (verification.passed) {
                    const persistStartedAt = performance.now();
                    await persistSuccessfulCleaning({
                        store,
                        rawData,
                        latestState,
                        workingData,
                        workingProfiles,
                        plan: stablePlan,
                    });
                    logCleaningLoopStage(loopRound, 'persist_stable', persistStartedAt, `rows=${workingData.data.length}`);
                    logCleaningLoopStage(loopRound, 'round_total', roundStartedAt, 'completed_via_stable_verify');
                    return;
                }
                lastError = new Error([
                    verification.reason ?? 'Shape verification failed after row inspection.',
                    verification.detail,
                ].filter(Boolean).join(' '));
                const verificationReport = buildCleaningVerificationReport(rawData, workingData, stablePlan);
                const verificationRates = getVerificationRates(verificationReport);
                store.setState(prev => ({
                    cleaningRun: updateCleaningRun(prev.cleaningRun, {
                        lastVerificationReason: lastError?.message ?? null,
                        rollbackReason: 'shape_verification_failed',
                        lastFailedStage: 'verify',
                        iterationArtifacts: (prev.cleaningRun?.iterationArtifacts ?? []).map(record =>
                            record.round === loopRound
                                ? {
                                    ...record,
                                    verificationReason: lastError?.message ?? null,
                                    failureSignalKey: verification.signalKey,
                                    recoveryPath: isRecoverableCleaningSignalKey(verification.signalKey) ? 'deterministic_cleanup' : 'ai_retry',
                                    noiseLeakageRate: verificationRates.noiseLeakageRate,
                                    repeatedHeaderLeakageRate: verificationRates.repeatedHeaderLeakageRate,
                                }
                                : record
                        ),
                    }),
                }));
                const previousArtifact = latestState.cleaningRun?.iterationArtifacts?.find(record => record.round === loopRound - 1);
                const currentSignature = buildIterationFailureSignature({
                    rowCountAfter: workingData.data.length,
                    residualUnknownRowCount: inspection.residualUnknownRowIndexes.length,
                    residualSummaryLikeRowCount: inspection.residualSummaryLikeRowIndexes.length,
                    failureSignalKey: verification.signalKey,
                });
                if (previousArtifact && !previousArtifact.verificationPassed && buildIterationFailureSignature(previousArtifact) === currentSignature) {
                    lastError = new Error(`Cleaning loop stalled without reducing residual noise or changing verification outcome (${verification.signalKey ?? 'unknown_signal'}).`);
                    break;
                }
                logCleaningLoopStage(loopRound, 'round_total', roundStartedAt, 'stable_verify_failed');
                continue;
            }

            const deterministicCandidate = deterministicOperations.length > 0
                ? buildDeterministicCleanupCandidate(workingProfiles, deterministicOperations, inspectionSummary)
                : null;
            let selectedPreflightDetail: CleaningFailureDetail | null = null;
            let aiCandidates: CleaningStrategyCandidate[] = [];
            const aiGenerateStartedAt = performance.now();

            try {
                const aiProgramResult: AiCleaningProgramResult = await generateAiCleaningProgram(
                    workingProfiles,
                    buildDiverseSample(workingData.data, SAMPLE_SIZE),
                    latestState.settings,
                    lastError,
                    workingData,
                    {
                        rowInspection: inspection,
                        residualRowsPreview: workingData.data.filter((_, index) =>
                            inspection.residualUnknownRowIndexes.includes(index)
                            || inspection.residualSummaryLikeRowIndexes.includes(index),
                        ).slice(0, SAMPLE_SIZE),
                        priorVerificationFailures: latestState.cleaningRun?.iterationArtifacts
                            ?.map(record => record.verificationReason)
                            .filter((reason): reason is string => Boolean(reason)) ?? [],
                        disallowedStrategyRequirements: (() => {
                            const attemptedStrategies = latestState.cleaningRun?.recoveryState?.attemptedStrategies ?? [];
                            if (attemptedStrategies.some(strategy =>
                                strategy.requirement === 'hierarchical_shape'
                                && strategy.reasonCode === 'hierarchy_shape_missing'
                                && strategy.round >= loopRound - 1,
                            )) {
                                return ['hierarchical_shape'] as const;
                            }
                            return [];
                        })(),
                        allowedOperationTypes: (() => {
                            const baseOps: string[] = [
                                'drop_rows_by_index',
                                'drop_blank_rows',
                                'replace_values',
                                'cast_column',
                            ];
                            const currentColumns = Object.keys(workingData.data[0] ?? {});
                            const meaningfulCount = currentColumns.filter(col =>
                                col.trim().length > 0
                                && !/^_?unnamed_column_/i.test(col)
                                && !/^\d+(\.\d+)?$/.test(col.trim()),
                            ).length;
                            if (meaningfulCount < Math.max(2, Math.floor(currentColumns.length * 0.5))) {
                                baseOps.push('promote_header_row');
                            }
                            return baseOps;
                        })(),
                        iterationContext: {
                            round: loopRound,
                            maxRounds: MAX_CLEANING_LOOP_ROUNDS,
                            inspectionSummary,
                        },
                    },
                );
                aiCandidates = aiProgramResult.candidates;
                logCleaningLoopStage(loopRound, 'ai_generate', aiGenerateStartedAt, `candidates=${aiCandidates.length}`);
            } catch (error) {
                const aiGenerationError = error instanceof Error ? error : new Error(String(error));
                if (!deterministicCandidate) {
                    throw aiGenerationError;
                }
                lastError = aiGenerationError;
                logCleaningLoopStage(loopRound, 'ai_generate', aiGenerateStartedAt, `failed=${aiGenerationError.message}`);
                const lang = latestState.settings.language;
                selectedPreflightDetail = buildCleaningFailureDetail({
                    summary: translateCleaning(lang, 'cleaning_ai_gen_failed_summary'),
                    actionTaken: translateCleaning(lang, 'cleaning_ai_gen_failed_action'),
                    dataSafety: translateCleaning(lang, 'cleaning_snapshot_preserved'),
                    nextState: translateCleaning(lang, 'cleaning_will_continue_analysis'),
                    technicalDetail: aiGenerationError.message,
                });
                applyFailureDetail(store, selectedPreflightDetail);
                latestState.addProgress?.(
                    translateCleaning(lang, 'cleaning_ai_gen_failed_progress'),
                    'warning',
                    latestState.settings.complexModel,
                );
            }

            const candidates: CleaningStrategyCandidate[] = [
                ...aiCandidates,
                ...(deterministicCandidate ? [deterministicCandidate] : []),
            ].sort((left, right) => left.priority - right.priority);

            let selectedCandidate: CleaningStrategyCandidate | null = null;

            const strategySelectStartedAt = performance.now();
            for (const candidate of candidates) {
                const preflight = evaluateCleaningStrategyEligibility(workingData, candidate, {
                    currentRound: loopRound,
                    attemptedStrategies: latestState.cleaningRun?.recoveryState?.attemptedStrategies ?? [],
                    disallowedRequirements: [],
                });
                if (!preflight.executable) {
                    updateRecoveryStateForAttempt(store, candidate, loopRound, preflight.reasonCode, false);
                    if (preflight.reasonCode === 'hierarchy_shape_missing' || preflight.reasonCode === 'hierarchy_shape_cooldown') {
                        selectedPreflightDetail = buildHierarchyMismatchFailureDetail(
                            preflight.technicalDetail ?? `Strategy "${candidate.strategyId}" was rejected before execution.`,
                            latestState.settings.language,
                        );
                        applyFailureDetail(store, selectedPreflightDetail);
                    }
                    continue;
                }

                selectedCandidate = candidate;
                updateRecoveryStateForAttempt(store, candidate, loopRound, null, true);
                break;
            }
            logCleaningLoopStage(
                loopRound,
                'strategy_select',
                strategySelectStartedAt,
                `selected=${selectedCandidate?.source ?? 'none'}, candidateCount=${candidates.length}`,
            );

            if (!selectedCandidate) {
                lastError = new Error(selectedPreflightDetail?.summary ?? 'No executable cleaning strategy remained after runtime preflight.');
                store.setState(prev => ({
                    cleaningRun: updateCleaningRun(prev.cleaningRun, {
                        lastFailedStage: 'mutate',
                        rollbackReason: 'shape_verification_failed',
                        lastVerificationReason: lastError?.message ?? null,
                    }),
                }));
                latestState.addProgress?.(
                    translateCleaning(latestState.settings.language, 'autonomous_cleaning_shape_retry'),
                    'warning',
                    latestState.settings.complexModel,
                );
                logCleaningLoopStage(loopRound, 'round_total', roundStartedAt, 'no_executable_strategy');
                continue;
            }

            const program = selectedCandidate.program;
            const usedAi = selectedCandidate.source !== 'deterministic_cleanup';
            const recoveryPath = selectedCandidate.source === 'deterministic_cleanup'
                ? 'deterministic_cleanup'
                : 'ai_retry';

            store.setState(prev => ({
                cleaningRun: updateCleaningRun(prev.cleaningRun, {
                    aiProgramId: program.programId,
                    lastModelResponse: program.explanation,
                    userFacingMessage: selectedPreflightDetail?.summary ?? null,
                    actionTakenMessage: selectedCandidate.source === 'deterministic_cleanup'
                        ? translateCleaning(latestState.settings.language, 'cleaning_switched_deterministic')
                        : translateCleaning(latestState.settings.language, 'cleaning_continue_safe_ai'),
                    dataSafetyMessage: translateCleaning(latestState.settings.language, 'cleaning_snapshot_preserved'),
                    nextStateMessage: translateCleaning(latestState.settings.language, 'cleaning_round_success_next'),
                    iterationArtifacts: (prev.cleaningRun?.iterationArtifacts ?? []).map(record =>
                        record.round === loopRound
                            ? {
                                ...record,
                                usedAi,
                                recoveryPath,
                                summary: `${inspectionSummary}; strategy=${selectedCandidate.source}; plan=${program.explanation}`,
                            }
                            : record
                    ),
                }),
            }));

            const contractError = validateOperationsAgainstRawReportContract(
                rawData,
                flattenProgramOperations(program),
                latestState.rawIntakeIr,
            );

            if (contractError) {
                lastError = new Error(contractError);
                updateRecoveryStateForAttempt(store, selectedCandidate, loopRound, 'contract_blocked', false);
                latestState.addProgress?.(
                    translateCleaning(latestState.settings.language, 'autonomous_cleaning_contract_retry'),
                    'warning',
                    latestState.settings.complexModel,
                );
                store.setState(prev => ({
                    cleaningRun: updateCleaningRun(prev.cleaningRun, {
                        lastFailedStage: 'mutate',
                        lastVerificationReason: contractError,
                    }),
                }));
                console.log(`[Perf:CleaningLoop][round ${loopRound}] contract_check: blocked`);
                logCleaningLoopStage(loopRound, 'round_total', roundStartedAt, 'contract_blocked');
                continue;
            }

            const executeStartedAt = performance.now();
            const execution = await executeAiCleaningProgramWithWorker(workingData.data, program, workingProfiles);
            const reconciliation = execution.numericReconciliation;
            logCleaningLoopStage(
                loopRound,
                'execute_program',
                executeStartedAt,
                `rowsBefore=${workingData.data.length}, rowsAfter=${execution.data.length}, reconciliationPassed=${reconciliation.passed}`,
            );

            store.setState(prev => ({
                cleaningRun: updateCleaningRun(prev.cleaningRun, {
                    aiProgramId: program.programId,
                    lastModelResponse: program.explanation,
                    lastExecutionTrace: execution.logs.map(log => `${log.operationType}:${log.status}`),
                    numericReconciliationStatus: reconciliation.passed ? 'passed' : 'failed',
                    rollbackReason: reconciliation.passed ? null : 'numeric_reconciliation_failed',
                    lastFailedStage: reconciliation.passed ? null : 'mutate',
                }),
            }));

            if (!reconciliation.passed) {
                const failureSummary = reconciliation.failures[0]?.detail
                    ?? 'Strict numeric reconciliation failed after AI cleaning.';
                lastError = new Error(failureSummary);
                applyFailureDetail(store, buildCleaningFailureDetail({
                    summary: translateCleaning(latestState.settings.language, 'cleaning_reconciliation_failed_summary'),
                    actionTaken: translateCleaning(latestState.settings.language, 'cleaning_round_not_committed'),
                    dataSafety: translateCleaning(latestState.settings.language, 'cleaning_snapshot_preserved'),
                    nextState: translateCleaning(latestState.settings.language, 'cleaning_will_retry_then_analyze'),
                    technicalDetail: failureSummary,
                }));
                latestState.addProgress?.(
                    translateCleaning(latestState.settings.language, 'autonomous_cleaning_rollback_progress', { message: failureSummary }),
                    'error',
                    latestState.settings.complexModel,
                );
                logCleaningLoopStage(loopRound, 'round_total', roundStartedAt, 'reconciliation_failed');
                continue;
            }

            const nextData: CsvData = {
                ...workingData,
                data: execution.data.map(row => ({ ...row })),
            };
            const profileStartedAt = performance.now();
            const profileResult = await profileDataWithWorker(nextData.data);
            logCleaningLoopStage(loopRound, 'profile', profileStartedAt, `rows=${nextData.data.length}, columns=${profileResult.profiles.length}`);
            const plan: DataPreparationPlan = {
                explanation: buildPlanExplanation(nextData.data.length, false, latestState.settings.language),
                operations: flattenProgramOperations(program),
                outputColumns: profileResult.profiles,
                planStatus: program.steps.length > 0 ? 'operations' : 'schema_only',
                consistencyIssues: [],
                aiProgram: program,
                numericReconciliation: reconciliation,
            };
            const postInspection = inspectCsvRows(nextData, { source: 'cleaned' });
            const residualNoiseRate = nextData.data.length > 0
                ? (postInspection.residualUnknownRowIndexes.length + postInspection.residualSummaryLikeRowIndexes.length) / nextData.data.length
                : 0;
            const verifyStartedAt = performance.now();
            const verificationReport = buildCleaningVerificationReport(rawData, nextData, plan);
            const verificationRates = getVerificationRates(verificationReport);
            // Tiered threshold: allow a small number of summary-like rows (up to 2 or 5%
            // of the dataset) to avoid stalling the pipeline on false positives.
            const summaryLikeTolerance = Math.max(2, Math.ceil(nextData.data.length * 0.05));
            if (postInspection.residualSummaryLikeRowIndexes.length > summaryLikeTolerance || residualNoiseRate > NOISE_LEAKAGE_THRESHOLD) {
                const verificationMessage = 'Dataset still contains header, footer, or blank noise rows after cleaning.';
                lastError = new Error(verificationMessage);
                workingData = nextData;
                workingProfiles = profileResult.profiles;
                applyFailureDetail(store, buildCleaningFailureDetail({
                    summary: translateCleaning(latestState.settings.language, 'cleaning_noise_residual_summary'),
                    actionTaken: translateCleaning(latestState.settings.language, 'cleaning_round_kept_intermediate'),
                    dataSafety: translateCleaning(latestState.settings.language, 'cleaning_original_and_snapshot_safe'),
                    nextState: translateCleaning(latestState.settings.language, 'cleaning_will_continue_then_analyze'),
                    technicalDetail: verificationMessage,
                }));
                store.setState(prev => ({
                    cleaningRun: updateCleaningRun(prev.cleaningRun, {
                        latestRowInspection: postInspection,
                        residualUnknownRowCount: postInspection.residualUnknownRowIndexes.length,
                        residualSummaryLikeRowCount: postInspection.residualSummaryLikeRowIndexes.length,
                        inspectionStatus: 'completed',
                        lastVerificationReason: verificationMessage,
                        rollbackReason: 'shape_verification_failed',
                        lastFailedStage: 'verify',
                        sqlPrecheckStatus: 'pending',
                        iterationArtifacts: (prev.cleaningRun?.iterationArtifacts ?? []).map(record =>
                            record.round === loopRound
                                ? {
                                    ...record,
                                    rowCountAfter: nextData.data.length,
                                    residualUnknownRowCount: postInspection.residualUnknownRowIndexes.length,
                                    residualSummaryLikeRowCount: postInspection.residualSummaryLikeRowIndexes.length,
                                    verificationReason: verificationMessage,
                                    failureSignalKey: 'noise_leakage_rate',
                                    recoveryPath: 'deterministic_cleanup',
                                    noiseLeakageRate: verificationRates.noiseLeakageRate,
                                    repeatedHeaderLeakageRate: verificationRates.repeatedHeaderLeakageRate,
                                }
                                : record
                        ),
                    }),
                }));
                const previousArtifact = latestState.cleaningRun?.iterationArtifacts?.find(record => record.round === loopRound - 1);
                const currentSignature = buildIterationFailureSignature({
                    rowCountAfter: nextData.data.length,
                    residualUnknownRowCount: postInspection.residualUnknownRowIndexes.length,
                    residualSummaryLikeRowCount: postInspection.residualSummaryLikeRowIndexes.length,
                    failureSignalKey: 'noise_leakage_rate',
                });
                if (previousArtifact && !previousArtifact.verificationPassed && buildIterationFailureSignature(previousArtifact) === currentSignature) {
                    lastError = new Error('Cleaning loop stalled without reducing residual noise rows.');
                    break;
                }
                latestState.addProgress?.(
                    translateCleaning(latestState.settings.language, 'autonomous_cleaning_shape_retry'),
                    'warning',
                    latestState.settings.complexModel,
                );
                logCleaningLoopStage(
                    loopRound,
                    'verify_noise_gate',
                    verifyStartedAt,
                    `residualNoiseRate=${residualNoiseRate.toFixed(4)}, summaryResidual=${postInspection.residualSummaryLikeRowIndexes.length}, threshold=${NOISE_LEAKAGE_THRESHOLD}`,
                );
                logCleaningLoopStage(loopRound, 'round_total', roundStartedAt, 'noise_gate_retry');
                continue;
            }

            const verification = verifyCleanedDatasetShape(rawData, nextData, plan);
            logCleaningLoopStage(
                loopRound,
                'verify_shape',
                verifyStartedAt,
                `passed=${verification.passed}${verification.signalKey ? `, signal=${verification.signalKey}` : ''}`,
            );
            if (!verification.passed) {
                const verificationMessage = [
                    verification.reason ?? 'Shape verification failed after AI cleaning.',
                    verification.detail,
                ].filter(Boolean).join(' ');
                lastError = new Error(verificationMessage);
                workingData = nextData;
                workingProfiles = profileResult.profiles;
                applyFailureDetail(store, buildCleaningFailureDetail({
                    summary: isStructuralVerificationSignal(verification.signalKey)
                        ? translateCleaning(latestState.settings.language, 'cleaning_structural_verification_failed')
                        : translateCleaning(latestState.settings.language, 'cleaning_shape_verification_failed'),
                    actionTaken: translateCleaning(latestState.settings.language, 'cleaning_round_intermediate_only'),
                    dataSafety: translateCleaning(latestState.settings.language, 'cleaning_snapshot_preserved'),
                    nextState: translateCleaning(latestState.settings.language, 'cleaning_will_auto_recover'),
                    technicalDetail: verificationMessage,
                }));
                store.setState(prev => ({
                    cleaningRun: updateCleaningRun(prev.cleaningRun, {
                        latestRowInspection: postInspection,
                        residualUnknownRowCount: postInspection.residualUnknownRowIndexes.length,
                        residualSummaryLikeRowCount: postInspection.residualSummaryLikeRowIndexes.length,
                        lastVerificationReason: verificationMessage || null,
                        rollbackReason: 'shape_verification_failed',
                        lastFailedStage: 'verify',
                        iterationArtifacts: (prev.cleaningRun?.iterationArtifacts ?? []).map(record =>
                            record.round === loopRound
                                ? {
                                    ...record,
                                    rowCountAfter: nextData.data.length,
                                    residualUnknownRowCount: postInspection.residualUnknownRowIndexes.length,
                                    residualSummaryLikeRowCount: postInspection.residualSummaryLikeRowIndexes.length,
                                    verificationReason: verificationMessage || null,
                                    failureSignalKey: verification.signalKey,
                                    recoveryPath: isRecoverableCleaningSignalKey(verification.signalKey) ? 'deterministic_cleanup' : 'ai_retry',
                                    noiseLeakageRate: verificationRates.noiseLeakageRate,
                                    repeatedHeaderLeakageRate: verificationRates.repeatedHeaderLeakageRate,
                                }
                                : record
                        ),
                    }),
                }));
                const previousArtifact = latestState.cleaningRun?.iterationArtifacts?.find(record => record.round === loopRound - 1);
                const currentSignature = buildIterationFailureSignature({
                    rowCountAfter: nextData.data.length,
                    residualUnknownRowCount: postInspection.residualUnknownRowIndexes.length,
                    residualSummaryLikeRowCount: postInspection.residualSummaryLikeRowIndexes.length,
                    failureSignalKey: verification.signalKey,
                });
                if (previousArtifact && !previousArtifact.verificationPassed && buildIterationFailureSignature(previousArtifact) === currentSignature) {
                    lastError = new Error(`Cleaning loop stalled without changing verification outcome (${verification.signalKey ?? 'unknown_signal'}).`);
                    break;
                }
                if (isStructuralVerificationSignal(verification.signalKey)) {
                    const recoveryAction = buildDeterministicCleaningFallbackAction(rawData, rawIntakeIr);
                    const recoveryProgram = toDeterministicProgram(
                        recoveryAction,
                        workingProfiles,
                        'AI cleaning escalated to raw.csv deterministic recovery after structural verification failed.',
                    );
                    if (recoveryProgram) {
                        latestState.addProgress?.(
                            translateCleaning(latestState.settings.language, 'autonomous_cleaning_deterministic_recovery'),
                            'warning',
                            latestState.settings.complexModel,
                        );
                        store.setState(prev => ({
                            cleaningRun: updateCleaningRun(prev.cleaningRun, {
                                recoveryStatus: 'running',
                                strategyKind: 'deterministic_reshape',
                                iterationArtifacts: (prev.cleaningRun?.iterationArtifacts ?? []).map(record =>
                                    record.round === loopRound
                                        ? { ...record, recoveryPath: 'deterministic_reshape' }
                                        : record
                                ),
                            }),
                        }));
                        try {
                            const recoveryExecution = await executeAiCleaningProgramWithWorker(rawData.data, recoveryProgram.program, workingProfiles);
                            const recoveryReconciliation = recoveryExecution.numericReconciliation;
                            if (!recoveryReconciliation.passed) {
                                throw new Error(
                                    recoveryReconciliation.failures[0]?.detail
                                        ?? 'Strict numeric reconciliation failed after deterministic recovery.',
                                );
                            }
                            const recoveredData: CsvData = {
                                ...rawData,
                                data: recoveryExecution.data.map(row => ({ ...row })),
                            };
                            const recoveredProfileResult = await profileDataWithWorker(recoveredData.data);
                            const verifiedRecoveryPlan: DataPreparationPlan = {
                                ...recoveryProgram.plan,
                                explanation: buildPlanExplanation(recoveredData.data.length, false, latestState.settings.language),
                                outputColumns: recoveredProfileResult.profiles,
                                aiProgram: recoveryProgram.program,
                                numericReconciliation: recoveryReconciliation,
                            };
                            const recoveryVerification = verifyCleanedDatasetShape(rawData, recoveredData, verifiedRecoveryPlan);
                            if (!recoveryVerification.passed) {
                                throw new Error([
                                    recoveryVerification.reason ?? 'Deterministic recovery failed verification.',
                                    recoveryVerification.detail,
                                ].filter(Boolean).join(' '));
                            }
                            await persistSuccessfulCleaning({
                                store,
                                rawData,
                                latestState,
                                workingData: recoveredData,
                                workingProfiles: recoveredProfileResult.profiles,
                                plan: verifiedRecoveryPlan,
                            });
                            return;
                        } catch (recoveryError) {
                            lastError = recoveryError instanceof Error ? recoveryError : new Error(String(recoveryError));
                            store.setState(prev => ({
                                cleaningRun: updateCleaningRun(prev.cleaningRun, {
                                    rollbackReason: 'deterministic_recovery_failed',
                                    recoveryStatus: 'failed',
                                    lastError: lastError?.message ?? null,
                                    iterationArtifacts: (prev.cleaningRun?.iterationArtifacts ?? []).map(record =>
                                        record.round === loopRound
                                            ? { ...record, recoveryPath: 'deterministic_reshape' }
                                            : record
                                    ),
                                }),
                            }));
                            latestState.addProgress?.(
                                translateCleaning(latestState.settings.language, 'autonomous_cleaning_rollback_progress', { message: lastError.message }),
                                'error',
                                latestState.settings.complexModel,
                            );
                            logCleaningLoopStage(loopRound, 'round_total', roundStartedAt, 'deterministic_recovery_failed');
                            break;
                        }
                    }
                }
                latestState.addProgress?.(
                    translateCleaning(latestState.settings.language, 'autonomous_cleaning_shape_retry'),
                    'warning',
                    latestState.settings.complexModel,
                );
                logCleaningLoopStage(loopRound, 'round_total', roundStartedAt, 'shape_verify_retry');
                continue;
            }

            workingData = nextData;
            workingProfiles = profileResult.profiles;
            store.setState(prev => ({
                cleaningRun: updateCleaningRun(prev.cleaningRun, {
                    latestRowInspection: postInspection,
                    residualUnknownRowCount: postInspection.residualUnknownRowIndexes.length,
                    residualSummaryLikeRowCount: postInspection.residualSummaryLikeRowIndexes.length,
                    inspectionStatus: 'completed',
                    recoveryState: {
                        activeStrategyId: selectedCandidate.strategyId,
                        attemptedStrategies: prev.cleaningRun?.recoveryState?.attemptedStrategies ?? [],
                        lastReasonCode: null,
                        recoveredBy: selectedCandidate.source === 'agent_primary'
                            ? null
                            : selectedCandidate.source === 'agent_retry'
                                ? 'agent_retry'
                                : selectedCandidate.source === 'hierarchy_annotation'
                                    ? 'hierarchy_annotation'
                                    : 'deterministic_cleanup',
                        analysisMode: selectedCandidate.source === 'agent_primary' ? 'normal' : 'degraded_safe',
                    },
                    userFacingMessage: selectedCandidate.source === 'agent_primary'
                        ? null
                        : translateCleaning(latestState.settings.language, 'cleaning_safe_mode_activated'),
                    actionTakenMessage: selectedCandidate.source === 'agent_primary'
                        ? null
                        : translateCleaning(latestState.settings.language, 'cleaning_safe_strategy_used'),
                    dataSafetyMessage: translateCleaning(latestState.settings.language, 'cleaning_snapshot_preserved'),
                    nextStateMessage: selectedCandidate.source === 'agent_primary'
                        ? null
                        : translateCleaning(latestState.settings.language, 'cleaning_analysis_labeled_safe_mode'),
                    technicalDetail: null,
                    iterationArtifacts: (prev.cleaningRun?.iterationArtifacts ?? []).map(record =>
                        record.round === loopRound
                            ? {
                                ...record,
                                rowCountAfter: workingData.data.length,
                                residualUnknownRowCount: postInspection.residualUnknownRowIndexes.length,
                                residualSummaryLikeRowCount: postInspection.residualSummaryLikeRowIndexes.length,
                                verificationPassed: true,
                                verificationReason: null,
                                failureSignalKey: null,
                                usedAi,
                                recoveryPath: usedAi ? 'ai_retry' : record.recoveryPath,
                                noiseLeakageRate: verificationRates.noiseLeakageRate,
                                repeatedHeaderLeakageRate: verificationRates.repeatedHeaderLeakageRate,
                            }
                            : record
                    ),
                }),
            }));
            const persistStartedAt = performance.now();
            await persistSuccessfulCleaning({
                store,
                rawData,
                latestState,
                workingData,
                workingProfiles,
                plan,
            });
            logCleaningLoopStage(loopRound, 'persist_success', persistStartedAt, `rows=${workingData.data.length}`);
            logCleaningLoopStage(loopRound, 'round_total', roundStartedAt, 'completed');
            return;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (options?.abortSignal?.aborted || lastError.name === 'AbortError') {
                throw lastError;
            }
            getState().addProgress?.(
                translateCleaning(getState().settings.language, 'autonomous_cleaning_attempt_failed', { message: lastError.message }),
                'error',
                getState().settings.complexModel,
            );
            logCleaningLoopStage(loopRound, 'round_total', roundStartedAt, `exception=${lastError.message}`);
        }
    }

    // ─── Graceful degradation: accept partially-cleaned data when stalled on noise ───
    const terminalRollbackReason = getState().cleaningRun?.rollbackReason;
    if (terminalRollbackReason !== 'deterministic_recovery_failed') {
        const accepted = await attemptGracefulDegradation({
            store,
            workingData,
            workingProfiles,
            rawData,
            lastError,
        });
        if (accepted) return;
    }

    // ─── Terminal Failure ───
    const finalFailureMessage = terminalRollbackReason === 'deterministic_recovery_failed'
        ? `deterministic_recovery_failed: ${lastError?.message ?? 'Unknown error.'}`
        : `Cleaning loop exhausted after ${MAX_CLEANING_LOOP_ROUNDS} rounds: ${lastError?.message ?? 'Unknown error.'}`;

    emitFailure(store, finalFailureMessage, terminalRollbackReason === 'deterministic_recovery_failed'
        ? 'deterministic_recovery_failed'
        : 'llm_budget_exhausted');
};
