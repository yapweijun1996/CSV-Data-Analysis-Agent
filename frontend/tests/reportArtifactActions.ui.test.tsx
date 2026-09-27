import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceModal } from '../components/modals/WorkspaceModal';
import { HistoryPanel } from '../components/modals/HistoryPanel';

const { useAppStoreMock, buildWorkspaceBundleMock, getStorageBreakdownMock } = vi.hoisted(() => ({
    useAppStoreMock: vi.fn(),
    buildWorkspaceBundleMock: vi.fn(),
    getStorageBreakdownMock: vi.fn(),
}));

vi.mock('../store/useAppStore', () => ({
    useAppStore: useAppStoreMock,
}));

vi.mock('../services/agent/buildWorkspaceBundle', () => ({
    buildWorkspaceBundle: buildWorkspaceBundleMock,
}));

vi.mock('../services/storageService', () => ({
    CURRENT_SESSION_KEY: 'current_session',
    getStorageBreakdown: getStorageBreakdownMock,
}));

vi.mock('../components/modals/WorkspaceModalEditor', () => ({
    WorkspaceModalEditor: () => <div data-testid="workspace-editor" />,
}));

describe('report artifact action surfaces', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        buildWorkspaceBundleMock.mockReturnValue({
            files: [
                {
                    path: '/workspace/reports/latest-analyst-report.html',
                    label: 'latest-analyst-report.html',
                    content: '<!DOCTYPE html><html><body>Report</body></html>',
                    language: 'markdown',
                    group: 'reports',
                },
            ],
            primaryFiles: [
                {
                    path: '/workspace/reports/latest-analyst-report.html',
                    label: 'latest-analyst-report.html',
                    content: '<!DOCTYPE html><html><body>Report</body></html>',
                    language: 'markdown',
                    group: 'reports',
                },
            ],
            debugFiles: [],
            editableFiles: [],
        });
        getStorageBreakdownMock.mockResolvedValue({
            stores: [],
            cacheStorage: { cacheCount: 0, estimatedBytes: 0 },
            totalIdbBytes: 1024,
            totalWithCacheBytes: 1024,
            rawOriginBytes: 1024,
        });
    });

    afterEach(() => {
        cleanup();
    });

    it('renders workspace modal report actions and wires them to the store', () => {
        const openLatestAnalystReport = vi.fn();
        const exportLatestAnalystReportPdf = vi.fn();
        const state = {
            isWorkspaceModalOpen: true,
            setIsWorkspaceModalOpen: vi.fn(),
            logAgentToolUsage: vi.fn(),
            openLatestAnalystReport,
            exportLatestAnalystReportPdf,
            workspaceFiles: {
                '/workspace/reports/latest-analyst-report.manifest.json': JSON.stringify({
                    reportId: 'report-1',
                    title: 'Executive Revenue Report Analyst Report',
                    generatedAt: '2026-03-14T09:00:00.000Z',
                    artifactStatus: 'ready',
                    generationGate: 'allowed',
                    reportReadiness: 'ready',
                    reportReadinessReason: 'Ready',
                    trustedCardsCount: 1,
                    excludedEvidenceCount: 0,
                    gateReasons: [],
                    llmUsed: true,
                    fallbacksUsed: [],
                    latestFiles: {
                        html: '/workspace/reports/latest-analyst-report.html',
                        manifest: '/workspace/reports/latest-analyst-report.manifest.json',
                        readiness: '/workspace/reports/latest-analyst-report.readiness.json',
                    },
                    archiveFiles: {
                        html: '/workspace/reports/report-1.html',
                        manifest: '/workspace/reports/report-1.manifest.json',
                        readiness: '/workspace/reports/report-1.readiness.json',
                    },
                }),
                '/workspace/reports/latest-analyst-report.html': '<!DOCTYPE html><html><body>Report</body></html>',
            },
            sessionId: 'session-1',
            currentDatasetId: 'dataset-1',
            confirmedAnalysisGoal: null,
            settings: { language: 'English' },
            csvData: null,
            rawCsvData: null,
            initialDataSample: null,
            columnProfiles: [],
            analysisCards: [],
            chatHistory: [],
            dataPreparationPlan: null,
            spreadsheetFilterFunction: null,
            activeSpreadsheetFilter: null,
            aiFilterExplanation: null,
            activeDataQuery: null,
            dataQualityIssues: null,
            finalSummary: null,
            agentEvents: [],
            agentToolLogs: [],
            telemetryEvents: [],
            workspaceActionHistory: [],
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<WorkspaceModal />);

        fireEvent.click(screen.getByRole('button', { name: 'Open Report' }));
        fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));

        expect(openLatestAnalystReport).toHaveBeenCalledTimes(1);
        expect(exportLatestAnalystReportPdf).toHaveBeenCalledTimes(1);
    });

    it('renders history panel report actions and wires them to the store', () => {
        const openPersistedReportArtifact = vi.fn(async () => undefined);
        const exportPersistedReportPdf = vi.fn(async () => undefined);
        const handleLoadReport = vi.fn(async () => undefined);
        const state = {
            isHistoryPanelOpen: true,
            setIsHistoryPanelOpen: vi.fn(),
            reportsList: [
                {
                    id: 'report-1',
                    filename: 'Executive Revenue Report Analyst Report',
                    createdAt: new Date('2026-03-14T09:00:00.000Z'),
                    updatedAt: new Date('2026-03-14T09:10:00.000Z'),
                },
            ],
            handleLoadReport,
            handleDeleteReport: vi.fn(async () => undefined),
            openPersistedReportArtifact,
            exportPersistedReportPdf,
            sessionId: 'session-2',
            settings: { language: 'English' },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<HistoryPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'Resume analysis' }));
        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
        fireEvent.click(screen.getByRole('button', { name: 'Open Report' }));
        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
        fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));

        expect(handleLoadReport).toHaveBeenCalledWith('report-1');
        expect(openPersistedReportArtifact).toHaveBeenCalledWith('report-1');
        expect(exportPersistedReportPdf).toHaveBeenCalledWith('report-1');
    });

    it('hides delete actions for protected current-session aliases in grouped history rows', () => {
        const state = {
            isHistoryPanelOpen: true,
            setIsHistoryPanelOpen: vi.fn(),
            reportsList: [
                {
                    id: 'session-2',
                    filename: 'Executive Revenue Report Analyst Report',
                    createdAt: new Date('2026-03-14T09:00:00.000Z'),
                    updatedAt: new Date('2026-03-14T09:10:00.000Z'),
                },
                {
                    id: 'current_session',
                    filename: 'Executive Revenue Report Analyst Report',
                    createdAt: new Date('2026-03-14T09:00:00.000Z'),
                    updatedAt: new Date('2026-03-14T09:09:00.000Z'),
                },
                {
                    id: 'report-1',
                    filename: 'Executive Revenue Report Analyst Report',
                    createdAt: new Date('2026-03-14T08:00:00.000Z'),
                    updatedAt: new Date('2026-03-14T08:10:00.000Z'),
                },
            ],
            handleLoadReport: vi.fn(async () => undefined),
            handleDeleteReport: vi.fn(async () => undefined),
            openPersistedReportArtifact: vi.fn(async () => undefined),
            exportPersistedReportPdf: vi.fn(async () => undefined),
            sessionId: 'session-2',
            settings: { language: 'English' },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<HistoryPanel />);

        fireEvent.click(screen.getByRole('button', { name: '+2 previous version(s)' }));
        fireEvent.click(screen.getAllByTitle('More actions')[1]);

        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

        fireEvent.click(screen.getAllByTitle('More actions')[2]);

        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it('shows a visible retry state when history storage cannot be read', async () => {
        getStorageBreakdownMock.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
        const state = {
            isHistoryPanelOpen: true,
            setIsHistoryPanelOpen: vi.fn(),
            reportsList: [],
            handleLoadReport: vi.fn(),
            handleDeleteReport: vi.fn(),
            handlePurgeStorage: vi.fn(),
            openPersistedReportArtifact: vi.fn(),
            exportPersistedReportPdf: vi.fn(),
            sessionId: 'session-2',
            settings: { language: 'English' },
            csvData: null,
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<HistoryPanel />);

        expect(await screen.findByRole('alert')).toHaveTextContent('Storage is temporarily unavailable');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(getStorageBreakdownMock).toHaveBeenCalledTimes(2));
        expect(screen.queryByText('0 B')).not.toBeInTheDocument();
    });

    it('labels local storage without implying a fixed capacity limit', async () => {
        getStorageBreakdownMock.mockResolvedValueOnce({
            stores: [],
            cacheStorage: { cacheCount: 0, estimatedBytes: 0 },
            totalIdbBytes: 97_097_728,
            totalWithCacheBytes: 97_097_728,
            rawOriginBytes: 97_097_728,
        });
        const state = {
            isHistoryPanelOpen: true,
            setIsHistoryPanelOpen: vi.fn(),
            reportsList: [],
            handleLoadReport: vi.fn(),
            handleDeleteReport: vi.fn(),
            handlePurgeStorage: vi.fn(),
            openPersistedReportArtifact: vi.fn(),
            exportPersistedReportPdf: vi.fn(),
            sessionId: 'session-2',
            settings: { language: 'English' },
            csvData: null,
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<HistoryPanel />);

        const storageButton = await screen.findByRole('button', { name: /Local data\s+92\.6 MB/ });
        expect(storageButton).toHaveAttribute('title', 'Local browser data uses 92.6 MB. View details.');
        expect(storageButton.querySelector('[class*="bg-amber"]')).not.toBeInTheDocument();
    });
});
