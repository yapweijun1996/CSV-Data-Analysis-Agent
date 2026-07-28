import { W as We, j as jsxRuntimeExports, a as reactExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-LvY-J6mW.js";
import { u as useAppStore, d as useDialogAccessibility } from "./csv_data_analysis_index-L92MBGHW.js";
import { bE as summarizeTraceContract, a8 as getCurrentAnalysisDatasetVersion, a_ as resolveCardTrustDecision, bg as buildDataPreparationWorkflowBundle, U as getTranslation, bL as readDatasetFileFromOpfs, be as getCsvDataRowCount, bM as getSandboxTableRows, bN as buildWorkflowSnapshotExport, bO as buildCleaningFailureBundleExport } from "./csv_data_analysis_app-agent-DytoEScF.js";
import { c as copyText } from "./csv_data_analysis_copyText-Di0nQNpb.js";
import { I as IconClose } from "./csv_data_analysis_IconClose-Cz0XDY4R.js";
import { A as AgentActivityView } from "./csv_data_analysis_AgentActivityView-DyuWYDYj.js";
import { c as exportDatasetToCsv } from "./csv_data_analysis_exportUtils-CPeSo2GB.js";
import "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
const stepStatusClasses = {
  done: "bg-emerald-100 text-emerald-800 border-emerald-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  blocked: "bg-rose-100 text-rose-800 border-rose-200",
  not_started: "bg-slate-100 text-slate-600 border-slate-200"
};
const badgeClasses = {
  "AI Cleaned": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "No Data Edits Applied Yet": "bg-amber-100 text-amber-800 border-amber-200",
  "Cleaning Blocked": "bg-rose-100 text-rose-800 border-rose-200",
  "Baseline Prepared": "bg-sky-100 text-sky-800 border-sky-200"
};
const mappingResultClasses = {
  "baseline-fixed": "bg-sky-100 text-sky-800 border-sky-200",
  "ai-executed": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "proposed-only": "bg-amber-100 text-amber-800 border-amber-200",
  "blocked": "bg-rose-100 text-rose-800 border-rose-200"
};
const countLabel = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;
const formatResultLabel = (value) => value.replace("-", " ");
const formatDelimiter = (value) => value === "	" ? "tab" : value ?? "unknown";
const formatQuote = (value) => value === "'" ? "single quote" : value === '"' ? "double quote" : "none";
const DataPreparationWorkflowContent = ({
  workflow,
  defaultDetailMode = "full",
  embeddedInDialog = false,
  onPrimaryAction,
  onOpenWorkspace,
  onOpenActivity = () => void 0,
  activityEvents = [],
  activitySessionId = "",
  activityDatasetId = null,
  onConfirmStructureBoundary,
  onSaveStructureBoundaryOverride
}) => {
  var _a2, _b2, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
  const [showTechnicalDetails, setShowTechnicalDetails] = We.useState(defaultDetailMode === "full");
  const latestPipelineTrace = summarizeTraceContract(workflow.operationalSignals.latestPipelineTrace);
  const latestToolTrace = summarizeTraceContract(workflow.operationalSignals.latestToolTrace);
  const latestTelemetryTrace = summarizeTraceContract(workflow.operationalSignals.latestTelemetryTrace);
  const structureReview = workflow.structureReview;
  const carryForwardAppliedCount = Object.values(((_a2 = structureReview == null ? void 0 : structureReview.canonicalBuildMeta) == null ? void 0 : _a2.carryForwardAppliedCounts) ?? {}).reduce((sum, count) => sum + Number(count), 0);
  const excludedGroupRows = ((_c = (_b2 = structureReview == null ? void 0 : structureReview.canonicalBuildMeta) == null ? void 0 : _b2.excludedRowCounts) == null ? void 0 : _c.group_header) ?? 0;
  const excludedSummaryRows = (((_e = (_d = structureReview == null ? void 0 : structureReview.canonicalBuildMeta) == null ? void 0 : _d.excludedRowCounts) == null ? void 0 : _e.summary) ?? 0) + (((_g = (_f = structureReview == null ? void 0 : structureReview.canonicalBuildMeta) == null ? void 0 : _f.excludedRowCounts) == null ? void 0 : _g.footer) ?? 0) + (((_i = (_h = structureReview == null ? void 0 : structureReview.canonicalBuildMeta) == null ? void 0 : _h.excludedRowCounts) == null ? void 0 : _i.subtotal) ?? 0);
  const [headerRowInput, setHeaderRowInput] = We.useState("");
  const [bodyStartInput, setBodyStartInput] = We.useState("");
  const [summaryStartInput, setSummaryStartInput] = We.useState("");
  We.useEffect(() => {
    const detectedBoundary = structureReview == null ? void 0 : structureReview.detectedBoundary;
    setHeaderRowInput((detectedBoundary == null ? void 0 : detectedBoundary.headerRowIndex) !== null && (detectedBoundary == null ? void 0 : detectedBoundary.headerRowIndex) !== void 0 ? String(detectedBoundary.headerRowIndex + 1) : "");
    setBodyStartInput((detectedBoundary == null ? void 0 : detectedBoundary.bodyStartIndex) !== null && (detectedBoundary == null ? void 0 : detectedBoundary.bodyStartIndex) !== void 0 ? String(detectedBoundary.bodyStartIndex + 1) : "");
    setSummaryStartInput((detectedBoundary == null ? void 0 : detectedBoundary.summaryStartIndex) !== null && (detectedBoundary == null ? void 0 : detectedBoundary.summaryStartIndex) !== void 0 ? String(detectedBoundary.summaryStartIndex + 1) : "");
  }, [structureReview]);
  const parseOneBasedIndex = (value) => {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : null;
  };
  const handleSaveBoundaryOverride = () => {
    var _a3, _b3, _c2;
    const headerRowIndex = parseOneBasedIndex(headerRowInput);
    const bodyStartIndex = parseOneBasedIndex(bodyStartInput);
    const summaryStartIndex = summaryStartInput.trim() ? parseOneBasedIndex(summaryStartInput) : null;
    if (headerRowIndex === null || bodyStartIndex === null) {
      return;
    }
    onSaveStructureBoundaryOverride({
      headerRowIndex,
      headerLayerRowIndexes: ((_a3 = structureReview == null ? void 0 : structureReview.detectedBoundary) == null ? void 0 : _a3.headerLayerRowIndexes) ?? [],
      bodyStartIndex,
      summaryStartIndex,
      parameterRowIndexes: ((_b3 = structureReview == null ? void 0 : structureReview.detectedBoundary) == null ? void 0 : _b3.parameterRowIndexes) ?? [],
      repeatedHeaderRowIndexes: ((_c2 = structureReview == null ? void 0 : structureReview.detectedBoundary) == null ? void 0 : _c2.repeatedHeaderRowIndexes) ?? []
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 bg-white shadow-sm p-5 lg:p-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between", children: [
      !embeddedInDialog && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs uppercase tracking-wider text-slate-500", children: "AI Data IDE workflow" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "mt-1 text-xl font-semibold text-slate-900", children: "Data Preparation Workflow" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-500", children: "Fullscreen review of import, inspect, prepare, verify, and analysis gating. Use Artifacts for full handoff files and diagnostics." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
        workflow.preparation.badgeLabel && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badgeClasses[workflow.preparation.badgeLabel]}`, children: workflow.preparation.badgeLabel }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onPrimaryAction,
            className: "min-h-[44px] px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors md:min-h-0",
            children: workflow.cta.primaryLabel
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onOpenWorkspace,
            className: "min-h-[44px] px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors md:min-h-0",
            children: workflow.cta.secondaryLabel
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onOpenActivity,
            className: "min-h-[44px] px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors md:min-h-0",
            children: "Assistant Activity"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-5 grid gap-3 md:grid-cols-5", children: workflow.steps.map((step) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 p-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: step.label }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stepStatusClasses[step.status]}`, children: step.status.replace("_", " ") })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs text-slate-600", children: step.description })
    ] }, step.id)) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-6 rounded-card border border-slate-200 bg-slate-50 p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Dataset" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900 break-all", children: workflow.summary.fileName })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Rows prepared" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 font-semibold text-slate-900", children: [
            workflow.summary.preparedRowCount,
            " of ",
            workflow.summary.rawRowCount
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Verification" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: workflow.verification.overallStatus })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Analysis" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: workflow.summary.analysisState.replace("_", " ") })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-600", children: workflow.summary.issueCount > 0 ? `${workflow.summary.issueCount} issue${workflow.summary.issueCount === 1 ? "" : "s"} recorded. Review technical details only when you need to diagnose or override the preparation.` : "No preparation issues were recorded. Technical details remain available for audit." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            "aria-expanded": showTechnicalDetails,
            onClick: () => setShowTechnicalDetails((current) => !current),
            className: "min-h-[44px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100",
            children: showTechnicalDetails ? "Hide technical workflow details" : "Show technical workflow details"
          }
        )
      ] })
    ] }),
    showTechnicalDetails && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-6 rounded-card border border-slate-200 bg-slate-50 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 flex flex-wrap items-start justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Assistant Activity" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-500", children: "Report-scoped intake, preparation, research, tool, approval, artifact, and terminal events." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: onOpenActivity,
              className: "min-h-[44px] rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 md:min-h-0",
              children: "Open Full Activity"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          AgentActivityView,
          {
            events: activityEvents,
            sessionId: activitySessionId,
            datasetId: activityDatasetId,
            limit: 8,
            compact: true
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 grid gap-6 xl:grid-cols-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Dataset Facts" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "File" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900 break-all", children: workflow.summary.fileName })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Rows" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 font-semibold text-slate-900", children: [
                workflow.summary.rawRowCount,
                " raw ",
                "->",
                " ",
                workflow.summary.preparedRowCount,
                " prepared"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Structure" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 font-semibold text-slate-900", children: [
                "Header ",
                workflow.summary.headerDepth,
                " · Summary ",
                workflow.summary.summaryRowCount
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Metadata Rows" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: workflow.summary.metadataRowCount })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Issues" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: workflow.summary.issueCount })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Analysis" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: workflow.summary.analysisState.replace("_", " ") })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-md border border-slate-200 bg-slate-50 p-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: "Parser Diagnostics" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-sm text-slate-700", children: [
                  workflow.summary.parserStrategy ?? "unknown",
                  " · ",
                  workflow.summary.parserConfidence ?? "unknown",
                  " confidence"
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm text-slate-600", children: [
                "Delimiter: ",
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-900", children: formatDelimiter(workflow.summary.detectedDelimiter) }),
                " · ",
                "Quote: ",
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-900", children: formatQuote(workflow.summary.detectedQuoteChar) })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Warnings" }),
              workflow.summary.parserWarnings.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-700", children: "No parser warnings recorded." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-1 space-y-1 text-sm text-slate-700 list-disc list-inside", children: workflow.summary.parserWarnings.slice(0, 2).map((warning) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: warning }, warning)) })
            ] })
          ] })
        ] }),
        structureReview && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Structure Review" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-600", children: structureReview.requiresHumanReview ? "Boundary confirmation is required before automatic analysis can trust the canonical dataset." : "Current report boundary is resolved. You can still override it if needed." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center self-start rounded-full border px-3 py-1 text-xs font-semibold ${structureReview.requiresHumanReview ? "border-amber-200 bg-amber-100 text-amber-800" : "border-emerald-200 bg-emerald-100 text-emerald-800"}`, children: structureReview.source ?? "unknown source" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-3 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Header row" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: ((_j = structureReview.detectedBoundary) == null ? void 0 : _j.headerRowIndex) !== null && ((_k = structureReview.detectedBoundary) == null ? void 0 : _k.headerRowIndex) !== void 0 ? structureReview.detectedBoundary.headerRowIndex + 1 : "unknown" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Body start" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: ((_l = structureReview.detectedBoundary) == null ? void 0 : _l.bodyStartIndex) !== null && ((_m = structureReview.detectedBoundary) == null ? void 0 : _m.bodyStartIndex) !== void 0 ? structureReview.detectedBoundary.bodyStartIndex + 1 : "unknown" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Summary start" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: ((_n = structureReview.detectedBoundary) == null ? void 0 : _n.summaryStartIndex) !== null && ((_o = structureReview.detectedBoundary) == null ? void 0 : _o.summaryStartIndex) !== void 0 ? structureReview.detectedBoundary.summaryStartIndex + 1 : "none" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-4 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Overall confidence" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 font-semibold text-slate-900", children: [
                Math.round((((_p = structureReview.confidence) == null ? void 0 : _p.overall) ?? 0) * 100),
                "%"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Canonicalization" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: structureReview.canonicalizationStatus.replace("_", " ") })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Canonical rows" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: ((_q = structureReview.canonicalBuildMeta) == null ? void 0 : _q.rowCount) ?? 0 })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Pipeline outcome" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: ((_s = (_r = structureReview.pipelineOutcome) == null ? void 0 : _r.status) == null ? void 0 : _s.replace(/_/g, " ")) ?? "not resolved" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-4 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Group rows excluded" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: excludedGroupRows })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Summary/footer excluded" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: excludedSummaryRows })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Carry-forward applied" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: carryForwardAppliedCount })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Footer totals" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: ((_t = structureReview.canonicalBuildMeta) == null ? void 0 : _t.footerTotalsMatched) === null ? "not checked" : ((_u = structureReview.canonicalBuildMeta) == null ? void 0 : _u.footerTotalsMatched) ? "matched" : "mismatch" })
            ] })
          ] }),
          structureReview.proposalVerification && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-md border border-slate-200 bg-white p-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: "Model structure proposal" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-slate-600", children: structureReview.proposalVerification.purpose ?? "Purpose was not resolved." })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "span",
                {
                  className: `rounded-full px-2.5 py-1 text-xs font-semibold ${structureReview.proposalVerification.tier === "pass" ? "bg-emerald-100 text-emerald-800" : structureReview.proposalVerification.tier === "warn" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}`,
                  children: structureReview.proposalVerification.tier.toUpperCase()
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid gap-3 sm:grid-cols-3 text-xs", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 p-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Verified grain" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-medium text-slate-900", children: structureReview.proposalVerification.grainColumns.join(", ") || "unresolved" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 p-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Pivot shape" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-medium text-slate-900", children: ((_v = structureReview.proposalVerification.pivotShape) == null ? void 0 : _v.replace(/_/g, " ")) ?? "unknown" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 p-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Proposal confidence" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 font-medium text-slate-900", children: [
                  Math.round(structureReview.proposalVerification.proposalConfidence * 100),
                  "%"
                ] })
              ] })
            ] }),
            structureReview.proposalVerification.issues.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-3 space-y-1 text-xs text-slate-700 list-disc list-inside", children: structureReview.proposalVerification.issues.map((issue) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: issue.message }, `${issue.code}:${issue.message}`)) })
          ] }),
          (((_x = (_w = structureReview.verificationSummary) == null ? void 0 : _w.unresolvedMissingKeyDimensions) == null ? void 0 : _x.length) ?? 0) > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold", children: "Unresolved dimensions after carry-forward" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1", children: (_y = structureReview.verificationSummary) == null ? void 0 : _y.unresolvedMissingKeyDimensions.join(", ") })
          ] }),
          structureReview.blockingReasons.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold", children: "Blocking reasons" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-1 list-disc list-inside", children: structureReview.blockingReasons.map((reason) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: reason }, reason)) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-md border border-slate-200 bg-slate-50 p-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: "Boundary confirmation" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-slate-600", children: "Enter 1-based row numbers. Saving an override marks the structure as human confirmed and rebuilds the canonical dataset." }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid gap-3 sm:grid-cols-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-sm text-slate-700", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Header Row" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    value: headerRowInput,
                    onChange: (event) => setHeaderRowInput(event.target.value),
                    className: "mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:min-h-0",
                    inputMode: "numeric"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-sm text-slate-700", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Body Start" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    value: bodyStartInput,
                    onChange: (event) => setBodyStartInput(event.target.value),
                    className: "mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:min-h-0",
                    inputMode: "numeric"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-sm text-slate-700", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Summary Start" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    value: summaryStartInput,
                    onChange: (event) => setSummaryStartInput(event.target.value),
                    className: "mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:min-h-0",
                    inputMode: "numeric",
                    placeholder: "optional"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex flex-wrap gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: onConfirmStructureBoundary,
                  className: "min-h-[44px] rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors md:min-h-0",
                  children: "Confirm Detected Boundary"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: handleSaveBoundaryOverride,
                  className: "min-h-[44px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors md:min-h-0",
                  children: "Save Boundary Override"
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Issue -> Action -> Result" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex flex-wrap gap-2 text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-700", children: countLabel(workflow.issueSummary.mappings.length, "workflow action", "workflow actions") }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-700", children: countLabel(workflow.issueSummary.topWarnings.length, "top warning", "top warnings") })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 space-y-3", children: workflow.issueSummary.mappings.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-500", children: "No deterministic preparation actions or blockers were recorded for this run." }) : workflow.issueSummary.mappings.map((mapping) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md border border-slate-200 bg-slate-50 p-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Issue" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: mapping.issue })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center self-start rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${mappingResultClasses[mapping.result]}`, children: formatResultLabel(mapping.result) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-md border border-white/70 bg-white px-3 py-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Action" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-700", children: mapping.action })
            ] })
          ] }, `${mapping.issue}-${mapping.result}`)) }),
          workflow.issueSummary.topWarnings.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: "Top warnings" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-1 text-sm text-slate-700 list-disc list-inside", children: workflow.issueSummary.topWarnings.map((warning) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: warning }, warning)) })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Preparation Result" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-sm text-slate-700", children: workflow.preparation.blockedMessage ?? workflow.preparation.explanation ?? "No AI cleaning explanation was stored for this run." }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-3 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Operation pipeline" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: workflow.preparation.noExecutableOperations ? "No executable operations" : countLabel(workflow.preparation.operationCount, "operation", "operations") })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Baseline noise rows removed" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: workflow.summary.baselineNoiseRowsRemoved })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Plan status" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: workflow.summary.planStatus ?? "not started" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-md border border-slate-200 bg-slate-50 p-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-slate-900", children: "Operation Pipeline" }),
            workflow.preparation.operations.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-slate-500", children: "No executable operations were stored for this run. Prepared rows therefore reflect deterministic baseline preparation only." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ol", { className: "mt-2 space-y-2 text-sm text-slate-700 list-decimal list-inside", children: workflow.preparation.operations.map((operation) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: operation.type }),
              ": ",
              operation.reason
            ] }, operation.id)) })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Verification & Diff Preview" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid gap-3 sm:grid-cols-3 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Overall" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: workflow.verification.overallStatus })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Dataset Safety" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: workflow.verification.datasetSafetyStatus })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Cleaning Consistency" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: workflow.verification.cleaningConsistencyStatus })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid gap-3 sm:grid-cols-2 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "SQL Precheck" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: workflow.verification.sqlPrecheckStatus })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Blocking SQL findings" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: workflow.verification.sqlPrecheckBlockingFindings.length })
            ] })
          ] }),
          workflow.verification.sqlPrecheckSummary && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-900", children: "SQL precheck summary" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1", children: workflow.verification.sqlPrecheckSummary })
          ] }),
          workflow.verification.sqlPrecheckBlockingFindings.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold", children: "Blocking SQL precheck findings" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-1 list-disc list-inside", children: workflow.verification.sqlPrecheckBlockingFindings.map((finding, index) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: finding.message }, `${finding.kind}-${finding.column ?? finding.metric ?? finding.dimension ?? index}`)) })
          ] }),
          workflow.verification.shapeFailureSignalKey && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold", children: "Shape verification detail" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1", children: [
              "Signal: ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono", children: workflow.verification.shapeFailureSignalKey })
            ] }),
            workflow.verification.shapeFailureDetail && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-mono text-xs break-all", children: workflow.verification.shapeFailureDetail })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-2 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Row delta" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 font-semibold text-slate-900", children: [
                workflow.diff.rowCountBefore,
                " ",
                "->",
                " ",
                workflow.diff.rowCountAfter,
                " (",
                workflow.diff.rowCountDelta >= 0 ? "+" : "",
                workflow.diff.rowCountDelta,
                ")"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Schema delta" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 font-semibold text-slate-900", children: [
                workflow.diff.removedColumns.length,
                " removed · ",
                workflow.diff.addedColumns.length,
                " added · ",
                workflow.diff.changedColumns.length,
                " type changes"
              ] })
            ] })
          ] }),
          (workflow.diff.removedColumns.length > 0 || workflow.diff.addedColumns.length > 0 || workflow.diff.changedColumns.length > 0) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700", children: [
            workflow.diff.removedColumns.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-900", children: "Removed columns" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 flex flex-wrap gap-2", children: workflow.diff.removedColumns.map((column) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700", children: column }, `removed-${column}`)) })
            ] }),
            workflow.diff.addedColumns.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-900", children: "Added columns" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 flex flex-wrap gap-2", children: workflow.diff.addedColumns.map((column) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700", children: column }, `added-${column}`)) })
            ] }),
            workflow.diff.changedColumns.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-900", children: "Type changes" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 flex flex-wrap gap-2", children: workflow.diff.changedColumns.map((change) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800", children: `${change.name}: ${change.before ?? "unknown"} -> ${change.after ?? "unknown"}` }, `changed-${change.name}`)) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-card border border-slate-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-base font-semibold text-slate-900", children: "Operational Signals" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-slate-600", children: "Canonical trace contract fields exposed directly from cleaning, tool, and telemetry surfaces." }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-3 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Pipeline trace" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: (latestPipelineTrace == null ? void 0 : latestPipelineTrace.reasonCode) ?? "None" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-slate-600", children: (latestPipelineTrace == null ? void 0 : latestPipelineTrace.contractVersion) ?? "N/A" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Tool trace" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: (latestToolTrace == null ? void 0 : latestToolTrace.reasonCode) ?? "None" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-slate-600", children: (latestToolTrace == null ? void 0 : latestToolTrace.retryClass) ?? "No retry class" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-slate-50 border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-500", children: "Telemetry trace" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-semibold text-slate-900", children: (latestTelemetryTrace == null ? void 0 : latestTelemetryTrace.reasonCode) ?? "None" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-slate-600", children: (latestTelemetryTrace == null ? void 0 : latestTelemetryTrace.source) ?? "N/A" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-900", children: "Latest fallback path" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1", children: workflow.operationalSignals.latestFallbackPath ?? "No fallback path recorded." })
          ] })
        ] })
      ] })
    ] })
  ] });
};
const pickDataPreparationWorkflowState = (state) => ({
  sessionId: state.sessionId,
  currentView: state.currentView,
  currentDatasetId: state.currentDatasetId,
  csvData: state.csvData,
  rawCsvData: state.rawCsvData,
  rawIntakeIr: state.rawIntakeIr,
  initialDataSample: state.initialDataSample,
  columnProfiles: state.columnProfiles,
  dataPreparationPlan: state.dataPreparationPlan,
  dataQualityIssues: state.dataQualityIssues,
  cleaningRun: state.cleaningRun,
  reportStructureResolution: state.reportStructureResolution,
  canonicalCsvData: state.canonicalCsvData,
  canonicalBuildMeta: state.canonicalBuildMeta,
  canonicalizationStatus: state.canonicalizationStatus,
  pipelineOutcome: state.pipelineOutcome,
  analysisCards: state.analysisCards,
  finalSummary: state.finalSummary,
  agentEvents: state.agentEvents,
  agentToolLogs: state.agentToolLogs,
  runtimeEvents: state.runtimeEvents,
  runtimeRunHistory: state.runtimeRunHistory,
  telemetryEvents: state.telemetryEvents,
  spreadsheetFilterFunction: state.spreadsheetFilterFunction,
  activeSpreadsheetFilter: state.activeSpreadsheetFilter,
  aiFilterExplanation: state.aiFilterExplanation,
  activeDataQuery: state.activeDataQuery,
  settings: state.settings,
  isGeneratingReport: state.isGeneratingReport
});
const SUPPORT_BUNDLE_SCHEMA_VERSION = 1;
const DIAGNOSTIC_CODE_PATTERN = /^[a-z0-9][a-z0-9_.:/-]{0,99}$/i;
const countTrustStates = (state) => {
  const counts = {
    verified: 0,
    caveated: 0,
    unverified: 0,
    stale: 0,
    weak: 0
  };
  const currentVersion = getCurrentAnalysisDatasetVersion(state);
  for (const card of state.analysisCards ?? []) {
    counts[resolveCardTrustDecision(card, currentVersion).status] += 1;
  }
  return counts;
};
const getFailureCode = (event) => {
  var _a2, _b2;
  const code = ((_a2 = event.detail) == null ? void 0 : _a2.failureStage) ?? ((_b2 = event.detail) == null ? void 0 : _b2.reasonCode);
  return typeof code === "string" && DIAGNOSTIC_CODE_PATTERN.test(code) ? code : null;
};
const diagnosticCode = (value) => typeof value === "string" && DIAGNOSTIC_CODE_PATTERN.test(value) ? value : null;
const boundedNumber = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
const runtimeOutcome = (type) => {
  if (type === "turn_completed") return "succeeded";
  if (type === "turn_cancelled") return "cancelled";
  if (type === "turn_blocked") return "blocked";
  if (type === "turn_failed" || type === "action_execution_error") return "failed";
  return "started";
};
const buildPublicBetaSupportBundle = (state, environment) => {
  var _a2, _b2, _c, _d;
  const dataset = state.canonicalCsvData ?? state.csvData;
  const failures = (state.agentEvents ?? []).filter((event) => event.status === "error").slice(-20).map((event) => ({
    phase: diagnosticCode(event.phase),
    step: diagnosticCode(event.step),
    code: getFailureCode(event)
  }));
  const runtimeEvents = (state.runtimeEvents ?? []).slice(-30).map((event) => {
    var _a3, _b3, _c2, _d2, _e;
    return {
      phase: diagnosticCode(event.stage) ?? "runtime",
      attempt: boundedNumber(((_a3 = event.detail) == null ? void 0 : _a3.retryAttempt) ?? ((_b3 = event.detail) == null ? void 0 : _b3.attempt)) ?? 1,
      tool: diagnosticCode((_c2 = event.detail) == null ? void 0 : _c2.toolName) ?? diagnosticCode(event.type),
      durationMs: boundedNumber((_d2 = event.detail) == null ? void 0 : _d2.durationMs),
      outcome: runtimeOutcome(event.type),
      reasonCode: diagnosticCode((_e = event.detail) == null ? void 0 : _e.reasonCode) ?? diagnosticCode(event.reason) ?? diagnosticCode(event.failureClass) ?? diagnosticCode(event.type),
      failureClass: diagnosticCode(event.failureClass)
    };
  });
  const payload = {
    schemaVersion: SUPPORT_BUNDLE_SCHEMA_VERSION,
    generatedAt: environment.generatedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    release: {
      appVersion: environment.appVersion,
      commit: environment.releaseCommit
    },
    browser: {
      userAgent: environment.userAgent,
      language: environment.language
    },
    provider: {
      kind: diagnosticCode((_a2 = state.settings) == null ? void 0 : _a2.provider) ?? "default",
      chatModel: diagnosticCode((_b2 = state.settings) == null ? void 0 : _b2.simpleModel),
      analysisModel: diagnosticCode((_c = state.settings) == null ? void 0 : _c.complexModel)
    },
    datasetShape: dataset ? {
      rowCount: dataset.data.length,
      columnCount: dataset.data[0] ? Object.keys(dataset.data[0]).length : 0
    } : null,
    pipeline: state.pipelineOutcome ? {
      status: diagnosticCode(state.pipelineOutcome.status),
      severity: diagnosticCode(state.pipelineOutcome.severity),
      reasonCode: diagnosticCode(state.pipelineOutcome.reasonCode)
    } : null,
    cards: {
      total: ((_d = state.analysisCards) == null ? void 0 : _d.length) ?? 0,
      trustStates: countTrustStates(state)
    },
    recentFailures: failures,
    runtime: {
      recentEvents: runtimeEvents,
      recentRuns: (state.runtimeRunHistory ?? []).slice(-10).map((run) => {
        var _a3;
        return {
          outcomeKind: diagnosticCode(run.outcomeKind),
          lifecycleState: diagnosticCode(run.lifecycleState),
          retryCount: run.retryCount,
          failureClass: diagnosticCode(run.failureClass),
          recoveryStatus: diagnosticCode(
            (_a3 = run.recoveryTrace) == null ? void 0 : _a3.recoveryStatus
          )
        };
      })
    },
    privacy: {
      containsRawRows: false,
      containsColumnNames: false,
      containsFileName: false,
      containsPromptsOrChat: false,
      containsSqlOrQueryResults: false,
      containsCredentials: false,
      automaticUpload: false
    }
  };
  return [
    "# Public Beta Sanitized Support Bundle",
    "",
    "Review this local file before attaching it to a public GitHub issue.",
    "It contains environment metadata, counts, lifecycle states, and reason codes only.",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```"
  ].join("\n");
};
var ch2 = {};
var wk = (function(c, id, msg, transfer, cb) {
  var w = new Worker(ch2[id] || (ch2[id] = URL.createObjectURL(new Blob([
    c + ';addEventListener("error",function(e){e=e.error;postMessage({$e$:[e.message,e.code,e.stack]})})'
  ], { type: "text/javascript" }))));
  w.onmessage = function(e) {
    var d = e.data, ed = d.$e$;
    if (ed) {
      var err2 = new Error(ed[0]);
      err2["code"] = ed[1];
      err2.stack = ed[2];
      cb(err2, null);
    } else
      cb(null, d);
  };
  w.postMessage(msg, transfer);
  return w;
});
var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), revfd = _b.r;
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
  var x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (var i = 0; i < 144; ++i)
  flt[i] = 8;
for (var i = 144; i < 256; ++i)
  flt[i] = 9;
for (var i = 256; i < 280; ++i)
  flt[i] = 7;
for (var i = 280; i < 288; ++i)
  flt[i] = 8;
var fdt = new u8(32);
for (var i = 0; i < 32; ++i)
  fdt[i] = 5;
var flm = /* @__PURE__ */ hMap(flt, 9, 0);
var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var wbits = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
};
var wbits16 = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
  d[o + 2] |= v >> 16;
};
var hTree = function(d, mb) {
  var t = [];
  for (var i = 0; i < d.length; ++i) {
    if (d[i])
      t.push({ s: i, f: d[i] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s)
    return { t: et, l: 0 };
  if (s == 1) {
    var v = new u8(t[0].s + 1);
    v[t[0].s] = 1;
    return { t: v, l: 1 };
  }
  t.sort(function(a, b) {
    return a.f - b.f;
  });
  t.push({ s: -1, f: 25001 });
  var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
  t[0] = { s: -1, f: l.f + r.f, l, r };
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i2].f ? i0++ : i2++];
    r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
    t[i1++] = { s: -1, f: l.f + r.f, l, r };
  }
  var maxSym = t2[0].s;
  for (var i = 1; i < s; ++i) {
    if (t2[i].s > maxSym)
      maxSym = t2[i].s;
  }
  var tr = new u16(maxSym + 1);
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    var i = 0, dt = 0;
    var lft = mbt - mb, cst = 1 << lft;
    t2.sort(function(a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (; i < s; ++i) {
      var i2_1 = t2[i].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << mbt - tr[i2_1]);
        tr[i2_1] = mb;
      } else
        break;
    }
    dt >>= lft;
    while (dt > 0) {
      var i2_2 = t2[i].s;
      if (tr[i2_2] < mb)
        dt -= 1 << mb - tr[i2_2]++ - 1;
      else
        ++i;
    }
    for (; i >= 0 && dt; --i) {
      var i2_3 = t2[i].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return { t: new u8(tr), l: mbt };
};
var ln = function(n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
  var s = c.length;
  while (s && !c[--s])
    ;
  var cl = new u16(++s);
  var cli = 0, cln = c[0], cls = 1;
  var w = function(v) {
    cl[cli++] = v;
  };
  for (var i = 1; i <= s; ++i) {
    if (c[i] == cln && i != s)
      ++cls;
    else {
      if (!cln && cls > 2) {
        for (; cls > 138; cls -= 138)
          w(32754);
        if (cls > 2) {
          w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        w(cln), --cls;
        for (; cls > 6; cls -= 6)
          w(8304);
        if (cls > 2)
          w(cls - 3 << 5 | 8208), cls = 0;
      }
      while (cls--)
        w(cln);
      cls = 1;
      cln = c[i];
    }
  }
  return { c: cl.subarray(0, cli), n: s };
};
var clen = function(cf, cl) {
  var l = 0;
  for (var i = 0; i < cl.length; ++i)
    l += cf[i] * cl[i];
  return l;
};
var wfblk = function(out, pos, dat) {
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i = 0; i < s; ++i)
    out[o + i + 4] = dat[i];
  return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
  var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
  var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
  var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
  var lcfreq = new u16(19);
  for (var i = 0; i < lclt.length; ++i)
    ++lcfreq[lclt[i] & 31];
  for (var i = 0; i < lcdt.length; ++i)
    ++lcfreq[lcdt[i] & 31];
  var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
  var nlcc = 19;
  for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
    ;
  var flen = bl + 5 << 3;
  var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
  var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
  if (bs >= 0 && flen <= ftlen && flen <= dtlen)
    return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm, ll, dm, dl;
  wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
  if (dtlen < ftlen) {
    lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i = 0; i < nlcc; ++i)
      wbits(out, p + 3 * i, lct[clim[i]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0; it < 2; ++it) {
      var clct = lcts[it];
      for (var i = 0; i < clct.length; ++i) {
        var len = clct[i] & 31;
        wbits(out, p, llm[len]), p += lct[len];
        if (len > 15)
          wbits(out, p, clct[i] >> 5 & 127), p += clct[i] >> 12;
      }
    }
  } else {
    lm = flm, ll = flt, dm = fdm, dl = fdt;
  }
  for (var i = 0; i < li; ++i) {
    var sym = syms[i];
    if (sym > 255) {
      var len = sym >> 18 & 31;
      wbits16(out, p, lm[len + 257]), p += ll[len + 257];
      if (len > 7)
        wbits(out, p, sym >> 23 & 31), p += fleb[len];
      var dst = sym & 31;
      wbits16(out, p, dm[dst]), p += dl[dst];
      if (dst > 3)
        wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
    } else {
      wbits16(out, p, lm[sym]), p += ll[sym];
    }
  }
  wbits16(out, p, lm[256]);
  return p + ll[256];
};
var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var et = /* @__PURE__ */ new u8(0);
var dflt = function(dat, lvl, plvl, pre, post, st) {
  var s = st.z || dat.length;
  var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
  var w = o.subarray(pre, o.length - post);
  var lst = st.l;
  var pos = (st.r || 0) & 7;
  if (lvl) {
    if (pos)
      w[0] = st.r >> 3;
    var opt = deo[lvl - 1];
    var n = opt >> 13, c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
    var hsh = function(i2) {
      return (dat[i2] ^ dat[i2 + 1] << bs1_1 ^ dat[i2 + 2] << bs2_1) & msk_1;
    };
    var syms = new i32(25e3);
    var lf = new u16(288), df = new u16(32);
    var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
    for (; i + 2 < s; ++i) {
      var hv = hsh(i);
      var imod = i & 32767, pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      if (wi <= i) {
        var rem = s - i;
        if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
          li = lc_1 = eb = 0, bs = i;
          for (var j = 0; j < 286; ++j)
            lf[j] = 0;
          for (var j = 0; j < 30; ++j)
            df[j] = 0;
        }
        var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
        if (rem > 2 && hv == hsh(i - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i);
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i + l] == dat[i + l - dif]) {
              var nl = 0;
              for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                ;
              if (nl > l) {
                l = nl, d = dif;
                if (nl > maxn)
                  break;
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0; j < mmd; ++j) {
                  var ti = i - dif + j & 32767;
                  var pti = prev[ti];
                  var cd = ti - pti & 32767;
                  if (cd > md)
                    md = cd, pimod = ti;
                }
              }
            }
            imod = pimod, pimod = prev[imod];
            dif += imod - pimod & 32767;
          }
        }
        if (d) {
          syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
          var lin = revfl[l] & 31, din = revfd[d] & 31;
          eb += fleb[lin] + fdeb[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i];
          ++lf[dat[i]];
        }
      }
    }
    for (i = Math.max(i, wi); i < s; ++i) {
      syms[li++] = dat[i];
      ++lf[dat[i]];
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
    if (!lst) {
      st.r = pos & 7 | w[pos / 8 | 0] << 3;
      pos -= 7;
      st.h = head, st.p = prev, st.i = i, st.w = wi;
    }
  } else {
    for (var i = st.w || 0; i < s + lst; i += 65535) {
      var e = i + 65535;
      if (e >= s) {
        w[pos / 8 | 0] = lst;
        e = s;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i, e));
    }
    st.i = s;
  }
  return slc(o, 0, pre + shft(pos) + post);
};
var crct = /* @__PURE__ */ (function() {
  var t = new Int32Array(256);
  for (var i = 0; i < 256; ++i) {
    var c = i, k = 9;
    while (--k)
      c = (c & 1 && -306674912) ^ c >>> 1;
    t[i] = c;
  }
  return t;
})();
var crc = function() {
  var c = -1;
  return {
    p: function(d) {
      var cr = c;
      for (var i = 0; i < d.length; ++i)
        cr = crct[cr & 255 ^ d[i]] ^ cr >>> 8;
      c = cr;
    },
    d: function() {
      return ~c;
    }
  };
};
var dopt = function(dat, opt, pre, post, st) {
  if (!st) {
    st = { l: 1 };
    if (opt.dictionary) {
      var dict = opt.dictionary.subarray(-32768);
      var newDat = new u8(dict.length + dat.length);
      newDat.set(dict);
      newDat.set(dat, dict.length);
      dat = newDat;
      st.w = dict.length;
    }
  }
  return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
};
var mrg = function(a, b) {
  var o = {};
  for (var k in a)
    o[k] = a[k];
  for (var k in b)
    o[k] = b[k];
  return o;
};
var wcln = function(fn, fnStr, td2) {
  var dt = fn();
  var st = fn.toString();
  var ks = st.slice(st.indexOf("[") + 1, st.lastIndexOf("]")).replace(/\s+/g, "").split(",");
  for (var i = 0; i < dt.length; ++i) {
    var v = dt[i], k = ks[i];
    if (typeof v == "function") {
      fnStr += ";" + k + "=";
      var st_1 = v.toString();
      if (v.prototype) {
        if (st_1.indexOf("[native code]") != -1) {
          var spInd = st_1.indexOf(" ", 8) + 1;
          fnStr += st_1.slice(spInd, st_1.indexOf("(", spInd));
        } else {
          fnStr += st_1;
          for (var t in v.prototype)
            fnStr += ";" + k + ".prototype." + t + "=" + v.prototype[t].toString();
        }
      } else
        fnStr += st_1;
    } else
      td2[k] = v;
  }
  return fnStr;
};
var ch = [];
var cbfs = function(v) {
  var tl = [];
  for (var k in v) {
    if (v[k].buffer) {
      tl.push((v[k] = new v[k].constructor(v[k])).buffer);
    }
  }
  return tl;
};
var wrkr = function(fns, init, id, cb) {
  if (!ch[id]) {
    var fnStr = "", td_1 = {}, m = fns.length - 1;
    for (var i = 0; i < m; ++i)
      fnStr = wcln(fns[i], fnStr, td_1);
    ch[id] = { c: wcln(fns[m], fnStr, td_1), e: td_1 };
  }
  var td2 = mrg({}, ch[id].e);
  return wk(ch[id].c + ";onmessage=function(e){for(var k in e.data)self[k]=e.data[k];onmessage=" + init.toString() + "}", id, td2, cbfs(td2), cb);
};
var bDflt = function() {
  return [u8, u16, i32, fleb, fdeb, clim, revfl, revfd, flm, flt, fdm, fdt, rev, deo, et, hMap, wbits, wbits16, hTree, ln, lc, clen, wfblk, wblk, shft, slc, dflt, dopt, deflateSync, pbf];
};
var pbf = function(msg) {
  return postMessage(msg, [msg.buffer]);
};
var astrm = function(strm) {
  strm.ondata = function(dat, final) {
    return postMessage([dat, final], [dat.buffer]);
  };
  return function(ev) {
    if (ev.data[0]) {
      strm.push(ev.data[0], ev.data[1]);
      postMessage([ev.data[0].length]);
    } else
      strm.flush(ev.data[1]);
  };
};
var astrmify = function(fns, strm, opts, init, id, flush, ext) {
  var t;
  var w = wrkr(fns, init, id, function(err2, dat) {
    if (err2)
      w.terminate(), strm.ondata.call(strm, err2);
    else if (!Array.isArray(dat))
      ext(dat);
    else if (dat.length == 1) {
      strm.queuedSize -= dat[0];
      if (strm.ondrain)
        strm.ondrain(dat[0]);
    } else {
      if (dat[1])
        w.terminate();
      strm.ondata.call(strm, err2, dat[0], dat[1]);
    }
  });
  w.postMessage(opts);
  strm.queuedSize = 0;
  strm.push = function(d, f) {
    if (!strm.ondata)
      err(5);
    if (t)
      strm.ondata(err(4, 0, 1), null, !!f);
    strm.queuedSize += d.length;
    w.postMessage([d, t = f], d.buffer instanceof ArrayBuffer ? [d.buffer] : []);
  };
  strm.terminate = function() {
    w.terminate();
  };
  {
    strm.flush = function(sync) {
      w.postMessage([0, sync]);
    };
  }
};
var wbytes = function(d, b, v) {
  for (; v; ++b)
    d[b] = v, v >>>= 8;
};
function StrmOpt(opts, cb) {
  if (typeof opts == "function")
    cb = opts, opts = {};
  this.ondata = cb;
  return opts;
}
var Deflate = /* @__PURE__ */ (function() {
  function Deflate2(opts, cb) {
    if (typeof opts == "function")
      cb = opts, opts = {};
    this.ondata = cb;
    this.o = opts || {};
    this.s = { l: 0, i: 32768, w: 32768, z: 32768 };
    this.b = new u8(98304);
    if (this.o.dictionary) {
      var dict = this.o.dictionary.subarray(-32768);
      this.b.set(dict, 32768 - dict.length);
      this.s.i = 32768 - dict.length;
    }
  }
  Deflate2.prototype.p = function(c, f) {
    this.ondata(dopt(c, this.o, 0, 0, this.s), f);
  };
  Deflate2.prototype.push = function(chunk, final) {
    if (!this.ondata)
      err(5);
    if (this.s.l)
      err(4);
    var endLen = chunk.length + this.s.z;
    if (endLen > this.b.length) {
      if (endLen > 2 * this.b.length - 32768) {
        var newBuf = new u8(endLen & -32768);
        newBuf.set(this.b.subarray(0, this.s.z));
        this.b = newBuf;
      }
      var split = this.b.length - this.s.z;
      this.b.set(chunk.subarray(0, split), this.s.z);
      this.s.z = this.b.length;
      this.p(this.b, false);
      this.b.set(this.b.subarray(-32768));
      this.b.set(chunk.subarray(split), 32768);
      this.s.z = chunk.length - split + 32768;
      this.s.i = 32766, this.s.w = 32768;
    } else {
      this.b.set(chunk, this.s.z);
      this.s.z += chunk.length;
    }
    this.s.l = final & 1;
    if (this.s.z > this.s.w + 8191 || final) {
      this.p(this.b, final || false);
      this.s.w = this.s.i, this.s.i -= 2;
    }
    if (final) {
      this.s = this.o = {};
      this.b = et;
    }
  };
  Deflate2.prototype.flush = function(sync) {
    if (!this.ondata)
      err(5);
    if (this.s.l)
      err(4);
    this.p(this.b, false);
    this.s.w = this.s.i, this.s.i -= 2;
    if (sync) {
      var c = new u8(6);
      c[0] = this.s.r >> 3;
      var ep = wfblk(c, this.s.r, et);
      this.s.r = 0;
      this.ondata(c.subarray(0, ep >> 3), false);
    }
  };
  return Deflate2;
})();
var AsyncDeflate = /* @__PURE__ */ (function() {
  function AsyncDeflate2(opts, cb) {
    astrmify([
      bDflt,
      function() {
        return [astrm, Deflate];
      }
    ], this, StrmOpt.call(this, opts, cb), function(ev) {
      var strm = new Deflate(ev.data);
      onmessage = astrm(strm);
    }, 6);
  }
  return AsyncDeflate2;
})();
function deflateSync(data, opts) {
  return dopt(data, opts || {}, 0, 0);
}
var te = typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder();
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
function strToU8(str, latin1) {
  var i;
  if (te)
    return te.encode(str);
  var l = str.length;
  var ar = new u8(str.length + (str.length >> 1));
  var ai = 0;
  var w = function(v) {
    ar[ai++] = v;
  };
  for (var i = 0; i < l; ++i) {
    if (ai + 5 > ar.length) {
      var n = new u8(ai + 8 + (l - i << 1));
      n.set(ar);
      ar = n;
    }
    var c = str.charCodeAt(i);
    if (c < 128 || latin1)
      w(c);
    else if (c < 2048)
      w(192 | c >> 6), w(128 | c & 63);
    else if (c > 55295 && c < 57344)
      c = 65536 + (c & 1023 << 10) | str.charCodeAt(++i) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
    else
      w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
  }
  return slc(ar, 0, ai);
}
var dbf = function(l) {
  return l == 1 ? 3 : l < 6 ? 2 : l == 9 ? 1 : 0;
};
var exfl = function(ex) {
  var le = 0;
  if (ex) {
    for (var k in ex) {
      var l = ex[k].length;
      if (l > 65535)
        err(9);
      le += l + 4;
    }
  }
  return le;
};
var wzh = function(d, b, f, fn, u, c, ce, co) {
  var fl2 = fn.length, ex = f.extra, col = co && co.length;
  var exl = exfl(ex);
  wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
  if (ce != null)
    d[b++] = 20, d[b++] = f.os;
  d[b] = 20, b += 2;
  d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
  d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
  var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
  if (y < 0 || y > 119)
    err(10);
  wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >> 1), b += 4;
  if (c != -1) {
    wbytes(d, b, f.crc);
    wbytes(d, b + 4, c < 0 ? -c - 2 : c);
    wbytes(d, b + 8, f.size);
  }
  wbytes(d, b + 12, fl2);
  wbytes(d, b + 14, exl), b += 16;
  if (ce != null) {
    wbytes(d, b, col);
    wbytes(d, b + 6, f.attrs);
    wbytes(d, b + 10, ce), b += 14;
  }
  d.set(fn, b);
  b += fl2;
  if (exl) {
    for (var k in ex) {
      var exf = ex[k], l = exf.length;
      wbytes(d, b, +k);
      wbytes(d, b + 2, l);
      d.set(exf, b + 4), b += 4 + l;
    }
  }
  if (col)
    d.set(co, b), b += col;
  return b;
};
var wzf = function(o, b, c, d, e) {
  wbytes(o, b, 101010256);
  wbytes(o, b + 8, c);
  wbytes(o, b + 10, c);
  wbytes(o, b + 12, d);
  wbytes(o, b + 16, e);
};
var ZipPassThrough = /* @__PURE__ */ (function() {
  function ZipPassThrough2(filename) {
    this.filename = filename;
    this.c = crc();
    this.size = 0;
    this.compression = 0;
  }
  ZipPassThrough2.prototype.process = function(chunk, final) {
    this.ondata(null, chunk, final);
  };
  ZipPassThrough2.prototype.push = function(chunk, final) {
    if (!this.ondata)
      err(5);
    this.c.p(chunk);
    this.size += chunk.length;
    if (final)
      this.crc = this.c.d();
    this.process(chunk, final || false);
  };
  return ZipPassThrough2;
})();
var AsyncZipDeflate = /* @__PURE__ */ (function() {
  function AsyncZipDeflate2(filename, opts) {
    var _this = this;
    if (!opts)
      opts = {};
    ZipPassThrough.call(this, filename);
    this.d = new AsyncDeflate(opts, function(err2, dat, final) {
      _this.ondata(err2, dat, final);
    });
    this.compression = 8;
    this.flag = dbf(opts.level);
    this.terminate = this.d.terminate;
  }
  AsyncZipDeflate2.prototype.process = function(chunk, final) {
    this.d.push(chunk, final);
  };
  AsyncZipDeflate2.prototype.push = function(chunk, final) {
    ZipPassThrough.prototype.push.call(this, chunk, final);
  };
  return AsyncZipDeflate2;
})();
var Zip = /* @__PURE__ */ (function() {
  function Zip2(cb) {
    this.ondata = cb;
    this.u = [];
    this.d = 1;
  }
  Zip2.prototype.add = function(file) {
    var _this = this;
    if (!this.ondata)
      err(5);
    if (this.d & 2)
      this.ondata(err(4 + (this.d & 1) * 8, 0, 1), null, false);
    else {
      var f = strToU8(file.filename), fl_1 = f.length;
      var com = file.comment, o = com && strToU8(com);
      var u = fl_1 != file.filename.length || o && com.length != o.length;
      var hl_1 = fl_1 + exfl(file.extra) + 30;
      if (fl_1 > 65535)
        this.ondata(err(11, 0, 1), null, false);
      var header = new u8(hl_1);
      wzh(header, 0, file, f, u, -1);
      var chks_1 = [header];
      var pAll_1 = function() {
        for (var _i = 0, chks_2 = chks_1; _i < chks_2.length; _i++) {
          var chk = chks_2[_i];
          _this.ondata(null, chk, false);
        }
        chks_1 = [];
      };
      var tr_1 = this.d;
      this.d = 0;
      var ind_1 = this.u.length;
      var uf_1 = mrg(file, {
        f,
        u,
        o,
        t: function() {
          if (file.terminate)
            file.terminate();
        },
        r: function() {
          pAll_1();
          if (tr_1) {
            var nxt = _this.u[ind_1 + 1];
            if (nxt)
              nxt.r();
            else
              _this.d = 1;
          }
          tr_1 = 1;
        }
      });
      var cl_1 = 0;
      file.ondata = function(err2, dat, final) {
        if (err2) {
          _this.ondata(err2, dat, final);
          _this.terminate();
        } else {
          cl_1 += dat.length;
          chks_1.push(dat);
          if (final) {
            var dd = new u8(16);
            wbytes(dd, 0, 134695760);
            wbytes(dd, 4, file.crc);
            wbytes(dd, 8, cl_1);
            wbytes(dd, 12, file.size);
            chks_1.push(dd);
            uf_1.c = cl_1, uf_1.b = hl_1 + cl_1 + 16, uf_1.crc = file.crc, uf_1.size = file.size;
            if (tr_1)
              uf_1.r();
            tr_1 = 1;
          } else if (tr_1)
            pAll_1();
        }
      };
      this.u.push(uf_1);
    }
  };
  Zip2.prototype.end = function() {
    var _this = this;
    if (this.d & 2) {
      this.ondata(err(4 + (this.d & 1) * 8, 0, 1), null, true);
      return;
    }
    if (this.d)
      this.e();
    else
      this.u.push({
        r: function() {
          if (!(_this.d & 1))
            return;
          _this.u.splice(-1, 1);
          _this.e();
        },
        t: function() {
        }
      });
    this.d = 3;
  };
  Zip2.prototype.e = function() {
    var bt = 0, l = 0, tl = 0;
    for (var _i = 0, _a2 = this.u; _i < _a2.length; _i++) {
      var f = _a2[_i];
      tl += 46 + f.f.length + exfl(f.extra) + (f.o ? f.o.length : 0);
    }
    var out = new u8(tl + 22);
    for (var _b2 = 0, _c = this.u; _b2 < _c.length; _b2++) {
      var f = _c[_b2];
      wzh(out, bt, f, f.f, f.u, -f.c - 2, l, f.o);
      bt += 46 + f.f.length + exfl(f.extra) + (f.o ? f.o.length : 0), l += f.b;
    }
    wzf(out, bt, this.u.length, tl, l);
    this.ondata(null, out, true);
    this.d = 2;
  };
  Zip2.prototype.terminate = function() {
    for (var _i = 0, _a2 = this.u; _i < _a2.length; _i++) {
      var f = _a2[_i];
      f.t();
    }
    this.d = 2;
  };
  return Zip2;
})();
const sanitizeFileName = (value) => value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "table";
const encodeCsvCell = (value) => {
  if (value === null || value === void 0) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const toChunks = async function* (source) {
  if (Array.isArray(source)) {
    yield source;
    return;
  }
  if (source instanceof Blob) return;
  for await (const chunk of source) yield chunk;
};
const addTextFile = (zip, path, text) => {
  const file = new ZipPassThrough(path);
  zip.add(file);
  file.push(strToU8(text), true);
};
const addTableCsv = async (zip, table, source) => {
  const path = `tables/${sanitizeFileName(table.name)}-${sanitizeFileName(table.tableId)}.csv`;
  const file = new AsyncZipDeflate(path, { level: 6 });
  zip.add(file);
  if (source instanceof Blob) {
    const reader = source.stream().getReader();
    let exportedBytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        file.push(value, false);
        exportedBytes += value.byteLength;
      }
    }
    file.push(new Uint8Array(), true);
    return table.rowCount > 0 ? table.rowCount : exportedBytes;
  }
  const columns = table.schema.map((column) => column.name);
  file.push(strToU8(`${columns.map(encodeCsvCell).join(",")}\r
`), false);
  let exportedRows = 0;
  for await (const rows of toChunks(source)) {
    if (rows.length === 0) continue;
    const text = rows.map((row) => columns.map((column) => encodeCsvCell(row[column])).join(",")).join("\r\n");
    file.push(strToU8(`${text}\r
`), false);
    exportedRows += rows.length;
  }
  file.push(new Uint8Array(), true);
  return exportedRows;
};
const buildReadme = (bundle, exportedRows) => [
  "# Dataset Bundle Export",
  "",
  `Source: ${bundle.source.fileName}`,
  `Source fingerprint: ${bundle.source.fingerprint}`,
  `Dataset version: ${bundle.datasetVersion}`,
  `Relationship set: ${bundle.relationshipSetId}`,
  "",
  "## Tables",
  "",
  ...bundle.tables.map((table) => `- ${table.name} (${table.role}): ${exportedRows[table.tableId] ?? 0} exported rows; declared ${table.rowCount} rows; tableId=${table.tableId}`),
  "",
  "Relationships must have a trusted decision before the application executes a join.",
  "Original source data is not modified by this export.",
  ""
].join("\n");
const buildDatasetBundleZip = async (input) => {
  const outputChunks = [];
  let resolveZip = null;
  let rejectZip = null;
  const completion = new Promise((resolve, reject) => {
    resolveZip = resolve;
    rejectZip = reject;
  });
  const zip = new Zip((error, data, final) => {
    if (error) {
      rejectZip == null ? void 0 : rejectZip(error);
      return;
    }
    outputChunks.push(data);
    if (final) resolveZip == null ? void 0 : resolveZip(new Blob(outputChunks, { type: "application/zip" }));
  });
  try {
    const exportedRows = {};
    for (const table of input.bundle.tables) {
      exportedRows[table.tableId] = await addTableCsv(
        zip,
        table,
        await input.loadTableRows(table)
      );
    }
    addTextFile(zip, "relationships.json", JSON.stringify({
      relationshipSetId: input.bundle.relationshipSetId,
      relationships: input.bundle.relationships
    }, null, 2));
    addTextFile(zip, "lineage.json", JSON.stringify(input.lineage, null, 2));
    addTextFile(zip, "validation-report.json", JSON.stringify(input.validationReport, null, 2));
    addTextFile(zip, "dataset-bundle.json", JSON.stringify(input.bundle, null, 2));
    addTextFile(zip, "README.md", buildReadme(input.bundle, exportedRows));
    zip.end();
  } catch (error) {
    zip.terminate();
    rejectZip == null ? void 0 : rejectZip(error instanceof Error ? error : new Error(String(error)));
  }
  return completion;
};
const downloadDatasetBundleZip = async (input, fileName = "dataset-bundle.zip") => {
  const blob = await buildDatasetBundleZip(input);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
const PUBLIC_SUPPORT_ISSUES_URL = "https://github.com/yapweijun1996/React-CSV-Data-Analysis-Agent-Backup/issues";
const downloadTextFile = (contents, fileName) => {
  const objectUrl = URL.createObjectURL(new Blob([contents], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(objectUrl);
};
const DataPreparationWorkflowModal = () => {
  const isOpen = useAppStore((state) => state.isDataPreparationModalOpen);
  if (!isOpen) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(OpenDataPreparationWorkflowModal, {});
};
const OpenDataPreparationWorkflowModal = () => {
  const {
    setIsDataPreparationModalOpen,
    setIsWorkspaceModalOpen,
    setIsDebugLogsModalOpen,
    setIsAgentModalOpen,
    sessionId,
    currentDatasetId,
    logAgentToolUsage,
    syncTelemetryToStore,
    saveReportStructureBoundaryOverride,
    csvData,
    canonicalCsvData,
    language,
    datasetBundle
  } = useAppStore((state) => ({
    setIsDataPreparationModalOpen: state.setIsDataPreparationModalOpen,
    setIsWorkspaceModalOpen: state.setIsWorkspaceModalOpen,
    setIsDebugLogsModalOpen: state.setIsDebugLogsModalOpen,
    setIsAgentModalOpen: state.setIsAgentModalOpen,
    sessionId: state.sessionId,
    currentDatasetId: state.currentDatasetId,
    logAgentToolUsage: state.logAgentToolUsage,
    syncTelemetryToStore: state.syncTelemetryToStore,
    saveReportStructureBoundaryOverride: state.saveReportStructureBoundaryOverride,
    csvData: state.csvData,
    canonicalCsvData: state.canonicalCsvData,
    language: state.settings.language,
    datasetBundle: state.datasetBundle
  }), shallow$1);
  const workflowState = useAppStore(pickDataPreparationWorkflowState, shallow$1);
  const closeModal = () => setIsDataPreparationModalOpen(false);
  const openWorkspace = () => setIsWorkspaceModalOpen(true);
  const openLogs = () => setIsDebugLogsModalOpen(true);
  const openActivity = () => setIsAgentModalOpen(true);
  const hasLoggedOpenRef = reactExports.useRef(false);
  const exportMenuRef = reactExports.useRef(null);
  const workflow = reactExports.useMemo(() => buildDataPreparationWorkflowBundle(workflowState), [workflowState]);
  const [copyStatus, setCopyStatus] = reactExports.useState("idle");
  const closeExportMenu = () => {
    if (exportMenuRef.current) exportMenuRef.current.open = false;
  };
  const dialogRef = useDialogAccessibility(
    true,
    closeModal,
    { restoreFocusSelector: '[data-advanced-trigger="true"]' }
  );
  reactExports.useEffect(() => {
    if (!hasLoggedOpenRef.current) {
      hasLoggedOpenRef.current = true;
      syncTelemetryToStore();
      logAgentToolUsage({
        tool: "workspace_builder",
        description: "Opened data preparation workflow modal.",
        detail: {
          datasetId: currentDatasetId,
          fileName: workflow.summary.fileName,
          issueCount: workflow.summary.issueCount
        }
      });
    }
  }, [currentDatasetId, logAgentToolUsage, syncTelemetryToStore, workflow.summary.fileName, workflow.summary.issueCount]);
  const handleOpenWorkspace = () => {
    closeModal();
    openWorkspace();
  };
  const handleOpenLogs = () => {
    closeModal();
    openLogs();
  };
  const handleOpenActivity = () => {
    closeModal();
    openActivity();
  };
  const handleCopyWorkflowSnapshot = async () => {
    closeExportMenu();
    try {
      await copyText(buildWorkflowSnapshotExport(workflowState));
      setCopyStatus("workflow");
    } catch {
      setCopyStatus("error");
    }
  };
  const handleCopyFailureHandoff = async () => {
    closeExportMenu();
    try {
      await copyText(buildCleaningFailureBundleExport(workflowState));
      setCopyStatus("failure");
    } catch {
      setCopyStatus("error");
    }
  };
  const handleDownloadCleanedCsv = async () => {
    var _a2;
    closeExportMenu();
    const dataset = canonicalCsvData ?? csvData;
    if (!dataset) {
      setCopyStatus("error");
      return;
    }
    let result = { success: false };
    if ((_a2 = dataset.backing) == null ? void 0 : _a2.opfsPath) {
      const sourceFile = await readDatasetFileFromOpfs(dataset.backing.opfsPath);
      if (sourceFile) {
        const url = URL.createObjectURL(sourceFile);
        const link = document.createElement("a");
        link.href = url;
        link.download = `cleaned_${dataset.fileName}`;
        link.click();
        URL.revokeObjectURL(url);
        result = { success: true };
      }
    } else {
      result = exportDatasetToCsv(dataset.data, `cleaned_${dataset.fileName}`);
    }
    if (!result.success) {
      setCopyStatus("error");
      return;
    }
    setCopyStatus("download");
    logAgentToolUsage({
      tool: "workspace_builder",
      description: "Downloaded the complete prepared CSV dataset.",
      detail: {
        datasetId: currentDatasetId,
        fileName: dataset.fileName,
        rowCount: getCsvDataRowCount(dataset)
      }
    });
  };
  const handleDownloadDatasetBundle = async () => {
    closeExportMenu();
    const dataset = canonicalCsvData ?? csvData;
    if (!datasetBundle || !dataset) {
      setCopyStatus("error");
      return;
    }
    try {
      await downloadDatasetBundleZip({
        bundle: datasetBundle,
        loadTableRows: async (table) => {
          if (table.storage.mode === "duckdb" && table.storage.opfsPath) {
            const sourceFile = await readDatasetFileFromOpfs(table.storage.opfsPath);
            if (sourceFile) return sourceFile;
            throw new Error("The temporary source file is unavailable. Re-import the original CSV.");
          }
          if (table.tableId === datasetBundle.primaryTableId) return dataset.data;
          const sandboxRows = getSandboxTableRows(datasetBundle.bundleId, table.tableId);
          if (sandboxRows) return sandboxRows;
          throw new Error(`Table data is unavailable for ${table.name}.`);
        },
        lineage: [],
        validationReport: {
          structureResolution: datasetBundle.structureResolution,
          pipelineOutcome: workflowState.pipelineOutcome,
          workflowVerification: workflow.verification
        }
      }, `${dataset.fileName.replace(/\.csv$/i, "")}-dataset-bundle.zip`);
      setCopyStatus("bundle");
    } catch (error) {
      setCopyStatus("error");
      logAgentToolUsage({
        tool: "workspace_builder",
        description: "Dataset bundle export failed.",
        detail: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  };
  const handleDownloadSupportBundle = () => {
    closeExportMenu();
    const bundle = buildPublicBetaSupportBundle(workflowState, {
      appVersion: "0.1.0-beta.1",
      releaseCommit: "local-build",
      userAgent: navigator.userAgent,
      language: navigator.language
    });
    downloadTextFile(bundle, "csv-analysis-public-beta-support.md");
    setCopyStatus("support");
    logAgentToolUsage({
      tool: "workspace_builder",
      description: "Downloaded a sanitized public Beta support bundle.",
      detail: {
        datasetId: currentDatasetId,
        automaticUpload: false
      }
    });
  };
  const handlePrimaryAction = () => {
    closeModal();
    if (workflow.cta.primaryAction === "open_workspace") {
      openWorkspace();
      return;
    }
    requestAnimationFrame(() => {
      var _a2;
      (_a2 = document.getElementById("analysis-results-section")) == null ? void 0 : _a2.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const handleConfirmStructureBoundary = () => {
    var _a2;
    const detectedBoundary = (_a2 = workflow.structureReview) == null ? void 0 : _a2.detectedBoundary;
    if (!detectedBoundary || detectedBoundary.headerRowIndex === null || detectedBoundary.bodyStartIndex === null) {
      return;
    }
    void saveReportStructureBoundaryOverride({
      headerRowIndex: detectedBoundary.headerRowIndex,
      headerLayerRowIndexes: detectedBoundary.headerLayerRowIndexes,
      bodyStartIndex: detectedBoundary.bodyStartIndex,
      summaryStartIndex: detectedBoundary.summaryStartIndex,
      parameterRowIndexes: detectedBoundary.parameterRowIndexes,
      repeatedHeaderRowIndexes: detectedBoundary.repeatedHeaderRowIndexes
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 bg-slate-950/70", onClick: closeModal, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: dialogRef,
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "workflow-dialog-title",
      tabIndex: -1,
      className: "relative h-screen w-screen bg-[linear-gradient(180deg,#f8fbff_0%,#f3f6fb_45%,#eef3f8_100%)] flex flex-col",
      onClick: (event) => event.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "sticky top-0 z-20 border-b border-slate-200 bg-white", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 px-4 py-3 xl:flex-row xl:items-center xl:justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-3xl", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] uppercase tracking-[0.24em] text-slate-500", children: "AI Data IDE workflow" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "workflow-dialog-title", className: "mt-1 text-2xl font-semibold text-slate-950 leading-tight", children: "Data Preparation Workflow" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-600", children: "Fullscreen review for import, inspection, preparation, verification, and analysis readiness." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-end gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${copyStatus === "error" ? "bg-red-100 text-red-700" : copyStatus === "workflow" ? "bg-sky-100 text-sky-800" : copyStatus === "failure" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`, children: copyStatus === "workflow" ? "Workflow snapshot copied" : copyStatus === "failure" ? "Cleaning failure bundle copied" : copyStatus === "support" ? getTranslation("support_bundle_downloaded", language) : copyStatus === "download" ? getTranslation("cleaned_csv_downloaded", language) : copyStatus === "bundle" ? "Dataset bundle downloaded" : copyStatus === "error" ? "Copy failed" : "Copy ready" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { ref: exportMenuRef, className: "relative", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "flex min-h-[44px] cursor-pointer items-center rounded-card border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100", children: "Advanced exports" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute right-0 z-30 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-2 rounded-card border border-slate-200 bg-white p-3 shadow-xl", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-600", children: "Download the complete prepared dataset or copy a technical handoff bundle." }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => void handleDownloadCleanedCsv(),
                    disabled: !(canonicalCsvData ?? csvData),
                    className: "min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50",
                    children: getTranslation("download_complete_cleaned_csv", language)
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => void handleDownloadDatasetBundle(),
                    disabled: !datasetBundle || !(canonicalCsvData ?? csvData),
                    className: "min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50",
                    children: "Download complete dataset bundle (ZIP)"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: handleDownloadSupportBundle, className: "min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700", children: getTranslation("download_sanitized_support_bundle", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "a",
                  {
                    href: PUBLIC_SUPPORT_ISSUES_URL,
                    target: "_blank",
                    rel: "noreferrer",
                    onClick: closeExportMenu,
                    className: "flex min-h-[44px] items-center rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700",
                    children: getTranslation("open_github_support", language)
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: handleCopyWorkflowSnapshot, className: "min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700", children: "Copy workflow snapshot" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: handleCopyFailureHandoff, className: "min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700", children: "Copy cleaning failure bundle" })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: handleOpenLogs,
                className: "min-h-[44px] rounded-card border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100",
                children: "Open Logs"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: handleOpenWorkspace,
                className: "min-h-[44px] rounded-card bg-slate-950 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800",
                children: "Open Artifacts"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                "data-dialog-initial-focus": true,
                onClick: closeModal,
                className: "relative z-40 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-card bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
                "aria-label": "Close workflow modal",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, {})
              }
            )
          ] })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-4 lg:px-5 xl:px-6", children: !workflow.summary.fileName ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "h-full flex flex-col items-center justify-center text-center text-slate-500 min-h-[320px] rounded-card border border-slate-200 bg-white", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-semibold text-slate-700", children: "No workflow is available yet." }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 max-w-md text-sm", children: "Upload a CSV or open a saved report first. Then this modal will show the full Data Preparation Workflow." })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
          DataPreparationWorkflowContent,
          {
            workflow,
            defaultDetailMode: "summary",
            embeddedInDialog: true,
            onPrimaryAction: handlePrimaryAction,
            onOpenWorkspace: handleOpenWorkspace,
            onOpenActivity: handleOpenActivity,
            activityEvents: workflowState.agentEvents,
            activitySessionId: sessionId,
            activityDatasetId: currentDatasetId,
            onConfirmStructureBoundary: handleConfirmStructureBoundary,
            onSaveStructureBoundaryOverride: (boundary) => {
              void saveReportStructureBoundaryOverride(boundary);
            }
          }
        ) })
      ]
    }
  ) });
};
export {
  DataPreparationWorkflowModal
};
