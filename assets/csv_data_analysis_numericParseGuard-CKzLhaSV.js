import { eA as executeManagedDataQuery, eB as isIdentifierHeader, eC as buildColumnNumberParser, eD as isMissingCellValue, eE as buildSemanticDatasetVersion } from "./csv_data_analysis_app-agent-CCgesa_7.js";
import { eF } from "./csv_data_analysis_app-agent-CCgesa_7.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import "./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js";
import "./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js";
import "./csv_data_analysis_vendor-ai-google-DYdleeb9.js";
import "./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js";
const MAX_CHECKED_CELLS = 4e6;
const AGGREGATE_CHUNK_COLUMNS = 20;
const RELATIVE_TOLERANCE = 1e-6;
const ABSOLUTE_TOLERANCE = 1e-6;
const MIN_NUMERIC_SHARE = 0.5;
const PIPELINE_COLUMN_PATTERN = /^(sourcerowindex|hierarchydepth|rowrole|resolvedrowrole|rowclass|sectionlabel|headerpath|carryforwardappliedcolumns|sourcecolumnname)$/i;
const isClose = (left, right) => {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <= RELATIVE_TOLERANCE * Math.max(Math.abs(left), Math.abs(right)) + ABSOLUTE_TOLERANCE;
};
const medianOf = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const isBlank = (value) => value === null || value === void 0 || typeof value === "string" && value.trim() === "";
const buildSkipped = (datasetVersion, note, startedAt) => ({
  datasetVersion,
  status: "skipped",
  checkedColumns: [],
  findings: [],
  note,
  durationMs: Math.round(performance.now() - startedAt)
});
const reconcileNumericColumns = async (input) => {
  const startedAt = performance.now();
  const { datasetVersion, sourceRows, loadedRows } = input;
  if (sourceRows.length === 0 || loadedRows.length === 0) {
    return buildSkipped(datasetVersion, "No rows to compare.", startedAt);
  }
  if (sourceRows.length !== loadedRows.length) {
    return buildSkipped(
      datasetVersion,
      `Row counts differ (original ${sourceRows.length}, loaded ${loadedRows.length}), so the columns cannot be compared row for row.`,
      startedAt
    );
  }
  const loadedColumns = new Set(Object.keys(loadedRows[0] ?? {}));
  const candidateColumns = Object.keys(sourceRows[0] ?? {}).filter((column) => loadedColumns.has(column) && !PIPELINE_COLUMN_PATTERN.test(column) && !isIdentifierHeader(column));
  if (candidateColumns.length * sourceRows.length > MAX_CHECKED_CELLS) {
    return buildSkipped(datasetVersion, "The dataset is too large for the numeric parse check.", startedAt);
  }
  const parse = buildColumnNumberParser(sourceRows, candidateColumns);
  const source = /* @__PURE__ */ new Map();
  for (const column of candidateColumns) {
    let present = 0;
    let sum = 0;
    const values = [];
    for (const row of sourceRows) {
      const cell = row[column];
      if (isBlank(cell) || isMissingCellValue(cell)) continue;
      present += 1;
      const parsed = typeof cell === "number" ? Number.isFinite(cell) ? cell : null : parse(column, cell);
      if (parsed === null) continue;
      sum += parsed;
      values.push(parsed);
    }
    if (values.length > 0 && values.length / present >= MIN_NUMERIC_SHARE) {
      source.set(column, { sum, median: medianOf(values) });
    }
  }
  const measureColumns = [...source.keys()];
  if (measureColumns.length === 0) {
    return { datasetVersion, status: "passed", checkedColumns: [], findings: [], note: null, durationMs: Math.round(performance.now() - startedAt) };
  }
  const loaded = await input.readLoadedAggregates(measureColumns);
  if (!loaded) {
    return buildSkipped(datasetVersion, "The query engine was not available for the numeric parse check.", startedAt);
  }
  const findings = [];
  for (const column of measureColumns) {
    const original = source.get(column);
    const actual = loaded.get(column);
    if (!actual) continue;
    const ratio = actual.sum !== null && original.sum !== 0 ? actual.sum / original.sum : null;
    const base = {
      column,
      sourceSum: original.sum,
      loadedSum: actual.sum,
      ratio,
      sourceMedian: original.median,
      loadedMedian: actual.median
    };
    if (!isClose(original.sum, actual.sum)) findings.push({ ...base, kind: "sum" });
    else if (!isClose(original.median, actual.median)) findings.push({ ...base, kind: "median" });
  }
  return {
    datasetVersion,
    status: findings.length > 0 ? "mismatch" : "passed",
    checkedColumns: measureColumns,
    findings,
    note: null,
    durationMs: Math.round(performance.now() - startedAt)
  };
};
const createQueryEngineAggregateReader = (dataset, columnRegistry) => async (columns) => {
  const allowedColumns = Object.keys(dataset.data[0] ?? {});
  const result = /* @__PURE__ */ new Map();
  for (let start = 0; start < columns.length; start += AGGREGATE_CHUNK_COLUMNS) {
    const chunk = columns.slice(start, start + AGGREGATE_CHUNK_COLUMNS);
    const plan = {
      aggregates: chunk.flatMap((column, index) => [
        { function: "sum", column, as: `numeric_check_sum_${start + index}` },
        { function: "median", column, as: `numeric_check_median_${start + index}` }
      ]),
      limit: 1
    };
    const execution = await executeManagedDataQuery(dataset, plan, allowedColumns, {
      allowNativeFallback: false,
      columnRegistry: columnRegistry ?? null
    });
    if (execution.engine !== "duckdb") return null;
    const row = execution.result.rows[0] ?? {};
    const toNumber = (value) => value === null || value === void 0 ? null : Number.isFinite(Number(value)) ? Number(value) : null;
    chunk.forEach((column, index) => {
      result.set(column, {
        sum: toNumber(row[`numeric_check_sum_${start + index}`]),
        median: toNumber(row[`numeric_check_median_${start + index}`])
      });
    });
  }
  return result;
};
const runNumericParseCheck = async (store, dataset) => {
  var _a;
  try {
    const datasetVersion = buildSemanticDatasetVersion(dataset);
    const existing = store.getState().numericParseCheck;
    if (existing && existing.datasetVersion === datasetVersion && existing.status !== "skipped") return existing;
    const startedAt = performance.now();
    const rawCsvData = store.getState().rawCsvData;
    const check = ((_a = dataset.backing) == null ? void 0 : _a.mode) === "duckdb_file" ? buildSkipped(datasetVersion, "Large files are loaded through a preview path and are not compared with the original text.", startedAt) : !rawCsvData ? buildSkipped(datasetVersion, "The original imported rows are not available.", startedAt) : await reconcileNumericColumns({
      datasetVersion,
      sourceRows: rawCsvData.data,
      loadedRows: dataset.data,
      readLoadedAggregates: createQueryEngineAggregateReader(dataset, store.getState().columnRegistry)
    });
    store.setState({ numericParseCheck: check });
    if (check.status === "mismatch") {
      console.warn("[NumericParseGuard] numeric columns do not reconcile with the original text:", check.findings);
    }
    return check;
  } catch (error) {
    console.warn("[NumericParseGuard] check failed, continuing without it.", error);
    return null;
  }
};
export {
  createQueryEngineAggregateReader,
  eF as findNumericParseMismatches,
  reconcileNumericColumns,
  runNumericParseCheck
};
