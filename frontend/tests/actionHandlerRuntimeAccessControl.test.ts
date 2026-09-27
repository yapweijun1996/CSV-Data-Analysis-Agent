// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultSettings } from '../services/storageService';

const {
    executePlanActionMock,
    handleExecutorActionMock,
    preparePlanMock,
    recordMonitorEventMock,
} = vi.hoisted(() => ({
    executePlanActionMock: vi.fn(),
    handleExecutorActionMock: vi.fn(),
    preparePlanMock: vi.fn(),
    recordMonitorEventMock: vi.fn(),
}));

vi.mock('../services/agent/execution/executorAgent', () => ({
    executePlanAction: executePlanActionMock,
    handleExecutorAction: handleExecutorActionMock,
}));

vi.mock('../services/agent/planning/plannerAgent', () => ({
    preparePlan: preparePlanMock,
}));

vi.mock('../services/agent/monitoring/monitorAgent', () => ({
    recordMonitorEvent: recordMonitorEventMock,
}));

vi.mock('../services/agent/monitoring/agentMonitor', () => ({
    emitAgentEvent: vi.fn(),
}));

vi.mock('../services/agent/chatAgent', () => ({
    handleChatAction: vi.fn(),
}));

describe('handleAiAction workspace rule blocking', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        preparePlanMock.mockImplementation(plan => plan);
    });

    it('blocks denied workspace access before executor dispatch and records history', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            analysisCards: [],
            columnProfiles: [{ name: 'Region' }],
            csvData: {
                fileName: 'sales.csv',
                data: [{ Region: 'East' }],
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            },
            cleaningRun: null,
            sessionId: 'session-1',
            currentDatasetId: 'dataset-1',
            settings: {
                ...getDefaultSettings(),
                runtimeAccessControl: {
                    permissionMode: 'open' as const,
                    toolOverrides: {},
                    workspaceRules: { deniedPathPrefixes: ['/dataset'] },
                },
            },
            cardEnhancementSuggestions: [],
            chatHistory: [],
            workspaceActionHistory: [],
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Inspect the cleaned dataset file.',
            toolName: 'workspace.read',
            args: {
                path: '/dataset/cleaned.csv',
            },
        }, store as never);

        expect(result.status).toBe('blocked');
        expect(result.diagnostics?.[0]?.detail?.source).toBe('workspace_rule');
        expect(handleExecutorActionMock).not.toHaveBeenCalled();
        expect(state.workspaceActionHistory).toHaveLength(1);
        expect(state.workspaceActionHistory[0]).toMatchObject({
            operation: 'read',
            path: '/dataset/cleaned.csv',
            success: false,
            policyDecision: 'blocked',
        });
        expect(state.workspaceActionHistory[0]?.policyReason).toContain('/dataset');
    }, 10000);

    it('blocks non-fill_missing mutations when quality-repair policy is active', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            analysisCards: [],
            columnProfiles: [{ name: 'Region' }, { name: 'Revenue' }],
            csvData: {
                fileName: 'sales.csv',
                data: [{ Region: 'East', Revenue: 10 }],
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            },
            cleaningRun: null,
            sessionId: 'session-1',
            currentDatasetId: 'dataset-1',
            settings: getDefaultSettings(),
            cardEnhancementSuggestions: [],
            chatHistory: [],
            workspaceActionHistory: [],
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Repair the dataset before analysis.',
            toolName: 'data.mutate',
            args: {
                explanation: 'Replace old region label.',
                operations: [{
                    type: 'replace_values',
                    id: 'replace-region',
                    reason: 'Normalize region labels',
                    column: 'Region',
                    replacements: [{ from: 'East', to: 'EAST' }],
                }],
            },
        }, store as never, {
            toolStage: 'analysis',
            dataMutatePolicy: 'quality_repair_fill_missing_only',
        });

        expect(result.status).toBe('blocked');
        expect(result.message).toContain('quality repair blocked unsupported mutation');
        expect(handleExecutorActionMock).not.toHaveBeenCalled();
    });

    it('blocks batched fill_missing mutations when quality-repair policy is active', async () => {
        const { handleAiAction } = await import('../services/agent/actionHandler');
        const state = {
            analysisCards: [],
            columnProfiles: [{ name: 'Region' }, { name: 'Owner' }],
            csvData: {
                fileName: 'sales.csv',
                data: [{ Region: null, Owner: null }],
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            },
            cleaningRun: null,
            sessionId: 'session-1',
            currentDatasetId: 'dataset-1',
            settings: getDefaultSettings(),
            cardEnhancementSuggestions: [],
            chatHistory: [],
            workspaceActionHistory: [],
            logAgentToolUsage: vi.fn(),
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Repair the dataset before analysis.',
            toolName: 'data.mutate',
            args: {
                explanation: 'Backfill missing labels.',
                operations: [
                    { type: 'fill_missing', column: 'Region', strategy: 'constant', value: 'Unknown Region' },
                    { type: 'fill_missing', column: 'Owner', strategy: 'constant', value: 'Unassigned' },
                ],
            },
        }, store as never, {
            toolStage: 'analysis',
            dataMutatePolicy: 'quality_repair_fill_missing_only',
        });

        expect(result.status).toBe('blocked');
        expect(result.message).toContain('only allows one conservative fill_missing operation');
        expect(handleExecutorActionMock).not.toHaveBeenCalled();
    });
});
