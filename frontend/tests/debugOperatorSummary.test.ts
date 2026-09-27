import { describe, expect, it } from 'vitest';
import { selectDebugOperatorSummary } from '../services/agent/debugSelectors';
import type { AgentRuntimeEvent } from '../types';

const event = (
    type: AgentRuntimeEvent['type'],
    reason: string,
    index: number,
    detail: Record<string, unknown> = {},
): AgentRuntimeEvent => ({
    id: `event-${index}`,
    type,
    reason,
    message: reason,
    detail,
    timestamp: new Date(`2026-07-26T00:00:0${index}.000Z`),
});

describe('debug operator summary', () => {
    it('keeps the actionable failure reason when a later phase event is recorded', () => {
        const summary = selectDebugOperatorSummary({
            runtimeEvents: [
                {
                    ...event(
                        'action_execution_error',
                        'initial_analysis_snapshot_not_persisted',
                        1,
                    ),
                    failureClass: 'tool_execution',
                },
                event('observation_recorded', 'agrun_phase', 2),
            ],
            runtimeRunHistory: [],
            latestAnalysisSession: null,
        });

        expect(summary.latestFailureReason)
            .toBe('initial_analysis_snapshot_not_persisted');
    });

    it('derives an initial-analysis terminal outcome without a follow-up run record', () => {
        const summary = selectDebugOperatorSummary({
            runtimeEvents: [
                {
                    ...event('turn_failed', 'analysis_no_usable_cards', 1, {
                        outcome: 'degraded',
                        cardCount: 0,
                    }),
                    failureClass: 'tool_execution',
                },
            ],
            runtimeRunHistory: [],
            latestAnalysisSession: null,
        });

        expect(summary.latestFailureReason).toBe('analysis_no_usable_cards');
        expect(summary.latestOutcome).toEqual({
            lifecycleState: 'failed',
            recoveryStatus: 'failed',
            actualOutcomeShape: 'hidden',
            degraded: true,
        });
    });
});
