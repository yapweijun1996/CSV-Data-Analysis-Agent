// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { runReportQualityHarness } from '../../services/reporting/reportQualityHarness';
import type { ReportEvidenceBundle, ReportCardEvidence } from '../../types';

const createCard = (overrides?: Partial<ReportCardEvidence>): ReportCardEvidence => ({
    evidenceId: 'card.card-1',
    cardId: 'card-1',
    isFallback: false,
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
    aggregatedDataSample: [
        { Region: 'East', Revenue: 500000 },
        { Region: 'West', Revenue: 300000 },
    ],
    reportChartRows: [
        { Region: 'East', Revenue: 500000 },
        { Region: 'West', Revenue: 300000 },
        { Region: 'North', Revenue: 150000 },
        { Region: 'South', Revenue: 50000 },
    ],
    semanticRole: 'business_dimension',
    helperExposureLevel: 'none',
    businessMeaningConfidence: 0.85,
    aggregationQualityFlags: [],
    ...overrides,
});

const createBundle = (overrides?: {
    cards?: ReportCardEvidence[];
    caveats?: string[];
    readinessRisks?: string[];
    reportTitle?: string | null;
}): ReportEvidenceBundle => ({
    generatedAt: '2026-03-16T14:00:00.000Z',
    sessionId: 'session-1',
    datasetId: 'dataset-1',
    currentView: null,
    dataset: {
        fileName: 'test-data.csv',
        reportTitle: overrides?.reportTitle ?? 'Test Report',
        rawRowCount: 100,
        cleanedRowCount: 4300,
        metadataRowCount: 2,
        headerDepth: 1,
        summaryRowCount: 0,
        parserStrategy: 'auto',
        parserConfidence: 'high',
        intakeGateStatus: 'clear',
        preparationState: 'complete',
        analysisState: 'complete',
        reportReadiness: 'ready',
        reportReadinessReason: 'Ready for bounded analyst synthesis.',
        readinessDrivers: ['High parser confidence.'],
        readinessRisks: overrides?.readinessRisks ?? [],
        structuralSignals: {
            rowExpansionRatio: 43,
            hasMetadataRows: false,
            hasMultiRowHeader: false,
            usedFallbackContext: false,
        },
        canAnalyze: true,
        cardsCount: 2,
        trustedCardsCount: 2,
        caveats: overrides?.caveats ?? [],
        reportGenerationGate: 'allowed',
        reportGenerationBlockers: [],
    },
    workflow: {
        topWarnings: [],
        issueMappings: [],
        verification: null,
        diff: null,
    },
    summaries: {
        coreAnalysisSummary: null,
        finalSummary: null,
        contextualSummary: null,
    },
    query: null,
    allCards: overrides?.cards ?? [createCard()],
    cards: overrides?.cards ?? [createCard()],
    includedCardIds: ['card-1'],
    excludedCardIds: [],
    excludedEvidence: [],
    evidenceCatalog: [],
} as unknown as ReportEvidenceBundle);

describe('reportQualityHarness', () => {
    it('extracts business KPIs from cards with sum aggregation', () => {
        const result = runReportQualityHarness(createBundle());

        expect(result.businessKpis.length).toBeGreaterThan(0);
        expect(result.businessKpis[0].label).toBe('Total Revenue');
        expect(result.businessKpis[0].source).toBe('card_aggregation');
        expect(result.businessKpis[0].tone).toBe('good');
    });

    it('adds a group count KPI from the primary card', () => {
        const result = runReportQualityHarness(createBundle());

        const countKpi = result.businessKpis.find(kpi => kpi.source === 'card_count');
        expect(countKpi).toBeDefined();
        expect(countKpi!.value).toBe('4');
    });

    it('returns empty businessKpis when no cards have sum aggregation', () => {
        const card = createCard({ aggregation: 'count', valueColumn: null });
        const result = runReportQualityHarness(createBundle({ cards: [card] }));

        expect(result.businessKpis).toEqual([]);
    });

    it('builds caveat rewrites for technical risk text', () => {
        const result = runReportQualityHarness(createBundle({
            readinessRisks: [
                'Cleaned rows expanded 43.0x over raw rows.',
                'Metadata/header recovery signals suggest structural ambiguity.',
            ],
        }));

        expect(result.caveatRewrites.size).toBe(2);
        expect(result.caveatRewrites.get('Cleaned rows expanded 43.0x over raw rows.')).toContain(
            'Data preparation expanded',
        );
        expect(result.caveatRewrites.get('Metadata/header recovery signals suggest structural ambiguity.')).toContain(
            'automated recovery',
        );
    });

    it('detects currency from report title', () => {
        const result = runReportQualityHarness(createBundle({
            reportTitle: 'Income Statement (SGD)',
        }));

        expect(result.detectedCurrency).toBe('SGD');
    });

    it('returns null currency when none detected', () => {
        const result = runReportQualityHarness(createBundle({
            reportTitle: 'Quarterly Report',
        }));

        expect(result.detectedCurrency).toBeNull();
    });
});
