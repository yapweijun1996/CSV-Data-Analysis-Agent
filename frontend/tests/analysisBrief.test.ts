// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildAnalysisIntentBrief, buildAnalysisRankingHints, extractRequestedDerivedMetrics, formatAnalysisIntentBrief } from '../services/agent/analysisBrief';
import { buildSemanticDatasetVersion } from '../services/agent/datasetSemantics';

describe('analysisBrief', () => {
    it('recommends derive_column_then_plan for metric-column datasets', () => {
        const brief = buildAnalysisIntentBrief({
            columns: [
                { name: 'Project', type: 'categorical' },
                { name: 'Revenue', type: 'currency' },
                { name: 'Cost', type: 'currency' },
            ] as never,
            csvData: {
                data: [
                    { Project: 'Alpha', Revenue: 100, Cost: 40 },
                    { Project: 'Beta', Revenue: 80, Cost: 30 },
                ],
            } as never,
            dataPreparationPlan: null,
        });

        expect(brief.datasetShape).toBe('metric_columns');
        expect(brief.recommendedPath).toBe('derive_column_then_plan');
        expect(brief.supportedDerivedMetrics).toEqual(expect.arrayContaining(['profit', 'margin']));
        expect(brief.metricDefinitions.some(metric => metric.name === 'profit' && metric.requiresDerivation)).toBe(true);
        expect(brief.validationIssues).toEqual([]);
        expect(formatAnalysisIntentBrief(brief)).toContain('Recommended metric path: derive_column_then_plan');
        expect(formatAnalysisIntentBrief(brief)).toContain('Metric definitions:');
    });

    it('recommends derive_metric_by_label_then_plan for label/value metric tables', () => {
        const brief = buildAnalysisIntentBrief({
            columns: [
                { name: 'Project', type: 'categorical' },
                { name: 'Description', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ] as never,
            csvData: {
                data: [
                    { Project: 'Alpha', Description: 'Revenue', Value: 100 },
                    { Project: 'Alpha', Description: 'Cost of Sales', Value: 40 },
                    { Project: 'Beta', Description: 'Revenue', Value: 80 },
                    { Project: 'Beta', Description: 'Cost of Sales', Value: 30 },
                ],
            } as never,
            dataPreparationPlan: {
                explanation: 'Already reshaped into a long metric table.',
                operations: [{ id: 'reshape', type: 'unpivot_columns', reason: 'Reshape report.' } as never],
                outputColumns: [],
            } as never,
        });

        expect(brief.datasetShape).toBe('row_label_metrics');
        expect(brief.recommendedPath).toBe('derive_metric_by_label_then_plan');
        expect(brief.supportedDerivedMetrics).toEqual(expect.arrayContaining(['profit', 'margin']));
        expect(brief.metricDefinitions.some(metric => metric.name === 'profit' && metric.sourceKinds.includes('row_label'))).toBe(true);
        expect(brief.notes.join(' ')).toContain('label/value style metric table');
    });

    it('extracts requested derived business metrics from follow-up messages', () => {
        expect(extractRequestedDerivedMetrics('create a profit and margin card')).toEqual(['profit', 'margin']);
        expect(extractRequestedDerivedMetrics('evaluate project profitability and cost performance')).toEqual(['profit']);
        expect(extractRequestedDerivedMetrics('show budget variance')).toEqual(['variance']);
        expect(extractRequestedDerivedMetrics('analyze revenue and cost variances')).toEqual(['profit']);
    });

    it('uses semantic snapshot roles to detect label/value metric tables with ambiguous column names', () => {
        const csvData = {
            fileName: 'metrics.csv',
            data: [
                { Bucket: 'Alpha', Item: 'Revenue', Value: 100 },
                { Bucket: 'Alpha', Item: 'Cost of Sales', Value: 40 },
                { Bucket: 'Beta', Item: 'Revenue', Value: 80 },
                { Bucket: 'Beta', Item: 'Cost of Sales', Value: 30 },
            ],
        };
        const datasetVersion = buildSemanticDatasetVersion(csvData as never);
        const brief = buildAnalysisIntentBrief({
            columns: [
                { name: 'Bucket', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Item', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Value', type: 'currency', missingPercentage: 0, valueRange: [30, 100] },
            ] as never,
            csvData: csvData as never,
            dataPreparationPlan: {
                explanation: 'Already reshaped into a long metric table.',
                operations: [{ id: 'reshape', type: 'unpivot_columns', reason: 'Reshape report.' } as never],
                outputColumns: [],
            } as never,
            datasetSemanticSnapshot: {
                datasetRole: 'mixed_report',
                rowAnnotations: [],
                columnAnnotations: [
                    { columnName: 'Bucket', semanticRole: 'entity', confidence: 0.88, reason: 'Business entity grain.' },
                    { columnName: 'Item', semanticRole: 'label', confidence: 0.93, reason: 'Metric label field.' },
                    { columnName: 'Value', semanticRole: 'metric', confidence: 0.98, reason: 'Numeric value field.' },
                ],
                recommendedAnalysisView: {
                    mode: 'soft_exclude',
                    includedRowIndices: [0, 1, 2, 3],
                    excludedRowIndices: [],
                    includedRowCount: 4,
                    excludedRowCount: 0,
                    reason: 'No non-detail rows were excluded.',
                },
                headerSemantics: {
                    reportTitle: 'Metrics by Bucket',
                    reportType: 'detail_listing',
                    headerRoleHints: [],
                    scopeHints: {},
                    businessTerminology: ['Bucket', 'Revenue', 'Cost of Sales'],
                    headerConfidence: 0.8,
                    confidenceBand: 'medium',
                    reason: 'Detected a long-form metric listing.',
                    evidenceSources: ['report_context', 'sample_values'],
                    conflictDetected: false,
                },
                summary: 'Long metric table with entity and metric-label columns.',
                generatedAt: '2026-03-15T00:00:00.000Z',
                modelId: 'gemini-test',
                sourceDatasetVersion: datasetVersion,
            },
            semanticDatasetVersion: datasetVersion,
        });

        expect(brief.datasetShape).toBe('row_label_metrics');
        expect(brief.recommendedPath).toBe('derive_metric_by_label_then_plan');
        expect(brief.grainCandidates[0]).toBe('Bucket');
        expect(brief.grainCandidates).not.toContain('Item');
        expect(brief.metricDefinitions.some(metric =>
            metric.name === 'profit'
            && metric.bindings.some(binding => binding.source === 'row_label' && binding.labelColumn === 'Item'),
        )).toBe(true);
    });

    it('builds preferred business terms from report naming context for generic metric columns', () => {
        const brief = buildAnalysisIntentBrief({
            columns: [
                { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Value', type: 'currency', missingPercentage: 0, valueRange: [30, 100] },
            ] as never,
            csvData: {
                fileName: 'project-profitability.csv',
                data: [
                    { Project: 'Alpha', Value: 100 },
                    { Project: 'Beta', Value: 80 },
                ],
            } as never,
            dataPreparationPlan: null,
        });

        const hints = buildAnalysisRankingHints(brief, [
            { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Value', type: 'currency', missingPercentage: 0, valueRange: [30, 100] },
        ] as never, {
            reportTitle: 'Project Profitability Report',
            parameterLines: ['Department: Construction'],
        });

        expect(hints.preferredMetricTerms).toContain('Value');
        expect(hints.preferredBusinessTerms).toEqual(expect.arrayContaining(['Project Profitability', 'Project', 'Profitability', 'Department']));
        expect(hints.preferredBusinessTerms).not.toContain('Value');
    });

    it('classifies semantic financial statements as wide reports without relying on regex-shaped headers', () => {
        const csvData = {
            fileName: 'statement.csv',
            data: [
                { Code: '1000', Description: 'Revenue', CurrentPeriod: 100, PriorPeriod: 90 },
                { Code: '2000', Description: 'Cost of Sales', CurrentPeriod: 40, PriorPeriod: 35 },
            ],
        };
        const datasetVersion = buildSemanticDatasetVersion(csvData as never);
        const brief = buildAnalysisIntentBrief({
            columns: [
                { name: 'Code', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Description', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'CurrentPeriod', type: 'currency', missingPercentage: 0, valueRange: [40, 100] },
                { name: 'PriorPeriod', type: 'currency', missingPercentage: 0, valueRange: [35, 90] },
            ] as never,
            csvData: csvData as never,
            dataPreparationPlan: null,
            datasetSemanticSnapshot: {
                datasetRole: 'mixed_report',
                rowAnnotations: [],
                columnAnnotations: [
                    { columnName: 'Code', semanticRole: 'code', confidence: 0.9, reason: 'Statement account code.' },
                    { columnName: 'Description', semanticRole: 'descriptor', confidence: 0.95, reason: 'Statement line label.' },
                    { columnName: 'CurrentPeriod', semanticRole: 'metric', confidence: 0.98, reason: 'Current metric column.' },
                    { columnName: 'PriorPeriod', semanticRole: 'metric', confidence: 0.98, reason: 'Prior metric column.' },
                ],
                recommendedAnalysisView: {
                    mode: 'soft_exclude',
                    includedRowIndices: [0, 1],
                    excludedRowIndices: [],
                    includedRowCount: 2,
                    excludedRowCount: 0,
                    reason: 'Statement rows are retained.',
                },
                headerSemantics: {
                    reportTitle: 'Income Statement',
                    reportType: 'financial_statement',
                    headerRoleHints: [],
                    scopeHints: {},
                    businessTerminology: ['Revenue', 'Cost of Sales'],
                    headerConfidence: 0.88,
                    confidenceBand: 'high',
                    reason: 'Semantic header detection identified a financial statement.',
                    evidenceSources: ['report_context'],
                    conflictDetected: false,
                },
                summary: 'Financial statement with descriptor rows and multiple period metrics.',
                generatedAt: '2026-03-19T00:00:00.000Z',
                modelId: 'gemini-test',
                sourceDatasetVersion: datasetVersion,
            },
            semanticDatasetVersion: datasetVersion,
        });

        expect(brief.datasetShape).toBe('wide_report');
        expect(brief.recommendedPath).toBe('reshape_then_derive');
        expect(brief.notes.join(' ')).toContain('wide or crosstab-like report shape');
    });
});
