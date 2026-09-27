import type {
    EvidenceHarnessContext,
    EvidenceValueGateResult,
    PivotDecision,
    PivotMatrixConfig,
    PivotPreference,
    SqlEvidenceQueryPlan,
    SqlEvidenceQueryResultSummary,
} from '../../types';

const EXPLICIT_PIVOT_PATTERNS = [
    /\b(pivot|matrix|crosstab|cross[-\s]?tab|two[-\s]?way table)\b/i,
    /透视/,
    /矩阵/,
    /交叉表/,
];

const detectPrimaryMetric = (
    evidencePlan: SqlEvidenceQueryPlan,
    summary: SqlEvidenceQueryResultSummary,
) => (evidencePlan.query.aggregates ?? [])
    .map(aggregate => aggregate.as?.trim())
    .find((alias): alias is string => Boolean(alias))
    ?? summary.numericColumns[0]
    ?? null;

const resolvePivotRequest = (
    evidencePlan: SqlEvidenceQueryPlan,
    summary: SqlEvidenceQueryResultSummary,
): PivotMatrixConfig | null => {
    const groupByColumns = evidencePlan.query.groupBy ?? [];
    if (groupByColumns.length < 2) {
        return null;
    }

    const [rowDimension, columnDimension] = groupByColumns;
    const aggregate = evidencePlan.query.aggregates?.[0]?.function;
    const metric = detectPrimaryMetric(evidencePlan, summary);
    if (!rowDimension || !columnDimension || !aggregate) {
        return null;
    }

    return {
        rows: [rowDimension],
        columns: [columnDimension],
        metric: metric ?? undefined,
        aggregate,
        title: evidencePlan.title,
        description: evidencePlan.intentSummary,
        topN: summary.rowCount > 8 ? 8 : undefined,
        sort: { by: 'row_total', direction: 'desc' },
    };
};

export const detectPivotPreference = (message: string): PivotPreference =>
    EXPLICIT_PIVOT_PATTERNS.some(pattern => pattern.test(message))
        ? 'explicit_preferred'
        : 'none';

export const resolvePivotDecision = (params: {
    pivotPreference?: PivotPreference;
    datasetShape?: 'wide_report' | string | null;
    evidencePlan?: SqlEvidenceQueryPlan | null;
    evidenceSummary?: SqlEvidenceQueryResultSummary | null;
    valueGate?: EvidenceValueGateResult | null;
    harnessContext?: EvidenceHarnessContext | null;
}): {
    decision: PivotDecision;
    reason: string;
    pivotRequest?: PivotMatrixConfig | null;
} => {
    const pivotPreference = params.pivotPreference ?? 'none';
    const datasetShape = params.datasetShape ?? null;

    if (datasetShape === 'wide_report' && pivotPreference === 'explicit_preferred') {
        return {
            decision: 'reshape_then_redecide',
            reason: 'The dataset still looks like a wide crosstab, so it must be reshaped before deciding between pivot and normal card generation.',
            pivotRequest: null,
        };
    }

    if (params.valueGate?.decision === 'reject') {
        return {
            decision: 'force_table_only',
            reason: 'The current evidence quality is too weak for charted pivot output.',
            pivotRequest: null,
        };
    }

    const evidencePlan = params.evidencePlan ?? null;
    const evidenceSummary = params.evidenceSummary ?? null;
    const pivotRequest = evidencePlan && evidenceSummary
        ? resolvePivotRequest(evidencePlan, evidenceSummary)
        : null;
    const groupByColumns = evidencePlan?.query.groupBy ?? [];
    const groupByA = groupByColumns[0];
    const groupByB = groupByColumns[1];
    const pivotOnlyCombinations = params.harnessContext?.pivotOnlyCombinations ?? [];
    const pivotOnlyPair = Boolean(
        groupByA
        && groupByB
        && pivotOnlyCombinations.some(combination =>
            (combination.dimA === groupByA && combination.dimB === groupByB)
            || (combination.dimA === groupByB && combination.dimB === groupByA),
        ),
    );

    if (pivotPreference === 'explicit_preferred' && pivotRequest) {
        return {
            decision: 'prefer_pivot',
            reason: 'The user explicitly asked for a pivot-style result and the grouped evidence supports a true matrix.',
            pivotRequest,
        };
    }

    if (pivotOnlyPair && pivotRequest) {
        return {
            decision: 'prefer_pivot',
            reason: 'The grouped evidence forms a high-cardinality dimension pair that is more readable as a pivot matrix than a flat grouped card.',
            pivotRequest,
        };
    }

    return {
        decision: 'prefer_normal',
        reason: 'The current request or evidence does not require a pivot-specific presentation.',
        pivotRequest,
    };
};
