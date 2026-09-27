import type { AppStore } from '../../store/useAppStore';
import { buildAiDebugBundle, buildCleaningFailureBundleExport, buildIrDiagnosticsPayload, buildPlannerFailureBundleExport, buildRecentPayloadSnapshotsExport, buildRuntimeLogsExport, buildSqlExecutorFailureBundleExport, type AiDebugBundleState } from './buildHandoffExports';
import { buildScopedDebugRequestFlows, selectScopedDebugLogEntries, type DebugFlowViewModel, type DebugLogEntryViewModel } from './debugLogEntries';
import { buildSurfaceTraceContract } from './runtime/runtimeControlPlaneContract';
import { summarizeTraceContract } from './traceContractView';

export type FailureBundleViewModel = {
    markdown: string;
    hasFailure: boolean;
};

export type DebugOperatorSummary = {
    latestFailureReason: string | null;
    latestFallbackPath: string | null;
    latestRetry: {
        count: number;
        ceiling: number | null;
        reasonCode: string | null;
    } | null;
    latestOutcome: {
        lifecycleState: string | null;
        recoveryStatus: string | null;
        actualOutcomeShape: string | null;
        degraded: boolean;
    } | null;
};

export const selectDebugTimelineEntries = (
    state: Pick<AppStore, 'sessionId' | 'currentDatasetId' | 'activeTurn' | 'cleaningRun' | 'activeSpreadsheetFilter' | 'agentToolLogs' | 'telemetryEvents' | 'agentEvents'>,
): DebugLogEntryViewModel[] =>
    selectScopedDebugLogEntries(state).entries;

export const selectDebugFlows = (
    state: Pick<AppStore, 'sessionId' | 'currentDatasetId' | 'activeTurn' | 'cleaningRun' | 'activeSpreadsheetFilter' | 'agentToolLogs' | 'telemetryEvents' | 'agentEvents'>,
): DebugFlowViewModel[] =>
    buildScopedDebugRequestFlows(state);

export const selectRuntimeLogsExport = (state: AppStore) => buildRuntimeLogsExport(state);

export const selectRecentPayloadSnapshotsExport = (
    state: Pick<AppStore, 'sessionId' | 'currentDatasetId' | 'activeTurn' | 'cleaningRun' | 'activeSpreadsheetFilter' | 'agentToolLogs' | 'telemetryEvents' | 'agentEvents' | 'analysisCards' | 'columnProfiles'>,
) => buildRecentPayloadSnapshotsExport(state);

export const selectIrDiagnostics = (
    state: Pick<AppStore, 'analysisCards' | 'columnProfiles'>,
) => buildIrDiagnosticsPayload(state);

export const selectPlannerFailureBundle = (state: AppStore): FailureBundleViewModel => ({
    markdown: buildPlannerFailureBundleExport(state),
    hasFailure: (state.agentEvents ?? []).some(event => event.phase === 'planning' && event.status === 'error'),
});

export const selectSqlFailureBundle = (state: AppStore): FailureBundleViewModel => ({
    markdown: buildSqlExecutorFailureBundleExport(state),
    hasFailure: (state.agentEvents ?? []).some(event => event.phase === 'planning'
        && event.status === 'error'
        && ['sql_compile_failed', 'duckdb_query_failed', 'duckdb_unavailable', 'empty_result'].includes(String(event.detail?.failureStage ?? '')))
        || state.dataPreparationPlan?.sqlPrecheck?.status === 'blocked',
});

export const selectCleaningFailureBundle = (state: AppStore): FailureBundleViewModel => ({
    markdown: buildCleaningFailureBundleExport(state),
    hasFailure: Boolean(state.cleaningRun && state.cleaningRun.status !== 'completed'),
});

export const selectAiDebugBundle = (state: AiDebugBundleState) => buildAiDebugBundle(state);

export const selectDebugOperatorSummary = (
    state: Pick<AppStore, 'runtimeEvents' | 'runtimeRunHistory' | 'latestAnalysisSession'>,
): DebugOperatorSummary => {
    const runtimeEvents = [...(state.runtimeEvents ?? [])];
    const latestTerminalEvent = [...runtimeEvents]
        .reverse()
        .find(event => [
            'turn_completed',
            'turn_cancelled',
            'turn_failed',
            'session_early_stop',
        ].includes(event.type));
    const latestFailureEvent = [...runtimeEvents]
        .reverse()
        .find(event => Boolean(event.failureClass)
            || [
                'turn_failed',
                'action_execution_error',
                'provider_timeout',
                'silent_failure',
                'analysis_yield_low',
                'reshape_before_analysis_failed',
            ].includes(event.type));
    const latestRetryEvent = [...(state.runtimeEvents ?? [])]
        .reverse()
        .find(event => event.type === 'retry_scheduled');
    const latestRunRecord = (state.runtimeRunHistory ?? []).at(-1) ?? null;
    const latestFailureTrace = summarizeTraceContract(
        latestFailureEvent
            ? buildSurfaceTraceContract({
                detail: latestFailureEvent.detail,
                reasonCode: latestFailureEvent.reason ?? undefined,
                source: 'debug_operator_failure_summary',
            })
            : null,
    );
    const latestFailureReason = latestFailureTrace?.reasonCode
        ?? latestFailureEvent?.reason
        ?? latestRunRecord?.reason
        ?? state.latestAnalysisSession?.stopReason
        ?? null;
    const latestFallbackPath = latestRunRecord?.recoveryTrace?.recoveryChain?.length
        ? latestRunRecord.recoveryTrace.recoveryChain.join(' -> ')
        : state.latestAnalysisSession?.analysisModeReason ?? null;

    return {
        latestFailureReason,
        latestFallbackPath,
        latestRetry: latestRetryEvent
            ? {
                count: typeof latestRetryEvent.detail?.retryAttempt === 'number' ? latestRetryEvent.detail.retryAttempt : latestRunRecord?.retryCount ?? 0,
                ceiling: typeof latestRetryEvent.detail?.retryCeiling === 'number' ? latestRetryEvent.detail.retryCeiling : null,
                reasonCode: typeof latestRetryEvent.detail?.reasonCode === 'string' ? latestRetryEvent.detail.reasonCode : latestRetryEvent.reason ?? null,
            }
            : null,
        latestOutcome: latestRunRecord
            ? {
                lifecycleState: latestRunRecord.lifecycleState ?? null,
                recoveryStatus: latestRunRecord.recoveryTrace?.recoveryStatus ?? null,
                actualOutcomeShape: latestRunRecord.recoveryTrace?.actualOutcomeShape ?? null,
                degraded: latestRunRecord.recoveryTrace?.recoveryStatus === 'degraded',
            }
            : latestTerminalEvent
                ? {
                    lifecycleState: latestTerminalEvent.type === 'turn_failed'
                        ? 'failed'
                        : latestTerminalEvent.type === 'turn_cancelled'
                            ? 'cancelled'
                            : 'completed',
                    recoveryStatus: latestTerminalEvent.type === 'turn_failed'
                        ? 'failed'
                        : latestTerminalEvent.detail?.outcome === 'degraded'
                            ? 'degraded'
                            : 'ideal',
                    actualOutcomeShape: typeof latestTerminalEvent.detail?.cardCount === 'number'
                        ? latestTerminalEvent.detail.cardCount > 0
                            ? 'card'
                            : 'hidden'
                        : null,
                    degraded: latestTerminalEvent.detail?.outcome === 'degraded',
                }
                : null,
    };
};
