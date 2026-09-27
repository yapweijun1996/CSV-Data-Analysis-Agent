import { AiAction, AnalysisPlan, AgentPhase, ClarificationRequest, SqlAnalysisPlan, ToolExecutionResult, ToolName, ToolRegistryError, WorkspaceActionHistoryEntry } from '../../types';
import { getResolvedToolRegistry, validateAction } from '../ai/toolValidator';
import { handleChatAction } from './chatAgent';
import { handleExecutorAction, executePlanAction, isSqlAnalysisPlanLike } from './execution/executorAgent';
import { adaptCreatePlanFromContext } from './execution/createPlanAdapter';
import { validateCreatePlanPreflight } from './execution/createPlanPreflight';
import { buildCreatePlanExecutionResult } from './execution/createPlanExecutionResult';
import { isPlanExecutionSoftError } from './execution/planExecutionErrors';
import { preparePlan, isSqlAutoAnalysisError } from './planning/planGenerator';
import { mapSqlAnalysisPlanToAnalysisPlan } from './execution/sqlCardExecutor';
import { recordMonitorEvent } from './monitoring/monitorAgent';
import { StoreApi } from './types';
import { emitAgentEvent } from './monitoring/agentMonitor';
import { appendCleaningRunStep, updateCleaningRun } from './cleaningRunState';
import { sanitizeToolLogDetail } from './toolLogSanitizer';
import { buildToolAvailabilityContext } from './tools/toolGovernance';
import { normalizeQueryWhereClauseLike } from './execution/dataOperationNormalization';
import { isDestructiveRowDeleteAction } from './execution/destructiveRowDelete';
import { getDataQueryRepairGuidance } from './execution/dataQueryContract';
import { getDataMutateRepairGuidance } from './execution/dataMutateContract';
import { normalizeDataMutatePayload } from './execution/dataOperationRunner';
import { getPivotMatrixRepairGuidance } from './tools/pivotMatrixSupport';
import { normalizeClarificationRequest } from './runtime/runtimeClarification';
import { isRuntimeAbortError, throwIfAborted } from './runtime/runtimeAbort';
import { buildValidationRequestFingerprint, resolveSingleRequestedValidationMetric } from './runtime/runtimeEvidencePolicy';
import { WORKSPACE_HISTORY_LIMIT } from './workspaceFileUtils';

const LOG_PREFIX = '[ActionHandler]';
type ActionExecutionOptions = {
    toolStage?: 'cleaning' | 'analysis' | 'debug';
    dataMutatePolicy?: 'quality_repair_fill_missing_only';
    spreadsheetFilterOrigin?: 'chat' | 'spreadsheet_panel';
    deferAssistantMessageAppend?: boolean;
    deferSuccessMonitor?: boolean;
    requireRowDeleteConfirmation?: boolean;
    allowOverrides?: ToolName[];
    denyOverrides?: ToolName[];
    abortSignal?: AbortSignal;
};

const getActionLabel = (action: AiAction) => action.type === 'assistant_message'
    ? 'assistant_message'
    : (typeof action.toolName === 'string' && action.toolName.trim() ? action.toolName : 'unknown_tool');

const BLOCKED_VALIDATION_ERROR_CODES = new Set<ToolRegistryError['code']>([
    'blocked_tool',
    'tool_unavailable',
    'malformed_tool_payload',
    'invalid_args',
]);

const isBlockedValidationError = (error?: ToolRegistryError | null) =>
    Boolean(error && BLOCKED_VALIDATION_ERROR_CODES.has(error.code));

const isMissingThoughtValidationError = (error?: ToolRegistryError | null, message?: string) =>
    error?.code === 'invalid_action'
    && Boolean(message?.includes("Every action must include a non-empty 'thought'."));

const getValidationObservationCode = (error?: ToolRegistryError | null) =>
    error?.code === 'blocked_tool'
        ? 'blocked_tool'
        : error?.code === 'tool_unavailable'
            ? 'tool_unavailable'
            : error?.code === 'malformed_tool_payload' || error?.code === 'invalid_args' || error?.code === 'invalid_action'
                ? 'validation_failed'
                : undefined;

const getWorkspaceRuleViolation = (error?: ToolRegistryError | null): {
    normalizedPath: string;
    matchedPrefix: string;
} | null => {
    const normalizedPath = typeof error?.detail?.normalizedPath === 'string' ? error.detail.normalizedPath : null;
    const matchedPrefix = typeof error?.detail?.matchedPrefix === 'string' ? error.detail.matchedPrefix : null;
    if (error?.detail?.source !== 'workspace_rule' || !normalizedPath || !matchedPrefix) {
        return null;
    }
    return { normalizedPath, matchedPrefix };
};

const getExecutionMonitorStage = (result: ToolExecutionResult) =>
    result.status === 'blocked' ? 'executor_blocked' : 'executor_error';

const recordSuccessMonitor = (store: StoreApi, action: AiAction, options?: ActionExecutionOptions) => {
    if (options?.deferSuccessMonitor) {
        return;
    }
    recordMonitorEvent(store, { stage: 'executor_success', action, phase: mapToolNameToPhase(getActionLabel(action)) });
};

const getCleaningStepKind = (action: AiAction): 'inspect' | 'edit' | 'verify' | 'commit' => {
    if (action.type === 'assistant_message') return 'commit';
    if (['workspace.write', 'workspace.replace', 'workspace.append', 'data.mutate'].includes(action.toolName)) return 'edit';
    if (action.toolName === 'data.query') return 'verify';
    return 'inspect';
};

const describeToolAction = (action: AiAction): { description: string; detail?: Record<string, any> } | null => {
    if (action.type === 'assistant_message') {
        return {
            description: 'Assistant message emitted',
            detail: action.cardId ? { cardId: action.cardId } : undefined,
        };
    }

    switch (action.toolName) {
        case 'analysis.create_plan':
            return {
                description: `Created plan "${action.args?.plan?.title || 'Untitled Plan'}"`,
                detail: action.args,
            };
        case 'card.aggregate_table':
            return {
                description: `Quick aggregate${action.args?.cardId ? ` from card ${action.args.cardId}` : ''}`,
                detail: action.args,
            };
        case 'card.add_calculated_column':
            return {
                description: `Added calculated column "${action.args?.newColumnName}"`,
                detail: action.args,
            };
        case 'card.delete':
            return {
                description: `Deleted card "${action.args?.cardId}"`,
                detail: action.args,
            };
        case 'data.mutate':
            return {
                description: `Executed dataset transform: ${action.args?.explanation || 'Deterministic operations'}`,
                detail: action.args,
            };
        case 'data.query':
            return {
                description: `Executed read-only data query: ${action.args?.explanation || 'Bounded query'}`,
                detail: action.args,
            };
        case 'spreadsheet.filter':
            return {
                description: `Filtered raw data with query: "${action.args?.query || ''}"`,
                detail: action.args,
            };
        case 'analysis.correlation':
            return {
                description: `Statistical analysis (${action.args?.analysisType || 'correlation'})`,
                detail: action.args,
            };
        case 'analysis.pivot_matrix':
            return {
                description: `Created pivot matrix for ${Array.isArray(action.args?.rows) ? action.args.rows.join(', ') : 'selected dimensions'}`,
                detail: action.args,
            };
        case 'analysis.period_compare':
            return {
                description: `Compared ${action.args?.aggregate || 'metric'} across periods using ${action.args?.dateColumn}`,
                detail: action.args,
            };
        case 'analysis.cohort_retention':
            return {
                description: `Ran cohort analysis for ${action.args?.metricName || 'retention'}`,
                detail: action.args,
            };
        case 'analysis.root_cause_breakdown':
            return {
                description: `Diagnosed change drivers across ${Array.isArray(action.args?.dimensionColumns) ? action.args.dimensionColumns.join(', ') : 'selected dimensions'}`,
                detail: action.args,
            };
        case 'analysis.validate_metric_mapping':
            return {
                description: `Validated business metric mapping for "${action.args?.metricName}"`,
                detail: action.args,
            };
        case 'card.review':
            return { description: 'Initiated AI review of analysis cards', detail: action.args };
        case 'conversation.request_clarification':
            return {
                description: `Requested clarification: ${action.args?.question || 'unspecified question'}`,
                detail: action.args,
            };
        default:
            return {
                description: `Executed tool ${action.toolName}`,
                detail: action.args,
            };
    }
};

const mapToolNameToPhase = (toolName: ToolName | 'assistant_message' | 'unknown_tool'): AgentPhase => {
    if (toolName === 'assistant_message') return 'chat';
    if (toolName === 'unknown_tool') return 'chat';
    if (toolName.startsWith('analysis.')) return 'planning';
    if (toolName.startsWith('data.') || toolName.startsWith('workspace.') || toolName.startsWith('card.')) return 'execution';
    return 'chat';
};

const buildValidationContext = (store: StoreApi, options?: ActionExecutionOptions) =>
    buildToolAvailabilityContext(store.getState(), {
        toolStage: options?.toolStage,
        allowOverrides: options?.allowOverrides,
        denyOverrides: options?.denyOverrides,
    });

const stringifySpreadsheetFilterValue = (value: unknown): string => {
    if (Array.isArray(value)) {
        return value.map(item => stringifySpreadsheetFilterValue(item)).filter(Boolean).join(', ');
    }
    if (value === null || value === undefined) {
        return '';
    }
    const text = String(value).trim();
    return /\s/.test(text) ? `'${text}'` : text;
};

const inferMetricValidationArgs = (
    store: StoreApi,
    action: AiAction,
): { metricName: string; validationKind: 'base' | 'derived' } | null => {
    if (action.type !== 'tool_call' || action.toolName !== 'analysis.validate_metric_mapping') {
        return null;
    }

    const currentMetricName = typeof action.args?.metricName === 'string'
        ? action.args.metricName.trim().toLowerCase()
        : '';
    const currentValidationKind = typeof action.args?.validationKind === 'string'
        ? action.args.validationKind.trim().toLowerCase()
        : '';
    if (currentMetricName && (currentValidationKind === 'base' || currentValidationKind === 'derived')) {
        return null;
    }

    const state = store.getState();
    const sources = [
        String(action.thought ?? ''),
        String(state.activeTurn?.userMessage ?? ''),
    ];
    for (const source of sources) {
        const inferred = resolveSingleRequestedValidationMetric(source);
        if (inferred) {
            return inferred;
        }
    }
    const resumeOriginalUserMessage = state.pendingClarification?.resumeContext?.resumeOriginalUserMessage?.trim();
    const resumeTargetRunId = state.pendingClarification?.resumeContext?.resumeTargetRunId?.trim();
    const activeArtifact = state.activeMetricMappingValidation;
    if (resumeOriginalUserMessage && resumeTargetRunId && activeArtifact?.requestFingerprint) {
        const resumeFingerprint = buildValidationRequestFingerprint(resumeOriginalUserMessage, state);
        if (
            activeArtifact.originRunId === resumeTargetRunId
            && activeArtifact.requestFingerprint === resumeFingerprint
            && activeArtifact.metricName
            && activeArtifact.validationKind
        ) {
            return {
                metricName: activeArtifact.metricName,
                validationKind: activeArtifact.validationKind,
            };
        }
    }
    return null;
};

const normalizeToolActionPayload = (action: AiAction, store: StoreApi): AiAction => {
    if (action.type !== 'tool_call') {
        return action;
    }

    if (action.toolName === 'conversation.request_clarification') {
        const rawArgs = action.args && typeof action.args === 'object' ? action.args as Partial<ClarificationRequest> & Record<string, unknown> : {};
        const thoughtFallback = typeof action.thought === 'string' && /[?？]$/.test(action.thought.trim())
            ? action.thought.trim()
            : '';

        return {
            ...action,
            args: normalizeClarificationRequest(rawArgs, [
                rawArgs.question,
                rawArgs.message,
                rawArgs.text,
                thoughtFallback,
            ]),
        };
    }

    if (action.toolName === 'analysis.validate_metric_mapping') {
        const inferredArgs = inferMetricValidationArgs(store, action);
        if (!inferredArgs) {
            return action;
        }

        return {
            ...action,
            args: {
                ...(action.args ?? {}),
                metricName: inferredArgs.metricName,
                validationKind: inferredArgs.validationKind,
            },
        };
    }

    if (action.toolName !== 'spreadsheet.filter') {
        return action;
    }
    if (typeof action.args?.query === 'string' && action.args.query.trim()) {
        return action;
    }

    const normalizedWhere = normalizeQueryWhereClauseLike(action.args?.filter ?? action.args?.filters ?? action.args?.where);
    if (!normalizedWhere?.predicates?.length) {
        return action;
    }

    const query = normalizedWhere.predicates
        .map(predicate => {
            const operator = predicate.operator === 'eq' ? '=' : predicate.operator;
            const value = predicate.operator === 'is_null' || predicate.operator === 'not_null'
                ? ''
                : ` ${stringifySpreadsheetFilterValue(predicate.value)}`;
            return `${predicate.column} ${operator}${value}`.trim();
        })
        .join(' AND ');

    if (!query) {
        return action;
    }

    return {
        ...action,
        args: {
            ...(action.args ?? {}),
            query,
        },
    };
};

const logToolUsage = (action: AiAction, store: StoreApi, options?: ActionExecutionOptions) => {
    const logger = store.getState().logAgentToolUsage;
    if (typeof logger !== 'function') return;

    const summary = describeToolAction(action);
    if (!summary) return;

    if (action.type === 'assistant_message') {
        logger({
            tool: 'assistant_message',
            description: summary.description,
            detail: summary.detail,
        });
        return;
    }

    const registry = getResolvedToolRegistry(buildValidationContext(store, options));
    const descriptor = registry.descriptorMap.get(action.toolName);
    const decision = registry.decisions[action.toolName];
    logger({
        tool: action.toolName,
        description: summary.description,
        stage: decision?.stage,
        category: descriptor?.category ?? 'unknown',
        risk: descriptor?.risk ?? 'unknown',
        policyDecision: decision?.allowed === false ? 'blocked' : 'allowed',
        policyReason: decision?.reason ?? null,
        detail: {
            ...sanitizeToolLogDetail(action.toolName, summary.detail),
            risk: descriptor?.risk ?? 'unknown',
            category: descriptor?.category ?? 'unknown',
            stage: decision?.stage ?? registry.stage,
            policyDecision: decision?.allowed === false ? 'blocked' : 'allowed',
            policyReason: decision?.reason ?? null,
        },
    });
};

const appendBlockedWorkspaceHistory = (params: {
    action: AiAction;
    store: StoreApi;
    stage: 'cleaning' | 'analysis' | 'debug';
    category: WorkspaceActionHistoryEntry['toolCategory'];
    reason: string;
    normalizedPath: string;
}) => {
    if (params.action.type !== 'tool_call' || !params.action.toolName.startsWith('workspace.')) {
        return;
    }

    const current = params.store.getState().workspaceActionHistory ?? [];
    const blockedEntry: WorkspaceActionHistoryEntry = {
        timestamp: new Date(),
        operation: params.action.toolName.replace('workspace.', '') as WorkspaceActionHistoryEntry['operation'],
        path: params.normalizedPath,
        success: false,
        message: params.reason,
        durationMs: 0,
        stage: params.stage,
        toolCategory: params.category,
        policyDecision: 'blocked',
        policyReason: params.reason,
    };

    params.store.setState({
        workspaceActionHistory: [...current, blockedEntry].slice(-WORKSPACE_HISTORY_LIMIT),
    });
};

const validateRestrictedDataMutateAction = (
    action: AiAction,
    policy: NonNullable<ActionExecutionOptions['dataMutatePolicy']>,
): ToolExecutionResult | null => {
    if (action.type !== 'tool_call' || action.toolName !== 'data.mutate') {
        return null;
    }

    if (policy !== 'quality_repair_fill_missing_only') {
        return null;
    }

    const normalizedPayload = normalizeDataMutatePayload({
        explanation: action.args?.explanation,
        operations: Array.isArray(action.args?.operations)
            ? action.args.operations
            : (action.args && 'operation' in action.args && action.args.operation !== undefined ? [action.args.operation] : undefined),
        outputColumns: action.args?.outputColumns,
        planStatus: 'operations',
        consistencyIssues: [],
    });
    const normalizedPlan = normalizedPayload.plan;

    const buildBlockedResult = (message: string, retryHint: string): ToolExecutionResult => ({
        status: 'blocked',
        toolName: 'data.mutate',
        message,
        shouldStop: false,
        retryHint,
        observation: {
            type: 'tool_result',
            status: 'blocked',
            summary: message,
            toolName: 'data.mutate',
            code: 'tool_contract',
            retryHint,
        },
    });

    if (!normalizedPlan || normalizedPayload.rawOperationCount !== normalizedPlan.operations.length) {
        return buildBlockedResult(
            'Analysis-stage quality repair rejected a malformed data.mutate payload.',
            'Return exactly one valid fill_missing operation with a constant replacement value.',
        );
    }

    if (normalizedPlan.operations.length !== 1) {
        return buildBlockedResult(
            'Analysis-stage quality repair only allows one conservative fill_missing operation per proposal.',
            'Return exactly one fill_missing operation. Do not batch multiple edits.',
        );
    }

    const operation = normalizedPlan.operations[0];
    if (operation.type !== 'fill_missing') {
        return buildBlockedResult(
            `Analysis-stage quality repair blocked unsupported mutation "${operation.type}".`,
            'Only fill_missing with a constant replacement value is allowed during pre-analysis quality repair.',
        );
    }

    if (operation.strategy !== 'constant') {
        return buildBlockedResult(
            'Analysis-stage quality repair only allows fill_missing with strategy="constant".',
            'Return fill_missing with strategy "constant" and a concrete replacement value.',
        );
    }

    if (operation.value === undefined || operation.value === null) {
        return buildBlockedResult(
            'Analysis-stage quality repair requires a concrete replacement value.',
            'Return fill_missing with a non-null constant replacement value.',
        );
    }

    return null;
};

export const handleAiAction = async (
    action: AiAction,
    store: StoreApi,
    options?: ActionExecutionOptions,
): Promise<ToolExecutionResult> => {
    const { setState } = store;
    throwIfAborted(options?.abortSignal);
    const normalizedAction = normalizeToolActionPayload(action, store);
    const actionLabel = getActionLabel(normalizedAction);
    const actionPhase = mapToolNameToPhase(actionLabel);
    console.log(`${LOG_PREFIX} Handling action: ${actionLabel}`);
    recordMonitorEvent(store, { stage: 'received', action: normalizedAction, phase: actionPhase });

    if (normalizedAction.type !== 'assistant_message' && actionLabel === 'unknown_tool') {
        const detail = 'Ignored malformed tool_call with missing toolName.';
        recordMonitorEvent(store, { stage: 'executor_error', action: normalizedAction, detail, isError: true, phase: actionPhase });
        return {
            status: 'error',
            toolName: 'assistant_message',
            message: detail,
            shouldStop: false,
            retryHint: 'Return a valid registered tool name.',
            observation: {
                type: 'runtime_error',
                status: 'error',
                summary: detail,
                toolName: 'assistant_message',
                retryHint: 'Return a valid registered tool name.',
            },
        };
    }

    if (options?.requireRowDeleteConfirmation && isDestructiveRowDeleteAction(normalizedAction)) {
        const detail = 'Permanent row deletion from chat requires preflight confirmation before executing data.mutate.';
        recordMonitorEvent(store, { stage: 'executor_blocked', action: normalizedAction, detail, phase: actionPhase });
        return {
            status: 'blocked',
            toolName: 'data.mutate',
            message: detail,
            shouldStop: false,
            retryHint: 'Use the row-delete preflight confirmation flow first. Do not execute permanent row deletion directly from chat.',
            observation: {
                type: 'tool_result',
                status: 'blocked',
                summary: detail,
                toolName: 'data.mutate',
                retryHint: 'Use the row-delete preflight confirmation flow first. Do not execute permanent row deletion directly from chat.',
            },
        };
    }

    throwIfAborted(options?.abortSignal);
    if (normalizedAction.thought) {
        setState(prev => ({
            cleaningRun: prev.cleaningRun
                ? appendCleaningRunStep(prev.cleaningRun, {
                    kind: getCleaningStepKind(normalizedAction),
                    thought: normalizedAction.thought,
                    toolName: normalizedAction.type === 'tool_call' ? normalizedAction.toolName : 'assistant_message',
                    status: 'in_progress',
                })
                : prev.cleaningRun,
        }));
        emitAgentEvent(store, {
            phase: mapToolNameToPhase(actionLabel),
            step: 'thought',
            status: 'in_progress',
            message: normalizedAction.thought,
            detail: { action: actionLabel },
        });
    }

    const validationContext = buildValidationContext(store, options);
    const registry = getResolvedToolRegistry(validationContext);
    const validation = validateAction(normalizedAction, validationContext, registry);
    if (!validation.isValid) {
        const decision = normalizedAction.type === 'tool_call' ? registry.decisions[normalizedAction.toolName] : undefined;
        const descriptor = normalizedAction.type === 'tool_call' ? registry.descriptorMap.get(normalizedAction.toolName) : undefined;
        const workspaceRuleViolation = getWorkspaceRuleViolation(validation.error);
        const isValidationBlocked = isBlockedValidationError(validation.error)
            || isMissingThoughtValidationError(validation.error, validation.errors)
            || Boolean(decision && !decision.allowed);
        const dataQueryRepairGuidance = normalizedAction.type === 'tool_call'
            && normalizedAction.toolName === 'data.query'
            && validation.error?.code === 'malformed_tool_payload'
            ? getDataQueryRepairGuidance(validation.errors, {
                availableColumns: store.getState().columnProfiles?.map(p => p.name),
            })
            : null;
        const dataMutateRepairGuidance = normalizedAction.type === 'tool_call'
            && normalizedAction.toolName === 'data.mutate'
            && validation.error?.code === 'malformed_tool_payload'
            ? getDataMutateRepairGuidance(validation.errors)
            : null;
        const pivotMatrixRepairGuidance = normalizedAction.type === 'tool_call'
            && normalizedAction.toolName === 'analysis.pivot_matrix'
            && validation.error?.code === 'malformed_tool_payload'
            ? getPivotMatrixRepairGuidance(validation.errors)
            : null;
        const validationRepairGuidance = dataQueryRepairGuidance ?? dataMutateRepairGuidance ?? pivotMatrixRepairGuidance;
        const validationRetryHint = validationRepairGuidance?.repairHint ?? validation.errors;
        const validationDetail = validation.error
            ? {
                error: validation.error,
                ...(validationRepairGuidance
                    ? {
                        repairHint: validationRepairGuidance.repairHint,
                        repairHintCategory: validationRepairGuidance.repairHintCategory,
                        repairHintCategories: validationRepairGuidance.repairHintCategories,
                    }
                    : {}),
            }
            : undefined;
        recordMonitorEvent(store, {
            stage: isValidationBlocked ? 'executor_blocked' : 'executor_error',
            action: normalizedAction,
            isError: !isValidationBlocked,
            detail: validation.errors,
            phase: actionPhase,
        });
        if (workspaceRuleViolation && normalizedAction.type === 'tool_call') {
            appendBlockedWorkspaceHistory({
                action: normalizedAction,
                store,
                stage: decision?.stage ?? registry.stage,
                category: descriptor?.category ?? 'unknown',
                reason: validation.errors,
                normalizedPath: workspaceRuleViolation.normalizedPath,
            });
        }
        store.getState().logAgentToolUsage({
            tool: 'tool_registry',
            description: `Blocked action ${actionLabel}`,
            stage: decision?.stage ?? registry.stage,
            category: decision?.category ?? 'unknown',
            risk: decision?.risk ?? 'unknown',
            policyDecision: 'blocked',
            policyReason: decision?.reason ?? validation.errors,
            detail: validation.error
                ? {
                    error: validation.error,
                    action: actionLabel,
                    allowedTools: registry.allowedToolNames,
                    blockedTools: registry.blockedTools.map(entry => ({
                        toolName: entry.toolName,
                        source: entry.source,
                        reason: entry.reason,
                        overrideOrigin: entry.overrideOrigin,
                    })),
                    stage: registry.stage,
                }
                : {
                    message: validation.errors,
                    action: actionLabel,
                    stage: registry.stage,
                },
        });
        if (decision?.source === 'deny_override') {
            console.log('[ChatDebug] Runtime tool override blocked action.', {
                action: actionLabel,
                toolName: normalizedAction.type === 'tool_call' ? normalizedAction.toolName : 'assistant_message',
                overrideOrigin: decision.overrideOrigin ?? null,
                allowedTools: registry.allowedToolNames,
                blockedTools: registry.blockedTools.map(entry => ({
                    toolName: entry.toolName,
                    source: entry.source,
                    overrideOrigin: entry.overrideOrigin ?? null,
                })),
            });
        }
        return {
            status: isValidationBlocked ? 'blocked' : 'error',
            toolName: normalizedAction.type === 'tool_call' ? normalizedAction.toolName : 'assistant_message',
            message: validation.errors,
            shouldStop: false,
            diagnostics: validation.error ? [validation.error] : undefined,
            policyDecision: decision && !decision.allowed ? decision : undefined,
            retryHint: validationRetryHint,
            observation: {
                type: 'tool_result',
                status: isValidationBlocked ? 'blocked' : 'error',
                summary: validation.errors,
                toolName: normalizedAction.type === 'tool_call' ? normalizedAction.toolName : 'assistant_message',
                code: getValidationObservationCode(validation.error),
                retryHint: validationRetryHint,
                detail: validationDetail,
            },
        };
    }
    recordMonitorEvent(store, { stage: 'validated', action: normalizedAction, phase: actionPhase });
    logToolUsage(normalizedAction, store, options);

    if (options?.dataMutatePolicy) {
        const policyViolation = validateRestrictedDataMutateAction(normalizedAction, options.dataMutatePolicy);
        if (policyViolation) {
            recordMonitorEvent(store, {
                stage: 'executor_blocked',
                action: normalizedAction,
                detail: policyViolation.message,
                phase: actionPhase,
            });
            return policyViolation;
        }
    }

    if (normalizedAction.type === 'assistant_message') {
        recordMonitorEvent(store, { stage: 'chat', action: normalizedAction, phase: actionPhase });
        if (!options?.deferAssistantMessageAppend) {
            handleChatAction(normalizedAction, store);
        }
        if (store.getState().cleaningRun) {
            store.setState(prev => ({
                cleaningRun: updateCleaningRun(prev.cleaningRun, {
                    status: prev.cleaningRun?.status ?? 'running',
                }),
            }));
        }
        recordSuccessMonitor(store, normalizedAction, options);
        return {
            status: 'success',
            toolName: 'assistant_message',
            message: options?.deferAssistantMessageAppend ? 'Assistant message prepared.' : 'Assistant message appended.',
            shouldStop: false,
            observation: {
                type: 'assistant_message',
                status: 'success',
                summary: normalizedAction.message,
                toolName: 'assistant_message',
                detail: {
                    message: normalizedAction.message,
                    deferred: Boolean(options?.deferAssistantMessageAppend),
                },
            },
        };
    }

    try {
        if (normalizedAction.toolName === 'analysis.create_plan' && normalizedAction.args?.plan) {
            throwIfAborted(options?.abortSignal);
            recordMonitorEvent(store, { stage: 'planner_start', action: normalizedAction, phase: actionPhase });
            const rawPlan = normalizedAction.args.plan as AnalysisPlan | SqlAnalysisPlan;
            const preflightResult = validateCreatePlanPreflight({
                plan: rawPlan,
                state: store.getState(),
            });
            if (preflightResult) {
                recordMonitorEvent(store, {
                    stage: 'executor_blocked',
                    action: normalizedAction,
                    detail: preflightResult.message,
                    phase: actionPhase,
                });
                return preflightResult;
            }
            const adaptedPlan = adaptCreatePlanFromContext(rawPlan as unknown as Record<string, unknown>, store.getState());
            const normalizedPlan = isSqlAnalysisPlanLike(adaptedPlan)
                ? adaptedPlan
                : preparePlan(adaptedPlan as AnalysisPlan);
            recordMonitorEvent(store, { stage: 'planner_ready', action: normalizedAction, phase: actionPhase });
            recordMonitorEvent(store, { stage: 'executor_start', action: normalizedAction, phase: actionPhase });
            const uiPlan = isSqlAnalysisPlanLike(normalizedPlan)
                ? mapSqlAnalysisPlanToAnalysisPlan(normalizedPlan)
                : normalizedPlan;
            let result: ToolExecutionResult;
            try {
                const createdCard = await executePlanAction(normalizedPlan, store, { throwOnSoftFailure: true });
                result = buildCreatePlanExecutionResult(uiPlan, createdCard);
            } catch (error) {
                if (isRuntimeAbortError(error, options?.abortSignal)) {
                    throw error;
                }
                if (isSqlAutoAnalysisError(error) || isPlanExecutionSoftError(error)) {
                    const failureCode = error.code === 'empty_result'
                        || error.code === 'no_card_created'
                        || error.code === 'duckdb_unavailable'
                        ? error.code
                        : undefined;
                    result = buildCreatePlanExecutionResult(uiPlan, null, {
                        code: failureCode,
                        message: error.message,
                        detail: error.detail,
                    });
                } else {
                    throw error;
                }
            }
            if (result.status === 'success') {
                recordSuccessMonitor(store, normalizedAction, options);
            } else {
                recordMonitorEvent(store, {
                    stage: getExecutionMonitorStage(result),
                    action: normalizedAction,
                    detail: result.message,
                    isError: result.status !== 'blocked',
                    phase: actionPhase,
                });
            }
            return result;
        }

        recordMonitorEvent(store, { stage: 'executor_start', action: normalizedAction, phase: actionPhase });
        throwIfAborted(options?.abortSignal);
        const result = await handleExecutorAction(normalizedAction, store, options);
        if (result.status === 'success') {
            recordSuccessMonitor(store, normalizedAction, options);
        } else {
            recordMonitorEvent(store, {
                stage: getExecutionMonitorStage(result),
                action: normalizedAction,
                detail: result.message,
                isError: result.status !== 'blocked',
                phase: actionPhase,
            });
        }
        return result;
    } catch (error) {
        if (isRuntimeAbortError(error, options?.abortSignal)) {
            throw error;
        }
        const detail = error instanceof Error ? error.message : String(error);
        const descriptor = registry.descriptorMap.get(normalizedAction.toolName);
        const decision = registry.decisions[normalizedAction.toolName];
        recordMonitorEvent(store, { stage: 'executor_error', action: normalizedAction, detail, isError: true, phase: actionPhase });
        store.getState().logAgentToolUsage({
            tool: normalizedAction.toolName,
            description: `Execution failed for ${normalizedAction.toolName}`,
            stage: decision?.stage ?? registry.stage,
            category: descriptor?.category ?? 'unknown',
            risk: descriptor?.risk ?? 'unknown',
            policyDecision: decision?.allowed === false ? 'blocked' : 'allowed',
            policyReason: decision?.reason ?? detail,
            detail: {
                error: detail,
                risk: descriptor?.risk ?? 'unknown',
                category: descriptor?.category ?? 'unknown',
                stage: decision?.stage ?? registry.stage,
                policyDecision: decision?.allowed === false ? 'blocked' : 'allowed',
                policyReason: decision?.reason ?? null,
            },
        });
        return {
            status: 'error',
            toolName: normalizedAction.toolName,
            message: detail,
            shouldStop: false,
            policyDecision: decision,
            retryHint: detail,
            observation: {
                type: 'tool_result',
                status: 'error',
                summary: detail,
                toolName: normalizedAction.toolName,
                retryHint: detail,
            },
        };
    }
};
