import { d as deleteDB } from "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import { P as Papa } from "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import { eq as openStorageDatabase, er as prepareCandidateCommitFixture, aK as cancelOwnedRun, x as buildPersistedReportRecord, bb as createCandidateCommitService, r as beginSessionTransition, ax as beginRun, eg as DuckDbWorkerClient, es as getCsvDatasetLoadVersion, bc as DATASET_COMMITS_STORE, bk as commitDatasetTransaction, bj as commitApprovalKey, a$ as commitIntentKey, C as CURRENT_SESSION_KEY, et as writeReportProjection, eu as readCommitIntent, ev as reconcileReportCommit } from "./csv_data_analysis_app-agent-DlRvrT-3.js";
import "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import "./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js";
import "./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js";
import "./csv_data_analysis_vendor-ai-google-DYdleeb9.js";
import "./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js";
const withCommitStorageFault = (db, fault) => new Proxy(db, {
  get(target, property) {
    if (property === "get") return (...args) => {
      if (fault.failRead && (fault.mode !== "head_read" || String(args[1]).startsWith('["head",'))) throw new Error("injected_read_unavailable");
      return Reflect.apply(target.get, target, args);
    };
    if (property === "transaction") return (...args) => {
      const tx = Reflect.apply(target.transaction, target, args);
      const done = tx.done.then(() => {
        if (fault.mode === "head_read") fault.failRead = true;
        if (!fault.tripped && ["lost_ack", "unknown"].includes(fault.mode)) {
          fault.tripped = true;
          fault.failRead = fault.mode === "unknown";
          throw new Error("injected_ack_loss");
        }
      });
      void done.catch(() => void 0);
      return new Proxy(tx, { get(transaction, key) {
        if (key === "done") return done;
        if (key === "objectStore") return (name) => {
          const objectStore = transaction.objectStore(name);
          return new Proxy(objectStore, { get(store, method) {
            if (name === DATASET_COMMITS_STORE && method === "add") return async (value4) => {
              var _a;
              fault.marker = structuredClone(value4);
              const result = await Reflect.apply(store.add, store, [value4]);
              if (!fault.tripped && ["abort", "abort_unknown"].includes(fault.mode)) {
                fault.tripped = true;
                fault.failRead = fault.mode === "abort_unknown";
                transaction.abort();
                throw new DOMException("Injected transaction abort", "AbortError");
              }
              if (!fault.tripped && fault.mode === "hold") {
                fault.tripped = true;
                const pump = () => {
                  void store.get("__qualification_hold__").then(pump, () => void 0);
                };
                pump();
                (_a = fault.onHeld) == null ? void 0 : _a.call(fault);
                return new Promise(() => void 0);
              }
              return result;
            };
            if (name === DATASET_COMMITS_STORE && method === "put") return (value4) => {
              if (!fault.tripped && fault.mode === "quota") {
                fault.tripped = true;
                throw new DOMException("Injected quota exhaustion", "QuotaExceededError");
              }
              return Reflect.apply(store.put, store, [value4]);
            };
            const value3 = Reflect.get(store, method, store);
            return typeof value3 === "function" ? value3.bind(store) : value3;
          } });
        };
        const value2 = Reflect.get(transaction, key, transaction);
        return typeof value2 === "function" ? value2.bind(transaction) : value2;
      } });
    };
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  }
});
const modes = [
  "atomic-success",
  "abort-retry",
  "quota-retry",
  "same-key-concurrent",
  "payload-conflict",
  "version-contenders",
  "approval-consumption",
  "lost-ack",
  "unknown-reconcile",
  "unknown-abort-retry",
  "head-read-failure",
  "stale-projections",
  "session-switch",
  "binding-failure",
  "metadata-reopen"
];
const qualifyCandidateCommit = async (signal, onObservation) => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const observations = [];
  const client = new DuckDbWorkerClient();
  const retire = () => client.retireSession();
  signal.addEventListener("abort", retire, { once: true });
  const bind = async (data, abortSignal) => {
    if (!data) throw new Error("no_dataset");
    const binding = { tableName: "session_clean_dataset", loadVersion: getCsvDatasetLoadVersion(data) };
    await client.initDuckDb(45e3, abortSignal);
    await client.loadCleanDataset({ ...binding, csvText: Papa.unparse(data.data), csvFileName: data.fileName }, 45e3, abortSignal);
    return { ...binding, engine: "duckdb", fallbackReason: null, fallbackStage: null };
  };
  try {
    for (const mode of modes) {
      if (signal.aborted) break;
      const started = performance.now(), name = `csv-agent-ca132-${crypto.randomUUID()}`;
      const db = await openStorageDatabase(name);
      let f;
      let abort = () => void 0;
      try {
        f = await prepareCandidateCommitFixture({ signal });
        const fixture = f;
        abort = () => cancelOwnedRun(fixture.root);
        signal.addEventListener("abort", abort, { once: true });
        const baseline = buildPersistedReportRecord(f.root.getState(), { id: f.lease.scope.sessionId, filename: "synthetic-commit.csv" });
        const original = JSON.stringify(f.root.getState().rawCsvData);
        const fault = { mode: mode === "abort-retry" ? "abort" : mode === "unknown-abort-retry" ? "abort_unknown" : mode === "head-read-failure" ? "head_read" : mode === "quota-retry" ? "quota" : mode === "lost-ack" ? "lost_ack" : mode === "unknown-reconcile" ? "unknown" : ["payload-conflict", "version-contenders", "approval-consumption"].includes(mode) ? "abort" : "" };
        const service = createCandidateCommitService(f.store, {
          database: async () => withCommitStorageFault(db, fault),
          bind: mode === "binding-failure" ? async () => {
            throw new Error("injected_rebind_failure");
          } : bind,
          onAdmitted: mode === "session-switch" ? () => {
            beginSessionTransition(fixture.root);
            fixture.root.setState({ sessionId: "replacement", isBusy: true });
            beginRun(fixture.root, "follow_up", "replacement-run");
          } : void 0
        });
        const review = await service.review(f.candidate.candidateId, { idempotencyKey: "qualification-intent", primaryTable: "facts" }), approval = service.approve(review);
        const first = await service.commit(approval);
        let passed = false;
        const details = { status: first.status, acknowledgement: first.acknowledgement };
        if (mode === "atomic-success") {
          const query = await client.executeRawQuery({
            sql: "SELECT COUNT(*) n, SUM(TRY_CAST(Amount AS DOUBLE)) total FROM session_clean_dataset",
            selectedColumns: [],
            limit: 10,
            expectedBinding: { tableName: "session_clean_dataset", loadVersion: getCsvDatasetLoadVersion(f.root.getState().csvData) }
          }, 1e4, signal);
          passed = first.status === "committed" && first.acknowledgement === "installed" && Number((_a = query.rows[0]) == null ? void 0 : _a.n) === 2 && Number((_b = query.rows[0]) == null ? void 0 : _b.total) === -5;
          details.marker = first.marker;
          details.report = await db.get("reports", baseline.id);
          details.query = query.rows;
          details.approvalConsumed = ((_c = first.marker) == null ? void 0 : _c.approval.approvalId) === approval.approvalId;
          passed && (passed = details.approvalConsumed === true);
        } else if (mode === "abort-retry" || mode === "quota-retry") {
          const empty = await db.count(DATASET_COMMITS_STORE) === 0 && await db.count("reports") === 0;
          const retry = await service.commit(approval);
          passed = first.status === "not_committed" && first.admitted && empty && retry.status === "committed" && ((_d = retry.marker) == null ? void 0 : _d.approval.approvalId) === approval.approvalId;
          details.abortedWithoutRecords = empty;
          details.retry = retry.status;
        } else if (mode === "same-key-concurrent") {
          const replies = await Promise.all([service.commit(approval), service.commit(approval)]);
          passed = first.status === "committed" && replies.every((r) => {
            var _a2, _b2;
            return r.status === "committed" && r.replay && ((_a2 = r.marker) == null ? void 0 : _a2.commitId) === ((_b2 = first.marker) == null ? void 0 : _b2.commitId);
          });
          const direct = await Promise.all([commitDatasetTransaction(db, first.marker, baseline, () => void 0), commitDatasetTransaction(db, first.marker, baseline, () => void 0)]);
          passed && (passed = direct.every((r) => {
            var _a2;
            return r.replay && r.marker.commitId === ((_a2 = first.marker) == null ? void 0 : _a2.commitId);
          }));
          details.replayedTransactions = direct.length;
        } else if (["payload-conflict", "version-contenders", "approval-consumption"].includes(mode)) {
          const marker = fault.marker;
          if (mode === "version-contenders") {
            const other = { ...structuredClone(marker), commitId: "competing-commit", recordId: commitIntentKey(marker.sessionId, "different-intent"), intentKey: commitIntentKey(marker.sessionId, "different-intent"), idempotencyKey: "different-intent", approvalKey: commitApprovalKey(marker.sessionId, "different-approval"), approval: { ...marker.approval, approvalId: "different-approval" } };
            other.bundle.acceptedCommit = { sessionId: marker.sessionId, commitId: other.commitId, revision: 1 };
            const results = await Promise.allSettled([commitDatasetTransaction(db, marker, baseline, () => void 0), commitDatasetTransaction(db, other, baseline, () => void 0)]);
            passed = results.filter((r) => r.status === "fulfilled").length === 1 && results.some((r) => r.status === "rejected" && String(r.reason).includes("input_version_changed"));
            details.winners = results.filter((r) => r.status === "fulfilled").length;
          } else {
            await commitDatasetTransaction(db, marker, baseline, () => void 0);
            const altered = structuredClone(marker);
            if (mode === "payload-conflict") altered.payloadDigest = "f".repeat(64);
            else {
              altered.recordId = commitIntentKey(marker.sessionId, "different-intent");
              altered.intentKey = altered.recordId;
              altered.idempotencyKey = "different-intent";
              altered.parentCommitId = marker.commitId;
              altered.revision = 2;
              altered.inputBindings = marker.outputBindings;
            }
            let rejection = "";
            try {
              await commitDatasetTransaction(db, altered, baseline, () => void 0);
            } catch (error) {
              rejection = error instanceof Error ? error.message : "";
            }
            passed = rejection === (mode === "payload-conflict" ? "idempotency_conflict" : "approval_consumed");
            details.rejection = rejection;
          }
        } else if (mode === "lost-ack") passed = first.status === "committed" && first.replay && first.acknowledgement === "installed";
        else if (mode === "unknown-reconcile" || mode === "unknown-abort-retry") {
          const originalRows = ((_e = f.root.getState().csvData) == null ? void 0 : _e.data.length) === 3, paused = f.root.getState().datasetCommitBindingStatus === "commit_unknown";
          const pending = await service.commit(approval);
          fault.failRead = false;
          const retry = await service.commit(approval);
          passed = first.status === "unknown" && pending.status === "unknown" && paused && originalRows && retry.status === "committed" && retry.replay === (mode === "unknown-reconcile");
          details.retry = retry.status;
        } else if (mode === "head-read-failure") {
          const blocked = f.root.getState().datasetCommitBindingStatus === "binding_failed";
          fault.failRead = false;
          const retry = await service.commit(approval);
          passed = first.status === "committed" && first.acknowledgement === "binding_failed" && blocked && retry.status === "committed" && retry.replay && retry.acknowledgement === "installed";
        } else if (mode === "stale-projections") {
          for (const id of [baseline.id, CURRENT_SESSION_KEY, "archive-synthetic"]) await writeReportProjection({ ...baseline, id }, db);
          const saved = await db.getAll("reports");
          passed = first.status === "committed" && saved.length === 3 && saved.every((r) => {
            var _a2, _b2, _c2;
            return ((_b2 = (_a2 = r.appState.datasetBundle) == null ? void 0 : _a2.acceptedCommit) == null ? void 0 : _b2.commitId) === ((_c2 = first.marker) == null ? void 0 : _c2.commitId) && r.appState.csvData === null && r.appState.rawCsvData === null;
          });
          details.reconciledRecords = saved.length;
        } else if (mode === "session-switch") {
          passed = first.status === "committed" && first.acknowledgement === "revoked" && f.root.getState().sessionId === "replacement" && ((_f = f.root.getState().activeExecution) == null ? void 0 : _f.runId) === "replacement-run" && f.root.getState().isBusy;
          await writeReportProjection(baseline, db);
          const archived = await db.get("reports", baseline.id);
          passed && (passed = ((_h = (_g = archived == null ? void 0 : archived.appState.datasetBundle) == null ? void 0 : _g.acceptedCommit) == null ? void 0 : _h.commitId) === ((_i = first.marker) == null ? void 0 : _i.commitId));
        } else if (mode === "binding-failure") passed = first.status === "committed" && first.acknowledgement === "binding_failed" && f.root.getState().datasetCommitBindingStatus === "binding_failed";
        else if (mode === "metadata-reopen") {
          db.close();
          const reopened = await openStorageDatabase(name);
          try {
            const marker = await readCommitIntent(reopened, f.lease.scope.sessionId, review.idempotencyKey), report = await reopened.get("reports", baseline.id);
            const restored = report && await reconcileReportCommit({ get: (key) => reopened.get(DATASET_COMMITS_STORE, key) }, report);
            passed = (marker == null ? void 0 : marker.commitId) === ((_j = first.marker) == null ? void 0 : _j.commitId) && (restored == null ? void 0 : restored.appState.csvData) === null && (restored == null ? void 0 : restored.appState.datasetCommitBindingStatus) === "awaiting_source";
            details.rowsRetained = false;
            details.authorityRestored = false;
          } finally {
            reopened.close();
          }
        }
        if (mode !== "metadata-reopen") {
          const records = await db.getAll(DATASET_COMMITS_STORE);
          details.journalRecords = records.length;
          passed && (passed = records.length === 2 && records.filter((r) => r.kind === "commit").length === 1 && records.filter((r) => r.kind === "head").length === 1);
        }
        passed && (passed = JSON.stringify(f.root.getState().rawCsvData) === original);
        const observation = { id: mode, passed: Boolean(passed), elapsedMs: Math.round(performance.now() - started), details };
        observations.push(observation);
        if (!signal.aborted) onObservation == null ? void 0 : onObservation(observation);
        if (!passed) break;
      } finally {
        signal.removeEventListener("abort", abort);
        f == null ? void 0 : f.cleanup();
        db.close();
        await deleteDB(name);
      }
    }
  } finally {
    signal.removeEventListener("abort", retire);
    client.retireSession();
  }
  return {
    passed: !signal.aborted && observations.length === modes.length && observations.every((c) => c.passed),
    observations,
    qualification: "CA-132 real IndexedDB and isolated QuickJS/DuckDB; public synthetic host executor fixture. Approval resume UI, durable rows/recovery and unfamiliar-model autonomy remain pending."
  };
};
const startCommitInterruptionProbe = async (name, onHeld) => {
  if (!/^csv-agent-ca132-close-[a-f0-9-]+$/.test(name)) throw new Error("qualification_database_invalid");
  const db = await openStorageDatabase(name), fixture = await prepareCandidateCommitFixture();
  const fault = { mode: "hold", onHeld };
  const service = createCandidateCommitService(fixture.store, { database: async () => withCommitStorageFault(db, fault), bind: async () => {
    throw new Error("must_not_bind");
  } });
  const review = await service.review(fixture.candidate.candidateId, { idempotencyKey: "interruption-intent", primaryTable: "facts" });
  void service.commit(service.approve(review));
  return { sessionId: fixture.lease.scope.sessionId, idempotencyKey: review.idempotencyKey };
};
export {
  qualifyCandidateCommit,
  startCommitInterruptionProbe,
  withCommitStorageFault
};
