import type { AppStore } from '../../../store/useAppStore';
import { AnalysisPlan, CsvRow, AnalysisCardData, LocalizedText, QueryTraceEntry } from '../../../types';
import { buildDisplayAnalysisIr } from '../../dashboard/displayAnalysisIr';
import { getTranslation } from '../../../utils/localization';
import { createProgressMessage } from '../../../utils/messageState';
import { trimProgressMessages } from '../../../utils/storeLimits';
import { DEFAULT_STACKED_PIVOT_COLUMN_TOP_N } from '../../../utils/pivotMatrixCharting';
import { getAvailableChartTypes, getRecommendedPivotChartType } from '../../../utils/chartTypeUtils';
import { isAdditiveAggregation } from '../../../utils/analysisCardPresentation';
import { applyMultiSeriesUpgrade } from './presentationSkill';
import { isStructuralMetadataColumn } from '../structuralMetadata';
import { isTimeLikeDimensionColumn } from '../analysisColumnRoles';
import { buildAnalysisArtifactProvenance } from '../artifactProvenance';
import { buildCardSemanticFingerprint } from '../cardSemanticFingerprint';

type StoreApi = {
    getState: () => AppStore;
    setState: (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;
};

const LOG_PREFIX = '[CardCreator]';

const resolveDisplayChartType = (plan: AnalysisPlan, rows: CsvRow[]) => {
    if (plan.artifactType === 'pivot_matrix') {
        return getRecommendedPivotChartType(plan, rows);
    }
    if (
        !isAdditiveAggregation(plan.aggregation)
        && rows.length > 12
        && (plan.chartType === 'bar' || plan.chartType === 'combo')
        && plan.groupByColumn
        && !isTimeLikeDimensionColumn(plan.groupByColumn)
    ) {
        return 'horizontal_bar';
    }
    return getAvailableChartTypes(plan, rows)[0];
};

const buildFallbackSummary = (
    title: string,
    rawGroupBy: string,
    rawValueColumn: string,
    displayGroupBy: string,
    displayValueColumn: string,
    aggregatedData: CsvRow[],
    language: LocalizedText['language'],
): LocalizedText => {
    const formatValue = (v: unknown): string => {
        if (v == null) return 'n/a';
        if (typeof v === 'number') return Number.isInteger(v) ? String(v) : parseFloat(v.toFixed(2)).toLocaleString();
        return String(v);
    };

    const preview = aggregatedData
        .slice(0, 3)
        .map((row) => {
            const label = row[rawGroupBy] ?? 'Unknown';
            const value = row[rawValueColumn];
            return `- ${String(label)}: ${formatValue(value)}`;
        })
        .join('\n');

    return {
        language,
        text: [
            getTranslation('fallback_card_title', language),
            getTranslation('fallback_card_intro', language, { title }),
            getTranslation('fallback_card_metric_view', language, { metric: displayValueColumn, dimension: displayGroupBy }),
            preview ? getTranslation('fallback_card_preview_title', language) : '',
            preview,
            getTranslation('fallback_card_next_step_title', language),
            getTranslation('fallback_card_next_step_body', language),
        ]
            .filter(Boolean)
            .join('\n'),
    };
};

/**
 * Creates a new analysis card. This involves generating an AI summary,
 * constructing the card data object, updating the application state,
 * and adding the card's information to the long-term vector memory.
 *
 * @param plan The validated analysis plan for the card.
 * @param aggregatedData The data to be visualized in the card.
 * @param store The Zustand store API for state updates.
 * @returns A promise that resolves to the newly created AnalysisCardData object.
 */
export const createNewCard = async (
    plan: AnalysisPlan,
    aggregatedData: CsvRow[],
    store: StoreApi,
    annotations?: Pick<AnalysisCardData, 'sourceTopic' | 'sourceStepIds' | 'analysisSessionRunId' | 'autoAnalysisEvaluation' | 'evidenceValueGate' | 'qualityWarnings' | 'provenance'> & {
        queryTrace?: QueryTraceEntry | null;
    },
): Promise<AnalysisCardData> => {
    const { getState, setState } = store;
    const language = getState().settings.language;

    // Presentation harness: auto-upgrade single-series chart to multi_line
    // when data has 3+ numeric columns but plan only binds one.
    // Backed by the analysis.presentation_upgrade manifest contract.
    const upgradeResult = applyMultiSeriesUpgrade(plan, aggregatedData);
    if (upgradeResult.upgraded) {
        plan = upgradeResult.plan;
    }
    const provenance = annotations?.provenance ?? buildAnalysisArtifactProvenance(plan, getState(), {
        queryTrace: annotations?.queryTrace,
        sourceStepIds: annotations?.sourceStepIds,
        qualityWarnings: annotations?.qualityWarnings,
        evidenceGateDecision: annotations?.evidenceValueGate?.decision ?? null,
    });
    const semanticFingerprint = buildCardSemanticFingerprint(plan, provenance.datasetVersion);
    const duplicateCard = semanticFingerprint
        ? getState().analysisCards.find(card =>
            buildCardSemanticFingerprint(card.plan, card.provenance?.datasetVersion) === semanticFingerprint)
        : undefined;
    if (duplicateCard) {
        const duplicateTitle = buildDisplayAnalysisIr(
            duplicateCard,
            getState().analysisCards,
            getState().columnProfiles,
        ).displayTitle;
        setState(previous => ({
            progressMessages: trimProgressMessages([
                ...previous.progressMessages,
                createProgressMessage({
                    text: `Reused View: ${duplicateTitle}`,
                    type: 'system',
                    timestamp: new Date(),
                }),
            ]),
        }));
        return duplicateCard;
    }

    const provisionalCard: AnalysisCardData = {
        id: 'card-preview',
        plan,
        aggregatedData,
        summary: { language, text: '' },
        displayChartType: resolveDisplayChartType(plan, aggregatedData),
        isDataVisible: plan.defaultDataVisible ?? false,
        topN: null,
        hideOthers: false,
        hideZeroValueRows: false,
        pivotColumnTopN: DEFAULT_STACKED_PIVOT_COLUMN_TOP_N,
        pivotHideOtherColumns: false,
        hiddenPivotSeriesLabels: [],
        hiddenLabels: [],
        sourceTopic: annotations?.sourceTopic ?? null,
        sourceStepIds: annotations?.sourceStepIds ?? [],
        analysisSessionRunId: annotations?.analysisSessionRunId ?? null,
        provenance,
        evidenceValueGate: annotations?.evidenceValueGate ?? null,
        autoAnalysisEvaluation: annotations?.autoAnalysisEvaluation ?? null,
        qualityWarnings: annotations?.qualityWarnings ?? [],
    };
    const displayIr = buildDisplayAnalysisIr(provisionalCard, [provisionalCard], getState().columnProfiles);
    console.log(`${LOG_PREFIX} Creating card for plan: "${displayIr.displayTitle}"`);

    // PERF-201: Use instant fallback summary during hypothesis loop.
    // AI summaries are batch-generated in parallel after all cards are created
    // (see summaryManager.ts generateAllSummaries).
    const summary = buildFallbackSummary(
        displayIr.displayTitle,
        plan.groupByColumn || 'group',
        plan.valueColumn || plan.yValueColumn || 'value',
        displayIr.displayGroupLabel || plan.groupByColumn || 'the selected dimension',
        displayIr.displayMetricLabel || plan.valueColumn || plan.yValueColumn || 'the selected metric',
        aggregatedData,
        language,
    );
    console.log(`${LOG_PREFIX} Generated summary for "${displayIr.displayTitle}"`);

    const preserveFullSeries = ['line', 'area', 'multi_line'].includes(plan.chartType);
    const canFoldOthers = isAdditiveAggregation(plan.aggregation);

    const newCard: AnalysisCardData = {
        id: `card-${Date.now()}-${Math.random()}`,
        plan,
        aggregatedData,
        summary,
        displayChartType: resolveDisplayChartType(plan, aggregatedData),
        isDataVisible: plan.defaultDataVisible ?? false,
        topN: plan.disableTopNControls || preserveFullSeries
            ? null
            : (plan.chartType !== 'scatter' && aggregatedData.length > 15 ? 8 : (plan.defaultTopN || null)),
        hideOthers: plan.disableTopNControls || preserveFullSeries || !canFoldOthers
            ? false
            : (plan.chartType !== 'scatter' && aggregatedData.length > 15 ? true : (plan.defaultHideOthers || false)),
        hideZeroValueRows: false,
        pivotColumnTopN: DEFAULT_STACKED_PIVOT_COLUMN_TOP_N,
        pivotHideOtherColumns: false,
        hiddenPivotSeriesLabels: [],
        disableAnimation: getState().analysisCards.length > 0,
        hiddenLabels: [],
        sourceTopic: annotations?.sourceTopic ?? null,
        sourceStepIds: annotations?.sourceStepIds ?? [],
        analysisSessionRunId: annotations?.analysisSessionRunId ?? null,
        provenance,
        evidenceValueGate: annotations?.evidenceValueGate ?? null,
        autoAnalysisEvaluation: annotations?.autoAnalysisEvaluation ?? null,
        qualityWarnings: annotations?.qualityWarnings ?? [],
    };

    // Batch card insertion + progress into a single setState to avoid two
    // separate re-render cycles (reduces ChatPanel re-renders by ~50%).
    const _cardSetT0 = performance.now();
    // PERF-309 diagnostic: measure setState updater vs React re-render
    let _updaterDur = 0;
    setState(prev => {
        const _uT0 = performance.now();
        const result = {
            analysisCards: [newCard, ...prev.analysisCards],
            finalSummary: null,
            finalSummaryProvenance: null,
            aiCoreAnalysisSummary: null,
            aiCoreAnalysisSummaryProvenance: null,
            progressMessages: trimProgressMessages([
                ...prev.progressMessages,
                createProgressMessage({ text: `Generated View: ${displayIr.displayTitle}`, type: 'system', timestamp: new Date() }),
            ]),
        };
        _updaterDur = performance.now() - _uT0;
        return result;
    });
    const _totalDur = performance.now() - _cardSetT0;
    console.log(`[Perf:Card] setState(analysisCards): ${Math.round(_totalDur)}ms (updater=${Math.round(_updaterDur)}ms, react=${Math.round(_totalDur - _updaterDur)}ms) | "${displayIr.displayTitle.slice(0, 40)}"`);
    // PERF-101: Yield to browser between card insertions. Double-rAF was tried
    // but made lag worse — each rAF handler got blocked 4.4s by React re-render.
    // setTimeout(0) is lighter: it yields to the macrotask queue without waiting
    // for paint. Charts paint after the hypothesis loop completes.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    // PERF-201: Memory upsert deferred to after hypothesis loop completes.
    // upsertCardMemoryDocument triggers ONNX embedding (8-18s/card) which
    // blocks the vector Worker and delays subsequent vectorStore.searchIfReady calls.
    console.log(`${LOG_PREFIX} Card "${displayIr.displayTitle}" created and added to state and memory.`);
    return newCard;
};
