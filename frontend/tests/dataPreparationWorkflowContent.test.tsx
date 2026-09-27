import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataPreparationWorkflowContent } from '../components/data-preparation/DataPreparationWorkflowContent';

afterEach(() => {
    cleanup();
});

describe('DataPreparationWorkflowContent', () => {
    it('renders compact parser diagnostics in the workflow summary', () => {
        render(
            <DataPreparationWorkflowContent
                workflow={{
                    summary: {
                        fileName: 'sales.csv',
                        reportTitle: 'FY2026 Revenue',
                        rawRowCount: 3,
                        preparedRowCount: 2,
                        metadataRowCount: 1,
                        headerDepth: 2,
                        summaryRowCount: 1,
                        parserStrategy: 'papaparse_auto_fallback',
                        parserConfidence: 'low',
                        detectedDelimiter: ',',
                        detectedQuoteChar: null,
                        parserWarnings: [
                            'CSV dialect detection confidence is limited, so the imported structure should be reviewed in diagnostics.',
                            'Parser reported 1 issue while evaluating the selected CSV dialect.',
                        ],
                        intakeGateStatus: 'warning',
                        intakeGateMessage: 'File imported, but structure confidence is limited.',
                        issueCount: 1,
                        operationCount: 0,
                        baselineNoiseRowsRemoved: 0,
                        preparationState: 'baseline_prepared',
                        planStatus: 'schema_only',
                        downstreamAnalysisBlocked: false,
                        canAnalyze: true,
                        analysisState: 'ready',
                        pipelineOutcomeStatus: 'ready',
                        canonicalizationStatus: 'ready',
                        canonicalRowCount: 2,
                        cardsCount: 1,
                        hasFinalSummary: false,
                    },
                    reportContext: {
                        aiExtracted: null,
                        fallback: {
                            sourceFile: 'sales.csv',
                            reportTitle: 'FY2026 Revenue',
                            parameterLines: [],
                            footerLines: [],
                            candidateHeaderLine: null,
                            notes: [],
                            source: 'fallback',
                            confidence: null,
                        },
                        effective: {
                            sourceFile: 'sales.csv',
                            reportTitle: 'FY2026 Revenue',
                            parameterLines: [],
                            footerLines: [],
                            candidateHeaderLine: null,
                            notes: [],
                            source: 'fallback',
                            confidence: null,
                        },
                        verification: {
                            passed: true,
                            usedFallback: false,
                            reason: null,
                            aiConfidence: null,
                            issues: [],
                        },
                        generatedAt: '2026-03-13T00:00:00.000Z',
                    },
                    steps: [
                        { id: 'import', label: 'Import', status: 'done', description: 'Imported.' },
                        { id: 'inspect', label: 'Inspect', status: 'done', description: 'Inspected.' },
                        { id: 'prepare', label: 'Prepare', status: 'warning', description: 'Prepared.' },
                        { id: 'verify', label: 'Verify', status: 'done', description: 'Verified.' },
                        { id: 'analyze', label: 'Analyze', status: 'done', description: 'Analyzed.' },
                    ],
                    issueSummary: {
                        topWarnings: [],
                        mappings: [],
                    },
                    preparation: {
                        badgeLabel: 'Baseline Prepared',
                        explanation: 'No edits yet.',
                        operationCount: 0,
                        operations: [],
                        noExecutableOperations: true,
                        blockedMessage: null,
                    },
                    structureReview: null,
                    verification: {
                        emptyDatasetGuardPassed: true,
                        datasetSafetyStatus: 'passed',
                        cleaningConsistencyStatus: 'passed',
                        overallStatus: 'passed',
                        sqlPrecheckStatus: 'not_run',
                        sqlPrecheckSummary: null,
                        sqlPrecheckBlockingFindings: [],
                        shapeFailureSignalKey: null,
                        shapeFailureDetail: null,
                        failedChecks: [],
                        warnings: [],
                        schemaSummary: 'ok',
                        downstreamAnalysisBlocked: false,
                        shapeVerification: null,
                    },
                    diff: {
                        rowCountBefore: 3,
                        rowCountAfter: 2,
                        rowCountDelta: -1,
                        removedColumns: [],
                        addedColumns: [],
                        changedColumns: [],
                    },
                    operationalSignals: {
                        latestPipelineTrace: { contractVersion: 'runtime_v1', reasonCode: 'schema_snapshot_after' },
                        latestToolTrace: { contractVersion: 'runtime_v1', reasonCode: 'context_manager', retryClass: 'semantic_recovery' },
                        latestTelemetryTrace: { contractVersion: 'runtime_v1', reasonCode: 'data_prep', source: 'cleaning_telemetry' },
                        latestFallbackPath: 'schema_only_baseline',
                    },
                    cta: {
                        primaryLabel: 'Proceed to Analysis',
                        primaryAction: 'scroll_to_analysis',
                        secondaryLabel: 'Open Workspace Artifacts',
                    },
                    samples: {
                        rawSample: { totalRows: 3, columns: ['Region', 'Revenue'], rows: [], truncated: false },
                        cleanedSample: { totalRows: 2, columns: ['Region', 'Revenue'], rows: [], truncated: false },
                    },
                } as never}
                onPrimaryAction={vi.fn()}
                onOpenWorkspace={vi.fn()}
                onConfirmStructureBoundary={vi.fn()}
                onSaveStructureBoundaryOverride={vi.fn()}
            />,
        );

        expect(screen.getByText('Parser Diagnostics')).toBeInTheDocument();
        expect(screen.getByText(/papaparse_auto_fallback · low confidence/i)).toBeInTheDocument();
        expect(screen.getByText(/Delimiter:/i)).toBeInTheDocument();
        expect(screen.getByText(/Quote:/i)).toBeInTheDocument();
        expect(screen.getByText(/CSV dialect detection confidence is limited/i)).toBeInTheDocument();
        expect(screen.getByText('Operational Signals')).toBeInTheDocument();
        expect(screen.getByText(/schema_snapshot_after/i)).toBeInTheDocument();
        expect(screen.getByText(/schema_only_baseline/i)).toBeInTheDocument();
    });

    it('shows workspace-first CTA when automatic analysis is paused by intake diagnostics', () => {
        render(
            <DataPreparationWorkflowContent
                workflow={{
                    summary: {
                        fileName: 'sales.csv',
                        reportTitle: 'FY2026 Revenue',
                        rawRowCount: 3,
                        preparedRowCount: 2,
                        metadataRowCount: 1,
                        headerDepth: 2,
                        summaryRowCount: 1,
                        parserStrategy: 'scored_candidate',
                        parserConfidence: 'low',
                        detectedDelimiter: ',',
                        detectedQuoteChar: null,
                        parserWarnings: ['Parser reported 2 issues while evaluating the selected CSV dialect.'],
                        intakeGateStatus: 'blocked',
                        intakeGateMessage: 'Parsing errors were detected. Automatic analysis is paused until you review the import diagnostics or rerun cleaning.',
                        issueCount: 1,
                        operationCount: 0,
                        baselineNoiseRowsRemoved: 0,
                        preparationState: 'baseline_prepared',
                        planStatus: 'schema_only',
                        downstreamAnalysisBlocked: false,
                        canAnalyze: false,
                        analysisState: 'blocked',
                        pipelineOutcomeStatus: 'blocked_by_intake',
                        canonicalizationStatus: 'needs_review',
                        canonicalRowCount: 0,
                        cardsCount: 0,
                        hasFinalSummary: false,
                    },
                    reportContext: {
                        aiExtracted: null,
                        fallback: {
                            sourceFile: 'sales.csv',
                            reportTitle: 'FY2026 Revenue',
                            parameterLines: [],
                            footerLines: [],
                            candidateHeaderLine: null,
                            notes: [],
                            source: 'fallback',
                            confidence: null,
                        },
                        effective: {
                            sourceFile: 'sales.csv',
                            reportTitle: 'FY2026 Revenue',
                            parameterLines: [],
                            footerLines: [],
                            candidateHeaderLine: null,
                            notes: [],
                            source: 'fallback',
                            confidence: null,
                        },
                        verification: {
                            passed: true,
                            usedFallback: false,
                            reason: null,
                            aiConfidence: null,
                            issues: [],
                        },
                        generatedAt: '2026-03-13T00:00:00.000Z',
                    },
                    steps: [
                        { id: 'import', label: 'Import', status: 'done', description: 'Imported.' },
                        { id: 'inspect', label: 'Inspect', status: 'warning', description: 'Parsing errors were detected during CSV intake.' },
                        { id: 'prepare', label: 'Prepare', status: 'warning', description: 'Prepared.' },
                        { id: 'verify', label: 'Verify', status: 'blocked', description: 'Parsing errors were detected. Automatic analysis is paused until you review the import diagnostics or rerun cleaning.' },
                        { id: 'analyze', label: 'Analyze', status: 'blocked', description: 'Parsing errors were detected. Automatic analysis is paused until you review the import diagnostics or rerun cleaning.' },
                    ],
                    issueSummary: {
                        topWarnings: ['Parsing errors were detected during CSV intake.'],
                        mappings: [],
                    },
                    preparation: {
                        badgeLabel: 'Baseline Prepared',
                        explanation: 'No edits yet.',
                        operationCount: 0,
                        operations: [],
                        noExecutableOperations: true,
                        blockedMessage: 'Parsing errors were detected. Automatic analysis is paused until you review the import diagnostics or rerun cleaning.',
                    },
                    structureReview: null,
                    verification: {
                        emptyDatasetGuardPassed: true,
                        datasetSafetyStatus: 'passed',
                        cleaningConsistencyStatus: 'passed',
                        overallStatus: 'passed',
                        sqlPrecheckStatus: 'not_run',
                        sqlPrecheckSummary: null,
                        sqlPrecheckBlockingFindings: [],
                        shapeFailureSignalKey: null,
                        shapeFailureDetail: null,
                        failedChecks: [],
                        warnings: [],
                        schemaSummary: 'ok',
                        downstreamAnalysisBlocked: false,
                        shapeVerification: null,
                    },
                    diff: {
                        rowCountBefore: 3,
                        rowCountAfter: 2,
                        rowCountDelta: -1,
                        removedColumns: [],
                        addedColumns: [],
                        changedColumns: [],
                    },
                    operationalSignals: {
                        latestPipelineTrace: null,
                        latestToolTrace: null,
                        latestTelemetryTrace: null,
                        latestFallbackPath: null,
                    },
                    cta: {
                        primaryLabel: 'Open Workspace Artifacts',
                        primaryAction: 'open_workspace',
                        secondaryLabel: 'Open Workspace Artifacts',
                    },
                    samples: {
                        rawSample: { totalRows: 3, columns: ['Region', 'Revenue'], rows: [], truncated: false },
                        cleanedSample: { totalRows: 2, columns: ['Region', 'Revenue'], rows: [], truncated: false },
                    },
                } as never}
                onPrimaryAction={vi.fn()}
                onOpenWorkspace={vi.fn()}
                onConfirmStructureBoundary={vi.fn()}
                onSaveStructureBoundaryOverride={vi.fn()}
            />,
        );

        expect(screen.getAllByRole('button', { name: 'Open Workspace Artifacts' }).length).toBeGreaterThanOrEqual(2);
        expect(screen.getAllByText(/Automatic analysis is paused/i).length).toBeGreaterThanOrEqual(1);
    });
});
