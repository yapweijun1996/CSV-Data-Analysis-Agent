import { describe, expect, it, vi } from 'vitest';
import {
    createAgrunInitialAnalysisActions,
    INITIAL_ANALYSIS_EVIDENCE_ACTION_TIMEOUT_MS,
} from '../services/agent/runtime/agrun/initialAnalysisActionAdapter';

describe('initial analysis Agrun action timeout policy', () => {
    it('keeps the evidence action alive beyond its large-dataset research budget', () => {
        const actions: Array<Record<string, unknown>> = [];
        createAgrunInitialAnalysisActions({
            bridge: {
                register: vi.fn(),
                release: vi.fn(),
                resolve: vi.fn(),
                snapshot: vi.fn(),
            },
            module: {
                defineAction: spec => {
                    actions.push(spec as unknown as Record<string, unknown>);
                    return spec;
                },
            } as never,
        });

        const evidenceAction = actions.find(action =>
            action.name === 'host_analysis_executeevidence',
        );
        expect(evidenceAction).toMatchObject({
            timeoutMs: INITIAL_ANALYSIS_EVIDENCE_ACTION_TIMEOUT_MS,
            timeoutBehavior: 'error_as_result',
        });
    });
});
