// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { AnalystMemo, ForumSummary, ReportEvidenceBundle } from '../../types';
import { buildReportIr } from '../../services/reporting/buildReportIr';

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
            'Trusted analysis cards exist (2).',
            'Parser confidence is high.',
        ],
        readinessRisks: [],
        structuralSignals: {
            rowExpansionRatio: 0.8,
            hasMetadataRows: false,
            hasMultiRowHeader: false,
            usedFallbackContext: false,
        },
        trustedCardsCount: 2,
        reportGenerationGate: 'allowed',
        reportGenerationBlockers: [],
        canAnalyze: true,
        cardsCount: 2,
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
            warnings: ['SQL precheck used a fallback path.'],
            sqlPrecheckStatus: 'passed',
            sqlPrecheckSummary: 'SQL precheck passed with one caution.',
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
    query: {
        hasActiveQuery: true,
        explanation: 'Focused on revenue rows after cleanup.',
        sqlPreview: 'select Region, sum(Revenue) from cleaned group by 1',
        engine: 'duckdb',
        totalMatchedRows: 10,
        returnedRows: 2,
        selectedColumns: ['Region', 'Revenue'],
    },
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
        {
            evidenceId: 'card.card-2',
            cardId: 'card-2',
            title: 'Margin by Region',
            displayTitle: 'Margin by Region',
            description: 'Compare total margin by region.',
            artifactType: null,
            chartType: 'line',
            groupByColumn: 'Region',
            valueColumn: 'Margin',
            aggregation: 'sum',
            rowCount: 4,
            summary: { language: 'English', text: 'Margin follows the same concentration pattern.' },
            aggregatedDataSample: [{ Region: 'East', Margin: 320 }],
            reportChartRows: [{ Region: 'East', Margin: 320 }, { Region: 'West', Margin: 210 }],
            semanticRole: 'business_dimension',
            helperExposureLevel: 'none',
            businessMeaningConfidence: 0.81,
            aggregationQualityFlags: [],
            isFallback: false,
        },
    ],
    allCards: [],
    includedCardIds: ['card-1', 'card-2'],
    excludedCardIds: [],
    excludedEvidence: [],
    evidenceCatalog: [
        { id: 'dataset.context', kind: 'dataset', label: 'Dataset Context', source: 'derived', detail: 'Executive Revenue Report | 12 raw row(s) -> 10 cleaned row(s)' },
        { id: 'dataset.readiness', kind: 'dataset', label: 'Dataset Readiness', source: 'derived', detail: 'ready | 2 card(s)' },
        { id: 'workflow.preparation', kind: 'workflow', label: 'Preparation Workflow', source: 'derived', detail: 'prepared_with_warnings | 1 issue mapping(s) | 2 card(s)' },
        { id: 'workflow.verification', kind: 'workflow', label: 'Verification Status', source: 'derived', detail: 'overall=warning | sql=warning | blocked=no' },
        { id: 'summary.core', kind: 'summary', label: 'Core Analysis Summary', source: 'state', detail: 'Revenue is concentrated in the East region.' },
        { id: 'summary.final', kind: 'summary', label: 'Final Summary', source: 'state', detail: 'East and West account for most of the observed revenue.' },
        { id: 'query.active', kind: 'query', label: 'Active Data Query', source: 'state', detail: 'duckdb query | 2/10 row(s)' },
        { id: 'card.card-1', kind: 'card', label: 'Revenue by Region', source: 'state', detail: 'chart | 4 row(s)' },
        { id: 'card.card-2', kind: 'card', label: 'Margin by Region', source: 'state', detail: 'chart | 4 row(s)' },
    ],
});

const createMemos = (): AnalystMemo[] => ([
    {
        role: 'data_quality',
        headline: 'Dataset is usable with caveats',
        summary: 'Preparation is stable but one helper column remains unverified.',
        findings: [
            {
                id: 'dq-1',
                claim: 'The cleaned dataset is analyzable.',
                importance: 'high',
                evidenceRefs: ['dataset.readiness', 'workflow.verification'],
                metricRefs: [],
                caveat: 'One helper column remains unverified.',
            },
        ],
        blockers: [],
        caveats: ['One helper column remains unverified.'],
        confidence: 'medium',
        recommendedNextChecks: ['Confirm whether the helper column affects exported report labels.'],
    },
    {
        role: 'business',
        headline: 'Commercial concentration is visible',
        summary: 'Revenue and margin are concentrated in the East region.',
        findings: [
            {
                id: 'biz-1',
                claim: 'East region leads revenue and margin.',
                importance: 'high',
                evidenceRefs: ['card.card-1', 'card.card-2', 'summary.core'],
                metricRefs: ['Revenue', 'Margin'],
            },
        ],
        blockers: [],
        caveats: [],
        confidence: 'high',
        recommendedNextChecks: ['Validate whether East concentration persists against the previous period.'],
    },
    {
        role: 'risk',
        headline: 'Conclusions should stay bounded',
        summary: 'Business concentration is visible, but verification warnings still limit certainty.',
        findings: [
            {
                id: 'risk-1',
                claim: 'Warnings reduce confidence in a fully definitive report.',
                importance: 'medium',
                evidenceRefs: ['workflow.verification', 'dataset.readiness'],
                metricRefs: [],
                caveat: 'SQL precheck used a fallback path.',
            },
        ],
        blockers: ['Do not overstate the strength of the conclusions before warning review.'],
        caveats: ['SQL precheck used a fallback path.'],
        confidence: 'medium',
        recommendedNextChecks: ['Review the fallback SQL precheck warning before export.'],
    },
]);

const createForum = (): ForumSummary => ({
    consensusFindings: [
        {
            id: 'forum-1',
            claim: 'East region concentration is the leading business signal.',
            supportedByRoles: ['business', 'risk'],
            evidenceRefs: ['card.card-1', 'summary.core'],
            caveats: ['One helper column remains unverified.'],
        },
        {
            id: 'forum-2',
            claim: 'The prepared dataset is analyzable for report synthesis.',
            supportedByRoles: ['data_quality'],
            evidenceRefs: ['dataset.readiness', 'workflow.verification'],
            caveats: [],
        },
    ],
    disagreements: [
        {
            id: 'dis-1',
            topic: 'How definitive the report can be',
            resolution: 'partially_resolved',
            positions: [
                {
                    role: 'business',
                    stance: 'The trusted cards support an executive draft.',
                    evidenceRefs: ['card.card-1', 'summary.final'],
                },
                {
                    role: 'risk',
                    stance: 'Warnings still require caveat language.',
                    evidenceRefs: ['workflow.verification'],
                },
            ],
        },
    ],
    overallConfidence: 'medium',
    executiveSummary: 'The verified dataset supports a bounded report, but caveat-aware wording remains necessary.',
    recommendedActions: [
        'Draft the report with explicit caveat language.',
        'Review the fallback SQL precheck warning before export.',
    ],
});

describe('buildReportIr', () => {
    it('builds a deterministic report shell from bundle metadata', () => {
        const ir = buildReportIr(createBundle(), createMemos(), createForum());

        expect(ir.version).toBe('report_ir_v1');
        expect(ir.reportId).toBe('report.session-1.dataset-1.20260314090000000');
        expect(ir.generatedAt).toBe('2026-03-14T09:00:00.000Z');
        expect(ir.dataset).toEqual(expect.objectContaining({
            title: 'Dataset Readiness',
            datasetName: 'Executive Revenue Report',
            readiness: 'ready',
            generationGate: 'allowed',
            trustedCardsCount: 2,
            excludedEvidenceCount: 0,
            readinessDrivers: ['Trusted analysis cards exist (2).', 'Parser confidence is high.'],
        }));
        expect(ir.dataset.workflowStatus).toContain('prep=baseline_prepared');
        expect(ir.dataset.shapeSummary).toContain('12 raw row(s)');
        expect(ir.summary.executivePosition).toContain('The verified dataset supports');
        expect(ir.summary.topImplication).toContain('East region concentration');
        expect(ir.contents).toHaveLength(6);
        expect(ir.kpiHighlights.length).toBeGreaterThan(0);
        expect(ir.reportVisuals).toHaveLength(1);
    });

    it('maps consensus findings into a report finding section and derives importance from memos', () => {
        const ir = buildReportIr(createBundle(), createMemos(), createForum());
        const findingSection = ir.sections.find(section => section.type === 'findings');

        expect(findingSection).toEqual(expect.objectContaining({
            title: 'Key Findings',
        }));
        expect(findingSection && 'items' in findingSection ? findingSection.items[0] : null).toEqual(expect.objectContaining({
            id: 'forum-1',
            importance: 'high',
            supportedByRoles: ['business', 'risk'],
            evidenceRefs: ['card.card-1', 'summary.core'],
        }));
    });

    it('preserves disagreements and builds evidence cards with why-it-matters text', () => {
        const ir = buildReportIr(createBundle(), createMemos(), createForum());
        const disagreementSection = ir.sections.find(section => section.type === 'disagreements');
        const evidenceSection = ir.sections.find(section => section.type === 'evidence');

        expect(disagreementSection && 'items' in disagreementSection ? disagreementSection.items[0] : null).toEqual(expect.objectContaining({
            id: 'dis-1',
            resolution: 'partially_resolved',
        }));
        expect(evidenceSection && 'cards' in evidenceSection ? evidenceSection.cards[0] : null).toEqual(expect.objectContaining({
            cardId: 'card-1',
            title: 'Revenue by Region',
            whyItMatters: 'East region concentration is the leading business signal.',
        }));
        expect(ir.reportVisuals[0]).toEqual(expect.objectContaining({
            cardId: 'card-1',
            businessTitle: 'East region concentration is the leading business signal.',
            topicKey: 'revenue_concentration',
            chartType: 'bar',
            whyItMatters: 'East region concentration is the leading business signal.',
        }));
    });

    it('keeps appendix evidence catalog and tolerates missing optional sections', () => {
        const bundle = createBundle();
        bundle.cards = [];
        bundle.evidenceCatalog = bundle.evidenceCatalog.filter(entry => !entry.id.startsWith('card.'));
        const forum = createForum();
        forum.disagreements = [];
        const beforeBundle = JSON.stringify(bundle);
        const beforeForum = JSON.stringify(forum);

        const ir = buildReportIr(bundle, createMemos(), forum);

        expect(ir.sections.map(section => section.type)).toEqual(['findings']);
        expect(ir.appendix.evidenceCatalog).toHaveLength(7);
        expect(ir.appendix.excludedEvidence).toEqual([]);
        expect(JSON.stringify(bundle)).toBe(beforeBundle);
        expect(JSON.stringify(forum)).toBe(beforeForum);
    });

    it('downgrades displayed readiness when forum confidence is low', () => {
        const forum = {
            ...createForum(),
            overallConfidence: 'low' as const,
        };

        const ir = buildReportIr(createBundle(), createMemos(), forum);

        expect(ir.dataset.readiness).toBe('partial');
        expect(ir.dataset.readinessReason).toBe('Usable for bounded synthesis, but low forum confidence still limits executive certainty.');
        expect(ir.dataset.readinessRisks).toContain('Forum overall confidence remained low, so displayed readiness was downgraded to partial.');
    });

    it('falls back to a compact table when a selected report visual uses an unsupported chart type', () => {
        const bundle = createBundle();
        bundle.cards[0].chartType = 'combo';

        const ir = buildReportIr(bundle, createMemos(), createForum());

        expect(ir.reportVisuals[0]).toEqual(expect.objectContaining({
            cardId: 'card-1',
            chartType: 'table',
            svgMarkup: null,
        }));
        expect(ir.reportVisuals[0].fallbackTable?.columns).toContain('Region');
    });
});
