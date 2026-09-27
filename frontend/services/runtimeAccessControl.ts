import type {
    AiAction,
    RuntimeAccessControlSettings,
    RuntimePermissionMode,
    RuntimeToolOverride,
    ToolGroup,
    ToolManifest,
    ToolName,
    WorkspaceFileAction,
} from '../types';
import {
    normalizeWorkspacePath,
    WORKSPACE_DATASET_CLEAN_CSV,
    WORKSPACE_DATASET_RAW_CSV,
} from './agent/workspaceFileUtils';

const BALANCED_BLOCKED_GROUPS = new Set<ToolGroup>(['workspace.edit']);
const STRICT_ALLOWED_GROUPS = new Set<ToolGroup>([
    'analysis.plan',
    'analysis.statistics',
    'analysis.validate',
    'card.review',
    'data.query',
    'spreadsheet.filter',
    'workspace.inspect',
    'workspace.inspect.tree',
    'workspace.inspect.diff',
    'conversation.clarification',
    'cleaning.inspect',
    'cleaning.verify',
    'cleaning.verify.query',
]);

export interface WorkspaceRuleViolation {
    field: 'path' | 'comparePath';
    normalizedPath: string;
    matchedPrefix: string;
    message: string;
}

export const createDefaultRuntimeAccessControl = (): RuntimeAccessControlSettings => ({
    permissionMode: 'open',
    toolOverrides: {},
    workspaceRules: {
        deniedPathPrefixes: [],
    },
});

const normalizePermissionMode = (value: unknown): RuntimePermissionMode =>
    value === 'balanced' || value === 'strict' ? value : 'open';

const normalizeToolOverrides = (value: unknown): Partial<Record<ToolName, RuntimeToolOverride>> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.entries(value as Record<string, unknown>).reduce<Partial<Record<ToolName, RuntimeToolOverride>>>((acc, [toolName, decision]) => {
        if (decision === 'allow' || decision === 'deny') {
            acc[toolName as ToolName] = decision;
        }
        return acc;
    }, {});
};

const normalizeDeniedPathPrefixes = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(new Set(
        value
            .filter((entry): entry is string => typeof entry === 'string')
            .map(entry => normalizeWorkspacePath(entry))
            .filter(Boolean),
    )).sort();
};

export const normalizeRuntimeAccessControlSettings = (
    value?: Partial<RuntimeAccessControlSettings> | null,
): RuntimeAccessControlSettings => {
    const defaults = createDefaultRuntimeAccessControl();
    return {
        permissionMode: normalizePermissionMode(value?.permissionMode),
        toolOverrides: normalizeToolOverrides(value?.toolOverrides),
        workspaceRules: {
            deniedPathPrefixes: normalizeDeniedPathPrefixes(value?.workspaceRules?.deniedPathPrefixes),
        },
    };
};

export const serializeRuntimeAccessControlSettings = (
    value?: Partial<RuntimeAccessControlSettings> | null,
): string => {
    const normalized = normalizeRuntimeAccessControlSettings(value);
    const toolOverrideEntries = Object.entries(normalized.toolOverrides)
        .sort(([left], [right]) => left.localeCompare(right));

    return JSON.stringify({
        permissionMode: normalized.permissionMode,
        toolOverrides: toolOverrideEntries,
        deniedPathPrefixes: normalized.workspaceRules.deniedPathPrefixes,
    });
};

export const getRuntimeAccessControlOverrideSets = (
    value?: Partial<RuntimeAccessControlSettings> | null,
): { allow: Set<ToolName>; deny: Set<ToolName> } => {
    const normalized = normalizeRuntimeAccessControlSettings(value);
    const allow = new Set<ToolName>();
    const deny = new Set<ToolName>();

    Object.entries(normalized.toolOverrides).forEach(([toolName, decision]) => {
        if (decision === 'allow') {
            allow.add(toolName as ToolName);
        } else if (decision === 'deny') {
            deny.add(toolName as ToolName);
        }
    });

    return { allow, deny };
};

export const getPermissionModeBlockReason = (
    mode: RuntimePermissionMode,
    descriptor: Pick<ToolManifest, 'name' | 'groups'>,
): string | null => {
    const groups = descriptor.groups ?? [];
    if (mode === 'open') {
        return null;
    }
    if (mode === 'balanced') {
        return groups.some(group => BALANCED_BLOCKED_GROUPS.has(group))
            ? `Tool "${descriptor.name}" is blocked by the balanced permission mode.`
            : null;
    }
    return groups.some(group => STRICT_ALLOWED_GROUPS.has(group))
        ? null
        : `Tool "${descriptor.name}" is blocked by the strict permission mode.`;
};

const getWorkspaceOperationDefaultPath = (operation: WorkspaceFileAction['operation']): string => {
    if (operation === 'list' || operation === 'tree' || operation === 'search' || operation === 'grep') {
        return '/';
    }
    if (operation === 'diff') {
        return WORKSPACE_DATASET_CLEAN_CSV;
    }
    return '/workspace';
};

const resolveWorkspaceRulePaths = (action: AiAction): Array<{ field: 'path' | 'comparePath'; normalizedPath: string }> => {
    if (action.type !== 'tool_call' || !action.toolName.startsWith('workspace.')) {
        return [];
    }

    const operation = action.toolName.replace('workspace.', '') as WorkspaceFileAction['operation'];
    const normalizedPath = normalizeWorkspacePath(String(action.args?.path || getWorkspaceOperationDefaultPath(operation)));
    const paths: Array<{ field: 'path' | 'comparePath'; normalizedPath: string }> = normalizedPath
        ? [{ field: 'path', normalizedPath }]
        : [];

    if (operation === 'diff') {
        const comparePath = normalizeWorkspacePath(String(action.args?.comparePath || WORKSPACE_DATASET_RAW_CSV));
        if (comparePath) {
            paths.push({ field: 'comparePath', normalizedPath: comparePath });
        }
    }

    return paths;
};

const matchesDeniedPrefix = (path: string, prefix: string) =>
    prefix === '/'
        ? true
        : path === prefix || path.startsWith(`${prefix}/`);

export const getWorkspaceRuleViolation = (
    action: AiAction,
    value?: Partial<RuntimeAccessControlSettings> | null,
): WorkspaceRuleViolation | null => {
    if (action.type !== 'tool_call' || !action.toolName.startsWith('workspace.')) {
        return null;
    }

    const normalized = normalizeRuntimeAccessControlSettings(value);
    for (const path of resolveWorkspaceRulePaths(action)) {
        const matchedPrefix = normalized.workspaceRules.deniedPathPrefixes.find(prefix => matchesDeniedPrefix(path.normalizedPath, prefix));
        if (matchedPrefix) {
            return {
                field: path.field,
                normalizedPath: path.normalizedPath,
                matchedPrefix,
                message: `Workspace access is blocked for "${path.normalizedPath}" by denied prefix "${matchedPrefix}".`,
            };
        }
    }

    return null;
};
