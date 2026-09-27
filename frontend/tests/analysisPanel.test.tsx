import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisPanel } from '../components/AnalysisPanel';
import * as useAppStoreModule from '../store/useAppStore';
import { getCurrentAnalysisDatasetVersion } from '../services/agent/artifactProvenance';

vi.mock('../store/useAppStore', () => ({
    useAppStore: vi.fn(),
}));

vi.mock('react-masonry-css', () => ({
    default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/analysis-card/AnalysisCard', () => ({
    AnalysisCard: ({ cardId }: { cardId: string }) => <div>Analysis Card {cardId}</div>,
}));

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

const markCardsVerified = (store: {
    analysisCards: Array<Record<string, unknown>>;
    canonicalCsvData?: { fileName: string; data: Array<Record<string, string | number | boolean | null>> } | null;
    csvData?: { fileName: string; data: Array<Record<string, string | number | boolean | null>> } | null;
}) => {
    const datasetVersion = getCurrentAnalysisDatasetVersion({
        canonicalCsvData: store.canonicalCsvData ?? null,
        csvData: store.csvData ?? null,
    });
    store.analysisCards.forEach(card => {
        const plan = card.plan as {
            chartType?: string;
            groupByColumn?: string;
            valueColumn?: string;
            aggregation?: string;
        };
        card.provenance = {
            schemaVersion: 1,
            datasetId: 'dataset-test',
            datasetVersion,
            evidenceStatus: 'verified',
            evidenceReasons: [],
            method: {
                operation: plan.chartType ?? 'bar',
                groupByColumns: plan.groupByColumn ? [plan.groupByColumn] : [],
                aggregations: plan.aggregation ? [{
                    function: plan.aggregation,
                    column: plan.valueColumn ?? null,
                    alias: plan.valueColumn ?? plan.aggregation,
                }] : [],
                sourceColumns: [plan.groupByColumn, plan.valueColumn].filter(Boolean),
                filterCount: 0,
                pivotRows: [],
                pivotColumns: [],
            },
            queryEvidence: null,
            queryEvidenceRequired: false,
            evidenceRefs: [],
            createdAt: '2026-07-25T00:00:00.000Z',
        };
        card.autoAnalysisEvaluation ??= {
            verdict: 'trusted',
            reasonCodes: [],
            detail: 'trusted',
            evaluatedAt: '2026-07-25T00:00:00.000Z',
            source: 'auto_analysis_evaluator_v1',
        };
    });
};

describe('analysis panel rendering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.sessionStorage.removeItem('csv_agent_results_view');
        (globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
    });

    afterEach(() => {
        cleanup();
        window.sessionStorage.removeItem('csv_agent_results_view');
    });

    it('does not render the legacy data transformation log on analysis dashboard', () => {
        const store = {
            sessionId: 'session-1',
            currentView: 'analysis_dashboard',
            currentDatasetId: 'dataset-1',
            isSpreadsheetVisible: false,
            analysisCards: [],
            finalSummary: null,
            isGeneratingReport: false,
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataPreparationPlan: {
                explanation: 'Normalize blank values.',
                operations: [
                    {
                        id: 'op-normalize',
                        type: 'normalize_empty_values',
                        reason: 'Normalize blanks before profiling.',
                        columns: ['Revenue'],
                    },
                ],
                outputColumns: [
                    { name: 'Region', type: 'categorical' },
                    { name: 'Revenue', type: 'numerical' },
                ],
                planStatus: 'operations',
                consistencyIssues: [],
            },
            initialDataSample: [{ Region: 'East', Revenue: '' }],
            csvData: {
                fileName: 'sales.csv',
                data: [{ Region: 'East', Revenue: 0 }],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Revenue', type: 'numerical', missingPercentage: 0, valueRange: [0, 0] },
            ],
            dataQualityIssues: [],
            rawCsvData: {
                fileName: 'sales.csv',
                data: [{ Region: 'East', Revenue: '' }],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            agentEvents: [],
            agentToolLogs: [],
            telemetryEvents: [],
            spreadsheetFilterFunction: null,
            aiFilterExplanation: null,
            activeDataQuery: null,
            agentMemoryRun: null,
            cleaningRun: {
                status: 'paused',
            },
            setReportTemplate: vi.fn(),
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            handleShowCardFromChat: vi.fn(),
            settings: {
                provider: 'google',
                geminiApiKey: 'key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'English',
                reportTemplate: 'management_review',
            },
        };

        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        expect(screen.queryByText('Open workflow or logs')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Open Workflow' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Open Logs' })).not.toBeInTheDocument();
        expect(screen.getAllByText('Continue cleaning')).not.toHaveLength(0);
        expect(screen.getAllByText('Restart cleaning')).not.toHaveLength(0);
        expect(screen.queryByText('AI Data Transformation Log')).not.toBeInTheDocument();
        expect(screen.queryByText('Transformation Operations')).not.toBeInTheDocument();
    });

    it('renders a report template selector and persists the selected template into store state', () => {
        const setReportTemplate = vi.fn();
        const store = {
            analysisCards: [{
                id: 'card-1',
                plan: { chartType: 'bar', title: 'Amount by Project', groupByColumn: 'Project', valueColumn: 'Amount', aggregation: 'sum' },
                aggregatedData: [{ Project: 'Alpha', Amount: 1200 }],
            }],
            initialAnalysisStatus: 'ready',
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'English',
                reportTemplate: 'management_review',
            },
            setReportTemplate,
            generateAnalystReport: vi.fn(),
            openLatestAnalystReport: vi.fn(),
            exportLatestAnalystReportPdf: vi.fn(),
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: null,
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            handleShowCardFromChat: vi.fn(),
            csvData: {
                fileName: 'financial-report.csv',
                data: [{ Project: 'Alpha', Amount: 1200 }],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            rawCsvData: null,
            reportContextResolution: null,
            columnProfiles: [
                { name: 'Project', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Amount', type: 'numerical', missingPercentage: 0, valueRange: [1200, 1200] },
            ],
            dataPreparationPlan: null,
            runWorkspaceDataQuery: vi.fn(),
            setIsSpreadsheetVisible: vi.fn(),
            addProgress: vi.fn(),
            setIsWorkspaceModalOpen: vi.fn(),
            hasLatestAnalystReport: false,
        };

        markCardsVerified(store);
        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        expect(screen.getByRole('button', { name: 'Simple view' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByRole('radiogroup', { name: 'Template' })).not.toBeInTheDocument();
        fireEvent.click(within(screen.getByRole('group', { name: 'Results view' })).getByRole('button', { name: 'Explore in depth' }));

        // Template selector is now a card-based radiogroup — click a card to select
        const radioGroup = screen.getByRole('radiogroup', { name: 'Template' });
        expect(radioGroup).toBeInTheDocument();

        // Management Review should be the active card (aria-checked=true) per store state
        expect(screen.getByRole('radio', { name: /Management Review/i })).toHaveAttribute('aria-checked', 'true');

        // Click Executive Brief card
        fireEvent.click(screen.getByRole('radio', { name: /Executive Brief/i }));
        expect(setReportTemplate).toHaveBeenCalledWith('executive_brief');
    });

    it('renders a report header with title and parameter tags when report metadata exists', () => {
        const store = {
            analysisCards: [],
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'English',
            },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: null,
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            handleShowCardFromChat: vi.fn(),
            rawCsvData: {
                fileName: 'financial-report.csv',
                data: [
                    { Project: 'Alpha', Amount: '1200' },
                    { Project: 'Beta', Amount: '950' },
                ],
                metadataRows: [
                    ['Income Statement By Project'],
                    ['Period: Jul 2025'],
                    ['Department: Piling Work'],
                ],
                summaryRows: [['Generated on 2026-03-13']],
                headerDepth: 2,
            },
            reportContextResolution: {
                aiExtracted: null,
                fallback: {
                    sourceFile: 'financial-report.csv',
                    reportTitle: 'Income Statement By Project',
                    parameterLines: ['Period: Jul 2025', 'Department: Piling Work'],
                    footerLines: ['Generated on 2026-03-13'],
                    candidateHeaderLine: null,
                    notes: [],
                    source: 'fallback',
                    confidence: null,
                },
                effective: {
                    sourceFile: 'financial-report.csv',
                    reportTitle: 'Income Statement By Project',
                    parameterLines: ['Period: Jul 2025', 'Department: Piling Work'],
                    footerLines: ['Generated on 2026-03-13'],
                    candidateHeaderLine: null,
                    notes: [],
                    source: 'fallback',
                    confidence: null,
                },
                verification: {
                    passed: false,
                    usedFallback: true,
                    reason: 'ai_extraction_unavailable',
                    aiConfidence: null,
                    issues: [],
                },
                generatedAt: '2026-03-13T00:00:00.000Z',
            },
            csvData: {
                fileName: 'financial-report.csv',
                data: [
                    { Project: 'Alpha', Amount: 1200 },
                    { Project: 'Beta', Amount: 950 },
                ],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnProfiles: [
                { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Amount', type: 'numerical', missingPercentage: 0, valueRange: [950, 1200] },
            ],
        };

        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        expect(screen.getByText('Report Context')).toBeInTheDocument();
        expect(screen.getByText('Income Statement By Project')).toBeInTheDocument();
        expect(screen.getByText('Period: Jul 2025')).toBeInTheDocument();
        expect(screen.getByText('Department: Piling Work')).toBeInTheDocument();
        expect(screen.getByText('Prepared Rows')).toBeInTheDocument();
        expect(screen.getByText('Header Depth')).toBeInTheDocument();
    });

    it('shows a low-confidence AI report guess while keeping validated fallback semantics downstream', () => {
        const store = {
            analysisCards: [],
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'English',
            },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: null,
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            handleShowCardFromChat: vi.fn(),
            rawCsvData: {
                fileName: 'budget.csv',
                data: [{ Project: 'Alpha', Amount: '1000' }],
                metadataRows: [['Validated Budget Report']],
                summaryRows: [],
                headerDepth: 1,
            },
            reportContextResolution: {
                aiExtracted: {
                    reportTitle: 'AI Guess Budget Report',
                    reportDescription: 'Budget report overview.',
                    parameterLines: ['Period: Jul 2025'],
                    footerLines: [],
                    candidateHeaderLine: null,
                    confidence: 'low',
                    reasoning: 'Weak evidence.',
                },
                fallback: {
                    sourceFile: 'budget.csv',
                    reportTitle: 'Validated Budget Report',
                    reportDescription: null,
                    parameterLines: [],
                    footerLines: [],
                    candidateHeaderLine: null,
                    notes: [],
                    source: 'fallback',
                    confidence: null,
                },
                effective: {
                    sourceFile: 'budget.csv',
                    reportTitle: 'Validated Budget Report',
                    reportDescription: null,
                    parameterLines: [],
                    footerLines: [],
                    candidateHeaderLine: null,
                    notes: [],
                    source: 'fallback',
                    confidence: 'low',
                },
                verification: {
                    passed: false,
                    usedFallback: true,
                    reason: 'low_confidence',
                    aiConfidence: 'low',
                    issues: [],
                },
                generatedAt: '2026-03-13T00:00:00.000Z',
            },
            csvData: {
                fileName: 'budget.csv',
                data: [{ Project: 'Alpha', Amount: 1000 }],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnProfiles: [
                { name: 'Project', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Amount', type: 'numerical', missingPercentage: 0, valueRange: [1000, 1000] },
            ],
        };

        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        expect(screen.getByText('AI Guess Budget Report')).toBeInTheDocument();
        expect(screen.getByText('Low-confidence AI guess shown')).toBeInTheDocument();
        expect(screen.getByText('Validated fallback used downstream')).toBeInTheDocument();
        expect(screen.getByText('Period: Jul 2025')).toBeInTheDocument();
    });

    it('keeps data quality warnings out of the analysis dashboard by default', () => {
        const store = {
            analysisCards: [],
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'English',
            },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: ["Column 'Reference Number' has a high percentage of missing values (94%)."],
            agentMemoryRun: null,
            cleaningRun: null,
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            handleShowCardFromChat: vi.fn(),
        };

        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        expect(screen.queryByText('Data Warnings')).not.toBeInTheDocument();
        expect(screen.queryByText(/mostly empty/i)).not.toBeInTheDocument();
    });

    it('wires cleaning controls to resume and restart actions', () => {
        const resumeCleaningRun = vi.fn();
        const restartCleaningRun = vi.fn();
        const store = {
            analysisCards: [],
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'English',
            },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: { status: 'failed' },
            resumeCleaningRun,
            restartCleaningRun,
            handleShowCardFromChat: vi.fn(),
        };

        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        fireEvent.click(screen.getAllByText('Continue cleaning')[0]);
        fireEvent.click(screen.getAllByText('Restart cleaning')[0]);

        expect(resumeCleaningRun).toHaveBeenCalledTimes(1);
        expect(restartCleaningRun).toHaveBeenCalledTimes(1);
    });

    it('hides the dashboard cleaning banner while the spreadsheet panel is visible', () => {
        const store = {
            analysisCards: [],
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: true,
            settings: {
                language: 'English',
            },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: { status: 'paused' },
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            handleShowCardFromChat: vi.fn(),
        };

        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        expect(screen.queryByText('Continue cleaning')).not.toBeInTheDocument();
        expect(screen.queryByText('Restart cleaning')).not.toBeInTheDocument();
    });

    it('shows SQL precheck blockers on the analysis dashboard after cleaning completes', () => {
        const restartCleaningRun = vi.fn();
        const runWorkspaceDataQuery = vi.fn().mockResolvedValue(null);
        const setIsSpreadsheetVisible = vi.fn();
        const store = {
            analysisCards: [],
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'English',
            },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Revenue', type: 'numerical', missingPercentage: 0, valueRange: [0, 0] },
            ],
            cleaningRun: {
                status: 'completed',
                sqlPrecheckStatus: 'blocked',
            },
            dataPreparationPlan: {
                explanation: 'Prepared rows remain stable.',
                operations: [],
                outputColumns: [
                    { name: 'Region', type: 'categorical' },
                    { name: 'Revenue', type: 'numerical' },
                ],
                planStatus: 'schema_only',
                consistencyIssues: [],
                sqlPrecheck: {
                    status: 'blocked',
                    summary: '2 blocking SQL precheck issues detected after AI cleaning.',
                    findings: [
                        {
                            kind: 'constant_metric',
                            severity: 'block',
                            column: 'Revenue',
                            metric: 'Revenue',
                            message: 'Metric "Revenue" has only one distinct numeric value, so it does not support comparative analysis.',
                        },
                    ],
                },
            },
            resumeCleaningRun: vi.fn(),
            restartCleaningRun,
            runWorkspaceDataQuery,
            setIsSpreadsheetVisible,
            addProgress: vi.fn(),
            handleShowCardFromChat: vi.fn(),
        };

        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        expect(screen.getByText('2 blocking SQL precheck issues detected after AI cleaning.')).toBeInTheDocument();
        expect(screen.getByText('Metric "Revenue" has only one distinct numeric value, so it does not support comparative analysis.')).toBeInTheDocument();
        expect(screen.queryByText('Continue cleaning')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('Restart cleaning from prepared dataset'));
        fireEvent.click(screen.getByText('Inspect'));

        expect(restartCleaningRun).toHaveBeenCalledTimes(1);
        return waitFor(() => {
            expect(setIsSpreadsheetVisible).toHaveBeenCalledWith(true);
            expect(runWorkspaceDataQuery).toHaveBeenCalledWith({
                templateId: 'preview_rows',
                columns: ['Revenue'],
                limit: 25,
                orderBy: null,
            });
        });
    });

    it('renders an executive KPI overview before the chart cards when a lead metric card exists', () => {
        const handleShowCardFromChat = vi.fn();
        const store = {
            analysisCards: [
                {
                    id: 'card-project-spend',
                    plan: {
                        title: 'Spend by Project',
                        description: 'Compare spend by project.',
                        chartType: 'bar',
                        aggregation: 'sum',
                        groupByColumn: 'Project',
                        valueColumn: 'Spend',
                    },
                    aggregatedData: [
                        { Project: '36 TUAS ROAD', Spend: 1200 },
                        { Project: 'Depot Upgrade', Spend: 800 },
                        { Project: 'HQ Refresh', Spend: 400 },
                        { Project: 'Mobile Pilot', Spend: 200 },
                    ],
                    summary: 'Summary',
                    displayChartType: 'bar',
                    isDataVisible: false,
                    topN: null,
                    hideOthers: false,
                    hiddenLabels: [],
                    autoAnalysisEvaluation: {
                        verdict: 'trusted',
                        reasonCodes: [],
                        detail: 'trusted',
                        evaluatedAt: '2026-03-19T00:00:00.000Z',
                        source: 'test',
                    },
                },
            ],
            csvData: {
                fileName: 'projects.csv',
                data: [
                    { Project: '36 TUAS ROAD', Spend: 1200, Status: 'Active' },
                    { Project: 'Depot Upgrade', Spend: 800, Status: 'Inactive' },
                    { Project: 'HQ Refresh', Spend: 400, Status: 'Archived' },
                    { Project: 'Mobile Pilot', Spend: 200, Status: 'Active' },
                ],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            canonicalCsvData: {
                fileName: 'projects.csv',
                data: [
                    { Project: '36 TUAS ROAD', Spend: 1200, Status: 'Active' },
                    { Project: 'Depot Upgrade', Spend: 800, Status: 'Inactive' },
                ],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnProfiles: [
                { name: 'Project', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
                { name: 'Spend', type: 'numerical', missingPercentage: 0, valueRange: [200, 1200] },
                { name: 'Status', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            ],
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'English',
            },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: null,
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            handleShowCardFromChat,
        };

        markCardsVerified(store);
        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        expect(screen.getByText('Executive Overview')).toBeInTheDocument();
        expect(screen.getByText('Total Spend')).toBeInTheDocument();
        expect(screen.getByText('Across 2 prepared rows.')).toBeInTheDocument();
        expect(screen.queryByText('Across 4 prepared rows.')).not.toBeInTheDocument();
        expect(screen.getAllByText('View Breakdown')).not.toHaveLength(0);
        expect(screen.getByRole('button', { name: /Total Spend/i })).toBeInTheDocument();
        expect(screen.getByText('Inactive Projects')).toBeInTheDocument();
        expect(screen.getByText('Analysis Card card-project-spend')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Total Spend/i }));

        expect(handleShowCardFromChat).toHaveBeenCalledWith('card-project-spend');
    });

    it('renders a period delta when a date-backed dataset supports month comparison', () => {
        const store = {
            analysisCards: [
                {
                    id: 'card-project-spend',
                    plan: {
                        title: 'Spend by Project',
                        description: 'Compare spend by project.',
                        chartType: 'bar',
                        aggregation: 'sum',
                        groupByColumn: 'Project',
                        valueColumn: 'Spend',
                    },
                    aggregatedData: [
                        { Project: '36 TUAS ROAD', Spend: 250 },
                        { Project: 'Depot Upgrade', Spend: 125 },
                    ],
                    summary: 'Summary',
                    displayChartType: 'bar',
                    isDataVisible: false,
                    topN: null,
                    hideOthers: false,
                    hiddenLabels: [],
                    autoAnalysisEvaluation: {
                        verdict: 'trusted',
                        reasonCodes: [],
                        detail: 'trusted',
                        evaluatedAt: '2026-03-19T00:00:00.000Z',
                        source: 'test',
                    },
                },
            ],
            csvData: {
                fileName: 'projects.csv',
                data: [
                    { Project: '36 TUAS ROAD', Spend: 100, Date: '2026-01-10' },
                    { Project: 'Depot Upgrade', Spend: 50, Date: '2026-01-18' },
                    { Project: '36 TUAS ROAD', Spend: 200, Date: '2026-02-10' },
                    { Project: 'Depot Upgrade', Spend: 100, Date: '2026-02-18' },
                    { Project: '36 TUAS ROAD', Spend: 250, Date: '2026-03-10' },
                    { Project: 'Depot Upgrade', Spend: 125, Date: '2026-03-18' },
                ],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnProfiles: [
                { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Spend', type: 'numerical', missingPercentage: 0, valueRange: [50, 250] },
                { name: 'Date', type: 'date', missingPercentage: 0 },
            ],
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'English',
            },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: null,
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            handleShowCardFromChat: vi.fn(),
        };

        markCardsVerified(store);
        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        expect(screen.getByText('vs last month')).toBeInTheDocument();
    });

    it('keeps executive overview hidden while the analysis task is still running', () => {
        const store = {
            analysisCards: [
                {
                    id: 'card-project-spend',
                    plan: {
                        title: 'Spend by Project',
                        description: 'Compare spend by project.',
                        chartType: 'bar',
                        aggregation: 'sum',
                        groupByColumn: 'Project',
                        valueColumn: 'Spend',
                    },
                    aggregatedData: [
                        { Project: '36 TUAS ROAD', Spend: 1200 },
                        { Project: 'Depot Upgrade', Spend: 800 },
                    ],
                    summary: 'Summary',
                    displayChartType: 'bar',
                    isDataVisible: false,
                    topN: null,
                    hideOthers: false,
                    hiddenLabels: [],
                    autoAnalysisEvaluation: {
                        verdict: 'trusted',
                        reasonCodes: [],
                        detail: 'trusted',
                        evaluatedAt: '2026-03-19T00:00:00.000Z',
                        source: 'test',
                    },
                },
            ],
            csvData: {
                fileName: 'projects.csv',
                data: [
                    { Project: '36 TUAS ROAD', Spend: 1200 },
                    { Project: 'Depot Upgrade', Spend: 800 },
                ],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnProfiles: [
                { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Spend', type: 'numerical', missingPercentage: 0, valueRange: [800, 1200] },
            ],
            finalSummary: { language: 'English', text: 'Final summary' },
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'English',
            },
            reportGenerationProgress: null,
            aiTaskStatus: {
                status: 'thinking',
                title: 'Running analysis',
                subtitle: 'Still working',
                currentStep: 2,
                totalSteps: 4,
            },
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: null,
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            handleShowCardFromChat: vi.fn(),
        };

        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        expect(screen.queryByText('Executive Overview')).not.toBeInTheDocument();
        expect(screen.queryByText('Overall Insights')).not.toBeInTheDocument();
    });

    it('renders a distribution fallback when no valid date comparison exists', () => {
        const store = {
            analysisCards: [
                {
                    id: 'card-project-spend',
                    plan: {
                        title: 'Spend by Project',
                        description: 'Compare spend by project.',
                        chartType: 'bar',
                        aggregation: 'sum',
                        groupByColumn: 'Project',
                        valueColumn: 'Spend',
                    },
                    aggregatedData: [
                        { Project: '36 TUAS ROAD', Spend: 1200 },
                        { Project: 'Depot Upgrade', Spend: 800 },
                        { Project: 'HQ Refresh', Spend: 400 },
                        { Project: 'Mobile Pilot', Spend: 200 },
                    ],
                    summary: 'Summary',
                    displayChartType: 'bar',
                    isDataVisible: false,
                    topN: null,
                    hideOthers: false,
                    hiddenLabels: [],
                    autoAnalysisEvaluation: {
                        verdict: 'trusted',
                        reasonCodes: [],
                        detail: 'trusted',
                        evaluatedAt: '2026-03-19T00:00:00.000Z',
                        source: 'test',
                    },
                },
            ],
            csvData: {
                fileName: 'projects.csv',
                data: [
                    { Project: '36 TUAS ROAD', Spend: 1200 },
                    { Project: 'Depot Upgrade', Spend: 800 },
                    { Project: 'HQ Refresh', Spend: 400 },
                    { Project: 'Mobile Pilot', Spend: 200 },
                ],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnProfiles: [
                { name: 'Project', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
                { name: 'Spend', type: 'numerical', missingPercentage: 0, valueRange: [200, 1200] },
            ],
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'English',
            },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: null,
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            handleShowCardFromChat: vi.fn(),
        };

        markCardsVerified(store);
        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        expect(screen.getByText('held by top Project')).toBeInTheDocument();
    });

    it('renders localized KPI copy when the dashboard language is Mandarin', () => {
        const store = {
            analysisCards: [
                {
                    id: 'card-project-spend',
                    plan: {
                        title: 'Spend by Project',
                        description: 'Compare spend by project.',
                        chartType: 'bar',
                        aggregation: 'sum',
                        groupByColumn: 'Project',
                        valueColumn: 'Spend',
                    },
                    aggregatedData: [
                        { Project: '36 TUAS ROAD', Spend: 250 },
                        { Project: 'Depot Upgrade', Spend: 125 },
                    ],
                    summary: 'Summary',
                    displayChartType: 'bar',
                    isDataVisible: false,
                    topN: null,
                    hideOthers: false,
                    hiddenLabels: [],
                    autoAnalysisEvaluation: {
                        verdict: 'trusted',
                        reasonCodes: [],
                        detail: 'trusted',
                        evaluatedAt: '2026-03-19T00:00:00.000Z',
                        source: 'test',
                    },
                },
            ],
            csvData: {
                fileName: 'projects.csv',
                data: [
                    { Project: '36 TUAS ROAD', Spend: 100, Date: '2026-01-10' },
                    { Project: 'Depot Upgrade', Spend: 50, Date: '2026-01-18' },
                    { Project: '36 TUAS ROAD', Spend: 200, Date: '2026-02-10' },
                    { Project: 'Depot Upgrade', Spend: 100, Date: '2026-02-18' },
                    { Project: '36 TUAS ROAD', Spend: 250, Date: '2026-03-10' },
                    { Project: 'Depot Upgrade', Spend: 125, Date: '2026-03-18' },
                ],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnProfiles: [
                { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Spend', type: 'numerical', missingPercentage: 0, valueRange: [50, 250] },
                { name: 'Date', type: 'date', missingPercentage: 0 },
            ],
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'Mandarin',
            },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: null,
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            handleShowCardFromChat: vi.fn(),
        };

        markCardsVerified(store);
        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        expect(screen.getByText('总Spend')).toBeInTheDocument();
        expect(screen.getByText('较上月')).toBeInTheDocument();
        expect(screen.getAllByText('查看拆解')).not.toHaveLength(0);
    });

    it('renders the bounded analyst report action and wires it to the store action', () => {
        const generateAnalystReport = vi.fn();
        const store = {
            analysisCards: [{
                id: 'card-1',
                plan: { chartType: 'bar', title: 'Amount by Project', groupByColumn: 'Project', valueColumn: 'Amount', aggregation: 'sum' },
                aggregatedData: [{ Project: 'Alpha', Amount: 1200 }],
            }],
            initialAnalysisStatus: 'ready',
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'English',
            },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: null,
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            generateAnalystReport,
            handleShowCardFromChat: vi.fn(),
            rawCsvData: {
                fileName: 'financial-report.csv',
                data: [{ Project: 'Alpha', Amount: '1200' }],
                metadataRows: [['Executive Revenue Report']],
                summaryRows: [],
                headerDepth: 1,
            },
            reportContextResolution: null,
            csvData: {
                fileName: 'financial-report.csv',
                data: [{ Project: 'Alpha', Amount: 1200 }],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnProfiles: [
                { name: 'Project', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Amount', type: 'numerical', missingPercentage: 0, valueRange: [1200, 1200] },
            ],
        };

        markCardsVerified(store);
        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'Generate Analyst Report' }));

        expect(generateAnalystReport).toHaveBeenCalledTimes(1);

        fireEvent.click(within(screen.getByRole('group', { name: 'Results view' })).getByRole('button', { name: 'Explore in depth' }));

        expect(screen.getByText('Create a bounded report artifact from the verified dataset, trusted cards, and analyst synthesis.')).toBeInTheDocument();
    });

    it('prioritizes verified business cards over newer helper cards in simple view', () => {
        const store = {
            analysisCards: [
                {
                    id: 'helper-card',
                    plan: { chartType: 'bar', title: 'Quantity by UOM', groupByColumn: 'UOM', valueColumn: 'Quantity', aggregation: 'sum' },
                    aggregatedData: [{ UOM: 'PCS', Quantity: 10 }],
                    provenance: { datasetVersion: 'version-1', evidenceStatus: 'verified', queryTraceId: 'trace-helper' },
                    evidenceValueGate: { decision: 'table_only' },
                    autoAnalysisEvaluation: { verdict: 'caveated', reasonCodes: ['helper_exposure'] },
                },
                {
                    id: 'business-card',
                    plan: { chartType: 'bar', title: 'Sales by Customer', groupByColumn: 'Customer', valueColumn: 'Sales Amount', aggregation: 'sum' },
                    aggregatedData: [{ Customer: 'A', 'Sales Amount': 100 }],
                    provenance: { datasetVersion: 'version-1', evidenceStatus: 'verified', queryTraceId: 'trace-business' },
                    evidenceValueGate: { decision: 'pass' },
                    autoAnalysisEvaluation: { verdict: 'trusted', reasonCodes: [] },
                },
                {
                    id: 'profit-card',
                    plan: { chartType: 'bar', title: 'Profit by Customer', groupByColumn: 'Customer', valueColumn: 'Profit Amount', aggregation: 'sum' },
                    aggregatedData: [{ Customer: 'A', 'Profit Amount': 20 }],
                    provenance: { datasetVersion: 'version-1', evidenceStatus: 'verified', queryTraceId: 'trace-profit' },
                    evidenceValueGate: { decision: 'pass' },
                    autoAnalysisEvaluation: { verdict: 'trusted', reasonCodes: [] },
                },
            ],
            initialAnalysisStatus: 'ready',
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: { language: 'English' },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: null,
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            generateAnalystReport: vi.fn(),
            handleShowCardFromChat: vi.fn(),
            rawCsvData: null,
            reportContextResolution: null,
            csvData: { fileName: 'sales.csv', data: [{ Customer: 'A', UOM: 'PCS', 'Sales Amount': 100, 'Profit Amount': 20, Quantity: 10 }], datasetVersion: 'version-1' },
            columnProfiles: [
                { name: 'Customer', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'UOM', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Sales Amount', type: 'currency', missingPercentage: 0 },
                { name: 'Profit Amount', type: 'currency', missingPercentage: 0 },
                { name: 'Quantity', type: 'numerical', missingPercentage: 0 },
            ],
        };

        markCardsVerified(store);
        store.analysisCards[0].evidenceValueGate = { decision: 'table_only' };
        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));
        render(<AnalysisPanel />);

        expect(screen.getByText('Analysis Card business-card')).toBeInTheDocument();
        expect(screen.getByText('Analysis Card profit-card')).toBeInTheDocument();
        expect(screen.queryByText('Analysis Card helper-card')).not.toBeInTheDocument();
    });

    it('shows report viewer actions when an analyst report artifact already exists', () => {
        const openLatestAnalystReport = vi.fn();
        const exportLatestAnalystReportPdf = vi.fn();
        const setIsWorkspaceModalOpen = vi.fn();
        const store = {
            analysisCards: [{
                id: 'card-1',
                plan: { chartType: 'bar', title: 'Amount by Project', groupByColumn: 'Project', valueColumn: 'Amount', aggregation: 'sum' },
                aggregatedData: [{ Project: 'Alpha', Amount: 1200 }],
            }],
            initialAnalysisStatus: 'ready',
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'English',
            },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: null,
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            generateAnalystReport: vi.fn(),
            openLatestAnalystReport,
            exportLatestAnalystReportPdf,
            setIsWorkspaceModalOpen,
            handleShowCardFromChat: vi.fn(),
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
            rawCsvData: {
                fileName: 'financial-report.csv',
                data: [{ Project: 'Alpha', Amount: '1200' }],
                metadataRows: [['Executive Revenue Report']],
                summaryRows: [],
                headerDepth: 1,
            },
            reportContextResolution: null,
            csvData: {
                fileName: 'financial-report.csv',
                data: [{ Project: 'Alpha', Amount: 1200 }],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnProfiles: [
                { name: 'Project', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Amount', type: 'numerical', missingPercentage: 0, valueRange: [1200, 1200] },
            ],
        };

        markCardsVerified(store);
        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        fireEvent.click(within(screen.getByRole('group', { name: 'Results view' })).getByRole('button', { name: 'Explore in depth' }));

        fireEvent.click(screen.getByRole('button', { name: 'Open Report' }));
        fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));

        expect(openLatestAnalystReport).toHaveBeenCalledTimes(1);
        expect(exportLatestAnalystReportPdf).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: 'Open Workspace' })).not.toBeInTheDocument();
    });

    it('does not render the analysis trace panel in AnalysisPanel (it was moved to DebugLogsModal)', () => {
        const store = {
            analysisCards: [],
            finalSummary: null,
            isGeneratingReport: false,
            isSpreadsheetVisible: false,
            settings: {
                language: 'English',
                reportTemplate: 'management_review',
            },
            reportGenerationProgress: null,
            aiTaskStatus: null,
            dataQualityIssues: [],
            agentMemoryRun: null,
            cleaningRun: null,
            resumeCleaningRun: vi.fn(),
            restartCleaningRun: vi.fn(),
            generateAnalystReport: vi.fn(),
            openLatestAnalystReport: vi.fn(),
            exportLatestAnalystReportPdf: vi.fn(),
            setIsWorkspaceModalOpen: vi.fn(),
            handleShowCardFromChat: vi.fn(),
            workspaceFiles: {},
            rawCsvData: null,
            reportContextResolution: null,
            csvData: {
                fileName: 'financial-report.csv',
                data: [{ Project: 'Alpha', Amount: 1200 }],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnProfiles: [],
            dataPreparationPlan: null,
            runWorkspaceDataQuery: vi.fn(),
            setIsSpreadsheetVisible: vi.fn(),
            addProgress: vi.fn(),
            hasLatestAnalystReport: false,
            latestAnalysisSession: {
                status: 'degraded',
                acceptedOutputs: [],
                stepsUsed: 4,
                maxSteps: 20,
            },
            visibleAnalysisTrace: [
                {
                    stepId: 'step-1',
                    stepIndex: 1,
                    label: 'Build semantic understanding',
                    status: 'succeeded',
                    summary: 'Inspect dataset semantics.',
                    whyThisStep: 'Need a safe grain before querying.',
                    result: 'Helper fields were blocked.',
                    nextDecision: 'propose_hypotheses',
                    reasonCodes: [],
                },
            ],
        };

        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof store) => unknown) => selector(store));

        render(<AnalysisPanel />);

        // The analysis trace panel was moved to DebugLogsModal — it must not appear in AnalysisPanel.
        expect(screen.queryByText('Analysis Steps')).not.toBeInTheDocument();
        expect(screen.queryByText('Build semantic understanding')).not.toBeInTheDocument();
    });
});
