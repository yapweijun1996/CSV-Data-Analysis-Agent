import { describe, expect, it } from 'vitest';
import type { AiAction } from '../types';
import { createChatActionSchema } from '../services/ai/schemas/chatSchemas';
import { buildBuiltinToolRegistry } from '../services/agent/tools/toolRegistry';
import { getResolvedToolRegistry, validateAction } from '../services/ai/toolValidator';
import { createDefaultRuntimeAccessControl } from '../services/runtimeAccessControl';

const baseContext = {
    cardIds: ['card-1'],
    columnNames: ['Region', 'Revenue'],
    csvData: {
        fileName: 'report.csv',
        data: [
            { Region: 'North', Revenue: 100 },
            { Region: 'South', Revenue: 120 },
        ],
    },
    hasCsvData: true,
    hasCards: true,
    cleaningCompleted: true,
    sessionId: 'session-1',
    datasetId: 'dataset-1',
    settingsKey: 'google:model:model',
    runtimeAccessControl: createDefaultRuntimeAccessControl(),
};

describe('tool registry governance', () => {
    it('exposes a stable set of built-in tool names to the schema', () => {
        const registry = buildBuiltinToolRegistry(baseContext.columnNames);
        const schema = createChatActionSchema(registry.descriptors) as {
            properties?: {
                action?: {
                    anyOf?: Array<{ properties?: Record<string, any> }>;
                };
            };
        };
        const toolNames = (schema.properties?.action?.anyOf ?? [])
            .map(entry => entry.properties?.toolName?.enum?.[0])
            .filter(Boolean);

        expect(toolNames).toContain('analysis.create_plan');
        expect(toolNames).toContain('analysis.pivot_matrix');
        expect(toolNames).toContain('analysis.period_compare');
        expect(toolNames).toContain('analysis.cohort_retention');
        expect(toolNames).toContain('analysis.root_cause_breakdown');
        expect(toolNames).toContain('analysis.validate_metric_mapping');
        expect(toolNames).toContain('data.query');
        expect(toolNames).toContain('workspace.write');
        expect(toolNames).toContain('workspace.tree');
        expect(toolNames).toContain('workspace.grep');
        expect(toolNames).toContain('workspace.head');
        expect(toolNames).toContain('workspace.diff');
        expect(toolNames).toContain('card.delete');
        expect(toolNames).toContain('card.suggestion.apply');
        expect(toolNames).toContain('cleaning.resume');
        expect(new Set(toolNames).size).toBe(toolNames.length);
    });

    it('marks dataset and card dependent tools unavailable when context is missing', () => {
        const registry = getResolvedToolRegistry({
            ...baseContext,
            cardIds: [],
            hasCsvData: false,
            hasCards: false,
        });

        expect(registry.exposedTools.map(tool => tool.name)).not.toContain('analysis.create_plan');
        expect(registry.availability['analysis.create_plan'].available).toBe(false);
        expect(registry.availability['ui.highlight_card'].available).toBe(false);
    });

    it('keeps analysis-stage tools hidden while cleaning is incomplete', () => {
        const registry = getResolvedToolRegistry({
            ...baseContext,
            cleaningCompleted: false,
        });

        expect(registry.exposedTools.map(tool => tool.name)).not.toContain('analysis.create_plan');
        expect(registry.exposedTools.map(tool => tool.name)).not.toContain('analysis.validate_metric_mapping');
        expect(registry.exposedTools.map(tool => tool.name)).not.toContain('card.delete');
        expect(registry.exposedTools.map(tool => tool.name)).toContain('data.query');
        expect(registry.exposedTools.map(tool => tool.name)).toContain('workspace.tree');
    });

    it('rejects unknown tools before execution', () => {
        const action = {
            type: 'tool_call',
            thought: 'Try something unsupported.',
            toolName: 'legacy.execute_js_code',
            args: {},
        } as unknown as AiAction;

        const result = validateAction(action, baseContext);
        expect(result.isValid).toBe(false);
        expect(result.error?.code).toBe('invalid_tool_name');
    });

    it('accepts free-text clarification payloads without options', () => {
        const action = {
            type: 'tool_call',
            thought: 'Ask the user to clarify what defines a duplicate.',
            toolName: 'conversation.request_clarification',
            args: {
                question: 'Which combination of dimensions should define a unique record?',
                allowFreeText: true,
                options: [],
            },
        } as unknown as AiAction;

        const result = validateAction(action, baseContext);
        expect(result.isValid).toBe(true);
    });

    it('rejects clarification payloads that are still missing question after normalization', () => {
        const action = {
            type: 'tool_call',
            thought: 'Ask for clarification.',
            toolName: 'conversation.request_clarification',
            args: {
                allowFreeText: true,
                options: [],
            },
        } as unknown as AiAction;

        const result = validateAction(action, baseContext);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('"question" is required.');
    });

    it('rebuilds the resolved registry when only column names change', () => {
        const initial = getResolvedToolRegistry(baseContext);
        const next = getResolvedToolRegistry({
            ...baseContext,
            columnNames: ['Region', 'Revenue', 'Margin'],
        });

        const initialAggregate = initial.descriptorMap.get('card.aggregate_table');
        const nextAggregate = next.descriptorMap.get('card.aggregate_table');

        expect(initial).not.toBe(next);
        expect(initialAggregate?.parameterSchema).not.toEqual(nextAggregate?.parameterSchema);
        expect((nextAggregate?.parameterSchema as { properties?: { groupByColumn?: { enum?: string[] } } })
            .properties?.groupByColumn?.enum).toContain('Margin');
    });

    it('rebuilds the resolved registry when the permission mode changes', () => {
        const initial = getResolvedToolRegistry(baseContext);
        const next = getResolvedToolRegistry({
            ...baseContext,
            runtimeAccessControl: {
                permissionMode: 'strict',
                toolOverrides: {},
                workspaceRules: { deniedPathPrefixes: [] },
            },
        });

        expect(initial).not.toBe(next);
        expect(initial.allowedToolNames).toContain('card.delete');
        expect(next.allowedToolNames).not.toContain('card.delete');
    });

    it('blocks workspace reads that hit denied path prefixes before execution', () => {
        const action = {
            type: 'tool_call',
            thought: 'Inspect the cleaned dataset file.',
            toolName: 'workspace.read',
            args: {
                path: '/dataset/cleaned.csv',
            },
        } as const satisfies AiAction;

        const result = validateAction(action, {
            ...baseContext,
            runtimeAccessControl: {
                permissionMode: 'open',
                toolOverrides: {},
                workspaceRules: { deniedPathPrefixes: ['/dataset'] },
            },
        });

        expect(result.isValid).toBe(false);
        expect(result.error?.code).toBe('blocked_tool');
        expect(result.error?.detail?.source).toBe('workspace_rule');
        expect(result.error?.detail?.normalizedPath).toBe('/dataset/cleaned.csv');
    });

    it('blocks workspace writes that hit denied path prefixes before execution', () => {
        const action = {
            type: 'tool_call',
            thought: 'Overwrite the workspace draft.',
            toolName: 'workspace.write',
            args: {
                path: '/workspace/private/notes.md',
                content: '# draft',
            },
        } as const satisfies AiAction;

        const result = validateAction(action, {
            ...baseContext,
            toolStage: 'cleaning',
            cleaningCompleted: false,
            runtimeAccessControl: {
                permissionMode: 'open',
                toolOverrides: {},
                workspaceRules: { deniedPathPrefixes: ['/workspace/private'] },
            },
        });

        expect(result.isValid).toBe(false);
        expect(result.error?.code).toBe('blocked_tool');
        expect(result.error?.detail?.source).toBe('workspace_rule');
        expect(result.error?.detail?.matchedPrefix).toBe('/workspace/private');
    });

    it('rejects pivot payloads that omit metric for non-count aggregates', () => {
        const action = {
            type: 'tool_call',
            thought: 'Build a revenue pivot by region.',
            toolName: 'analysis.pivot_matrix',
            args: {
                rows: ['Region'],
                aggregate: 'sum',
                title: 'Revenue pivot',
                description: 'Summarize revenue by region.',
            },
        } as const satisfies AiAction;

        const result = validateAction(action, baseContext);

        expect(result.isValid).toBe(false);
        expect(result.error?.code).toBe('malformed_tool_payload');
        expect(result.errors).toContain('Pivot sum requires a metric column.');
    });

    it('rejects pivot payloads that omit aggregate', () => {
        const action = {
            type: 'tool_call',
            thought: 'Build a count-like pivot by region.',
            toolName: 'analysis.pivot_matrix',
            args: {
                rows: ['Region'],
                title: 'Revenue pivot',
                description: 'Summarize by region.',
            },
        } as const satisfies AiAction;

        const result = validateAction(action, baseContext);

        expect(result.isValid).toBe(false);
        expect(result.error?.code).toBe('malformed_tool_payload');
        expect(result.errors).toContain('"aggregate" is required.');
    });

    it('rejects count_distinct pivot payloads that omit the metric column', () => {
        const action = {
            type: 'tool_call',
            thought: 'Build a distinct-value pivot by region.',
            toolName: 'analysis.pivot_matrix',
            args: {
                rows: ['Region'],
                aggregate: 'count_distinct',
                title: 'Distinct pivot',
                description: 'Count distinct metric values by region.',
            },
        } as const satisfies AiAction;

        const result = validateAction(action, baseContext);

        expect(result.isValid).toBe(false);
        expect(result.error?.code).toBe('malformed_tool_payload');
        expect(result.errors).toContain('Pivot count_distinct requires a metric column.');
    });

    it('allows count pivots to omit the metric column', () => {
        const action = {
            type: 'tool_call',
            thought: 'Count rows by region in a pivot.',
            toolName: 'analysis.pivot_matrix',
            args: {
                rows: ['Region'],
                aggregate: 'count',
                title: 'Count pivot',
                description: 'Count rows by region.',
            },
        } as const satisfies AiAction;

        const result = validateAction(action, baseContext);

        expect(result.isValid).toBe(true);
    });

    it('rejects numeric pivot aggregates when the metric column has no parseable numeric values', () => {
        const action = {
            type: 'tool_call',
            thought: 'Try to sum a text-only metric column.',
            toolName: 'analysis.pivot_matrix',
            args: {
                rows: ['Region'],
                metric: 'Revenue',
                aggregate: 'sum',
                title: 'Invalid pivot',
                description: 'Attempt to sum text metric values.',
            },
        } as const satisfies AiAction;

        const result = validateAction(action, {
            ...baseContext,
            csvData: {
                fileName: 'report.csv',
                data: [
                    { Region: 'North', Revenue: 'n/a' },
                    { Region: 'South', Revenue: 'pending' },
                ],
            },
        });

        expect(result.isValid).toBe(false);
        expect(result.error?.code).toBe('malformed_tool_payload');
        expect(result.errors).toContain('contains no numeric values');
    });
});
