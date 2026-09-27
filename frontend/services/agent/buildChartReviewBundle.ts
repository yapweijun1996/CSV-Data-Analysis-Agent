import type { AppStore } from '../../store/useAppStore';
import type { ChartReviewBundle, CleaningInspectionLogEntry, CleaningInspectionTelemetryEntry } from '../../types';
import { buildCleaningInspectionBundle } from './buildCleaningInspectionBundle';

const MAX_CARD_SAMPLE_ROWS = 12;
const MAX_RELEVANT_LOGS = 24;

const toIso = (value: Date | string | null | undefined) => {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const cloneRows = <T>(rows: T[], limit: number): T[] =>
    rows.slice(0, limit).map(row => JSON.parse(JSON.stringify(row)) as T);

const filterChartEvents = (events: CleaningInspectionLogEntry[]): CleaningInspectionLogEntry[] =>
    events
        .filter(event => ['planning', 'execution', 'evaluation', 'chat'].includes(event.phase))
        .slice(-MAX_RELEVANT_LOGS);

const filterChartTelemetry = (events: CleaningInspectionTelemetryEntry[]): CleaningInspectionTelemetryEntry[] =>
    events
        .filter(event => ['summary', 'planner', 'chat', 'insight', 'next_step'].includes(String(event.meta?.callType ?? '')))
        .slice(0, MAX_RELEVANT_LOGS);

export const buildChartReviewBundle = (state: AppStore): ChartReviewBundle => {
    const inspection = buildCleaningInspectionBundle(state);
    const cards = state.analysisCards.map(card => ({
        id: card.id,
        title: card.plan.title,
        description: card.plan.description,
        isFallback: Boolean(card.plan.isFallback),
        chartType: card.plan.chartType,
        displayChartType: card.displayChartType,
        aggregation: card.plan.aggregation ?? null,
        groupByColumn: card.plan.groupByColumn ?? null,
        valueColumn: card.plan.valueColumn ?? null,
        secondaryValueColumn: card.plan.secondaryValueColumn ?? null,
        rowCount: card.aggregatedData.length,
        aggregatedDataSample: cloneRows(card.aggregatedData, MAX_CARD_SAMPLE_ROWS),
        summary: card.summary.text,
        summaryLanguage: card.summary.language,
        topN: card.topN,
        hideOthers: card.hideOthers,
        hiddenLabels: [...(card.hiddenLabels ?? [])],
        cardFilter: card.filter ? { column: card.filter.column, values: [...card.filter.values] } : null,
        isDataVisible: card.isDataVisible,
    }));

    return {
        generatedAt: new Date().toISOString(),
        session: {
            sessionId: state.sessionId,
            datasetId: state.currentDatasetId,
            activeGoal: state.confirmedAnalysisGoal,
            provider: state.settings.provider,
            model: state.settings.complexModel,
        },
        dataset: {
            fileName: state.csvData?.fileName ?? state.rawCsvData?.fileName ?? null,
            rawRowCount: inspection.importFacts.rawRowCount,
            cleanedRowCount: inspection.importFacts.cleanedRowCount,
            columnCount: state.columnProfiles.length,
            qualityIssues: [...inspection.verification.warnings],
        },
        cleaning: {
            status: inspection.cleaning.status,
            planStatus: inspection.cleaning.planStatus,
            consistencyIssues: [...inspection.cleaning.consistencyIssues],
            explanation: inspection.cleaning.explanation,
            operationCount: inspection.cleaning.operationCount,
            baselineNoiseRowsRemoved: inspection.cleaning.baselineNoiseRowsRemoved,
            operations: cloneRows(inspection.cleaning.operations, inspection.cleaning.operations.length),
        },
        verification: {
            datasetSafetyStatus: inspection.verification.datasetSafetyStatus,
            cleaningConsistencyStatus: inspection.verification.cleaningConsistencyStatus,
            overallStatus: inspection.verification.overallStatus,
            downstreamAnalysisBlocked: inspection.verification.downstreamAnalysisBlocked,
        },
        spreadsheetFilter: inspection.spreadsheetFilter,
        cards,
        chartReviewHints: {
            totalCards: cards.length,
            cardsWithNoRows: cards.filter(card => card.rowCount === 0).map(card => card.title),
            cardsWithSingleRow: cards.filter(card => card.rowCount === 1).map(card => card.title),
            cardsUsingFallbackChartType: cards.filter(card => card.displayChartType !== card.chartType).map(card => card.title),
            fallbackCardTitles: cards.filter(card => card.isFallback).map(card => card.title),
            allCardsAreFallback: cards.length > 0 && cards.every(card => card.isFallback),
        },
        relevantLogs: {
            agentEvents: filterChartEvents(inspection.logs.pipeline),
            telemetry: filterChartTelemetry(inspection.logs.telemetry),
        },
        finalSummary: state.finalSummary?.text ?? null,
    };
};
