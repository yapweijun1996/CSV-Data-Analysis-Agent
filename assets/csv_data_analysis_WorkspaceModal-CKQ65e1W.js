const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./csv_data_analysis_WorkspaceModalEditor-C5-6Awy-.js","./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js","./csv_data_analysis_vendor-data-gCZ_DPYi.js","./csv_data_analysis_vendor-storage-Dda2oZrY.js","./csv_data_analysis_vendor-ai-google-CTyAUw0K.js","./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js","./csv_data_analysis_vendor-react-core-C-mUT8EF.js"])))=>i.map(i=>d[i]);
import { a7 as hasOpenableLatestReport, bJ as buildWorkspaceBundle, bK as isWorkspaceWritablePath, _ as __vitePreload } from "./csv_data_analysis_app-agent-DytoEScF.js";
import { a as reactExports, j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-LvY-J6mW.js";
import { u as useAppStore, d as useDialogAccessibility } from "./csv_data_analysis_index-L92MBGHW.js";
import { I as IconClose } from "./csv_data_analysis_IconClose-Cz0XDY4R.js";
import "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
const splitLines = (value) => value.replace(/\r\n/g, "\n").split("\n");
const countLines = (value) => splitLines(value).length;
const getRootGroup = (path) => path.split("/").filter(Boolean)[0] ?? "root";
const getMonacoLanguage = (language) => {
  switch (language) {
    case "json":
      return "json";
    case "markdown":
      return "markdown";
    case "javascript":
      return "javascript";
    case "csv":
      return "plaintext";
    case "ndjson":
      return "json";
    default:
      return "plaintext";
  }
};
const WorkspaceModalEditor = reactExports.lazy(
  () => __vitePreload(() => import("./csv_data_analysis_WorkspaceModalEditor-C5-6Awy-.js"), true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url).then((module) => ({ default: module.WorkspaceModalEditor }))
);
const WorkspaceModal = () => {
  const { isOpen, onClose, logAgentToolUsage, workspaceState, openLatestAnalystReport, exportLatestAnalystReportPdf, hasLatestAnalystReport } = useAppStore((store) => ({
    isOpen: store.isWorkspaceModalOpen,
    onClose: () => store.setIsWorkspaceModalOpen(false),
    logAgentToolUsage: store.logAgentToolUsage,
    openLatestAnalystReport: store.openLatestAnalystReport,
    exportLatestAnalystReportPdf: store.exportLatestAnalystReportPdf,
    hasLatestAnalystReport: hasOpenableLatestReport(store.workspaceFiles),
    workspaceState: {
      sessionId: store.sessionId,
      currentDatasetId: store.currentDatasetId,
      confirmedAnalysisGoal: store.confirmedAnalysisGoal,
      settings: store.settings,
      csvData: store.csvData,
      rawCsvData: store.rawCsvData,
      initialDataSample: store.initialDataSample,
      columnProfiles: store.columnProfiles,
      analysisCards: store.analysisCards,
      chatHistory: store.chatHistory,
      dataPreparationPlan: store.dataPreparationPlan,
      spreadsheetFilterFunction: store.spreadsheetFilterFunction,
      activeSpreadsheetFilter: store.activeSpreadsheetFilter,
      aiFilterExplanation: store.aiFilterExplanation,
      activeDataQuery: store.activeDataQuery,
      dataQualityIssues: store.dataQualityIssues,
      finalSummary: store.finalSummary,
      agentEvents: store.agentEvents,
      agentToolLogs: store.agentToolLogs,
      telemetryEvents: store.telemetryEvents,
      workspaceFiles: store.workspaceFiles,
      workspaceActionHistory: store.workspaceActionHistory
    }
  }), shallow$1);
  const dialogRef = useDialogAccessibility(isOpen, onClose);
  const bundle = reactExports.useMemo(() => buildWorkspaceBundle(workspaceState), [workspaceState]);
  const [selectedPath, setSelectedPath] = reactExports.useState("/dataset/cleaned.json");
  const [fileFilter, setFileFilter] = reactExports.useState("");
  const [showDebugFiles, setShowDebugFiles] = reactExports.useState(false);
  const hasLoggedOpenRef = reactExports.useRef(false);
  const visibleFiles = reactExports.useMemo(() => {
    const base = showDebugFiles ? [...bundle.primaryFiles, ...bundle.debugFiles] : bundle.primaryFiles;
    const query = fileFilter.trim().toLowerCase();
    if (!query) return base;
    return base.filter((file) => file.path.toLowerCase().includes(query));
  }, [bundle.debugFiles, bundle.primaryFiles, fileFilter, showDebugFiles]);
  const groupedFiles = reactExports.useMemo(() => visibleFiles.reduce((acc, file) => {
    const group = file.group === "debug" ? getRootGroup(file.path) : file.group;
    acc[group] = [...acc[group] ?? [], file];
    return acc;
  }, {}), [visibleFiles]);
  const selectedFile = visibleFiles.find((file) => file.path === selectedPath) ?? bundle.primaryFiles.find((file) => file.path === selectedPath) ?? bundle.primaryFiles[0] ?? (showDebugFiles ? bundle.debugFiles[0] : null) ?? null;
  const selectedFileWritable = Boolean(selectedFile && isWorkspaceWritablePath(selectedFile.path));
  const selectedFileLineCount = selectedFile ? countLines(selectedFile.content) : 0;
  const selectedFileBytes = selectedFile ? new TextEncoder().encode(selectedFile.content).length : 0;
  reactExports.useEffect(() => {
    if (!isOpen) {
      hasLoggedOpenRef.current = false;
      setShowDebugFiles(false);
      setFileFilter("");
      return;
    }
    if (!hasLoggedOpenRef.current) {
      hasLoggedOpenRef.current = true;
      logAgentToolUsage({
        tool: "workspace_builder",
        description: "Opened workspace modal.",
        detail: {
          fileCount: bundle.files.length,
          primaryFileCount: bundle.primaryFiles.length,
          debugFileCount: bundle.debugFiles.length
        }
      });
    }
  }, [bundle.debugFiles.length, bundle.files.length, bundle.primaryFiles.length, isOpen, logAgentToolUsage]);
  reactExports.useEffect(() => {
    if (!selectedFile) return;
    setSelectedPath(selectedFile.path);
  }, [selectedFile == null ? void 0 : selectedFile.path]);
  if (!isOpen) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm", onClick: onClose, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: dialogRef,
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "workspace-dialog-title",
      tabIndex: -1,
      className: "relative flex h-screen w-screen flex-col bg-[#f8fafc]",
      onClick: (event) => event.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "border-b border-slate-200 bg-white/95 backdrop-blur-xl", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-4 px-4 py-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] uppercase tracking-[0.24em] text-slate-500", children: "Artifacts" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 flex items-center gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "workspace-dialog-title", className: "text-lg font-semibold text-slate-900", children: "Session Artifacts" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600", children: [
                bundle.primaryFiles.length,
                " files"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600", children: [
                bundle.editableFiles.length,
                " editable"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
            hasLatestAnalystReport ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: openLatestAnalystReport,
                  className: "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100",
                  children: "Open Report"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: exportLatestAnalystReportPdf,
                  className: "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100",
                  children: "Export PDF"
                }
              )
            ] }) : null,
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => setShowDebugFiles((current) => !current),
                className: `rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${showDebugFiles ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`,
                children: showDebugFiles ? "Hide Debug" : `Show Debug (${bundle.debugFiles.length})`
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                "data-dialog-initial-focus": true,
                onClick: onClose,
                className: "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
                "aria-label": "Close workspace modal",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, {})
              }
            )
          ] })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 overflow-hidden p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-card border border-slate-200 bg-white shadow-2xl lg:grid-cols-[300px_minmax(0,1fr)]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-b border-slate-200 px-4 py-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500", children: "Explorer" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "workspaceFileFilter", className: "sr-only", children: "File filter" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  id: "workspaceFileFilter",
                  value: fileFilter,
                  onChange: (event) => setFileFilter(event.target.value),
                  placeholder: "Filter files",
                  className: "mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2 text-xs", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600", children: [
                  bundle.primaryFiles.length,
                  " primary"
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600", children: [
                  bundle.editableFiles.length,
                  " editable"
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600", children: [
                  visibleFiles.length,
                  " visible"
                ] })
              ] }) }),
              visibleFiles.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-500", children: "No files match the current filter." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: Object.entries(groupedFiles).map(([group, files]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center justify-between gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs uppercase tracking-[0.18em] text-slate-500", children: group }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-slate-500", children: files.length })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: files.map((file) => {
                  var _a;
                  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "button",
                    {
                      onClick: () => setSelectedPath(file.path),
                      className: `flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${(selectedFile == null ? void 0 : selectedFile.path) === file.path ? "bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-400/40" : "text-slate-700 hover:bg-slate-100"}`,
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "min-w-0 break-all", children: file.group === "debug" ? file.path.replace(`/${group}/`, "") : file.path.replace(`/${file.group}/`, "") }),
                        ((_a = file.badges) == null ? void 0 : _a.includes("editable")) ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${(selectedFile == null ? void 0 : selectedFile.path) === file.path ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`, children: "edit" }) : null
                      ]
                    },
                    file.path
                  );
                }) })
              ] }, group)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "min-h-0 flex flex-col bg-white", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-b border-slate-200 bg-slate-50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-h-[44px] items-center justify-between gap-3 px-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-t-md border border-b-0 border-slate-200 bg-white px-3 py-2 text-sm text-slate-800", children: (selectedFile == null ? void 0 : selectedFile.label) ?? "untitled" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden text-xs text-slate-500 md:inline", children: (selectedFile == null ? void 0 : selectedFile.path) ?? "No file selected" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full px-2.5 py-1 font-medium ${selectedFileWritable ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`, children: selectedFileWritable ? "Writable" : "Read only" }) })
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-b border-slate-200 bg-white px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs uppercase tracking-wide text-slate-500", children: "Preview" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 break-all text-sm font-semibold text-slate-900", children: (selectedFile == null ? void 0 : selectedFile.path) ?? "No file selected" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-xs text-slate-500", children: [
                (selectedFile == null ? void 0 : selectedFile.language.toUpperCase()) ?? "TEXT",
                " · ",
                selectedFileLineCount,
                " line",
                selectedFileLineCount === 1 ? "" : "s",
                " · ",
                selectedFileBytes.toLocaleString(),
                " bytes"
              ] })
            ] }) }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 bg-white", children: !selectedFile ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full items-center justify-center p-5", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-500", children: "No workspace file available yet." }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
              reactExports.Suspense,
              {
                fallback: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full items-center justify-center p-5", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-500", children: "Loading workspace editor..." }) }),
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  WorkspaceModalEditor,
                  {
                    path: selectedFile.path,
                    language: getMonacoLanguage(selectedFile.language),
                    value: selectedFile.content
                  }
                )
              }
            ) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: (selectedFile == null ? void 0 : selectedFile.language.toUpperCase()) ?? "TEXT" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                  selectedFileLineCount,
                  " lines"
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                  selectedFileBytes.toLocaleString(),
                  " bytes"
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: (selectedFile == null ? void 0 : selectedFile.path) ?? "" }) })
            ] })
          ] })
        ] }) })
      ]
    }
  ) });
};
export {
  WorkspaceModal
};
