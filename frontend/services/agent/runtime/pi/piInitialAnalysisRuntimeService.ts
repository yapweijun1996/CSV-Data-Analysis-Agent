import { presentGatewayError } from '../../../../utils/gatewayErrorMessage';
import { Agent, type AgentTool, type StreamFn } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import { resolveAnalysisCompletionGate } from '../../analysisCompletionGate';
import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import { buildCardSemanticFingerprint } from '../../cardSemanticFingerprint';
import { emitAgentEvent, updateAgentTaskStatus } from '../../monitoring/agentMonitor';
import { persistCurrentAppSessionSnapshot } from '../../../persistence/currentSessionPersistence';
import { ensureCloudAiConsent } from '../../../privacy/cloudAiConsent';
import { buildToolAvailabilityContext } from '../../tools/toolGovernance';
import { createInitialAnalysisStageToolManifests } from '../../tools/manifests/initialAnalysisStageManifests';
import type { ResearchPlan } from '../../../../types';
import type { StoreApi } from '../../types';
import { getPreferredAnalysisDataset } from '../../reportStructureState';
import { requestDataResearchCancellation } from '../dataResearchCancellation';
import { createInitialAnalysisStageExecutors } from './initialAnalysisStageExecutors';
import { executeInitialAnalysisStageTool, type InitialAnalysisStageActionResult } from './initialAnalysisStageTools';
import type { InitialAnalysisRunOutcome, InitialAnalysisRunRequest } from './initialAnalysisTypes';
import { createPiCompactionTelemetry, createPiProviderContextTransform, createPiProviderStream, resolvePiModel, resolvePiThinkingLevel } from './piProvider';
import { describeInitialAnalysisFailure, isInitialAnalysisProviderFailure } from './initialAnalysisFailure';
import { runPiResearchPlanner } from './piResearchPlanner';

const STAGES = createInitialAnalysisStageToolManifests();
const CHECKPOINT_PREFIX = 'pi-initial-analysis-v1:';
const INITIAL_ANALYSIS_BUDGET_MS = 240_000;
// Pi may skip these when the earlier stages show the data needs no cleaning. Every other stage is
// required, so the host never lets a run reach evidence without a prepared, validated dataset.
const OPTIONAL_STAGE_NAMES: ReadonlySet<string> = new Set(['dataset.suggestCleaningPlan', 'dataset.applyTransform']);
const MAX_INVALID_STAGE_REQUESTS = 2;

const activeRuns = new Map<string, { agent: Agent; controller: AbortController; runtimeRunId: string; cancelledByUser: boolean }>();

/** Stops the running initial analysis for a session; returns false when none is running. */
export const cancelPiInitialAnalysis = (appSessionId: string): boolean => {
    const active = activeRuns.get(appSessionId);
    if (!active || active.controller.signal.aborted) return false;
    active.cancelledByUser = true;
    active.controller.abort(new Error('The analysis was stopped.'));
    return true;
};

// The real size of the dataset the next stage will work on (it changes after cleaning).
const readCurrentRowCount = (store: StoreApi): number | null => {
    const dataset = getPreferredAnalysisDataset(store.getState());
    const count = dataset?.backing?.rowCount ?? dataset?.data?.length;
    return typeof count === 'number' && Number.isFinite(count) ? count : null;
};

interface PiInitialCheckpoint {
    schemaVersion: 1;
    sessionId: string;
    datasetVersion: string;
    researchGoal: string;
    nextStageIndex: number;
    pendingStageIndex: number | null;
    committedTransformationIds: string[];
    cardFingerprints: string[];
    warnings: InitialAnalysisRunOutcome['warnings'];
    // Pi's research plan, kept so a resumed run does not lose it. Optional: older checkpoints lack it.
    researchPlan?: ResearchPlan | null;
}

const checkpointKey = (sessionId: string) => `${CHECKPOINT_PREFIX}${sessionId}`;

const readCheckpoint = (sessionId: string): PiInitialCheckpoint | null => {
    try {
        const raw = localStorage.getItem(checkpointKey(sessionId));
        if (!raw) return null;
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object') return null;
        const record = value as PiInitialCheckpoint;
        if (record.schemaVersion !== 1 || record.sessionId !== sessionId
            || !Number.isInteger(record.nextStageIndex)
            || record.nextStageIndex < 0 || record.nextStageIndex > STAGES.length) return null;
        return record;
    } catch {
        return null;
    }
};

const writeCheckpoint = (checkpoint: PiInitialCheckpoint): void => {
    try { localStorage.setItem(checkpointKey(checkpoint.sessionId), JSON.stringify(checkpoint)); }
    catch { /* Recovery is unavailable when browser storage is full. */ }
};

const discardCheckpoint = (sessionId: string): void => {
    try { localStorage.removeItem(checkpointKey(sessionId)); } catch { /* ignore */ }
};

const hasCommittedState = (checkpoint: PiInitialCheckpoint, store: StoreApi): boolean => {
    const state = store.getState();
    const transformations = new Set((state.dataPreparationPlan?.operations ?? []).map(operation => operation.id));
    const cardFingerprints = new Set(state.analysisCards.map(card =>
        buildCardSemanticFingerprint(card.plan, card.provenance?.datasetVersion)).filter(Boolean));
    return checkpoint.committedTransformationIds.every(id => transformations.has(id))
        && checkpoint.cardFingerprints.every(value => cardFingerprints.has(value));
};

/** The stage Pi must run next and the optional stages it may skip to get there. */
const describeStageChoices = (fromIndex: number): { required: string | null; skippable: string[] } => {
    const skippable: string[] = [];
    for (let index = fromIndex; index < STAGES.length; index += 1) {
        if (!OPTIONAL_STAGE_NAMES.has(STAGES[index].name)) return { required: STAGES[index].name, skippable };
        skippable.push(STAGES[index].name);
    }
    return { required: null, skippable };
};

/** Real facts Pi can base its stage choices on; no row values. */
const readStageFacts = (store: StoreApi): Record<string, number | string | null> => {
    const state = store.getState();
    const inspection = state.reportStructureResolution?.rowInspection;
    return {
        rows: readCurrentRowCount(store),
        columns: state.columnProfiles?.length ?? null,
        residualNoiseCandidates: inspection
            ? inspection.residualUnknownRowIndexes.length + inspection.residualSummaryLikeRowIndexes.length
            : null,
        dataQualityNotes: state.dataQualityIssues?.length ?? null,
    };
};

const createIdentity = (prefix: string): string =>
    `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

const sanitizeError = (error: unknown): string =>
    (error instanceof Error ? error.message : String(error))
        .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/\b(?:gw_|sk-|AIza)[A-Za-z0-9._-]{12,}\b/g, '[redacted credential]');

const run = async (
    request: InitialAnalysisRunRequest,
    store: StoreApi,
    checkpoint: PiInitialCheckpoint | null,
    streamOverride?: StreamFn,
    options: { plannerStream?: StreamFn } = {},
): Promise<InitialAnalysisRunOutcome> => {
    // A stream override replaces the model for the whole run (tests), so the planner
    // only runs when the caller also supplies its own planner stream.
    const plannerEnabled = !streamOverride || Boolean(options.plannerStream);
    if (activeRuns.has(request.appSessionId)) throw new Error('Initial analysis is already running.');
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener('abort', forwardAbort, { once: true });
    if (request.signal?.aborted) forwardAbort();
    const runtimeRunId = createIdentity('pi-initial');
    const traceId = createIdentity('pi-trace');
    let nextStageIndex = checkpoint?.nextStageIndex ?? 0;
    const results: InitialAnalysisStageActionResult[] = [];
    const warnings: InitialAnalysisRunOutcome['warnings'] = [...(checkpoint?.warnings ?? [])];
    // A fresh run must not reuse a plan left by an earlier one; a resumed run brings its own back.
    if (!checkpoint) store.setState({ initialAnalysisPlan: null });
    else if (checkpoint.researchPlan && !store.getState().initialAnalysisPlan) {
        store.setState({ initialAnalysisPlan: checkpoint.researchPlan });
    }
    const executors = createInitialAnalysisStageExecutors();
    let recoveryEnabled = !store.getState().csvData?.backing?.ephemeral;
    let providerTurns = 0;
    let invalidStageRequests = 0;
    const timer = setTimeout(() => controller.abort(new Error('The Pi initial-analysis time budget expired.')),
        INITIAL_ANALYSIS_BUDGET_MS);
    const persistCheckpoint = async (pendingStageIndex: number | null) => {
        if (!recoveryEnabled) return;
        if (pendingStageIndex === null) {
            recoveryEnabled = await persistCurrentAppSessionSnapshot(store.getState());
            if (!recoveryEnabled) return;
        }
        writeCheckpoint({
            schemaVersion: 1,
            sessionId: request.appSessionId,
            datasetVersion: request.datasetVersion,
            researchGoal: request.researchGoal,
            nextStageIndex,
            pendingStageIndex,
            committedTransformationIds: [...new Set([
                ...(checkpoint?.committedTransformationIds ?? []),
                ...results.flatMap(result => result.transformationIds),
            ])],
            cardFingerprints: store.getState().analysisCards
                .map(card => buildCardSemanticFingerprint(card.plan, card.provenance?.datasetVersion))
                .filter((value): value is string => Boolean(value)),
            warnings,
            researchPlan: store.getState().initialAnalysisPlan ?? null,
        });
    };
    const tool: AgentTool = {
        name: 'run_next_analysis_stage',
        label: 'Run next analysis stage',
        description: 'Run an app-governed CSV analysis stage. With no arguments it runs the next required stage. Pass `stage` only to skip the optional cleaning stages (dataset.suggestCleaningPlan, dataset.applyTransform) when the earlier results show the data needs no cleaning. The host validates the request and owns all arguments; no raw rows are sent to this tool.',
        parameters: Type.Object({
            stage: Type.Optional(Type.String({ description: 'Stage name to run next; later than the next stage only when every stage in between is optional.' })),
            reason: Type.Optional(Type.String({ description: 'One short sentence on why.' })),
        }),
        executionMode: 'sequential',
        replay: 'never',
        execute: async (_id, args, signal) => {
            if (nextStageIndex >= STAGES.length) {
                return { details: undefined, content: [{ type: 'text', text: 'All stages are complete.' }], terminate: true };
            }
            if (signal?.aborted || controller.signal.aborted) {
                throw signal?.reason ?? controller.signal.reason;
            }
            const requestedName = typeof (args as { stage?: unknown })?.stage === 'string'
                ? ((args as { stage: string }).stage).trim() : '';
            if (requestedName) {
                const choices = describeStageChoices(nextStageIndex);
                const requestedIndex = STAGES.findIndex(candidate => candidate.name === requestedName);
                const allowed = requestedIndex === nextStageIndex
                    || (requestedIndex > nextStageIndex && choices.skippable.length > 0
                        && requestedName === choices.required)
                    || (requestedIndex > nextStageIndex && choices.skippable.includes(requestedName));
                if (allowed) {
                    invalidStageRequests = 0;
                    if (requestedIndex > nextStageIndex) {
                        emitAgentEvent(store, {
                            runId: runtimeRunId,
                            phase: 'execution',
                            step: 'pi_skipped_optional_stages',
                            status: 'done',
                            message: `Pi skipped ${STAGES.slice(nextStageIndex, requestedIndex).map(item => item.name).join(', ')}.`,
                            detail: { runtimeOwner: 'pi', reason: String((args as { reason?: unknown }).reason ?? '').slice(0, 200) },
                        });
                        nextStageIndex = requestedIndex;
                    }
                } else {
                    invalidStageRequests += 1;
                    // After repeated invalid requests the host runs the next required stage itself, so a
                    // confused model cannot stall the run.
                    if (invalidStageRequests <= MAX_INVALID_STAGE_REQUESTS) {
                        throw new Error(`Stage "${requestedName}" cannot run now. Next required stage: ${choices.required ?? 'none'}; optional stages you may skip first: ${choices.skippable.join(', ') || 'none'}.`);
                    }
                }
            }
            const stageIndex = nextStageIndex;
            const stage = STAGES[stageIndex];
            await persistCheckpoint(stageIndex);
            const state = store.getState();
            updateAgentTaskStatus(store, {
                status: 'acting',
                // User-facing copy; the technical stage description stays in the tool manifest.
                title: 'Analysing your data',
                titleKey: `analysis_initial_stage_${stageIndex + 1}_title`,
                subtitleKey: `analysis_initial_stage_${stageIndex + 1}_desc`,
                totalSteps: STAGES.length,
                currentStep: stageIndex + 1,
                rowCount: readCurrentRowCount(store),
            });
            const result = await executeInitialAnalysisStageTool({
                toolName: stage.name,
                phase: stage.initialAnalysis.phase,
                args: {
                    datasetId: request.datasetId,
                    datasetVersion: getCurrentAnalysisDatasetVersion(state) ?? request.datasetVersion,
                    runtimeRunId,
                    traceId,
                    phaseAttempt: 1,
                    idempotencyKey: `${request.appSessionId}:${request.datasetVersion}:${stage.name}:1`,
                },
                availability: buildToolAvailabilityContext(state, {
                    toolStage: stage.stageAvailability?.[0],
                }),
                context: { request, store, signal: signal ?? controller.signal },
                executors,
            });
            results.push(result);
            // Pi decides what to investigate once the data is ready. This never fails the run:
            // without a usable plan the existing question planner is used.
            if (plannerEnabled && stage.name === 'analysis.researchQuestions' && result.decision === 'pass') {
                await runPiResearchPlanner({
                    store,
                    goal: request.researchGoal,
                    datasetVersionFallback: request.datasetVersion,
                    signal: signal ?? controller.signal,
                    streamFn: options.plannerStream,
                });
            }
            warnings.push(...result.warningCodes.map(code => ({
                code, message: result.summary, phase: result.phase,
            })));
            nextStageIndex += 1;
            await persistCheckpoint(null);
            emitAgentEvent(store, {
                runId: runtimeRunId,
                phase: 'execution',
                step: stage.name,
                status: result.decision === 'fail' ? 'error' : 'done',
                message: result.summary,
                detail: { runtimeOwner: 'pi', stageIndex: nextStageIndex, traceId },
            });
            return {
                details: undefined,
                content: [{ type: 'text', text: JSON.stringify({
                    stage: stage.name,
                    decision: result.decision,
                    summary: result.summary,
                    warningCodes: result.warningCodes,
                    remainingStages: STAGES.length - nextStageIndex,
                    nextRequired: describeStageChoices(nextStageIndex).required,
                    optionalStagesYouMaySkip: describeStageChoices(nextStageIndex).skippable,
                    facts: readStageFacts(store),
                }) }],
                terminate: result.decision === 'fail' || nextStageIndex === STAGES.length,
            };
        },
    };
    const agent = new Agent({
        initialState: {
            systemPrompt: [
                'You coordinate the app-governed CSV analysis lifecycle.',
                `Dataset: ${request.datasetId}; version: ${request.datasetVersion}.`,
                `Research goal: ${request.researchGoal}`,
                'Stages in order: ' + STAGES.map(item => item.name).join(', ') + '.',
                'Call run_next_analysis_stage repeatedly. With no arguments it runs the next required stage. The host owns all data and mutations and validates every request.',
                `You may skip ${[...OPTIONAL_STAGE_NAMES].join(' and ')} (pass stage = the stage you want next, and a short reason) only when the facts returned after dataset.detectNoiseRows show clean data: no residual noise candidates and no data quality notes. When unsure, do not skip. Every other stage is required.`,
                'Use no raw CSV rows, credentials, web access, or undeclared actions.',
                'Do not answer before the host says every stage is complete.',
            ].join('\n'),
            model: resolvePiModel(store.getState().settings),
            thinkingLevel: resolvePiThinkingLevel(store.getState().settings),
            tools: [tool],
        },
        streamFn: streamOverride ?? createPiProviderStream(store.getState().settings),
        transformContext: createPiProviderContextTransform(store.getState().settings, createPiCompactionTelemetry(store)),
        toolExecution: 'sequential',
        finishTurn: () => {
            providerTurns += 1;
            if (providerTurns > STAGES.length + 3) {
                controller.abort(new Error('Pi did not complete the governed stage sequence.'));
                agent.abort();
                return { action: 'end' };
            }
            return nextStageIndex >= STAGES.length
                || results.at(-1)?.decision === 'fail'
                ? { action: 'end' } : { action: 'continue' };
        },
    });
    const activeEntry = { agent, controller, runtimeRunId, cancelledByUser: false };
    activeRuns.set(request.appSessionId, activeEntry);
    const abortAgent = () => {
        requestDataResearchCancellation(runtimeRunId);
        agent.abort();
    };
    controller.signal.addEventListener('abort', abortAgent, { once: true });
    store.setState({ isBusy: true, isGeneratingReport: true, initialAnalysisStatus: 'running', initialAnalysisFailureKind: null });
    let status: InitialAnalysisRunOutcome['status'] = 'failed';
    let errorMessage = '';
    let providerFailure = false;
    try {
        if (!streamOverride) await ensureCloudAiConsent(store.getState().settings.provider);
        await persistCheckpoint(null);
        await agent.prompt('Start the next governed stage. Continue until all stages are complete.');
        if (controller.signal.aborted) throw controller.signal.reason;
        if (agent.state.errorMessage) {
            providerFailure = true;
            throw new Error(agent.state.errorMessage);
        }
        status = nextStageIndex === STAGES.length && results.every(result => result.decision === 'pass')
            && warnings.length === 0 ? 'completed' : 'degraded';
    } catch (error) {
        errorMessage = sanitizeError(error);
        providerFailure ||= isInitialAnalysisProviderFailure(error);
        status = controller.signal.aborted && (request.signal?.aborted || activeEntry.cancelledByUser) ? 'cancelled'
            : results.length > 0 ? 'degraded' : 'failed';
        if (status === 'degraded') warnings.push({
            code: 'pi_initial_analysis_incomplete',
            message: errorMessage,
            phase: STAGES[nextStageIndex]?.initialAnalysis.phase,
        });
    } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', abortAgent);
        request.signal?.removeEventListener('abort', forwardAbort);
        activeRuns.delete(request.appSessionId);
        if (status === 'completed' || status === 'degraded' || status === 'cancelled') {
            discardCheckpoint(request.appSessionId);
        }
    }
    const finalDatasetVersion = getCurrentAnalysisDatasetVersion(store.getState()) ?? request.datasetVersion;
    const trustedCardIds = resolveAnalysisCompletionGate({
        cards: store.getState().analysisCards,
        currentDatasetVersion: finalDatasetVersion,
        columnProfiles: store.getState().columnProfiles,
    }).trustedBusinessCardIds;
    const noUsableResults = status !== 'cancelled' && trustedCardIds.length === 0;
    store.setState({
        isBusy: false,
        isGeneratingReport: false,
        initialAnalysisStatus: status === 'cancelled' ? 'paused'
            : noUsableResults || status === 'failed' ? 'error'
                : status === 'completed' ? 'ready' : 'degraded',
        initialAnalysisFailureKind: providerFailure ? 'provider'
            : noUsableResults || status === 'failed' ? 'analysis' : null,
    });
    if (noUsableResults && store.getState().pipelineOutcome?.canAutoAnalyze === false
        && store.getState().reportStructureResolution && store.getState().rawIntakeIr) {
        store.getState().setIsReportBoundaryConfirmModalOpen?.(true);
    }
    updateAgentTaskStatus(store, {
        status: status === 'failed' || noUsableResults ? 'error' : 'done',
        title: noUsableResults ? 'Unable to reliably analyze'
            : status === 'completed' ? 'Analysis ready' : 'Analysis ready with limitations',
        subtitle: noUsableResults || status === 'failed'
            ? describeInitialAnalysisFailure({
                results,
                errorText: errorMessage ? presentGatewayError(errorMessage, store.getState().settings.language) : '',
                stoppedStage: STAGES[nextStageIndex] ? { index: nextStageIndex, name: STAGES[nextStageIndex].name } : undefined,
                totalStages: STAGES.length,
                fallbackWarning: warnings[0]?.message,
            })
            : warnings[0]?.message ?? presentGatewayError(errorMessage, store.getState().settings.language),
        totalSteps: STAGES.length,
        currentStep: Math.min(nextStageIndex, STAGES.length),
    });
    return {
        status,
        currentDatasetVersion: request.datasetVersion,
        finalDatasetVersion,
        trustedCardIds,
        warnings,
        runtimeRunId,
        traceId,
        ...(status === 'failed' ? { error: {
            code: 'pi_initial_analysis_failed',
            message: errorMessage || 'Pi did not complete the governed analysis.',
            retryable: true,
        } } : {}),
    };
};

export const runPiInitialAnalysis = (
    request: InitialAnalysisRunRequest,
    store: StoreApi,
    streamOverride?: StreamFn,
    options?: { plannerStream?: StreamFn },
): Promise<InitialAnalysisRunOutcome> => {
    discardCheckpoint(request.appSessionId);
    return run(request, store, null, streamOverride, options);
};

export const recoverPiInitialAnalysisIfNeeded = async (store: StoreApi): Promise<InitialAnalysisRunOutcome | null> => {
    const state = store.getState();
    const checkpoint = readCheckpoint(state.sessionId);
    if (!checkpoint) return null;
    if (checkpoint.datasetVersion !== getCurrentAnalysisDatasetVersion(state)
        || checkpoint.researchGoal !== state.confirmedAnalysisGoal
        || checkpoint.pendingStageIndex !== null
        || !hasCommittedState(checkpoint, store)) {
        discardCheckpoint(state.sessionId);
        state.addProgress?.('The interrupted Pi analysis cannot resume safely. Review the last stable dataset and retry.', 'warning');
        return null;
    }
    return run({
        appSessionId: state.sessionId,
        datasetId: state.currentDatasetId ?? checkpoint.datasetVersion,
        datasetVersion: checkpoint.datasetVersion,
        researchGoal: checkpoint.researchGoal,
        provider: { provider: state.settings.provider, modelId: state.settings.complexModel },
    }, store, checkpoint);
};

export const discardPiInitialAnalysisCheckpoint = discardCheckpoint;

export const purgePiInitialAnalysisCheckpoints = (keepSessionIds: Iterable<string> = []): void => {
    const keep = new Set([...keepSessionIds].map(checkpointKey));
    try {
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(CHECKPOINT_PREFIX) && !keep.has(key)) localStorage.removeItem(key);
        }
    } catch { /* Browser storage may be unavailable. */ }
};
