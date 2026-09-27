/**
 * Streaming Response Hook (AGENT-305)
 *
 * Pure consumer hook that reads the streaming message state from the store.
 * The production side (writing chunks) happens in chatCompletion.ts via
 * the store's setStreamingMessage action.
 *
 * Adapted from WrenAI useAskingStreamTask + DataLine messages patterns.
 */

import { shallow } from 'zustand/shallow';
import { useAppStore } from '../store/useAppStore';

export interface StreamingResponseState {
    /** Accumulated partial text, or null when not streaming */
    streamingText: string | null;
    /** True while tokens are still arriving */
    isStreaming: boolean;
    /** When the current stream started, or null */
    startedAt: Date | null;
}

/**
 * Subscribe to the current streaming response state.
 * Efficient: only re-renders when streamingMessage changes.
 */
export function useStreamingResponse(): StreamingResponseState {
    const streamingMessage = useAppStore(
        state => state.streamingMessage,
        shallow,
    );

    if (!streamingMessage) {
        return { streamingText: null, isStreaming: false, startedAt: null };
    }

    return {
        streamingText: streamingMessage.text,
        isStreaming: streamingMessage.isStreaming,
        startedAt: streamingMessage.startedAt,
    };
}
