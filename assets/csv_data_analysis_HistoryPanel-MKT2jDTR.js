import { j as jsxRuntimeExports, a as reactExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-LvY-J6mW.js";
import { u as useAppStore, d as useDialogAccessibility } from "./csv_data_analysis_index-L92MBGHW.js";
import { U as getTranslation, bA as getStorageBreakdown, bB as clearAllCacheStorage, C as CURRENT_SESSION_KEY, bC as clearStore } from "./csv_data_analysis_app-agent-DytoEScF.js";
import { I as IconClose } from "./csv_data_analysis_IconClose-Cz0XDY4R.js";
import "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
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
      className: "inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600",
      title: getTranslation("history_more_actions", language),
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(MoreDotsIcon, {})
    }
  ),
  isOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-xl", children: [
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
const FileIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "h-5 w-5", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" }) });
const ChevronIcon = ({ open }) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "1.75", className: `h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 8l4 4 4-4" }) });
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
  const hasTitle = Boolean(latest.reportTitle);
  const displayTitle = latest.reportTitle ?? group.filename;
  const dualDates = showDualDates(latest.createdAt, latest.updatedAt);
  const renderActionButton = (report, isCurrent2, compact) => /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      onClick: () => isCurrent2 ? void onOpenReport(report.id) : void onLoad(report.id),
      disabled: loadingId !== null,
      className: `min-h-[44px] rounded-lg border border-slate-200 bg-white text-xs font-medium transition-colors ${compact ? "rounded-md px-2 py-1" : "px-3 py-1.5"} ${loadingId === report.id ? "text-slate-400 cursor-wait" : "text-slate-700 hover:border-slate-300 hover:bg-slate-50"} ${loadingId !== null && loadingId !== report.id ? "opacity-50 cursor-not-allowed" : ""}`,
      children: loadingId === report.id ? getTranslation("history_loading", language) ?? "Loading..." : isCurrent2 ? getTranslation("history_open_report", language) : getTranslation("history_load_session", language)
    }
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "group/row", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex items-start gap-3 px-5 py-3 transition-colors hover:bg-slate-50 ${isCurrent ? "bg-blue-50/50" : ""}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${isCurrent ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(FileIcon, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-sm font-medium text-slate-800", children: displayTitle }),
        hasTitle && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-xs text-slate-400 mt-0.5", children: group.filename }),
        latest.reportDescription && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs leading-relaxed text-slate-400 line-clamp-2", children: latest.reportDescription }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5", children: [
          dualDates ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] text-slate-400", children: [
              getTranslation("history_created_label", language),
              ": ",
              formatDate(latest.createdAt)
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-slate-300", children: "·" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] text-slate-400", children: [
              getTranslation("history_modified_label", language),
              ": ",
              formatDate(latest.updatedAt)
            ] })
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-slate-400", children: formatDateFull(latest.updatedAt) }),
          isCurrent && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700", children: getTranslation("history_current_badge", language) }),
          older.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => onToggleExpand(group.filename),
              className: "inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 transition-colors hover:bg-slate-200",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronIcon, { open: isGroupExpanded }),
                getTranslation("history_older_versions", language, { count: older.length })
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 flex-shrink-0 mt-0.5", children: [
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
        entry.reportTitle && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-xs text-slate-500", children: entry.reportTitle }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap items-center gap-x-2 gap-y-0.5", children: showDualDates(entry.createdAt, entry.updatedAt) ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] text-slate-400", children: [
            getTranslation("history_created_label", language),
            ": ",
            formatDate(entry.createdAt)
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-slate-300", children: "·" }),
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
  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => prev === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDirection("desc");
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
  const filteredGroups = reactExports.useMemo(
    () => groups.filter((g) => {
      var _a;
      if (!search) return true;
      const q = search.toLowerCase();
      const title = ((_a = g.latest.reportTitle) == null ? void 0 : _a.toLowerCase()) ?? "";
      return g.filename.toLowerCase().includes(q) || title.includes(q);
    }),
    [groups, search]
  );
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
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4", onClick: onClose, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: dialogRef,
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "history-dialog-title",
      tabIndex: -1,
      className: "relative flex h-full max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl",
      onClick: (e) => e.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-slate-100 px-5 py-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "history-dialog-title", className: "text-lg font-semibold text-slate-900", children: getTranslation("history_title", language) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-xs text-slate-500", children: getTranslation("history_footer", language) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              "data-dialog-initial-focus": true,
              onClick: onClose,
              className: "flex h-[44px] w-[44px] items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
              title: getTranslation("history_close", language),
              "aria-label": getTranslation("history_close", language),
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, {})
            }
          )
        ] }),
        reports.length > 2 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-b border-slate-100 px-5 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: getTranslation("history_search_placeholder", language),
            className: "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
          }
        ) }),
        (reports.length > 2 || true) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-slate-100 px-5 py-2", children: [
          reports.length > 2 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-[11px]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-400 mr-1", children: getTranslation("history_sort", language) }),
            [
              ["updatedAt", getTranslation("history_sort_modified", language)],
              ["createdAt", getTranslation("history_sort_created", language)],
              ["filename", getTranslation("history_sort_name", language)]
            ].map(([field, label]) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => toggleSort(field),
                className: `rounded px-1.5 py-0.5 transition-colors ${sortField === field ? "bg-blue-100 text-blue-700 font-medium" : "text-slate-500 hover:bg-slate-100"}`,
                children: [
                  label,
                  sortField === field && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-0.5", children: sortDirection === "desc" ? "↓" : "↑" })
                ]
              },
              field
            ))
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", {}),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            storageError ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { role: "alert", className: "flex items-center gap-2 text-xs text-amber-800", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation("history_storage_unavailable", language) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: () => void refreshStorageInfo(),
                  className: "min-h-[44px] rounded px-2 font-semibold text-blue-700 hover:bg-blue-50",
                  children: getTranslation("history_storage_retry", language)
                }
              )
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => setShowStorageInspector((prev) => !prev),
                className: "flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
                title: storageInfo ? getTranslation("history_storage_inspect_title", language, { size: storageInfo.idbLabel }) : getTranslation("history_storage_loading", language),
                disabled: !storageInfo,
                children: [
                  storageInfo ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation("history_storage_label", language) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "·" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: storageInfo.idbLabel })
                  ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation("history_storage_loading", language) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "1.75", className: `h-3 w-3 transition-transform ${showStorageInspector ? "" : "-rotate-90"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 8l4 4 4-4" }) })
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => void handlePurge(),
                disabled: isPurging,
                className: "min-h-[44px] rounded-md px-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-50",
                title: getTranslation("history_clear_all_title", language),
                children: isPurging ? getTranslation("history_clearing", language) : getTranslation("history_clear_all", language)
              }
            )
          ] })
        ] }),
        showStorageInspector && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-b border-slate-100 px-5 py-3 bg-slate-50/50", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          StorageBreakdown,
          {
            activeSessionId: currentSessionId,
            onStorageChanged: () => void refreshStorageInfo()
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-grow overflow-y-auto", children: filteredGroups.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full px-5", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-500", children: search ? getTranslation("history_no_results", language) : getTranslation("history_empty", language) }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "divide-y divide-slate-100", children: filteredGroups.map((group) => /* @__PURE__ */ jsxRuntimeExports.jsx(
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
        confirmLoadId && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-slate-900/40 backdrop-blur-[2px]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-6 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl", children: [
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
                className: "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700",
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
