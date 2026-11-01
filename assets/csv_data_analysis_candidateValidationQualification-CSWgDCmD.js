import { ep as createSingleTableDatasetBundle, u as hasSavableSession, en as captureCsvSource, er as bindCandidateValidationContract, eo as runPiFollowUpTurn, r as beginSessionTransition, aK as cancelOwnedRun, eq as createAssistantMessageEventStream } from "./csv_data_analysis_app-agent-DlyYMc3W.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import "./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js";
import "./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js";
import "./csv_data_analysis_vendor-ai-google-DYdleeb9.js";
import "./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js";
const goal = "Write a JavaScript program, stage its output and independently validate it.";
const schema = [{ name: "Id", dataType: "string", nullable: false }, { name: "Group", dataType: "string", nullable: false }, { name: "Amount", dataType: "number", nullable: false }, { name: "Unit", dataType: "string", nullable: false }];
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
const qualifyCandidateValidation = async (signal, onObservation) => {
  var _a, _b;
  const observations = [];
  for (const mode of ["valid", "wrong-group", "duplicate", "unit", "amplification", "ambiguous", "missing-contract", "forged", "factual", "source"]) {
    if (signal.aborted) break;
    const started = performance.now();
    const data = { fileName: "synthetic-validation.csv", data: [{ Id: "Total Solutions", Group: "East", Amount: 0, Unit: "SGD" }, { Id: "a", Group: "East", Amount: 315, Unit: "SGD" }, { Id: "b", Group: "West", Amount: -5, Unit: "SGD" }, { Id: "subtotal", Group: "East", Amount: 315, Unit: "SGD" }, { Id: "grand", Group: "all", Amount: 310, Unit: "SGD" }] };
    const bundle = createSingleTableDatasetBundle({ datasetId: crypto.randomUUID(), sourceFingerprint: "synthetic", file: { name: data.fileName, size: 0, lastModified: 0 }, data });
    let state = {
      sessionId: "validation-lab-" + crypto.randomUUID(),
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
    const contract = {
      version: 1,
      ambiguities: mode === "ambiguous" ? ["unknown date convention"] : [],
      tables: [{
        name: "facts",
        role: "fact",
        schema: [...schema],
        grain: ["Id"],
        groupBy: ["Group", "Unit"],
        mutableColumns: [],
        metrics: [{ column: "Amount", scale: 2, toleranceMinor: 0, unit: "money", unitColumn: "Unit", allowedUnits: ["SGD"] }],
        rows: [0, 1, 2].map((row) => ({ cells: schema.map((s) => ({ column: s.name, origin: { kind: "table", name: "raw", row, column: s.name }, conversion: "identity" })) }))
      }],
      relationships: [],
      exclusions: [{ origin: { kind: "table", name: "raw", row: 3 }, role: "subtotal", checks: [{ column: "Amount", table: "facts", detailRows: [0, 1], metric: "Amount" }] }, { origin: { kind: "table", name: "raw", row: 4 }, role: "grand_total", checks: [{ column: "Amount", table: "facts", detailRows: [0, 1, 2], metric: "Amount" }] }]
    };
    for (const e of contract.exclusions) for (const c of e.checks) c.scope = (e.role === "subtotal" ? ["Group", "Unit"] : ["Unit"]).map((field) => ({ field, origin: { kind: "table", name: "raw", row: e.origin.row, column: field } }));
    if (mode === "amplification") {
      contract.tables.push({ ...structuredClone(contract.tables[0]), name: "dimension", role: "dimension" });
      contract.relationships.push({ fromTable: "facts", toTable: "dimension", fromKeys: ["Group"], toKeys: ["Group"], cardinality: "many_to_one", maxAmplification: 1, requireCoverage: true });
    }
    let source;
    if (mode === "source") {
      source = await captureCsvSource(root, new File(['Id,Group,Amount,Unit\n"Total,\nSolutions",East,0,SGD\n,a,East,315,SGD\nb,West,-5,SGD\nsubtotal,East,315,SGD\ngrand,all,310,SGD\n'], "synthetic-validation.csv"));
      root.setState({ datasetBundle: { ...bundle, source: { ...bundle.source, inspection: source } } });
      contract.tables[0].mutableColumns = ["Amount"];
      contract.tables[0].rows = [1, 2, 3].map((row) => ({ cells: schema.map((s, column) => ({ column: s.name, origin: { kind: "source", name: "source", row, column: column + (row === 2 ? 1 : 0) }, conversion: s.name === "Amount" ? "decimal" : "identity", ...s.name === "Amount" ? { scale: 2 } : {} })) }));
      contract.exclusions = [{ origin: { kind: "source", name: "source", row: 0 }, role: "header", checks: [] }, ...[4, 5].map((row) => ({ origin: { kind: "source", name: "source", row }, role: row === 4 ? "subtotal" : "grand_total", checks: [{ column: 2, table: "facts", detailRows: row === 4 ? [0, 1] : [0, 1, 2], metric: "Amount", scope: (row === 4 ? ["Group", "Unit"] : ["Unit"]).map((field) => ({ field, origin: { kind: "source", name: "source", row, column: field === "Group" ? 1 : 3 } })) }] }))];
    }
    if (mode !== "missing-contract") root.candidateValidationContract = await bindCandidateValidationContract(root, mode === "factual" ? "What is the total Amount?" : goal, contract);
    const before = JSON.stringify({ data: state.canonicalCsvData, bundle: state.datasetBundle, cards: state.analysisCards, query: state.activeDataQuery });
    const abort = () => cancelOwnedRun(root);
    signal.addEventListener("abort", abort, { once: true });
    let step = 0, receipt, candidateId = "";
    const mutation = mode === "wrong-group" ? "table.rows[1].Amount=310;table.rows[2].Amount=0;" : mode === "duplicate" ? "table.rows[2].Id='a';" : mode === "unit" ? "table.rows[2].Unit='USD';" : "";
    const program = source ? `const text=String.fromCharCode(...input.source.bytes);const records=[];let cells=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c.charCodeAt(0)===34){if(quoted&&text.charCodeAt(i+1)===34){cell+=c;i++;}else quoted=!quoted;}else if(c===','&&!quoted){cells.push(cell);cell='';}else if(c==='\\n'&&!quoted){cells.push(cell);records.push(cells);cells=[];cell='';}else cell+=c;}const columns=['Id','Group','Amount','Unit'];const rows=[1,2,3].map(i=>Object.fromEntries(columns.map((column,j)=>[column,column==='Amount'?Number(records[i][j+(i===2?1:0)]):records[i][j+(i===2?1:0)]])));return {schemaVersion:1,complete:true,tables:[{name:'facts',role:'fact',schema:${JSON.stringify(schema)},rowCount:3,rows,lineage:[1,2,3].flatMap((i,row)=>columns.map((column,j)=>({row,column,origins:[{kind:'source',name:'source',row:i,column:j+(i===2?1:0)}]})))}],relationships:[],excludedRows:[0,4,5].map(row=>({origin:{kind:'source',name:'source',row},reason:'declared header/summary'}))};` : `const rows=input.raw.rows.slice(0,3).map(r=>({...r}));const columns=['Id','Group','Amount','Unit'];const table={name:'facts',role:'fact',schema:${JSON.stringify(schema)},rowCount:3,rows,lineage:rows.flatMap((r,row)=>columns.map(column=>({row,column,origins:[{kind:'table',name:'raw',row,column}]})))};${mutation}return {schemaVersion:1,complete:true,tables:[table${mode === "amplification" ? ",{...table,name:'dimension',role:'dimension'}" : ""}],relationships:${JSON.stringify(contract.relationships.map(({ maxAmplification: _a2, requireCoverage: _c, ...r }) => r))},excludedRows:[3,4].map(row=>({origin:{kind:'table',name:'raw',row},reason:'declared summary'}))};`;
    try {
      const result = await runPiFollowUpTurn({ message: mode === "factual" ? "What is the total Amount?" : goal }, root, scripted((context) => {
        var _a2;
        const last = context.messages.filter((m) => m.role === "toolResult").at(-1);
        let parsed;
        try {
          parsed = last ? JSON.parse(last.content.filter((p) => p.type === "text").map((p) => p.text).join("")) : void 0;
        } catch {
          parsed = void 0;
        }
        if (step++ === 0) return tool("workspace_write", { path: "/workspace/program.js", expectedRevision: 0, content: program });
        if (step === 2) {
          const { path, revision, sha256 } = parsed.payload.workspace.artifact;
          return tool("code_run", { program: { path, revision, sha256 }, inputs: [], ...source ? { sources: [{ name: "source", sourceId: source.sourceId, sha256: source.sha256, offset: 0, length: source.byteSize }] } : { tables: [{ name: "raw", tableId: bundle.primaryTableId }] }, output: { path: "/workspace/output.json", expectedRevision: 0, format: "json" } });
        }
        if (step === 3) return tool("candidate_stage", { jobId: parsed.receipt.jobId });
        if (step === 4) {
          candidateId = parsed.payload.candidate.candidateId;
          return tool("candidate_validate", { candidateId, ...mode === "forged" ? { contractDigest: "forged" } : {} });
        }
        if (step === 5) receipt = (_a2 = parsed == null ? void 0 : parsed.payload) == null ? void 0 : _a2.candidateValidation;
        return [{ type: "text", text: "Self-authored assertions passed. 999 complete." }];
      }));
      const unchanged = before === JSON.stringify({ data: state.canonicalCsvData, bundle: state.datasetBundle, cards: state.analysisCards, query: state.activeDataQuery });
      const success = mode === "valid" || mode === "source", expected = success ? "validated" : ["ambiguous", "missing-contract"].includes(mode) ? "clarification" : "blocked";
      const reasons = { "wrong-group": "validation_group_reconciliation_failed", duplicate: "validation_grain_duplicate", unit: "validation_unit_mismatch", amplification: "validation_relationship_amplification", ambiguous: "validation_meaning_ambiguous", "missing-contract": "validation_host_contract_required" };
      const passed = unchanged && !((_a = result.text) == null ? void 0 : _a.includes("Self-authored assertions passed. 999 complete.")) && (success ? result.status === "completed" && (receipt == null ? void 0 : receipt.decision) === "validated" && ((_b = result.text) == null ? void 0 : _b.includes("Independent host validation passed")) : result.status === "blocked" && (mode === "forged" ? receipt === void 0 : mode === "factual" ? (receipt == null ? void 0 : receipt.decision) === "validated" : (receipt == null ? void 0 : receipt.decision) === expected)) && (!reasons[mode] || Boolean(receipt == null ? void 0 : receipt.reasonCodes.includes(reasons[mode]))) && (!["ambiguous", "missing-contract"].includes(mode) || !state.pendingClarification);
      const observation = { id: mode, passed: Boolean(passed), elapsedMs: Math.round(performance.now() - started), details: { status: result.status, text: result.text, receipt, candidateId, acceptedUnchanged: unchanged, semanticConfirmationRequested: Boolean(state.pendingClarification) } };
      observations.push(observation);
      if (!signal.aborted) onObservation == null ? void 0 : onObservation(observation);
    } finally {
      signal.removeEventListener("abort", abort);
      beginSessionTransition(root);
    }
  }
  return {
    passed: !signal.aborted && observations.length === 10 && observations.every((o) => o.passed),
    observations,
    qualification: "CA-131 independent host validation; scripted provider, real Pi/QuickJS. No accepted mutation, commit, production semantic resolution or unfamiliar-model autonomy claim."
  };
};
export {
  qualifyCandidateValidation
};
