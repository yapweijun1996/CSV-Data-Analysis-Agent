import { W as We, a as reactExports, j as jsxRuntimeExports, r as reactDomExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-LvY-J6mW.js";
import { I as IconInsights } from "./csv_data_analysis_IconInsights-miXHhJGo.js";
import { M as MarkdownRenderer } from "./csv_data_analysis_MarkdownRenderer-8qXuZeTk.js";
import { U as getTranslation, a8 as getCurrentAnalysisDatasetVersion, aF as resolveAnalysisArtifactFreshness, aG as summarizeDataQualityForEndUser, aH as normalizeCategoryLabel, aI as parseNumericValue, aJ as formatAnalysisMeasureValue, aK as formatTemporalDisplayValue, aL as applyTopNWithOthers, aM as buildPivotStackedChartState, aN as DEFAULT_STACKED_PIVOT_COLUMN_TOP_N, aA as resolveDisplayPlanTitle, aO as resolveDisplayPlanDescription, aP as resolvePlanGroupLabel, aQ as resolvePlanMetricLabel, aR as formatAnalysisValue, aS as getBarChartReadabilityHints, aT as PIVOT_FOLDED_OTHERS_KEY, aU as collectOrderedColumnNames, aV as getNumericColumns, aW as getAnalysisColumnLabels, aX as formatAnalysisCellValue, aY as isProviderConfigured, aZ as createProviderModel, a_ as resolveCardTrustDecision, a$ as getLocalizedText, b0 as evaluateChartPresentation, b1 as getAvailableChartTypes, b2 as isTimeLikeDimensionColumn, b3 as buildStackedPivotChartPlan, b4 as getPivotCardQualitySummary, b5 as normalizeDisplayLabel, b6 as isUsableReportTitle, b7 as isLatestReportPartial, b8 as resolveLatestReportBlockedInfo, a7 as hasOpenableLatestReport, b9 as resolveAnalysisCompletionGate, ba as buildDisplayAnalysisIr, bb as buildExecutiveKpis, bc as resolveEffectiveReportContext, bd as shouldShowDataWarnings, be as getCsvDataRowCount } from "./csv_data_analysis_app-agent-DytoEScF.js";
import { u as useAppStore, a as IconWarning, g as getCachedChart, c as computeChartCacheKey, b as computeDataContentHash, s as setCachedChart, d as useDialogAccessibility, E as ErrorBoundary } from "./csv_data_analysis_index-L92MBGHW.js";
import { C as Chart, p as plugin, a as plugin$1, M as Masonry } from "./csv_data_analysis_vendor-ui-DPkU1-1J.js";
import { e as exportToHtml, a as exportToCsv, b as exportToPng } from "./csv_data_analysis_exportUtils-CPeSo2GB.js";
import { I as IconClose } from "./csv_data_analysis_IconClose-Cz0XDY4R.js";
import { T as TabulatorTable } from "./csv_data_analysis_TabulatorTable-DqiIrnfv.js";
import { V as ViewModeToggle, G as GroupByTest, f as formatNumber, D as DataTable$1, C as CleaningRunBanner } from "./csv_data_analysis_CleaningRunBanner-BisHlpXC.js";
import { g as generateText } from "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import { A as AiTaskStatusBubble } from "./csv_data_analysis_AiTaskStatusBubble-BAgmBWor.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
import "./csv_data_analysis_IconSearch-BADyiBOM.js";
import "./csv_data_analysis_IconSettings-B7Z7C3gl.js";
const PREVIEW_CHAR_LIMIT = 180;
const extractPreview = (text) => {
  const trimmed = text.trim();
  const plain = trimmed.replace(/^#{1,3}\s+/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\n+/g, " ").trim();
  if (plain.length <= PREVIEW_CHAR_LIMIT) return plain;
  const truncated = plain.slice(0, PREVIEW_CHAR_LIMIT);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > PREVIEW_CHAR_LIMIT * 0.6 ? truncated.slice(0, lastSpace) : truncated) + "…";
};
const FinalSummaryComponent = ({ title, summary, language, provenance, currentDataset, defaultExpanded = true }) => {
  const [isExpanded, setIsExpanded] = reactExports.useState(defaultExpanded);
  const contentRef = reactExports.useRef(null);
  const generatedInLabel = summary.language !== language ? getTranslation("summary_generated_in", language, { language: summary.language }) : null;
  const preview = reactExports.useMemo(() => extractPreview(summary.text), [summary.text]);
  const expandLabel = getTranslation("insights_expand", language);
  const collapseLabel = getTranslation("insights_collapse", language);
  const currentDatasetVersion = currentDataset ? getCurrentAnalysisDatasetVersion(currentDataset) : (provenance == null ? void 0 : provenance.datasetVersion) ?? null;
  const freshness = resolveAnalysisArtifactFreshness(provenance, currentDatasetVersion);
  const evidenceState = freshness === "stale" ? "stale" : (provenance == null ? void 0 : provenance.evidenceStatus) ?? "unverified";
  const toggle = reactExports.useCallback(() => setIsExpanded((prev) => !prev), []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      className: "relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md",
      "aria-label": title,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute inset-x-0 top-0 h-[3px] bg-indigo-500", "aria-hidden": "true" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            className: "flex w-full items-center gap-3 px-5 pt-5 pb-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
            onClick: toggle,
            "aria-expanded": isExpanded,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-100 p-2 text-indigo-600", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconInsights, { className: "h-5 w-5" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-bold text-slate-900", children: title }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "span",
                    {
                      className: `rounded-full px-2 py-0.5 text-[11px] font-semibold ${evidenceState === "verified" ? "bg-emerald-100 text-emerald-700" : evidenceState === "degraded" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`,
                      title: `Narrative dataset version: ${(provenance == null ? void 0 : provenance.datasetVersion) ?? "unverified"}`,
                      children: evidenceState === "verified" ? "Verified evidence" : evidenceState === "degraded" ? "Degraded evidence" : evidenceState === "stale" ? "Stale evidence" : evidenceState === "hypothesis" ? "Hypothesis" : "Unverified evidence"
                    }
                  ),
                  generatedInLabel && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600", children: generatedInLabel })
                ] }),
                !isExpanded && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 truncate text-sm text-slate-500", children: preview })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "svg",
                {
                  xmlns: "http://www.w3.org/2000/svg",
                  className: `h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`,
                  fill: "none",
                  viewBox: "0 0 24 24",
                  stroke: "currentColor",
                  strokeWidth: 2,
                  "aria-hidden": "true",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 9l-7 7-7-7" })
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-end px-5 pb-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-medium text-slate-400", children: isExpanded ? collapseLabel : expandLabel }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            ref: contentRef,
            "aria-hidden": !isExpanded,
            className: `overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`,
            children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-slate-100 px-5 pb-5 pt-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(MarkdownRenderer, { content: summary.text }) })
          }
        )
      ]
    }
  );
};
const FinalSummary = We.memo(FinalSummaryComponent);
const DataQualityWarningsComponent = () => {
  const { dataWarnings, intakeWarnings, language } = useAppStore((state) => {
    var _a, _b, _c;
    return {
      dataWarnings: ((_a = state.agentMemoryRun) == null ? void 0 : _a.findings.warnings.map((w) => w.message)) ?? state.dataQualityIssues ?? [],
      intakeWarnings: ((_c = (_b = state.csvData) == null ? void 0 : _b.intakeDetection) == null ? void 0 : _c.warnings) ?? [],
      language: state.settings.language
    };
  }, shallow$1);
  const [showTechnical, setShowTechnical] = reactExports.useState(false);
  const warningMessages = Array.isArray(dataWarnings) ? dataWarnings : [];
  const intakeWarningMessages = intakeWarnings.map((warning) => warning.message);
  const hasWarnings = warningMessages.length > 0 || intakeWarningMessages.length > 0;
  if (!hasWarnings) return null;
  const endUserResult = warningMessages.length > 0 ? summarizeDataQualityForEndUser(warningMessages) : null;
  const userSummary = (endUserResult == null ? void 0 : endUserResult.userSummary) ?? getTranslation("data_warnings_intake_reported", language, { count: intakeWarningMessages.length });
  const technicalDetail = (endUserResult == null ? void 0 : endUserResult.technicalDetail) ?? null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-amber-50 border border-amber-200 rounded-card p-4 shadow-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center mb-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(IconWarning, { className: "text-amber-600 w-5 h-5 mr-2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-amber-800 font-semibold text-sm uppercase tracking-wide", children: getTranslation("data_warnings_title", language) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-amber-800", children: userSummary }),
    intakeWarningMessages.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-md border border-amber-200 bg-white/50 p-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-amber-700", children: getTranslation("data_warnings_intake_label", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-1 text-xs text-amber-800", children: intakeWarningMessages.slice(0, 3).map((message) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
        "- ",
        message
      ] }, message)) })
    ] }),
    technicalDetail && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "details",
      {
        open: showTechnical,
        onToggle: (e) => setShowTechnical(e.target.open),
        className: "mt-2",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer text-xs font-medium text-amber-600 hover:text-amber-800", children: getTranslation("data_warnings_technical_toggle", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 rounded-md bg-white/50 p-2 text-xs text-amber-700 font-mono", children: technicalDetail })
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs text-amber-700", children: getTranslation("data_warnings_footer", language) })
  ] });
};
const DataQualityWarnings = We.memo(DataQualityWarningsComponent);
const COLORS$1 = ["#4e79a7", "#f28e2c", "#e15759", "#76b7b2", "#59a14f", "#edc949", "#af7aa1", "#ff9da7", "#9c755f", "#bab0ab"];
const InteractiveLegendComponent = ({ data, total, groupByKey, valueKey, hiddenLabels, onLabelClick }) => {
  const language = useAppStore((state) => state.settings.language);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm space-y-1 max-h-48 overflow-y-auto pr-2", "data-export-exclude": true, children: data.map((item, index) => {
    const label = normalizeCategoryLabel(item[groupByKey]);
    const value = parseNumericValue(item[valueKey]);
    const percentage = total > 0 ? (value / total * 100).toFixed(1) : "0.0";
    const isHidden = hiddenLabels.includes(label);
    const color = COLORS$1[index % COLORS$1.length];
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => onLabelClick(label),
        className: `flex min-h-[44px] w-full items-center justify-between rounded-md p-1.5 transition-all duration-200 md:min-h-0 ${isHidden ? "opacity-50" : "hover:bg-slate-100"}`,
        title: getTranslation("card_toggle_legend_item", language, {
          action: getTranslation(isHidden ? "card_action_show" : "card_action_hide", language),
          label
        }),
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center truncate mr-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3 h-3 rounded-sm mr-2 flex-shrink-0", style: { backgroundColor: isHidden ? "#9ca3af" : color } }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `truncate text-sm ${isHidden ? "line-through text-slate-400" : "text-slate-700"}`, children: label })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-baseline ml-2 flex-shrink-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `font-semibold text-sm ${isHidden ? "text-slate-400" : "text-slate-800"}`, children: formatAnalysisMeasureValue(value) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-slate-500 ml-1.5 w-12 text-right", children: [
              "(",
              percentage,
              "%)"
            ] })
          ] })
        ]
      },
      `${label}-${index}`
    );
  }) });
};
const InteractiveLegend = We.memo(InteractiveLegendComponent);
const useAnalysisCardData = (cardId) => {
  const cardData = useAppStore((state) => state.analysisCards.find((c) => c.id === cardId));
  const {
    plan,
    aggregatedData,
    summary,
    topN,
    hideOthers,
    hideZeroValueRows,
    pivotColumnTopN,
    pivotHideOtherColumns,
    hiddenPivotSeriesLabels,
    filter,
    hiddenLabels,
    tableSort
  } = cardData || {};
  const valueKey = reactExports.useMemo(() => {
    const planned = (plan == null ? void 0 : plan.valueColumn) || "count";
    if (!(aggregatedData == null ? void 0 : aggregatedData.length)) return planned;
    if (planned in aggregatedData[0]) return planned;
    const groupBy = plan == null ? void 0 : plan.groupByColumn;
    const columns = Object.keys(aggregatedData[0]);
    const plannedLower = planned.toLowerCase();
    const aliasMatch = columns.find((col) => {
      if (col === groupBy) return false;
      const colLower = col.toLowerCase();
      return colLower === plannedLower || colLower.endsWith(` ${plannedLower}`) || colLower.startsWith(`${plannedLower} `);
    });
    if (aliasMatch) return aliasMatch;
    const numericCol = columns.find(
      (col) => col !== groupBy && typeof aggregatedData[0][col] === "number"
    );
    return numericCol || planned;
  }, [plan, aggregatedData]);
  const groupByKey = reactExports.useMemo(() => (plan == null ? void 0 : plan.groupByColumn) || "", [plan]);
  const normalizeDisplayRows = reactExports.useMemo(() => (rows) => rows.map((row) => {
    const nextRow = { ...row };
    Object.entries(row).forEach(([column, value]) => {
      const temporalDisplayValue = formatTemporalDisplayValue(column, value);
      if (temporalDisplayValue) {
        nextRow[column] = temporalDisplayValue;
      }
    });
    if (groupByKey) {
      const groupDisplayValue = formatTemporalDisplayValue(groupByKey, row[groupByKey]);
      nextRow[groupByKey] = groupDisplayValue ?? normalizeCategoryLabel(row[groupByKey]);
    }
    return nextRow;
  }), [groupByKey]);
  const dataAfterFilter = reactExports.useMemo(() => {
    if (!aggregatedData) return [];
    let data = aggregatedData;
    if (filter && filter.column && filter.values.length > 0) {
      data = data.filter((row) => {
        const candidate = row[filter.column];
        return typeof candidate === "string" || typeof candidate === "number" ? filter.values.includes(candidate) : false;
      });
    }
    return normalizeDisplayRows(data);
  }, [aggregatedData, filter, normalizeDisplayRows]);
  const dataForLegend = reactExports.useMemo(() => {
    if (!plan) return [];
    if (!plan.disableTopNControls && plan.chartType !== "scatter" && groupByKey && topN) {
      return applyTopNWithOthers(dataAfterFilter, groupByKey, valueKey, topN);
    }
    return dataAfterFilter;
  }, [dataAfterFilter, plan, groupByKey, topN, valueKey]);
  const tableDataForDisplay = reactExports.useMemo(() => {
    let data = dataForLegend;
    if (!(plan == null ? void 0 : plan.disableTopNControls) && topN && hideOthers) {
      data = data.filter((row) => row[groupByKey] !== "Others");
    }
    if (groupByKey && hiddenLabels) {
      data = data.filter((row) => !hiddenLabels.includes(String(row[groupByKey])));
    }
    return data;
  }, [dataForLegend, topN, hideOthers, groupByKey, hiddenLabels, plan]);
  const sortedTableData = reactExports.useMemo(() => {
    if (!tableSort) return tableDataForDisplay;
    const { column, direction } = tableSort;
    return [...tableDataForDisplay].sort((a, b) => {
      const aVal = a[column];
      const bVal = b[column];
      const aNum = typeof aVal === "number" ? aVal : Number(String(aVal).replace(/[,$%()]/g, (m) => m === "(" ? "-" : m === ")" ? "" : ""));
      const bNum = typeof bVal === "number" ? bVal : Number(String(bVal).replace(/[,$%()]/g, (m) => m === "(" ? "-" : m === ")" ? "" : ""));
      const bothNumeric = !isNaN(aNum) && !isNaN(bNum) && aVal !== "" && aVal != null && bVal !== "" && bVal != null;
      if (bothNumeric) {
        return direction === "asc" ? aNum - bNum : bNum - aNum;
      }
      const aStr = String(aVal ?? "");
      const bStr = String(bVal ?? "");
      return direction === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [tableDataForDisplay, tableSort]);
  const chartHiddenZeroValueRowCount = reactExports.useMemo(() => {
    if ((plan == null ? void 0 : plan.artifactType) !== "pivot_matrix" || !hideZeroValueRows) {
      return 0;
    }
    return tableDataForDisplay.filter((row) => parseNumericValue(row[valueKey]) === 0).length;
  }, [hideZeroValueRows, plan == null ? void 0 : plan.artifactType, tableDataForDisplay, valueKey]);
  const chartRowDataForDisplay = reactExports.useMemo(() => {
    const base = sortedTableData;
    if ((plan == null ? void 0 : plan.artifactType) !== "pivot_matrix" || !hideZeroValueRows) {
      return base;
    }
    return base.filter((row) => parseNumericValue(row[valueKey]) !== 0);
  }, [hideZeroValueRows, plan == null ? void 0 : plan.artifactType, sortedTableData, valueKey]);
  const tableZeroValueRowCount = reactExports.useMemo(() => {
    if ((plan == null ? void 0 : plan.artifactType) !== "pivot_matrix") {
      return 0;
    }
    return tableDataForDisplay.filter((row) => parseNumericValue(row[valueKey]) === 0).length;
  }, [plan == null ? void 0 : plan.artifactType, tableDataForDisplay, valueKey]);
  const totalValue = reactExports.useMemo(() => {
    return dataAfterFilter.reduce((sum, row) => sum + parseNumericValue(row[valueKey]), 0);
  }, [dataAfterFilter, valueKey]);
  const displayedTotalValue = reactExports.useMemo(() => {
    return tableDataForDisplay.reduce((sum, row) => sum + parseNumericValue(row[valueKey]), 0);
  }, [tableDataForDisplay, valueKey]);
  const stackedChartColumnState = reactExports.useMemo(() => {
    if (!plan || plan.artifactType !== "pivot_matrix") {
      return null;
    }
    return buildPivotStackedChartState(
      plan,
      chartRowDataForDisplay,
      pivotColumnTopN ?? DEFAULT_STACKED_PIVOT_COLUMN_TOP_N,
      pivotHideOtherColumns ?? false,
      hiddenPivotSeriesLabels ?? []
    );
  }, [chartRowDataForDisplay, hiddenPivotSeriesLabels, pivotColumnTopN, pivotHideOtherColumns, plan]);
  return {
    cardData,
    tableDataForDisplay: sortedTableData,
    chartDataForDisplay: chartRowDataForDisplay,
    dataForLegend,
    totalValue,
    displayedTotalValue,
    totalRowCount: dataAfterFilter.length,
    displayedRowCount: tableDataForDisplay.length,
    chartHiddenZeroValueRowCount,
    tableZeroValueRowCount,
    stackedChartColumnState,
    summary,
    valueKey,
    groupByKey,
    tableSort: tableSort ?? null
  };
};
const IconExport = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-4 w-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" }) });
const IconMoreHorizontal = (props) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-4 w-4", fill: "currentColor", viewBox: "0 0 24 24", ...props, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "5", cy: "12", r: "1.75" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "1.75" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "19", cy: "12", r: "1.75" })
] });
const IconBarChart = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M2 10a1 1 0 011-1h1a1 1 0 011 1v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-4zM8 8a1 1 0 011-1h1a1 1 0 011 1v6a1 1 0 01-1 1H9a1 1 0 01-1-1V8zM14 4a1 1 0 011-1h1a1 1 0 011 1v10a1 1 0 01-1 1h-1a1 1 0 01-1-1V4z" }) });
const IconHorizontalBarChart = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M4 3a1 1 0 00-1 1v1a1 1 0 001 1h10a1 1 0 001-1V4a1 1 0 00-1-1H4zM4 8a1 1 0 00-1 1v1a1 1 0 001 1h6a1 1 0 001-1V9a1 1 0 00-1-1H4zM4 13a1 1 0 00-1 1v1a1 1 0 001 1h14a1 1 0 001-1v-1a1 1 0 00-1-1H4z" }) });
const IconLineChart = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M3 3a1 1 0 000 2v8a1 1 0 001 1h12a1 1 0 100-2H5V3a1 1 0 00-2 0zm12.293 4.293a1 1 0 011.414 0l2 2a1 1 0 01-1.414 1.414L15 8.414l-2.293 2.293a1 1 0 01-1.414 0l-2-2a1 1 0 111.414-1.414L12 7.586l1.293-1.293z", clipRule: "evenodd" }) });
const IconAreaChart = (props) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M3 17V7l4 3 3-5 4 2 3-4v14H3zm4-7.5L3 6.5V17h14V4.5l-3 4-4-2-3 5z", clipRule: "evenodd" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 17V9.5l4 3 3-5 4 2 3-4V17H3z", opacity: "0.3" })
] });
const IconPieChart = (props) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" })
] });
const IconDoughnutChart = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M10 18a8 8 0 100-16 8 8 0 000 16zM7 10a3 3 0 116 0 3 3 0 01-6 0z", clipRule: "evenodd" }) });
const IconPolarAreaChart = (props) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M10 2a8 8 0 018 8h-8V2z", opacity: "0.7" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M10 10h8a8 8 0 01-4 6.93L10 10z", opacity: "0.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M14 16.93A8 8 0 012 10h8l4 6.93z", opacity: "0.3" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "10", cy: "10", r: "8", fill: "none", stroke: "currentColor", strokeWidth: "1.5", opacity: "0.4" })
] });
const IconScatterChart = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 3a2 2 0 100 4 2 2 0 000-4zM5 13a2 2 0 100 4 2 2 0 000-4zM15 3a2 2 0 100 4 2 2 0 000-4zM15 13a2 2 0 100 4 2 2 0 000-4zM8 8a2 2 0 100 4 2 2 0 000-4zM12 8a2 2 0 100 4 2 2 0 000-4z" }) });
const IconComboChart = (props) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { opacity: "0.6", d: "M2 10a1 1 0 011-1h1a1 1 0 011 1v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-4zM8 8a1 1 0 011-1h1a1 1 0 011 1v6a1 1 0 01-1 1H9a1 1 0 01-1-1V8zM14 4a1 1 0 011-1h1a1 1 0 011 1v10a1 1 0 01-1 1h-1a1 1 0 01-1-1V4z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M3.293 11.293a1 1 0 011.414 0L8 14.586l2.293-2.293a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 15.414l-2.293 2.293a1 1 0 01-1.414 0L3.293 12.707a1 1 0 010-1.414z", clipRule: "evenodd" })
] });
const IconRadarChart = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "1.5", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M19.62 8.35L12.5 2.5h-5L.38 8.35l3.47 9.15h12.3l3.47-9.15zM10 5.42L3.81 9.5 7.15 18h5.7L16.19 9.5 10 5.42zM10 17a7 7 0 100-14 7 7 0 000 14z" }) });
const IconBubbleChart = (props) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "10", cy: "10", r: "5", opacity: "0.8" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "4", cy: "5", r: "3", opacity: "0.7" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "16", cy: "15", r: "4", opacity: "0.6" })
] });
const iconClassName = "h-4 w-4";
const ChartTypeIcon = ({ type, className = iconClassName }) => {
  switch (type) {
    case "bar":
    case "stacked_bar":
    case "stacked_column":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(IconBarChart, { className });
    case "horizontal_bar":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(IconHorizontalBarChart, { className });
    case "line":
    case "multi_line":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(IconLineChart, { className });
    case "area":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(IconAreaChart, { className });
    case "pie":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(IconPieChart, { className });
    case "doughnut":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(IconDoughnutChart, { className });
    case "polar_area":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(IconPolarAreaChart, { className });
    case "scatter":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(IconScatterChart, { className });
    case "combo":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(IconComboChart, { className });
    case "radar":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(IconRadarChart, { className });
    case "bubble":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(IconBubbleChart, { className });
    default:
      return null;
  }
};
const trustBorderClass = (status) => {
  if (status === "verified") return "border-l-emerald-400";
  if (status === "caveated") return "border-l-amber-400";
  if (status === "weak" || status === "stale") return "border-l-red-400";
  return "border-l-slate-400";
};
const trustIconClass = (status) => {
  if (status === "verified") return "bg-emerald-50 text-emerald-600";
  if (status === "caveated") return "bg-amber-50 text-amber-600";
  if (status === "weak" || status === "stale") return "bg-red-50 text-red-600";
  return "bg-slate-100 text-slate-600";
};
const AnalysisCardHeaderComponent = ({
  cardId,
  plan,
  displayChartType,
  availableChartTypes,
  isExporting,
  trustStatus,
  isCardExpanded,
  language,
  onToggleExpand,
  onToggleProvenance,
  onVerdictClick,
  onChartTypeChange,
  onExport,
  onDelete,
  showActions = true
}) => {
  const [openMenu, setOpenMenu] = reactExports.useState(null);
  const chartMenuRef = reactExports.useRef(null);
  const exportMenuRef = reactExports.useRef(null);
  const moreMenuRef = reactExports.useRef(null);
  const chartButtonRef = reactExports.useRef(null);
  const exportButtonRef = reactExports.useRef(null);
  const moreButtonRef = reactExports.useRef(null);
  const chartItemRefs = reactExports.useRef([]);
  const exportItemRefs = reactExports.useRef([]);
  const moreItemRefs = reactExports.useRef([]);
  const focusTrigger = reactExports.useCallback((menu) => {
    const triggerMap = {
      chart: chartButtonRef,
      export: exportButtonRef,
      more: moreButtonRef
    };
    requestAnimationFrame(() => {
      var _a;
      return (_a = triggerMap[menu].current) == null ? void 0 : _a.focus();
    });
  }, []);
  const closeMenus = reactExports.useCallback((returnFocusTo) => {
    setOpenMenu(null);
    if (returnFocusTo) {
      focusTrigger(returnFocusTo);
    }
  }, [focusTrigger]);
  const getItemRefs = reactExports.useCallback((menu) => {
    if (menu === "chart") return chartItemRefs;
    if (menu === "export") return exportItemRefs;
    return moreItemRefs;
  }, []);
  const openMenuAndFocus = reactExports.useCallback((menu, focusIndex = 0) => {
    setOpenMenu(menu);
    requestAnimationFrame(() => {
      var _a;
      const items = getItemRefs(menu).current.filter(Boolean);
      (_a = items[focusIndex]) == null ? void 0 : _a.focus();
    });
  }, [getItemRefs]);
  reactExports.useEffect(() => {
    if (!openMenu) return;
    const handleClickOutside = (event) => {
      var _a, _b, _c;
      const target = event.target;
      if (((_a = chartMenuRef.current) == null ? void 0 : _a.contains(target)) || ((_b = exportMenuRef.current) == null ? void 0 : _b.contains(target)) || ((_c = moreMenuRef.current) == null ? void 0 : _c.contains(target))) {
        return;
      }
      closeMenus();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenu, closeMenus]);
  reactExports.useEffect(() => {
    if (!openMenu) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeMenus(openMenu);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openMenu, closeMenus]);
  reactExports.useEffect(() => {
    if (isExporting) {
      closeMenus();
    }
  }, [isExporting, closeMenus]);
  reactExports.useEffect(() => {
    if (!openMenu) return;
    requestAnimationFrame(() => {
      var _a;
      const items = getItemRefs(openMenu).current.filter(Boolean);
      (_a = items[0]) == null ? void 0 : _a.focus();
    });
  }, [openMenu, getItemRefs]);
  const toggleMenu = (menu) => {
    setOpenMenu((previous) => previous === menu ? null : menu);
  };
  const moveFocusInMenu = (menu, direction) => {
    var _a;
    const items = getItemRefs(menu).current.filter(Boolean);
    if (items.length === 0) return;
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    const nextIndex = currentIndex === -1 ? direction === 1 ? 0 : items.length - 1 : (currentIndex + direction + items.length) % items.length;
    (_a = items[nextIndex]) == null ? void 0 : _a.focus();
  };
  const handleExport = (format) => {
    closeMenus();
    onExport(format);
  };
  const handleChartTypeSelect = (type) => {
    closeMenus();
    onChartTypeChange(type);
  };
  const handleDelete = () => {
    closeMenus();
    onDelete();
  };
  const handleTriggerKeyDown = (menu) => (event) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenuAndFocus(menu, 0);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const items = getItemRefs(menu).current.filter(Boolean);
      openMenuAndFocus(menu, Math.max(items.length - 1, 0));
    }
  };
  const handleMenuKeyDown = (menu) => (event) => {
    var _a, _b;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocusInMenu(menu, 1);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocusInMenu(menu, -1);
    }
    if (event.key === "Home") {
      event.preventDefault();
      (_a = getItemRefs(menu).current.filter(Boolean)[0]) == null ? void 0 : _a.focus();
    }
    if (event.key === "End") {
      event.preventDefault();
      const items = getItemRefs(menu).current.filter(Boolean);
      (_b = items[items.length - 1]) == null ? void 0 : _b.focus();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenus(menu);
    }
    if (event.key === "Tab") {
      closeMenus();
    }
  };
  const displayTitle = resolveDisplayPlanTitle(plan);
  const displayDescription = resolveDisplayPlanDescription(plan);
  const chartTypeLabel = (type) => getTranslation(`chart_type_${type}`, language);
  const groupLabel = resolvePlanGroupLabel(plan);
  const metricLabel = resolvePlanMetricLabel(plan);
  const grainSubtitle = [
    plan.groupByColumn && `by ${groupLabel}`,
    plan.valueColumn && `→ ${metricLabel ?? plan.valueColumn}`
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    plan.isFallback && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-r-lg border-l-4 border-yellow-400 bg-yellow-50 p-3 text-xs text-yellow-800", role: "alert", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-bold", children: getTranslation("card_fallback_view", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1", children: getTranslation("card_fallback_view_hint", language) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex-1 min-w-0 border-l-4 pl-3 ${trustBorderClass(trustStatus)}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `shrink-0 rounded-md p-1 ${trustIconClass(trustStatus)}`, "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChartTypeIcon, { type: displayChartType, className: "h-3.5 w-3.5" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold leading-snug text-slate-800", children: displayTitle }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: onVerdictClick,
              className: `inline-flex min-h-[44px] items-center rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer md:min-h-0 ${trustStatus === "verified" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : trustStatus === "caveated" ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : trustStatus === "unverified" ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-red-100 text-red-700 hover:bg-red-200"}`,
              title: getTranslation("verdict_explainer_click_hint", language),
              children: getTranslation(`card_trust_${trustStatus}`, language)
            }
          )
        ] }),
        grainSubtitle && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 pl-7 text-xs text-slate-400", children: grainSubtitle })
      ] }),
      showActions && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2 lg:flex-shrink-0", "data-export-exclude": true, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onToggleExpand,
            "aria-label": isCardExpanded ? getTranslation("analysis_card_collapse", language) : getTranslation("analysis_card_expand", language),
            title: isCardExpanded ? getTranslation("analysis_card_collapse", language) : getTranslation("analysis_card_expand", language),
            className: "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-card border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 md:h-8 md:min-h-0 md:min-w-0 md:w-8",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "svg",
              {
                xmlns: "http://www.w3.org/2000/svg",
                viewBox: "0 0 20 20",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "1.75",
                className: `h-4 w-4 transition-transform duration-200 ${isCardExpanded ? "" : "-rotate-90"}`,
                "aria-hidden": "true",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 8l4 4 4-4" })
              }
            )
          }
        ),
        plan.artifactType !== "pivot_matrix" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", ref: chartMenuRef, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              ref: chartButtonRef,
              type: "button",
              className: "inline-flex min-h-[44px] items-center gap-1.5 rounded-card border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow md:h-8 md:min-h-0",
              "aria-haspopup": "menu",
              "aria-expanded": openMenu === "chart",
              "aria-label": `${getTranslation("card_controls_chart_type", language)}: ${chartTypeLabel(displayChartType)}`,
              onClick: () => toggleMenu("chart"),
              onKeyDown: handleTriggerKeyDown("chart"),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex h-5 w-5 items-center justify-center rounded text-slate-600", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChartTypeIcon, { type: displayChartType, className: "h-4 w-4" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: chartTypeLabel(displayChartType) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "svg",
                  {
                    xmlns: "http://www.w3.org/2000/svg",
                    viewBox: "0 0 20 20",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: "1.75",
                    className: `h-4 w-4 text-slate-400 transition-transform ${openMenu === "chart" ? "rotate-180" : ""}`,
                    "aria-hidden": "true",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 8l4 4 4-4" })
                  }
                )
              ]
            }
          ),
          openMenu === "chart" && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              role: "menu",
              "aria-orientation": "vertical",
              onKeyDown: handleMenuKeyDown("chart"),
              className: "absolute right-0 z-10 mt-2 w-44 rounded-card border border-slate-200 bg-white p-1.5 shadow-lg",
              children: availableChartTypes.map((type) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  ref: (element) => {
                    chartItemRefs.current[availableChartTypes.indexOf(type)] = element;
                  },
                  type: "button",
                  role: "menuitemradio",
                  "aria-checked": displayChartType === type,
                  onClick: () => handleChartTypeSelect(type),
                  tabIndex: 0,
                  className: `flex min-h-[44px] w-full items-center justify-between rounded-card px-3 py-2 text-sm transition-colors ${displayChartType === type ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-700 hover:bg-slate-50"}`,
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChartTypeIcon, { type, className: "h-3.5 w-3.5" }) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: chartTypeLabel(type) })
                    ] }),
                    displayChartType === type && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-slate-500", children: getTranslation("card_current", language) })
                  ]
                },
                type
              ))
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", ref: exportMenuRef, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              ref: exportButtonRef,
              type: "button",
              disabled: isExporting,
              className: "inline-flex min-h-[44px] items-center gap-1.5 rounded-card border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 md:h-8 md:min-h-0",
              title: getTranslation("card_export_title", language),
              "aria-label": getTranslation("card_export_title", language),
              "aria-haspopup": "menu",
              "aria-expanded": openMenu === "export",
              onClick: () => toggleMenu("export"),
              onKeyDown: handleTriggerKeyDown("export"),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(IconExport, {}),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation("card_export", language) })
              ]
            }
          ),
          openMenu === "export" && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              role: "menu",
              "aria-orientation": "vertical",
              onKeyDown: handleMenuKeyDown("export"),
              className: "absolute right-0 z-10 mt-2 w-52 max-w-[calc(100vw-2rem)] rounded-card border border-slate-200 bg-white p-1 shadow-lg",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    ref: (element) => {
                      exportItemRefs.current[0] = element;
                    },
                    type: "button",
                    onClick: () => handleExport("png"),
                    role: "menuitem",
                    tabIndex: 0,
                    className: "block min-h-[44px] w-full rounded-card px-3 py-2 text-left hover:bg-slate-50",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-sm font-medium text-slate-700", children: getTranslation("export_png_chart", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-xs text-slate-500", children: getTranslation("export_png_chart_desc", language) })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    ref: (element) => {
                      exportItemRefs.current[1] = element;
                    },
                    type: "button",
                    onClick: () => handleExport("png_full"),
                    role: "menuitem",
                    tabIndex: 0,
                    className: "block min-h-[44px] w-full rounded-card px-3 py-2 text-left hover:bg-slate-50",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-sm font-medium text-slate-700", children: getTranslation("export_png_full", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-xs text-slate-500", children: getTranslation("export_png_full_desc", language) })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    ref: (element) => {
                      exportItemRefs.current[2] = element;
                    },
                    type: "button",
                    onClick: () => handleExport("csv"),
                    role: "menuitem",
                    tabIndex: 0,
                    className: "block min-h-[44px] w-full rounded-card px-3 py-2 text-left hover:bg-slate-50",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-sm font-medium text-slate-700", children: getTranslation("export_csv", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-xs text-slate-500", children: getTranslation("export_csv_desc", language) })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    ref: (element) => {
                      exportItemRefs.current[3] = element;
                    },
                    type: "button",
                    onClick: () => handleExport("html"),
                    role: "menuitem",
                    tabIndex: 0,
                    className: "block min-h-[44px] w-full rounded-card px-3 py-2 text-left hover:bg-slate-50",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-sm font-medium text-slate-700", children: getTranslation("export_html", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-xs text-slate-500", children: getTranslation("export_html_desc", language) })
                    ]
                  }
                )
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", ref: moreMenuRef, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              ref: moreButtonRef,
              "data-card-more-trigger": cardId,
              type: "button",
              className: "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-card border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 md:h-8 md:min-h-0 md:min-w-0 md:w-8",
              title: getTranslation("card_more_actions", language),
              "aria-label": getTranslation("card_more_actions", language),
              "aria-haspopup": "menu",
              "aria-expanded": openMenu === "more",
              onClick: () => toggleMenu("more"),
              onKeyDown: handleTriggerKeyDown("more"),
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconMoreHorizontal, {})
            }
          ),
          openMenu === "more" && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              role: "menu",
              "aria-orientation": "vertical",
              onKeyDown: handleMenuKeyDown("more"),
              className: "absolute right-0 z-10 mt-2 w-44 max-w-[calc(100vw-2rem)] rounded-card border border-slate-200 bg-white p-1 shadow-lg",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    ref: (element) => {
                      moreItemRefs.current[0] = element;
                    },
                    type: "button",
                    role: "menuitem",
                    onClick: () => {
                      closeMenus();
                      onToggleProvenance();
                    },
                    tabIndex: 0,
                    className: "block min-h-[44px] w-full rounded-card px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50",
                    children: getTranslation("provenance_title", language)
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    ref: (element) => {
                      moreItemRefs.current[1] = element;
                    },
                    type: "button",
                    role: "menuitem",
                    onClick: handleDelete,
                    tabIndex: 0,
                    className: "block min-h-[44px] w-full rounded-card px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50",
                    children: getTranslation("card_delete", language)
                  }
                )
              ]
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-3 text-xs text-slate-500", children: displayDescription })
  ] });
};
const AnalysisCardHeader = We.memo(AnalysisCardHeaderComponent);
let pluginsRegistered = false;
const useChartJs = () => {
  reactExports.useEffect(() => {
    if (!pluginsRegistered) {
      try {
        Chart.register(plugin, plugin$1);
        Chart.defaults.plugins.datalabels = { display: false };
        pluginsRegistered = true;
      } catch (error) {
        console.error("Failed to register chart plugins:", error);
      }
    }
  }, []);
};
const humanizeColumnName = (name) => name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
const COLORS = ["#4e79a7", "#f28e2c", "#e15759", "#76b7b2", "#59a14f", "#edc949", "#af7aa1", "#ff9da7", "#9c755f", "#bab0ab"];
const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};
const BORDER_COLORS = COLORS.map((c) => hexToRgba(c, 0.7));
const BG_COLORS = COLORS.map((c) => hexToRgba(c, 0.5));
const HIGHLIGHT_COLOR = "#3b82f6";
const HIGHLIGHT_BORDER_COLOR = "#2563eb";
const DESELECTED_COLOR = "rgba(107, 114, 128, 0.2)";
const DESELECTED_BORDER_COLOR = "rgba(107, 114, 128, 0.5)";
const getColors = (baseColors, dataLength, selectedIndices) => {
  const hasSelection = selectedIndices.length > 0;
  return hasSelection ? Array.from({ length: dataLength }, (_, i) => selectedIndices.includes(i) ? HIGHLIGHT_COLOR : DESELECTED_COLOR) : baseColors;
};
const getBorderColors = (baseColors, dataLength, selectedIndices) => {
  const hasSelection = selectedIndices.length > 0;
  return hasSelection ? Array.from({ length: dataLength }, (_, i) => selectedIndices.includes(i) ? HIGHLIGHT_BORDER_COLOR : DESELECTED_BORDER_COLOR) : baseColors;
};
const isChartZoomedOrPanned = (chart) => {
  if (!chart || !chart.scales || !chart.scales.x) return false;
  const initialXScale = chart.getInitialScaleBounds().x;
  const currentXScale = { min: chart.scales.x.min, max: chart.scales.x.max };
  return initialXScale.min !== currentXScale.min || initialXScale.max !== currentXScale.max;
};
const humanizePivotField = (field) => {
  if (field === "__pivot_folded_others__") {
    return "Others";
  }
  const normalized = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();
  if (!normalized) return field;
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
};
const getPivotTooltipCallbacks = (plan, data) => {
  var _a, _b, _c, _d, _e, _f;
  if (plan.artifactType !== "pivot_matrix" || data.length === 0) {
    return null;
  }
  const groupKey = plan.groupByColumn || "row_label";
  const visibleColumns = ((_b = (_a = plan.artifactMetadata) == null ? void 0 : _a.visibleMatrixValueColumns) == null ? void 0 : _b.length) ? plan.artifactMetadata.visibleMatrixValueColumns : null;
  const foldedColumns = ((_c = plan.artifactMetadata) == null ? void 0 : _c.foldedMatrixValueColumns) ?? [];
  const hiddenColumns = ((_d = plan.artifactMetadata) == null ? void 0 : _d.hiddenMatrixValueColumns) ?? [];
  const preferredColumns = ((_f = (_e = plan.artifactMetadata) == null ? void 0 : _e.matrixColumns) == null ? void 0 : _f.length) ? plan.artifactMetadata.matrixColumns : [];
  const discoveredColumns = Object.keys(data[0] ?? {});
  const detailColumns = (visibleColumns ? [...visibleColumns, plan.valueColumn || "row_total"] : [.../* @__PURE__ */ new Set([...preferredColumns, ...discoveredColumns])]).filter((column) => column !== groupKey);
  return {
    title: (items) => {
      var _a2, _b2;
      const row = data[((_a2 = items[0]) == null ? void 0 : _a2.dataIndex) ?? -1];
      return String((row == null ? void 0 : row[groupKey]) ?? ((_b2 = items[0]) == null ? void 0 : _b2.label) ?? "");
    },
    label: (context) => {
      var _a2, _b2, _c2;
      const datasetLabel = ((_a2 = context.dataset) == null ? void 0 : _a2.label) ? `${humanizePivotField(String(context.dataset.label))}: ` : "";
      return `${datasetLabel}${formatAnalysisValue(context.raw ?? ((_b2 = context.parsed) == null ? void 0 : _b2.y) ?? ((_c2 = context.parsed) == null ? void 0 : _c2.x) ?? context.parsed)}`;
    },
    afterBody: (items) => {
      var _a2;
      const row = data[((_a2 = items[0]) == null ? void 0 : _a2.dataIndex) ?? -1];
      if (!row) {
        return [];
      }
      const details = detailColumns.map((column) => `${humanizePivotField(column)}: ${formatAnalysisValue(row[column])}`);
      if (foldedColumns.length > 0) {
        details.push(`${foldedColumns.length} more columns folded into Others`);
      }
      if (hiddenColumns.length > 0) {
        details.push(`Hidden series: ${hiddenColumns.map(humanizePivotField).join(", ")}`);
      }
      return details;
    }
  };
};
const formatChartDataLabel = (value, chartWidth = Number.POSITIVE_INFINITY) => {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return formatAnalysisMeasureValue(value);
  }
  if (chartWidth >= 520) {
    return formatAnalysisMeasureValue(numericValue);
  }
  const absoluteValue = Math.abs(numericValue);
  const compactUnit = absoluteValue >= 1e9 ? { divisor: 1e9, suffix: "B" } : absoluteValue >= 1e6 ? { divisor: 1e6, suffix: "M" } : absoluteValue >= 1e3 ? { divisor: 1e3, suffix: "K" } : null;
  return compactUnit ? `${(numericValue / compactUnit.divisor).toFixed(2)}${compactUnit.suffix}` : formatAnalysisMeasureValue(numericValue);
};
const getDataLabelsConfig = (showDataLabels) => ({
  display: Boolean(showDataLabels),
  color: "#374151",
  font: { size: 11, weight: "bold" },
  anchor: "end",
  align: "end",
  clamp: true,
  clip: false,
  formatter: (value, context) => {
    var _a;
    return formatChartDataLabel(
      value,
      (_a = context.chart) == null ? void 0 : _a.width
    );
  }
});
const getCommonOptions = (onElementClick, disableAnimation, showDataLabels) => ({
  maintainAspectRatio: false,
  responsive: true,
  animation: disableAnimation ? { duration: 0 } : void 0,
  layout: {
    padding: showDataLabels ? { top: 28, right: 40, bottom: 18, left: 40 } : 0
  },
  onClick: (event, elements) => {
    if (elements.length > 0) {
      onElementClick(elements[0].index, event);
    }
  },
  plugins: {
    legend: { display: false },
    datalabels: getDataLabelsConfig(showDataLabels),
    tooltip: {
      backgroundColor: "#ffffff",
      titleColor: "#1e293b",
      bodyColor: "#475569",
      borderColor: "#e2e8f0",
      borderWidth: 1,
      titleFont: { weight: "bold" },
      bodyFont: { size: 13 },
      padding: 10,
      callbacks: {
        label: (context) => {
          var _a, _b, _c;
          const rawLabel = ((_a = context.dataset) == null ? void 0 : _a.label) ?? "";
          const datasetLabel = rawLabel ? `${humanizeColumnName(rawLabel)}: ` : "";
          const value = context.raw ?? ((_b = context.parsed) == null ? void 0 : _b.y) ?? ((_c = context.parsed) == null ? void 0 : _c.x) ?? context.parsed;
          return `${datasetLabel}${formatAnalysisValue(value)}`;
        }
      }
    }
  },
  scales: {
    x: {
      ticks: {
        color: "#64748b",
        callback: function(value) {
          const label = this.getLabelForValue(Number(value));
          if (typeof label === "string" && label.length > 30) {
            return label.substring(0, 27) + "...";
          }
          return label;
        }
      },
      grid: { color: "#e2e8f0" }
    },
    y: {
      ticks: {
        color: "#64748b",
        callback: (value) => formatAnalysisValue(Number(value))
      },
      grid: { color: "#e2e8f0" }
    }
  }
});
const getZoomOptions = (onZoomChange) => ({
  pan: {
    enabled: true,
    mode: "xy",
    onPanComplete: ({ chart }) => onZoomChange(isChartZoomedOrPanned(chart))
  },
  zoom: {
    wheel: { enabled: false },
    pinch: { enabled: true },
    mode: "xy",
    onZoomComplete: ({ chart }) => onZoomChange(isChartZoomedOrPanned(chart))
  }
});
const createBarChartConfig = ({ data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels }) => {
  var _a, _b, _c, _d;
  const { groupByColumn, valueColumn } = plan;
  const valueKey = valueColumn || "count";
  const labels = groupByColumn ? data.map((d) => normalizeCategoryLabel(d[groupByColumn])) : [];
  const values = valueKey ? data.map((d) => parseNumericValue(d[valueKey])) : [];
  const readabilityHints = getBarChartReadabilityHints(data, groupByColumn);
  const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
  const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);
  const categoryTickCallback = function(value) {
    const label = this.getLabelForValue(Number(value));
    if (typeof label === "string" && label.length > readabilityHints.categoryTickLimit) {
      return `${label.substring(0, readabilityHints.categoryTickLimit - 1)}…`;
    }
    return label;
  };
  const shouldDisplayDataLabel = (context) => {
    var _a2;
    if (!showDataLabels) return false;
    const chartWidth = ((_a2 = context.chart) == null ? void 0 : _a2.width) ?? Number.POSITIVE_INFINITY;
    if (readabilityHints.useHorizontalLayout || chartWidth >= 520 || values.length <= 4) {
      return true;
    }
    const visibleLabelLimit = chartWidth < 400 ? 2 : 3;
    const rankedIndices = values.map((value, index) => ({ index, magnitude: Math.abs(value) })).sort((left, right) => right.magnitude - left.magnitude || left.index - right.index).slice(0, visibleLabelLimit).map((entry) => entry.index);
    return rankedIndices.includes(context.dataIndex ?? -1);
  };
  return {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: valueKey,
        data: values,
        backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
        borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
        borderWidth: 1
      }]
    },
    options: {
      ...commonOptions,
      layout: {
        padding: showDataLabels ? readabilityHints.useHorizontalLayout ? { top: 18, right: 96, bottom: 18, left: 12 } : { top: 28, right: 44, bottom: 18, left: 44 } : 0
      },
      plugins: {
        ...commonOptions.plugins,
        datalabels: {
          ...(_a = commonOptions.plugins) == null ? void 0 : _a.datalabels,
          display: shouldDisplayDataLabel
        },
        ...pivotTooltipCallbacks ? {
          tooltip: {
            ...(_b = commonOptions.plugins) == null ? void 0 : _b.tooltip,
            callbacks: pivotTooltipCallbacks
          }
        } : {}
      },
      indexAxis: readabilityHints.useHorizontalLayout ? "y" : "x",
      scales: readabilityHints.useHorizontalLayout ? {
        x: {
          ticks: {
            color: "#64748b",
            callback: (value) => formatAnalysisValue(Number(value))
          },
          grid: { color: "#e2e8f0" }
        },
        y: {
          ticks: {
            color: "#64748b",
            callback: categoryTickCallback
          },
          grid: { display: false }
        }
      } : {
        x: {
          ...(_c = commonOptions.scales) == null ? void 0 : _c.x,
          ticks: {
            color: "#64748b",
            callback: categoryTickCallback
          },
          grid: { display: false }
        },
        y: {
          ...(_d = commonOptions.scales) == null ? void 0 : _d.y,
          ticks: {
            color: "#64748b",
            callback: (value) => formatAnalysisValue(Number(value))
          },
          grid: { color: "#e2e8f0" }
        }
      }
    }
  };
};
const createHorizontalBarChartConfig = ({ data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels }) => {
  var _a;
  const { groupByColumn, valueColumn } = plan;
  const valueKey = valueColumn || "count";
  const labels = groupByColumn ? data.map((d) => normalizeCategoryLabel(d[groupByColumn])) : [];
  const values = data.map((d) => parseNumericValue(d[valueKey]));
  const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
  const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);
  return {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: valueKey,
        data: values,
        backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
        borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
        borderWidth: 1
      }]
    },
    options: {
      ...commonOptions,
      indexAxis: "y",
      layout: {
        padding: showDataLabels ? { top: 18, right: 96, bottom: 18, left: 12 } : 0
      },
      plugins: pivotTooltipCallbacks ? {
        ...commonOptions.plugins,
        tooltip: {
          ...(_a = commonOptions.plugins) == null ? void 0 : _a.tooltip,
          callbacks: pivotTooltipCallbacks
        }
      } : commonOptions.plugins,
      scales: {
        x: {
          ticks: {
            color: "#64748b",
            callback: (value) => formatAnalysisValue(Number(value))
          },
          grid: { color: "#e2e8f0" }
        },
        y: {
          ticks: {
            color: "#64748b",
            callback: function(value) {
              const label = this.getLabelForValue(Number(value));
              if (typeof label === "string" && label.length > 20) {
                return `${label.substring(0, 19)}…`;
              }
              return label;
            }
          },
          grid: { display: false }
        }
      }
    }
  };
};
const createLineChartConfig = (props) => {
  var _a;
  const { data, plan, selectedIndices, onElementClick, onZoomChange, disableAnimation, showDataLabels } = props;
  const { groupByColumn, valueColumn } = plan;
  const valueKey = valueColumn || "count";
  const hasSelection = selectedIndices.length > 0;
  const labels = groupByColumn ? data.map((d) => d[groupByColumn]) : [];
  const values = data.map((d) => parseNumericValue(d[valueKey]));
  const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
  const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);
  return {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: valueKey,
        data: values,
        fill: false,
        borderColor: hasSelection ? DESELECTED_BORDER_COLOR : COLORS[0],
        pointBackgroundColor: getColors([COLORS[0]], data.length, selectedIndices),
        pointBorderColor: getBorderColors([BORDER_COLORS[0]], data.length, selectedIndices),
        pointRadius: hasSelection ? 5 : 3,
        pointHoverRadius: 7,
        tension: 0.1
      }]
    },
    options: {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        ...pivotTooltipCallbacks ? {
          tooltip: {
            ...(_a = commonOptions.plugins) == null ? void 0 : _a.tooltip,
            callbacks: pivotTooltipCallbacks
          }
        } : {},
        zoom: getZoomOptions(onZoomChange)
      }
    }
  };
};
const createAreaChartConfig = (props) => {
  var _a;
  const { data, plan, selectedIndices, onElementClick, onZoomChange, disableAnimation, showDataLabels } = props;
  const { groupByColumn, valueColumn } = plan;
  const valueKey = valueColumn || "count";
  const hasSelection = selectedIndices.length > 0;
  const labels = groupByColumn ? data.map((d) => d[groupByColumn]) : [];
  const values = data.map((d) => parseNumericValue(d[valueKey]));
  const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
  const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);
  return {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: valueKey,
        data: values,
        fill: true,
        backgroundColor: `${COLORS[0]}33`,
        borderColor: hasSelection ? DESELECTED_BORDER_COLOR : COLORS[0],
        pointBackgroundColor: getColors([COLORS[0]], data.length, selectedIndices),
        pointBorderColor: getBorderColors([BORDER_COLORS[0]], data.length, selectedIndices),
        pointRadius: hasSelection ? 5 : 3,
        pointHoverRadius: 7,
        tension: 0.3
      }]
    },
    options: {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        ...pivotTooltipCallbacks ? {
          tooltip: {
            ...(_a = commonOptions.plugins) == null ? void 0 : _a.tooltip,
            callbacks: pivotTooltipCallbacks
          }
        } : {},
        zoom: getZoomOptions(onZoomChange)
      }
    }
  };
};
const createPieChartConfig = ({ chartType, data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels }) => {
  var _a, _b;
  const { groupByColumn, valueColumn } = plan;
  const valueKey = valueColumn || "count";
  const hasSelection = selectedIndices.length > 0;
  const labels = groupByColumn ? data.map((d) => d[groupByColumn]) : [];
  const values = data.map((d) => parseNumericValue(d[valueKey]));
  const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
  const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);
  const pieDataLabelDisplay = (context) => {
    var _a2, _b2;
    if (!showDataLabels) return false;
    const datasetValues = (((_a2 = context.dataset) == null ? void 0 : _a2.data) ?? []).map((value) => Math.abs(Number(value) || 0));
    const total = datasetValues.reduce((sum, value) => sum + value, 0);
    const currentValue = datasetValues[context.dataIndex] ?? 0;
    const minimumShare = (((_b2 = context.chart) == null ? void 0 : _b2.width) ?? Number.POSITIVE_INFINITY) < 520 ? 0.08 : 0.03;
    return total > 0 && currentValue / total >= minimumShare;
  };
  return {
    type: chartType,
    // 'pie' or 'doughnut'
    data: {
      labels,
      datasets: [{
        label: valueKey,
        data: values,
        backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
        borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
        borderWidth: 1,
        offset: hasSelection ? data.map((_, i) => selectedIndices.includes(i) ? 20 : 0) : 0
      }]
    },
    options: {
      ...commonOptions,
      layout: {
        padding: showDataLabels ? { top: 36, right: 84, bottom: 36, left: 84 } : 0
      },
      plugins: {
        ...commonOptions.plugins,
        datalabels: {
          ...(_a = commonOptions.plugins) == null ? void 0 : _a.datalabels,
          display: pieDataLabelDisplay
        },
        ...pivotTooltipCallbacks ? {
          tooltip: {
            ...(_b = commonOptions.plugins) == null ? void 0 : _b.tooltip,
            callbacks: pivotTooltipCallbacks
          }
        } : {}
      },
      scales: { x: { display: false }, y: { display: false } }
    }
  };
};
const createPolarAreaChartConfig = ({ data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels }) => {
  var _a;
  const { groupByColumn, valueColumn } = plan;
  const valueKey = valueColumn || "count";
  const labels = groupByColumn ? data.map((d) => d[groupByColumn]) : [];
  const values = data.map((d) => parseNumericValue(d[valueKey]));
  const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
  const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);
  return {
    type: "polarArea",
    data: {
      labels,
      datasets: [{
        label: valueKey,
        data: values,
        backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
        borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
        borderWidth: 1
      }]
    },
    options: {
      ...commonOptions,
      plugins: pivotTooltipCallbacks ? {
        ...commonOptions.plugins,
        tooltip: {
          ...(_a = commonOptions.plugins) == null ? void 0 : _a.tooltip,
          callbacks: pivotTooltipCallbacks
        }
      } : commonOptions.plugins,
      scales: {
        r: {
          ticks: { display: false },
          grid: { color: "#e2e8f0" }
        }
      }
    }
  };
};
const createScatterChartConfig = (props) => {
  const { data, plan, selectedIndices, onElementClick, onZoomChange, disableAnimation, showDataLabels } = props;
  const { xValueColumn, yValueColumn } = plan;
  const hasSelection = selectedIndices.length > 0;
  if (!xValueColumn || !yValueColumn) return {};
  const scatterData = data.map((d) => ({ x: d[xValueColumn], y: d[yValueColumn] }));
  const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
  return {
    type: "scatter",
    data: {
      datasets: [{
        label: `${yValueColumn} vs ${xValueColumn}`,
        data: scatterData,
        backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
        borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
        borderWidth: 1.5,
        pointRadius: hasSelection ? data.map((_, i) => selectedIndices.includes(i) ? 7 : 4) : 5,
        pointHoverRadius: hasSelection ? data.map((_, i) => selectedIndices.includes(i) ? 9 : 6) : 7
      }]
    },
    options: {
      ...commonOptions,
      scales: {
        x: { ...commonOptions.scales.x, title: { display: true, text: xValueColumn, color: "#64748b" } },
        y: { ...commonOptions.scales.y, title: { display: true, text: yValueColumn, color: "#64748b" } }
      },
      plugins: { ...commonOptions.plugins, zoom: getZoomOptions(onZoomChange) }
    }
  };
};
const createComboChartConfig = (props) => {
  const { data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels } = props;
  const { groupByColumn, valueColumn, secondaryValueColumn } = plan;
  const hasSelection = selectedIndices.length > 0;
  const valueKey = valueColumn || "count";
  if (!groupByColumn || !valueKey || !secondaryValueColumn) return {};
  const labels = data.map((d) => d[groupByColumn]);
  const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: valueKey,
          data: data.map((d) => parseNumericValue(d[valueKey])),
          backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
          borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
          borderWidth: 1,
          yAxisID: "y"
        },
        {
          type: "line",
          label: secondaryValueColumn,
          data: data.map((d) => parseNumericValue(d[secondaryValueColumn])),
          fill: false,
          borderColor: hasSelection ? DESELECTED_BORDER_COLOR : COLORS[1],
          pointBackgroundColor: hasSelection ? DESELECTED_COLOR : COLORS[1],
          pointBorderColor: hasSelection ? DESELECTED_BORDER_COLOR : BORDER_COLORS[1],
          pointRadius: hasSelection ? 5 : 3,
          pointHoverRadius: 7,
          tension: 0.1,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: { type: "linear", display: true, position: "left", ticks: { color: "#64748b" }, grid: { color: "#e2e8f0" }, title: { display: true, text: valueKey, color: "#64748b" } },
        y1: { type: "linear", display: true, position: "right", ticks: { color: "#64748b" }, grid: { drawOnChartArea: false }, title: { display: true, text: secondaryValueColumn, color: "#64748b" } }
      }
    }
  };
};
const createRadarChartConfig = ({ data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels }) => {
  var _a;
  const { groupByColumn, valueColumn } = plan;
  const valueKey = valueColumn || "count";
  const labels = groupByColumn ? data.map((d) => d[groupByColumn]) : [];
  const values = data.map((d) => parseNumericValue(d[valueKey]));
  const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
  const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);
  return {
    type: "radar",
    data: {
      labels,
      datasets: [{
        label: valueKey,
        data: values,
        backgroundColor: BG_COLORS[0],
        borderColor: BORDER_COLORS[0],
        pointBackgroundColor: COLORS[0],
        pointBorderColor: "#fff",
        pointHoverBackgroundColor: "#fff",
        pointHoverBorderColor: COLORS[0],
        borderWidth: 2
      }]
    },
    options: {
      ...commonOptions,
      plugins: pivotTooltipCallbacks ? {
        ...commonOptions.plugins,
        tooltip: {
          ...(_a = commonOptions.plugins) == null ? void 0 : _a.tooltip,
          callbacks: pivotTooltipCallbacks
        }
      } : commonOptions.plugins,
      scales: {
        r: {
          angleLines: {
            display: false
          },
          suggestedMin: 0,
          ticks: {
            backdropColor: "transparent",
            color: "#64748b"
          },
          grid: {
            color: "#e2e8f0"
          },
          pointLabels: {
            color: "#334155",
            font: {
              size: 12
            }
          }
        }
      },
      elements: {
        line: {
          tension: 0,
          borderWidth: 2
        }
      }
    }
  };
};
const createBubbleChartConfig = (props) => {
  const { data, plan, selectedIndices, onElementClick, onZoomChange, disableAnimation, showDataLabels } = props;
  const { xValueColumn, yValueColumn, valueColumn } = plan;
  if (!xValueColumn || !yValueColumn || !valueColumn) return {};
  const bubbleData = data;
  const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
  return {
    type: "bubble",
    data: {
      datasets: [{
        label: `${yValueColumn} vs ${xValueColumn} (Size: ${valueColumn})`,
        data: bubbleData,
        backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
        borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
        borderWidth: 1.5
      }]
    },
    options: {
      ...commonOptions,
      scales: {
        x: { ...commonOptions.scales.x, title: { display: true, text: xValueColumn, color: "#64748b" } },
        y: { ...commonOptions.scales.y, title: { display: true, text: yValueColumn, color: "#64748b" } }
      },
      plugins: { ...commonOptions.plugins, zoom: getZoomOptions(onZoomChange) }
    }
  };
};
const DEFAULT_PIVOT_GROUP_KEY = "row_label";
const DEFAULT_PIVOT_TOTAL_KEY = "row_total";
const STACK_ID = "pivot-matrix-stack";
const getColorWithAlpha = (hexColor, alpha) => {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};
const createStackedChartConfig = ({ chartType, data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels }) => {
  var _a, _b;
  const groupKey = plan.groupByColumn || DEFAULT_PIVOT_GROUP_KEY;
  const totalKey = plan.valueColumn || DEFAULT_PIVOT_TOTAL_KEY;
  const labels = data.map((row) => normalizeCategoryLabel(row[groupKey]));
  const matrixValueColumns = ((_a = plan.artifactMetadata) == null ? void 0 : _a.matrixValueColumns) ?? [];
  const activeColumns = matrixValueColumns.filter((column) => data.some((row) => typeof row[column] === "number" || typeof row[column] === "string"));
  const readabilityHints = getBarChartReadabilityHints(data, groupKey);
  const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
  const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);
  const hasSelection = selectedIndices.length > 0;
  const isHorizontal = chartType === "stacked_bar";
  const categoryTickCallback = function(value) {
    const label = this.getLabelForValue(Number(value));
    if (typeof label === "string" && label.length > readabilityHints.categoryTickLimit) {
      return `${label.substring(0, readabilityHints.categoryTickLimit - 1)}…`;
    }
    return label;
  };
  return {
    type: "bar",
    data: {
      labels,
      datasets: activeColumns.map((column, datasetIndex) => {
        const baseColor = COLORS[datasetIndex % COLORS.length];
        const baseBorderColor = BORDER_COLORS[datasetIndex % BORDER_COLORS.length];
        return {
          label: column === PIVOT_FOLDED_OTHERS_KEY ? "Others" : column,
          data: data.map((row) => row[column]),
          stack: STACK_ID,
          backgroundColor: hasSelection ? data.map((_, rowIndex) => selectedIndices.includes(rowIndex) ? baseColor : getColorWithAlpha(baseColor, 0.15)) : baseColor,
          borderColor: hasSelection ? data.map((_, rowIndex) => selectedIndices.includes(rowIndex) ? baseBorderColor : getColorWithAlpha(baseColor, 0.4)) : baseBorderColor,
          borderWidth: 1
        };
      })
    },
    options: {
      ...commonOptions,
      indexAxis: isHorizontal ? "y" : "x",
      plugins: {
        ...commonOptions.plugins,
        legend: { display: false },
        tooltip: {
          ...(_b = commonOptions.plugins) == null ? void 0 : _b.tooltip,
          callbacks: pivotTooltipCallbacks ?? {
            title: (items) => {
              var _a2;
              return ((_a2 = items[0]) == null ? void 0 : _a2.label) ?? "";
            },
            label: (context) => {
              var _a2;
              return `${((_a2 = context.dataset) == null ? void 0 : _a2.label) ?? "Value"}: ${formatAnalysisValue(context.raw)}`;
            },
            afterLabel: (context) => {
              var _a2;
              return `Row total: ${formatAnalysisValue((_a2 = data[context.dataIndex]) == null ? void 0 : _a2[totalKey])}`;
            }
          }
        }
      },
      scales: isHorizontal ? {
        x: {
          stacked: true,
          ticks: {
            color: "#64748b",
            callback: (value) => formatAnalysisValue(Number(value))
          },
          grid: { color: "#e2e8f0" }
        },
        y: {
          stacked: true,
          ticks: {
            color: "#64748b",
            callback: categoryTickCallback
          },
          grid: { display: false }
        }
      } : {
        x: {
          stacked: true,
          ticks: {
            color: "#64748b",
            callback: categoryTickCallback
          },
          grid: { display: false }
        },
        y: {
          stacked: true,
          ticks: {
            color: "#64748b",
            callback: (value) => formatAnalysisValue(Number(value))
          },
          grid: { color: "#e2e8f0" }
        }
      }
    }
  };
};
const createMultiLineChartConfig = ({
  data,
  plan,
  selectedIndices,
  onElementClick,
  onZoomChange,
  disableAnimation,
  showDataLabels
}) => {
  var _a, _b;
  const groupKey = plan.groupByColumn || "row_label";
  const matrixValueColumns = ((_a = plan.artifactMetadata) == null ? void 0 : _a.matrixValueColumns) ?? [];
  const activeColumns = matrixValueColumns.filter(
    (col) => data.some((row) => typeof row[col] === "number" || typeof row[col] === "string" && parseNumericValue(row[col]) !== 0)
  );
  if (activeColumns.length === 0) {
    const valueKey = plan.valueColumn || "count";
    return {
      type: "line",
      data: {
        labels: data.map((row) => normalizeCategoryLabel(row[groupKey])),
        datasets: [{
          label: valueKey,
          data: data.map((row) => parseNumericValue(row[valueKey])),
          fill: false,
          borderColor: COLORS[0],
          pointBackgroundColor: COLORS[0],
          pointRadius: 3,
          tension: 0.1
        }]
      },
      options: getCommonOptions(onElementClick, disableAnimation, showDataLabels)
    };
  }
  const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
  const hasSelection = selectedIndices.length > 0;
  const distinctGroups = data.length;
  const shouldTranspose = distinctGroups > 0 && distinctGroups < activeColumns.length;
  const buildDatasets = () => {
    if (shouldTranspose) {
      return data.map((row, index) => {
        const seriesLabel = normalizeCategoryLabel(row[groupKey]);
        const color = COLORS[index % COLORS.length];
        const borderColor = BORDER_COLORS[index % BORDER_COLORS.length];
        return {
          label: seriesLabel,
          data: activeColumns.map((col) => {
            return parseNumericValue(row[col]);
          }),
          fill: false,
          borderColor: hasSelection ? `${color}33` : color,
          backgroundColor: color,
          pointBackgroundColor: color,
          pointBorderColor: borderColor,
          pointRadius: hasSelection ? 5 : 3,
          pointHoverRadius: 7,
          tension: 0.1,
          borderWidth: 2
        };
      });
    }
    return activeColumns.map((column, index) => {
      const color = COLORS[index % COLORS.length];
      const borderColor = BORDER_COLORS[index % BORDER_COLORS.length];
      return {
        label: column,
        data: data.map((row) => {
          return parseNumericValue(row[column]);
        }),
        fill: false,
        borderColor: hasSelection ? `${color}33` : color,
        backgroundColor: color,
        pointBackgroundColor: color,
        pointBorderColor: borderColor,
        pointRadius: hasSelection ? 5 : 3,
        pointHoverRadius: 7,
        tension: 0.1,
        borderWidth: 2
      };
    });
  };
  const labels = shouldTranspose ? activeColumns.map((col) => normalizeCategoryLabel(col)) : data.map((row) => normalizeCategoryLabel(row[groupKey]));
  return {
    type: "line",
    data: {
      labels,
      datasets: buildDatasets()
    },
    options: {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        legend: { display: true, position: "top" },
        tooltip: {
          ...(_b = commonOptions.plugins) == null ? void 0 : _b.tooltip,
          callbacks: {
            title: (items) => {
              var _a2;
              return ((_a2 = items[0]) == null ? void 0 : _a2.label) ?? "";
            },
            label: (context) => {
              var _a2;
              return `${((_a2 = context.dataset) == null ? void 0 : _a2.label) ?? "Value"}: ${formatAnalysisValue(context.raw)}`;
            }
          }
        },
        zoom: getZoomOptions(onZoomChange)
      },
      scales: {
        x: {
          ticks: { color: "#64748b" },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: "#64748b",
            callback: (value) => formatAnalysisValue(Number(value))
          },
          grid: { color: "#e2e8f0" }
        }
      }
    }
  };
};
const createChartConfig = (props) => {
  switch (props.chartType) {
    case "bar":
      return createBarChartConfig(props);
    case "horizontal_bar":
      return createHorizontalBarChartConfig(props);
    case "stacked_bar":
    case "stacked_column":
      return createStackedChartConfig(props);
    case "line":
      return createLineChartConfig(props);
    case "area":
      return createAreaChartConfig(props);
    case "pie":
    case "doughnut":
      return createPieChartConfig(props);
    case "polar_area":
      return createPolarAreaChartConfig(props);
    case "scatter":
      return createScatterChartConfig(props);
    case "combo":
      return createComboChartConfig(props);
    case "radar":
      return createRadarChartConfig(props);
    case "bubble":
      return createBubbleChartConfig(props);
    case "multi_line":
      return createMultiLineChartConfig(props);
    default:
      return createBarChartConfig(props);
  }
};
const ChartRenderer = reactExports.forwardRef((props, ref) => {
  useChartJs();
  const canvasRef = reactExports.useRef(null);
  const chartRef = reactExports.useRef(null);
  const activeChartTypeRef = reactExports.useRef(null);
  const callbackRef = reactExports.useRef({
    onElementClick: props.onElementClick,
    onZoomChange: props.onZoomChange
  });
  const {
    chartType,
    data,
    plan,
    selectedIndices,
    onElementClick,
    onZoomChange,
    disableAnimation,
    showDataLabels
  } = props;
  const currentSpecKeyRef = reactExports.useRef("");
  reactExports.useImperativeHandle(ref, () => ({
    resetZoom: () => {
      var _a;
      (_a = chartRef.current) == null ? void 0 : _a.resetZoom();
    },
    captureImage: () => {
      var _a;
      if (props.cardId) {
        const cached = getCachedChart(props.cardId);
        if (cached && cached.specKey === currentSpecKeyRef.current) {
          return cached.pngDataUrl;
        }
      }
      try {
        return ((_a = canvasRef.current) == null ? void 0 : _a.toDataURL("image/png")) ?? null;
      } catch {
        return null;
      }
    }
  }));
  reactExports.useEffect(() => {
    callbackRef.current = {
      onElementClick,
      onZoomChange
    };
  }, [onElementClick, onZoomChange]);
  reactExports.useEffect(() => {
    var _a;
    if (!canvasRef.current || !plan) return;
    if (chartRef.current && activeChartTypeRef.current === chartType) {
      return;
    }
    (_a = chartRef.current) == null ? void 0 : _a.destroy();
    chartRef.current = null;
    activeChartTypeRef.current = chartType;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    performance.mark("chart-create-start");
    const config = createChartConfig({
      chartType,
      data,
      plan,
      selectedIndices,
      disableAnimation,
      showDataLabels,
      onElementClick: (index, event) => {
        callbackRef.current.onElementClick(index, event);
      },
      onZoomChange: (isZoomed) => {
        callbackRef.current.onZoomChange(isZoomed);
      }
    });
    chartRef.current = new Chart(ctx, config);
    performance.mark("chart-create-end");
    performance.measure("chart-create", "chart-create-start", "chart-create-end");
  }, [chartType, data, plan, selectedIndices, disableAnimation, showDataLabels]);
  reactExports.useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !plan) {
      return;
    }
    const nextConfig = createChartConfig({
      chartType,
      data,
      plan,
      selectedIndices,
      disableAnimation,
      showDataLabels,
      onElementClick: (index, event) => {
        callbackRef.current.onElementClick(index, event);
      },
      onZoomChange: (isZoomed) => {
        callbackRef.current.onZoomChange(isZoomed);
      }
    });
    if (nextConfig.data) {
      chart.data.labels = nextConfig.data.labels ?? [];
      chart.data.datasets = nextConfig.data.datasets ?? [];
    }
    if (nextConfig.options) {
      chart.options.animation = nextConfig.options.animation;
      chart.options.onClick = nextConfig.options.onClick;
      chart.options.plugins = nextConfig.options.plugins;
      chart.options.scales = nextConfig.options.scales;
      chart.options.elements = nextConfig.options.elements;
      chart.options.layout = nextConfig.options.layout;
    }
    chart.update("none");
    if (props.cardId && canvasRef.current) {
      const specKey = computeChartCacheKey({
        chartType,
        dataRowCount: data.length,
        dataContentHash: computeDataContentHash(data),
        groupByColumn: plan.groupByColumn,
        valueColumn: plan.valueColumn,
        topN: plan.topN,
        hideOthers: plan.hideOthers,
        showDataLabels
      });
      currentSpecKeyRef.current = specKey;
      try {
        const pngDataUrl = canvasRef.current.toDataURL("image/png");
        setCachedChart(props.cardId, { pngDataUrl, specKey, capturedAt: Date.now() });
      } catch {
      }
    }
  }, [chartType, data, plan, selectedIndices, disableAnimation, showDataLabels, props.cardId]);
  reactExports.useEffect(() => () => {
    var _a;
    (_a = chartRef.current) == null ? void 0 : _a.destroy();
    chartRef.current = null;
    activeChartTypeRef.current = null;
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("canvas", { ref: canvasRef });
});
const IconClearSelection = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z", clipRule: "evenodd" }) });
const IconResetZoom = (props) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z", clipRule: "evenodd" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12.293 5.293a1 1 0 011.414 0l2 2a1 1 0 01-1.414 1.414L13 7.414V10a1 1 0 11-2 0V7.414l-1.293 1.293a1 1 0 01-1.414-1.414l2-2zM7.707 14.707a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L7 12.586V10a1 1 0 112 0v2.586l1.293-1.293a1 1 0 011.414 1.414l-2 2z" })
] });
const AnalysisCardChart = We.memo(({
  cardId,
  language,
  chartRendererRef,
  displayChartType,
  dataForDisplay,
  plan,
  selectedIndices,
  isZoomed,
  chartHeight = 256,
  disableAnimation,
  showDataLabels,
  onElementClick,
  onZoomChange,
  onClearSelection,
  onResetZoom
}) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative rounded-card border border-slate-200 bg-white p-3", children: [
  selectedIndices.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 flex items-center justify-between gap-3 rounded-card border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900", "data-export-exclude": true, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-medium", children: getTranslation("card_selection_count", language, {
      count: selectedIndices.length,
      item: getTranslation(
        selectedIndices.length === 1 ? "card_selection_item" : "card_selection_items",
        language
      )
    }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: onClearSelection,
        className: "inline-flex min-h-[44px] items-center rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 shadow-sm ring-1 ring-blue-200 transition-colors hover:bg-blue-100 md:min-h-0",
        children: getTranslation("card_clear_selection", language)
      }
    )
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", style: { height: `${chartHeight}px` }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ChartRenderer,
      {
        ref: chartRendererRef,
        cardId,
        chartType: displayChartType,
        data: dataForDisplay,
        plan,
        selectedIndices,
        onElementClick,
        onZoomChange,
        disableAnimation,
        showDataLabels
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute top-1 right-1 flex items-center space-x-1", "data-export-exclude": true, children: [
      selectedIndices.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onClearSelection, title: getTranslation("card_clear_selection", language), "aria-label": getTranslation("card_clear_selection", language), className: "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/70 p-1 text-slate-600 backdrop-blur-sm transition-all hover:bg-slate-100 hover:text-slate-800 md:min-h-0 md:min-w-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClearSelection, {}) }),
      isZoomed && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onResetZoom, title: getTranslation("card_reset_zoom", language), "aria-label": getTranslation("card_reset_zoom", language), className: "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/50 p-1 text-slate-600 backdrop-blur-sm transition-all hover:bg-slate-100 hover:text-slate-800 md:min-h-0 md:min-w-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconResetZoom, {}) })
    ] })
  ] }),
  showDataLabels && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "sr-only", children: (dataForDisplay ?? []).map((row) => {
    const category = plan.groupByColumn ? normalizeCategoryLabel(row[plan.groupByColumn]) : plan.valueColumn ?? "Value";
    const valueKey = plan.valueColumn ?? "count";
    return `${category}: ${formatAnalysisMeasureValue(row[valueKey])}`;
  }).join("; ") })
] }));
const AnalysisCardSummaryComponent = ({
  cardId,
  plan,
  totalValue,
  overallTotalValue,
  displayedRowCount,
  totalRowCount,
  displayedMetricLabel,
  displayedGroupLabel,
  topN,
  hideOthers,
  hiddenLabelCount,
  filter,
  language,
  summary,
  visualSummary,
  visuallyGrounded,
  pivotQualitySummary
}) => {
  const [isExpanded, setIsExpanded] = reactExports.useState(false);
  reactExports.useEffect(() => {
    const handler = (e) => {
      var _a;
      if (((_a = e.detail) == null ? void 0 : _a.cardId) === cardId) {
        setIsExpanded(true);
      }
    };
    window.addEventListener("card:expand-narrative", handler);
    return () => window.removeEventListener("card:expand-narrative", handler);
  }, [cardId]);
  const effectiveSummary = visualSummary ?? summary;
  const primarySummary = reactExports.useMemo(() => (effectiveSummary == null ? void 0 : effectiveSummary.text.trim()) || "", [effectiveSummary]);
  const hasExpandableContent = primarySummary.length > 0;
  const showLanguageBadge = Boolean(summary && summary.language !== language);
  const summaryTitle = getTranslation("analysis_card_ai_summary", language);
  const summaryPlaceholder = getTranslation("analysis_card_summary_placeholder", language);
  const showingLabel = getTranslation("analysis_card_showing_total_label", language);
  const overallLabel = getTranslation("analysis_card_overall_total_label", language);
  const expandLabel = getTranslation("analysis_card_expand", language);
  const collapseLabel = getTranslation("analysis_card_collapse", language);
  const generatedInLabel = showLanguageBadge ? getTranslation("summary_generated_in", language, { language: (summary == null ? void 0 : summary.language) ?? "English" }) : null;
  const scopeLabel = reactExports.useMemo(() => {
    if (topN) {
      return getTranslation("analysis_card_scope_top_n", language, { count: String(topN) });
    }
    return getTranslation("analysis_card_scope_full", language);
  }, [language, topN]);
  const filterLabel = reactExports.useMemo(() => {
    if (!filter || !filter.column || filter.values.length === 0) return null;
    const values = filter.values.map((value) => normalizeCategoryLabel(value)).join(", ");
    return getTranslation("analysis_card_scope_filter", language, { column: filter.column, values });
  }, [filter, language]);
  const formatSummaryMeasure = plan.aggregation === "count" ? formatAnalysisValue : formatAnalysisMeasureValue;
  const previewLines = reactExports.useMemo(() => {
    const lines = [
      getTranslation("analysis_card_view_line_scope", language, {
        visible: displayedRowCount.toLocaleString(),
        total: totalRowCount.toLocaleString(),
        shown: formatSummaryMeasure(totalValue),
        overall: formatSummaryMeasure(overallTotalValue)
      }),
      getTranslation("analysis_card_view_line_metric", language, {
        metric: displayedMetricLabel,
        dimension: displayedGroupLabel
      })
    ];
    if (topN || hideOthers || hiddenLabelCount > 0 || filterLabel) {
      lines.push(getTranslation("analysis_card_view_line_focus", language, {
        scope: scopeLabel,
        others: hideOthers ? getTranslation("analysis_card_scope_hide_others", language) : getTranslation("analysis_card_scope_include_others", language),
        hidden: hiddenLabelCount > 0 ? getTranslation("analysis_card_scope_hidden_count", language, { count: String(hiddenLabelCount) }) : getTranslation("analysis_card_scope_no_hidden", language)
      }));
    } else {
      lines.push(getTranslation("analysis_card_view_line_ready", language));
    }
    return lines;
  }, [
    displayedGroupLabel,
    displayedMetricLabel,
    displayedRowCount,
    filterLabel,
    hiddenLabelCount,
    hideOthers,
    language,
    overallTotalValue,
    scopeLabel,
    topN,
    totalRowCount,
    totalValue,
    formatSummaryMeasure
  ]);
  const qualityLines = reactExports.useMemo(() => {
    if (!pivotQualitySummary) {
      return [];
    }
    const lines = [];
    if (pivotQualitySummary.labelNormalizationAppliedClusters > 0) {
      lines.push(getTranslation("analysis_card_pivot_quality_label_normalized", language, {
        clusters: pivotQualitySummary.labelNormalizationAppliedClusters.toLocaleString(),
        columns: pivotQualitySummary.labelNormalizationAppliedColumns.toLocaleString(),
        replacements: pivotQualitySummary.labelNormalizationAppliedReplacements.toLocaleString()
      }));
    }
    if (pivotQualitySummary.labelNormalizationDeferredSuggestions > 0) {
      lines.push(getTranslation("analysis_card_pivot_quality_label_deferred", language, {
        count: pivotQualitySummary.labelNormalizationDeferredSuggestions.toLocaleString()
      }));
    }
    if (pivotQualitySummary.unknownCount > 0 || pivotQualitySummary.zeroCount > 0 || pivotQualitySummary.negativeCount > 0) {
      lines.push(getTranslation("analysis_card_pivot_quality_counts", language, {
        unknown: pivotQualitySummary.unknownCount.toLocaleString(),
        zero: pivotQualitySummary.zeroCount.toLocaleString(),
        negative: pivotQualitySummary.negativeCount.toLocaleString()
      }));
    }
    if (pivotQualitySummary.omittedRowCount > 0) {
      lines.push(getTranslation("analysis_card_pivot_quality_focus", language, {
        visible: displayedRowCount.toLocaleString(),
        omitted: pivotQualitySummary.omittedRowCount.toLocaleString()
      }));
    }
    if (pivotQualitySummary.hiddenZeroRowCount > 0) {
      lines.push(getTranslation("analysis_card_pivot_quality_zero_hidden", language, {
        count: pivotQualitySummary.hiddenZeroRowCount.toLocaleString()
      }));
    }
    if (pivotQualitySummary.defaultCompressedStackedView && !pivotQualitySummary.isStackedChartActive && pivotQualitySummary.foldedMatrixValueColumnCount > 0 && pivotQualitySummary.visibleMatrixValueColumnCount > 0 && pivotQualitySummary.effectiveMatrixValueColumnCount > 0) {
      lines.push(getTranslation("analysis_card_pivot_quality_wide_columns", language, {
        visible: pivotQualitySummary.visibleMatrixValueColumnCount.toLocaleString(),
        folded: pivotQualitySummary.foldedMatrixValueColumnCount.toLocaleString()
      }));
    }
    if (pivotQualitySummary.isStackedChartActive && pivotQualitySummary.foldedMatrixValueColumnCount > 0 && pivotQualitySummary.visibleMatrixValueColumnCount > 0) {
      lines.push(getTranslation("analysis_card_pivot_quality_column_focus", language, {
        visible: pivotQualitySummary.visibleMatrixValueColumnCount.toLocaleString(),
        folded: pivotQualitySummary.foldedMatrixValueColumnCount.toLocaleString()
      }));
    }
    return lines;
  }, [displayedRowCount, language, pivotQualitySummary]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 p-3 text-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex flex-wrap items-start justify-between gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: summaryTitle }),
        visuallyGrounded && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600", children: getTranslation("analysis_card_visual_badge", language) }),
        generatedInLabel && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600", children: generatedInLabel })
      ] }),
      plan.aggregation === "sum" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2 text-xs text-slate-500", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          showingLabel,
          ": ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-bold text-base text-slate-800", children: formatSummaryMeasure(totalValue) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          overallLabel,
          ": ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-700", children: formatSummaryMeasure(overallTotalValue) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex flex-wrap gap-2", "data-export-exclude": true, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200", children: scopeLabel }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200", children: displayedMetricLabel }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200", children: displayedGroupLabel }),
      hideOthers && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200", children: getTranslation("analysis_card_scope_hide_others", language) }),
      filterLabel && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200", children: filterLabel })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1 text-slate-800", children: previewLines.map((line, index) => /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "leading-relaxed", children: line }, `summary-preview-${index}`)) }),
    qualityLines.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold", children: getTranslation("analysis_card_quality_title", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 space-y-1", children: qualityLines.map((line, index) => /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "leading-relaxed", children: line }, `quality-line-${index}`)) })
    ] }),
    !primarySummary ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-slate-500", children: summaryPlaceholder }) : isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { id: `narrative-${cardId}`, className: "mt-4 border-t border-slate-200 pt-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("analysis_card_ai_narrative_label", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "prose prose-sm text-slate-800 max-w-none", children: /* @__PURE__ */ jsxRuntimeExports.jsx(MarkdownRenderer, { content: primarySummary, compact: true }) })
    ] }) : null,
    hasExpandableContent && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        className: "mt-3 min-h-[44px] text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700 md:min-h-0",
        onClick: () => setIsExpanded((previous) => !previous),
        "aria-expanded": isExpanded,
        "data-export-exclude": true,
        children: isExpanded ? collapseLabel : expandLabel
      }
    )
  ] }) });
};
const AnalysisCardSummary = We.memo(AnalysisCardSummaryComponent);
const AnalysisCardControlsComponent = ({
  cardId,
  isDataVisible,
  plan,
  aggregatedData,
  availableChartTypes,
  displayChartType,
  topN,
  hideOthers,
  hideZeroValueRows,
  zeroValueRowCount,
  pivotColumnTopN,
  pivotHideOtherColumns,
  pivotFoldedColumnCount,
  showPivotColumnControls,
  onToggleDataVisibility,
  onChartTypeSelect,
  onTopNChange,
  onHideOthersChange,
  onHideZeroValueRowsChange,
  onPivotColumnTopNChange,
  onPivotHideOtherColumnsChange,
  showDataLabels,
  onToggleDataLabels
}) => {
  const language = useAppStore((state) => state.settings.language);
  const t = (key, params) => getTranslation(key, language, params);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 rounded-card border border-slate-200 bg-slate-50/80 px-3 py-2", "data-export-exclude": true, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onToggleDataVisibility, className: "min-h-[44px] text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline md:min-h-0", children: isDataVisible ? t("card_controls_hide_table") : t("card_controls_show_table") }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-end gap-2", children: [
      plan.artifactType === "pivot_matrix" && availableChartTypes.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold text-slate-500", children: t("card_controls_pivot_chart") }),
        availableChartTypes.map((type) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => onChartTypeSelect(type),
            "aria-pressed": displayChartType === type,
            className: `min-h-[44px] min-w-[44px] rounded-full px-2.5 py-1 text-xs font-medium transition-colors md:min-h-0 md:min-w-0 ${displayChartType === type ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"}`,
            children: t(`chart_type_${type}`)
          },
          type
        ))
      ] }),
      !plan.disableTopNControls && plan.chartType !== "scatter" && aggregatedData.length > 5 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: `top-n-${cardId}`, className: "text-xs font-semibold text-slate-500", children: t("card_controls_show_label") }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            id: `top-n-${cardId}`,
            value: topN || "all",
            onChange: onTopNChange,
            className: "min-h-[44px] bg-white border border-slate-300 text-slate-800 text-xs rounded-card py-1.5 px-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 md:min-h-0",
            "aria-label": t("card_controls_visible_categories"),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "all", children: t("card_controls_all") }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "5", children: t("card_controls_top_n", { n: 5 }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "8", children: t("card_controls_top_n", { n: 8 }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "10", children: t("card_controls_top_n", { n: 10 }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "15", children: t("card_controls_top_n", { n: 15 }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "20", children: t("card_controls_top_n", { n: 20 }) })
            ]
          }
        ),
        topN && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { htmlFor: `hide-others-${cardId}`, className: "flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-slate-500 md:min-h-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "checkbox",
              id: `hide-others-${cardId}`,
              checked: hideOthers,
              onChange: onHideOthersChange,
              className: "bg-slate-100 border-slate-300 rounded focus:ring-blue-500 text-blue-600 h-4 w-4"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: t("card_controls_hide_others") })
        ] }) })
      ] }),
      showPivotColumnControls && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: `pivot-column-top-n-${cardId}`, className: "text-xs font-semibold text-slate-500", children: t("card_controls_show_columns") }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            id: `pivot-column-top-n-${cardId}`,
            value: pivotColumnTopN || "all",
            onChange: onPivotColumnTopNChange,
            className: "min-h-[44px] bg-white border border-slate-300 text-slate-800 text-xs rounded-card py-1.5 px-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 md:min-h-0",
            "aria-label": t("card_controls_visible_pivot_columns"),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "all", children: t("card_controls_all") }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "5", children: t("card_controls_top_n", { n: 5 }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "8", children: t("card_controls_top_n", { n: 8 }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "10", children: t("card_controls_top_n", { n: 10 }) })
            ]
          }
        ),
        pivotColumnTopN && (pivotFoldedColumnCount > 0 || pivotHideOtherColumns) && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { htmlFor: `hide-pivot-column-others-${cardId}`, className: "flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-slate-500 md:min-h-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "checkbox",
              id: `hide-pivot-column-others-${cardId}`,
              checked: pivotHideOtherColumns,
              onChange: onPivotHideOtherColumnsChange,
              className: "bg-slate-100 border-slate-300 rounded focus:ring-blue-500 text-blue-600 h-4 w-4"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: t("card_controls_hide_column_others") })
        ] }) })
      ] }),
      plan.artifactType === "pivot_matrix" && (zeroValueRowCount > 0 || hideZeroValueRows) && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { htmlFor: `hide-zero-rows-${cardId}`, className: "flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-slate-500 md:min-h-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "checkbox",
            id: `hide-zero-rows-${cardId}`,
            checked: hideZeroValueRows,
            onChange: onHideZeroValueRowsChange,
            className: "bg-slate-100 border-slate-300 rounded focus:ring-blue-500 text-blue-600 h-4 w-4"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: t("card_controls_hide_zero_rows") })
      ] }) }),
      onToggleDataLabels && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { htmlFor: `data-labels-${cardId}`, className: "flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-slate-500 md:min-h-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "checkbox",
            id: `data-labels-${cardId}`,
            checked: Boolean(showDataLabels),
            onChange: onToggleDataLabels,
            className: "bg-slate-100 border-slate-300 rounded focus:ring-blue-500 text-blue-600 h-4 w-4"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: t("card_controls_labels") })
      ] }) })
    ] })
  ] });
};
const AnalysisCardControls = We.memo(AnalysisCardControlsComponent);
const SortIndicator = ({ column, sort }) => {
  if (!sort || sort.column !== column) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-slate-300 opacity-0 group-hover/th:opacity-100 transition-opacity", children: "⇅" });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-blue-500", children: sort.direction === "asc" ? "▲" : "▼" });
};
const DataTableComponent = ({ data, plan, displayColumnLabels, sort, onSortChange }) => {
  const language = useAppStore((state) => state.settings.language);
  if (!data || data.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: getTranslation("table_no_data", language) });
  }
  const headers = collectOrderedColumnNames(data);
  const rawNumericColumns = getNumericColumns(data, headers);
  const groupByCol = plan == null ? void 0 : plan.groupByColumn;
  const numericColumns = new Set(
    groupByCol ? rawNumericColumns.filter((c) => c !== groupByCol) : rawNumericColumns
  );
  const columnLabels = {
    ...getAnalysisColumnLabels(headers, plan),
    ...displayColumnLabels ?? {}
  };
  const handleHeaderClick = (header) => {
    if (!onSortChange) return;
    if ((sort == null ? void 0 : sort.column) === header) {
      if (sort.direction === "asc") {
        onSortChange({ column: header, direction: "desc" });
      } else {
        onSortChange(null);
      }
    } else {
      onSortChange({ column: header, direction: "asc" });
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full min-w-max text-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-left", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "sticky top-0 z-10 bg-slate-100 text-slate-600", children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: headers.map((header) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "th",
      {
        className: `p-2 font-semibold select-none ${numericColumns.has(header) ? "text-right tabular-nums" : "min-w-[14rem]"} ${onSortChange ? "cursor-pointer hover:bg-slate-200/70 group/th transition-colors" : ""}`,
        onClick: () => handleHeaderClick(header),
        title: onSortChange ? getTranslation("table_sort_column", language, { column: columnLabels[header] ?? header }) : void 0,
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-0.5", children: [
          columnLabels[header] ?? header,
          onSortChange && /* @__PURE__ */ jsxRuntimeExports.jsx(SortIndicator, { column: header, sort: sort ?? null })
        ] })
      },
      header
    )) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "bg-white", children: data.map((row, rowIndex) => {
      if (row.Column === "---SEPARATOR---") {
        return /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: headers.length, className: "py-2 px-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full h-px bg-slate-200" }) }) }, `sep-${rowIndex}`);
      }
      return /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { className: "border-b border-slate-200 last:border-b-0", children: headers.map((header) => {
        const displayValue = numericColumns.has(header) ? formatAnalysisMeasureValue(row[header]) : formatAnalysisCellValue(header, row[header]);
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "td",
          {
            className: `p-2 text-slate-700 align-top ${numericColumns.has(header) ? "text-right tabular-nums whitespace-nowrap" : "max-w-[24rem] break-words"}`,
            title: displayValue || normalizeCategoryLabel(row[header]),
            children: displayValue || normalizeCategoryLabel(row[header])
          },
          `${rowIndex}-${header}`
        );
      }) }, rowIndex);
    }) })
  ] }) });
};
const DataTable = We.memo(DataTableComponent);
const AnalysisCardDataTablesComponent = ({
  isDataVisible,
  dataForDisplay,
  selectedIndices,
  plan,
  maxHeightClass = "max-h-48",
  sort,
  onSortChange
}) => {
  const [showSelectionDetails, setShowSelectionDetails] = reactExports.useState(true);
  const selectedData = selectedIndices.map((index) => dataForDisplay[index]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    selectedIndices.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md border border-slate-200 bg-slate-50 p-3 text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setShowSelectionDetails(!showSelectionDetails),
          className: "mb-1 w-full text-left font-semibold text-blue-600",
          "aria-expanded": showSelectionDetails,
          children: [
            showSelectionDetails ? "▾" : "▸",
            " Selection Details (",
            selectedIndices.length,
            " items)"
          ]
        }
      ),
      showSelectionDetails && /* @__PURE__ */ jsxRuntimeExports.jsx(DataTable, { data: selectedData, plan })
    ] }),
    isDataVisible && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `overflow-auto border border-slate-200 rounded-card bg-white ${maxHeightClass}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(DataTable, { data: dataForDisplay, plan, sort, onSortChange }) })
  ] });
};
const AnalysisCardDataTables = We.memo(AnalysisCardDataTablesComponent);
const COLLAPSED_LEGEND_ITEMS = 6;
const PivotStackedLegendComponent = ({ data, plan, hiddenSeriesLabels, onSeriesToggle, onResetHiddenSeries }) => {
  var _a;
  const language = useAppStore((state) => state.settings.language);
  const t = (key, params) => getTranslation(key, language, params);
  const [isExpanded, setIsExpanded] = reactExports.useState(false);
  const [query, setQuery] = reactExports.useState("");
  const totalKey = plan.valueColumn || "row_total";
  const matrixValueColumns = ((_a = plan.artifactMetadata) == null ? void 0 : _a.matrixValueColumns) ?? [];
  const legendItems = reactExports.useMemo(() => {
    const denominator = matrixValueColumns.reduce((sum, column) => {
      const contribution = data.reduce((columnSum, row) => columnSum + Math.abs(Number(row[column]) || 0), 0);
      return sum + contribution;
    }, 0);
    return matrixValueColumns.map((column, index) => {
      const signedContribution = data.reduce((sum, row) => sum + (Number(row[column]) || 0), 0);
      const absoluteContribution = data.reduce((sum, row) => sum + Math.abs(Number(row[column]) || 0), 0);
      const share = denominator > 0 ? absoluteContribution / denominator * 100 : 0;
      return {
        column,
        label: column === PIVOT_FOLDED_OTHERS_KEY ? getTranslation("card_others", language) : column,
        signedContribution,
        absoluteContribution,
        share,
        color: COLORS[index % COLORS.length]
      };
    }).sort((left, right) => {
      if (left.column === PIVOT_FOLDED_OTHERS_KEY) return 1;
      if (right.column === PIVOT_FOLDED_OTHERS_KEY) return -1;
      return right.absoluteContribution - left.absoluteContribution;
    });
  }, [data, language, matrixValueColumns]);
  const filteredLegendItems = reactExports.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return legendItems;
    }
    return legendItems.filter((item) => item.label.toLowerCase().includes(normalizedQuery));
  }, [legendItems, query]);
  if (legendItems.length === 0) {
    return null;
  }
  const visibleItems = isExpanded ? filteredLegendItems : filteredLegendItems.slice(0, COLLAPSED_LEGEND_ITEMS);
  const totalValue = data.reduce((sum, row) => sum + (Number(row[totalKey]) || 0), 0);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50/80 p-3", "data-export-exclude": true, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex flex-wrap items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-800", children: t("card_series_legend") }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500", children: t("card_series_legend_hint") })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
        hiddenSeriesLabels.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "min-h-[44px] text-xs font-semibold text-slate-600 transition-colors hover:text-slate-800 md:min-h-0",
            onClick: onResetHiddenSeries,
            children: t("card_reset_hidden_series")
          }
        ),
        filteredLegendItems.length > COLLAPSED_LEGEND_ITEMS && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "min-h-[44px] text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700 md:min-h-0",
            onClick: () => setIsExpanded((previous) => !previous),
            "aria-expanded": isExpanded,
            children: isExpanded ? t("card_collapse_legend") : t("card_show_all_legend_items", { count: filteredLegendItems.length })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        type: "search",
        name: "stacked-legend-search",
        value: query,
        onChange: (event) => setQuery(event.target.value),
        placeholder: t("card_search_legend"),
        "aria-label": t("card_search_legend"),
        className: "min-h-[44px] w-full rounded-card border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 md:min-h-0"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: visibleItems.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => onSeriesToggle(item.column),
        className: `flex min-h-[44px] w-full items-center justify-between gap-3 rounded-card bg-white px-2.5 py-1.5 text-left ring-1 ring-slate-200 transition-colors md:min-h-0 ${hiddenSeriesLabels.includes(item.column) ? "opacity-50 hover:bg-slate-100" : "hover:bg-slate-100"}`,
        title: t("card_toggle_legend_item", {
          action: t(hiddenSeriesLabels.includes(item.column) ? "card_action_show" : "card_action_hide"),
          label: item.label
        }),
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-3 w-3 flex-shrink-0 rounded-sm", style: { backgroundColor: hiddenSeriesLabels.includes(item.column) ? "#94a3b8" : item.color } }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `truncate text-xs font-medium ${hiddenSeriesLabels.includes(item.column) ? "text-slate-400 line-through" : "text-slate-700"}`, title: item.label, children: item.label })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-shrink-0 items-baseline gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-xs font-semibold ${hiddenSeriesLabels.includes(item.column) ? "text-slate-400" : "text-slate-800"}`, children: formatAnalysisValue(item.signedContribution) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "w-12 text-right text-[11px] text-slate-500", children: [
              "(",
              item.share.toFixed(1),
              "%)"
            ] })
          ] })
        ]
      },
      item.column
    )) }),
    filteredLegendItems.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-card bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200", children: t("card_no_legend_matches") }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 text-[11px] text-slate-500", children: [
      t("card_legend_total"),
      " ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-700", children: formatAnalysisValue(totalValue) })
    ] })
  ] });
};
const PivotStackedLegend = We.memo(PivotStackedLegendComponent);
const TOTAL_STEPS = 4;
const TABULATOR_PAGE_SIZE = 50;
const formatPreFilter = (filter) => {
  const op = filter.operator ?? "=";
  const val = Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value);
  return `${filter.column} ${op} "${val}"`;
};
const computeTotal = (rows, valueColumn, aggregation) => {
  if (!valueColumn || rows.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const row of rows) {
    const v = row[valueColumn];
    if (v != null) {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isNaN(n)) {
        sum += n;
        count++;
      }
    }
  }
  if (count === 0) return null;
  return aggregation === "avg" ? sum / count : sum;
};
const StepBar = ({ current, total, language }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-1", children: Array.from({ length: total }, (_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: `h-2 w-10 rounded-full transition-colors ${i + 1 === current ? "bg-blue-500" : i + 1 < current ? "bg-blue-300" : "bg-slate-200"}`
    },
    i
  )) }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-slate-400", children: getTranslation("provenance_step_indicator", language, { current, total }) })
] });
const DataProvenanceModal = ({
  plan,
  aggregatedData,
  provenance,
  currentDatasetVersion,
  onClose,
  restoreFocusSelector
}) => {
  const [currentStep, setCurrentStep] = reactExports.useState(1);
  const language = useAppStore((state) => state.settings.language);
  const rawCsvData = useAppStore((state) => state.rawCsvData);
  const csvData = useAppStore((state) => state.csvData);
  const dataPreparationPlan = useAppStore((state) => state.dataPreparationPlan);
  const [isCustomMode, setIsCustomMode] = reactExports.useState(false);
  const [rawFilter, setRawFilter] = reactExports.useState("");
  const [cleanedFilter, setCleanedFilter] = reactExports.useState("");
  const [rawGroupByMode, setRawGroupByMode] = reactExports.useState(false);
  const [cleanedGroupByMode, setCleanedGroupByMode] = reactExports.useState(false);
  const t = reactExports.useCallback(
    (key, params) => getTranslation(key, language, params),
    [language]
  );
  const dialogRef = useDialogAccessibility(true, onClose, {
    restoreFocusSelector
  });
  const rawRows = (rawCsvData == null ? void 0 : rawCsvData.data) ?? [];
  const rawColCount = rawRows[0] ? Object.keys(rawRows[0]).length : 0;
  const cleanedRows = (csvData == null ? void 0 : csvData.data) ?? [];
  const cleanedColCount = cleanedRows[0] ? Object.keys(cleanedRows[0]).length : 0;
  const headerRow = (rawCsvData == null ? void 0 : rawCsvData.headerDepth) ?? 1;
  const operations = (dataPreparationPlan == null ? void 0 : dataPreparationPlan.operations) ?? [];
  const rowDelta = rawRows.length - cleanedRows.length;
  const filteredRawRows = reactExports.useMemo(() => {
    if (!rawFilter.trim()) return rawRows;
    const needle = rawFilter.trim().toLowerCase();
    return rawRows.filter(
      (row) => Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(needle))
    );
  }, [rawRows, rawFilter]);
  const filteredCleanedRows = reactExports.useMemo(() => {
    if (!cleanedFilter.trim()) return cleanedRows;
    const needle = cleanedFilter.trim().toLowerCase();
    return cleanedRows.filter(
      (row) => Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(needle))
    );
  }, [cleanedRows, cleanedFilter]);
  const cardTotal = reactExports.useMemo(
    () => computeTotal(aggregatedData, plan.valueColumn, plan.aggregation ?? "sum"),
    [aggregatedData, plan.valueColumn, plan.aggregation]
  );
  const handleOverlayClick = reactExports.useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);
  const goPrev = reactExports.useCallback(() => setCurrentStep((s) => Math.max(1, s - 1)), []);
  const goNext = reactExports.useCallback(() => setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1)), []);
  const rawCols = reactExports.useMemo(() => rawRows[0] ? Object.keys(rawRows[0]) : [], [rawRows]);
  const cleanedColNames = reactExports.useMemo(() => cleanedRows[0] ? Object.keys(cleanedRows[0]) : [], [cleanedRows]);
  const renderStep1 = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-bold text-blue-800", children: t("provenance_step1_title") }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-sm text-slate-500", children: t("provenance_step1_summary", { rows: rawRows.length, cols: rawColCount, header: headerRow }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ViewModeToggle, { isGroupBy: rawGroupByMode, onToggle: setRawGroupByMode, language }),
        !rawGroupByMode && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: rawFilter,
            onChange: (e) => setRawFilter(e.target.value),
            placeholder: getTranslation("spreadsheet_search_placeholder", language),
            className: "w-52 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          }
        )
      ] })
    ] }),
    rawGroupByMode ? /* @__PURE__ */ jsxRuntimeExports.jsx(GroupByTest, { rows: rawRows, language, accentColor: "blue" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      rawFilter && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-slate-400", children: [
        filteredRawRows.length,
        " / ",
        rawRows.length,
        " rows"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-0 flex-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        TabulatorTable,
        {
          data: filteredRawRows,
          columns: rawCols,
          pageSize: TABULATOR_PAGE_SIZE,
          tableKey: "provenance-raw",
          language,
          variant: "raw-explorer"
        }
      ) })
    ] })
  ] });
  const renderStep2 = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-bold text-amber-800", children: t("provenance_step2_title") }),
        operations.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-600", children: t("provenance_step2_ops", { count: operations.length }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "ml-4 list-disc space-y-0.5 text-xs text-slate-600", children: [
            operations.slice(0, 6).map((op, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: t(`provenance_op_${op.type}`) }),
              op.reason && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-slate-400", children: [
                " — ",
                op.reason
              ] })
            ] }, op.id ?? i)),
            operations.length > 6 && /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "text-slate-400", children: [
              "… +",
              operations.length - 6
            ] })
          ] })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-500", children: t("provenance_step2_no_ops") }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 flex items-center gap-2 text-sm text-slate-500", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: t("provenance_step2_summary", { rows: cleanedRows.length, cols: cleanedColCount }) }),
          rowDelta !== 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `font-semibold ${rowDelta > 0 ? "text-amber-600" : "text-emerald-600"}`, children: rowDelta > 0 ? t("provenance_step2_delta", { delta: rowDelta }) : t("provenance_step2_delta_added", { delta: Math.abs(rowDelta) }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ViewModeToggle, { isGroupBy: cleanedGroupByMode, onToggle: setCleanedGroupByMode, language }),
        !cleanedGroupByMode && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: cleanedFilter,
            onChange: (e) => setCleanedFilter(e.target.value),
            placeholder: getTranslation("spreadsheet_search_placeholder", language),
            className: "w-52 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
          }
        )
      ] })
    ] }),
    cleanedGroupByMode ? /* @__PURE__ */ jsxRuntimeExports.jsx(GroupByTest, { rows: cleanedRows, language, accentColor: "amber" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      cleanedFilter && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-slate-400", children: [
        filteredCleanedRows.length,
        " / ",
        cleanedRows.length,
        " rows"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-0 flex-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        TabulatorTable,
        {
          data: filteredCleanedRows,
          columns: cleanedColNames,
          pageSize: TABULATOR_PAGE_SIZE,
          tableKey: "provenance-cleaned",
          language,
          variant: "raw-explorer"
        }
      ) })
    ] })
  ] });
  const renderStep3 = () => {
    var _a;
    const groupByCol = plan.groupByColumn;
    const valueCol = plan.valueColumn;
    const aggLabel = (plan.aggregation ?? "sum").toUpperCase();
    const preFilters = plan.preFilter ?? [];
    const topN = plan.defaultTopN ?? null;
    const highlightCols = [groupByCol, valueCol].filter((c) => Boolean(c));
    const cardTotalStr = cardTotal != null ? formatNumber(cardTotal) : "—";
    const freshness = resolveAnalysisArtifactFreshness(provenance, currentDatasetVersion);
    const displayedStatus = freshness === "stale" ? "stale" : (provenance == null ? void 0 : provenance.evidenceStatus) ?? "unverified";
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-bold text-violet-800", children: t("provenance_step3_title") }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: `rounded-lg border p-3 text-xs ${displayedStatus === "verified" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : displayedStatus === "stale" || displayedStatus === "hypothesis" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`,
          "data-testid": "artifact-provenance-contract",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-x-4 gap-y-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("strong", { className: "uppercase", children: [
                displayedStatus,
                " evidence"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                "Artifact version: ",
                (provenance == null ? void 0 : provenance.datasetVersion) ?? "unverified"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                "Current version: ",
                currentDatasetVersion ?? "unavailable"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                "Query trace: ",
                ((_a = provenance == null ? void 0 : provenance.queryEvidence) == null ? void 0 : _a.traceId) ?? "not applicable"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1", children: [
              "Method: ",
              (provenance == null ? void 0 : provenance.method.operation) ?? plan.artifactType ?? plan.chartType,
              (provenance == null ? void 0 : provenance.method.groupByColumns.length) ? ` · grouped by ${provenance.method.groupByColumns.join(", ")}` : ""
            ] }),
            ((provenance == null ? void 0 : provenance.evidenceRefs.length) ?? 0) > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1", children: [
              "Evidence refs: ",
              provenance == null ? void 0 : provenance.evidenceRefs.map((ref) => `${ref.kind}:${ref.id}`).join(" · ")
            ] }),
            freshness === "stale" && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold", children: "This result cannot be used as current report evidence until it is regenerated." })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setIsCustomMode(false),
            className: `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${!isCustomMode ? "bg-violet-100 text-violet-800 border border-violet-300" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`,
            children: t("provenance_step3_card_query")
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setIsCustomMode(true),
            className: `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${isCustomMode ? "bg-violet-100 text-violet-800 border border-violet-300" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`,
            children: t("provenance_step3_custom_query")
          }
        )
      ] }),
      !isCustomMode ? (
        /* Card's original query */
        /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1 text-sm text-slate-600", children: [
            groupByCol && valueCol && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-medium", children: t("provenance_step3_logic", { agg: aggLabel, value: valueCol, group: groupByCol }) }),
            !groupByCol && valueCol && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-medium", children: t("provenance_step3_logic_no_group", { agg: aggLabel, value: valueCol }) }),
            !groupByCol && !valueCol && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-medium", children: t("provenance_step3_logic_detail") }),
            preFilters.map((f, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs", children: t("provenance_step3_filter", { filter: formatPreFilter(f) }) }, i)),
            topN != null && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs", children: t("provenance_step3_topn", { n: topN }) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-0 flex-1 overflow-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            DataTable$1,
            {
              rows: aggregatedData,
              maxRows: 30,
              highlightCols,
              totalRow: cardTotal != null && valueCol ? {
                label: t("provenance_step3_total_label"),
                value: cardTotalStr,
                colSpan: Math.max(1, highlightCols.indexOf(valueCol))
              } : null
            }
          ) })
        ] })
      ) : (
        /* Custom interactive query — reuses GroupByTest with pivot support */
        /* @__PURE__ */ jsxRuntimeExports.jsx(GroupByTest, { rows: cleanedRows, language, accentColor: "violet" })
      )
    ] });
  };
  const renderStep4 = () => {
    const valueCol = plan.valueColumn;
    const groupByCol = plan.groupByColumn;
    const aggregation = plan.aggregation ?? "sum";
    const aggLabel = aggregation.toUpperCase();
    const totalStr = cardTotal != null ? formatNumber(cardTotal) : "—";
    const excelHint = valueCol ? groupByCol ? t("provenance_step4_excel_hint", { group: groupByCol, value: valueCol, agg: aggLabel, total: totalStr }) : t("provenance_step4_excel_hint_simple", { value: valueCol, agg: aggLabel, total: totalStr }) : null;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-6 px-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { className: "h-8 w-8 text-emerald-600", fill: "none", stroke: "currentColor", strokeWidth: "2.5", viewBox: "0 0 24 24", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M5 13l4 4L19 7" }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-bold text-emerald-800", children: t("provenance_step4_title") }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-md space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center text-sm text-slate-600", children: t("provenance_step4_row_count", { count: aggregatedData.length }) }),
        cardTotal != null && valueCol && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center text-2xl font-bold text-emerald-800", children: aggregation === "count" ? t("provenance_step4_count", { value: totalStr }) : aggregation === "avg" ? t("provenance_step4_avg", { column: valueCol, value: totalStr }) : t("provenance_step4_total", { column: valueCol, value: totalStr }) })
      ] }),
      excelHint && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-md flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconInsights, { className: "mt-0.5 h-4 w-4 shrink-0", "aria-hidden": "true" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: excelHint })
      ] })
    ] });
  };
  const stepRenderers = [renderStep1, renderStep2, renderStep3, renderStep4];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: dialogRef,
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "provenance-dialog-title",
      tabIndex: -1,
      className: "fixed inset-0 z-50 flex flex-col bg-white",
      onClick: handleOverlayClick,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "provenance-dialog-title", className: "text-lg font-bold text-slate-800", children: t("provenance_title") }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(StepBar, { current: currentStep, total: TOTAL_STEPS, language })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              "data-dialog-initial-focus": true,
              type: "button",
              onClick: onClose,
              className: "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
              "aria-label": t("provenance_close"),
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, { className: "h-5 w-5" })
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-0 flex-1 overflow-y-auto px-6 py-5", children: stepRenderers[currentStep - 1]() }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center justify-between border-t border-slate-200 px-6 py-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: goPrev,
              disabled: currentStep === 1,
              className: "rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40",
              children: t("provenance_prev")
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: currentStep === TOTAL_STEPS ? onClose : goNext,
              className: `rounded-lg px-5 py-2 text-sm font-medium text-white transition-colors ${currentStep === TOTAL_STEPS ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"}`,
              children: currentStep === TOTAL_STEPS ? t("provenance_close") : t("provenance_next")
            }
          )
        ] })
      ]
    }
  );
};
const SimpleMarkdown = ({ text }) => {
  const blocks = text.split(/\n{2,}/);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: blocks.map((block, bi) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    const lines = trimmed.split("\n");
    const isList = lines.every((l) => /^\s*[*\-•]\s+/.test(l) || !l.trim());
    if (isList) {
      return /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "list-disc space-y-1 pl-5", children: lines.filter((l) => l.trim()).map((line, li) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: renderInline(line.replace(/^\s*[*\-•]\s+/, "")) }, li)) }, bi);
    }
    const isNumberedList = lines.every((l) => /^\s*\d+[.)]\s+/.test(l) || !l.trim());
    if (isNumberedList) {
      return /* @__PURE__ */ jsxRuntimeExports.jsx("ol", { className: "list-decimal space-y-1 pl-5", children: lines.filter((l) => l.trim()).map((line, li) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: renderInline(line.replace(/^\s*\d+[.)]\s+/, "")) }, li)) }, bi);
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: renderInline(trimmed.replace(/\n/g, " ")) }, bi);
  }) });
};
const renderInline = (text) => {
  const parts = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(/* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: match[2] }, match.index));
    } else if (match[3]) {
      parts.push(/* @__PURE__ */ jsxRuntimeExports.jsx("em", { children: match[3] }, match.index));
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
};
const VERDICT_LABELS = {
  verified: { icon: "✓", colorClass: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  caveated: { icon: "⚠", colorClass: "bg-amber-100 text-amber-700 border-amber-200" },
  unverified: { icon: "?", colorClass: "bg-slate-100 text-slate-700 border-slate-200" },
  stale: { icon: "!", colorClass: "bg-red-100 text-red-700 border-red-200" },
  weak: { icon: "✗", colorClass: "bg-red-100 text-red-700 border-red-200" }
};
const AI_EXPLAIN_TIMEOUT_MS = 2e4;
const LOG_PREFIX = "[VerdictExplainer]";
const buildExplainPrompt = (verdict, reasonCodes, detail, cardTitle, language) => {
  const langInstruction = getTranslation("ai_prompt_reply_language", language);
  return [
    `You are a data analysis quality advisor. A user is looking at an analysis card titled "${cardTitle}".`,
    `The system evaluated this card and assigned verdict: "${verdict}".`,
    `Reason codes: ${reasonCodes.length > 0 ? reasonCodes.join(", ") : "none"}.`,
    `Technical detail: ${detail || "none"}.`,
    "",
    "Explain to the user in simple, non-technical language:",
    "1. What does this verdict mean for them?",
    "2. For each reason code, explain what it means and why it matters.",
    "3. What should the user do — can they still trust this card, or should they verify further?",
    "",
    "Keep the explanation concise (3-6 sentences). Use bullet points for multiple reasons.",
    langInstruction
  ].join("\n");
};
const VerdictExplainerModal = ({
  verdict,
  reasonCodes,
  detail,
  cardTitle,
  language,
  settings,
  cachedExplanation,
  onExplanationReady,
  onClose
}) => {
  const [aiExplanation, setAiExplanation] = reactExports.useState(null);
  const [isLoading, setIsLoading] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const abortRef = reactExports.useRef(null);
  const reasonCodesKey = JSON.stringify(reasonCodes);
  const fetchAiExplanation = reactExports.useCallback(async () => {
    var _a;
    if (cachedExplanation && cachedExplanation.verdict === verdict && cachedExplanation.reasonCodesKey === reasonCodesKey) {
      setAiExplanation(cachedExplanation.text);
      return;
    }
    if (!isProviderConfigured(settings)) {
      setError(getTranslation("verdict_explainer_no_provider", language));
      return;
    }
    setIsLoading(true);
    setError(null);
    const abortController = new AbortController();
    abortRef.current = abortController;
    const timer = setTimeout(() => abortController.abort(), AI_EXPLAIN_TIMEOUT_MS);
    try {
      const { model } = createProviderModel(settings, settings.simpleModel);
      const prompt = buildExplainPrompt(verdict, reasonCodes, detail, cardTitle, language);
      const result = await generateText({
        model,
        messages: [
          { role: "user", content: prompt }
        ],
        abortSignal: abortController.signal
      });
      const text = (_a = result.text) == null ? void 0 : _a.trim();
      if (text) {
        setAiExplanation(text);
        onExplanationReady == null ? void 0 : onExplanationReady({ text, verdict, reasonCodesKey });
        console.log(`${LOG_PREFIX} Explanation generated for "${cardTitle}" (${text.length} chars).`);
      } else {
        setError(getTranslation("verdict_explainer_empty_response", language));
      }
    } catch (err) {
      if (abortController.signal.aborted) return;
      console.warn(`${LOG_PREFIX} Failed for "${cardTitle}":`, err instanceof Error ? err.message : err);
      setError(getTranslation("verdict_explainer_error", language));
    } finally {
      clearTimeout(timer);
      setIsLoading(false);
    }
  }, [settings, verdict, reasonCodes, reasonCodesKey, detail, cardTitle, language, cachedExplanation, onExplanationReady]);
  reactExports.useEffect(() => {
    fetchAiExplanation();
  }, [fetchAiExplanation]);
  reactExports.useEffect(() => {
    return () => {
      var _a;
      (_a = abortRef.current) == null ? void 0 : _a.abort();
    };
  }, []);
  const dialogRef = useDialogAccessibility(true, onClose);
  const handleOverlayClick = reactExports.useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);
  const verdictStyle = VERDICT_LABELS[verdict];
  const verdictLabel = getTranslation(`card_trust_${verdict}`, language);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm",
      onClick: handleOverlayClick,
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          ref: dialogRef,
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "verdict-explainer-dialog-title",
          tabIndex: -1,
          className: "mx-4 flex w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl",
          style: { maxHeight: "80vh" },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${verdictStyle.colorClass}`, children: verdictStyle.icon }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "verdict-explainer-dialog-title", className: "text-base font-bold text-slate-800", children: getTranslation("verdict_explainer_title", language) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500", children: cardTitle })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  "data-dialog-initial-focus": true,
                  type: "button",
                  onClick: onClose,
                  className: "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
                  "aria-label": "Close",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, { className: "h-5 w-5" })
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto space-y-4 px-5 py-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${verdictStyle.colorClass}`, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: verdictStyle.icon }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: verdictLabel })
              ] }),
              reasonCodes.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500", children: getTranslation("verdict_explainer_reasons_label", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1.5", children: reasonCodes.map((code) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "span",
                  {
                    className: "rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200",
                    title: getTranslation(`verdict_reason_${code}`, language),
                    children: getTranslation(`verdict_reason_${code}`, language)
                  },
                  code
                )) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-blue-100 bg-blue-50/50 p-4", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm", children: "🤖" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wider text-blue-600", children: getTranslation("verdict_explainer_ai_label", language) })
                ] }),
                isLoading && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm text-slate-500", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: "h-4 w-4 animate-spin text-blue-500", xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation("verdict_explainer_loading", language) })
                ] }),
                error && !isLoading && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-red-600", children: error }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: fetchAiExplanation,
                      className: "text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline",
                      children: getTranslation("verdict_explainer_retry", language)
                    }
                  )
                ] }),
                aiExplanation && !isLoading && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm leading-relaxed text-slate-700", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SimpleMarkdown, { text: aiExplanation }) })
              ] }),
              detail && /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "group", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-600", children: getTranslation("verdict_explainer_technical_detail", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500", children: detail })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shrink-0 border-t border-slate-200 px-5 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: onClose,
                className: "w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200",
                children: getTranslation("verdict_explainer_close", language)
              }
            ) })
          ]
        }
      )
    }
  );
};
const stripMarkdown = (text) => text.replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim();
const CompactCardSummary = ({
  displayedTotalValue,
  displayedRowCount,
  totalRowCount,
  summaryText,
  aggregation,
  valueColumn,
  onExpand
}) => {
  const showMetric = aggregation && (aggregation === "sum" || aggregation === "count" || aggregation === "average");
  const metricLabel = showMetric ? `${aggregation === "count" ? "COUNT" : aggregation === "average" ? "AVG" : "SUM"}${valueColumn ? ` ${valueColumn}` : ""}` : null;
  const truncatedSummary = summaryText ? (() => {
    const clean = stripMarkdown(summaryText);
    return clean.length > 80 ? clean.slice(0, 80) + "…" : clean;
  })() : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      onClick: onExpand,
      role: "button",
      tabIndex: 0,
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExpand();
        }
      },
      className: "flex cursor-pointer items-center gap-3 rounded-md border-t border-slate-100 px-1 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-50",
      children: [
        showMetric && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 font-semibold text-slate-700", title: metricLabel ?? void 0, children: formatAnalysisValue(displayedTotalValue) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-200", children: "|" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "shrink-0 text-xs", children: [
          displayedRowCount,
          " / ",
          totalRowCount,
          " rows"
        ] }),
        truncatedSummary && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-200", children: "|" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "min-w-0 truncate text-xs text-slate-400", children: truncatedSummary })
        ] })
      ]
    }
  );
};
const AnalysisCard = We.memo(({ cardId, isSpotlighted = false, expandOverrideKey, expandOverrideValue, showExplorationControls = true }) => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const {
    handleChartTypeChange,
    handleTopNChange,
    handleHideOthersChange,
    handleHideZeroValueRowsChange,
    handlePivotColumnTopNChange,
    handlePivotHideOtherColumnsChange,
    handleTogglePivotSeriesLabel,
    handleResetPivotSeriesLabels,
    handleToggleLegendLabel,
    handleToggleDataLabels,
    handleTableSortChange,
    deleteAnalysisCard,
    updateCardVisualEvaluation,
    language,
    settings,
    dataPreparationPlan,
    canonicalCsvData,
    csvData
  } = useAppStore((state) => ({
    handleChartTypeChange: state.handleChartTypeChange,
    handleTopNChange: state.handleTopNChange,
    handleHideOthersChange: state.handleHideOthersChange,
    handleHideZeroValueRowsChange: state.handleHideZeroValueRowsChange,
    handlePivotColumnTopNChange: state.handlePivotColumnTopNChange,
    handlePivotHideOtherColumnsChange: state.handlePivotHideOtherColumnsChange,
    handleTogglePivotSeriesLabel: state.handleTogglePivotSeriesLabel,
    handleResetPivotSeriesLabels: state.handleResetPivotSeriesLabels,
    handleToggleLegendLabel: state.handleToggleLegendLabel,
    handleToggleDataLabels: state.handleToggleDataLabels,
    handleTableSortChange: state.handleTableSortChange,
    deleteAnalysisCard: state.deleteAnalysisCard,
    updateCardVisualEvaluation: state.updateCardVisualEvaluation,
    language: state.settings.language,
    settings: state.settings,
    dataPreparationPlan: state.dataPreparationPlan,
    canonicalCsvData: state.canonicalCsvData,
    csvData: state.csvData
  }), shallow$1);
  const {
    cardData,
    tableDataForDisplay,
    chartDataForDisplay,
    stackedChartColumnState,
    dataForLegend,
    totalValue,
    displayedTotalValue,
    totalRowCount,
    displayedRowCount,
    chartHiddenZeroValueRowCount,
    tableZeroValueRowCount,
    summary,
    valueKey,
    groupByKey,
    tableSort
  } = useAnalysisCardData(cardId);
  const cardRef = reactExports.useRef(null);
  const chartRendererRef = reactExports.useRef(null);
  const [isExporting, setIsExporting] = reactExports.useState(false);
  const [selectedIndices, setSelectedIndices] = reactExports.useState([]);
  const [isZoomed, setIsZoomed] = reactExports.useState(false);
  const [isCardExpanded, setIsCardExpanded] = reactExports.useState(!!isSpotlighted);
  const [isProvenanceOpen, setIsProvenanceOpen] = reactExports.useState(false);
  const [isVerdictExplainerOpen, setIsVerdictExplainerOpen] = reactExports.useState(false);
  const [isChartVisible, setIsChartVisible] = reactExports.useState(true);
  const [localDataVisible, setLocalDataVisible] = reactExports.useState(false);
  const onToggleDataVisibility = reactExports.useCallback(() => setLocalDataVisible((prev) => !prev), []);
  const onChartTypeSelect = reactExports.useCallback((type) => handleChartTypeChange(cardId, type), [handleChartTypeChange, cardId]);
  const onTopNChange = reactExports.useCallback((e) => {
    const value = e.target.value === "all" ? null : parseInt(e.target.value, 10);
    handleTopNChange(cardId, value);
  }, [handleTopNChange, cardId]);
  const onHideOthersChange = reactExports.useCallback((e) => handleHideOthersChange(cardId, e.target.checked), [handleHideOthersChange, cardId]);
  const onHideZeroValueRowsChange = reactExports.useCallback((e) => handleHideZeroValueRowsChange(cardId, e.target.checked), [handleHideZeroValueRowsChange, cardId]);
  const onPivotColumnTopNChange = reactExports.useCallback((e) => handlePivotColumnTopNChange(cardId, e.target.value === "all" ? null : parseInt(e.target.value, 10)), [handlePivotColumnTopNChange, cardId]);
  const onPivotHideOtherColumnsChange = reactExports.useCallback((e) => handlePivotHideOtherColumnsChange(cardId, e.target.checked), [handlePivotHideOtherColumnsChange, cardId]);
  const onToggleDataLabels = reactExports.useCallback(() => handleToggleDataLabels(cardId), [handleToggleDataLabels, cardId]);
  const onTableSortChange = reactExports.useCallback((sort) => handleTableSortChange(cardId, sort), [handleTableSortChange, cardId]);
  const onToggleExpand = reactExports.useCallback(() => setIsCardExpanded((prev) => !prev), []);
  const onToggleProvenance = reactExports.useCallback(() => setIsProvenanceOpen((prev) => !prev), []);
  const onVerdictClick = reactExports.useCallback(() => setIsVerdictExplainerOpen(true), []);
  const onHeaderChartTypeChange = reactExports.useCallback((newType) => handleChartTypeChange(cardId, newType), [handleChartTypeChange, cardId]);
  const onDelete = reactExports.useCallback(() => deleteAnalysisCard(cardId), [deleteAnalysisCard, cardId]);
  const currentDatasetVersion = getCurrentAnalysisDatasetVersion({ canonicalCsvData, csvData });
  const trustDecision = reactExports.useMemo(
    () => resolveCardTrustDecision(cardData, currentDatasetVersion),
    [cardData, currentDatasetVersion]
  );
  const exportMetadata = reactExports.useMemo(() => {
    var _a2, _b2, _c2, _d2;
    const scopeParts = [];
    if (cardData == null ? void 0 : cardData.topN) {
      scopeParts.push(`Top ${cardData.topN}`);
    }
    if (((_a2 = cardData == null ? void 0 : cardData.filter) == null ? void 0 : _a2.column) && cardData.filter.values.length > 0) {
      scopeParts.push(`${cardData.filter.column} = ${cardData.filter.values.join(", ")}`);
    }
    if (cardData == null ? void 0 : cardData.hideOthers) {
      scopeParts.push("Others hidden");
    }
    if ((((_b2 = cardData == null ? void 0 : cardData.hiddenLabels) == null ? void 0 : _b2.length) ?? 0) > 0 || (((_c2 = cardData == null ? void 0 : cardData.hiddenPivotSeriesLabels) == null ? void 0 : _c2.length) ?? 0) > 0 || (cardData == null ? void 0 : cardData.pivotHideOtherColumns)) {
      scopeParts.push("Visible series only");
    }
    return {
      cardId,
      scope: scopeParts.join(" · ") || "Full card aggregation",
      trustStatus: trustDecision.status,
      datasetVersion: currentDatasetVersion ?? ((_d2 = cardData == null ? void 0 : cardData.provenance) == null ? void 0 : _d2.datasetVersion) ?? "unverified"
    };
  }, [cardData, cardId, currentDatasetVersion, trustDecision.status]);
  reactExports.useEffect(() => {
    if (expandOverrideKey !== void 0 && expandOverrideKey > 0) {
      setIsCardExpanded(expandOverrideValue ?? false);
    }
  }, [expandOverrideKey, expandOverrideValue]);
  const setGlobalErrorToast = useAppStore((state) => state.setGlobalErrorToast);
  const handleExport = reactExports.useCallback(async (format) => {
    var _a2;
    if (!cardRef.current) return;
    setIsExporting(true);
    try {
      let result;
      const title = ((_a2 = cardData == null ? void 0 : cardData.plan) == null ? void 0 : _a2.title) ?? "";
      switch (format) {
        case "png":
          result = await exportToPng(cardRef.current, title, { metadata: exportMetadata });
          break;
        case "png_full":
          result = await exportToPng(cardRef.current, title, { includeTable: true, metadata: exportMetadata });
          break;
        case "csv":
          result = exportToCsv(tableDataForDisplay, title, exportMetadata);
          break;
        case "html":
          result = await exportToHtml(
            cardRef.current,
            title,
            tableDataForDisplay,
            getLocalizedText(cardData == null ? void 0 : cardData.summary, language),
            exportMetadata
          );
          break;
      }
      if (result && !result.success) {
        setGlobalErrorToast({
          message: getTranslation("export_format_failed", language, { format: format.toUpperCase() }),
          errorSummary: result.error
        });
      }
    } finally {
      setIsExporting(false);
    }
  }, [(_a = cardData == null ? void 0 : cardData.plan) == null ? void 0 : _a.title, cardData == null ? void 0 : cardData.summary, exportMetadata, tableDataForDisplay, language, setGlobalErrorToast]);
  const handleChartClick = reactExports.useCallback((index, event) => {
    const isMultiSelect = event.ctrlKey || event.metaKey;
    setSelectedIndices((prev) => {
      if (isMultiSelect) {
        return prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b);
      }
      return prev.includes(index) ? [] : [index];
    });
  }, []);
  const onZoomChange = reactExports.useCallback((v) => setIsZoomed(v), []);
  const onClearSelection = reactExports.useCallback(() => setSelectedIndices([]), []);
  const onResetZoom = reactExports.useCallback(() => {
    var _a2;
    return (_a2 = chartRendererRef.current) == null ? void 0 : _a2.resetZoom();
  }, []);
  const onSeriesToggle = reactExports.useCallback((label) => handleTogglePivotSeriesLabel(cardId, label), [handleTogglePivotSeriesLabel, cardId]);
  const onResetHiddenSeries = reactExports.useCallback(() => handleResetPivotSeriesLabels(cardId), [handleResetPivotSeriesLabels, cardId]);
  const onLabelClick = reactExports.useCallback((label) => handleToggleLegendLabel(cardId, label), [handleToggleLegendLabel, cardId]);
  reactExports.useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setIsChartVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsChartVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  reactExports.useEffect(() => {
    if (!settings.enableVisualEvaluation) return;
    if (!isChartVisible || (cardData == null ? void 0 : cardData.visuallyEvaluated)) return;
    const timer = setTimeout(async () => {
      var _a2;
      const image = (_a2 = chartRendererRef.current) == null ? void 0 : _a2.captureImage();
      if (!image || !cardData) return;
      try {
        const currentSettings = useAppStore.getState().settings;
        const result = await evaluateChartPresentation(
          image,
          cardData.plan,
          cardData.displayChartType,
          cardData.aggregatedData.length,
          currentSettings
        );
        if (result) {
          const shouldCorrect = result.quality === "poor" && result.suggestedChartType;
          updateCardVisualEvaluation(
            cardId,
            result,
            shouldCorrect ? result.suggestedChartType : void 0
          );
        }
      } catch {
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [isChartVisible, cardId, cardData == null ? void 0 : cardData.visuallyEvaluated, settings.enableVisualEvaluation]);
  const storeDataVisible = (cardData == null ? void 0 : cardData.isDataVisible) ?? false;
  reactExports.useEffect(() => {
    setLocalDataVisible(storeDataVisible);
  }, [storeDataVisible]);
  const isDataVisible = localDataVisible;
  if (!cardData) return null;
  const {
    id,
    plan,
    aggregatedData,
    displayChartType,
    isDataVisible: _storeDataVisible,
    // shadowed by local state above
    topN,
    hideOthers,
    hideZeroValueRows = false,
    pivotColumnTopN = 8,
    pivotHideOtherColumns = false,
    hiddenPivotSeriesLabels = [],
    disableAnimation,
    showDataLabels,
    filter
  } = cardData;
  const verdictExplanationCache = reactExports.useRef(null);
  const tableFirstArtifact = Boolean(
    ((_b = plan.artifactMetadata) == null ? void 0 : _b.dataTableFirst) || ["pivot_matrix", "cohort_retention", "period_compare", "root_cause_breakdown"].includes(plan.artifactType ?? "")
  );
  const hideChartByDefault = Boolean((_c = plan.artifactMetadata) == null ? void 0 : _c.hideChartByDefault);
  const availableChartTypes = reactExports.useMemo(() => getAvailableChartTypes(plan, chartDataForDisplay), [chartDataForDisplay, plan]);
  const renderChartType = availableChartTypes.includes(displayChartType) ? displayChartType : availableChartTypes[0];
  const showPivotColumnControls = Boolean(
    plan.artifactType === "pivot_matrix" && (renderChartType === "stacked_bar" || renderChartType === "stacked_column") && ((stackedChartColumnState == null ? void 0 : stackedChartColumnState.effectiveMatrixValueColumns.length) ?? 0) > 1
  );
  const isTemporalSeriesChart = Boolean(
    groupByKey && isTimeLikeDimensionColumn(groupByKey) && ["line", "area", "multi_line"].includes(renderChartType)
  );
  const showRowLegend = Boolean(
    groupByKey && !isTemporalSeriesChart && !hideChartByDefault && !((_d = plan.artifactMetadata) == null ? void 0 : _d.tableOnlyPresentation) && !(plan.artifactType === "pivot_matrix" && showPivotColumnControls)
  );
  const chartPlanForDisplay = reactExports.useMemo(
    () => {
      const basePlan = showPivotColumnControls && stackedChartColumnState ? buildStackedPivotChartPlan(plan, stackedChartColumnState) : plan;
      if (valueKey && valueKey !== basePlan.valueColumn) {
        return { ...basePlan, valueColumn: valueKey };
      }
      return basePlan;
    },
    [plan, showPivotColumnControls, stackedChartColumnState, valueKey]
  );
  const chartRowsForDisplay = showPivotColumnControls && stackedChartColumnState ? stackedChartColumnState.chartRows : chartDataForDisplay;
  const chartPresentation = reactExports.useMemo(
    () => renderChartType === "bar" || renderChartType === "stacked_bar" || renderChartType === "stacked_column" ? getBarChartReadabilityHints(chartRowsForDisplay, groupByKey) : { useHorizontalLayout: false, suggestedHeight: 256, categoryTickLimit: 24 },
    [chartRowsForDisplay, groupByKey, renderChartType]
  );
  const pivotQualitySummary = reactExports.useMemo(
    () => {
      var _a2, _b2, _c2, _d2, _e2, _f2, _g2;
      if (plan.artifactType !== "pivot_matrix") {
        return null;
      }
      const qualitySummary = getPivotCardQualitySummary(aggregatedData, groupByKey, valueKey, displayedRowCount);
      if (!qualitySummary) {
        return null;
      }
      return {
        ...qualitySummary,
        hiddenZeroRowCount: chartHiddenZeroValueRowCount,
        labelNormalizationAppliedColumns: ((_a2 = dataPreparationPlan == null ? void 0 : dataPreparationPlan.labelNormalization) == null ? void 0 : _a2.appliedColumns.length) ?? 0,
        labelNormalizationAppliedClusters: ((_b2 = dataPreparationPlan == null ? void 0 : dataPreparationPlan.labelNormalization) == null ? void 0 : _b2.appliedClusters.length) ?? 0,
        labelNormalizationAppliedReplacements: ((_c2 = dataPreparationPlan == null ? void 0 : dataPreparationPlan.labelNormalization) == null ? void 0 : _c2.appliedReplacementCount) ?? 0,
        labelNormalizationDeferredSuggestions: ((_d2 = dataPreparationPlan == null ? void 0 : dataPreparationPlan.labelNormalization) == null ? void 0 : _d2.deferredSuggestions.length) ?? 0,
        recommendedTotalOnlyDueToWideColumns: ((_e2 = plan.artifactMetadata) == null ? void 0 : _e2.recommendedTotalOnlyDueToWideColumns) ?? false,
        defaultCompressedStackedView: ((_f2 = plan.artifactMetadata) == null ? void 0 : _f2.defaultCompressedStackedView) ?? false,
        effectiveMatrixValueColumnCount: ((_g2 = plan.artifactMetadata) == null ? void 0 : _g2.effectiveMatrixValueColumnCount) ?? 0,
        visibleMatrixValueColumnCount: (stackedChartColumnState == null ? void 0 : stackedChartColumnState.visibleMatrixValueColumns.length) ?? 0,
        foldedMatrixValueColumnCount: (stackedChartColumnState == null ? void 0 : stackedChartColumnState.foldedMatrixValueColumns.length) ?? 0,
        isStackedChartActive: renderChartType === "stacked_bar" || renderChartType === "stacked_column"
      };
    },
    [aggregatedData, chartHiddenZeroValueRowCount, dataPreparationPlan == null ? void 0 : dataPreparationPlan.labelNormalization, displayedRowCount, groupByKey, (_e = plan.artifactMetadata) == null ? void 0 : _e.defaultCompressedStackedView, (_f = plan.artifactMetadata) == null ? void 0 : _f.effectiveMatrixValueColumnCount, (_g = plan.artifactMetadata) == null ? void 0 : _g.recommendedTotalOnlyDueToWideColumns, plan.artifactType, renderChartType, stackedChartColumnState, valueKey]
  );
  const displayGroupLabel = reactExports.useMemo(() => resolvePlanGroupLabel(plan), [plan]);
  const displayMetricLabel = reactExports.useMemo(() => resolvePlanMetricLabel(plan) ?? plan.valueColumn ?? "Value", [plan]);
  reactExports.useEffect(() => {
    if (!plan) return;
    if (!availableChartTypes.includes(displayChartType) && availableChartTypes[0]) {
      handleChartTypeChange(id, availableChartTypes[0]);
    }
  }, [availableChartTypes, displayChartType, handleChartTypeChange, id, plan]);
  const controls = /* @__PURE__ */ jsxRuntimeExports.jsx(
    AnalysisCardControls,
    {
      cardId: id,
      isDataVisible,
      plan,
      aggregatedData,
      availableChartTypes,
      displayChartType: renderChartType,
      topN,
      hideOthers,
      hideZeroValueRows,
      zeroValueRowCount: tableZeroValueRowCount,
      pivotColumnTopN,
      pivotHideOtherColumns,
      pivotFoldedColumnCount: (stackedChartColumnState == null ? void 0 : stackedChartColumnState.foldedMatrixValueColumns.length) ?? 0,
      showPivotColumnControls,
      onToggleDataVisibility,
      onChartTypeSelect,
      onTopNChange,
      onHideOthersChange,
      onHideZeroValueRowsChange,
      onPivotColumnTopNChange,
      onPivotHideOtherColumnsChange,
      showDataLabels,
      onToggleDataLabels
    }
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: cardRef,
      id,
      "data-testid": "analysis-card",
      className: `group flex flex-col gap-3 rounded-card border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-xl ${isSpotlighted ? "card-spotlight" : ""}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          AnalysisCardHeader,
          {
            cardId: id,
            plan,
            displayChartType: renderChartType,
            availableChartTypes,
            isExporting,
            trustStatus: trustDecision.status,
            isCardExpanded,
            language,
            onToggleExpand,
            onToggleProvenance,
            onVerdictClick,
            onChartTypeChange: onHeaderChartTypeChange,
            onExport: handleExport,
            onDelete,
            showActions: showExplorationControls
          }
        ),
        !isCardExpanded && /* @__PURE__ */ jsxRuntimeExports.jsx(
          CompactCardSummary,
          {
            displayedTotalValue,
            displayedRowCount,
            totalRowCount,
            summaryText: (summary == null ? void 0 : summary.text) ?? null,
            aggregation: plan.aggregation,
            valueColumn: plan.valueColumn,
            onExpand: onToggleExpand,
            language
          }
        ),
        isCardExpanded && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 flex-grow", children: [
            !hideChartByDefault && isChartVisible && /* @__PURE__ */ jsxRuntimeExports.jsx(
              AnalysisCardChart,
              {
                cardId,
                language,
                chartRendererRef,
                displayChartType: renderChartType,
                dataForDisplay: chartRowsForDisplay,
                plan: chartPlanForDisplay,
                selectedIndices,
                isZoomed,
                chartHeight: chartPresentation.suggestedHeight,
                disableAnimation,
                showDataLabels,
                onElementClick: handleChartClick,
                onZoomChange,
                onClearSelection,
                onResetZoom
              }
            ),
            !hideChartByDefault && !isChartVisible && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: "rounded-card border border-slate-200 bg-slate-50/30",
                style: { height: `${chartPresentation.suggestedHeight}px` }
              }
            ),
            hideChartByDefault && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-card border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-700", children: getTranslation("card_table_first_hint", language) }),
            showPivotColumnControls && /* @__PURE__ */ jsxRuntimeExports.jsx(
              PivotStackedLegend,
              {
                data: chartRowsForDisplay,
                plan: chartPlanForDisplay,
                hiddenSeriesLabels: hiddenPivotSeriesLabels,
                onSeriesToggle,
                onResetHiddenSeries
              }
            ),
            showRowLegend && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              InteractiveLegend,
              {
                data: dataForLegend,
                total: totalValue,
                groupByKey,
                valueKey,
                hiddenLabels: cardData.hiddenLabels || [],
                onLabelClick
              }
            ) })
          ] }),
          filter && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md border border-yellow-200 bg-yellow-100 p-3 text-xs text-yellow-800", "data-export-exclude": true, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("b", { children: getTranslation("card_filter_active", language) }),
            " ",
            getTranslation("card_filter_description", language, {
              column: filter.column,
              values: filter.values.join(", ")
            })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            AnalysisCardSummary,
            {
              cardId,
              plan,
              totalValue: displayedTotalValue,
              overallTotalValue: totalValue,
              displayedRowCount,
              totalRowCount,
              displayedMetricLabel: displayMetricLabel,
              displayedGroupLabel: displayGroupLabel,
              topN,
              hideOthers,
              hiddenLabelCount: ((_h = cardData.hiddenLabels) == null ? void 0 : _h.length) ?? 0,
              filter,
              language,
              summary,
              visualSummary: cardData.visualSummary,
              visuallyGrounded: cardData.visuallyGrounded,
              pivotQualitySummary
            }
          ),
          showExplorationControls && isDataVisible && /* @__PURE__ */ jsxRuntimeExports.jsx("hr", { className: "border-t border-slate-100", "aria-hidden": "true", "data-export-table": true }),
          showExplorationControls && (tableFirstArtifact ? isDataVisible ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50/70 p-3", "data-export-table": true, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-2 text-sm font-semibold text-slate-800", children: getTranslation(
              plan.artifactType === "pivot_matrix" ? "card_pivot_summary_table" : "card_analysis_table",
              language
            ) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              AnalysisCardDataTables,
              {
                isDataVisible: true,
                dataForDisplay: tableDataForDisplay,
                selectedIndices,
                plan,
                maxHeightClass: "max-h-[28rem]",
                sort: tableSort,
                onSortChange: onTableSortChange
              }
            )
          ] }) : null : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-export-table": true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            AnalysisCardDataTables,
            {
              isDataVisible,
              dataForDisplay: tableDataForDisplay,
              selectedIndices,
              plan,
              sort: tableSort,
              onSortChange: onTableSortChange
            }
          ) })),
          showExplorationControls && controls
        ] }),
        isProvenanceOpen && reactDomExports.createPortal(
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            DataProvenanceModal,
            {
              plan,
              aggregatedData,
              provenance: cardData.provenance,
              currentDatasetVersion,
              restoreFocusSelector: `[data-card-more-trigger="${id.replace(/["\\]/g, "\\$&")}"]`,
              onClose: () => setIsProvenanceOpen(false)
            }
          ),
          document.body
        ),
        isVerdictExplainerOpen && reactDomExports.createPortal(
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            VerdictExplainerModal,
            {
              verdict: trustDecision.status,
              reasonCodes: trustDecision.reasonCodes,
              detail: [
                trustDecision.detail,
                (_i = cardData.autoAnalysisEvaluation) == null ? void 0 : _i.detail,
                ...((_j = cardData.provenance) == null ? void 0 : _j.evidenceReasons) ?? []
              ].filter(Boolean).join(" | "),
              cardTitle: plan.title ?? "Untitled",
              language,
              settings,
              cachedExplanation: verdictExplanationCache.current,
              onExplanationReady: (cache) => {
                verdictExplanationCache.current = cache;
              },
              onClose: () => setIsVerdictExplainerOpen(false)
            }
          ),
          document.body
        )
      ]
    }
  );
});
const SkeletonCard = () => {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-white rounded-card shadow-lg p-4 w-full mx-auto border border-slate-200", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "animate-pulse flex flex-col space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between items-start", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 flex-1 pr-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-4 bg-slate-200 rounded w-3/4" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-3 bg-slate-200 rounded w-full" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-8 w-24 bg-slate-200 rounded-md" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-48 bg-slate-200 rounded-md" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2 pt-4 border-t border-slate-200", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 bg-slate-50 p-3 rounded-md", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-3 bg-slate-200 rounded w-1/4" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-3 bg-slate-200 rounded" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-3 bg-slate-200 rounded w-5/6" })
    ] }) })
  ] }) });
};
const AnalysisCardGrid = reactExports.memo(({
  cardIds,
  skeletonCount,
  columnCount,
  spotlightCardId,
  expandOverrideKey,
  expandOverrideValue,
  showExplorationControls
}) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  Masonry,
  {
    breakpointCols: columnCount,
    className: "my-masonry-grid",
    columnClassName: "my-masonry-grid_column",
    children: [
      cardIds.map((cardId, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          "data-card-id": cardId,
          className: "mb-6 animate-fade-in",
          style: { animationDelay: `${Math.min(index, 5) * 50}ms` },
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(ErrorBoundary, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            AnalysisCard,
            {
              cardId,
              isSpotlighted: cardId === spotlightCardId,
              expandOverrideKey,
              expandOverrideValue,
              showExplorationControls
            }
          ) })
        },
        cardId
      )),
      Array.from({ length: skeletonCount }).map((_, index) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonCard, {}) }, `skeleton-${index}`))
    ]
  }
));
AnalysisCardGrid.displayName = "AnalysisCardGrid";
const AnalysisStatusSection = reactExports.memo(() => {
  const { aiTaskStatus, hasCards, hasFinalSummary, activeResearchRun, requestActiveResearchCancellation } = useAppStore(
    (state) => ({
      aiTaskStatus: state.aiTaskStatus,
      hasCards: state.analysisCards.length > 0,
      hasFinalSummary: !!state.finalSummary,
      activeResearchRun: state.activeAnalysisSession,
      requestActiveResearchCancellation: state.requestActiveResearchCancellation
    }),
    shallow$1
  );
  if (!aiTaskStatus) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      AiTaskStatusBubble,
      {
        task: aiTaskStatus,
        variant: !hasCards && !hasFinalSummary ? "default" : "compact"
      }
    ),
    (activeResearchRun == null ? void 0 : activeResearchRun.status) === "running" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: () => requestActiveResearchCancellation(),
        disabled: Boolean(activeResearchRun.cancellationRequestedAt),
        className: "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60",
        children: activeResearchRun.cancellationRequestedAt ? "Stopping research…" : "Stop research"
      }
    ) })
  ] });
});
AnalysisStatusSection.displayName = "AnalysisStatusSection";
const statusStyle = {
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  degraded: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-slate-200 text-slate-700",
  queued: "bg-slate-100 text-slate-600"
};
const ResearchRunSummary = ({ session }) => {
  const language = useAppStore((state) => state.settings.language);
  const brief = session.researchBrief;
  if (!brief) return null;
  const findings = session.researchFindings ?? [];
  const supported = findings.filter((finding) => finding.status === "supported").length;
  const hypotheses = findings.filter((finding) => finding.status === "hypothesis").length;
  const rejected = findings.filter((finding) => finding.status === "rejected").length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      "aria-label": getTranslation("research_run", language),
      className: "rounded-card border border-slate-200 bg-white p-4 shadow-sm",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500", children: getTranslation("research_run", language) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mt-1 text-sm font-semibold text-slate-900", children: brief.goal }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-slate-500", children: getTranslation(
              brief.questions.length === 1 ? "research_prioritized_question" : "research_prioritized_questions",
              language,
              {
                count: brief.questions.length
              }
            ) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[session.status] ?? statusStyle.queued}`, children: getTranslation(`research_status_${session.status}`, language) })
        ] }),
        brief.clarification && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold", children: getTranslation("research_clarification_needed", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1", children: brief.clarification.question }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-amber-700", children: brief.clarification.reason })
        ] }),
        brief.questions.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ol", { className: "mt-3 space-y-1.5 text-xs text-slate-700", children: brief.questions.slice(0, 4).map((question) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-400", children: question.priority }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1", children: normalizeDisplayLabel(question.question, question.question) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 text-slate-500", children: getTranslation(`research_finding_${question.status}`, language) })
        ] }, question.id)) }),
        (findings.length > 0 || session.status !== "running") && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-xs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-green-50 px-2 py-1 text-green-700", children: getTranslation("research_supported_count", language, { count: supported }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-amber-50 px-2 py-1 text-amber-800", children: getTranslation("research_hypotheses_count", language, { count: hypotheses }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-slate-100 px-2 py-1 text-slate-600", children: getTranslation("research_rejected_count", language, { count: rejected }) })
        ] }),
        (brief.datasetVersionId || session.stopReason) && /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mt-3 rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer font-semibold text-slate-800", children: getTranslation("research_technical_details", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "mt-3 space-y-2", children: [
            brief.datasetVersionId && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold", children: getTranslation("research_dataset_version", language) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all", children: brief.datasetVersionId })
            ] }),
            session.stopReason && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold", children: getTranslation("research_stop_reason", language) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all", children: session.stopReason })
            ] })
          ] })
        ] })
      ]
    }
  );
};
const toneCardClasses = {
  primary: "border-blue-100 bg-gradient-to-br from-blue-50/60 via-white to-white",
  neutral: "border-slate-200 bg-white",
  accent: "border-teal-100 bg-gradient-to-br from-teal-50/50 via-white to-white",
  warning: "border-amber-100 bg-gradient-to-br from-amber-50/50 via-white to-white"
};
const toneAccentClasses = {
  primary: "bg-blue-500",
  neutral: "bg-slate-400",
  accent: "bg-teal-500",
  warning: "bg-amber-500"
};
const toneIconBg = {
  primary: "bg-blue-100 text-blue-600",
  neutral: "bg-slate-100 text-slate-500",
  accent: "bg-teal-100 text-teal-600",
  warning: "bg-amber-100 text-amber-600"
};
const hierarchyClasses = {
  primary: "p-5",
  secondary: "p-5",
  insight: "p-5"
};
const valueClasses = {
  primary: "text-3xl md:text-4xl",
  secondary: "text-2xl md:text-3xl",
  insight: "text-2xl md:text-3xl"
};
const deltaClasses = {
  up: "border-emerald-200 bg-emerald-50 text-emerald-700",
  down: "border-rose-200 bg-rose-50 text-rose-700",
  flat: "border-slate-200 bg-slate-100 text-slate-700"
};
const ToneIcon = ({ tone }) => {
  const paths = {
    primary: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 1.5,
        d: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      }
    ),
    neutral: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 1.5,
        d: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
      }
    ),
    accent: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 1.5,
        d: "M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
      }
    ),
    warning: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 1.5,
        d: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      }
    )
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      className: "h-4 w-4",
      "aria-hidden": "true",
      children: paths[tone]
    }
  );
};
const renderDelta = (kpi) => {
  if (!kpi.delta) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${deltaClasses[kpi.delta.direction]}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: kpi.delta.value }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-normal", children: kpi.delta.label })
  ] });
};
const ExecutiveKpiRowComponent = ({ title, subtitle, kpis, actionLabel, onKpiAction }) => {
  if (kpis.length === 0) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm", "aria-label": title, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500", children: title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-500", children: subtitle })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4", children: kpis.map((kpi) => {
      var _a;
      const isActionable = ((_a = kpi.action) == null ? void 0 : _a.type) === "show-card" && Boolean(kpi.sourceCardId) && Boolean(onKpiAction);
      const cardClasses = [
        "group relative flex h-full w-full flex-col overflow-hidden rounded-xl border text-left transition-all duration-150",
        toneCardClasses[kpi.tone],
        hierarchyClasses[kpi.hierarchy],
        isActionable ? "cursor-pointer hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" : "shadow-sm"
      ].join(" ");
      const content = /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `absolute inset-x-0 top-0 h-[3px] ${toneAccentClasses[kpi.tone]}`, "aria-hidden": "true" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center justify-center rounded-md p-1 ${toneIconBg[kpi.tone]}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(ToneIcon, { tone: kpi.tone }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.15em] text-slate-500", children: kpi.label })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-[11px] font-medium text-slate-600", children: [
          kpi.scope.label,
          kpi.scope.filterSummary ? ` · ${kpi.scope.filterSummary}` : ""
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `mt-3 break-words font-semibold leading-tight text-slate-900 ${valueClasses[kpi.hierarchy]}`, children: kpi.value }),
        renderDelta(kpi),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm leading-relaxed text-slate-500", children: kpi.detail }),
        isActionable && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "mt-auto flex items-center gap-1 pt-3 text-xs font-semibold text-blue-600 transition-colors group-hover:text-blue-800", children: [
          actionLabel,
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "svg",
            {
              xmlns: "http://www.w3.org/2000/svg",
              viewBox: "0 0 16 16",
              fill: "currentColor",
              className: "h-3 w-3 transition-transform group-hover:translate-x-0.5",
              "aria-hidden": "true",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                "path",
                {
                  fillRule: "evenodd",
                  d: "M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z",
                  clipRule: "evenodd"
                }
              )
            }
          )
        ] })
      ] });
      if (isActionable) {
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: cardClasses,
            onClick: () => onKpiAction == null ? void 0 : onKpiAction(kpi),
            children: content
          },
          kpi.id
        );
      }
      return /* @__PURE__ */ jsxRuntimeExports.jsx("article", { className: cardClasses, children: content }, kpi.id);
    }) })
  ] });
};
const ExecutiveKpiRow = We.memo(ExecutiveKpiRowComponent);
const DocumentIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 1.5,
    stroke: "currentColor",
    className: "h-4 w-4",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      }
    )
  }
);
const SparkleIcon$1 = () => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 1.5,
    stroke: "currentColor",
    className: "h-4 w-4",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
      }
    )
  }
);
const ExternalLinkIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 1.5,
    stroke: "currentColor",
    className: "h-3.5 w-3.5",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      }
    )
  }
);
const DownloadIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 1.5,
    stroke: "currentColor",
    className: "h-3.5 w-3.5",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
      }
    )
  }
);
const LoadingSpinner = () => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  "svg",
  {
    className: "h-4 w-4 animate-spin",
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "path",
        {
          className: "opacity-75",
          fill: "currentColor",
          d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        }
      )
    ]
  }
);
const CheckIcon$1 = () => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 2,
    stroke: "currentColor",
    className: "h-3.5 w-3.5",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M4.5 12.75l6 6 9-13.5" })
  }
);
const ShieldBlockIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 1.5,
    stroke: "currentColor",
    className: "h-4 w-4 shrink-0",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z"
      }
    )
  }
);
const BriefIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 1.5,
    stroke: "currentColor",
    className: "h-4 w-4",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
      }
    )
  }
);
const ManagementIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 1.5,
    stroke: "currentColor",
    className: "h-4 w-4",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      }
    )
  }
);
const AuditIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 1.5,
    stroke: "currentColor",
    className: "h-4 w-4",
    "aria-hidden": "true",
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
      }
    )
  }
);
const REPORT_STEPS = [
  "report_step_collecting",
  "report_step_structuring",
  "report_step_rendering"
];
const StepDotComplete = () => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white", children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 16 16", fill: "currentColor", className: "h-3.5 w-3.5", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z", clipRule: "evenodd" }) }) });
const StepDotActive = () => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-violet-500 bg-white", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-2.5 w-2.5 animate-pulse rounded-full bg-violet-500" }) });
const StepDotPending = () => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-2 w-2 rounded-full bg-slate-200" }) });
const GenerationStepIndicator = ({ progressLabel, language }) => {
  const pct = parseProgressPercent(progressLabel);
  const activeStep = pct < 40 ? 0 : pct < 75 ? 1 : 2;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4", role: "status", "aria-label": getTranslation("report_generation_progress", language), children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-0", children: REPORT_STEPS.map((key, idx) => {
    const done = idx < activeStep;
    const active = idx === activeStep;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(We.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex flex-col items-center gap-1.5 ${idx === 0 ? "flex-none" : "flex-1 items-center"}`, style: { minWidth: 0 }, children: [
        done ? /* @__PURE__ */ jsxRuntimeExports.jsx(StepDotComplete, {}) : active ? /* @__PURE__ */ jsxRuntimeExports.jsx(StepDotActive, {}) : /* @__PURE__ */ jsxRuntimeExports.jsx(StepDotPending, {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `whitespace-nowrap text-[11px] font-semibold ${done ? "text-violet-500" : active ? "text-violet-700" : "text-slate-400"}`, children: getTranslation(key, language) })
      ] }),
      idx < REPORT_STEPS.length - 1 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `mb-5 flex-1 border-t-2 ${idx < activeStep ? "border-violet-400" : "border-slate-200"}`, "aria-hidden": "true" })
    ] }, key);
  }) }) });
};
const TEMPLATE_OPTIONS = [
  { value: "executive_brief", key: "report_template_executive_brief", descKey: "report_template_executive_brief_desc", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(BriefIcon, {}) },
  { value: "management_review", key: "report_template_management_review", descKey: "report_template_management_review_desc", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ManagementIcon, {}) },
  { value: "audit_appendix", key: "report_template_audit_appendix", descKey: "report_template_audit_appendix_desc", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(AuditIcon, {}) }
];
const ReportDeliveryComponent = ({
  language,
  reportTemplate,
  onTemplateChange,
  onGenerate,
  onCancel,
  onOpen,
  onExportPdf,
  isGenerating,
  progressLabel,
  hasReport,
  blockedInfo,
  isPartial
}) => {
  const sectionLabel = getTranslation("report_delivery_label", language);
  const generateLabel = getTranslation("generate_analyst_report", language);
  const generateHint = getTranslation("generate_analyst_report_hint", language);
  const runningLabel = getTranslation("generate_analyst_report_running", language);
  const templateLabel = getTranslation("report_template_label", language);
  const actionsLabel = getTranslation("report_actions_label", language);
  const openLabel = getTranslation("report_open", language);
  const exportLabel = getTranslation("report_export_pdf", language);
  const cancelLabel = getTranslation("report_cancel", language);
  const blockedTitle = getTranslation("report_blocked_title", language);
  const isBlocked = Boolean(blockedInfo) && !hasReport && !isGenerating;
  const isButtonDisabled = isGenerating || isBlocked;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      className: "relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md",
      "aria-label": sectionLabel,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `absolute inset-x-0 top-0 h-[3px] ${isBlocked ? "bg-amber-500" : "bg-violet-500"}`, "aria-hidden": "true" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center justify-center rounded-lg p-1.5 ${isBlocked ? "bg-amber-100 text-amber-600" : "bg-violet-100 text-violet-600"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(DocumentIcon, {}) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.15em] text-slate-500", children: sectionLabel })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mt-3 text-xl font-semibold tracking-tight text-slate-900", children: generateLabel }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1.5 max-w-xl text-sm leading-relaxed text-slate-500", children: generateHint })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: onGenerate,
                disabled: isButtonDisabled,
                title: isGenerating ? runningLabel : isBlocked ? blockedTitle : generateLabel,
                className: [
                  "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition-all sm:w-auto sm:min-w-[180px] sm:whitespace-nowrap",
                  isGenerating ? "cursor-not-allowed border border-violet-200 bg-violet-50 text-violet-500" : isBlocked ? "cursor-not-allowed border border-amber-200 bg-amber-50 text-amber-500" : "border border-violet-600 bg-violet-600 text-white shadow-sm hover:bg-violet-700 hover:shadow-md active:bg-violet-800"
                ].join(" "),
                children: isGenerating ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(LoadingSpinner, {}),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                    runningLabel,
                    progressLabel ? ` (${progressLabel})` : ""
                  ] })
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SparkleIcon$1, {}),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: generateLabel })
                ] })
              }
            ) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: templateLabel }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 grid gap-2.5 sm:grid-cols-3", role: "radiogroup", "aria-label": templateLabel, children: TEMPLATE_OPTIONS.map((opt) => {
              const isActive = reportTemplate === opt.value;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  role: "radio",
                  "aria-checked": isActive,
                  onClick: () => onTemplateChange(opt.value),
                  className: [
                    "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                    isActive ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500" : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40"
                  ].join(" "),
                  children: [
                    isActive && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-white", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CheckIcon$1, {}) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `mt-0.5 shrink-0 rounded-md p-1.5 ${isActive ? "bg-violet-100 text-violet-600" : "bg-slate-100 text-slate-500"}`, "aria-hidden": "true", children: opt.icon }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1 pr-5", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-sm font-semibold ${isActive ? "text-violet-900" : "text-slate-800"}`, children: getTranslation(opt.key, language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `mt-0.5 text-xs leading-relaxed ${isActive ? "text-violet-700" : "text-slate-500"}`, children: getTranslation(opt.descKey, language) })
                    ] })
                  ]
                },
                opt.value
              );
            }) })
          ] }),
          isGenerating && progressLabel && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(GenerationStepIndicator, { progressLabel, language }),
            onCancel && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 flex justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: onCancel,
                className: "inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 md:min-h-0",
                children: cancelLabel
              }
            ) })
          ] }),
          isGenerating && !progressLabel && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 overflow-hidden rounded-full bg-violet-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full w-[30%] animate-pulse rounded-full bg-violet-400" }) }),
            onCancel && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 flex justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: onCancel,
                className: "inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 md:min-h-0",
                children: cancelLabel
              }
            ) })
          ] }),
          isBlocked && blockedInfo && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4", role: "alert", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldBlockIcon, {}) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-amber-900", children: getTranslation("report_blocked_title", language) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs leading-relaxed text-amber-700", children: getTranslation("report_blocked_detail", language, {
                trusted: String(blockedInfo.trustedCardsCount),
                excluded: String(blockedInfo.excludedEvidenceCount)
              }) }),
              blockedInfo.reasons.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2.5 space-y-1.5", children: blockedInfo.reasons.map((reason) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-2 text-xs text-amber-800", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400", "aria-hidden": "true" }),
                reason
              ] }, reason)) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 border-t border-amber-200 pt-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-600", children: getTranslation("report_blocked_what_to_do_label", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs leading-relaxed text-amber-700", children: getTranslation("report_blocked_what_to_do", language) })
              ] })
            ] })
          ] }) }),
          hasReport && !isGenerating && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `mt-4 rounded-lg border p-3 ${isPartial ? "border-amber-200 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/60"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `inline-flex items-center gap-1.5 text-xs font-semibold ${isPartial ? "text-amber-700" : "text-emerald-700"}`, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(CheckIcon$1, {}),
                actionsLabel
              ] }),
              isPartial && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-amber-600", children: getTranslation("report_partial_hint", language) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  onClick: onOpen,
                  title: openLabel,
                  className: "inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-violet-600 bg-violet-600 px-3 text-xs font-semibold text-white shadow-sm transition-all hover:bg-violet-700 hover:shadow-md active:bg-violet-800 md:h-8 md:min-h-0",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLinkIcon, {}),
                    openLabel
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  onClick: onExportPdf,
                  title: exportLabel,
                  className: "inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow md:h-8 md:min-h-0",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(DownloadIcon, {}),
                    exportLabel
                  ]
                }
              )
            ] })
          ] }) })
        ] })
      ]
    }
  );
};
const parseProgressPercent = (label) => {
  const match = label.match(/^(\d+)\/(\d+)$/);
  if (!match) return 30;
  const completed = Number(match[1]);
  const total = Number(match[2]);
  return total > 0 ? Math.round(completed / total * 100) : 30;
};
const ReportDelivery = We.memo(ReportDeliveryComponent);
const differs = (left, right) => (left ?? "").trim() !== (right ?? "").trim();
const toLineList = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim().length > 0) : [];
const FileIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "h-4 w-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" }) });
const RowsIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "h-4 w-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375z" }) });
const LayersIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "h-4 w-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" }) });
const ClockIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "h-4 w-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" }) });
const SparkleIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "h-3.5 w-3.5", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" }) });
const StatCard = ({ icon, iconBg, label, value }) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-card border border-slate-200/80 bg-white/80 p-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${iconBg}`, children: icon }),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-sm font-medium text-slate-900 break-all", children: value })
  ] })
] }) });
const ReportHeaderComponent = ({
  reportContextResolution,
  effectiveReportContext,
  fileName,
  preparedRowCount,
  headerDepth,
  summaryRowCount,
  language
}) => {
  const generatedAtRef = reactExports.useRef(
    (/* @__PURE__ */ new Date()).toLocaleString(void 0, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  );
  const aiGuess = (reportContextResolution == null ? void 0 : reportContextResolution.verification.aiConfidence) === "low" && reportContextResolution.aiExtracted ? reportContextResolution.aiExtracted : null;
  const displayTitle = [
    aiGuess == null ? void 0 : aiGuess.reportTitle,
    effectiveReportContext.reportTitle,
    fileName,
    "Untitled Report"
  ].find((candidate) => typeof candidate === "string" && isUsableReportTitle(candidate)) ?? "Untitled Report";
  const aiParameterLines = toLineList(aiGuess == null ? void 0 : aiGuess.parameterLines);
  const effectiveParameterLines = toLineList(effectiveReportContext.parameterLines);
  const parameterLines = (aiParameterLines.length > 0 ? aiParameterLines : effectiveParameterLines).slice(0, 5);
  const showAiGuessBanner = Boolean(aiGuess);
  const showValidatedFallbackNote = Boolean(
    aiGuess && (reportContextResolution == null ? void 0 : reportContextResolution.verification.usedFallback) && (differs(aiGuess.reportTitle, effectiveReportContext.reportTitle) || aiParameterLines.join("\n") !== effectiveParameterLines.join("\n"))
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "overflow-hidden rounded-card border border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-4 p-4 xl:flex-row xl:items-start xl:justify-between", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-3xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500", children: getTranslation("report_header_context", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "mt-2 text-2xl font-semibold tracking-tight text-slate-950", children: displayTitle }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-slate-600", children: effectiveReportContext.reportDescription || getTranslation("report_header_hint", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SparkleIcon, {}),
          getTranslation("report_header_ai_badge", language)
        ] }),
        showAiGuessBanner && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900", children: getTranslation("report_header_low_confidence", language) }),
        showValidatedFallbackNote && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700", children: getTranslation("report_header_validated_fallback", language) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-xs text-slate-500", children: [
        fileName && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          fileName,
          " · "
        ] }),
        preparedRowCount.toLocaleString(),
        " ",
        getTranslation("report_header_prepared_rows", language).toLowerCase()
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "group border-t border-slate-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors", children: getTranslation("report_header_show_details", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 pb-4 pt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-2 sm:grid-cols-2 xl:grid-cols-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            StatCard,
            {
              icon: /* @__PURE__ */ jsxRuntimeExports.jsx(FileIcon, {}),
              iconBg: "bg-blue-50 text-blue-500",
              label: getTranslation("file_label", language).replace(":", ""),
              value: fileName || displayTitle
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            StatCard,
            {
              icon: /* @__PURE__ */ jsxRuntimeExports.jsx(RowsIcon, {}),
              iconBg: "bg-teal-50 text-teal-500",
              label: getTranslation("report_header_prepared_rows", language),
              value: preparedRowCount.toLocaleString()
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            StatCard,
            {
              icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ClockIcon, {}),
              iconBg: "bg-violet-50 text-violet-500",
              label: getTranslation("report_header_generated_at", language),
              value: generatedAtRef.current
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            StatCard,
            {
              icon: /* @__PURE__ */ jsxRuntimeExports.jsx(LayersIcon, {}),
              iconBg: "bg-slate-100 text-slate-500",
              label: getTranslation("report_header_header_depth", language),
              value: headerDepth
            }
          )
        ] }),
        parameterLines.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("report_header_parameters", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex flex-wrap gap-2", children: [
            parameterLines.map((line) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                title: line,
                className: "inline-flex max-w-sm items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-900",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: line })
              },
              line
            )),
            summaryRowCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700", children: [
              getTranslation("report_header_summary_rows", language),
              ": ",
              summaryRowCount
            ] })
          ] })
        ] })
      ] })
    ] })
  ] });
};
const ReportHeader = We.memo(ReportHeaderComponent);
ReportHeader.displayName = "ReportHeader";
const TIER_CONFIG = {
  trusted: {
    titleKey: "credibility_ready",
    hintKey: "credibility_ready_hint",
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    titleColor: "text-emerald-900",
    hintColor: "text-emerald-700"
  },
  caveated: {
    titleKey: "credibility_review",
    hintKey: "credibility_review_hint",
    border: "border-amber-200",
    bg: "bg-amber-50",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    titleColor: "text-amber-900",
    hintColor: "text-amber-700"
  },
  weak: {
    titleKey: "credibility_insufficient",
    hintKey: "credibility_insufficient_hint",
    border: "border-red-200",
    bg: "bg-red-50",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    titleColor: "text-red-900",
    hintColor: "text-red-700"
  }
};
const CheckIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "currentColor", className: "h-5 w-5", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z", clipRule: "evenodd" }) });
const AlertIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "currentColor", className: "h-5 w-5", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z", clipRule: "evenodd" }) });
const InfoIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "currentColor", className: "h-5 w-5", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z", clipRule: "evenodd" }) });
const CredibilityBanner = ({
  overallVerdict,
  trustedCount,
  caveatedCount,
  weakCount,
  hasRunCaveats = false,
  language
}) => {
  const effectiveVerdict = overallVerdict === "trusted" && hasRunCaveats ? "caveated" : overallVerdict;
  const config = TIER_CONFIG[effectiveVerdict];
  const title = getTranslation(
    overallVerdict === "trusted" && hasRunCaveats ? "credibility_ready_with_caveats" : config.titleKey,
    language
  );
  const reviewCount = caveatedCount + weakCount;
  const hintKey = overallVerdict === "trusted" && hasRunCaveats ? "credibility_ready_with_caveats_hint" : overallVerdict === "caveated" && trustedCount === 0 ? "credibility_review_hint_no_verified" : config.hintKey;
  const hint = getTranslation(hintKey, language, {
    trusted: String(trustedCount),
    review: String(reviewCount)
  });
  const Icon = effectiveVerdict === "trusted" ? CheckIcon : effectiveVerdict === "caveated" ? InfoIcon : AlertIcon;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `rounded-xl border ${config.border} ${config.bg} p-4`, role: "status", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.iconBg} ${config.iconColor}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, {}) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-sm font-semibold ${config.titleColor}`, children: title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `mt-1 text-xs leading-relaxed ${config.hintColor}`, children: hint })
    ] })
  ] }) });
};
const BREAKPOINTS = {
  oneCol: 900,
  twoCols: 1350
};
const CARD_SPOTLIGHT_DURATION_MS = 1e4;
const SQL_PRECHECK_PREVIEW_LIMIT = 25;
const INITIAL_VISIBLE_CARDS = 6;
const CARD_LOAD_INCREMENT = 4;
const SIMPLE_VIEW_CARD_LIMIT = 2;
const AnalysisPanelComponent = () => {
  const _renderT0 = performance.now();
  const { cards, finalSummary, finalSummaryProvenance, isGeneratingReport, language, reportTemplate, setReportTemplate, reportGenerationProgress, aiTaskDone, cleaningRun, isSpreadsheetVisible, resumeCleaningRun, restartCleaningRun, generateAnalystReport, cancelReportGeneration, openLatestAnalystReport, exportLatestAnalystReportPdf, csvData, canonicalCsvData, rawCsvData, reportContextResolution, reportStructureResolution, rawIntakeIr, columnProfiles, dataPreparationPlan, runWorkspaceDataQuery, setIsSpreadsheetVisible, addProgress, handleShowCardFromChat, setIsDataPreparationModalOpen, setIsReportBoundaryConfirmModalOpen, hasLatestAnalystReport, reportBlockedInfo, isReportPartial, initialAnalysisStatus, latestAnalysisSession, visibleAnalysisTrace, storeResultsViewMode, setStoreResultsViewMode } = useAppStore(
    (state) => ({
      cards: state.analysisCards,
      finalSummary: state.finalSummary,
      finalSummaryProvenance: state.finalSummaryProvenance ?? null,
      isGeneratingReport: state.isGeneratingReport,
      language: state.settings.language,
      reportTemplate: state.settings.reportTemplate ?? "management_review",
      setReportTemplate: state.setReportTemplate,
      reportGenerationProgress: state.reportGenerationProgress,
      // PERF-303: Only track whether AI task is finished (boolean), not the full object.
      // Full aiTaskStatus rendering is handled by AnalysisStatusSection.
      aiTaskDone: !state.aiTaskStatus || state.aiTaskStatus.status === "done" || state.aiTaskStatus.status === "error",
      cleaningRun: state.cleaningRun,
      isSpreadsheetVisible: state.isSpreadsheetVisible,
      resumeCleaningRun: state.resumeCleaningRun,
      restartCleaningRun: state.restartCleaningRun,
      generateAnalystReport: state.generateAnalystReport,
      cancelReportGeneration: state.cancelReportGeneration,
      openLatestAnalystReport: state.openLatestAnalystReport,
      exportLatestAnalystReportPdf: state.exportLatestAnalystReportPdf,
      csvData: state.csvData,
      canonicalCsvData: state.canonicalCsvData,
      rawCsvData: state.rawCsvData,
      reportContextResolution: state.reportContextResolution,
      reportStructureResolution: state.reportStructureResolution,
      rawIntakeIr: state.rawIntakeIr,
      columnProfiles: state.columnProfiles,
      dataPreparationPlan: state.dataPreparationPlan,
      runWorkspaceDataQuery: state.runWorkspaceDataQuery,
      setIsSpreadsheetVisible: state.setIsSpreadsheetVisible,
      addProgress: state.addProgress,
      handleShowCardFromChat: state.handleShowCardFromChat,
      setIsDataPreparationModalOpen: state.setIsDataPreparationModalOpen,
      setIsReportBoundaryConfirmModalOpen: state.setIsReportBoundaryConfirmModalOpen,
      hasLatestAnalystReport: hasOpenableLatestReport(state.workspaceFiles),
      reportBlockedInfo: resolveLatestReportBlockedInfo(state.workspaceFiles),
      isReportPartial: isLatestReportPartial(state.workspaceFiles),
      initialAnalysisStatus: state.initialAnalysisStatus,
      latestAnalysisSession: state.latestAnalysisSession ?? null,
      visibleAnalysisTrace: state.visibleAnalysisTrace ?? [],
      storeResultsViewMode: state.resultsViewMode ?? "simple",
      setStoreResultsViewMode: state.setResultsViewMode
    }),
    shallow$1
  );
  const panelRef = reactExports.useRef(null);
  const previousCardCountRef = reactExports.useRef(cards.length);
  const hasMountedRef = reactExports.useRef(false);
  const spotlightTimeoutRef = reactExports.useRef(null);
  const sqlPrecheckScrollTimeoutRef = reactExports.useRef(null);
  const loadMoreSentinelRef = reactExports.useRef(null);
  const [columnCount, setColumnCount] = reactExports.useState(3);
  const [spotlightCardId, setSpotlightCardId] = reactExports.useState(null);
  const [visibleCardCount, setVisibleCardCount] = reactExports.useState(INITIAL_VISIBLE_CARDS);
  const [expandOverrideKey, setExpandOverrideKey] = reactExports.useState(1);
  const [expandOverrideValue, setExpandOverrideValue] = reactExports.useState(true);
  const [resultsViewMode, setResultsViewMode] = reactExports.useState(storeResultsViewMode);
  reactExports.useEffect(() => {
    setResultsViewMode(storeResultsViewMode);
  }, [storeResultsViewMode]);
  const prevCardIdsRef = reactExports.useRef([]);
  const stableCardIds = reactExports.useMemo(() => {
    const nextIds = cards.slice(0, visibleCardCount).map((c) => c.id);
    const prev = prevCardIdsRef.current;
    if (nextIds.length === prev.length && nextIds.every((id, i) => id === prev[i])) {
      return prev;
    }
    prevCardIdsRef.current = nextIds;
    return nextIds;
  }, [cards, visibleCardCount]);
  const simpleCardIds = reactExports.useMemo(() => {
    const currentDatasetVersion = getCurrentAnalysisDatasetVersion({ canonicalCsvData, csvData });
    const completionGate2 = resolveAnalysisCompletionGate({
      cards,
      currentDatasetVersion,
      columnProfiles
    });
    const trustedBusinessIds = new Set(completionGate2.trustedBusinessCardIds);
    const trustScore = {
      verified: 500,
      caveated: 350,
      unverified: 200,
      stale: 50,
      weak: 0
    };
    const rankedCandidates = cards.map((card, index) => {
      const decision = resolveCardTrustDecision(card, currentDatasetVersion);
      const display = buildDisplayAnalysisIr(card, cards, columnProfiles);
      const helperScore = display.helperExposureLevel === "none" ? 80 : display.helperExposureLevel === "low" ? 25 : -60;
      const narrativeScore = display.narrativeEligibility === "preferred" ? 40 : display.narrativeEligibility === "allowed_neutral" ? 15 : -20;
      const meaningScore = Math.round((display.businessMeaningConfidence ?? 0) * 100);
      const fallbackPenalty = card.plan.isFallback ? 75 : 0;
      return {
        id: card.id,
        index,
        trustStatus: decision.status,
        score: trustScore[decision.status] + helperScore + narrativeScore + meaningScore + display.selectionScore - fallbackPenalty
      };
    }).sort((left, right) => right.score - left.score || left.index - right.index);
    const verifiedCandidates = rankedCandidates.filter((candidate) => trustedBusinessIds.has(candidate.id));
    return verifiedCandidates.slice(0, SIMPLE_VIEW_CARD_LIMIT).map((candidate) => candidate.id);
  }, [canonicalCsvData, cards, columnProfiles, csvData]);
  const displayedCardIds = resultsViewMode === "simple" ? simpleCardIds : stableCardIds;
  const handleResultsViewChange = reactExports.useCallback((mode) => {
    setResultsViewMode(mode);
    setStoreResultsViewMode == null ? void 0 : setStoreResultsViewMode(mode);
    setExpandOverrideValue(true);
    setExpandOverrideKey((previous) => previous + 1);
  }, [setStoreResultsViewMode]);
  const handleToggleAllCards = reactExports.useCallback(() => {
    setExpandOverrideValue((prev) => !prev);
    setExpandOverrideKey((prev) => prev + 1);
  }, []);
  reactExports.useEffect(() => {
    const calculateColumnCount = (width) => {
      if (width < BREAKPOINTS.oneCol) return 1;
      if (width < BREAKPOINTS.twoCols) return 2;
      return 3;
    };
    if (typeof ResizeObserver === "undefined") {
      console.warn("ResizeObserver not supported; layout may not be responsive to panel resizing.");
      return;
    }
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const newColumnCount = calculateColumnCount(entries[0].contentRect.width);
        setColumnCount((prev) => prev === newColumnCount ? prev : newColumnCount);
      }
    });
    const currentPanel = panelRef.current;
    if (currentPanel) {
      setColumnCount(calculateColumnCount(currentPanel.offsetWidth));
      observer.observe(currentPanel);
    }
    return () => {
      if (currentPanel) {
        observer.unobserve(currentPanel);
      }
    };
  }, []);
  reactExports.useEffect(() => {
    if (cards.length === 0) {
      setVisibleCardCount(INITIAL_VISIBLE_CARDS);
    }
  }, [cards.length]);
  reactExports.useEffect(() => {
    const previousCardCount = previousCardCountRef.current;
    previousCardCountRef.current = cards.length;
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (cards.length === 0 || cards.length <= previousCardCount) {
      return;
    }
    setVisibleCardCount((prev) => Math.max(prev, cards.length));
    const newestCardId = cards[0].id;
    setSpotlightCardId(newestCardId);
    const addedCount = cards.length - previousCardCount;
    if (addedCount <= 2) {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-card-id="${newestCardId}"]`);
        el == null ? void 0 : el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
    if (spotlightTimeoutRef.current !== null) {
      window.clearTimeout(spotlightTimeoutRef.current);
    }
    spotlightTimeoutRef.current = window.setTimeout(() => {
      setSpotlightCardId((current) => current === newestCardId ? null : current);
      spotlightTimeoutRef.current = null;
    }, CARD_SPOTLIGHT_DURATION_MS);
  }, [cards]);
  reactExports.useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      var _a;
      if ((_a = entries[0]) == null ? void 0 : _a.isIntersecting) {
        setVisibleCardCount((prev) => prev + CARD_LOAD_INCREMENT);
      }
    }, { rootMargin: "200px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  reactExports.useEffect(() => () => {
    if (spotlightTimeoutRef.current !== null) {
      window.clearTimeout(spotlightTimeoutRef.current);
    }
    if (sqlPrecheckScrollTimeoutRef.current !== null) {
      window.clearTimeout(sqlPrecheckScrollTimeoutRef.current);
    }
  }, []);
  const credibilitySummary = reactExports.useMemo(() => {
    if (cards.length === 0) return null;
    const currentDatasetVersion = getCurrentAnalysisDatasetVersion({ canonicalCsvData, csvData });
    let trustedCount = 0;
    let caveatedCount = 0;
    let weakCount = 0;
    for (const card of cards) {
      const decision = resolveCardTrustDecision(card, currentDatasetVersion);
      if (decision.status === "verified") trustedCount++;
      else if (decision.status === "caveated") caveatedCount++;
      else weakCount++;
    }
    const overallVerdict = trustedCount > 0 ? caveatedCount > 0 || weakCount > 0 ? "caveated" : "trusted" : caveatedCount > 0 && weakCount === 0 ? "caveated" : "weak";
    return { overallVerdict, trustedCount, caveatedCount, weakCount };
  }, [canonicalCsvData, cards, csvData]);
  const executiveKpis = reactExports.useMemo(() => buildExecutiveKpis({
    cards,
    columnProfiles,
    csvData: canonicalCsvData ?? csvData,
    language,
    currentDatasetVersion: getCurrentAnalysisDatasetVersion({ canonicalCsvData, csvData })
  }), [cards, columnProfiles, canonicalCsvData, csvData, language]);
  const completionGate = reactExports.useMemo(() => resolveAnalysisCompletionGate({
    cards,
    currentDatasetVersion: getCurrentAnalysisDatasetVersion({ canonicalCsvData, csvData }),
    columnProfiles
  }), [canonicalCsvData, cards, columnProfiles, csvData]);
  const reportContext = reactExports.useMemo(() => resolveEffectiveReportContext(
    reportContextResolution,
    rawCsvData,
    csvData
  ), [reportContextResolution, rawCsvData, csvData]);
  const handleExecutiveKpiAction = (kpi) => {
    var _a;
    if (((_a = kpi.action) == null ? void 0 : _a.type) === "show-card" && kpi.sourceCardId) {
      handleShowCardFromChat(kpi.sourceCardId);
    }
  };
  const handleInspectSqlPrecheckFinding = async (finding) => {
    const availableColumnNames = Array.isArray(columnProfiles) ? columnProfiles.map((profile) => profile.name) : [];
    const relatedColumns = Array.from(new Set([
      finding.dimension,
      finding.column,
      finding.metric
    ].filter((value) => Boolean(value && availableColumnNames.includes(value)))));
    if (relatedColumns.length === 0) {
      addProgress(getTranslation("analysis_readiness_columns_unavailable", language), "warning");
      return;
    }
    setIsSpreadsheetVisible(true);
    try {
      const payload = {
        templateId: "preview_rows",
        columns: relatedColumns,
        limit: SQL_PRECHECK_PREVIEW_LIMIT,
        orderBy: null
      };
      await runWorkspaceDataQuery(payload);
      if (sqlPrecheckScrollTimeoutRef.current !== null) {
        window.clearTimeout(sqlPrecheckScrollTimeoutRef.current);
      }
      sqlPrecheckScrollTimeoutRef.current = window.setTimeout(() => {
        var _a;
        if (typeof document === "undefined") {
          return;
        }
        (_a = document.getElementById("raw-data-explorer")) == null ? void 0 : _a.scrollIntoView({ behavior: "smooth", block: "center" });
        sqlPrecheckScrollTimeoutRef.current = null;
      }, 100);
    } catch (error) {
      addProgress(
        getTranslation("analysis_readiness_inspection_failed", language),
        "error"
      );
      console.warn("[AnalysisPanel] Failed to inspect data-readiness finding.", error);
    }
  };
  const renderContent = () => {
    var _a, _b, _c, _d, _e, _f, _g;
    const executiveOverviewTitle = getTranslation("executive_overview", language);
    const executiveOverviewHint = getTranslation("executive_overview_hint", language);
    const executiveKpiActionLabel = getTranslation("executive_kpi_view_breakdown", language);
    const finalSummaryTitle = getTranslation("overall_insights", language);
    const showWarnings = shouldShowDataWarnings();
    const analysisAlreadyStarted = initialAnalysisStatus === "ready" || initialAnalysisStatus === "degraded" || cards.length > 0;
    const showCleaningBanner = cleaningRun && (cleaningRun.status !== "completed" || ((_a = dataPreparationPlan == null ? void 0 : dataPreparationPlan.sqlPrecheck) == null ? void 0 : _a.status) === "blocked" || ((_b = dataPreparationPlan == null ? void 0 : dataPreparationPlan.sqlPrecheck) == null ? void 0 : _b.status) === "warning") && !isSpreadsheetVisible && !analysisAlreadyStarted;
    const showReportHeader = Boolean(reportContext && csvData);
    const analysisTerminal = initialAnalysisStatus === "ready" || initialAnalysisStatus === "degraded" || initialAnalysisStatus === "error";
    const analysisComplete = analysisTerminal && completionGate.status === "complete";
    const showHeadlineSections = aiTaskDone;
    const showAnalystReportAction = analysisComplete && cards.length > 0;
    const isArtifactReportGeneration = (reportGenerationProgress == null ? void 0 : reportGenerationProgress.mode) === "artifact";
    const isSimpleReportBlocked = Boolean(reportBlockedInfo) && !hasLatestAnalystReport && !isGeneratingReport;
    const reportProgressLabel = isArtifactReportGeneration && reportGenerationProgress ? `${reportGenerationProgress.completed}/${reportGenerationProgress.total}` : null;
    const largeDatasetBacking = (_c = canonicalCsvData ?? csvData) == null ? void 0 : _c.backing;
    const largeDatasetNotice = (largeDatasetBacking == null ? void 0 : largeDatasetBacking.mode) === "duckdb_file" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950", role: "status", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold", children: getTranslation("large_dataset_mode_title", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1", children: getTranslation("large_dataset_mode_body", language, {
        totalRows: largeDatasetBacking.rowCount.toLocaleString(),
        sampleRows: largeDatasetBacking.sampleRowCount.toLocaleString()
      }) })
    ] }) : null;
    const analystReportAction = showAnalystReportAction ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      ReportDelivery,
      {
        language,
        reportTemplate,
        onTemplateChange: setReportTemplate,
        onGenerate: () => void generateAnalystReport(),
        onCancel: cancelReportGeneration,
        onOpen: openLatestAnalystReport,
        onExportPdf: exportLatestAnalystReportPdf,
        isGenerating: isGeneratingReport,
        progressLabel: reportProgressLabel,
        hasReport: hasLatestAnalystReport,
        blockedInfo: reportBlockedInfo,
        isPartial: isReportPartial
      }
    ) : null;
    const skeletonCount = isGeneratingReport && reportGenerationProgress && reportGenerationProgress.mode !== "artifact" ? Math.max(0, reportGenerationProgress.total - cards.length) : 0;
    if (cards.length === 0 && !isGeneratingReport && skeletonCount === 0 && aiTaskDone && visibleAnalysisTrace.length === 0 && !showWarnings && !showCleaningBanner) {
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { id: "analysis-results-section", className: "scroll-mt-6 space-y-4", children: [
        showReportHeader && /* @__PURE__ */ jsxRuntimeExports.jsx(
          ReportHeader,
          {
            reportContextResolution,
            effectiveReportContext: reportContext,
            fileName: csvData.fileName,
            preparedRowCount: getCsvDataRowCount(canonicalCsvData ?? csvData),
            headerDepth: (rawCsvData == null ? void 0 : rawCsvData.headerDepth) ?? csvData.headerDepth ?? 1,
            summaryRowCount: (rawCsvData == null ? void 0 : rawCsvData.summaryRowCount) ?? ((_d = rawCsvData == null ? void 0 : rawCsvData.summaryRows) == null ? void 0 : _d.length) ?? csvData.summaryRowCount ?? ((_e = csvData.summaryRows) == null ? void 0 : _e.length) ?? 0,
            language
          }
        ),
        largeDatasetNotice,
        analystReportAction,
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: getTranslation("analysis_results_placeholder", language) }) }) })
      ] });
    }
    console.log(`[Perf:Diag] AnalysisPanel render: ${Math.round(performance.now() - _renderT0)}ms | cards=${cards.length}`);
    return /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { id: "analysis-results-section", className: "scroll-mt-6 space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "flex flex-col gap-3 rounded-card border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between", "aria-label": getTranslation("analysis_results_view_label", language), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("analysis_results_view_label", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-600", children: getTranslation(
            resultsViewMode === "simple" ? "analysis_results_simple_view_hint" : "analysis_results_explore_view_hint",
            language
          ) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "inline-flex self-start rounded-card border border-slate-200 bg-slate-50 p-1", role: "group", "aria-label": getTranslation("analysis_results_view_label", language), children: ["simple", "explore"].map((mode) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            "aria-pressed": resultsViewMode === mode,
            onClick: () => handleResultsViewChange(mode),
            className: `min-h-[44px] rounded-md px-3 py-2 text-sm font-semibold transition md:min-h-0 ${resultsViewMode === mode ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"}`,
            children: getTranslation(
              mode === "simple" ? "analysis_results_simple_view" : "analysis_results_explore_view",
              language
            )
          },
          mode
        )) })
      ] }),
      largeDatasetNotice,
      showReportHeader && /* @__PURE__ */ jsxRuntimeExports.jsx(
        ReportHeader,
        {
          reportContextResolution,
          effectiveReportContext: reportContext,
          fileName: csvData.fileName,
          preparedRowCount: getCsvDataRowCount(canonicalCsvData ?? csvData),
          headerDepth: (rawCsvData == null ? void 0 : rawCsvData.headerDepth) ?? csvData.headerDepth ?? 1,
          summaryRowCount: (rawCsvData == null ? void 0 : rawCsvData.summaryRowCount) ?? ((_f = rawCsvData == null ? void 0 : rawCsvData.summaryRows) == null ? void 0 : _f.length) ?? csvData.summaryRowCount ?? ((_g = csvData.summaryRows) == null ? void 0 : _g.length) ?? 0,
          language
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(AnalysisStatusSection, {}),
      resultsViewMode === "explore" && (latestAnalysisSession == null ? void 0 : latestAnalysisSession.researchBrief) && /* @__PURE__ */ jsxRuntimeExports.jsx(ResearchRunSummary, { session: latestAnalysisSession }),
      showHeadlineSections && credibilitySummary && /* @__PURE__ */ jsxRuntimeExports.jsx(
        CredibilityBanner,
        {
          overallVerdict: credibilitySummary.overallVerdict,
          trustedCount: credibilitySummary.trustedCount,
          caveatedCount: credibilitySummary.caveatedCount,
          weakCount: credibilitySummary.weakCount,
          hasRunCaveats: initialAnalysisStatus === "degraded",
          language
        }
      ),
      showHeadlineSections && finalSummary && /* @__PURE__ */ jsxRuntimeExports.jsx(
        FinalSummary,
        {
          title: finalSummaryTitle,
          summary: finalSummary,
          language,
          provenance: finalSummaryProvenance,
          currentDataset: { canonicalCsvData, csvData },
          defaultExpanded: resultsViewMode === "explore"
        },
        resultsViewMode
      ),
      showHeadlineSections && executiveKpis.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
        ExecutiveKpiRow,
        {
          title: executiveOverviewTitle,
          subtitle: executiveOverviewHint,
          kpis: executiveKpis,
          actionLabel: executiveKpiActionLabel,
          onKpiAction: handleExecutiveKpiAction
        }
      ),
      resultsViewMode === "simple" && analysisTerminal && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-blue-200 bg-blue-50 p-4", "aria-label": getTranslation("analysis_results_next_step_title", language), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-blue-700", children: getTranslation("analysis_results_next_step_title", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm font-semibold text-slate-900", children: getTranslation(
          completionGate.status === "blocked" ? "analysis_results_next_step_reason_repair" : initialAnalysisStatus === "degraded" ? "analysis_results_next_step_reason_degraded_report" : "analysis_results_next_step_reason_ready_report",
          language
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-600", children: getTranslation(
          completionGate.status === "blocked" ? "analysis_results_next_step_outcome_repair" : "analysis_results_next_step_outcome_report",
          language
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              if (completionGate.status === "blocked") {
                if (reportStructureResolution && rawIntakeIr) {
                  setIsReportBoundaryConfirmModalOpen(true);
                } else {
                  setIsDataPreparationModalOpen(true);
                }
              } else if (hasLatestAnalystReport) {
                openLatestAnalystReport();
              } else {
                void generateAnalystReport();
              }
            },
            disabled: completionGate.status === "complete" && (isGeneratingReport || isSimpleReportBlocked),
            title: isSimpleReportBlocked ? getTranslation("report_blocked_title", language) : void 0,
            className: "mt-3 min-h-[44px] rounded-card bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300",
            children: getTranslation(
              completionGate.status === "blocked" ? "analysis_results_repair_action" : hasLatestAnalystReport ? "report_open" : isGeneratingReport ? "generate_analyst_report_running" : "generate_analyst_report",
              language
            )
          }
        )
      ] }),
      (cards.length > 0 || skeletonCount > 0) && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        resultsViewMode === "explore" && cards.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-end mb-3", "data-export-exclude": true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: handleToggleAllCards,
            className: "inline-flex min-h-[44px] items-center gap-1.5 rounded-card border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 md:min-h-0",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "1.75", className: `h-3.5 w-3.5 transition-transform ${expandOverrideValue ? "" : "-rotate-90"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 8l4 4 4-4" }) }),
              expandOverrideValue ? getTranslation("collapse_all_cards", language) : getTranslation("expand_all_cards", language)
            ]
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          AnalysisCardGrid,
          {
            cardIds: displayedCardIds,
            skeletonCount,
            columnCount,
            spotlightCardId,
            expandOverrideKey,
            expandOverrideValue,
            showExplorationControls: resultsViewMode === "explore"
          }
        ),
        resultsViewMode === "explore" && visibleCardCount < cards.length && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: loadMoreSentinelRef, className: "flex justify-center py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-slate-400", children: [
          cards.length - visibleCardCount,
          " more cards below"
        ] }) })
      ] }),
      showWarnings && /* @__PURE__ */ jsxRuntimeExports.jsx(DataQualityWarnings, {}),
      showCleaningBanner && /* @__PURE__ */ jsxRuntimeExports.jsx(
        CleaningRunBanner,
        {
          cleaningRun,
          onContinue: () => void resumeCleaningRun(),
          onRestart: () => void restartCleaningRun(),
          sqlPrecheck: (dataPreparationPlan == null ? void 0 : dataPreparationPlan.sqlPrecheck) ?? null,
          onInspectFinding: handleInspectSqlPrecheckFinding
        }
      ),
      resultsViewMode === "explore" && analystReportAction
    ] }) });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-0", ref: panelRef, children: renderContent() });
};
const AnalysisPanel = We.memo(AnalysisPanelComponent);
AnalysisPanel.displayName = "AnalysisPanel";
export {
  AnalysisPanel
};
