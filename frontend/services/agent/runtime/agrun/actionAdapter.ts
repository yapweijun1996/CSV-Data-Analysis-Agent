/**
 * AGRUN-003/008: projects app-owned canary manifests into Agrun custom
 * actions. Manifests remain the schema/capability source of truth and
 * handleAiAction remains the execution/governance source of truth.
 */
import {
    CONTEXT_ARTIFACT_PREVIEW_ROWS,
    CONTEXT_ARTIFACT_SUMMARY_MAX_CHARS,
} from '../../../../config/agentDefaults';
import type {
    AiAction,
    ToolExecutionResult,
    ToolManifest,
} from '../../../../types';
import { handleAiAction } from '../../actionHandler';
import { buildDataQueryResultDigest } from '../../execution/dataQueryResultDigest';
import type { StoreApi } from '../../types';
import { buildBuiltinToolRegistry } from '../../tools/toolRegistry';
import {
    captureRuntimeMutationRollbackSnapshot,
    restoreRuntimeMutationRollbackSnapshot,
    type RuntimeMutationRollbackSnapshot,
} from '../runtimeMutationRollback';
import type {
    AgrunActionContext,
    AgrunActionSpec,
    AgrunModule,
    AgrunRecord,
} from './types';
import type { AgrunCheckpointHostState } from './checkpointStore';
import {
    mapManifestSchemaToAgrunArgs,
    normalizeAgrunActionArgs,
} from './schemaAdapter';

export { mapManifestSchemaToAgrunArgs } from './schemaAdapter';

export const AGRUN_APP_TOOL_RESULT_KIND = 'app_tool_result';
export const AGRUN_MAX_ACTION_CALLS_PER_TURN = 3;
export const AGRUN_SUSPENDED_EXECUTION_TTL_MS = 15 * 60 * 1_000;

const REDACTED_KEY_PATTERN = /api[-_]?key|authorization|cookie|password|secret|token/i;
const MAX_OBJECT_KEYS = 30;
const MAX_RESULT_DEPTH = 5;

export const toAgrunActionName = (manifestName: string): string =>
    `host_${manifestName.replace(/[^a-zA-Z0-9_-]/g, '_')}`.toLowerCase();

export type AgrunAppActionExecutor = (
    action: AiAction,
    store: StoreApi,
    options: {
        toolStage: 'analysis';
        abortSignal?: AbortSignal;
        requireRowDeleteConfirmation: true;
    },
) => Promise<ToolExecutionResult>;

type AgrunExecutionOutcome = 'completed' | 'blocked' | 'failed' | 'cancelled';

export interface AgrunActionExecutionBridge {
    register(
        executionId: string,
        store: StoreApi,
        options?: {
            actionCalls?: number;
            beforeMutation?: () => Promise<void>;
            onActionCall?: (
                hostState: AgrunCheckpointHostState,
            ) => Promise<void>;
        },
    ): void;
    release(executionId: string, outcome: AgrunExecutionOutcome): void;
    resolve(executionId: string): StoreApi | null;
    captureMutationSnapshot(
        executionId: string,
        snapshot: RuntimeMutationRollbackSnapshot,
    ): void;
    beforeMutation(executionId: string): Promise<void>;
    consumeActionCall(executionId: string): Promise<{
        allowed: boolean;
        used: number;
        limit: number;
    }>;
    snapshot(executionId: string): AgrunCheckpointHostState | null;
}

export const createAgrunActionExecutionBridge = (): AgrunActionExecutionBridge => {
    const stores = new Map<string, {
        actionCalls: number;
        beforeMutation: (() => Promise<void>) | null;
        onActionCall: ((
            hostState: AgrunCheckpointHostState,
        ) => Promise<void>) | null;
        mutationRollbackSnapshot: RuntimeMutationRollbackSnapshot | null;
        store: StoreApi;
        references: number;
        retainedAt: number | null;
    }>();

    const rollbackAndDelete = (executionId: string) => {
        const existing = stores.get(executionId);
        if (!existing) return;
        if (existing.mutationRollbackSnapshot) {
            restoreRuntimeMutationRollbackSnapshot(
                existing.store,
                existing.mutationRollbackSnapshot,
            );
        }
        stores.delete(executionId);
    };

    const pruneExpiredSuspendedExecutions = () => {
        const now = Date.now();
        for (const [executionId, entry] of stores) {
            if (
                entry.references === 0
                && entry.retainedAt !== null
                && now - entry.retainedAt >= AGRUN_SUSPENDED_EXECUTION_TTL_MS
            ) {
                rollbackAndDelete(executionId);
            }
        }
    };

    return {
        register: (executionId, store, options) => {
            pruneExpiredSuspendedExecutions();
            const existing = stores.get(executionId);
            const restoredActionCalls = Number.isInteger(options?.actionCalls)
                ? Math.min(
                    AGRUN_MAX_ACTION_CALLS_PER_TURN,
                    Math.max(0, options?.actionCalls ?? 0),
                )
                : 0;
            stores.set(executionId, {
                actionCalls: Math.max(
                    existing?.actionCalls ?? 0,
                    restoredActionCalls,
                ),
                beforeMutation: options?.beforeMutation
                    ?? existing?.beforeMutation
                    ?? null,
                onActionCall: options?.onActionCall
                    ?? existing?.onActionCall
                    ?? null,
                mutationRollbackSnapshot: existing?.mutationRollbackSnapshot ?? null,
                store,
                references: (existing?.references ?? 0) + 1,
                retainedAt: null,
            });
        },
        release: (executionId, outcome) => {
            const existing = stores.get(executionId);
            if (!existing) return;
            if (existing.references > 1) {
                stores.set(executionId, {
                    ...existing,
                    references: existing.references - 1,
                });
                return;
            }
            if (outcome === 'blocked') {
                stores.set(executionId, {
                    ...existing,
                    references: 0,
                    retainedAt: Date.now(),
                });
                return;
            }
            if (outcome === 'failed' || outcome === 'cancelled') {
                rollbackAndDelete(executionId);
                return;
            }
            if (outcome === 'completed') {
                stores.delete(executionId);
            }
        },
        resolve: executionId => stores.get(executionId)?.store ?? null,
        captureMutationSnapshot: (executionId, snapshot) => {
            const existing = stores.get(executionId);
            if (!existing || existing.mutationRollbackSnapshot) return;
            stores.set(executionId, {
                ...existing,
                mutationRollbackSnapshot: snapshot,
            });
        },
        beforeMutation: async executionId => {
            const callback = stores.get(executionId)?.beforeMutation;
            if (callback) await callback();
        },
        consumeActionCall: async executionId => {
            const existing = stores.get(executionId);
            if (!existing) {
                return {
                    allowed: false,
                    used: 0,
                    limit: AGRUN_MAX_ACTION_CALLS_PER_TURN,
                };
            }
            if (existing.actionCalls >= AGRUN_MAX_ACTION_CALLS_PER_TURN) {
                return {
                    allowed: false,
                    used: existing.actionCalls,
                    limit: AGRUN_MAX_ACTION_CALLS_PER_TURN,
                };
            }
            const actionCalls = existing.actionCalls + 1;
            stores.set(executionId, {
                ...existing,
                actionCalls,
            });
            if (existing.onActionCall) {
                await existing.onActionCall({ actionCalls });
            }
            return {
                allowed: true,
                used: actionCalls,
                limit: AGRUN_MAX_ACTION_CALLS_PER_TURN,
            };
        },
        snapshot: executionId => {
            const existing = stores.get(executionId);
            return existing
                ? { actionCalls: existing.actionCalls }
                : null;
        },
    };
};

const asRecord = (value: unknown): AgrunRecord | null =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as AgrunRecord
        : null;

export const attachAgrunHostExecutionContext = (
    input: AgrunRecord,
    appSessionId: string,
): AgrunRecord => ({
    ...input,
    agrunSessionId: appSessionId,
});

const getExecutionId = (context: AgrunActionContext): string => {
    const executionId = context.request?.agrunSessionId;
    return typeof executionId === 'string' ? executionId.trim() : '';
};

const truncateText = (value: string, maxChars = CONTEXT_ARTIFACT_SUMMARY_MAX_CHARS) =>
    value.length <= maxChars
        ? value
        : `${value.slice(0, Math.max(0, maxChars - 16))}… [truncated]`;

export const boundAgrunValueForHost = (
    value: unknown,
    depth = 0,
): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return truncateText(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (depth >= MAX_RESULT_DEPTH) return '[depth bounded]';
    if (Array.isArray(value)) {
        return value
            .slice(0, CONTEXT_ARTIFACT_PREVIEW_ROWS)
            .map(item => boundAgrunValueForHost(item, depth + 1));
    }
    const record = asRecord(value);
    if (!record) return String(value);

    return Object.fromEntries(
        Object.entries(record)
            .slice(0, MAX_OBJECT_KEYS)
            .map(([key, nestedValue]) => [
                key,
                REDACTED_KEY_PATTERN.test(key)
                    ? '[redacted]'
                    : boundAgrunValueForHost(nestedValue, depth + 1),
            ]),
    );
};

const buildPlannerGuidance = (manifest: ToolManifest): string => {
    const mutatesState = manifest.capabilities?.mutatesState === true;
    const parts = [
        ...(manifest.promptHints ?? []),
        manifest.resultShape ? `Expected result: ${manifest.resultShape}` : '',
        mutatesState
            ? 'This action permanently changes app data and always requires explicit user approval. Permanent row deletion must use the app preflight confirmation flow and cannot execute directly here.'
            : 'This is a read-only app action. Never use it to mutate the dataset or workspace.',
    ].filter(Boolean);
    return truncateText(parts.join(' '), 4_000);
};

const isAgrunReadOnlyCanaryManifest = (manifest: ToolManifest): boolean =>
    manifest.risk === 'low'
    && manifest.capabilities?.readOnly === true
    && manifest.capabilities?.agrunReadOnlyCanary === true;

export const getAgrunReadOnlyCanaryManifests = (): ToolManifest[] =>
    buildBuiltinToolRegistry([])
        .manifests
        .filter(isAgrunReadOnlyCanaryManifest);

const isAgrunMutationCanaryManifest = (manifest: ToolManifest): boolean =>
    manifest.risk !== 'low'
    && manifest.capabilities?.mutatesState === true
    && manifest.capabilities?.agrunMutationCanary === true;

export const getAgrunMutationCanaryManifests = (): ToolManifest[] =>
    buildBuiltinToolRegistry([])
        .manifests
        .filter(isAgrunMutationCanaryManifest);

export const getAgrunCanaryManifests = (): ToolManifest[] => [
    ...getAgrunReadOnlyCanaryManifests(),
    ...getAgrunMutationCanaryManifests(),
];

/**
 * Agrun treats tier-1 host actions as approval-gated by default. This
 * manifest-derived policy only opens the read-only canary dispatch door;
 * handleAiAction still performs the authoritative live policy check.
 */
export const createAgrunReadOnlyActionPolicy = (): AgrunRecord =>
    Object.fromEntries(
        getAgrunReadOnlyCanaryManifests().map(manifest => [
            toAgrunActionName(manifest.name),
            {
                action: 'allow',
                reason: 'app_manifest_read_only_canary',
            },
        ]),
    );

export const createAgrunActionPolicy = (): AgrunRecord =>
    Object.fromEntries(
        getAgrunCanaryManifests().map(manifest => [
            toAgrunActionName(manifest.name),
            manifest.capabilities?.mutatesState === true
                ? {
                    action: 'ask',
                    reason: 'This action permanently changes the current dataset and requires your approval.',
                }
                : {
                    action: 'allow',
                    reason: 'app_manifest_read_only_canary',
                },
        ]),
    );

const mapManifestRiskToAgrunTier = (manifest: ToolManifest): number => {
    if (manifest.risk === 'high') return 2;
    return 1;
};

const buildAgrunPermission = (manifest: ToolManifest): AgrunRecord => {
    const mutatesState = manifest.capabilities?.mutatesState === true;
    return {
        effect: mutatesState ? 'local_state_mutation' : 'read_only',
        interruptBehavior: mutatesState ? 'rollback_safe' : 'abort_safe',
        isConcurrencySafe: !mutatesState,
        isDestructive: mutatesState && manifest.risk === 'high',
        isReadOnly: !mutatesState,
        needsApproval: mutatesState,
        source: 'app_manifest',
    };
};

const mapToolResultStatus = (
    result: ToolExecutionResult,
): 'success' | 'blocked' | 'failed' | 'cancelled' => {
    if (result.observation?.code === 'cancelled') return 'cancelled';
    if (result.status === 'success') return 'success';
    if (result.status === 'blocked') return 'blocked';
    return 'failed';
};

const buildAgrunActionEvidence = (
    manifest: ToolManifest,
    result: ToolExecutionResult,
    store: StoreApi,
): unknown => {
    if (manifest.name !== 'data.query' || result.status !== 'success') {
        return null;
    }
    const artifacts = asRecord(result.artifacts);
    const activeDataQuery = asRecord(
        artifacts?.activeDataQuery ?? store.getState().activeDataQuery,
    );
    const queryResult = asRecord(activeDataQuery?.result);
    if (!queryResult) return null;
    const rows = Array.isArray(queryResult.rows)
        ? queryResult.rows.filter((row): row is Record<string, string | number | boolean | null> =>
            Boolean(row) && typeof row === 'object' && !Array.isArray(row))
        : [];
    const selectedColumns = Array.isArray(queryResult.selectedColumns)
        ? queryResult.selectedColumns.filter((column): column is string =>
            typeof column === 'string')
        : [];
    return boundAgrunValueForHost({
        kind: 'data_query_preview',
        engine: activeDataQuery?.engine ?? null,
        returnedRows: queryResult.returnedRows ?? null,
        totalMatchedRows: queryResult.totalMatchedRows ?? null,
        selectedColumns,
        rows,
        resultDigest: buildDataQueryResultDigest(rows, selectedColumns),
        truncated: queryResult.truncated === true,
    });
};

const createActionSpec = ({
    bridge,
    executeAction,
    manifest,
}: {
    bridge: AgrunActionExecutionBridge;
    executeAction: AgrunAppActionExecutor;
    manifest: ToolManifest;
}): AgrunActionSpec => ({
    // OpenAI native tool names reject dots. Keep the app manifest name as
    // the execution SSOT and expose only a transport-safe Agrun alias.
    name: toAgrunActionName(manifest.name),
    description: manifest.description,
    planner: {
        argsSchema: mapManifestSchemaToAgrunArgs(manifest),
        argsExample: {},
        guidance: buildPlannerGuidance(manifest),
    },
    tier: mapManifestRiskToAgrunTier(manifest),
    permission: buildAgrunPermission(manifest),
    outputSchema: {
        kinds: [AGRUN_APP_TOOL_RESULT_KIND],
        controls: ['continue'],
    },
    async execute(context, args) {
        const executionId = getExecutionId(context);
        const store = executionId ? bridge.resolve(executionId) : null;
        if (!store) {
            const message = 'The app execution context for this Agrun action is no longer available.';
            return {
                control: 'continue',
                summary: message,
                output: {
                    kind: AGRUN_APP_TOOL_RESULT_KIND,
                    ok: false,
                    status: 'failed',
                    toolName: manifest.name,
                    observation: {
                        status: 'error',
                        summary: message,
                        code: 'agrun_execution_context_missing',
                    },
                    retryHint: 'Start a new follow-up turn.',
                },
            };
        }

        const actionBudget = await bridge.consumeActionCall(executionId);
        if (!actionBudget.allowed) {
            const message = `The action budget of ${actionBudget.limit} calls for this follow-up has been exhausted. Use the available evidence to provide a partial answer or explain what remains unverified.`;
            return {
                control: 'continue',
                summary: message,
                output: {
                    kind: AGRUN_APP_TOOL_RESULT_KIND,
                    ok: false,
                    status: 'blocked',
                    toolName: manifest.name,
                    observation: {
                        status: 'blocked',
                        summary: message,
                        code: 'agrun_action_budget_exhausted',
                    },
                    retryHint: null,
                },
            };
        }

        const mutatesState = manifest.capabilities?.mutatesState === true;
        if (mutatesState) {
            // A crash checkpoint captured before an approved mutation must not
            // replay that mutation after refresh. Invalidation is awaited and
            // failure blocks execution rather than risking duplicate writes.
            await bridge.beforeMutation(executionId);
        }
        const actionRollbackSnapshot = mutatesState
            ? captureRuntimeMutationRollbackSnapshot(store)
            : null;
        if (actionRollbackSnapshot) {
            bridge.captureMutationSnapshot(executionId, actionRollbackSnapshot);
        }

        let result: ToolExecutionResult;
        try {
            result = await executeAction({
                type: 'tool_call',
                thought: `Agent Runtime JavaScript selected the ${mutatesState ? 'approval-gated mutation' : 'read-only'} ${manifest.name} action.`,
                toolName: manifest.name,
                args: normalizeAgrunActionArgs(manifest, args),
            }, store, {
                toolStage: 'analysis',
                abortSignal: context.request?.signal,
                requireRowDeleteConfirmation: true,
            });
        } catch (error) {
            if (actionRollbackSnapshot) {
                restoreRuntimeMutationRollbackSnapshot(store, actionRollbackSnapshot);
            }
            throw error;
        }
        if (actionRollbackSnapshot && result.status !== 'success') {
            restoreRuntimeMutationRollbackSnapshot(store, actionRollbackSnapshot);
        }
        const status = mapToolResultStatus(result);
        const evidence = buildAgrunActionEvidence(manifest, result, store);

        return {
            control: 'continue',
            summary: truncateText(result.message),
            output: {
                kind: AGRUN_APP_TOOL_RESULT_KIND,
                ok: status === 'success',
                status,
                toolName: manifest.name,
                ...(evidence ? { evidence } : {}),
                observation: boundAgrunValueForHost(result.observation ?? {
                    status: result.status,
                    summary: result.message,
                }),
                artifacts: boundAgrunValueForHost(result.artifacts),
                retryHint: result.retryHint
                    ? truncateText(result.retryHint)
                    : null,
            },
        };
    },
});

export const createAgrunReadOnlyActions = ({
    bridge,
    executeAction = handleAiAction,
    module,
}: {
    bridge: AgrunActionExecutionBridge;
    executeAction?: AgrunAppActionExecutor;
    module: AgrunModule;
}): unknown[] =>
    getAgrunReadOnlyCanaryManifests().map(manifest =>
        module.defineAction(createActionSpec({
            bridge,
            executeAction,
            manifest,
        })));

export const createAgrunActions = ({
    bridge,
    executeAction = handleAiAction,
    module,
}: {
    bridge: AgrunActionExecutionBridge;
    executeAction?: AgrunAppActionExecutor;
    module: AgrunModule;
}): unknown[] =>
    getAgrunCanaryManifests().map(manifest =>
        module.defineAction(createActionSpec({
            bridge,
            executeAction,
            manifest,
        })));
