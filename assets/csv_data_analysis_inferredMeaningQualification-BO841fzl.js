import { em as createSingleTableDatasetBundle, u as hasSavableSession, ek as captureCsvSource, r as beginSessionTransition, el as runPiFollowUpTurn, aK as cancelOwnedRun, en as createAssistantMessageEventStream } from "./csv_data_analysis_app-agent-CCgesa_7.js";
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
const qualifyInferredMeaning = async (signal, onObservation) => {
  var _a;
  const observations = [];
  for (const mode of ["table", "source", "wrong-output", "invented-unit", "duplicate-tail", "late-proposal"]) {
    if (signal.aborted) break;
    const started = performance.now(), sourceMode = mode === "source";
    const rows = Array.from({ length: mode === "duplicate-tail" ? 5001 : 2 }, (_, i) => ({ Id: i === 0 ? "Total Solutions" : `detail-${i}`, Amount: i === 1 ? -5 : 0 }));
    if (mode === "duplicate-tail") rows[5e3].Id = rows[0].Id;
    const input = [...rows, { Id: "Subtotal", Amount: -5 }], data = { fileName: "synthetic-inferred-meaning.csv", data: input };
    const bundle = createSingleTableDatasetBundle({ datasetId: crypto.randomUUID(), sourceFingerprint: "synthetic", file: { name: data.fileName, size: 0, lastModified: 0 }, data });
    let state = {
      sessionId: "inferred-meaning-" + crypto.randomUUID(),
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
    const source = sourceMode ? await captureCsvSource(root, new File(["Id,Amount\nTotal Solutions,0\ndetail-1,-5\nSubtotal,-5\n"], "synthetic-inferred-meaning.csv")) : void 0;
    if (signal.aborted) {
      beginSessionTransition(root);
      break;
    }
    if (source) root.setState({ datasetBundle: { ...bundle, source: { ...bundle.source, inspection: source } } });
    const proposal = {
      input: source ? { kind: "source", name: "original" } : { kind: "table", name: "original", tableId: bundle.primaryTableId },
      table: {
        name: "facts",
        grain: ["Id"],
        groupBy: [],
        columns: [{ name: "Id", sourceColumn: source ? 0 : "Id", dataType: "string", nullable: false, conversion: "identity" }, {
          name: "Amount",
          sourceColumn: source ? 1 : "Amount",
          dataType: "number",
          nullable: false,
          conversion: source ? "decimal" : "identity",
          scale: 2,
          ...mode === "invented-unit" ? { unit: "USD" } : {}
        }],
        detailRanges: [{ start: source ? 1 : 0, end: source ? 2 : rows.length - 1 }]
      },
      exclusions: [...source ? [{ row: 0, role: "header" }] : [], { row: source ? 3 : rows.length, role: "subtotal" }],
      assumptions: ["Id identifies one fact; the final summary aggregates every detail."]
    };
    const program = `const columns=['Id','Amount'];${source ? "const records=String.fromCharCode(...input.original.bytes).trimEnd().split('\\n').map(r=>r.split(','));const rows=records.slice(1,3).map(r=>({Id:r[0],Amount:Number(r[1])}));" : "const rows=input.original.rows.slice(0,-1).map(r=>({...r}));"}
            ${mode === "wrong-output" ? "rows[0].Amount=999;" : ""}return {schemaVersion:1,complete:true,tables:[{name:'facts',role:'fact',schema:[{name:'Id',dataType:'string',nullable:false},{name:'Amount',dataType:'number',nullable:false}],rowCount:rows.length,rows,lineage:rows.flatMap((r,row)=>columns.map((column,j)=>({row,column,origins:[{kind:'${source ? "source" : "table"}',name:'original',row:row+${source ? 1 : 0},column:${source ? "j" : "column"}}]})))}],relationships:[],excludedRows:${source ? "[0,3]" : `[${rows.length}]`}.map(row=>({origin:{kind:'${source ? "source" : "table"}',name:'original',row},reason:'header or summary'}))};`;
    const before = JSON.stringify({ data: state.canonicalCsvData, bundle: state.datasetBundle, cards: state.analysisCards, query: state.activeDataQuery });
    const abort = () => cancelOwnedRun(root);
    signal.addEventListener("abort", abort, { once: true });
    let step = 0, receipt, meaningStatus = "", meaningMessage = "", candidateId = "";
    try {
      const result = await runPiFollowUpTurn({ message: "Write a JavaScript program to repair and independently validate the complete detail table." }, root, scripted((context) => {
        var _a2;
        const last = context.messages.filter((m) => m.role === "toolResult").at(-1);
        let parsed;
        try {
          parsed = last ? JSON.parse(last.content.filter((p) => p.type === "text").map((p) => p.text).join("")) : void 0;
        } catch {
          parsed = void 0;
        }
        step++;
        if (step === 1 && mode !== "late-proposal") return tool("candidate_infer_meaning", proposal);
        if (step === 2 && mode !== "late-proposal") {
          meaningStatus = parsed == null ? void 0 : parsed.status;
          meaningMessage = (parsed == null ? void 0 : parsed.message) ?? "";
          if (meaningStatus !== "success") return [{ type: "text", text: "Self assertion 999 complete." }];
          return tool("workspace_write", { path: "/workspace/program.js", expectedRevision: 0, content: program });
        }
        if (step === 1) return tool("workspace_write", { path: "/workspace/program.js", expectedRevision: 0, content: program });
        if (step === (mode === "late-proposal" ? 2 : 3)) {
          const { path, revision, sha256 } = parsed.payload.workspace.artifact;
          return tool("code_run", { program: { path, revision, sha256 }, inputs: [], ...source ? { sources: [{ name: "original", sourceId: source.sourceId, sha256: source.sha256, offset: 0, length: source.byteSize }] } : { tables: [{ name: "original", tableId: bundle.primaryTableId }] }, output: { path: "/workspace/output.json", expectedRevision: 0, format: "json" } });
        }
        if (mode === "late-proposal") {
          if (step === 3) return tool("candidate_infer_meaning", proposal);
          meaningStatus = parsed == null ? void 0 : parsed.status;
          meaningMessage = (parsed == null ? void 0 : parsed.message) ?? "";
          return [{ type: "text", text: "Self assertion 999 complete." }];
        }
        if (step === 4) return tool("candidate_stage", { jobId: parsed.receipt.jobId });
        if (step === 5) {
          candidateId = parsed.payload.candidate.candidateId;
          return tool("candidate_validate", { candidateId });
        }
        receipt = (_a2 = parsed == null ? void 0 : parsed.payload) == null ? void 0 : _a2.candidateValidation;
        return [{ type: "text", text: "Self assertion 999 complete." }];
      }));
      const unchanged = before === JSON.stringify({ data: state.canonicalCsvData, bundle: state.datasetBundle, cards: state.analysisCards, query: state.activeDataQuery });
      const valid = mode === "table" || mode === "source", inferenceRejected = ["invented-unit", "duplicate-tail", "late-proposal"].includes(mode);
      const expectedReason = mode === "invented-unit" ? "meaning_unit_not_in_source" : mode === "duplicate-tail" ? "validation_grain_ambiguous" : "meaning_contract_locked";
      const passed = unchanged && !state.pendingClarification && !((_a = result.text) == null ? void 0 : _a.includes("Self assertion 999 complete.")) && (valid ? result.status === "completed" && (receipt == null ? void 0 : receipt.decision) === "validated" : result.status === "blocked") && (inferenceRejected ? meaningStatus === "blocked" && meaningMessage.includes(expectedReason) : meaningStatus === "success") && (mode !== "wrong-output" || (receipt == null ? void 0 : receipt.reasonCodes.includes("validation_unchanged_region_mismatch")));
      const observation = { id: mode, passed: Boolean(passed), elapsedMs: Math.round(performance.now() - started), details: { status: result.status, meaningStatus, meaningMessage, receipt, candidateId, acceptedUnchanged: unchanged, semanticConfirmationRequested: Boolean(state.pendingClarification) } };
      observations.push(observation);
      if (!signal.aborted) onObservation == null ? void 0 : onObservation(observation);
    } finally {
      signal.removeEventListener("abort", abort);
      beginSessionTransition(root);
    }
  }
  return {
    passed: !signal.aborted && observations.length === 6 && observations.every((o) => o.passed),
    observations,
    qualification: "Automatic AI-proposal/host-source-compilation boundary; scripted provider, actual Pi dispatcher and QuickJS. No candidate commit, initial cutover, external business truth or unfamiliar live-model claim."
  };
};
export {
  qualifyInferredMeaning
};
