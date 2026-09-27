import { vi } from 'vitest';
import type {
    ActiveDataQuery,
    AgentEvent,
    AgentRuntimeEvent,
    AgentTurn,
    ClarificationRequest,
    DataPreparationPlan,
    DatasetSemanticSnapshot,
    LocalizedText,
    MetricMappingValidationArtifact,
    QueuedAgentRun,
    RuntimeRunRecord,
    StreamingMessage,
    TelemetryEvent,
} from '../types';
import { abortRuntimeTurn } from '../services/agent/runtime/runtimeAbort';
import { createIdleDuckDbSessionStatus } from '../services/duckdb/sessionStatus';

type RuntimeTestState = {
    settings: {
        provider: 'openai';
        geminiApiKey: string;
        openAIApiKey: string;
        simpleModel: string;
        complexModel: string;
        language: 'English';
        autoConfirmGoal: boolean;
    };
    sessionId: string;
    currentDatasetId: string;
    analysisCards: [];
    cardEnhancementSuggestions: [];
    columnProfiles: Array<Record<string, unknown>>;
    chatHistory: Array<Record<string, unknown>>;
    csvData: { fileName: string; data: Array<Record<string, unknown>> };
    cleaningRun: null;
    aiCoreAnalysisSummary: LocalizedText | null;
    finalSummary: LocalizedText | null;
    contextualSummary: string | null;
    dataPreparationPlan: DataPreparationPlan | null;
    agentMemoryRun: undefined;
    activeDataQuery: ActiveDataQuery | null;
    activeMetricMappingValidation: MetricMappingValidationArtifact | null;
    activeSpreadsheetFilter: null;
    aiFilterExplanation: string | null;
    spreadsheetFilterFunction: null;
    queryHistory: [];
    workspaceActionHistory: [];
    datasetSemanticSnapshot: DatasetSemanticSnapshot | null;
    semanticStatus: 'idle' | 'running' | 'ready' | 'fallback' | 'error';
    semanticDatasetVersion: string | null;
    duckDbSessionStatus: ReturnType<typeof createIdleDuckDbSessionStatus>;
    pendingClarification: ClarificationRequest | null;
    activeTurn: AgentTurn | null;
    queuedAgentRuns: QueuedAgentRun[];
    cancelRequestedTurnId: string | null;
    runtimeEvents: AgentRuntimeEvent[];
    runtimeRunHistory: RuntimeRunRecord[];
    telemetryEvents: TelemetryEvent[];
    agentEvents: AgentEvent[];
    isBusy: boolean;
    streamingMessage: StreamingMessage | null;
    addProgress: ReturnType<typeof vi.fn>;
    logAgentToolUsage: ReturnType<typeof vi.fn>;
    logTelemetryEvent: ReturnType<typeof vi.fn>;
    recordAgentEvent: ReturnType<typeof vi.fn>;
    setStreamingMessage: (text: string) => void;
    clearStreamingMessage: () => void;
    enqueueAgentRun: (run: QueuedAgentRun) => void;
    dequeueQueuedAgentRun: (queueId: string) => QueuedAgentRun | null;
    appendRuntimeRunRecord: (record: RuntimeRunRecord) => void;
    setActiveTurn: (turn: AgentTurn | null) => void;
    clearActiveTurn: () => void;
    requestActiveTurnCancellation: () => void;
    clearActiveTurnCancellation: () => void;
    recordRuntimeEvent: (event: Omit<AgentRuntimeEvent, 'id' | 'timestamp'>) => AgentRuntimeEvent;
};

export const createRuntimeTestStore = (overrides: Partial<RuntimeTestState> = {}) => {
    let state = {} as RuntimeTestState;

    const setState = (
        update: Partial<RuntimeTestState> | ((current: RuntimeTestState) => Partial<RuntimeTestState>),
    ) => {
        const partial = typeof update === 'function' ? update(state) : update;
        state = { ...state, ...partial };
    };

    const getState = () => state;

    const logTelemetryEvent = vi.fn(({ stage, responseType, detail, chunkSize, meta }) => {
        const event: TelemetryEvent = {
            id: `telemetry-${state.telemetryEvents.length + 1}`,
            provider: state.settings.provider,
            stage,
            responseType,
            detail,
            chunkSize,
            meta,
            timestamp: new Date(),
        };
        state = {
            ...state,
            telemetryEvents: [...state.telemetryEvents, event],
        };
    });

    const recordAgentEvent = vi.fn((event: Omit<AgentEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: Date }) => {
        const storedEvent: AgentEvent = {
            ...event,
            id: event.id ?? `agent-event-${state.agentEvents.length + 1}`,
            timestamp: event.timestamp ?? new Date(),
        };
        state = {
            ...state,
            agentEvents: [...state.agentEvents, storedEvent],
        };
        return storedEvent;
    });

    const recordRuntimeEvent = (event: Omit<AgentRuntimeEvent, 'id' | 'timestamp'>): AgentRuntimeEvent => {
        const storedEvent: AgentRuntimeEvent = {
            ...event,
            id: `runtime-event-${state.runtimeEvents.length + 1}`,
            timestamp: new Date(),
        };
        state = {
            ...state,
            runtimeEvents: [...state.runtimeEvents, storedEvent],
        };
        return storedEvent;
    };

    state = {
        settings: {
            provider: 'openai',
            geminiApiKey: '',
            openAIApiKey: 'key',
            simpleModel: 'gpt-5-mini',
            complexModel: 'gpt-5.2',
            language: 'English',
            autoConfirmGoal: true,
        },
        sessionId: 'session-1',
        currentDatasetId: 'dataset-1',
        analysisCards: [],
        cardEnhancementSuggestions: [],
        columnProfiles: [{ name: 'Amount', type: 'numerical' }],
        chatHistory: [],
        csvData: {
            fileName: 'report.csv',
            data: [{ Amount: 10 }],
        },
        cleaningRun: null,
        aiCoreAnalysisSummary: null,
        finalSummary: null,
        contextualSummary: null,
        dataPreparationPlan: null,
        agentMemoryRun: undefined,
        activeDataQuery: null,
        activeMetricMappingValidation: null,
        activeSpreadsheetFilter: null,
        aiFilterExplanation: null,
        spreadsheetFilterFunction: null,
        queryHistory: [],
        workspaceActionHistory: [],
        datasetSemanticSnapshot: null,
        semanticStatus: 'idle',
        semanticDatasetVersion: null,
        pendingClarification: null,
        activeTurn: null,
        queuedAgentRuns: [],
        cancelRequestedTurnId: null,
        runtimeEvents: [],
        runtimeRunHistory: [],
        telemetryEvents: [],
        agentEvents: [],
        isBusy: false,
        duckDbSessionStatus: createIdleDuckDbSessionStatus(),
        addProgress: vi.fn(),
        logAgentToolUsage: vi.fn(),
        logTelemetryEvent,
        recordAgentEvent,
        enqueueAgentRun: (run) => {
            state = {
                ...state,
                queuedAgentRuns: [...state.queuedAgentRuns, run],
            };
        },
        dequeueQueuedAgentRun: (queueId) => {
            const queuedRun = state.queuedAgentRuns.find(run => run.queueId === queueId) ?? null;
            if (!queuedRun) {
                return null;
            }
            state = {
                ...state,
                queuedAgentRuns: state.queuedAgentRuns.filter(run => run.queueId !== queueId),
            };
            return queuedRun;
        },
        appendRuntimeRunRecord: (record) => {
            state = {
                ...state,
                runtimeRunHistory: [...state.runtimeRunHistory, record].slice(-50),
            };
        },
        setActiveTurn: (turn) => {
            state = { ...state, activeTurn: turn };
        },
        clearActiveTurn: () => {
            state = { ...state, activeTurn: null };
        },
        requestActiveTurnCancellation: () => {
            const turnId = state.activeTurn?.turnId ?? null;
            if (turnId) {
                abortRuntimeTurn(turnId);
            }
            state = {
                ...state,
                cancelRequestedTurnId: turnId,
            };
        },
        clearActiveTurnCancellation: () => {
            state = { ...state, cancelRequestedTurnId: null };
        },
        streamingMessage: null,
        setStreamingMessage: (text: string) => {
            state = {
                ...state,
                streamingMessage: state.streamingMessage
                    ? { ...state.streamingMessage, text }
                    : { text, isStreaming: true, startedAt: new Date() },
            };
        },
        clearStreamingMessage: () => {
            state = { ...state, streamingMessage: null };
        },
        recordRuntimeEvent,
        ...overrides,
    };

    return {
        getState,
        setState,
    };
};
