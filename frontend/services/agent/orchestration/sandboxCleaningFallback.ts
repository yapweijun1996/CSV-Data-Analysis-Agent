import type { ColumnProfile, CsvData, DataPreparationPlan } from '../../../types';
import { buildDiverseSample } from '../../../utils/dataHelpers';
import { generateSandboxTransformationProposal } from '../../ai/sandboxTransformationGenerator';
import { profileDataWithWorker } from '../../workers/dataWorkerClient';
import { executeSandboxTransformation } from '../../sandbox/transformationSandboxClient';
import { verifyCleanedDatasetShape } from '../cleaningVerification';
import { updateCleaningRun } from '../cleaningRunState';
import type { StoreApi } from '../types';
import { persistSuccessfulCleaning } from './cleaningPipelinePersistence';

export type SandboxCleaningFallbackResult = {
    status: 'committed' | 'retry' | 'cancelled';
    error: Error | null;
};

export const trySandboxCleaningFallback = async (input: {
    store: StoreApi;
    rawData: CsvData;
    workingData: CsvData;
    workingProfiles: ColumnProfile[];
    round: 2 | 3;
    previousFailure: Error;
    signal?: AbortSignal;
}): Promise<SandboxCleaningFallbackResult> => {
    const state = input.store.getState();
    const inputTableId = state.datasetBundle?.primaryTableId ?? 'input-table';
    state.addProgress?.(
        input.round === 2
            ? 'Governed transformations did not verify. Trying an isolated code fallback.'
            : 'The first sandbox result did not verify. Trying one targeted recovery.',
        'warning',
        state.settings.complexModel,
    );

    try {
        const proposal = await generateSandboxTransformationProposal({
            attempt: input.round,
            inputTableId,
            profiles: input.workingProfiles,
            sampleRows: buildDiverseSample(input.workingData.data, 30),
            previousFailure: input.previousFailure.message,
            settings: state.settings,
            abortSignal: input.signal,
        });
        const outcome = await executeSandboxTransformation({
            runId: state.cleaningRun?.runId ?? `sandbox-cleaning-${Date.now()}`,
            attempt: input.round,
            inputTableId,
            rows: input.workingData.data,
            proposal,
            signal: input.signal,
        });
        if (outcome.status === 'cancelled') {
            return { status: 'cancelled', error: new DOMException('Sandbox cleaning was cancelled.', 'AbortError') };
        }
        if (outcome.status !== 'completed' || outcome.validation.decision !== 'trusted' || !outcome.output) {
            const error = new Error(outcome.error || outcome.validation.reasonCodes.join(',') || 'sandbox_verification_failed');
            input.store.setState(previous => ({
                cleaningRun: updateCleaningRun(previous.cleaningRun, {
                    lastError: error.message,
                    lastVerificationReason: error.message,
                    rollbackReason: 'shape_verification_failed',
                    lastFailedStage: 'verify',
                    technicalDetail: error.message,
                    iterationArtifacts: (previous.cleaningRun?.iterationArtifacts ?? []).map(record =>
                        record.round === input.round
                            ? {
                                ...record,
                                usedAi: true,
                                recoveryPath: outcome.language === 'javascript' ? 'sandbox_js' : 'sandbox_python',
                                verificationReason: error.message,
                                failureSignalKey: outcome.validation.reasonCodes[0] ?? 'sandbox_verification_failed',
                                summary: `${record.summary}; sandbox=${outcome.language}; decision=${outcome.validation.decision}`,
                            }
                            : record),
                }),
            }));
            return { status: 'retry', error };
        }

        const primaryTable = outcome.output.tables.find(table => table.tableId === proposal.primaryTableId);
        if (!primaryTable || primaryTable.rows.length === 0) {
            return { status: 'retry', error: new Error('sandbox_primary_table_empty') };
        }
        const nextData: CsvData = {
            ...input.workingData,
            data: primaryTable.rows.map(row => ({ ...row })),
        };
        const profileResult = await profileDataWithWorker(nextData.data, input.signal);
        const plan: DataPreparationPlan = {
            explanation: proposal.explanation,
            operations: [],
            outputColumns: profileResult.profiles,
            planStatus: 'operations',
            consistencyIssues: [],
            sandbox: {
                language: proposal.language,
                codeRef: outcome.codeRef,
                attempt: input.round,
                validationDecision: outcome.validation.decision,
                validationReasonCodes: outcome.validation.reasonCodes,
            },
        };
        const verification = verifyCleanedDatasetShape(input.rawData, nextData, plan);
        if (!verification.passed) {
            return {
                status: 'retry',
                error: new Error([
                    verification.reason ?? 'sandbox_shape_verification_failed',
                    verification.detail,
                ].filter(Boolean).join(' ')),
            };
        }

        const sandboxSource: 'sandbox_js' | 'sandbox_python' = proposal.language === 'javascript'
            ? 'sandbox_js'
            : 'sandbox_python';
        input.store.setState(previous => ({
            cleaningRun: updateCleaningRun(previous.cleaningRun, {
                strategyKind: 'llm_guided',
                recoveryStatus: 'running',
                lastExecutionTrace: [
                    `sandbox:${proposal.language}`,
                    `attempt:${input.round}`,
                    `codeRef:${outcome.codeRef}`,
                    `validation:${outcome.validation.decision}`,
                ],
                iterationArtifacts: (previous.cleaningRun?.iterationArtifacts ?? []).map(record =>
                    record.round === input.round
                        ? {
                            ...record,
                            usedAi: true,
                            rowCountAfter: nextData.data.length,
                            recoveryPath: sandboxSource,
                            verificationPassed: true,
                            verificationReason: null,
                            failureSignalKey: null,
                            summary: `${record.summary}; sandbox=${proposal.language}; validation=trusted`,
                        }
                        : record),
                recoveryState: {
                    activeStrategyId: outcome.codeRef,
                    attemptedStrategies: [
                        ...(previous.cleaningRun?.recoveryState?.attemptedStrategies ?? []),
                        {
                            strategyId: outcome.codeRef,
                            source: sandboxSource,
                            requirement: null,
                            round: input.round,
                            reasonCode: null,
                            executed: true,
                        },
                    ].slice(-12),
                    lastReasonCode: null,
                    recoveredBy: sandboxSource,
                    analysisMode: 'normal',
                },
            }),
        }));
        await persistSuccessfulCleaning({
            store: input.store,
            rawData: input.rawData,
            latestState: input.store.getState(),
            workingData: nextData,
            workingProfiles: profileResult.profiles,
            plan,
            sandboxCommit: { proposal, outcome },
        });
        return { status: 'committed', error: null };
    } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        if (input.signal?.aborted || normalized.name === 'AbortError') {
            return { status: 'cancelled', error: normalized };
        }
        return { status: 'retry', error: normalized };
    }
};
