import { useState, useEffect, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore, AppStore } from '../store/useAppStore';
import { useSpreadsheetData } from './useSpreadsheetData';
import { buildDataPreparationWorkflowBundle } from '../services/agent/buildDataPreparationWorkflowBundle';
import { buildColumnDisplayLabels } from '../services/dashboard/businessLabelResolver';
import { getSemanticHiddenRowCount } from '../services/agent/datasetSemantics';
import { resolveDatasetBindingTarget } from '../services/agent/datasetBinding';
import { buildDisplayLabelMap, buildEffectiveColumnRegistryFromState, collectOrderedColumnNames } from '../services/data/columnRegistry';

const PAGE_SIZE = 50;

export const useSpreadsheetLogic = (isVisible: boolean) => {
    const _hookT0 = performance.now(); // PERF-309 diagnostic
    const {
        csvData,
        canonicalCsvData,
        rawCsvData,
        spreadsheetFilterFunction,
        activeDataQuery,
        activeSpreadsheetFilter,
        aiFilterExplanation,
        isAiFiltering,
        handleNaturalLanguageQuery,
        clearAiFilter,
        clearActiveDataQuery,
        cleaningRun,
        datasetSemanticSnapshot,
        semanticStatus,
        semanticDatasetVersion,
        ensureDatasetSemanticSnapshot,
        columnRegistry,
        columnProfiles,
        userColumnAnnotations,
        dataPreparationPlan,
    } = useAppStore((state: AppStore) => ({
        csvData: state.csvData,
        canonicalCsvData: state.canonicalCsvData,
        rawCsvData: state.rawCsvData,
        // PERF-306: cardCount subscription REMOVED. Was triggering Tabulator
        // 885-row re-render on every card insertion (1-2s each × 5 cards = 5-10s).
        // displayColumnLabels now reads cards lazily via getState() with no deps.
        spreadsheetFilterFunction: state.spreadsheetFilterFunction,
        activeDataQuery: state.activeDataQuery,
        activeSpreadsheetFilter: state.activeSpreadsheetFilter,
        aiFilterExplanation: state.aiFilterExplanation,
        isAiFiltering: state.isAiFiltering,
        handleNaturalLanguageQuery: state.handleNaturalLanguageQuery,
        clearAiFilter: state.clearAiFilter,
        clearActiveDataQuery: state.clearActiveDataQuery,
        cleaningRun: state.cleaningRun,
        datasetSemanticSnapshot: state.datasetSemanticSnapshot,
        semanticStatus: state.semanticStatus,
        semanticDatasetVersion: state.semanticDatasetVersion,
        ensureDatasetSemanticSnapshot: state.ensureDatasetSemanticSnapshot,
        columnRegistry: state.columnRegistry,
        columnProfiles: state.columnProfiles,
        userColumnAnnotations: state.userColumnAnnotations,
        // PERF-312: analysisSteering subscription REMOVED. Was triggering 2.3s
        // SpreadsheetPanel re-render 20+ times during post-analysis phase.
        // Now read lazily via getState() in useMemo — only recomputes when
        // dataPreparationPlan changes (stable scalar dep).
        dataPreparationPlan: state.dataPreparationPlan,
    }), shallow);

    // Use the same dataset the analysis pipeline built the semantic snapshot for.
    // canonicalCsvData is the canonical (post-structure-resolution) dataset when available;
    // csvData is the cleaned dataset. The analysis pipeline calls
    // ensureDatasetSemanticSnapshot with getPreferredAnalysisDataset() = canonicalCsvData ?? csvData,
    // so the spreadsheet must match to avoid version mismatches that trigger unnecessary
    // re-computation and leave the UI stuck in a "Preparing..." state.
    const preferredDataset = useMemo(
        () => canonicalCsvData ?? csvData,
        [canonicalCsvData, csvData],
    );

    const [filterText, setFilterText] = useState('');
    const [viewMode, setViewMode] = useState<'semantic_default' | 'semantic_all' | 'raw'>('semantic_default');
    // PERF-312: Lazy read via getState() — was reading entire state on every setState.
    // dataPreparationPlan is the only dep that matters for workflow bundle.
    const workflowBundle = useMemo(
        () => buildDataPreparationWorkflowBundle(useAppStore.getState() as AppStore),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [dataPreparationPlan],
    );

    useEffect(() => {
        if (!rawCsvData && viewMode === 'raw') {
            setViewMode('semantic_default');
        }
    }, [rawCsvData, viewMode]);

    useEffect(() => {
        if (!isVisible || !preferredDataset || viewMode === 'raw' || activeDataQuery) {
            return;
        }
        // PERF-502: While the cleaning pipeline is running, skip semantic annotation
        // from the UI — the post-import pipeline handles annotation at the correct
        // point after structure resolution determines the canonical dataset.
        // This prevents wasted 6-7s annotation calls on pre-canonical data.
        if (cleaningRun?.status === 'running') {
            return;
        }
        void ensureDatasetSemanticSnapshot(preferredDataset);
    }, [activeDataQuery, cleaningRun?.status, preferredDataset, ensureDatasetSemanticSnapshot, isVisible, viewMode]);

    const semanticBindingTarget = useMemo(
        () => resolveDatasetBindingTarget({
            mode: 'analysis',
            csvData: preferredDataset,
            snapshot: datasetSemanticSnapshot,
            semanticDatasetVersion,
        }),
        [preferredDataset, datasetSemanticSnapshot, semanticDatasetVersion],
    );
    const semanticDefaultReady = Boolean(semanticBindingTarget?.semanticDatasetCurrent);

    const activeDataset = useMemo(() => {
        if (viewMode === 'raw' && rawCsvData) {
            return rawCsvData;
        }
        if (activeDataQuery) {
            return {
                fileName: preferredDataset?.fileName ?? rawCsvData?.fileName ?? 'Query Result',
                data: activeDataQuery.result.rows,
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            };
        }
        if (viewMode === 'semantic_default') {
            if (semanticDefaultReady) {
                return semanticBindingTarget?.dataset ?? preferredDataset;
            }
            // Semantic annotation is still running, failed, or idle —
            // always show the preferred dataset immediately so the user
            // never sees an empty table. The semantic view will upgrade
            // in-place once ready.
            return preferredDataset;
        }
        return preferredDataset;
    }, [activeDataQuery, preferredDataset, rawCsvData, semanticBindingTarget, semanticDefaultReady, semanticStatus, viewMode]);
    const preparedDatasetStatus = useMemo<'operations' | 'schema_only' | 'inconsistent' | 'none'>(() => {
        if (!csvData) return 'none';
        return workflowBundle.summary.planStatus ?? 'none';
    }, [csvData, workflowBundle.summary.planStatus]);
    const headers = useMemo(() => {
        if (viewMode !== 'raw' && activeDataQuery) {
            return activeDataQuery.result.selectedColumns;
        }
        return collectOrderedColumnNames(activeDataset?.data ?? []);
    }, [activeDataQuery, activeDataset, viewMode]);
    const isQueryResultView = viewMode !== 'raw' && Boolean(activeDataQuery);
    const _vcr0 = performance.now(); // PERF-309
    const viewColumnRegistry = useMemo(
        () => {
            // PERF-312: Lazy read analysisSteering via getState() — no subscription.
            const steering = useAppStore.getState().latestAnalysisSession?.analysisSteering ?? null;
            return buildEffectiveColumnRegistryFromState({
                csvData,
                canonicalCsvData,
                columnProfiles,
                datasetSemanticSnapshot,
                userColumnAnnotations,
                latestAnalysisSession: steering ? { analysisSteering: steering } : undefined,
                columnRegistry,
            }, {
                datasetOverride: activeDataset,
                semanticSnapshotOverride: viewMode === 'raw' ? null : datasetSemanticSnapshot,
            });
        },
        [activeDataset, columnProfiles, columnRegistry, datasetSemanticSnapshot, userColumnAnnotations, viewMode],
    );

    const handleQuerySubmit = () => {
        if (filterText.trim()) {
            if (viewMode === 'raw') return;
            handleNaturalLanguageQuery(filterText.trim());
        }
    };

    const effectiveFilterFunction = viewMode !== 'raw' ? spreadsheetFilterFunction : null;
    const _pd0 = performance.now(); // PERF-309
    const processedData = useSpreadsheetData(activeDataset, filterText, effectiveFilterFunction);
    const _pd1 = performance.now(); // PERF-309
    const displayColumns = useMemo(() => {
        if (isQueryResultView) {
            return activeDataQuery?.result.selectedColumns ?? [];
        }
        return (viewColumnRegistry?.columns.length ?? 0) > 0
            ? viewColumnRegistry!.columns.map(entry => entry.physicalName)
            : headers;
    }, [activeDataQuery?.result.selectedColumns, headers, isQueryResultView, viewColumnRegistry]);
    const registryDisplayLabels = useMemo(() => {
        const displayLabelMap = buildDisplayLabelMap(viewColumnRegistry);
        return Object.fromEntries(
            displayColumns
                .map(column => [column, displayLabelMap[column]])
                .filter((entry): entry is [string, string] => Boolean(entry[1] && entry[1] !== entry[0])),
        );
    }, [displayColumns, viewColumnRegistry]);
    const displayColumnLabels = useMemo(() => {
        // PERF-306+312: Fully lazy — no cardCount or inferredColumnLabels subscription.
        // Both read via getState() to avoid triggering Tabulator re-render.
        const plans = useAppStore.getState().analysisCards.map(c => c.plan);
        const labels = useAppStore.getState().latestAnalysisSession?.analysisSteering?.inferredColumnLabels ?? {};
        return {
            ...buildColumnDisplayLabels(headers, plans, labels),
            ...registryDisplayLabels,
        };
    }, [headers, registryDisplayLabels]);
    const semanticHiddenRowCount = getSemanticHiddenRowCount(datasetSemanticSnapshot, semanticDatasetVersion, preferredDataset);
    const largeDatasetBacking = preferredDataset?.backing?.mode === 'duckdb_file'
        ? preferredDataset.backing
        : null;

    console.log(`[Perf:Diag] useSpreadsheetLogic: ${Math.round(performance.now() - _hookT0)}ms (registry=${Math.round(_pd0 - _vcr0)}ms, processedData=${Math.round(_pd1 - _pd0)}ms)`); // PERF-309
    return {
        activeDataset,
        processedData,
        displayColumns,
        displayColumnLabels,
        filterText,
        setFilterText,
        handleQuerySubmit,
        viewMode,
        setViewMode,
        activeDataQuery,
        activeSpreadsheetFilter,
        aiFilterExplanation,
        isAiFiltering,
        clearAiFilter,
        clearActiveDataQuery,
        rawCsvData,
        preparedDatasetStatus,
        semanticStatus,
        semanticHiddenRowCount,
        semanticDefaultReady,
        largeDatasetBacking,
        workflowBundle,
        pageSize: PAGE_SIZE,
        cleaningRun,
    };
};
