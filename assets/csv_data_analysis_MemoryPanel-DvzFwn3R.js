import { j as jsxRuntimeExports, a as reactExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { v as vectorStore, B as resolveReportMemoryScope, bD as flushPendingVectorMemoryDocs } from "./csv_data_analysis_app-agent-DytoEScF.js";
import { u as useAppStore, d as useDialogAccessibility } from "./csv_data_analysis_index-L92MBGHW.js";
import { I as IconClose } from "./csv_data_analysis_IconClose-Cz0XDY4R.js";
import { I as IconMemory } from "./csv_data_analysis_IconMemory-CuUVrq-7.js";
import "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
import "./csv_data_analysis_vendor-state-LvY-J6mW.js";
const IconDelete = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-4 w-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" }) });
const MEMORY_CAPACITY_KB = 5 * 1024;
const MemoryPanel = () => {
  const isOpen = useAppStore((state) => state.isMemoryPanelOpen);
  const onClose = () => useAppStore.getState().setIsMemoryPanelOpen(false);
  const [documents, setDocuments] = reactExports.useState([]);
  const [searchQuery, setSearchQuery] = reactExports.useState("");
  const [searchResults, setSearchResults] = reactExports.useState([]);
  const [isSearching, setIsSearching] = reactExports.useState(false);
  const [highlightedDocText, setHighlightedDocText] = reactExports.useState(null);
  const [modelStatus, setModelStatus] = reactExports.useState(vectorStore.getStatus());
  const [modelError, setModelError] = reactExports.useState(vectorStore.getLastError());
  const dialogRef = useDialogAccessibility(isOpen, onClose);
  const isModelReady = modelStatus === "ready";
  const activeMemoryScope = resolveReportMemoryScope(useAppStore.getState());
  const refreshDocuments = reactExports.useCallback(async () => {
    const scope = resolveReportMemoryScope(useAppStore.getState());
    const docs = await vectorStore.getDocumentsForScope(scope);
    setDocuments(docs);
  }, []);
  const syncModelState = reactExports.useCallback(() => {
    setModelStatus(vectorStore.getStatus());
    setModelError(vectorStore.getLastError());
  }, []);
  const memoryUsage = reactExports.useMemo(() => {
    if (documents.length === 0) return 0;
    const textSize = documents.reduce((acc, doc) => acc + doc.text.length * 2, 0);
    const embeddingSize = documents.length * 384 * 4;
    return (textSize + embeddingSize) / 1024;
  }, [documents]);
  const activationTriggered = reactExports.useRef(false);
  reactExports.useEffect(() => {
    if (isOpen) {
      void refreshDocuments();
      syncModelState();
      if (!activationTriggered.current) {
        activationTriggered.current = true;
        const store = { getState: useAppStore.getState, setState: useAppStore.setState };
        void vectorStore.ensureVectorMemoryReady(
          "memory_panel",
          store,
          async (s) => {
            await flushPendingVectorMemoryDocs(s);
            void refreshDocuments();
            syncModelState();
          }
        ).then(() => {
          syncModelState();
          void refreshDocuments();
        });
      }
    } else {
      activationTriggered.current = false;
      setSearchQuery("");
      setSearchResults([]);
      setHighlightedDocText(null);
    }
  }, [isOpen, refreshDocuments, syncModelState]);
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || modelStatus === "loading") return;
    setIsSearching(true);
    setHighlightedDocText(null);
    syncModelState();
    const scope = resolveReportMemoryScope(useAppStore.getState());
    if (!scope) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    const results = await vectorStore.search(searchQuery, 5, scope);
    setSearchResults(results.map((item) => {
      var _a, _b;
      return {
        text: item.text,
        score: item.score,
        origin: (_b = (_a = item.metadata) == null ? void 0 : _a.origin) == null ? void 0 : _b.label
      };
    }));
    syncModelState();
    setIsSearching(false);
  };
  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this memory item?")) {
      await vectorStore.deleteDocument(id);
      vectorStore.schedulePersist();
      useAppStore.setState({
        vectorStoreDocuments: await vectorStore.getDocuments()
      });
      await refreshDocuments();
    }
  };
  const handleClearAll = async () => {
    if (window.confirm("Are you sure you want to clear all memory items for this report and dataset version? This cannot be undone.")) {
      await Promise.all(documents.map((document2) => vectorStore.deleteDocument(document2.id)));
      vectorStore.schedulePersist();
      useAppStore.setState({
        vectorStoreDocuments: await vectorStore.getDocuments()
      });
      await refreshDocuments();
      setSearchResults([]);
    }
  };
  const handleSearchResultClick = (text) => {
    setHighlightedDocText(text);
    const element = document.getElementById(`memory-doc-${text.substring(0, 30)}`);
    element == null ? void 0 : element.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  if (!isOpen) return null;
  const memoryUsagePercentage = Math.min(memoryUsage / MEMORY_CAPACITY_KB * 100, 100);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900 bg-opacity-50 p-4 transition-opacity",
      onClick: onClose,
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          ref: dialogRef,
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "memory-dialog-title",
          tabIndex: -1,
          className: "flex h-full max-h-[85vh] w-full max-w-4xl flex-col rounded-card border border-slate-200 bg-white p-4 shadow-xl",
          onClick: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "mb-3 flex shrink-0 items-start justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconMemory, {}) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "memory-dialog-title", className: "text-2xl font-bold text-slate-900", children: "AI Long-Term Memory" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 pl-12", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-baseline gap-2 text-sm text-slate-500", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                      documents.length,
                      " items"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-300", children: "|" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                      "Using ~",
                      memoryUsage.toFixed(2),
                      " KB"
                    ] })
                  ] }),
                  activeMemoryScope && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 max-w-2xl break-words text-[11px] text-slate-500", children: [
                    "Active scope: Report ",
                    activeMemoryScope.reportId,
                    " · Dataset ",
                    activeMemoryScope.datasetId,
                    " · Version ",
                    activeMemoryScope.datasetVersion
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 h-1.5 w-full rounded-full bg-slate-200", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-blue-600 h-1.5 rounded-full", style: { width: `${memoryUsagePercentage}%` } }) })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  "data-dialog-initial-focus": true,
                  onClick: onClose,
                  className: "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
                  title: "Close",
                  "aria-label": "Close memory",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, {})
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid min-h-0 flex-grow gap-4 md:grid-cols-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col min-h-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-4 shrink-0 rounded-card border border-slate-200 bg-slate-50 p-4", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mb-2 font-semibold text-slate-800", children: "Test Similarity Search" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mb-2 text-xs text-slate-500", children: [
                    modelStatus === "idle" && "The local memory model will load the first time semantic search runs.",
                    modelStatus === "loading" && "Loading the local memory model and WASM assets.",
                    modelStatus === "ready" && "Local memory model is ready.",
                    modelStatus === "error" && `Local memory model failed to load. ${modelError ?? ""}`.trim()
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSearch, className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "text",
                        value: searchQuery,
                        onChange: (e) => setSearchQuery(e.target.value),
                        placeholder: isModelReady ? "Enter query to find memories..." : modelStatus === "loading" ? "Memory model is loading..." : "Run a search to load the memory model",
                        disabled: modelStatus === "loading" || isSearching,
                        className: "flex-grow bg-white border border-slate-300 rounded-md py-1.5 px-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", disabled: modelStatus === "loading" || isSearching || !searchQuery.trim(), className: "px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed", children: isSearching ? "..." : "Search" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-grow overflow-y-auto pr-2", children: searchResults.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-sm font-medium text-slate-600", children: "Top Results:" }),
                  searchResults.map((result) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { onClick: () => handleSearchResultClick(result.text), className: "bg-white p-2.5 border border-slate-200 rounded-card text-xs cursor-pointer hover:border-blue-500 hover:ring-1 hover:ring-blue-500", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between items-center mb-1", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-700 font-semibold", children: "Match" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-blue-600 font-bold", children: [
                        (result.score * 100).toFixed(1),
                        "%"
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full bg-slate-200 rounded-full h-1 mb-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-blue-500 h-1 rounded-full", style: { width: `${result.score * 100}%` } }) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-slate-600 italic", children: [
                      '"',
                      result.text,
                      '"'
                    ] }),
                    result.origin && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-[11px] text-slate-500", children: [
                      "Origin: ",
                      result.origin
                    ] })
                  ] }, result.text))
                ] }) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col min-h-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex shrink-0 items-center justify-between", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "font-semibold text-slate-800", children: [
                    "All Stored Memories (",
                    documents.length,
                    ")"
                  ] }),
                  documents.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: handleClearAll, className: "text-xs text-red-600 hover:underline", children: "Clear Report Memory" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-grow overflow-y-auto pr-2 border-t border-slate-200 pt-2", children: documents.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-slate-500 text-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "The AI's memory is currently empty." }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-2", children: documents.map((doc) => {
                  var _a, _b, _c;
                  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "li",
                    {
                      id: `memory-doc-${doc.text.substring(0, 30)}`,
                      className: `p-3 bg-slate-50 rounded-card text-sm text-slate-800 border border-slate-200 flex justify-between items-start group transition-all duration-300 ${highlightedDocText === doc.text ? "border-blue-500 ring-2 ring-blue-500" : ""}`,
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-grow pr-4 break-words", children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: doc.text }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-xs text-slate-500", children: [
                            "Origin: ",
                            ((_b = (_a = doc.metadata) == null ? void 0 : _a.origin) == null ? void 0 : _b.label) ?? "Legacy memory (unverified origin)"
                          ] }),
                          ((_c = doc.metadata) == null ? void 0 : _c.scope) && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-0.5 text-[11px] text-slate-400", children: [
                            "Report ",
                            doc.metadata.scope.reportId,
                            " · Dataset ",
                            doc.metadata.scope.datasetId,
                            " · Version ",
                            doc.metadata.scope.datasetVersion
                          ] })
                        ] }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                          "button",
                          {
                            onClick: () => handleDelete(doc.id),
                            className: "p-1 text-slate-400 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0",
                            title: "Delete Memory",
                            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconDelete, {})
                          }
                        )
                      ]
                    },
                    doc.id
                  );
                }) }) })
              ] })
            ] })
          ]
        }
      )
    }
  );
};
export {
  MemoryPanel
};
