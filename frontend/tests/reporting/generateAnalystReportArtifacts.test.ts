// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type {
    AnalystMemo,
    ForumSummary,
    ReportEvidenceBundle,
    ReportIr,
    Settings,
} from '../../types';
import { generateAnalystReportArtifacts } from '../../services/reporting/generateAnalystReportArtifacts';
import type { AppStore } from '../../store/useAppStore';

const settings: Settings = {
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
        workspaceRules: {
            deniedPathPrefixes: [],
        },
    },
};

const createBundle = (): ReportEvidenceBundle => ({
    generatedAt: '2026-03-14T09:00:00.000Z',
    sessionId: 'session-1',
    datasetId: 'dataset-1',
    currentView: 'analysis_dashboard',
    dataset: {
        fileName: 'sales.csv',
        reportTitle: 'Executive Revenue Report',
        rawRowCount: 12,
        cleanedRowCount: 10,
        metadataRowCount: 2,
        headerDepth: 1,
        summaryRowCount: 1,
        parserStrategy: 'scored_candidate',
        parserConfidence: 'high',
        intakeGateStatus: 'warning',
        preparationState: 'baseline_prepared',
        analysisState: 'ready',
        reportReadiness: 'ready',
        reportReadinessReason: 'Ready for bounded analyst synthesis with no material structural or workflow caveats detected.',
        readinessDrivers: [
            'Trusted analysis cards exist (1).',
            'Parser confidence is high.',
        ],
        readinessRisks: [],
        structuralSignals: {
            rowExpansionRatio: 0.8,
            hasMetadataRows: false,
            hasMultiRowHeader: false,
            usedFallbackContext: false,
        },
        trustedCardsCount: 1,
        reportGenerationGate: 'allowed',
        reportGenerationBlockers: [],
        canAnalyze: true,
        cardsCount: 1,
        caveats: [],
    },
    workflow: {
        topWarnings: ['One helper column remains unverified.'],
        issueMappings: [],
        verification: {
            emptyDatasetGuardPassed: true,
            datasetSafetyStatus: 'passed',
            cleaningConsistencyStatus: 'passed',
            overallStatus: 'passed',
            downstreamAnalysisBlocked: false,
            warnings: [],
            sqlPrecheckStatus: 'passed',
            sqlPrecheckSummary: null,
            sqlPrecheckBlockingFindings: [],
            shapeFailureSignalKey: null,
            shapeFailureDetail: null,
            failedChecks: [],
            schemaSummary: 'Revenue casted to number.',
            shapeVerification: null,
        },
        diff: {
            rowCountBefore: 12,
            rowCountAfter: 10,
            rowCountDelta: -2,
            addedColumns: ['Margin'],
            removedColumns: [],
            changedColumns: [{ name: 'Revenue', before: 'string', after: 'number' }],
        },
    },
    summaries: {
        coreAnalysisSummary: { language: 'English', text: 'Revenue is concentrated in the East region.' },
        finalSummary: { language: 'English', text: 'East and West account for most of the observed revenue.' },
        contextualSummary: 'Prepared for quarterly revenue review.',
    },
    query: null,
    cards: [
        {
            evidenceId: 'card.card-1',
            cardId: 'card-1',
            title: 'Revenue by Region',
            displayTitle: 'Revenue by Region',
            description: 'Compare total revenue by region.',
            artifactType: null,
            chartType: 'bar',
            groupByColumn: 'Region',
            valueColumn: 'Revenue',
            aggregation: 'sum',
            rowCount: 4,
            summary: { language: 'English', text: 'East region leads revenue.' },
            aggregatedDataSample: [{ Region: 'East', Revenue: 1200 }],
            reportChartRows: [{ Region: 'East', Revenue: 1200 }, { Region: 'West', Revenue: 900 }],
            semanticRole: 'business_dimension',
            helperExposureLevel: 'none',
            businessMeaningConfidence: 0.92,
            aggregationQualityFlags: [],
            isFallback: false,
        },
    ],
    allCards: [
        {
            evidenceId: 'card.card-1',
            cardId: 'card-1',
            title: 'Revenue by Region',
            displayTitle: 'Revenue by Region',
            description: 'Compare total revenue by region.',
            artifactType: null,
            chartType: 'bar',
            groupByColumn: 'Region',
            valueColumn: 'Revenue',
            aggregation: 'sum',
            rowCount: 4,
            summary: { language: 'English', text: 'East region leads revenue.' },
            aggregatedDataSample: [{ Region: 'East', Revenue: 1200 }],
            reportChartRows: [{ Region: 'East', Revenue: 1200 }, { Region: 'West', Revenue: 900 }],
            semanticRole: 'business_dimension',
            helperExposureLevel: 'none',
            businessMeaningConfidence: 0.92,
            aggregationQualityFlags: [],
            isFallback: false,
        },
    ],
    includedCardIds: ['card-1'],
    excludedCardIds: [],
    excludedEvidence: [],
    evidenceCatalog: [
        { id: 'dataset.context', kind: 'dataset', label: 'Dataset Context', source: 'derived', detail: 'Executive Revenue Report | 12 raw row(s) -> 10 cleaned row(s)' },
        { id: 'dataset.readiness', kind: 'dataset', label: 'Dataset Readiness', source: 'derived', detail: 'ready | 1 card(s)' },
        { id: 'card.card-1', kind: 'card', label: 'Revenue by Region', source: 'state', detail: 'chart | 4 row(s)' },
    ],
});

const createBlockedBundle = (): ReportEvidenceBundle => ({
    ...createBundle(),
    dataset: {
        ...createBundle().dataset,
        reportReadiness: 'partial',
        reportReadinessReason: 'Usable for bounded synthesis inputs, but trusted analysis cards are still missing.',
        trustedCardsCount: 0,
        reportGenerationGate: 'blocked',
        reportGenerationBlockers: ['No trusted report evidence cards qualified for analyst reporting.'],
    },
    cards: [],
    includedCardIds: [],
    excludedCardIds: ['card-1'],
    excludedEvidence: [
        {
            decision: 'excluded',
            evidenceId: 'card.card-1',
            cardId: 'card-1',
            title: 'Revenue by Region',
            displayTitle: 'Revenue by Region',
            detail: 'businessMeaningConfidence=0.61',
            reasonCodes: ['low_business_confidence'],
        },
    ],
});

const memo = (role: AnalystMemo['role']): AnalystMemo => ({
    role,
    headline: `${role} memo`,
    summary: `${role} summary`,
    findings: [
        {
            id: `${role}-1`,
            claim: `${role} claim`,
            importance: 'medium',
            evidenceRefs: ['dataset.readiness'],
            metricRefs: [],
        },
    ],
    blockers: [],
    caveats: [],
    confidence: 'medium',
    recommendedNextChecks: [`${role} next check`],
});

const forum: ForumSummary = {
    consensusFindings: [
        {
            id: 'forum-1',
            claim: 'Consensus claim',
            supportedByRoles: ['business', 'risk'],
            evidenceRefs: ['card.card-1'],
            caveats: [],
        },
    ],
    disagreements: [],
    overallConfidence: 'medium',
    executiveSummary: 'Consensus summary',
    recommendedActions: ['Review warning language'],
};

const ir: ReportIr = {
    version: 'report_ir_v1',
    reportId: 'report.session-1.dataset-1.20260314090000000',
    generatedAt: '2026-03-14T09:00:00.000Z',
    dataset: {
        title: 'Dataset Readiness',
        datasetName: 'Executive Revenue Report',
        readiness: 'ready',
        readinessReason: 'Ready for bounded analyst synthesis with no material structural or workflow caveats detected.',
        generationGate: 'allowed',
        generationBlockers: [],
        trustedCardsCount: 1,
        excludedEvidenceCount: 0,
        workflowStatus: 'prep=baseline_prepared | analysis=ready | intake=warning | cards=1',
        shapeSummary: '12 raw row(s) | 10 cleaned row(s)',
        readinessDrivers: [
            'Trusted analysis cards exist (1).',
            'Parser confidence is high.',
        ],
        readinessRisks: [],
        structuralSignals: {
            rowExpansionRatio: 0.8,
            hasMetadataRows: false,
            hasMultiRowHeader: false,
            usedFallbackContext: false,
        },
        caveats: [],
    },
    summary: {
        title: 'Executive Summary',
        executiveSummary: 'Consensus summary',
        executivePosition: 'Consensus summary',
        topImplication: 'Consensus claim',
        mainCaution: 'Review warning language',
        overallConfidence: 'medium',
        managementHighlights: ['Consensus summary'],
        recommendedActions: ['Review warning language'],
    },
    contents: [
        { id: 'key-takeaways', label: 'Key Takeaways' },
        { id: 'kpi-strip', label: 'KPI Snapshot' },
    ],
    kpiHighlights: [],
    reportVisuals: [],
    sections: [],
    appendix: {
        title: 'Evidence Catalog',
        evidenceCatalog: createBundle().evidenceCatalog,
        excludedEvidence: [],
    },
};

describe('generateAnalystReportArtifacts', () => {
    it('builds latest workspace files plus stored archive artifacts across the full bounded pipeline', async () => {
        const progress = vi.fn();
        const state = {
            sessionId: 'session-1',
            currentDatasetId: 'dataset-1',
            currentView: 'analysis_dashboard',
        } as unknown as AppStore;

        const generateMemo = vi.fn(async (role: AnalystMemo['role']) => ({
            memo: memo(role),
            diagnostics: {
                llmUsed: true,
                usedFallback: false,
                fallbackReason: null,
            },
        }));
        const generateForum = vi.fn(async () => ({
            forum,
            diagnostics: {
                llmUsed: true,
                usedFallback: false,
                fallbackReason: null,
            },
        }));

        const result = await generateAnalystReportArtifacts(state, settings, {
            onProgress: progress,
            dependencies: {
                buildEvidenceBundle: vi.fn(() => createBundle()),
                generateMemo,
                generateForum,
                buildIr: vi.fn(() => ir),
                renderHtml: vi.fn(() => '<!DOCTYPE html><html><body>Report</body></html>'),
            },
        });

        expect(result.title).toBe('Executive Revenue Report Analyst Report');
        expect(result.artifactStatus).toBe('ready');
        expect(result.memos).toHaveLength(3);
        expect(result.workspaceFiles['/workspace/reports/latest-analyst-report.html']).toContain('<!DOCTYPE html>');
        expect(result.workspaceFiles['/workspace/reports/latest-analyst-report.ir.json']).toBeUndefined();
        expect(result.storedArtifactFiles['/workspace/reports/report.session-1.dataset-1.20260314090000000.html']).toContain('Report');
        expect(result.storedArtifactFiles['/workspace/reports/report.session-1.dataset-1.20260314090000000.memos.json']).toContain('"role": "data_quality"');
        expect(result.storedArtifactFiles['/workspace/reports/report.session-1.dataset-1.20260314090000000.forum.json']).toContain('"executiveSummary": "Consensus summary"');
        expect(result.storedArtifactFiles['/workspace/reports/report.session-1.dataset-1.20260314090000000.bundle.json']).toContain('"reportReadiness": "ready"');
        expect(result.workspaceFiles['/workspace/reports/latest-analyst-report.manifest.json']).toContain('"title": "Executive Revenue Report Analyst Report"');
        expect(result.workspaceFiles['/workspace/reports/latest-analyst-report.manifest.json']).toContain('"artifactStatus": "ready"');
        expect(result.manifest.llmUsed).toBe(true);
        expect(result.manifest.fallbacksUsed).toEqual([]);
        expect(progress).toHaveBeenCalledTimes(8);
        expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({
            completed: 7,
            total: 7,
            title: 'Report artifacts ready',
        }));
        expect(generateMemo).toHaveBeenCalledTimes(3);
        expect(generateForum).toHaveBeenCalledTimes(1);
    });

    it('hard-blocks synthesis when the generation gate is blocked', async () => {
        const progress = vi.fn();
        const generateMemo = vi.fn();
        const generateForum = vi.fn();
        const buildIr = vi.fn();
        const renderHtml = vi.fn();
        const validateIr = vi.fn();

        const result = await generateAnalystReportArtifacts({} as AppStore, settings, {
            onProgress: progress,
            dependencies: {
                buildEvidenceBundle: vi.fn(() => createBlockedBundle()),
                generateMemo,
                generateForum,
                buildIr,
                renderHtml,
                validateIr,
            },
        });

        expect(result.artifactStatus).toBe('blocked');
        expect(result.html).toBeNull();
        expect(result.ir).toBeNull();
        expect(result.workspaceFiles['/workspace/reports/latest-analyst-report.html']).toBeUndefined();
        expect(result.workspaceFiles['/workspace/reports/latest-analyst-report.readiness.json']).toContain('"generationGate": "blocked"');
        expect(result.workspaceFiles['/workspace/reports/latest-analyst-report.manifest.json']).toContain('"artifactStatus": "blocked"');
        expect(result.manifest.gateReasons).toEqual(['No trusted report evidence cards qualified for analyst reporting.']);
        expect(generateMemo).not.toHaveBeenCalled();
        expect(generateForum).not.toHaveBeenCalled();
        expect(buildIr).not.toHaveBeenCalled();
        expect(renderHtml).not.toHaveBeenCalled();
        expect(validateIr).not.toHaveBeenCalled();
        expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({
            completed: 2,
            title: 'Report blocked',
        }));
    });
});
