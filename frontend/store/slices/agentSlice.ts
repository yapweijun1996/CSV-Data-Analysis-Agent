
import type { StateCreator } from 'zustand';
import type { AppStore } from '../useAppStore';
import {
    AgentEvent,
    AgentRuntimeEvent,
    AgentTurn,
    AiTaskStatusMessage,
    AgentMemoryRun,
    AgentToolLogEntry,
    CardEnhancementSuggestion,
    ChartType,
    QueuedAgentRun,
    RuntimeRunRecord,
} from '../../types';
import { createChatMessage } from '../../utils/messageState';
import { buildCorrelationFields } from '../../services/agent/correlation';
import {
    createEventObject,
    createToolLogEntry,
    createRuntimeEventObject,
    scheduleTelemetryFlush,
    pendingAgentEvents,
    pendingRuntimeEvents,
    flushTelemetryToStore,
    resetAgentTelemetryBuffers,
} from './agentTelemetryHelpers';
import { createAgentReportActions } from './agentReportActions';
import { recordLocalDiagnosticBestEffort } from '../../services/observability/localDiagnostics';
import {
    projectRuntimeEventToActivity,
    projectToolLogToActivity,
} from '../../services/agent/activity/agentActivity';

export { flushTelemetryToStore } from './agentTelemetryHelpers';

export interface IAgentSlice {
    agentEvents: AgentEvent[];
    agentToolLogs: AgentToolLogEntry[];
    cardEnhancementSuggestions: CardEnhancementSuggestion[];
    isCardReviewInProgress: boolean;
    agentMemoryRun: AgentMemoryRun | null;
    liveAgentMemoryRun: AgentMemoryRun | null;
    agentMemoryHistory: AgentMemoryRun[];
    selectedMemoryRunId: string | null;
    currentDatasetId: string | null;
    activeTurn: AgentTurn | null;
    queuedAgentRuns: QueuedAgentRun[];
    cancelRequestedTurnId: string | null;
    runtimeEvents: AgentRuntimeEvent[];
    runtimeRunHistory: RuntimeRunRecord[];
    lastInsightExtractedAtTurn: number;
    recordAgentEvent: (event: Omit<AgentEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: Date }) => AgentEvent;
    recordRuntimeEvent: (event: Omit<AgentRuntimeEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: Date }) => AgentRuntimeEvent;
    enqueueAgentRun: (run: QueuedAgentRun) => void;
    dequeueQueuedAgentRun: (queueId: string) => QueuedAgentRun | null;
    appendRuntimeRunRecord: (record: RuntimeRunRecord) => void;
    setActiveTurn: (turn: AgentTurn | null) => void;
    clearActiveTurn: () => void;
    requestActiveTurnCancellation: () => void;
    clearActiveTurnCancellation: () => void;
    requestActiveResearchCancellation: () => void;
    requestInitialAnalysisCancellation: () => void;
    setAiTaskStatus: (status: AiTaskStatusMessage | null) => void;
    setAgentMemoryRun: (run: AgentMemoryRun | null) => void;
    setLiveAgentMemoryRun: (run: AgentMemoryRun | null) => void;
    setAgentMemoryHistory: (runs: AgentMemoryRun[]) => void;
    selectAgentMemoryRun: (runId: string | null) => void;
    setCurrentDatasetId: (datasetId: string | null) => void;
    clearAgentEvents: () => void;
    syncTelemetryToStore: () => void;
    logAgentToolUsage: (entry: Omit<AgentToolLogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: Date }) => void;
    runCardEnhancementReview: () => Promise<void>;
    generateAnalystReport: () => Promise<void>;
    cancelReportGeneration: () => void;
    openLatestAnalystReport: () => void;
    exportLatestAnalystReportPdf: () => void;
    applyCardEnhancementSuggestion: (suggestionId: string) => Promise<void>;
    dismissCardEnhancementSuggestion: (suggestionId: string) => void;
}

const MAX_TOOL_LOGS = 200;
const MAX_RUNTIME_RUN_HISTORY = 50;

export const createAgentSlice: StateCreator<AppStore, [], [], IAgentSlice> = (set, get) => ({
    agentEvents: [],
    agentToolLogs: [],
    activeTurn: null,
    queuedAgentRuns: [],
    cancelRequestedTurnId: null,
    runtimeEvents: [],
    runtimeRunHistory: [],
    lastInsightExtractedAtTurn: 0,
    cardEnhancementSuggestions: [],
    isCardReviewInProgress: false,
    agentMemoryRun: null,
    liveAgentMemoryRun: null,
    agentMemoryHistory: [],
    selectedMemoryRunId: null,
    currentDatasetId: null,
    recordAgentEvent: (eventInput) => {
        const correlation = buildCorrelationFields(get(), eventInput);
        const event = createEventObject({
            ...eventInput,
            sessionId: eventInput.sessionId ?? correlation.sessionId,
            datasetId: eventInput.datasetId ?? correlation.datasetId,
            runId: eventInput.runId ?? correlation.runId,
            turnId: eventInput.turnId ?? correlation.turnId,
            stepId: eventInput.stepId ?? correlation.stepId,
            toolCallId: eventInput.toolCallId ?? correlation.toolCallId,
            cleaningRunId: eventInput.cleaningRunId ?? correlation.cleaningRunId,
            requestId: eventInput.requestId ?? correlation.requestId,
        });
        pendingAgentEvents.push(event);
        recordLocalDiagnosticBestEffort({
            runId: event.runId ?? null,
            phase: event.phase,
            attempt: typeof event.detail?.attempt === 'number' ? event.detail.attempt : undefined,
            tool: event.step,
            provider: get().settings?.provider ?? 'local',
            model: get().settings?.complexModel ?? null,
            durationMs: typeof event.detail?.durationMs === 'number' ? event.detail.durationMs : null,
            outcome: event.status === 'error'
                ? 'failed'
                : event.status === 'done'
                    ? 'succeeded'
                    : 'started',
            reasonCode: typeof event.detail?.reasonCode === 'string'
                ? event.detail.reasonCode
                : event.step,
            payload: event,
        });
        scheduleTelemetryFlush(set, get);
        return event;
    },
    recordRuntimeEvent: (eventInput) => {
        const event = createRuntimeEventObject({
            ...eventInput,
            sessionId: eventInput.sessionId ?? get().sessionId,
            runId: eventInput.runId ?? get().activeTurn?.runId,
            turnId: eventInput.turnId ?? get().activeTurn?.turnId,
            toolCallId: eventInput.toolCallId ?? get().activeTurn?.steps.at(-1)?.toolCallId ?? get().activeTurn?.steps.at(-1)?.stepId,
        });
        pendingRuntimeEvents.push(event);
        pendingAgentEvents.push(projectRuntimeEventToActivity(event));
        recordLocalDiagnosticBestEffort({
            runId: event.runId ?? null,
            phase: event.stage ?? 'runtime',
            attempt: typeof event.detail?.retryAttempt === 'number'
                ? event.detail.retryAttempt
                : undefined,
            tool: event.type,
            provider: get().settings?.provider ?? 'local',
            model: get().settings?.complexModel ?? null,
            durationMs: typeof event.detail?.durationMs === 'number'
                ? event.detail.durationMs
                : null,
            outcome: event.type === 'turn_cancelled'
                ? 'cancelled'
                : event.type === 'turn_failed' || event.type === 'action_execution_error'
                    ? 'failed'
                    : event.type === 'turn_blocked'
                        ? 'blocked'
                        : event.type === 'turn_completed'
                            ? 'succeeded'
                            : 'started',
            reasonCode: event.reason ?? event.failureClass ?? event.type,
            payload: event,
        });
        scheduleTelemetryFlush(set, get);
        return event;
    },
    enqueueAgentRun: (run) => {
        set(state => ({
            queuedAgentRuns: [...state.queuedAgentRuns, run],
        }));
    },
    dequeueQueuedAgentRun: (queueId) => {
        const queuedRun = get().queuedAgentRuns.find(run => run.queueId === queueId) ?? null;
        if (!queuedRun) {
            return null;
        }
        set(state => ({
            queuedAgentRuns: state.queuedAgentRuns.filter(run => run.queueId !== queueId),
        }));
        return queuedRun;
    },
    appendRuntimeRunRecord: (record) => {
        set(state => ({
            runtimeRunHistory: [...state.runtimeRunHistory, record].slice(-MAX_RUNTIME_RUN_HISTORY),
        }));
    },
    setActiveTurn: (turn) => set({ activeTurn: turn }),
    clearActiveTurn: () => set({ activeTurn: null, isBusy: false, chatLifecycleState: 'idle' }),
    requestActiveTurnCancellation: async () => {
        const activeTurn = get().activeTurn;
        if (!activeTurn || activeTurn.status !== 'running') {
            return;
        }
        if (get().cancelRequestedTurnId === activeTurn.turnId) {
            return;
        }
        const [{ abortRuntimeTurn }, { buildRuntimeContractDetail }] = await Promise.all([
            import('../../services/agent/runtime/runtimeAbort'),
            import('../../services/agent/runtime/runtimeControlPlaneContract'),
        ]);
        set({ cancelRequestedTurnId: activeTurn.turnId });
        abortRuntimeTurn(activeTurn.turnId);
        get().recordRuntimeEvent({
            turnId: activeTurn.turnId,
            type: 'turn_cancellation_requested',
            message: 'Cancellation requested for the active agent turn.',
            detail: buildRuntimeContractDetail({
                reasonCode: 'cancellation_requested',
                retryable: false,
                abortMode: 'checkpoint_abort',
                abortSource: 'runtime_cancellation',
                abortPropagationStatus: 'checkpoint_only',
                source: 'runtime_cancellation_request',
            }),
        });
    },
    clearActiveTurnCancellation: () => set({ cancelRequestedTurnId: null }),
    requestActiveResearchCancellation: async () => {
        const researchRun = get().activeAnalysisSession;
        if (!researchRun || researchRun.status !== 'running') return;
        const { requestDataResearchCancellation } = await import(
            '../../services/agent/runtime/dataResearchCancellation'
        );
        requestDataResearchCancellation(researchRun.runId);
        set(state => ({
            activeAnalysisSession: state.activeAnalysisSession?.runId === researchRun.runId
                ? {
                    ...state.activeAnalysisSession,
                    cancellationRequestedAt: state.activeAnalysisSession.cancellationRequestedAt ?? new Date(),
                }
                : state.activeAnalysisSession,
        }));
        get().recordAgentEvent({
            runId: researchRun.runId,
            phase: 'execution',
            step: 'research_run_cancellation_requested',
            status: 'in_progress',
            message: 'Cancellation requested. The research run will stop at the next safe checkpoint.',
            activity: {
                kind: 'research',
                lifecycle: 'waiting',
                source: 'app',
                eventType: 'research_run_cancellation_requested',
                title: 'Stopping research run',
                explanation: 'The current operation may finish, but no later research question will start.',
            },
        });
    },
    requestInitialAnalysisCancellation: async () => {
        const { cancelPiInitialAnalysis } = await import(
            '../../services/agent/runtime/pi/piInitialAnalysisRuntimeService'
        );
        cancelPiInitialAnalysis(get().sessionId);
    },
    logAgentToolUsage: (entryInput) => {
        const activeTurn = get().activeTurn;
        const activeStep = activeTurn?.steps.at(-1);
        const correlation = buildCorrelationFields(get(), entryInput);
        const entry = createToolLogEntry({
            ...entryInput,
            sessionId: entryInput.sessionId ?? correlation.sessionId ?? get().sessionId,
            datasetId: entryInput.datasetId ?? correlation.datasetId,
            runId: entryInput.runId ?? correlation.runId ?? activeTurn?.runId,
            turnId: entryInput.turnId ?? correlation.turnId ?? activeTurn?.turnId,
            stepId: entryInput.stepId ?? correlation.stepId ?? activeStep?.stepId,
            toolCallId: entryInput.toolCallId ?? correlation.toolCallId ?? activeStep?.toolCallId ?? activeStep?.stepId,
            cleaningRunId: entryInput.cleaningRunId ?? correlation.cleaningRunId,
            requestId: entryInput.requestId ?? correlation.requestId,
        });
        recordLocalDiagnosticBestEffort({
            runId: entry.runId ?? null,
            phase: entry.stage ?? 'tool',
            attempt: typeof entry.detail?.attempt === 'number' ? entry.detail.attempt : undefined,
            tool: entry.tool,
            provider: get().settings?.provider ?? 'local',
            model: get().settings?.complexModel ?? null,
            durationMs: typeof entry.detail?.durationMs === 'number' ? entry.detail.durationMs : null,
            outcome: entry.policyDecision === 'blocked' ? 'blocked' : 'succeeded',
            reasonCode: entry.policyReason ?? entry.tool,
            payload: entry,
        });
        pendingAgentEvents.push(projectToolLogToActivity(entry));
        scheduleTelemetryFlush(set, get);
        set(state => {
            const updated = [...state.agentToolLogs, entry];
            return { agentToolLogs: updated.slice(-MAX_TOOL_LOGS) };
        });
    },
    runCardEnhancementReview: async () => {
        const { analysisCards, settings, addProgress } = get();
        if (analysisCards.length === 0) {
            addProgress('No cards available to review yet.', 'system');
            return;
        }
        set({ isCardReviewInProgress: true });
        try {
            const { generateCardEnhancementSuggestions } = await import('../../services/ai/enhancementGenerator');
            const cardContext = analysisCards.map(card => ({
                id: card.id,
                title: card.plan.title,
                aggregatedDataSample: card.aggregatedData.slice(0, 15),
                groupByColumn: card.plan.groupByColumn,
                valueColumn: card.plan.valueColumn,
                aggregation: card.plan.aggregation,
            }));
            const suggestions = await generateCardEnhancementSuggestions(cardContext, settings);
            if (!suggestions || suggestions.length === 0) {
                set(prev => ({
                    cardEnhancementSuggestions: [],
                    isCardReviewInProgress: false,
                    chatHistory: [
                        ...prev.chatHistory,
                        createChatMessage({
                            sender: 'ai',
                            text: 'AI reviewed all cards but found no additional enhancements at the moment.',
                            timestamp: new Date(),
                            type: 'ai_message',
                        }),
                    ],
                }));
                addProgress('AI review complete – no enhancements suggested.', 'system');
                return;
            }
            const cardTitleMap = new Map(analysisCards.map(card => [card.id, card.plan.title]));
            const suggestionsWithMeta: CardEnhancementSuggestion[] = suggestions.map((suggestion, idx) => ({
                ...suggestion,
                cardTitle: String(suggestion.cardTitle ?? cardTitleMap.get(suggestion.cardId) ?? suggestion.cardId),
                id: suggestion.id ?? `card-enhancement-${Date.now()}-${idx}`,
                createdAt: new Date(),
                shortCode: `S${idx + 1}`,
                status: 'pending',
                updateChart: suggestion.updateChart ? {
                    ...suggestion.updateChart,
                    newChartType: suggestion.updateChart.newChartType as ChartType | undefined
                } : undefined
            }));
            set(prev => ({
                cardEnhancementSuggestions: suggestionsWithMeta,
                isCardReviewInProgress: false,
                chatHistory: [
                    ...prev.chatHistory,
                    createChatMessage({
                        sender: 'ai',
                        text: `AI reviewed all cards and proposed ${suggestionsWithMeta.length} enhancement${suggestionsWithMeta.length > 1 ? 's' : ''}. Reply "Approve S1" or "Dismiss S1" to act on a suggestion.`,
                        timestamp: new Date(),
                        type: 'ai_message',
                    }),
                    ...suggestionsWithMeta.map(s => createChatMessage({
                        sender: 'ai',
                        text: `Suggestion ${s.shortCode} (${s.priority.toUpperCase()}) for **${s.cardTitle}**:\n${s.rationale}\n\nProposed column: ${s.proposedColumnName ? `**${s.proposedColumnName}** = ${s.formula}` : 'N/A'}\nReply "Approve ${s.shortCode}" to apply or "Dismiss ${s.shortCode}" to skip.`,
                        timestamp: new Date(),
                        type: 'ai_enhancement_suggestion',
                        enhancementSuggestionId: s.id,
                    })),
                ],
            }));
            addProgress(`AI proposed ${suggestionsWithMeta.length} potential enhancement${suggestionsWithMeta.length > 1 ? 's' : ''}.`, 'system');
        } catch (error) {
            console.error('Card enhancement review failed:', error);
            get().addProgress('AI card review failed. Please try again.', 'error');
            set({ isCardReviewInProgress: false });
        }
    },

    /* ── Report actions (delegated to agentReportActions.ts) ── */
    ...createAgentReportActions(set as any, get),

    applyCardEnhancementSuggestion: async (suggestionId) => {
        const { cardEnhancementSuggestions, addCalculatedColumnToCard, addProgress } = get();
        const suggestion = cardEnhancementSuggestions.find(s => s.id === suggestionId);
        if (!suggestion || suggestion.status === 'applied' || suggestion.status === 'dismissed') return;
        set({
            cardEnhancementSuggestions: cardEnhancementSuggestions.map(s =>
                s.id === suggestionId ? { ...s, status: 'applying' } : s
            ),
        });
        try {
            if (suggestion.action === 'add_calculated_column' && suggestion.proposedColumnName && suggestion.formula) {
                const updateInstructions = suggestion.updateChart ?? { useAs: 'primaryY' as const };
                addCalculatedColumnToCard(suggestion.cardId, suggestion.proposedColumnName, suggestion.formula, updateInstructions);
                set({
                    cardEnhancementSuggestions: get().cardEnhancementSuggestions.map(s =>
                        s.id === suggestionId ? { ...s, status: 'applied' } : s
                    ),
                });
                addProgress(`Applied enhancement on ${suggestion.cardTitle}.`, 'system');
            } else {
                addProgress(`Suggestion ${suggestion.shortCode} is informational only and cannot be auto-applied.`, 'error');
                set({
                    cardEnhancementSuggestions: get().cardEnhancementSuggestions.map(s =>
                        s.id === suggestionId ? { ...s, status: 'failed' } : s
                    ),
                });
                return;
            }
        } catch (error) {
            console.error('Failed to apply enhancement suggestion:', error);
            addProgress(`Failed to apply enhancement on ${suggestion.cardTitle}.`, 'error');
            set({
                cardEnhancementSuggestions: get().cardEnhancementSuggestions.map(s =>
                    s.id === suggestionId ? { ...s, status: 'failed' } : s
                ),
            });
        }
    },
    dismissCardEnhancementSuggestion: (suggestionId) => {
        set(state => ({
            cardEnhancementSuggestions: state.cardEnhancementSuggestions.map(s =>
                s.id === suggestionId ? { ...s, status: 'dismissed' } : s
            ),
        }));
    },
    setAiTaskStatus: (status) => set({ aiTaskStatus: status }),
    setAgentMemoryRun: (run) => set({ agentMemoryRun: run, selectedMemoryRunId: run?.runId ?? null }),
    setLiveAgentMemoryRun: (run) => set({ liveAgentMemoryRun: run }),
    setAgentMemoryHistory: (runs) => set({ agentMemoryHistory: runs }),
    selectAgentMemoryRun: (runId) => {
        if (!runId) {
            const live = get().liveAgentMemoryRun ?? null;
            set({
                agentMemoryRun: live,
                // `null` is the explicit live-view sentinel used by the
                // activity modal. Keeping the live run id here incorrectly
                // switches the timeline to the stored memory snapshot and can
                // hide the current agent event stream.
                selectedMemoryRunId: null,
            });
            return;
        }
        const historyRun = get().agentMemoryHistory.find(run => run.runId === runId);
        if (historyRun) {
            set({
                agentMemoryRun: historyRun,
                selectedMemoryRunId: runId,
            });
        }
    },
    setCurrentDatasetId: (datasetId) => set({ currentDatasetId: datasetId }),
    clearAgentEvents: () => {
        resetAgentTelemetryBuffers();
        set({
            agentEvents: [],
            runtimeEvents: [],
            agentToolLogs: [],
            cardEnhancementSuggestions: [],
        });
    },
    syncTelemetryToStore: () => flushTelemetryToStore(set, get),
});
