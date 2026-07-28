import { a as reactExports, j as jsxRuntimeExports, W as We } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { T as TabulatorTable } from "./csv_data_analysis_TabulatorTable-DqiIrnfv.js";
import { U as getTranslation, bf as applySpreadsheetFilterOperation, bg as buildDataPreparationWorkflowBundle, bh as resolveDatasetBindingTarget, aU as collectOrderedColumnNames, a0 as buildEffectiveColumnRegistryFromState, bi as buildDisplayLabelMap, bj as buildColumnDisplayLabels, bk as getSemanticHiddenRowCount, bl as isPreviewDataQuery } from "./csv_data_analysis_app-agent-DytoEScF.js";
import { u as useAppStore, e as IconLoadingSpinner } from "./csv_data_analysis_index-L92MBGHW.js";
import { I as IconClose } from "./csv_data_analysis_IconClose-Cz0XDY4R.js";
import { I as IconAi } from "./csv_data_analysis_IconAi-zaXrTUAQ.js";
import { I as IconSearch } from "./csv_data_analysis_IconSearch-BADyiBOM.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-LvY-J6mW.js";
import { V as ViewModeToggle, C as CleaningRunBanner, G as GroupByTest } from "./csv_data_analysis_CleaningRunBanner-BisHlpXC.js";
import "./csv_data_analysis_vendor-ui-DPkU1-1J.js";
import "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
import "./csv_data_analysis_IconInsights-miXHhJGo.js";
const getRoleOptions = (language) => [
  { value: void 0, label: getTranslation("column_annotation_role_unspecified", language) },
  { value: "dimension", label: getTranslation("column_annotation_role_dimension", language) },
  { value: "metric", label: getTranslation("column_annotation_role_metric", language) },
  { value: "identifier", label: getTranslation("column_annotation_role_identifier", language) },
  { value: "helper", label: getTranslation("column_annotation_role_helper", language) }
];
const ColumnAnnotationPopover = ({
  columnName,
  columnType,
  existingAnnotation,
  anchorRect,
  language = "English",
  onSave,
  onRemove,
  onClose
}) => {
  const ROLE_OPTIONS = reactExports.useMemo(() => getRoleOptions(language), [language]);
  const [businessLabel, setBusinessLabel] = reactExports.useState((existingAnnotation == null ? void 0 : existingAnnotation.businessLabel) ?? "");
  const [description, setDescription] = reactExports.useState((existingAnnotation == null ? void 0 : existingAnnotation.description) ?? "");
  const [businessRole, setBusinessRole] = reactExports.useState(existingAnnotation == null ? void 0 : existingAnnotation.businessRole);
  const popoverRef = reactExports.useRef(null);
  const labelInputRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    var _a;
    (_a = labelInputRef.current) == null ? void 0 : _a.focus();
  }, []);
  reactExports.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  reactExports.useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);
  const handleSave = reactExports.useCallback(() => {
    if (!businessLabel.trim() && !description.trim() && !businessRole) {
      onClose();
      return;
    }
    onSave({
      columnName,
      businessLabel: businessLabel.trim() || columnName,
      description: description.trim(),
      businessRole
    });
    onClose();
  }, [columnName, businessLabel, description, businessRole, onSave, onClose]);
  const handleRemove = reactExports.useCallback(() => {
    onRemove(columnName);
    onClose();
  }, [columnName, onRemove, onClose]);
  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 320);
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 320));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: popoverRef,
      className: "fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-4 w-72",
      style: { top, left },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-slate-800 truncate", title: columnName, children: columnName }),
          columnType && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded", children: columnType })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-slate-500 mb-1", children: getTranslation("column_annotation_label_business_tag", language) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                ref: labelInputRef,
                type: "text",
                value: businessLabel,
                onChange: (e) => setBusinessLabel(e.target.value),
                placeholder: columnName,
                className: "w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-slate-500 mb-1", children: getTranslation("column_annotation_label_description", language) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: description,
                onChange: (e) => setDescription(e.target.value),
                placeholder: getTranslation("column_annotation_description_placeholder", language),
                className: "w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-slate-500 mb-1", children: getTranslation("column_annotation_label_business_role", language) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "select",
              {
                value: businessRole ?? "",
                onChange: (e) => setBusinessRole(e.target.value || void 0),
                className: "w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white",
                children: ROLE_OPTIONS.map((opt) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: opt.value ?? "", children: opt.label }, opt.value ?? "__none__"))
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mt-4", children: [
          existingAnnotation ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: handleRemove,
              className: "text-xs text-red-500 hover:text-red-700",
              children: getTranslation("column_annotation_remove", language)
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", {}),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: onClose,
                className: "text-xs text-slate-500 hover:text-slate-700 px-2 py-1",
                children: getTranslation("column_annotation_cancel", language)
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: handleSave,
                className: "text-xs bg-blue-500 text-white rounded px-3 py-1 hover:bg-blue-600",
                children: getTranslation("column_annotation_save", language)
              }
            )
          ] })
        ] })
      ]
    }
  );
};
const IconChevron = ({ isOpen }) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: `h-6 w-6 transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" }) });
const SpreadsheetControls = ({
  filterText,
  onFilterTextChange,
  onQuerySubmit,
  isAiFiltering,
  aiEnabled
}) => {
  const language = useAppStore((state) => state.settings.language);
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      onQuerySubmit();
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex-grow", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSearch, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "text",
          placeholder: getTranslation("spreadsheet_search_placeholder", language),
          value: filterText,
          onChange: (e) => onFilterTextChange(e.target.value),
          onKeyDown: handleKeyDown,
          className: "bg-white border border-slate-300 rounded-md py-1.5 pl-10 pr-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: onQuerySubmit,
        disabled: !aiEnabled || isAiFiltering || !filterText.trim(),
        className: "flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300",
        title: getTranslation("spreadsheet_ask_ai", language),
        children: [
          isAiFiltering ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconLoadingSpinner, {}) : /* @__PURE__ */ jsxRuntimeExports.jsx(IconAi, {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation("spreadsheet_ask_ai", language) })
        ]
      }
    )
  ] });
};
const useSpreadsheetData = (csvData, filterText, spreadsheetFilterFunction) => {
  return reactExports.useMemo(() => {
    if (!csvData) return [];
    if (spreadsheetFilterFunction) {
      try {
        return applySpreadsheetFilterOperation([...csvData.data], spreadsheetFilterFunction).data;
      } catch (error) {
        console.error("AI filter execution failed:", error);
        return csvData.data;
      }
    }
    if (filterText) {
      const lowercasedFilter = filterText.toLowerCase();
      return csvData.data.filter(
        (row) => Object.values(row).some(
          (value) => String(value).toLowerCase().includes(lowercasedFilter)
        )
      );
    }
    return csvData.data;
  }, [csvData, filterText, spreadsheetFilterFunction]);
};
const PAGE_SIZE = 50;
const useSpreadsheetLogic = (isVisible) => {
  var _a;
  const _hookT0 = performance.now();
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
    dataPreparationPlan
  } = useAppStore((state) => ({
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
    dataPreparationPlan: state.dataPreparationPlan
  }), shallow$1);
  const preferredDataset = reactExports.useMemo(
    () => canonicalCsvData ?? csvData,
    [canonicalCsvData, csvData]
  );
  const [filterText, setFilterText] = reactExports.useState("");
  const [viewMode, setViewMode] = reactExports.useState("semantic_default");
  const workflowBundle = reactExports.useMemo(
    () => buildDataPreparationWorkflowBundle(useAppStore.getState()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataPreparationPlan]
  );
  reactExports.useEffect(() => {
    if (!rawCsvData && viewMode === "raw") {
      setViewMode("semantic_default");
    }
  }, [rawCsvData, viewMode]);
  reactExports.useEffect(() => {
    if (!isVisible || !preferredDataset || viewMode === "raw" || activeDataQuery) {
      return;
    }
    if ((cleaningRun == null ? void 0 : cleaningRun.status) === "running") {
      return;
    }
    void ensureDatasetSemanticSnapshot(preferredDataset);
  }, [activeDataQuery, cleaningRun == null ? void 0 : cleaningRun.status, preferredDataset, ensureDatasetSemanticSnapshot, isVisible, viewMode]);
  const semanticBindingTarget = reactExports.useMemo(
    () => resolveDatasetBindingTarget({
      mode: "analysis",
      csvData: preferredDataset,
      snapshot: datasetSemanticSnapshot,
      semanticDatasetVersion
    }),
    [preferredDataset, datasetSemanticSnapshot, semanticDatasetVersion]
  );
  const semanticDefaultReady = Boolean(semanticBindingTarget == null ? void 0 : semanticBindingTarget.semanticDatasetCurrent);
  const activeDataset = reactExports.useMemo(() => {
    if (viewMode === "raw" && rawCsvData) {
      return rawCsvData;
    }
    if (activeDataQuery) {
      return {
        fileName: (preferredDataset == null ? void 0 : preferredDataset.fileName) ?? (rawCsvData == null ? void 0 : rawCsvData.fileName) ?? "Query Result",
        data: activeDataQuery.result.rows,
        metadataRows: [],
        summaryRows: [],
        headerDepth: 1
      };
    }
    if (viewMode === "semantic_default") {
      if (semanticDefaultReady) {
        return (semanticBindingTarget == null ? void 0 : semanticBindingTarget.dataset) ?? preferredDataset;
      }
      return preferredDataset;
    }
    return preferredDataset;
  }, [activeDataQuery, preferredDataset, rawCsvData, semanticBindingTarget, semanticDefaultReady, semanticStatus, viewMode]);
  const preparedDatasetStatus = reactExports.useMemo(() => {
    if (!csvData) return "none";
    return workflowBundle.summary.planStatus ?? "none";
  }, [csvData, workflowBundle.summary.planStatus]);
  const headers = reactExports.useMemo(() => {
    if (viewMode !== "raw" && activeDataQuery) {
      return activeDataQuery.result.selectedColumns;
    }
    return collectOrderedColumnNames((activeDataset == null ? void 0 : activeDataset.data) ?? []);
  }, [activeDataQuery, activeDataset, viewMode]);
  const isQueryResultView = viewMode !== "raw" && Boolean(activeDataQuery);
  const _vcr0 = performance.now();
  const viewColumnRegistry = reactExports.useMemo(
    () => {
      var _a2;
      const steering = ((_a2 = useAppStore.getState().latestAnalysisSession) == null ? void 0 : _a2.analysisSteering) ?? null;
      return buildEffectiveColumnRegistryFromState({
        csvData,
        canonicalCsvData,
        columnProfiles,
        datasetSemanticSnapshot,
        userColumnAnnotations,
        latestAnalysisSession: steering ? { analysisSteering: steering } : void 0,
        columnRegistry
      }, {
        datasetOverride: activeDataset,
        semanticSnapshotOverride: viewMode === "raw" ? null : datasetSemanticSnapshot
      });
    },
    [activeDataset, columnProfiles, columnRegistry, datasetSemanticSnapshot, userColumnAnnotations, viewMode]
  );
  const handleQuerySubmit = () => {
    if (filterText.trim()) {
      if (viewMode === "raw") return;
      handleNaturalLanguageQuery(filterText.trim());
    }
  };
  const effectiveFilterFunction = viewMode !== "raw" ? spreadsheetFilterFunction : null;
  const _pd0 = performance.now();
  const processedData = useSpreadsheetData(activeDataset, filterText, effectiveFilterFunction);
  const _pd1 = performance.now();
  const displayColumns = reactExports.useMemo(() => {
    if (isQueryResultView) {
      return (activeDataQuery == null ? void 0 : activeDataQuery.result.selectedColumns) ?? [];
    }
    return ((viewColumnRegistry == null ? void 0 : viewColumnRegistry.columns.length) ?? 0) > 0 ? viewColumnRegistry.columns.map((entry) => entry.physicalName) : headers;
  }, [activeDataQuery == null ? void 0 : activeDataQuery.result.selectedColumns, headers, isQueryResultView, viewColumnRegistry]);
  const registryDisplayLabels = reactExports.useMemo(() => {
    const displayLabelMap = buildDisplayLabelMap(viewColumnRegistry);
    return Object.fromEntries(
      displayColumns.map((column) => [column, displayLabelMap[column]]).filter((entry) => Boolean(entry[1] && entry[1] !== entry[0]))
    );
  }, [displayColumns, viewColumnRegistry]);
  const displayColumnLabels = reactExports.useMemo(() => {
    var _a2, _b;
    const plans = useAppStore.getState().analysisCards.map((c) => c.plan);
    const labels = ((_b = (_a2 = useAppStore.getState().latestAnalysisSession) == null ? void 0 : _a2.analysisSteering) == null ? void 0 : _b.inferredColumnLabels) ?? {};
    return {
      ...buildColumnDisplayLabels(headers, plans, labels),
      ...registryDisplayLabels
    };
  }, [headers, registryDisplayLabels]);
  const semanticHiddenRowCount = getSemanticHiddenRowCount(datasetSemanticSnapshot, semanticDatasetVersion, preferredDataset);
  const largeDatasetBacking = ((_a = preferredDataset == null ? void 0 : preferredDataset.backing) == null ? void 0 : _a.mode) === "duckdb_file" ? preferredDataset.backing : null;
  console.log(`[Perf:Diag] useSpreadsheetLogic: ${Math.round(performance.now() - _hookT0)}ms (registry=${Math.round(_pd0 - _vcr0)}ms, processedData=${Math.round(_pd1 - _pd0)}ms)`);
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
    cleaningRun
  };
};
const SpreadsheetPanel = ({ isVisible }) => {
  var _a;
  const onToggleVisibility = () => useAppStore.getState().setIsSpreadsheetVisible(!isVisible);
  const language = useAppStore((state) => state.settings.language);
  const resumeCleaningRun = useAppStore((state) => state.resumeCleaningRun);
  const restartCleaningRun = useAppStore((state) => state.restartCleaningRun);
  const userColumnAnnotations = useAppStore((state) => state.userColumnAnnotations);
  const setColumnAnnotation = useAppStore((state) => state.setColumnAnnotation);
  const removeColumnAnnotation = useAppStore((state) => state.removeColumnAnnotation);
  const columnProfiles = useAppStore((state) => state.columnProfiles);
  const [isGroupByMode, setIsGroupByMode] = We.useState(false);
  const [annotatingColumn, setAnnotatingColumn] = We.useState(null);
  const annotatedColumns = reactExports.useMemo(
    () => new Set(Object.keys(userColumnAnnotations)),
    [userColumnAnnotations]
  );
  const handleColumnHeaderClick = reactExports.useCallback((columnName, rect) => {
    setAnnotatingColumn({ name: columnName, rect });
  }, []);
  const handleAnnotationSave = reactExports.useCallback((annotation) => {
    setColumnAnnotation(annotation);
  }, [setColumnAnnotation]);
  const handleAnnotationRemove = reactExports.useCallback((columnName) => {
    removeColumnAnnotation(columnName);
  }, [removeColumnAnnotation]);
  const {
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
    pageSize,
    cleaningRun
  } = useSpreadsheetLogic(isVisible);
  if (!activeDataset) return null;
  const preparedStatusLabel = preparedDatasetStatus === "operations" ? getTranslation("ai_cleaned", language) : preparedDatasetStatus === "schema_only" ? getTranslation("proposed_schema_only", language) : preparedDatasetStatus === "inconsistent" ? getTranslation("cleaning_blocked", language) : null;
  const preparedStatusClasses = preparedDatasetStatus === "operations" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : preparedDatasetStatus === "schema_only" ? "bg-amber-100 text-amber-800 border-amber-200" : preparedDatasetStatus === "inconsistent" ? "bg-rose-100 text-rose-800 border-rose-200" : "bg-slate-100 text-slate-600 border-slate-200";
  const helperText = viewMode !== "raw" ? activeDataQuery ? isPreviewDataQuery(activeDataQuery.plan, activeDataQuery.fallbackFilterOperation) ? getTranslation("spreadsheet_showing_data_preview", language) : getTranslation("spreadsheet_showing_analysis_result", language) : viewMode === "semantic_all" ? getTranslation("showing_all_prepared_rows", language) : viewMode === "semantic_default" && !semanticDefaultReady ? getTranslation("showing_cleaned_prepared_fallback", language) : preparedDatasetStatus === "schema_only" ? getTranslation("showing_prepared_data_schema_only", language) : preparedDatasetStatus === "inconsistent" ? getTranslation("showing_prepared_data_blocked", language) : preparedDatasetStatus === "operations" ? getTranslation("showing_semantic_default", language) : getTranslation("showing_semantic_default", language) : getTranslation("showing_raw_csv", language);
  const tableKey = [
    viewMode,
    activeDataset.fileName,
    (activeDataQuery == null ? void 0 : activeDataQuery.appliedAt) instanceof Date ? activeDataQuery.appliedAt.toISOString() : "dataset",
    (activeDataQuery == null ? void 0 : activeDataQuery.tableName) ?? "no-table",
    (activeDataQuery == null ? void 0 : activeDataQuery.loadVersion) ?? "no-version"
  ].join(":");
  const isPreviewQuery = activeDataQuery ? isPreviewDataQuery(activeDataQuery.plan, activeDataQuery.fallbackFilterOperation) : false;
  const queryMeasureColumns = reactExports.useMemo(
    () => ((activeDataQuery == null ? void 0 : activeDataQuery.plan.aggregates) ?? []).filter((aggregate) => aggregate.function !== "count" && aggregate.function !== "count_distinct").map((aggregate) => aggregate.as),
    [activeDataQuery]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { id: "raw-data-explorer", className: "flex flex-col rounded-card border border-slate-200 bg-white shadow-lg transition-all duration-300", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: onToggleVisibility,
        className: "flex w-full cursor-pointer items-center justify-between rounded-t-lg px-4 py-3 text-left hover:bg-slate-50",
        "aria-expanded": isVisible,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-bold text-slate-900", children: getTranslation("raw_data_explorer", language) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-slate-500", children: [
              getTranslation("file_label", language),
              " ",
              activeDataset.fileName
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(IconChevron, { isOpen: isVisible })
        ]
      }
    ),
    isVisible && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full min-h-0 flex-col space-y-4 px-4 pb-4 pt-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-start justify-between gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "inline-flex gap-1 rounded-md bg-slate-100 p-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setViewMode("semantic_default"),
              className: `rounded px-3 py-1.5 text-sm font-medium ${viewMode === "semantic_default" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-800"}`,
              children: getTranslation("prepared_data", language)
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setViewMode("semantic_all"),
              className: `rounded px-3 py-1.5 text-sm font-medium ${viewMode === "semantic_all" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-800"}`,
              children: getTranslation("all_prepared_data", language)
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => rawCsvData && setViewMode("raw"),
              disabled: !rawCsvData,
              className: `rounded px-3 py-1.5 text-sm font-medium ${viewMode === "raw" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-800"} ${!rawCsvData ? "cursor-not-allowed opacity-50" : ""}`,
              children: getTranslation("original_csv", language)
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          !largeDatasetBacking && /* @__PURE__ */ jsxRuntimeExports.jsx(ViewModeToggle, { isGroupBy: isGroupByMode, onToggle: setIsGroupByMode, language }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-slate-500", children: helperText }),
          semanticStatus === "running" && viewMode === "semantic_default" && !activeDataQuery && !semanticDefaultReady && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-medium text-slate-500", children: getTranslation("semantic_view_preparing", language) }),
          viewMode === "semantic_default" && semanticDefaultReady && semanticHiddenRowCount > 0 && !activeDataQuery && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800", children: getTranslation("semantic_hidden_rows", language, { count: semanticHiddenRowCount }) }),
          viewMode !== "raw" && preparedStatusLabel && !activeDataQuery && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${preparedStatusClasses}`, children: preparedStatusLabel })
        ] })
      ] }),
      largeDatasetBacking && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950", role: "status", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold", children: getTranslation("large_dataset_mode_title", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1", children: getTranslation("large_dataset_mode_body", language, {
          totalRows: largeDatasetBacking.rowCount.toLocaleString(),
          sampleRows: largeDatasetBacking.sampleRowCount.toLocaleString()
        }) })
      ] }),
      cleaningRun && cleaningRun.status !== "completed" && /* @__PURE__ */ jsxRuntimeExports.jsx(
        CleaningRunBanner,
        {
          cleaningRun,
          onContinue: () => void resumeCleaningRun(),
          onRestart: () => void restartCleaningRun(),
          variant: "spreadsheet"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SpreadsheetControls,
        {
          filterText,
          onFilterTextChange: setFilterText,
          onQuerySubmit: handleQuerySubmit,
          isAiFiltering: isAiFiltering && viewMode !== "raw",
          aiEnabled: viewMode !== "raw"
        }
      ),
      viewMode !== "raw" && activeDataQuery && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold", children: isPreviewQuery ? getTranslation("spreadsheet_data_preview", language) : getTranslation("spreadsheet_analysis_result", language) }),
          " ",
          activeDataQuery.explanation,
          " ",
          isPreviewQuery ? getTranslation("spreadsheet_preview_rows", language, { count: activeDataQuery.result.returnedRows }) : getTranslation("spreadsheet_matched_rows", language, {
            returned: activeDataQuery.result.returnedRows,
            total: activeDataQuery.result.totalMatchedRows
          }),
          activeDataQuery.result.truncated ? ` ${getTranslation("data_explorer_truncated", language, { returned: activeDataQuery.result.returnedRows, total: activeDataQuery.result.totalMatchedRows })}` : "",
          (activeDataQuery.engine || activeDataQuery.fallbackReason) && /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mt-1 text-xs text-emerald-900", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { children: getTranslation("technical_details", language) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: activeDataQuery.engine }),
            activeDataQuery.fallbackReason && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: activeDataQuery.fallbackReason })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: clearActiveDataQuery,
            className: "p-1 rounded-full hover:bg-emerald-200",
            title: getTranslation("spreadsheet_clear_result", language),
            "aria-label": getTranslation("spreadsheet_clear_result", language),
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, {})
          }
        )
      ] }),
      viewMode !== "raw" && ((activeSpreadsheetFilter == null ? void 0 : activeSpreadsheetFilter.finalReply) || aiFilterExplanation) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold", children: getTranslation("ai_filter", language) }),
          " ",
          (activeSpreadsheetFilter == null ? void 0 : activeSpreadsheetFilter.finalReply) ?? aiFilterExplanation
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: clearAiFilter,
            className: "p-1 rounded-full hover:bg-blue-200",
            title: getTranslation("spreadsheet_clear_filter", language),
            "aria-label": getTranslation("spreadsheet_clear_filter", language),
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, {})
          }
        )
      ] }),
      isGroupByMode ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "min-w-0 flex-grow overflow-hidden rounded-md border border-slate-200 p-4",
          style: { height: "60vh", maxHeight: "60vh" },
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            GroupByTest,
            {
              rows: processedData,
              language,
              accentColor: "slate",
              onRequestCard: (msg, precomputedData) => {
                if (precomputedData == null ? void 0 : precomputedData.length) {
                  useAppStore.getState().setPendingPrecomputedCardData(precomputedData);
                }
                void useAppStore.getState().handleChatMessage(msg, { source: "action" });
              }
            }
          )
        }
      ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "min-w-0 flex-grow overflow-hidden rounded-md border border-slate-200",
          style: { height: "60vh", maxHeight: "60vh" },
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            TabulatorTable,
            {
              data: processedData,
              columns: displayColumns,
              displayColumnLabels,
              pageSize,
              tableKey,
              language,
              emptyStateText: "No data matches your search.",
              measureColumns: queryMeasureColumns,
              annotatedColumns,
              onColumnHeaderClick: handleColumnHeaderClick
            }
          )
        }
      )
    ] }),
    annotatingColumn && /* @__PURE__ */ jsxRuntimeExports.jsx(
      ColumnAnnotationPopover,
      {
        columnName: annotatingColumn.name,
        columnType: (_a = columnProfiles.find((c) => c.name === annotatingColumn.name)) == null ? void 0 : _a.type,
        existingAnnotation: userColumnAnnotations[annotatingColumn.name],
        anchorRect: annotatingColumn.rect,
        language,
        onSave: handleAnnotationSave,
        onRemove: handleAnnotationRemove,
        onClose: () => setAnnotatingColumn(null)
      }
    )
  ] });
};
export {
  SpreadsheetPanel
};
