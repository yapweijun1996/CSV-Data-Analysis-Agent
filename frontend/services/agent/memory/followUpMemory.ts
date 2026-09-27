/**
 * AGRUN-010: runtime-neutral follow-up memory boundary.
 *
 * Both the legacy and Agrun follow-up paths enter through chatOrchestrator, so
 * promotion happens once here before runtime selection. Retrieval also remains
 * app-owned and is projected into Agrun as bounded read-only context.
 */
import type { ChatMessage } from '../../../types';
import { vectorStore } from '../../vectorStore';
import type { StoreApi } from '../types';
import {
    buildCardMemoryProjectionMap,
    selectReadableLongTermMemory,
} from './cardMemoryProjection';
import {
    extractChatInsights,
    shouldExtractInsights,
} from './chatInsightExtractor';
import { resolveReportMemoryScope } from './memoryScope';
import {
    flushPendingVectorMemoryDocs,
    upsertChatInsightDocs,
} from './vectorMemorySync';

const DEFAULT_MEMORY_HIT_LIMIT = 4;

const withoutCurrentUserMessage = (
    chatHistory: ChatMessage[],
    currentMessage: string,
): ChatMessage[] => {
    const normalized = currentMessage.trim();
    const latest = chatHistory.at(-1);
    return normalized
        && latest?.sender === 'user'
        && latest.text.trim() === normalized
        ? chatHistory.slice(0, -1)
        : chatHistory;
};

const collectExistingInsightIds = (
    state: ReturnType<StoreApi['getState']>,
): Set<string> => new Set(
    [
        ...(state.vectorStoreDocuments ?? []),
        ...(state.pendingVectorMemoryDocs ?? []),
    ]
        .filter(document => document.metadata?.kind === 'chat_insight')
        .map(document => document.metadata?.origin?.sourceId ?? document.id),
);

/**
 * Activate app memory and promote deterministic chat insights when due.
 *
 * This is intentionally called once before follow-up runtime selection, so
 * enabling Agrun cannot create a second promotion path.
 */
export const promoteAppFollowUpMemory = async (
    store: StoreApi,
    currentMessage: string,
): Promise<number> => {
    const state = store.getState();
    if (state.vectorMemoryState === 'queued' || state.vectorMemoryState === 'cold') {
        void vectorStore.ensureVectorMemoryReady(
            'followup_chat',
            store as never,
            async memoryStore => {
                await flushPendingVectorMemoryDocs(memoryStore as never);
            },
        ).catch(() => {
            // Memory is non-blocking; vectorStore reports the visible degraded state.
        });
    }

    const transcript = withoutCurrentUserMessage(
        state.chatHistory ?? [],
        currentMessage,
    );
    const userTurnCount = transcript.filter(message => message.sender === 'user').length;
    const lastExtracted = state.lastInsightExtractedAtTurn ?? 0;
    if (!shouldExtractInsights(userTurnCount, lastExtracted)) return 0;

    const insights = extractChatInsights(
        transcript,
        state.columnProfiles ?? [],
        collectExistingInsightIds(state),
        lastExtracted,
    );
    if (insights.length === 0) return 0;

    await upsertChatInsightDocs(store as never, insights);
    store.setState({ lastInsightExtractedAtTurn: userTurnCount });
    return insights.length;
};

/**
 * Read a bounded report-scoped memory projection for the active follow-up.
 */
export const readAppFollowUpMemory = async (
    store: StoreApi,
    message: string,
    limit = DEFAULT_MEMORY_HIT_LIMIT,
): Promise<string[]> => {
    const state = store.getState();
    const scope = resolveReportMemoryScope(state);
    if (!scope || !message.trim() || limit <= 0) return [];

    const matches = await vectorStore.searchIfReady(message, limit + 2, scope);
    if (matches.length === 0) return [];
    const projectionMap = buildCardMemoryProjectionMap(
        state.analysisCards,
        state.columnProfiles,
    );
    const userTurnCount = state.chatHistory.filter(
        entry => entry.sender === 'user',
    ).length;
    return selectReadableLongTermMemory(
        matches,
        projectionMap,
        limit,
        userTurnCount,
    );
};
