const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./csv_data_analysis_vendor-storage-Dda2oZrY.js","./csv_data_analysis_vendor-data-CIO9Xlwr.js","./csv_data_analysis_vendor-react-core-DlbdMisc.js","./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js","./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js","./csv_data_analysis_vendor-ai-google-DYdleeb9.js","./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js","./csv_data_analysis_datasetRecoveryQualification-CUDI1UI2.js","./csv_data_analysis_index-B4yCSNxW.js","./csv_data_analysis_vendor-state-CMf1uPe1.js","./csv_data_analysis_candidateCommitQualification-C_VSjcJq.js","./csv_data_analysis_inferredMeaningQualification-Coz8j5O8.js","./csv_data_analysis_candidateValidationQualification-CSWgDCmD.js","./csv_data_analysis_candidateStagingQualification-B8FhGxP0.js","./csv_data_analysis_sqlQualification-C3r6MZeu.js","./csv_data_analysis_javascriptGuestQualification-C7zwaT3M.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload } from "./csv_data_analysis_app-agent-DlyYMc3W.js";
import { a as reactExports, r as reactDomExports, j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import { u as useAppStore, e as useDialogAccessibility } from "./csv_data_analysis_index-B4yCSNxW.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import "./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js";
import "./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js";
import "./csv_data_analysis_vendor-ai-google-DYdleeb9.js";
import "./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js";
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
  const guestController = reactExports.useRef(null);
  const [guestRunning, setGuestRunning] = reactExports.useState(false);
  const [guestResult, setGuestResult] = reactExports.useState("");
  const dialogRef = useDialogAccessibility(true, onClose, {
    restoreFocusSelector: '[data-pi-browser-lab-trigger="true"]'
  });
  reactExports.useEffect(() => {
    var _a2, _b;
    setAnswer("");
    setEvents([]);
    setError("");
    (_a2 = agentRef.current) == null ? void 0 : _a2.abort();
    (_b = guestController.current) == null ? void 0 : _b.abort();
    guestController.current = null;
    setGuestRunning(false);
    setGuestResult("");
  }, [datasetId]);
  reactExports.useEffect(() => () => {
    var _a2, _b;
    (_a2 = agentRef.current) == null ? void 0 : _a2.abort();
    (_b = guestController.current) == null ? void 0 : _b.abort();
  }, []);
  const runGuestChecks = async (mode = "guest") => {
    if (running || guestRunning) return;
    const controller = new AbortController();
    guestController.current = controller;
    setGuestRunning(true);
    setGuestResult("");
    try {
      if (mode === "capacity") {
        const { qualifyCodeCapacity } = await __vitePreload(async () => {
          const { qualifyCodeCapacity: qualifyCodeCapacity2 } = await import("./csv_data_analysis_app-agent-DlyYMc3W.js").then((n) => n.fk);
          return { qualifyCodeCapacity: qualifyCodeCapacity2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyCodeCapacity(controller.signal, (observation) => {
          if (!controller.signal.aborted && guestController.current === controller)
            setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "FAIL"} (${observation.elapsedMs} ms; heartbeat ${observation.maxHeartbeatGapMs} ms)
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.` : `${previous}${result.passed ? "Local capacity checks passed." : "Local capacity checks incomplete or failed."} Browser observations only; machine limits and physical worker closure need external qualification.`);
      } else if (mode === "lifecycle") {
        const { qualifyPiLifecycle } = await __vitePreload(async () => {
          const { qualifyPiLifecycle: qualifyPiLifecycle2 } = await import("./csv_data_analysis_app-agent-DlyYMc3W.js").then((n) => n.fl);
          return { qualifyPiLifecycle: qualifyPiLifecycle2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyPiLifecycle(controller.signal, (group) => {
          if (!controller.signal.aborted && guestController.current === controller)
            setGuestResult((previous) => `${previous}${group.group}: ${group.passed ? "pass" : "FAIL"} (${group.cases.length} cases)
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.` : `${previous}${result.passed ? "Browser lifecycle checks passed." : "Browser lifecycle checks incomplete or failed."} HTTP MCP/deferred coordination need separate evidence; full profile and live-model autonomy are not evaluated.`);
      } else if (mode === "skills") {
        const { qualifySkills } = await __vitePreload(async () => {
          const { qualifySkills: qualifySkills2 } = await import("./csv_data_analysis_app-agent-DlyYMc3W.js").then((n) => n.fm);
          return { qualifySkills: qualifySkills2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifySkills(controller.signal, (observation) => {
          if (!controller.signal.aborted && guestController.current === controller) setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "FAIL"}
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.` : `${previous}${result.passed ? "Pinned skill checks passed." : "Pinned skill checks incomplete or failed."} Local scripted provider and controlled JavaScript; live-model autonomy and full profile are not evaluated.`);
      } else if (mode === "admission") {
        const { qualifyEvidenceAdmission } = await __vitePreload(async () => {
          const { qualifyEvidenceAdmission: qualifyEvidenceAdmission2 } = await import("./csv_data_analysis_app-agent-DlyYMc3W.js").then((n) => n.fn);
          return { qualifyEvidenceAdmission: qualifyEvidenceAdmission2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyEvidenceAdmission(controller.signal, (observation) => {
          if (controller.signal.aborted || guestController.current !== controller) return;
          setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "FAIL"}
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.` : `${previous}${result.status === "passed" ? "Evidence admission checks passed." : "Evidence admission checks failed."} Local synthetic host checks; model autonomy is not evaluated.`);
      } else if (mode === "recovery") {
        const { qualifyDatasetRecovery } = await __vitePreload(async () => {
          const { qualifyDatasetRecovery: qualifyDatasetRecovery2 } = await import("./csv_data_analysis_datasetRecoveryQualification-CUDI1UI2.js");
          return { qualifyDatasetRecovery: qualifyDatasetRecovery2 };
        }, true ? __vite__mapDeps([7,0,1,2,3,4,5,6,8,9,10]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyDatasetRecovery(controller.signal, (observation) => {
          if (controller.signal.aborted || guestController.current !== controller) return;
          setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "FAIL"}
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.` : `${previous}${result.passed ? "Recovery, retention and rollback checks passed." : "Recovery checks incomplete or failed."} Local synthetic checks; other platforms and model autonomy are not evaluated.`);
      } else if (mode === "approval") {
        const { qualifyPiCandidateApproval } = await __vitePreload(async () => {
          const { qualifyPiCandidateApproval: qualifyPiCandidateApproval2 } = await import("./csv_data_analysis_app-agent-DlyYMc3W.js").then((n) => n.fo);
          return { qualifyPiCandidateApproval: qualifyPiCandidateApproval2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyPiCandidateApproval(controller.signal, (observation) => {
          if (controller.signal.aborted || guestController.current !== controller) return;
          setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "FAIL"}
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.` : `${previous}${result.passed ? "Fresh lease approval checks passed." : "Fresh lease approval checks incomplete or failed."} Synthetic host checks; durable row recovery and model autonomy are not evaluated.`);
      } else if (mode === "commit") {
        const { qualifyCandidateCommit } = await __vitePreload(async () => {
          const { qualifyCandidateCommit: qualifyCandidateCommit2 } = await import("./csv_data_analysis_candidateCommitQualification-C_VSjcJq.js");
          return { qualifyCandidateCommit: qualifyCandidateCommit2 };
        }, true ? __vite__mapDeps([10,0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyCandidateCommit(controller.signal, (observation) => {
          if (controller.signal.aborted || guestController.current !== controller) return;
          setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "FAIL"}
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.` : `${previous}${result.passed ? "Atomic commit checks passed." : "Atomic commit checks incomplete or failed."} Durable row recovery remains pending.`);
      } else if (mode === "meaning") {
        const { qualifyInferredMeaning } = await __vitePreload(async () => {
          const { qualifyInferredMeaning: qualifyInferredMeaning2 } = await import("./csv_data_analysis_inferredMeaningQualification-Coz8j5O8.js");
          return { qualifyInferredMeaning: qualifyInferredMeaning2 };
        }, true ? __vite__mapDeps([11,0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyInferredMeaning(controller.signal, (observation) => {
          if (!controller.signal.aborted && guestController.current === controller) setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "fail"}
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => `${previous}${result.passed ? "Automatic meaning checks passed." : "Automatic meaning checks incomplete or failed."} AI interpretation is an assumption; host checks source equivalence. Initial production cutover remains pending.`);
      } else if (mode === "validation") {
        const { qualifyCandidateValidation } = await __vitePreload(async () => {
          const { qualifyCandidateValidation: qualifyCandidateValidation2 } = await import("./csv_data_analysis_candidateValidationQualification-CSWgDCmD.js");
          return { qualifyCandidateValidation: qualifyCandidateValidation2 };
        }, true ? __vite__mapDeps([12,0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyCandidateValidation(controller.signal, (observation) => {
          if (guestController.current === controller) setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "fail"}
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.` : `${previous}${result.passed ? "Independent validation checks passed." : "Independent validation checks incomplete or failed."} Exact approval and commit remain pending.`);
      } else if (mode === "candidate") {
        const { qualifyCandidateStaging } = await __vitePreload(async () => {
          const { qualifyCandidateStaging: qualifyCandidateStaging2 } = await import("./csv_data_analysis_candidateStagingQualification-B8FhGxP0.js");
          return { qualifyCandidateStaging: qualifyCandidateStaging2 };
        }, true ? __vite__mapDeps([13,0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyCandidateStaging(controller.signal, (observation) => {
          if (guestController.current === controller) setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "fail"}
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.` : `${previous}${result.passed ? "Candidate staging checks passed." : "Candidate staging checks incomplete or failed."} Independent validation and commit remain pending.`);
      } else if (mode === "preparation") {
        const { qualifyPiExecutorPreparation } = await __vitePreload(async () => {
          const { qualifyPiExecutorPreparation: qualifyPiExecutorPreparation2 } = await import("./csv_data_analysis_app-agent-DlyYMc3W.js").then((n) => n.fp);
          return { qualifyPiExecutorPreparation: qualifyPiExecutorPreparation2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyPiExecutorPreparation(controller.signal, (observation) => {
          if (guestController.current === controller) setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "fail"}
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.` : `${previous}${result.passed ? "Shared preparation checks passed." : "Shared preparation checks incomplete or failed."} Initial coding remains disabled in production.`);
      } else if (mode === "table") {
        const { qualifyCodeTableExecution } = await __vitePreload(async () => {
          const { qualifyCodeTableExecution: qualifyCodeTableExecution2 } = await import("./csv_data_analysis_app-agent-DlyYMc3W.js").then((n) => n.fj);
          return { qualifyCodeTableExecution: qualifyCodeTableExecution2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyCodeTableExecution(controller.signal, (observation) => {
          if (guestController.current === controller) setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "fail"}
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.` : `${previous}${result.passed ? "Full-table checks passed." : "Full-table checks incomplete or failed."} Scripted provider; data publication and model autonomy are not evaluated.`);
      } else if (mode === "sql") {
        const { qualifySqlWorker } = await __vitePreload(async () => {
          const { qualifySqlWorker: qualifySqlWorker2 } = await import("./csv_data_analysis_sqlQualification-C3r6MZeu.js");
          return { qualifySqlWorker: qualifySqlWorker2 };
        }, true ? __vite__mapDeps([14,0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifySqlWorker(controller.signal, (observation) => {
          if (guestController.current === controller) setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "fail"}
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.` : `${previous}${result.passed ? "Local SQL checks passed." : "SQL checks incomplete or failed."}`);
      } else if (mode === "coding") {
        const { qualifyPiCodingLoop } = await __vitePreload(async () => {
          const { qualifyPiCodingLoop: qualifyPiCodingLoop2 } = await import("./csv_data_analysis_app-agent-DlyYMc3W.js").then((n) => n.fq);
          return { qualifyPiCodingLoop: qualifyPiCodingLoop2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyPiCodingLoop(controller.signal, (observation) => {
          if (guestController.current === controller) setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "fail"} (${observation.status})
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.` : `${previous}${result.passed ? "Pi coding checks passed." : "Pi coding checks incomplete or failed."} Scripted provider; model autonomy is not evaluated.`);
      } else if (mode === "adapter") {
        const { qualifyCodeExecutionAdapter } = await __vitePreload(async () => {
          const { qualifyCodeExecutionAdapter: qualifyCodeExecutionAdapter2 } = await import("./csv_data_analysis_app-agent-DlyYMc3W.js").then((n) => n.fr);
          return { qualifyCodeExecutionAdapter: qualifyCodeExecutionAdapter2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyCodeExecutionAdapter(controller.signal, (observation) => {
          if (guestController.current === controller) setGuestResult((previous) => {
            var _a2;
            return `${previous}${observation.id}: ${observation.passed ? "pass" : "fail"} (${(_a2 = observation.receipt) == null ? void 0 : _a2.status})
`;
          });
        });
        if (guestController.current === controller) setGuestResult((previous) => `${previous}${result.passed ? "Adapter checks passed." : "Adapter checks incomplete or failed."}`);
      } else {
        const { qualifyJavaScriptGuest } = await __vitePreload(async () => {
          const { qualifyJavaScriptGuest: qualifyJavaScriptGuest2 } = await import("./csv_data_analysis_javascriptGuestQualification-C7zwaT3M.js");
          return { qualifyJavaScriptGuest: qualifyJavaScriptGuest2 };
        }, true ? __vite__mapDeps([15,0,1,2,3,4,5,6]) : void 0, import.meta.url);
        if (controller.signal.aborted) return;
        const result = await qualifyJavaScriptGuest(useAppStore, controller.signal, (observation) => {
          if (guestController.current === controller) setGuestResult((previous) => `${previous}${observation.id}: ${observation.passed ? "pass" : "fail"} (${observation.status})
`);
        });
        if (guestController.current === controller) setGuestResult((previous) => `${previous}${result.passed ? "Local checks passed." : "Checks incomplete or failed."}`);
      }
    } catch {
      if (guestController.current === controller) setGuestResult(controller.signal.aborted ? "Checks cancelled. Results are incomplete." : "Local checks failed or executor is unavailable.");
    } finally {
      if (guestController.current === controller) {
        guestController.current = null;
        setGuestRunning(false);
      }
    }
  };
  const run = async (mode) => {
    if (!dataset || !question.trim() || running) return;
    setRunning(true);
    setAnswer("");
    setError("");
    setEvents([]);
    let agent = null;
    try {
      const [{ buildEffectiveColumnRegistryFromState }, { createPiBrowserAgent, getPiFinalText }] = await Promise.all([
        __vitePreload(() => import("./csv_data_analysis_app-agent-DlyYMc3W.js").then((n) => n.eM), true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DlyYMc3W.js").then((n) => n.fs), true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url)
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
          const { ensureCloudAiConsent: ensureCloudAiConsent2 } = await import("./csv_data_analysis_app-agent-DlyYMc3W.js").then((n) => n.eQ);
          return { ensureCloudAiConsent: ensureCloudAiConsent2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url);
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
                disabled: running || guestRunning || !dataset || !question.trim(),
                className: "rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50",
                children: "Run mock tool cycle"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void run("live"),
                disabled: running || guestRunning || !dataset || !question.trim(),
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
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-5 border-t border-slate-200 pt-4", "aria-label": "Local executor checks", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-700", children: "Local checks use synthetic data and make no AI provider request. Pi coding checks exercise a scripted provider with real tools and workers." }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("capacity"),
                disabled: running || guestRunning,
                className: "mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local capacity checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks(),
                disabled: running || guestRunning,
                className: "mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local JavaScript checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("adapter"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local adapter checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("coding"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local Pi coding checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("sql"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local SQL checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("table"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local full-table checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("preparation"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local shared preparation checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("meaning"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local automatic meaning checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("commit"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local commit checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("approval"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local approval checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("admission"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local evidence checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("skills"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run pinned skill checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("lifecycle"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run browser lifecycle checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("recovery"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local recovery checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("validation"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local validation checks"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => void runGuestChecks("candidate"),
                disabled: running || guestRunning,
                className: "ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50",
                children: "Run local candidate checks"
              }
            ),
            guestRunning && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => {
                  var _a2;
                  return (_a2 = guestController.current) == null ? void 0 : _a2.abort();
                },
                className: "ml-2 rounded border border-slate-300 px-3 py-2 text-sm",
                children: "Stop local checks"
              }
            ),
            guestResult && /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { role: "status", className: "mt-2 whitespace-pre-wrap text-xs text-slate-600", children: guestResult })
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
