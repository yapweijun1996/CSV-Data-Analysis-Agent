
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { FinalSummary } from './FinalSummary';
import { useAppStore, AppStore } from '../store/useAppStore';
import { DataQualityWarnings } from './DataQualityWarnings';
import { AnalysisCardGrid } from './analysis-panel/AnalysisCardGrid';
import { AnalysisStatusSection } from './analysis-panel/AnalysisStatusSection';
import { AnalysisResultsSkeleton } from './analysis-panel/AnalysisResultsSkeleton';
import { ResearchRunSummary } from './analysis-panel/ResearchRunSummary';
import { LargeDatasetNotice } from './analysis-panel/LargeDatasetNotice';
import { RecommendedNextStep } from './analysis-panel/RecommendedNextStep';
import { ResultsViewToggle, type ResultsViewMode } from './analysis-panel/ResultsViewToggle';
import { summarizeCardCredibility } from './analysis-panel/credibilitySummary';
import { resolveNextStepKind } from './analysis-panel/nextStep';
import { selectSimpleViewCardIds } from './analysis-panel/simpleViewSelection';
import { useCardWindow } from './analysis-panel/useCardWindow';
import { useResponsiveColumnCount } from './analysis-panel/useResponsiveColumnCount';
import { useSqlPrecheckInspection } from './analysis-panel/useSqlPrecheckInspection';
import { CleaningRunBanner } from './cleaning/CleaningRunBanner';
import { ExecutiveKpiRow } from './dashboard/ExecutiveKpiRow';
import { ReportDelivery } from './dashboard/ReportDelivery';
import { ReportHeader } from './dashboard/ReportHeader';
import { CredibilityBanner } from './dashboard/CredibilityBanner';
import { shouldAllowSettingsSurface, shouldShowDataWarnings } from '../config/runtimeConfig';
import { buildExecutiveKpis, type ExecutiveKpi } from '../services/dashboard/executiveKpis';
import { resolveEffectiveReportContext } from '../services/agent/reportContext';
import { getCurrentAnalysisDatasetVersion } from '../services/agent/artifactProvenance';
import { getCsvDataRowCount } from '../utils/datasetId';
import { resolveAnalysisCompletionGate } from '../services/agent/analysisCompletionGate';
import { DEFAULT_AUTO_ANALYSIS_GOAL } from '../services/agent/analysisDefaults';
import { hasOpenableLatestReport, isLatestReportPartial, resolveLatestReportBlockedInfo } from '../services/reporting/reportArtifactManifest';

import { getTranslation } from '../utils/localization';

const AnalysisPanelComponent: React.FC = () => {
    const _renderT0 = performance.now(); // PERF-309 diagnostic
    // PERF-303: Full aiTaskStatus object moved to AnalysisStatusSection (independent subscription).
    // Only aiTaskDone (boolean) is kept here for conditional rendering logic.
    const { cards, finalSummary, finalSummaryProvenance, isGeneratingReport, isBusy, language, reportTemplate, setReportTemplate, reportGenerationProgress, aiTaskDone, cleaningRun, isSpreadsheetVisible, resumeCleaningRun, restartCleaningRun, handleInitialAnalysis, confirmedAnalysisGoal, generateAnalystReport, cancelReportGeneration, openLatestAnalystReport, exportLatestAnalystReportPdf, csvData, canonicalCsvData, rawCsvData, reportContextResolution, reportStructureResolution, pipelineOutcome, initialAnalysisFailureKind, rawIntakeIr, columnProfiles, dataPreparationPlan, runWorkspaceDataQuery, setIsSpreadsheetVisible, addProgress, handleShowCardFromChat, setIsDataPreparationModalOpen, setIsReportBoundaryConfirmModalOpen, setIsSettingsModalOpen, hasLatestAnalystReport, reportBlockedInfo, isReportPartial, initialAnalysisStatus, latestAnalysisSession, visibleAnalysisTrace, storeResultsViewMode, setStoreResultsViewMode } = useAppStore(
        (state: AppStore) => ({
            cards: state.analysisCards,
            finalSummary: state.finalSummary,
            finalSummaryProvenance: state.finalSummaryProvenance ?? null,
            isGeneratingReport: state.isGeneratingReport,
            isBusy: state.isBusy,
            language: state.settings.language,
            reportTemplate: state.settings.reportTemplate ?? 'management_review',
            setReportTemplate: state.setReportTemplate,
            reportGenerationProgress: state.reportGenerationProgress,
            // PERF-303: Only track whether AI task is finished (boolean), not the full object.
            // Full aiTaskStatus rendering is handled by AnalysisStatusSection.
            aiTaskDone: !state.aiTaskStatus || state.aiTaskStatus.status === 'done' || state.aiTaskStatus.status === 'error',
            cleaningRun: state.cleaningRun,
            isSpreadsheetVisible: state.isSpreadsheetVisible,
            resumeCleaningRun: state.resumeCleaningRun,
            restartCleaningRun: state.restartCleaningRun,
            handleInitialAnalysis: state.handleInitialAnalysis,
            confirmedAnalysisGoal: state.confirmedAnalysisGoal,
            generateAnalystReport: state.generateAnalystReport,
            cancelReportGeneration: state.cancelReportGeneration,
            openLatestAnalystReport: state.openLatestAnalystReport,
            exportLatestAnalystReportPdf: state.exportLatestAnalystReportPdf,
            csvData: state.csvData,
            canonicalCsvData: state.canonicalCsvData,
            rawCsvData: state.rawCsvData,
            reportContextResolution: state.reportContextResolution,
            reportStructureResolution: state.reportStructureResolution,
            pipelineOutcome: state.pipelineOutcome,
            initialAnalysisFailureKind: state.initialAnalysisFailureKind ?? null,
            rawIntakeIr: state.rawIntakeIr,
            columnProfiles: state.columnProfiles,
            dataPreparationPlan: state.dataPreparationPlan,
            runWorkspaceDataQuery: state.runWorkspaceDataQuery,
            setIsSpreadsheetVisible: state.setIsSpreadsheetVisible,
            addProgress: state.addProgress,
            handleShowCardFromChat: state.handleShowCardFromChat,
            setIsDataPreparationModalOpen: state.setIsDataPreparationModalOpen,
            setIsReportBoundaryConfirmModalOpen: state.setIsReportBoundaryConfirmModalOpen,
            setIsSettingsModalOpen: state.setIsSettingsModalOpen,
            hasLatestAnalystReport: hasOpenableLatestReport(state.workspaceFiles),
            reportBlockedInfo: resolveLatestReportBlockedInfo(state.workspaceFiles),
            isReportPartial: isLatestReportPartial(state.workspaceFiles),
            initialAnalysisStatus: state.initialAnalysisStatus,
            latestAnalysisSession: state.latestAnalysisSession ?? null,
            visibleAnalysisTrace: state.visibleAnalysisTrace ?? [],
            storeResultsViewMode: state.resultsViewMode ?? 'simple',
            setStoreResultsViewMode: state.setResultsViewMode,
        }),
        shallow
    );

    // Ref to the panel's container element to measure its width
    const panelRef = useRef<HTMLDivElement>(null);
    const columnCount = useResponsiveColumnCount(panelRef);
    const { stableCardIds, visibleCardCount, spotlightCardId, loadMoreSentinelRef } = useCardWindow(cards);
    const [expandOverrideKey, setExpandOverrideKey] = useState(1);
    const [expandOverrideValue, setExpandOverrideValue] = useState(true);
    const [resultsViewMode, setResultsViewMode] = useState<ResultsViewMode>(storeResultsViewMode);
    const [isRetryingAnalysis, setIsRetryingAnalysis] = useState(false);

    useEffect(() => {
        setResultsViewMode(storeResultsViewMode);
    }, [storeResultsViewMode]);
    const simpleCardIds = useMemo(
        () => selectSimpleViewCardIds({ cards, canonicalCsvData, csvData, columnProfiles }),
        [canonicalCsvData, cards, columnProfiles, csvData],
    );
    const displayedCardIds = resultsViewMode === 'simple'
        ? simpleCardIds
        : stableCardIds;
    const handleResultsViewChange = useCallback((mode: ResultsViewMode) => {
        setResultsViewMode(mode);
        setStoreResultsViewMode?.(mode);
        setExpandOverrideValue(true);
        setExpandOverrideKey(previous => previous + 1);
    }, [setStoreResultsViewMode]);
    const retryAnalysis = useCallback(async () => {
        const dataset = canonicalCsvData ?? csvData;
        if (!dataset || !handleInitialAnalysis || isBusy || isRetryingAnalysis) return;
        setIsRetryingAnalysis(true);
        try {
            await handleInitialAnalysis(dataset, confirmedAnalysisGoal ?? DEFAULT_AUTO_ANALYSIS_GOAL, { trigger: 'manual' });
        } catch (error) {
            addProgress(error instanceof Error ? error.message : 'Analysis retry failed.', 'error');
        } finally {
            setIsRetryingAnalysis(false);
        }
    }, [addProgress, canonicalCsvData, confirmedAnalysisGoal, csvData, handleInitialAnalysis, isBusy, isRetryingAnalysis]);
    const handleToggleAllCards = useCallback(() => {
        setExpandOverrideValue(prev => !prev);
        setExpandOverrideKey(prev => prev + 1);
    }, []);

    const credibilitySummary = useMemo(
        () => summarizeCardCredibility({ cards, canonicalCsvData, csvData }),
        [canonicalCsvData, cards, csvData],
    );

    const executiveKpis = useMemo(() => buildExecutiveKpis({
        cards,
        columnProfiles,
        csvData: canonicalCsvData ?? csvData,
        language,
        currentDatasetVersion: getCurrentAnalysisDatasetVersion({ canonicalCsvData, csvData }),
    }), [cards, columnProfiles, canonicalCsvData, csvData, language]);
    const completionGate = useMemo(() => resolveAnalysisCompletionGate({
        cards,
        currentDatasetVersion: getCurrentAnalysisDatasetVersion({ canonicalCsvData, csvData }),
        columnProfiles,
    }), [canonicalCsvData, cards, columnProfiles, csvData]);
    const reportContext = useMemo(() => resolveEffectiveReportContext(
        reportContextResolution,
        rawCsvData,
        csvData,
    ), [reportContextResolution, rawCsvData, csvData]);

    const handleExecutiveKpiAction = (kpi: ExecutiveKpi) => {
        if (kpi.action?.type === 'show-card' && kpi.sourceCardId) {
            handleShowCardFromChat(kpi.sourceCardId);
        }
    };

    const handleInspectSqlPrecheckFinding = useSqlPrecheckInspection({
        columnProfiles, language, addProgress, setIsSpreadsheetVisible, runWorkspaceDataQuery,
    });

    const handleNextStepAction = (kind: ReturnType<typeof resolveNextStepKind>) => {
        if (kind === 'repair_structure') {
            if (reportStructureResolution && rawIntakeIr) {
                setIsReportBoundaryConfirmModalOpen(true);
            } else {
                setIsDataPreparationModalOpen(true);
            }
        } else if (kind === 'recover_provider') {
            void retryAnalysis();
        } else if (kind === 'review_evidence') {
            handleResultsViewChange('explore');
        } else if (hasLatestAnalystReport) {
            openLatestAnalystReport();
        } else {
            void generateAnalystReport();
        }
    };

    const renderContent = () => {
        const executiveOverviewTitle = getTranslation('executive_overview', language);
        const executiveOverviewHint = getTranslation('executive_overview_hint', language);
        const executiveKpiActionLabel = getTranslation('executive_kpi_view_breakdown', language);
        const finalSummaryTitle = getTranslation('overall_insights', language);
        const showWarnings = shouldShowDataWarnings();
        const analysisAlreadyStarted = initialAnalysisStatus === 'ready' || initialAnalysisStatus === 'degraded' || cards.length > 0;
        const showCleaningBanner = cleaningRun
            && (cleaningRun.status !== 'completed' || dataPreparationPlan?.sqlPrecheck?.status === 'blocked' || dataPreparationPlan?.sqlPrecheck?.status === 'warning')
            && !isSpreadsheetVisible
            && !analysisAlreadyStarted
            && initialAnalysisFailureKind !== 'provider'
            // The step tracker already shows preparation progress while the analysis runs.
            && initialAnalysisStatus !== 'running';
        const showReportHeader = Boolean(reportContext && csvData);
        const reportColumnNames = Object.keys((canonicalCsvData ?? csvData)?.data?.[0] ?? {});
        const analysisTerminal = initialAnalysisStatus === 'ready'
            || initialAnalysisStatus === 'degraded'
            || initialAnalysisStatus === 'error';
        const analysisComplete = analysisTerminal && completionGate.status === 'complete';
        // Nothing to show yet: hide the results controls and reserve the space with placeholders.
        const analysisRunning = !analysisTerminal && cards.length === 0 && !aiTaskDone;
        const needsStructureRepair = completionGate.status === 'blocked'
            && pipelineOutcome?.status === 'needs_structure_review'
            && reportStructureResolution?.requiresHumanReview === true;
        const needsProviderRecovery = !needsStructureRepair
            && initialAnalysisFailureKind === 'provider'
            && (initialAnalysisStatus === 'error' || initialAnalysisStatus === 'degraded');
        const needsEvidenceReview = completionGate.status === 'blocked'
            && !needsStructureRepair && !needsProviderRecovery;
        const nextStepKind = resolveNextStepKind({ needsStructureRepair, needsProviderRecovery, needsEvidenceReview });
        const showHeadlineSections = aiTaskDone;
        const showAnalystReportAction = analysisComplete && cards.length > 0;
        const isArtifactReportGeneration = reportGenerationProgress?.mode === 'artifact';
        const isSimpleReportBlocked = Boolean(reportBlockedInfo)
            && !hasLatestAnalystReport
            && !isGeneratingReport;
        const reportProgressLabel = isArtifactReportGeneration && reportGenerationProgress
            ? `${reportGenerationProgress.completed}/${reportGenerationProgress.total}`
            : null;
        const largeDatasetBacking = (canonicalCsvData ?? csvData)?.backing;
        const largeDatasetNotice = largeDatasetBacking?.mode === 'duckdb_file' ? (
            <LargeDatasetNotice
                rowCount={largeDatasetBacking.rowCount}
                sampleRowCount={largeDatasetBacking.sampleRowCount}
                language={language}
            />
        ) : null;

        const analystReportAction = showAnalystReportAction ? (
            <ReportDelivery
                language={language}
                reportTemplate={reportTemplate}
                onTemplateChange={setReportTemplate}
                onGenerate={() => void generateAnalystReport()}
                onCancel={cancelReportGeneration}
                onOpen={openLatestAnalystReport}
                onExportPdf={exportLatestAnalystReportPdf}
                isGenerating={isGeneratingReport}
                progressLabel={reportProgressLabel}
                hasReport={hasLatestAnalystReport}
                blockedInfo={reportBlockedInfo}
                isPartial={isReportPartial}
            />
        ) : null;

        // Calculate how many skeleton loaders to show
        const skeletonCount = isGeneratingReport && reportGenerationProgress && reportGenerationProgress.mode !== 'artifact'
            ? Math.max(0, reportGenerationProgress.total - cards.length)
            : 0;

        // If there's nothing to show at all
        if (
            cards.length === 0
            && !isGeneratingReport
            && skeletonCount === 0
            && aiTaskDone
            && visibleAnalysisTrace.length === 0
            && !showWarnings
            && !showCleaningBanner
            && !analysisTerminal
        ) {
            return (
                <div id="analysis-results-section" className="scroll-mt-6 space-y-4">
                    {showReportHeader && (
                        <ReportHeader
                            reportContextResolution={reportContextResolution}
                            effectiveReportContext={reportContext!}
                            fileName={csvData!.fileName}
                            preparedRowCount={getCsvDataRowCount(canonicalCsvData ?? csvData)}
                            headerDepth={(rawCsvData?.headerDepth ?? csvData!.headerDepth ?? 1)}
                            summaryRowCount={(rawCsvData?.summaryRowCount ?? rawCsvData?.summaryRows?.length ?? csvData!.summaryRowCount ?? csvData!.summaryRows?.length ?? 0)}
                            columnNames={reportColumnNames}
                            language={language}
                        />
                    )}
                    {largeDatasetNotice}
                    {analystReportAction}
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center p-4">
                            <p className="text-slate-500">{getTranslation('analysis_results_placeholder', language)}</p>
                        </div>
                    </div>
                </div>
            );
        }

        console.log(`[Perf:Diag] AnalysisPanel render: ${Math.round(performance.now() - _renderT0)}ms | cards=${cards.length}`); // PERF-309
        return (
            <>
                <div id="analysis-results-section" className="scroll-mt-6 space-y-4">
                    {!analysisRunning && (
                        <ResultsViewToggle mode={resultsViewMode} language={language} onChange={handleResultsViewChange} />
                    )}

                    {largeDatasetNotice}

                    {/* 1. Report context header (compact) */}
                    {showReportHeader && (
                        <ReportHeader
                            reportContextResolution={reportContextResolution}
                            effectiveReportContext={reportContext!}
                            fileName={csvData!.fileName}
                            preparedRowCount={getCsvDataRowCount(canonicalCsvData ?? csvData)}
                            headerDepth={(rawCsvData?.headerDepth ?? csvData!.headerDepth ?? 1)}
                            summaryRowCount={(rawCsvData?.summaryRowCount ?? rawCsvData?.summaryRows?.length ?? csvData!.summaryRowCount ?? csvData!.summaryRows?.length ?? 0)}
                            columnNames={reportColumnNames}
                            language={language}
                        />
                    )}

                    {/* 2. AI task progress — PERF-303: isolated subscription */}
                    <AnalysisStatusSection />
                    {analysisRunning && <AnalysisResultsSkeleton language={language} />}
                    {resultsViewMode === 'explore' && latestAnalysisSession?.researchBrief && (
                        <ResearchRunSummary session={latestAnalysisSession} />
                    )}

                    {/* 3. Single global credibility status (after analysis completes) */}
                    {showHeadlineSections && credibilitySummary && (
                        <CredibilityBanner
                            overallVerdict={credibilitySummary.overallVerdict}
                            trustedCount={credibilitySummary.trustedCount}
                            caveatedCount={credibilitySummary.caveatedCount}
                            weakCount={credibilitySummary.weakCount}
                            hasRunCaveats={initialAnalysisStatus === 'degraded'}
                            language={language}
                        />
                    )}

                    {/* 4. Final summary + executive KPIs */}
                    {showHeadlineSections && finalSummary && (
                        <FinalSummary
                            key={resultsViewMode}
                            title={finalSummaryTitle}
                            summary={finalSummary}
                            language={language}
                            provenance={finalSummaryProvenance}
                            currentDataset={{ canonicalCsvData, csvData }}
                            defaultExpanded={resultsViewMode === 'explore'}
                        />
                    )}
                    {showHeadlineSections && executiveKpis.length > 0 && (
                        <ExecutiveKpiRow
                            title={executiveOverviewTitle}
                            subtitle={executiveOverviewHint}
                            kpis={executiveKpis}
                            actionLabel={executiveKpiActionLabel}
                            onKpiAction={handleExecutiveKpiAction}
                        />
                    )}

                    {resultsViewMode === 'simple' && analysisTerminal && (
                        <RecommendedNextStep
                            kind={nextStepKind}
                            language={language}
                            degraded={initialAnalysisStatus === 'degraded'}
                            hasReport={hasLatestAnalystReport}
                            isGeneratingReport={isGeneratingReport}
                            disabled={isRetryingAnalysis || isBusy || (nextStepKind === 'report' && (isGeneratingReport || isSimpleReportBlocked))}
                            blockedTitle={isSimpleReportBlocked ? getTranslation('report_blocked_title', language) : undefined}
                            onPrimaryAction={() => handleNextStepAction(nextStepKind)}
                            onChangeProvider={nextStepKind === 'recover_provider' && shouldAllowSettingsSurface()
                                ? () => setIsSettingsModalOpen?.(true)
                                : undefined}
                        />
                    )}

                    {/* 5. Analysis cards (primary content) */}
                    {(cards.length > 0 || skeletonCount > 0) && (<>
                        {resultsViewMode === 'explore' && cards.length > 1 && (
                            <div className="flex items-center justify-end mb-3" data-export-exclude>
                                <button
                                    type="button"
                                    onClick={handleToggleAllCards}
                                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-card border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 md:min-h-0"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={`h-3.5 w-3.5 transition-transform ${expandOverrideValue ? '' : '-rotate-90'}`}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
                                    </svg>
                                    {expandOverrideValue
                                        ? getTranslation('collapse_all_cards', language)
                                        : getTranslation('expand_all_cards', language)}
                                </button>
                            </div>
                        )}
                        {/* PERF-303: Card grid isolated in memo component */}
                        <AnalysisCardGrid
                            cardIds={displayedCardIds}
                            skeletonCount={skeletonCount}
                            columnCount={columnCount}
                            spotlightCardId={spotlightCardId}
                            expandOverrideKey={expandOverrideKey}
                            expandOverrideValue={expandOverrideValue}
                            showExplorationControls={resultsViewMode === 'explore'}
                        />
                        {resultsViewMode === 'explore' && visibleCardCount < cards.length && (
                            <div ref={loadMoreSentinelRef} className="flex justify-center py-4">
                                <span className="text-xs text-slate-400">
                                    {cards.length - visibleCardCount} more cards below
                                </span>
                            </div>
                        )}
                    </>)}

                    {/* 6. Data warnings (compact, below cards) */}
                    {showWarnings && <DataQualityWarnings />}
                    {showCleaningBanner && (
                        <CleaningRunBanner
                            cleaningRun={cleaningRun}
                            onContinue={() => void resumeCleaningRun()}
                            onRestart={() => void restartCleaningRun()}
                            sqlPrecheck={dataPreparationPlan?.sqlPrecheck ?? null}
                            onInspectFinding={handleInspectSqlPrecheckFinding}
                        />
                    )}

                    {/* 7. Report delivery (below analysis content) */}
                    {resultsViewMode === 'explore' && analystReportAction}
                </div>
            </>
        );
    };

    // Attach the ref to the panel's root div. All content is rendered inside this measured container.
    return <div className="p-0" ref={panelRef}>{renderContent()}</div>;
};

export const AnalysisPanel = React.memo(AnalysisPanelComponent);

AnalysisPanel.displayName = 'AnalysisPanel';
