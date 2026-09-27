import {
    CsvData,
    CsvRow,
    ColumnProfile,
    DatasetKnowledge,
    DatasetColumnKnowledge,
    DatasetKnowledgeHighlight,
    ColumnRole,
    AgentMemoryExploration,
    AgentMemoryExplorationVerdict,
    DataPreparationPlan,
    ReportContextResolution,
    PendingVectorMemoryDoc,
} from '../../types';
import type { AnalysisDatasetContext } from '../prompts/analysisPrompts';
import { resolveEffectiveReportContext } from './reportContext';
import { detectReportShape } from './reportShapeDetector';
import { buildAnalysisIntentBrief, buildAnalysisRankingHints } from './analysisBrief';
import type { DatasetSemanticSnapshot } from '../../types';
import { buildRuntimeSemanticUnderstanding } from './runtimeSemanticUnderstanding';
import { isStructuralMetadataColumn } from './structuralMetadata';
import { buildAnalysisColumnRoleMap } from './analysisColumnRoles';

const formatMetadataPreview = (rows?: string[][], limit = 3): string | undefined => {
    if (!rows || rows.length === 0) return undefined;
    const formatted = rows
        .slice(0, limit)
        .map(entry => entry.filter(cell => cell && cell.trim().length > 0).join(' | ').trim())
        .filter(line => line.length > 0)
        .join('\n');
    return formatted.length > 0 ? formatted : undefined;
};

const formatSummaryPreview = (rows?: CsvRow[], limit = 2): string | undefined => {
    if (!rows || rows.length === 0) return undefined;
    const preview = rows.slice(0, limit).map(row => JSON.stringify(row)).join('\n');
    return preview.length > 0 ? preview : undefined;
};

/**
 * Defense-in-depth: detect categorical columns whose values are predominantly
 * numeric (e.g., apostrophe-prefixed numbers that escaped profiler detection).
 * Prevents misclassified numeric columns from leaking into dimension lists.
 */
const isLikelyMisclassifiedNumeric = (col: ColumnProfile, rows: CsvRow[]): boolean => {
    if (col.type !== 'categorical') return false;
    const sample = rows.slice(0, 50);
    const nonEmpty = sample
        .map(row => String(row[col.name] ?? '').trim())
        .filter(v => v !== '');
    if (nonEmpty.length < 3) return false;
    const numericCount = nonEmpty.filter(v => {
        const cleaned = v.replace(/^['\u2018\u2019]/, '').replace(/[$,€£¥%\s]/g, '');
        return cleaned !== '' && !isNaN(Number(cleaned));
    }).length;
    return numericCount / nonEmpty.length > 0.6;
};

export const buildDatasetContext = (
    data: CsvData,
    columns: ColumnProfile[],
    reportContextResolution?: ReportContextResolution | null,
    datasetSemanticSnapshot?: DatasetSemanticSnapshot | null,
    semanticDatasetVersion?: string | null,
    dataPreparationPlan?: DataPreparationPlan | null,
    rawData?: CsvData | null,
): AnalysisDatasetContext => {
    const sourceRawData = rawData ?? data;
    const reportContext = resolveEffectiveReportContext(reportContextResolution, sourceRawData, data);
    const reportShapeProfile = detectReportShape(data);
    const analysisBrief = buildAnalysisIntentBrief({
        columns,
        csvData: data,
        dataPreparationPlan: dataPreparationPlan ?? null,
        datasetSemanticSnapshot,
        semanticDatasetVersion,
    });
    const rankingHints = buildAnalysisRankingHints(analysisBrief, columns, {
        title: data.fileName,
        reportTitle: reportContext?.reportTitle ?? null,
        parameterLines: reportContext?.parameterLines ?? [],
    });
    const semanticUnderstanding = buildRuntimeSemanticUnderstanding({
        columns,
        analysisBrief,
        reportContextResolution,
        datasetSemanticSnapshot,
    });
    const analysisColumnRoles = buildAnalysisColumnRoleMap(columns, semanticUnderstanding);
    const structuralColumns = columns
        .map(col => col.name)
        .filter(isStructuralMetadataColumn);
    const dimensionColumns = columns
        .filter(col => ['categorical', 'date', 'time'].includes(col.type) && !isStructuralMetadataColumn(col.name))
        .filter(col => !isLikelyMisclassifiedNumeric(col, data.data))
        .map(col => col.name);
    const metricColumns = columns
        .filter(col => (
            ['numerical', 'currency', 'percentage'].includes(col.type)
            && analysisColumnRoles[col.name] === 'business_metric'
        ))
        .map(col => col.name);
    // Only truly blocked dimensions go into avoidGrainColumns.
    // Helper dimensions are passed separately via helperDimensions on the context
    // so the planner can deprioritize rather than exclude them.
    const avoidGrainColumns = Array.from(new Set([
        ...(rankingHints.avoidGrainColumns ?? []),
        ...(semanticUnderstanding.blockedDimensions ?? []),
    ]));
    const avoidMetricColumns = Array.from(new Set([
        ...structuralColumns.filter(column => !dimensionColumns.includes(column)),
        ...columns
            .filter(column => (
                ['numerical', 'currency', 'percentage'].includes(column.type)
                && analysisColumnRoles[column.name] !== 'business_metric'
            ))
            .map(column => column.name),
    ]));
    const NON_ADDITIVE_NAME_PATTERN = /(^|[\s_\-.])(avg|average|mean|rate|ratio|margin|yield|pct|percent|index|score)([\s_\-.]|$)/i;
    const nonAdditiveMetrics = metricColumns.filter(name => {
        const profile = columns.find(c => c.name === name);
        return profile?.type === 'percentage' || NON_ADDITIVE_NAME_PATTERN.test(name);
    });

    return {
        title: reportContext?.reportTitle ?? data.fileName,
        reportTitle: reportContext?.reportTitle ?? undefined,
        parameterPreview: reportContext?.parameterLines.join('\n') || undefined,
        footerPreview: reportContext?.footerLines.join('\n') || undefined,
        metadataPreview: [
            reportContext && reportContext.parameterLines.length > 0 ? `Report parameters:\n${reportContext.parameterLines.join('\n')}` : '',
            formatMetadataPreview(sourceRawData.metadataRows),
        ].filter(Boolean).join('\n\n') || undefined,
        summaryPreview: [
            reportContext && reportContext.footerLines.length > 0 ? `Footer / notes:\n${reportContext.footerLines.join('\n')}` : '',
            formatSummaryPreview(sourceRawData.summaryRows),
        ].filter(Boolean).join('\n\n') || undefined,
        reportShapeKind: reportShapeProfile.primaryKind,
        headerHintPreview: reportContext?.candidateHeaderLine?.join(' | ') || undefined,
        rowCount: data.data.length,
        dimensionColumns,
        metricColumns,
        preferredGrainColumns: rankingHints.preferredGrainColumns,
        avoidGrainColumns,
        avoidMetricColumns,
        preferredMetricTerms: rankingHints.preferredMetricTerms,
        preferredTimeColumns: rankingHints.preferredTimeColumns,
        preferredBusinessTerms: rankingHints.preferredBusinessTerms,
        businessGrains: semanticUnderstanding.businessGrains,
        helperDimensions: semanticUnderstanding.helperDimensions,
        blockedDimensions: semanticUnderstanding.blockedDimensions,
        businessGrainConfidence: semanticUnderstanding.businessGrainConfidence,
        unsafeForBusinessNarrative: semanticUnderstanding.unsafeForBusinessNarrative,
        headerSemantics: semanticUnderstanding.headerSemantics
            ? `${semanticUnderstanding.headerSemantics.reportType} | ${semanticUnderstanding.headerSemantics.reportTitle ?? 'unknown'} | terms: ${semanticUnderstanding.headerSemantics.businessTerminology.join(', ') || 'none'}`
            : undefined,
        diagnosticModeRecommended: semanticUnderstanding.diagnosticModeRecommended,
        nonAdditiveMetrics: nonAdditiveMetrics.length > 0 ? nonAdditiveMetrics : undefined,
        analysisSteering: null,
    };
};

const summarizeMetadataRows = (rows?: string[][], limit = 3): string | undefined => {
    if (!rows || rows.length === 0) return undefined;
    return rows.slice(0, limit).map(row => row.filter(cell => cell && cell.trim().length > 0).join(' | ')).join('\n');
};

export const buildDatasetMemoryDocuments = (state: {
    csvData: CsvData | null;
    dataPreparationPlan: DataPreparationPlan | null;
    columnProfiles: ColumnProfile[];
}): PendingVectorMemoryDoc[] => {
    if (!state.csvData) return [];
    const lines: string[] = [];
    lines.push(`Dataset "${state.csvData.fileName}" loaded with ${state.csvData.data.length} rows.`);
    if (state.csvData.metadataRows?.length) {
        const preview = summarizeMetadataRows(state.csvData.metadataRows);
        if (preview) {
            lines.push('Report metadata preview:\n' + preview);
        }
    }
    if (state.csvData.headerDepth && state.csvData.headerDepth > 1) {
        lines.push(`Detected ${state.csvData.headerDepth} report header layers preserved outside the cleaned body rows.`);
    }
    if (state.csvData.summaryRowCount && state.csvData.summaryRowCount > 0) {
        lines.push(`Excluded ${state.csvData.summaryRowCount} summary/memo rows from analysis.`);
    }
    if (state.dataPreparationPlan?.explanation) {
        lines.push(`AI cleaning plan: ${state.dataPreparationPlan.explanation}`);
    }
    if (state.columnProfiles.length > 0) {
        const profileSummary = state.columnProfiles
            .slice(0, 10)
            .map(profile => `${profile.name} (${profile.type})`)
            .join(', ');
        lines.push(`Key columns: ${profileSummary}${state.columnProfiles.length > 10 ? ', ...' : ''}`);
    }
    return [{
        id: `dataset-${state.csvData.fileName}-${Date.now()}`,
        text: lines.join('\n'),
        metadata: {
            kind: 'dataset',
            memoryFormatVersion: 'ir-v1',
        },
    }];
};

// --- Logic for DatasetKnowledge management ---

const guessSemanticFromName = (name: string): string => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return 'unlabeled field';
    if (normalized.includes('project')) return 'project attribute';
    if (normalized.includes('account')) return 'account attribute';
    if (normalized.includes('code')) return 'identifier / code';
    if (normalized.includes('description')) return 'description / label';
    if (normalized === 'value' || normalized.includes('amount') || normalized.includes('total')) return 'financial amount';
    if (/(corp|allocation)/.test(normalized)) return 'allocation / corporate adjustment';
    if (normalized.includes('cost') || normalized.includes('expense')) return 'expense metric';
    return 'general attribute';
};

const buildDimensionMap = (columns: ColumnProfile[]): DatasetKnowledge['dimensionMap'] => {
    const map = { project: [] as string[], account: [] as string[], allocation: [] as string[], keys: [] as string[], otherDimensions: [] as string[], metrics: [] as string[] };
    columns.forEach(column => {
        const lower = column.name.toLowerCase();
        if (/(project|job|site)/.test(lower)) { map.project.push(column.name); } 
        else if (/account|acct/.test(lower)) { map.account.push(column.name); } 
        else if (/(corp)/.test(lower)) { map.allocation.push(column.name); }
        else if (/code|id/.test(lower)) { map.keys.push(column.name); } 
        else if (['numerical', 'currency', 'percentage'].includes(column.type)) { map.metrics.push(column.name); } 
        else { map.otherDimensions.push(column.name); }
    });
    return map;
};

export const createInitialDatasetKnowledge = (rowCount: number, columnProfiles: ColumnProfile[]): DatasetKnowledge => ({
    facts: {
        originalRowCount: rowCount,
        originalColumnCount: columnProfiles.length,
        cleanedRowCount: rowCount,
        cleanedColumnCount: columnProfiles.length,
        primaryDimensions: columnProfiles.filter(col => ['categorical', 'date', 'time'].includes(col.type)).map(col => col.name).slice(0, 8),
        primaryMetrics: columnProfiles.filter(col => ['numerical', 'currency', 'percentage'].includes(col.type)).map(col => col.name).slice(0, 8),
    },
    columns: [],
    dimensionMap: buildDimensionMap(columnProfiles),
    highValueDimensions: [],
    suspiciousMetrics: [],
    groupByInsights: [],
});

const getOrCreateColumnKnowledge = (map: Map<string, DatasetColumnKnowledge>, name: string): DatasetColumnKnowledge => {
    const key = name.toLowerCase();
    const existing = map.get(key);
    if (existing) return existing;
    const knowledge: DatasetColumnKnowledge = { name, role: 'dimension' };
    map.set(key, knowledge);
    return knowledge;
};

export const updateDatasetKnowledgeFacts = (knowledge: DatasetKnowledge, columnMap: Map<string, DatasetColumnKnowledge>, params: { rowCount: number, columnProfiles: ColumnProfile[] }) => {
    knowledge.facts.cleanedRowCount = params.rowCount;
    knowledge.facts.cleanedColumnCount = params.columnProfiles.length;
    knowledge.facts.primaryDimensions = params.columnProfiles.filter(col => ['categorical', 'date', 'time'].includes(col.type)).map(col => col.name).slice(0, 8);
    knowledge.facts.primaryMetrics = params.columnProfiles.filter(col => ['numerical', 'currency', 'percentage'].includes(col.type)).map(col => col.name).slice(0, 8);
    knowledge.dimensionMap = buildDimensionMap(params.columnProfiles);
    params.columnProfiles.forEach(profile => {
        const colKnowledge = getOrCreateColumnKnowledge(columnMap, profile.name);
        colKnowledge.type = profile.type;
        colKnowledge.distinctValues = profile.uniqueValues;
        colKnowledge.missingPercentage = profile.missingPercentage;
        colKnowledge.semanticGuess = colKnowledge.semanticGuess ?? guessSemanticFromName(profile.name);
    });
};

export const updateKnowledgeForColumnEvaluation = (columnMap: Map<string, DatasetColumnKnowledge>, schema: ColumnProfile[], evaluation: { dropColumns: { name: string, role: ColumnRole, reason: string }[], keepColumns: { name: string, role: ColumnRole }[] }) => {
    const dropMap = new Map(evaluation.dropColumns.map(col => [col.name.toLowerCase(), col]));
    const keepMap = new Map(evaluation.keepColumns.map(col => [col.name.toLowerCase(), col]));
    schema.forEach(column => {
        const knowledge = getOrCreateColumnKnowledge(columnMap, column.name);
        const dropDecision = dropMap.get(column.name.toLowerCase());
        const keepDecision = keepMap.get(column.name.toLowerCase());
        knowledge.role = dropDecision ? 'noise' : keepDecision?.role ?? 'dimension';
        knowledge.type = column.type;
        knowledge.distinctValues = column.uniqueValues;
        knowledge.missingPercentage = column.missingPercentage;
        knowledge.semanticGuess = knowledge.semanticGuess ?? guessSemanticFromName(column.name);
        if (dropDecision) {
            knowledge.notes = `Flagged as ${dropDecision.reason}`;
        }
    });
};

export const updateKnowledgeForRemovedColumns = (columnMap: Map<string, DatasetColumnKnowledge>, columns: { name: string, reason: string, sampleValues?: string[] }[]) => {
    columns.forEach(column => {
        const knowledge = getOrCreateColumnKnowledge(columnMap, column.name);
        knowledge.role = 'noise';
        knowledge.notes = `Removed: ${column.reason}`;
        knowledge.sampleValues = column.sampleValues;
    });
};

const addHighlight = (list: DatasetKnowledgeHighlight[], highlight: DatasetKnowledgeHighlight) => {
    if (list.some(entry => entry.name === highlight.name && entry.reason === highlight.reason)) return;
    list.push(highlight);
};

export const updateKnowledgeForExploration = (knowledge: DatasetKnowledge, exploration: AgentMemoryExploration, result: { verdict: AgentMemoryExplorationVerdict, dropReason?: string, metrics?: { topShare: number | null, groups?: number, uniqueValues?: number }, commentary?: string }) => {
    knowledge.groupByInsights.push({
        groupBy: exploration.groupBy,
        metric: exploration.metric,
        verdict: result.verdict,
        topShare: result.metrics?.topShare ?? null,
        uniqueValues: result.metrics?.uniqueValues,
        commentary: result.commentary,
        dropReason: result.dropReason,
    });
    if (result.verdict === 'useful' && result.metrics?.topShare && exploration.groupBy.length > 0) {
        const reason = `Top share ${(result.metrics.topShare * 100).toFixed(1)}% across ${result.metrics.groups ?? 0} groups`;
        addHighlight(knowledge.highValueDimensions, {
            name: exploration.groupBy.join(', '),
            reason,
            metric: exploration.metric ?? undefined,
            topShare: result.metrics.topShare,
            groups: result.metrics.groups,
        });
    }
    if (result.verdict === 'flat_metric' || result.verdict === 'no_data' || result.verdict === 'noisy') {
        const reason = result.dropReason === 'low_value' ? 'Distribution flat, low value insight' : result.dropReason === 'flat_metric' ? 'No variance detected' : 'Metric returned no rows';
        addHighlight(knowledge.suspiciousMetrics, {
            name: exploration.metric ?? exploration.groupBy.join(', '),
            reason,
            metric: exploration.metric ?? undefined,
            topShare: result.metrics?.topShare ?? undefined,
            groups: result.metrics?.groups ?? undefined,
        });
    }
};

const buildDatasetSummary = (knowledge: DatasetKnowledge): string => {
    const { facts } = knowledge;
    const primaryDims = facts.primaryDimensions.length > 0 ? facts.primaryDimensions.join(', ') : 'unknown dimensions';
    const metrics = facts.primaryMetrics.length > 0 ? facts.primaryMetrics.join(', ') : 'unknown metrics';
    return `Dataset remapped to ${facts.cleanedRowCount.toLocaleString()} rows x ${facts.cleanedColumnCount} columns. Key dimensions: ${primaryDims}. Key metrics: ${metrics}.`;
};

export const finalizeDatasetKnowledge = (knowledge: DatasetKnowledge, columnMap: Map<string, DatasetColumnKnowledge>): DatasetKnowledge => {
    if (!knowledge.summary) {
        knowledge.summary = buildDatasetSummary(knowledge);
    }
    knowledge.columns = Array.from(columnMap.values());
    return knowledge;
}
