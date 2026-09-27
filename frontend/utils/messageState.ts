import type { AppState, ChatMessage, ProgressMessage } from '../types';
import {
    trimAgentEvents,
    trimProgressMessages,
    trimQueryHistory,
    trimWorkspaceActionHistory,
} from './storeLimits';
import { createIdleDuckDbSessionStatus } from '../services/duckdb/sessionStatus';
import { normalizeAppLanguage, normalizeLocalizedText } from './localizedText';
import { createId } from './createId';

const getTimestampSeed = (value: unknown, fallbackIndex: number) => {
    if (value instanceof Date) {
        return value.getTime();
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.getTime();
        }
    }
    return fallbackIndex;
};

export const createProgressMessage = (
    input: Omit<ProgressMessage, 'id'> & Partial<Pick<ProgressMessage, 'id'>>,
): ProgressMessage => ({
    id: input.id ?? createId('progress'),
    ...input,
});

export const createChatMessage = (
    input: Omit<ChatMessage, 'id'> & Partial<Pick<ChatMessage, 'id'>>,
): ChatMessage => ({
    id: input.id ?? createId('chat'),
    ...input,
});

export const UNFINISHED_CLEANING_SESSION_RESTORE_TEXT = 'Restored an unfinished cleaning run. Use the on-screen cleaning controls to continue from the last saved step or restart from the beginning.';
export const UNFINISHED_CLEANING_HISTORY_LOAD_TEXT = 'Loaded an unfinished cleaning run from history. Use the on-screen cleaning controls to continue before analysis or restart from the beginning.';

const UNFINISHED_CLEANING_NOTICE_CONFIG = {
    session_restore: {
        text: UNFINISHED_CLEANING_SESSION_RESTORE_TEXT,
        suggestedActions: [
            { label: 'Continue cleaning', action: 'resume cleaning' },
            { label: 'Restart cleaning', action: 'restart cleaning' },
        ],
    },
    history_load: {
        text: UNFINISHED_CLEANING_HISTORY_LOAD_TEXT,
        suggestedActions: [
            { label: 'Continue cleaning', action: 'resume cleaning' },
            { label: 'Restart cleaning', action: 'restart cleaning' },
        ],
    },
} as const;

const dedupeUnfinishedCleaningNotices = (messages: ChatMessage[]): ChatMessage[] => {
    const seenNoticeTexts = new Set<string>();
    return messages.filter(message => {
        if (
            message.sender !== 'ai'
            || message.type !== 'ai_message'
            || (
                message.text !== UNFINISHED_CLEANING_SESSION_RESTORE_TEXT
                && message.text !== UNFINISHED_CLEANING_HISTORY_LOAD_TEXT
            )
        ) {
            return true;
        }

        if (seenNoticeTexts.has(message.text)) {
            return false;
        }

        seenNoticeTexts.add(message.text);
        return true;
    });
};

export const appendUnfinishedCleaningNotice = (
    messages: ChatMessage[] | undefined,
    kind: keyof typeof UNFINISHED_CLEANING_NOTICE_CONFIG,
): ChatMessage[] => {
    const nextMessages = dedupeUnfinishedCleaningNotices(messages ?? []);
    const notice = UNFINISHED_CLEANING_NOTICE_CONFIG[kind];
    const alreadyPresent = nextMessages.some(message => (
        message.sender === 'ai'
        && message.type === 'ai_message'
        && message.text === notice.text
    ));

    if (alreadyPresent) {
        return nextMessages;
    }

    return [
        ...nextMessages,
        createChatMessage({
            sender: 'ai',
            text: notice.text,
            timestamp: new Date(),
            type: 'ai_message',
            suggestedActions: [...notice.suggestedActions],
        }),
    ];
};

export const ensureProgressMessageIds = (messages: ProgressMessage[] | undefined): ProgressMessage[] =>
    trimProgressMessages((messages ?? []).map((message, index) => ({
        ...message,
        id: message.id ?? `progress-restored-${getTimestampSeed(message.timestamp, index)}-${index}`,
    })));

export const ensureChatMessageIds = (messages: ChatMessage[] | undefined): ChatMessage[] =>
    dedupeUnfinishedCleaningNotices((messages ?? []).map((message, index) => ({
        ...message,
        id: message.id ?? `chat-restored-${getTimestampSeed(message.timestamp, index)}-${index}`,
    })));

const normalizeQueryHistory = (entries: AppState['queryHistory'] | undefined) =>
    trimQueryHistory((entries ?? []).map(entry => ({
        ...entry,
        origin: entry.origin ?? 'analysis',
    })));

const normalizeDuckDbSessionStatus = (status: AppState['duckDbSessionStatus'] | undefined) => ({
    ...createIdleDuckDbSessionStatus(),
    ...(status ?? {}),
    lastSyncedAt: status?.lastSyncedAt
        ? new Date(status.lastSyncedAt)
        : null,
});

const normalizeRuntimeEvents = (events: AppState['runtimeEvents'] | undefined) =>
    (events ?? []).map(event => ({
        ...event,
        timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
    }));

const normalizeQueuedAgentRuns = (runs: AppState['queuedAgentRuns'] | undefined) =>
    (runs ?? []).map(run => ({
        ...run,
        enqueuedAt: run.enqueuedAt ? new Date(run.enqueuedAt) : new Date(),
    }));

const normalizeRuntimeRunHistory = (history: AppState['runtimeRunHistory'] | undefined) =>
    (history ?? []).map(record => ({
        ...record,
        createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
    }));

export const normalizeRestoredGoalState = (
    goalState: AppState['goalState'] | null | undefined,
): AppState['goalState'] => {
    switch (goalState) {
        case 'confirmed':
            return 'confirmed';
        case 'awaiting_user_confirmation':
            return 'awaiting_user_confirmation';
        case 'pending_ai':
        case 'idle':
        default:
            return 'idle';
    }
};

export const normalizeRestoredAppState = <T extends Partial<AppState>>(state: T): T => ({
    ...state,
    settings: state.settings
        ? {
            ...state.settings,
            language: normalizeAppLanguage(state.settings.language),
        }
        : state.settings,
    progressMessages: ensureProgressMessageIds(state.progressMessages),
    chatHistory: ensureChatMessageIds(state.chatHistory),
    analysisCards: (state.analysisCards ?? []).map(card => ({
        ...card,
        hideZeroValueRows: card.hideZeroValueRows ?? false,
        pivotColumnTopN: card.pivotColumnTopN ?? 8,
        pivotHideOtherColumns: card.pivotHideOtherColumns ?? false,
        hiddenPivotSeriesLabels: card.hiddenPivotSeriesLabels ?? [],
        summary: normalizeLocalizedText(card.summary, normalizeAppLanguage(state.settings?.language)) ?? {
            language: normalizeAppLanguage(state.settings?.language),
            text: '',
        },
    })),
    aiCoreAnalysisSummary: normalizeLocalizedText(state.aiCoreAnalysisSummary, normalizeAppLanguage(state.settings?.language)),
    finalSummary: normalizeLocalizedText(state.finalSummary, normalizeAppLanguage(state.settings?.language)),
    agentEvents: trimAgentEvents(state.agentEvents ?? []),
    runtimeEvents: normalizeRuntimeEvents(state.runtimeEvents),
    queuedAgentRuns: normalizeQueuedAgentRuns(state.queuedAgentRuns),
    runtimeRunHistory: normalizeRuntimeRunHistory(state.runtimeRunHistory),
    queryHistory: normalizeQueryHistory(state.queryHistory),
    workspaceActionHistory: trimWorkspaceActionHistory(state.workspaceActionHistory ?? []),
    duckDbSessionStatus: normalizeDuckDbSessionStatus(state.duckDbSessionStatus),
    cleaningRun: state.cleaningRun
        ? {
            ...state.cleaningRun,
            recoveryState: state.cleaningRun.recoveryState
                ? {
                    activeStrategyId: state.cleaningRun.recoveryState.activeStrategyId ?? null,
                    attemptedStrategies: Array.isArray(state.cleaningRun.recoveryState.attemptedStrategies)
                        ? state.cleaningRun.recoveryState.attemptedStrategies
                        : [],
                    lastReasonCode: state.cleaningRun.recoveryState.lastReasonCode ?? null,
                    recoveredBy: state.cleaningRun.recoveryState.recoveredBy ?? null,
                    analysisMode: state.cleaningRun.recoveryState.analysisMode ?? 'normal',
                }
                : null,
            userFacingMessage: state.cleaningRun.userFacingMessage ?? null,
            actionTakenMessage: state.cleaningRun.actionTakenMessage ?? null,
            dataSafetyMessage: state.cleaningRun.dataSafetyMessage ?? null,
            nextStateMessage: state.cleaningRun.nextStateMessage ?? null,
            technicalDetail: state.cleaningRun.technicalDetail ?? null,
        }
        : state.cleaningRun,
    columnRegistry: state.columnRegistry
        ? {
            ...state.columnRegistry,
            columns: Array.isArray(state.columnRegistry.columns)
                ? state.columnRegistry.columns.map(column => ({
                    ...column,
                    aliases: Array.isArray(column.aliases) ? column.aliases : [],
                }))
                : [],
        }
        : null,
    datasetSemanticSnapshot: state.datasetSemanticSnapshot
        ? {
            ...state.datasetSemanticSnapshot,
            rowAnnotations: Array.isArray(state.datasetSemanticSnapshot.rowAnnotations)
                ? state.datasetSemanticSnapshot.rowAnnotations
                : [],
            columnAnnotations: Array.isArray(state.datasetSemanticSnapshot.columnAnnotations)
                ? state.datasetSemanticSnapshot.columnAnnotations
                : [],
            recommendedAnalysisView: state.datasetSemanticSnapshot.recommendedAnalysisView
                ? {
                    ...state.datasetSemanticSnapshot.recommendedAnalysisView,
                    includedRowIndices: Array.isArray(state.datasetSemanticSnapshot.recommendedAnalysisView.includedRowIndices)
                        ? state.datasetSemanticSnapshot.recommendedAnalysisView.includedRowIndices
                        : [],
                    excludedRowIndices: Array.isArray(state.datasetSemanticSnapshot.recommendedAnalysisView.excludedRowIndices)
                        ? state.datasetSemanticSnapshot.recommendedAnalysisView.excludedRowIndices
                        : [],
                }
                : state.datasetSemanticSnapshot.recommendedAnalysisView,
        }
        : null,
}) as T;
