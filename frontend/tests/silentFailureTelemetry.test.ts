/**
 * P1 Runtime telemetry for silent failures
 *
 * Tests for services/agent/monitoring/silentFailureTracker.ts
 *
 * Verifies:
 *  1. emitSilentFailure calls recordRuntimeEvent with type 'silent_failure'
 *  2. The event detail includes component, errorType, recoveryAction, userNotified
 *  3. The event message mentions the component and error
 *  4. emitSilentFailure is safe when recordRuntimeEvent is absent (no throw)
 *  5. emitSilentFailure is safe for all error value types (null, string, Error)
 *  6. 'silent_failure' is a valid AgentRuntimeEvent type (type-level check via runtime value)
 */

import { describe, expect, it, vi } from 'vitest';
import { emitSilentFailure } from '../services/agent/monitoring/silentFailureTracker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeStore = (recordFn?: ReturnType<typeof vi.fn>) => ({
    getState: () => ({
        recordRuntimeEvent: recordFn ?? vi.fn(),
    }),
});

const makeStoreWithoutRecorder = () => ({
    getState: () => ({
        recordRuntimeEvent: undefined,
    }),
});

// ---------------------------------------------------------------------------
// Core emission
// ---------------------------------------------------------------------------

describe('emitSilentFailure — core emission', () => {
    it('calls recordRuntimeEvent with type "silent_failure"', () => {
        const recorder = vi.fn();
        const store = makeStore(recorder);

        emitSilentFailure(store, new Error('boom'), {
            component: 'TestComponent',
            recoveryAction: 'fallback_used',
            userNotified: false,
        });

        expect(recorder).toHaveBeenCalledOnce();
        const [payload] = recorder.mock.calls[0];
        expect(payload.type).toBe('silent_failure');
    });

    it('includes component, errorType, recoveryAction, userNotified in detail', () => {
        const recorder = vi.fn();
        const store = makeStore(recorder);

        emitSilentFailure(store, new Error('something broke'), {
            component: 'AnalysisOrchestrator',
            recoveryAction: 'fallback_summary_text_shown',
            userNotified: false,
        });

        const [payload] = recorder.mock.calls[0];
        expect(payload.detail.component).toBe('AnalysisOrchestrator');
        expect(payload.detail.recoveryAction).toBe('fallback_summary_text_shown');
        expect(payload.detail.userNotified).toBe(false);
        expect(typeof payload.detail.errorType).toBe('string');
        expect(payload.detail.errorType.length).toBeGreaterThan(0);
    });

    it('message contains component name and error text', () => {
        const recorder = vi.fn();
        const store = makeStore(recorder);

        emitSilentFailure(store, new Error('worker timeout'), {
            component: 'FileProcessor',
            recoveryAction: 'lightweight_profiler_fallback',
            userNotified: false,
        });

        const [payload] = recorder.mock.calls[0];
        expect(payload.message).toContain('FileProcessor');
        expect(payload.message).toContain('worker timeout');
    });

    it('forwards optional detail fields into the event detail', () => {
        const recorder = vi.fn();
        const store = makeStore(recorder);

        emitSilentFailure(store, new Error('err'), {
            component: 'ChatOrchestrator',
            recoveryAction: 'run_agent_turn_error_message_shown',
            userNotified: true,
            detail: { turnId: 'turn-42', extra: 'data' },
        });

        const [payload] = recorder.mock.calls[0];
        expect(payload.detail.turnId).toBe('turn-42');
        expect(payload.detail.extra).toBe('data');
        expect(payload.detail.userNotified).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Error value tolerance
// ---------------------------------------------------------------------------

describe('emitSilentFailure — error value tolerance', () => {
    it('handles null error without throwing', () => {
        const recorder = vi.fn();
        const store = makeStore(recorder);

        expect(() =>
            emitSilentFailure(store, null, {
                component: 'X',
                recoveryAction: 'none',
                userNotified: false,
            }),
        ).not.toThrow();

        expect(recorder).toHaveBeenCalledOnce();
        const [payload] = recorder.mock.calls[0];
        expect(payload.detail.errorType).toBe('Unknown error');
    });

    it('handles string error', () => {
        const recorder = vi.fn();
        const store = makeStore(recorder);

        emitSilentFailure(store, 'plain string rejection', {
            component: 'X',
            recoveryAction: 'none',
            userNotified: false,
        });

        const [payload] = recorder.mock.calls[0];
        expect(payload.detail.errorType).toBe('plain string rejection');
    });

    it('handles undefined error', () => {
        const recorder = vi.fn();
        const store = makeStore(recorder);

        expect(() =>
            emitSilentFailure(store, undefined, {
                component: 'X',
                recoveryAction: 'none',
                userNotified: false,
            }),
        ).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// Safety: missing recorder
// ---------------------------------------------------------------------------

describe('emitSilentFailure — safety when recorder is absent', () => {
    it('does not throw when recordRuntimeEvent is undefined', () => {
        const store = makeStoreWithoutRecorder();

        expect(() =>
            emitSilentFailure(store, new Error('boom'), {
                component: 'X',
                recoveryAction: 'none',
                userNotified: false,
            }),
        ).not.toThrow();
    });

    it('does not throw when getState returns null recorder', () => {
        const store = {
            getState: () => ({ recordRuntimeEvent: null as unknown as undefined }),
        };

        expect(() =>
            emitSilentFailure(store, new Error('boom'), {
                component: 'X',
                recoveryAction: 'none',
                userNotified: false,
            }),
        ).not.toThrow();
    });
});
