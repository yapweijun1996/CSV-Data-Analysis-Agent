/**
 * Context section builder for analysis planning prompts.
 *
 * Assembles structured context sections (dataset overview, planning hints,
 * column roles, steering, learning hints) for AI planner consumption.
 */

import type { ColumnProfile, CsvRow } from '../../../types';
import {
    createContextSection,
    formatColumnNames,
    formatRows,
    trimRawDataSample,
} from '../../ai/contextManager';
import { formatColumnDisplayHints } from '../../dashboard/businessLabelResolver';
import { formatAnalysisSteeringBundle } from '../analysisSteering';
import type { AnalysisDatasetContext, PlanLearningHints } from '../../prompts/analysisPrompts';

// ─── Dataset overview text ─────────────────────────────────────

export const buildDatasetOverviewText = (datasetContext: AnalysisDatasetContext) => `Dataset title: ${datasetContext.title || 'Unknown Report'}
Report title: ${datasetContext.reportTitle || datasetContext.title || 'Unknown Report'}
Report shape: ${datasetContext.reportShapeKind || 'unknown'}
Header hint: ${datasetContext.headerHintPreview || 'No candidate header hint was detected.'}
Total rows: ${datasetContext.rowCount ?? 'N/A'}
Report parameters:
${datasetContext.parameterPreview || 'No parameter lines were detected.'}
Metadata:
${datasetContext.metadataPreview || 'No metadata or notes were detected.'}
Footer / notes:
${datasetContext.footerPreview || 'No footer lines were detected.'}
Summary highlights:
${datasetContext.summaryPreview || 'No summary rows were detected.'}`;

// ─── Planning hints text ───────────────────────────────────────

export const buildPlanningHintsText = (datasetContext: AnalysisDatasetContext) => {
    const lines: string[] = [];
    const steeringSummary = formatAnalysisSteeringBundle(datasetContext.analysisSteering);
    // What to use
    if (datasetContext.businessGrains?.length) {
        lines.push(`Use these groupBy dimensions: ${datasetContext.businessGrains.join(', ')}`);
    }
    if (datasetContext.preferredTimeColumns?.length) {
        lines.push(`Time columns for trends: ${datasetContext.preferredTimeColumns.join(', ')}`);
    }
    if (datasetContext.preferredMetricTerms?.length) {
        lines.push(`Key metrics: ${datasetContext.preferredMetricTerms.join(', ')}`);
    }
    // What NOT to use (columns only, not values)
    if (datasetContext.blockedDimensions?.length) {
        lines.push(`Do NOT groupBy: ${datasetContext.blockedDimensions.join(', ')}`);
    }
    if (datasetContext.avoidGrainColumns?.length) {
        lines.push(`Avoid low-quality dimensions for automatic analysis: ${datasetContext.avoidGrainColumns.join(', ')}`);
    }
    if (datasetContext.avoidMetricColumns?.length) {
        lines.push(`Avoid risky metrics for automatic analysis: ${datasetContext.avoidMetricColumns.join(', ')}`);
    }
    if (datasetContext.nonAdditiveMetrics?.length) {
        lines.push(`Non-additive metrics (do NOT use SUM — use AVG instead): ${datasetContext.nonAdditiveMetrics.join(', ')}`);
    }
    if (datasetContext.qualityHintsSummary) {
        lines.push(`Quality governance summary: ${datasetContext.qualityHintsSummary}`);
    }
    // Business context
    if (datasetContext.headerSemantics) {
        lines.push(`Report context: ${datasetContext.headerSemantics}`);
    }
    // Metric relationship derived topic suggestions
    if (datasetContext.suggestedDerivedTopics?.length) {
        lines.push(`Detected metric relationships (A - B ≈ C) — consider including derived metric topics:`);
        datasetContext.suggestedDerivedTopics.forEach(t => lines.push(`  - ${t}`));
    }
    // Pivot-only dimension combinations (cardinality product > 100)
    if (datasetContext.pivotOnlyCombinations?.length) {
        lines.push(`High-cardinality dimension pairs — use pivot chart type, NOT flat bar chart:`);
        datasetContext.pivotOnlyCombinations.forEach(c =>
            lines.push(`  - ${c.dimA} × ${c.dimB} (${c.product} combinations)`),
        );
    }
    if (steeringSummary) {
        lines.push(`Structured steering bundle:\n${steeringSummary}`);
    }
    return lines.join('\n') || 'No specific planning hints.';
};

// ─── Planner context sections ──────────────────────────────────

export const createPlannerSections = (
    columns: ColumnProfile[],
    datasetContext: AnalysisDatasetContext,
    sampleData: CsvRow[],
    learningHints?: PlanLearningHints,
    explorationContext?: string | null,
    harnessSummary?: string | null,
) => [
    createContextSection('dataset_overview', buildDatasetOverviewText(datasetContext), 'high', 'sticky'),
    createContextSection('column_roles', `Dimensions: ${datasetContext.dimensionColumns.join(', ') || 'None detected'}\nMetrics: ${datasetContext.metricColumns.join(', ') || 'None detected'}`, 'high', 'sticky'),
    createContextSection('planning_hints', buildPlanningHintsText(datasetContext), 'high', 'sticky'),
    ...(datasetContext.analysisSteering
        ? [createContextSection('analysis_steering', formatAnalysisSteeringBundle(datasetContext.analysisSteering) ?? 'No structured steering bundle.', 'high', 'sticky')]
        : []),
    createContextSection('dataset_columns', `Available columns:\n${formatColumnNames(columns)}`, 'required', 'sticky'),
    createContextSection('column_display_hints', `User-facing column label hints:\n${formatColumnDisplayHints(columns)}`, 'high', 'sticky'),
    createContextSection('sample_data', `Sample data:\n${formatRows(trimRawDataSample(sampleData, 20))}`, 'high', 'prunable'),
    ...(explorationContext ? [
        createContextSection('data_exploration_results', explorationContext, 'high', 'prunable'),
    ] : []),
    // Harness investigation summary is compact and critical — keep it sticky
    // so it's never pruned by context budget even when exploration context is dropped.
    ...(harnessSummary ? [
        createContextSection('harness_investigation', harnessSummary, 'high', 'sticky'),
    ] : []),
    createContextSection(
        'learning_hints',
        [
            learningHints?.avoidGroupBys?.length ? `Avoid weak groupings: ${learningHints.avoidGroupBys.join(', ')}` : '',
            learningHints?.preferGroupBys?.length ? `Historically useful groupings: ${learningHints.preferGroupBys.join(', ')}` : '',
        ].filter(Boolean).join('\n') || 'No prior learning hints available.',
        'medium',
        'prunable',
    ),
];
