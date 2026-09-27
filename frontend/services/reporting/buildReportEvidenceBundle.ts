import type { AppStore } from '../../store/useAppStore';
import type {
    ReportDatasetEvidence,
    ReportEvidenceBundle,
    ReportEvidenceRef,
    ReportQueryEvidence,
    ReportSummaryEvidence,
    ReportWorkflowEvidence,
} from '../../types';
import { buildCleaningInspectionBundle } from '../agent/buildCleaningInspectionBundle';
import { buildDataPreparationWorkflowBundle } from '../agent/buildDataPreparationWorkflowBundle';
import { buildDisplayAnalysisIrList } from '../dashboard/displayAnalysisIr';
import { resolveReportCardTrust, resolveReportGenerationGateV2 } from './reportEvidenceTrust';
import { buildDatasetContext } from '../agent/contextBuilder';
import { analyzeDatasetQualityGovernance } from '../agent/analysisQualityGovernance';
import { attachAutoAnalysisEvaluationToCards } from '../agent/autoAnalysisEvaluation';
import {
    getCurrentAnalysisDatasetVersion,
    resolveAnalysisArtifactFreshness,
} from '../agent/artifactProvenance';
import { getPreferredAnalysisDataset } from '../agent/reportStructureState';
import {
    MAX_CAVEATS,
    trimText,
    dedupeStrings,
    truncateDetail,
    buildDatasetContextDetail,
    buildPreparationDetail,
    buildVerificationDetail,
    buildSummaryDetail,
    buildQueryDetail,
    buildCardDetail,
    buildReadinessLabel,
    resolveReportReadinessAssessment,
    applyQualityReadinessAdjustment,
    buildCardEvidence,
} from './reportEvidenceHelpers';

export const buildReportEvidenceBundle = (
    state: AppStore,
): ReportEvidenceBundle | null => {
    if (!state.csvData && !state.rawCsvData) {
        return null;
    }

    const generatedAt = new Date().toISOString();
    const inspection = buildCleaningInspectionBundle(state);
    const workflow = buildDataPreparationWorkflowBundle(state);
    const displayIrs = buildDisplayAnalysisIrList(state.analysisCards ?? [], state.columnProfiles ?? []);
    const irByCardId = new Map(displayIrs.map(ir => [ir.cardId, ir]));
    const caveats = dedupeStrings([
        workflow.summary.intakeGateMessage,
        ...workflow.issueSummary.topWarnings,
        ...workflow.verification.warnings,
        ...inspection.cleaning.consistencyIssues,
        ...inspection.reportContext.effective.notes,
    ], MAX_CAVEATS);
    const readinessAssessment = resolveReportReadinessAssessment(
        state,
        workflow,
        inspection,
        caveats,
    );
    const currentDatasetVersion = getCurrentAnalysisDatasetVersion(state);

    const workflowEvidence: ReportWorkflowEvidence = {
        topWarnings: workflow.issueSummary.topWarnings,
        issueMappings: workflow.issueSummary.mappings,
        verification: workflow.verification,
        diff: workflow.diff,
    };

    const coreFreshness = resolveAnalysisArtifactFreshness(state.aiCoreAnalysisSummaryProvenance, currentDatasetVersion);
    const finalFreshness = resolveAnalysisArtifactFreshness(state.finalSummaryProvenance, currentDatasetVersion);
    const coreProvenanceStatus = coreFreshness === 'stale'
        ? 'stale'
        : state.aiCoreAnalysisSummaryProvenance?.evidenceStatus ?? 'unverified';
    const finalProvenanceStatus = finalFreshness === 'stale'
        ? 'stale'
        : state.finalSummaryProvenance?.evidenceStatus ?? 'unverified';
    const isSummaryEligible = (status: typeof coreProvenanceStatus) =>
        status === 'verified' || status === 'degraded';
    const summaries: ReportSummaryEvidence = {
        coreAnalysisSummary: isSummaryEligible(coreProvenanceStatus) ? state.aiCoreAnalysisSummary ?? null : null,
        finalSummary: isSummaryEligible(finalProvenanceStatus) ? state.finalSummary ?? null : null,
        contextualSummary: state.contextualSummary ?? null,
        coreProvenanceStatus,
        finalProvenanceStatus,
        coreEvidenceRefs: state.aiCoreAnalysisSummaryProvenance?.evidenceRefs ?? [],
        finalEvidenceRefs: state.finalSummaryProvenance?.evidenceRefs ?? [],
    };

    const activeQueryTrace = state.activeDataQuery
        ? [...(state.queryHistory ?? [])].reverse().find(entry =>
            entry.sqlPreview === state.activeDataQuery?.sqlPreview
            && entry.loadVersion === state.activeDataQuery?.loadVersion
            && entry.explanation === state.activeDataQuery?.explanation) ?? null
        : null;
    const query: ReportQueryEvidence | null = state.activeDataQuery
        ? {
            queryTraceId: activeQueryTrace?.id ?? null,
            loadVersion: state.activeDataQuery.loadVersion ?? null,
            hasActiveQuery: true,
            explanation: state.activeDataQuery.explanation ?? null,
            sqlPreview: state.activeDataQuery.sqlPreview ?? null,
            engine: state.activeDataQuery.engine ?? null,
            totalMatchedRows: state.activeDataQuery.result?.totalMatchedRows ?? null,
            returnedRows: state.activeDataQuery.result?.returnedRows ?? null,
            selectedColumns: state.activeDataQuery.result?.selectedColumns ?? [],
        }
        : null;

    const reportDataset = getPreferredAnalysisDataset(state) ?? state.rawCsvData;
    const baseQualityGovernance = reportDataset
        ? analyzeDatasetQualityGovernance(
            state.columnProfiles,
            reportDataset,
            buildDatasetContext(
                reportDataset,
                state.columnProfiles,
                state.reportContextResolution,
                state.datasetSemanticSnapshot,
                state.semanticDatasetVersion,
                state.dataPreparationPlan ?? null,
                state.rawCsvData ?? reportDataset,
            ),
            {
                rowExpansionRatio: readinessAssessment.structuralSignals.rowExpansionRatio,
            },
        )
        : null;
    const evaluatedCards = baseQualityGovernance
        ? attachAutoAnalysisEvaluationToCards(state.analysisCards ?? [], { qualityGovernance: baseQualityGovernance })
        : state.analysisCards;
    const allCards = evaluatedCards.map(card => buildCardEvidence(card, irByCardId, currentDatasetVersion));
    const trustedEvidence = resolveReportCardTrust(allCards);
    const qualityGovernance = reportDataset
        ? analyzeDatasetQualityGovernance(
            state.columnProfiles,
            reportDataset,
            buildDatasetContext(
                reportDataset,
                state.columnProfiles,
                state.reportContextResolution,
                state.datasetSemanticSnapshot,
                state.semanticDatasetVersion,
                state.dataPreparationPlan ?? null,
                state.rawCsvData ?? reportDataset,
            ),
            {
                rowExpansionRatio: readinessAssessment.structuralSignals.rowExpansionRatio,
                totalCardCount: allCards.length,
                trustedCardCount: trustedEvidence.trustedIncludedCount,
            },
        )
        : null;
    const finalReadinessAssessment = qualityGovernance
        ? applyQualityReadinessAdjustment(
            readinessAssessment,
            qualityGovernance.qualityHintsSummary,
            qualityGovernance.datasetSignals.length,
            trustedEvidence.trustedIncludedCount,
            trustedEvidence.includedCards.length,
        )
        : readinessAssessment;
    const gateAssessment = resolveReportGenerationGateV2(
        finalReadinessAssessment.reportReadiness,
        trustedEvidence.includedCards.length,
        trustedEvidence.caveatedIncludedCount,
        finalReadinessAssessment.reportReadinessReason,
    );
    const dataset: ReportDatasetEvidence = {
        datasetVersion: currentDatasetVersion,
        tableId: state.datasetBundle?.primaryTableId ?? null,
        relationshipSetId: state.datasetBundle?.relationshipSetId ?? null,
        transformationRefs: (state.dataPreparationPlan?.operations ?? []).map(operation => ({
            kind: 'transformation',
            id: operation.id,
            label: `${operation.type}: ${operation.reason}`,
        })),
        fileName: inspection.importFacts.fileName,
        reportTitle: inspection.reportContext.effective.reportTitle,
        rawRowCount: inspection.importFacts.rawRowCount,
        cleanedRowCount: inspection.importFacts.cleanedRowCount,
        metadataRowCount: inspection.importFacts.metadataRowCount,
        headerDepth: inspection.importFacts.headerDepth,
        summaryRowCount: inspection.importFacts.summaryRowCount,
        parserStrategy: inspection.importFacts.parserStrategy,
        parserConfidence: inspection.importFacts.parserConfidence,
        intakeGateStatus: workflow.summary.intakeGateStatus,
        preparationState: workflow.summary.preparationState,
        analysisState: workflow.summary.analysisState,
        reportReadiness: finalReadinessAssessment.reportReadiness,
        reportReadinessReason: finalReadinessAssessment.reportReadinessReason,
        readinessDrivers: finalReadinessAssessment.readinessDrivers,
        readinessRisks: finalReadinessAssessment.readinessRisks,
        structuralSignals: finalReadinessAssessment.structuralSignals,
        canAnalyze: workflow.summary.canAnalyze,
        cardsCount: state.analysisCards.length,
        includedCardsCount: trustedEvidence.includedCards.length,
        trustedCardsCount: trustedEvidence.trustedIncludedCount,
        caveatedCardsCount: trustedEvidence.caveatedIncludedCount,
        weakCardsCount: allCards.filter(card => card.autoAnalysisVerdict === 'weak').length,
        caveats,
        qualitySignals: qualityGovernance?.datasetSignals ?? [],
        qualityHintsSummary: qualityGovernance?.qualityHintsSummary ?? null,
        reportGenerationGate: gateAssessment.gate,
        reportGenerationBlockers: gateAssessment.blockers,
    };
    const evidenceCatalog: ReportEvidenceRef[] = [
        {
            id: 'dataset.context',
            kind: 'dataset',
            label: 'Dataset Context',
            source: 'derived',
            detail: buildDatasetContextDetail(dataset),
        },
        {
            id: 'dataset.readiness',
            kind: 'dataset',
            label: 'Dataset Readiness',
            source: 'derived',
            detail: truncateDetail(`${buildReadinessLabel(dataset.reportReadiness)}: ${dataset.reportReadinessReason}`),
        },
        ...(dataset.qualityHintsSummary ? [{
            id: 'dataset.quality_governance',
            kind: 'dataset' as const,
            label: 'Dataset Quality Governance',
            source: 'derived' as const,
            detail: truncateDetail(dataset.qualityHintsSummary),
        }] : []),
        {
            id: 'workflow.preparation',
            kind: 'workflow',
            label: 'Preparation Workflow',
            source: 'derived',
            detail: buildPreparationDetail(dataset, workflowEvidence),
        },
        {
            id: 'workflow.verification',
            kind: 'workflow',
            label: 'Verification Status',
            source: 'derived',
            detail: buildVerificationDetail(workflowEvidence),
        },
    ];

    const coreSummaryText = trimText(summaries.coreAnalysisSummary?.text ?? '');
    if (coreSummaryText) {
        evidenceCatalog.push({
            id: 'summary.core',
            kind: 'summary',
            label: 'Core Analysis Summary',
            source: 'state',
            detail: buildSummaryDetail(coreSummaryText),
        });
    }

    const finalSummaryText = trimText(summaries.finalSummary?.text ?? '');
    if (finalSummaryText) {
        evidenceCatalog.push({
            id: 'summary.final',
            kind: 'summary',
            label: 'Final Summary',
            source: 'state',
            detail: buildSummaryDetail(finalSummaryText),
        });
    }

    if (query) {
        evidenceCatalog.push({
            id: 'query.active',
            kind: 'query',
            label: 'Active Data Query',
            source: 'state',
            detail: buildQueryDetail(query),
        });
    }

    trustedEvidence.includedCards.forEach(card => {
        evidenceCatalog.push({
            id: card.evidenceId,
            kind: 'card',
            label: card.displayTitle,
            source: 'state',
            detail: buildCardDetail(card),
        });
    });

    return {
        generatedAt,
        sessionId: state.sessionId,
        datasetId: state.currentDatasetId ?? null,
        currentView: state.currentView,
        dataset,
        workflow: workflowEvidence,
        summaries,
        query,
        allCards,
        cards: trustedEvidence.includedCards,
        includedCardIds: trustedEvidence.includedCardIds,
        excludedCardIds: trustedEvidence.excludedCardIds,
        excludedEvidence: trustedEvidence.excludedEvidence,
        evidenceCatalog,
    };
};
