import { describe, expect, it } from 'vitest';
import {
    buildSemanticDatasetVersion,
    formatDatasetSemanticsForPrompt,
    isCurrentSemanticFallback,
    resolveSemanticDefaultCsvData,
    sanitizeDatasetSemanticSnapshot,
} from '../services/agent/datasetSemantics';
import { buildRuntimeSemanticUnderstanding } from '../services/agent/runtimeSemanticUnderstanding';
import { makeDatasetHeaderSemantics } from './testFactories';

describe('dataset semantics helpers', () => {
    const dataset = {
        fileName: 'projects.csv',
        data: [
            { Project: 'Grand Total', Amount: 1000 },
            { Project: 'Alpha', Amount: 600 },
            { Project: 'Others', Amount: 400 },
        ],
    };
    const datasetVersion = buildSemanticDatasetVersion(dataset as never);

    it('reuses a deterministic semantic fallback only for the same dataset version', () => {
        expect(isCurrentSemanticFallback('fallback', datasetVersion, datasetVersion)).toBe(true);
        expect(isCurrentSemanticFallback('fallback', 'older-version', datasetVersion)).toBe(false);
        expect(isCurrentSemanticFallback('ready', datasetVersion, datasetVersion)).toBe(false);
    });

    it('soft-excludes high-confidence non-detail rows from the default analysis dataset', () => {
        const snapshot = sanitizeDatasetSemanticSnapshot(
            {
                datasetRole: 'mixed_report',
                rowAnnotations: [
                    { rowIndex: 0, rowRole: 'grand_total', confidence: 0.95, reason: 'Aggregate row.' },
                    { rowIndex: 2, rowRole: 'bucket', confidence: 0.81, reason: 'Catch-all row.' },
                ],
                columnAnnotations: [],
                summary: 'Contains aggregate and bucket rows.',
            },
            dataset as never,
            'gemini-test',
            datasetVersion,
        );

        const semanticData = resolveSemanticDefaultCsvData(dataset as never, snapshot, datasetVersion);

        expect(semanticData?.data).toEqual([{ Project: 'Alpha', Amount: 600 }]);
        expect(snapshot.recommendedAnalysisView.excludedRowIndices).toEqual([0, 2]);
    });

    it('still excludes obvious total rows when deterministic structure evidence is stronger than low-confidence model output', () => {
        const snapshot = sanitizeDatasetSemanticSnapshot(
            {
                datasetRole: 'mixed_report',
                rowAnnotations: [
                    { rowIndex: 0, rowRole: 'grand_total', confidence: 0.45, reason: 'Uncertain aggregate row.' },
                ],
                columnAnnotations: [],
                summary: 'Low-confidence aggregate guess.',
            },
            dataset as never,
            'gemini-test',
            datasetVersion,
        );

        const semanticData = resolveSemanticDefaultCsvData(dataset as never, snapshot, datasetVersion);

        expect(semanticData?.data).toEqual([
            { Project: 'Alpha', Amount: 600 },
            { Project: 'Others', Amount: 400 },
        ]);
        expect(snapshot.rowAnnotations).toEqual(expect.arrayContaining([
            expect.objectContaining({ rowIndex: 0, rowRole: 'grand_total' }),
        ]));
    });

    it('does not apply a stale semantic snapshot to a different prepared dataset version', () => {
        const snapshot = sanitizeDatasetSemanticSnapshot(
            {
                datasetRole: 'mixed_report',
                rowAnnotations: [
                    { rowIndex: 0, rowRole: 'grand_total', confidence: 0.95, reason: 'Aggregate row.' },
                ],
                columnAnnotations: [],
                summary: 'Contains one aggregate row.',
            },
            dataset as never,
            'gemini-test',
            datasetVersion,
            [
                { name: 'Project', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
                { name: 'Amount', type: 'numerical', missingPercentage: 0, valueRange: [400, 1000] },
            ] as never,
        );
        const cleanedDataset = {
            fileName: 'projects.csv',
            data: [
                { Project: 'Alpha', Amount: 600 },
                { Project: 'Beta', Amount: 400 },
            ],
        };

        const semanticData = resolveSemanticDefaultCsvData(cleanedDataset as never, snapshot, datasetVersion);

        expect(semanticData).toEqual(cleanedDataset);
    });

    it('formats semantic prompt context with excluded-row evidence', () => {
        const snapshot = sanitizeDatasetSemanticSnapshot(
            {
                datasetRole: 'mixed_report',
                rowAnnotations: [
                    { rowIndex: 0, rowRole: 'grand_total', confidence: 0.95, reason: 'Aggregate row.' },
                ],
                columnAnnotations: [
                    { columnName: 'Project', semanticRole: 'entity', confidence: 0.9, reason: 'Entity label.' },
                    { columnName: 'Amount', semanticRole: 'metric', confidence: 0.95, reason: 'Numeric metric.' },
                ],
                summary: 'Contains one aggregate row.',
            },
            dataset as never,
            'gemini-test',
            datasetVersion,
        );

        const text = formatDatasetSemanticsForPrompt(snapshot, datasetVersion, dataset as never, [
            { name: 'Project', type: 'categorical' },
            { name: 'Amount', type: 'numerical' },
        ] as never);

        expect(text).toContain('Dataset role: mixed_report');
        expect(text).toContain('row 1: grand_total');
        expect(text).toContain('Project: business_entity');
        expect(text).toContain('Amount: metric');
        expect(text).toContain('Header semantics: unknown');
    });

    it('adds deterministic subtotal and metric/code annotations when the model output is incomplete', () => {
        const inferredDataset = {
            fileName: 'statement.csv',
            data: [
                { Code: '1000', Description: 'Alpha', Amount: 100, ReportDate: '2026-03-01' },
                { Code: '1001', Description: 'Subtotal', Amount: 100, ReportDate: '2026-03-01' },
            ],
        };
        const inferredVersion = buildSemanticDatasetVersion(inferredDataset as never);

        const snapshot = sanitizeDatasetSemanticSnapshot(
            {
                datasetRole: 'mixed_report',
                rowAnnotations: [],
                columnAnnotations: [],
                summary: 'Model returned no useful semantic annotations.',
            },
            inferredDataset as never,
            'gemini-test',
            inferredVersion,
            [
                { name: 'Code', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Description', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Amount', type: 'currency', missingPercentage: 0, valueRange: [100, 100] },
                { name: 'ReportDate', type: 'date', uniqueValues: 1, missingPercentage: 0 },
            ] as never,
        );

        expect(snapshot.rowAnnotations).toEqual(expect.arrayContaining([
            expect.objectContaining({ rowIndex: 1, rowRole: 'subtotal' }),
        ]));
        expect(snapshot.recommendedAnalysisView.excludedRowIndices).toEqual([1]);
        expect(snapshot.columnAnnotations).toEqual(expect.arrayContaining([
            expect.objectContaining({ columnName: 'Code', semanticRole: 'code' }),
            expect.objectContaining({ columnName: 'Description', semanticRole: 'descriptor' }),
            expect.objectContaining({ columnName: 'Amount', semanticRole: 'metric' }),
            expect.objectContaining({ columnName: 'ReportDate', semanticRole: 'time_dimension' }),
        ]));
        expect(snapshot.headerSemantics).toEqual(expect.objectContaining({
            reportType: 'unknown',
            confidenceBand: 'low',
        }));
        expect(snapshot.mergedSemanticBoundary).toEqual(expect.objectContaining({
            candidateMetrics: expect.arrayContaining(['Amount']),
        }));
    });

    it('honors explicit RowClass signals when preparing the default semantic dataset', () => {
        const structuredDataset = {
            fileName: 'structured-report.csv',
            data: [
                { Label: 'North Region', Amount: null, RowClass: 'group_header' },
                { Label: 'Alpha', Amount: 120, RowClass: 'fact' },
                { Label: 'Sub Total', Amount: 120, RowClass: 'subtotal' },
            ],
        };
        const structuredVersion = buildSemanticDatasetVersion(structuredDataset as never);

        const snapshot = sanitizeDatasetSemanticSnapshot(
            {
                datasetRole: 'mixed_report',
                rowAnnotations: [],
                columnAnnotations: [],
                summary: 'Prepared dataset already includes explicit row roles.',
            },
            structuredDataset as never,
            'gemini-test',
            structuredVersion,
        );

        const semanticData = resolveSemanticDefaultCsvData(structuredDataset as never, snapshot, structuredVersion);

        expect(snapshot.rowAnnotations).toEqual(expect.arrayContaining([
            expect.objectContaining({ rowIndex: 0, rowRole: 'group_header' }),
            expect.objectContaining({ rowIndex: 2, rowRole: 'subtotal' }),
        ]));
        expect(snapshot.recommendedAnalysisView.excludedRowIndices).toEqual([0, 2]);
        expect(semanticData?.data).toEqual([
            { Label: 'Alpha', Amount: 120, RowClass: 'fact' },
        ]);
    });

    it('classifies helper grains and low-confidence narrative risk for runtime analysis', () => {
        const understanding = buildRuntimeSemanticUnderstanding({
            columns: [
                { name: 'SeriesKey', type: 'categorical', uniqueValues: 10, missingPercentage: 0 },
                { name: 'RowClass', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'ResolvedRowRole', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'HierarchyDepth', type: 'numerical', missingPercentage: 0 },
                { name: 'Value', type: 'numerical', missingPercentage: 0 },
            ] as never,
            analysisBrief: {
                datasetShape: 'generic_table',
                recommendedPath: 'direct_plan',
                targetMetrics: [],
                expectedArtifact: 'table',
                comparisonMode: 'none',
                semanticMetrics: [],
                metricDefinitions: [],
                supportedDerivedMetrics: [],
                grainCandidates: ['SeriesKey', 'RowClass'],
                blockers: [],
                validationIssues: [],
                notes: [],
            },
            reportContextResolution: null,
            datasetSemanticSnapshot: null,
        });

        // SeriesKey is no longer blocked by the fallback regex pattern
        // (only purely structural columns like RowClass/SourceRowIndex are
        // blocked).  Without AI annotations, SeriesKey passes through as a
        // business grain via the no-annotation fallback path.
        expect(understanding.businessGrains).toEqual(['SeriesKey']);
        expect(understanding.helperDimensions).toContain('RowClass');
        expect(understanding.helperDimensions).toContain('ResolvedRowRole');
        expect(understanding.blockedDimensions).toEqual(expect.arrayContaining(['RowClass', 'ResolvedRowRole']));
        expect(understanding.candidateMetrics).toEqual(['Value']);
        expect(understanding.businessGrainConfidence).toBe('medium');
        expect(understanding.unsafeForBusinessNarrative).toBe(false);
    });

    it('fallback-promoted helper grains set fallbackPromotedGrains and do not trigger unsafeForBusinessNarrative', () => {
        // The only dimension column is classified as helper_dimension by AI role
        // (without isBusinessSafe: false, so it's eligible for fallback promotion).
        // No business grains exist initially → fallback should promote Description
        // and set fallbackPromotedGrains = true, unsafeForBusinessNarrative = false.
        const understanding = buildRuntimeSemanticUnderstanding({
            columns: [
                { name: 'Description', type: 'categorical', uniqueValues: 10, missingPercentage: 0 },
                { name: 'Amount', type: 'numerical', missingPercentage: 0 },
            ] as never,
            analysisBrief: null,
            reportContextResolution: null,
            datasetSemanticSnapshot: {
                datasetRole: 'detail_table',
                rowAnnotations: [],
                columnAnnotations: [
                    { columnName: 'Description', semanticRole: 'helper_dimension', confidence: 0.8, reason: 'AI classified as helper dimension.' },
                    { columnName: 'Amount', semanticRole: 'metric', confidence: 0.9, reason: 'Numeric metric.' },
                ],
                summary: 'All dimensions annotated as helpers.',
                recommendedAnalysisView: { excludedRowCount: 0, excludedRowIndices: [] },
                headerSemantics: { reportType: 'unknown', reportTitle: null, businessTerminology: [], confidenceBand: 'low' },
                modelId: 'test',
                datasetVersion: 'test-v',
            } as never,
        });

        // Description should be fallback-promoted from helper to business grain
        expect(understanding.businessGrains).toContain('Description');
        expect(understanding.helperDimensions).toContain('Description');
        expect(understanding.fallbackPromotedGrains).toBe(true);
        expect(understanding.unsafeForBusinessNarrative).toBe(false);
        // Fallback-promoted grains get 'medium' confidence, not 'low'
        expect(understanding.businessGrainConfidence).toBe('medium');
    });

    describe('Phase 5 — AI-first report type and fallback annotation', () => {
        it('uses AI-provided reportType when present (AI-first path)', () => {
            const dataset = {
                fileName: 'test.csv',
                data: [{ Project: 'A', Amount: 1000 }],
            };
            const datasetVersion = buildSemanticDatasetVersion(dataset as never);

            const snapshot = sanitizeDatasetSemanticSnapshot(
                {
                    datasetRole: 'summary_report',
                    rowAnnotations: [],
                    columnAnnotations: [],
                    headerSemantics: makeDatasetHeaderSemantics({
                        reportTitle: 'Project Budget',
                        reportType: 'project_report',
                        headerConfidence: 0.9,
                    }),
                    summary: 'AI classified as project report.',
                },
                dataset as never,
                'test-model',
                datasetVersion,
            );

            // AI-provided reportType should be used, not regex fallback.
            expect(snapshot.headerSemantics.reportType).toBe('project_report');
        });

        it('falls back to inferFallbackReportType when AI reportType is absent', () => {
            const dataset = {
                fileName: 'income-statement.csv',
                data: [{ Account: 'Revenue', Amount: 5000 }],
            };
            const datasetVersion = buildSemanticDatasetVersion(dataset as never);

            const snapshot = sanitizeDatasetSemanticSnapshot(
                {
                    datasetRole: 'summary_report',
                    rowAnnotations: [],
                    columnAnnotations: [],
                    headerSemantics: makeDatasetHeaderSemantics({
                        reportTitle: 'Income Statement FY2025',
                        // reportType intentionally omitted — fallback should kick in.
                        headerConfidence: 0.7,
                    }),
                    summary: 'Financial statement without AI reportType.',
                },
                dataset as never,
                'test-model',
                datasetVersion,
            );

            // Fallback should detect "Income Statement" via FINANCIAL_REPORT_PATTERN.
            expect(snapshot.headerSemantics.reportType).toBe('financial_statement');
        });
    });
});
