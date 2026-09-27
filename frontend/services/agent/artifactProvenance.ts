import type {
    AnalysisArtifactEvidenceRef,
    AnalysisArtifactProvenance,
    AnalysisCardData,
    AnalysisPlan,
    AppState,
    QueryPlan,
    QueryTraceEntry,
} from '../../types';
import { buildSemanticDatasetVersion } from './datasetSemantics';
import { getPreferredAnalysisDataset } from './reportStructureState';

type ProvenanceState = Pick<
    AppState,
    'canonicalCsvData'
    | 'csvData'
    | 'currentDatasetId'
    | 'dataPreparationPlan'
> & Partial<Pick<AppState, 'datasetBundle'>>;

const uniqueRefs = (refs: AnalysisArtifactEvidenceRef[]): AnalysisArtifactEvidenceRef[] =>
    refs.filter((ref, index, entries) =>
        entries.findIndex(candidate => candidate.kind === ref.kind && candidate.id === ref.id) === index);

const collectQuerySourceColumns = (query: QueryPlan | null | undefined): string[] => {
    if (!query) return [];
    return Array.from(new Set([
        ...(query.select ?? []),
        ...(query.groupBy ?? []),
        ...(query.aggregates ?? []).flatMap(aggregate => aggregate.column ? [aggregate.column] : []),
    ]));
};

const countFilters = (query: QueryPlan | null | undefined): number =>
    (query?.where?.predicates?.length ?? 0)
    + (query?.where?.groups ?? []).reduce((total, group) => total + group.predicates.length, 0);

export const getCurrentAnalysisDatasetVersion = (
    state: Pick<AppState, 'canonicalCsvData' | 'csvData'>,
): string | null => {
    const data = getPreferredAnalysisDataset(state);
    return data ? buildSemanticDatasetVersion(data) : null;
};

export const buildAnalysisArtifactProvenance = (
    plan: AnalysisPlan,
    state: ProvenanceState,
    options: {
        queryTrace?: QueryTraceEntry | null;
        sourceStepIds?: string[];
        qualityWarnings?: string[];
        evidenceGateDecision?: 'pass' | 'table_only' | 'reject' | null;
        now?: string;
    } = {},
): AnalysisArtifactProvenance => {
    const datasetVersion = getCurrentAnalysisDatasetVersion(state);
    const queryTrace = options.queryTrace ?? null;
    const preparationPlan = state.dataPreparationPlan;
    const sourceStepIds = options.sourceStepIds ?? [];
    const reasons: string[] = [];

    if (!datasetVersion) reasons.push('No current dataset version was available when the artifact was created.');
    if (plan.isFallback) reasons.push('The artifact uses a fallback analysis plan.');
    if (queryTrace?.fallbackReason) reasons.push(`Query fallback: ${queryTrace.fallbackReason}`);
    if ((options.qualityWarnings?.length ?? 0) > 0) reasons.push('The artifact carries data-quality warnings.');
    if (options.evidenceGateDecision === 'table_only') reasons.push('Evidence verification limited the artifact to table-only presentation.');
    if (options.evidenceGateDecision === 'reject') reasons.push('Evidence verification rejected the artifact for narrative use.');

    const evidenceStatus = !datasetVersion || options.evidenceGateDecision === 'reject'
        ? 'hypothesis'
        : reasons.length > 0
            ? 'degraded'
            : 'verified';

    const transformationRefs: AnalysisArtifactEvidenceRef[] = (preparationPlan?.operations ?? []).map(operation => ({
        kind: 'transformation',
        id: operation.id,
        label: `${operation.type}: ${operation.reason}`,
    }));
    const metricValidationRefs: AnalysisArtifactEvidenceRef[] = (preparationPlan?.derivedMetricValidations ?? []).map(validation => ({
        kind: 'metric_validation',
        id: validation.operationId,
        label: `${validation.declaration.metricName}: ${validation.status}`,
    }));
    const query = queryTrace?.plan ?? null;

    return {
        schemaVersion: 1,
        datasetId: state.currentDatasetId ?? null,
        datasetVersion,
        tableId: state.datasetBundle?.primaryTableId ?? null,
        relationshipSetId: state.datasetBundle?.relationshipSetId ?? null,
        evidenceStatus,
        evidenceReasons: reasons,
        method: {
            operation: plan.artifactType ?? plan.chartType,
            groupByColumns: query?.groupBy ?? (plan.groupByColumn ? [plan.groupByColumn] : []),
            aggregations: query?.aggregates?.map(aggregate => ({
                function: aggregate.function,
                column: aggregate.column ?? null,
                alias: aggregate.as,
            })) ?? (plan.aggregation ? [{
                function: plan.aggregation,
                column: plan.valueColumn ?? null,
                alias: plan.valueColumn ?? plan.aggregation,
            }] : []),
            sourceColumns: Array.from(new Set([
                ...collectQuerySourceColumns(query),
                ...(plan.groupByColumn ? [plan.groupByColumn] : []),
                ...(plan.valueColumn ? [plan.valueColumn] : []),
                ...(plan.valueColumns ?? []),
                ...(plan.xValueColumn ? [plan.xValueColumn] : []),
                ...(plan.yValueColumn ? [plan.yValueColumn] : []),
            ])),
            filterCount: countFilters(query) + (plan.preFilter?.length ?? 0),
            pivotRows: plan.artifactType === 'pivot_matrix' && plan.groupByColumn ? [plan.groupByColumn] : [],
            pivotColumns: plan.artifactMetadata?.matrixColumns ?? [],
        },
        queryEvidence: queryTrace ? {
            traceId: queryTrace.id,
            engine: queryTrace.engine,
            loadVersion: queryTrace.loadVersion,
            sqlPreview: queryTrace.sqlPreview,
            fallbackReason: queryTrace.fallbackReason ?? null,
        } : null,
        queryEvidenceRequired: Boolean(queryTrace),
        evidenceRefs: uniqueRefs([
            ...(datasetVersion ? [{
                kind: 'dataset_version' as const,
                id: datasetVersion,
                label: 'Analysis dataset version',
            }] : []),
            ...(queryTrace ? [{
                kind: 'query_trace' as const,
                id: queryTrace.id,
                label: queryTrace.explanation || 'Analysis query',
            }] : []),
            ...transformationRefs,
            ...metricValidationRefs,
            ...sourceStepIds.map(stepId => ({
                kind: 'source_step' as const,
                id: stepId,
                label: 'Analysis source step',
            })),
        ]),
        createdAt: options.now ?? new Date().toISOString(),
    };
};

export type AnalysisArtifactFreshness = 'current' | 'stale' | 'unverified';

export const resolveAnalysisArtifactFreshness = (
    provenance: AnalysisArtifactProvenance | null | undefined,
    currentDatasetVersion: string | null | undefined,
): AnalysisArtifactFreshness => {
    if (!provenance?.datasetVersion || !currentDatasetVersion) return 'unverified';
    return provenance.datasetVersion === currentDatasetVersion ? 'current' : 'stale';
};

export const buildNarrativeArtifactProvenance = (
    state: ProvenanceState,
    cards: AnalysisCardData[],
    now?: string,
): AnalysisArtifactProvenance => {
    const datasetVersion = getCurrentAnalysisDatasetVersion(state);
    const freshness = cards.map(card => resolveAnalysisArtifactFreshness(card.provenance, datasetVersion));
    const hasUnverified = cards.length === 0
        || cards.some(card => !card.provenance || card.provenance.evidenceStatus === 'hypothesis')
        || freshness.some(status => status !== 'current');
    const hasDegraded = cards.some(card => card.provenance?.evidenceStatus === 'degraded');
    const evidenceStatus = hasUnverified ? 'hypothesis' : hasDegraded ? 'degraded' : 'verified';
    const evidenceReasons = [
        ...(hasUnverified ? ['One or more source cards lack current verified provenance.'] : []),
        ...(hasDegraded ? ['One or more source cards use degraded evidence.'] : []),
    ];

    return {
        schemaVersion: 1,
        datasetId: state.currentDatasetId ?? null,
        datasetVersion,
        evidenceStatus,
        evidenceReasons,
        method: {
            operation: 'narrative_summary',
            groupByColumns: Array.from(new Set(cards.flatMap(card => card.provenance?.method.groupByColumns ?? []))),
            aggregations: cards.flatMap(card => card.provenance?.method.aggregations ?? []),
            sourceColumns: Array.from(new Set(cards.flatMap(card => card.provenance?.method.sourceColumns ?? []))),
            filterCount: cards.reduce((total, card) => total + (card.provenance?.method.filterCount ?? 0), 0),
            pivotRows: Array.from(new Set(cards.flatMap(card => card.provenance?.method.pivotRows ?? []))),
            pivotColumns: Array.from(new Set(cards.flatMap(card => card.provenance?.method.pivotColumns ?? []))),
        },
        queryEvidence: null,
        queryEvidenceRequired: false,
        evidenceRefs: uniqueRefs([
            ...(datasetVersion ? [{
                kind: 'dataset_version' as const,
                id: datasetVersion,
                label: 'Narrative dataset version',
            }] : []),
            ...cards.flatMap(card => [
                {
                    kind: 'analysis_card' as const,
                    id: card.id,
                    label: card.plan.title,
                },
                ...(card.provenance?.evidenceRefs ?? []),
            ]),
        ]),
        createdAt: now ?? new Date().toISOString(),
    };
};
