import { describe, expect, it } from 'vitest';
import type { ToolDescriptor, ToolName } from '../types';
import { buildBuiltinToolRegistry, resolveAllowedTools } from '../services/agent/tools/toolRegistry';
import { prepareToolDescriptors } from '../services/agent/tools/toolGovernance';
import { createDefaultRuntimeAccessControl } from '../services/runtimeAccessControl';

const baseContext = {
    cardIds: ['card-1'],
    columnNames: ['Region', 'Revenue'],
    hasCsvData: true,
    hasCards: true,
    cleaningCompleted: true,
    sessionId: 'session-1',
    datasetId: 'dataset-1',
    settingsKey: 'google:model:model',
    runtimeAccessControl: createDefaultRuntimeAccessControl(),
};

describe('tool governance resolver', () => {
    it('blocks dataset edit tools during analysis stage', () => {
        const registry = resolveAllowedTools(buildBuiltinToolRegistry(baseContext.columnNames), {
            ...baseContext,
            toolStage: 'analysis',
        });

        expect(registry.stage).toBe('analysis');
        expect(registry.allowedToolNames).not.toContain('workspace.write');
        expect(registry.allowedToolNames).not.toContain('workspace.replace');
        expect(registry.blockedTools.find(entry => entry.toolName === 'workspace.write')?.reason).toContain('analysis stage');
        expect(registry.allowedToolNames).toContain('analysis.create_plan');
    });

    it('honors explicit deny overrides over stage allowlists', () => {
        const registry = resolveAllowedTools(buildBuiltinToolRegistry(baseContext.columnNames), {
            ...baseContext,
            toolStage: 'cleaning',
            cleaningCompleted: false,
            denyOverrides: ['workspace.read'],
        });

        expect(registry.allowedToolNames).not.toContain('workspace.read');
        expect(registry.blockedTools.find(entry => entry.toolName === 'workspace.read')?.source).toBe('deny_override');
        expect(registry.blockedTools.find(entry => entry.toolName === 'workspace.read')?.overrideOrigin).toBe('runtime_contract');
        expect(registry.allowedToolNames).toContain('data.mutate');
    });

    it('allows data.mutate during the cleaning stage for deterministic reshaping', () => {
        const registry = resolveAllowedTools(buildBuiltinToolRegistry(baseContext.columnNames), {
            ...baseContext,
            toolStage: 'cleaning',
            cleaningCompleted: false,
        });

        expect(registry.allowedToolNames).toContain('data.mutate');
        expect(registry.blockedTools.find(entry => entry.toolName === 'data.mutate')).toBeUndefined();
    });

    it('blocks workspace edit tools in balanced permission mode', () => {
        const registry = resolveAllowedTools(buildBuiltinToolRegistry(baseContext.columnNames), {
            ...baseContext,
            toolStage: 'cleaning',
            cleaningCompleted: false,
            runtimeAccessControl: {
                permissionMode: 'balanced',
                toolOverrides: {},
                workspaceRules: { deniedPathPrefixes: [] },
            },
        });

        expect(registry.allowedToolNames).not.toContain('workspace.write');
        expect(registry.allowedToolNames).toContain('workspace.read');
        expect(registry.blockedTools.find(entry => entry.toolName === 'workspace.write')?.source).toBe('permission_mode');
    });

    it('keeps strict mode limited to safe tool groups', () => {
        const registry = resolveAllowedTools(buildBuiltinToolRegistry(baseContext.columnNames), {
            ...baseContext,
            toolStage: 'analysis',
            runtimeAccessControl: {
                permissionMode: 'strict',
                toolOverrides: {},
                workspaceRules: { deniedPathPrefixes: [] },
            },
        });

        expect(registry.allowedToolNames).toContain('analysis.create_plan');
        expect(registry.allowedToolNames).toContain('data.query');
        expect(registry.allowedToolNames).toContain('card.review');
        expect(registry.allowedToolNames).not.toContain('data.mutate');
        expect(registry.allowedToolNames).not.toContain('card.delete');
    });

    it('lets an explicit allow override reopen a permission-mode block but not a stage block', () => {
        const allowedByOverride = resolveAllowedTools(buildBuiltinToolRegistry(baseContext.columnNames), {
            ...baseContext,
            toolStage: 'cleaning',
            cleaningCompleted: false,
            runtimeAccessControl: {
                permissionMode: 'balanced',
                toolOverrides: { 'workspace.write': 'allow' },
                workspaceRules: { deniedPathPrefixes: [] },
            },
        });
        const stillBlockedByStage = resolveAllowedTools(buildBuiltinToolRegistry(baseContext.columnNames), {
            ...baseContext,
            toolStage: 'analysis',
            runtimeAccessControl: {
                permissionMode: 'open',
                toolOverrides: { 'workspace.write': 'allow' },
                workspaceRules: { deniedPathPrefixes: [] },
            },
        });

        expect(allowedByOverride.allowedToolNames).toContain('workspace.write');
        expect(allowedByOverride.decisions['workspace.write']?.source).toBe('allow_override');
        expect(stillBlockedByStage.allowedToolNames).not.toContain('workspace.write');
        expect(stillBlockedByStage.decisions['workspace.write']?.source).toBe('stage_allowlist');
    });

    it('keeps deny overrides above allow overrides', () => {
        const registry = resolveAllowedTools(buildBuiltinToolRegistry(baseContext.columnNames), {
            ...baseContext,
            toolStage: 'analysis',
            allowOverrides: ['workspace.read'],
            runtimeAccessControl: {
                permissionMode: 'open',
                toolOverrides: { 'workspace.read': 'deny' },
                workspaceRules: { deniedPathPrefixes: [] },
            },
        });

        expect(registry.allowedToolNames).not.toContain('workspace.read');
        expect(registry.decisions['workspace.read']?.source).toBe('deny_override');
        expect(registry.decisions['workspace.read']?.overrideOrigin).toBe('settings');
    });

    it('marks deny overrides as settings when they only come from runtime access control', () => {
        const registry = resolveAllowedTools(buildBuiltinToolRegistry(baseContext.columnNames), {
            ...baseContext,
            toolStage: 'analysis',
            runtimeAccessControl: {
                permissionMode: 'open',
                toolOverrides: { 'analysis.create_plan': 'deny' },
                workspaceRules: { deniedPathPrefixes: [] },
            },
        });

        expect(registry.allowedToolNames).not.toContain('analysis.create_plan');
        expect(registry.decisions['analysis.create_plan']?.overrideOrigin).toBe('settings');
    });

    it('marks deny overrides as both when runtime contract and settings deny the same tool', () => {
        const registry = resolveAllowedTools(buildBuiltinToolRegistry(baseContext.columnNames), {
            ...baseContext,
            toolStage: 'analysis',
            denyOverrides: ['analysis.create_plan'],
            runtimeAccessControl: {
                permissionMode: 'open',
                toolOverrides: { 'analysis.create_plan': 'deny' },
                workspaceRules: { deniedPathPrefixes: [] },
            },
        });

        expect(registry.allowedToolNames).not.toContain('analysis.create_plan');
        expect(registry.decisions['analysis.create_plan']?.overrideOrigin).toBe('both');
    });
});

describe('tool descriptor diagnostics', () => {
    it('reports duplicate names and missing schemas', () => {
        const duplicate = {
            name: 'workspace.read',
            description: 'Duplicate read tool',
            category: 'workspace',
            risk: 'low',
            enabledByDefault: true,
            inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
            groups: ['workspace.inspect'],
            defaultPolicy: 'allow',
        } as ToolDescriptor;
        const missingSchema = {
            name: 'workspace.write',
            description: 'Broken writer',
            category: 'workspace',
            risk: 'high',
            enabledByDefault: true,
            inputSchema: undefined,
            groups: ['workspace.edit'],
            defaultPolicy: 'allow',
        } as unknown as ToolDescriptor;
        const custom = {
            name: 'workspace.tree' as ToolName,
            description: 'Tree tool',
            category: 'workspace',
            risk: 'low',
            enabledByDefault: true,
            inputSchema: { type: 'object', properties: {} },
            groups: ['workspace.inspect', 'workspace.inspect.tree'],
            defaultPolicy: 'allow',
        } as ToolDescriptor;

        const prepared = prepareToolDescriptors([duplicate, duplicate, missingSchema, custom]);

        expect(prepared.descriptors.map(descriptor => descriptor.name)).toEqual(['workspace.read', 'workspace.tree']);
        expect(prepared.diagnostics.some(entry => entry.code === 'duplicate_tool')).toBe(true);
        expect(prepared.diagnostics.some(entry => entry.code === 'missing_schema')).toBe(true);
    });
});
