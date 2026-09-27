// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    buildRuntimeContractDetail,
    buildSurfaceTraceContract,
    normalizeRuntimeEventPayload,
    normalizeRuntimeOutcomeEnvelope,
    RUNTIME_EVENT_CONTRACT_VERSION,
} from '../services/agent/runtime/runtimeControlPlaneContract';
import { buildRuntimeAbortReason, extractRuntimeAbortMetadata } from '../services/agent/runtime/runtimeAbort';

describe('runtimeControlPlaneContract', () => {
    it('normalizes retryable provider timeout events into one contract detail shape', () => {
        const payload = normalizeRuntimeEventPayload({
            runId: 'run-1',
            turnId: 'turn-1',
            type: 'provider_timeout',
            stage: 'selecting',
            reason: 'model_call_timeout',
            retryable: true,
            failureClass: 'provider',
            message: 'Provider model call timed out after 60000ms',
            detail: buildRuntimeContractDetail({
                reasonCode: 'model_call_timeout',
                failureClass: 'provider',
                retryable: true,
                timeoutReason: 'model_call_timeout',
                timeoutMs: 60000,
                source: 'provider_model_call',
            }),
        });

        expect(payload.detail).toMatchObject({
            contractVersion: RUNTIME_EVENT_CONTRACT_VERSION,
            reasonCode: 'model_call_timeout',
            retryClass: 'provider_timeout_recovery',
            timeoutReason: 'model_call_timeout',
            timeoutMs: 60000,
            source: 'provider_model_call',
        });
    });

    it('normalizes cancelled outcomes with transport abort metadata', () => {
        const outcome = normalizeRuntimeOutcomeEnvelope({
            runId: 'run-1',
            turnId: 'turn-1',
            sessionId: 'session-1',
            outcomeKind: 'cancelled',
            lifecycleState: 'cancelled',
            stage: 'finalizing',
            reason: 'cancelled',
            retryable: false,
            failureClass: 'cancelled',
            eventType: 'turn_cancelled',
            eventMessage: 'Cancelled the current agent run.',
            eventDetail: buildRuntimeContractDetail({
                reasonCode: 'cancelled',
                failureClass: 'cancelled',
                retryable: false,
                abortMode: 'transport_abort',
                abortSource: 'provider_chat_completion',
                abortPropagationStatus: 'propagated',
                source: 'runtime_cancellation',
            }),
        });

        expect(outcome.eventDetail).toMatchObject({
            contractVersion: RUNTIME_EVENT_CONTRACT_VERSION,
            reasonCode: 'cancelled',
            retryClass: 'cancelled_terminal',
            abortMode: 'transport_abort',
            abortSource: 'provider_chat_completion',
            abortPropagationStatus: 'propagated',
            source: 'runtime_cancellation',
        });
    });

    it('assigns queue backpressure retry class for queued or overflow signals', () => {
        const detail = buildRuntimeContractDetail({
            reasonCode: 'queue_overflow',
            retryable: false,
            source: 'runtime_queue',
        });

        expect(detail).toMatchObject({
            contractVersion: RUNTIME_EVENT_CONTRACT_VERSION,
            reasonCode: 'queue_overflow',
            retryClass: 'queue_backpressure',
            source: 'runtime_queue',
        });
    });

    it('extracts structured abort metadata from runtime abort reasons', () => {
        const reason = buildRuntimeAbortReason({
            abortMode: 'transport_abort',
            abortSource: 'provider_chat_completion',
            abortPropagationStatus: 'propagated',
        });

        expect(extractRuntimeAbortMetadata(reason)).toEqual({
            abortMode: 'transport_abort',
            abortSource: 'provider_chat_completion',
            abortPropagationStatus: 'propagated',
        });
    });

    it('normalizes surface trace adapters into the canonical contract shape', () => {
        const detail = buildSurfaceTraceContract({
            detail: { stage: 'analysis', retryable: false },
            reasonCode: 'query_trace_recorded',
            source: 'query_trace',
        });

        expect(detail).toMatchObject({
            contractVersion: 'runtime_v1',
            reasonCode: 'query_trace_recorded',
            source: 'query_trace',
        });
    });
});
