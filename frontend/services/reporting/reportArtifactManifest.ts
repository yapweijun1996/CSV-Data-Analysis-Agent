import type { ReportArtifactManifest, ReportArtifactStatus } from '../../types';

export const LATEST_REPORT_HTML_PATH = '/workspace/reports/latest-analyst-report.html';
export const LATEST_REPORT_IR_PATH = '/workspace/reports/latest-analyst-report.ir.json';
export const LATEST_REPORT_MEMOS_PATH = '/workspace/reports/latest-analyst-report.memos.json';
export const LATEST_REPORT_FORUM_PATH = '/workspace/reports/latest-analyst-report.forum.json';
export const LATEST_REPORT_BUNDLE_PATH = '/workspace/reports/latest-analyst-report.bundle.json';
export const LATEST_REPORT_MANIFEST_PATH = '/workspace/reports/latest-analyst-report.manifest.json';
export const LATEST_REPORT_READINESS_PATH = '/workspace/reports/latest-analyst-report.readiness.json';

export const parseReportArtifactManifest = (
    value: string | null | undefined,
): ReportArtifactManifest | null => {
    if (!value) {
        return null;
    }

    try {
        const manifest = JSON.parse(value) as Partial<ReportArtifactManifest>;
        return {
            ...manifest,
            reportTemplate: manifest.reportTemplate ?? 'management_review',
        } as ReportArtifactManifest;
    } catch (error) {
        console.warn('[ReportArtifactManifest] parseReportArtifactManifest: manifest JSON is corrupt or incompatible. Report viewer will degrade gracefully.', String(error));
        return null;
    }
};

export const resolveLatestReportArtifactStatus = (
    workspaceFiles: Record<string, string> | null | undefined,
): ReportArtifactStatus | null => {
    const manifest = parseReportArtifactManifest(workspaceFiles?.[LATEST_REPORT_MANIFEST_PATH]);
    return manifest?.artifactStatus ?? null;
};

export interface ReportBlockedInfo {
    blocked: true;
    reasons: string[];
    trustedCardsCount: number;
    excludedEvidenceCount: number;
}

export const resolveLatestReportBlockedInfo = (
    workspaceFiles: Record<string, string> | null | undefined,
): ReportBlockedInfo | null => {
    const manifest = parseReportArtifactManifest(workspaceFiles?.[LATEST_REPORT_MANIFEST_PATH]);
    if (!manifest || manifest.artifactStatus !== 'blocked') {
        return null;
    }
    return {
        blocked: true,
        reasons: manifest.gateReasons,
        trustedCardsCount: manifest.trustedCardsCount,
        excludedEvidenceCount: manifest.excludedEvidenceCount,
    };
};

export const isLatestReportPartial = (
    workspaceFiles: Record<string, string> | null | undefined,
): boolean => {
    const manifest = parseReportArtifactManifest(workspaceFiles?.[LATEST_REPORT_MANIFEST_PATH]);
    return manifest?.artifactStatus === 'partial';
};

export const hasOpenableLatestReport = (
    workspaceFiles: Record<string, string> | null | undefined,
): boolean => {
    const manifest = parseReportArtifactManifest(workspaceFiles?.[LATEST_REPORT_MANIFEST_PATH]);
    if (!manifest) {
        return false;
    }

    if (manifest.artifactStatus === 'blocked') {
        return false;
    }

    return Boolean(workspaceFiles?.[LATEST_REPORT_HTML_PATH]);
};
