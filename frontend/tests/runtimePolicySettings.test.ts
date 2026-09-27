import { describe, expect, it } from 'vitest';
import { createAgentTurn } from '../services/agent/runtime/runtimeState';
import {
    DEFAULT_MAX_AGENT_TURNS,
    DEFAULT_TOOL_OUTPUT_CUTOFF,
    MAX_MAX_AGENT_TURNS,
    MAX_TOOL_OUTPUT_CUTOFF,
    resolveMaxAgentTurns,
    resolveToolOutputCutoff,
} from '../services/agent/runtime/runtimePolicySettings';

describe('runtimePolicySettings', () => {
    it('resolves max agent turns with clamping', () => {
        expect(resolveMaxAgentTurns()).toBe(DEFAULT_MAX_AGENT_TURNS);
        expect(resolveMaxAgentTurns({ maxAgentTurns: 24 })).toBe(24);
        expect(resolveMaxAgentTurns({ maxAgentTurns: 0 })).toBe(1);
        expect(resolveMaxAgentTurns({ maxAgentTurns: MAX_MAX_AGENT_TURNS + 100 })).toBe(MAX_MAX_AGENT_TURNS);
    });

    it('resolves tool output cutoff with clamping', () => {
        expect(resolveToolOutputCutoff()).toBe(DEFAULT_TOOL_OUTPUT_CUTOFF);
        expect(resolveToolOutputCutoff({ toolOutputCutoff: 6 })).toBe(6);
        expect(resolveToolOutputCutoff({ toolOutputCutoff: 0 })).toBe(1);
        expect(resolveToolOutputCutoff({ toolOutputCutoff: MAX_TOOL_OUTPUT_CUTOFF + 10 })).toBe(MAX_TOOL_OUTPUT_CUTOFF);
    });

    it('creates agent turns using the configured step budget', () => {
        const turn = createAgentTurn('inspect the dataset', { maxSteps: 24 });

        expect(turn.budgetStatus.maxSteps).toBe(24);
        expect(turn.budgetStatus.stepsUsed).toBe(0);
    });
});
