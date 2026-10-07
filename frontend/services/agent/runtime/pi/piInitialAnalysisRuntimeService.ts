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
import type { StoreApi } from '../../types';
import { requestDataResearchCancellation } from '../dataResearchCancellation';
import { createInitialAnalysisStageExecutors } from './initialAnalysisStageExecutors';
import { executeInitialAnalysisStageTool, type InitialAnalysisStageActionResult } from './initialAnalysisStageTools';
import type { InitialAnalysisRunOutcome, InitialAnalysisRunRequest } from './initialAnalysisTypes';
import { createPiCompactionTelemetry, createPiProviderContextTransform, createPiProviderStream, resolvePiModel, resolvePiThinkingLevel } from './piProvider';
import { isInitialAnalysisProviderFailure } from './initialAnalysisFailure';

const STAGES = createInitialAnalysisStageToolManifests();
const CHECKPOINT_PREFIX = 'pi-initial-analysis-v1:';
const INITIAL_ANALYSIS_BUDGET_MS = 240_000;
const activeRuns = new Map<string, { agent: Agent; controller: AbortController; runtimeRunId: string }>();

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
): Promise<InitialAnalysisRunOutcome> => {
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
    const executors = createInitialAnalysisStageExecutors();
    let recoveryEnabled = !store.getState().csvData?.backing?.ephemeral;
    let providerTurns = 0;
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
        });
    };
    const tool: AgentTool = {
        name: 'run_next_analysis_stage',
        label: 'Run next analysis stage',
        description: 'Run the next app-governed CSV analysis stage. Call repeatedly until all nine stages are complete. The host chooses the stage and arguments; no raw rows are sent to this tool.',
        parameters: Type.Object({}),
        executionMode: 'sequential',
        replay: 'never',
        execute: async (_id, _args, signal) => {
            if (nextStageIndex >= STAGES.length) {
                return { details: undefined, content: [{ type: 'text', text: 'All stages are complete.' }], terminate: true };
            }
            if (signal?.aborted || controller.signal.aborted) {
                throw signal?.reason ?? controller.signal.reason;
            }
            const stageIndex = nextStageIndex;
            const stage = STAGES[stageIndex];
            await persistCheckpoint(stageIndex);
            const state = store.getState();
            updateAgentTaskStatus(store, {
                status: 'acting',
                title: 'Running automatic analysis',
                subtitle: stage.description,
                totalSteps: STAGES.length,
                currentStep: stageIndex + 1,
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
                'Call run_next_analysis_stage repeatedly. The host enforces the exact stage order and owns all data and mutations.',
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
    activeRuns.set(request.appSessionId, { agent, controller, runtimeRunId });
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
        status = controller.signal.aborted && request.signal?.aborted ? 'cancelled'
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
        subtitle: warnings[0]?.message ?? presentGatewayError(errorMessage, store.getState().settings.language),
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
): Promise<InitialAnalysisRunOutcome> => {
    discardCheckpoint(request.appSessionId);
    return run(request, store, null, streamOverride);
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

export const cancelPiInitialAnalysis = (sessionId: string): void => {
    const active = activeRuns.get(sessionId);
    if (active) active.controller.abort(new DOMException('Analysis was cancelled.', 'AbortError'));
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
