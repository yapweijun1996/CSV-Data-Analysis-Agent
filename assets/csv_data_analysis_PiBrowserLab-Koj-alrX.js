const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./csv_data_analysis_vendor-ai-sdk-CVLr31yf.js","./csv_data_analysis_vendor-data-gCZ_DPYi.js","./csv_data_analysis_vendor-storage-Dda2oZrY.js","./csv_data_analysis_vendor-ai-google-Brpu0J-t.js","./csv_data_analysis_vendor-ai-openai-B8_yEsiF.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload } from "./csv_data_analysis_app-agent-BwRxkw9e.js";
import { a as reactExports, r as reactDomExports, j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import { u as useAppStore, e as useDialogAccessibility } from "./csv_data_analysis_index-CPS_8IiM.js";
import "./csv_data_analysis_vendor-ai-sdk-CVLr31yf.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-Brpu0J-t.js";
import "./csv_data_analysis_vendor-ai-openai-B8_yEsiF.js";
import "./csv_data_analysis_vendor-state-CMf1uPe1.js";
const PiBrowserLab = ({ onClose }) => {
  var _a;
  const dataset = useAppStore((state) => state.canonicalCsvData ?? state.csvData);
  const datasetId = useAppStore((state) => state.currentDatasetId);
  const [question, setQuestion] = reactExports.useState("What is the total for the first numeric column?");
  const [answer, setAnswer] = reactExports.useState("");
  const [error, setError] = reactExports.useState("");
  const [events, setEvents] = reactExports.useState([]);
  const [running, setRunning] = reactExports.useState(false);
  const agentRef = reactExports.useRef(null);
  const dialogRef = useDialogAccessibility(true, onClose, {
    restoreFocusSelector: '[data-pi-browser-lab-trigger="true"]'
  });
  reactExports.useEffect(() => {
    var _a2;
    setAnswer("");
    setEvents([]);
    setError("");
    (_a2 = agentRef.current) == null ? void 0 : _a2.abort();
  }, [datasetId]);
  reactExports.useEffect(() => () => {
    var _a2;
    return (_a2 = agentRef.current) == null ? void 0 : _a2.abort();
  }, []);
  const run = async (mode) => {
    if (!dataset || !question.trim() || running) return;
    setRunning(true);
    setAnswer("");
    setError("");
    setEvents([]);
    let agent = null;
    try {
      const [{ buildEffectiveColumnRegistryFromState }, { createPiBrowserAgent, getPiFinalText }] = await Promise.all([
        __vitePreload(() => import("./csv_data_analysis_app-agent-BwRxkw9e.js").then((n) => n.cv), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-BwRxkw9e.js").then((n) => n.c$), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
      ]);
      const state = useAppStore.getState();
      const currentDataset = state.canonicalCsvData ?? state.csvData;
      if (!currentDataset || currentDataset !== dataset) throw new Error("The active dataset changed. Reopen Pi Browser Lab.");
      const registry = buildEffectiveColumnRegistryFromState(state, { datasetOverride: dataset });
      if (!registry) throw new Error("The active dataset has no column registry.");
      const numericColumns = state.columnProfiles.filter((profile) => profile.type === "numerical" || profile.type === "currency" || profile.type === "percentage").map((profile) => profile.name);
      if (mode === "live") {
        if (!state.settings.openAIApiKey.trim()) throw new Error("Set an OpenAI API key in Settings first.");
        const { ensureCloudAiConsent } = await __vitePreload(async () => {
          const { ensureCloudAiConsent: ensureCloudAiConsent2 } = await import("./csv_data_analysis_app-agent-BwRxkw9e.js").then((n) => n.cu);
          return { ensureCloudAiConsent: ensureCloudAiConsent2 };
        }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
        await ensureCloudAiConsent("openai");
      }
      agent = createPiBrowserAgent({
        mode,
        context: { dataset, columnRegistry: registry, numericColumns },
        apiKey: mode === "live" ? state.settings.openAIApiKey : void 0,
        onEvent: (event) => {
          setEvents((previous) => [...previous.slice(-19), event.type]);
        }
      });
      agentRef.current = agent;
      await agent.prompt(question.trim());
      if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
      const result = getPiFinalText(agent);
      if (!result) throw new Error("Pi completed without a text answer.");
      setAnswer(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (agentRef.current === agent) agentRef.current = null;
      setRunning(false);
    }
  };
  return reactDomExports.createPortal(
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-3", onMouseDown: (event) => {
      if (event.target === event.currentTarget) onClose();
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        ref: dialogRef,
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "pi-lab-title",
        tabIndex: -1,
        className: "flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-card bg-white p-5 shadow-xl",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "pi-lab-title", className: "text-lg font-semibold text-slate-900", children: "Pi Browser Lab" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-600", children: "Read-only Pi test on the active CSV. Model: gpt-5.4-mini · reasoning: medium." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onClose, "aria-label": "Close Pi Browser Lab", className: "rounded p-2 text-slate-600 hover:bg-slate-100", children: "✕" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-4 text-sm text-slate-700", children: [
            "Dataset: ",
            (dataset == null ? void 0 : dataset.fileName) ?? "No CSV loaded",
            " · ",
            ((_a = dataset == null ? void 0 : dataset.backing) == null ? void 0 : _a.rowCount) ?? (dataset == null ? void 0 : dataset.data.length) ?? 0,
            " rows"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "pi-lab-question", className: "mt-4 text-sm font-medium text-slate-800", children: "Question" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "textarea",
            {
              id: "pi-lab-question",
              value: question,
              onChange: (event) => setQuestion(event.target.value),
              rows: 3,
              disabled: running || !dataset,
              className: "mt-1 w-full rounded border border-slate-300 p-2 text-sm"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void run("mock"),
                disabled: running || !dataset || !question.trim(),
                className: "rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50",
                children: "Run mock tool cycle"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void run("live"),
                disabled: running || !dataset || !question.trim(),
                className: "rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50",
                children: "Run live OpenAI"
              }
            ),
            running && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => {
              var _a2;
              return (_a2 = agentRef.current) == null ? void 0 : _a2.abort();
            }, className: "rounded border border-slate-300 px-3 py-2 text-sm", children: "Cancel" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-xs text-slate-500", children: "Live mode sends your question, column names, and bounded aggregate results to OpenAI using the key in Settings. CSV rows remain in this browser. Mock mode makes no provider request." }),
          running && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "status", className: "mt-4 text-sm text-blue-700", children: "Pi is running…" }),
          error && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "mt-4 rounded bg-rose-50 p-3 text-sm text-rose-700", children: error }),
          answer && /* @__PURE__ */ jsxRuntimeExports.jsx("section", { className: "mt-4 rounded bg-slate-50 p-3", "aria-label": "Pi answer", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "whitespace-pre-wrap text-sm text-slate-800", children: answer }) }),
          events.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mt-4 text-xs text-slate-500", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("summary", { children: [
              "Pi event trace (",
              events.length,
              ")"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 break-words", children: events.join(" → ") })
          ] })
        ]
      }
    ) }),
    document.body
  );
};
export {
  PiBrowserLab
};
