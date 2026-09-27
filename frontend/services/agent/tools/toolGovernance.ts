import type {
    AppState,
    ToolAvailabilityContext,
    ToolCategory,
    ToolDefaultPolicy,
    ToolGroup,
    ToolManifest,
    ToolPolicyContext,
    ToolPolicyDecision,
    ToolRegistry,
    ToolRegistryDiagnostics,
    ToolRisk,
    ToolStage,
} from '../../../types';
import {
    getPermissionModeBlockReason,
    getRuntimeAccessControlOverrideSets,
    normalizeRuntimeAccessControlSettings,
} from '../../runtimeAccessControl';
import { STAGE_GROUP_ALLOWLIST } from '../../../config/toolPolicyDefaults';

type AvailabilityState = { available: boolean; reason?: string };

const TOOL_CATEGORIES: ToolCategory[] = ['analysis', 'card', 'ui', 'data', 'spreadsheet', 'workspace', 'conversation'];
const TOOL_RISKS: ToolRisk[] = ['low', 'medium', 'high'];
const TOOL_POLICIES: ToolDefaultPolicy[] = ['allow', 'deny'];

const getDefaultStageAvailability = (manifest: ToolManifest): ToolStage[] => {
    const groups = manifest.groups ?? [];
    return (Object.entries(STAGE_GROUP_ALLOWLIST) as Array<[ToolStage, ToolGroup[]]>)
        .filter(([, allowedGroups]) => groups.some(group => allowedGroups.includes(group)))
        .map(([stage]) => stage);
};

const getDefaultRequiresCleaningCompleted = (stages: ToolStage[]) =>
    stages.includes('analysis') && !stages.includes('cleaning');

export const resolveToolStage = (context: ToolAvailabilityContext): ToolStage => {
    if (context.toolStage) {
        return context.toolStage;
    }
    return context.cleaningCompleted === false ? 'cleaning' : 'analysis';
};

export const buildToolAvailabilityContext = (
    state: Pick<AppState, 'analysisCards' | 'columnProfiles' | 'csvData' | 'cleaningRun' | 'sessionId' | 'currentDatasetId' | 'settings'> & {
        cardEnhancementSuggestions?: AppState['cardEnhancementSuggestions'];
    },
    overrides: Partial<ToolAvailabilityContext> = {},
): ToolAvailabilityContext => {
    const suggestionIds = state.cardEnhancementSuggestions ?? [];
    return normalizeToolAvailabilityContext({
        cardIds: overrides.cardIds ?? state.analysisCards.map(card => card.id),
        columnNames: overrides.columnNames ?? state.columnProfiles.map(profile => profile.name),
        csvData: overrides.csvData ?? state.csvData ?? null,
        hasCsvData: overrides.hasCsvData ?? Boolean(state.csvData),
        hasCards: overrides.hasCards ?? state.analysisCards.length > 0,
        hasCleaningRun: overrides.hasCleaningRun ?? Boolean(state.cleaningRun),
        cleaningRunStatus: overrides.cleaningRunStatus ?? state.cleaningRun?.status ?? null,
        suggestionIds: overrides.suggestionIds ?? suggestionIds.map(suggestion => suggestion.id),
        cleaningCompleted: overrides.cleaningCompleted ?? (!state.cleaningRun || state.cleaningRun.status === 'completed'),
        sessionId: overrides.sessionId ?? state.sessionId,
        datasetId: overrides.datasetId ?? state.currentDatasetId ?? null,
        settingsKey: overrides.settingsKey ?? `${state.settings.provider}:${state.settings.simpleModel}:${state.settings.complexModel}`,
        toolStage: overrides.toolStage,
        allowOverrides: overrides.allowOverrides,
        denyOverrides: overrides.denyOverrides,
        runtimeAccessControl: overrides.runtimeAccessControl ?? state.settings.runtimeAccessControl,
    });
};

export const normalizeToolAvailabilityContext = (
    context: Partial<ToolAvailabilityContext>,
): ToolAvailabilityContext => ({
    cardIds: context.cardIds ?? [],
    columnNames: context.columnNames ?? [],
    csvData: context.csvData ?? null,
    hasCsvData: context.hasCsvData ?? true,
    hasCards: context.hasCards ?? false,
    hasCleaningRun: context.hasCleaningRun ?? false,
    cleaningRunStatus: context.cleaningRunStatus ?? null,
    suggestionIds: context.suggestionIds ?? [],
    cleaningCompleted: context.cleaningCompleted ?? true,
    sessionId: context.sessionId,
    datasetId: context.datasetId ?? null,
    settingsKey: context.settingsKey,
    toolStage: context.toolStage,
    allowOverrides: context.allowOverrides ?? [],
    denyOverrides: context.denyOverrides ?? [],
    runtimeAccessControl: normalizeRuntimeAccessControlSettings(context.runtimeAccessControl),
});

export const normalizeToolDescriptor = (descriptor: ToolManifest): ToolManifest => {
    const stageAvailability = descriptor.stageAvailability && descriptor.stageAvailability.length > 0
        ? descriptor.stageAvailability
        : getDefaultStageAvailability(descriptor);
    const parameterSchema = descriptor.parameterSchema ?? descriptor.inputSchema;
    return {
        ...descriptor,
        parameterSchema,
        inputSchema: parameterSchema,
        stageAvailability,
        requiresCleaningCompleted: descriptor.requiresCleaningCompleted ?? getDefaultRequiresCleaningCompleted(stageAvailability),
        defaultPolicy: descriptor.defaultPolicy ?? 'allow',
    };
};

export const prepareToolDescriptors = (descriptors: ToolManifest[]): {
    descriptors: ToolManifest[];
    diagnostics: ToolRegistryDiagnostics;
} => {
    const diagnostics: ToolRegistryDiagnostics = [];
    const seen = new Set<string>();
    const validDescriptors: ToolManifest[] = [];

    descriptors.forEach(rawDescriptor => {
        const descriptor = normalizeToolDescriptor(rawDescriptor);
        if (seen.has(descriptor.name)) {
            diagnostics.push({ level: 'error', code: 'duplicate_tool', toolName: descriptor.name, message: `Duplicate tool descriptor "${descriptor.name}" was skipped.` });
            return;
        }
        seen.add(descriptor.name);
        if (!descriptor.parameterSchema || typeof descriptor.parameterSchema !== 'object') {
            diagnostics.push({ level: 'error', code: 'missing_schema', toolName: descriptor.name, message: `Tool "${descriptor.name}" is missing a parameter schema.` });
            return;
        }
        if (!TOOL_CATEGORIES.includes(descriptor.category)) {
            diagnostics.push({ level: 'error', code: 'invalid_category', toolName: descriptor.name, message: `Tool "${descriptor.name}" uses an invalid category.` });
            return;
        }
        if (!TOOL_RISKS.includes(descriptor.risk)) {
            diagnostics.push({ level: 'error', code: 'invalid_risk', toolName: descriptor.name, message: `Tool "${descriptor.name}" uses an invalid risk level.` });
            return;
        }
        if (!descriptor.stageAvailability?.length || descriptor.stageAvailability.some(stage => !Object.keys(STAGE_GROUP_ALLOWLIST).includes(stage))) {
            diagnostics.push({ level: 'error', code: 'invalid_stage', toolName: descriptor.name, message: `Tool "${descriptor.name}" has an invalid stage configuration.` });
            return;
        }
        if (!descriptor.defaultPolicy || !TOOL_POLICIES.includes(descriptor.defaultPolicy)) {
            diagnostics.push({ level: 'error', code: 'invalid_policy', toolName: descriptor.name, message: `Tool "${descriptor.name}" has an invalid default policy.` });
            return;
        }
        validDescriptors.push(descriptor);
    });

    return { descriptors: validDescriptors, diagnostics };
};

export const resolveToolGovernance = (
    registry: ToolRegistry,
    context: ToolAvailabilityContext,
): {
    policyContext: ToolPolicyContext;
    decisions: Record<string, ToolPolicyDecision>;
    availability: Record<string, AvailabilityState>;
    allowedTools: ToolPolicyDecision[];
    blockedTools: ToolPolicyDecision[];
    diagnostics: ToolRegistryDiagnostics;
} => {
    const normalizedContext = normalizeToolAvailabilityContext(context);
    const toolStage = resolveToolStage(normalizedContext);
    const policyContext: ToolPolicyContext = { ...normalizedContext, toolStage };
    const registryAllow = new Set(registry.policy.allow ?? []);
    const registryDeny = new Set(registry.policy.deny ?? []);
    const profileOverrides = getRuntimeAccessControlOverrideSets(normalizedContext.runtimeAccessControl);
    const allowOverrides = new Set([...profileOverrides.allow, ...(normalizedContext.allowOverrides ?? [])]);
    const denyOverrides = new Set([...profileOverrides.deny, ...(normalizedContext.denyOverrides ?? [])]);
    const settingsDenyOverrides = new Set(profileOverrides.deny);
    const runtimeContractDenyOverrides = new Set(normalizedContext.denyOverrides ?? []);
    const decisions: Record<string, ToolPolicyDecision> = {};
    const availability: Record<string, AvailabilityState> = {};
    const allowedTools: ToolPolicyDecision[] = [];
    const blockedTools: ToolPolicyDecision[] = [];
    const diagnostics = [...registry.diagnostics];

    registry.manifests.forEach(descriptor => {
        let decision: ToolPolicyDecision;
        if (registryDeny.has(descriptor.name)) {
            decision = { toolName: descriptor.name, stage: toolStage, allowed: false, source: 'default_policy', reason: `Tool "${descriptor.name}" is denied by base tool policy.`, category: descriptor.category, risk: descriptor.risk };
        } else if (!registryAllow.has(descriptor.name)) {
            decision = { toolName: descriptor.name, stage: toolStage, allowed: false, source: 'default_policy', reason: `Tool "${descriptor.name}" is not included in the base tool policy.`, category: descriptor.category, risk: descriptor.risk };
        } else if (descriptor.defaultPolicy === 'deny') {
            decision = { toolName: descriptor.name, stage: toolStage, allowed: false, source: 'default_policy', reason: `Tool "${descriptor.name}" is disabled by default policy.`, category: descriptor.category, risk: descriptor.risk };
        } else if (!descriptor.stageAvailability?.includes(toolStage)) {
            decision = { toolName: descriptor.name, stage: toolStage, allowed: false, source: 'stage_allowlist', reason: `Tool "${descriptor.name}" is not exposed during the ${toolStage} stage.`, category: descriptor.category, risk: descriptor.risk };
        } else if (denyOverrides.has(descriptor.name)) {
            const deniedBySettings = settingsDenyOverrides.has(descriptor.name);
            const deniedByRuntimeContract = runtimeContractDenyOverrides.has(descriptor.name);
            decision = {
                toolName: descriptor.name,
                stage: toolStage,
                allowed: false,
                source: 'deny_override',
                reason: `Tool "${descriptor.name}" was explicitly denied by tool override.`,
                category: descriptor.category,
                risk: descriptor.risk,
                overrideOrigin: deniedBySettings && deniedByRuntimeContract
                    ? 'both'
                    : deniedBySettings
                        ? 'settings'
                        : 'runtime_contract',
            };
        } else {
            const permissionModeReason = getPermissionModeBlockReason(
                policyContext.runtimeAccessControl.permissionMode,
                descriptor,
            );
            if (permissionModeReason && !allowOverrides.has(descriptor.name)) {
                decision = { toolName: descriptor.name, stage: toolStage, allowed: false, source: 'permission_mode', reason: permissionModeReason, category: descriptor.category, risk: descriptor.risk };
                decisions[descriptor.name] = decision;
                blockedTools.push(decision);
                return;
            }
            const availabilityState = descriptor.isAvailable?.(policyContext) ?? { available: true };
            availability[descriptor.name] = availabilityState;
            if (!availabilityState.available) {
                decision = { toolName: descriptor.name, stage: toolStage, allowed: false, source: 'availability', reason: availabilityState.reason ?? `Tool "${descriptor.name}" is currently unavailable.`, category: descriptor.category, risk: descriptor.risk };
            } else {
                decision = {
                    toolName: descriptor.name,
                    stage: toolStage,
                    allowed: true,
                    source: allowOverrides.has(descriptor.name) ? 'allow_override' : 'stage_allowlist',
                    reason: allowOverrides.has(descriptor.name)
                        ? `Tool "${descriptor.name}" is explicitly allowed by tool override.`
                        : `Tool "${descriptor.name}" is allowed during the ${toolStage} stage.`,
                    category: descriptor.category,
                    risk: descriptor.risk,
                };
            }
        }

        decisions[descriptor.name] = decision;
        if (decision.allowed) {
            allowedTools.push(decision);
        } else {
            blockedTools.push(decision);
        }
    });

    return {
        policyContext,
        decisions,
        availability,
        allowedTools,
        blockedTools,
        diagnostics,
    };
};

export const buildToolGovernanceSnapshot = (params: {
    stage: ToolStage;
    phase?: string;
    allowedTools: ToolPolicyDecision[];
    blockedTools: ToolPolicyDecision[];
    diagnostics: ToolRegistryDiagnostics;
}) => ({
    stage: params.stage,
    phase: params.phase,
    allowedTools: params.allowedTools.map(decision => ({
        toolName: decision.toolName,
        category: decision.category,
        risk: decision.risk,
        reason: decision.reason,
    })),
    blockedTools: params.blockedTools.map(decision => ({
        toolName: decision.toolName,
        source: decision.source,
        category: decision.category,
        risk: decision.risk,
        reason: decision.reason,
        overrideOrigin: decision.overrideOrigin,
    })),
    diagnostics: params.diagnostics,
});
