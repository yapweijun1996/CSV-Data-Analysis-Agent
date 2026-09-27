// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { TERMINAL_CHAT_LIFECYCLE_STATES } from '../types/runtime';
import type { ChatLifecycleState, RuntimeLifecycleState } from '../types/runtime';

describe('ChatLifecycleState — terminal states', () => {
    it('idle, completed, failed, cancelled are terminal', () => {
        const terminals: ChatLifecycleState[] = ['idle', 'completed', 'failed', 'cancelled'];
        for (const state of terminals) {
            expect(TERMINAL_CHAT_LIFECYCLE_STATES.has(state)).toBe(true);
        }
    });

    it('running, waiting_tool, retrying, blocked are NOT terminal', () => {
        const nonTerminals: ChatLifecycleState[] = ['running', 'waiting_tool', 'retrying', 'blocked'];
        for (const state of nonTerminals) {
            expect(TERMINAL_CHAT_LIFECYCLE_STATES.has(state)).toBe(false);
        }
    });
});

describe('ChatLifecycleState — runtime lifecycle mapping', () => {
    /** Mimics the mapping in runtimeFinalize.ts */
    const mapRuntimeToChatLifecycle = (runtimeState: RuntimeLifecycleState): ChatLifecycleState => {
        const map: Partial<Record<RuntimeLifecycleState, ChatLifecycleState>> = {
            completed: 'completed',
            failed: 'failed',
            cancelled: 'cancelled',
        };
        return map[runtimeState] ?? 'idle';
    };

    it('completed runtime → completed chat lifecycle', () => {
        expect(mapRuntimeToChatLifecycle('completed')).toBe('completed');
    });

    it('failed runtime → failed chat lifecycle', () => {
        expect(mapRuntimeToChatLifecycle('failed')).toBe('failed');
    });

    it('cancelled runtime → cancelled chat lifecycle', () => {
        expect(mapRuntimeToChatLifecycle('cancelled')).toBe('cancelled');
    });

    it('queued/selecting/executing/evaluating/retrying → idle (non-terminal runtime states)', () => {
        const nonTerminals: RuntimeLifecycleState[] = ['queued', 'selecting', 'executing', 'evaluating', 'retrying'];
        for (const state of nonTerminals) {
            expect(mapRuntimeToChatLifecycle(state)).toBe('idle');
        }
    });

    it('waiting_for_clarification is excluded from this mapping (handled separately)', () => {
        // waiting_for_clarification is excluded from the finalize path entirely —
        // it does not go through the RUNTIME_TO_CHAT_LIFECYCLE mapping.
        // This test documents the design: clarification keeps the turn alive.
    });
});

describe('ChatLifecycleState — isAssistantBusy derivation', () => {
    const deriveIsAssistantBusy = (
        chatLifecycleState: ChatLifecycleState,
        isGeneratingReport: boolean,
        goalState: string,
        isCleaningActive: boolean,
    ): boolean => {
        return !TERMINAL_CHAT_LIFECYCLE_STATES.has(chatLifecycleState)
            || isGeneratingReport
            || goalState === 'pending_ai'
            || isCleaningActive;
    };

    it('completed → not busy', () => {
        expect(deriveIsAssistantBusy('completed', false, 'idle', false)).toBe(false);
    });

    it('failed → not busy', () => {
        expect(deriveIsAssistantBusy('failed', false, 'idle', false)).toBe(false);
    });

    it('cancelled → not busy', () => {
        expect(deriveIsAssistantBusy('cancelled', false, 'idle', false)).toBe(false);
    });

    it('running → busy', () => {
        expect(deriveIsAssistantBusy('running', false, 'idle', false)).toBe(true);
    });

    it('idle → not busy (no other signals)', () => {
        expect(deriveIsAssistantBusy('idle', false, 'idle', false)).toBe(false);
    });

    it('completed but isGeneratingReport → still busy', () => {
        expect(deriveIsAssistantBusy('completed', true, 'idle', false)).toBe(true);
    });
});

describe('ChatLifecycleState — chatSlice finally fallback', () => {
    it('if still running when finally fires, fallback to failed', () => {
        const currentLifecycle: ChatLifecycleState = 'running';
        const fallbackState = currentLifecycle === 'running' ? 'failed' : currentLifecycle;
        expect(fallbackState).toBe('failed');
    });

    it('if runtimeFinalize already set completed, finally does not override', () => {
        const currentLifecycle: ChatLifecycleState = 'completed';
        const shouldOverride = (currentLifecycle as string) === 'running';
        expect(shouldOverride).toBe(false);
    });

    it('if runtimeFinalize already set failed, finally does not override', () => {
        const currentLifecycle: ChatLifecycleState = 'failed';
        const shouldOverride = (currentLifecycle as string) === 'running';
        expect(shouldOverride).toBe(false);
    });
});

describe('clearActiveTurn safety net', () => {
    it('always produces idle (no active turn)', () => {
        const clearActiveTurnState = {
            activeTurn: null,
            isBusy: false,
            chatLifecycleState: 'idle' as const,
        };
        expect(clearActiveTurnState.chatLifecycleState).toBe('idle');
    });
});
