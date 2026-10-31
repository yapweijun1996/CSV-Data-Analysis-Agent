import { el as runPiInitialAnalysis, em as resolveReportStructureArtifacts, en as captureCsvSource, eo as runPiFollowUpTurn, ep as createSingleTableDatasetBundle, u as hasSavableSession, r as beginSessionTransition, eq as createAssistantMessageEventStream, aK as cancelOwnedRun } from "./csv_data_analysis_app-agent-DlyYMc3W.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import "./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js";
import "./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js";
import "./csv_data_analysis_vendor-ai-google-DYdleeb9.js";
import "./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js";
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const scripted = (next) => (model, context) => {
  const content = next(context), stopReason = content.some((p) => p.type === "toolCall") ? "toolUse" : "stop";
  const message = { role: "assistant", content, api: model.api, provider: model.provider, model: model.id, usage, stopReason, timestamp: Date.now() };
  const stream = createAssistantMessageEventStream();
  stream.push({ type: "start", partial: message });
  stream.push({ type: "done", reason: stopReason, message });
  return stream;
};
const tool = (name, args) => [{ type: "toolCall", id: crypto.randomUUID(), name, arguments: args }];
const ref = ({ path, revision, sha256 }) => ({ path, revision, sha256 });
const schema = "[{name:'Name',dataType:'string',nullable:false},{name:'Amount',dataType:'number',nullable:false}]";
const tableProgram = "const pairs=input.facts.rows.map((r,i)=>({r,i}));const kept=pairs.filter(p=>p.r.Name!=='Subtotal');return {schemaVersion:1,complete:true,tables:[{name:'facts',role:'fact',schema:" + schema + ",rowCount:kept.length,rows:kept.map(p=>p.r),lineage:kept.flatMap((p,row)=>['Name','Amount'].map(column=>({row,column,origins:[{kind:'table',name:'facts',row:p.i,column}]})))}],relationships:[],excludedRows:pairs.filter(p=>p.r.Name==='Subtotal').map(p=>({origin:{kind:'table',name:'facts',row:p.i},reason:'declared subtotal'}))};";
const sourceProgram = "const text=String.fromCharCode(...input.raw.bytes);const records=[];let cells=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c.charCodeAt(0)===34){if(quoted&&text.charCodeAt(i+1)===34){cell+=c;i++;}else quoted=!quoted;}else if(c===','&&!quoted){cells.push(cell);cell='';}else if(c==='\\n'&&!quoted){cells.push(cell);records.push(cells);cells=[];cell='';}else cell+=c;}if(cell||cells.length){cells.push(cell);records.push(cells);}const kept=records.slice(1);return {schemaVersion:1,complete:true,tables:[{name:'facts',role:'fact',schema:" + schema + ",rowCount:kept.length,rows:kept.map(c=>({Name:c[c.length-2],Amount:Number(c[c.length-1])})),lineage:kept.flatMap((c,row)=>['Name','Amount'].map((column,i)=>({row,column,origins:[{kind:'source',name:'raw',row:row+1,column:c.length-2+i}]})))}],relationships:[],excludedRows:[{origin:{kind:'source',name:'raw',row:0},reason:'header'}]};";
const qualifyCandidateStaging = async (signal, onObservation) => {
  const observations = [];
  const fixture = () => {
    const data = { fileName: "synthetic-candidate.csv", data: [{ Name: "Total Solutions", Amount: 0 }, { Name: "Detail", Amount: -5 }, { Name: "Subtotal", Amount: -5 }] };
    const bundle = createSingleTableDatasetBundle({ datasetId: crypto.randomUUID(), sourceFingerprint: "synthetic", file: { name: data.fileName, size: 0, lastModified: 0 }, data });
    let state = {
      sessionId: "candidate-lab-" + crypto.randomUUID(),
      csvData: { ...data, data: [] },
      canonicalCsvData: data,
      rawCsvData: null,
      datasetBundle: bundle,
      currentDatasetId: null,
      settings: { provider: "default", simpleModel: "mock", complexModel: "mock", language: "English", runtimeAccessControl: { permissionMode: "open", toolOverrides: {}, workspaceRules: { deniedPathPrefixes: [] } } },
      analysisCards: [],
      columnProfiles: [],
      chatHistory: [],
      dataQualityIssues: [],
      activeDataQuery: null,
      reportMemoryScope: null,
      agentEvents: [],
      agentToolLogs: [],
      runtimeEvents: [],
      progressMessages: [],
      telemetryEvents: [],
      workspaceFiles: {},
      logAgentToolUsage() {
      },
      addProgress() {
      },
      clearActiveTurnCancellation() {
      },
      setStreamingMessage() {
      }
    };
    if (hasSavableSession(state)) throw new Error("Fixture cannot persist");
    const root = { getState: () => state, setState: (p) => {
      state = { ...state, ...typeof p === "function" ? p(state) : p };
    } };
    const protectedState = () => JSON.stringify({ data: root.getState().canonicalCsvData, bundle: root.getState().datasetBundle, query: root.getState().activeDataQuery, cards: root.getState().analysisCards });
    const abort = () => cancelOwnedRun(root);
    signal.addEventListener("abort", abort, { once: true });
    return { root, data, bundle, protectedState, cleanup: () => {
      signal.removeEventListener("abort", abort);
      beginSessionTransition(root);
    } };
  };
  const check = async (id, work) => {
    if (signal.aborted) return;
    const started = performance.now();
    const result = await work();
    const o = { id, ...result, elapsedMs: Math.round(performance.now() - started) };
    observations.push(o);
    if (!signal.aborted) onObservation == null ? void 0 : onObservation(o);
  };
  const follow = async (mode) => {
    var _a, _b;
    const s = fixture();
    let source;
    if (mode === "source") {
      source = await captureCsvSource(s.root, new File(['Name,Amount\n"Total,\nSolutions",0\n,Detail,-5\n'], "synthetic-candidate.csv"));
      s.root.setState({ datasetBundle: { ...s.bundle, source: { ...s.bundle.source, inspection: source } } });
    }
    const before = s.protectedState();
    let step = 0, candidateId = "", staged, read, diff;
    try {
      const result = await runPiFollowUpTurn({ message: mode === "factual" ? "What is the total Amount?" : "Write a JavaScript program and stage its output." }, s.root, scripted((context) => {
        var _a2;
        const last = context.messages.filter((m) => m.role === "toolResult").at(-1);
        let parsed;
        if (last) {
          try {
            parsed = JSON.parse(last.content.filter((p) => p.type === "text").map((p) => p.text).join(""));
          } catch {
            parsed = void 0;
          }
        }
        if (step++ === 0) return tool("workspace_write", { path: "/workspace/program.js", expectedRevision: 0, content: mode === "source" ? sourceProgram : mode === "partial" ? tableProgram.replace("complete:true", "complete:false") : tableProgram });
        if (step === 2) return tool("code_run", {
          program: ref(parsed.payload.workspace.artifact),
          inputs: [],
          ...source ? { sources: [{ name: "raw", sourceId: source.sourceId, sha256: source.sha256, offset: 0, length: source.byteSize }] } : { tables: [{ name: "facts", tableId: s.bundle.primaryTableId }] },
          output: { path: "/workspace/output.json", expectedRevision: 0, format: "json" }
        });
        if (step === 3) return tool("candidate_stage", { jobId: parsed.receipt.jobId, ...mode === "forged" ? { sessionId: "forged" } : {} });
        if (step === 4) {
          staged = (_a2 = parsed == null ? void 0 : parsed.payload) == null ? void 0 : _a2.candidate;
          candidateId = staged == null ? void 0 : staged.candidateId;
          if (!candidateId) return [{ type: "text", text: "Fabricated 999 complete." }];
          return mode === "abandon" ? tool("candidate_abandon", { candidateId }) : tool("candidate_read", { candidateId, table: "facts", offset: 0, limit: 2 });
        }
        if (step === 5 && mode !== "abandon") {
          read = parsed.payload.candidate;
          return tool("candidate_diff", { candidateId });
        }
        if (step === 6) diff = parsed.payload.candidate;
        return [{ type: "text", text: "Fabricated 999 complete." }];
      }));
      const success = mode === "valid" || mode === "source";
      const rows = read == null ? void 0 : read.rows;
      return { passed: before === s.protectedState() && (success ? result.status === "completed" && Boolean(candidateId) && (staged == null ? void 0 : staged.validation) === "pending" && staged.answerEvidence === false && (rows == null ? void 0 : rows.length) === 2 && rows[0].Amount === 0 && rows[1].Amount === -5 && rows[0].Name === (mode === "source" ? "Total,\nSolutions" : "Total Solutions") && Boolean(diff == null ? void 0 : diff.valueDiff) : result.status === "blocked") && !((_a = result.text) == null ? void 0 : _a.includes("999")), details: { status: result.status, text: result.text, staged, read, diff, budget: (_b = s.root.getState().activeAgentTask) == null ? void 0 : _b.budget } };
    } finally {
      s.cleanup();
    }
  };
  for (const [id, mode] of [["follow-up-stage-read-diff", "valid"], ["partial-output-blocked", "partial"], ["forged-lineage-blocked", "forged"], ["abandoned-candidate-blocks-completion", "abandon"], ["source-cell-ragged-quoted-multiline", "source"], ["candidate-not-current-answer-evidence", "factual"]]) await check(id, () => follow(mode));
  await check("shared-initial-candidate-stage", async () => {
    const s = fixture(), before = s.protectedState();
    let candidate;
    const options = {
      stageServices: { resolveStructure: async () => ({ ...resolveReportStructureArtifacts({ rawCsvData: null, csvData: null, rawIntakeIr: null, cleaningRun: null, dataPreparationPlan: null }), canonicalCsvData: s.data }) },
      codingPreparation: { enabled: true, prepareStage: async (store) => {
        const workspace = store.codeExecution.workspace, program = await workspace.write("/workspace/program.js", tableProgram, 0), context = store.executionContext;
        const request = { program: ref(program), inputs: [], tables: [{ name: "facts", tableId: s.bundle.primaryTableId }], output: { path: "/workspace/output.json", expectedRevision: 0, format: "json" } };
        await store.piTask.beforeTool("code.run", request, context.toolCallId);
        const receipt = await store.codeExecution.run(request, context);
        store.piTask.afterTool("code.run", { status: "success", toolName: "code.run", message: receipt.reasonCode, shouldStop: false, artifacts: { codeExecution: receipt } }, context);
        candidate = await store.candidateStaging.stage(receipt.jobId, context);
      } }
    };
    try {
      const result = await runPiInitialAnalysis({ appSessionId: s.root.getState().sessionId, datasetId: "synthetic", datasetVersion: s.bundle.datasetVersion, researchGoal: "Stage a candidate.", provider: { provider: "default", modelId: "mock" } }, s.root, scripted(() => tool("run_next_analysis_stage", {})), options);
      return {
        passed: before === s.protectedState() && (candidate == null ? void 0 : candidate.validation) === "pending" && candidate.execution.turnId === void 0 && candidate.tables[0].rowCount === 2 && result.trustedCardIds.length === 0 && result.status !== "completed",
        details: { status: result.status, candidate: candidate ? { candidateId: candidate.candidateId, changeDigest: candidate.changeDigest, execution: candidate.execution } : null }
      };
    } finally {
      s.cleanup();
    }
  });
  return {
    passed: !signal.aborted && observations.length === 7 && observations.every((o) => o.passed),
    observations,
    qualification: "CA-130 staging only. Scripted provider, actual Pi initial/follow-up runtime, QuickJS workers and host receipts. Initial completion is deliberately fenced by the missing-structure host gate; no independent validation/commit or model-autonomy claim."
  };
};
export {
  qualifyCandidateStaging
};
