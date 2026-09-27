import type {
    EvidenceHarnessContext,
    RuntimeSemanticUnderstanding,
    ReportShapeClass,
} from '../../types';

const formatList = (values: string[] | undefined) =>
    values && values.length > 0 ? values.join(', ') : 'none';

const dedupe = <T extends string>(values: T[] | undefined) =>
    Array.from(new Set((values ?? []).filter(Boolean))) as T[];

const normalizeShapeHint = (value: string | null | undefined) => value?.trim().toLowerCase() ?? '';

const deriveReportShapeClass = (params: {
    reportShapeKind?: string | null;
    steering: EvidenceHarnessContext;
}): ReportShapeClass => {
    const hint = normalizeShapeHint(params.reportShapeKind);
    if (hint.includes('mixed')) {
        return 'mixed_tabular';
    }
    if (hint.includes('hierarch')) {
        return 'hierarchical_statement';
    }
    if (hint.includes('pivot') || hint.includes('cross')) {
        return 'wide_pivot';
    }
    if (hint.includes('detail') || hint.includes('tabular') || hint.includes('table')) {
        return 'detail_table';
    }
    if (params.steering.parentDescriptions.length > 0 || params.steering.hierarchyColumn) {
        return 'hierarchical_statement';
    }
    if (params.steering.widePivotShape) {
        return 'wide_pivot';
    }
    if ((params.steering.preferGroupBy.length ?? 0) > 0) {
        return 'detail_table';
    }
    if (params.steering.detailRowPolicy === 'uncertain') {
        return 'uncertain';
    }
    return 'detail_table';
};

const deriveHierarchyMode = (steering: EvidenceHarnessContext) => {
    if (steering.reportShapeClass !== 'hierarchical_statement') {
        return 'none' as const;
    }
    if (steering.detailRowColumn && steering.detailRowValue) {
        return 'preserve' as const;
    }
    if (steering.hierarchyColumn || steering.parentDescriptions.length > 0) {
        return 'annotation_fallback' as const;
    }
    return 'uncertain' as const;
};

const deriveWidePivotMode = (steering: EvidenceHarnessContext) => {
    if (!steering.widePivotShape) {
        return 'none' as const;
    }
    // Prefer the harness-resolved reshapeDecision directive when available.
    // This directive is produced by the conflict resolution phase in the
    // investigation harness, which evaluates hierarchy vs wide-pivot vs
    // period-column signals and resolves any conflict as a structured finding.
    if (steering.reshapeDecision) {
        return steering.reshapeDecision;
    }
    // Fallback for legacy paths where the harness did not run or did not
    // produce a reshapeDecision (e.g. older sessions, manual steering).
    if (steering.reportShapeClass === 'hierarchical_statement') {
        return 'annotation_fallback' as const;
    }
    return 'reshape_required' as const;
};

const deriveSignalConfidence = (params: {
    semanticUnderstanding?: RuntimeSemanticUnderstanding | null;
    signalSources: EvidenceHarnessContext['signalSources'];
}) => {
    if (params.semanticUnderstanding?.signalConfidence) {
        if ((params.signalSources ?? []).includes('investigation_harness')) {
            return params.semanticUnderstanding.signalConfidence === 'low'
                ? 'medium'
                : params.semanticUnderstanding.signalConfidence;
        }
        return params.semanticUnderstanding.signalConfidence;
    }

    if ((params.signalSources ?? []).includes('investigation_harness')) {
        return 'medium' as const;
    }
    return 'low' as const;
};

export const buildCanonicalAnalysisSteering = (params: {
    base: EvidenceHarnessContext;
    semanticUnderstanding?: RuntimeSemanticUnderstanding | null;
    reportShapeKind?: string | null;
}): EvidenceHarnessContext => {
    const signalSources = dedupe([
        ...(params.semanticUnderstanding?.signalSources ?? []),
        ...(params.base.signalSources ?? []),
        'investigation_harness',
    ]);

    const base: EvidenceHarnessContext = {
        ...params.base,
        preferGroupBy: [...params.base.preferGroupBy],
        blockGroupBy: [...params.base.blockGroupBy],
        softDeprioritizeGroupBy: [...(params.base.softDeprioritizeGroupBy ?? [])],
        preferredDimensions: [...(params.base.preferredDimensions ?? params.base.preferGroupBy ?? [])],
        blockedDimensions: [...(params.base.blockedDimensions ?? params.base.blockGroupBy ?? [])],
        preferredMetrics: [...(params.base.preferredMetrics ?? [])],
        blockedMetrics: [...(params.base.blockedMetrics ?? [])],
        columnRoles: { ...(params.base.columnRoles ?? {}) },
        excludeFromAggregation: [...params.base.excludeFromAggregation],
        parentDescriptions: [...params.base.parentDescriptions],
        duplicateDescriptions: [...params.base.duplicateDescriptions],
        blockedChartTypes: [...(params.base.blockedChartTypes ?? [])],
        formattedNumberColumns: [...(params.base.formattedNumberColumns ?? [])],
        pivotOnlyCombinations: [...(params.base.pivotOnlyCombinations ?? [])],
        pairingSignals: [...(params.base.pairingSignals ?? [])],
        detailRowFilter: params.base.detailRowFilter
            ? { ...params.base.detailRowFilter }
            : params.base.detailRowColumn && params.base.detailRowValue
                ? { column: params.base.detailRowColumn, value: params.base.detailRowValue }
                : null,
        duplicateSignatureHints: [...(params.base.duplicateSignatureHints ?? [])],
        detailRowPolicy: params.base.detailRowPolicy ?? params.semanticUnderstanding?.detailRowPolicy ?? 'uncertain',
        signalSources,
        inferredColumnLabels: { ...(params.base.inferredColumnLabels ?? {}) },
    };

    base.reportShapeClass = base.reportShapeClass ?? deriveReportShapeClass({
        reportShapeKind: params.reportShapeKind,
        steering: base,
    });
    base.hierarchyMode = base.hierarchyMode ?? deriveHierarchyMode(base);
    base.widePivotMode = base.widePivotMode ?? deriveWidePivotMode(base);
    base.signalConfidence = base.signalConfidence ?? deriveSignalConfidence({
        semanticUnderstanding: params.semanticUnderstanding,
        signalSources,
    });
    return base;
};

export const cloneAnalysisSteering = (
    steering: EvidenceHarnessContext | null | undefined,
): EvidenceHarnessContext | null => {
    if (!steering) {
        return null;
    }
    return {
        preferGroupBy: [...steering.preferGroupBy],
        blockGroupBy: [...steering.blockGroupBy],
        softDeprioritizeGroupBy: [...(steering.softDeprioritizeGroupBy ?? [])],
        preferredDimensions: [...(steering.preferredDimensions ?? steering.preferGroupBy ?? [])],
        blockedDimensions: [...(steering.blockedDimensions ?? steering.blockGroupBy ?? [])],
        preferredMetrics: [...(steering.preferredMetrics ?? [])],
        blockedMetrics: [...(steering.blockedMetrics ?? [])],
        columnRoles: { ...(steering.columnRoles ?? {}) },
        reportShapeClass: steering.reportShapeClass ?? 'uncertain',
        detailRowPolicy: steering.detailRowPolicy ?? 'uncertain',
        hierarchyMode: steering.hierarchyMode ?? 'uncertain',
        widePivotMode: steering.widePivotMode ?? 'uncertain',
        signalSources: [...(steering.signalSources ?? [])],
        signalConfidence: steering.signalConfidence ?? 'low',
        excludeFromAggregation: [...steering.excludeFromAggregation],
        hierarchyColumn: steering.hierarchyColumn,
        parentDescriptions: [...steering.parentDescriptions],
        duplicateDescriptions: [...steering.duplicateDescriptions],
        detailRowColumn: steering.detailRowColumn,
        detailRowValue: steering.detailRowValue,
        detailRowFilter: steering.detailRowFilter
            ? { ...steering.detailRowFilter }
            : steering.detailRowColumn && steering.detailRowValue
                ? { column: steering.detailRowColumn, value: steering.detailRowValue }
                : null,
        promotedChartType: steering.promotedChartType ?? null,
        blockedChartTypes: [...(steering.blockedChartTypes ?? [])],
        suggestedHideOthers: steering.suggestedHideOthers ?? false,
        recommendedTopN: steering.recommendedTopN ?? null,
        widePivotShape: steering.widePivotShape ?? false,
        periodColumnFamilies: [...(steering.periodColumnFamilies ?? [])],
        formattedNumberColumns: [...(steering.formattedNumberColumns ?? [])],
        pivotOnlyCombinations: [...(steering.pivotOnlyCombinations ?? [])],
        pairingSignals: [...(steering.pairingSignals ?? [])],
        duplicateSignatureHints: [...(steering.duplicateSignatureHints ?? [])],
        reshapeDecision: steering.reshapeDecision ?? null,
        reshapeDecisionReasons: [...(steering.reshapeDecisionReasons ?? [])],
        inferredColumnLabels: { ...(steering.inferredColumnLabels ?? {}) },
    };
};

export const formatAnalysisSteeringBundle = (
    steering: EvidenceHarnessContext | null | undefined,
): string | null => {
    if (!steering) {
        return null;
    }

    const lines = [
        `Report shape class: ${steering.reportShapeClass ?? 'uncertain'}`,
        `Detail row policy: ${steering.detailRowPolicy ?? 'uncertain'}`,
        `Hierarchy mode: ${steering.hierarchyMode ?? 'uncertain'}`,
        `Wide pivot mode: ${steering.widePivotMode ?? 'uncertain'}`,
        `Signal sources: ${formatList(steering.signalSources)}`,
        `Signal confidence: ${steering.signalConfidence ?? 'low'}`,
        `Preferred groupBy dimensions: ${formatList(steering.preferGroupBy)}`,
        `Blocked groupBy dimensions: ${formatList(steering.blockGroupBy)}`,
        `Soft-deprioritized dimensions: ${formatList(steering.softDeprioritizeGroupBy)}`,
        `Preferred dimensions: ${formatList(steering.preferredDimensions)}`,
        `Blocked dimensions: ${formatList(steering.blockedDimensions)}`,
        `Preferred metrics: ${formatList(steering.preferredMetrics)}`,
        `Blocked metrics: ${formatList(steering.blockedMetrics)}`,
        `Exclude from aggregation labels: ${formatList(steering.excludeFromAggregation)}`,
        ...(steering.excludeFromAggregation.length > 0 && steering.hierarchyColumn
            ? [`Hierarchy exclusion filter: use preFilter [{ column: "${steering.hierarchyColumn}", operator: "not_in", value: [${steering.excludeFromAggregation.map(v => `"${v}"`).join(', ')}] }] to exclude parent subtotal rows from aggregation. If preFilter is not supported by the tool, omit the filter entirely — do NOT pass a malformed predicate.`]
            : []),
        `Detail-row filter: ${steering.detailRowFilter ? `${steering.detailRowFilter.column} = ${steering.detailRowFilter.value}` : steering.detailRowColumn && steering.detailRowValue ? `${steering.detailRowColumn} = ${steering.detailRowValue}` : 'none'}`,
        `Recommended topN: ${steering.recommendedTopN ?? 'none'}`,
        `Suggested hide others: ${steering.suggestedHideOthers ? 'yes' : 'no'}`,
        `Promoted chart type: ${steering.promotedChartType ?? 'none'}`,
        `Blocked chart types: ${formatList(steering.blockedChartTypes)}`,
        `Pivot-only combinations: ${steering.pivotOnlyCombinations && steering.pivotOnlyCombinations.length > 0 ? steering.pivotOnlyCombinations.map(pair => `${pair.dimA} x ${pair.dimB} (${pair.product})`).join(', ') : 'none'}`,
        `Wide pivot shape: ${steering.widePivotShape ? 'yes' : 'no'}`,
        `Reshape decision: ${steering.reshapeDecision ?? 'none'}${steering.reshapeDecisionReasons?.length ? ` (${steering.reshapeDecisionReasons.join(', ')})` : ''}`,
        ...(steering.widePivotShape && !steering.reshapeDecision
            ? ['RESHAPE DECISION PENDING: The dataset has a wide-pivot shape but the harness could not determine whether to reshape. Use data.reshape if the wide columns encode a repeating temporal/series dimension (e.g. monthly columns). Use data.keep_wide if the columns are independent metrics (e.g. paired Sales MT + Ave Price per period). Make this decision BEFORE creating analysis plans.']
            : []),
        `Formatted number columns: ${formatList(steering.formattedNumberColumns)}`,
        ...(steering.formattedNumberColumns && steering.formattedNumberColumns.length > 0
            ? ['NOTE: The query compiler automatically strips commas, currency symbols ($€£¥), and parenthetical negatives before CAST to DOUBLE for all aggregate functions (SUM, AVG, etc.). You do NOT need to add REPLACE() or TRY_CAST() in your data.query plans — just reference the column name directly in aggregates.']
            : []),
        ...(steering.detailRowFilter
            ? ['NOTE: The detail-row filter is auto-injected into data.query plans by the system. Do NOT manually add RowRole/RowClass predicates to your query WHERE clause — this is handled deterministically.']
            : []),
    ];

    if (steering.periodColumnFamilies && steering.periodColumnFamilies.length > 0) {
        for (const family of steering.periodColumnFamilies) {
            const quarters = Object.entries(family.quarterMap).filter(([, cols]) => cols.length > 0);
            lines.push(`Period columns (${family.year ?? 'no year'}): ${family.columns.join(', ')}`);
            if (quarters.length > 0) {
                lines.push(`Quarter map: ${quarters.map(([q, cols]) => `${q}=[${cols.join(',')}]`).join(', ')}`);
            }
        }
    }

    if (steering.pairingSignals && steering.pairingSignals.length > 0) {
        lines.push(`Pairing signals: ${steering.pairingSignals.map(signal => `${signal.codeColumn} -> ${signal.labelColumn} (${signal.pairingConfidence}, ${signal.pairingSource}, ${signal.action})`).join('; ')}`);
    }
    if (steering.duplicateSignatureHints && steering.duplicateSignatureHints.length > 0) {
        lines.push(`Duplicate signature hints: ${steering.duplicateSignatureHints.join('; ')}`);
    }
    if (steering.inferredColumnLabels && Object.keys(steering.inferredColumnLabels).length > 0) {
        const labelLines = Object.entries(steering.inferredColumnLabels)
            .map(([col, label]) => `  ${col} → "${label}"`)
            .join('\n');
        lines.push(`Inferred column labels (treat these as the human-readable names):\n${labelLines}`);
    }

    return lines.join('\n');
};
