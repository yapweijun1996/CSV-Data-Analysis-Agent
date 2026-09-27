import { type AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import type { ToolManifest } from '../../../../types';
import { handleAiAction } from '../../actionHandler';
import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import type { StoreApi } from '../../types';
import { buildBuiltinToolRegistry } from '../../tools/toolRegistry';

export const PI_MAX_TOOL_CALLS_PER_TURN = 3;

const MAX_TOOL_RESULT_CHARS = 6_000;

export const createPiAppTools = (store: StoreApi, datasetVersion: string | null): AgentTool[] => {
    let calls = 0;
    const manifests = buildBuiltinToolRegistry([]).manifests.filter(manifest =>
        (manifest.risk === 'low'
            && manifest.capabilities?.readOnly === true
            && manifest.capabilities?.piFollowUpReadOnly === true)
        || (manifest.name === 'data.mutate'
            && manifest.capabilities?.piFollowUpMutation === true));
    return manifests.map((manifest: ToolManifest): AgentTool => ({
        name: manifest.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
        label: manifest.name,
        description: [manifest.description, ...(manifest.promptHints ?? [])].join(' ').slice(0, 4_000),
        parameters: Type.Unsafe<Record<string, unknown>>(manifest.inputSchema),
        executionMode: 'sequential',
        replay: manifest.capabilities?.mutatesState ? 'never' : 'safe',
        execute: async (_toolCallId, args, signal) => {
            if (manifest.capabilities?.mutatesState) {
                throw new Error('This mutation requires app approval before execution.');
            }
            if (getCurrentAnalysisDatasetVersion(store.getState()) !== datasetVersion) {
                throw new Error('The dataset changed during this turn. Start a new request.');
            }
            if (calls >= PI_MAX_TOOL_CALLS_PER_TURN) {
                throw new Error(`The limit of ${PI_MAX_TOOL_CALLS_PER_TURN} app tools was reached.`);
            }
            calls += 1;
            const result = await handleAiAction({
                type: 'tool_call',
                thought: `Inspect the current dataset with ${manifest.name}.`,
                toolName: manifest.name,
                args,
            }, store, {
                toolStage: 'analysis',
                abortSignal: signal,
                requireRowDeleteConfirmation: true,
            });
            const payload = JSON.stringify({
                status: result.status,
                message: result.message,
                observation: result.observation,
                artifacts: result.artifacts,
            }).slice(0, MAX_TOOL_RESULT_CHARS);
            if (result.status === 'error') throw new Error(payload);
            return { details: undefined, content: [{ type: 'text', text: payload }] };
        },
    }));
};
