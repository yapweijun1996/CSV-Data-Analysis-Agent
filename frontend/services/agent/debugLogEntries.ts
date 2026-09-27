import type { AgentPhase, CorrelationFields, RuntimeEventContractDetail } from '../../types';
import type { AppStore } from '../../store/useAppStore';
import { buildCorrelationFields, extractCorrelationFields, getCorrelationGroup, toCorrelationRecord } from './correlation';
import { buildSurfaceTraceContract } from './runtime/runtimeControlPlaneContract';
import { summarizeTraceContract, type TraceContractSummary } from './traceContractView';

export type DebugEntryType = 'tool' | 'telemetry' | 'event';
export type DebugEntrySource = 'agentToolLogs' | 'telemetryEvents' | 'agentEvents';
export type DebugFlowGroupType = 'request' | 'cleaning_run' | 'step' | 'turn';

type DebugLogState = Pick<AppStore, 'agentToolLogs' | 'telemetryEvents' | 'agentEvents'>;
type DebugLogScopeState = Pick<AppStore, 'sessionId' | 'currentDatasetId' | 'activeTurn' | 'cleaningRun' | 'activeSpreadsheetFilter' | 'agentToolLogs' | 'telemetryEvents' | 'agentEvents'>;
type FlowStage = 'intent' | 'tool_args' | 'observation' | 'final_reply';

export type DebugPayloadSnapshot = {
    source: DebugEntrySource;
    id: string;
    timestamp: string;
    correlation: ReturnType<typeof toCorrelationRecord>;
    traceContract?: RuntimeEventContractDetail | null;
} & Record<string, unknown>;

export interface DebugLogEntryViewModel {
    id: string;
    timestamp: Date;
    type: DebugEntryType;
    label: string;
    title: string;
    subtitle: string;
    detail?: Record<string, unknown>;
    traceContract: RuntimeEventContractDetail | null;
    traceSummary: TraceContractSummary | null;
    payloadSnapshot: DebugPayloadSnapshot;
}

export interface DebugFlowViewModel {
    groupId: string;
    groupType: DebugFlowGroupType;
    updatedAt: Date;
    phase: AgentPhase | string | null;
    failure: boolean;
    title: string;
    summary: string;
    latestMessage: string | null;
    toolNames: string[];
    observations: string[];
    finalReply: string | null;
    counts: {
        toolLogs: number;
        telemetryEvents: number;
        agentEvents: number;
    };
    correlation: ReturnType<typeof toCorrelationRecord>;
    payloadSnapshots: DebugPayloadSnapshot[];
    traceSummary: TraceContractSummary | null;
}

export type DebugLogScope = {
    scopeType: 'request' | 'turn' | 'cleaning_run' | 'dataset' | 'session';
    scopeId: string;
};

const toIso = (value: Date | string) => new Date(value).toISOString();

const withObjectDetail = (value: Record<string, unknown>) => Object.keys(value).length > 0 ? value : undefined;
const FLOW_STAGE_ORDER: FlowStage[] = ['intent', 'tool_args', 'observation', 'final_reply'];
const DEBUG_LOGS_MODAL_OPEN_MESSAGE = 'Opened debug logs modal.';

const isFlowStage = (value: unknown): value is FlowStage =>
    typeof value === 'string' && FLOW_STAGE_ORDER.includes(value as FlowStage);

const hasFailureStatus = (value: unknown) =>
    value === 'error' || value === 'blocked' || (typeof value === 'string' && /failed|error|blocked/i.test(value));

const isDebugLogsModalOpenPayload = (entry: DebugLogEntryViewModel) =>
    entry.type === 'tool'
    && entry.payloadSnapshot.tool === 'workspace_builder'
    && entry.payloadSnapshot.description === DEBUG_LOGS_MODAL_OPEN_MESSAGE;

const buildTraceContract = (params: {
    detail?: unknown;
    reasonCode?: string | null;
    source: string;
}): RuntimeEventContractDetail => buildSurfaceTraceContract({
    detail: params.detail,
    reasonCode: params.reasonCode ?? undefined,
    source: params.source,
});

const combineCorrelation = (
    current: CorrelationFields | null,
    incoming: CorrelationFields,
): CorrelationFields => ({
    sessionId: current?.sessionId ?? incoming.sessionId,
    datasetId: current?.datasetId ?? incoming.datasetId,
    turnId: current?.turnId ?? incoming.turnId,
    stepId: current?.stepId ?? incoming.stepId,
    cleaningRunId: current?.cleaningRunId ?? incoming.cleaningRunId,
    requestId: current?.requestId ?? incoming.requestId,
});

const pickEventPhase = (entry: DebugLogEntryViewModel) => {
    if (entry.type === 'event') {
        return typeof entry.payloadSnapshot.phase === 'string' ? entry.payloadSnapshot.phase : null;
    }
    if (entry.type === 'tool' && typeof entry.payloadSnapshot.stage === 'string') {
        return entry.payloadSnapshot.stage;
    }
    if (entry.type === 'telemetry' && typeof entry.payloadSnapshot.stage === 'string') {
        return entry.payloadSnapshot.stage;
    }
    return null;
};

export const buildDebugLogEntries = (state: DebugLogState): DebugLogEntryViewModel[] => {
    const toolEntries = (state.agentToolLogs ?? []).map(entry => {
        const traceContract = buildTraceContract({
            detail: entry.detail,
            reasonCode: entry.tool,
            source: 'agent_tool_log',
        });
        return {
            id: entry.id,
            timestamp: new Date(entry.timestamp),
            type: 'tool' as const,
            label: entry.tool,
            title: entry.description,
            subtitle: 'Agent tool log',
            detail: entry.detail as Record<string, unknown> | undefined,
            traceContract,
            traceSummary: summarizeTraceContract(traceContract),
            payloadSnapshot: {
                source: 'agentToolLogs' as const,
                id: entry.id,
                timestamp: toIso(entry.timestamp),
                correlation: toCorrelationRecord(entry),
                tool: entry.tool,
                description: entry.description,
                stage: entry.stage ?? null,
                category: entry.category ?? null,
                risk: entry.risk ?? null,
                policyDecision: entry.policyDecision ?? null,
                policyReason: entry.policyReason ?? null,
                detail: entry.detail ?? null,
                traceContract,
            },
        };
    });

    const telemetryEntries = (state.telemetryEvents ?? []).map(entry => {
        const detail = withObjectDetail({
            ...(entry.chunkSize !== undefined ? { chunkSize: entry.chunkSize } : {}),
            ...(entry.meta ? { meta: entry.meta } : {}),
        });
        const traceContract = buildTraceContract({
            detail: entry.meta,
            reasonCode: typeof entry.meta?.reasonCode === 'string' ? entry.meta.reasonCode : entry.responseType,
            source: 'telemetry_event',
        });

        return {
            id: entry.id,
            timestamp: new Date(entry.timestamp),
            type: 'telemetry' as const,
            label: `${entry.provider}:${entry.responseType}`,
            title: entry.stage,
            subtitle: entry.detail ?? 'Telemetry event',
            detail,
            traceContract,
            traceSummary: summarizeTraceContract(traceContract),
            payloadSnapshot: {
                source: 'telemetryEvents' as const,
                id: entry.id,
                timestamp: toIso(entry.timestamp),
                correlation: toCorrelationRecord(entry),
                provider: entry.provider,
                stage: entry.stage,
                responseType: entry.responseType,
                detail: entry.detail ?? null,
                chunkSize: entry.chunkSize ?? null,
                meta: entry.meta ?? null,
                traceContract,
            },
        };
    });

    const eventEntries = (state.agentEvents ?? []).map(entry => {
        const traceContract = buildTraceContract({
            detail: entry.detail,
            reasonCode: typeof entry.detail?.reasonCode === 'string' ? entry.detail.reasonCode : entry.step,
            source: 'agent_event',
        });
        return {
            id: entry.id,
            timestamp: new Date(entry.timestamp),
            type: 'event' as const,
            label: `${entry.phase}:${entry.status}`,
            title: entry.step,
            subtitle: entry.message,
            detail: entry.detail as Record<string, unknown> | undefined,
            traceContract,
            traceSummary: summarizeTraceContract(traceContract),
            payloadSnapshot: {
                source: 'agentEvents' as const,
                id: entry.id,
                timestamp: toIso(entry.timestamp),
                correlation: toCorrelationRecord(entry),
                phase: entry.phase,
                step: entry.step,
                status: entry.status,
                message: entry.message,
                detail: entry.detail ?? null,
                traceContract,
            },
        };
    });

    return [...toolEntries, ...telemetryEntries, ...eventEntries]
        .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
};

export const selectScopedDebugLogEntries = (
    state: DebugLogScopeState,
): DebugLogScope & { entries: DebugLogEntryViewModel[] } => {
    const entries = buildDebugLogEntries(state)
        .filter(entry => !isDebugLogsModalOpenPayload(entry));
    const correlation = buildCorrelationFields(state, {});
    const currentRequestId = correlation.requestId ?? null;
    const currentTurnId = correlation.turnId ?? null;
    const currentCleaningRunId = correlation.cleaningRunId ?? null;
    const currentDatasetId = correlation.datasetId ?? null;

    if (currentRequestId) {
        const scopedEntries = entries.filter(entry => entry.payloadSnapshot.correlation.requestId === currentRequestId);
        return {
            scopeType: 'request',
            scopeId: currentRequestId,
            entries: scopedEntries,
        };
    }

    if (currentTurnId) {
        const scopedEntries = entries.filter(entry => entry.payloadSnapshot.correlation.turnId === currentTurnId);
        return {
            scopeType: 'turn',
            scopeId: currentTurnId,
            entries: scopedEntries,
        };
    }

    if (currentCleaningRunId) {
        const scopedEntries = entries.filter(entry => entry.payloadSnapshot.correlation.cleaningRunId === currentCleaningRunId);
        return {
            scopeType: 'cleaning_run',
            scopeId: currentCleaningRunId,
            entries: scopedEntries,
        };
    }

    if (currentDatasetId) {
        const scopedEntries = entries.filter(entry => entry.payloadSnapshot.correlation.datasetId === currentDatasetId);
        if (scopedEntries.length > 0) {
            return {
                scopeType: 'dataset',
                scopeId: currentDatasetId,
                entries: scopedEntries,
            };
        }
    }

    return {
        scopeType: 'session',
        scopeId: correlation.sessionId ?? 'unknown-session',
        entries,
    };
};

const buildDebugRequestFlowsFromEntries = (entries: DebugLogEntryViewModel[]): DebugFlowViewModel[] => {
    const flows = new Map<string, DebugFlowViewModel>();
    const allEntries = [...entries].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());

    for (const entry of allEntries) {
        const correlation = extractCorrelationFields(entry.payloadSnapshot.correlation);
        const group = getCorrelationGroup(correlation);
        if (!group) continue;

        const current = flows.get(group.id) ?? {
            groupId: group.id,
            groupType: group.type,
            updatedAt: entry.timestamp,
            phase: pickEventPhase(entry),
            failure: false,
            title: entry.title,
            summary: entry.subtitle,
            latestMessage: entry.subtitle,
            toolNames: [],
            observations: [],
            finalReply: null,
            counts: {
                toolLogs: 0,
                telemetryEvents: 0,
                agentEvents: 0,
            },
            correlation: toCorrelationRecord(correlation),
            payloadSnapshots: [],
            traceSummary: null,
        };

        current.updatedAt = current.updatedAt.getTime() > entry.timestamp.getTime() ? current.updatedAt : entry.timestamp;
        current.phase = current.phase ?? pickEventPhase(entry);
        current.latestMessage = entry.subtitle;
        current.summary = entry.subtitle || current.summary;
        current.title = current.title || entry.title;
        current.correlation = toCorrelationRecord(combineCorrelation(current.correlation, correlation));
        current.payloadSnapshots.push(entry.payloadSnapshot);
        current.traceSummary = entry.traceSummary ?? current.traceSummary;

        if (entry.type === 'tool') {
            current.counts.toolLogs += 1;
            if (!current.toolNames.includes(entry.label)) {
                current.toolNames.push(entry.label);
            }
        } else if (entry.type === 'telemetry') {
            current.counts.telemetryEvents += 1;
        } else {
            current.counts.agentEvents += 1;
        }

        const flowStage = isFlowStage(entry.detail?.flowStage) ? entry.detail.flowStage : null;
        if (flowStage === 'final_reply' && typeof entry.detail?.finalReply === 'string') {
            current.finalReply = entry.detail.finalReply;
        }
        if (flowStage === 'observation' && entry.detail?.observation && typeof entry.detail.observation === 'object') {
            current.observations.push(JSON.stringify(entry.detail.observation));
        }

        const failureFlag = hasFailureStatus(entry.payloadSnapshot.status)
            || hasFailureStatus(entry.payloadSnapshot.policyDecision)
            || /failed|error|blocked/i.test(entry.subtitle);
        current.failure = current.failure || failureFlag;
        flows.set(group.id, current);
    }

    return [...flows.values()]
        .map(flow => ({
            ...flow,
            summary: flow.finalReply ?? flow.latestMessage ?? flow.summary,
        }))
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
};

export const buildDebugRequestFlows = (state: DebugLogState): DebugFlowViewModel[] => {
    return buildDebugRequestFlowsFromEntries(buildDebugLogEntries(state));
};

export const buildScopedDebugRequestFlows = (state: DebugLogScopeState): DebugFlowViewModel[] =>
    buildDebugRequestFlowsFromEntries(selectScopedDebugLogEntries(state).entries);
