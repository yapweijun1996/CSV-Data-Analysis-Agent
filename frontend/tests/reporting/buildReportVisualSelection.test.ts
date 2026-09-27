// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { AnalystMemo, ForumSummary, ReportEvidenceBundle } from '../../types';
import { buildReportVisualSelection } from '../../services/reporting/buildReportVisualSelection';

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
        metadataRowCount: 0,
        headerDepth: 1,
        summaryRowCount: 0,
        parserStrategy: 'scored_candidate',
        parserConfidence: 'high',
        intakeGateStatus: 'clear',
        preparationState: 'baseline_prepared',
        analysisState: 'ready',
        reportReadiness: 'ready',
        reportReadinessReason: 'Ready for bounded analyst synthesis.',
        readinessDrivers: [],
        readinessRisks: [],
        structuralSignals: {
            rowExpansionRatio: 1,
            hasMetadataRows: false,
            hasMultiRowHeader: false,
            usedFallbackContext: false,
        },
        trustedCardsCount: 2,
        reportGenerationGate: 'allowed',
        reportGenerationBlockers: [],
        canAnalyze: true,
        cardsCount: 5,
        caveats: [],
    },
    workflow: {
        topWarnings: [],
        issueMappings: [],
        verification: {
            emptyDatasetGuardPassed: true,
            datasetSafetyStatus: 'passed',
            cleaningConsistencyStatus: 'passed',
            overallStatus: 'passed',
            downstreamAnalysisBlocked: false,
            warnings: [],
            sqlPrecheckStatus: 'passed',
            sqlPrecheckSummary: 'passed',
            sqlPrecheckBlockingFindings: [],
            shapeFailureSignalKey: null,
            shapeFailureDetail: null,
            failedChecks: [],
            schemaSummary: 'ok',
            shapeVerification: null,
        },
        diff: {
            rowCountBefore: 12,
            rowCountAfter: 10,
            rowCountDelta: -2,
            addedColumns: [],
            removedColumns: [],
            changedColumns: [],
        },
    },
    summaries: {
        coreAnalysisSummary: null,
        finalSummary: null,
        contextualSummary: null,
    },
    query: null,
    cards: [
        {
            evidenceId: 'card.card-1',
            cardId: 'card-1',
            title: 'Revenue by Region',
            displayTitle: 'Revenue by Region',
            description: 'Revenue concentration across regions.',
            artifactType: null,
            chartType: 'bar',
            groupByColumn: 'Region',
            valueColumn: 'Revenue',
            aggregation: 'sum',
            rowCount: 4,
            summary: { language: 'English', text: 'Revenue concentration is highest in East.' },
            aggregatedDataSample: [],
            reportChartRows: [{ Region: 'East', Revenue: 1200 }, { Region: 'West', Revenue: 900 }],
            semanticRole: 'business_dimension',
            helperExposureLevel: 'none',
            businessMeaningConfidence: 0.95,
            aggregationQualityFlags: [],
            isFallback: false,
        },
        {
            evidenceId: 'card.card-2',
            cardId: 'card-2',
            title: 'Margin by Region',
            displayTitle: 'Margin by Region',
            description: 'Margin concentration across regions.',
            artifactType: null,
            chartType: 'bar',
            groupByColumn: 'Region',
            valueColumn: 'Margin',
            aggregation: 'sum',
            rowCount: 4,
            summary: { language: 'English', text: 'Margin concentration is highest in East.' },
            aggregatedDataSample: [],
            reportChartRows: [{ Region: 'East', Margin: 400 }, { Region: 'West', Margin: 220 }],
            semanticRole: 'business_dimension',
            helperExposureLevel: 'none',
            businessMeaningConfidence: 0.82,
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
            description: 'Revenue concentration across regions.',
            artifactType: null,
            chartType: 'bar',
            groupByColumn: 'Region',
            valueColumn: 'Revenue',
            aggregation: 'sum',
            rowCount: 4,
            summary: { language: 'English', text: 'Revenue concentration is highest in East.' },
            aggregatedDataSample: [],
            reportChartRows: [{ Region: 'East', Revenue: 1200 }, { Region: 'West', Revenue: 900 }],
            semanticRole: 'business_dimension',
            helperExposureLevel: 'none',
            businessMeaningConfidence: 0.95,
            aggregationQualityFlags: [],
            isFallback: false,
        },
        {
            evidenceId: 'card.card-2',
            cardId: 'card-2',
            title: 'Margin by Region',
            displayTitle: 'Margin by Region',
            description: 'Margin concentration across regions.',
            artifactType: null,
            chartType: 'bar',
            groupByColumn: 'Region',
            valueColumn: 'Margin',
            aggregation: 'sum',
            rowCount: 4,
            summary: { language: 'English', text: 'Margin concentration is highest in East.' },
            aggregatedDataSample: [],
            reportChartRows: [{ Region: 'East', Margin: 400 }, { Region: 'West', Margin: 220 }],
            semanticRole: 'business_dimension',
            helperExposureLevel: 'none',
            businessMeaningConfidence: 0.82,
            aggregationQualityFlags: [],
            isFallback: false,
        },
        {
            evidenceId: 'card.card-3',
            cardId: 'card-3',
            title: 'Null-coded Value by Code',
            displayTitle: 'Null-coded Value by Code',
            description: 'Missing classification remains material.',
            artifactType: null,
            chartType: 'bar',
            groupByColumn: 'Code',
            valueColumn: 'Value',
            aggregation: 'sum',
            rowCount: 4,
            summary: { language: 'English', text: 'Null-coded values remain material.' },
            aggregatedDataSample: [],
            reportChartRows: [{ Code: 'NULL', Value: 98590000 }, { Code: '5010', Value: 12300 }],
            semanticRole: 'helper_classification',
            helperExposureLevel: 'low',
            businessMeaningConfidence: 0.8,
            aggregationQualityFlags: [],
            isFallback: false,
        },
    ],
    includedCardIds: ['card-1', 'card-2'],
    excludedCardIds: ['card-3'],
    excludedEvidence: [
        {
            decision: 'excluded',
            evidenceId: 'card.card-3',
            cardId: 'card-3',
            title: 'Null-coded Value by Code',
            displayTitle: 'Null-coded Value by Code',
            detail: 'helperExposure=low | narrative=helper_classification',
            reasonCodes: ['helper_exposure', 'narrative_ineligible'],
        },
    ],
    evidenceCatalog: [],
});

const memos: AnalystMemo[] = [{
    role: 'business',
    headline: 'Revenue concentration is visible',
    summary: 'Revenue concentration is visible.',
    findings: [
        {
            id: 'biz-1',
            claim: 'Revenue concentration remains the leading business signal.',
            importance: 'high',
            evidenceRefs: ['card.card-1', 'card.card-2'],
            metricRefs: [],
        },
    ],
    blockers: [],
    caveats: [],
    confidence: 'high',
    recommendedNextChecks: [],
}];

const forum: ForumSummary = {
    consensusFindings: [
        {
            id: 'forum-1',
            claim: 'Revenue concentration remains the leading business signal.',
            supportedByRoles: ['business'],
            evidenceRefs: ['card.card-1', 'card.card-2'],
            caveats: [],
        },
        {
            id: 'forum-2',
            claim: 'Null-coded dimensions remain a material data quality gap.',
            supportedByRoles: ['business'],
            evidenceRefs: ['card.card-3'],
            caveats: ['Classification remains incomplete.'],
        },
    ],
    disagreements: [],
    overallConfidence: 'medium',
    executiveSummary: 'summary',
    recommendedActions: [],
};

describe('buildReportVisualSelection', () => {
    it('keeps one lead visual per topic and prefers the stronger card', () => {
        const visuals = buildReportVisualSelection(createBundle(), forum, memos);

        expect(visuals).toHaveLength(1);
        expect(visuals[0].cardId).toBe('card-1');
        expect(visuals[0].topicKey).toBe('revenue_concentration');
        expect(visuals.some(visual => visual.cardId === 'card-2')).toBe(false);
        expect(visuals.some(visual => visual.cardId === 'card-3')).toBe(false);
    });

    it('propagates chartWarnings from the chart payload to the visual', () => {
        const bundle = createBundle();
        // Give the card mixed-sign pie data to trigger a downgrade warning
        bundle.cards = [{
            ...bundle.cards[0],
            chartType: 'pie',
            reportChartRows: [
                { Region: 'East', Revenue: 100 },
                { Region: 'West', Revenue: -50 },
            ],
        }];

        const visuals = buildReportVisualSelection(bundle, forum, memos);

        expect(visuals).toHaveLength(1);
        expect(visuals[0].chartWarnings.length).toBeGreaterThan(0);
        expect(visuals[0].chartWarnings.some(w => w.includes('Circular charts were downgraded'))).toBe(true);
    });
});
