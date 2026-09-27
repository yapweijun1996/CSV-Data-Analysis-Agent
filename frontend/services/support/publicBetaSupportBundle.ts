import type { AppStore } from '../../store/useAppStore';
import type { CardTrustStatus } from '../../types';
import { getCurrentAnalysisDatasetVersion } from '../agent/artifactProvenance';
import { resolveCardTrustDecision } from '../agent/cardTrustDecision';

const SUPPORT_BUNDLE_SCHEMA_VERSION = 1;
const MAX_RECENT_FAILURES = 20;
const MAX_RECENT_RUNTIME_EVENTS = 30;
const DIAGNOSTIC_CODE_PATTERN = /^[a-z0-9][a-z0-9_.:/-]{0,99}$/i;

type PublicBetaSupportState = Pick<
    AppStore,
    | 'agentEvents'
    | 'analysisCards'
    | 'canonicalCsvData'
    | 'csvData'
    | 'pipelineOutcome'
    | 'runtimeEvents'
    | 'runtimeRunHistory'
    | 'settings'
>;

const countTrustStates = (
    state: PublicBetaSupportState,
): Record<CardTrustStatus, number> => {
    const counts: Record<CardTrustStatus, number> = {
        verified: 0,
        caveated: 0,
        unverified: 0,
        stale: 0,
        weak: 0,
    };
    const currentVersion = getCurrentAnalysisDatasetVersion(state);
    for (const card of state.analysisCards ?? []) {
        counts[resolveCardTrustDecision(card, currentVersion).status] += 1;
    }
    return counts;
};

const getFailureCode = (event: AppStore['agentEvents'][number]): string | null => {
    const code = event.detail?.failureStage ?? event.detail?.reasonCode;
    return typeof code === 'string' && DIAGNOSTIC_CODE_PATTERN.test(code)
        ? code
        : null;
};

const diagnosticCode = (value: unknown): string | null =>
    typeof value === 'string' && DIAGNOSTIC_CODE_PATTERN.test(value)
        ? value
        : null;

const boundedNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.round(value)
        : null;

const runtimeOutcome = (type: string): string => {
    if (type === 'turn_completed') return 'succeeded';
    if (type === 'turn_cancelled') return 'cancelled';
    if (type === 'turn_blocked') return 'blocked';
    if (type === 'turn_failed' || type === 'action_execution_error') return 'failed';
    return 'started';
};

/**
 * Builds the only bundle intended for public support tickets.
 *
 * It intentionally excludes file names, row values, column names, prompts,
 * chat, SQL, query results, API keys, session IDs, dataset IDs, and free-form
 * error messages. Detailed developer exports remain local-only advanced tools.
 */
export const buildPublicBetaSupportBundle = (
    state: PublicBetaSupportState,
    environment: {
        appVersion: string;
        releaseCommit: string;
        userAgent: string;
        language: string;
        generatedAt?: string;
    },
): string => {
    const dataset = state.canonicalCsvData ?? state.csvData;
    const failures = (state.agentEvents ?? [])
        .filter(event => event.status === 'error')
        .slice(-MAX_RECENT_FAILURES)
        .map(event => ({
            phase: diagnosticCode(event.phase),
            step: diagnosticCode(event.step),
            code: getFailureCode(event),
        }));
    const runtimeEvents = (state.runtimeEvents ?? [])
        .slice(-MAX_RECENT_RUNTIME_EVENTS)
        .map(event => ({
            phase: diagnosticCode(event.stage) ?? 'runtime',
            attempt: boundedNumber(event.detail?.retryAttempt ?? event.detail?.attempt) ?? 1,
            tool: diagnosticCode(event.detail?.toolName) ?? diagnosticCode(event.type),
            durationMs: boundedNumber(event.detail?.durationMs),
            outcome: runtimeOutcome(event.type),
            reasonCode: diagnosticCode(event.detail?.reasonCode)
                ?? diagnosticCode(event.reason)
                ?? diagnosticCode(event.failureClass)
                ?? diagnosticCode(event.type),
            failureClass: diagnosticCode(event.failureClass),
        }));

    const payload = {
        schemaVersion: SUPPORT_BUNDLE_SCHEMA_VERSION,
        generatedAt: environment.generatedAt ?? new Date().toISOString(),
        release: {
            appVersion: environment.appVersion,
            commit: environment.releaseCommit,
        },
        browser: {
            userAgent: environment.userAgent,
            language: environment.language,
        },
        provider: {
            kind: diagnosticCode(state.settings?.provider) ?? 'default',
            chatModel: diagnosticCode(state.settings?.simpleModel),
            analysisModel: diagnosticCode(state.settings?.complexModel),
        },
        datasetShape: dataset
            ? {
                rowCount: dataset.data.length,
                columnCount: dataset.data[0] ? Object.keys(dataset.data[0]).length : 0,
            }
            : null,
        pipeline: state.pipelineOutcome
            ? {
                status: diagnosticCode(state.pipelineOutcome.status),
                severity: diagnosticCode(state.pipelineOutcome.severity),
                reasonCode: diagnosticCode(state.pipelineOutcome.reasonCode),
            }
            : null,
        cards: {
            total: state.analysisCards?.length ?? 0,
            trustStates: countTrustStates(state),
        },
        recentFailures: failures,
        runtime: {
            recentEvents: runtimeEvents,
            recentRuns: (state.runtimeRunHistory ?? []).slice(-10).map(run => ({
                outcomeKind: diagnosticCode(run.outcomeKind),
                lifecycleState: diagnosticCode(run.lifecycleState),
                retryCount: run.retryCount,
                failureClass: diagnosticCode(run.failureClass),
                recoveryStatus: diagnosticCode(
                    run.recoveryTrace?.recoveryStatus,
                ),
            })),
        },
        privacy: {
            containsRawRows: false,
            containsColumnNames: false,
            containsFileName: false,
            containsPromptsOrChat: false,
            containsSqlOrQueryResults: false,
            containsCredentials: false,
            automaticUpload: false,
        },
    };

    return [
        '# Public Beta Sanitized Support Bundle',
        '',
        'Review this local file before attaching it to a public GitHub issue.',
        'It contains environment metadata, counts, lifecycle states, and reason codes only.',
        '',
        '```json',
        JSON.stringify(payload, null, 2),
        '```',
    ].join('\n');
};
