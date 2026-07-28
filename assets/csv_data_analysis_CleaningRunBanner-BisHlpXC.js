import { j as jsxRuntimeExports, a as reactExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { U as getTranslation } from "./csv_data_analysis_app-agent-DytoEScF.js";
import { I as IconInsights } from "./csv_data_analysis_IconInsights-miXHhJGo.js";
const formatNumber = (n) => Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(void 0, { maximumFractionDigits: 2 });
const formatCell = (value) => {
  if (value == null) return "";
  if (typeof value === "number") return formatNumber(value);
  return String(value);
};
const isNumericValue = (value) => {
  if (value == null) return false;
  if (typeof value === "number") return !Number.isNaN(value);
  const str = String(value).trim().replace(/[$€£¥,()%]/g, "").trim();
  return str !== "" && !Number.isNaN(Number(str));
};
const parseNumeric = (value) => {
  if (typeof value === "number") return value;
  const str = String(value ?? "").trim().replace(/[$€£¥,()%]/g, "").trim();
  return Number(str) || 0;
};
const MAX_TABLE_ROWS = 30;
const MAX_TABLE_COLS = 10;
const MAX_PIVOT_COLS = 15;
const MAX_PIVOT_ROWS = 20;
const detectColumns = (rows) => {
  const allCols = rows[0] ? Object.keys(rows[0]) : [];
  const sample = rows.slice(0, 20);
  const numeric = allCols.filter((col) => {
    const numCount = sample.filter((row) => isNumericValue(row[col])).length;
    return numCount >= sample.length * 0.5;
  });
  const categorical = allCols.filter((col) => !numeric.includes(col));
  return { allCols, numeric, categorical };
};
const computeAggregation = (rows, groupByCol, valueCol, agg) => {
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = String(row[groupByCol] ?? "");
    if (!key) continue;
    const entry = groups.get(key) ?? { sum: 0, count: 0 };
    const val = parseNumeric(row[valueCol]);
    entry.sum += val;
    entry.count += 1;
    groups.set(key, entry);
  }
  const result = [];
  let grandTotal = 0;
  for (const [key, entry] of groups) {
    const value = agg === "count" ? entry.count : agg === "avg" ? entry.count > 0 ? entry.sum / entry.count : 0 : entry.sum;
    result.push({ [groupByCol]: key, [valueCol]: Math.round(value * 100) / 100 });
    grandTotal += value;
  }
  result.sort((a, b) => parseNumeric(b[valueCol]) - parseNumeric(a[valueCol]));
  return { rows: result.slice(0, 20), total: Math.round(grandTotal * 100) / 100 };
};
const tryParseDate = (value) => {
  const trimmed = value.trim();
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(trimmed)) {
    const d = new Date(trimmed.replace(/\//g, "-"));
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const d = /* @__PURE__ */ new Date(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
};
const smartSort = (values) => {
  if (values.length === 0) return values;
  const dateAttempts = values.map((v) => ({ v, ts: tryParseDate(v) }));
  const dateCount = dateAttempts.filter((a) => a.ts !== null).length;
  if (dateCount >= values.length * 0.6) {
    return dateAttempts.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)).map((a) => a.v);
  }
  return values.sort((a, b) => a.localeCompare(b));
};
const computePivotAggregation = (rows, rowCol, pivotCol, valueCol, agg) => {
  const groups = /* @__PURE__ */ new Map();
  const pivotValuesSet = /* @__PURE__ */ new Set();
  for (const row of rows) {
    const rk = String(row[rowCol] ?? "");
    const pk = String(row[pivotCol] ?? "");
    if (!rk || !pk) continue;
    pivotValuesSet.add(pk);
    if (!groups.has(rk)) groups.set(rk, /* @__PURE__ */ new Map());
    const inner = groups.get(rk);
    const entry = inner.get(pk) ?? { sum: 0, count: 0 };
    entry.sum += parseNumeric(row[valueCol]);
    entry.count += 1;
    inner.set(pk, entry);
  }
  const pivotColumns = smartSort([...pivotValuesSet]).slice(0, MAX_PIVOT_COLS);
  const aggValue = (e) => {
    if (!e) return 0;
    if (agg === "count") return e.count;
    if (agg === "avg") return e.count > 0 ? e.sum / e.count : 0;
    return e.sum;
  };
  const round2 = (n) => Math.round(n * 100) / 100;
  const resultRows = [];
  const columnTotals = {};
  for (const pc of pivotColumns) columnTotals[pc] = 0;
  columnTotals["Total"] = 0;
  for (const [rk, inner] of groups) {
    const row = { [rowCol]: rk };
    let rowTotal = 0;
    for (const pc of pivotColumns) {
      const val = round2(aggValue(inner.get(pc)));
      row[pc] = val;
      rowTotal += val;
      columnTotals[pc] += val;
    }
    row["Total"] = round2(rowTotal);
    columnTotals["Total"] += rowTotal;
    resultRows.push(row);
  }
  resultRows.sort((a, b) => {
    const ak = String(a[rowCol] ?? "");
    const bk = String(b[rowCol] ?? "");
    return ak.localeCompare(bk);
  });
  for (const k of Object.keys(columnTotals)) columnTotals[k] = round2(columnTotals[k]);
  return {
    pivotColumns,
    rows: resultRows.slice(0, MAX_PIVOT_ROWS),
    columnTotals,
    grandTotal: columnTotals["Total"],
    rowCol
  };
};
const DataTable = ({ rows, maxRows = MAX_TABLE_ROWS, highlightCols, totalRow }) => {
  if (rows.length === 0) return null;
  const displayRows = rows.slice(0, maxRows);
  const allCols = Object.keys(rows[0] ?? {});
  const cols = allCols.slice(0, MAX_TABLE_COLS);
  const truncatedCols = allCols.length > MAX_TABLE_COLS;
  const truncatedRows = rows.length > maxRows;
  const highlightSet = new Set(highlightCols ?? []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overflow-x-auto rounded-lg border border-slate-200", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "bg-slate-50", children: [
        cols.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: `whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold ${highlightSet.has(c) ? "text-violet-700 bg-violet-50" : "text-slate-600"}`, children: c.length > 24 ? `${c.slice(0, 22)}…` : c }, c)),
        truncatedCols && /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "border-b border-slate-200 px-3 py-2 text-left text-slate-400", children: "…" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
        displayRows.map((row, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: `${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-blue-50/40`, children: [
          cols.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: `whitespace-nowrap border-b border-slate-100 px-3 py-1.5 ${highlightSet.has(c) ? "font-medium text-violet-800" : "text-slate-700"}`, children: formatCell(row[c]) }, c)),
          truncatedCols && /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "border-b border-slate-100 px-3 py-1.5 text-slate-400", children: "…" })
        ] }, i)),
        totalRow && /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "bg-emerald-50 font-semibold", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: totalRow.colSpan, className: "border-t-2 border-emerald-200 px-3 py-2 text-right text-emerald-800", children: totalRow.label }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: cols.length - totalRow.colSpan + (truncatedCols ? 1 : 0), className: "border-t-2 border-emerald-200 px-3 py-2 text-emerald-800", children: totalRow.value })
        ] })
      ] })
    ] }),
    truncatedRows && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-center text-[11px] text-slate-400", children: [
      "… ",
      rows.length - maxRows,
      " more rows"
    ] })
  ] });
};
const PivotTableView = ({ pivot, language }) => {
  const totalLabel = getTranslation("provenance_step3_total_label", language);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto rounded-lg border border-slate-200", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-xs", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "bg-slate-50", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold text-violet-700 bg-violet-50", children: pivot.rowCol }),
      pivot.pivotColumns.map((pc) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "whitespace-nowrap border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-600", children: pc.length > 16 ? `${pc.slice(0, 14)}…` : pc }, pc)),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "whitespace-nowrap border-b border-slate-200 px-3 py-2 text-right font-bold text-emerald-700 bg-emerald-50", children: totalLabel })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: pivot.rows.map((row, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: `${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-blue-50/40`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "whitespace-nowrap border-b border-slate-100 px-3 py-1.5 font-medium text-violet-800", children: formatCell(row[pivot.rowCol]) }),
      pivot.pivotColumns.map((pc) => /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "whitespace-nowrap border-b border-slate-100 px-3 py-1.5 text-right text-slate-700", children: formatNumber(parseNumeric(row[pc])) }, pc)),
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "whitespace-nowrap border-b border-slate-100 px-3 py-1.5 text-right font-semibold text-emerald-800 bg-emerald-50/50", children: formatNumber(parseNumeric(row["Total"])) })
    ] }, i)) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("tfoot", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "bg-emerald-50 font-semibold", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "border-t-2 border-emerald-200 px-3 py-2 text-right text-emerald-800", children: totalLabel }),
      pivot.pivotColumns.map((pc) => /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "border-t-2 border-emerald-200 px-3 py-2 text-right text-emerald-800", children: formatNumber(pivot.columnTotals[pc] ?? 0) }, pc)),
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "border-t-2 border-emerald-300 px-3 py-2 text-right font-bold text-emerald-900 bg-emerald-100", children: formatNumber(pivot.grandTotal) })
    ] }) })
  ] }) });
};
const GroupByTest = ({ rows, language, accentColor, onRequestCard }) => {
  const [groupBy, setGroupBy] = reactExports.useState("");
  const [pivotBy, setPivotBy] = reactExports.useState("");
  const [valueCol, setValueCol] = reactExports.useState("");
  const [agg, setAgg] = reactExports.useState("sum");
  const { numeric, categorical } = reactExports.useMemo(() => detectColumns(rows), [rows]);
  const flatResult = reactExports.useMemo(() => {
    if (pivotBy || !groupBy || !valueCol) return null;
    return computeAggregation(rows, groupBy, valueCol, agg);
  }, [rows, groupBy, valueCol, agg, pivotBy]);
  const pivotResult = reactExports.useMemo(() => {
    if (!pivotBy || !groupBy || !valueCol) return null;
    return computePivotAggregation(rows, groupBy, pivotBy, valueCol, agg);
  }, [rows, groupBy, pivotBy, valueCol, agg]);
  const pivotOptions = reactExports.useMemo(
    () => categorical.filter((col) => col !== groupBy),
    [categorical, groupBy]
  );
  const t = (key, params) => getTranslation(key, language, params);
  const totalValue = (pivotResult == null ? void 0 : pivotResult.grandTotal) ?? (flatResult == null ? void 0 : flatResult.total) ?? 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex flex-wrap items-end gap-3 rounded-lg border p-3 border-${accentColor}-200 bg-${accentColor}-50/30`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs font-semibold text-slate-600", children: t("provenance_step3_group_by_label") }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: groupBy, onChange: (e) => {
          setGroupBy(e.target.value);
          if (e.target.value === pivotBy) setPivotBy("");
        }, className: "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "—" }),
          categorical.map((col) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: col, children: col }, col))
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs font-semibold text-slate-600", children: t("provenance_pivot_by_label") }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: pivotBy, onChange: (e) => setPivotBy(e.target.value), disabled: !groupBy, className: "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 disabled:opacity-40", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: t("provenance_pivot_none") }),
          pivotOptions.map((col) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: col, children: col }, col))
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs font-semibold text-slate-600", children: t("provenance_step3_agg_label") }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: agg, onChange: (e) => setAgg(e.target.value), className: "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "sum", children: "SUM" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "count", children: "COUNT" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "avg", children: "AVG" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs font-semibold text-slate-600", children: t("provenance_step3_value_label") }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: valueCol, onChange: (e) => setValueCol(e.target.value), className: "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "—" }),
          numeric.map((col) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: col, children: col }, col))
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-0 flex-1 overflow-auto", children: pivotResult ? /* @__PURE__ */ jsxRuntimeExports.jsx(PivotTableView, { pivot: pivotResult, language }) : flatResult ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      DataTable,
      {
        rows: flatResult.rows,
        maxRows: 30,
        highlightCols: [groupBy, valueCol],
        totalRow: { label: t("provenance_step3_total_label"), value: formatNumber(flatResult.total), colSpan: 1 }
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-32 items-center justify-center text-sm text-slate-400", children: t("provenance_step3_no_numeric_cols") }) }),
    (flatResult || pivotResult) && groupBy && valueCol && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(IconInsights, { className: "mt-0.5 h-4 w-4 shrink-0", "aria-hidden": "true" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-1 items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: pivotBy ? t("provenance_pivot_excel_hint", { group: groupBy, pivot: pivotBy, agg: agg.toUpperCase(), value: valueCol }) : t("provenance_step3_try_excel", { hint: `${agg.toUpperCase()}IF(${groupBy}, "…", ${valueCol}) = ${formatNumber(totalValue)}` }) }),
        onRequestCard && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              const dataRows = (flatResult == null ? void 0 : flatResult.rows) ?? (pivotResult == null ? void 0 : pivotResult.rows) ?? [];
              const previewLines = dataRows.slice(0, 5).map(
                (r) => `${String(r[groupBy] ?? "?")}: ${formatNumber(parseNumeric(r[valueCol]))}`
              ).join(", ");
              const filterNote = `IMPORTANT: The user is viewing a filtered subset of the data. The precomputed results below are the ground truth for this card — do NOT re-query the full dataset. Use these exact figures in your response: ${dataRows.length} groups, total=${formatNumber(totalValue)}. Breakdown: ${previewLines}.`;
              const cardDesc = pivotBy ? `Create a new analysis card: pivot table with rows=${groupBy}, columns=${pivotBy}, values=${agg.toUpperCase()}(${valueCol}). ${filterNote}` : `Create a new analysis card: ${agg.toUpperCase()}(${valueCol}) grouped by ${groupBy}. ${filterNote}`;
              onRequestCard(cardDesc, dataRows);
            },
            className: "shrink-0 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors",
            children: t("groupby_create_card")
          }
        )
      ] })
    ] })
  ] });
};
const ViewModeToggle = ({ isGroupBy, onToggle, language }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "inline-flex gap-1 rounded-lg bg-slate-100 p-0.5", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      type: "button",
      onClick: () => onToggle(false),
      className: `rounded-md px-3 py-1 text-xs font-medium transition-colors ${!isGroupBy ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`,
      children: getTranslation("provenance_view_data", language)
    }
  ),
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      type: "button",
      onClick: () => onToggle(true),
      className: `rounded-md px-3 py-1 text-xs font-medium transition-colors ${isGroupBy ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`,
      children: getTranslation("provenance_view_group_by", language)
    }
  )
] });
const messageByStatus = {
  idle: "Dataset cleaning is ready to continue. Choose whether to resume from the saved step or restart from the beginning.",
  running: "Dataset cleaning is currently running. Wait for it to finish before relying on analysis results.",
  paused: "Dataset cleaning is paused. Continue from the last saved step or restart from the beginning.",
  failed: "Dataset cleaning stopped after an error. Continue from the last saved step or restart from the beginning.",
  completed: "Dataset cleaning is complete."
};
const CleaningRunBanner = ({
  cleaningRun,
  onContinue,
  onRestart,
  variant = "analysis",
  sqlPrecheck = null,
  onInspectFinding
}) => {
  const hasSqlPrecheckAttention = cleaningRun.status === "completed" && ((sqlPrecheck == null ? void 0 : sqlPrecheck.status) === "warning" || (sqlPrecheck == null ? void 0 : sqlPrecheck.status) === "blocked");
  if (cleaningRun.status === "completed" && !hasSqlPrecheckAttention) {
    return null;
  }
  const isRunning = cleaningRun.status === "running";
  const visibleFindings = hasSqlPrecheckAttention ? ((sqlPrecheck == null ? void 0 : sqlPrecheck.findings) ?? []).filter((finding) => finding.severity === "block" || finding.severity === "warn").slice(0, 3) : [];
  const containerClassName = variant === "spreadsheet" ? "rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" : "mb-4 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: containerClassName, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 md:flex-row md:items-center md:justify-between", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: hasSqlPrecheckAttention ? sqlPrecheck == null ? void 0 : sqlPrecheck.summary : cleaningRun.userFacingMessage ?? messageByStatus[cleaningRun.status] }),
      !hasSqlPrecheckAttention && cleaningRun.actionTakenMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-amber-950/90", children: cleaningRun.actionTakenMessage }),
      !hasSqlPrecheckAttention && cleaningRun.dataSafetyMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-amber-950/90", children: cleaningRun.dataSafetyMessage }),
      !hasSqlPrecheckAttention && cleaningRun.nextStateMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-amber-950/90", children: cleaningRun.nextStateMessage }),
      !hasSqlPrecheckAttention && cleaningRun.technicalDetail && /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "rounded-md border border-amber-200 bg-white/70 p-2 text-xs text-amber-950/90", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer font-medium text-amber-900", children: "Technical detail" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 whitespace-pre-wrap break-words font-mono", children: cleaningRun.technicalDetail })
      ] }),
      visibleFindings.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-2 text-xs text-amber-950/90", children: visibleFindings.map((finding, index) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex flex-col gap-2 md:flex-row md:items-start md:justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: finding.message }),
        onInspectFinding && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => onInspectFinding(finding),
            className: "self-start rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-100",
            children: "Inspect"
          }
        )
      ] }, `${finding.kind}-${finding.metric ?? finding.column ?? finding.dimension ?? index}`)) })
    ] }),
    !isRunning && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
      !hasSqlPrecheckAttention && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onContinue,
          className: "rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700",
          children: "Continue cleaning"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onRestart,
          className: "rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100",
          children: hasSqlPrecheckAttention ? "Restart cleaning from prepared dataset" : "Restart cleaning"
        }
      )
    ] })
  ] }) });
};
export {
  CleaningRunBanner as C,
  DataTable as D,
  GroupByTest as G,
  ViewModeToggle as V,
  formatNumber as f
};
