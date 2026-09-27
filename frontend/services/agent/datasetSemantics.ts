import type {
    ColumnProfile,
    CsvData,
    DatasetHeaderSemantics,
    DatasetSemanticRole,
    DatasetSemanticSnapshot,
    RowSemanticAnnotation,
    ColumnSemanticAnnotation,
    SemanticAnalysisView,
    SemanticEvidenceSource,
    SemanticLabelConflict,
    SemanticRowRole,
    SemanticColumnRole,
    ReportContextResolution,
    ReportStructureResolution,
} from '../../types';
import { getCsvDatasetVersion } from '../../utils/datasetId';
import { detectTabularRowRole, inferTabularShapeContext } from './reportShapeTabular';
import { buildRuntimeSemanticUnderstanding } from './runtimeSemanticUnderstanding';

const DEFAULT_EXCLUSION_CONFIDENCE = 0.7;
const NON_DETAIL_ROLES = new Set(['subtotal', 'grand_total', 'group_header', 'footer', 'note', 'bucket', 'noise']);
// Heuristic override threshold: only replace AI annotations when the
// heuristic is very confident AND the AI annotation is weaker.  Lowered
// from 0.9 to 0.95 so that AI annotations are preserved more often —
// the runtime semantic understanding now trusts AI roles as the primary
// signal, using regex patterns only as fallback.
const STRONG_HEURISTIC_COLUMN_CONFIDENCE = 0.95;
// Pipeline-generated column names — structural, not domain vocabulary.
const TECHNICAL_COLUMN_PATTERN = /^(?:serieskey|serieslabel(?:l\d+)?|rowclass|sourcecolumnname|sourcerowindex|hierarchydepth)$/i;
// Domain vocabulary fallback for inferFallbackReportType — AI headerSemantics.reportType is primary.
const PROJECT_COLUMN_PATTERN = /\b(project|job|site)\b/i;
const DETAIL_LISTING_PATTERN = /\b(list|listing|detail|details|transaction|transactions)\b/i;
const FINANCIAL_REPORT_PATTERN = /\b(income statement|balance sheet|profit|loss|revenue|expense|cost)\b/i;
const OPERATIONAL_REPORT_PATTERN = /\b(operation|utilization|usage|volume|throughput|inventory)\b/i;

export const isCurrentSemanticFallback = (
    semanticStatus: 'idle' | 'running' | 'ready' | 'fallback' | 'error',
    semanticDatasetVersion: string | null | undefined,
    datasetVersion: string,
): boolean =>
    semanticStatus === 'fallback'
    && semanticDatasetVersion === datasetVersion;

const normalizeSemanticRowRole = (value: unknown): SemanticRowRole => {
    switch (value) {
        case 'detail':
        case 'subtotal':
        case 'grand_total':
        case 'group_header':
        case 'footer':
        case 'note':
        case 'bucket':
        case 'noise':
        case 'unknown':
            return value;
        default:
            return 'unknown';
    }
};

const normalizeSemanticColumnRole = (value: unknown): SemanticColumnRole => {
    switch (value) {
        case 'business_entity':
        case 'business_dimension':
        case 'metric':
        case 'time_dimension':
        case 'descriptor':
        case 'code':
        case 'helper_dimension':
        case 'note':
        case 'unknown':
        case 'entity':
        case 'date':
        case 'label':
            return value;
        default:
            return 'unknown';
    }
};

const toConfidenceBand = (confidence: number): 'high' | 'medium' | 'low' =>
    confidence >= 0.85 ? 'high' : confidence >= 0.6 ? 'medium' : 'low';

const normalizeEvidenceSources = (value: unknown, fallback: SemanticEvidenceSource[]): SemanticEvidenceSource[] => {
    if (!Array.isArray(value)) {
        return fallback;
    }
    const allowed: SemanticEvidenceSource[] = ['ai_prompt_context', 'sample_values', 'type_profile', 'report_context', 'deterministic_pattern'];
    const filtered = value.filter((entry): entry is SemanticEvidenceSource => allowed.includes(entry));
    return filtered.length > 0 ? filtered : fallback;
};

const canonicalColumnRole = (role: SemanticColumnRole): Exclude<SemanticColumnRole, 'entity' | 'date' | 'label'> => {
    switch (role) {
        case 'entity':
            return 'business_entity';
        case 'date':
            return 'time_dimension';
        case 'label':
            return 'descriptor';
        default:
            return role;
    }
};

// Domain vocabulary fallback — AI headerSemantics.reportType is the primary signal.
// Called only when input?.reportType is absent.
const inferFallbackReportType = (reportTitle: string | null | undefined, parameterLines: string[] | undefined) => {
    const combined = [reportTitle ?? '', ...(parameterLines ?? [])].join(' ').toLowerCase();
    if (FINANCIAL_REPORT_PATTERN.test(combined)) {
        return 'financial_statement' as const;
    }
    if (PROJECT_COLUMN_PATTERN.test(combined)) {
        return 'project_report' as const;
    }
    if (OPERATIONAL_REPORT_PATTERN.test(combined)) {
        return 'operational_report' as const;
    }
    if (DETAIL_LISTING_PATTERN.test(combined)) {
        return 'detail_listing' as const;
    }
    return 'unknown' as const;
};

const clampConfidence = (value: unknown): number => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.min(1, Math.max(0, numeric));
};

const coerceDatasetRole = (value: unknown): DatasetSemanticRole => {
    switch (value) {
        case 'detail_table':
        case 'summary_report':
        case 'mixed_report':
            return value;
        default:
            return 'unknown';
    }
};

const sanitizeRowAnnotation = (annotation: Partial<RowSemanticAnnotation>, rowCount: number): RowSemanticAnnotation | null => {
    if (!Number.isInteger(annotation.rowIndex) || annotation.rowIndex! < 0 || annotation.rowIndex! >= rowCount) {
        return null;
    }

    return {
        rowIndex: annotation.rowIndex!,
        rowRole: normalizeSemanticRowRole(annotation.rowRole),
        confidence: clampConfidence(annotation.confidence),
        reason: typeof annotation.reason === 'string' && annotation.reason.trim().length > 0
            ? annotation.reason.trim()
            : 'No reason provided.',
        confidenceBand: typeof annotation.confidenceBand === 'string' ? annotation.confidenceBand : toConfidenceBand(clampConfidence(annotation.confidence)),
        evidenceSources: normalizeEvidenceSources(annotation.evidenceSources, ['ai_prompt_context']),
        conflictDetected: Boolean(annotation.conflictDetected),
        labelingSource: annotation.labelingSource ?? 'ai',
        excludeFromDefaultAnalysis: annotation.excludeFromDefaultAnalysis,
        unsafeForNarrative: annotation.unsafeForNarrative,
    };
};

const sanitizeColumnAnnotation = (
    annotation: Partial<ColumnSemanticAnnotation>,
    columnNames: string[],
): ColumnSemanticAnnotation | null => {
    if (typeof annotation.columnName !== 'string') {
        return null;
    }

    const matchedColumnName = columnNames.find(name => name === annotation.columnName);
    if (!matchedColumnName) {
        return null;
    }

    return {
        columnName: matchedColumnName,
        semanticRole: canonicalColumnRole(normalizeSemanticColumnRole(annotation.semanticRole)),
        confidence: clampConfidence(annotation.confidence),
        reason: typeof annotation.reason === 'string' && annotation.reason.trim().length > 0
            ? annotation.reason.trim()
            : 'No reason provided.',
        rawHeader: typeof annotation.rawHeader === 'string' && annotation.rawHeader.trim().length > 0 ? annotation.rawHeader.trim() : matchedColumnName,
        businessLabel: typeof annotation.businessLabel === 'string' && annotation.businessLabel.trim().length > 0 ? annotation.businessLabel.trim() : null,
        sampleValueHints: Array.isArray(annotation.sampleValueHints)
            ? annotation.sampleValueHints.map(value => String(value).trim()).filter(Boolean).slice(0, 5)
            : [],
        isPrimaryGrainCandidate: annotation.isPrimaryGrainCandidate,
        isMetricCandidate: annotation.isMetricCandidate,
        isBusinessSafe: annotation.isBusinessSafe,
        confidenceBand: typeof annotation.confidenceBand === 'string' ? annotation.confidenceBand : toConfidenceBand(clampConfidence(annotation.confidence)),
        evidenceSources: normalizeEvidenceSources(annotation.evidenceSources, ['ai_prompt_context']),
        conflictDetected: Boolean(annotation.conflictDetected),
    };
};

const sanitizeHeaderSemantics = (
    input: Partial<DatasetHeaderSemantics> | null | undefined,
    reportContextResolution?: ReportContextResolution | null,
): DatasetHeaderSemantics => {
    const reportTitle = typeof input?.reportTitle === 'string' && input.reportTitle.trim().length > 0
        ? input.reportTitle.trim()
        : reportContextResolution?.effective?.reportTitle ?? null;
    const parameterLines = reportContextResolution?.effective?.parameterLines ?? [];
    const footerLines = reportContextResolution?.effective?.footerLines ?? [];
    const candidateHeaderLine = reportContextResolution?.effective?.candidateHeaderLine ?? [];
    const businessTerminology = Array.isArray(input?.businessTerminology)
        ? input.businessTerminology.map(value => String(value).trim()).filter(Boolean).slice(0, 12)
        : candidateHeaderLine.filter(Boolean).slice(0, 5);

    const headerConfidence = clampConfidence(input?.headerConfidence ?? (reportTitle ? 0.7 : 0.45));
    return {
        reportTitle,
        // 'unknown' from the AI is treated as absent — run the deterministic fallback.
        reportType: (input?.reportType && input.reportType !== 'unknown')
            ? input.reportType
            : inferFallbackReportType(reportTitle, parameterLines),
        headerRoleHints: Array.isArray(input?.headerRoleHints)
            ? input.headerRoleHints
                .map(hint => {
                    const role = hint?.role;
                    if (!hint || typeof hint.headerValue !== 'string') {
                        return null;
                    }
                    return {
                        headerValue: hint.headerValue,
                        role: role === 'grain' || role === 'metric' || role === 'helper' || role === 'filter_scope' || role === 'unknown' ? role : 'unknown',
                        confidence: clampConfidence(hint.confidence),
                        reason: typeof hint.reason === 'string' && hint.reason.trim().length > 0 ? hint.reason.trim() : 'No reason provided.',
                    };
                })
                .filter((hint): hint is DatasetHeaderSemantics['headerRoleHints'][number] => Boolean(hint))
            : candidateHeaderLine.map(value => ({
                headerValue: value,
                role: 'unknown' as const,
                confidence: 0.4,
                reason: 'Imported from validated report context candidate header line.',
            })),
        // Scope hint extraction — fallback when AI scopeHints are absent.
        // These keyword patterns run only within already-identified parameter lines.
        scopeHints: {
            period: typeof input?.scopeHints?.period === 'string' ? input.scopeHints.period : parameterLines.find(line => /period|month|quarter|year/i.test(line)) ?? null,
            businessUnit: typeof input?.scopeHints?.businessUnit === 'string' ? input.scopeHints.businessUnit : parameterLines.find(line => /business unit|division|entity/i.test(line)) ?? null,
            region: typeof input?.scopeHints?.region === 'string' ? input.scopeHints.region : parameterLines.find(line => /region|country/i.test(line)) ?? null,
            scenario: typeof input?.scopeHints?.scenario === 'string' ? input.scopeHints.scenario : parameterLines.find(line => /budget|actual|forecast|scenario/i.test(line)) ?? null,
        },
        businessTerminology,
        headerConfidence,
        confidenceBand: typeof input?.confidenceBand === 'string' ? input.confidenceBand : toConfidenceBand(headerConfidence),
        evidenceSources: normalizeEvidenceSources(input?.evidenceSources, ['report_context', 'ai_prompt_context']),
        conflictDetected: Boolean(input?.conflictDetected),
        reason: typeof input?.reason === 'string' && input.reason.trim().length > 0
            ? input.reason.trim()
            : [
                reportTitle ? `report title: ${reportTitle}` : '',
                parameterLines.length > 0 ? `parameters: ${parameterLines.slice(0, 2).join(' | ')}` : '',
                footerLines.length > 0 ? `footer: ${footerLines.slice(0, 1).join(' | ')}` : '',
            ].filter(Boolean).join('; ') || 'Derived from report context.',
    };
};

const buildHeuristicRowAnnotations = (data: CsvData): RowSemanticAnnotation[] => {
    const context = inferTabularShapeContext(data);
    if (!context) {
        return [];
    }

    return data.data.flatMap<RowSemanticAnnotation>((row, rowIndex) => {
        const detected = detectTabularRowRole(row, context);
        if (detected.confidence < DEFAULT_EXCLUSION_CONFIDENCE) {
            return [];
        }

        if (detected.role === 'subtotal') {
            return [{
                rowIndex,
                rowRole: 'subtotal' as const,
                confidence: detected.confidence,
                reason: 'Deterministic tabular-shape heuristic identified a subtotal row.',
                confidenceBand: toConfidenceBand(detected.confidence),
                evidenceSources: ['deterministic_pattern'],
                labelingSource: 'deterministic',
                excludeFromDefaultAnalysis: true,
                unsafeForNarrative: true,
            }];
        }

        if (detected.role === 'total') {
            return [{
                rowIndex,
                rowRole: 'grand_total' as const,
                confidence: detected.confidence,
                reason: 'Deterministic tabular-shape heuristic identified a total row.',
                confidenceBand: toConfidenceBand(detected.confidence),
                evidenceSources: ['deterministic_pattern'],
                labelingSource: 'deterministic',
                excludeFromDefaultAnalysis: true,
                unsafeForNarrative: true,
            }];
        }

        if (detected.role === 'comment' || detected.role === 'group_header' || detected.role === 'noise') {
            return [{
                rowIndex,
                rowRole: detected.role === 'group_header' ? 'group_header' as const : detected.role === 'noise' ? 'noise' as const : 'note' as const,
                confidence: detected.confidence,
                reason: 'Deterministic tabular-shape heuristic identified a non-detail note/header row.',
                confidenceBand: toConfidenceBand(detected.confidence),
                evidenceSources: ['deterministic_pattern'],
                labelingSource: 'deterministic',
                excludeFromDefaultAnalysis: true,
                unsafeForNarrative: true,
            }];
        }

        return [];
    });
};

const normalizeExplicitSemanticRowRole = (value: unknown): SemanticRowRole | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
    switch (normalized) {
        case 'detail':
        case 'fact':
            return 'detail';
        case 'subtotal':
        case 'summary':
            return 'subtotal';
        case 'total':
        case 'grand_total':
            return 'grand_total';
        case 'group_header':
        case 'header':
            return 'group_header';
        case 'footer':
            return 'footer';
        case 'note':
        case 'comment':
            return 'note';
        case 'bucket':
            return 'bucket';
        case 'blank':
        case 'noise':
            return 'noise';
        case 'unknown':
            return 'unknown';
        default:
            return null;
    }
};

const buildExplicitRowRoleAnnotations = (data: CsvData): RowSemanticAnnotation[] =>
    data.data.flatMap<RowSemanticAnnotation>((row, rowIndex) => {
        const explicitRole = normalizeExplicitSemanticRowRole(row.RowClass ?? row.RowRole);
        if (!explicitRole || explicitRole === 'detail' || explicitRole === 'unknown') {
            return [];
        }

        return [{
            rowIndex,
            rowRole: explicitRole,
            confidence: 0.99,
            reason: 'Prepared dataset carries an explicit structural row role.',
            confidenceBand: 'high',
            evidenceSources: ['deterministic_pattern'],
            labelingSource: 'deterministic',
            excludeFromDefaultAnalysis: true,
            unsafeForNarrative: true,
        }];
    });

const mergeRowAnnotations = (
    data: CsvData,
    annotations: RowSemanticAnnotation[],
): RowSemanticAnnotation[] => {
    const merged = new Map<number, RowSemanticAnnotation>();

    buildExplicitRowRoleAnnotations(data).forEach(annotation => {
        merged.set(annotation.rowIndex, annotation);
    });

    annotations.forEach(annotation => {
        const existing = merged.get(annotation.rowIndex);
        if (!existing || annotation.confidence > existing.confidence) {
            merged.set(annotation.rowIndex, annotation);
        }
    });

    buildHeuristicRowAnnotations(data).forEach(annotation => {
        const existing = merged.get(annotation.rowIndex);
        const existingIsProtectedNonDetail = existing
            && existing.rowRole !== 'detail'
            && existing.rowRole !== 'unknown'
            && existing.confidence >= annotation.confidence;
        if (!existing || !existingIsProtectedNonDetail) {
            if (!existing || annotation.confidence > existing.confidence || existing.rowRole === 'detail' || existing.rowRole === 'unknown') {
                merged.set(annotation.rowIndex, annotation);
            }
        }
    });

    return [...merged.values()].sort((left, right) => left.rowIndex - right.rowIndex);
};

const inferHeuristicColumnAnnotation = (
    column: ColumnProfile,
    tabularContext: ReturnType<typeof inferTabularShapeContext>,
): ColumnSemanticAnnotation | null => {
    const normalized = column.name.trim().toLowerCase();

    if (['numerical', 'currency', 'percentage'].includes(column.type)) {
        return {
            columnName: column.name,
            semanticRole: 'metric',
            confidence: 0.96,
            reason: 'Deterministic heuristic classified this numeric-like column as a metric.',
            rawHeader: column.name,
            businessLabel: column.name,
            sampleValueHints: [],
            isPrimaryGrainCandidate: false,
            isMetricCandidate: true,
            isBusinessSafe: true,
            confidenceBand: 'high',
            evidenceSources: ['type_profile', 'deterministic_pattern'],
            conflictDetected: false,
        };
    }

    if (['date', 'time'].includes(column.type)) {
        return {
            columnName: column.name,
            semanticRole: 'time_dimension',
            confidence: 0.95,
            reason: 'Deterministic heuristic classified this temporal column as a date field.',
            rawHeader: column.name,
            businessLabel: column.name,
            sampleValueHints: [],
            isPrimaryGrainCandidate: true,
            isMetricCandidate: false,
            isBusinessSafe: true,
            confidenceBand: 'high',
            evidenceSources: ['type_profile', 'deterministic_pattern'],
            conflictDetected: false,
        };
    }

    // Schema naming convention — structural, not domain vocabulary.
    if (/(?:^|[_\s])(?:id|code|key)(?:$|[_\s])/.test(normalized)) {
        return {
            columnName: column.name,
            semanticRole: 'code',
            confidence: 0.93,
            reason: 'Deterministic heuristic detected an identifier/code field.',
            rawHeader: column.name,
            businessLabel: column.name,
            sampleValueHints: [],
            isPrimaryGrainCandidate: false,
            isMetricCandidate: false,
            isBusinessSafe: !TECHNICAL_COLUMN_PATTERN.test(column.name),
            confidenceBand: 'high',
            evidenceSources: ['type_profile', 'deterministic_pattern'],
            conflictDetected: false,
        };
    }

    // Schema naming convention — structural, not domain vocabulary.
    if (/(?:note|remark|comment|memo|footer)/.test(normalized)) {
        return {
            columnName: column.name,
            semanticRole: 'note',
            confidence: 0.9,
            reason: 'Deterministic heuristic detected a note/comment field.',
            rawHeader: column.name,
            businessLabel: null,
            sampleValueHints: [],
            isPrimaryGrainCandidate: false,
            isMetricCandidate: false,
            isBusinessSafe: false,
            confidenceBand: 'high',
            evidenceSources: ['deterministic_pattern'],
            conflictDetected: false,
        };
    }

    if (tabularContext?.valueColumns.includes(column.name)) {
        return {
            columnName: column.name,
            semanticRole: 'metric',
            confidence: 0.9,
            reason: 'Deterministic tabular-shape heuristic classified this column as a value field.',
            rawHeader: column.name,
            businessLabel: column.name,
            sampleValueHints: [],
            isPrimaryGrainCandidate: false,
            isMetricCandidate: true,
            isBusinessSafe: true,
            confidenceBand: 'high',
            evidenceSources: ['deterministic_pattern', 'type_profile'],
            conflictDetected: false,
        };
    }

    // Schema naming convention — structural, not domain vocabulary.
    if (/(?:description|name|label|title)/.test(normalized)) {
        return {
            columnName: column.name,
            semanticRole: 'descriptor',
            confidence: 0.82,
            reason: 'Deterministic heuristic detected a descriptive label field.',
            rawHeader: column.name,
            businessLabel: column.name,
            sampleValueHints: [],
            isPrimaryGrainCandidate: false,
            isMetricCandidate: false,
            isBusinessSafe: !TECHNICAL_COLUMN_PATTERN.test(column.name),
            confidenceBand: 'medium',
            evidenceSources: ['deterministic_pattern', 'sample_values'],
            conflictDetected: false,
        };
    }

    if (tabularContext?.descriptorColumns.includes(column.name)) {
        return {
            columnName: column.name,
            semanticRole: TECHNICAL_COLUMN_PATTERN.test(column.name) ? 'helper_dimension' : 'business_entity',
            confidence: 0.76,
            reason: 'Deterministic tabular-shape heuristic classified this column as a descriptor/entity field.',
            rawHeader: column.name,
            businessLabel: column.name,
            sampleValueHints: [],
            isPrimaryGrainCandidate: !TECHNICAL_COLUMN_PATTERN.test(column.name),
            isMetricCandidate: false,
            isBusinessSafe: !TECHNICAL_COLUMN_PATTERN.test(column.name),
            confidenceBand: 'medium',
            evidenceSources: ['deterministic_pattern', 'sample_values'],
            conflictDetected: false,
        };
    }

    return null;
};

const mergeColumnAnnotations = (
    data: CsvData,
    columns: ColumnProfile[],
    annotations: ColumnSemanticAnnotation[],
): ColumnSemanticAnnotation[] => {
    const merged = new Map<string, ColumnSemanticAnnotation>();
    const tabularContext = inferTabularShapeContext(data);

    annotations.forEach(annotation => {
        merged.set(annotation.columnName, annotation);
    });

    if (columns.length === 0) {
        return [...merged.values()];
    }

    columns.forEach(column => {
        const heuristic = inferHeuristicColumnAnnotation(column, tabularContext);
        if (!heuristic) {
            return;
        }
        const existing = merged.get(column.name);
        if (!existing) {
            merged.set(column.name, heuristic);
            return;
        }

        // AI-first merge: only override AI annotations when AI produced
        // no useful signal (unknown role) or when the heuristic is extremely
        // strong (type-based, ≥0.95) and the AI confidence is much lower.
        const aiIsBlank = existing.semanticRole === 'unknown';
        const heuristicIsVeryStrong = heuristic.confidence >= STRONG_HEURISTIC_COLUMN_CONFIDENCE
            && existing.confidence < heuristic.confidence * 0.7;

        if (aiIsBlank || heuristicIsVeryStrong) {
            merged.set(column.name, heuristic);
        }
    });

    return columns
        .map(column => {
            const annotation = merged.get(column.name);
            if (!annotation) {
                return annotation;
            }
            const technical = TECHNICAL_COLUMN_PATTERN.test(column.name);
            const businessSafe = annotation.semanticRole === 'metric'
                || annotation.semanticRole === 'time_dimension'
                || annotation.semanticRole === 'business_entity'
                || annotation.semanticRole === 'business_dimension';
            return {
                ...annotation,
                rawHeader: annotation.rawHeader ?? column.name,
                businessLabel: annotation.businessLabel ?? (technical ? null : column.name),
                isPrimaryGrainCandidate: annotation.isPrimaryGrainCandidate ?? (businessSafe && annotation.semanticRole !== 'metric'),
                isMetricCandidate: annotation.isMetricCandidate ?? annotation.semanticRole === 'metric',
                isBusinessSafe: annotation.isBusinessSafe ?? (businessSafe && !technical),
                confidenceBand: annotation.confidenceBand ?? toConfidenceBand(annotation.confidence),
                evidenceSources: annotation.evidenceSources ?? ['ai_prompt_context'],
            };
        })
        .filter((annotation): annotation is ColumnSemanticAnnotation => Boolean(annotation));
};

const buildLabelingConflicts = (
    data: CsvData,
    columns: ColumnProfile[],
    mergedAnnotations: ColumnSemanticAnnotation[],
): SemanticLabelConflict[] => {
    const conflicts: SemanticLabelConflict[] = [];
    const tabularContext = inferTabularShapeContext(data);
    mergedAnnotations.forEach(annotation => {
        const column = columns.find(entry => entry.name === annotation.columnName);
        if (!column) {
            return;
        }
        const heuristic = inferHeuristicColumnAnnotation(column, tabularContext);
        if (!heuristic || canonicalColumnRole(heuristic.semanticRole) === 'unknown') {
            return;
        }
        if (canonicalColumnRole(heuristic.semanticRole) !== canonicalColumnRole(annotation.semanticRole)) {
            conflicts.push({
                targetType: 'column',
                targetKey: annotation.columnName,
                aiValue: annotation.semanticRole,
                deterministicValue: heuristic.semanticRole,
                resolvedValue: annotation.semanticRole,
                severity: 'warn',
                reason: 'AI column label conflicted with deterministic heuristic and required merged resolution.',
            });
        }
    });
    return conflicts;
};

const buildRecommendedAnalysisView = (
    rowCount: number,
    rowAnnotations: RowSemanticAnnotation[],
): SemanticAnalysisView => {
    const excluded = rowAnnotations
        .filter(annotation => NON_DETAIL_ROLES.has(annotation.rowRole) && annotation.confidence >= DEFAULT_EXCLUSION_CONFIDENCE)
        .map(annotation => annotation.rowIndex)
        .sort((left, right) => left - right);

    const excludedSet = new Set(excluded);
    const included = Array.from({ length: rowCount }, (_, index) => index).filter(index => !excludedSet.has(index));

    return {
        mode: 'soft_exclude',
        includedRowIndices: included,
        excludedRowIndices: excluded,
        includedRowCount: included.length,
        excludedRowCount: excluded.length,
        reason: excluded.length > 0
            ? 'High-confidence non-detail rows are hidden from the default analysis view.'
            : 'No high-confidence non-detail rows were excluded.',
    };
};

const cloneCsvData = (data: CsvData, rows: typeof data.data): CsvData => ({
    ...data,
    data: rows.map(row => ({ ...row })),
    metadataRows: [...(data.metadataRows ?? [])].map(row => [...row]),
    headerLayers: [...(data.headerLayers ?? [])].map(row => [...row]),
    summaryRows: [...(data.summaryRows ?? [])].map(row => ({ ...row })),
});

export const buildSemanticDatasetVersion = (data: CsvData): string =>
    getCsvDatasetVersion(data);

export const isSemanticSnapshotCurrent = (
    snapshot: DatasetSemanticSnapshot | null | undefined,
    datasetVersion: string | null | undefined,
): boolean => Boolean(snapshot && datasetVersion && snapshot.sourceDatasetVersion === datasetVersion);

export const isSemanticSnapshotCurrentForData = (
    data: CsvData | null | undefined,
    snapshot: DatasetSemanticSnapshot | null | undefined,
    semanticDatasetVersion: string | null | undefined,
): boolean => {
    if (!data || !semanticDatasetVersion) {
        return false;
    }
    const liveDatasetVersion = buildSemanticDatasetVersion(data);
    return isSemanticSnapshotCurrent(snapshot, semanticDatasetVersion)
        && semanticDatasetVersion === liveDatasetVersion;
};

export const sanitizeDatasetSemanticSnapshot = (
    input: Partial<DatasetSemanticSnapshot> | null | undefined,
    data: CsvData,
    modelId: string,
    sourceDatasetVersion: string,
    columns: ColumnProfile[] = [],
    reportContextResolution?: ReportContextResolution | null,
    reportStructureResolution?: ReportStructureResolution | null,
): DatasetSemanticSnapshot => {
    const rowAnnotations = Array.isArray(input?.rowAnnotations)
        ? input.rowAnnotations
            .map(annotation => sanitizeRowAnnotation(annotation, data.data.length))
            .filter((annotation): annotation is RowSemanticAnnotation => Boolean(annotation))
        : [];
    const firstRow = data.data[0] ?? {};
    const columnNames = Object.keys(firstRow);
    const columnAnnotations = Array.isArray(input?.columnAnnotations)
        ? input.columnAnnotations
            .map(annotation => sanitizeColumnAnnotation(annotation, columnNames))
            .filter((annotation): annotation is ColumnSemanticAnnotation => Boolean(annotation))
        : [];
    const normalizedRowAnnotations = mergeRowAnnotations(data, rowAnnotations);
    const normalizedColumnAnnotations = mergeColumnAnnotations(data, columns, columnAnnotations);
    const headerSemantics = sanitizeHeaderSemantics(input?.headerSemantics, reportContextResolution);
    const labelingConflicts = [
        ...((Array.isArray(input?.labelingConflicts) ? input.labelingConflicts : []).map(conflict => ({
            targetType: conflict?.targetType === 'row' || conflict?.targetType === 'column' || conflict?.targetType === 'header' ? conflict.targetType : 'column',
            targetKey: String(conflict?.targetKey ?? 'unknown'),
            aiValue: typeof conflict?.aiValue === 'string' ? conflict.aiValue : null,
            deterministicValue: typeof conflict?.deterministicValue === 'string' ? conflict.deterministicValue : null,
            resolvedValue: typeof conflict?.resolvedValue === 'string' ? conflict.resolvedValue : 'unknown',
            severity: conflict?.severity === 'info' ? 'info' : 'warn',
            reason: typeof conflict?.reason === 'string' && conflict.reason.trim().length > 0 ? conflict.reason.trim() : 'Semantic labeling conflict detected.',
        })) as SemanticLabelConflict[]),
        ...buildLabelingConflicts(data, columns, normalizedColumnAnnotations),
    ];
    const recommendedAnalysisView = buildRecommendedAnalysisView(data.data.length, normalizedRowAnnotations);
    const proposalVerification = reportStructureResolution?.proposalVerification ?? null;
    const structureUnderstanding = reportStructureResolution
        ? {
            source: reportStructureResolution.source,
            purpose: proposalVerification?.purpose
                ?? reportContextResolution?.effective.reportDescription
                ?? reportContextResolution?.effective.reportTitle
                ?? null,
            grainColumns: proposalVerification?.grainColumns ?? normalizedColumnAnnotations
                .filter(annotation => annotation.isPrimaryGrainCandidate)
                .map(annotation => annotation.columnName),
            fieldRoles: proposalVerification?.fields.map(field => ({
                columnName: field.columnName,
                role: field.role,
                confidence: field.confidence,
            })) ?? normalizedColumnAnnotations.map(annotation => ({
                columnName: annotation.columnName,
                role: annotation.semanticRole,
                confidence: annotation.confidence,
            })),
            targetShape: reportStructureResolution.decision.targetShape,
            verificationTier: proposalVerification?.tier ?? 'deterministic' as const,
            requiresHumanReview: reportStructureResolution.requiresHumanReview,
            issueCodes: proposalVerification?.issues.map(issue => issue.code)
                ?? reportStructureResolution.blockingReasons,
        }
        : null;

    const provisionalSnapshot: DatasetSemanticSnapshot = {
        datasetRole: coerceDatasetRole(input?.datasetRole),
        rowAnnotations: normalizedRowAnnotations.map(annotation => ({
            ...annotation,
            excludeFromDefaultAnalysis: annotation.excludeFromDefaultAnalysis ?? (NON_DETAIL_ROLES.has(annotation.rowRole) && annotation.confidence >= DEFAULT_EXCLUSION_CONFIDENCE),
            unsafeForNarrative: annotation.unsafeForNarrative ?? NON_DETAIL_ROLES.has(annotation.rowRole),
        })),
        columnAnnotations: normalizedColumnAnnotations,
        headerSemantics,
        labelingConflicts,
        recommendedAnalysisView,
        mergedSemanticBoundary: null,
        structureUnderstanding,
        summary: typeof input?.summary === 'string' && input.summary.trim().length > 0
            ? input.summary.trim()
            : 'No semantic summary was produced.',
        generatedAt: typeof input?.generatedAt === 'string' && input.generatedAt.trim().length > 0
            ? input.generatedAt
            : new Date().toISOString(),
        modelId,
        sourceDatasetVersion,
    };
    const mergedSemanticBoundary = buildRuntimeSemanticUnderstanding({
        columns,
        analysisBrief: null,
        reportContextResolution,
        datasetSemanticSnapshot: provisionalSnapshot,
    });

    return {
        ...provisionalSnapshot,
        mergedSemanticBoundary,
    };
};

// Memoize the semantic-filtered CsvData so repeated calls (e.g. from
// resolveDatasetBindingTarget, isDuckDbSessionCurrentForDataset) return
// the same object reference instead of re-cloning rows every time.
let cachedSemanticDefault: {
    dataRef: CsvData;
    snapshotRef: DatasetSemanticSnapshot;
    version: string;
    result: CsvData;
} | null = null;

export const resolveSemanticDefaultCsvData = (
    data: CsvData | null | undefined,
    snapshot: DatasetSemanticSnapshot | null | undefined,
    semanticDatasetVersion: string | null | undefined,
): CsvData | null => {
    if (!data) {
        return null;
    }
    if (!isSemanticSnapshotCurrentForData(data, snapshot, semanticDatasetVersion)) {
        return data;
    }

    // Return cached result if all inputs match by reference.
    if (
        cachedSemanticDefault
        && cachedSemanticDefault.dataRef === data
        && cachedSemanticDefault.snapshotRef === snapshot
        && cachedSemanticDefault.version === semanticDatasetVersion
    ) {
        return cachedSemanticDefault.result;
    }

    const includedRowIndices = snapshot.recommendedAnalysisView.includedRowIndices;
    if (!Array.isArray(includedRowIndices) || includedRowIndices.length === 0 || includedRowIndices.length >= data.data.length) {
        return data;
    }

    const rows = includedRowIndices
        .map(index => data.data[index])
        .filter((row): row is typeof data.data[number] => Boolean(row))
        .map(row => ({ ...row }));

    if (rows.length === 0) {
        return data;
    }

    const result = cloneCsvData(data, rows);
    cachedSemanticDefault = { dataRef: data, snapshotRef: snapshot!, version: semanticDatasetVersion!, result };
    return result;
};

export const getSemanticHiddenRowCount = (
    snapshot: DatasetSemanticSnapshot | null | undefined,
    semanticDatasetVersion: string | null | undefined,
    data?: CsvData | null | undefined,
): number => {
    if (!isSemanticSnapshotCurrentForData(data ?? null, snapshot, semanticDatasetVersion)) {
        return 0;
    }

    return snapshot?.recommendedAnalysisView.excludedRowCount ?? 0;
};

export const formatDatasetSemanticsForPrompt = (
    snapshot: DatasetSemanticSnapshot | null | undefined,
    semanticDatasetVersion: string | null | undefined,
    data: CsvData | null | undefined,
    columns: ColumnProfile[] = [],
): string => {
    if (!isSemanticSnapshotCurrentForData(data, snapshot, semanticDatasetVersion)) {
        return 'No semantic snapshot is available. Use the prepared dataset as-is.';
    }

    const columnLines = columns.map(column => {
        const annotation = snapshot?.columnAnnotations.find(entry => entry.columnName === column.name);
        if (!annotation) {
            return `- ${column.name}: unannotated`;
        }
        return `- ${column.name}: ${canonicalColumnRole(normalizeSemanticColumnRole(annotation.semanticRole))} (${Math.round(annotation.confidence * 100)}%)`;
    });

    const notableRows = (snapshot?.rowAnnotations ?? [])
        .filter(annotation => NON_DETAIL_ROLES.has(annotation.rowRole) && annotation.confidence >= DEFAULT_EXCLUSION_CONFIDENCE)
        .slice(0, 8)
        .map(annotation => `- row ${annotation.rowIndex + 1}: ${annotation.rowRole} (${Math.round(annotation.confidence * 100)}%) because ${annotation.reason}`);

    return [
        `Dataset role: ${snapshot?.datasetRole ?? 'unknown'}`,
        `Default analysis view hides ${snapshot?.recommendedAnalysisView.excludedRowCount ?? 0} row(s) and keeps ${snapshot?.recommendedAnalysisView.includedRowCount ?? 0} row(s).`,
        `Semantic summary: ${snapshot?.summary ?? 'No summary available.'}`,
        `Header semantics: ${snapshot?.headerSemantics?.reportType ?? 'unknown'} | title: ${snapshot?.headerSemantics?.reportTitle ?? 'unknown'}`,
        'Column semantics:',
        columnLines.length > 0 ? columnLines.join('\n') : '- No columns available',
        'High-confidence non-detail rows:',
        notableRows.length > 0 ? notableRows.join('\n') : '- None',
    ].join('\n');
};

export const getSemanticSampleRows = (
    data: CsvData | null | undefined,
    snapshot: DatasetSemanticSnapshot | null | undefined,
    semanticDatasetVersion: string | null | undefined,
    limit: number,
) => {
    const semanticData = resolveSemanticDefaultCsvData(data, snapshot, semanticDatasetVersion) ?? data;
    return semanticData?.data.slice(0, limit) ?? [];
};
