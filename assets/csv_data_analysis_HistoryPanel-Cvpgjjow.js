import { j as jsxRuntimeExports, a as reactExports } from "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-CMf1uPe1.js";
import { u as useAppStore, f as useDialogAccessibility } from "./csv_data_analysis_index-DTmaDqCJ.js";
import { ad as getTranslation, cJ as isUsableReportTitle, dD as getStorageBreakdown, dE as clearAllCacheStorage, C as CURRENT_SESSION_KEY, dF as clearStore } from "./csv_data_analysis_app-agent-DkEZcEs8.js";
import { I as IconClose } from "./csv_data_analysis_IconClose-DoCpdGZg.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import "./csv_data_analysis_vendor-ai-sdk-CWgo4xjO.js";
import "./csv_data_analysis_vendor-ai-shared-L1egyVJx.js";
import "./csv_data_analysis_vendor-ai-google-CzQrQhPa.js";
import "./csv_data_analysis_vendor-ai-openai-XLZ2hpY0.js";
const HistoryStackIcon = (props) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", ...props, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 3 3 7.5 12 12l9-4.5L12 3Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m3 12 9 4.5 9-4.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m3 16.5 9 4.5 9-4.5" })
] });
const HistorySearchIcon = (props) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", ...props, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "11", cy: "11", r: "7" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m20 20-3.5-3.5" })
] });
const HistoryTrashIcon = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" }) });
const HistoryPlayIcon = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M7 5v14l12-7L7 5Z" }) });
const HistoryChartIcon = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 20V10M12 20V4M19 20v-7" }) });
const HistoryChevronIcon = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M6 8l4 4 4-4" }) });
const CSV_TONES = {
  green: { top: "#34d399", bottom: "#059669", fold: "#a7f3d0" },
  blue: { top: "#60a5fa", bottom: "#2563eb", fold: "#bfdbfe" },
  violet: { top: "#a78bfa", bottom: "#7c3aed", fold: "#ddd6fe" }
};
const csvToneFor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = hash * 31 + name.charCodeAt(i) >>> 0;
  return ["green", "blue", "violet"][hash % 3];
};
const CsvFileIcon = ({ tone, className }) => {
  const c = CSV_TONES[tone];
  const gid = `csv-grad-${tone}`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 40 48", className, "aria-hidden": "true", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("defs", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("linearGradient", { id: gid, x1: "0", y1: "0", x2: "0", y2: "1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "0", stopColor: c.top }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "1", stopColor: c.bottom })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M6 2h20l10 10v32a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z", fill: "#fff", stroke: c.bottom, strokeOpacity: ".35", strokeWidth: "1.5" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M26 2v8a2 2 0 0 0 2 2h8L26 2Z", fill: c.fold }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "2", y: "24", width: "30", height: "14", rx: "3", fill: `url(#${gid})` }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "17", y: "34.2", textAnchor: "middle", fontSize: "8.5", fontWeight: "700", fill: "#fff", fontFamily: "system-ui, sans-serif", children: "CSV" })
  ] });
};
const MoreDotsIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "currentColor", className: "h-4 w-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" }) });
const HistoryOverflowMenu = ({
  reportId,
  reportFilename,
  isOpen,
  isProtected,
  language,
  overflowRef,
  onToggle,
  onOpenReport,
  onExportPdf,
  onDelete
}) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", ref: isOpen ? overflowRef : void 0, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      onClick: (e) => {
        e.stopPropagation();
        onToggle(isOpen ? null : reportId);
      },
      className: "inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600",
      title: getTranslation("history_more_actions", language),
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(MoreDotsIcon, {})
    }
  ),
  isOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute right-0 z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => {
          onOpenReport(reportId);
          onToggle(null);
        },
        className: "flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50",
        children: getTranslation("history_open_report", language)
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => {
          onExportPdf(reportId);
          onToggle(null);
        },
        className: "flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50",
        children: getTranslation("history_export_pdf", language)
      }
    ),
    !isProtected && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "my-1 border-t border-slate-100" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => onDelete(reportId, reportFilename),
          className: "flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50",
          children: getTranslation("history_delete", language)
        }
      )
    ] })
  ] })
] });
const showDualDates = (created, updated) => Math.abs(new Date(updated).getTime() - new Date(created).getTime()) > 6e4;
const HistoryReportRow = ({
  group,
  language,
  loadingId,
  isGroupExpanded,
  overflowMenuId,
  overflowRef,
  onToggleExpand,
  onLoad,
  onOpenReport,
  onDelete,
  onExportPdf,
  onOverflowToggle,
  isProtectedReport,
  formatDate,
  formatDateFull
}) => {
  const { latest, older, isCurrent } = group;
  const latestTitle = latest.reportTitle && isUsableReportTitle(latest.reportTitle) ? latest.reportTitle : null;
  const hasTitle = Boolean(latestTitle);
  const displayTitle = latestTitle ?? group.filename;
  const dualDates = showDualDates(latest.createdAt, latest.updatedAt);
  const renderActionButton = (report, isCurrent2, compact) => {
    const busy = loadingId === report.id;
    const ActionIcon = isCurrent2 ? HistoryChartIcon : HistoryPlayIcon;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => isCurrent2 ? void onOpenReport(report.id) : void onLoad(report.id),
        disabled: loadingId !== null,
        className: `inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-xl border bg-white text-xs font-semibold transition-colors ${compact ? "px-2.5 py-1" : "px-3.5 py-1.5"} ${busy ? "cursor-wait border-slate-200 text-slate-400" : "border-indigo-200 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50"} ${loadingId !== null && !busy ? "cursor-not-allowed opacity-50" : ""}`,
        children: [
          !busy && /* @__PURE__ */ jsxRuntimeExports.jsx(ActionIcon, { className: "h-4 w-4" }),
          busy ? getTranslation("history_loading", language) ?? "Loading..." : isCurrent2 ? getTranslation("history_open_report", language) : getTranslation("history_load_session", language)
        ]
      }
    );
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: `group/row overflow-hidden rounded-2xl border shadow-sm transition-shadow hover:shadow-md ${isCurrent ? "border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50/60" : "border-slate-200/80 bg-white"}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CsvFileIcon, { tone: csvToneFor(group.filename), className: "mt-0.5 h-11 w-9 flex-shrink-0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-auto", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-sm font-semibold text-slate-900", children: displayTitle }),
        hasTitle && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-xs text-slate-400 mt-0.5", children: group.filename }),
        latest.reportDescription && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs leading-relaxed text-slate-400 line-clamp-2", children: latest.reportDescription }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5", children: [
          dualDates ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] text-slate-400", children: [
              getTranslation("history_created_label", language),
              ": ",
              formatDate(latest.createdAt)
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden text-[11px] text-slate-300 sm:inline", children: "·" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] text-slate-400", children: [
              getTranslation("history_modified_label", language),
              ": ",
              formatDate(latest.updatedAt)
            ] })
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-slate-400", children: formatDateFull(latest.updatedAt) }),
          isCurrent && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700", children: getTranslation("history_current_badge", language) }),
          older.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => onToggleExpand(group.filename),
              className: "inline-flex items-center gap-0.5 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-slate-50",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryChevronIcon, { className: `h-3.5 w-3.5 transition-transform ${isGroupExpanded ? "" : "-rotate-90"}` }),
                getTranslation("history_older_versions", language, { count: older.length })
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex w-full flex-shrink-0 items-center justify-end gap-1 sm:w-auto", children: [
        renderActionButton(latest, isCurrent),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          HistoryOverflowMenu,
          {
            reportId: latest.id,
            reportFilename: group.filename,
            isOpen: overflowMenuId === latest.id,
            isProtected: isProtectedReport(latest.id),
            language,
            overflowRef,
            onToggle: onOverflowToggle,
            onOpenReport,
            onExportPdf,
            onDelete
          }
        )
      ] })
    ] }),
    isGroupExpanded && older.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-slate-50 bg-slate-50/50", children: older.map((entry) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 px-5 py-2 pl-16 transition-colors hover:bg-slate-100/80", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
        entry.reportTitle && isUsableReportTitle(entry.reportTitle) && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-xs text-slate-500", children: entry.reportTitle }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap items-center gap-x-2 gap-y-0.5", children: showDualDates(entry.createdAt, entry.updatedAt) ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] text-slate-400", children: [
            getTranslation("history_created_label", language),
            ": ",
            formatDate(entry.createdAt)
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden text-[11px] text-slate-300 sm:inline", children: "·" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] text-slate-400", children: [
            getTranslation("history_modified_label", language),
            ": ",
            formatDate(entry.updatedAt)
          ] })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] text-slate-400", children: [
          getTranslation("history_created_label", language),
          ": ",
          formatDate(entry.createdAt)
        ] }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 flex-shrink-0", children: [
        renderActionButton(entry, false, true),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          HistoryOverflowMenu,
          {
            reportId: entry.id,
            reportFilename: group.filename,
            isOpen: overflowMenuId === entry.id,
            isProtected: isProtectedReport(entry.id),
            language,
            overflowRef,
            onToggle: onOverflowToggle,
            onOpenReport,
            onExportPdf,
            onDelete
          }
        )
      ] })
    ] }, entry.id)) })
  ] });
};
const formatBytes$1 = (bytes) => {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
const STORE_COLORS = {
  reports: "bg-blue-400",
  report_artifacts: "bg-indigo-400",
  original_data: "bg-amber-400",
  agent_memory_runs: "bg-emerald-400",
  vector_memory: "bg-purple-400",
  ai_consents: "bg-cyan-400",
  settings: "bg-slate-300",
  cache: "bg-orange-400"
};
const STORE_DOT_COLORS = {
  reports: "bg-blue-400",
  report_artifacts: "bg-indigo-400",
  original_data: "bg-amber-400",
  agent_memory_runs: "bg-emerald-400",
  vector_memory: "bg-purple-400",
  ai_consents: "bg-cyan-400",
  settings: "bg-slate-300",
  cache: "bg-orange-400"
};
const TrashIcon = ({ className = "h-3.5 w-3.5" }) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" }) });
const RefreshIcon = ({ className = "h-3.5 w-3.5" }) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" }) });
const UNCLEARABLE_STORES = /* @__PURE__ */ new Set(["settings"]);
const StorageBreakdown = ({ activeSessionId, onStorageChanged }) => {
  const [data, setData] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  const [clearing, setClearing] = reactExports.useState(null);
  const refresh = reactExports.useCallback(async () => {
    setLoading(true);
    try {
      const result = await getStorageBreakdown();
      setData(result);
    } finally {
      setLoading(false);
    }
  }, []);
  reactExports.useEffect(() => {
    void refresh();
  }, [refresh]);
  const handleClearStore = async (storeName) => {
    if (UNCLEARABLE_STORES.has(storeName)) return;
    const protectKeys = /* @__PURE__ */ new Set();
    if (storeName === "reports") {
      protectKeys.add(CURRENT_SESSION_KEY);
      if (activeSessionId) protectKeys.add(activeSessionId);
    }
    if (storeName === "original_data") {
      if (activeSessionId) protectKeys.add(activeSessionId);
      try {
        const tabId = sessionStorage.getItem("csv_agent_tab_session_id");
        if (tabId) protectKeys.add(tabId);
      } catch {
      }
    }
    setClearing(storeName);
    try {
      await clearStore(storeName, protectKeys.size > 0 ? protectKeys : void 0);
      await refresh();
      onStorageChanged == null ? void 0 : onStorageChanged();
    } finally {
      setClearing(null);
    }
  };
  const handleClearCache = async () => {
    setClearing("cache");
    try {
      await clearAllCacheStorage();
      await refresh();
      onStorageChanged == null ? void 0 : onStorageChanged();
    } finally {
      setClearing(null);
    }
  };
  if (loading && !data) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 py-3 text-xs text-slate-400 text-center", children: "Scanning storage..." });
  }
  if (!data) return null;
  const allSegments = [
    ...data.stores.map((s) => ({
      key: s.storeName,
      label: s.label,
      bytes: s.estimatedBytes,
      count: s.recordCount,
      color: STORE_COLORS[s.storeName] ?? "bg-slate-300",
      dotColor: STORE_DOT_COLORS[s.storeName] ?? "bg-slate-300",
      clearable: !UNCLEARABLE_STORES.has(s.storeName) && s.recordCount > 0,
      isCache: false
    })),
    {
      key: "cache",
      label: "Cache Storage (ONNX models)",
      bytes: data.cacheStorage.estimatedBytes,
      count: data.cacheStorage.cacheCount,
      color: STORE_COLORS.cache,
      dotColor: STORE_DOT_COLORS.cache,
      clearable: data.cacheStorage.cacheCount > 0,
      isCache: true
    }
  ];
  const maxBytes = Math.max(...allSegments.map((s) => s.bytes), 1);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-semibold text-slate-600 uppercase tracking-wider", children: "Storage Inspector" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => void refresh(),
          disabled: loading,
          className: "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50",
          title: "Refresh",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshIcon, { className: `h-3 w-3 ${loading ? "animate-spin" : ""}` }),
            "Refresh"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-3 w-full rounded-full bg-slate-100 overflow-hidden flex", children: allSegments.filter((s) => s.bytes > 0).map((seg) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: `${seg.color} transition-all`,
        style: { width: `${Math.max(1, seg.bytes / data.rawOriginBytes * 100)}%` },
        title: `${seg.label}: ${formatBytes$1(seg.bytes)}`
      },
      seg.key
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-[10px] text-slate-400", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "IndexedDB: ",
        formatBytes$1(data.totalIdbBytes)
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "Total (with cache): ",
        formatBytes$1(data.rawOriginBytes)
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-0.5", children: allSegments.map((seg) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 group/row",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `h-2.5 w-2.5 rounded-full flex-shrink-0 ${seg.dotColor}` }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-700 truncate", children: seg.label }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-slate-400", children: seg.isCache ? `${seg.count} cache${seg.count !== 1 ? "s" : ""}` : `${seg.count} record${seg.count !== 1 ? "s" : ""}` })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-shrink-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: `h-full rounded-full ${seg.color}`,
                style: { width: `${Math.max(1, seg.bytes / maxBytes * 100)}%` }
              }
            ) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono text-slate-500 w-16 text-right", children: formatBytes$1(seg.bytes) }),
            seg.clearable ? /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => void (seg.isCache ? handleClearCache() : handleClearStore(seg.key)),
                disabled: clearing !== null,
                className: "flex items-center justify-center h-5 w-5 rounded text-slate-300 opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-500 disabled:opacity-50 disabled:cursor-wait",
                title: `Clear ${seg.label}`,
                children: clearing === seg.key ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-3 w-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(TrashIcon, { className: "h-3 w-3" })
              }
            ) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-5" })
          ] })
        ]
      },
      seg.key
    )) })
  ] });
};
const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1e3;
function groupReportsByFilename(reports, currentSessionId, sortField, sortDirection) {
  const groups = /* @__PURE__ */ new Map();
  for (const report of reports) {
    const key = report.filename;
    const list = groups.get(key) ?? [];
    list.push(report);
    groups.set(key, list);
  }
  return Array.from(groups.values()).map((entries) => {
    const sorted = entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const currentIdx = sorted.findIndex((r) => r.id === currentSessionId);
    const latest = currentIdx >= 0 ? sorted[currentIdx] : sorted[0];
    const older = sorted.filter((r) => r.id !== latest.id);
    return {
      filename: latest.filename,
      latest,
      older,
      isCurrent: latest.id === currentSessionId
    };
  }).sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    const dir = sortDirection === "asc" ? 1 : -1;
    if (sortField === "filename") {
      return dir * a.filename.localeCompare(b.filename);
    }
    const aDate = new Date(a.latest[sortField]).getTime();
    const bDate = new Date(b.latest[sortField]).getTime();
    return dir * (aDate - bDate);
  });
}
const HistoryPanel = () => {
  const {
    isOpen,
    onClose,
    reports,
    onLoadReport,
    onDeleteReport,
    onPurgeStorage,
    onOpenReport,
    onExportPdf,
    currentSessionId,
    language,
    hasCsvData
  } = useAppStore((state) => ({
    isOpen: state.isHistoryPanelOpen,
    onClose: () => state.setIsHistoryPanelOpen(false),
    reports: state.reportsList,
    onLoadReport: state.handleLoadReport,
    onDeleteReport: state.handleDeleteReport,
    onPurgeStorage: state.handlePurgeStorage,
    onOpenReport: state.openPersistedReportArtifact,
    onExportPdf: state.exportPersistedReportPdf,
    currentSessionId: state.sessionId,
    language: state.settings.language,
    hasCsvData: Boolean(state.csvData)
  }), shallow$1);
  const [search, setSearch] = reactExports.useState("");
  const [tab, setTab] = reactExports.useState("all");
  const [overflowMenuId, setOverflowMenuId] = reactExports.useState(null);
  const [expandedGroup, setExpandedGroup] = reactExports.useState(null);
  const [loadingId, setLoadingId] = reactExports.useState(null);
  const [confirmLoadId, setConfirmLoadId] = reactExports.useState(null);
  const [sortField, setSortField] = reactExports.useState("updatedAt");
  const [sortDirection, setSortDirection] = reactExports.useState("desc");
  const [storageInfo, setStorageInfo] = reactExports.useState(null);
  const [storageError, setStorageError] = reactExports.useState(false);
  const [isPurging, setIsPurging] = reactExports.useState(false);
  const [showStorageInspector, setShowStorageInspector] = reactExports.useState(false);
  const overflowRef = reactExports.useRef(null);
  const dialogRef = useDialogAccessibility(
    isOpen,
    onClose,
    { restoreFocusSelector: '[data-history-trigger="true"]' }
  );
  const refreshStorageInfo = async () => {
    setStorageError(false);
    try {
      const breakdown = await getStorageBreakdown();
      setStorageInfo({
        idbLabel: formatBytes(breakdown.totalIdbBytes),
        idbBytes: breakdown.totalIdbBytes
      });
    } catch {
      setStorageInfo(null);
      setStorageError(true);
    }
  };
  reactExports.useEffect(() => {
    if (!isOpen) return;
    void refreshStorageInfo();
  }, [isOpen]);
  const handlePurge = async () => {
    const nonCurrentReports = reports.filter((r) => r.id !== currentSessionId && r.id !== CURRENT_SESSION_KEY);
    const msg = nonCurrentReports.length > 0 ? `Delete all ${nonCurrentReports.length} history records and free up storage? This cannot be undone.` : "Clear all cached data (original CSV backups, memory runs, artifacts) to free up storage?";
    if (!window.confirm(msg)) return;
    setIsPurging(true);
    try {
      await onPurgeStorage();
      await refreshStorageInfo();
    } finally {
      setIsPurging(false);
    }
  };
  const handleLoad = (id) => {
    if (hasCsvData) {
      setConfirmLoadId(id);
      return;
    }
    void doLoad(id);
  };
  const doLoad = async (id) => {
    setConfirmLoadId(null);
    setLoadingId(id);
    try {
      await onLoadReport(id);
    } finally {
      setLoadingId(null);
    }
  };
  reactExports.useEffect(() => {
    if (!overflowMenuId) return;
    const handler = (e) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target)) {
        setOverflowMenuId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [overflowMenuId]);
  const groups = reactExports.useMemo(
    () => groupReportsByFilename(reports, currentSessionId, sortField, sortDirection),
    [reports, currentSessionId, sortField, sortDirection]
  );
  const searchedGroups = reactExports.useMemo(
    () => groups.filter((g) => {
      var _a;
      if (!search) return true;
      const q = search.toLowerCase();
      const title = ((_a = g.latest.reportTitle) == null ? void 0 : _a.toLowerCase()) ?? "";
      return g.filename.toLowerCase().includes(q) || title.includes(q);
    }),
    [groups, search]
  );
  const tabCounts = reactExports.useMemo(() => {
    const now = Date.now();
    return {
      all: searchedGroups.length,
      recent: searchedGroups.filter((g) => now - new Date(g.latest.updatedAt).getTime() <= RECENT_WINDOW_MS).length,
      versions: searchedGroups.filter((g) => g.older.length > 0).length
    };
  }, [searchedGroups]);
  const filteredGroups = reactExports.useMemo(() => {
    if (tab === "all") return searchedGroups;
    if (tab === "versions") return searchedGroups.filter((g) => g.older.length > 0);
    const now = Date.now();
    return searchedGroups.filter((g) => now - new Date(g.latest.updatedAt).getTime() <= RECENT_WINDOW_MS);
  }, [searchedGroups, tab]);
  if (!isOpen) return null;
  const handleDelete = (id, filename) => {
    if (window.confirm(`Are you sure you want to delete the report for "${filename}"? This cannot be undone.`)) {
      onDeleteReport(id);
      setOverflowMenuId(null);
    }
  };
  const pad = (n) => String(n).padStart(2, "0");
  const fmtStd = (date) => {
    const d = new Date(date);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const formatDate = fmtStd;
  const formatDateFull = fmtStd;
  const isProtectedReport = (reportId) => reportId === currentSessionId || reportId === CURRENT_SESSION_KEY;
  const tabs = [
    ["all", getTranslation("history_tab_all", language)],
    ["recent", getTranslation("history_tab_recent", language)],
    ["versions", getTranslation("history_tab_versions", language)]
  ];
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]", onClick: onClose, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: dialogRef,
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "history-dialog-title",
      tabIndex: -1,
      className: "relative flex h-full max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl",
      onClick: (e) => e.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex items-center justify-between gap-3 px-6 pb-3 pt-5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-indigo-100/80 via-violet-50/50 to-transparent", "aria-hidden": "true" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-200", children: /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryStackIcon, { className: "h-6 w-6" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "history-dialog-title", className: "text-lg font-semibold text-slate-900", children: getTranslation("history_title", language) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-xs text-slate-500", children: getTranslation("history_footer", language) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              "data-dialog-initial-focus": true,
              onClick: onClose,
              className: "relative flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-white hover:text-slate-900",
              title: getTranslation("history_close", language),
              "aria-label": getTranslation("history_close", language),
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, {})
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 pb-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm transition focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(HistorySearchIcon, { className: "h-4 w-4 flex-shrink-0 text-slate-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: search,
              onChange: (e) => setSearch(e.target.value),
              placeholder: getTranslation("history_search_placeholder", language),
              "aria-label": getTranslation("history_search_placeholder", language),
              className: "min-h-[44px] w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
            }
          )
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-100 px-6 pb-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { role: "tablist", "aria-label": getTranslation("history_filter_label", language), className: "flex flex-wrap items-center gap-1.5", children: tabs.map(([id, label]) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": tab === id,
              onClick: () => setTab(id),
              className: `min-h-[36px] rounded-full px-3.5 text-xs font-semibold transition-colors ${tab === id ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`,
              children: [
                label,
                " (",
                tabCounts[id],
                ")"
              ]
            },
            id
          )) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1.5 text-xs text-slate-500", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation("history_sort", language) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "relative", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "select",
                  {
                    value: sortField,
                    onChange: (e) => {
                      setSortField(e.target.value);
                      setSortDirection(e.target.value === "filename" ? "asc" : "desc");
                    },
                    "aria-label": getTranslation("history_sort_aria", language),
                    className: "min-h-[36px] cursor-pointer appearance-none rounded-lg bg-transparent py-1 pl-1.5 pr-6 text-xs font-medium text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-200",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "updatedAt", children: getTranslation("history_sort_modified", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "createdAt", children: getTranslation("history_sort_created", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "filename", children: getTranslation("history_sort_name", language) })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryChevronIcon, { className: "pointer-events-none absolute right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => setSortDirection((prev) => prev === "desc" ? "asc" : "desc"),
                title: getTranslation("history_sort_direction", language),
                "aria-label": getTranslation("history_sort_direction", language),
                className: "flex h-9 w-9 items-center justify-center rounded-lg text-sm text-slate-500 hover:bg-slate-100",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: sortDirection === "desc" ? "↓" : "↑" })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => void handlePurge(),
                disabled: isPurging,
                className: "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-50",
                title: getTranslation("history_clear_all_title", language),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryTrashIcon, { className: "h-4 w-4" }),
                  isPurging ? getTranslation("history_clearing", language) : getTranslation("history_clear_all", language)
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between px-6 py-1.5", children: storageError ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { role: "alert", className: "flex items-center gap-2 text-xs text-amber-800", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation("history_storage_unavailable", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => void refreshStorageInfo(),
              className: "min-h-[44px] rounded px-2 font-semibold text-indigo-700 hover:bg-indigo-50",
              children: getTranslation("history_storage_retry", language)
            }
          )
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => setShowStorageInspector((prev) => !prev),
            className: "flex min-h-[36px] items-center gap-1.5 rounded-md px-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800",
            title: storageInfo ? getTranslation("history_storage_inspect_title", language, { size: storageInfo.idbLabel }) : getTranslation("history_storage_loading", language),
            disabled: !storageInfo,
            children: [
              storageInfo ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation("history_storage_label", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "·" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: storageInfo.idbLabel })
              ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation("history_storage_loading", language) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryChevronIcon, { className: `h-3 w-3 transition-transform ${showStorageInspector ? "" : "-rotate-90"}` })
            ]
          }
        ) }),
        showStorageInspector && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-y border-slate-100 bg-slate-50/60 px-6 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          StorageBreakdown,
          {
            activeSessionId: currentSessionId,
            onStorageChanged: () => void refreshStorageInfo()
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-grow overflow-y-auto px-4 pb-4", children: filteredGroups.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full px-5", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-500", children: search || tab !== "all" ? getTranslation("history_no_results", language) : getTranslation("history_empty", language) }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-2.5", children: filteredGroups.map((group) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          HistoryReportRow,
          {
            group,
            language,
            loadingId,
            isGroupExpanded: expandedGroup === group.filename,
            overflowMenuId,
            overflowRef,
            onToggleExpand: (fn) => setExpandedGroup((prev) => prev === fn ? null : fn),
            onLoad: handleLoad,
            onOpenReport: (id) => void onOpenReport(id),
            onDelete: handleDelete,
            onExportPdf: (id) => void onExportPdf(id),
            onOverflowToggle: setOverflowMenuId,
            isProtectedReport,
            formatDate,
            formatDateFull
          },
          group.latest.id
        )) }) }),
        confirmLoadId && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 z-30 flex items-center justify-center rounded-3xl bg-slate-900/40 backdrop-blur-[2px]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-6 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-slate-800", children: getTranslation("history_switch_session", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs leading-relaxed text-slate-500", children: getTranslation("history_switch_session_desc", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex justify-end gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => setConfirmLoadId(null),
                className: "rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50",
                children: getTranslation("history_switch_cancel", language)
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => void doLoad(confirmLoadId),
                className: "rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700",
                children: getTranslation("history_switch_confirm", language)
              }
            )
          ] })
        ] }) })
      ]
    }
  ) });
};
export {
  HistoryPanel
};
