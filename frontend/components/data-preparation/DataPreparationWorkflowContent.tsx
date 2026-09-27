import React from 'react';
import { buildDataPreparationWorkflowBundle } from '../../services/agent/buildDataPreparationWorkflowBundle';
import { summarizeTraceContract } from '../../services/agent/traceContractView';
import type { AgentEvent } from '../../types';
import { AgentActivityView } from '../agent-activity/AgentActivityView';

type WorkflowBundle = ReturnType<typeof buildDataPreparationWorkflowBundle>;

const stepStatusClasses: Record<'done' | 'warning' | 'blocked' | 'not_started', string> = {
    done: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-100 text-amber-800 border-amber-200',
    blocked: 'bg-rose-100 text-rose-800 border-rose-200',
    not_started: 'bg-slate-100 text-slate-600 border-slate-200',
};

const badgeClasses: Record<NonNullable<WorkflowBundle['preparation']['badgeLabel']>, string> = {
    'AI Cleaned': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'No Data Edits Applied Yet': 'bg-amber-100 text-amber-800 border-amber-200',
    'Cleaning Blocked': 'bg-rose-100 text-rose-800 border-rose-200',
    'Baseline Prepared': 'bg-sky-100 text-sky-800 border-sky-200',
};

const mappingResultClasses: Record<WorkflowBundle['issueSummary']['mappings'][number]['result'], string> = {
    'baseline-fixed': 'bg-sky-100 text-sky-800 border-sky-200',
    'ai-executed': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'proposed-only': 'bg-amber-100 text-amber-800 border-amber-200',
    'blocked': 'bg-rose-100 text-rose-800 border-rose-200',
};

const countLabel = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;
const formatResultLabel = (value: WorkflowBundle['issueSummary']['mappings'][number]['result']) => value.replace('-', ' ');
const formatDelimiter = (value: string | null) => value === '\t' ? 'tab' : (value ?? 'unknown');
const formatQuote = (value: string | null) => value === '\'' ? 'single quote' : value === '"' ? 'double quote' : 'none';

type DataPreparationWorkflowContentProps = {
    workflow: WorkflowBundle;
    defaultDetailMode?: 'summary' | 'full';
    embeddedInDialog?: boolean;
    onPrimaryAction: () => void;
    onOpenWorkspace: () => void;
    onOpenActivity?: () => void;
    activityEvents?: AgentEvent[];
    activitySessionId?: string;
    activityDatasetId?: string | null;
    onConfirmStructureBoundary: () => void;
    onSaveStructureBoundaryOverride: (boundary: {
        headerRowIndex: number;
        headerLayerRowIndexes: number[];
        bodyStartIndex: number;
        summaryStartIndex: number | null;
        parameterRowIndexes: number[];
        repeatedHeaderRowIndexes: number[];
    }) => void;
};

export const DataPreparationWorkflowContent: React.FC<DataPreparationWorkflowContentProps> = ({
    workflow,
    defaultDetailMode = 'full',
    embeddedInDialog = false,
    onPrimaryAction,
    onOpenWorkspace,
    onOpenActivity = () => undefined,
    activityEvents = [],
    activitySessionId = '',
    activityDatasetId = null,
    onConfirmStructureBoundary,
    onSaveStructureBoundaryOverride,
}) => {
    const [showTechnicalDetails, setShowTechnicalDetails] = React.useState(defaultDetailMode === 'full');
    const latestPipelineTrace = summarizeTraceContract(workflow.operationalSignals.latestPipelineTrace);
    const latestToolTrace = summarizeTraceContract(workflow.operationalSignals.latestToolTrace);
    const latestTelemetryTrace = summarizeTraceContract(workflow.operationalSignals.latestTelemetryTrace);
    const structureReview = workflow.structureReview;
    const carryForwardAppliedCount = Object.values<number>(structureReview?.canonicalBuildMeta?.carryForwardAppliedCounts ?? {})
        .reduce((sum, count) => sum + Number(count), 0);
    const excludedGroupRows = structureReview?.canonicalBuildMeta?.excludedRowCounts?.group_header ?? 0;
    const excludedSummaryRows = (structureReview?.canonicalBuildMeta?.excludedRowCounts?.summary ?? 0)
        + (structureReview?.canonicalBuildMeta?.excludedRowCounts?.footer ?? 0)
        + (structureReview?.canonicalBuildMeta?.excludedRowCounts?.subtotal ?? 0);
    const [headerRowInput, setHeaderRowInput] = React.useState('');
    const [bodyStartInput, setBodyStartInput] = React.useState('');
    const [summaryStartInput, setSummaryStartInput] = React.useState('');

    React.useEffect(() => {
        const detectedBoundary = structureReview?.detectedBoundary;
        setHeaderRowInput(detectedBoundary?.headerRowIndex !== null && detectedBoundary?.headerRowIndex !== undefined ? String(detectedBoundary.headerRowIndex + 1) : '');
        setBodyStartInput(detectedBoundary?.bodyStartIndex !== null && detectedBoundary?.bodyStartIndex !== undefined ? String(detectedBoundary.bodyStartIndex + 1) : '');
        setSummaryStartInput(detectedBoundary?.summaryStartIndex !== null && detectedBoundary?.summaryStartIndex !== undefined ? String(detectedBoundary.summaryStartIndex + 1) : '');
    }, [structureReview]);

    const parseOneBasedIndex = (value: string) => {
        const parsed = Number.parseInt(value.trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : null;
    };

    const handleSaveBoundaryOverride = () => {
        const headerRowIndex = parseOneBasedIndex(headerRowInput);
        const bodyStartIndex = parseOneBasedIndex(bodyStartInput);
        const summaryStartIndex = summaryStartInput.trim() ? parseOneBasedIndex(summaryStartInput) : null;
        if (headerRowIndex === null || bodyStartIndex === null) {
            return;
        }

        onSaveStructureBoundaryOverride({
            headerRowIndex,
            headerLayerRowIndexes: structureReview?.detectedBoundary?.headerLayerRowIndexes ?? [],
            bodyStartIndex,
            summaryStartIndex,
            parameterRowIndexes: structureReview?.detectedBoundary?.parameterRowIndexes ?? [],
            repeatedHeaderRowIndexes: structureReview?.detectedBoundary?.repeatedHeaderRowIndexes ?? [],
        });
    };

    return (
    <section className="rounded-card border border-slate-200 bg-white shadow-sm p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            {!embeddedInDialog && <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">AI Data IDE workflow</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Data Preparation Workflow</h2>
                <p className="mt-1 text-sm text-slate-500">Fullscreen review of import, inspect, prepare, verify, and analysis gating. Use Artifacts for full handoff files and diagnostics.</p>
            </div>}
            <div className="flex flex-wrap items-center gap-2">
                {workflow.preparation.badgeLabel && (
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badgeClasses[workflow.preparation.badgeLabel]}`}>
                        {workflow.preparation.badgeLabel}
                    </span>
                )}
                <button
                    onClick={onPrimaryAction}
                    className="min-h-[44px] px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors md:min-h-0"
                >
                    {workflow.cta.primaryLabel}
                </button>
                <button
                    onClick={onOpenWorkspace}
                    className="min-h-[44px] px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors md:min-h-0"
                >
                    {workflow.cta.secondaryLabel}
                </button>
                <button
                    onClick={onOpenActivity}
                    className="min-h-[44px] px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors md:min-h-0"
                >
                    Assistant Activity
                </button>
            </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-5">
            {workflow.steps.map(step => (
                <div key={step.id} className="rounded-card border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stepStatusClasses[step.status]}`}>
                            {step.status.replace('_', ' ')}
                        </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">{step.description}</p>
                </div>
            ))}
        </div>

        <section className="mt-6 rounded-card border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
                <div>
                    <p className="text-slate-500">Dataset</p>
                    <p className="mt-1 font-semibold text-slate-900 break-all">{workflow.summary.fileName}</p>
                </div>
                <div>
                    <p className="text-slate-500">Rows prepared</p>
                    <p className="mt-1 font-semibold text-slate-900">{workflow.summary.preparedRowCount} of {workflow.summary.rawRowCount}</p>
                </div>
                <div>
                    <p className="text-slate-500">Verification</p>
                    <p className="mt-1 font-semibold text-slate-900">{workflow.verification.overallStatus}</p>
                </div>
                <div>
                    <p className="text-slate-500">Analysis</p>
                    <p className="mt-1 font-semibold text-slate-900">{workflow.summary.analysisState.replace('_', ' ')}</p>
                </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <p className="text-sm text-slate-600">
                    {workflow.summary.issueCount > 0
                        ? `${workflow.summary.issueCount} issue${workflow.summary.issueCount === 1 ? '' : 's'} recorded. Review technical details only when you need to diagnose or override the preparation.`
                        : 'No preparation issues were recorded. Technical details remain available for audit.'}
                </p>
                <button
                    type="button"
                    aria-expanded={showTechnicalDetails}
                    onClick={() => setShowTechnicalDetails(current => !current)}
                    className="min-h-[44px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                    {showTechnicalDetails ? 'Hide technical workflow details' : 'Show technical workflow details'}
                </button>
            </div>
        </section>

        {showTechnicalDetails && (
        <>

        <section className="mt-6 rounded-card border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-slate-900">Assistant Activity</h3>
                    <p className="mt-1 text-sm text-slate-500">
                        Report-scoped intake, preparation, research, tool, approval, artifact, and terminal events.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onOpenActivity}
                    className="min-h-[44px] rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 md:min-h-0"
                >
                    Open Full Activity
                </button>
            </div>
            <AgentActivityView
                events={activityEvents}
                sessionId={activitySessionId}
                datasetId={activityDatasetId}
                limit={8}
                compact
            />
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="rounded-card border border-slate-200 p-4">
                <h3 className="text-base font-semibold text-slate-900">Dataset Facts</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 text-sm">
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">File</p>
                        <p className="mt-1 font-semibold text-slate-900 break-all">{workflow.summary.fileName}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Rows</p>
                        <p className="mt-1 font-semibold text-slate-900">{workflow.summary.rawRowCount} raw {'->'} {workflow.summary.preparedRowCount} prepared</p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Structure</p>
                        <p className="mt-1 font-semibold text-slate-900">Header {workflow.summary.headerDepth} · Summary {workflow.summary.summaryRowCount}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Metadata Rows</p>
                        <p className="mt-1 font-semibold text-slate-900">{workflow.summary.metadataRowCount}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Issues</p>
                        <p className="mt-1 font-semibold text-slate-900">{workflow.summary.issueCount}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Analysis</p>
                        <p className="mt-1 font-semibold text-slate-900">{workflow.summary.analysisState.replace('_', ' ')}</p>
                    </div>
                </div>
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Parser Diagnostics</p>
                            <p className="mt-1 text-sm text-slate-700">
                                {workflow.summary.parserStrategy ?? 'unknown'} · {workflow.summary.parserConfidence ?? 'unknown'} confidence
                            </p>
                        </div>
                        <div className="text-sm text-slate-600">
                            Delimiter: <span className="font-medium text-slate-900">{formatDelimiter(workflow.summary.detectedDelimiter)}</span>
                            {' · '}
                            Quote: <span className="font-medium text-slate-900">{formatQuote(workflow.summary.detectedQuoteChar)}</span>
                        </div>
                    </div>
                    <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warnings</p>
                        {workflow.summary.parserWarnings.length === 0 ? (
                            <p className="mt-1 text-sm text-slate-700">No parser warnings recorded.</p>
                        ) : (
                            <ul className="mt-1 space-y-1 text-sm text-slate-700 list-disc list-inside">
                                {workflow.summary.parserWarnings.slice(0, 2).map(warning => (
                                    <li key={warning}>{warning}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </section>

            {structureReview && (
                <section className="rounded-card border border-slate-200 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h3 className="text-base font-semibold text-slate-900">Structure Review</h3>
                            <p className="mt-1 text-sm text-slate-600">
                                {structureReview.requiresHumanReview
                                    ? 'Boundary confirmation is required before automatic analysis can trust the canonical dataset.'
                                    : 'Current report boundary is resolved. You can still override it if needed.'}
                            </p>
                        </div>
                        <span className={`inline-flex items-center self-start rounded-full border px-3 py-1 text-xs font-semibold ${
                            structureReview.requiresHumanReview
                                ? 'border-amber-200 bg-amber-100 text-amber-800'
                                : 'border-emerald-200 bg-emerald-100 text-emerald-800'
                        }`}>
                            {structureReview.source ?? 'unknown source'}
                        </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
                        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                            <p className="text-slate-500">Header row</p>
                            <p className="mt-1 font-semibold text-slate-900">
                                {structureReview.detectedBoundary?.headerRowIndex !== null && structureReview.detectedBoundary?.headerRowIndex !== undefined
                                    ? structureReview.detectedBoundary.headerRowIndex + 1
                                    : 'unknown'}
                            </p>
                        </div>
                        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                            <p className="text-slate-500">Body start</p>
                            <p className="mt-1 font-semibold text-slate-900">
                                {structureReview.detectedBoundary?.bodyStartIndex !== null && structureReview.detectedBoundary?.bodyStartIndex !== undefined
                                    ? structureReview.detectedBoundary.bodyStartIndex + 1
                                    : 'unknown'}
                            </p>
                        </div>
                        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                            <p className="text-slate-500">Summary start</p>
                            <p className="mt-1 font-semibold text-slate-900">
                                {structureReview.detectedBoundary?.summaryStartIndex !== null && structureReview.detectedBoundary?.summaryStartIndex !== undefined
                                    ? structureReview.detectedBoundary.summaryStartIndex + 1
                                    : 'none'}
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-4 text-sm">
                        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                            <p className="text-slate-500">Overall confidence</p>
                            <p className="mt-1 font-semibold text-slate-900">{Math.round((structureReview.confidence?.overall ?? 0) * 100)}%</p>
                        </div>
                        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                            <p className="text-slate-500">Canonicalization</p>
                            <p className="mt-1 font-semibold text-slate-900">{structureReview.canonicalizationStatus.replace('_', ' ')}</p>
                        </div>
                        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                            <p className="text-slate-500">Canonical rows</p>
                            <p className="mt-1 font-semibold text-slate-900">{structureReview.canonicalBuildMeta?.rowCount ?? 0}</p>
                        </div>
                        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                            <p className="text-slate-500">Pipeline outcome</p>
                            <p className="mt-1 font-semibold text-slate-900">{structureReview.pipelineOutcome?.status?.replace(/_/g, ' ') ?? 'not resolved'}</p>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-4 text-sm">
                        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                            <p className="text-slate-500">Group rows excluded</p>
                            <p className="mt-1 font-semibold text-slate-900">{excludedGroupRows}</p>
                        </div>
                        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                            <p className="text-slate-500">Summary/footer excluded</p>
                            <p className="mt-1 font-semibold text-slate-900">{excludedSummaryRows}</p>
                        </div>
                        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                            <p className="text-slate-500">Carry-forward applied</p>
                            <p className="mt-1 font-semibold text-slate-900">{carryForwardAppliedCount}</p>
                        </div>
                        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                            <p className="text-slate-500">Footer totals</p>
                            <p className="mt-1 font-semibold text-slate-900">
                                {structureReview.canonicalBuildMeta?.footerTotalsMatched === null
                                    ? 'not checked'
                                    : structureReview.canonicalBuildMeta?.footerTotalsMatched
                                        ? 'matched'
                                        : 'mismatch'}
                            </p>
                        </div>
                    </div>
                    {structureReview.proposalVerification && (
                        <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">Model structure proposal</p>
                                    <p className="mt-1 text-xs text-slate-600">
                                        {structureReview.proposalVerification.purpose ?? 'Purpose was not resolved.'}
                                    </p>
                                </div>
                                <span
                                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                        structureReview.proposalVerification.tier === 'pass'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : structureReview.proposalVerification.tier === 'warn'
                                                ? 'bg-amber-100 text-amber-800'
                                                : 'bg-rose-100 text-rose-800'
                                    }`}
                                >
                                    {structureReview.proposalVerification.tier.toUpperCase()}
                                </span>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs">
                                <div className="rounded-md bg-slate-50 p-3">
                                    <p className="text-slate-500">Verified grain</p>
                                    <p className="mt-1 font-medium text-slate-900">
                                        {structureReview.proposalVerification.grainColumns.join(', ') || 'unresolved'}
                                    </p>
                                </div>
                                <div className="rounded-md bg-slate-50 p-3">
                                    <p className="text-slate-500">Pivot shape</p>
                                    <p className="mt-1 font-medium text-slate-900">
                                        {structureReview.proposalVerification.pivotShape?.replace(/_/g, ' ') ?? 'unknown'}
                                    </p>
                                </div>
                                <div className="rounded-md bg-slate-50 p-3">
                                    <p className="text-slate-500">Proposal confidence</p>
                                    <p className="mt-1 font-medium text-slate-900">
                                        {Math.round(structureReview.proposalVerification.proposalConfidence * 100)}%
                                    </p>
                                </div>
                            </div>
                            {structureReview.proposalVerification.issues.length > 0 && (
                                <ul className="mt-3 space-y-1 text-xs text-slate-700 list-disc list-inside">
                                    {structureReview.proposalVerification.issues.map(issue => (
                                        <li key={`${issue.code}:${issue.message}`}>{issue.message}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                    {(structureReview.verificationSummary?.unresolvedMissingKeyDimensions?.length ?? 0) > 0 && (
                        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            <p className="font-semibold">Unresolved dimensions after carry-forward</p>
                            <p className="mt-1">{structureReview.verificationSummary?.unresolvedMissingKeyDimensions.join(', ')}</p>
                        </div>
                    )}
                    {structureReview.blockingReasons.length > 0 && (
                        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            <p className="font-semibold">Blocking reasons</p>
                            <ul className="mt-2 space-y-1 list-disc list-inside">
                                {structureReview.blockingReasons.map(reason => (
                                    <li key={reason}>{reason}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-semibold text-slate-900">Boundary confirmation</p>
                        <p className="mt-1 text-xs text-slate-600">Enter 1-based row numbers. Saving an override marks the structure as human confirmed and rebuilds the canonical dataset.</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            <label className="text-sm text-slate-700">
                                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Header Row</span>
                                <input
                                    value={headerRowInput}
                                    onChange={event => setHeaderRowInput(event.target.value)}
                                    className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:min-h-0"
                                    inputMode="numeric"
                                />
                            </label>
                            <label className="text-sm text-slate-700">
                                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Body Start</span>
                                <input
                                    value={bodyStartInput}
                                    onChange={event => setBodyStartInput(event.target.value)}
                                    className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:min-h-0"
                                    inputMode="numeric"
                                />
                            </label>
                            <label className="text-sm text-slate-700">
                                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Summary Start</span>
                                <input
                                    value={summaryStartInput}
                                    onChange={event => setSummaryStartInput(event.target.value)}
                                    className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:min-h-0"
                                    inputMode="numeric"
                                    placeholder="optional"
                                />
                            </label>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button
                                onClick={onConfirmStructureBoundary}
                                className="min-h-[44px] rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors md:min-h-0"
                            >
                                Confirm Detected Boundary
                            </button>
                            <button
                                onClick={handleSaveBoundaryOverride}
                                className="min-h-[44px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors md:min-h-0"
                            >
                                Save Boundary Override
                            </button>
                        </div>
                    </div>
                </section>
            )}

            <section className="rounded-card border border-slate-200 p-4">
                <h3 className="text-base font-semibold text-slate-900">Issue -&gt; Action -&gt; Result</h3>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-700">
                        {countLabel(workflow.issueSummary.mappings.length, 'workflow action', 'workflow actions')}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-700">
                        {countLabel(workflow.issueSummary.topWarnings.length, 'top warning', 'top warnings')}
                    </span>
                </div>
                <div className="mt-3 space-y-3">
                    {workflow.issueSummary.mappings.length === 0 ? (
                        <p className="text-sm text-slate-500">No deterministic preparation actions or blockers were recorded for this run.</p>
                    ) : workflow.issueSummary.mappings.map(mapping => (
                        <div key={`${mapping.issue}-${mapping.result}`} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Issue</p>
                                    <p className="text-sm font-semibold text-slate-900">{mapping.issue}</p>
                                </div>
                                <span className={`inline-flex items-center self-start rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${mappingResultClasses[mapping.result]}`}>
                                    {formatResultLabel(mapping.result)}
                                </span>
                            </div>
                            <div className="mt-3 rounded-md border border-white/70 bg-white px-3 py-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action</p>
                                <p className="mt-1 text-sm text-slate-700">{mapping.action}</p>
                            </div>
                        </div>
                    ))}
                </div>
                {workflow.issueSummary.topWarnings.length > 0 && (
                    <div className="mt-4">
                        <p className="text-sm font-semibold text-slate-900">Top warnings</p>
                        <ul className="mt-2 space-y-1 text-sm text-slate-700 list-disc list-inside">
                            {workflow.issueSummary.topWarnings.map(warning => (
                                <li key={warning}>{warning}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>

            <section className="rounded-card border border-slate-200 p-4">
                <h3 className="text-base font-semibold text-slate-900">Preparation Result</h3>
                <p className="mt-3 text-sm text-slate-700">
                    {workflow.preparation.blockedMessage ?? workflow.preparation.explanation ?? 'No AI cleaning explanation was stored for this run.'}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Operation pipeline</p>
                        <p className="mt-1 font-semibold text-slate-900">
                            {workflow.preparation.noExecutableOperations
                                ? 'No executable operations'
                                : countLabel(workflow.preparation.operationCount, 'operation', 'operations')}
                        </p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Baseline noise rows removed</p>
                        <p className="mt-1 font-semibold text-slate-900">{workflow.summary.baselineNoiseRowsRemoved}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Plan status</p>
                        <p className="mt-1 font-semibold text-slate-900">{workflow.summary.planStatus ?? 'not started'}</p>
                    </div>
                </div>
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">Operation Pipeline</p>
                    {workflow.preparation.operations.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500">No executable operations were stored for this run. Prepared rows therefore reflect deterministic baseline preparation only.</p>
                    ) : (
                        <ol className="mt-2 space-y-2 text-sm text-slate-700 list-decimal list-inside">
                            {workflow.preparation.operations.map(operation => (
                                <li key={operation.id}>
                                    <span className="font-medium">{operation.type}</span>: {operation.reason}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </section>

            <section className="rounded-card border border-slate-200 p-4">
                <h3 className="text-base font-semibold text-slate-900">Verification & Diff Preview</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Overall</p>
                        <p className="mt-1 font-semibold text-slate-900">{workflow.verification.overallStatus}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Dataset Safety</p>
                        <p className="mt-1 font-semibold text-slate-900">{workflow.verification.datasetSafetyStatus}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Cleaning Consistency</p>
                        <p className="mt-1 font-semibold text-slate-900">{workflow.verification.cleaningConsistencyStatus}</p>
                    </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">SQL Precheck</p>
                        <p className="mt-1 font-semibold text-slate-900">{workflow.verification.sqlPrecheckStatus}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Blocking SQL findings</p>
                        <p className="mt-1 font-semibold text-slate-900">{workflow.verification.sqlPrecheckBlockingFindings.length}</p>
                    </div>
                </div>
                {workflow.verification.sqlPrecheckSummary && (
                    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">SQL precheck summary</p>
                        <p className="mt-1">{workflow.verification.sqlPrecheckSummary}</p>
                    </div>
                )}
                {workflow.verification.sqlPrecheckBlockingFindings.length > 0 && (
                    <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                        <p className="font-semibold">Blocking SQL precheck findings</p>
                        <ul className="mt-2 space-y-1 list-disc list-inside">
                            {workflow.verification.sqlPrecheckBlockingFindings.map((finding, index) => (
                                <li key={`${finding.kind}-${finding.column ?? finding.metric ?? finding.dimension ?? index}`}>
                                    {finding.message}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {workflow.verification.shapeFailureSignalKey && (
                    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <p className="font-semibold">Shape verification detail</p>
                        <p className="mt-1">
                            Signal: <span className="font-mono">{workflow.verification.shapeFailureSignalKey}</span>
                        </p>
                        {workflow.verification.shapeFailureDetail && (
                            <p className="mt-1 font-mono text-xs break-all">{workflow.verification.shapeFailureDetail}</p>
                        )}
                    </div>
                )}
                <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Row delta</p>
                        <p className="mt-1 font-semibold text-slate-900">{workflow.diff.rowCountBefore} {'->'} {workflow.diff.rowCountAfter} ({workflow.diff.rowCountDelta >= 0 ? '+' : ''}{workflow.diff.rowCountDelta})</p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Schema delta</p>
                        <p className="mt-1 font-semibold text-slate-900">
                            {workflow.diff.removedColumns.length} removed · {workflow.diff.addedColumns.length} added · {workflow.diff.changedColumns.length} type changes
                        </p>
                    </div>
                </div>
                {(workflow.diff.removedColumns.length > 0 || workflow.diff.addedColumns.length > 0 || workflow.diff.changedColumns.length > 0) && (
                    <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        {workflow.diff.removedColumns.length > 0 && (
                            <div>
                                <p className="font-semibold text-slate-900">Removed columns</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {workflow.diff.removedColumns.map(column => (
                                        <span key={`removed-${column}`} className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                                            {column}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {workflow.diff.addedColumns.length > 0 && (
                            <div>
                                <p className="font-semibold text-slate-900">Added columns</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {workflow.diff.addedColumns.map(column => (
                                        <span key={`added-${column}`} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                            {column}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {workflow.diff.changedColumns.length > 0 && (
                            <div>
                                <p className="font-semibold text-slate-900">Type changes</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {workflow.diff.changedColumns.map(change => (
                                        <span key={`changed-${change.name}`} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                                            {`${change.name}: ${change.before ?? 'unknown'} -> ${change.after ?? 'unknown'}`}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </section>

            <section className="rounded-card border border-slate-200 p-4">
                <h3 className="text-base font-semibold text-slate-900">Operational Signals</h3>
                <p className="mt-2 text-sm text-slate-600">Canonical trace contract fields exposed directly from cleaning, tool, and telemetry surfaces.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Pipeline trace</p>
                        <p className="mt-1 font-semibold text-slate-900">{latestPipelineTrace?.reasonCode ?? 'None'}</p>
                        <p className="mt-1 text-xs text-slate-600">{latestPipelineTrace?.contractVersion ?? 'N/A'}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Tool trace</p>
                        <p className="mt-1 font-semibold text-slate-900">{latestToolTrace?.reasonCode ?? 'None'}</p>
                        <p className="mt-1 text-xs text-slate-600">{latestToolTrace?.retryClass ?? 'No retry class'}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                        <p className="text-slate-500">Telemetry trace</p>
                        <p className="mt-1 font-semibold text-slate-900">{latestTelemetryTrace?.reasonCode ?? 'None'}</p>
                        <p className="mt-1 text-xs text-slate-600">{latestTelemetryTrace?.source ?? 'N/A'}</p>
                    </div>
                </div>
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Latest fallback path</p>
                    <p className="mt-1">{workflow.operationalSignals.latestFallbackPath ?? 'No fallback path recorded.'}</p>
                </div>
            </section>
        </div>
        </>
        )}
    </section>
    );
};
