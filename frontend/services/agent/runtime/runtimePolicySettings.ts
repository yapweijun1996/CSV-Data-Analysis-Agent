import type { Settings } from '../../../types';
import {
    AGENT_DEFAULT_MAX_TURNS,
    AGENT_MIN_MAX_TURNS,
    AGENT_MAX_MAX_TURNS,
    AGENT_DEFAULT_TOOL_OUTPUT_CUTOFF,
    AGENT_MIN_TOOL_OUTPUT_CUTOFF,
    AGENT_MAX_TOOL_OUTPUT_CUTOFF,
    CONTEXT_MAX_SQL_PREVIEW_CHARS,
    CONTEXT_MAX_WORKSPACE_ACTION_CHARS,
    CONTEXT_MAX_OBSERVATION_CHARS,
} from '../../../config/agentDefaults';

type RuntimePolicySettings = Pick<Settings, 'maxAgentTurns' | 'toolOutputCutoff'>;

export interface LongSessionContextPolicy {
    toolOutputCutoff: number;
    vectorHits: number;
    recentChatWindow: number;
    relatedCards: number;
    memoryHits: number;
    cardContextCards: number;
    cardContextRows: number;
    rawSampleRows: number;
    activeTurnStepWindow: number;
    maxSqlPreviewChars: number;
    maxWorkspaceActionChars: number;
    maxObservationChars: number;
}

export const DEFAULT_MAX_AGENT_TURNS = AGENT_DEFAULT_MAX_TURNS;
export const MIN_MAX_AGENT_TURNS = AGENT_MIN_MAX_TURNS;
export const MAX_MAX_AGENT_TURNS = AGENT_MAX_MAX_TURNS;

export const DEFAULT_TOOL_OUTPUT_CUTOFF = AGENT_DEFAULT_TOOL_OUTPUT_CUTOFF;
export const MIN_TOOL_OUTPUT_CUTOFF = AGENT_MIN_TOOL_OUTPUT_CUTOFF;
export const MAX_TOOL_OUTPUT_CUTOFF = AGENT_MAX_TOOL_OUTPUT_CUTOFF;

const normalizeInteger = (
    value: unknown,
    fallback: number,
    min: number,
    max: number,
): number => {
    const numeric = typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim().length > 0
            ? Number(value)
            : Number.NaN;

    if (!Number.isFinite(numeric)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, Math.trunc(numeric)));
};

export const resolveMaxAgentTurns = (settings?: Partial<RuntimePolicySettings> | null): number =>
    normalizeInteger(settings?.maxAgentTurns, DEFAULT_MAX_AGENT_TURNS, MIN_MAX_AGENT_TURNS, MAX_MAX_AGENT_TURNS);

export const resolveToolOutputCutoff = (settings?: Partial<RuntimePolicySettings> | null): number =>
    normalizeInteger(settings?.toolOutputCutoff, DEFAULT_TOOL_OUTPUT_CUTOFF, MIN_TOOL_OUTPUT_CUTOFF, MAX_TOOL_OUTPUT_CUTOFF);

export const normalizeRuntimePolicySettings = (
    settings: Partial<RuntimePolicySettings>,
): Required<RuntimePolicySettings> => ({
    maxAgentTurns: resolveMaxAgentTurns(settings),
    toolOutputCutoff: resolveToolOutputCutoff(settings),
});

export const resolveLongSessionContextPolicy = (
    settings?: Partial<RuntimePolicySettings> | null,
): LongSessionContextPolicy => {
    const toolOutputCutoff = resolveToolOutputCutoff(settings);

    return {
        toolOutputCutoff,
        vectorHits: Math.min(5, Math.max(3, toolOutputCutoff)),
        recentChatWindow: Math.min(6, Math.max(4, toolOutputCutoff)),
        relatedCards: Math.min(3, Math.max(1, toolOutputCutoff)),
        memoryHits: Math.min(2, Math.max(1, toolOutputCutoff)),
        cardContextCards: Math.min(4, Math.max(1, toolOutputCutoff)),
        cardContextRows: Math.min(5, Math.max(2, toolOutputCutoff)),
        rawSampleRows: Math.min(8, Math.max(3, toolOutputCutoff)),
        activeTurnStepWindow: Math.min(4, Math.max(2, toolOutputCutoff)),
        maxSqlPreviewChars: CONTEXT_MAX_SQL_PREVIEW_CHARS,
        maxWorkspaceActionChars: CONTEXT_MAX_WORKSPACE_ACTION_CHARS,
        maxObservationChars: CONTEXT_MAX_OBSERVATION_CHARS,
    };
};
