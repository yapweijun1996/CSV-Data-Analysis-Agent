import type {
    AnalysisBrief,
    AnalysisIntentBrief,
    AnalysisMetricSemantic,
    AnalysisMetricSemanticName,
    ColumnProfile,
    DerivedMetricSemanticName,
    CsvData,
    CsvRow,
    DataPreparationPlan,
    MetricBinding,
    MetricDefinition,
    MetricValidationIssue,
    DatasetSemanticSnapshot,
} from '../../types';
import { validateAnalysisBrief } from './analysisValidation';
import { isSemanticSnapshotCurrentForData } from './datasetSemantics';
import { resolveColumnDisplayLabel } from '../dashboard/businessLabelResolver';

const ROW_LABEL_COLUMN_PATTERN = /\b(description|label|serieslabel|serieskey|account|metric|category|line\s*item|name)\b/i;
const WIDE_REPORT_COLUMN_PATTERN = /^(?:\d{3,}|fy\d{2,4}|q[1-4]\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
// Only structural/pipeline columns — do NOT include business metric names like
// "value" or "amount" here, as they are legitimate column names in many domains.
// Business metric classification is handled by AI semantic understanding.
const TECHNICAL_GRAIN_COLUMN_PATTERN = /^(?:serieskey|serieslabel|rowclass|hierarchydepth|sourcerowindex|sourcecolumnname)$/i;
// Purpose: USER_INTENT_PARSING + DATA_CLASSIFICATION_FALLBACK
// Primary for parsing user chat text (no semantic snapshot available).
// Fallback for data column/label classification (prefer AI snapshot when available).
export const METRIC_PATTERNS: Record<AnalysisMetricSemanticName, RegExp[]> = {
    revenue: [/\brevenue\b/i, /\bsales\b/i, /\bincome\b/i, /\bturnover\b/i],
    cost: [/\bcost\b/i, /\bexpense\b/i, /\bcogs\b/i, /\bcost of sales\b/i, /\bspend\b/i],
    profit: [/\bprofit\b/i, /\bprofitability\b/i, /\bgross profit\b/i, /\bnet profit\b/i],
    margin: [/\bmargin\b/i, /\bgross margin\b/i],
    budget: [/\bbudget\b/i, /\bplanned?\b/i, /\bforecast\b/i],
    actual: [/\bactual\b/i, /\bactuals\b/i, /\brealized\b/i],
    variance: [/\bvariance\b/i, /\bvar\b/i, /\bdelta\b/i, /\bbudget\b.*\bactual\b/i, /\bactual\b.*\bbudget\b/i],
};
export const METRIC_NAMES = Object.keys(METRIC_PATTERNS) as AnalysisMetricSemanticName[];
export const REVENUE_COST_PROFIT_INTENT_PATTERN = /\b(variance|variances|delta|difference|differences|gap|gaps|net|profit|profitability|margin)\b/i;
export const EXPLICIT_DERIVED_PRIORITY_PATTERNS: Record<Exclude<DerivedMetricSemanticName, 'variance'>, RegExp[]> = {
    profit: [/\bgross profit\b/i, /\bnet profit\b/i, /\bprofit\b/i],
    margin: [/\bgross margin\b/i, /\bmargin\b/i],
};
const GENERIC_BUSINESS_TERM_PATTERN = /\b(?:report|reporting|analysis|analytics|summary|overview|detail|details|dashboard|dataset|data|table|sheet|view|results?|records?)\b/i;
const GENERIC_METRIC_TERM_PATTERN = /^(?:value|values|amount|amounts|metric|metrics|measure|measures|total|totals)$/i;
const BUSINESS_TERM_STOP_WORDS = new Set([
    'and',
    'for',
    'the',
    'with',
    'from',
    'into',
    'over',
    'across',
    'under',
    'per',
    'via',
    'based',
    'using',
]);

const MAX_SAMPLE_ROWS = 250;

const canonicalSemanticRole = (role: string | undefined) => {
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

const normalizeText = (value: unknown) => String(value ?? '').trim().toLowerCase();
const dedupe = <T,>(values: T[]) => Array.from(new Set(values));
const dedupeByNormalizedText = (values: string[]) => {
    const seen = new Set<string>();
    const deduped: string[] = [];
    values.forEach(value => {
        const normalized = normalizeText(value);
        if (!normalized || seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        deduped.push(value);
    });
    return deduped;
};
const toDisplayTerm = (value: string) => resolveColumnDisplayLabel(value).replace(/\s+/g, ' ').trim();

const sanitizeBusinessPhrase = (value: string | null | undefined) => {
    const readable = String(value ?? '')
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[^\p{L}\p{N}&/ ]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!readable) {
        return null;
    }

    const withoutGenericSuffix = readable
        .replace(/\b(?:report|reporting|analysis|analytics|summary|overview|dashboard|details?)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return withoutGenericSuffix || readable;
};

const isMeaningfulBusinessTerm = (value: string) => {
    const normalized = normalizeText(value);
    if (!normalized || normalized.length < 3) {
        return false;
    }
    if (BUSINESS_TERM_STOP_WORDS.has(normalized)) {
        return false;
    }
    if (GENERIC_METRIC_TERM_PATTERN.test(normalized)) {
        return false;
    }
    return !GENERIC_BUSINESS_TERM_PATTERN.test(normalized);
};

const collectBusinessTermsFromPhrase = (value: string | null | undefined) => {
    const sanitized = sanitizeBusinessPhrase(value);
    if (!sanitized) {
        return [];
    }

    const words = sanitized
        .split(/\s+/)
        .map(word => word.trim())
        .filter(Boolean);
    const tokens = [
        sanitized,
        ...words,
    ].filter(isMeaningfulBusinessTerm);

    return dedupeByNormalizedText(tokens);
};

const collectBusinessTermsFromParameterLines = (lines: string[] | undefined) =>
    dedupeByNormalizedText(
        (lines ?? []).flatMap(line => {
            const labelMatch = line.match(/^\s*([^:=|-]{2,40})\s*[:=|-]/);
            return collectBusinessTermsFromPhrase(labelMatch ? labelMatch[1] : line);
        }),
    );

const hasUnpivotOperation = (plan: DataPreparationPlan | null | undefined) =>
    Boolean(plan?.operations?.some(operation => operation.type === 'unpivot_columns'));

const getCurrentSemanticRoleMap = (
    csvData: CsvData | null | undefined,
    snapshot: DatasetSemanticSnapshot | null | undefined,
    semanticDatasetVersion: string | null | undefined,
) => {
    if (!isSemanticSnapshotCurrentForData(csvData ?? null, snapshot, semanticDatasetVersion)) {
        return new Map<string, DatasetSemanticSnapshot['columnAnnotations'][number]['semanticRole']>();
    }

    return new Map(
        (snapshot?.columnAnnotations ?? []).map(annotation => [annotation.columnName, annotation.semanticRole]),
    );
};

const getMetricColumns = (
    columns: ColumnProfile[],
    semanticRoleMap: Map<string, DatasetSemanticSnapshot['columnAnnotations'][number]['semanticRole']>,
) =>
    columns.filter(column =>
        ['numerical', 'currency', 'percentage'].includes(column.type)
        || canonicalSemanticRole(semanticRoleMap.get(column.name)) === 'metric',
    );

const pickValueColumn = (
    columns: ColumnProfile[],
    semanticRoleMap: Map<string, DatasetSemanticSnapshot['columnAnnotations'][number]['semanticRole']>,
) => {
    const metricColumns = getMetricColumns(columns, semanticRoleMap);
    const semanticPreferred = metricColumns.find(column => canonicalSemanticRole(semanticRoleMap.get(column.name)) === 'metric');
    if (semanticPreferred) {
        return semanticPreferred.name;
    }
    const preferred = metricColumns.find(column => /^(?:value|amount|total)$/i.test(column.name));
    return preferred?.name ?? metricColumns[0]?.name ?? null;
};

const pickRowLabelColumn = (
    columns: ColumnProfile[],
    semanticRoleMap: Map<string, DatasetSemanticSnapshot['columnAnnotations'][number]['semanticRole']>,
) => {
    const categoricalColumns = columns.filter(column => ['categorical', 'date', 'time'].includes(column.type));
    const descriptorPreferred = categoricalColumns.find(column => {
        const role = canonicalSemanticRole(semanticRoleMap.get(column.name));
        return role === 'descriptor' || role === 'note';
    });
    if (descriptorPreferred) {
        return descriptorPreferred.name;
    }
    const namedPreferred = categoricalColumns.find(column => ROW_LABEL_COLUMN_PATTERN.test(column.name));
    if (namedPreferred) {
        return namedPreferred.name;
    }
    const semanticPreferred = categoricalColumns.find(column => {
        const role = canonicalSemanticRole(semanticRoleMap.get(column.name));
        return role === 'business_dimension' || role === 'business_entity';
    });
    if (semanticPreferred) {
        return semanticPreferred.name;
    }
    return categoricalColumns[0]?.name ?? null;
};

const getSampleRows = (csvData: CsvData | null | undefined) =>
    Array.isArray(csvData?.data) ? csvData.data.slice(0, MAX_SAMPLE_ROWS) : [];

export const matchesMetricPattern = (text: string, metric: AnalysisMetricSemanticName) =>
    METRIC_PATTERNS[metric].some(pattern => pattern.test(text));

const collectSemanticMatchesFromColumns = (
    columns: ColumnProfile[],
    snapshot?: DatasetSemanticSnapshot | null,
) => {
    const matches = new Map<AnalysisMetricSemanticName, string[]>();

    // AI-first: use businessLabel from metric-classified columns in the semantic snapshot.
    if (snapshot?.columnAnnotations?.length) {
        for (const ann of snapshot.columnAnnotations) {
            if (ann.semanticRole !== 'metric' && !ann.isMetricCandidate) continue;
            const label = ann.businessLabel ?? ann.columnName;
            for (const metric of METRIC_NAMES) {
                if (matchesMetricPattern(label, metric) || matchesMetricPattern(ann.columnName, metric)) {
                    const existing = matches.get(metric) ?? [];
                    if (!existing.includes(ann.columnName)) existing.push(ann.columnName);
                    matches.set(metric, existing);
                }
            }
        }
        if (matches.size > 0) return matches;
    }

    // Regex fallback: scan column names directly.
    METRIC_NAMES.forEach(metric => {
        const columnMatches = columns
            .map(column => column.name)
            .filter(name => matchesMetricPattern(name, metric));
        if (columnMatches.length > 0) {
            matches.set(metric, columnMatches);
        }
    });
    return matches;
};

const collectSemanticMatchesFromLabels = (
    rows: CsvRow[],
    labelColumn: string | null,
    businessTerminology?: string[],
) => {
    const matches = new Map<AnalysisMetricSemanticName, string[]>();
    if (!labelColumn) {
        return matches;
    }

    const uniqueLabels = dedupe(
        rows
            .map(row => String(row[labelColumn] ?? '').trim())
            .filter(Boolean),
    ).slice(0, 120);

    // Supplement with AI-identified business terminology when available.
    const allLabels = businessTerminology?.length
        ? dedupe([...uniqueLabels, ...businessTerminology])
        : uniqueLabels;

    METRIC_NAMES.forEach(metric => {
        const labelMatches = allLabels.filter(label => matchesMetricPattern(label, metric));
        if (labelMatches.length > 0) {
            matches.set(metric, labelMatches);
        }
    });
    return matches;
};

const getSemanticReportType = (snapshot?: DatasetSemanticSnapshot | null) =>
    snapshot?.headerSemantics?.reportType ?? 'unknown';

const hasSemanticWideReportSignals = (params: {
    columns: ColumnProfile[];
    dataPreparationPlan: DataPreparationPlan | null | undefined;
    datasetSemanticSnapshot?: DatasetSemanticSnapshot | null | undefined;
    semanticRoleMap: Map<string, DatasetSemanticSnapshot['columnAnnotations'][number]['semanticRole']>;
}) => {
    const metricColumns = getMetricColumns(params.columns, params.semanticRoleMap);
    if (metricColumns.length < 2 || hasUnpivotOperation(params.dataPreparationPlan)) {
        return false;
    }

    const semanticReportType = getSemanticReportType(params.datasetSemanticSnapshot);
    const excludedRows = params.datasetSemanticSnapshot?.recommendedAnalysisView?.excludedRowCount ?? 0;
    const descriptorColumns = params.columns.filter(column => canonicalSemanticRole(params.semanticRoleMap.get(column.name)) === 'descriptor');

    return semanticReportType === 'financial_statement'
        || semanticReportType === 'project_report'
        || (excludedRows > 0 && descriptorColumns.length > 0);
};

const detectDatasetShape = (
    columns: ColumnProfile[],
    csvData: CsvData | null | undefined,
    dataPreparationPlan: DataPreparationPlan | null | undefined,
    semanticRoleMap: Map<string, DatasetSemanticSnapshot['columnAnnotations'][number]['semanticRole']>,
    datasetSemanticSnapshot?: DatasetSemanticSnapshot | null | undefined,
): AnalysisIntentBrief['datasetShape'] => {
    const metricColumns = getMetricColumns(columns, semanticRoleMap);
    const sampleRows = getSampleRows(csvData);
    const labelColumn = pickRowLabelColumn(columns, semanticRoleMap);
    const businessTerminology = datasetSemanticSnapshot?.headerSemantics?.businessTerminology;
    const rowLabelMatches = collectSemanticMatchesFromLabels(sampleRows, labelColumn, businessTerminology ?? undefined);
    const hasRowMetricSemantics = rowLabelMatches.size >= 2 && metricColumns.length > 0;
    const hasSemanticMetricColumns = metricColumns.filter(column =>
        canonicalSemanticRole(semanticRoleMap.get(column.name)) === 'metric',
    ).length >= 2;
    const hasNamedMetricColumns = collectSemanticMatchesFromColumns(metricColumns, datasetSemanticSnapshot).size >= 2;
    const hasWideReportColumns = columns.some(column => WIDE_REPORT_COLUMN_PATTERN.test(column.name));
    const hasSemanticWideReport = hasSemanticWideReportSignals({
        columns,
        dataPreparationPlan,
        datasetSemanticSnapshot,
        semanticRoleMap,
    });

    if (hasUnpivotOperation(dataPreparationPlan) && hasRowMetricSemantics) {
        return 'row_label_metrics';
    }
    if (hasSemanticWideReport) {
        return 'wide_report';
    }
    if (hasSemanticMetricColumns || hasNamedMetricColumns) {
        return 'metric_columns';
    }
    if (hasRowMetricSemantics) {
        return 'row_label_metrics';
    }
    if (hasWideReportColumns) {
        return 'wide_report';
    }
    if (columns.length > 0) {
        return 'generic_table';
    }
    return 'unknown';
};

const buildSemanticMetrics = (
    columns: ColumnProfile[],
    csvData: CsvData | null | undefined,
    dataPreparationPlan: DataPreparationPlan | null | undefined,
    semanticRoleMap: Map<string, DatasetSemanticSnapshot['columnAnnotations'][number]['semanticRole']>,
    snapshot?: DatasetSemanticSnapshot | null,
): AnalysisMetricSemantic[] => {
    const semanticMetrics: AnalysisMetricSemantic[] = [];
    const metricColumns = getMetricColumns(columns, semanticRoleMap);
    const valueColumn = pickValueColumn(columns, semanticRoleMap) ?? undefined;
    const labelColumn = pickRowLabelColumn(columns, semanticRoleMap) ?? undefined;
    const sampleRows = getSampleRows(csvData);

    collectSemanticMatchesFromColumns(metricColumns, snapshot).forEach((matchedColumns, metric) => {
        semanticMetrics.push({
            name: metric,
            source: 'column',
            confidence: matchedColumns.length > 0 ? 'high' : 'low',
            columns: matchedColumns,
        });
    });

    const businessTerminology = snapshot?.headerSemantics?.businessTerminology;
    collectSemanticMatchesFromLabels(sampleRows, labelColumn ?? null, businessTerminology ?? undefined).forEach((matchedLabels, metric) => {
        semanticMetrics.push({
            name: metric,
            source: 'row_label',
            confidence: hasUnpivotOperation(dataPreparationPlan) ? 'high' : 'medium',
            columns: labelColumn ? [labelColumn] : [],
            ...(labelColumn ? { labelColumn } : {}),
            ...(valueColumn ? { valueColumn } : {}),
            matchedLabels,
        });
    });

    return semanticMetrics;
};

const buildMetricDefinitionFromSemantic = (
    metric: AnalysisMetricSemantic,
    grainCandidates: string[],
): MetricDefinition => {
    const binding: MetricBinding = metric.source === 'column'
        ? {
            source: 'column',
            column: metric.columns[0],
            confidence: metric.confidence,
        }
        : {
            source: 'row_label',
            labelColumn: metric.labelColumn,
            valueColumn: metric.valueColumn,
            matchedValues: metric.matchedLabels,
            confidence: metric.confidence,
        };

    return {
        name: metric.name,
        expressionType: 'base',
        bindings: [binding],
        grainCandidates,
        sourceKinds: [metric.source],
        confidence: metric.confidence,
        requiresDerivation: false,
        notes: metric.source === 'row_label'
            ? [`Detected from labels: ${(metric.matchedLabels ?? []).join(', ') || 'n/a'}`]
            : [`Detected from columns: ${metric.columns.join(', ') || 'n/a'}`],
    };
};

const buildDerivedMetricDefinitions = (
    semanticMetrics: AnalysisMetricSemantic[],
    grainCandidates: string[],
): MetricDefinition[] => {
    const grouped = new Map<AnalysisMetricSemanticName, AnalysisMetricSemantic[]>();
    semanticMetrics.forEach(metric => {
        const existing = grouped.get(metric.name);
        if (existing) {
            existing.push(metric);
            return;
        }
        grouped.set(metric.name, [metric]);
    });

    const buildDefinition = (
        name: AnalysisMetricSemanticName,
        expressionType: MetricDefinition['expressionType'],
        requiredInputs: AnalysisMetricSemanticName[],
    ): MetricDefinition | null => {
        const bindings = requiredInputs.flatMap(input => grouped.get(input) ?? []).map<MetricBinding>(metric =>
            metric.source === 'column'
                ? {
                    source: 'column',
                    column: metric.columns[0],
                    confidence: metric.confidence,
                }
                : {
                    source: 'row_label',
                    labelColumn: metric.labelColumn,
                    valueColumn: metric.valueColumn,
                    matchedValues: metric.matchedLabels,
                    confidence: metric.confidence,
                });
        if (bindings.length === 0) {
            return null;
        }

        const sourceKinds = Array.from(new Set(bindings.map(binding => binding.source)));
        const confidence = bindings.some(binding => binding.confidence === 'low')
            ? 'low'
            : bindings.some(binding => binding.confidence === 'medium')
                ? 'medium'
                : 'high';

        return {
            name,
            expressionType,
            bindings,
            grainCandidates,
            sourceKinds,
            confidence,
            requiresDerivation: true,
            notes: [`Derived from ${requiredInputs.join(' + ')} semantics.`],
        };
    };

    return [
        buildDefinition('profit', 'derived_difference', ['revenue', 'cost']),
        buildDefinition('margin', 'derived_ratio', ['revenue', 'cost']),
        buildDefinition('variance', 'derived_difference', ['actual', 'budget']),
    ].filter((definition): definition is MetricDefinition => Boolean(definition));
};

const getSupportedDerivedMetrics = (semanticMetrics: AnalysisMetricSemantic[]) => {
    const semanticKeys = new Set(semanticMetrics.map(metric => `${metric.source}:${metric.name}`));
    const supported: AnalysisMetricSemanticName[] = [];

    if (
        semanticKeys.has('column:revenue') && semanticKeys.has('column:cost')
        || semanticKeys.has('row_label:revenue') && semanticKeys.has('row_label:cost')
    ) {
        supported.push('profit', 'margin');
    }
    if (
        semanticKeys.has('column:actual') && semanticKeys.has('column:budget')
        || semanticKeys.has('row_label:actual') && semanticKeys.has('row_label:budget')
    ) {
        supported.push('variance');
    }

    return dedupe(supported);
};

const getGrainCandidates = (
    columns: ColumnProfile[],
    briefShape: AnalysisIntentBrief['datasetShape'],
    semanticRoleMap: Map<string, DatasetSemanticSnapshot['columnAnnotations'][number]['semanticRole']>,
) => {
    const categoricalColumns = columns.filter(column => ['categorical', 'date', 'time'].includes(column.type));
    const candidates = categoricalColumns
        .filter(column => {
            const role = canonicalSemanticRole(semanticRoleMap.get(column.name));
            return role !== 'helper_dimension' && !TECHNICAL_GRAIN_COLUMN_PATTERN.test(column.name);
        })
        .sort((left, right) => {
            const getPriority = (name: string) => {
                const role = canonicalSemanticRole(semanticRoleMap.get(name));
                switch (role) {
                    case 'business_entity':
                        return 0;
                    case 'time_dimension':
                        return 1;
                    case 'code':
                        return 2;
                    case 'business_dimension':
                        return 2;
                    case 'helper_dimension':
                        return 6;
                    case 'descriptor':
                        return 4;
                    case 'note':
                        return 5;
                    default:
                        return 3;
                }
            };
            return getPriority(left.name) - getPriority(right.name) || left.name.localeCompare(right.name);
        })
        .map(column => column.name);

    if (briefShape === 'row_label_metrics') {
        const semanticFiltered = candidates.filter(name => {
            const role = canonicalSemanticRole(semanticRoleMap.get(name));
            return role !== 'descriptor' && role !== 'note' && !ROW_LABEL_COLUMN_PATTERN.test(name);
        });
        return (semanticFiltered.length > 0 ? semanticFiltered : candidates.filter(name => !ROW_LABEL_COLUMN_PATTERN.test(name))).slice(0, 6);
    }
    return candidates.slice(0, 6);
};

const chooseRecommendedPath = (
    shape: AnalysisBrief['datasetShape'],
    semanticMetrics: AnalysisMetricSemantic[],
    supportedDerivedMetrics: AnalysisMetricSemanticName[],
) => {
    if (shape === 'wide_report') {
        return supportedDerivedMetrics.length > 0 ? 'reshape_then_derive' : 'inspect_first';
    }
    if (shape === 'row_label_metrics' && supportedDerivedMetrics.length > 0) {
        return 'derive_metric_by_label_then_plan';
    }
    if (shape === 'metric_columns' && supportedDerivedMetrics.length > 0) {
        return 'derive_column_then_plan';
    }
    if (semanticMetrics.length > 0) {
        return 'direct_plan';
    }
    return 'inspect_first';
};

const buildNotes = (
    shape: AnalysisBrief['datasetShape'],
    semanticMetrics: AnalysisMetricSemantic[],
    supportedDerivedMetrics: AnalysisMetricSemanticName[],
    grainCandidates: string[],
) => {
    const notes: string[] = [];
    if (shape === 'row_label_metrics') {
        notes.push('Detected a label/value style metric table. Derived business metrics should be appended as new metric rows, not guessed inside analysis.create_plan.');
    }
    if (shape === 'metric_columns') {
        notes.push('Detected separate metric columns. Row-wise derived metrics can be created deterministically before visualization.');
    }
    if (shape === 'wide_report') {
        notes.push('Detected a wide or crosstab-like report shape. Reshape before deriving business metrics.');
    }
    if (supportedDerivedMetrics.includes('profit')) {
        notes.push('Profit is supportable from the detected revenue/cost semantics.');
    }
    if (supportedDerivedMetrics.includes('margin')) {
        notes.push('Margin is supportable as a derived ratio after or alongside profit derivation.');
    }
    if (supportedDerivedMetrics.includes('variance')) {
        notes.push('Variance is supportable from detected actual/budget semantics.');
    }
    if (semanticMetrics.length === 0) {
        notes.push('No stable business metric semantics detected yet; inspect before creating derived metrics.');
    }
    if (grainCandidates.length > 0) {
        notes.push(`Likely grouping grain candidates: ${grainCandidates.join(', ')}.`);
    }
    return notes;
};

export interface AnalysisRankingHints {
    preferredGrainColumns: string[];
    avoidGrainColumns: string[];
    preferredMetricTerms: string[];
    preferredTimeColumns: string[];
    preferredBusinessTerms?: string[];
}

export interface AnalysisNamingContext {
    title?: string | null;
    reportTitle?: string | null;
    parameterLines?: string[] | null;
}

export const buildAnalysisRankingHints = (
    brief: AnalysisBrief,
    columns: ColumnProfile[] = [],
    namingContext?: AnalysisNamingContext | null,
): AnalysisRankingHints => {
    const preferredGrainColumns = brief.grainCandidates.slice(0, 4);
    const avoidGrainColumns = dedupe(
        brief.metricDefinitions
            .flatMap(metric => metric.bindings)
            .flatMap(binding => binding.source === 'row_label' && binding.labelColumn ? [binding.labelColumn] : [])
            .filter(column => !preferredGrainColumns.includes(column)),
    );
    const preferredMetricTerms = dedupe([
        ...brief.supportedDerivedMetrics,
        ...brief.metricDefinitions.map(metric => metric.name),
        ...columns
            .filter(column => ['numerical', 'currency', 'percentage'].includes(column.type))
            .map(column => column.name),
        ...brief.metricDefinitions
            .flatMap(metric => metric.bindings)
            .flatMap(binding => binding.source === 'column' && binding.column ? [binding.column] : []),
    ]).slice(0, 6);
    const preferredTimeColumns = brief.grainCandidates.filter(candidate => {
        const column = columns.find(entry => entry.name === candidate);
        return column?.type === 'date' || column?.type === 'time' || /\b(date|day|week|month|quarter|year|period)\b/i.test(candidate);
    }).slice(0, 3);
    const preferredBusinessTerms = dedupeByNormalizedText([
        ...collectBusinessTermsFromPhrase(namingContext?.reportTitle ?? namingContext?.title),
        ...collectBusinessTermsFromParameterLines(namingContext?.parameterLines ?? undefined),
        ...brief.supportedDerivedMetrics.map(metric => toDisplayTerm(metric)),
        ...brief.semanticMetrics.map(metric => toDisplayTerm(metric.name)),
        ...columns
            .filter(column => ['numerical', 'currency', 'percentage'].includes(column.type))
            .map(column => toDisplayTerm(column.name))
            .filter(isMeaningfulBusinessTerm),
    ]).slice(0, 8);

    return {
        preferredGrainColumns,
        avoidGrainColumns,
        preferredMetricTerms,
        preferredTimeColumns,
        preferredBusinessTerms,
    };
};

export const buildAnalysisIntentBrief = ({
    columns,
    csvData,
    dataPreparationPlan,
    datasetSemanticSnapshot,
    semanticDatasetVersion,
}: {
    columns: ColumnProfile[];
    csvData: CsvData | null | undefined;
    dataPreparationPlan: DataPreparationPlan | null | undefined;
    datasetSemanticSnapshot?: DatasetSemanticSnapshot | null | undefined;
    semanticDatasetVersion?: string | null | undefined;
}): AnalysisBrief => {
    const semanticRoleMap = getCurrentSemanticRoleMap(csvData, datasetSemanticSnapshot, semanticDatasetVersion);
    const datasetShape = detectDatasetShape(columns, csvData, dataPreparationPlan, semanticRoleMap, datasetSemanticSnapshot);
    const semanticMetrics = buildSemanticMetrics(columns, csvData, dataPreparationPlan, semanticRoleMap, datasetSemanticSnapshot);
    const supportedDerivedMetrics = getSupportedDerivedMetrics(semanticMetrics);
    const grainCandidates = getGrainCandidates(columns, datasetShape, semanticRoleMap);
    const metricDefinitions = [
        ...semanticMetrics.map(metric => buildMetricDefinitionFromSemantic(metric, grainCandidates)),
        ...buildDerivedMetricDefinitions(semanticMetrics, grainCandidates),
    ];
    const requestedMetrics = supportedDerivedMetrics.filter(metric => ['profit', 'margin', 'variance'].includes(metric));
    const validationIssues = validateAnalysisBrief({
        datasetShape,
        recommendedPath: chooseRecommendedPath(datasetShape, semanticMetrics, supportedDerivedMetrics),
        semanticMetrics,
        metricDefinitions,
        supportedDerivedMetrics,
        grainCandidates,
        blockers: [],
        validationIssues: [],
        notes: [],
    }, requestedMetrics);
    const blockers = validationIssues
        .filter(issue => issue.severity === 'error')
        .map(issue => issue.message);
    const notes = buildNotes(datasetShape, semanticMetrics, supportedDerivedMetrics, grainCandidates);

    return {
        datasetShape,
        recommendedPath: chooseRecommendedPath(datasetShape, semanticMetrics, supportedDerivedMetrics),
        questionSummary: undefined,
        targetMetrics: requestedMetrics,
        expectedArtifact: requestedMetrics.length > 0 ? 'derived_metric' : 'answer',
        comparisonMode: requestedMetrics.includes('variance') ? 'variance' : requestedMetrics.includes('margin') ? 'ratio' : 'none',
        semanticMetrics,
        metricDefinitions,
        supportedDerivedMetrics,
        grainCandidates,
        blockers,
        validationIssues,
        notes,
    };
};

export const formatAnalysisIntentBrief = (brief: AnalysisBrief): string => {
    const semanticSummary = brief.semanticMetrics.length > 0
        ? brief.semanticMetrics.map(metric => {
            const source = metric.source === 'column'
                ? `columns: ${metric.columns.join(', ')}`
                : `label column: ${metric.labelColumn ?? 'n/a'} | value column: ${metric.valueColumn ?? 'n/a'} | labels: ${metric.matchedLabels?.join(', ') || 'n/a'}`;
            return `${metric.name} (${metric.source}, ${metric.confidence}) -> ${source}`;
        }).join('\n')
        : 'No stable metric semantics detected.';
    const metricDefinitions = brief.metricDefinitions.length > 0
        ? brief.metricDefinitions.map(metric => `${metric.name} (${metric.expressionType}, ${metric.confidence}) -> ${metric.bindings.map(binding =>
            binding.source === 'column'
                ? `column:${binding.column ?? 'n/a'}`
                : `row_label:${binding.labelColumn ?? 'n/a'} -> ${binding.valueColumn ?? 'n/a'} [${binding.matchedValues?.join(', ') || 'n/a'}]`,
        ).join(' | ')}`).join('\n')
        : 'No metric definitions available.';
    const validationSummary = brief.validationIssues.length > 0
        ? brief.validationIssues.map(issue => `- [${issue.severity}] ${issue.message}`).join('\n')
        : '- None';

    return [
        `Detected dataset shape: ${brief.datasetShape}`,
        `Recommended metric path: ${brief.recommendedPath}`,
        `Supported derived metrics: ${brief.supportedDerivedMetrics.join(', ') || 'none'}`,
        `Likely grain columns: ${brief.grainCandidates.join(', ') || 'n/a'}`,
        `Semantic metrics:\n${semanticSummary}`,
        `Metric definitions:\n${metricDefinitions}`,
        `Validation issues:\n${validationSummary}`,
        `Blockers:\n${brief.blockers.map(blocker => `- ${blocker}`).join('\n') || '- None'}`,
        `Notes:\n${brief.notes.map(note => `- ${note}`).join('\n') || '- None'}`,
    ].join('\n');
};

export const extractRequestedDerivedMetrics = (message: string): AnalysisMetricSemanticName[] => {
    const normalized = normalizeText(message);
    const requested = new Set<AnalysisMetricSemanticName>();
    (['profit', 'margin', 'variance'] as AnalysisMetricSemanticName[]).forEach(metric => {
        if (matchesMetricPattern(normalized, metric)) {
            requested.add(metric);
        }
    });

    const hasBudgetContext = matchesMetricPattern(normalized, 'budget');
    const hasActualContext = matchesMetricPattern(normalized, 'actual');
    const referencesRevenueAndCost = matchesMetricPattern(normalized, 'revenue') && matchesMetricPattern(normalized, 'cost');

    if (referencesRevenueAndCost && REVENUE_COST_PROFIT_INTENT_PATTERN.test(normalized)) {
        requested.add('profit');
        if (!(hasBudgetContext && hasActualContext)) {
            requested.delete('variance');
        }
    }

    return (['profit', 'margin', 'variance'] as AnalysisMetricSemanticName[])
        .filter(metric => requested.has(metric));
};
