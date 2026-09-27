import type {
    AnalystMemo,
    ForumSummary,
    ReportArtifactManifest,
    ReportArtifactStatus,
    ReportEvidenceBundle,
    ReportGenerationReadinessArtifact,
    ReportIr,
    Settings,
} from '../../types';
import type { AppStore } from '../../store/useAppStore';
import { buildReportEvidenceBundle } from './buildReportEvidenceBundle';
import { analystRoles } from './analystRoles';
import { generateAnalystMemoWithDiagnostics, type AnalystMemoGenerationResult } from './generateAnalystMemo';
import { generateForumSummaryWithDiagnostics, type ForumSummaryGenerationResult } from './generateForumSummary';
import { buildReportIr } from './buildReportIr';
import { renderHtmlReport } from './renderHtmlReport';
import { validateReportIr } from './validateReportIr';
import {
    LATEST_REPORT_BUNDLE_PATH,
    LATEST_REPORT_FORUM_PATH,
    LATEST_REPORT_HTML_PATH,
    LATEST_REPORT_IR_PATH,
    LATEST_REPORT_MANIFEST_PATH,
    LATEST_REPORT_MEMOS_PATH,
    LATEST_REPORT_READINESS_PATH,
} from './reportArtifactManifest';
import { resolveArtifactStatus } from './reportEvidenceTrust';
import { runReportEvidenceHarness } from './reportEvidenceHarness';

export interface AnalystReportGenerationProgress {
    completed: number;
    total: number;
    title: string;
    subtitle: string;
}

export interface GeneratedAnalystReportArtifacts {
    title: string;
    bundle: ReportEvidenceBundle;
    memos: AnalystMemo[];
    forum: ForumSummary | null;
    ir: ReportIr | null;
    html: string | null;
    manifest: ReportArtifactManifest;
    readinessArtifact: ReportGenerationReadinessArtifact | null;
    artifactStatus: ReportArtifactStatus;
    workspaceFiles: Record<string, string>;
    storedArtifactFiles: Record<string, string>;
}

interface GenerationDependencies {
    buildEvidenceBundle: typeof buildReportEvidenceBundle;
    generateMemo: typeof generateAnalystMemoWithDiagnostics;
    generateForum: typeof generateForumSummaryWithDiagnostics;
    buildIr: typeof buildReportIr;
    renderHtml: typeof renderHtmlReport;
    validateIr: typeof validateReportIr;
}

const defaultDependencies: GenerationDependencies = {
    buildEvidenceBundle: buildReportEvidenceBundle,
    generateMemo: generateAnalystMemoWithDiagnostics,
    generateForum: generateForumSummaryWithDiagnostics,
    buildIr: buildReportIr,
    renderHtml: renderHtmlReport,
    validateIr: validateReportIr,
};

const formatJson = (value: unknown) => JSON.stringify(value, null, 2);

const buildReportId = (bundle: ReportEvidenceBundle): string => {
    const normalizedTimestamp = bundle.generatedAt.replace(/[^0-9]/g, '');
    const datasetSegment = String(bundle.datasetId ?? '').trim() || 'no_dataset';
    return `report.${bundle.sessionId}.${datasetSegment}.${normalizedTimestamp}`;
};

const buildReportTitle = (bundle: ReportEvidenceBundle): string =>
    bundle.dataset.reportTitle || bundle.dataset.fileName
        ? `${bundle.dataset.reportTitle || bundle.dataset.fileName} Analyst Report`
        : 'Analyst Report';

const buildManifest = (
    bundle: ReportEvidenceBundle,
    reportId: string,
    title: string,
    artifactStatus: ReportArtifactStatus,
    fallbacksUsed: string[],
    llmUsed: boolean,
    reportTemplate: Settings['reportTemplate'],
): ReportArtifactManifest => {
    const archivePrefix = `/workspace/reports/${reportId}`;

    return {
        reportId,
        datasetVersion: bundle.dataset.datasetVersion ?? null,
        title,
        generatedAt: bundle.generatedAt,
        artifactStatus,
        generationGate: bundle.dataset.reportGenerationGate,
        reportReadiness: bundle.dataset.reportReadiness,
        reportReadinessReason: bundle.dataset.reportReadinessReason,
        trustedCardsCount: bundle.dataset.trustedCardsCount,
        excludedEvidenceCount: bundle.excludedEvidence.length,
        gateReasons: bundle.dataset.reportGenerationBlockers,
        llmUsed,
        fallbacksUsed,
        reportTemplate,
        latestFiles: {
            html: artifactStatus === 'blocked' ? undefined : LATEST_REPORT_HTML_PATH,
            ir: artifactStatus === 'blocked' ? undefined : LATEST_REPORT_IR_PATH,
            memos: artifactStatus === 'blocked' ? undefined : LATEST_REPORT_MEMOS_PATH,
            forum: artifactStatus === 'blocked' ? undefined : LATEST_REPORT_FORUM_PATH,
            bundle: artifactStatus === 'blocked' ? undefined : LATEST_REPORT_BUNDLE_PATH,
            readiness: LATEST_REPORT_READINESS_PATH,
            manifest: LATEST_REPORT_MANIFEST_PATH,
        },
        archiveFiles: {
            html: artifactStatus === 'blocked' ? undefined : `${archivePrefix}.html`,
            ir: artifactStatus === 'blocked' ? undefined : `${archivePrefix}.ir.json`,
            memos: artifactStatus === 'blocked' ? undefined : `${archivePrefix}.memos.json`,
            forum: artifactStatus === 'blocked' ? undefined : `${archivePrefix}.forum.json`,
            bundle: artifactStatus === 'blocked' ? undefined : `${archivePrefix}.bundle.json`,
            readiness: `${archivePrefix}.readiness.json`,
            manifest: `${archivePrefix}.manifest.json`,
        },
    };
};

const buildReadinessArtifact = (
    bundle: ReportEvidenceBundle,
    reportId: string,
    title: string,
): ReportGenerationReadinessArtifact => ({
    reportId,
    datasetVersion: bundle.dataset.datasetVersion ?? null,
    title,
    generatedAt: bundle.generatedAt,
    reportReadiness: bundle.dataset.reportReadiness,
    reportReadinessReason: bundle.dataset.reportReadinessReason,
    generationGate: bundle.dataset.reportGenerationGate,
    gateReasons: bundle.dataset.reportGenerationBlockers,
    trustedCardsCount: bundle.dataset.trustedCardsCount,
    excludedEvidenceCount: bundle.excludedEvidence.length,
    excludedEvidence: bundle.excludedEvidence,
});

const buildBlockedWorkspaceFiles = (
    readinessArtifact: ReportGenerationReadinessArtifact,
    manifest: ReportArtifactManifest,
): Record<string, string> => ({
    [LATEST_REPORT_MANIFEST_PATH]: formatJson(manifest),
    [LATEST_REPORT_READINESS_PATH]: formatJson(readinessArtifact),
});

const buildAllowedWorkspaceFiles = (
    bundle: ReportEvidenceBundle,
    memos: AnalystMemo[],
    forum: ForumSummary,
    ir: ReportIr,
    html: string,
    readinessArtifact: ReportGenerationReadinessArtifact,
    manifest: ReportArtifactManifest,
): {
    workspaceFiles: Record<string, string>;
    storedArtifactFiles: Record<string, string>;
} => {
    const storedArtifactFiles: Record<string, string> = {
        [LATEST_REPORT_HTML_PATH]: html,
        [LATEST_REPORT_IR_PATH]: formatJson(ir),
        [LATEST_REPORT_MEMOS_PATH]: formatJson(memos),
        [LATEST_REPORT_FORUM_PATH]: formatJson(forum),
        [LATEST_REPORT_BUNDLE_PATH]: formatJson(bundle),
        [LATEST_REPORT_MANIFEST_PATH]: formatJson(manifest),
        [LATEST_REPORT_READINESS_PATH]: formatJson(readinessArtifact),
    };

    if (manifest.archiveFiles.html) storedArtifactFiles[manifest.archiveFiles.html] = html;
    if (manifest.archiveFiles.ir) storedArtifactFiles[manifest.archiveFiles.ir] = formatJson(ir);
    if (manifest.archiveFiles.memos) storedArtifactFiles[manifest.archiveFiles.memos] = formatJson(memos);
    if (manifest.archiveFiles.forum) storedArtifactFiles[manifest.archiveFiles.forum] = formatJson(forum);
    if (manifest.archiveFiles.bundle) storedArtifactFiles[manifest.archiveFiles.bundle] = formatJson(bundle);
    if (manifest.archiveFiles.readiness) storedArtifactFiles[manifest.archiveFiles.readiness] = formatJson(readinessArtifact);
    storedArtifactFiles[manifest.archiveFiles.manifest] = formatJson(manifest);

    return {
        workspaceFiles: {
            [LATEST_REPORT_HTML_PATH]: html,
            [LATEST_REPORT_MANIFEST_PATH]: formatJson(manifest),
            [LATEST_REPORT_READINESS_PATH]: formatJson(readinessArtifact),
        },
        storedArtifactFiles,
    };
};

export const generateAnalystReportArtifacts = async (
    state: AppStore,
    settings: Settings,
    options?: {
        onProgress?: (progress: AnalystReportGenerationProgress) => void;
        dependencies?: Partial<GenerationDependencies>;
        abortSignal?: AbortSignal;
    },
): Promise<GeneratedAnalystReportArtifacts> => {
    const dependencies = {
        ...defaultDependencies,
        ...(options?.dependencies ?? {}),
    };
    const total = 7;
    const updateProgress = (completed: number, title: string, subtitle: string) => {
        options?.onProgress?.({ completed, total, title, subtitle });
    };

    updateProgress(0, 'Building report evidence', 'Collecting the verified dataset, workflow diagnostics, and trusted cards.');
    const bundle = dependencies.buildEvidenceBundle(state);
    if (!bundle) {
        throw new Error('Cannot generate analyst report because no dataset is loaded.');
    }

    const reportId = buildReportId(bundle);
    const title = buildReportTitle(bundle);
    const readinessArtifact = buildReadinessArtifact(bundle, reportId, title);
    const artifactStatus = resolveArtifactStatus(bundle.dataset.reportGenerationGate);

    if (bundle.dataset.reportGenerationGate === 'blocked') {
        const manifest = buildManifest(
            bundle,
            reportId,
            title,
            artifactStatus,
            [],
            false,
            settings.reportTemplate ?? 'management_review',
        );
        const workspaceFiles = buildBlockedWorkspaceFiles(readinessArtifact, manifest);
        const storedArtifactFiles = {
            [LATEST_REPORT_MANIFEST_PATH]: workspaceFiles[LATEST_REPORT_MANIFEST_PATH],
            [LATEST_REPORT_READINESS_PATH]: workspaceFiles[LATEST_REPORT_READINESS_PATH],
            [manifest.archiveFiles.manifest]: workspaceFiles[LATEST_REPORT_MANIFEST_PATH],
            [manifest.archiveFiles.readiness!]: workspaceFiles[LATEST_REPORT_READINESS_PATH],
        };

        updateProgress(2, 'Report blocked', 'Readiness blockers were recorded and the report pipeline stopped before synthesis.');
        return {
            title,
            bundle,
            memos: [],
            forum: null,
            ir: null,
            html: null,
            manifest,
            readinessArtifact,
            artifactStatus,
            workspaceFiles,
            storedArtifactFiles,
        };
    }

    const briefing = runReportEvidenceHarness(bundle);
    const abortSignal = options?.abortSignal;

    const memoResults: AnalystMemoGenerationResult[] = [];
    for (let index = 0; index < analystRoles.length; index += 1) {
        abortSignal?.throwIfAborted();
        const role = analystRoles[index];
        updateProgress(index + 1, `Generating ${role.replace(/_/g, ' ')} memo`, 'Running one bounded analyst role against the shared evidence bundle.');
        memoResults.push(await dependencies.generateMemo(role, bundle, settings, briefing, abortSignal));
    }
    const memos = memoResults.map(result => result.memo);

    abortSignal?.throwIfAborted();
    updateProgress(4, 'Merging forum summary', 'Aggregating the analyst memos into one structured forum summary.');
    const forumResult: ForumSummaryGenerationResult = await dependencies.generateForum(memos, bundle, settings, briefing, abortSignal);
    const forum = forumResult.forum;

    abortSignal?.throwIfAborted();
    updateProgress(5, 'Building report IR', 'Converting evidence, memos, and forum output into a stable report contract.');
    const ir = dependencies.buildIr(bundle, memos, forum);
    const validation = dependencies.validateIr(ir);
    if (!validation.valid) {
        throw new Error(`Report IR validation failed: ${validation.errors.join(' ')}`);
    }

    const llmUsed = memoResults.some(result => result.diagnostics.llmUsed) || forumResult.diagnostics.llmUsed;
    const fallbacksUsed = [
        ...memoResults
            .filter(result => result.diagnostics.usedFallback && result.diagnostics.fallbackReason)
            .map(result => `memo:${result.diagnostics.fallbackReason}`),
        ...(forumResult.diagnostics.usedFallback && forumResult.diagnostics.fallbackReason
            ? [`forum:${forumResult.diagnostics.fallbackReason}`]
            : []),
    ];
    const manifest = buildManifest(
        bundle,
        reportId,
        title,
        artifactStatus,
        fallbacksUsed,
        llmUsed,
        settings.reportTemplate ?? 'management_review',
    );

    updateProgress(6, 'Rendering HTML report', 'Generating the final HTML document and workspace artifacts.');
    const html = dependencies.renderHtml(ir, {
        language: settings.language,
        manifest,
        reportTemplate: settings.reportTemplate ?? 'management_review',
    });
    const { workspaceFiles, storedArtifactFiles } = buildAllowedWorkspaceFiles(
        bundle,
        memos,
        forum,
        ir,
        html,
        readinessArtifact,
        manifest,
    );

    updateProgress(7, 'Report artifacts ready', 'HTML, IR, memo, and forum artifacts have been assembled for workspace and history persistence.');
    return {
        title,
        bundle,
        memos,
        forum,
        ir,
        html,
        manifest,
        readinessArtifact,
        artifactStatus,
        workspaceFiles,
        storedArtifactFiles,
    };
};
