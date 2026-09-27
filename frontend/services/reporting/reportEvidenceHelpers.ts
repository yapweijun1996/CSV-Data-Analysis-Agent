import type { AppStore } from '../../store/useAppStore';
import type {
    DisplayAnalysisIr,
    ReportCardEvidence,
    ReportDatasetEvidence,
    ReportQueryEvidence,
    ReportReadiness,
    ReportStructuralSignals,
    ReportWorkflowEvidence,
} from '../../types';
import { buildDataPreparationWorkflowBundle } from '../agent/buildDataPreparationWorkflowBundle';
import { buildCleaningInspectionBundle } from '../agent/buildCleaningInspectionBundle';
import { resolveAnalysisArtifactFreshness } from '../agent/artifactProvenance';
import { resolveCardTrustDecision } from '../agent/cardTrustDecision';

export const MAX_CARD_SAMPLE_ROWS = 8;
export const MAX_REPORT_CHART_ROWS = 24;
export const MAX_CAVEATS = 8;
export const MAX_DETAIL_CHARS = 140;
export const PARTIAL_ROW_EXPANSION_THRESHOLD = 3;

export const trimText = (value: unknown) => String(value ?? '').trim();

export const dedupeStrings = (values: Array<string | null | undefined>, limit?: number) => {
    const seen = new Set<string>();
    const output: string[] = [];

    for (const value of values) {
        const normalized = trimText(value);
        if (!normalized) {
            continue;
        }

        const key = normalized.toLowerCase();
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        output.push(normalized);
        if (typeof limit === 'number' && output.length >= limit) {
            break;
        }
    }

    return output;
};

export const truncateDetail = (value: string, maxChars = MAX_DETAIL_CHARS) => {
    if (value.length <= maxChars) {
        return value;
    }
    return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
};

export const buildDatasetContextDetail = (dataset: ReportDatasetEvidence) => truncateDetail([
    dataset.reportTitle || dataset.fileName || 'Untitled dataset',
    `${dataset.rawRowCount} raw row(s) -> ${dataset.cleanedRowCount} cleaned row(s)`,
    dataset.datasetVersion ? `version=${dataset.datasetVersion}` : 'version=unverified',
    dataset.parserConfidence ? `parser=${dataset.parserConfidence}` : null,
].filter(Boolean).join(' | '));

export const buildPreparationDetail = (
    dataset: ReportDatasetEvidence,
    workflow: ReportWorkflowEvidence,
) => truncateDetail([
    dataset.preparationState,
    `${workflow.issueMappings.length} issue mapping(s)`,
    `${dataset.cardsCount} card(s)`,
].join(' | '));

export const buildVerificationDetail = (workflow: ReportWorkflowEvidence) => truncateDetail([
    `overall=${workflow.verification.overallStatus}`,
    `sql=${workflow.verification.sqlPrecheckStatus}`,
    `blocked=${workflow.verification.downstreamAnalysisBlocked ? 'yes' : 'no'}`,
].join(' | '));

export const buildSummaryDetail = (value: string) => truncateDetail(value.replace(/\s+/g, ' '));

export const buildQueryDetail = (query: ReportQueryEvidence) => truncateDetail([
    query.engine ? `${query.engine} query` : 'query',
    query.queryTraceId ? `trace=${query.queryTraceId}` : null,
    `${query.returnedRows ?? 0}/${query.totalMatchedRows ?? 0} row(s)`,
    query.explanation,
].filter(Boolean).join(' | '));

export const buildCardDetail = (card: ReportCardEvidence) => truncateDetail([
    card.artifactType ?? card.chartType,
    `${card.rowCount} row(s)`,
    `evidence=${card.provenanceIsStale ? 'stale' : card.provenanceStatus}`,
    card.queryTraceId ? `trace=${card.queryTraceId}` : null,
    trimText(card.summary?.text ?? ''),
].filter(Boolean).join(' | '));

const formatRatio = (value: number): string => value.toFixed(1);

export const buildReadinessLabel = (readiness: ReportReadiness): string => {
    if (readiness === 'ready') {
        return 'Ready for bounded analyst synthesis';
    }

    if (readiness === 'partial') {
        return 'Usable with material caveats';
    }

    return 'Not ready for analyst synthesis';
};

export interface ReportReadinessAssessment {
    reportReadiness: ReportReadiness;
    reportReadinessReason: string;
    readinessDrivers: string[];
    readinessRisks: string[];
    structuralSignals: ReportStructuralSignals;
}

export const resolveReportReadinessAssessment = (
    state: AppStore,
    workflow: ReturnType<typeof buildDataPreparationWorkflowBundle>,
    inspection: ReturnType<typeof buildCleaningInspectionBundle>,
    caveats: string[],
): ReportReadinessAssessment => {
    const rawRowCount = inspection.importFacts.rawRowCount;
    const cleanedRowCount = inspection.importFacts.cleanedRowCount;
    const rowExpansionRatio = rawRowCount > 0 ? cleanedRowCount / rawRowCount : null;
    const parserConfidence = inspection.importFacts.parserConfidence;
    const cardsCount = state.analysisCards.length;
    const verificationWarnings = dedupeStrings([
        ...workflow.issueSummary.topWarnings,
        ...workflow.verification.warnings,
    ]);
    const hasWorkflowWarnings = verificationWarnings.length > 0;
    const usedFallbackContext = Boolean(inspection.reportContext.verification?.usedFallback)
        || inspection.reportContext.effective.source === 'fallback';
    const hasContextNotes = inspection.reportContext.effective.notes.length > 0;
    const hasStructuralAmbiguity = (
        inspection.importFacts.metadataRowCount > 0
        || inspection.importFacts.headerDepth > 1
    ) && hasContextNotes;
    const hasShapeInflation = rowExpansionRatio !== null && rowExpansionRatio > PARTIAL_ROW_EXPANSION_THRESHOLD;
    const parserConfidenceLimited = parserConfidence !== 'high';

    const structuralSignals: ReportStructuralSignals = {
        rowExpansionRatio,
        hasMetadataRows: inspection.importFacts.metadataRowCount > 0,
        hasMultiRowHeader: inspection.importFacts.headerDepth > 1,
        usedFallbackContext,
    };

    const readinessDrivers = dedupeStrings([
        cardsCount > 0 ? `Trusted analysis cards exist (${cardsCount}).` : null,
        parserConfidence === 'high' ? 'Parser confidence is high.' : null,
        workflow.verification.overallStatus === 'passed'
            && workflow.verification.sqlPrecheckStatus === 'passed'
            && !hasWorkflowWarnings
            ? 'Workflow verification passed without unresolved warnings.'
            : null,
        !hasShapeInflation && !hasStructuralAmbiguity && !usedFallbackContext
            ? 'No material structural ambiguity was detected.'
            : null,
        caveats.length === 0 ? 'No dataset caveats were recorded in the evidence bundle.' : null,
    ], MAX_CAVEATS);

    const readinessRisks = dedupeStrings([
        !state.csvData ? 'No prepared dataset is loaded.' : null,
        cardsCount === 0 ? 'Trusted analysis cards are not available yet.' : null,
        parserConfidenceLimited ? 'Parser confidence is limited.' : null,
        workflow.summary.intakeGateStatus === 'warning'
            ? 'Intake diagnostics still carry warning-level uncertainty.' : null,
        hasWorkflowWarnings ? 'Workflow warnings remain unresolved.' : null,
        workflow.verification.sqlPrecheckStatus !== 'passed'
            ? `SQL precheck status is ${workflow.verification.sqlPrecheckStatus}.` : null,
        caveats.length > 0 ? `${caveats.length} dataset caveat(s) remain active.` : null,
        hasShapeInflation && rowExpansionRatio !== null
            ? `Cleaned rows expanded ${formatRatio(rowExpansionRatio)}x over raw rows.` : null,
        hasStructuralAmbiguity ? 'Metadata/header recovery signals suggest structural ambiguity.' : null,
        usedFallbackContext ? 'Report context required fallback recovery.' : null,
    ], MAX_CAVEATS);

    const base = { readinessDrivers, readinessRisks, structuralSignals };
    const blocked = (reason: string): ReportReadinessAssessment =>
        ({ reportReadiness: 'blocked', reportReadinessReason: reason, ...base });

    if (!state.csvData) {
        return blocked('Not ready for analyst synthesis because no prepared dataset is loaded.');
    }
    if (workflow.summary.intakeGateStatus === 'blocked') {
        return blocked(trimText(workflow.summary.intakeGateMessage)
            || 'Not ready for analyst synthesis because intake diagnostics blocked analysis.');
    }
    if (workflow.verification.datasetSafetyStatus === 'failed') {
        return blocked('Not ready for analyst synthesis because dataset safety checks failed.');
    }
    if (workflow.verification.cleaningConsistencyStatus === 'blocked' || workflow.verification.downstreamAnalysisBlocked) {
        return blocked('Not ready for analyst synthesis because cleaning consistency blocked downstream analysis.');
    }
    if (workflow.verification.sqlPrecheckStatus === 'blocked') {
        return blocked(inspection.verification.sqlPrecheckSummary
            ?? 'Not ready for analyst synthesis because SQL precheck blocked automatic analysis.');
    }
    if (workflow.verification.sqlPrecheckStatus === 'warning') {
        return {
            reportReadiness: 'partial', ...base,
            reportReadinessReason: inspection.verification.sqlPrecheckSummary
                ?? 'SQL precheck could not confirm the preferred SQL path, so analyst synthesis should proceed with explicit caveats.',
        };
    }
    if (!workflow.summary.canAnalyze) {
        return blocked('Not ready for analyst synthesis because the prepared dataset is not eligible for downstream analysis.');
    }

    const shouldDowngradeToPartial = (
        cardsCount === 0 || parserConfidenceLimited || hasWorkflowWarnings
        || caveats.length > 0 || hasShapeInflation || hasStructuralAmbiguity || usedFallbackContext
    );

    if (shouldDowngradeToPartial) {
        let reason = 'Usable for bounded synthesis, but material caveats still limit executive certainty.';
        if (cardsCount === 0) {
            reason = 'Usable for bounded synthesis inputs, but trusted analysis cards are still missing.';
        } else if (hasShapeInflation || hasStructuralAmbiguity) {
            reason = 'Usable for bounded synthesis, but structural caveats still limit executive certainty.';
        } else if (parserConfidenceLimited || hasWorkflowWarnings || usedFallbackContext) {
            reason = 'Usable for bounded synthesis, but workflow and context caveats still limit executive certainty.';
        }
        return { reportReadiness: 'partial', reportReadinessReason: reason, ...base };
    }

    return {
        reportReadiness: 'ready', ...base,
        reportReadinessReason: 'Ready for bounded analyst synthesis with no material structural or workflow caveats detected.',
    };
};

export const applyQualityReadinessAdjustment = (
    assessment: ReportReadinessAssessment,
    qualityHintsSummary: string,
    datasetSignalsCount: number,
    trustedCardsCount: number,
    includedCardsCount: number,
): ReportReadinessAssessment => {
    if (assessment.reportReadiness === 'blocked') {
        return assessment;
    }

    if (datasetSignalsCount === 0 && !(includedCardsCount > 0 && trustedCardsCount === 0)) {
        return assessment;
    }

    const readinessRisks = dedupeStrings([
        ...assessment.readinessRisks,
        qualityHintsSummary || null,
        includedCardsCount > 0 && trustedCardsCount === 0
            ? 'Only caveated analysis cards are available; definitive reporting should remain limited.'
            : null,
    ], MAX_CAVEATS);

    return {
        ...assessment,
        reportReadiness: 'partial',
        reportReadinessReason: assessment.reportReadiness === 'ready'
            ? 'Usable for bounded synthesis, but data quality caveats still limit executive certainty.'
            : assessment.reportReadinessReason,
        readinessRisks,
    };
};

export const buildCardEvidence = (
    card: AppStore['analysisCards'][number],
    irByCardId: Map<string, DisplayAnalysisIr>,
    currentDatasetVersion: string | null = null,
): ReportCardEvidence => {
    const ir = irByCardId.get(card.id);
    const freshness = resolveAnalysisArtifactFreshness(card.provenance, currentDatasetVersion);
    const trustDecision = resolveCardTrustDecision(card, currentDatasetVersion);

    return {
        evidenceId: `card.${card.id}`,
        cardId: card.id,
        isFallback: card.plan.isFallback === true,
        title: card.plan.title,
        displayTitle: ir?.displayTitle ?? card.plan.title,
        description: ir?.displayDescription ?? card.plan.description,
        artifactType: card.plan.artifactType ?? null,
        chartType: card.displayChartType,
        groupByColumn: card.plan.groupByColumn ?? null,
        valueColumn: card.plan.valueColumn ?? null,
        aggregation: card.plan.aggregation ?? null,
        rowCount: card.aggregatedData.length,
        summary: card.summary ?? null,
        aggregatedDataSample: card.aggregatedData.slice(0, MAX_CARD_SAMPLE_ROWS),
        reportChartRows: card.aggregatedData.slice(0, MAX_REPORT_CHART_ROWS),
        semanticRole: ir?.semanticRole ?? null,
        helperExposureLevel: ir?.helperExposureLevel ?? null,
        businessMeaningConfidence: typeof ir?.businessMeaningConfidence === 'number'
            ? ir.businessMeaningConfidence
            : null,
        aggregationQualityFlags: ir?.aggregationQualityFlags ?? [],
        sourceTopic: card.sourceTopic ?? null,
        autoAnalysisVerdict: card.autoAnalysisEvaluation?.verdict ?? null,
        autoAnalysisVerdictDetail: card.autoAnalysisEvaluation?.detail ?? null,
        autoAnalysisReasonCodes: card.autoAnalysisEvaluation?.reasonCodes ?? [],
        evidenceValueGateDecision: card.evidenceValueGate?.decision ?? null,
        evidenceValueGateDetail: card.evidenceValueGate?.detail ?? null,
        evidenceValueGateReasonCodes: card.evidenceValueGate?.reasonCodes ?? [],
        provenanceStatus: card.provenance?.evidenceStatus ?? 'unverified',
        provenanceDatasetVersion: card.provenance?.datasetVersion ?? null,
        currentDatasetVersion,
        provenanceIsStale: freshness === 'stale',
        provenanceReasons: card.provenance?.evidenceReasons ?? ['Artifact provenance was not recorded.'],
        provenanceRefs: card.provenance?.evidenceRefs ?? [],
        queryTraceId: card.provenance?.queryEvidence?.traceId ?? null,
        trustStatus: trustDecision.status,
        trustReasonCodes: trustDecision.reasonCodes,
    };
};
