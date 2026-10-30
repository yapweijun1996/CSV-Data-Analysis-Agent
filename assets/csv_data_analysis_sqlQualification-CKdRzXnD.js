import { ee as compileQueryPlanToDuckDbSql, ef as DuckDbWorkerClient, eg as compileUnpivotToDuckDbSql, eh as SQL_LIMITS } from "./csv_data_analysis_app-agent-CCgesa_7.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import "./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js";
import "./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js";
import "./csv_data_analysis_vendor-ai-google-DYdleeb9.js";
import "./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js";
const qualifySqlWorker = async (signal, report) => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const checks = [];
  let onStarted;
  const client = new DuckDbWorkerClient(() => onStarted == null ? void 0 : onStarted());
  const abort = () => client.retireSession();
  signal.addEventListener("abort", abort, { once: true });
  const record = (id, passed, details) => {
    const check = { id, passed, details };
    checks.push(check);
    if (!signal.aborted) report == null ? void 0 : report(check);
    if (!passed) throw new Error("sql_qualification_failed");
  };
  let binding = { tableName: "session_clean_dataset", loadVersion: `sql-lab-${crypto.randomUUID()}` };
  const load = async (csvText) => {
    await client.initDuckDb(45e3, signal);
    return client.loadCleanDataset({ ...binding, csvText, csvFileName: "synthetic-sql-lab.csv" }, 45e3, signal);
  };
  const raw = (sql, limit = 500, expectedBinding = binding, abortSignal = signal) => client.executeRawQuery({ sql, selectedColumns: [], limit, expectedBinding }, 1e4, abortSignal);
  try {
    if (signal.aborted) throw new Error("sql_cancelled");
    const loaded = await load("Region,Amount\nA,2\nB,3\nA,5");
    record("locked-pinned-profile", ((_a = loaded.sqlSecurity) == null ? void 0 : _a.locked) === true && ((_b = loaded.sqlSecurity) == null ? void 0 : _b.engineVersion) === "v1.4.4", { proof: loaded.sqlSecurity });
    const cte = await raw("WITH q(x) AS (SELECT TRY_CAST(Amount AS DOUBLE) FROM session_clean_dataset) SELECT SUM(x) n FROM q");
    record("cte-current-binding", Number((_c = cte.rows[0]) == null ? void 0 : _c.n) === 10, { boundary: cte.executionBoundary, rows: cte.rows });
    const compiled = compileQueryPlanToDuckDbSql(
      { aggregates: [{ function: "sum", column: "Amount", as: "total" }], limit: 500 },
      { allowedColumns: ["Region", "Amount"], tableName: binding.tableName }
    );
    const structured = await client.executeCompiledQuery({ ...compiled, expectedBinding: binding }, 1e4, signal);
    record("structured-query-compatible", Number((_d = structured.rows[0]) == null ? void 0 : _d.total) === 10 && ((_e = structured.executionBoundary) == null ? void 0 : _e.diagnostic) === false);
    const unpivotSql = compileUnpivotToDuckDbSql(
      { sourceColumns: ["Amount"], nameAs: "metric", valueAs: "total", aggregate: "sum" },
      { tableName: binding.tableName, allowedColumns: ["Region", "Amount"] }
    );
    const unpivot = await raw(unpivotSql.sql);
    record("app-unpivot-compatible", Number((_f = unpivot.rows[0]) == null ? void 0 : _f.total) === 10);
    const limited = await raw("SELECT * FROM session_clean_dataset ORDER BY Amount", 1);
    record(
      "honest-truncation",
      limited.rows.length === 1 && limited.totalMatchedRows === 3 && limited.truncated,
      { returnedRows: limited.returnedRows, totalMatchedRows: limited.totalMatchedRows, truncated: limited.truncated }
    );
    const forbidden = [
      "SELECT 1; DELETE FROM session_clean_dataset",
      "SELECT * FROM read_csv('https://example.invalid/data.csv')",
      "SELECT * FROM read_text('/private/synthetic')",
      "SELECT * FROM glob('/private/*')",
      "INSTALL httpfs",
      "LOAD httpfs",
      "ATTACH 'other.db'",
      "COPY session_clean_dataset TO 'out.csv'",
      "SET enable_external_access=true",
      "SELECT * FROM query('DELETE FROM session_clean_dataset RETURNING *')",
      "SELECT * FROM information_schema.tables",
      "SELECT * FROM another_session",
      "UNPIVOT session_clean_dataset ON Amount INTO NAME metric VALUE value"
    ];
    let rejected = 0;
    for (const sql of forbidden) {
      try {
        await raw(sql);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("sql_")) rejected++;
        else throw error;
      }
    }
    record("access-write-refusals", rejected === forbidden.length, { attempted: forbidden.length, rejected });
    let outputRefused = false;
    try {
      await raw(`SELECT repeat('x', ${SQL_LIMITS.resultBytes + 1}) AS large`);
    } catch (error) {
      outputRefused = error.message === "sql_result_bytes_exceeded";
    }
    record("output-byte-ceiling", outputRefused);
    const oldBinding = binding;
    binding = { ...binding, loadVersion: `sql-lab-${crypto.randomUUID()}` };
    await load("Region,Amount\nC,7");
    let oldRefused = false;
    try {
      await raw("SELECT * FROM session_clean_dataset", 500, oldBinding);
    } catch (error) {
      oldRefused = error.message === "sql_binding_mismatch";
    }
    const current = await raw("SELECT TRY_CAST(Amount AS DOUBLE) n FROM session_clean_dataset");
    record("replacement-binding", oldRefused && Number((_g = current.rows[0]) == null ? void 0 : _g.n) === 7, { boundary: current.executionBoundary });
    const stop = new AbortController();
    let started = false, cancelledAt = 0;
    let timer;
    onStarted = () => {
      if (started) return;
      started = true;
      timer = setTimeout(() => {
        cancelledAt = performance.now();
        stop.abort();
      }, 50);
    };
    let cancelled = false;
    try {
      await raw("SELECT SUM(sin(a.range + b.range)) n FROM range(1000000) a CROSS JOIN range(1000000) b", 500, binding, stop.signal);
    } catch {
      cancelled = stop.signal.aborted;
    } finally {
      clearTimeout(timer);
      onStarted = void 0;
    }
    const stopMs = cancelledAt ? Math.round(performance.now() - cancelledAt) : null;
    record("owned-cpu-stop", started && cancelled && stopMs !== null && stopMs < 3e3, { started, cancelled, stopMs });
    const recovery = await raw("SELECT TRY_CAST(Amount AS DOUBLE) n FROM session_clean_dataset");
    record("same-client-stop-recovery", Number((_h = recovery.rows[0]) == null ? void 0 : _h.n) === 7 && ((_i = recovery.executionBoundary) == null ? void 0 : _i.locked) === true);
    return {
      passed: !signal.aborted && checks.length === 10 && checks.every((check) => check.passed),
      checks,
      qualification: "Pinned real DuckDB worker/client; synthetic local SQL; no provider, facts admission or complete-profile claim"
    };
  } finally {
    signal.removeEventListener("abort", abort);
    client.retireSession();
  }
};
export {
  qualifySqlWorker
};
