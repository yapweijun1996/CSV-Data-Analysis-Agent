// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    parseReportArtifactManifest,
    resolveLatestReportArtifactStatus,
    hasOpenableLatestReport,
} from '../services/reporting/reportArtifactManifest';

describe('parseReportArtifactManifest', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns null and emits console.warn when value is corrupt JSON', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = parseReportArtifactManifest('{ not valid json ]]]');

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[ReportArtifactManifest]'),
            expect.any(String),
        );
    });

    it('returns null silently when value is null or undefined', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(parseReportArtifactManifest(null)).toBeNull();
        expect(parseReportArtifactManifest(undefined)).toBeNull();
        // No warning expected for intentionally missing values
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('returns a manifest with default reportTemplate when field is absent', () => {
        const raw = JSON.stringify({ reportId: 'r1', title: 'Test Report', artifactStatus: 'ready' });
        const result = parseReportArtifactManifest(raw);
        expect(result).not.toBeNull();
        expect(result?.reportTemplate).toBe('management_review');
        expect(result?.reportId).toBe('r1');
    });

    it('preserves explicit reportTemplate if provided', () => {
        const raw = JSON.stringify({ reportId: 'r2', reportTemplate: 'custom', artifactStatus: 'partial' });
        const result = parseReportArtifactManifest(raw);
        expect(result?.reportTemplate).toBe('custom');
    });
});

describe('resolveLatestReportArtifactStatus', () => {
    const MANIFEST_PATH = '/workspace/reports/latest-analyst-report.manifest.json';

    it('returns null when workspace files are empty', () => {
        expect(resolveLatestReportArtifactStatus({})).toBeNull();
    });

    it('returns the artifactStatus from the manifest', () => {
        const files = {
            [MANIFEST_PATH]: JSON.stringify({ artifactStatus: 'ready', reportTemplate: 'management_review' }),
        };
        expect(resolveLatestReportArtifactStatus(files)).toBe('ready');
    });
});

describe('hasOpenableLatestReport', () => {
    const MANIFEST_PATH = '/workspace/reports/latest-analyst-report.manifest.json';
    const HTML_PATH = '/workspace/reports/latest-analyst-report.html';

    it('returns false when there is no manifest', () => {
        expect(hasOpenableLatestReport({})).toBe(false);
    });

    it('returns false when the manifest artifactStatus is blocked', () => {
        const files = {
            [MANIFEST_PATH]: JSON.stringify({ artifactStatus: 'blocked', reportTemplate: 'management_review' }),
            [HTML_PATH]: '<html></html>',
        };
        expect(hasOpenableLatestReport(files)).toBe(false);
    });

    it('returns true when manifest is ready and HTML file exists', () => {
        const files = {
            [MANIFEST_PATH]: JSON.stringify({ artifactStatus: 'ready', reportTemplate: 'management_review' }),
            [HTML_PATH]: '<html>Report</html>',
        };
        expect(hasOpenableLatestReport(files)).toBe(true);
    });
});
