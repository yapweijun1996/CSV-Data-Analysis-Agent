import type { AppStore } from '../../store/useAppStore';
import type { AgentEvent, AgentToolLogEntry, TelemetryEvent, AgentRuntimeEvent, RuntimeRunRecord } from '../../types';
import { buildCleaningInspectionBundle } from './buildCleaningInspectionBundle';
import { buildDataPreparationWorkflowBundle } from './buildDataPreparationWorkflowBundle';
import { buildDebugLogEntries, selectScopedDebugLogEntries } from './debugLogEntries';
import { buildCorrelationFields, toCorrelationRecord } from './correlation';
import { buildDisplayAnalysisIrList } from '../dashboard/displayAnalysisIr';
import { isPlannerStabilityReasonCode } from './planning/plannerStability';
import {
    getCurrentAnalysisDatasetVersion,
    resolveAnalysisArtifactFreshness,
} from './artifactProvenance';

const toIso = (value: Date | string) => new Date(value).toISOString();

const stringifyPayload = (payload: unknown) => JSON.stringify(payload, null, 2);

const getCurrentStage = (state: ReturnType<typeof buildDataPreparationWorkflowBundle>) => {
    const blocked = state.steps.find(step => step.status === 'blocked');
    if (blocked) return blocked;
    const warning = state.steps.find(step => step.status === 'warning');
    if (warning) return warning;
    const completed = [...state.steps].reverse().find(step => step.status === 'done');
    return completed ?? state.steps[0];
};

const buildMarkdownExport = (title: string, summaryLines: string[], payload: unknown) => [
    `# ${title}`,
    '',
    '## Summary',
    ...summaryLines.map(line => `- ${line}`),
    '',
    '## Structured Payload',
    '```json',
    stringifyPayload(payload),
    '```',
].join('\n');

const buildSessionCorrelation = (state: AppStore) => toCorrelationRecord(buildCorrelationFields(state, {}));

const getProvider = (state: AppStore) => state.settings?.provider ?? 'google';
const getModel = (state: AppStore) => state.settings?.complexModel ?? null;

const buildStabilitySummary = (state: AppStore) => {
    const plannerReasonCounts: Record<string, number> = {};
    for (const event of state.telemetryEvents ?? []) {
        const rawReasonCodes = new Set([
            ...(typeof event.meta?.reasonCode === 'string' ? [event.meta.reasonCode] : []),
            ...(Array.isArray(event.meta?.reasonCodes) ? event.meta.reasonCodes.filter((value): value is string => typeof value === 'string') : []),
        ]);
        for (const reasonCode of rawReasonCodes) {
            if (!isPlannerStabilityReasonCode(reasonCode)) continue;
            plannerReasonCounts[reasonCode] = (plannerReasonCounts[reasonCode] ?? 0) + 1;
        }
    }

    const cleaningRecoveryCounts = (state.cleaningRun?.iterationArtifacts ?? []).reduce<Record<string, number>>((counts, record) => {
        counts[record.recoveryPath] = (counts[record.recoveryPath] ?? 0) + 1;
        return counts;
    }, {});

    const stalledIterations = (state.cleaningRun?.iterationArtifacts ?? []).filter(record =>
        !record.verificationPassed && typeof record.verificationReason === 'string' && /stalled/i.test(record.verificationReason),
    ).length;

    return {
        plannerReasonCounts,
        cleaningRecoveryCounts,
        totalCleaningIterations: state.cleaningRun?.iterationArtifacts?.length ?? 0,
        stalledIterations,
    };
};

const mapTelemetryForExport = (entry: TelemetryEvent) => ({
    ...entry,
    timestamp: toIso(entry.timestamp),
    correlation: toCorrelationRecord(entry),
});

const mapToolLogForExport = (entry: AgentToolLogEntry) => ({
    ...entry,
    timestamp: toIso(entry.timestamp),
    correlation: toCorrelationRecord(entry),
});

const mapAgentEventForExport = (entry: AgentEvent) => ({
    ...entry,
    timestamp: toIso(entry.timestamp),
    correlation: toCorrelationRecord(entry),
});

export const buildIrDiagnosticsPayload = (
    state: Pick<AppStore, 'analysisCards' | 'columnProfiles'>,
) => buildDisplayAnalysisIrList(state.analysisCards ?? [], state.columnProfiles ?? []).map(ir => ({
    cardId: ir.cardId,
    displayTitle: ir.displayTitle,
    semanticRole: ir.semanticRole,
    helperExposureLevel: ir.helperExposureLevel,
    businessMeaningConfidence: ir.businessMeaningConfidence,
    aggregationQualityFlags: ir.aggregationQualityFlags,
    narrativeEligibility: ir.narrativeEligibility,
    selectionScore: ir.selectionScore,
    selectionReasons: ir.selectionReasons,
}));

export const buildRuntimeLogsExport = (state: AppStore) => {
    const chatFailures = (state.chatHistory ?? [])
        .filter(entry => entry.type === 'ai_cleaning_failure')
        .map(entry => ({
            type: entry.type,
            text: entry.text,
            isError: entry.isError ?? false,
            resolved: entry.resolved ?? false,
            cleaningRunId: entry.cleaningRunId ?? null,
            timestamp: toIso(entry.timestamp),
            correlation: toCorrelationRecord({
                sessionId: state.sessionId,
                datasetId: state.currentDatasetId,
                cleaningRunId: entry.cleaningRunId ?? undefined,
            }),
        }));
    const payload = {
        datasetId: state.currentDatasetId,
        correlation: buildSessionCorrelation(state),
        generatedAt: new Date().toISOString(),
        telemetryEvents: (state.telemetryEvents ?? []).map(mapTelemetryForExport),
        agentToolLogs: (state.agentToolLogs ?? []).map(mapToolLogForExport),
        agentEvents: (state.agentEvents ?? []).map(mapAgentEventForExport),
        chatFailures,
        stabilitySummary: buildStabilitySummary(state),
        irDiagnostics: buildIrDiagnosticsPayload(state),
    };

    return buildMarkdownExport('Runtime Logs Export', [
        `Dataset ID: ${state.currentDatasetId ?? 'none'}`,
        `Telemetry events: ${payload.telemetryEvents.length}`,
        `Agent tool logs: ${payload.agentToolLogs.length}`,
        `Agent events: ${payload.agentEvents.length}`,
        `Chat failures: ${payload.chatFailures.length}`,
        `Planner stability signals: ${Object.values(payload.stabilitySummary.plannerReasonCounts).reduce((sum, value) => sum + value, 0)}`,
        `IR diagnostics: ${payload.irDiagnostics.length}`,
    ], payload);
};

const RECENT_PAYLOAD_SNAPSHOT_LIMIT = 100;
const AI_DEBUG_BUNDLE_MAX_BYTES = 50 * 1024;
const AI_DEBUG_BUNDLE_SEPARATOR = '\n\n---\n\n';

export const buildRecentPayloadSnapshotsExport = (
    state: Pick<AppStore, 'sessionId' | 'currentDatasetId' | 'activeTurn' | 'cleaningRun' | 'activeSpreadsheetFilter' | 'agentToolLogs' | 'telemetryEvents' | 'agentEvents' | 'analysisCards' | 'columnProfiles'>,
) => {
    const scopedResult = selectScopedDebugLogEntries(state as AppStore);
    const recentPayloads = scopedResult.entries
        .slice(0, RECENT_PAYLOAD_SNAPSHOT_LIMIT)
        .map(entry => entry.payloadSnapshot);
    const scope = { scopeType: scopedResult.scopeType, scopeId: scopedResult.scopeId };
    const payload = {
        datasetId: state.currentDatasetId,
        correlation: toCorrelationRecord(buildCorrelationFields(state, {})),
        generatedAt: new Date().toISOString(),
        snapshotLimit: RECENT_PAYLOAD_SNAPSHOT_LIMIT,
        scope,
        recentPayloads,
        irDiagnostics: buildIrDiagnosticsPayload(state),
    };

    return buildMarkdownExport('Recent Payload Snapshots Export', [
        `Dataset ID: ${state.currentDatasetId ?? 'none'}`,
        `Scope: ${scope.scopeType} ${scope.scopeId}`,
        `Recent payload snapshots: ${recentPayloads.length}`,
        `Snapshot limit: ${RECENT_PAYLOAD_SNAPSHOT_LIMIT}`,
        `IR diagnostics: ${payload.irDiagnostics.length}`,
    ], payload);
};

export const buildWorkflowSnapshotExport = (state: AppStore) => {
    const workflow = buildDataPreparationWorkflowBundle(state);
    const stage = getCurrentStage(workflow);
    const payload = {
        generatedAt: new Date().toISOString(),
        datasetId: state.currentDatasetId,
        sessionId: state.sessionId,
        correlation: buildSessionCorrelation(state),
        workflow,
    };

    return buildMarkdownExport('Workflow Snapshot Export', [
        `Dataset ID: ${state.currentDatasetId ?? 'none'}`,
        `Current stage: ${stage?.label ?? 'unknown'} (${stage?.status ?? 'unknown'})`,
        `Preparation state: ${workflow.summary.preparationState}`,
        `Analysis state: ${workflow.summary.analysisState}`,
        `Warnings: ${workflow.issueSummary.topWarnings.length}`,
    ], payload);
};

const buildCleaningFailureBundlePayload = (state: AppStore) => {
    const workflow = buildDataPreparationWorkflowBundle(state);
    const inspection = buildCleaningInspectionBundle(state);
    const stage = getCurrentStage(workflow);
    return {
        generatedAt: new Date().toISOString(),
        summary: {
            failureType: stage?.status === 'blocked' ? 'cleaning_blocked' : 'cleaning_warning',
            message: stage?.description ?? 'Cleaning handoff generated.',
            time: new Date().toISOString(),
            phase: stage?.id ?? 'prepare',
            primaryCorrelation: buildSessionCorrelation(state),
        },
        session: {
            sessionId: state.sessionId,
            datasetId: state.currentDatasetId,
            goal: state.confirmedAnalysisGoal,
            provider: getProvider(state),
            model: getModel(state),
        },
        context: {
            currentStage: stage,
            workflow: {
                summary: workflow.summary,
                steps: workflow.steps,
                issueSummary: workflow.issueSummary,
                preparation: workflow.preparation,
                verification: workflow.verification,
                diff: workflow.diff,
            },
            inspection: {
                importFacts: inspection.importFacts,
                intakeDiagnostics: inspection.intakeDiagnostics,
                rowInspection: inspection.rowInspection,
                loopHistory: inspection.loopHistory,
                cleaning: inspection.cleaning,
                dataQuery: inspection.dataQuery,
                execution: inspection.execution,
                verification: inspection.verification,
            },
        },
        logs: {
            toolLogs: inspection.logs.toolLogs,
            telemetry: inspection.logs.telemetry,
            agentEvents: inspection.logs.pipeline,
        },
        artifacts: {
            workspaceFiles: [
                '/cleaning/intake-diagnostics.json',
                '/cleaning/report-shape.json',
                '/cleaning/reshape-hypotheses.json',
                '/cleaning/row-inspection.json',
                '/cleaning/row-classification.json',
                '/cleaning/cleaning-loop-history.json',
                '/cleaning/verification-signals.json',
                '/logs/agent-events.ndjson',
                '/logs/telemetry.ndjson',
                '/workspace/actions.ndjson',
            ],
            samples: inspection.samples,
        },
    };
};

export const buildCleaningFailureBundleExport = (state: AppStore) => {
    const payload = buildCleaningFailureBundlePayload(state);
    const inspection = buildCleaningInspectionBundle(state);
    const workflow = buildDataPreparationWorkflowBundle(state);
    const stage = getCurrentStage(workflow);
    const summaryLines = [
        `Dataset ID: ${state.currentDatasetId ?? 'none'}`,
        `Current stage: ${stage?.label ?? 'unknown'} (${stage?.status ?? 'unknown'})`,
        `Overall verification: ${workflow.verification.overallStatus}`,
        `Downstream analysis blocked: ${workflow.verification.downstreamAnalysisBlocked ? 'yes' : 'no'}`,
        `Failed checks: ${inspection.verification.failedChecks.length}`,
        `Warnings: ${inspection.verification.warnings.length}`,
    ];
    return buildMarkdownExport('Cleaning Failure Bundle Export', summaryLines, payload);
};

export const buildFailureHandoffExport = (state: AppStore) => buildCleaningFailureBundleExport(state);

const selectRecentPlannerFailure = (state: AppStore) =>
    [...(state.agentEvents ?? [])]
        .reverse()
        .find(event => event.phase === 'planning'
            && event.status === 'error'
            && event.detail?.failureStage !== 'sql_compile_failed'
            && event.detail?.failureStage !== 'duckdb_query_failed'
            && event.detail?.failureStage !== 'duckdb_unavailable'
            && event.detail?.failureStage !== 'empty_result');

const selectRecentSqlFailure = (state: AppStore) =>
    [...(state.agentEvents ?? [])]
        .reverse()
        .find(event => event.phase === 'planning'
            && event.status === 'error'
            && typeof event.detail?.failureStage === 'string'
            && ['sql_compile_failed', 'duckdb_query_failed', 'duckdb_unavailable', 'empty_result'].includes(event.detail.failureStage));

const selectSqlPrecheckBlock = (state: AppStore) =>
    state.dataPreparationPlan?.sqlPrecheck?.status === 'blocked'
        ? state.dataPreparationPlan.sqlPrecheck
        : null;

const buildRelatedLogs = (
    state: AppStore,
    predicate: (entry: AgentEvent | AgentToolLogEntry | TelemetryEvent) => boolean,
) => ({
    agentEvents: (state.agentEvents ?? []).filter(predicate).slice(-20).map(mapAgentEventForExport as (entry: AgentEvent) => ReturnType<typeof mapAgentEventForExport>),
    agentToolLogs: (state.agentToolLogs ?? []).filter(predicate).slice(-20).map(mapToolLogForExport as (entry: AgentToolLogEntry) => ReturnType<typeof mapToolLogForExport>),
    telemetryEvents: (state.telemetryEvents ?? []).filter(predicate).slice(-20).map(mapTelemetryForExport as (entry: TelemetryEvent) => ReturnType<typeof mapTelemetryForExport>),
});

export const buildPlannerFailureBundleExport = (state: AppStore) => {
    const failure = selectRecentPlannerFailure(state);
    const payload = {
        generatedAt: new Date().toISOString(),
        summary: {
            failureType: failure?.detail?.failureStage ?? null,
            message: failure?.message ?? null,
            time: failure ? toIso(failure.timestamp) : null,
            phase: failure?.phase ?? 'planning',
            primaryCorrelation: toCorrelationRecord(failure ?? buildCorrelationFields(state, {})),
        },
        session: {
            sessionId: state.sessionId,
            datasetId: state.currentDatasetId,
            goal: state.confirmedAnalysisGoal,
            provider: getProvider(state),
            model: getModel(state),
        },
        context: {
            topic: failure?.message.match(/topic "(.*?)"/)?.[1] ?? null,
            columnProfiles: state.columnProfiles,
            goal: state.confirmedAnalysisGoal,
            activeDataset: state.csvData?.fileName ?? null,
        },
        logs: buildRelatedLogs(state, entry => {
            if ('phase' in entry) return entry.phase === 'planning' || entry.phase === 'topic_generation';
            if ('provider' in entry) return entry.meta?.callType === 'planner';
            return entry.tool === 'context_manager' || entry.tool === 'tool_registry';
        }),
        artifacts: {
            queryHistory: (state.queryHistory ?? []).slice(-5).map(entry => ({
                id: entry.id,
                correlation: {
                    ...toCorrelationRecord(entry),
                    datasetId: state.currentDatasetId ?? null,
                    cleaningRunId: state.cleaningRun?.runId ?? null,
                    requestId: null,
                },
                explanation: entry.explanation,
                sqlPreview: entry.sqlPreview,
                tableName: entry.tableName,
                loadVersion: entry.loadVersion,
            })),
            workspaceFiles: [
                '/analysis/card-snapshot.json',
                '/chat/query-history.json',
                '/logs/agent-events.ndjson',
                '/logs/telemetry.ndjson',
            ],
        },
    };

    return buildMarkdownExport('Planner Failure Bundle Export', [
        `Dataset ID: ${state.currentDatasetId ?? 'none'}`,
        `Has planner failure: ${failure ? 'yes' : 'no'}`,
        `Goal: ${state.confirmedAnalysisGoal ?? 'none'}`,
    ], payload);
};

export const buildSqlExecutorFailureBundleExport = (state: AppStore) => {
    const failure = selectRecentSqlFailure(state);
    const sqlPrecheck = selectSqlPrecheckBlock(state);
    const recentQuery = [...(state.queryHistory ?? [])].reverse().find(entry => entry.engine === 'duckdb') ?? null;
    const payload = {
        generatedAt: new Date().toISOString(),
        summary: {
            failureType: failure?.detail?.failureStage ?? (sqlPrecheck ? 'sql_precheck_blocked' : null),
            message: failure?.message ?? sqlPrecheck?.summary ?? null,
            time: failure ? toIso(failure.timestamp) : new Date().toISOString(),
            phase: 'execution',
            primaryCorrelation: toCorrelationRecord(failure ?? buildCorrelationFields(state, {})),
        },
        session: {
            sessionId: state.sessionId,
            datasetId: state.currentDatasetId,
            goal: state.confirmedAnalysisGoal,
            provider: getProvider(state),
            model: getModel(state),
        },
        context: {
            sqlPreview: recentQuery?.sqlPreview ?? null,
            tableName: recentQuery?.tableName ?? state.duckDbSessionStatus?.tableName ?? null,
            loadVersion: recentQuery?.loadVersion ?? state.duckDbSessionStatus?.loadVersion ?? null,
            errorCode: failure?.detail?.failureStage ?? (sqlPrecheck ? 'sql_precheck_blocked' : null),
            duckDbStatus: state.duckDbSessionStatus ?? null,
            sqlPrecheck: sqlPrecheck
                ? {
                    status: sqlPrecheck.status,
                    summary: sqlPrecheck.summary,
                    findings: sqlPrecheck.findings,
                    evaluatedPairs: sqlPrecheck.evaluatedPairs ?? [],
                    plannerGuidance: sqlPrecheck.plannerGuidance ?? null,
                }
                : null,
        },
        logs: buildRelatedLogs(state, entry => {
            if ('phase' in entry) {
                const stage = entry.detail?.failureStage;
                return entry.phase === 'execution'
                    || (entry.phase === 'planning' && typeof stage === 'string' && ['sql_compile_failed', 'duckdb_query_failed', 'duckdb_unavailable', 'empty_result'].includes(stage));
            }
            if ('provider' in entry) return entry.meta?.callType === 'planner';
            return entry.tool === 'duckdb_query_engine' || entry.tool === 'context_manager';
        }),
        artifacts: {
            latestQuery: recentQuery
                ? {
                    id: recentQuery.id,
                    correlation: {
                        ...toCorrelationRecord(recentQuery),
                        datasetId: state.currentDatasetId ?? null,
                        cleaningRunId: state.cleaningRun?.runId ?? null,
                        requestId: null,
                    },
                    explanation: recentQuery.explanation,
                    sqlPreview: recentQuery.sqlPreview,
                    tableName: recentQuery.tableName,
                    loadVersion: recentQuery.loadVersion,
                    result: recentQuery.result,
                }
                : null,
            workspaceFiles: [
                '/chat/query-history.json',
                '/analysis/card-snapshot.json',
                '/logs/agent-events.ndjson',
            ],
        },
    };

    return buildMarkdownExport('SQL Executor Failure Bundle Export', [
        `Dataset ID: ${state.currentDatasetId ?? 'none'}`,
        `Has SQL failure: ${failure || sqlPrecheck ? 'yes' : 'no'}`,
        `DuckDB status: ${state.duckDbSessionStatus?.status ?? 'unknown'}`,
    ], payload);
};

// ─── AI Debug Bundle ───────────────────────────────────────────────────────

export type AiDebugBundleState = Pick<AppStore,
    // Fields used directly by buildAiDebugBundle sections
    | 'sessionId' | 'currentDatasetId' | 'activeTurn' | 'cleaningRun'
    | 'activeSpreadsheetFilter' | 'agentToolLogs' | 'telemetryEvents'
    | 'agentEvents' | 'analysisCards' | 'columnProfiles' | 'confirmedAnalysisGoal'
    | 'settings' | 'csvData' | 'queryHistory' | 'duckDbSessionStatus'
    | 'chatHistory' | 'dataPreparationPlan' | 'latestAnalysisSession'
    | 'visibleAnalysisTrace' | 'runtimeEvents' | 'runtimeRunHistory'
    // WorkflowBundleState fields — required to call buildDataPreparationWorkflowBundle without a cast
    | 'rawCsvData' | 'rawIntakeIr' | 'reportContextResolution' | 'dataQualityIssues'
    | 'aiFilterExplanation' | 'spreadsheetFilterFunction' | 'activeDataQuery'
    | 'initialDataSample' | 'currentView' | 'isGeneratingReport' | 'finalSummary'
    | 'reportStructureResolution' | 'canonicalCsvData' | 'canonicalBuildMeta'
    | 'canonicalizationStatus' | 'pipelineOutcome'
>;

const trunc = (value: unknown, max = 300): string => {
    const s = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
    return s.length > max ? s.slice(0, max) + '…' : s;
};

const getByteLength = (value: string) => new TextEncoder().encode(value).length;

const finalizeAiDebugBundle = (sections: string[]): string => {
    if (sections.length === 0) {
        return '';
    }

    const header = sections[0];
    const footer = sections[sections.length - 1];
    const middle = sections.slice(1, -1);
    const included = [header];
    let omittedCount = 0;

    for (let index = 0; index < middle.length; index += 1) {
        const nextSection = middle[index];
        const candidate = [...included, nextSection, footer].join(AI_DEBUG_BUNDLE_SEPARATOR);
        if (getByteLength(candidate) <= AI_DEBUG_BUNDLE_MAX_BYTES) {
            included.push(nextSection);
            continue;
        }

        omittedCount = middle.length - index;
        break;
    }

    const finalSections = [...included];
    if (omittedCount > 0) {
        finalSections.push([
            '## Bundle Truncation',
            '',
            `- ${omittedCount} section(s) omitted to keep this export within the ~50KB debug bundle budget.`,
        ].join('\n'));
    }
    finalSections.push(footer);
    return finalSections.join(AI_DEBUG_BUNDLE_SEPARATOR);
};

const fmtRuntimeEvent = (e: AgentRuntimeEvent): string =>
    `- [${toIso(e.timestamp)}] **${e.type}**${e.stage ? ` (${e.stage})` : ''}: ${e.message}${e.failureClass ? ` [failureClass=${e.failureClass}]` : ''}${e.reason ? ` — ${e.reason}` : ''}`;

const fmtRunRecord = (r: RuntimeRunRecord): string => {
    const lines = [
        `### Run ${r.runId}`,
        `- **outcomeKind**: ${r.outcomeKind}`,
        `- **lifecycleState**: ${r.lifecycleState}`,
        `- **retryCount**: ${r.retryCount}`,
        `- **tools**: ${r.toolSequence.join(' → ') || 'none'}`,
    ];
    if (r.failureClass) lines.push(`- **failureClass**: ${r.failureClass}`);
    if (r.reason) lines.push(`- **reason**: ${r.reason}`);
    if (r.finalObservationSummary) lines.push(`- **observation**: ${trunc(r.finalObservationSummary)}`);
    if (r.scorecard) lines.push(`- **scorecard**: \`${trunc(JSON.stringify(r.scorecard), 200)}\``);
    if (r.recoveryTrace) {
        lines.push(`- **recovery**: ${r.recoveryTrace.recoveryStatus} — ${r.recoveryTrace.recoveryChain.join(' → ') || 'none'}`);
    }
    return lines.join('\n');
};

export const buildAiDebugBundle = (state: AiDebugBundleState): string => {
    const sections: string[] = [];
    const now = new Date().toISOString();

    // Section 1 — Header
    const provider = state.settings?.provider ?? 'unknown';
    const model = state.settings?.complexModel ?? 'unknown';
    const fileName = state.csvData?.fileName ?? 'none';
    const rowCount = state.csvData?.data?.length ?? 0;
    sections.push([
        `# AI Debug Bundle`,
        ``,
        `| Field | Value |`,
        `|-------|-------|`,
        `| Generated | ${now} |`,
        `| Session ID | ${state.sessionId ?? 'none'} |`,
        `| Dataset ID | ${state.currentDatasetId ?? 'none'} |`,
        `| File | ${fileName} |`,
        `| Rows | ${rowCount} |`,
        `| Provider | ${provider} |`,
        `| Model | ${model} |`,
        `| Goal | ${state.confirmedAnalysisGoal ?? 'none'} |`,
    ].join('\n'));

    // Section 2 — Errors & Failures (high priority: placed first after header so it survives budget truncation)
    const errorEvents = (state.agentEvents ?? [])
        .filter(e => e.status === 'error')
        .slice(-15);
    const cleaningFailures = (state.chatHistory ?? [])
        .filter(e => e.type === 'ai_cleaning_failure')
        .slice(-5);
    if (errorEvents.length > 0 || cleaningFailures.length > 0) {
        const errLines = errorEvents.map(e =>
            `- [${toIso(e.timestamp)}] **${e.phase}/${e.step}**: ${trunc(e.message, 200)}${e.detail?.failureStage ? ` [${e.detail.failureStage}]` : ''}`
        );
        const cleanLines = cleaningFailures.map(e =>
            `- [${toIso(e.timestamp)}] cleaning_failure: ${trunc(e.text, 200)}`
        );
        sections.push([
            `## Errors & Failures`,
            ``,
            errLines.length > 0 ? `**Agent errors (last ${errLines.length}):**\n${errLines.join('\n')}` : '',
            cleanLines.length > 0 ? `\n**Cleaning failures (last ${cleanLines.length}):**\n${cleanLines.join('\n')}` : '',
        ].filter(Boolean).join('\n'));
    }

    // Section 3 — Active Turn (high priority: shows current state for live debugging)
    const turn = state.activeTurn;
    if (turn) {
        const stepLines = turn.steps.slice(-5).map((s, i) => {
            const actionLabel = s.action.type === 'tool_call' ? s.action.toolName : 'assistant_message';
            const observationSummary = s.observation?.summary ?? '';
            return `  ${i + 1}. [${s.status}] ${trunc(actionLabel, 60)} — ${trunc(observationSummary, 100)}`;
        });
        sections.push([
            `## Active Turn`,
            ``,
            `- turnId: ${turn.turnId}`,
            `- status: ${turn.status}`,
            `- userMessage: ${trunc(turn.userMessage, 150)}`,
            turn.runtimeCommitment ? `- commitmentGoal: ${trunc(turn.runtimeCommitment.committedObjective ?? '', 150)}` : '',
            stepLines.length > 0 ? `\n**Last steps:**\n${stepLines.join('\n')}` : '',
        ].filter(Boolean).join('\n'));
    }

    // Section 4 — Analysis Session
    const session = state.latestAnalysisSession;
    if (session) {
        const hypothesisLines = session.hypotheses.map(h =>
            `  - [${h.status}] ${h.topic}`
        );
        const acceptedLines = session.acceptedOutputs.map(o =>
            `  - querySignature: ${trunc(o.querySignature, 80)} | semanticSignature: ${trunc(o.semanticSignature, 80)}`
        );
        const rejectedLines = session.rejectedOutputs.map(o =>
            `  - reasonCode: ${(o.valueReasonCodes ?? []).join(',')} | ${trunc(o.reason, 100)}`
        );
        const researchQuestionLines = session.researchBrief?.questions.map(question =>
            `  - [${question.status}] ${question.question}`
        ) ?? [];
        const researchFindingLines = (session.researchFindings ?? []).map(finding =>
            `  - [${finding.status}] ${finding.claim} | evidence: ${finding.evidenceRefs.map(ref => `${ref.kind}:${ref.ref}`).join(', ') || 'none'}`
        );
        sections.push([
            `## Analysis Session`,
            ``,
            `- status: ${session.status}`,
            `- origin: ${session.origin}`,
            `- stepsUsed / maxSteps: ${session.stepsUsed} / ${session.maxSteps}`,
            `- stopReason: ${session.stopReason ?? 'none'}`,
            session.researchBrief?.datasetVersionId
                ? `- researchDatasetVersion: ${session.researchBrief.datasetVersionId}`
                : '',
            session.harnessSummary ? `- harnessSummary: ${trunc(session.harnessSummary)}` : '',
            session.summary ? `- accepted: ${session.summary.acceptedCardCount}, rejected: ${session.summary.rejectedHypothesisCount}, exhausted: ${session.summary.exhaustedHypothesisCount}` : '',
            hypothesisLines.length > 0 ? `\n**Hypotheses**:\n${hypothesisLines.join('\n')}` : '',
            acceptedLines.length > 0 ? `\n**Accepted Outputs**:\n${acceptedLines.join('\n')}` : '',
            rejectedLines.length > 0 ? `\n**Rejected Outputs**:\n${rejectedLines.join('\n')}` : '',
            researchQuestionLines.length > 0 ? `\n**Research Questions**:\n${researchQuestionLines.join('\n')}` : '',
            researchFindingLines.length > 0 ? `\n**Research Findings**:\n${researchFindingLines.join('\n')}` : '',
            session.researchBrief?.clarification
                ? `\n**Clarification Needed:** ${session.researchBrief.clarification.question} — ${session.researchBrief.clarification.reason}`
                : '',
        ].filter(Boolean).join('\n'));
    }

    // Section 4b — Harness Directives (why dimensions were skipped, promoted grains, hierarchy signals)
    const su = session?.semanticUnderstanding;
    if (su) {
        const harnessLines: string[] = [
            `## Harness Directives`,
            ``,
            `- **businessGrains** (promoted): ${su.businessGrains.length > 0 ? su.businessGrains.join(', ') : 'none'}`,
            `- **blockedDimensions**: ${su.blockedDimensions.length > 0 ? su.blockedDimensions.join(', ') : 'none'} ← dimensions excluded from groupBy`,
            `- **helperDimensions**: ${su.helperDimensions.length > 0 ? su.helperDimensions.join(', ') : 'none'}`,
            `- **candidateMetrics**: ${su.candidateMetrics.length > 0 ? su.candidateMetrics.join(', ') : 'none'}`,
            `- **detailRowPolicy**: ${su.detailRowPolicy}`,
            `- **unsafeForBusinessNarrative**: ${su.unsafeForBusinessNarrative}`,
        ];
        if (su.conflicts && su.conflicts.length > 0) {
            const examples = su.conflicts.slice(0, 3).map(c => `${c.targetKey}: ${c.reason}`).join('; ');
            harnessLines.push(`- **conflicts** (hierarchy/label warnings): ${su.conflicts.length} — ${trunc(examples, 150)}`);
        }
        if (session?.harnessSummary) {
            harnessLines.push(``, `**Harness summary**: ${trunc(session.harnessSummary, 300)}`);
        }
        sections.push(harnessLines.join('\n'));
    }

    // Section 5 — Data Schema
    const profiles = state.columnProfiles ?? [];
    if (profiles.length > 0) {
        const rows = profiles.map(p =>
            `| ${p.name} | ${p.type} | ${p.uniqueValues ?? '—'} | ${p.missingPercentage != null ? p.missingPercentage.toFixed(1) + '%' : '—'} | ${p.hasFormattedNumbers ? 'yes' : 'no'} |`
        );
        sections.push([
            `## Data Schema`,
            ``,
            `| Column | Type | Unique | Missing% | FormattedNums |`,
            `|--------|------|--------|----------|---------------|`,
            ...rows,
        ].join('\n'));
    }

    // Section 6 — Data Sample (first 3 rows; lets AI tools see real data format and values)
    const csvRows = state.csvData?.data ?? [];
    const sampleRows = csvRows.slice(0, 3);
    if (sampleRows.length > 0) {
        const sampleCols = Object.keys(sampleRows[0]);
        const truncCell = (v: unknown) => trunc(v, 50);
        const headerRow = `| ${sampleCols.join(' | ')} |`;
        const separatorRow = `| ${sampleCols.map(() => '---').join(' | ')} |`;
        const dataRows = sampleRows.map(row =>
            `| ${sampleCols.map(col => truncCell(row[col] ?? '')).join(' | ')} |`
        );
        sections.push([
            `## Data Sample`,
            ``,
            headerRow,
            separatorRow,
            ...dataRows,
        ].join('\n'));
    }

    // Section 7 — Data Preparation
    const workflow = buildDataPreparationWorkflowBundle(state);
    const prepLines: string[] = [
        `## Data Preparation`,
        ``,
        `- preparationState: ${workflow.summary.preparationState}`,
        `- analysisState: ${workflow.summary.analysisState}`,
        `- warnings: ${workflow.issueSummary.topWarnings.length}`,
        ``,
        ...workflow.steps.map(s => `- **${s.label}** [${s.status}]${s.description ? ': ' + trunc(s.description) : ''}`),
    ];
    sections.push(prepLines.join('\n'));

    // Section 7b — Cleaning Run (status, steps, failures)
    const cleaningRun = state.cleaningRun;
    if (cleaningRun) {
        const failedSteps = cleaningRun.steps.filter(s => s.status === 'error' || s.status === 'blocked');
        const cleaningLines: string[] = [
            `## Cleaning Run`,
            ``,
            `- **status**: ${cleaningRun.status}`,
            `- **steps**: ${cleaningRun.steps.length} total, ${failedSteps.length} failed`,
            `- **loopCount**: ${cleaningRun.loopCount ?? 0}`,
            cleaningRun.strategyKind ? `- **strategyKind**: ${cleaningRun.strategyKind}` : '',
            cleaningRun.lastFailedStage ? `- **lastFailedStage**: ${cleaningRun.lastFailedStage}` : '',
            cleaningRun.lastError ? `- **lastError**: ${trunc(cleaningRun.lastError, 200)}` : '',
            cleaningRun.inspectionStatus
                ? `- **inspectionStatus**: ${cleaningRun.inspectionStatus} (residualUnknown=${cleaningRun.residualUnknownRowCount ?? 0}, residualSummaryLike=${cleaningRun.residualSummaryLikeRowCount ?? 0})`
                : '',
        ];
        if (failedSteps.length > 0) {
            const failedLines = failedSteps.slice(-5).map(s =>
                `  - [${s.status}] ${s.kind}${s.toolName ? ` (${s.toolName})` : ''}${s.diffSummary ? ': ' + trunc(s.diffSummary, 100) : ''}`
            );
            cleaningLines.push(``, `**Failed steps (last ${failedSteps.length}):**\n${failedLines.join('\n')}`);
        }
        sections.push(cleaningLines.filter(Boolean).join('\n'));
    }

    // Section 8 — DuckDB Status
    const duck = state.duckDbSessionStatus;
    if (duck) {
        sections.push([
            `## DuckDB Status`,
            ``,
            `- status: ${duck.status}`,
            `- tableName: ${duck.tableName ?? 'none'}`,
            `- loadVersion: ${duck.loadVersion ?? 'none'}`,
        ].join('\n'));
    }

    // Section 9 — Execution Trace
    const trace = state.visibleAnalysisTrace ?? [];
    if (trace.length > 0) {
        const traceLines = trace.map(t =>
            `${t.stepIndex}. [${t.status}] **${t.label}** — ${trunc(t.summary, 120)}${t.queryPreview ? `\n   SQL: \`${trunc(t.queryPreview, 100)}\`` : ''}${t.result ? `\n   Result: ${trunc(t.result, 100)}` : ''}${t.reasonCodes.length > 0 ? `\n   Codes: ${t.reasonCodes.join(', ')}` : ''}`
        );
        sections.push([`## Execution Trace`, ``, ...traceLines].join('\n'));
    }

    // Section 10 — Analysis Cards (IR Diagnostics)
    const cards = state.analysisCards ?? [];
    const columns = state.columnProfiles ?? [];
    if (cards.length > 0) {
        const irList = buildDisplayAnalysisIrList(cards, columns);
        const currentDatasetVersion = getCurrentAnalysisDatasetVersion(state);
        const irRows = irList.map(ir => {
            const card = cards.find(candidate => candidate.id === ir.cardId);
            const freshness = resolveAnalysisArtifactFreshness(card?.provenance, currentDatasetVersion);
            const provenanceStatus = freshness === 'stale'
                ? 'stale'
                : card?.provenance?.evidenceStatus ?? 'unverified';
            return `| ${trunc(ir.displayTitle, 40)} | ${ir.semanticRole} | ${ir.helperExposureLevel} | ${ir.businessMeaningConfidence?.toFixed(2) ?? '—'} | ${(ir.aggregationQualityFlags ?? []).join(',')} | ${ir.narrativeEligibility} | ${provenanceStatus} | ${trunc(card?.provenance?.datasetVersion ?? '—', 24)} | ${trunc(card?.provenance?.queryEvidence?.traceId ?? '—', 28)} | ${card?.provenance?.evidenceRefs.length ?? 0} |`;
        });
        sections.push([
            `## Analysis Cards (IR Diagnostics)`,
            ``,
            `Current dataset version: ${currentDatasetVersion ?? 'unverified'}`,
            ``,
            `| Title | Role | HelperExposure | BizConfidence | QualityFlags | NarrativeEligible | Provenance | DatasetVersion | QueryTrace | EvidenceRefs |`,
            `|-------|------|----------------|---------------|--------------|-------------------|------------|----------------|------------|--------------|`,
            ...irRows,
        ].join('\n'));
    }

    // Section 11 — Query History (last 10)
    const queryHistory = (state.queryHistory ?? []).slice(-10);
    if (queryHistory.length > 0) {
        const qLines = queryHistory.map((q, i) => [
            `### Query ${i + 1}`,
            `- explanation: ${trunc(q.explanation, 120)}`,
            `- engine: ${q.engine ?? 'unknown'}`,
            q.sqlPreview ? `\`\`\`sql\n${trunc(q.sqlPreview, 200)}\n\`\`\`` : '',
            q.result ? `- result: ${q.result.returnedRows} rows, truncated=${q.result.truncated}` : '',
        ].filter(Boolean).join('\n'));
        sections.push([`## Query History (last ${queryHistory.length})`, ``, ...qLines].join('\n\n'));
    }

    // Section 12 — Runtime Run History (trailing: expendable under 50KB budget)
    const runHistory = state.runtimeRunHistory ?? [];
    if (runHistory.length > 0) {
        sections.push([`## Runtime Run History`, ``, ...runHistory.map(fmtRunRecord)].join('\n\n'));
    }

    // Section 13 — Runtime Events (trailing: expendable under 50KB budget)
    const runtimeEvents = (state.runtimeEvents ?? []).slice(-30);
    if (runtimeEvents.length > 0) {
        sections.push([`## Runtime Events (last ${runtimeEvents.length})`, ``, ...runtimeEvents.map(fmtRuntimeEvent)].join('\n'));
    }

    // Section 14 — Debug Log Timeline (trailing: expendable under 50KB budget)
    const scopedLogs = selectScopedDebugLogEntries(state);
    const logEntries = scopedLogs.entries.slice(-40);
    if (logEntries.length > 0) {
        const logLines = logEntries.map(e =>
            `- [${toIso(e.timestamp)}] **${e.type}** · ${e.label} · ${e.title}${e.subtitle ? ` — ${trunc(e.subtitle, 100)}` : ''}${e.detail ? ` · ${trunc(e.detail, 300)}` : ''}`
        );
        sections.push([`## Debug Log Timeline (last ${logEntries.length})`, ``, ...logLines].join('\n'));
    }

    // Footer (compact — saves ~500 bytes of the 50 KB budget)
    sections.push([
        `## Bundle Guide`,
        ``,
        `Priority order: Errors & Failures → Active Turn → Analysis Session → Harness Directives → Data Schema → Data Sample → Data Preparation → Cleaning Run → DuckDB Status → Execution Trace → Analysis Cards → Query History.`,
        `Trailing sections (Runtime Run History, Runtime Events, Debug Log Timeline) are dropped first when the 50 KB budget is exceeded.`,
    ].join('\n'));

    return finalizeAiDebugBundle(sections);
};
