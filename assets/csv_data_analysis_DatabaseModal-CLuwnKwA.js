import { j as jsxRuntimeExports, a as reactExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-LvY-J6mW.js";
import { T as TabulatorTable } from "./csv_data_analysis_TabulatorTable-DqiIrnfv.js";
import { u as useAppStore, d as useDialogAccessibility } from "./csv_data_analysis_index-L92MBGHW.js";
import { I as IconClose } from "./csv_data_analysis_IconClose-Cz0XDY4R.js";
import { bE as summarizeTraceContract, U as getTranslation, bF as WORKSPACE_QUERY_LIMIT_OPTIONS, bG as DEFAULT_WORKSPACE_QUERY_LIMIT, bH as WORKSPACE_QUERY_TEMPLATE_OPTIONS, a0 as buildEffectiveColumnRegistryFromState, bI as createDefaultWorkspaceQueryDrafts, q as createIdleDuckDbSessionStatus } from "./csv_data_analysis_app-agent-DytoEScF.js";
import "./csv_data_analysis_vendor-ui-DPkU1-1J.js";
import "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
const ACTIVE_QUERY_ACTIVITY_ID = "__active_data_query__";
const toDate = (value) => value instanceof Date ? value : new Date(value);
const getActivitySignature = (activity) => [
  toDate(activity.appliedAt).toISOString(),
  activity.engine,
  activity.sqlPreview ?? "",
  activity.tableName ?? "",
  activity.loadVersion ?? ""
].join("::");
const toActivityFromQueryTrace = (entry) => ({
  id: entry.id,
  source: "history",
  phase: entry.phase,
  origin: entry.origin,
  explanation: entry.explanation,
  engine: entry.engine,
  sqlPreview: entry.sqlPreview,
  tableName: entry.tableName,
  loadVersion: entry.loadVersion,
  fallbackReason: entry.fallbackReason ?? null,
  appliedAt: toDate(entry.appliedAt),
  templateId: entry.templateId,
  formSnapshot: entry.formSnapshot,
  result: entry.result,
  traceContract: entry.traceContract
});
const toActivityFromActiveQuery = (query, matchingTrace) => ({
  id: (matchingTrace == null ? void 0 : matchingTrace.id) ?? ACTIVE_QUERY_ACTIVITY_ID,
  source: "active",
  phase: (matchingTrace == null ? void 0 : matchingTrace.phase) ?? "analysis",
  origin: (matchingTrace == null ? void 0 : matchingTrace.origin) ?? "analysis",
  explanation: query.explanation,
  engine: query.engine,
  sqlPreview: query.sqlPreview,
  tableName: query.tableName,
  loadVersion: query.loadVersion,
  fallbackReason: query.fallbackReason ?? null,
  appliedAt: toDate(query.appliedAt),
  templateId: matchingTrace == null ? void 0 : matchingTrace.templateId,
  formSnapshot: matchingTrace == null ? void 0 : matchingTrace.formSnapshot,
  traceContract: matchingTrace == null ? void 0 : matchingTrace.traceContract,
  result: {
    totalMatchedRows: query.result.totalMatchedRows,
    returnedRows: query.result.returnedRows,
    truncated: query.result.truncated,
    selectedColumns: query.result.selectedColumns,
    appliedOrderBy: query.result.appliedOrderBy,
    appliedLimit: query.result.appliedLimit,
    durationMs: query.result.durationMs,
    previewRows: query.result.rows.slice(0, 20)
  }
});
const buildDatabaseModalQueryActivityFromOutcome = (outcome) => ({
  ...toActivityFromActiveQuery(outcome.query),
  id: outcome.traceId,
  origin: "workspace",
  appliedAt: new Date(outcome.committedAt)
});
const buildDatabaseModalQueryActivities = (activeDataQuery, queryHistory) => {
  const historyActivities = [...queryHistory].reverse().map(toActivityFromQueryTrace);
  if (!activeDataQuery) {
    return historyActivities;
  }
  const matchingTrace = queryHistory.find(
    (entry) => getActivitySignature(toActivityFromQueryTrace(entry)) === getActivitySignature(toActivityFromActiveQuery(activeDataQuery))
  );
  const activeActivity = toActivityFromActiveQuery(activeDataQuery, matchingTrace);
  const activeSignature = getActivitySignature(activeActivity);
  const dedupedHistory = historyActivities.filter((entry) => getActivitySignature(entry) !== activeSignature);
  return [activeActivity, ...dedupedHistory];
};
const languageLocales = {
  English: "en",
  Mandarin: "zh-CN",
  Malay: "ms",
  Japanese: "ja"
};
const formatTimestamp = (value, language) => value ? new Date(value).toLocaleString(languageLocales[language] ?? "en") : "N/A";
const formatTemplateLabel = (templateId, language) => {
  if (!templateId) {
    return "N/A";
  }
  return getTranslation(`explorer_template_${templateId}`, language);
};
const formatOriginLabel = (origin, language) => getTranslation(`explorer_origin_${origin}`, language);
const formatOrderBy = (activity) => {
  const appliedOrderBy = (activity == null ? void 0 : activity.result.appliedOrderBy) ?? [];
  if (appliedOrderBy.length === 0) {
    return "No sort applied";
  }
  return appliedOrderBy.map((order) => `${order.column} (${order.direction})`).join(", ");
};
const DatabaseModalSidebar = ({
  csvData,
  queryActivities,
  selectedQueryActivity,
  onSelectQueryActivity,
  onLoadWorkspaceTemplate,
  onRerunWorkspaceTemplate,
  canLoadWorkspaceTemplate = false,
  canRerunWorkspaceTemplate = false,
  language = "English"
}) => {
  const selectedTrace = summarizeTraceContract((selectedQueryActivity == null ? void 0 : selectedQueryActivity.traceContract) ?? null);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "space-y-4 xl:min-h-0 xl:overflow-y-auto", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 bg-white p-4 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("explorer_current_result", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-slate-600", children: getTranslation("explorer_sidebar_hint", language) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5 text-right", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("explorer_recorded", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm font-semibold text-slate-900", children: queryActivities.length })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "mt-4 space-y-3 text-sm text-slate-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: getTranslation("explorer_file", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "text-right font-medium text-slate-900", children: (csvData == null ? void 0 : csvData.fileName) ?? getTranslation("explorer_no_dataset", language) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: getTranslation("explorer_origin", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "text-right font-medium text-slate-900", children: selectedQueryActivity ? formatOriginLabel(selectedQueryActivity.origin, language) : getTranslation("explorer_no_query_selected", language) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: getTranslation("explorer_template", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "text-right font-medium text-slate-900", children: formatTemplateLabel(selectedQueryActivity == null ? void 0 : selectedQueryActivity.templateId, language) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: getTranslation("explorer_applied_at", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "text-right font-medium text-slate-900", children: formatTimestamp((selectedQueryActivity == null ? void 0 : selectedQueryActivity.appliedAt) ?? null, language) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: getTranslation("explorer_rows", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "text-right font-medium text-slate-900", children: selectedQueryActivity ? `${selectedQueryActivity.result.returnedRows} / ${selectedQueryActivity.result.totalMatchedRows}` : "N/A" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: getTranslation("explorer_columns", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "text-right font-medium text-slate-900", children: (selectedQueryActivity == null ? void 0 : selectedQueryActivity.result.selectedColumns.length) ?? 0 })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: getTranslation("explorer_limit", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "text-right font-medium text-slate-900", children: (selectedQueryActivity == null ? void 0 : selectedQueryActivity.result.appliedLimit) ?? "N/A" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: getTranslation("explorer_order", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "text-right font-medium text-slate-900", children: (selectedQueryActivity == null ? void 0 : selectedQueryActivity.result.appliedOrderBy.length) ? formatOrderBy(selectedQueryActivity) : getTranslation("explorer_no_sort_applied", language) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mt-4 rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer text-sm font-semibold text-slate-800", children: getTranslation("explorer_technical_details", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "mt-3 space-y-3 text-sm text-slate-700", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Phase" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all text-right font-medium text-slate-900", children: (selectedQueryActivity == null ? void 0 : selectedQueryActivity.phase) ?? "N/A" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Engine" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "text-right font-medium text-slate-900", children: (selectedQueryActivity == null ? void 0 : selectedQueryActivity.engine) ?? "N/A" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Table" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all text-right font-medium text-slate-900", children: (selectedQueryActivity == null ? void 0 : selectedQueryActivity.tableName) ?? "N/A" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Load version" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all text-right font-medium text-slate-900", children: (selectedQueryActivity == null ? void 0 : selectedQueryActivity.loadVersion) ?? "N/A" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Reason code" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all text-right font-medium text-slate-900", children: (selectedTrace == null ? void 0 : selectedTrace.reasonCode) ?? "N/A" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Retry class" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all text-right font-medium text-slate-900", children: (selectedTrace == null ? void 0 : selectedTrace.retryClass) ?? "N/A" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Failure class" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all text-right font-medium text-slate-900", children: (selectedTrace == null ? void 0 : selectedTrace.failureClass) ?? "N/A" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Trace contract" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all text-right font-medium text-slate-900", children: (selectedTrace == null ? void 0 : selectedTrace.contractVersion) ?? "N/A" })
          ] }),
          (selectedQueryActivity == null ? void 0 : selectedQueryActivity.fallbackReason) ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold", children: "Fallback reason" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "mt-1 break-words", children: selectedQueryActivity.fallbackReason })
          ] }) : null
        ] })
      ] }),
      (selectedQueryActivity == null ? void 0 : selectedQueryActivity.fallbackReason) ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-4 rounded-card border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700", children: getTranslation("explorer_needs_review", language) }) : null,
      canLoadWorkspaceTemplate || canRerunWorkspaceTemplate ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onLoadWorkspaceTemplate,
            disabled: !canLoadWorkspaceTemplate,
            className: `min-h-[44px] rounded-card px-3 py-2 text-sm font-medium transition ${canLoadWorkspaceTemplate ? "bg-slate-900 text-white hover:bg-slate-800" : "cursor-not-allowed bg-slate-100 text-slate-400"}`,
            children: getTranslation("explorer_load_template", language)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onRerunWorkspaceTemplate,
            disabled: !canRerunWorkspaceTemplate,
            className: `min-h-[44px] rounded-card px-3 py-2 text-sm font-medium transition ${canRerunWorkspaceTemplate ? "border border-slate-300 bg-white text-slate-900 hover:border-slate-400" : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"}`,
            children: getTranslation("explorer_rerun_query", language)
          }
        )
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 bg-white p-4 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-start justify-between gap-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("explorer_query_history", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-slate-600", children: getTranslation("explorer_query_history_hint", language) })
      ] }) }),
      queryActivities.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 max-h-[480px] space-y-3 overflow-y-auto pr-1", children: queryActivities.map((activity) => {
        const isSelected = (selectedQueryActivity == null ? void 0 : selectedQueryActivity.id) === activity.id;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => onSelectQueryActivity(activity.id),
            className: `min-h-[44px] w-full rounded-card border px-3 py-2.5 text-left transition ${isSelected ? "border-blue-300 bg-blue-50 shadow-sm" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white", children: activity.source === "active" ? getTranslation("explorer_current_query", language) : formatOriginLabel(activity.origin, language) }),
                activity.templateId ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600", children: formatTemplateLabel(activity.templateId, language) }) : null,
                activity.fallbackReason ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700", children: getTranslation("explorer_needs_review", language) }) : null
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-sm font-semibold text-slate-900", children: activity.explanation }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatTimestamp(activity.appliedAt, language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation("explorer_rows_count", language, { count: `${activity.result.returnedRows} / ${activity.result.totalMatchedRows}` }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                  activity.result.durationMs,
                  " ms"
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation(
                  activity.result.truncated ? "explorer_preview_truncated" : "explorer_preview_complete",
                  language
                ) })
              ] })
            ]
          },
          activity.id
        );
      }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 rounded-card border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500", children: getTranslation("explorer_no_history", language) })
    ] })
  ] });
};
const PREDICATE_OPERATOR_OPTIONS = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Not equals" },
  { value: "contains", label: "Contains" },
  { value: "starts_with", label: "Starts with" },
  { value: "ends_with", label: "Ends with" },
  { value: "gt", label: "Greater than" },
  { value: "gte", label: "Greater than or equal" },
  { value: "lt", label: "Less than" },
  { value: "lte", label: "Less than or equal" },
  { value: "between", label: "Between" },
  { value: "in", label: "In list" },
  { value: "is_null", label: "Is null / blank" },
  { value: "not_null", label: "Is not null / blank" }
];
const isValueOptionalOperator = (operator) => operator === "is_null" || operator === "not_null";
const usesRangeValues = (operator) => operator === "between";
const usesListValues = (operator) => operator === "in";
const createEmptyPredicate = (availableColumns) => ({
  column: availableColumns[0] ?? "",
  operator: "eq",
  value: ""
});
const createEmptyGroup = (availableColumns) => ({
  predicates: [createEmptyPredicate(availableColumns)]
});
const ColumnPicker = ({ label, availableColumns, selectedColumns, onToggle, description, language = "English" }) => {
  const [isExpanded, setIsExpanded] = reactExports.useState(availableColumns.length <= 12);
  const pickerId = reactExports.useId();
  const selectedPreview = selectedColumns.slice(0, 4).join(", ");
  const hiddenSelectedCount = Math.max(0, selectedColumns.length - 4);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("fieldset", { className: "min-w-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("legend", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500", children: label }),
    description ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-slate-500", children: description }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex min-w-0 flex-col gap-3 rounded-card border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "min-w-0 text-sm text-slate-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold", children: getTranslation("explorer_selected_columns_count", language, { count: selectedColumns.length }) }),
        selectedPreview ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-2 break-words text-slate-500", children: [
          selectedPreview,
          hiddenSelectedCount > 0 ? ` +${hiddenSelectedCount}` : ""
        ] }) : null
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          "aria-controls": pickerId,
          "aria-expanded": isExpanded,
          onClick: () => setIsExpanded((current) => !current),
          className: "min-h-[44px] shrink-0 rounded-card border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100",
          children: getTranslation(isExpanded ? "explorer_hide_columns" : "explorer_choose_columns", language)
        }
      )
    ] }),
    isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        id: pickerId,
        role: "group",
        "aria-label": label,
        className: "mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-card border border-slate-200 bg-white p-3",
        children: availableColumns.length > 0 ? availableColumns.map((column) => {
          const isSelected = selectedColumns.includes(column);
          return /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              "aria-pressed": isSelected,
              onClick: () => onToggle(column),
              className: `min-h-[44px] rounded-full px-3 py-2 text-sm font-medium transition ${isSelected ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`,
              children: column
            },
            column
          );
        }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-500", children: getTranslation("explorer_no_columns", language) })
      }
    ) : null
  ] });
};
const SelectField = ({ label, value, onChange, options, disabled = false }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500", children: label }),
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "select",
    {
      value,
      onChange: (event) => onChange(event.target.value),
      disabled,
      className: "mt-2 min-h-[44px] w-full rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100",
      children: options.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: option.value, children: option.label }, option.value))
    }
  )
] });
const TextField = ({ label, value, onChange, placeholder }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500", children: label }),
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "input",
    {
      type: "text",
      value,
      onChange: (event) => onChange(event.target.value),
      placeholder,
      className: "mt-2 min-h-[44px] w-full rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
    }
  )
] });
const LimitField = ({ limit, onChange, language = "English" }) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  SelectField,
  {
    label: getTranslation("explorer_limit", language),
    value: String(limit || DEFAULT_WORKSPACE_QUERY_LIMIT),
    onChange: (value) => onChange(Number(value)),
    options: WORKSPACE_QUERY_LIMIT_OPTIONS.map((option) => ({
      value: String(option),
      label: getTranslation("explorer_rows_count", language, { count: option })
    }))
  }
);
const PredicateEditor = ({ title, predicates, availableColumns, onChange, language = "English" }) => {
  const updatePredicate = (index, updater) => {
    onChange(predicates.map((predicate, predicateIndex) => predicateIndex === index ? updater(predicate) : predicate));
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 bg-slate-50 p-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: title }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-slate-500", children: getTranslation("explorer_predicate_hint", language) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => onChange([...predicates, createEmptyPredicate(availableColumns)]),
          className: "min-h-[44px] rounded-card border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300",
          children: getTranslation("explorer_add_predicate", language)
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 space-y-3", children: predicates.map((predicate, index) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-white p-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          SelectField,
          {
            label: getTranslation("explorer_column", language),
            value: predicate.column,
            onChange: (value) => updatePredicate(index, (current) => ({ ...current, column: value })),
            options: availableColumns.map((column) => ({ value: column, label: column }))
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          SelectField,
          {
            label: getTranslation("explorer_operator", language),
            value: predicate.operator,
            onChange: (value) => updatePredicate(index, (current) => ({
              ...current,
              operator: value,
              ...value === "between" ? { secondaryValue: current.secondaryValue ?? "" } : {}
            })),
            options: PREDICATE_OPERATOR_OPTIONS.map((option) => ({
              value: option.value,
              label: getTranslation(`explorer_operator_${option.value}`, language)
            }))
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-end justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => onChange(predicates.filter((_, predicateIndex) => predicateIndex !== index)),
            disabled: predicates.length <= 1,
            className: `min-h-[44px] rounded-card px-3 py-2 text-sm font-medium transition ${predicates.length > 1 ? "border border-slate-200 bg-white text-slate-700 hover:border-slate-300" : "cursor-not-allowed border border-slate-100 bg-slate-100 text-slate-400"}`,
            children: getTranslation("explorer_remove", language)
          }
        ) })
      ] }),
      !isValueOptionalOperator(predicate.operator) ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `mt-3 grid gap-3 ${usesRangeValues(predicate.operator) ? "md:grid-cols-2" : ""}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          TextField,
          {
            label: usesListValues(predicate.operator) ? getTranslation("explorer_values_comma_separated", language) : getTranslation("explorer_value", language),
            value: predicate.value ?? "",
            onChange: (value) => updatePredicate(index, (current) => ({ ...current, value })),
            placeholder: usesListValues(predicate.operator) ? "A, B, C" : getTranslation("explorer_enter_value", language)
          }
        ),
        usesRangeValues(predicate.operator) ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          TextField,
          {
            label: getTranslation("explorer_and", language),
            value: predicate.secondaryValue ?? "",
            onChange: (value) => updatePredicate(index, (current) => ({ ...current, secondaryValue: value })),
            placeholder: getTranslation("explorer_upper_bound", language)
          }
        ) : null
      ] }) : null
    ] }, `${title}-${index}`)) })
  ] });
};
const PreviewRowsEditor = ({ draft, availableColumns, onDraftChange, language }) => {
  var _a, _b, _c;
  const selectableSortColumns = draft.columns.length > 0 ? draft.columns : availableColumns;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ColumnPicker,
      {
        label: getTranslation("explorer_visible_columns", language),
        availableColumns,
        selectedColumns: draft.columns,
        onToggle: (column) => onDraftChange({
          ...draft,
          columns: draft.columns.includes(column) ? draft.columns.filter((entry) => entry !== column) : [...draft.columns, column]
        }),
        description: getTranslation("explorer_visible_columns_hint", language),
        language
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SelectField,
        {
          label: getTranslation("explorer_sort_column", language),
          value: ((_a = draft.orderBy) == null ? void 0 : _a.column) ?? "",
          onChange: (value) => {
            var _a2;
            return onDraftChange({
              ...draft,
              orderBy: value ? { column: value, direction: ((_a2 = draft.orderBy) == null ? void 0 : _a2.direction) ?? "asc" } : null
            });
          },
          options: [
            { value: "", label: getTranslation("explorer_no_sort", language) },
            ...selectableSortColumns.map((column) => ({ value: column, label: column }))
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SelectField,
        {
          label: getTranslation("explorer_sort_direction", language),
          value: ((_b = draft.orderBy) == null ? void 0 : _b.direction) ?? "asc",
          onChange: (value) => onDraftChange({
            ...draft,
            orderBy: draft.orderBy ? { ...draft.orderBy, direction: value === "desc" ? "desc" : "asc" } : null
          }),
          options: [
            { value: "asc", label: getTranslation("explorer_ascending", language) },
            { value: "desc", label: getTranslation("explorer_descending", language) }
          ],
          disabled: !((_c = draft.orderBy) == null ? void 0 : _c.column)
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      LimitField,
      {
        limit: draft.limit,
        onChange: (limit) => onDraftChange({ ...draft, limit }),
        language
      }
    )
  ] });
};
const FilterLookupEditor = ({ draft, availableColumns, onDraftChange, language }) => {
  var _a, _b, _c;
  const selectableSortColumns = draft.columns.length > 0 ? draft.columns : availableColumns;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ColumnPicker,
      {
        label: getTranslation("explorer_output_columns", language),
        availableColumns,
        selectedColumns: draft.columns,
        onToggle: (column) => onDraftChange({
          ...draft,
          columns: draft.columns.includes(column) ? draft.columns.filter((entry) => entry !== column) : [...draft.columns, column]
        }),
        description: getTranslation("explorer_output_columns_hint", language),
        language
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      PredicateEditor,
      {
        title: getTranslation("explorer_match_all", language),
        predicates: draft.predicates,
        availableColumns,
        onChange: (predicates) => onDraftChange({ ...draft, predicates }),
        language
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 bg-slate-50 p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: getTranslation("explorer_or_groups", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-slate-500", children: getTranslation("explorer_or_groups_hint", language) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => onDraftChange({
              ...draft,
              groups: [...draft.groups ?? [], createEmptyGroup(availableColumns)]
            }),
            className: "min-h-[44px] rounded-card border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300",
            children: getTranslation("explorer_add_or_group", language)
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 space-y-3", children: (draft.groups ?? []).length > 0 ? (draft.groups ?? []).map((group, groupIndex) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-white p-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: getTranslation("explorer_or_group_number", language, { count: groupIndex + 1 }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => onDraftChange({
                ...draft,
                groups: (draft.groups ?? []).filter((_, index) => index !== groupIndex)
              }),
              className: "min-h-[44px] rounded-card border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300",
              children: getTranslation("explorer_remove_group", language)
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          PredicateEditor,
          {
            title: getTranslation("explorer_group_predicates", language),
            predicates: group.predicates,
            availableColumns,
            onChange: (predicates) => onDraftChange({
              ...draft,
              groups: (draft.groups ?? []).map((entry, index) => index === groupIndex ? { ...entry, predicates } : entry)
            }),
            language
          }
        )
      ] }, `group-${groupIndex}`)) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-500", children: getTranslation("explorer_no_or_groups", language) }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4 md:grid-cols-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SelectField,
        {
          label: getTranslation("explorer_sort_column", language),
          value: ((_a = draft.orderBy) == null ? void 0 : _a.column) ?? "",
          onChange: (value) => {
            var _a2;
            return onDraftChange({
              ...draft,
              orderBy: value ? { column: value, direction: ((_a2 = draft.orderBy) == null ? void 0 : _a2.direction) ?? "asc" } : null
            });
          },
          options: [
            { value: "", label: getTranslation("explorer_no_sort", language) },
            ...selectableSortColumns.map((column) => ({ value: column, label: column }))
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SelectField,
        {
          label: getTranslation("explorer_sort_direction", language),
          value: ((_b = draft.orderBy) == null ? void 0 : _b.direction) ?? "asc",
          onChange: (value) => onDraftChange({
            ...draft,
            orderBy: draft.orderBy ? { ...draft.orderBy, direction: value === "desc" ? "desc" : "asc" } : null
          }),
          options: [
            { value: "asc", label: getTranslation("explorer_ascending", language) },
            { value: "desc", label: getTranslation("explorer_descending", language) }
          ],
          disabled: !((_c = draft.orderBy) == null ? void 0 : _c.column)
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        LimitField,
        {
          limit: draft.limit,
          onChange: (limit) => onDraftChange({ ...draft, limit }),
          language
        }
      )
    ] })
  ] });
};
const AggregateBreakdownEditor = ({ draft, groupableColumns, selectableColumns, onDraftChange, language }) => {
  var _a, _b;
  const sortColumns = Array.from(/* @__PURE__ */ new Set([
    ...draft.groupBy,
    draft.aggregate.as || "row_count"
  ]));
  const currentAlias = draft.aggregate.as || "row_count";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ColumnPicker,
      {
        label: getTranslation("explorer_group_by", language),
        availableColumns: groupableColumns,
        selectedColumns: draft.groupBy,
        onToggle: (column) => onDraftChange({
          ...draft,
          groupBy: draft.groupBy.includes(column) ? draft.groupBy.filter((entry) => entry !== column) : [...draft.groupBy, column]
        }),
        description: getTranslation("explorer_group_by_hint", language),
        language
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4 md:grid-cols-2 xl:grid-cols-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SelectField,
        {
          label: getTranslation("explorer_aggregate_function", language),
          value: draft.aggregate.function,
          onChange: (value) => onDraftChange({
            ...draft,
            aggregate: {
              ...draft.aggregate,
              function: value
            }
          }),
          options: [
            { value: "count", label: getTranslation("explorer_count", language) },
            { value: "sum", label: getTranslation("explorer_sum", language) },
            { value: "avg", label: getTranslation("explorer_average", language) }
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SelectField,
        {
          label: getTranslation("explorer_aggregate_column", language),
          value: draft.aggregate.column ?? "",
          onChange: (value) => onDraftChange({
            ...draft,
            aggregate: {
              ...draft.aggregate,
              column: value || null
            }
          }),
          options: [
            {
              value: "",
              label: draft.aggregate.function === "count" ? getTranslation("explorer_all_rows", language) : getTranslation("explorer_select_column", language)
            },
            ...selectableColumns.map((column) => ({ value: column, label: column }))
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        TextField,
        {
          label: getTranslation("explorer_alias", language),
          value: draft.aggregate.as,
          onChange: (value) => onDraftChange({
            ...draft,
            aggregate: { ...draft.aggregate, as: value },
            orderBy: draft.orderBy ? {
              column: draft.orderBy.column === currentAlias ? value : draft.orderBy.column,
              direction: draft.orderBy.direction
            } : draft.orderBy
          }),
          placeholder: "row_count"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        LimitField,
        {
          limit: draft.limit,
          onChange: (limit) => onDraftChange({ ...draft, limit }),
          language
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SelectField,
        {
          label: getTranslation("explorer_sort_column", language),
          value: ((_a = draft.orderBy) == null ? void 0 : _a.column) ?? currentAlias,
          onChange: (value) => {
            var _a2;
            return onDraftChange({
              ...draft,
              orderBy: value ? { column: value, direction: ((_a2 = draft.orderBy) == null ? void 0 : _a2.direction) ?? "desc" } : null
            });
          },
          options: sortColumns.map((column) => ({ value: column, label: column }))
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SelectField,
        {
          label: getTranslation("explorer_sort_direction", language),
          value: ((_b = draft.orderBy) == null ? void 0 : _b.direction) ?? "desc",
          onChange: (value) => {
            var _a2;
            return onDraftChange({
              ...draft,
              orderBy: {
                column: ((_a2 = draft.orderBy) == null ? void 0 : _a2.column) ?? currentAlias,
                direction: value === "asc" ? "asc" : "desc"
              }
            });
          },
          options: [
            { value: "desc", label: getTranslation("explorer_descending", language) },
            { value: "asc", label: getTranslation("explorer_ascending", language) }
          ]
        }
      )
    ] })
  ] });
};
const DuplicateCandidatesEditor = ({ draft, availableColumns, onDraftChange, language }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    ColumnPicker,
    {
      label: getTranslation("explorer_key_columns", language),
      availableColumns,
      selectedColumns: draft.keyColumns,
      onToggle: (column) => onDraftChange({
        ...draft,
        keyColumns: draft.keyColumns.includes(column) ? draft.keyColumns.filter((entry) => entry !== column) : [...draft.keyColumns, column]
      }),
      description: getTranslation("explorer_key_columns_hint", language),
      language
    }
  ),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      TextField,
      {
        label: getTranslation("explorer_count_alias", language),
        value: draft.countAlias ?? "duplicate_count",
        onChange: (value) => onDraftChange({ ...draft, countAlias: value }),
        placeholder: "duplicate_count"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      LimitField,
      {
        limit: draft.limit,
        onChange: (limit) => onDraftChange({ ...draft, limit }),
        language
      }
    )
  ] })
] });
const NullBlankScanEditor = ({ draft, availableColumns, onDraftChange, language }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    SelectField,
    {
      label: getTranslation("explorer_target_column", language),
      value: draft.column,
      onChange: (value) => onDraftChange({ ...draft, column: value }),
      options: [
        { value: "", label: getTranslation("explorer_select_column", language) },
        ...availableColumns.map((column) => ({ value: column, label: column }))
      ]
    }
  ),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 p-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("explorer_result_mode", language) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 flex flex-wrap gap-2", children: [
      { value: "preview", label: getTranslation("explorer_preview_matching_rows", language) },
      { value: "count", label: getTranslation("explorer_count_matching_rows", language) }
    ].map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: () => onDraftChange({ ...draft, resultMode: option.value }),
        className: `min-h-[44px] rounded-full px-3 py-2 text-sm font-medium transition ${draft.resultMode === option.value ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`,
        children: option.label
      },
      option.value
    )) })
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    LimitField,
    {
      limit: draft.limit,
      onChange: (limit) => onDraftChange({ ...draft, limit }),
      language
    }
  )
] });
const getWorkspaceQueryDraftValidationMessage = (draft) => {
  if (draft.templateId === "null_blank_scan" && !draft.column.trim()) {
    return "Select a target column before running the null / blank scan.";
  }
  return null;
};
const DatabaseWorkspaceQueryComposer = ({
  availableColumns,
  groupableColumns,
  templateId,
  draft,
  duckDbSessionStatus,
  onTemplateChange,
  onDraftChange,
  onRunQuery,
  onRefreshSession,
  isSubmitting,
  isRefreshingSession,
  errorMessage,
  language = "English"
}) => {
  const isDuckDbReady = duckDbSessionStatus.status === "ready";
  const validationMessage = getWorkspaceQueryDraftValidationMessage(draft);
  const isSubmitDisabled = !isDuckDbReady || availableColumns.length === 0 || isSubmitting || Boolean(validationMessage);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 bg-white p-4 shadow-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("explorer_query_templates", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mt-2 text-lg font-semibold text-slate-900", children: getTranslation("explorer_query_builder", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-600", children: getTranslation("explorer_query_builder_hint", language) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onRefreshSession,
            disabled: isRefreshingSession,
            className: `min-h-[44px] rounded-card px-3 py-2 text-sm font-medium transition ${isRefreshingSession ? "cursor-not-allowed bg-slate-100 text-slate-400" : "border border-slate-300 bg-white text-slate-900 hover:border-slate-400"}`,
            children: isRefreshingSession ? getTranslation("explorer_refreshing", language) : getTranslation("explorer_refresh_session", language)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onRunQuery,
            disabled: isSubmitDisabled,
            className: `min-h-[44px] rounded-card px-3 py-2 text-sm font-medium transition ${isSubmitDisabled ? "cursor-not-allowed bg-slate-100 text-slate-400" : "bg-slate-900 text-white hover:bg-slate-800"}`,
            children: isSubmitting ? getTranslation("explorer_running_query", language) : getTranslation("explorer_run_query", language)
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 flex flex-wrap gap-2", children: WORKSPACE_QUERY_TEMPLATE_OPTIONS.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: () => onTemplateChange(option.id),
        className: `min-h-[44px] rounded-full px-3 py-2 text-sm font-medium transition ${templateId === option.id ? "bg-slate-900 text-white" : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white"}`,
        children: getTranslation(`explorer_template_${option.id}`, language)
      },
      option.id
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-card border border-slate-200 bg-slate-50 p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium text-slate-900", children: getTranslation(`explorer_template_${templateId}_description`, language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-500", children: getTranslation("explorer_session_contract", language) })
    ] }),
    !isDuckDbReady ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800", children: [
      getTranslation("explorer_session_status", language, { status: duckDbSessionStatus.status }),
      duckDbSessionStatus.fallbackReason ? ` ${duckDbSessionStatus.fallbackReason}` : ` ${getTranslation("explorer_session_rebind", language)}`
    ] }) : null,
    errorMessage ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { role: "alert", className: "mt-4 rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700", children: errorMessage }) : null,
    validationMessage ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { role: "alert", className: "mt-4 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900", children: draft.templateId === "null_blank_scan" ? getTranslation("explorer_select_target_column_error", language) : validationMessage }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4", children: [
      templateId === "preview_rows" && /* @__PURE__ */ jsxRuntimeExports.jsx(
        PreviewRowsEditor,
        {
          draft,
          availableColumns,
          onDraftChange,
          language
        }
      ),
      templateId === "filter_lookup" && /* @__PURE__ */ jsxRuntimeExports.jsx(
        FilterLookupEditor,
        {
          draft,
          availableColumns,
          onDraftChange,
          language
        }
      ),
      templateId === "aggregate_breakdown" && /* @__PURE__ */ jsxRuntimeExports.jsx(
        AggregateBreakdownEditor,
        {
          draft,
          groupableColumns,
          selectableColumns: availableColumns,
          onDraftChange,
          language
        }
      ),
      templateId === "duplicate_candidates" && /* @__PURE__ */ jsxRuntimeExports.jsx(
        DuplicateCandidatesEditor,
        {
          draft,
          availableColumns: groupableColumns,
          onDraftChange,
          language
        }
      ),
      templateId === "null_blank_scan" && /* @__PURE__ */ jsxRuntimeExports.jsx(
        NullBlankScanEditor,
        {
          draft,
          availableColumns,
          onDraftChange,
          language
        }
      )
    ] })
  ] });
};
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const getColumns = (rows, preferredColumns) => {
  if (preferredColumns && preferredColumns.length > 0) {
    return preferredColumns;
  }
  return rows.length > 0 ? Object.keys(rows[0]) : [];
};
const filterRows = (rows, columns, searchTerm) => {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  if (!normalizedSearch) {
    return rows;
  }
  return rows.filter((row) => columns.some(
    (column) => String(row[column] ?? "").toLowerCase().includes(normalizedSearch)
  ));
};
const getSortSummary = (sortState) => sortState.column ? `${sortState.column} (${sortState.direction})` : "No sort applied";
const getDefaultSelectedActivityId = (queryActivities) => {
  var _a;
  return ((_a = queryActivities[0]) == null ? void 0 : _a.id) ?? null;
};
const formatSessionTimestamp = (value) => value ? new Date(value).toLocaleString() : "Not synced";
const getSelectableColumns = (columnRegistry, rows) => {
  const fromRegistry = (columnRegistry == null ? void 0 : columnRegistry.columns.filter((column) => column.allowedUsages.select).map((column) => column.physicalName)) ?? [];
  return fromRegistry.length > 0 ? fromRegistry : getColumns(rows);
};
const getGroupableColumns = (columnRegistry, fallbackColumns) => {
  const fromRegistry = (columnRegistry == null ? void 0 : columnRegistry.columns.filter((column) => column.allowedUsages.groupBy).map((column) => column.physicalName)) ?? [];
  if (columnRegistry) {
    return fromRegistry;
  }
  return fallbackColumns;
};
const getStatusBadgeClassName = (status) => {
  switch (status) {
    case "ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "binding":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "degraded":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "error":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
};
const DatabaseModal = () => {
  var _a;
  const {
    isOpen,
    onClose,
    activeDataQuery,
    csvData,
    columnRegistry,
    columnProfiles,
    datasetSemanticSnapshot,
    userColumnAnnotations,
    analysisSteering,
    queryHistory,
    language,
    duckDbSessionStatus,
    runWorkspaceDataQuery,
    refreshDuckDbSession
  } = useAppStore((state) => {
    var _a2;
    return {
      isOpen: state.isDatabaseModalOpen,
      onClose: () => state.setIsDatabaseModalOpen(false),
      activeDataQuery: state.activeDataQuery,
      csvData: state.csvData,
      columnRegistry: state.columnRegistry,
      columnProfiles: state.columnProfiles,
      datasetSemanticSnapshot: state.datasetSemanticSnapshot,
      userColumnAnnotations: state.userColumnAnnotations,
      analysisSteering: ((_a2 = state.latestAnalysisSession) == null ? void 0 : _a2.analysisSteering) ?? null,
      queryHistory: state.queryHistory,
      language: state.settings.language,
      duckDbSessionStatus: state.duckDbSessionStatus,
      runWorkspaceDataQuery: state.runWorkspaceDataQuery,
      refreshDuckDbSession: state.refreshDuckDbSession
    };
  }, shallow$1);
  const [searchTerm, setSearchTerm] = reactExports.useState("");
  const [sortState, setSortState] = reactExports.useState({ column: null, direction: "asc" });
  const [selectedQueryTraceId, setSelectedQueryTraceId] = reactExports.useState(null);
  const [activeTemplateId, setActiveTemplateId] = reactExports.useState("preview_rows");
  const [drafts, setDrafts] = reactExports.useState({
    preview_rows: { templateId: "preview_rows", columns: [], orderBy: null, limit: 25 },
    filter_lookup: { templateId: "filter_lookup", columns: [], predicates: [], groups: [], orderBy: null, limit: 25 },
    aggregate_breakdown: {
      templateId: "aggregate_breakdown",
      groupBy: [],
      aggregate: { function: "count", column: null, as: "row_count" },
      orderBy: { column: "row_count", direction: "desc" },
      limit: 25
    },
    duplicate_candidates: { templateId: "duplicate_candidates", keyColumns: [], countAlias: "duplicate_count", limit: 25 },
    null_blank_scan: { templateId: "null_blank_scan", column: "", resultMode: "preview", limit: 25 }
  });
  const [queryRunState, setQueryRunState] = reactExports.useState({ status: "idle" });
  const [sessionError, setSessionError] = reactExports.useState(null);
  const [isRefreshingSession, setIsRefreshingSession] = reactExports.useState(false);
  const wasOpenRef = reactExports.useRef(false);
  const autoRefreshAttemptKeyRef = reactExports.useRef(null);
  const dialogRef = useDialogAccessibility(
    isOpen,
    onClose,
    { restoreFocusSelector: '[data-data-explorer-trigger="true"]' }
  );
  const resolvedDuckDbSessionStatus = duckDbSessionStatus ?? createIdleDuckDbSessionStatus();
  const effectiveColumnRegistry = reactExports.useMemo(
    () => buildEffectiveColumnRegistryFromState({
      csvData,
      columnProfiles,
      datasetSemanticSnapshot,
      userColumnAnnotations,
      latestAnalysisSession: {
        analysisSteering
      },
      columnRegistry
    }, {
      datasetOverride: csvData
    }),
    [analysisSteering, columnProfiles, columnRegistry, csvData, datasetSemanticSnapshot, userColumnAnnotations]
  );
  const availableColumns = reactExports.useMemo(
    () => getSelectableColumns(effectiveColumnRegistry, (csvData == null ? void 0 : csvData.data) ?? []),
    [effectiveColumnRegistry, csvData == null ? void 0 : csvData.data]
  );
  const groupableColumns = reactExports.useMemo(
    () => getGroupableColumns(effectiveColumnRegistry, availableColumns),
    [availableColumns, effectiveColumnRegistry]
  );
  const columnSignature = `${availableColumns.join("|")}::${groupableColumns.join("|")}`;
  const defaultDrafts = reactExports.useMemo(
    () => createDefaultWorkspaceQueryDrafts({
      selectableColumns: availableColumns,
      groupableColumns
    }),
    [availableColumns, columnSignature, groupableColumns]
  );
  const queryActivities = reactExports.useMemo(
    () => buildDatabaseModalQueryActivities(activeDataQuery, queryHistory),
    [activeDataQuery, queryHistory]
  );
  const selectedQueryActivity = reactExports.useMemo(
    () => queryActivities.find((activity) => activity.id === selectedQueryTraceId) ?? null,
    [queryActivities, selectedQueryTraceId]
  );
  const pendingCommittedActivity = reactExports.useMemo(
    () => queryRunState.status === "succeeded" && selectedQueryTraceId === queryRunState.outcome.traceId ? buildDatabaseModalQueryActivityFromOutcome(queryRunState.outcome) : null,
    [queryRunState, selectedQueryTraceId]
  );
  const resolvedQueryActivity = selectedQueryActivity ?? pendingCommittedActivity ?? queryActivities[0] ?? null;
  const currentRows = reactExports.useMemo(() => {
    if (!resolvedQueryActivity) {
      return [];
    }
    if (resolvedQueryActivity.source === "active" && activeDataQuery) {
      return activeDataQuery.result.rows;
    }
    if (queryRunState.status === "succeeded" && resolvedQueryActivity.id === queryRunState.outcome.traceId) {
      return queryRunState.outcome.query.result.rows;
    }
    return resolvedQueryActivity.result.previewRows;
  }, [activeDataQuery, queryRunState, resolvedQueryActivity]);
  const currentColumns = reactExports.useMemo(
    () => getColumns(currentRows, resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.result.selectedColumns),
    [currentRows, resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.result.selectedColumns]
  );
  const filteredRows = reactExports.useMemo(
    () => filterRows(currentRows, currentColumns, searchTerm),
    [currentColumns, currentRows, searchTerm]
  );
  const sortSummary = sortState.column ? getSortSummary(sortState) : getTranslation("explorer_no_sort_applied", language);
  const emptyStateText = !resolvedQueryActivity ? getTranslation("explorer_empty_run_template", language) : currentColumns.length === 0 ? getTranslation("explorer_empty_no_columns", language) : getTranslation("explorer_empty_no_rows", language);
  const tableKey = [
    (csvData == null ? void 0 : csvData.fileName) ?? "no-file",
    (resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.id) ?? "no-query",
    (resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.appliedAt) instanceof Date ? resolvedQueryActivity.appliedAt.toISOString() : "no-date",
    (resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.tableName) ?? "no-table",
    (resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.loadVersion) ?? "no-version"
  ].join(":");
  reactExports.useEffect(() => {
    setDrafts(defaultDrafts);
    setActiveTemplateId("preview_rows");
    setQueryRunState({ status: "idle" });
    setSessionError(null);
  }, [columnSignature]);
  reactExports.useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setSelectedQueryTraceId(getDefaultSelectedActivityId(queryActivities));
    }
    wasOpenRef.current = isOpen;
  }, [activeDataQuery, isOpen, queryActivities]);
  reactExports.useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (selectedQueryTraceId && queryActivities.some((activity) => activity.id === selectedQueryTraceId)) {
      return;
    }
    if (queryRunState.status === "succeeded" && selectedQueryTraceId === queryRunState.outcome.traceId) {
      return;
    }
    setSelectedQueryTraceId(getDefaultSelectedActivityId(queryActivities));
  }, [activeDataQuery, isOpen, queryActivities, queryRunState, selectedQueryTraceId]);
  reactExports.useEffect(() => {
    setSearchTerm("");
    setSortState({ column: null, direction: "asc" });
  }, [resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.id]);
  reactExports.useEffect(() => {
    if (!isOpen) {
      autoRefreshAttemptKeyRef.current = null;
      return;
    }
    if (!csvData || resolvedDuckDbSessionStatus.status === "ready") {
      return;
    }
    const attemptKey = `${csvData.fileName}:${csvData.data.length}`;
    if (autoRefreshAttemptKeyRef.current === attemptKey) {
      return;
    }
    autoRefreshAttemptKeyRef.current = attemptKey;
    setSessionError(null);
    setIsRefreshingSession(true);
    void refreshDuckDbSession().catch((error) => {
      setSessionError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      setIsRefreshingSession(false);
    });
  }, [
    csvData,
    isOpen,
    refreshDuckDbSession,
    resolvedDuckDbSessionStatus.status
  ]);
  if (!isOpen) {
    return null;
  }
  const currentDraft = drafts[activeTemplateId];
  const isSubmitting = queryRunState.status === "submitting";
  const formError = queryRunState.status === "failed" ? queryRunState.message : sessionError;
  const canLoadSelectedTemplate = (resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.origin) === "workspace" && Boolean(resolvedQueryActivity.templateId && resolvedQueryActivity.formSnapshot);
  const canRerunSelectedTemplate = canLoadSelectedTemplate && resolvedDuckDbSessionStatus.status === "ready" && !isSubmitting;
  const updateDraft = (nextDraft) => {
    setDrafts((prev) => ({
      ...prev,
      [nextDraft.templateId]: nextDraft
    }));
  };
  const runDraft = async (draftToRun, nextTemplateId) => {
    const validationMessage = getWorkspaceQueryDraftValidationMessage(draftToRun);
    if (validationMessage) {
      setQueryRunState({ status: "failed", message: validationMessage, draft: draftToRun });
      return;
    }
    setSessionError(null);
    setQueryRunState({ status: "submitting" });
    try {
      const outcome = await runWorkspaceDataQuery(draftToRun);
      if (nextTemplateId) {
        setActiveTemplateId(nextTemplateId);
      }
      setSelectedQueryTraceId(outcome.traceId);
      setQueryRunState({ status: "succeeded", outcome });
    } catch (error) {
      setQueryRunState({
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
        draft: draftToRun
      });
    }
  };
  const handleRunQuery = async () => {
    await runDraft(currentDraft, activeTemplateId);
  };
  const handleTemplateChange = (nextTemplateId) => {
    setActiveTemplateId(nextTemplateId);
    setQueryRunState({ status: "idle" });
    setSessionError(null);
  };
  const handleRefreshSession = async () => {
    setSessionError(null);
    setIsRefreshingSession(true);
    try {
      await refreshDuckDbSession();
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRefreshingSession(false);
    }
  };
  const handleLoadWorkspaceTemplate = () => {
    if (!(resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.templateId) || !resolvedQueryActivity.formSnapshot) {
      return;
    }
    setActiveTemplateId(resolvedQueryActivity.templateId);
    updateDraft(resolvedQueryActivity.formSnapshot);
    setQueryRunState({ status: "idle" });
  };
  const handleRerunWorkspaceTemplate = async () => {
    if (!(resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.templateId) || !resolvedQueryActivity.formSnapshot) {
      return;
    }
    await runDraft(resolvedQueryActivity.formSnapshot, resolvedQueryActivity.templateId);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm", onClick: onClose, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: dialogRef,
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "database-dialog-title",
      tabIndex: -1,
      className: "relative flex h-screen w-screen flex-col bg-slate-50",
      onClick: (event) => event.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "border-b border-slate-200 bg-white/95 backdrop-blur-xl", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3 px-4 py-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] uppercase tracking-[0.24em] text-slate-500", children: getTranslation("header_data_explorer", language) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "database-dialog-title", className: "mt-1 text-2xl font-semibold text-slate-950", children: getTranslation("explorer_title", language) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-600", children: getTranslation("explorer_title_hint", language) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              "data-dialog-initial-focus": true,
              onClick: onClose,
              className: "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-card p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
              "aria-label": getTranslation("explorer_close", language),
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, {})
            }
          )
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("section", { className: "rounded-card border border-slate-200 bg-white p-4 shadow-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer text-sm font-semibold text-slate-800", children: getTranslation("explorer_advanced_engine_status", language) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500", children: "DuckDB Session" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getStatusBadgeClassName(resolvedDuckDbSessionStatus.status)}`, children: resolvedDuckDbSessionStatus.status }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600", children: resolvedDuckDbSessionStatus.engine ?? "engine unavailable" })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-2 sm:grid-cols-2 xl:grid-cols-5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: "Table" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm font-semibold text-slate-900", children: resolvedDuckDbSessionStatus.tableName ?? "N/A" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: "Load Version" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 break-all text-sm font-semibold text-slate-900", children: resolvedDuckDbSessionStatus.loadVersion ?? "N/A" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: "Last Sync" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm font-semibold text-slate-900", children: formatSessionTimestamp(resolvedDuckDbSessionStatus.lastSyncedAt) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5 sm:col-span-2 xl:col-span-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: "Fallback Reason" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm font-semibold text-slate-900", children: resolvedDuckDbSessionStatus.fallbackReason ?? "None" })
                ] })
              ] })
            ] })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid min-h-0 flex-1 gap-4 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_360px] xl:grid-rows-1 xl:overflow-hidden", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 pr-1 xl:min-h-0 xl:overflow-y-auto", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                DatabaseWorkspaceQueryComposer,
                {
                  availableColumns,
                  groupableColumns,
                  templateId: activeTemplateId,
                  draft: currentDraft,
                  duckDbSessionStatus: resolvedDuckDbSessionStatus,
                  onTemplateChange: handleTemplateChange,
                  onDraftChange: updateDraft,
                  onRunQuery: () => {
                    void handleRunQuery();
                  },
                  onRefreshSession: () => {
                    void handleRefreshSession();
                  },
                  isSubmitting,
                  isRefreshingSession,
                  errorMessage: formError,
                  language
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 bg-white shadow-sm", children: [
                queryRunState.status === "succeeded" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { role: "status", className: "border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900", children: getTranslation("explorer_query_completed", language, {
                  rows: queryRunState.outcome.query.result.returnedRows,
                  duration: queryRunState.outcome.query.result.durationMs,
                  version: queryRunState.outcome.query.loadVersion ?? getTranslation("explorer_unavailable", language)
                }) }) : null,
                queryRunState.status === "failed" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 border-b border-rose-200 bg-rose-50 px-4 py-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "text-sm text-rose-800", children: queryRunState.message }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        void runDraft(queryRunState.draft, queryRunState.draft.templateId);
                      },
                      className: "min-h-[44px] rounded-card border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800",
                      children: getTranslation("explorer_retry", language)
                    }
                  )
                ] }) : null,
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-b border-slate-200 px-4 py-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("explorer_current_result", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mt-2 text-lg font-semibold text-slate-900", children: (resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.explanation) ?? getTranslation("explorer_no_query_selected", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-500", children: getTranslation("explorer_current_result_hint", language) })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block xl:max-w-xs", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("explorer_search_result", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "input",
                        {
                          type: "search",
                          value: searchTerm,
                          onChange: (event) => setSearchTerm(event.target.value),
                          placeholder: getTranslation("explorer_search_placeholder", language),
                          className: "mt-2 min-h-[44px] w-full rounded-card border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 md:min-h-0"
                        }
                      )
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("explorer_rows", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm font-semibold text-slate-900", children: resolvedQueryActivity ? `${resolvedQueryActivity.result.returnedRows} / ${resolvedQueryActivity.result.totalMatchedRows}` : "N/A" })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("explorer_columns", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm font-semibold text-slate-900", children: currentColumns.length })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("explorer_order", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm font-semibold text-slate-900", children: (resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.result.appliedOrderBy.length) ? resolvedQueryActivity.result.appliedOrderBy.map((order) => `${order.column} (${order.direction})`).join(", ") : getTranslation("explorer_no_sort_applied", language) })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("explorer_limit", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm font-semibold text-slate-900", children: (resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.result.appliedLimit) ?? "N/A" })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("explorer_local_sort", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm font-semibold text-slate-900", children: sortSummary })
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "border-b border-slate-200 px-4 py-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-slate-600", children: getTranslation("explorer_technical_query_details", language) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 overflow-hidden rounded-card border border-slate-200 bg-slate-950 text-sm text-slate-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "max-h-[220px] overflow-auto px-3 py-2.5 whitespace-pre-wrap break-words", children: (resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.sqlPreview) ?? "No SQL preview available yet. Run an explorer template or select a query trace from history." }) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  TabulatorTable,
                  {
                    data: filteredRows,
                    columns: currentColumns,
                    pageSize: 25,
                    pageSizeOptions: PAGE_SIZE_OPTIONS,
                    tableKey,
                    language,
                    variant: "database-modal",
                    sortState,
                    onSortChange: setSortState,
                    containerClassName: "h-[420px]",
                    emptyStateText,
                    measureColumns: (((_a = resolvedQueryActivity == null ? void 0 : resolvedQueryActivity.plan) == null ? void 0 : _a.aggregates) ?? []).filter((aggregate) => aggregate.function !== "count" && aggregate.function !== "count_distinct").map((aggregate) => aggregate.as)
                  }
                ) })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              DatabaseModalSidebar,
              {
                csvData,
                queryActivities,
                selectedQueryActivity: resolvedQueryActivity,
                onSelectQueryActivity: setSelectedQueryTraceId,
                onLoadWorkspaceTemplate: handleLoadWorkspaceTemplate,
                onRerunWorkspaceTemplate: () => {
                  void handleRerunWorkspaceTemplate();
                },
                canLoadWorkspaceTemplate: canLoadSelectedTemplate,
                canRerunWorkspaceTemplate: canRerunSelectedTemplate,
                language
              }
            )
          ] })
        ] })
      ]
    }
  ) });
};
export {
  DatabaseModal
};
