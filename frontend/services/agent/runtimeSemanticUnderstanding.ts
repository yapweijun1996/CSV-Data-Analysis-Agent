import type {
    AnalysisIntentBrief,
    ColumnProfile,
    DatasetSemanticSnapshot,
    ReportContextResolution,
    RuntimeSemanticUnderstanding,
    SemanticColumnRole,
} from '../../types';
import { isTimeLikeDimensionColumn, isRepeatedBundleMemberColumn } from './analysisColumnRoles';
import { isStructuralMetadataColumn } from './structuralMetadata';

// Regex patterns are used ONLY as fallback when AI annotation is missing.
// When AI annotations exist, their semanticRole and isBusinessSafe flags
// are the primary signal for classification.
// IMPORTANT: Only block purely structural columns (row classification, row index).
// Do NOT block SeriesKey, SeriesLabelL1, or SourceColumnName here — they may
// carry business data (e.g. project names/codes after wide-report unpivoting).
// Let the AI annotator and data investigation harness decide their role.
const BLOCKED_DIMENSION_FALLBACK_PATTERN = /^(?:rowclass|sourcerowindex)$/i;
const HELPER_DIMENSION_FALLBACK_PATTERN = /^(?:rowclass|sourcerowindex|hierarchydepth)$/i;

const normalize = (value: string) => value.trim().toLowerCase();

const dedupe = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const canonicalRole = (role: SemanticColumnRole | undefined | null) => {
    switch (role) {
        case 'entity':
            return 'business_entity';
        case 'date':
            return 'time_dimension';
        case 'label':
            return 'descriptor';
        default:
            return role ?? 'unknown';
    }
};

const buildColumnMap = (snapshot?: DatasetSemanticSnapshot | null) =>
    new Map((snapshot?.columnAnnotations ?? []).map(annotation => [annotation.columnName, annotation]));

const classifyDetailRowPolicy = (snapshot?: DatasetSemanticSnapshot | null): RuntimeSemanticUnderstanding['detailRowPolicy'] => {
    if (!snapshot) {
        return 'uncertain';
    }

    const excludedCount = snapshot.recommendedAnalysisView?.excludedRowCount ?? 0;
    if (excludedCount > 0) {
        return 'exclude_non_detail_rows';
    }

    return snapshot.datasetRole === 'detail_table' ? 'preserve_all_rows' : 'uncertain';
};

const collectBusinessGlossary = (
    brief: AnalysisIntentBrief | null | undefined,
    reportContext?: ReportContextResolution | null,
    snapshot?: DatasetSemanticSnapshot | null,
) => dedupe([
    ...(brief?.notes ?? []),
    ...(brief?.targetMetrics ?? []),
    ...(snapshot?.headerSemantics?.businessTerminology ?? []),
    reportContext?.effective?.reportTitle ?? '',
    ...((reportContext?.effective?.parameterLines ?? []).slice(0, 4)),
    ...(snapshot?.columnAnnotations ?? [])
        .map(annotation => annotation.businessLabel ?? '')
        .filter(Boolean),
]);

const summarizeColumnLabels = (snapshot?: DatasetSemanticSnapshot | null) =>
    (snapshot?.columnAnnotations ?? [])
        .slice(0, 10)
        .map(annotation => `${annotation.columnName}: ${canonicalRole(annotation.semanticRole)}${annotation.businessLabel ? ` -> ${annotation.businessLabel}` : ''}`);

const summarizeRowLabels = (snapshot?: DatasetSemanticSnapshot | null) =>
    (snapshot?.rowAnnotations ?? [])
        .filter(annotation => annotation.rowRole !== 'detail')
        .slice(0, 8)
        .map(annotation => `row ${annotation.rowIndex + 1}: ${annotation.rowRole}`);

const collectSignalSources = (params: {
    brief?: AnalysisIntentBrief | null;
    reportContext?: ReportContextResolution | null;
    snapshot?: DatasetSemanticSnapshot | null;
}): RuntimeSemanticUnderstanding['signalSources'] => {
    const sources = new Set<NonNullable<RuntimeSemanticUnderstanding['signalSources']>[number]>();
    if ((params.snapshot?.columnAnnotations?.length ?? 0) > 0 || params.snapshot?.headerSemantics) {
        sources.add('semantic_annotations');
    }
    if (params.brief) {
        sources.add('analysis_brief');
    }
    if (params.reportContext?.effective?.reportTitle || (params.reportContext?.effective?.parameterLines?.length ?? 0) > 0) {
        sources.add('report_context');
    }
    if (sources.size === 0) {
        sources.add('fallback_heuristics');
    }
    return Array.from(sources);
};

const classifySignalConfidence = (params: {
    signalSources: RuntimeSemanticUnderstanding['signalSources'];
    conflicts: DatasetSemanticSnapshot['labelingConflicts'];
}): RuntimeSemanticUnderstanding['signalConfidence'] => {
    const sources = params.signalSources ?? [];
    const hasSemanticAnnotations = sources.includes('semantic_annotations');
    const hasFallbackOnly = sources.length === 1 && sources[0] === 'fallback_heuristics';
    const hasWarnConflict = (params.conflicts ?? []).some(conflict => conflict.severity === 'warn');

    if (hasFallbackOnly) {
        return 'low';
    }
    if (hasSemanticAnnotations && !hasWarnConflict) {
        return 'high';
    }
    return 'medium';
};

// --- Column classification: AI-first, regex-fallback ---

const isColumnBlocked = (
    column: string,
    annotation: ReturnType<typeof buildColumnMap> extends Map<string, infer V> ? V : never | undefined,
): boolean => {
    if (isStructuralMetadataColumn(column)) {
        return true;
    }
    if (!annotation) {
        // No AI annotation → fall back to regex.
        return BLOCKED_DIMENSION_FALLBACK_PATTERN.test(column);
    }
    const role = canonicalRole(annotation.semanticRole);
    // AI explicitly marked as not business-safe + helper/note role → blocked.
    if (annotation.isBusinessSafe === false && (role === 'helper_dimension' || role === 'note')) {
        return true;
    }
    // AI assigned note role → blocked.
    if (role === 'note') {
        return true;
    }
    // AI says business-safe → not blocked, regardless of column name.
    if (annotation.isBusinessSafe === true) {
        return false;
    }
    // AI annotation exists but isBusinessSafe is undefined → use regex as tiebreaker.
    return BLOCKED_DIMENSION_FALLBACK_PATTERN.test(column);
};

const isColumnHelper = (
    column: string,
    annotation: ReturnType<typeof buildColumnMap> extends Map<string, infer V> ? V : never | undefined,
): boolean => {
    if (isStructuralMetadataColumn(column)) {
        return true;
    }
    if (!annotation) {
        return HELPER_DIMENSION_FALLBACK_PATTERN.test(column);
    }
    const role = canonicalRole(annotation.semanticRole);
    if (role === 'helper_dimension' || role === 'note') {
        return true;
    }
    // Descriptors (product names, customer labels) are business dimensions by default.
    // Only treat as helper when AI explicitly marks them not business-safe.
    if (role === 'descriptor') {
        return annotation.isBusinessSafe === false;
    }
    // Code columns get the benefit of the doubt — only demote when AI explicitly
    // marks them unsafe.  Ambiguous signals (isBusinessSafe === undefined) should
    // NOT block a column that may carry real business data (e.g. "BUSINESS UNIT"
    // annotated as code).  The evidence gate and planner will deprioritize weak
    // dimensions downstream rather than killing them upfront.
    if (role === 'code') {
        return annotation.isBusinessSafe === false;
    }
    return false;
};

const isColumnBusinessGrain = (
    column: string,
    annotation: ReturnType<typeof buildColumnMap> extends Map<string, infer V> ? V : never | undefined,
    blockedDimensions: string[],
    helperDimensions: string[],
): boolean => {
    if (blockedDimensions.includes(column) || helperDimensions.includes(column)) {
        return false;
    }
    if (!annotation) {
        // No AI annotation — include as business grain unless it looks non-business.
        return true;
    }
    const role = canonicalRole(annotation.semanticRole);
    if (annotation.isBusinessSafe === false) {
        return false;
    }
    // At this point isBusinessSafe !== false (guarded above), so descriptor
    // columns are grain candidates — they carry user-facing labels (product
    // names, customer labels) that analysts want to group by.
    return role === 'business_entity'
        || role === 'business_dimension'
        || role === 'time_dimension'
        || role === 'descriptor'
        || annotation.isPrimaryGrainCandidate === true;
};

export const buildRuntimeSemanticUnderstanding = (params: {
    columns: ColumnProfile[];
    analysisBrief?: AnalysisIntentBrief | null;
    reportContextResolution?: ReportContextResolution | null;
    datasetSemanticSnapshot?: DatasetSemanticSnapshot | null;
}): RuntimeSemanticUnderstanding => {
    const {
        columns,
        analysisBrief,
        reportContextResolution,
        datasetSemanticSnapshot,
    } = params;

    if (datasetSemanticSnapshot?.mergedSemanticBoundary && !analysisBrief) {
        const signalSources = collectSignalSources({
            brief: analysisBrief,
            reportContext: reportContextResolution,
            snapshot: datasetSemanticSnapshot,
        });
        return {
            ...datasetSemanticSnapshot.mergedSemanticBoundary,
            signalSources,
            signalConfidence: classifySignalConfidence({
                signalSources,
                conflicts: datasetSemanticSnapshot.labelingConflicts ?? [],
            }),
        };
    }

    const dimensionColumns = columns
        .filter(column => ['categorical', 'date', 'time'].includes(column.type))
        .map(column => column.name);
    const metricColumns = columns
        .filter(column => ['numerical', 'currency', 'percentage'].includes(column.type))
        .map(column => column.name);
    const columnMap = buildColumnMap(datasetSemanticSnapshot);
    const preferredGrains = analysisBrief?.grainCandidates ?? [];
    const timeGrains = dedupe([
        ...columns.filter(column => column.type === 'date' || column.type === 'time').map(column => column.name),
        ...(datasetSemanticSnapshot?.columnAnnotations ?? [])
            .filter(annotation => canonicalRole(annotation.semanticRole) === 'time_dimension')
            .map(annotation => annotation.columnName),
    ]);

    // AI-first classification: use annotation roles and isBusinessSafe as
    // the primary signal. Regex patterns serve only as fallback when AI
    // annotation is missing or ambiguous (isBusinessSafe === undefined).
    const blockedDimensions = dedupe(
        dimensionColumns.filter(column => isColumnBlocked(column, columnMap.get(column))),
    );
    const helperDimensions = dedupe(
        dimensionColumns.filter(column => isColumnHelper(column, columnMap.get(column))),
    );
    const allColumnNames = columns.map(column => column.name);
    const businessGrains = dedupe([
        ...preferredGrains.filter(column => !blockedDimensions.includes(column) && !helperDimensions.includes(column)),
        ...dimensionColumns.filter(column => isColumnBusinessGrain(column, columnMap.get(column), blockedDimensions, helperDimensions)),
    ]).filter(column => {
        // Repeated bundle members (e.g. UOM_3 when UOM exists) should not be
        // auto-promoted to business grains unless AI explicitly marked them.
        // Let the repeated bundle detection in analysisColumnRoles.ts handle them.
        if (isRepeatedBundleMemberColumn(column, allColumnNames)) {
            const annotation = columnMap.get(column);
            return annotation?.isPrimaryGrainCandidate === true
                || annotation?.isBusinessSafe === true;
        }
        return true;
    });

    // Fallback: if no business grains were found, promote non-blocked helper
    // dimensions that are categorical.  This prevents the session from entering
    // diagnostic mode just because the LLM annotated a descriptor-role column
    // (e.g. "Description") as a helper instead of a business entity.
    let fallbackPromotedGrains = false;
    if (businessGrains.length === 0) {
        const fallbackGrains = helperDimensions.filter(column =>
            !blockedDimensions.includes(column)
            && columnMap.get(column)?.isBusinessSafe !== false
        );
        if (fallbackGrains.length > 0) {
            businessGrains.push(...fallbackGrains);
            fallbackPromotedGrains = true;
        }
    }

    const candidateMetrics = dedupe([
        ...(analysisBrief?.semanticMetrics ?? []).flatMap(metric => metric.columns ?? []),
        ...metricColumns,
        ...(datasetSemanticSnapshot?.columnAnnotations ?? [])
            .filter(annotation => canonicalRole(annotation.semanticRole) === 'metric' || annotation.isMetricCandidate)
            .map(annotation => annotation.columnName),
    ]).filter(column =>
        !timeGrains.includes(column)
        && !isTimeLikeDimensionColumn(column),
    ).filter(column => !isStructuralMetadataColumn(column));
    const conflicts = datasetSemanticSnapshot?.labelingConflicts ?? [];
    const diagnosticModeRecommended = businessGrains.length === 0 || conflicts.some(conflict => conflict.severity === 'warn');
    // Fallback-promoted grains represent the best available business signal.
    // Marking them unsafe would defeat the rescue — they should proceed with
    // reduced confidence (medium) rather than being blocked entirely.
    const unsafeForBusinessNarrative = businessGrains.length === 0
        || (!fallbackPromotedGrains && businessGrains.every(column => blockedDimensions.includes(column)));
    const businessGrainConfidence: RuntimeSemanticUnderstanding['businessGrainConfidence'] =
        unsafeForBusinessNarrative
            ? 'low'
            : fallbackPromotedGrains
                ? 'medium'
                : businessGrains.length >= 2 && conflicts.length === 0
                    ? 'high'
                    : 'medium';
    const signalSources = collectSignalSources({
        brief: analysisBrief,
        reportContext: reportContextResolution,
        snapshot: datasetSemanticSnapshot,
    });
    const signalConfidence = classifySignalConfidence({ signalSources, conflicts });

    return {
        businessGrains,
        candidateMetrics,
        timeGrains,
        helperDimensions,
        blockedDimensions,
        detailRowPolicy: classifyDetailRowPolicy(datasetSemanticSnapshot),
        businessGlossary: collectBusinessGlossary(analysisBrief, reportContextResolution, datasetSemanticSnapshot),
        businessGrainConfidence,
        unsafeForBusinessNarrative,
        fallbackPromotedGrains,
        headerSemantics: datasetSemanticSnapshot?.headerSemantics ?? null,
        columnLabelingSummary: summarizeColumnLabels(datasetSemanticSnapshot),
        rowLabelingSummary: summarizeRowLabels(datasetSemanticSnapshot),
        conflicts,
        diagnosticModeRecommended,
        signalSources,
        signalConfidence,
    };
};
