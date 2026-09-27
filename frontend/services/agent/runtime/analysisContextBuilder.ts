import type { AppStore } from '../../../store/useAppStore';
import type {
    CsvData,
    EvidenceHarnessContext,
} from '../../../types';
import { buildDatasetContext } from '../contextBuilder';
import { buildAnalysisIntentBrief } from '../analysisBrief';
import { buildRuntimeSemanticUnderstanding } from '../runtimeSemanticUnderstanding';
import { resolveDatasetBindingTarget } from '../datasetBinding';
import { getSemanticHiddenRowCount } from '../datasetSemantics';
import { analyzeDatasetQualityGovernance } from '../analysisQualityGovernance';
import { buildCanonicalAnalysisSteering, cloneAnalysisSteering } from '../analysisSteering';
import type { DataInvestigationFindings } from './dataInvestigationHarness';
import type { StoreApi, DuckDbAnalysisBinding } from './analysisSessionHelpers';
import { requireDuckDbBinding } from './analysisSessionHelpers';

export type RefreshedAnalysisContext = {
    inputData: CsvData;
    semanticDataForAnalysis: CsvData;
    binding: DuckDbAnalysisBinding;
    columnProfiles: AppStore['columnProfiles'];
    datasetContext: ReturnType<typeof buildDatasetContext>;
    semanticUnderstanding: ReturnType<typeof buildRuntimeSemanticUnderstanding>;
    qualityGovernance: ReturnType<typeof analyzeDatasetQualityGovernance> | null;
    datasetSemanticSnapshot: AppStore['datasetSemanticSnapshot'];
    semanticDatasetVersion: AppStore['semanticDatasetVersion'];
};

export const applyInvestigationSteering = (
    datasetContext: ReturnType<typeof buildDatasetContext>,
    semanticUnderstanding: ReturnType<typeof buildRuntimeSemanticUnderstanding>,
    investigationFindings: DataInvestigationFindings | null,
): EvidenceHarnessContext | null => {
    if (!investigationFindings) {
        datasetContext.analysisSteering = null;
        return null;
    }

    const d = investigationFindings.runtimeDirectives;
    const preferredDimensions = d.preferredDimensions ?? d.preferGroupBy ?? [];
    const blockedDimensions = d.blockedDimensions ?? d.blockGroupBy ?? [];
    const preferredMetrics = d.preferredMetrics ?? [];
    const blockedMetrics = d.blockedMetrics ?? [];

    if ((d.blockGroupBy?.length ?? 0) > 0) {
        const existingBlocked = new Set(datasetContext.blockedDimensions ?? []);
        d.blockGroupBy.forEach(dim => existingBlocked.add(dim));
        datasetContext.blockedDimensions = Array.from(existingBlocked);
        d.blockGroupBy.forEach(dim => {
            if (!semanticUnderstanding.blockedDimensions.includes(dim)) {
                semanticUnderstanding.blockedDimensions.push(dim);
            }
        });
    }

    if (preferredDimensions.length > 0) {
        const existing = new Set(datasetContext.preferredGrainColumns ?? []);
        preferredDimensions.forEach(dim => existing.add(dim));
        datasetContext.preferredGrainColumns = Array.from(existing);
    }
    if (preferredMetrics.length > 0) {
        const existing = new Set(datasetContext.preferredMetricTerms ?? []);
        preferredMetrics.forEach(metric => existing.add(metric));
        datasetContext.preferredMetricTerms = Array.from(existing);
    }
    if (blockedMetrics.length > 0) {
        const existing = new Set(datasetContext.avoidMetricColumns ?? []);
        blockedMetrics.forEach(metric => existing.add(metric));
        datasetContext.avoidMetricColumns = Array.from(existing);
    }

    const avoidedDimensions = new Set(datasetContext.avoidGrainColumns ?? []);
    d.excludeFromAggregation.forEach(desc => avoidedDimensions.add(desc));
    d.softDeprioritizeGroupBy.forEach(dim => avoidedDimensions.add(dim));
    investigationFindings.missingDataPatterns
        .filter(p => p.severity === 'severe' && p.nullRate + p.blankRate >= 0.5)
        .forEach(pattern => avoidedDimensions.add(pattern.column));
    investigationFindings.dimensionCompleteness
        .filter(dimension => dimension.deprioritize)
        .forEach(dimension => avoidedDimensions.add(dimension.column));
    datasetContext.avoidGrainColumns = Array.from(avoidedDimensions);

    if (investigationFindings.suggestedDerivedTopics.length > 0) {
        datasetContext.suggestedDerivedTopics = investigationFindings.suggestedDerivedTopics;
    }
    if (investigationFindings.metricRelationships.length > 0) {
        const terms = new Set<string>();
        investigationFindings.metricRelationships.forEach(r => {
            terms.add(r.left);
            terms.add(r.right);
            terms.add(r.result);
        });
        datasetContext.metricRelationshipTerms = Array.from(terms);
    }

    const pivotOnly = investigationFindings.crossDimensionCardinality
        .filter(c => c.recommendPivotOnly)
        .map(c => ({ dimA: c.dimA, dimB: c.dimB, product: c.product }));
    if (pivotOnly.length > 0) {
        datasetContext.pivotOnlyCombinations = pivotOnly;
    }

    const steering = investigationFindings.analysisSteering
        ? cloneAnalysisSteering(investigationFindings.analysisSteering)
        : buildCanonicalAnalysisSteering({
            semanticUnderstanding,
            reportShapeKind: datasetContext.reportShapeKind ?? null,
            base: {
                preferGroupBy: d.preferGroupBy,
                blockGroupBy: d.blockGroupBy,
                softDeprioritizeGroupBy: d.softDeprioritizeGroupBy,
                preferredDimensions,
                blockedDimensions,
                preferredMetrics,
                blockedMetrics,
                columnRoles: d.columnRoles ?? {},
                excludeFromAggregation: d.excludeFromAggregation,
                hierarchyColumn: d.hierarchyColumn,
                parentDescriptions: investigationFindings.parentDescriptions,
                duplicateDescriptions: investigationFindings.duplicateLabels.map(pair => pair.descriptionB),
                detailRowColumn: d.detailRowColumn,
                detailRowValue: d.detailRowValue,
                detailRowFilter: d.detailRowFilter ?? null,
                promotedChartType: d.promotedChartType,
                blockedChartTypes: d.blockedChartTypes,
                suggestedHideOthers: d.suggestedHideOthers,
                recommendedTopN: d.recommendedTopN,
                pivotOnlyCombinations: pivotOnly,
                widePivotShape: d.widePivotShape,
                periodColumnFamilies: d.periodColumnFamilies,
                formattedNumberColumns: d.formattedNumberColumns,
                pairingSignals: d.pairingSignals,
                duplicateSignatureHints: d.duplicateSignatureHints ?? [],
                reshapeDecision: d.reshapeDecision ?? null,
                reshapeDecisionReasons: d.reshapeDecisionReasons ?? [],
                inferredColumnLabels: d.inferredColumnLabels,
            },
        });
    datasetContext.analysisSteering = cloneAnalysisSteering(steering);
    return steering;
};

export const refreshAnalysisContext = async (
    store: StoreApi,
    origin: 'auto_analysis' | 'chat_follow_up',
    inputData: CsvData,
    addProgress: AppStore['addProgress'],
): Promise<RefreshedAnalysisContext> => {
    await store.getState().ensureDatasetSemanticSnapshot?.(inputData);
    const {
        datasetSemanticSnapshot,
        semanticDatasetVersion,
        columnProfiles,
        reportContextResolution,
        dataPreparationPlan,
    } = store.getState();
    const bindingTarget = resolveDatasetBindingTarget({
        mode: 'analysis',
        csvData: inputData,
        snapshot: datasetSemanticSnapshot,
        semanticDatasetVersion,
    });
    const semanticDataForAnalysis = bindingTarget?.dataset ?? inputData;
    const hiddenSemanticRows = getSemanticHiddenRowCount(
        datasetSemanticSnapshot,
        semanticDatasetVersion,
        inputData,
    );
    if (hiddenSemanticRows > 0) {
        addProgress?.(`AI semantic analysis view excluded ${hiddenSemanticRows} non-detail row(s) from automatic analysis.`, 'system');
    }

    const binding = await requireDuckDbBinding(store, semanticDataForAnalysis);
    const datasetContext = buildDatasetContext(
        semanticDataForAnalysis,
        columnProfiles,
        reportContextResolution,
        datasetSemanticSnapshot,
        semanticDatasetVersion,
        dataPreparationPlan ?? null,
        store.getState().rawCsvData ?? inputData,
    );
    const semanticUnderstanding = buildRuntimeSemanticUnderstanding({
        columns: columnProfiles,
        analysisBrief: buildAnalysisIntentBrief({
            columns: columnProfiles,
            csvData: semanticDataForAnalysis,
            dataPreparationPlan: dataPreparationPlan ?? null,
            datasetSemanticSnapshot,
            semanticDatasetVersion,
        }),
        reportContextResolution,
        datasetSemanticSnapshot,
    });
    const qualityGovernance = origin === 'auto_analysis'
        ? analyzeDatasetQualityGovernance(
            columnProfiles,
            semanticDataForAnalysis,
            datasetContext,
        )
        : null;

    if (qualityGovernance) {
        // Quality governance "blocked" dimensions are data-quality signals (high
        // missing rate, high null-like share), NOT structural blocks.  Route them
        // to avoidGrainColumns so they deprioritize rather than hard-block.
        // This prevents quality signals from cascading into the evidence gate as
        // hard rejects via semanticUnderstanding.blockedDimensions.
        const avoided = new Set(datasetContext.avoidGrainColumns ?? []);
        qualityGovernance.blockedDimensions.forEach(column => avoided.add(column));
        qualityGovernance.avoidDimensions.forEach(column => avoided.add(column));
        datasetContext.avoidGrainColumns = Array.from(avoided);
        datasetContext.qualityBlockedDimensions = [...qualityGovernance.blockedDimensions];

        const avoidedMetrics = new Set(datasetContext.avoidMetricColumns ?? []);
        qualityGovernance.avoidMetrics.forEach(column => avoidedMetrics.add(column));
        datasetContext.avoidMetricColumns = Array.from(avoidedMetrics);
        datasetContext.qualityHintsSummary = qualityGovernance.qualityHintsSummary || undefined;
    }

    return {
        inputData,
        semanticDataForAnalysis,
        binding,
        columnProfiles,
        datasetContext,
        semanticUnderstanding,
        qualityGovernance,
        datasetSemanticSnapshot,
        semanticDatasetVersion,
    };
};
