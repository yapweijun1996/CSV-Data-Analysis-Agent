import type {
    ToolAvailabilityContext,
    ToolDescriptor,
    ToolName,
    ToolPolicy,
    ToolPolicyContext,
    ToolPolicyDecision,
    ToolRegistry,
    ToolStage,
} from '../../../types';
import { serializeRuntimeAccessControlSettings } from '../../runtimeAccessControl';
import { normalizeToolAvailabilityContext, prepareToolDescriptors, resolveToolGovernance } from './toolGovernance';
import {
    buildBuiltinToolManifests,
    buildToolGroups,
    createInitialAnalysisStageToolManifests,
} from './toolManifestRegistry';
import { DEFAULT_TOOL_POLICY } from '../../../config/toolPolicyDefaults';

const manifestCache = new Map<string, ToolDescriptor[]>();
const resolvedRegistryCache = new Map<string, ResolvedToolRegistry>();

export type ResolvedToolRegistry = ToolRegistry & {
    descriptorMap: Map<ToolName, ToolDescriptor>;
    exposedTools: ToolDescriptor[];
    availability: Record<string, { available: boolean; reason?: string }>;
    exposures: Record<string, { toolName: ToolName; manifest: ToolDescriptor; decision: ToolPolicyDecision; available: boolean; availabilityReason?: string }>;
    stage: ToolStage;
    policyContext: ToolPolicyContext;
    decisions: Record<string, ToolPolicyDecision>;
    allowedTools: ToolPolicyDecision[];
    blockedTools: ToolPolicyDecision[];
    allowedToolNames: ToolName[];
};

const DEFAULT_POLICY = DEFAULT_TOOL_POLICY;

export const buildBuiltinToolRegistry = (columnNames: string[]): ToolRegistry => {
    const cacheKey = columnNames.join('::');
    const cached = manifestCache.get(cacheKey);
    const manifests = cached ?? buildBuiltinToolManifests(columnNames);
    if (!cached) {
        manifestCache.set(cacheKey, manifests);
    }
    const prepared = prepareToolDescriptors(manifests);
    return {
        manifests: prepared.descriptors,
        descriptors: prepared.descriptors,
        groups: buildToolGroups(prepared.descriptors),
        diagnostics: prepared.diagnostics,
        policy: DEFAULT_POLICY,
    };
};

export const buildInitialAnalysisToolRegistry = (): ToolRegistry => {
    const prepared = prepareToolDescriptors(
        createInitialAnalysisStageToolManifests(),
    );
    const allow = prepared.descriptors.map(descriptor => descriptor.name);
    return {
        manifests: prepared.descriptors,
        descriptors: prepared.descriptors,
        groups: buildToolGroups(prepared.descriptors),
        diagnostics: prepared.diagnostics,
        policy: {
            allow,
            deny: [],
        },
    };
};

export const resolveAllowedTools = (registry: ToolRegistry, context: ToolAvailabilityContext): ResolvedToolRegistry => {
    const normalizedContext = normalizeToolAvailabilityContext(context);
    const columnKey = (normalizedContext.columnNames ?? []).join('::');
    const cacheKey = [
        normalizedContext.sessionId ?? 'no-session',
        normalizedContext.datasetId ?? 'no-dataset',
        columnKey,
        normalizedContext.hasCsvData ? 'data' : 'no-data',
        normalizedContext.cardIds.join(','),
        normalizedContext.suggestionIds?.join(',') ?? '',
        normalizedContext.hasCleaningRun ? 'cleaning-run' : 'no-cleaning-run',
        normalizedContext.cleaningRunStatus ?? 'no-cleaning-status',
        normalizedContext.cleaningCompleted ? 'cleaning-complete' : 'cleaning-pending',
        normalizedContext.toolStage ?? 'auto-stage',
        (normalizedContext.allowOverrides ?? []).join(','),
        (normalizedContext.denyOverrides ?? []).join(','),
        serializeRuntimeAccessControlSettings(normalizedContext.runtimeAccessControl),
        normalizedContext.settingsKey ?? 'default-settings',
    ].join('|');
    const cached = resolvedRegistryCache.get(cacheKey);
    if (cached) return cached;

    const descriptorMap = new Map<ToolName, ToolDescriptor>();
    const exposedTools: ToolDescriptor[] = [];
    const governance = resolveToolGovernance(registry, normalizedContext);
    const exposures: ResolvedToolRegistry['exposures'] = {};

    for (const descriptor of registry.manifests) {
        const decision = governance.decisions[descriptor.name];
        descriptorMap.set(descriptor.name, descriptor);
        if (decision?.allowed) {
            exposedTools.push(descriptor);
        }
        exposures[descriptor.name] = {
            toolName: descriptor.name,
            manifest: descriptor,
            decision,
            available: governance.availability[descriptor.name]?.available ?? false,
            availabilityReason: governance.availability[descriptor.name]?.reason,
        };
    }

    const resolved: ResolvedToolRegistry = {
        ...registry,
        descriptorMap,
        exposedTools,
        exposures,
        availability: governance.availability,
        stage: governance.policyContext.toolStage,
        policyContext: governance.policyContext,
        decisions: governance.decisions,
        allowedTools: governance.allowedTools,
        blockedTools: governance.blockedTools,
        allowedToolNames: governance.allowedTools.map(decision => decision.toolName),
        diagnostics: governance.diagnostics,
    };
    resolvedRegistryCache.set(cacheKey, resolved);
    return resolved;
};
