import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppStore } from '../store/useAppStore';
import { createHistorySlice } from '../store/slices/historySlice';

const {
    getReportMock,
    loadReportArtifactHtmlMock,
    hydrateLatestReportWorkspaceFilesMock,
    openReportArtifactMock,
    printReportArtifactMock,
} = vi.hoisted(() => ({
    getReportMock: vi.fn(),
    loadReportArtifactHtmlMock: vi.fn(),
    hydrateLatestReportWorkspaceFilesMock: vi.fn(async (workspaceFiles: Record<string, string>) => workspaceFiles),
    openReportArtifactMock: vi.fn(() => ({ closed: false })),
    printReportArtifactMock: vi.fn(() => ({ closed: false })),
}));

vi.mock('../services/storageService', () => ({
    getReportsList: vi.fn(async () => []),
    getReport: getReportMock,
    deleteReport: vi.fn(async () => undefined),
    saveReport: vi.fn(async () => undefined),
    CURRENT_SESSION_KEY: 'current_session',
}));

vi.mock('../services/reporting/reportArtifactViewer', () => ({
    openReportArtifact: openReportArtifactMock,
    printReportArtifact: printReportArtifactMock,
}));

vi.mock('../services/reporting/reportArtifactStorage', () => ({
    hydrateLatestReportWorkspaceFiles: hydrateLatestReportWorkspaceFilesMock,
    loadReportArtifactHtml: loadReportArtifactHtmlMock,
}));

vi.mock('../services/vectorStore', () => ({
    vectorStore: {
        clear: vi.fn(),
        schedulePersist: vi.fn(),
        loadFromStorage: vi.fn(async () => false),
    },
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    disposeDuckDbQueryEngine: vi.fn(async () => undefined),
}));

vi.mock('../services/agent/memory/vectorMemorySync', () => ({
    rebuildVectorMemoryFromState: vi.fn(),
}));

const createHarness = (overrides: Record<string, unknown> = {}) => {
    let state = {
        sessionId: 'session-1',
        addProgress: vi.fn(),
        settings: { language: 'Mandarin' },
        csvData: { fileName: 'a.csv', data: [] },
        ...overrides,
    } as unknown as AppStore;

    const setState = (partial: Partial<AppStore> | ((current: AppStore) => Partial<AppStore>)) => {
        const next = typeof partial === 'function' ? partial(state) : partial;
        state = {
            ...state,
            ...next,
        };
    };

    const getState = () => state;
    const slice = createHistorySlice(setState as never, getState as never, {} as never);
    state = {
        ...state,
        ...slice,
    };

    return {
        getState: () => state,
    };
};

describe('historySlice report artifact actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loads archived report html through the artifact store when opening or printing a saved report', async () => {
        getReportMock.mockResolvedValue({
            id: 'report-1',
            filename: 'Executive Revenue Report Analyst Report',
            createdAt: new Date('2026-03-14T09:00:00.000Z'),
            updatedAt: new Date('2026-03-14T09:10:00.000Z'),
            appState: {
                workspaceFiles: {
                    '/workspace/reports/latest-analyst-report.manifest.json': JSON.stringify({
                        reportId: 'artifact-1',
                        artifactStatus: 'ready',
                    }),
                },
            },
        });
        loadReportArtifactHtmlMock.mockResolvedValue('<!DOCTYPE html><html><body>Archive</body></html>');
        const harness = createHarness();

        await harness.getState().openPersistedReportArtifact('report-1');
        await harness.getState().exportPersistedReportPdf('report-1');

        expect(loadReportArtifactHtmlMock).toHaveBeenCalledWith('artifact-1');
        expect(openReportArtifactMock).toHaveBeenCalledWith('<!DOCTYPE html><html><body>Archive</body></html>');
        expect(printReportArtifactMock).toHaveBeenCalledWith('<!DOCTYPE html><html><body>Archive</body></html>');
    });

    it('warns in the user language (not an error) when a loaded analysis has no saved report page', async () => {
        getReportMock.mockResolvedValue({ id: 'report-2', appState: { workspaceFiles: {} } });
        const harness = createHarness();

        await harness.getState().openPersistedReportArtifact('report-2');
        await harness.getState().exportPersistedReportPdf('report-2');

        const calls = (harness.getState().addProgress as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls).toHaveLength(2);
        for (const [text, type] of calls) {
            expect(type).toBe('warning');
            expect(text).toContain('报告');
            expect(text).not.toContain('No saved report artifact');
        }
    });

    it('restores the saved analysis instead of failing when nothing is loaded and no report page exists', async () => {
        getReportMock.mockResolvedValue({ id: 'session-x', appState: { workspaceFiles: {} } });
        const handleLoadReport = vi.fn(async () => undefined);
        const harness = createHarness({ csvData: null, handleLoadReport });
        // The slice spreads its own handleLoadReport over the state; override after creation.
        (harness.getState() as unknown as { handleLoadReport: unknown }).handleLoadReport = handleLoadReport;

        await harness.getState().openPersistedReportArtifact('session-x');

        expect(handleLoadReport).toHaveBeenCalledWith('session-x');
        expect(harness.getState().addProgress).not.toHaveBeenCalled();
    });
});

describe('restored analysis view selection', () => {
    it('keeps the localized read-only restore copy in every locale', async () => {
        const { getTranslation } = await import('../utils/localization');
        for (const language of ['English', 'Mandarin', 'Japanese', 'Malay', 'Vietnamese']) {
            for (const key of ['restored_view_title', 'restored_view_detail', 'restored_view_action']) {
                expect(getTranslation(key, language, { fileName: 'a.csv' })).toBeTruthy();
            }
        }
        expect(getTranslation('restored_view_detail', 'Mandarin', { fileName: 'a.csv' })).toContain('a.csv');
    });
});
