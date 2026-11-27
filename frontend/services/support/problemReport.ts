import type { AppStore } from '../../store/useAppStore';
import { loadMcpServers } from '../storage/mcpServers';
import { loadRecentLocalDiagnostics, redactLocalDiagnosticPayload } from '../observability/localDiagnostics';
import { getConsoleRingEntries } from './consoleRingBuffer';

export const PROBLEM_REPORT_SCHEMA_VERSION = 1;
const MAX_CHAT_TURNS = 20;
const MAX_EVENTS = 50;
const MAX_TEXT = 2000;
const MAX_DETAIL = 1500;
const SAMPLE_ROWS = 5;

type ReportState = Pick<AppStore,
    | 'settings' | 'chatHistory' | 'agentEvents' | 'agentToolLogs' | 'runtimeEvents'
    | 'runtimeRunHistory' | 'csvData' | 'canonicalCsvData' | 'columnProfiles' | 'pipelineOutcome'>;

export interface ProblemReportEnvironment {
    appVersion: string;
    releaseCommit: string;
    userAgent: string;
    language: string;
    timeZone?: string;
    viewport?: string;
    online?: boolean;
    generatedAt?: string;
}

export interface ProblemReportOptions {
    includeSample: boolean;
    /** Optional note the user typed about what went wrong. */
    note?: string;
}

const clip = (text: string, max = MAX_TEXT): string => (text.length > max ? `${text.slice(0, max)}…` : text);
const iso = (value: unknown): string | null => {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    return null;
};
const compactDetail = (detail: unknown): unknown => {
    if (detail === undefined || detail === null) return undefined;
    const redacted = redactLocalDiagnosticPayload(detail);
    let text: string;
    try { text = JSON.stringify(redacted) ?? ''; } catch { return '[unserializable]'; }
    return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL)}…` : redacted;
};
const hostOf = (url: string): string => { try { return new URL(url).host; } catch { return 'invalid-url'; } };

/** Builds the report object. Secrets are never read: only the settings fields listed below are copied. */
export const buildProblemReport = async (
    state: ReportState,
    environment: ProblemReportEnvironment,
    options: ProblemReportOptions,
) => {
    const dataset = state.canonicalCsvData ?? state.csvData;
    const firstRow = dataset?.data?.[0];
    const columnNames = firstRow ? Object.keys(firstRow) : [];
    const profileByName = new Map((state.columnProfiles ?? []).map(profile => [profile.name, profile.type]));
    let localFailures: unknown[] = [];
    try {
        localFailures = (await loadRecentLocalDiagnostics())
            .filter(record => record.outcome === 'failed' || record.outcome === 'blocked')
            .slice(-20)
            .map(record => ({
                at: record.recordedAt, phase: record.phase, tool: record.tool, outcome: record.outcome,
                reasonCode: record.reasonCode, model: record.model, durationMs: record.durationMs,
                payload: compactDetail(record.payload),
            }));
    } catch { /* IndexedDB can be unavailable; the rest of the report is still useful. */ }

    let mcpServers: unknown[] = [];
    try {
        mcpServers = loadMcpServers().map(server => ({
            host: hostOf(server.url), auth: server.auth, enabled: server.enabled, version: server.version,
        }));
    } catch { /* localStorage may be blocked. */ }

    const report = {
        schemaVersion: PROBLEM_REPORT_SCHEMA_VERSION,
        generatedAt: environment.generatedAt ?? new Date().toISOString(),
        userNote: options.note?.trim() ? clip(options.note.trim()) : null,
        release: { appVersion: environment.appVersion, commit: environment.releaseCommit },
        browser: {
            userAgent: environment.userAgent, locale: environment.language, timeZone: environment.timeZone ?? null,
            viewport: environment.viewport ?? null, online: environment.online ?? null,
        },
        ai: {
            provider: state.settings?.provider ?? 'default',
            chatModel: state.settings?.simpleModel ?? null,
            analysisModel: state.settings?.complexModel ?? null,
            fallbackModel: state.settings?.fallbackModel ?? null,
            reasoningEffort: state.settings?.reasoningEffort ?? null,
            uiLanguage: state.settings?.language ?? null,
        },
        mcpServers,
        dataset: dataset ? {
            fileName: dataset.fileName,
            rowCount: dataset.backing?.rowCount ?? dataset.data.length,
            columnCount: columnNames.length,
            columns: columnNames.map(name => ({ name, type: profileByName.get(name) ?? null })),
            sampleRows: options.includeSample ? redactLocalDiagnosticPayload(dataset.data.slice(0, SAMPLE_ROWS)) : null,
        } : null,
        pipelineOutcome: compactDetail(state.pipelineOutcome ?? undefined) ?? null,
        conversation: (state.chatHistory ?? []).slice(-MAX_CHAT_TURNS).map(message => ({
            at: iso(message.timestamp), sender: message.sender, type: message.type ?? 'user_message',
            isError: Boolean(message.isError), text: clip(String(redactLocalDiagnosticPayload(message.text ?? ''))),
        })),
        agentEvents: (state.agentEvents ?? []).slice(-MAX_EVENTS).map(event => ({
            at: iso(event.timestamp), phase: event.phase, step: event.step, status: event.status,
            message: clip(String(redactLocalDiagnosticPayload(event.message ?? '')), 500), detail: compactDetail(event.detail),
        })),
        toolCalls: (state.agentToolLogs ?? []).slice(-MAX_EVENTS).map(log => ({
            at: iso(log.timestamp), tool: log.tool, stage: log.stage ?? null, description: clip(String(redactLocalDiagnosticPayload(log.description ?? '')), 500),
            policyDecision: log.policyDecision ?? null, detail: compactDetail(log.detail),
        })),
        runtimeEvents: (state.runtimeEvents ?? []).slice(-MAX_EVENTS).map(event => {
            const raw = event as unknown as Record<string, unknown>;
            return {
                at: iso(raw.timestamp ?? raw.createdAt), type: event.type, stage: raw.stage ?? null,
                reason: raw.reason ?? null, failureClass: raw.failureClass ?? null, detail: compactDetail(raw.detail),
            };
        }),
        runs: (state.runtimeRunHistory ?? []).slice(-10).map(run => ({
            at: iso(run.createdAt), lifecycleState: run.lifecycleState, outcomeKind: run.outcomeKind,
            failureClass: run.failureClass ?? null, reason: run.reason ?? null, retryCount: run.retryCount,
            tools: run.toolSequence, summary: run.finalObservationSummary ? clip(String(redactLocalDiagnosticPayload(run.finalObservationSummary)), 800) : null,
        })),
        localFailures,
        consoleErrors: getConsoleRingEntries(),
        privacy: {
            containsApiKeysOrTokens: false,
            containsRawRows: options.includeSample,
            automaticUpload: false,
        },
    };
    return redactLocalDiagnosticPayload(report) as typeof report;
};

export type ProblemReport = Awaited<ReturnType<typeof buildProblemReport>>;

export interface ProblemReportSummary {
    release: string;
    provider: string;
    dataset: string;
    errorCount: number;
    lastError: string | null;
    counts: { conversation: number; events: number; toolCalls: number; consoleErrors: number };
}

/** Short human-readable digest shown above the raw JSON so users can see what they are sending. */
export const summarizeProblemReport = (report: ProblemReport): ProblemReportSummary => {
    const errorMessages = [
        ...report.conversation.filter(m => m.isError).map(m => m.text),
        ...report.agentEvents.filter(e => e.status === 'error').map(e => e.message),
        ...report.consoleErrors.filter(e => e.level !== 'warn').map(e => e.message),
    ];
    return {
        release: `${report.release.appVersion} (${report.release.commit})`,
        provider: [report.ai.provider, report.ai.analysisModel, report.ai.reasoningEffort].filter(Boolean).join(' · '),
        dataset: report.dataset ? `${report.dataset.fileName} · ${report.dataset.rowCount} × ${report.dataset.columnCount}` : '—',
        errorCount: errorMessages.length,
        lastError: errorMessages.length ? clip(errorMessages[errorMessages.length - 1], 300) : null,
        counts: {
            conversation: report.conversation.length, events: report.agentEvents.length + report.runtimeEvents.length,
            toolCalls: report.toolCalls.length, consoleErrors: report.consoleErrors.length,
        },
    };
};

export const problemReportFileName = (generatedAt: string): string =>
    `csv-analysis-problem-report-${generatedAt.replace(/[:.]/g, '-')}.json`;
