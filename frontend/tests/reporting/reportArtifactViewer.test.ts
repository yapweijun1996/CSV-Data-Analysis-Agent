import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { openReportArtifact, printReportArtifact } from '../../services/reporting/reportArtifactViewer';

describe('reportArtifactViewer', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalOpen = window.open;

    beforeEach(() => {
        vi.restoreAllMocks();
        URL.createObjectURL = vi.fn(() => 'blob:report-artifact');
        URL.revokeObjectURL = vi.fn();
        window.open = vi.fn(() => window);
    });

    afterEach(() => {
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
        window.open = originalOpen;
    });

    it('opens report html in a new tab', () => {
        const result = openReportArtifact('<!DOCTYPE html><html><body>Report</body></html>');

        expect(result).toBe(window);
        expect(window.open).toHaveBeenCalledWith('blob:report-artifact', '_blank', 'noopener,noreferrer');
    });

    it('opens report html in print mode with hash-based auto print', () => {
        const result = printReportArtifact('<!DOCTYPE html><html><body>Report</body></html>');

        expect(result).toBe(window);
        expect(window.open).toHaveBeenCalledWith('blob:report-artifact#print', '_blank', 'noopener,noreferrer');
    });
});
