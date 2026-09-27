import type {
    AnalysisCardData,
    AnalysisMetricSemanticName,
    AnalysisPlan,
    AppState,
    MetricMappingValidationArtifact,
    SqlAnalysisPlan,
    ToolExecutionResult,
} from '../../../types';
import { buildAnalysisIntentBrief, extractRequestedDerivedMetrics } from '../analysisBrief';

type CreatePlanPreflightState = Pick<
    AppState,
    | 'activeDataQuery'
    | 'activeMetricMappingValidation'
    | 'activeTurn'
    | 'analysisCards'
    | 'columnProfiles'
    | 'csvData'
    | 'dataPreparationPlan'
    | 'datasetSemanticSnapshot'
    | 'semanticDatasetVersion'
>;

const DERIVED_PATHS = new Set(['derive_metric_by_label_then_plan', 'derive_column_then_plan']);
const DERIVED_ALIAS_TERMS = [
    { metric: 'profit' as const, pattern: /\bprofit(?:ability)?\b/i },
    { metric: 'margin' as const, pattern: /\bmargin\b/i },
    { metric: 'variance' as const, pattern: /\bvariance\b|\bdelta\b/i },
];

const isObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value: unknown) =>
    String(value ?? '')
        .replace(/[_-]+/g, ' ')
        .trim()
        .toLowerCase();

const collectStringValues = (value: unknown): string[] => {
    if (typeof value === 'string') {
        return [value];
    }
    if (Array.isArray(value)) {
        return value.flatMap(entry => collectStringValues(entry));
    }
    if (isObject(value)) {
        return Object.values(value).flatMap(entry => collectStringValues(entry));
    }
    return [];
};

const isSqlPlanLike = (plan: unknown): plan is SqlAnalysisPlan =>
    isObject(plan)
    && isObject(plan.query)
    && isObject(plan.bindings);

const getRequestedDerivedMetrics = (
    userMessage: string | null | undefined,
    plan: AnalysisPlan | SqlAnalysisPlan | Record<string, unknown>,
) => {
    const sources = [
        userMessage ?? '',
        ...collectStringValues({
            title: (plan as Record<string, unknown>).title,
            description: (plan as Record<string, unknown>).description,
            bindings: (plan as Record<string, unknown>).bindings,
            query: {
                select: (plan as Record<string, unknown>).query && isObject((plan as Record<string, unknown>).query)
                    ? ((plan as Record<string, unknown>).query as Record<string, unknown>).select
                    : undefined,
                aggregates: (plan as Record<string, unknown>).query && isObject((plan as Record<string, unknown>).query)
                    ? ((plan as Record<string, unknown>).query as Record<string, unknown>).aggregates
                    : undefined,
            },
            valueColumn: (plan as Record<string, unknown>).valueColumn,
            secondaryValueColumn: (plan as Record<string, unknown>).secondaryValueColumn,
        }),
    ];
    const requested = new Set<AnalysisMetricSemanticName>();
    sources.forEach(source => {
        extractRequestedDerivedMetrics(source).forEach(metric => requested.add(metric));
    });
    return Array.from(requested);
};

const collectStructuralMetricRefs = (plan: AnalysisPlan | SqlAnalysisPlan | Record<string, unknown>) => {
    const refs = new Set<string>();
    const rawPlan = plan as Record<string, unknown>;

    [
        rawPlan.valueColumn,
        rawPlan.secondaryValueColumn,
        rawPlan.xValueColumn,
        rawPlan.yValueColumn,
        rawPlan.valueColumns,
        rawPlan.values,
        rawPlan.metrics,
        rawPlan.columns,
        rawPlan.yAxis,
    ].forEach(value => {
        collectStringValues(value).forEach(entry => refs.add(normalizeText(entry)));
    });

    if (isObject(rawPlan.bindings)) {
        Object.values(rawPlan.bindings).forEach(value => {
            collectStringValues(value).forEach(entry => refs.add(normalizeText(entry)));
        });
    }

    if (isObject(rawPlan.query)) {
        collectStringValues((rawPlan.query as Record<string, unknown>).select).forEach(entry => refs.add(normalizeText(entry)));
        const aggregates = Array.isArray((rawPlan.query as Record<string, unknown>).aggregates)
            ? ((rawPlan.query as Record<string, unknown>).aggregates as unknown[])
            : [];
        aggregates.forEach(aggregate => {
            if (!isObject(aggregate)) return;
            collectStringValues(aggregate.as).forEach(entry => refs.add(normalizeText(entry)));
        });
    }

    return Array.from(refs).filter(Boolean);
};

const findReferencedDerivedMetrics = (refs: string[]) => {
    const derivedMetrics = new Set<AnalysisMetricSemanticName>();
    refs.forEach(ref => {
        DERIVED_ALIAS_TERMS.forEach(({ metric, pattern }) => {
            if (pattern.test(ref)) {
                derivedMetrics.add(metric);
            }
        });
    });
    return Array.from(derivedMetrics);
};

const cardHasDerivedMetric = (card: AnalysisCardData, metrics: AnalysisMetricSemanticName[]) => {
    const refs = new Set<string>();
    [
        card.plan.valueColumn,
        card.plan.secondaryValueColumn,
        card.plan.xValueColumn,
        card.plan.yValueColumn,
        ...Object.keys(card.aggregatedData?.[0] ?? {}),
    ].forEach(value => {
        if (typeof value === 'string' && value.trim()) {
            refs.add(normalizeText(value));
        }
    });
    return metrics.some(metric => Array.from(refs).some(ref => DERIVED_ALIAS_TERMS.some(candidate => candidate.metric === metric && candidate.pattern.test(ref))));
};

const hasVisibleDerivedMetric = (
    state: CreatePlanPreflightState,
    metrics: AnalysisMetricSemanticName[],
    validationArtifact: MetricMappingValidationArtifact | null,
) => {
    if (metrics.length === 0) {
        return false;
    }

    const datasetColumns = new Set((state.columnProfiles ?? []).map(profile => normalizeText(profile.name)));
    if (metrics.some(metric => Array.from(datasetColumns).some(column => DERIVED_ALIAS_TERMS.some(candidate => candidate.metric === metric && candidate.pattern.test(column))))) {
        return true;
    }

    const visibleQueryColumns = new Set((state.activeDataQuery?.result.selectedColumns ?? []).map(column => normalizeText(column)));
    if (metrics.some(metric => Array.from(visibleQueryColumns).some(column => DERIVED_ALIAS_TERMS.some(candidate => candidate.metric === metric && candidate.pattern.test(column))))) {
        return true;
    }

    if ((state.analysisCards ?? []).some(card => cardHasDerivedMetric(card, metrics))) {
        return true;
    }

    return Boolean(
        validationArtifact
        && validationArtifact.recommendedAction === 'visualize'
        && metrics.includes(validationArtifact.metricName),
    );
};

export const validateCreatePlanPreflight = ({
    plan,
    state,
}: {
    plan: AnalysisPlan | SqlAnalysisPlan | Record<string, unknown>;
    state: CreatePlanPreflightState;
}): ToolExecutionResult | null => {
    if (!state.columnProfiles?.length) {
        return null;
    }

    const analysisBrief = buildAnalysisIntentBrief({
        columns: state.columnProfiles,
        csvData: state.csvData ?? null,
        dataPreparationPlan: state.dataPreparationPlan ?? null,
        datasetSemanticSnapshot: state.datasetSemanticSnapshot ?? null,
        semanticDatasetVersion: state.semanticDatasetVersion ?? null,
    });
    if (!DERIVED_PATHS.has(analysisBrief.recommendedPath)) {
        return null;
    }

    const requestedDerivedMetrics = getRequestedDerivedMetrics(state.activeTurn?.userMessage, plan);
    if (requestedDerivedMetrics.length === 0) {
        return null;
    }

    const structuralRefs = collectStructuralMetricRefs(plan);
    const referencedDerivedMetrics = findReferencedDerivedMetrics(structuralRefs);
    if (referencedDerivedMetrics.length === 0) {
        return null;
    }

    const validationArtifact = state.activeMetricMappingValidation ?? null;
    if (hasVisibleDerivedMetric(state, referencedDerivedMetrics, validationArtifact)) {
        return null;
    }

    const summaryMetrics = referencedDerivedMetrics.join(', ');
    const message = validationArtifact?.recommendedAction === 'derive_metric'
        ? `analysis.create_plan cannot directly generate the derived metric (${summaryMetrics}) before it is materialized. The metric mapping is already validated, but you must derive the metric deterministically before creating this card.`
        : `analysis.create_plan cannot directly generate the derived metric (${summaryMetrics}) on this label/value financial dataset. Validate the metric mapping and derive the metric before creating this card.`;
    const retryHint = validationArtifact?.recommendedAction === 'derive_metric'
        ? 'Use analysis.validate_metric_mapping to re-enter the validated derive-metric workflow, then materialize the metric with data.mutate before retrying analysis.create_plan.'
        : 'Use analysis.validate_metric_mapping first, then derive the requested metric deterministically before retrying analysis.create_plan.';

    return {
        status: 'blocked',
        toolName: 'analysis.create_plan',
        message,
        shouldStop: false,
        retryHint,
        artifactMetadata: {
            artifactType: 'analysis_card_attempt',
            recommendedPath: analysisBrief.recommendedPath,
            requestedDerivedMetrics,
            referencedDerivedMetrics,
        },
        observation: {
            type: 'tool_result',
            status: 'blocked',
            summary: message,
            toolName: 'analysis.create_plan',
            code: 'tool_contract',
            retryHint,
            detail: {
                artifactMetadata: {
                    artifactType: 'analysis_card_attempt',
                    recommendedPath: analysisBrief.recommendedPath,
                    requestedDerivedMetrics,
                    referencedDerivedMetrics,
                },
                suggestedNextTool: 'analysis.validate_metric_mapping',
                repairHintCategory: 'derived_metric_validation_required',
                recommendedPath: analysisBrief.recommendedPath,
                activeValidationRecommendedAction: validationArtifact?.recommendedAction ?? null,
            },
        },
    };
};
