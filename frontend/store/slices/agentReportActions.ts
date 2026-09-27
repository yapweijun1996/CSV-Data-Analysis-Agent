
import { generateAnalystReportArtifacts } from '../../services/reporting/generateAnalystReportArtifacts';
import { buildPersistedReportRecord } from '../../services/persistence/persistedAppState';
import { CURRENT_SESSION_KEY, saveReport } from '../../services/storageService';
import { openReportArtifact, printReportArtifact } from '../../services/reporting/reportArtifactViewer';
import { saveReportArtifacts } from '../../services/reporting/reportArtifactStorage';
import {
    hasOpenableLatestReport,
    LATEST_REPORT_HTML_PATH,
    LATEST_REPORT_MANIFEST_PATH,
    parseReportArtifactManifest,
} from '../../services/reporting/reportArtifactManifest';
import { createChatMessage } from '../../utils/messageState';
import { isRuntimeAbortError } from '../../services/agent/runtime/runtimeAbort';
import { getCurrentAnalysisDatasetVersion } from '../../services/agent/artifactProvenance';

/* ── report generation abort infrastructure ─────────────── */
const REPORT_GENERATION_TIMEOUT_MS = 300_000; // 5 minutes
let reportAbortController: AbortController | null = null;
let reportTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

const cleanupReportAbort = () => {
    if (reportTimeoutHandle) {
        clearTimeout(reportTimeoutHandle);
        reportTimeoutHandle = null;
    }
    reportAbortController = null;
};

/* ── Report action names (for Pick type) ────────────────── */
type ReportActions = {
    generateAnalystReport: () => Promise<void>;
    cancelReportGeneration: () => void;
    openLatestAnalystReport: () => void;
    exportLatestAnalystReportPdf: () => void;
};

/**
 * Creates the 4 report-related actions for the agent slice.
 * Receives `set` and `get` from the Zustand StateCreator so the actions
 * can read/write store state exactly as they did when inlined.
 */
export const createAgentReportActions = (
    set: (fn: ((state: any) => any) | Record<string, unknown>) => void,
    get: () => any,
): ReportActions => ({
    generateAnalystReport: async () => {
        if (get().isGeneratingReport) {
            get().addProgress('Another report or analysis run is already in progress.', 'warning');
            return;
        }

        const state = get();
        if (!state.csvData && !state.rawCsvData) {
            state.addProgress('Cannot generate an analyst report because no dataset is loaded.', 'error');
            return;
        }

        const reportRunId = `report-run-${Date.now()}`;
        let lastRecordedProgress = -1;
        const updateProgress = (progress: { completed: number; total: number; title: string; subtitle: string }) => {
            set({
                reportGenerationProgress: {
                    completed: progress.completed,
                    total: progress.total,
                    mode: 'artifact',
                },
                aiTaskStatus: {
                    status: progress.completed >= progress.total ? 'done' : 'thinking',
                    title: progress.title,
                    subtitle: progress.subtitle,
                    totalSteps: progress.total,
                    currentStep: Math.min(progress.total, Math.max(1, progress.completed || 1)),
                },
            });
            if (progress.completed !== lastRecordedProgress) {
                lastRecordedProgress = progress.completed;
                get().recordAgentEvent({
                    runId: reportRunId,
                    phase: 'execution',
                    step: 'analyst_report_progress',
                    status: progress.completed >= progress.total ? 'done' : 'in_progress',
                    message: progress.subtitle,
                    detail: {
                        completed: progress.completed,
                        total: progress.total,
                    },
                    activity: {
                        kind: 'artifact',
                        lifecycle: progress.completed >= progress.total ? 'completed' : 'running',
                        source: 'artifact',
                        eventType: 'analyst_report_progress',
                        title: progress.title,
                    },
                });
            }
        };

        set({
            isGeneratingReport: true,
            reportGenerationProgress: {
                completed: 0,
                total: 7,
                mode: 'artifact',
            },
            aiTaskStatus: {
                status: 'thinking',
                title: 'Preparing analyst report',
                subtitle: 'Collecting the verified dataset and trusted analysis evidence.',
                totalSteps: 7,
                currentStep: 1,
            },
        });
        state.recordAgentEvent({
            runId: reportRunId,
            phase: 'execution',
            step: 'analyst_report_started',
            status: 'in_progress',
            message: 'Started generating bounded analyst report artifacts from verified evidence.',
            activity: {
                kind: 'artifact',
                lifecycle: 'running',
                source: 'artifact',
                eventType: 'analyst_report_started',
                title: 'Analyst Report Started',
            },
        });

        const controller = new AbortController();
        reportAbortController = controller;
        reportTimeoutHandle = setTimeout(() => {
            controller.abort(new Error('Report generation timed out after 5 minutes.'));
        }, REPORT_GENERATION_TIMEOUT_MS);

        try {
            const artifacts = await generateAnalystReportArtifacts(state, state.settings, {
                onProgress: updateProgress,
                abortSignal: controller.signal,
            });
            await saveReportArtifacts(artifacts.manifest.reportId, artifacts.manifest, artifacts.storedArtifactFiles);

            set((prev: any) => ({
                workspaceFiles: {
                    ...Object.fromEntries(
                        Object.entries(prev.workspaceFiles ?? {}).filter(([path]: [string, unknown]) => !path.startsWith('/workspace/reports/latest-analyst-report.')),
                    ),
                    ...artifacts.workspaceFiles,
                },
                isGeneratingReport: false,
                reportGenerationProgress: null,
                aiTaskStatus: null,
                chatHistory: artifacts.artifactStatus === 'blocked'
                    ? prev.chatHistory
                    : [
                        ...prev.chatHistory,
                        createChatMessage({
                            sender: 'ai',
                            text: `Analyst report ready. Workspace artifacts were saved for ${artifacts.title}, and a history snapshot was archived.`,
                            timestamp: new Date(),
                            type: 'ai_message',
                        }),
                    ],
            }));

            const nextState = get();
            const reportGeneratedAt = Number.isNaN(new Date(artifacts.manifest.generatedAt).getTime())
                ? new Date()
                : new Date(artifacts.manifest.generatedAt);
            const sessionCreatedAt = nextState.sessionCreatedAt ?? reportGeneratedAt;
            if (!nextState.sessionCreatedAt) {
                set({ sessionCreatedAt });
            }

            const currentSessionReport = buildPersistedReportRecord(nextState, {
                id: nextState.sessionId,
                filename: nextState.csvData?.fileName || 'Current Session',
                createdAt: sessionCreatedAt,
            });
            const archivedReport = buildPersistedReportRecord(nextState, {
                id: `report-artifact-${Date.now()}`,
                filename: artifacts.title,
                createdAt: reportGeneratedAt,
            });

            await saveReport(currentSessionReport);
            await saveReport({
                ...currentSessionReport,
                id: CURRENT_SESSION_KEY,
            });
            if (artifacts.artifactStatus !== 'blocked') {
                await saveReport(archivedReport);
            }
            await nextState.loadReportsList();

            if (artifacts.artifactStatus === 'blocked') {
                const blockerSummary = artifacts.manifest.gateReasons.length > 0
                    ? artifacts.manifest.gateReasons.join(' | ')
                    : 'Readiness blockers were recorded in the workspace artifacts.';
                nextState.addProgress(`Analyst report was blocked: ${blockerSummary}`, 'warning');
                nextState.recordAgentEvent({
                    runId: reportRunId,
                    phase: 'execution',
                    step: 'analyst_report_blocked',
                    status: 'error',
                    message: 'Blocked analyst report generation before synthesis.',
                    activity: {
                        kind: 'artifact',
                        lifecycle: 'failed',
                        source: 'artifact',
                        eventType: 'analyst_report_blocked',
                        title: 'Analyst Report Blocked',
                        explanation: blockerSummary,
                    },
                    detail: {
                        reportId: artifacts.manifest.reportId,
                        generationGate: artifacts.manifest.generationGate,
                        trustedCardsCount: artifacts.manifest.trustedCardsCount,
                        excludedEvidenceCount: artifacts.manifest.excludedEvidenceCount,
                        artifactStatus: artifacts.manifest.artifactStatus,
                        gateReasons: artifacts.manifest.gateReasons,
                    },
                });
                return;
            }

            const reportHtml = artifacts.workspaceFiles[LATEST_REPORT_HTML_PATH];
            if (!reportHtml) {
                nextState.addProgress('Analyst report HTML is unavailable.', 'warning');
            }
            nextState.addProgress(`Analyst report generated: "${artifacts.title}".`, 'system');
            nextState.recordAgentEvent({
                runId: reportRunId,
                phase: 'execution',
                step: 'analyst_report_generated',
                status: 'done',
                message: 'Generated bounded analyst report artifacts.',
                activity: {
                    kind: 'artifact',
                    lifecycle: 'completed',
                    source: 'artifact',
                    eventType: 'analyst_report_generated',
                    title: 'Analyst Report Completed',
                },
                detail: {
                    reportId: artifacts.manifest.reportId,
                    title: artifacts.title,
                    htmlPath: LATEST_REPORT_HTML_PATH,
                    irPath: '/workspace/reports/latest-analyst-report.ir.json',
                    generationGate: artifacts.manifest.generationGate,
                    trustedCardsCount: artifacts.manifest.trustedCardsCount,
                    excludedEvidenceCount: artifacts.manifest.excludedEvidenceCount,
                    artifactStatus: artifacts.manifest.artifactStatus,
                },
            });
            if (artifacts.manifest.fallbacksUsed.length > 0) {
                nextState.recordAgentEvent({
                    runId: reportRunId,
                    phase: 'execution',
                    step: 'analyst_report_fallback_used',
                    status: 'done',
                    message: 'Analyst report generation used bounded fallback paths.',
                    activity: {
                        kind: 'artifact',
                        lifecycle: 'degraded',
                        source: 'artifact',
                        eventType: 'analyst_report_fallback_used',
                        title: 'Analyst Report Used Fallbacks',
                    },
                    detail: {
                        reportId: artifacts.manifest.reportId,
                        generationGate: artifacts.manifest.generationGate,
                        trustedCardsCount: artifacts.manifest.trustedCardsCount,
                        excludedEvidenceCount: artifacts.manifest.excludedEvidenceCount,
                        artifactStatus: artifacts.manifest.artifactStatus,
                        fallbacksUsed: artifacts.manifest.fallbacksUsed,
                    },
                });
            }
        } catch (error) {
            const cancelled = isRuntimeAbortError(error, controller.signal);
            const message = cancelled
                ? 'Report generation was cancelled.'
                : error instanceof Error ? error.message : String(error);
            console.error('Analyst report generation failed:', error);
            set({
                isGeneratingReport: false,
                reportGenerationProgress: null,
                aiTaskStatus: cancelled ? null : {
                    status: 'error',
                    title: 'Analyst report failed',
                    subtitle: message,
                    totalSteps: 7,
                    currentStep: 1,
                    error: message,
                },
            });
            get().addProgress(
                cancelled ? 'Report generation cancelled.' : `Analyst report generation failed: ${message}`,
                cancelled ? 'system' : 'error',
            );
            get().recordAgentEvent({
                runId: reportRunId,
                phase: 'execution',
                step: cancelled ? 'analyst_report_cancelled' : 'analyst_report_failed',
                status: cancelled ? 'done' : 'error',
                message: cancelled
                    ? 'Analyst report generation was cancelled.'
                    : 'Failed to generate bounded analyst report artifacts.',
                detail: {
                    error: message,
                },
                activity: {
                    kind: 'artifact',
                    lifecycle: cancelled ? 'cancelled' : 'failed',
                    source: 'artifact',
                    eventType: cancelled ? 'analyst_report_cancelled' : 'analyst_report_failed',
                    title: cancelled ? 'Analyst Report Cancelled' : 'Analyst Report Failed',
                    explanation: message,
                },
            });
        } finally {
            cleanupReportAbort();
        }
    },

    cancelReportGeneration: () => {
        if (reportAbortController && !reportAbortController.signal.aborted) {
            reportAbortController.abort(new Error('Report generation cancelled by user.'));
        }
    },

    openLatestAnalystReport: () => {
        const workspaceFiles = get().workspaceFiles ?? {};
        const manifest = parseReportArtifactManifest(workspaceFiles[LATEST_REPORT_MANIFEST_PATH]);
        if (!manifest || !hasOpenableLatestReport(workspaceFiles)) {
            const message = manifest?.artifactStatus === 'blocked'
                ? 'The latest analyst report is blocked. Review the readiness artifact in the workspace.'
                : 'No analyst report HTML is available to open yet.';
            get().addProgress(message, 'warning');
            return;
        }
        const html = workspaceFiles[LATEST_REPORT_HTML_PATH];

        const openedWindow = openReportArtifact(html);
        if (!openedWindow) {
            get().addProgress('Failed to open the analyst report in a new tab.', 'error');
        }
    },

    exportLatestAnalystReportPdf: () => {
        const workspaceFiles = get().workspaceFiles ?? {};
        const manifest = parseReportArtifactManifest(workspaceFiles[LATEST_REPORT_MANIFEST_PATH]);
        if (!manifest || !hasOpenableLatestReport(workspaceFiles)) {
            const message = manifest?.artifactStatus === 'blocked'
                ? 'The latest analyst report is blocked. Review the readiness artifact in the workspace.'
                : 'No analyst report HTML is available to export yet.';
            get().addProgress(message, 'warning');
            return;
        }
        const state = get();
        const currentDatasetVersion = getCurrentAnalysisDatasetVersion(state);
        if (
            manifest.datasetVersion
            && currentDatasetVersion
            && manifest.datasetVersion !== currentDatasetVersion
        ) {
            state.addProgress(
                'The latest report belongs to an older dataset version. Generate a new report before exporting PDF.',
                'warning',
            );
            return;
        }
        const html = workspaceFiles[LATEST_REPORT_HTML_PATH];

        const openedWindow = printReportArtifact(html);
        if (!openedWindow) {
            get().addProgress('Failed to open the analyst report for PDF export.', 'error');
        }
    },
});
