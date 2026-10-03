import { type AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import type { ToolManifest } from '../../../../types';
import { handleAiAction } from '../../actionHandler';
import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import { getPreferredAnalysisDataset } from '../../reportStructureState';
import type { StoreApi } from '../../types';
import { getQueryableColumnProfiles } from '../analysisContextBuilder';
import { buildBuiltinToolRegistry } from '../../tools/toolRegistry';

export const PI_MAX_TOOL_CALLS_PER_TURN = 3;

const MAX_TOOL_RESULT_CHARS = 6_000;

export const createPiAppTools = (
    store: StoreApi,
    datasetVersion: string | null,
    options: { allowCardCreation?: boolean; maxToolCalls?: number; onCardCreated?: (cardId: string) => void } = {},
): AgentTool[] => {
    let calls = 0;
    const maxToolCalls = options.maxToolCalls ?? PI_MAX_TOOL_CALLS_PER_TURN;
    const state = store.getState();
    const dataset = getPreferredAnalysisDataset(state);
    const columnNames = dataset
        ? getQueryableColumnProfiles(dataset, state.columnProfiles ?? [], state.rawCsvData)
            .map(profile => profile.name)
        : [];
    const manifests = buildBuiltinToolRegistry(columnNames).manifests.filter(manifest =>
        (manifest.risk === 'low'
            && manifest.capabilities?.readOnly === true
            && manifest.capabilities?.piFollowUpReadOnly === true)
        || (options.allowCardCreation && manifest.name === 'analysis.create_plan')
        || (manifest.name === 'data.mutate'
            && manifest.capabilities?.piFollowUpMutation === true));
    return manifests.map((manifest: ToolManifest): AgentTool => ({
        name: manifest.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
        label: manifest.name,
        description: [manifest.description, ...(manifest.promptHints ?? [])].join(' ').slice(0, 4_000),
        parameters: Type.Unsafe<Record<string, unknown>>(manifest.inputSchema),
        executionMode: 'sequential',
        replay: manifest.capabilities?.mutatesState || manifest.name === 'analysis.create_plan'
            ? 'never' : 'safe',
        execute: async (_toolCallId, args, signal) => {
            if (manifest.capabilities?.mutatesState) {
                throw new Error('This mutation requires app approval before execution.');
            }
            if (getCurrentAnalysisDatasetVersion(store.getState()) !== datasetVersion) {
                throw new Error('The dataset changed during this turn. Start a new request.');
            }
            if (calls >= maxToolCalls) {
                throw new Error(`The limit of ${maxToolCalls} app tools was reached.`);
            }
            calls += 1;
            const result = await handleAiAction({
                type: 'tool_call',
                thought: `Execute ${manifest.name} for the current request.`,
                toolName: manifest.name,
                args,
            }, store, {
                toolStage: 'analysis',
                abortSignal: signal,
                requireRowDeleteConfirmation: true,
            });
            if (manifest.name === 'analysis.create_plan' && result.status === 'success') {
                const cardId = result.artifacts?.createdCardId;
                if (typeof cardId === 'string'
                    && store.getState().analysisCards.some(card => card.id === cardId)) {
                    options.onCardCreated?.(cardId);
                }
            }
            const payload = JSON.stringify({
                status: result.status,
                message: result.message,
                observation: result.observation,
                artifacts: result.artifacts,
                retryHint: result.retryHint,
            }).slice(0, MAX_TOOL_RESULT_CHARS);
            if (result.status === 'error') throw new Error(payload);
            return { details: undefined, content: [{ type: 'text', text: payload }] };
        },
    }));
};
