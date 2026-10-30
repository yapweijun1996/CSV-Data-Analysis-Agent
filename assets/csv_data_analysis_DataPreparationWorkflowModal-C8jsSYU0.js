import { W as We, j as jsxRuntimeExports, a as reactExports } from "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-CMf1uPe1.js";
import { u as useAppStore, e as useDialogAccessibility } from "./csv_data_analysis_index-x-Z1054W.js";
import { dt as summarizeTraceContract, cJ as getStructureReviewReasonText, ad as getTranslation, a5 as getCurrentAnalysisDatasetVersion, co as resolveCardTrustDecision, dE as Zip, dF as AsyncZipDeflate, dG as strToU8, dH as ZipPassThrough, cM as buildDataPreparationWorkflowBundle, dI as readDatasetFileFromOpfs, h as getCsvDataRowCount, dJ as getSandboxTableRows, dK as buildWorkflowSnapshotExport, dL as buildCleaningFailureBundleExport } from "./csv_data_analysis_app-agent-CCgesa_7.js";
import { c as copyText } from "./csv_data_analysis_copyText-Di0nQNpb.js";
import { I as IconClose } from "./csv_data_analysis_IconClose-DoCpdGZg.js";
import { A as AgentActivityView } from "./csv_data_analysis_AgentActivityView-DgwDyFng.js";
import { c as exportDatasetToCsv } from "./csv_data_analysis_exportUtils-DP52eew0.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import "./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js";
import "./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js";
import "./csv_data_analysis_vendor-ai-google-DYdleeb9.js";
import "./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js";
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
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
  const [showTechnicalDetails, setShowTechnicalDetails] = We.useState(defaultDetailMode === "full");
  const language = useAppStore((state) => state.settings.language);
  const latestPipelineTrace = summarizeTraceContract(workflow.operationalSignals.latestPipelineTrace);
  const latestToolTrace = summarizeTraceContract(workflow.operationalSignals.latestToolTrace);
  const latestTelemetryTrace = summarizeTraceContract(workflow.operationalSignals.latestTelemetryTrace);
  const structureReview = workflow.structureReview;
  const carryForwardAppliedCount = Object.values(((_a = structureReview == null ? void 0 : structureReview.canonicalBuildMeta) == null ? void 0 : _a.carryForwardAppliedCounts) ?? {}).reduce((sum, count) => sum + Number(count), 0);
  const excludedGroupRows = ((_c = (_b = structureReview == null ? void 0 : structureReview.canonicalBuildMeta) == null ? void 0 : _b.excludedRowCounts) == null ? void 0 : _c.group_header) ?? 0;
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
    var _a2, _b2, _c2;
    const headerRowIndex = parseOneBasedIndex(headerRowInput);
    const bodyStartIndex = parseOneBasedIndex(bodyStartInput);
    const summaryStartIndex = summaryStartInput.trim() ? parseOneBasedIndex(summaryStartInput) : null;
    if (headerRowIndex === null || bodyStartIndex === null) {
      return;
    }
    onSaveStructureBoundaryOverride({
      headerRowIndex,
      headerLayerRowIndexes: ((_a2 = structureReview == null ? void 0 : structureReview.detectedBoundary) == null ? void 0 : _a2.headerLayerRowIndexes) ?? [],
      bodyStartIndex,
      summaryStartIndex,
      parameterRowIndexes: ((_b2 = structureReview == null ? void 0 : structureReview.detectedBoundary) == null ? void 0 : _b2.parameterRowIndexes) ?? [],
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
            /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-1 list-disc list-inside", children: Array.from(new Set(structureReview.blockingReasons.map((reason) => getStructureReviewReasonText(reason, language)))).map((text) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: text }, text)) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mt-2 text-xs", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer font-medium", children: getTranslation("structure_review_technical_details", language) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 break-words font-mono", children: getTranslation("structure_review_technical_codes", language, { codes: structureReview.blockingReasons.join(", ") }) })
            ] })
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
  var _a, _b;
  const code = ((_a = event.detail) == null ? void 0 : _a.failureStage) ?? ((_b = event.detail) == null ? void 0 : _b.reasonCode);
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
  var _a, _b, _c, _d;
  const dataset = state.canonicalCsvData ?? state.csvData;
  const failures = (state.agentEvents ?? []).filter((event) => event.status === "error").slice(-20).map((event) => ({
    phase: diagnosticCode(event.phase),
    step: diagnosticCode(event.step),
    code: getFailureCode(event)
  }));
  const runtimeEvents = (state.runtimeEvents ?? []).slice(-30).map((event) => {
    var _a2, _b2, _c2, _d2, _e;
    return {
      phase: diagnosticCode(event.stage) ?? "runtime",
      attempt: boundedNumber(((_a2 = event.detail) == null ? void 0 : _a2.retryAttempt) ?? ((_b2 = event.detail) == null ? void 0 : _b2.attempt)) ?? 1,
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
      kind: diagnosticCode((_a = state.settings) == null ? void 0 : _a.provider) ?? "default",
      chatModel: diagnosticCode((_b = state.settings) == null ? void 0 : _b.simpleModel),
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
        var _a2;
        return {
          outcomeKind: diagnosticCode(run.outcomeKind),
          lifecycleState: diagnosticCode(run.lifecycleState),
          retryCount: run.retryCount,
          failureClass: diagnosticCode(run.failureClass),
          recoveryStatus: diagnosticCode(
            (_a2 = run.recoveryTrace) == null ? void 0 : _a2.recoveryStatus
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
    var _a;
    closeExportMenu();
    const dataset = canonicalCsvData ?? csvData;
    if (!dataset) {
      setCopyStatus("error");
      return;
    }
    let result = { success: false };
    if ((_a = dataset.backing) == null ? void 0 : _a.opfsPath) {
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
      var _a;
      (_a = document.getElementById("analysis-results-section")) == null ? void 0 : _a.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const handleConfirmStructureBoundary = () => {
    var _a;
    const detectedBoundary = (_a = workflow.structureReview) == null ? void 0 : _a.detectedBoundary;
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
