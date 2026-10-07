
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { FinalSummary } from './FinalSummary';
import { useAppStore, AppStore } from '../store/useAppStore';
import { DataQualityWarnings } from './DataQualityWarnings';
import { AnalysisCardGrid } from './analysis-panel/AnalysisCardGrid';
import { AnalysisStatusSection } from './analysis-panel/AnalysisStatusSection';
import { AnalysisResultsSkeleton } from './analysis-panel/AnalysisResultsSkeleton';
import { ResearchRunSummary } from './analysis-panel/ResearchRunSummary';
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
import { resolveCardTrustDecision } from '../services/agent/cardTrustDecision';
import { resolveAnalysisCompletionGate } from '../services/agent/analysisCompletionGate';
import { DEFAULT_AUTO_ANALYSIS_GOAL } from '../services/agent/analysisDefaults';
import { buildDisplayAnalysisIr } from '../services/dashboard/displayAnalysisIr';
import { hasOpenableLatestReport, isLatestReportPartial, resolveLatestReportBlockedInfo } from '../services/reporting/reportArtifactManifest';
import type { SqlPrecheckFinding, WorkspacePreviewRowsQueryRequest } from '../types';

// Define breakpoints for column calculation based on container width
const BREAKPOINTS = {
    oneCol: 900,
    twoCols: 1350,
};
const CARD_SPOTLIGHT_DURATION_MS = 10000;
const SQL_PRECHECK_PREVIEW_LIMIT = 25;
const INITIAL_VISIBLE_CARDS = 6;
const CARD_LOAD_INCREMENT = 4;
const SIMPLE_VIEW_CARD_LIMIT = 2;
type ResultsViewMode = 'simple' | 'explore';

import { getTranslation } from '../utils/localization';

// ... imports

const AnalysisPanelComponent: React.FC = () => {
    const _renderT0 = performance.now(); // PERF-309 diagnostic
    // ... hook usage
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
    const previousCardCountRef = useRef(cards.length);
    const hasMountedRef = useRef(false);
    const spotlightTimeoutRef = useRef<number | null>(null);
    const sqlPrecheckScrollTimeoutRef = useRef<number | null>(null);
    const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
    // State to hold the dynamically calculated number of columns for the masonry grid
    const [columnCount, setColumnCount] = useState(3);
    const [spotlightCardId, setSpotlightCardId] = useState<string | null>(null);
    const [visibleCardCount, setVisibleCardCount] = useState(INITIAL_VISIBLE_CARDS);
    const [expandOverrideKey, setExpandOverrideKey] = useState(1);
    const [expandOverrideValue, setExpandOverrideValue] = useState(true);
    const [resultsViewMode, setResultsViewMode] = useState<ResultsViewMode>(storeResultsViewMode);
    const [isRetryingAnalysis, setIsRetryingAnalysis] = useState(false);

    useEffect(() => {
        setResultsViewMode(storeResultsViewMode);
    }, [storeResultsViewMode]);
    // PERF-306: Stabilize cardIds reference — only recompute when card list
    // actually changes (by ID), not on every AnalysisPanel re-render.
    // Prevents AnalysisCardGrid memo invalidation from unrelated state changes.
    const prevCardIdsRef = useRef<string[]>([]);
    const stableCardIds = useMemo(() => {
        const nextIds = cards.slice(0, visibleCardCount).map(c => c.id);
        const prev = prevCardIdsRef.current;
        if (nextIds.length === prev.length && nextIds.every((id, i) => id === prev[i])) {
            return prev;
        }
        prevCardIdsRef.current = nextIds;
        return nextIds;
    }, [cards, visibleCardCount]);
    const simpleCardIds = useMemo(() => {
        const currentDatasetVersion = getCurrentAnalysisDatasetVersion({ canonicalCsvData, csvData });
        const completionGate = resolveAnalysisCompletionGate({
            cards,
            currentDatasetVersion,
            columnProfiles,
        });
        const trustedBusinessIds = new Set(completionGate.trustedBusinessCardIds);
        const trustScore = {
            verified: 500,
            caveated: 350,
            unverified: 200,
            stale: 50,
            weak: 0,
        } as const;
        const rankedCandidates = cards
            .map((card, index) => {
                const decision = resolveCardTrustDecision(card, currentDatasetVersion);
                const display = buildDisplayAnalysisIr(card, cards, columnProfiles);
                const helperScore = display.helperExposureLevel === 'none'
                    ? 80
                    : display.helperExposureLevel === 'low'
                        ? 25
                        : -60;
                const narrativeScore = display.narrativeEligibility === 'preferred'
                    ? 40
                    : display.narrativeEligibility === 'allowed_neutral'
                        ? 15
                        : -20;
                const meaningScore = Math.round((display.businessMeaningConfidence ?? 0) * 100);
                const fallbackPenalty = card.plan.isFallback ? 75 : 0;
                return {
                    id: card.id,
                    index,
                    trustStatus: decision.status,
                    score: trustScore[decision.status]
                        + helperScore
                        + narrativeScore
                        + meaningScore
                        + display.selectionScore
                        - fallbackPenalty,
                };
            })
            .sort((left, right) => right.score - left.score || left.index - right.index);
        const verifiedCandidates = rankedCandidates.filter(candidate => trustedBusinessIds.has(candidate.id));
        return verifiedCandidates
            .slice(0, SIMPLE_VIEW_CARD_LIMIT)
            .map(candidate => candidate.id);
    }, [canonicalCsvData, cards, columnProfiles, csvData]);
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

    useEffect(() => {
        const calculateColumnCount = (width: number) => {
            if (width < BREAKPOINTS.oneCol) return 1;
            if (width < BREAKPOINTS.twoCols) return 2;
            return 3;
        };

        // Ensure ResizeObserver is available before using it
        if (typeof ResizeObserver === 'undefined') {
            console.warn('ResizeObserver not supported; layout may not be responsive to panel resizing.');
            return;
        }

        const observer = new ResizeObserver(entries => {
            if (entries[0]) {
                const newColumnCount = calculateColumnCount(entries[0].contentRect.width);
                // Only update the state if the column count actually changes to avoid unnecessary re-renders
                setColumnCount(prev => prev === newColumnCount ? prev : newColumnCount);
            }
        });

        const currentPanel = panelRef.current;
        if (currentPanel) {
            // Set initial column count based on the element's initial width
            setColumnCount(calculateColumnCount(currentPanel.offsetWidth));
            observer.observe(currentPanel);
        }

        // Cleanup function to unobserve the element when the component unmounts
        return () => {
            if (currentPanel) {
                observer.unobserve(currentPanel);
            }
        };
    }, []); // Empty dependency array ensures this effect runs only once on mount

    // Reset visible card count when a new analysis starts (cards drop to 0 then grow)
    useEffect(() => {
        if (cards.length === 0) {
            setVisibleCardCount(INITIAL_VISIBLE_CARDS);
        }
    }, [cards.length]);

    // Spotlight new cards and auto-scroll for follow-up additions
    useEffect(() => {
        const previousCardCount = previousCardCountRef.current;
        previousCardCountRef.current = cards.length;

        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            return;
        }

        if (cards.length === 0 || cards.length <= previousCardCount) {
            return;
        }

        // Ensure newly added cards are within the visible window
        setVisibleCardCount(prev => Math.max(prev, cards.length));

        const newestCardId = cards[0].id;
        setSpotlightCardId(newestCardId);

        // Auto-scroll to the new card for small additions (chat follow-up,
        // group-by create card). Skip for large batches (initial auto-analysis)
        // to avoid jarring scroll during bulk card generation.
        const addedCount = cards.length - previousCardCount;
        if (addedCount <= 2) {
            requestAnimationFrame(() => {
                const el = document.querySelector(`[data-card-id="${newestCardId}"]`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }

        if (spotlightTimeoutRef.current !== null) {
            window.clearTimeout(spotlightTimeoutRef.current);
        }

        spotlightTimeoutRef.current = window.setTimeout(() => {
            setSpotlightCardId(current => (current === newestCardId ? null : current));
            spotlightTimeoutRef.current = null;
        }, CARD_SPOTLIGHT_DURATION_MS);
    }, [cards]);

    // Progressive loading: observe a sentinel element to load more cards on scroll
    useEffect(() => {
        const sentinel = loadMoreSentinelRef.current;
        if (!sentinel || typeof IntersectionObserver === 'undefined') return;

        const observer = new IntersectionObserver(entries => {
            if (entries[0]?.isIntersecting) {
                setVisibleCardCount(prev => prev + CARD_LOAD_INCREMENT);
            }
        }, { rootMargin: '200px' });

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    useEffect(() => () => {
        if (spotlightTimeoutRef.current !== null) {
            window.clearTimeout(spotlightTimeoutRef.current);
        }
        if (sqlPrecheckScrollTimeoutRef.current !== null) {
            window.clearTimeout(sqlPrecheckScrollTimeoutRef.current);
        }
    }, []);

    const credibilitySummary = useMemo(() => {
        if (cards.length === 0) return null;
        const currentDatasetVersion = getCurrentAnalysisDatasetVersion({ canonicalCsvData, csvData });
        let trustedCount = 0;
        let caveatedCount = 0;
        let weakCount = 0;
        for (const card of cards) {
            const decision = resolveCardTrustDecision(card, currentDatasetVersion);
            if (decision.status === 'verified') trustedCount++;
            else if (decision.status === 'caveated') caveatedCount++;
            else weakCount++;
        }
        const overallVerdict: 'trusted' | 'caveated' | 'weak' = trustedCount > 0
            ? (caveatedCount > 0 || weakCount > 0 ? 'caveated' : 'trusted')
            : caveatedCount > 0 && weakCount === 0
                ? 'caveated'
                : 'weak';
        return { overallVerdict, trustedCount, caveatedCount, weakCount };
    }, [canonicalCsvData, cards, csvData]);

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

    const handleInspectSqlPrecheckFinding = async (finding: SqlPrecheckFinding) => {
        const availableColumnNames = Array.isArray(columnProfiles)
            ? columnProfiles.map(profile => profile.name)
            : [];
        const relatedColumns = Array.from(new Set([
            finding.dimension,
            finding.column,
            finding.metric,
        ].filter((value): value is string => Boolean(value && availableColumnNames.includes(value)))));

        if (relatedColumns.length === 0) {
            addProgress(getTranslation('analysis_readiness_columns_unavailable', language), 'warning');
            return;
        }

        setIsSpreadsheetVisible(true);

        try {
            const payload: WorkspacePreviewRowsQueryRequest = {
                templateId: 'preview_rows',
                columns: relatedColumns,
                limit: SQL_PRECHECK_PREVIEW_LIMIT,
                orderBy: null,
            };
            await runWorkspaceDataQuery(payload);
            if (sqlPrecheckScrollTimeoutRef.current !== null) {
                window.clearTimeout(sqlPrecheckScrollTimeoutRef.current);
            }
            sqlPrecheckScrollTimeoutRef.current = window.setTimeout(() => {
                if (typeof document === 'undefined') {
                    return;
                }
                document.getElementById('raw-data-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                sqlPrecheckScrollTimeoutRef.current = null;
            }, 100);
        } catch (error) {
            addProgress(
                getTranslation('analysis_readiness_inspection_failed', language),
                'error',
            );
            console.warn('[AnalysisPanel] Failed to inspect data-readiness finding.', error);
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
            && initialAnalysisFailureKind !== 'provider';
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
            <section className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" role="status">
                <p className="font-semibold text-slate-900">{getTranslation('large_dataset_mode_title', language)}</p>
                <p className="mt-0.5 text-slate-600">
                    {getTranslation('large_dataset_mode_body', language, {
                        totalRows: largeDatasetBacking.rowCount.toLocaleString(),
                        sampleRows: largeDatasetBacking.sampleRowCount.toLocaleString(),
                    })}
                </p>
            </section>
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
                    <section className="flex flex-col gap-3 rounded-card border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between" aria-label={getTranslation('analysis_results_view_label', language)}>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                {getTranslation('analysis_results_view_label', language)}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                                {getTranslation(
                                    resultsViewMode === 'simple'
                                        ? 'analysis_results_simple_view_hint'
                                        : 'analysis_results_explore_view_hint',
                                    language,
                                )}
                            </p>
                        </div>
                        <div className="inline-flex self-start rounded-card border border-slate-200 bg-slate-50 p-1" role="group" aria-label={getTranslation('analysis_results_view_label', language)}>
                            {(['simple', 'explore'] as const).map(mode => (
                                <button
                                    key={mode}
                                    type="button"
                                    aria-pressed={resultsViewMode === mode}
                                    onClick={() => handleResultsViewChange(mode)}
                                    className={`min-h-[44px] rounded-md px-3 py-2 text-sm font-semibold transition md:min-h-0 ${
                                        resultsViewMode === mode
                                            ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    {getTranslation(
                                        mode === 'simple'
                                            ? 'analysis_results_simple_view'
                                            : 'analysis_results_explore_view',
                                        language,
                                    )}
                                </button>
                            ))}
                        </div>
                    </section>
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
                        <section className="rounded-card border border-blue-200 bg-blue-50 p-4" aria-label={getTranslation('analysis_results_next_step_title', language)}>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                                {getTranslation('analysis_results_next_step_title', language)}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                                {getTranslation(
                                    needsStructureRepair
                                        ? 'analysis_results_next_step_reason_structure'
                                        : needsProviderRecovery
                                            ? 'analysis_results_next_step_reason_provider'
                                            : needsEvidenceReview
                                                ? 'analysis_results_next_step_reason_repair'
                                        : initialAnalysisStatus === 'degraded'
                                            ? 'analysis_results_next_step_reason_degraded_report'
                                            : 'analysis_results_next_step_reason_ready_report',
                                    language,
                                )}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                                {getTranslation(
                                    needsStructureRepair
                                        ? 'analysis_results_next_step_outcome_repair'
                                        : needsProviderRecovery
                                            ? 'analysis_results_next_step_outcome_provider'
                                            : needsEvidenceReview
                                                ? 'analysis_results_next_step_outcome_evidence'
                                        : 'analysis_results_next_step_outcome_report',
                                    language,
                                )}
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    if (needsStructureRepair) {
                                        if (reportStructureResolution && rawIntakeIr) {
                                            setIsReportBoundaryConfirmModalOpen(true);
                                        } else {
                                            setIsDataPreparationModalOpen(true);
                                        }
                                    } else if (needsProviderRecovery) {
                                        void retryAnalysis();
                                    } else if (needsEvidenceReview) {
                                        handleResultsViewChange('explore');
                                    } else if (hasLatestAnalystReport) {
                                        openLatestAnalystReport();
                                    } else {
                                        void generateAnalystReport();
                                    }
                                }}
                                disabled={isRetryingAnalysis || isBusy || (!needsStructureRepair && !needsProviderRecovery && !needsEvidenceReview && (isGeneratingReport || isSimpleReportBlocked))}
                                title={isSimpleReportBlocked
                                    ? getTranslation('report_blocked_title', language)
                                    : undefined}
                                className="mt-3 min-h-[44px] rounded-card bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                            >
                                {getTranslation(
                                    needsStructureRepair
                                        ? 'analysis_results_repair_action'
                                        : needsProviderRecovery
                                            ? 'analysis_results_retry_action'
                                            : needsEvidenceReview
                                                ? 'analysis_results_review_evidence_action'
                                        : hasLatestAnalystReport
                                            ? 'report_open'
                                            : isGeneratingReport
                                                ? 'generate_analyst_report_running'
                                                : 'generate_analyst_report',
                                    language,
                                )}
                            </button>
                            {needsProviderRecovery && shouldAllowSettingsSurface() && (
                                <button
                                    type="button"
                                    onClick={() => setIsSettingsModalOpen?.(true)}
                                    className="ml-2 mt-3 min-h-[44px] rounded-card border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                                >
                                    {getTranslation('analysis_results_change_provider_action', language)}
                                </button>
                            )}
                        </section>
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
