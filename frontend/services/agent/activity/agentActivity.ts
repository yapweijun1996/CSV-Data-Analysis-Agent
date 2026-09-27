import type {
    AgentActivityDescriptor,
    AgentActivityKind,
    AgentActivityLifecycle,
    AgentActivitySource,
    AgentEvent,
    AgentRuntimeEvent,
    AgentToolLogEntry,
} from '../../../types';

const TERMINAL_LIFECYCLES = new Set<AgentActivityLifecycle>([
    'failed',
    'cancelled',
    'completed',
]);

const DEGRADED_RUNTIME_TYPES = new Set<AgentRuntimeEvent['type']>([
    'retry_scheduled',
    'decision_rejected',
    'repetition_detected',
    'tool_degraded',
    'evaluator_degraded',
    'provider_timeout',
    'harness_degraded',
    'quality_repair_contract_rejected',
    'analysis_yield_low',
    'reshape_before_analysis_failed',
    'decide_harness_warn',
    'contract_downgrade',
    'fallback_model_used',
]);

const TOOL_RUNTIME_TYPES = new Set<AgentRuntimeEvent['type']>([
    'decision_received',
    'action_executed',
    'observation_recorded',
    'tool_recovered',
    'tool_degraded',
    'action_execution_error',
]);

const RESEARCH_RUNTIME_TYPES = new Set<AgentRuntimeEvent['type']>([
    'capability_selected',
    'evaluation_started',
    'evaluation_completed',
    'analysis_yield_low',
    'reshape_before_analysis',
    'reshape_before_analysis_succeeded',
    'reshape_before_analysis_failed',
    'context_refreshed_after_quality_repair',
    'context_refreshed_after_reshape',
    'presentation_self_corrected',
    'answerability_override',
]);

const humanize = (value: string): string =>
    value
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, character => character.toUpperCase());

const ACTIVITY_KINDS = new Set<AgentActivityKind>([
    'intake',
    'preparation',
    'research',
    'follow_up',
    'tool',
    'approval',
    'artifact',
    'terminal',
]);

const readActivityKind = (value: unknown): AgentActivityKind | null =>
    typeof value === 'string'
    && ACTIVITY_KINDS.has(value as AgentActivityKind)
        ? value as AgentActivityKind
        : null;

const inferLegacyLifecycle = (status: AgentEvent['status']): AgentActivityLifecycle => {
    switch (status) {
        case 'pending':
            return 'queued';
        case 'in_progress':
            return 'running';
        case 'error':
            return 'failed';
        case 'done':
        default:
            return 'completed';
    }
};

const inferKindFromLegacyEvent = (event: Pick<AgentEvent, 'phase' | 'step' | 'message'>): AgentActivityKind => {
    const searchable = `${event.step} ${event.message}`.toLowerCase();
    if (/(approval|confirm|clarification|human review|permission)/.test(searchable)) {
        return 'approval';
    }
    if (/(artifact|analyst_report|report_generated|workspace)/.test(searchable)) {
        return 'artifact';
    }
    if (/(terminal|completed|cancelled|failed)$/.test(event.step.toLowerCase())) {
        return 'terminal';
    }
    if (/(tool|action|query|executor)/.test(searchable)) {
        return 'tool';
    }
    switch (event.phase) {
        case 'file':
            return 'intake';
        case 'profiling':
            return 'preparation';
        case 'topic_generation':
        case 'planning':
        case 'evaluation':
            return 'research';
        case 'chat':
            return 'follow_up';
        case 'execution':
        default:
            return 'tool';
    }
};

const inferSource = (kind: AgentActivityKind): AgentActivitySource => {
    if (kind === 'approval') return 'approval';
    if (kind === 'artifact') return 'artifact';
    if (kind === 'tool') return 'tool';
    return 'app';
};

export const buildAgentActivityDescriptor = (
    event: Pick<AgentEvent, 'phase' | 'step' | 'status' | 'message'> & {
        activity?: AgentActivityDescriptor;
    },
): AgentActivityDescriptor => {
    if (event.activity) {
        return {
            ...event.activity,
            explanation: event.activity.explanation?.trim() || undefined,
        };
    }
    const kind = inferKindFromLegacyEvent(event);
    return {
        kind,
        lifecycle: inferLegacyLifecycle(event.status),
        source: inferSource(kind),
        eventType: event.step,
        title: humanize(event.step),
    };
};

const normalizeActivityTimestamp = (timestamp: Date): Date => {
    const candidate = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return Number.isNaN(candidate.getTime()) ? new Date(0) : candidate;
};

export const normalizeAgentActivityEvent = (event: AgentEvent): AgentEvent => ({
    ...event,
    timestamp: normalizeActivityTimestamp(event.timestamp),
    activity: buildAgentActivityDescriptor(event),
});

const resolveRuntimeLifecycle = (event: AgentRuntimeEvent): AgentActivityLifecycle => {
    if (event.type === 'turn_queued') return 'queued';
    if (
        event.type === 'turn_blocked'
        || event.type === 'clarification_requested'
        || event.type === 'turn_cancellation_requested'
    ) {
        return 'waiting';
    }
    if (event.type === 'turn_completed' || event.type === 'session_early_stop') return 'completed';
    if (event.type === 'turn_cancelled') return 'cancelled';
    if (event.type === 'turn_failed') return 'failed';
    if (DEGRADED_RUNTIME_TYPES.has(event.type)) return 'degraded';
    return 'running';
};

const resolveRuntimeKind = (event: AgentRuntimeEvent): AgentActivityKind => {
    if (
        event.type === 'turn_completed'
        || event.type === 'turn_cancelled'
        || event.type === 'turn_failed'
        || event.type === 'session_early_stop'
    ) {
        return 'terminal';
    }
    if (event.type === 'turn_blocked' || event.type === 'clarification_requested') {
        return 'approval';
    }
    if (TOOL_RUNTIME_TYPES.has(event.type)) return 'tool';
    if (RESEARCH_RUNTIME_TYPES.has(event.type)) return 'research';
    return 'follow_up';
};

const legacyStatusForLifecycle = (lifecycle: AgentActivityLifecycle): AgentEvent['status'] => {
    if (lifecycle === 'queued' || lifecycle === 'waiting') return 'pending';
    if (lifecycle === 'running' || lifecycle === 'degraded') return 'in_progress';
    if (lifecycle === 'failed') return 'error';
    return 'done';
};

export const projectRuntimeEventToActivity = (event: AgentRuntimeEvent): AgentEvent => {
    const lifecycle = resolveRuntimeLifecycle(event);
    const kind = readActivityKind(event.detail?.activityKind)
        ?? resolveRuntimeKind(event);
    const activityTitle = typeof event.detail?.activityTitle === 'string'
        && event.detail.activityTitle.trim()
        ? event.detail.activityTitle.trim()
        : humanize(event.type);
    const activityExplanation = typeof event.detail?.activityExplanation === 'string'
        && event.detail.activityExplanation.trim()
        ? event.detail.activityExplanation.trim()
        : event.reason
            ? humanize(event.reason)
            : undefined;
    return {
        id: `activity:${event.id}`,
        timestamp: event.timestamp,
        sessionId: event.sessionId,
        runId: event.runId,
        turnId: event.turnId,
        stepId: event.stepId,
        toolCallId: event.toolCallId,
        phase: kind === 'research'
            ? 'evaluation'
            : kind === 'follow_up' || kind === 'approval' || kind === 'terminal'
                ? 'chat'
                : 'execution',
        step: event.type,
        status: legacyStatusForLifecycle(lifecycle),
        message: event.message,
        detail: event.detail,
        activity: {
            kind,
            lifecycle,
            source: kind === 'approval' ? 'approval' : 'runtime',
            eventType: event.type,
            title: activityTitle,
            explanation: activityExplanation,
        },
    };
};

export const projectToolLogToActivity = (entry: AgentToolLogEntry): AgentEvent => {
    const blocked = entry.policyDecision === 'blocked';
    return {
        id: `activity:${entry.id}`,
        timestamp: entry.timestamp,
        sessionId: entry.sessionId,
        datasetId: entry.datasetId,
        runId: entry.runId,
        turnId: entry.turnId,
        stepId: entry.stepId,
        toolCallId: entry.toolCallId,
        cleaningRunId: entry.cleaningRunId,
        requestId: entry.requestId,
        phase: 'execution',
        step: `tool_${entry.tool}`,
        status: blocked ? 'error' : 'done',
        message: entry.description,
        detail: entry.detail,
        activity: {
            kind: blocked ? 'approval' : 'tool',
            lifecycle: blocked ? 'waiting' : 'completed',
            source: blocked ? 'approval' : 'tool',
            eventType: `tool.${entry.tool}`,
            title: blocked ? `Tool Blocked: ${entry.tool}` : `Tool: ${entry.tool}`,
            explanation: entry.policyReason ?? undefined,
        },
    };
};

export const selectReportScopedActivity = (
    events: AgentEvent[],
    scope: { sessionId?: string | null; datasetId?: string | null } = {},
): AgentEvent[] => {
    const normalized = events.map(normalizeAgentActivityEvent);
    const hasSessionMatches = Boolean(
        scope.sessionId
        && normalized.some(event => event.sessionId === scope.sessionId),
    );
    const hasDatasetMatches = Boolean(
        scope.datasetId
        && normalized.some(event => event.datasetId === scope.datasetId),
    );
    return normalized
        .filter(event => {
            if (hasSessionMatches) return event.sessionId === scope.sessionId;
            if (hasDatasetMatches) return event.datasetId === scope.datasetId;
            if (scope.sessionId && event.sessionId) return false;
            if (scope.datasetId && event.datasetId) return false;
            return !scope.sessionId && !scope.datasetId;
        })
        .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
};

export const restoreAgentActivityHistory = (
    events: AgentEvent[] | null | undefined,
    sessionId: string,
): AgentEvent[] => {
    const normalized = (events ?? []).map(event => normalizeAgentActivityEvent({
        ...event,
        sessionId,
    }));
    const latestByRun = new Map<string, AgentEvent>();
    for (const event of normalized) {
        if (!event.runId) continue;
        latestByRun.set(event.runId, event);
    }
    const interruptions: AgentEvent[] = [];
    for (const [runId, latest] of latestByRun) {
        const lifecycle = latest.activity?.lifecycle ?? inferLegacyLifecycle(latest.status);
        if (TERMINAL_LIFECYCLES.has(lifecycle)) continue;
        const interruptionId = `activity:restored-run-interrupted:${runId}`;
        if (normalized.some(event => event.id === interruptionId)) continue;
        interruptions.push({
            id: interruptionId,
            timestamp: new Date(),
            sessionId,
            datasetId: latest.datasetId,
            runId,
            turnId: latest.turnId,
            phase: 'chat',
            step: 'restored_run_interrupted',
            status: 'done',
            message: 'This autonomous run was interrupted before the report was restored.',
            activity: {
                kind: 'terminal',
                lifecycle: 'cancelled',
                source: 'app',
                eventType: 'restored_run_interrupted',
                title: 'Restored Run Interrupted',
                explanation: 'The saved activity remains available, but stale busy state was cleared during restore.',
            },
        });
    }
    return [...normalized, ...interruptions]
        .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
        .slice(-200);
};
