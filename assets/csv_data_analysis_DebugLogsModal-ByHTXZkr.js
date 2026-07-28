import { j as jsxRuntimeExports, a as reactExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-LvY-J6mW.js";
import { u as useAppStore, d as useDialogAccessibility } from "./csv_data_analysis_index-L92MBGHW.js";
import { bQ as isEndUserMode, U as getTranslation, bR as selectDebugTimelineEntries, bS as selectDebugFlows, bT as selectRuntimeLogsExport, bU as selectRecentPayloadSnapshotsExport, bV as selectIrDiagnostics, bW as selectPlannerFailureBundle, bX as selectSqlFailureBundle, bY as selectDebugOperatorSummary, bZ as loadRecentLocalDiagnostics, b_ as selectAiDebugBundle } from "./csv_data_analysis_app-agent-DytoEScF.js";
import { c as copyText } from "./csv_data_analysis_copyText-Di0nQNpb.js";
import { I as IconClose } from "./csv_data_analysis_IconClose-Cz0XDY4R.js";
import "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
const entryToneClasses = {
  tool: "border-sky-200 bg-sky-50/40",
  telemetry: "border-emerald-200 bg-emerald-50/40",
  event: "border-amber-200 bg-amber-50/40"
};
const formatTime = (value) => new Date(value).toLocaleString();
const formatJson = (value) => JSON.stringify(value, null, 2);
const traceSeverityClasses = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-rose-200 bg-rose-50 text-rose-800"
};
const DebugLogEntryCard = ({
  entry,
  isSnapshotExpanded,
  onToggleSnapshot
}) => /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: `rounded-card border p-4 ${entryToneClasses[entry.type]}`, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-white/70 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700", children: entry.type }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-white/70 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600", children: entry.label })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-sm font-semibold text-slate-900", children: entry.title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 whitespace-pre-wrap text-sm text-slate-700", children: entry.subtitle })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-start gap-2 sm:items-end", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-slate-500", children: formatTime(entry.timestamp) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onToggleSnapshot,
          className: "rounded-full border border-white/80 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 transition-colors hover:bg-slate-100",
          children: isSnapshotExpanded ? "Hide payload snapshot" : "Show payload snapshot"
        }
      )
    ] })
  ] }),
  entry.traceSummary && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: "Trace contract" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full border px-2.5 py-1 text-[11px] font-semibold ${traceSeverityClasses[entry.traceSummary.severity]}`, children: entry.traceSummary.contractVersion }),
      entry.traceSummary.reasonCode && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700", children: [
        "reasonCode: ",
        entry.traceSummary.reasonCode
      ] }),
      entry.traceSummary.retryClass && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800", children: [
        "retryClass: ",
        entry.traceSummary.retryClass
      ] }),
      entry.traceSummary.failureClass && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-800", children: [
        "failureClass: ",
        entry.traceSummary.failureClass
      ] }),
      entry.traceSummary.abortMode && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700", children: [
        "abortMode: ",
        entry.traceSummary.abortMode
      ] }),
      entry.traceSummary.abortSource && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700", children: [
        "abortSource: ",
        entry.traceSummary.abortSource
      ] }),
      entry.traceSummary.abortPropagationStatus && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700", children: [
        "propagation: ",
        entry.traceSummary.abortPropagationStatus
      ] })
    ] })
  ] }),
  entry.detail && Object.keys(entry.detail).length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: "Detail preview" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "overflow-x-auto rounded-card border border-white/80 bg-white/85 p-3 text-xs text-slate-600", children: formatJson(entry.detail) })
  ] }),
  isSnapshotExpanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: "Payload snapshot" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "overflow-x-auto rounded-card border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100", children: formatJson(entry.payloadSnapshot) })
  ] })
] });
const copyStatusLabel = {
  "runtime-copied": "Runtime logs copied",
  "payloads-copied": "Recent payloads copied",
  "planner-copied": "Planner bundle copied",
  "sql-copied": "SQL bundle copied",
  "flow-copied": "Flow payload copied",
  "trace-copied": "Analysis trace copied",
  "ai-debug-copied": "AI debug bundle copied",
  "error": "Copy failed",
  "idle": "Copy ready"
};
const DebugLogsToolbar = ({
  copyStatus,
  hasPlannerFailure,
  hasSqlFailure,
  hasAnalysisTrace,
  onCopyRuntimeLogs,
  onCopyRecentPayloads,
  onCopyPlannerFailureBundle,
  onCopySqlFailureBundle,
  onCopyAnalysisTrace,
  onCopyAiDebugBundle,
  onOpenWorkflow,
  onOpenWorkspace,
  onClose
}) => /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 px-4 py-3 xl:flex-row xl:items-center xl:justify-between", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-3xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] uppercase tracking-[0.24em] text-slate-500", children: "Debug logs" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "mt-1 text-2xl font-semibold text-slate-950 leading-tight", children: "Runtime logs and telemetry" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-600", children: "Use this modal to inspect recent tool usage, telemetry responses, and agent events for the current report. Expand any log entry to inspect its full payload snapshot." })
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${copyStatus === "error" ? "bg-red-100 text-red-700" : copyStatus !== "idle" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`, children: copyStatusLabel[copyStatus] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "relative", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "flex min-h-[44px] cursor-pointer items-center rounded-card border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100", children: "Advanced exports" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute right-0 z-30 mt-2 grid max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] gap-2 overflow-y-auto rounded-card border border-slate-200 bg-white p-3 shadow-xl", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-600", children: "Each action copies the named diagnostic scope only." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onCopyAiDebugBundle, className: "min-h-[44px] rounded-card border border-indigo-300 bg-indigo-50 px-3 py-2 text-left text-sm font-semibold text-indigo-800", children: "Copy AI debug bundle" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onCopyRecentPayloads, className: "min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700", children: "Copy recent payloads" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onCopyRuntimeLogs, className: "min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700", children: "Copy runtime logs" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onCopyPlannerFailureBundle, disabled: !hasPlannerFailure, className: "min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 disabled:opacity-50", children: "Copy planner failure bundle" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onCopySqlFailureBundle, disabled: !hasSqlFailure, className: "min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 disabled:opacity-50", children: "Copy SQL failure bundle" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onCopyAnalysisTrace, disabled: !hasAnalysisTrace, className: "min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 disabled:opacity-50", children: "Copy analysis trace" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: onOpenWorkflow,
        className: "rounded-card border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100",
        children: "Workflow"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: onOpenWorkspace,
        className: "rounded-card bg-slate-950 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800",
        children: "Artifacts"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        "data-dialog-initial-focus": true,
        onClick: onClose,
        className: "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-card p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
        "aria-label": "Close debug logs modal",
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, {})
      }
    )
  ] })
] }) });
const filterPillClasses = {
  all: "border-slate-300 bg-white text-slate-700",
  tool: "border-sky-200 bg-sky-50 text-sky-800",
  telemetry: "border-emerald-200 bg-emerald-50 text-emerald-800",
  event: "border-amber-200 bg-amber-50 text-amber-800"
};
const DebugLogsSidebar = ({
  currentDatasetId,
  toolLogCount,
  telemetryCount,
  eventCount,
  flowCount,
  localDiagnosticCount,
  activeView,
  activeFilter,
  irDiagnostics,
  operatorSummary,
  onViewChange,
  onFilterChange
}) => {
  const latestOutcome = operatorSummary.latestOutcome;
  const isBlockingFailure = (latestOutcome == null ? void 0 : latestOutcome.lifecycleState) === "failed";
  const latestIssueLabel = isBlockingFailure ? "Latest blocking failure" : (latestOutcome == null ? void 0 : latestOutcome.degraded) ? "Latest degradation reason" : "Latest diagnostic reason";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "space-y-4 overflow-y-auto", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 bg-white p-4 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] uppercase tracking-[0.18em] text-slate-500", children: "Current session" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mt-2 text-lg font-semibold text-slate-950", children: currentDatasetId || "No dataset id" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 space-y-3 text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Tool logs" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: toolLogCount })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Telemetry" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: telemetryCount })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Agent events" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: eventCount })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 bg-white p-4 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] uppercase tracking-[0.18em] text-slate-500", children: "Filters" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 flex flex-wrap gap-2", children: ["timeline", "flows", "trace", "local"].map((view) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => onViewChange(view),
          className: `rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${activeView === view ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"}`,
          children: view
        },
        view
      )) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 flex flex-wrap gap-2", children: ["all", "tool", "telemetry", "event"].map((filter) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => onFilterChange(filter),
          className: `rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${activeFilter === filter ? filterPillClasses[filter] : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"}`,
          children: filter
        },
        filter
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 bg-white p-4 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] uppercase tracking-[0.18em] text-slate-500", children: "Grouped flows" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-sm text-slate-600", children: [
        flowCount,
        " grouped flow",
        flowCount === 1 ? "" : "s",
        " by request/run/step context."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-sm text-slate-600", children: [
        localDiagnosticCount,
        " bounded local diagnostic record",
        localDiagnosticCount === 1 ? "" : "s",
        " retained for up to 7 days."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 bg-white p-4 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] uppercase tracking-[0.18em] text-slate-500", children: "Operator Summary" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 space-y-3 text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Latest outcome" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: latestOutcome ? `${latestOutcome.lifecycleState ?? "unknown"} · ${latestOutcome.recoveryStatus ?? "unclassified"}${latestOutcome.actualOutcomeShape ? ` · ${latestOutcome.actualOutcomeShape}` : ""}${latestOutcome.degraded ? " · degraded" : ""}` : "No runtime outcome recorded" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `rounded-card border p-3 ${isBlockingFailure ? "border-red-200 bg-red-50" : (latestOutcome == null ? void 0 : latestOutcome.degraded) ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: latestIssueLabel }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 break-words font-semibold text-slate-900", children: operatorSummary.latestFailureReason ?? "None" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Latest fallback path" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900 break-words", children: operatorSummary.latestFallbackPath ?? "None" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Retry budget" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: operatorSummary.latestRetry ? `${operatorSummary.latestRetry.count}${operatorSummary.latestRetry.ceiling !== null ? ` / ${operatorSummary.latestRetry.ceiling}` : ""}${operatorSummary.latestRetry.reasonCode ? ` · ${operatorSummary.latestRetry.reasonCode}` : ""}` : "No retries recorded" })
        ] })
      ] })
    ] }),
    irDiagnostics.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 bg-white p-4 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] uppercase tracking-[0.18em] text-slate-500", children: "IR diagnostics" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-sm text-slate-600", children: [
        irDiagnostics.length,
        " derived card interpretation",
        irDiagnostics.length === 1 ? "" : "s",
        " from the current analysis cards."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 space-y-3", children: irDiagnostics.map((entry) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-900", children: entry.displayTitle }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Role:" }),
          " ",
          entry.semanticRole
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Narrative:" }),
          " ",
          entry.narrativeEligibility,
          " · confidence ",
          entry.businessMeaningConfidence.toFixed(2),
          " · score ",
          entry.selectionScore
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Helper exposure:" }),
          " ",
          entry.helperExposureLevel
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Flags:" }),
          " ",
          entry.aggregationQualityFlags.join(", ") || "none"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Reasons:" }),
          " ",
          entry.selectionReasons.join(", ") || "none"
        ] })
      ] }, entry.cardId)) })
    ] })
  ] });
};
function translateSessionStatus(status, language) {
  const key = `session_status_${status}`;
  const result = getTranslation(key, language);
  return result !== key ? result : status;
}
function translateStepStatus(status, language) {
  const key = `step_status_${status}`;
  const result = getTranslation(key, language);
  return result !== key ? result : status;
}
function translateNextDecision(decision, language) {
  const raw = decision ?? "stop";
  const key = `next_decision_${raw}`;
  const result = getTranslation(key, language);
  return result !== key ? result : raw;
}
const statusClassName = (status) => {
  switch (status) {
    case "succeeded":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "rejected":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "failed":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
};
const AnalysisStepsPanel = ({ session, trace, language }) => {
  const endUserMode = isEndUserMode();
  const localize = (entry, field) => {
    const messageField = `${field}I18n`;
    const fallbackMap = {
      label: entry.label,
      whyThisStep: entry.whyThisStep,
      summary: entry.summary,
      result: entry.result
    };
    const message = entry[messageField];
    if (!message) {
      return fallbackMap[field];
    }
    const translatedVars = message.vars && Object.fromEntries(
      Object.entries(message.vars).map(([key, value]) => [key, String(value)])
    );
    const localized = getTranslation(message.key, language, translatedVars);
    if (localized === message.key) {
      return fallbackMap[field];
    }
    return localized;
  };
  if (!session || trace.length === 0) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mb-6 mt-4 rounded-card border border-slate-200 bg-white/95 p-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500", children: getTranslation("analysis_steps_panel_title", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "mt-2 text-2xl font-semibold tracking-tight text-slate-900", children: getTranslation("analysis_steps_panel_subtitle", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 max-w-3xl text-sm leading-6 text-slate-600", children: getTranslation("analysis_steps_panel_description", language) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          getTranslation("analysis_steps_panel_status", language),
          ": ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: translateSessionStatus(session.status, language) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          getTranslation("analysis_steps_panel_accepted_cards", language),
          ": ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: session.acceptedOutputs.length })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          getTranslation("analysis_steps_panel_step_budget", language),
          ": ",
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-semibold text-slate-900", children: [
            session.stepsUsed,
            "/",
            session.maxSteps
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 space-y-3", children: trace.map((entry) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50/70 p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white", children: entry.stepIndex }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold text-slate-900", children: localize(entry, "label") }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-slate-500", children: localize(entry, "whyThisStep") })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClassName(entry.status)}`, children: translateStepStatus(entry.status, language) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("analysis_steps_panel_checked", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 leading-6", children: localize(entry, "summary") })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("analysis_steps_panel_result", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 leading-6", children: localize(entry, "result") })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: getTranslation("analysis_steps_panel_next", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 leading-6", children: translateNextDecision(entry.nextDecision, language) })
        ] })
      ] }),
      !endUserMode && entry.reasonCodes.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 text-xs text-slate-500", children: [
        getTranslation("analysis_steps_panel_reason_codes", language),
        ": ",
        entry.reasonCodes.join(", ")
      ] }),
      entry.queryPreview && /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mt-3 rounded-card border border-slate-200 bg-white p-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer text-sm font-medium text-slate-800", children: getTranslation("analysis_steps_panel_show_sql_preview", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-700", children: entry.queryPreview })
      ] })
    ] }, entry.stepId)) })
  ] });
};
const DebugLogsModal = () => {
  const isOpen = useAppStore((state) => state.isDebugLogsModalOpen);
  if (!isOpen) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(OpenDebugLogsModal, {});
};
const OpenDebugLogsModal = () => {
  reactExports.useEffect(() => {
    const state = useAppStore.getState();
    state.syncTelemetryToStore();
    state.syncTelemetryEventsToStore();
  }, []);
  const {
    setIsDebugLogsModalOpen,
    setIsDataPreparationModalOpen,
    setIsWorkspaceModalOpen,
    agentToolLogs,
    telemetryEvents,
    agentEvents,
    currentDatasetId,
    sessionId,
    activeTurn,
    cleaningRun,
    activeSpreadsheetFilter,
    confirmedAnalysisGoal,
    settings,
    csvData,
    columnProfiles,
    analysisCards,
    queryHistory,
    duckDbSessionStatus,
    chatHistory,
    dataPreparationPlan,
    latestAnalysisSession,
    visibleAnalysisTrace,
    runtimeEvents,
    runtimeRunHistory,
    language
  } = useAppStore((state) => ({
    setIsDebugLogsModalOpen: state.setIsDebugLogsModalOpen,
    setIsDataPreparationModalOpen: state.setIsDataPreparationModalOpen,
    setIsWorkspaceModalOpen: state.setIsWorkspaceModalOpen,
    agentToolLogs: state.agentToolLogs,
    telemetryEvents: state.telemetryEvents,
    agentEvents: state.agentEvents,
    currentDatasetId: state.currentDatasetId,
    sessionId: state.sessionId,
    activeTurn: state.activeTurn,
    cleaningRun: state.cleaningRun,
    activeSpreadsheetFilter: state.activeSpreadsheetFilter,
    confirmedAnalysisGoal: state.confirmedAnalysisGoal,
    settings: state.settings,
    csvData: state.csvData,
    columnProfiles: state.columnProfiles,
    analysisCards: state.analysisCards,
    queryHistory: state.queryHistory,
    duckDbSessionStatus: state.duckDbSessionStatus,
    chatHistory: state.chatHistory,
    dataPreparationPlan: state.dataPreparationPlan,
    latestAnalysisSession: state.latestAnalysisSession,
    visibleAnalysisTrace: state.visibleAnalysisTrace,
    runtimeEvents: state.runtimeEvents,
    runtimeRunHistory: state.runtimeRunHistory,
    language: state.settings.language
  }), shallow$1);
  const closeModal = () => setIsDebugLogsModalOpen(false);
  const openWorkflow = () => setIsDataPreparationModalOpen(true);
  const openWorkspace = () => setIsWorkspaceModalOpen(true);
  const copyResetTimerRef = reactExports.useRef(null);
  const [activeFilter, setActiveFilter] = reactExports.useState("all");
  const [activeView, setActiveView] = reactExports.useState("flows");
  const [copyStatus, setCopyStatus] = reactExports.useState("idle");
  const [expandedSnapshots, setExpandedSnapshots] = reactExports.useState({});
  const [localDiagnostics, setLocalDiagnostics] = reactExports.useState([]);
  const [localDiagnosticsError, setLocalDiagnosticsError] = reactExports.useState(false);
  const dialogRef = useDialogAccessibility(
    true,
    closeModal,
    { restoreFocusSelector: '[data-advanced-trigger="true"]' }
  );
  const debugLogScope = reactExports.useMemo(() => ({
    sessionId,
    currentDatasetId,
    activeTurn,
    cleaningRun,
    activeSpreadsheetFilter,
    agentToolLogs,
    telemetryEvents,
    agentEvents
  }), [activeSpreadsheetFilter, activeTurn, agentEvents, agentToolLogs, cleaningRun, currentDatasetId, sessionId, telemetryEvents]);
  const entries = reactExports.useMemo(() => selectDebugTimelineEntries(debugLogScope), [debugLogScope]);
  const requestFlows = reactExports.useMemo(() => selectDebugFlows(debugLogScope), [debugLogScope]);
  const filteredEntries = reactExports.useMemo(() => {
    if (activeFilter === "all") {
      return entries;
    }
    return entries.filter((entry) => entry.type === activeFilter);
  }, [activeFilter, entries]);
  const debugState = reactExports.useMemo(() => ({
    sessionId,
    currentDatasetId,
    activeTurn,
    cleaningRun,
    activeSpreadsheetFilter,
    telemetryEvents,
    agentToolLogs,
    agentEvents,
    confirmedAnalysisGoal,
    settings,
    csvData,
    columnProfiles,
    analysisCards,
    queryHistory,
    duckDbSessionStatus,
    chatHistory,
    dataPreparationPlan,
    runtimeEvents,
    runtimeRunHistory
  }), [
    sessionId,
    currentDatasetId,
    activeTurn,
    cleaningRun,
    activeSpreadsheetFilter,
    telemetryEvents,
    agentToolLogs,
    agentEvents,
    confirmedAnalysisGoal,
    settings,
    csvData,
    columnProfiles,
    analysisCards,
    queryHistory,
    duckDbSessionStatus,
    chatHistory,
    dataPreparationPlan,
    runtimeEvents,
    runtimeRunHistory
  ]);
  const runtimeLogsExport = reactExports.useMemo(() => selectRuntimeLogsExport(debugState), [debugState]);
  const recentPayloadSnapshotsExport = reactExports.useMemo(() => selectRecentPayloadSnapshotsExport({
    sessionId,
    currentDatasetId,
    activeTurn,
    cleaningRun,
    activeSpreadsheetFilter,
    telemetryEvents,
    agentToolLogs,
    agentEvents,
    analysisCards,
    columnProfiles
  }), [activeSpreadsheetFilter, activeTurn, agentEvents, agentToolLogs, analysisCards, cleaningRun, columnProfiles, currentDatasetId, sessionId, telemetryEvents]);
  const irDiagnostics = reactExports.useMemo(() => selectIrDiagnostics({
    analysisCards,
    columnProfiles
  }), [analysisCards, columnProfiles]);
  const plannerFailureBundle = reactExports.useMemo(() => selectPlannerFailureBundle(debugState), [debugState]);
  const sqlFailureBundle = reactExports.useMemo(() => selectSqlFailureBundle(debugState), [debugState]);
  const operatorSummary = reactExports.useMemo(() => selectDebugOperatorSummary({
    runtimeEvents,
    runtimeRunHistory,
    latestAnalysisSession
  }), [latestAnalysisSession, runtimeEvents, runtimeRunHistory]);
  reactExports.useEffect(() => {
    setLocalDiagnosticsError(false);
    void loadRecentLocalDiagnostics().then(setLocalDiagnostics).catch(() => {
      setLocalDiagnostics([]);
      setLocalDiagnosticsError(true);
    });
  }, []);
  const handleCopy = async (fn, status) => {
    if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    try {
      await copyText(fn());
      setCopyStatus(status);
    } catch (error) {
      console.error("[DebugLogsModal] Copy failed.", error);
      setCopyStatus("error");
    }
    copyResetTimerRef.current = setTimeout(() => setCopyStatus("idle"), 3e3);
  };
  const handleCopyAnalysisTrace = () => handleCopy(() => JSON.stringify({
    session: latestAnalysisSession ? {
      sessionId: latestAnalysisSession.sessionId,
      status: latestAnalysisSession.status,
      stepsUsed: latestAnalysisSession.stepsUsed,
      maxSteps: latestAnalysisSession.maxSteps,
      stopReason: latestAnalysisSession.stopReason,
      acceptedOutputs: latestAnalysisSession.acceptedOutputs,
      rejectedOutputs: latestAnalysisSession.rejectedOutputs
    } : null,
    trace: visibleAnalysisTrace
  }, null, 2), "trace-copied");
  const handleCopyFlowPayload = async (flowId) => {
    const flow = requestFlows.find((entry) => entry.groupId === flowId);
    if (!flow) return;
    await handleCopy(() => JSON.stringify({
      groupId: flow.groupId,
      groupType: flow.groupType,
      updatedAt: flow.updatedAt.toISOString(),
      phase: flow.phase,
      failure: flow.failure,
      correlation: flow.correlation,
      payloadSnapshots: flow.payloadSnapshots
    }, null, 2), "flow-copied");
  };
  const togglePayloadSnapshot = (entryKey) => {
    setExpandedSnapshots((current) => ({
      ...current,
      [entryKey]: !current[entryKey]
    }));
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm", onClick: closeModal, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: dialogRef,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Diagnostic logs",
      tabIndex: -1,
      className: "relative h-screen w-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef4fb_48%,#e7eef7_100%)] flex flex-col",
      onClick: (event) => event.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          DebugLogsToolbar,
          {
            copyStatus,
            hasPlannerFailure: plannerFailureBundle.hasFailure,
            hasSqlFailure: sqlFailureBundle.hasFailure,
            hasAnalysisTrace: visibleAnalysisTrace.length > 0,
            onCopyRuntimeLogs: () => handleCopy(() => runtimeLogsExport, "runtime-copied"),
            onCopyRecentPayloads: () => handleCopy(() => recentPayloadSnapshotsExport, "payloads-copied"),
            onCopyPlannerFailureBundle: () => handleCopy(() => plannerFailureBundle.markdown, "planner-copied"),
            onCopySqlFailureBundle: () => handleCopy(() => sqlFailureBundle.markdown, "sql-copied"),
            onCopyAnalysisTrace: handleCopyAnalysisTrace,
            onCopyAiDebugBundle: () => handleCopy(() => selectAiDebugBundle(useAppStore.getState()), "ai-debug-copied"),
            onOpenWorkflow: () => {
              closeModal();
              openWorkflow();
            },
            onOpenWorkspace: () => {
              closeModal();
              openWorkspace();
            },
            onClose: closeModal
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 overflow-hidden px-4 pb-4 pt-4 lg:px-5 xl:px-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid h-full min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            DebugLogsSidebar,
            {
              currentDatasetId,
              toolLogCount: agentToolLogs.length,
              telemetryCount: telemetryEvents.length,
              eventCount: agentEvents.length,
              flowCount: requestFlows.length,
              localDiagnosticCount: localDiagnostics.length,
              activeView,
              activeFilter,
              irDiagnostics,
              operatorSummary,
              onViewChange: setActiveView,
              onFilterChange: setActiveFilter
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "min-h-0 overflow-hidden rounded-card border border-slate-200 bg-white shadow-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-b border-slate-200 px-4 py-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: activeView === "timeline" ? "Recent log stream" : activeView === "flows" ? "Grouped flow view" : activeView === "trace" ? "Analysis trace" : "Local diagnostics" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-500", children: activeView === "timeline" ? `${filteredEntries.length} entries shown` : activeView === "flows" ? `${requestFlows.length} grouped flows shown` : activeView === "trace" ? `${visibleAnalysisTrace.length} steps` : `${localDiagnostics.length} records retained for up to 7 days` })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full overflow-y-auto p-4", children: activeView === "local" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 pb-10", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "rounded-card border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900", children: "These local-only diagnostics may contain prompts, selected samples, and model responses. Credentials are always redacted. Do not attach this view to a public issue; use the sanitized support bundle instead." }),
              localDiagnosticsError ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-800", children: "Local diagnostics could not be read. Close and reopen Logs to retry." }) : localDiagnostics.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-h-[280px] items-center justify-center text-center text-slate-500", children: "No persisted local diagnostics yet." }) : localDiagnostics.map((record) => /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: `rounded-card border p-3 ${record.outcome === "failed" || record.outcome === "blocked" ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-slate-50"}`, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("summary", { className: "cursor-pointer text-sm font-semibold text-slate-900", children: [
                  record.phase,
                  " · ",
                  record.tool,
                  " · ",
                  record.outcome
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-900", children: "Run" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all", children: record.runId ?? "N/A" })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-900", children: "Recorded" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: record.recordedAt })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-900", children: "Provider / model" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("dd", { children: [
                      record.provider,
                      " · ",
                      record.model ?? "N/A"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-900", children: "Attempt / duration" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("dd", { children: [
                      record.attempt,
                      " · ",
                      record.durationMs ?? "N/A",
                      " ms"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-900", children: "Reason" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all", children: record.reasonCode ?? "N/A" })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-900", children: "Expires" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: record.expiresAt })
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-xs text-slate-100", children: JSON.stringify(record.payload, null, 2) })
              ] }, record.id))
            ] }) : activeView === "trace" ? visibleAnalysisTrace.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full min-h-[280px] items-center justify-center text-center text-slate-500", children: "No analysis trace available yet." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pb-10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              AnalysisStepsPanel,
              {
                session: latestAnalysisSession,
                trace: visibleAnalysisTrace,
                language
              }
            ) }) : requestFlows.length === 0 && filteredEntries.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full min-h-[280px] items-center justify-center text-center text-slate-500", children: "No logs available for this filter yet." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4 pb-10", children: activeView === "flows" ? requestFlows.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full min-h-[280px] items-center justify-center text-center text-slate-500", children: "No grouped flows are available yet." }) : requestFlows.map((flow) => {
              var _a, _b, _c, _d;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: `rounded-card border p-4 ${flow.failure ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-slate-50/80"}`, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs uppercase tracking-[0.18em] text-slate-500", children: [
                      flow.groupType.replace("_", " "),
                      " · ",
                      flow.groupId
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm font-semibold text-slate-900", children: flow.title }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-600", children: flow.summary })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => handleCopyFlowPayload(flow.groupId),
                      className: "rounded-card border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100",
                      children: "Copy Flow Payload"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 grid gap-2 text-sm text-slate-700", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Phase:" }),
                    " ",
                    flow.phase ?? "unknown"
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Counts:" }),
                    " tools ",
                    flow.counts.toolLogs,
                    ", telemetry ",
                    flow.counts.telemetryEvents,
                    ", events ",
                    flow.counts.agentEvents
                  ] }),
                  ((_a = flow.traceSummary) == null ? void 0 : _a.reasonCode) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Reason code:" }),
                    " ",
                    flow.traceSummary.reasonCode
                  ] }),
                  ((_b = flow.traceSummary) == null ? void 0 : _b.retryClass) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Retry class:" }),
                    " ",
                    flow.traceSummary.retryClass
                  ] }),
                  ((_c = flow.traceSummary) == null ? void 0 : _c.failureClass) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Failure class:" }),
                    " ",
                    flow.traceSummary.failureClass
                  ] }),
                  ((_d = flow.traceSummary) == null ? void 0 : _d.abortMode) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Abort:" }),
                    " ",
                    flow.traceSummary.abortMode,
                    " · ",
                    flow.traceSummary.abortSource ?? "unknown",
                    " · ",
                    flow.traceSummary.abortPropagationStatus ?? "unknown"
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Tools:" }),
                    " ",
                    flow.toolNames.join(", ") || "N/A"
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Correlation:" }),
                    " ",
                    /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs", children: JSON.stringify(flow.correlation) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Observations:" }),
                    " ",
                    flow.observations[0] ?? "N/A"
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: "Final reply:" }),
                    " ",
                    flow.finalReply ?? "N/A"
                  ] })
                ] })
              ] }, flow.groupId);
            }) : filteredEntries.map((entry) => {
              const entryKey = `${entry.type}-${entry.id}`;
              return /* @__PURE__ */ jsxRuntimeExports.jsx(
                DebugLogEntryCard,
                {
                  entry,
                  isSnapshotExpanded: Boolean(expandedSnapshots[entryKey]),
                  onToggleSnapshot: () => togglePayloadSnapshot(entryKey)
                },
                entryKey
              );
            }) }) })
          ] })
        ] }) })
      ]
    }
  ) });
};
export {
  DebugLogsModal
};
