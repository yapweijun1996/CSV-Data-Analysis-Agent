const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./csv_data_analysis_vendor-storage-Dda2oZrY.js","./csv_data_analysis_vendor-data-CIO9Xlwr.js","./csv_data_analysis_vendor-react-core-DlbdMisc.js","./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js","./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js","./csv_data_analysis_vendor-ai-google-DYdleeb9.js","./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js"])))=>i.map(i=>d[i]);
import { ax as beginRun, ay as scopeRunStore, eo as bindCandidateValidationContract, ba as preparePiExecutor, F as createAndStoreTabSessionId, eq as prepareCandidateCommitFixture, aH as finishRun, bb as createCandidateCommitService, _ as __vitePreload, ep as openStorageDatabase, aB as assertRunActive, x as buildPersistedReportRecord, es as writeReportProjection, C as CURRENT_SESSION_KEY, aK as cancelOwnedRun, r as beginSessionTransition, bc as DATASET_COMMITS_STORE, b1 as commitHeadKey, b0 as restoreAcceptedDataset, ef as DuckDbWorkerClient, er as getCsvDatasetLoadVersion, br as retainAcceptedDataset, ev as DATASET_RETENTION_STORE, ew as collectRetainedRows, bf as readRetainedRows, aX as codeDigest, be as reconstructDatasetCommit, ex as RETENTION_POLICY, bt as listRollbackTargets, bq as reviewDatasetRollback, bu as commitDatasetRollback, ey as RETAINED_DATA_ROOT, ez as sha256Bytes } from "./csv_data_analysis_app-agent-CCgesa_7.js";
import { d as deleteDB } from "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import { P as Papa } from "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import { n as recoverCandidateReview, o as commitRecoveredCandidate } from "./csv_data_analysis_index-x-Z1054W.js";
import { withCommitStorageFault } from "./csv_data_analysis_candidateCommitQualification-BrhHoJYB.js";
import "./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js";
import "./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js";
import "./csv_data_analysis_vendor-ai-google-DYdleeb9.js";
import "./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js";
import "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import "./csv_data_analysis_vendor-state-CMf1uPe1.js";
const stageRecoveryQualificationCandidate = async (root, kind, guest) => {
  const bundle = root.getState().datasetBundle, lease = beginRun(root, "follow_up", `recovery-fixture-${crypto.randomUUID()}`, `recovery-fixture-turn-${crypto.randomUUID()}`), store = scopeRunStore(root, lease);
  const namesSchema = [{ name: "Name", dataType: "string", nullable: false }], factsSchema = [...namesSchema, { name: "Amount", dataType: "number", nullable: false }];
  const cells = (row, columns, trim = false) => ({ cells: columns.map((column) => ({
    column,
    origin: { kind: "table", name: "input", row, column },
    conversion: trim && column === "Name" ? "trim" : "identity"
  })) });
  const goal = kind === "names" ? "Produce the explicitly approved name-only reference table." : "Trim the detail, reconcile the subtotal and produce the declared facts and dimensions.";
  const tables = kind === "names" ? [{ name: "names", role: "reference", schema: namesSchema, grain: ["Name"], groupBy: [], metrics: [], mutableColumns: [], rows: [0, 1].map((row) => cells(row, ["Name"])) }] : [{ name: "facts", role: "fact", schema: factsSchema, grain: ["Name"], groupBy: [], metrics: [{ column: "Amount", scale: 2, toleranceMinor: 0, unit: "SGD" }], mutableColumns: ["Name"], rows: [0, 1].map((row) => cells(row, ["Name", "Amount"], row === 1)) }];
  if (kind === "multi") tables.push({ name: "names", role: "dimension", schema: namesSchema, grain: ["Name"], groupBy: [], metrics: [], mutableColumns: ["Name"], rows: [0, 1].map((row) => cells(row, ["Name"], row === 1)) });
  const relationships = kind === "multi" ? [{ fromTable: "facts", toTable: "names", fromKeys: ["Name"], toKeys: ["Name"], cardinality: "one_to_one", maxAmplification: 1, requireCoverage: true }] : [];
  root.candidateValidationContract = await bindCandidateValidationContract(root, goal, {
    version: 1,
    ambiguities: [],
    tables,
    relationships,
    exclusions: kind === "names" ? [] : [{ origin: { kind: "table", name: "input", row: 2 }, role: "subtotal", checks: [{ column: "Amount", table: "facts", detailRows: [0, 1], metric: "Amount" }] }]
  });
  const prep = await preparePiExecutor(store, { entryPoint: "follow_up", goal, guest });
  const declaration = JSON.stringify(tables.map(({ name, role, schema }) => ({ name, role, schema }))), relations = JSON.stringify(relationships.map(({ maxAmplification: _max, requireCoverage: _coverage, ...r }) => r));
  const output = `const defs=${declaration};const all=${kind === "stream" ? "input.stream.state" : "input.input.rows"};const tables=defs.map(t=>{const rows=all.slice(0,2).map(r=>Object.fromEntries(t.schema.map(c=>[c.name,c.name==='Name'&&${kind !== "names"}?r[c.name].trim():r[c.name]])));return {...t,rowCount:rows.length,rows,lineage:rows.flatMap((r,row)=>t.schema.map(c=>({row,column:c.name,origins:[{kind:'table',name:'input',row,column:c.name}]})))};});const candidate={schemaVersion:1,complete:true,tables,relationships:${relations},excludedRows:${kind === "names" ? "[]" : '[{origin:{kind:"table",name:"input",row:2},reason:"subtotal"}]'}};`;
  const code = kind === "stream" ? `if(input.stream.phase==='batch')return {state:[...input.stream.state,...input.input.rows],rows:[]};${output}return {state:input.stream.state,rows:[candidate]};` : `${output}return candidate;`;
  const program = await store.codeExecution.workspace.write("/workspace/recovery-program.js", code, 0);
  const request = {
    program: { path: program.path, revision: program.revision, sha256: program.sha256 },
    inputs: [],
    tables: [{ name: "input", tableId: bundle.primaryTableId }],
    ...kind === "stream" ? { mode: "stateful_stream", stream: { table: "input", batchRows: 1, partitionBy: [], initialState: [] } } : {},
    output: { path: "/workspace/recovery-output.json", expectedRevision: 0, format: "json" }
  };
  const context = { lease, toolCallId: "recovery-fixture-code", stepId: "recovery-fixture-code" };
  await prep.task.beforeTool("code.run", request, context.toolCallId);
  const execution = await store.codeExecution.run(request, context);
  prep.task.afterTool("code.run", { status: "success", toolName: "code.run", message: execution.reasonCode, shouldStop: false, artifacts: { codeExecution: execution } }, context);
  if (execution.status !== "succeeded") throw new Error(execution.reasonCode);
  const candidate = await store.candidateStaging.stage(execution.jobId, { lease, toolCallId: "recovery-fixture-stage", stepId: "recovery-fixture-stage" });
  const validation = await store.candidateStaging.validate(candidate.candidateId, { lease, toolCallId: "recovery-fixture-validate", stepId: "recovery-fixture-validate" });
  if (validation.decision !== "validated") throw new Error(validation.reasonCodes.join(","));
  return { store, lease, prep, candidate, validation, execution };
};
const modes = [
  "source-reload",
  "retained-reopen",
  "source-mismatch",
  "environment-unavailable",
  "uncertain-effect",
  "lost-ack-reload",
  "uncertain-read",
  "missing-retained-file",
  "retention-quota",
  "retention-write-failure",
  "gc-pins-expiry",
  "gc-session-boundary",
  "gc-read-pin",
  "rollback-append",
  "rollback-awaiting-source",
  "rollback-contender",
  "interrupted-approval",
  "interrupted-budget",
  "history-fork-reopen",
  "stateful-replay",
  "multi-table-rollback"
];
const original = () => new File(["Name,Amount\nTotal Solutions,0\n Detail ,-5\nSubtotal,-5\n"], "synthetic-commit.csv");
const rootDirectory = () => navigator.storage.getDirectory();
const folderFor = async (record) => (await (await (await rootDirectory()).getDirectoryHandle(RETAINED_DATA_ROOT)).getDirectoryHandle(await sha256Bytes(new TextEncoder().encode(record.sessionId)))).getDirectoryHandle(record.recordId);
const seal = async (marker) => {
  const { digest: _digest, ...body } = marker.replayManifest;
  marker.replayManifest.digest = await codeDigest(body);
};
const errorCode = (error) => error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : "qualification_failed";
const qualifyDatasetRecovery = async (signal, onObservation) => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
  const observations = [], client = new DuckDbWorkerClient(), retire = () => client.retireSession();
  signal.addEventListener("abort", retire, { once: true });
  const bind = async (data, abort) => {
    if (!data) throw new Error("complete_input_unavailable");
    const binding = { tableName: "session_clean_dataset", loadVersion: getCsvDatasetLoadVersion(data) };
    await client.initDuckDb(45e3, abort);
    await client.loadCleanDataset({ ...binding, csvText: Papa.unparse(data.data), csvFileName: data.fileName }, 45e3, abort);
    return { ...binding, engine: "duckdb", fallbackReason: null, fallbackStage: null };
  };
  try {
    for (const mode of modes) {
      if (signal.aborted) break;
      const started = performance.now(), name = `csv-agent-ca134-${crypto.randomUUID()}`;
      let db = await openStorageDatabase(name), f;
      let extra, lease;
      let abort = () => void 0;
      const cleanupOwners = /* @__PURE__ */ new Set();
      let status = "", passed = false;
      const details = {};
      const deps = { database: async () => db, bind, persist: async (store) => {
        const run = store.executionContext.lease;
        assertRunActive(store, run);
        const state = store.getState(), report = buildPersistedReportRecord(state, { id: state.sessionId, filename: "synthetic-commit.csv" });
        await writeReportProjection(report, db);
        assertRunActive(store, run);
        await writeReportProjection({ ...report, id: CURRENT_SESSION_KEY }, db);
        assertRunActive(store, run);
        return true;
      } };
      try {
        f = await prepareCandidateCommitFixture({ signal });
        const fixture = f;
        cleanupOwners.add(f.lease.scope.sessionId);
        abort = () => cancelOwnedRun(fixture.root);
        signal.addEventListener("abort", abort, { once: true });
        let store = f.store, prep = f.prep, candidate = f.candidate;
        if (mode === "stateful-replay" || mode === "multi-table-rollback") {
          prep.task.close("blocked");
          finishRun(f.root, f.lease);
          extra = await stageRecoveryQualificationCandidate(f.root, mode === "stateful-replay" ? "stream" : "multi");
          store = extra.store;
          prep = extra.prep;
          candidate = extra.candidate;
        }
        const fault = { mode: mode === "lost-ack-reload" ? "lost_ack" : "" };
        const service = createCandidateCommitService(store, { database: async () => withCommitStorageFault(db, fault), bind });
        const review = await service.review(candidate.candidateId, { primaryTable: "facts", idempotencyKey: "qualification-recovery-intent" }), checkpoint = await service.recoveryCheckpoint(review);
        f.root.setState({ candidateRecovery: checkpoint });
        await deps.persist(store);
        const initial = ["interrupted-approval", "interrupted-budget"].includes(mode) ? void 0 : await service.commit(service.approve(review));
        const marker = (initial == null ? void 0 : initial.marker) ?? checkpoint.proposal;
        if ((initial == null ? void 0 : initial.status) !== "committed" && initial !== void 0) throw new Error("initial_commit_failed");
        prep.task.close("blocked");
        finishRun(f.root, store.executionContext.lease);
        const fresh = (replace = false) => {
          if (lease) finishRun(fixture.root, lease);
          if (replace) beginSessionTransition(fixture.root);
          lease = beginRun(fixture.root, "follow_up", `recovery-${crypto.randomUUID()}`);
          return scopeRunStore(fixture.root, lease);
        };
        let owned = fresh();
        const removeReferences = async () => {
          await db.delete(DATASET_COMMITS_STORE, commitHeadKey(marker.sessionId));
          for (const r of await db.getAll("reports")) await db.delete("reports", r.id);
        };
        if (mode === "source-reload" || mode === "lost-ack-reload" || mode === "stateful-replay") {
          const saved = await db.get("reports", marker.sessionId);
          db.close();
          db = await openStorageDatabase(name);
          owned = fresh(true);
          fixture.root.setState({ datasetBundle: saved.appState.datasetBundle, csvData: null, canonicalCsvData: null, rawCsvData: null, datasetCommitBindingStatus: "awaiting_source", activeDataQuery: null, candidateRecovery: null });
          await restoreAcceptedDataset(owned, { file: original() }, deps);
          const query = await client.executeRawQuery({
            sql: "SELECT COUNT(*) n, SUM(TRY_CAST(Amount AS DOUBLE)) total FROM session_clean_dataset",
            selectedColumns: [],
            limit: 10,
            expectedBinding: { tableName: "session_clean_dataset", loadVersion: getCsvDatasetLoadVersion(fixture.root.getState().csvData) }
          }, 1e4, signal);
          passed = Number((_a = query.rows[0]) == null ? void 0 : _a.n) === 2 && Number((_b = query.rows[0]) == null ? void 0 : _b.total) === -5 && await db.count(DATASET_COMMITS_STORE) === 2;
          details.rows = 2;
          details.total = -5;
          details.commitCount = 1;
          details.metadataOnly = (saved == null ? void 0 : saved.appState.csvData) === null;
          status = "verified_reconstruction";
        } else if (mode === "retained-reopen" || mode === "missing-retained-file" || mode.startsWith("gc-") || mode === "history-fork-reopen") {
          await retainAcceptedDataset(owned, deps);
          await retainAcceptedDataset(owned, deps);
          const records = await db.getAll(DATASET_RETENTION_STORE), record = records[0];
          details.retainedArtifacts = records.length;
          if (mode === "retained-reopen") {
            db.close();
            db = await openStorageDatabase(name);
            owned = fresh(true);
            fixture.root.setState({ csvData: null, canonicalCsvData: null, datasetCommitBindingStatus: "awaiting_source" });
            await restoreAcceptedDataset(owned, {}, deps);
            passed = ((_c = fixture.root.getState().csvData) == null ? void 0 : _c.data.length) === 2 && records.length === 1 && fixture.root.getState().activeDataQuery === null;
            status = "verified_retained_restore";
          } else if (mode === "missing-retained-file") {
            await (await folderFor(record)).removeEntry("chunk-0");
            owned = fresh(true);
            fixture.root.setState({ csvData: null, canonicalCsvData: null, datasetCommitBindingStatus: "awaiting_source" });
            try {
              await restoreAcceptedDataset(owned, {}, deps);
            } catch (error) {
              status = errorCode(error);
            }
            passed = status === "retention_rows_unavailable" && fixture.root.getState().csvData === null;
            await restoreAcceptedDataset(owned, { file: original() }, deps);
            await retainAcceptedDataset(owned, deps);
            passed && (passed = ((_d = fixture.root.getState().csvData) == null ? void 0 : _d.data.length) === 2);
            details.explicitSourceRepair = true;
          } else if (mode === "history-fork-reopen") {
            const state = { ...fixture.root.getState(), sessionId: `fork-${crypto.randomUUID()}`, csvData: null, canonicalCsvData: null, datasetCommitBindingStatus: "awaiting_source" };
            await writeReportProjection(buildPersistedReportRecord(state, { id: state.sessionId, filename: "synthetic-commit.csv" }), db);
            owned = fresh(true);
            fixture.root.setState(state);
            owned = fresh(true);
            db.close();
            db = await openStorageDatabase(name);
            const saved = await db.get("reports", state.sessionId);
            await restoreAcceptedDataset(owned, {}, deps);
            passed = ((_f = (_e = saved == null ? void 0 : saved.appState.datasetBundle) == null ? void 0 : _e.acceptedCommit) == null ? void 0 : _f.commitId) === marker.commitId && ((_g = fixture.root.getState().csvData) == null ? void 0 : _g.data.length) === 2 && await db.count(DATASET_COMMITS_STORE) === 2;
            status = "fork_reference_restored";
          } else {
            await db.put(DATASET_RETENTION_STORE, { ...record, expiresAt: 0 });
            if (mode === "gc-pins-expiry") {
              const protectedCount = await collectRetainedRows(db, marker.sessionId);
              await removeReferences();
              const removed = await collectRetainedRows(db, marker.sessionId);
              passed = protectedCount === 0 && removed === 1 && ((_h = await db.get(DATASET_RETENTION_STORE, record.recordId)) == null ? void 0 : _h.status) === "deleted";
              details.protected = protectedCount;
              details.removed = removed;
              status = "reference_pins_verified";
            } else if (mode === "gc-session-boundary") {
              const other = { ...record, recordId: `retained-${crypto.randomUUID()}`, sessionId: `other-${crypto.randomUUID()}`, commitId: "other-commit", expiresAt: 0 };
              await db.put(DATASET_RETENTION_STORE, other);
              await removeReferences();
              const removed = await collectRetainedRows(db, marker.sessionId);
              passed = removed === 1 && ((_i = await db.get(DATASET_RETENTION_STORE, other.recordId)) == null ? void 0 : _i.status) === "ready";
              status = "other_namespace_preserved";
            } else {
              await removeReferences();
              let release, started2;
              const gate = new Promise((r) => release = r), began = new Promise((r) => started2 = r);
              const reading = readRetainedRows(db, marker, async () => {
                started2();
                await gate;
                return rootDirectory();
              });
              await began;
              const protectedCount = await collectRetainedRows(db, marker.sessionId);
              release();
              const material = await reading;
              const removed = await collectRetainedRows(db, marker.sessionId);
              passed = Boolean(material) && protectedCount === 0 && removed === 1;
              status = "active_read_pin_verified";
            }
          }
        } else if (mode === "source-mismatch" || mode === "environment-unavailable" || mode === "uncertain-effect" || mode === "uncertain-read") {
          owned = fresh(true);
          if (mode === "uncertain-read") {
            const blockedDb = new Proxy(db, { get(target, key) {
              if (key === "get") return () => {
                throw new Error("journal_unavailable");
              };
              const v = Reflect.get(target, key, target);
              return typeof v === "function" ? v.bind(target) : v;
            } });
            try {
              await restoreAcceptedDataset(owned, { file: original() }, { ...deps, database: async () => blockedDb });
            } catch (error) {
              status = errorCode(error);
            }
            passed = status === "journal_unavailable" && fixture.root.getState().datasetCommitBindingStatus === "commit_unknown";
          } else {
            const altered = structuredClone(marker);
            if (mode === "environment-unavailable") {
              altered.environment.runtime = "missing-engine";
              altered.validation = { ...altered.validation, environmentDigest: await codeDigest(altered.environment) };
            }
            if (mode === "uncertain-effect") {
              altered.replayManifest.effectSafety = "unknown_external_outcome";
              await seal(altered);
            }
            try {
              await reconstructDatasetCommit(owned, altered, { file: mode === "source-mismatch" ? new File(["Name,Amount\nWrong,999\n"], "wrong.csv") : original() });
            } catch (error) {
              status = errorCode(error);
            }
            passed = status === (mode === "source-mismatch" ? "recovery_source_mismatch" : mode === "environment-unavailable" ? "recovery_environment_unavailable" : "recovery_uncertain_effect");
          }
        } else if (mode === "retention-quota" || mode === "retention-write-failure") {
          if (mode === "retention-quota") await db.put(DATASET_RETENTION_STORE, {
            recordId: `retained-${crypto.randomUUID()}`,
            sessionId: "quota-reservation",
            commitId: "other-commit",
            manifestDigest: "a".repeat(64),
            sha256: "a".repeat(64),
            byteSize: RETENTION_POLICY.totalBytes,
            chunks: 1,
            createdAt: Date.now(),
            expiresAt: Date.now() + 6e4,
            status: "writing"
          });
          const before = fixture.root.getState().datasetBundle.acceptedCommit.commitId;
          try {
            await retainAcceptedDataset(owned, mode === "retention-write-failure" ? { ...deps, directory: async () => {
              throw new DOMException("Injected write failure", "QuotaExceededError");
            } } : deps);
          } catch (error) {
            status = mode === "retention-write-failure" ? "opfs_write_rejected" : errorCode(error);
          }
          passed = status === (mode === "retention-quota" ? "retention_total_quota" : "opfs_write_rejected") && ((_k = (_j = fixture.root.getState().datasetBundle) == null ? void 0 : _j.acceptedCommit) == null ? void 0 : _k.commitId) === before && !(await db.getAll(DATASET_RETENTION_STORE)).some((r) => r.status === "ready");
        } else if (mode.startsWith("rollback-") || mode === "multi-table-rollback") {
          finishRun(fixture.root, lease);
          lease = void 0;
          extra = await stageRecoveryQualificationCandidate(fixture.root, "names");
          const second = createCandidateCommitService(extra.store, { database: async () => db, bind }), r = await second.review(extra.candidate.candidateId, { primaryTable: "names", idempotencyKey: "qualification-second-version" });
          await second.commit(second.approve(r));
          extra.prep.task.close("completed");
          finishRun(fixture.root, extra.lease);
          owned = fresh(mode === "rollback-awaiting-source");
          const target = (await listRollbackTargets(owned, deps))[0];
          if (mode === "rollback-awaiting-source") {
            try {
              await reviewDatasetRollback(owned, target, {}, deps);
            } catch (error) {
              status = errorCode(error);
            }
            passed = status === "recovery_source_unavailable" && await db.count(DATASET_COMMITS_STORE) === 3;
          } else {
            const exact = await reviewDatasetRollback(owned, target, { file: original() }, deps);
            owned = fresh();
            if (mode === "rollback-contender") {
              const head = await db.get(DATASET_COMMITS_STORE, commitHeadKey(fixture.root.getState().sessionId));
              if ((head == null ? void 0 : head.kind) !== "head") throw new Error("commit_marker_invalid");
              await db.put(DATASET_COMMITS_STORE, { ...head, revision: head.revision + 1 });
              try {
                await commitDatasetRollback(owned, exact, deps);
              } catch (error) {
                status = errorCode(error);
              }
              passed = status === "commit_marker_invalid" && await db.count(DATASET_COMMITS_STORE) === 3;
            } else {
              const restored = await commitDatasetRollback(owned, exact, deps), duplicate = await commitDatasetRollback(owned, exact, deps);
              passed = restored.commitId === duplicate.commitId && restored.revision === 3 && ((_l = fixture.root.getState().csvData) == null ? void 0 : _l.data[1].Amount) === -5 && await db.count(DATASET_COMMITS_STORE) === 4 && restored.bundle.tables[0].schema.some((c) => c.name === "Amount") && fixture.root.getState().activeDataQuery === null;
              if (mode === "multi-table-rollback") passed && (passed = restored.bundle.tables.length === 2 && ((_m = restored.bundle.relationships[0]) == null ? void 0 : _m.decision) === "trusted");
              details.appendedRevision = restored.revision;
              details.tableCount = restored.bundle.tables.length;
              details.relationshipCount = restored.bundle.relationships.length;
              status = "rollback_appended_once";
            }
          }
        } else {
          owned = fresh(true);
          fixture.root.setState({ csvData: null, canonicalCsvData: null, rawCsvData: null, candidateRecovery: checkpoint });
          const result = await recoverCandidateReview(owned, { file: original() }, deps);
          if (result.status !== "review") throw new Error("fresh_review_missing");
          details.attempts = (_n = fixture.root.getState().candidateRecovery) == null ? void 0 : _n.task.budget.used.transformationAttempts;
          if (mode === "interrupted-approval") {
            owned = fresh();
            const restored = await commitRecoveredCandidate(owned, result.review, deps);
            passed = restored.audit.runId === lease.runId && restored.validation.runId === lease.runId && await db.count(DATASET_COMMITS_STORE) === 2 && fixture.root.getState().candidateRecovery === null;
            status = "fresh_review_committed_once";
          } else {
            await writeReportProjection(buildPersistedReportRecord({ ...fixture.root.getState(), candidateRecovery: checkpoint }, { id: fixture.root.getState().sessionId, filename: "synthetic-commit.csv" }), db);
            const saved = await db.get("reports", fixture.root.getState().sessionId);
            details.durableAttempts = (_o = saved == null ? void 0 : saved.appState.candidateRecovery) == null ? void 0 : _o.task.budget.used.transformationAttempts;
            owned = fresh(true);
            await recoverCandidateReview(owned, { file: original() }, deps);
            owned = fresh(true);
            try {
              await recoverCandidateReview(owned, { file: original() }, deps);
            } catch (error) {
              status = errorCode(error);
            }
            passed = details.durableAttempts === 2 && status === "recovery_task_budget_exhausted" && await db.count(DATASET_COMMITS_STORE) === 0;
          }
        }
      } catch (error) {
        passed = false;
        status = errorCode(error);
      } finally {
        signal.removeEventListener("abort", abort);
        extra == null ? void 0 : extra.prep.task.close("cancelled");
        if (f && lease) finishRun(f.root, lease);
        if (f && extra) finishRun(f.root, extra.lease);
        f == null ? void 0 : f.cleanup();
        client.retireSession();
        for (const owner of cleanupOwners) try {
          await (await (await rootDirectory()).getDirectoryHandle(RETAINED_DATA_ROOT)).removeEntry(await sha256Bytes(new TextEncoder().encode(owner)), { recursive: true });
        } catch {
        }
        db.close();
        await deleteDB(name);
      }
      const observation = { id: mode, passed, status, elapsedMs: Math.round(performance.now() - started), details };
      observations.push(observation);
      if (!signal.aborted) onObservation == null ? void 0 : onObservation(observation);
    }
  } finally {
    signal.removeEventListener("abort", retire);
    client.retireSession();
  }
  return { passed: observations.length === modes.length && observations.every((o) => o.passed) && !signal.aborted, observations };
};
const prepareDatasetRecoveryUiSmoke = async (root, mode = "ready") => {
  var _a, _b;
  const sessionId = createAndStoreTabSessionId(), fixture = await prepareCandidateCommitFixture({ root, sessionId });
  root.setState({ currentView: "analysis_dashboard", initialAnalysisStatus: "ready", chatLifecycleState: "idle", isBusy: false });
  let store = fixture.store, prep = fixture.prep, candidate = fixture.candidate;
  if (mode === "rollback") {
    prep.task.close("blocked");
    finishRun(root, fixture.lease);
    const first = await stageRecoveryQualificationCandidate(root, "multi");
    store = first.store;
    prep = first.prep;
    candidate = first.candidate;
  }
  const service = createCandidateCommitService(store), review = await service.review(candidate.candidateId, { primaryTable: "facts", idempotencyKey: `ui-intent-${crypto.randomUUID()}` });
  if (mode === "pending") {
    const { requestPiCandidateApproval } = await __vitePreload(async () => {
      const { requestPiCandidateApproval: requestPiCandidateApproval2 } = await import("./csv_data_analysis_app-agent-CCgesa_7.js").then((n) => n.f3);
      return { requestPiCandidateApproval: requestPiCandidateApproval2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0, import.meta.url);
    const pending = await requestPiCandidateApproval(store, candidate.candidateId, "facts");
    root.setState({ pendingClarification: pending });
    prep.task.close("blocked");
    finishRun(root, store.executionContext.lease);
  } else {
    const result = await service.commit(service.approve(review));
    if (result.status !== "committed" || result.acknowledgement !== "installed") throw new Error("ui_seed_commit_failed");
    prep.task.close("completed");
    finishRun(root, store.executionContext.lease);
    if (mode === "rollback") {
      const next = await stageRecoveryQualificationCandidate(root, "names"), second = createCandidateCommitService(next.store);
      const exact = await second.review(next.candidate.candidateId, { primaryTable: "names", idempotencyKey: `ui-next-${crypto.randomUUID()}` });
      const secondResult = await second.commit(second.approve(exact));
      if (secondResult.status !== "committed" || secondResult.acknowledgement !== "installed") throw new Error("ui_seed_commit_failed");
      next.prep.task.close("completed");
      finishRun(root, next.lease);
    }
  }
  root.setState({ activeAgentTask: null, isBusy: false, chatLifecycleState: "idle", pendingClarification: null, currentView: mode === "pending" ? "file_upload" : "analysis_dashboard" });
  return {
    caseName: "ca134-ui-seed",
    sessionId,
    mode,
    commit: (_a = root.getState().datasetBundle) == null ? void 0 : _a.acceptedCommit,
    checkpoint: (_b = root.getState().candidateRecovery) == null ? void 0 : _b.checkpointId
  };
};
export {
  prepareDatasetRecoveryUiSmoke,
  qualifyDatasetRecovery
};
