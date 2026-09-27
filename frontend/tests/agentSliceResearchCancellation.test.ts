import { describe, expect, it, vi } from 'vitest';
import { createAgentSlice } from '../store/slices/agentSlice';
import { createDataAnalysisSessionState } from '../services/agent/runtime/dataAnalysisSessionState';
import {
    clearDataResearchCancellation,
    isDataResearchCancellationRequested,
} from '../services/agent/runtime/dataResearchCancellation';

describe('agent slice research cancellation', () => {
    it('requests checkpoint cancellation and emits a visible waiting activity', async () => {
        let state: any = {
            sessionId: 'session-1',
            currentDatasetId: 'dataset-1',
            activeAnalysisSession: {
                ...createDataAnalysisSessionState({
                    sessionId: 'session-1',
                    origin: 'auto_analysis',
                    runId: 'research-1',
                }),
                status: 'running',
            },
            recordAgentEvent: vi.fn(),
        };
        const setState = (update: any) => {
            const partial = typeof update === 'function' ? update(state) : update;
            state = { ...state, ...partial };
        };
        const getState = () => state;
        const slice = createAgentSlice(setState as never, getState as never, {} as never);
        state = { ...state, ...slice, recordAgentEvent: vi.fn() };

        await state.requestActiveResearchCancellation();

        expect(isDataResearchCancellationRequested('research-1')).toBe(true);
        expect(state.activeAnalysisSession.cancellationRequestedAt).toBeInstanceOf(Date);
        expect(state.recordAgentEvent).toHaveBeenCalledWith(expect.objectContaining({
            step: 'research_run_cancellation_requested',
            activity: expect.objectContaining({
                lifecycle: 'waiting',
                kind: 'research',
            }),
        }));
        clearDataResearchCancellation('research-1');
    });
});
