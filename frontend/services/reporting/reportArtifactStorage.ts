import type { ReportArtifactManifest, StoredReportArtifactRecord } from '../../types';
import { getReportArtifactRecord, saveReportArtifactRecord } from '../storageService';
import {
    LATEST_REPORT_HTML_PATH,
    LATEST_REPORT_MANIFEST_PATH,
    LATEST_REPORT_READINESS_PATH,
    parseReportArtifactManifest,
} from './reportArtifactManifest';

export const saveReportArtifacts = async (
    reportId: string,
    manifest: ReportArtifactManifest,
    files: Record<string, string>,
): Promise<void> => {
    const record: StoredReportArtifactRecord = {
        reportId,
        generatedAt: manifest.generatedAt,
        manifest,
        files,
    };

    await saveReportArtifactRecord(record);
};

export const loadReportArtifacts = async (reportId: string): Promise<StoredReportArtifactRecord | null> => {
    return (await getReportArtifactRecord(reportId)) ?? null;
};

export const loadReportArtifactHtml = async (reportId: string): Promise<string | null> => {
    const record = await loadReportArtifacts(reportId);
    if (!record) {
        return null;
    }

    const htmlPath = record.manifest.archiveFiles.html ?? record.manifest.latestFiles.html;
    if (!htmlPath) {
        return null;
    }

    return record.files[htmlPath] ?? null;
};

export const hydrateLatestReportWorkspaceFiles = async (
    workspaceFiles: Record<string, string> | null | undefined,
): Promise<Record<string, string>> => {
    const nextFiles = { ...(workspaceFiles ?? {}) };
    const manifest = parseReportArtifactManifest(nextFiles[LATEST_REPORT_MANIFEST_PATH]);
    if (!manifest) {
        return nextFiles;
    }

    const record = await loadReportArtifacts(manifest.reportId);
    if (!record) {
        return nextFiles;
    }

    if (manifest.artifactStatus !== 'blocked') {
        const latestHtmlPath = manifest.latestFiles.html ?? LATEST_REPORT_HTML_PATH;
        const archivedHtmlPath = manifest.archiveFiles.html ?? latestHtmlPath;
        const html = record.files[latestHtmlPath] ?? record.files[archivedHtmlPath];
        if (html) {
            nextFiles[LATEST_REPORT_HTML_PATH] = html;
        }
    }

    const readinessPath = manifest.latestFiles.readiness ?? LATEST_REPORT_READINESS_PATH;
    if (record.files[readinessPath]) {
        nextFiles[LATEST_REPORT_READINESS_PATH] = record.files[readinessPath];
    }

    nextFiles[LATEST_REPORT_MANIFEST_PATH] = JSON.stringify(record.manifest, null, 2);
    return nextFiles;
};
