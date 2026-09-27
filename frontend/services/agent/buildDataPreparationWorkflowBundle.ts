import type { AppStore } from '../../store/useAppStore';
import type { DataPreparationWorkflowBundle } from '../../types';
import { buildCleaningInspectionBundle } from './buildCleaningInspectionBundle';
import { evaluateIntakeDiagnostics, evaluatePostCleaningGateRelaxation } from './intakeDiagnosticsPolicy';

// Narrower state type accepted by this function — all fields accessed directly or via buildCleaningInspectionBundle.
export type WorkflowBundleState = Pick<AppStore,
    | 'agentEvents' | 'agentToolLogs' | 'telemetryEvents' | 'columnProfiles'
    | 'rawCsvData' | 'csvData' | 'rawIntakeIr' | 'reportContextResolution'
    | 'dataQualityIssues' | 'dataPreparationPlan' | 'settings' | 'cleaningRun'
    | 'reportStructureResolution' | 'canonicalCsvData' | 'canonicalBuildMeta'
    | 'canonicalizationStatus' | 'pipelineOutcome'
    | 'activeSpreadsheetFilter' | 'aiFilterExplanation' | 'spreadsheetFilterFunction'
    | 'activeDataQuery' | 'initialDataSample' | 'sessionId' | 'currentView'
    | 'currentDatasetId' | 'isGeneratingReport' | 'analysisCards' | 'finalSummary'
>;

const MAX_TOP_WARNINGS = 5;

const dedupeStrings = (values: Array<string | null | undefined>) => {
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const value of values) {
        const normalized = value?.trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        deduped.push(normalized);
    }
    return deduped;
};

const buildIssueMappings = (
    inspection: ReturnType<typeof buildCleaningInspectionBundle>,
    intakeGuard: ReturnType<typeof evaluateIntakeDiagnostics>,
): DataPreparationWorkflowBundle['issueSummary']['mappings'] => {
    const mappings: DataPreparationWorkflowBundle['issueSummary']['mappings'] = [];

    if (intakeGuard.severity === 'blocked') {
        const intakeIssue = intakeGuard.blockingReasonCode === 'parse_errors'
            ? 'CSV intake reported parser errors that can distort automatic analysis'
            : intakeGuard.blockingReasonCode === 'malformed_quote'
                ? 'CSV intake detected malformed quoted fields that can shift row boundaries'
                : intakeGuard.blockingReasonCode === 'header_shape_drift'
                    ? 'CSV intake detected header/body drift near the imported table boundary'
                    : intakeGuard.blockingReasonCode === 'intake_diagnostics_missing'
                        ? 'Import diagnostics are missing for a report-like dataset'
                        : 'A report-like dataset was imported with low structure confidence';
        mappings.push({
            issue: intakeIssue,
            action: intakeGuard.analysisBlockedMessage ?? 'Review the intake diagnostics and rerun cleaning before trusting the imported structure.',
            result: 'blocked',
        });
    } else if (intakeGuard.severity === 'warning') {
        mappings.push({
            issue: 'CSV intake confidence is limited',
            action: 'Review parser diagnostics before trusting automatic structure assumptions.',
            result: 'proposed-only',
        });
    }

    if (inspection.cleaning.baselineNoiseRowsRemoved > 0) {
        mappings.push({
            issue: `${inspection.cleaning.baselineNoiseRowsRemoved} embedded body-noise row(s) detected`,
            action: 'Deterministic baseline cleaner removed obvious project/export note rows',
            result: 'baseline-fixed',
        });
    }

    if (inspection.execution.removedColumns.length > 0) {
        mappings.push({
            issue: `${inspection.execution.removedColumns.length} low-value column(s) were flagged as noise`,
            action: `Removed columns: ${inspection.execution.removedColumns.slice(0, 4).join(', ')}${inspection.execution.removedColumns.length > 4 ? '...' : ''}`,
            result: 'baseline-fixed',
        });
    }

    if (inspection.cleaning.planStatus === 'operations') {
        mappings.push({
            issue: inspection.cleaning.derivedFromWorkspaceEdits
                ? 'AI workspace cleaning wrote executable dataset edits'
                : 'AI cleaning plan produced executable deterministic operations',
            action: inspection.cleaning.derivedFromWorkspaceEdits
                ? `${inspection.cleaning.workspaceEditCount} workspace edit(s) updated cleaned.csv`
                : `${inspection.cleaning.operationCount} operation(s) auto-applied`,
            result: 'ai-executed',
        });
    } else if (inspection.cleaning.planStatus === 'schema_only') {
        mappings.push({
            issue: 'AI proposed schema refinement without executable operations',
            action: 'Kept baseline-prepared rows and applied schema interpretation only',
            result: 'proposed-only',
        });
    } else if (inspection.cleaning.planStatus === 'inconsistent') {
        mappings.push({
            issue: 'AI cleaning plan claims did not match executable operations',
            action: inspection.cleaning.consistencyIssues.length > 0
                ? `Analysis will proceed with baseline data. ${inspection.cleaning.consistencyIssues.slice(0, 2).join(' ')}`
                : 'Analysis will proceed with baseline-prepared rows (AI cleaning skipped)',
            result: 'proposed-only',
        });
    }

    if ((inspection.cleaning.labelNormalization?.appliedClusters.length ?? 0) > 0) {
        mappings.push({
            issue: `${inspection.cleaning.labelNormalization?.appliedClusters.length ?? 0} high-confidence label alias group(s) were normalized`,
            action: inspection.cleaning.labelNormalization?.summary ?? 'Applied deterministic replace_values mappings to standardize duplicate labels.',
            result: 'ai-executed',
        });
    }

    if ((inspection.cleaning.labelNormalization?.deferredSuggestions.length ?? 0) > 0) {
        mappings.push({
            issue: `${inspection.cleaning.labelNormalization?.deferredSuggestions.length ?? 0} lower-confidence label alias suggestion(s) were deferred`,
            action: 'Review deferred label suggestions before forcing broader normalization rules.',
            result: 'proposed-only',
        });
    }

    if (inspection.verification.downstreamAnalysisBlocked && mappings.every(mapping => mapping.result !== 'blocked')) {
        mappings.push({
            issue: 'Downstream AI analysis is blocked for this dataset state',
            action: 'Use Workspace artifacts to inspect the blocked cleaning handoff before rerunning analysis',
            result: 'blocked',
        });
    }

    if (inspection.verification.sqlPrecheckStatus === 'blocked') {
        mappings.push({
            issue: inspection.verification.sqlPrecheckSummary ?? 'SQL precheck found no numerical metrics for aggregation.',
            action: inspection.verification.sqlPrecheckBlockingFindings.length > 0
                ? inspection.verification.sqlPrecheckBlockingFindings
                    .slice(0, 3)
                    .map(finding => finding.message)
                    .join(' | ')
                : 'Analysis will proceed with categorical distributions and count-based views.',
            result: 'proposed-only',
        });
    }

    return mappings;
};

export const buildDataPreparationWorkflowBundle = (state: WorkflowBundleState): DataPreparationWorkflowBundle => {
    // buildCleaningInspectionBundle still accepts full AppStore; cast is safe because WorkflowBundleState
    // explicitly lists every field that function accesses.
    const inspection = buildCleaningInspectionBundle(state as AppStore);
    const intakeGuard = evaluateIntakeDiagnostics(inspection.intakeDiagnostics);
    const pipelineOutcome = state.pipelineOutcome;
    const isGeneratingAnalysis = Boolean(state.isGeneratingReport);
    const hasAnalysis = state.analysisCards.length > 0 || Boolean(state.finalSummary);
    const sqlPrecheckNeedsAttention = inspection.verification.sqlPrecheckStatus === 'blocked'
        || inspection.verification.sqlPrecheckStatus === 'warning';

    // --- Post-cleaning gate relaxation harness ---
    // If intake gate would block, evaluate post-cleaning evidence to decide
    // whether the block can be downgraded to a warning.
    const intakeWouldBlock = intakeGuard.shouldBlockAutomaticAnalysis;
    const gateRelaxed = intakeWouldBlock
        ? evaluatePostCleaningGateRelaxation({
            cleaningCompleted: state.cleaningRun?.status === 'completed',
            sqlPrecheckPassed: ['passed', 'warning'].includes(state.dataPreparationPlan?.sqlPrecheck?.status ?? ''),
            cleanedRowCount: state.csvData?.data.length ?? 0,
            queryableMetricCount: (state.columnProfiles ?? []).filter(p =>
                ['numerical', 'currency', 'percentage'].includes(p.type),
            ).length,
            queryableDimensionCount: (state.columnProfiles ?? []).filter(p =>
                ['categorical', 'date', 'time'].includes(p.type),
            ).length,
            residualUnknownRowCount: state.cleaningRun?.residualUnknownRowCount ?? 0,
        }).canRelax
        : false;
    const effectiveIntakeBlock = intakeWouldBlock && !gateRelaxed;

    // SQL precheck blocked no longer prevents analysis — the pipeline degrades
    // gracefully and generates categorical/count-based views instead.
    const canAnalyze = pipelineOutcome?.canAutoAnalyze
        ?? (
            !inspection.verification.downstreamAnalysisBlocked
            && inspection.verification.datasetSafetyStatus === 'passed'
            && !effectiveIntakeBlock
        );

    // Inconsistent plans degrade to baseline_prepared (not cleaning_blocked) — analysis must proceed.
    const preparationState: DataPreparationWorkflowBundle['summary']['preparationState'] = inspection.cleaning.planStatus === 'operations'
        ? 'ai_cleaned'
        : inspection.importFacts.cleanedRowCount > 0
            ? 'baseline_prepared'
            : 'not_started';

    const analysisState: DataPreparationWorkflowBundle['summary']['analysisState'] = (
        pipelineOutcome
        && !pipelineOutcome.canAutoAnalyze
        && pipelineOutcome.status !== 'ready'
        && pipelineOutcome.status !== 'degraded_but_usable'
    ) || inspection.verification.downstreamAnalysisBlocked || effectiveIntakeBlock
        ? 'blocked'
        : isGeneratingAnalysis
            ? 'running'
            : hasAnalysis
                ? 'ready'
                : 'not_started';

    const badgeLabel: DataPreparationWorkflowBundle['preparation']['badgeLabel'] = inspection.cleaning.planStatus === 'operations'
        ? 'AI Cleaned'
        : inspection.cleaning.planStatus === 'schema_only'
            ? 'No Data Edits Applied Yet'
            : inspection.cleaning.planStatus === 'inconsistent'
                ? 'Baseline Prepared'
                : preparationState === 'baseline_prepared'
                    ? 'Baseline Prepared'
                    : null;

    const steps: DataPreparationWorkflowBundle['steps'] = [
        {
            id: 'import',
            label: 'Import',
            status: inspection.importFacts.fileName ? 'done' : 'not_started',
            description: inspection.importFacts.fileName
                ? `${inspection.importFacts.rawRowCount} raw rows loaded from ${inspection.importFacts.fileName}.`
                : 'No dataset loaded yet.',
        },
        {
            id: 'inspect',
            label: 'Inspect',
            status: state.reportStructureResolution?.requiresHumanReview || intakeGuard.severity !== 'clear' || inspection.profiling.detectedIssues.length > 0 ? 'warning' : inspection.importFacts.fileName ? 'done' : 'not_started',
            description: state.reportStructureResolution?.requiresHumanReview
                ? pipelineOutcome?.message ?? `Report structure requires review: ${state.reportStructureResolution.blockingReasons.join(', ')}`
                : intakeGuard.inspectMessage
                ? intakeGuard.inspectMessage
                : inspection.profiling.detectedIssues.length > 0
                ? `${inspection.profiling.detectedIssues.length} quality issue(s) detected during profiling.`
                : inspection.importFacts.fileName
                    ? 'Initial profiling completed without user-visible warnings.'
                    : 'Inspection starts after a dataset is loaded.',
        },
        {
            id: 'prepare',
            label: 'Prepare',
            status: inspection.cleaning.planStatus === 'operations'
                ? 'done'
                : inspection.cleaning.planStatus === 'schema_only'
                    ? 'warning'
                    : inspection.cleaning.planStatus === 'inconsistent'
                        ? 'warning'
                        : preparationState === 'baseline_prepared'
                            ? 'warning'
                            : 'not_started',
            description: inspection.cleaning.planStatus === 'operations'
                ? inspection.cleaning.derivedFromWorkspaceEdits
                    ? `${inspection.cleaning.workspaceEditCount} workspace cleaning edit(s) executed.`
                    : `${inspection.cleaning.operationCount} deterministic operation(s) executed.`
                : inspection.cleaning.planStatus === 'schema_only'
                    ? 'Baseline-prepared rows kept; AI only refined schema interpretation.'
                    : inspection.cleaning.planStatus === 'inconsistent'
                        ? 'AI cleaning plan was inconsistent — proceeding with baseline-prepared rows.'
                        : preparationState === 'baseline_prepared'
                            ? 'Deterministic baseline preparation completed.'
                            : 'Preparation has not started yet.',
        },
        {
            id: 'verify',
            label: 'Verify',
            status: pipelineOutcome?.status === 'needs_structure_review'
                ? 'blocked'
                : inspection.verification.overallStatus === 'failed'
                ? 'blocked'
                : effectiveIntakeBlock
                    ? 'blocked'
                : inspection.verification.overallStatus === 'blocked'
                    ? 'blocked'
                    : sqlPrecheckNeedsAttention
                        ? 'warning'
                    : inspection.importFacts.fileName
                        ? 'done'
                        : 'not_started',
            description: pipelineOutcome?.status === 'needs_structure_review'
                ? pipelineOutcome.message
                : inspection.verification.overallStatus === 'failed'
                ? 'Prepared dataset failed safety checks.'
                : intakeGuard.verifyMessage
                    ? intakeGuard.verifyMessage
                : inspection.verification.overallStatus === 'blocked'
                    ? 'Dataset is safe, but cleaning consistency blocked the AI handoff.'
                    : sqlPrecheckNeedsAttention
                        ? inspection.verification.sqlPrecheckSummary
                            ?? 'SQL precheck could not confirm the preferred SQL path — analysis will proceed with degraded guidance.'
                        : inspection.importFacts.fileName
                            ? 'Dataset safety and cleaning verification passed.'
                        : 'Verification runs after preparation.',
        },
        {
            id: 'analyze',
            label: 'Analyze',
            status: analysisState === 'blocked'
                ? 'blocked'
                : analysisState === 'running'
                    ? 'warning'
                    : analysisState === 'ready'
                        ? 'done'
                        : canAnalyze
                            ? 'warning'
                            : 'not_started',
            description: analysisState === 'blocked'
                ? pipelineOutcome?.message
                    ?? intakeGuard.analysisBlockedMessage
                    ?? 'Downstream AI analysis was blocked due to dataset safety issues.'
                : analysisState === 'running'
                    ? 'AI analysis is running automatically on the prepared dataset.'
                    : analysisState === 'ready'
                        ? 'Analysis results are available below.'
                        : canAnalyze
                            ? 'Prepared dataset is eligible for analysis.'
                            : 'Analysis is not ready yet.',
        },
    ];

    return {
        summary: {
            fileName: inspection.importFacts.fileName,
            reportTitle: inspection.reportContext?.effective?.reportTitle ?? null,
            rawRowCount: inspection.importFacts.rawRowCount,
            preparedRowCount: inspection.importFacts.cleanedRowCount,
            metadataRowCount: inspection.importFacts.metadataRowCount,
            headerDepth: inspection.importFacts.headerDepth,
            summaryRowCount: inspection.importFacts.summaryRowCount,
            parserStrategy: inspection.importFacts.parserStrategy,
            parserConfidence: inspection.importFacts.parserConfidence,
            detectedDelimiter: inspection.importFacts.detectedDelimiter,
            detectedQuoteChar: inspection.importFacts.detectedQuoteChar,
            parserWarnings: inspection.importFacts.parserWarnings,
            intakeGateStatus: intakeGuard.severity,
            intakeGateMessage: intakeGuard.analysisBlockedMessage ?? intakeGuard.inspectMessage,
            issueCount: inspection.profiling.detectedIssues.length,
            operationCount: inspection.cleaning.operationCount,
            baselineNoiseRowsRemoved: inspection.cleaning.baselineNoiseRowsRemoved,
            preparationState,
            planStatus: inspection.cleaning.planStatus,
            downstreamAnalysisBlocked: inspection.verification.downstreamAnalysisBlocked,
            canAnalyze,
            analysisState,
            pipelineOutcomeStatus: pipelineOutcome?.status ?? null,
            canonicalizationStatus: state.canonicalizationStatus,
            canonicalRowCount: state.canonicalCsvData?.data.length ?? 0,
            cardsCount: state.analysisCards.length,
            hasFinalSummary: Boolean(state.finalSummary),
        },
        reportContext: inspection.reportContext,
        steps,
        issueSummary: {
            topWarnings: dedupeStrings([
                pipelineOutcome?.message,
                intakeGuard.inspectMessage,
                intakeGuard.analysisBlockedMessage,
                ...inspection.importFacts.parserWarnings,
                ...inspection.verification.warnings,
            ]).slice(0, MAX_TOP_WARNINGS),
            mappings: buildIssueMappings(inspection, intakeGuard),
        },
        preparation: {
            badgeLabel,
            explanation: inspection.cleaning.explanation,
            operationCount: inspection.cleaning.operationCount,
            operations: inspection.cleaning.operations.map(operation => ({
                id: operation.id,
                type: operation.type,
                reason: operation.reason,
            })),
            noExecutableOperations: inspection.cleaning.operationCount === 0,
            blockedMessage: intakeGuard.analysisBlockedMessage
                ?? (inspection.verification.downstreamAnalysisBlocked
                ? 'Prepared Data is available. AI analysis was blocked due to dataset safety issues.'
                : null),
        },
        structureReview: state.reportStructureResolution
            ? {
                requiresHumanReview: state.reportStructureResolution.requiresHumanReview,
                source: state.reportStructureResolution.source,
                confidence: state.reportStructureResolution.confidence,
                blockingReasons: state.reportStructureResolution.blockingReasons,
                detectedBoundary: {
                    headerRowIndex: state.reportStructureResolution.headerRowIndex,
                    headerLayerRowIndexes: state.reportStructureResolution.headerLayerRowIndexes,
                    bodyStartIndex: state.reportStructureResolution.bodyStartIndex,
                    summaryStartIndex: state.reportStructureResolution.summaryStartIndex,
                    parameterRowIndexes: state.reportStructureResolution.parameterRowIndexes,
                    repeatedHeaderRowIndexes: state.reportStructureResolution.repeatedHeaderRowIndexes,
                },
                intakeBoundary: state.reportStructureResolution.rawIntakeBoundary,
                runtimeBoundary: state.reportStructureResolution.runtimeBoundary,
                humanBoundary: state.reportStructureResolution.humanBoundary,
                proposalSource: state.reportStructureResolution.proposalSource,
                proposalVerification: state.reportStructureResolution.proposalVerification,
                verificationSummary: state.reportStructureResolution.verificationSummary,
                canonicalizationStatus: state.canonicalizationStatus,
                canonicalBuildMeta: state.canonicalBuildMeta,
                pipelineOutcome,
            }
            : null,
        verification: inspection.verification,
        diff: inspection.execution,
        operationalSignals: {
            latestPipelineTrace: inspection.logs.pipeline.at(-1)?.traceContract ?? null,
            latestToolTrace: inspection.logs.toolLogs.at(0)?.traceContract ?? null,
            latestTelemetryTrace: inspection.logs.telemetry.at(0)?.traceContract ?? null,
            latestFallbackPath: dedupeStrings([
                inspection.cleaning.planStatus === 'schema_only' ? 'schema_only_baseline' : null,
                inspection.cleaning.planStatus === 'inconsistent' ? 'baseline_recovery' : null,
                inspection.verification.sqlPrecheckStatus === 'blocked' ? 'sql_precheck_blocked' : null,
                inspection.verification.shapeFailureSignalKey ?? null,
            ])[0] ?? null,
        },
        cta: effectiveIntakeBlock || inspection.verification.downstreamAnalysisBlocked || Boolean(pipelineOutcome && !pipelineOutcome.canAutoAnalyze)
            ? {
                primaryLabel: 'Open Workspace Artifacts',
                primaryAction: 'open_workspace',
                secondaryLabel: 'Open Workspace Artifacts',
            }
            : hasAnalysis
                ? {
                    primaryLabel: 'Analysis Ready',
                    primaryAction: 'scroll_to_analysis',
                    secondaryLabel: 'Open Workspace Artifacts',
                }
                : {
                    primaryLabel: 'Proceed to Analysis',
                    primaryAction: 'scroll_to_analysis',
                    secondaryLabel: 'Open Workspace Artifacts',
                },
        samples: {
            rawSample: inspection.samples.rawSample,
            cleanedSample: inspection.samples.cleanedSample,
        },
    };
};
