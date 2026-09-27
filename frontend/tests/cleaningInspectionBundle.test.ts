import { describe, expect, it } from 'vitest';
import type { AppStore } from '../store/useAppStore';
import { buildCleaningInspectionBundle } from '../services/agent/buildCleaningInspectionBundle';
import { buildDataPreparationWorkflowBundle } from '../services/agent/buildDataPreparationWorkflowBundle';
import { buildWorkspaceBundle } from '../services/agent/buildWorkspaceBundle';
import { buildCsvDataFromRawRows } from '../services/data/reportCsvIntake';
import { createMalformedQuoteWeakSignalReportIntakeCase } from './reportShapeFixtures/cases';

const createBaseState = (): AppStore => ({
    sessionId: 'session-1',
    currentView: 'analysis_dashboard',
    currentDatasetId: 'dataset-1',
    csvData: {
        fileName: 'sales.csv',
        data: [
            { Region: 'East', Revenue: 1200 },
            { Region: 'West', Revenue: 900 },
        ],
        metadataRows: [['Report', 'FY2026']],
        summaryRows: [{ Region: 'Total', Revenue: 2100 }],
        headerDepth: 2,
    },
    rawCsvData: {
        fileName: 'sales.csv',
        data: [
            { Region: 'East', Revenue: '1,200' },
            { Region: 'West', Revenue: '900' },
            { Region: 'South', Revenue: '0' },
        ],
        metadataRows: [['Report', 'FY2026']],
        summaryRows: [{ Region: 'Total', Revenue: '2,100' }],
        headerDepth: 2,
        intakeDetection: {
            strategy: 'scored_candidate',
            confidence: 'medium',
            delimiter: ',',
            quoteChar: null,
            warnings: [
                {
                    code: 'low_confidence',
                    message: 'CSV dialect detection confidence is limited, so the imported structure should be reviewed in diagnostics.',
                },
            ],
        },
    },
    rawIntakeIr: {
        fileName: 'sales.csv',
        columnCount: 2,
        rawRows: [
            ['Report', 'FY2026'],
            ['Region', 'Revenue'],
            ['Region', 'Revenue'],
            ['East', '1,200'],
            ['West', '900'],
            ['Total', '2,100'],
        ],
        normalizedRows: [
            ['Report', 'FY2026'],
            ['Region', 'Revenue'],
            ['Region', 'Revenue'],
            ['East', '1,200'],
            ['West', '900'],
            ['Total', '2,100'],
        ],
        detection: {
            strategy: 'scored_candidate',
            confidence: 'medium',
            delimiter: ',',
            quoteChar: null,
            warnings: [
                {
                    code: 'low_confidence',
                    message: 'CSV dialect detection confidence is limited, so the imported structure should be reviewed in diagnostics.',
                },
            ],
        },
        segments: [
            { kind: 'metadata', rowStart: 0, rowEnd: 0, confidence: 0.8, notes: [] },
            { kind: 'repeated_header', rowStart: 1, rowEnd: 1, confidence: 0.9, notes: [] },
            { kind: 'header', rowStart: 2, rowEnd: 2, confidence: 0.95, notes: [] },
            { kind: 'body', rowStart: 3, rowEnd: 4, confidence: 0.9, notes: [] },
            { kind: 'summary', rowStart: 5, rowEnd: 5, confidence: 0.8, notes: [] },
        ],
        provisionalTable: {
            headerRowIndex: 2,
            headerLayerRowIndexes: [],
            bodyStartIndex: 3,
            summaryStartIndex: 5,
            repeatedHeaderRowIndexes: [1],
            metadataRowIndexes: [0, 1],
            parameterRowIndexes: [],
        },
        diagnostics: {
            hasRepeatedHeader: true,
            hasParameterRowsBetweenHeaderAndBody: false,
            headerShapeDrift: false,
            singleColumnFallbackApplied: false,
            bodyEvidenceKind: 'numeric',
            segmentCountsByKind: {
                metadata: 1,
                repeated_header: 1,
                header: 1,
                body: 1,
                summary: 1,
            },
            headerCandidates: [],
            bodyStartCandidates: [],
            evidenceStrength: 'moderate',
            fallbackReason: null,
            autoNamedColumns: [
                { from: '_unnamed_column_1', to: 'RowNumber', reason: 'sequence_like_row_number' },
            ],
        },
    },
    columnProfiles: [
        { name: 'Region', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
        { name: 'Revenue', type: 'numerical', missingPercentage: 0, valueRange: [900, 1200] },
    ],
    dataPreparationPlan: {
        explanation: 'Converted revenue to numbers and removed empty rows.',
        operations: [
            {
                id: 'op-filter-region',
                type: 'filter_rows',
                reason: 'Remove South region rows before analysis.',
                predicates: [{ column: 'Region', operator: 'neq', value: 'South' }],
            },
        ],
        outputColumns: [
            { name: 'Region', type: 'categorical' },
            { name: 'Revenue', type: 'numerical' },
        ],
        planStatus: 'operations',
        consistencyIssues: [],
        normalizedPlaceholderColumns: ['Region'],
        numericStringNormalizedColumns: ['Revenue'],
    },
    initialDataSample: [
        { Region: 'East', Revenue: '1,200' },
        { Region: 'West', Revenue: '900' },
    ],
    dataQualityIssues: [
        'Column "Notes" has a high percentage of missing values.',
        'Column "Notes" has a high percentage of missing values.',
    ],
    agentEvents: [
        {
            id: 'e1',
            timestamp: new Date('2026-03-10T00:00:00.000Z'),
            phase: 'file',
            step: 'schema_snapshot_before',
            status: 'done',
            message: 'Captured schema',
            detail: {
                schema: [
                    { name: 'Region', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
                    { name: 'Revenue', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
                ],
            },
        },
        {
            id: 'e2',
            timestamp: new Date('2026-03-10T00:00:01.000Z'),
            phase: 'profiling',
            step: 'profiling_complete',
            status: 'done',
            message: 'Profiled columns',
            detail: {
                issues: ['Column "Notes" has a high percentage of missing values.'],
            },
        },
        {
            id: 'e3',
            timestamp: new Date('2026-03-10T00:00:02.000Z'),
            phase: 'profiling',
            step: 'column_evaluation',
            status: 'done',
            message: 'Evaluated columns',
            detail: {
                keepColumns: [{ name: 'Region', role: 'dimension' }],
                dropColumns: [{ name: 'Notes', reason: 'mostly empty', role: 'noise', isConstant: false, removeFromDataset: false }],
            },
        },
        {
            id: 'e4',
            timestamp: new Date('2026-03-10T00:00:03.000Z'),
            phase: 'profiling',
            step: 'schema_snapshot_after',
            status: 'done',
            message: 'Updated schema',
            detail: {
                schema: [
                    { name: 'Region', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                    { name: 'Revenue', type: 'numerical', uniqueValues: undefined, missingPercentage: 0 },
                ],
            },
        },
    ] as AppStore['agentEvents'],
    agentToolLogs: [
        {
            id: 'tool-1',
            timestamp: new Date('2026-03-10T00:00:04.000Z'),
            tool: 'context_manager',
            description: 'Prepared data_prep context',
            detail: { callType: 'data_prep', estimatedPromptTokens: 1200 },
        },
    ],
    telemetryEvents: [
        {
            id: 't1',
            provider: 'google',
            stage: 'context_prepared',
            responseType: 'data_prep',
            detail: 'context_prepared | data_prep | 1200/5000 tokens',
            meta: {
                callType: 'data_prep',
                estimatedPromptTokens: 1200,
                budget: 5000,
            },
            timestamp: new Date('2026-03-10T00:00:04.000Z'),
        },
    ],
    spreadsheetFilterFunction: {
        id: 'filter-east',
        type: 'filter_rows',
        reason: 'Inspect only East region rows in explorer.',
        predicates: [{ column: 'Region', operator: 'eq', value: 'East' }],
    },
    activeSpreadsheetFilter: {
        requestId: 'spreadsheet-filter-east',
        origin: 'spreadsheet_panel',
        query: 'show East rows',
        operation: {
            id: 'filter-east',
            type: 'filter_rows',
            reason: 'Inspect only East region rows in explorer.',
            predicates: [{ column: 'Region', operator: 'eq', value: 'East' }],
        },
        observation: {
            selectedColumn: 'Region',
            operator: 'eq',
            value: 'East',
            matchedRowCount: 1,
            previewRows: [{ Region: 'East', Revenue: 1200 }],
        },
        finalReply: 'I applied a temporary data filter in the raw data explorer for rows where Region equals "East". It matched 1 row.',
        appliedAt: new Date('2026-03-10T00:00:04.500Z'),
    },
    aiFilterExplanation: 'I applied a temporary data filter in the raw data explorer for rows where Region equals "East". It matched 1 row.',
    activeDataQuery: {
        explanation: 'Show East rows sorted by revenue.',
        plan: {
            select: ['Region', 'Revenue'],
            where: {
                predicates: [{ column: 'Region', operator: 'eq', value: 'East' }],
            },
            orderBy: [{ column: 'Revenue', direction: 'desc' }],
            limit: 10,
        },
        result: {
            rows: [{ Region: 'East', Revenue: 1200 }],
            totalMatchedRows: 1,
            returnedRows: 1,
            truncated: false,
            selectedColumns: ['Region', 'Revenue'],
            appliedOrderBy: [{ column: 'Revenue', direction: 'desc' }],
            appliedLimit: 10,
            durationMs: 12,
        },
        appliedAt: new Date('2026-03-10T00:00:05.000Z'),
        source: 'execute_data_query',
        engine: 'duckdb',
        sqlPreview: 'SELECT "Region", "Revenue" FROM "session_clean_dataset"',
        tableName: 'session_clean_dataset',
        loadVersion: 'dataset-1',
        fallbackReason: null,
        fallbackFilterOperation: null,
    },
    analysisCards: [],
    chatHistory: [],
    finalSummary: null,
    settings: {
        provider: 'google',
        geminiApiKey: 'key',
        openAIApiKey: '',
        simpleModel: 'gemini-3-flash-preview',
        complexModel: 'gemini-3-flash-preview',
        language: 'English',
        autoConfirmGoal: true,
    },
} as unknown as AppStore);

describe('buildCleaningInspectionBundle', () => {
    it('includes full pipeline facts, bounded samples, and data-prep context diagnostics', () => {
        const bundle = buildCleaningInspectionBundle(createBaseState());

        expect(bundle.importFacts.fileName).toBe('sales.csv');
        expect(bundle.importFacts.rawRowCount).toBe(3);
        expect(bundle.importFacts.cleanedRowCount).toBe(2);
        expect(bundle.importFacts.parserStrategy).toBe('scored_candidate');
        expect(bundle.importFacts.parserConfidence).toBe('medium');
        expect(bundle.importFacts.detectedDelimiter).toBe(',');
        expect(bundle.importFacts.detectedQuoteChar).toBeNull();
        expect(bundle.importFacts.parserWarnings).toHaveLength(1);
        expect(bundle.intakeDiagnostics.available).toBe(true);
        expect(bundle.intakeDiagnostics.fileName).toBe('sales.csv');
        expect(bundle.intakeDiagnostics.strategy).toBe('scored_candidate');
        expect(bundle.intakeDiagnostics.confidence).toBe('medium');
        expect(bundle.intakeDiagnostics.delimiter).toBe(',');
        expect(bundle.intakeDiagnostics.quoteChar).toBeNull();
        expect(bundle.intakeDiagnostics.rawRowCount).toBe(3);
        expect(bundle.intakeDiagnostics.cleanedRowCount).toBe(2);
        expect(bundle.intakeDiagnostics.metadataRowCount).toBe(1);
        expect(bundle.intakeDiagnostics.headerDepth).toBe(2);
        expect(bundle.intakeDiagnostics.summaryRowCount).toBe(1);
        expect(bundle.intakeDiagnostics.selectedHeaderRowIndex).toBe(2);
        expect(bundle.intakeDiagnostics.bodyStartIndex).toBe(3);
        expect(bundle.intakeDiagnostics.summaryStartIndex).toBe(5);
        expect(bundle.intakeDiagnostics.parameterRowCount).toBe(0);
        expect(bundle.intakeDiagnostics.repeatedHeaderRowCount).toBe(1);
        expect(bundle.intakeDiagnostics.segmentCountsByKind.repeated_header).toBe(1);
        expect(bundle.intakeDiagnostics.singleColumnFallbackApplied).toBe(false);
        expect(bundle.intakeDiagnostics.bodyEvidenceKind).toBe('numeric');
        expect(bundle.intakeDiagnostics.aiBoundaryAccepted).toBeNull();
        expect(bundle.intakeDiagnostics.importNormalizationApplied).toBe(false);
        expect(bundle.intakeDiagnostics.importNormalizationSummary).toBeNull();
        expect(bundle.intakeDiagnostics.autoNamedColumns).toEqual([
            { from: '_unnamed_column_1', to: 'RowNumber', reason: 'sequence_like_row_number' },
        ]);
        expect(bundle.intakeDiagnostics.warnings).toHaveLength(1);
        expect(bundle.intakeDiagnostics.warnings[0]?.code).toBe('low_confidence');
        // IR-first cleaning gate diagnostics
        expect(bundle.intakeDiagnostics.irStableSingleLayerDetail).toBe(false);
        expect(bundle.intakeDiagnostics.irAllowsDeterministicCleanup).toBe(true);
        expect(bundle.intakeDiagnostics.irAllowsDeterministicReshape).toBe(true);
        expect(bundle.intakeDiagnostics.irRequiresInspectFirst).toBe(false);
        expect(bundle.intakeDiagnostics.irRoutingReason).toContain('repeated header');
        expect(bundle.cleaning.status).toBe('operations');
        expect(bundle.cleaning.planStatus).toBe('operations');
        expect(bundle.cleaning.operationCount).toBe(1);
        expect(bundle.cleaning.normalizedPlaceholderColumns).toEqual(['Region']);
        expect(bundle.cleaning.numericStringNormalizedColumns).toEqual(['Revenue']);
        expect(bundle.cleaning.baselineNoiseRowsRemoved).toBe(0);
        expect(bundle.verification.datasetSafetyStatus).toBe('passed');
        expect(bundle.verification.cleaningConsistencyStatus).toBe('passed');
        expect(bundle.verification.overallStatus).toBe('passed');
        expect(bundle.spreadsheetFilter.active).toBe(true);
        expect(bundle.spreadsheetFilter.requestId).toBe('spreadsheet-filter-east');
        expect(bundle.spreadsheetFilter.finalReply).toContain('matched 1 row');
        expect(bundle.spreadsheetFilter.observation?.matchedRowCount).toBe(1);
        expect(bundle.spreadsheetFilter.operation?.type).toBe('filter_rows');
        expect(bundle.dataQuery.active).toBe(true);
        expect(bundle.dataQuery.engine).toBe('duckdb');
        expect(bundle.dataQuery.sqlPreview).toContain('SELECT');
        expect(bundle.dataQuery.returnedRows).toBe(1);
        expect(bundle.dataQuery.selectedColumns).toEqual(['Region', 'Revenue']);
        expect(bundle.cleaning.contextDiagnostics).toHaveLength(1);
        expect(bundle.cleaning.contextDiagnostics[0].responseType).toBe('data_prep');
        expect(bundle.profiling.originalSchema).toHaveLength(2);
        expect(bundle.profiling.outputSchema).toHaveLength(2);
        expect(bundle.reportShape.profile?.primaryKind).toBe('already_tabular');
        expect(bundle.reportShape.hypotheses[0]?.targetShape).toBe('row_table');
        expect(bundle.cleaning.outputColumns).toHaveLength(2);
        expect(bundle.cleaning.outputColumns[1].type).toBe('numerical');
        expect(bundle.profiling.columnEvaluation.dropColumns[0].name).toBe('Notes');
        expect(bundle.samples.rawSample.rows).toHaveLength(3);
        expect(bundle.verification.warnings).toEqual(['Column "Notes" has a high percentage of missing values.']);
        expect(bundle.verification.shapeVerification?.overallStatus).toBe('pass');
        expect(bundle.verification.shapeFailureSignalKey).toBeNull();
        expect(bundle.verification.shapeFailureDetail).toBeNull();
        expect(bundle.verification.downstreamAnalysisBlocked).toBe(false);
        expect(bundle.logs.pipeline[0].step).toBe('schema_snapshot_before');
    });

    it('returns a stable intake diagnostics object when detection metadata is missing', () => {
        const state = createBaseState();
        if (state.rawCsvData) {
            delete state.rawCsvData.intakeDetection;
        }

        const bundle = buildCleaningInspectionBundle(state);

        expect(bundle.intakeDiagnostics.available).toBe(false);
        expect(bundle.intakeDiagnostics.fileName).toBe('sales.csv');
        expect(bundle.intakeDiagnostics.strategy).toBeNull();
        expect(bundle.intakeDiagnostics.confidence).toBeNull();
        expect(bundle.intakeDiagnostics.delimiter).toBeNull();
        expect(bundle.intakeDiagnostics.quoteChar).toBeNull();
        expect(bundle.intakeDiagnostics.warnings).toEqual([]);
        expect(bundle.intakeDiagnostics.rawRowCount).toBe(3);
        expect(bundle.intakeDiagnostics.cleanedRowCount).toBe(2);
        expect(bundle.intakeDiagnostics.metadataRowCount).toBe(1);
        expect(bundle.intakeDiagnostics.headerDepth).toBe(2);
        expect(bundle.intakeDiagnostics.summaryRowCount).toBe(1);
    });

    it('marks verification failure when the cleaned dataset becomes empty', () => {
        const state = createBaseState();
        state.csvData = { ...state.csvData!, data: [] };

        const bundle = buildCleaningInspectionBundle(state);

        expect(bundle.verification.emptyDatasetGuardPassed).toBe(false);
        expect(bundle.verification.datasetSafetyStatus).toBe('failed');
        expect(bundle.verification.overallStatus).toBe('failed');
        expect(bundle.verification.failedChecks).toContain('Dataset is empty after cleaning.');
    });

    it('surfaces wide-crosstab persistence as an advisory signal without blocking verification', () => {
        const state = createBaseState();
        state.rawCsvData = {
            fileName: 'wide.csv',
            data: [
                { Code: 'Code', Description: 'Description', 10000: '10000', 10001: '10001', 10002: '10002', 10003: '10003', 10004: '10004', 10005: '10005', 10006: '10006', 10007: '10007', 10008: '10008', Total: 'Total' },
                { Code: '', Description: '', 10000: 'Project 1', 10001: 'Project 2', 10002: 'Project 3', 10003: 'Project 4', 10004: 'Project 5', 10005: 'Project 6', 10006: 'Project 7', 10007: 'Project 8', 10008: 'Project 9', Total: '' },
                { Code: '501001', Description: 'Revenue', 10000: '10.00', 10001: '0.00', 10002: '0.00', 10003: '0.00', 10004: '0.00', 10005: '0.00', 10006: '0.00', 10007: '0.00', 10008: '0.00', Total: '10.00' },
            ],
            metadataRows: [],
            summaryRows: [],
            headerDepth: 1,
        };
        state.csvData = {
            fileName: 'wide.csv',
            data: [
                { Code: '501001', Description: 'Revenue', 10000: '10.00', 10001: '0.00', 10002: '0.00', 10003: '0.00', 10004: '0.00', 10005: '0.00', 10006: '0.00', 10007: '0.00', 10008: '0.00', Total: '10.00' },
            ],
            metadataRows: [],
            summaryRows: [],
            headerDepth: 1,
        };

        const bundle = buildCleaningInspectionBundle(state);

        // AGENT-310: wide_crosstab_persistence is advisory, not blocking — the AI
        // decides at runtime whether to reshape, so verification must still pass.
        expect(bundle.verification.datasetSafetyStatus).toBe('passed');
        expect(bundle.verification.overallStatus).toBe('passed');
        expect(bundle.verification.downstreamAnalysisBlocked).toBe(false);
        expect(bundle.verification.failedChecks).not.toContain(
            'The cleaned dataset still looks like a wide crosstab.',
        );

        const wideSignal = bundle.verification.shapeVerification.signals.find(
            signal => signal.key === 'wide_crosstab_persistence',
        );
        expect(wideSignal?.status).toBe('fail');
        expect(bundle.verification.shapeVerification.blockingSignalKeys).not.toContain('wide_crosstab_persistence');
    });

    it('surfaces shape verification signal details for label-layer failures', () => {
        const state = createBaseState();
        state.rawCsvData = {
            fileName: 'matrix.csv',
            data: [
                { c1: 'Code', c2: 'Description', c3: '31000', c4: '31001', c5: '31002', c6: '31003', c7: 'Total' },
                { c1: '', c2: '', c3: 'North', c4: 'North', c5: 'South', c6: 'South', c7: '' },
                { c1: '', c2: '', c3: 'Alpha', c4: 'Beta', c5: 'Gamma', c6: 'Delta', c7: '' },
                { c1: '9010', c2: 'Revenue', c3: '120.00', c4: '130.00', c5: '140.00', c6: '150.00', c7: '540.00' },
            ],
            metadataRows: [],
            summaryRows: [],
            headerLayers: [],
            headerDepth: 1,
        };
        state.csvData = {
            fileName: 'matrix-cleaned.csv',
            data: [
                { Code: '9010', Description: 'Revenue', SeriesKey: '31000', SeriesLabelL1: 'North', Value: '120.00', SourceRowIndex: 0, SourceColumnName: '31000' },
                { Code: '9010', Description: 'Revenue', SeriesKey: '31001', SeriesLabelL1: 'South', Value: '130.00', SourceRowIndex: 0, SourceColumnName: '31001' },
                { Code: '9010', Description: 'Revenue', SeriesKey: '31002', SeriesLabelL1: 'South', Value: '140.00', SourceRowIndex: 0, SourceColumnName: '31002' },
                { Code: '9010', Description: 'Revenue', SeriesKey: '31003', SeriesLabelL1: 'South', Value: '150.00', SourceRowIndex: 0, SourceColumnName: '31003' },
            ],
            metadataRows: [],
            summaryRows: [],
            headerLayers: [],
            headerDepth: 1,
        };
        state.columnProfiles = [
            { name: 'Code', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
            { name: 'Description', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
            { name: 'SeriesKey', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'SeriesLabelL1', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Value', type: 'numerical', missingPercentage: 0, valueRange: [120, 130] },
            { name: 'SourceRowIndex', type: 'numerical', missingPercentage: 0, valueRange: [0, 0] },
            { name: 'SourceColumnName', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
        ];
        state.dataPreparationPlan = {
            explanation: 'Unpivot project series.',
            operations: [
                {
                    id: 'reshape',
                    type: 'unpivot_columns',
                    reason: 'Convert wide matrix into long rows.',
                    sourceColumns: ['31000', '31001', '31002', '31003'],
                    keyColumn: 'SeriesKey',
                    valueColumn: 'Value',
                    keepColumns: ['Code', 'Description'],
                    labelColumns: [
                        {
                            outputColumn: 'SeriesLabelL1',
                            mappings: [
                                { sourceColumn: '31000', label: 'North' },
                                { sourceColumn: '31001', label: 'South' },
                                { sourceColumn: '31002', label: 'South' },
                                { sourceColumn: '31003', label: 'South' },
                            ],
                        },
                    ],
                    sourceColumnNameColumn: 'SourceColumnName',
                    sourceRowIndexColumn: 'SourceRowIndex',
                },
            ],
            outputColumns: state.columnProfiles,
            planStatus: 'operations',
            consistencyIssues: [],
        };

        const bundle = buildCleaningInspectionBundle(state);

        expect(bundle.verification.shapeFailureSignalKey).toBe('label_layer_retention_complete');
        expect(bundle.verification.shapeFailureDetail).toContain('expected_label_layers=2');
        expect(bundle.verification.shapeFailureDetail).toContain('actual_label_layers=1');
    });

    it('reports inconsistent schema-only plans and baseline noise-row removals', () => {
        const state = createBaseState();
        state.dataPreparationPlan = {
            explanation: 'Removed junk rows and casted values.',
            operations: [],
            outputColumns: [
                { name: 'Region', type: 'categorical' },
                { name: 'Revenue', type: 'numerical' },
            ],
            planStatus: 'inconsistent',
            consistencyIssues: ['Schema-only plan explanation claims executed mutations despite having zero operations.'],
        };
        state.agentEvents = [
            ...state.agentEvents,
            {
                id: 'e5',
                timestamp: new Date('2026-03-10T00:00:02.500Z'),
                phase: 'profiling',
                step: 'baseline_noise_rows_removed',
                status: 'done',
                message: 'Removed deterministic body-noise rows.',
                detail: { removedRowCount: 2 },
            },
        ] as AppStore['agentEvents'];

        const bundle = buildCleaningInspectionBundle(state);

        expect(bundle.cleaning.status).toBe('inconsistent');
        expect(bundle.cleaning.planStatus).toBe('inconsistent');
        expect(bundle.cleaning.consistencyIssues).toContain('Schema-only plan explanation claims executed mutations despite having zero operations.');
        expect(bundle.cleaning.baselineNoiseRowsRemoved).toBe(2);
        expect(bundle.verification.datasetSafetyStatus).toBe('passed');
        expect(bundle.verification.cleaningConsistencyStatus).toBe('degraded');
        expect(bundle.verification.overallStatus).toBe('passed');
        expect(bundle.verification.downstreamAnalysisBlocked).toBe(false);
    });

    it('uses canonical schema counts in the workspace summary instead of sample-column counts', () => {
        const state = createBaseState();
        state.initialDataSample = [{ Region: 'East' }];

        const workspace = buildWorkspaceBundle(state);

        expect(workspace.summary.rawColumnCount).toBe(2);
        expect(workspace.summary.cleanedColumnCount).toBe(2);
    });

    it('derives the raw sample from rawCsvData instead of a stale initialDataSample', () => {
        const state = createBaseState();
        state.initialDataSample = [{ Region: 'Only stale sample' }];

        const bundle = buildCleaningInspectionBundle(state);

        expect(bundle.samples.rawSample.totalRows).toBe(3);
        expect(bundle.samples.rawSample.rows[0]).toEqual({ Region: 'East', Revenue: '1,200' });
        expect(bundle.samples.rawSample.rows.some(row => row.Region === 'Only stale sample')).toBe(false);
    });

    it('builds a dashboard workflow summary and keeps workspace status aligned', () => {
        const state = createBaseState();
        state.dataPreparationPlan = {
            explanation: 'Removed junk rows and casted values.',
            operations: [],
            outputColumns: [
                { name: 'Region', type: 'categorical' },
                { name: 'Revenue', type: 'numerical' },
            ],
            planStatus: 'inconsistent',
            consistencyIssues: ['Schema-only plan explanation claims executed mutations despite having zero operations.'],
        };

        const workflow = buildDataPreparationWorkflowBundle(state);
        const workspace = buildWorkspaceBundle(state);

        // Inconsistent plans degrade gracefully — analysis proceeds with baseline data
        expect(workflow.summary.preparationState).toBe('baseline_prepared');
        expect(workflow.summary.parserStrategy).toBe('scored_candidate');
        expect(workflow.summary.parserConfidence).toBe('medium');
        expect(workflow.summary.intakeGateStatus).toBe('warning');
        expect(workflow.summary.intakeGateMessage).toBe('File imported, but structure confidence is limited.');
        expect(workflow.summary.parserWarnings[0]).toContain('CSV dialect detection confidence is limited');
        expect(workflow.steps.find(step => step.id === 'analyze')?.status).not.toBe('blocked');
        expect(workflow.preparation.badgeLabel).toBe('Baseline Prepared');
        expect(workspace.summary.preparationState).toBe('baseline_prepared');
        expect(workspace.summary.overallStatus).toBe('passed');
        expect(workspace.summary.analysisState).toBe('not_started');
        expect(workspace.files.find(file => file.path === '/cleaning/session-summary.json')).toBeTruthy();
        expect(workspace.files.find(file => file.path === '/cleaning/intake-diagnostics.json')).toBeTruthy();
        expect(workspace.files.find(file => file.path === '/cleaning/report-shape.json')).toBeTruthy();
        expect(workspace.files.find(file => file.path === '/cleaning/reshape-hypotheses.json')).toBeTruthy();
        expect(workspace.files.find(file => file.path === '/cleaning/verification-signals.json')).toBeTruthy();
    });

    it('surfaces SQL precheck blockers in the workflow bundle and blocks automatic analysis', () => {
        const state = createBaseState();
        state.dataPreparationPlan = {
            ...state.dataPreparationPlan!,
            sqlPrecheck: {
                status: 'blocked',
                summary: '2 blocking SQL precheck issues detected after AI cleaning.',
                findings: [
                    {
                        kind: 'constant_metric',
                        severity: 'block',
                        metric: 'Revenue',
                        column: 'Revenue',
                        message: 'Metric "Revenue" has only one distinct numeric value, so it does not support comparative analysis.',
                    },
                    {
                        kind: 'flat_grouped_metric',
                        severity: 'block',
                        metric: 'Revenue',
                        dimension: 'Region',
                        message: 'Grouped metric "Revenue" by "Region" is flat after cleaning and fails the SQL precheck.',
                    },
                ],
            },
        };

        const bundle = buildCleaningInspectionBundle(state);
        const workflow = buildDataPreparationWorkflowBundle(state);

        expect(bundle.verification.sqlPrecheckStatus).toBe('blocked');
        expect(bundle.verification.sqlPrecheckBlockingFindings).toHaveLength(2);
        // SQL precheck blockers degrade gracefully — analysis is not blocked,
        // the pipeline proceeds with categorical/count-based views instead.
        expect(workflow.summary.analysisState).toBe('not_started');
        expect(workflow.summary.canAnalyze).toBe(true);
        expect(workflow.issueSummary.mappings.some(mapping => mapping.issue.includes('blocking SQL precheck issues'))).toBe(true);
    });

    it('blocks automatic analysis when intake diagnostics report parser errors', () => {
        const state = createBaseState();
        if (state.rawCsvData?.intakeDetection) {
            state.rawCsvData.intakeDetection = {
                ...state.rawCsvData.intakeDetection,
                confidence: 'low',
                warnings: [
                    {
                        code: 'parse_errors',
                        message: 'Parser reported 2 issues while evaluating the selected CSV dialect.',
                    },
                ],
            };
        }

        const workflow = buildDataPreparationWorkflowBundle(state);

        expect(workflow.summary.intakeGateStatus).toBe('blocked');
        expect(workflow.summary.intakeGateMessage).toContain('Automatic analysis is paused');
        expect(workflow.summary.canAnalyze).toBe(false);
        expect(workflow.summary.analysisState).toBe('blocked');
        expect(workflow.steps.find(step => step.id === 'inspect')?.status).toBe('warning');
        expect(workflow.steps.find(step => step.id === 'verify')?.status).toBe('blocked');
        expect(workflow.steps.find(step => step.id === 'analyze')?.status).toBe('blocked');
        expect(workflow.preparation.blockedMessage).toContain('Automatic analysis is paused');
        expect(workflow.cta.primaryLabel).toBe('Open Workspace Artifacts');
    });

    it('reuses malformed-quote report fixtures when surfacing blocked intake workflow state', () => {
        const state = createBaseState();
        const fixture = createMalformedQuoteWeakSignalReportIntakeCase();
        const parsedData = buildCsvDataFromRawRows(fixture.fileName, fixture.rawRows, fixture.detection);
        state.rawCsvData = parsedData;
        state.csvData = parsedData;
        state.columnProfiles = [
            { name: 'Code', type: 'categorical', uniqueValues: 6, missingPercentage: 0 },
            { name: 'Description', type: 'categorical', uniqueValues: 6, missingPercentage: 0 },
            { name: '22000', type: 'numerical', missingPercentage: 0, valueRange: [70, 150] },
            { name: '22001', type: 'numerical', missingPercentage: 0, valueRange: [65, 120] },
            { name: '22002', type: 'numerical', missingPercentage: 0, valueRange: [75, 115] },
            { name: 'Grand Total', type: 'numerical', missingPercentage: 0, valueRange: [210, 380] },
        ];

        const bundle = buildCleaningInspectionBundle(state);
        const workflow = buildDataPreparationWorkflowBundle(state);

        expect(bundle.intakeDiagnostics.warnings.map(warning => warning.code)).toEqual(fixture.expectedWarningCodes);
        expect(workflow.summary.intakeGateStatus).toBe(fixture.expectedIntakeGateStatus);
        expect(workflow.summary.canAnalyze).toBe(false);
        expect(workflow.summary.intakeGateMessage).toContain('Automatic analysis is paused');
        expect(workflow.issueSummary.mappings.some(mapping =>
            mapping.issue.includes('parser errors') || mapping.issue.includes('malformed quoted fields'),
        )).toBe(true);
    });

    it('blocks automatic analysis when intake diagnostics report header drift', () => {
        const state = createBaseState();
        if (state.rawCsvData?.intakeDetection) {
            state.rawCsvData.intakeDetection = {
                ...state.rawCsvData.intakeDetection,
                confidence: 'medium',
                warnings: [
                    {
                        code: 'header_shape_drift',
                        message: 'Header width drifts from body rows near the detected table boundary.',
                    },
                ],
            };
        }

        const workflow = buildDataPreparationWorkflowBundle(state);

        expect(workflow.summary.intakeGateStatus).toBe('blocked');
        expect(workflow.steps.find(step => step.id === 'verify')?.description).toContain('Header/body structure drift was detected.');
        expect(workflow.steps.find(step => step.id === 'analyze')?.description).toContain('Automatic analysis is paused');
        expect(workflow.issueSummary.mappings.some(mapping => mapping.issue.includes('header/body drift'))).toBe(true);
        expect(workflow.cta.primaryLabel).toBe('Open Workspace Artifacts');
    });

    it('blocks automatic analysis when a report-like dataset is imported with fallback low-confidence structure', () => {
        const state = createBaseState();
        if (state.rawCsvData?.intakeDetection) {
            state.rawCsvData.intakeDetection = {
                ...state.rawCsvData.intakeDetection,
                strategy: 'papaparse_auto_fallback',
                confidence: 'low',
                warnings: [
                    {
                        code: 'low_confidence',
                        message: 'CSV parsing fell back to PapaParse auto-detection because scored dialect selection was inconclusive.',
                    },
                ],
            };
        }

        const workflow = buildDataPreparationWorkflowBundle(state);

        expect(workflow.summary.intakeGateStatus).toBe('blocked');
        expect(workflow.summary.intakeGateMessage).toContain('low structure confidence');
        expect(workflow.issueSummary.mappings.some(mapping => mapping.issue.includes('low structure confidence'))).toBe(true);
        expect(workflow.summary.canAnalyze).toBe(false);
        expect(workflow.cta.primaryLabel).toBe('Open Workspace Artifacts');
    });

    it('keeps metadata-only low-confidence imports as warnings instead of blocking analysis', () => {
        const state = createBaseState();
        state.rawCsvData = {
            ...state.rawCsvData,
            metadataRows: [['INWARD RFQ LISTING']],
            summaryRows: [],
            headerDepth: 1,
            intakeDetection: {
                ...state.rawCsvData.intakeDetection!,
                strategy: 'papaparse_auto_fallback',
                confidence: 'low',
                warnings: [
                    {
                        code: 'low_confidence',
                        message: 'CSV parsing fell back to PapaParse auto-detection because scored dialect selection was inconclusive.',
                    },
                    {
                        code: 'mixed_delimiter',
                        message: 'The file looks mixed between \",\" and \":\" delimiters, so the selected parser may be approximate.',
                    },
                ],
            },
        };
        state.csvData = {
            ...state.csvData,
            metadataRows: [['INWARD RFQ LISTING']],
            summaryRows: [],
            headerDepth: 1,
        };

        const workflow = buildDataPreparationWorkflowBundle(state);

        expect(workflow.summary.intakeGateStatus).toBe('warning');
        expect(workflow.summary.intakeGateMessage).toBe('File imported, but structure confidence is limited.');
        expect(workflow.issueSummary.mappings.some(mapping => mapping.issue.includes('CSV intake confidence is limited'))).toBe(true);
        expect(workflow.summary.canAnalyze).toBe(true);
    });

    it('derives AI-cleaned status from successful cleaned dataset workspace edits', () => {
        const state = createBaseState();
        state.dataPreparationPlan = {
            explanation: 'AI cleaning only performed inspection. No cleaning edits were applied to cleaned.csv.',
            operations: [],
            outputColumns: [
                { name: 'Region', type: 'categorical' },
                { name: 'Revenue', type: 'numerical' },
            ],
            planStatus: 'schema_only',
            consistencyIssues: [],
        };
        state.workspaceActionHistory = [
            {
                timestamp: new Date('2026-03-10T00:00:06.000Z'),
                operation: 'replace',
                path: '/dataset/cleaned.csv',
                success: true,
                message: 'Updated cleaned.csv with targeted replacements.',
            },
        ];

        const bundle = buildCleaningInspectionBundle(state);
        const workflow = buildDataPreparationWorkflowBundle(state);

        expect(bundle.cleaning.planStatus).toBe('operations');
        expect(bundle.cleaning.status).toBe('operations');
        expect(bundle.cleaning.derivedFromWorkspaceEdits).toBe(true);
        expect(bundle.cleaning.workspaceEditCount).toBe(1);
        expect(bundle.cleaning.operationCount).toBe(1);
        expect(bundle.cleaning.explanation).toBe('AI cleaning only performed inspection. No cleaning edits were applied to cleaned.csv.');
        expect(workflow.preparation.badgeLabel).toBe('AI Cleaned');
        expect(workflow.issueSummary.mappings.some(mapping => mapping.result === 'ai-executed')).toBe(true);
    });

    it('falls back to workspace success tool logs when workspace action history is unavailable', () => {
        const state = createBaseState();
        state.dataPreparationPlan = {
            explanation: 'AI cleaning only performed inspection. No cleaning edits were applied to cleaned.csv.',
            operations: [],
            outputColumns: [
                { name: 'Region', type: 'categorical' },
                { name: 'Revenue', type: 'numerical' },
            ],
            planStatus: 'schema_only',
            consistencyIssues: [],
        };
        state.workspaceActionHistory = [];
        state.agentToolLogs = [
            ...state.agentToolLogs,
            {
                id: 'tool-workspace-success',
                timestamp: new Date('2026-03-10T00:00:07.000Z'),
                tool: 'workspace.replace',
                description: 'workspace success: replace /dataset/cleaned.csv',
                detail: {
                    path: '/dataset/cleaned.csv',
                    operation: 'replace',
                    success: true,
                },
            },
        ];

        const bundle = buildCleaningInspectionBundle(state);

        expect(bundle.cleaning.planStatus).toBe('operations');
        expect(bundle.cleaning.derivedFromWorkspaceEdits).toBe(true);
        expect(bundle.cleaning.workspaceEditCount).toBe(1);
        expect(bundle.cleaning.operationCount).toBe(1);
    });

    it('emits canonical trace contracts for pipeline, telemetry, and tool logs', () => {
        const bundle = buildCleaningInspectionBundle(createBaseState());

        expect(bundle.logs.pipeline[0]?.traceContract).toMatchObject({
            contractVersion: 'runtime_v1',
            reasonCode: 'schema_snapshot_before',
            source: 'cleaning_pipeline_event',
        });
        expect(bundle.logs.telemetry[0]?.traceContract).toMatchObject({
            contractVersion: 'runtime_v1',
            reasonCode: 'data_prep',
            source: 'cleaning_telemetry',
        });
        expect(bundle.logs.toolLogs[0]?.traceContract).toMatchObject({
            contractVersion: 'runtime_v1',
            reasonCode: 'context_manager',
            source: 'cleaning_tool_log',
        });
    });
});
