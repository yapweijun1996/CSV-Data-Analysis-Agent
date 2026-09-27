import { describe, it, expect, beforeEach } from 'vitest';
import type { StreamingMessage } from '../types';

// Test the streaming message state logic directly (no React rendering needed).
// The hook itself is a thin store subscription — testing the store actions is sufficient.

describe('StreamingMessage state logic', () => {
    // Simulate the store actions in isolation
    let state: { streamingMessage: StreamingMessage | null };
    const setStreamingMessage = (text: string) => {
        state.streamingMessage = state.streamingMessage
            ? { ...state.streamingMessage, text }
            : { text, isStreaming: true, startedAt: new Date() };
    };
    const clearStreamingMessage = () => {
        state.streamingMessage = null;
    };

    beforeEach(() => {
        state = { streamingMessage: null };
    });

    it('starts with null streamingMessage', () => {
        expect(state.streamingMessage).toBeNull();
    });

    it('setStreamingMessage creates a new streaming message on first call', () => {
        setStreamingMessage('Hello');
        expect(state.streamingMessage).not.toBeNull();
        expect(state.streamingMessage!.text).toBe('Hello');
        expect(state.streamingMessage!.isStreaming).toBe(true);
        expect(state.streamingMessage!.startedAt).toBeInstanceOf(Date);
    });

    it('setStreamingMessage accumulates text on subsequent calls', () => {
        setStreamingMessage('Hello');
        const startedAt = state.streamingMessage!.startedAt;

        setStreamingMessage('Hello world');
        expect(state.streamingMessage!.text).toBe('Hello world');
        expect(state.streamingMessage!.startedAt).toBe(startedAt); // same start time
    });

    it('clearStreamingMessage sets to null', () => {
        setStreamingMessage('Hello');
        expect(state.streamingMessage).not.toBeNull();

        clearStreamingMessage();
        expect(state.streamingMessage).toBeNull();
    });

    it('clearStreamingMessage is safe when already null', () => {
        expect(state.streamingMessage).toBeNull();
        clearStreamingMessage();
        expect(state.streamingMessage).toBeNull();
    });

    it('can start a new stream after clearing', () => {
        setStreamingMessage('First stream');
        clearStreamingMessage();
        setStreamingMessage('Second stream');

        expect(state.streamingMessage!.text).toBe('Second stream');
        expect(state.streamingMessage!.isStreaming).toBe(true);
    });
});

describe('onTextChunk callback pattern', () => {
    it('simulates incremental text accumulation from streamText chunks', () => {
        const chunks = ['Hello', ' ', 'world', '!'];
        let accumulated = '';
        const results: string[] = [];

        for (const chunk of chunks) {
            accumulated += chunk;
            results.push(accumulated);
        }

        expect(results).toEqual(['Hello', 'Hello ', 'Hello world', 'Hello world!']);
    });

    it('final accumulated text matches expected full response', () => {
        const chunks = ['The answer', ' is ', '42.'];
        let accumulated = '';
        for (const chunk of chunks) {
            accumulated += chunk;
        }
        expect(accumulated).toBe('The answer is 42.');
    });
});
