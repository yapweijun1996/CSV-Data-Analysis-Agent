import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppStore } from '../store/useAppStore';
import { createAgentSlice } from '../store/slices/agentSlice';

const {
    saveReportMock,
    saveReportArtifactsMock,
    buildPersistedReportRecordMock,
    generateAnalystReportArtifactsMock,
    openReportArtifactMock,
    printReportArtifactMock,
} = vi.hoisted(() => ({
    saveReportMock: vi.fn(async () => undefined),
    saveReportArtifactsMock: vi.fn(async () => undefined),
    buildPersistedReportRecordMock: vi.fn((state: AppStore, options: { id: string; filename: string; createdAt?: Date }) => ({
        id: options.id,
        filename: options.filename,
        createdAt: options.createdAt ?? new Date('2026-03-14T09:00:00.000Z'),
        updatedAt: new Date('2026-03-14T09:00:00.000Z'),
        appState: {
            sessionId: state.sessionId,
        },
    })),
    generateAnalystReportArtifactsMock: vi.fn(),
    openReportArtifactMock: vi.fn(() => ({ closed: false })),
    printReportArtifactMock: vi.fn(() => ({ closed: false })),
}));

vi.mock('../services/storageService', () => ({
    CURRENT_SESSION_KEY: 'current_session',
    saveReport: saveReportMock,
}));

vi.mock('../services/persistence/persistedAppState', () => ({
    buildPersistedReportRecord: buildPersistedReportRecordMock,
}));

vi.mock('../services/reporting/generateAnalystReportArtifacts', () => ({
    generateAnalystReportArtifacts: generateAnalystReportArtifactsMock,
}));

vi.mock('../services/reporting/reportArtifactStorage', () => ({
    saveReportArtifacts: saveReportArtifactsMock,
}));

vi.mock('../services/reporting/reportArtifactViewer', () => ({
    openReportArtifact: openReportArtifactMock,
    printReportArtifact: printReportArtifactMock,
}));

const createManifest = (overrides?: Record<string, unknown>) => ({
    reportId: 'report.session-1.dataset-1.20260314090000000',
    title: 'Executive Revenue Report Analyst Report',
    generatedAt: '2026-03-14T09:15:00.000Z',
    artifactStatus: 'ready',
    generationGate: 'allowed',
    reportReadiness: 'ready',
    reportReadinessReason: 'Ready',
    trustedCardsCount: 1,
    excludedEvidenceCount: 0,
    gateReasons: [],
    llmUsed: true,
    fallbacksUsed: [],
    reportTemplate: 'management_review',
    latestFiles: {
        html: '/workspace/reports/latest-analyst-report.html',
        manifest: '/workspace/reports/latest-analyst-report.manifest.json',
        readiness: '/workspace/reports/latest-analyst-report.readiness.json',
    },
    archiveFiles: {
        html: '/workspace/reports/report.session-1.dataset-1.20260314090000000.html',
        manifest: '/workspace/reports/report.session-1.dataset-1.20260314090000000.manifest.json',
        readiness: '/workspace/reports/report.session-1.dataset-1.20260314090000000.readiness.json',
    },
    ...overrides,
});

const createReadyArtifacts = () => {
    const manifest = createManifest();
    return {
        title: 'Executive Revenue Report Analyst Report',
        bundle: {} as never,
        memos: [],
        forum: null,
        ir: {
            reportId: 'report.session-1.dataset-1.20260314090000000',
            generatedAt: '2026-03-14T09:15:00.000Z',
        },
        html: '<!DOCTYPE html><html><body>Report</body></html>',
        manifest,
        readinessArtifact: {
            reportId: manifest.reportId,
            title: manifest.title,
            generatedAt: manifest.generatedAt,
            reportReadiness: manifest.reportReadiness,
            reportReadinessReason: manifest.reportReadinessReason,
            generationGate: manifest.generationGate,
            gateReasons: manifest.gateReasons,
            trustedCardsCount: manifest.trustedCardsCount,
            excludedEvidenceCount: manifest.excludedEvidenceCount,
            excludedEvidence: [],
        },
        artifactStatus: 'ready',
        workspaceFiles: {
            '/workspace/reports/latest-analyst-report.html': '<!DOCTYPE html><html><body>Report</body></html>',
            '/workspace/reports/latest-analyst-report.manifest.json': JSON.stringify(manifest),
            '/workspace/reports/latest-analyst-report.readiness.json': '{"generationGate":"allowed"}',
        },
        storedArtifactFiles: {
            '/workspace/reports/latest-analyst-report.html': '<!DOCTYPE html><html><body>Report</body></html>',
            '/workspace/reports/report.session-1.dataset-1.20260314090000000.html': '<!DOCTYPE html><html><body>Report</body></html>',
        },
    };
};

const createBlockedArtifacts = () => {
    const manifest = createManifest({
        artifactStatus: 'blocked',
        generationGate: 'blocked',
        reportReadiness: 'partial',
        reportReadinessReason: 'Partial',
        trustedCardsCount: 0,
        excludedEvidenceCount: 1,
        gateReasons: ['No trusted report evidence cards qualified for analyst reporting.'],
        latestFiles: {
            manifest: '/workspace/reports/latest-analyst-report.manifest.json',
            readiness: '/workspace/reports/latest-analyst-report.readiness.json',
        },
        archiveFiles: {
            manifest: '/workspace/reports/report.session-1.dataset-1.20260314090000000.manifest.json',
            readiness: '/workspace/reports/report.session-1.dataset-1.20260314090000000.readiness.json',
        },
    });

    return {
        title: 'Executive Revenue Report Analyst Report',
        bundle: {} as never,
        memos: [],
        forum: null,
        ir: null,
        html: null,
        manifest,
        readinessArtifact: {
            reportId: manifest.reportId,
            title: manifest.title,
            generatedAt: manifest.generatedAt,
            reportReadiness: manifest.reportReadiness,
            reportReadinessReason: manifest.reportReadinessReason,
            generationGate: manifest.generationGate,
            gateReasons: manifest.gateReasons,
            trustedCardsCount: manifest.trustedCardsCount,
            excludedEvidenceCount: manifest.excludedEvidenceCount,
            excludedEvidence: [],
        },
        artifactStatus: 'blocked',
        workspaceFiles: {
            '/workspace/reports/latest-analyst-report.manifest.json': JSON.stringify(manifest),
            '/workspace/reports/latest-analyst-report.readiness.json': '{"generationGate":"blocked"}',
        },
        storedArtifactFiles: {
            '/workspace/reports/latest-analyst-report.manifest.json': JSON.stringify(manifest),
        },
    };
};

const createHarness = () => {
    let state = {
        sessionId: 'session-1',
        sessionCreatedAt: new Date('2026-03-14T08:00:00.000Z'),
        settings: {
            provider: 'google',
            geminiApiKey: 'key',
            openAIApiKey: '',
            simpleModel: 'gemini-3-flash-preview',
            complexModel: 'gemini-3-flash-preview',
            language: 'English',
            reportTemplate: 'management_review',
            autoConfirmGoal: true,
            runtimeAccessControl: {
                permissionMode: 'open',
                toolOverrides: {},
                workspaceRules: { deniedPathPrefixes: [] },
            },
        },
        csvData: {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 1200 }],
            metadataRows: [],
            summaryRows: [],
            headerDepth: 1,
        },
        rawCsvData: {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: '1200' }],
            metadataRows: [],
            summaryRows: [],
            headerDepth: 1,
        },
        isGeneratingReport: false,
        reportGenerationProgress: null,
        aiTaskStatus: null,
        workspaceFiles: {},
        chatHistory: [],
        progressMessages: [],
        setIsWorkspaceModalOpen: vi.fn(),
        loadReportsList: vi.fn(async () => undefined),
        addProgress: vi.fn(),
    } as unknown as AppStore;

    const setState = (partial: Partial<AppStore> | ((current: AppStore) => Partial<AppStore>)) => {
        const next = typeof partial === 'function' ? partial(state) : partial;
        state = {
            ...state,
            ...next,
        };
    };

    const getState = () => state;
    const slice = createAgentSlice(setState as never, getState as never, {} as never);
    state = {
        ...state,
        ...slice,
    };

    return {
        getState: () => state,
    };
};

describe('agentSlice generateAnalystReport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        generateAnalystReportArtifactsMock.mockResolvedValue(createReadyArtifacts());
    });

    it('persists allowed analyst report artifacts into workspace, artifact storage, and history without auto-opening the report', async () => {
        const harness = createHarness();

        await harness.getState().generateAnalystReport();
        harness.getState().syncTelemetryToStore();

        expect(generateAnalystReportArtifactsMock).toHaveBeenCalledTimes(1);
        expect(generateAnalystReportArtifactsMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ reportTemplate: 'management_review' }),
            expect.anything(),
        );
        expect(saveReportArtifactsMock).toHaveBeenCalledTimes(1);
        expect(harness.getState().workspaceFiles['/workspace/reports/latest-analyst-report.html']).toContain('<!DOCTYPE html>');
        expect(saveReportMock).toHaveBeenCalledTimes(3);
        expect(harness.getState().loadReportsList).toHaveBeenCalledTimes(1);
        expect(openReportArtifactMock).not.toHaveBeenCalled();
        expect(harness.getState().setIsWorkspaceModalOpen).not.toHaveBeenCalled();
        expect(harness.getState().isGeneratingReport).toBe(false);
        expect(harness.getState().reportGenerationProgress).toBeNull();
        expect(harness.getState().chatHistory.at(-1)?.text).toContain('Analyst report ready.');
        expect(harness.getState().addProgress).toHaveBeenCalledWith(
            'Analyst report generated: "Executive Revenue Report Analyst Report".',
            'system',
        );
        expect(buildPersistedReportRecordMock).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({
            createdAt: new Date('2026-03-14T08:00:00.000Z'),
        }));
        expect(buildPersistedReportRecordMock).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
            createdAt: new Date('2026-03-14T09:15:00.000Z'),
        }));
        expect(harness.getState().agentEvents.some(event => event.step === 'analyst_report_generated')).toBe(true);
    });

    it('opens and prints the latest analyst report only when manifest and html are both present', () => {
        const harness = createHarness();
        const manifest = createManifest();
        harness.getState().workspaceFiles = {
            '/workspace/reports/latest-analyst-report.manifest.json': JSON.stringify(manifest),
            '/workspace/reports/latest-analyst-report.html': '<!DOCTYPE html><html><body>Report</body></html>',
        };

        harness.getState().openLatestAnalystReport();
        harness.getState().exportLatestAnalystReportPdf();

        expect(openReportArtifactMock).toHaveBeenCalledWith('<!DOCTYPE html><html><body>Report</body></html>');
        expect(printReportArtifactMock).toHaveBeenCalledWith('<!DOCTYPE html><html><body>Report</body></html>');
    });

    it('refuses to export a PDF from a stale dataset version', () => {
        const harness = createHarness();
        const manifest = createManifest({ datasetVersion: 'version-obsolete' });
        harness.getState().workspaceFiles = {
            '/workspace/reports/latest-analyst-report.manifest.json': JSON.stringify(manifest),
            '/workspace/reports/latest-analyst-report.html': '<!DOCTYPE html><html><body>Old report</body></html>',
        };

        harness.getState().exportLatestAnalystReportPdf();

        expect(printReportArtifactMock).not.toHaveBeenCalled();
        expect(harness.getState().addProgress).toHaveBeenCalledWith(
            expect.stringContaining('older dataset version'),
            'warning',
        );
    });

    it('keeps blocked report generations out of the workspace modal and avoids archiving a report snapshot', async () => {
        generateAnalystReportArtifactsMock.mockResolvedValue(createBlockedArtifacts());
        const harness = createHarness();

        await harness.getState().generateAnalystReport();
        harness.getState().syncTelemetryToStore();

        expect(saveReportArtifactsMock).toHaveBeenCalledTimes(1);
        expect(saveReportMock).toHaveBeenCalledTimes(2);
        expect(openReportArtifactMock).not.toHaveBeenCalled();
        expect(harness.getState().setIsWorkspaceModalOpen).not.toHaveBeenCalled();
        expect(harness.getState().workspaceFiles['/workspace/reports/latest-analyst-report.html']).toBeUndefined();
        expect(harness.getState().chatHistory).toHaveLength(0);
        expect(harness.getState().addProgress).toHaveBeenCalledWith(
            'Analyst report was blocked: No trusted report evidence cards qualified for analyst reporting.',
            'warning',
        );
        expect(harness.getState().agentEvents.some(event => event.step === 'analyst_report_blocked')).toBe(true);
    });
});
