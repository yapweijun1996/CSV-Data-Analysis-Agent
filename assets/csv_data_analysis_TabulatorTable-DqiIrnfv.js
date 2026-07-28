import { W as We, a as reactExports, j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { T as TabulatorFull } from "./csv_data_analysis_vendor-ui-DPkU1-1J.js";
import { U as getTranslation, aJ as formatAnalysisMeasureValue } from "./csv_data_analysis_app-agent-DytoEScF.js";
const TABULATOR_EVENT_TARGET_LOOKUP_WARNING = "Event Target Lookup Error - The row this cell is attached to cannot be found, has the table been reinitialized without being destroyed first?";
let applied$1 = false;
function applyTabulatorInteractionGuard() {
  if (applied$1) return;
  applied$1 = true;
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (typeof args[0] === "string" && args[0] === TABULATOR_EVENT_TARGET_LOOKUP_WARNING) {
      return;
    }
    originalWarn(...args);
  };
}
const GUARDED_PROPS = [
  { camel: "textAlign", css: "text-align" },
  { camel: "minHeight", css: "min-height" }
];
const GUARDED_CSS_PROPS = new Set(GUARDED_PROPS.map((prop) => prop.css));
let applied = false;
function findDescriptorOwner(prop) {
  const probe = document.createElement("div").style;
  let current = Object.getPrototypeOf(probe);
  while (current) {
    const desc = Object.getOwnPropertyDescriptor(current, prop);
    if (desc == null ? void 0 : desc.set) return [current, desc];
    current = Object.getPrototypeOf(current);
  }
  return null;
}
function findMethodDescriptorOwner(prop) {
  const probe = document.createElement("div").style;
  let current = Object.getPrototypeOf(probe);
  while (current) {
    const desc = Object.getOwnPropertyDescriptor(current, prop);
    if (typeof (desc == null ? void 0 : desc.value) === "function") return [current, desc];
    current = Object.getPrototypeOf(current);
  }
  return null;
}
const isInvalidCssValue = (cssProp, value) => {
  if (value == null || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return true;
    }
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
      try {
        return !CSS.supports(cssProp, String(value));
      } catch {
        return false;
      }
    }
    return false;
  }
  if (typeof value !== "string") {
    return true;
  }
  const normalized = value.trim();
  if (!normalized) {
    return true;
  }
  if (/\b(?:undefined|null|NaN)\b/i.test(normalized)) {
    return true;
  }
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    try {
      return !CSS.supports(cssProp, normalized);
    } catch {
      return false;
    }
  }
  return false;
};
function applyTabulatorStyleGuard() {
  if (applied) return;
  applied = true;
  const setPropertyOwner = findMethodDescriptorOwner("setProperty");
  if (setPropertyOwner) {
    const [proto, desc] = setPropertyOwner;
    const originalSetProperty = desc.value;
    Object.defineProperty(proto, "setProperty", {
      ...desc,
      value(property, value, priority) {
        if (GUARDED_CSS_PROPS.has(property) && isInvalidCssValue(property, value)) {
          this.removeProperty(property);
          return;
        }
        originalSetProperty.call(this, property, value, priority);
      }
    });
  }
  for (const { camel: camelProp, css: cssProp } of GUARDED_PROPS) {
    const found = findDescriptorOwner(camelProp);
    if (!found) continue;
    const [proto, desc] = found;
    const origSet = desc.set;
    Object.defineProperty(proto, camelProp, {
      ...desc,
      set(value) {
        if (isInvalidCssValue(cssProp, value)) {
          this.removeProperty(cssProp);
          return;
        }
        origSet.call(this, value);
      }
    });
  }
}
applyTabulatorStyleGuard();
applyTabulatorInteractionGuard();
const DEFAULT_EMPTY_STATE_KEY = "tabulator_empty_state";
const REMOTE_PAGINATION_THRESHOLD = 1e3;
const areSortStatesEqual = (left, right) => ((left == null ? void 0 : left.column) ?? null) === right.column && ((left == null ? void 0 : left.direction) ?? "asc") === right.direction;
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const getColumnLetter = (index) => {
  let nextIndex = index;
  let letter = "";
  while (nextIndex >= 0) {
    const remainder = nextIndex % 26;
    letter = String.fromCharCode(remainder + 65) + letter;
    nextIndex = Math.floor(nextIndex / 26) - 1;
  }
  return letter;
};
const calculateColumnWidth = (header, field, data) => {
  const headerLength = header.length * 8 + 30;
  const sampleLength = data.slice(0, 10).reduce((max, row) => {
    const value = row[field];
    return Math.max(max, String(value ?? "").length * 7);
  }, 0);
  return Math.max(120, headerLength, sampleLength);
};
const buildTabulatorLocale = (language) => ({
  pagination: {
    page_size: getTranslation("tabulator_page_size", language),
    page_title: getTranslation("tabulator_page_title", language),
    first: getTranslation("tabulator_first", language),
    first_title: getTranslation("tabulator_first_title", language),
    last: getTranslation("tabulator_last", language),
    last_title: getTranslation("tabulator_last_title", language),
    prev: getTranslation("tabulator_prev", language),
    prev_title: getTranslation("tabulator_prev_title", language),
    next: getTranslation("tabulator_next", language),
    next_title: getTranslation("tabulator_next_title", language),
    all: getTranslation("tabulator_all", language),
    counter: {
      showing: getTranslation("tabulator_showing", language),
      of: getTranslation("tabulator_of", language),
      rows: getTranslation("tabulator_rows", language),
      pages: getTranslation("tabulator_pages", language)
    }
  }
});
const localeKeyByLanguage = {
  English: "en",
  Mandarin: "zh-cn",
  Malay: "ms",
  Japanese: "ja"
};
const buildColumns = (columns, data, language, displayColumnLabels, annotatedColumns, measureColumns = []) => [
  {
    title: "#",
    formatter: (cell) => {
      const rowPosition = cell.getRow().getPosition(true);
      return rowPosition === false ? "" : String(rowPosition);
    },
    cssClass: "raw-data-tabulator__index-column",
    headerSort: false,
    resizable: false,
    frozen: true,
    hozAlign: "center",
    headerHozAlign: "center",
    width: 60,
    minWidth: 60,
    maxWidth: 60
  },
  ...columns.map((column, index) => {
    const displayLabel = (displayColumnLabels == null ? void 0 : displayColumnLabels[column]) ?? column;
    const badge = (annotatedColumns == null ? void 0 : annotatedColumns.has(column)) ? " ✏" : "";
    const isMeasure = measureColumns.includes(column);
    return {
      title: `${getColumnLetter(index)} - ${displayLabel}${badge}`,
      field: column,
      hozAlign: "left",
      headerHozAlign: "left",
      minWidth: 120,
      width: calculateColumnWidth(displayLabel, column, data),
      tooltip: (_event, cell) => {
        const rawValue = cell.getValue();
        return rawValue === null || rawValue === void 0 || String(rawValue).trim() === "" ? getTranslation("tabulator_blank_value", language) : String(rawValue);
      },
      formatter: (cell) => {
        const rawValue = cell.getValue();
        const isBlank = rawValue === null || rawValue === void 0 || String(rawValue).trim() === "";
        const displayValue = isBlank ? getTranslation("tabulator_blank_value", language) : isMeasure ? formatAnalysisMeasureValue(rawValue) : String(rawValue);
        const escapedValue = escapeHtml(displayValue);
        const blankClass = isBlank ? " text-slate-400 italic" : "";
        return `<span class="raw-data-tabulator__cell-value${blankClass}" title="${escapedValue}">${escapedValue}</span>`;
      }
    };
  })
];
const TabulatorTableInner = ({
  data,
  columns,
  displayColumnLabels,
  pageSize,
  tableKey,
  language,
  variant = "raw-explorer",
  pageSizeOptions,
  sortState,
  onSortChange,
  containerClassName,
  emptyStateText,
  measureColumns = [],
  annotatedColumns,
  onColumnHeaderClick
}) => {
  const resolvedEmptyStateText = emptyStateText ?? getTranslation(DEFAULT_EMPTY_STATE_KEY, language);
  const containerRef = reactExports.useRef(null);
  const tableRef = reactExports.useRef(null);
  const tableBuiltRef = reactExports.useRef(false);
  const sortStateRef = reactExports.useRef(sortState);
  const onSortChangeRef = reactExports.useRef(onSortChange);
  const onColumnHeaderClickRef = reactExports.useRef(onColumnHeaderClick);
  const hasColumns = columns.length > 0;
  const pageSizeOptionsKey = (pageSizeOptions == null ? void 0 : pageSizeOptions.join(",")) ?? "";
  const [isBuilding, setIsBuilding] = reactExports.useState(true);
  const columnDefinitions = reactExports.useMemo(
    () => buildColumns(columns, data, language, displayColumnLabels, annotatedColumns, measureColumns),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, data, language, displayColumnLabels, annotatedColumns == null ? void 0 : annotatedColumns.size, measureColumns.join("|")]
  );
  const columnSignature = reactExports.useMemo(
    () => columnDefinitions.map((definition) => `${String(definition.field ?? "")}:${String(definition.title ?? "")}`).join("|"),
    [columnDefinitions]
  );
  const latestDataRef = reactExports.useRef(data);
  const latestColumnDefinitionsRef = reactExports.useRef(columnDefinitions);
  const latestColumnSignatureRef = reactExports.useRef(columnSignature);
  const appliedColumnSignatureRef = reactExports.useRef(null);
  latestDataRef.current = data;
  latestColumnDefinitionsRef.current = columnDefinitions;
  latestColumnSignatureRef.current = columnSignature;
  const updateGenerationRef = reactExports.useRef(0);
  const useRemotePaginationRef = reactExports.useRef(false);
  const applyTableData = (table) => {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!table || !tableBuiltRef.current) {
      return;
    }
    const generation = ++updateGenerationRef.current;
    (_a = table.blockRedraw) == null ? void 0 : _a.call(table);
    try {
      if (appliedColumnSignatureRef.current !== latestColumnSignatureRef.current) {
        (_b = table.setColumns) == null ? void 0 : _b.call(table, latestColumnDefinitionsRef.current);
        appliedColumnSignatureRef.current = latestColumnSignatureRef.current;
      }
      if (useRemotePaginationRef.current) {
        latestDataRef.current = latestDataRef.current;
        (_c = table.setPage) == null ? void 0 : _c.call(table, 1);
        (_d = table.restoreRedraw) == null ? void 0 : _d.call(table);
        (_e = table.redraw) == null ? void 0 : _e.call(table, true);
        return;
      }
      const setDataResult = (_f = table.setData) == null ? void 0 : _f.call(table, latestDataRef.current);
      Promise.resolve(setDataResult).catch(() => void 0).finally(() => {
        var _a2, _b2;
        if (updateGenerationRef.current !== generation || tableRef.current !== table || !tableBuiltRef.current) {
          return;
        }
        (_a2 = table.restoreRedraw) == null ? void 0 : _a2.call(table);
        (_b2 = table.redraw) == null ? void 0 : _b2.call(table, true);
      });
    } catch (error) {
      (_g = table.restoreRedraw) == null ? void 0 : _g.call(table);
      throw error;
    }
  };
  const applySortState = (table) => {
    var _a, _b, _c, _d, _e;
    if (!table || !tableBuiltRef.current) {
      return;
    }
    const currentSorter = (_b = (_a = table.getSorters) == null ? void 0 : _a.call(table)) == null ? void 0 : _b[0];
    const currentState = (currentSorter == null ? void 0 : currentSorter.field) && (currentSorter.dir === "asc" || currentSorter.dir === "desc") ? { column: currentSorter.field, direction: currentSorter.dir } : { column: null, direction: "asc" };
    if (areSortStatesEqual(sortStateRef.current, currentState)) {
      return;
    }
    if ((_c = sortStateRef.current) == null ? void 0 : _c.column) {
      (_d = table.setSort) == null ? void 0 : _d.call(table, sortStateRef.current.column, sortStateRef.current.direction);
      return;
    }
    (_e = table.clearSort) == null ? void 0 : _e.call(table);
  };
  reactExports.useEffect(() => {
    sortStateRef.current = sortState;
  }, [sortState]);
  reactExports.useEffect(() => {
    onSortChangeRef.current = onSortChange;
  }, [onSortChange]);
  reactExports.useEffect(() => {
    onColumnHeaderClickRef.current = onColumnHeaderClick;
  }, [onColumnHeaderClick]);
  reactExports.useEffect(() => {
    const containerElement = containerRef.current;
    if (!hasColumns || !containerElement) {
      return void 0;
    }
    setIsBuilding(true);
    let buildTimerId = null;
    const frameId = requestAnimationFrame(() => {
      buildTimerId = setTimeout(() => {
        var _a;
        const localeKey = localeKeyByLanguage[language];
        const initialSort = ((_a = sortStateRef.current) == null ? void 0 : _a.column) ? [{ column: sortStateRef.current.column, dir: sortStateRef.current.direction }] : false;
        tableBuiltRef.current = false;
        const isRemote = data.length >= REMOTE_PAGINATION_THRESHOLD;
        useRemotePaginationRef.current = isRemote;
        const table = new TabulatorFull(containerElement, {
          data: isRemote ? [] : data,
          columns: columnDefinitions,
          nestedFieldSeparator: false,
          columnDefaults: { hozAlign: "left", headerHozAlign: "left" },
          layout: "fitDataTable",
          layoutColumnsOnNewData: false,
          height: "100%",
          placeholder: resolvedEmptyStateText,
          pagination: true,
          paginationMode: isRemote ? "remote" : "local",
          paginationSize: pageSize,
          paginationSizeSelector: pageSizeOptions && pageSizeOptions.length > 0 ? pageSizeOptions : false,
          paginationCounter: "rows",
          ...isRemote ? {
            ajaxURL: "local://in-memory",
            ajaxRequestFunc: (_url, _config, params) => {
              const { page, size, sorters } = params;
              let rows = latestDataRef.current;
              if (sorters == null ? void 0 : sorters[0]) {
                const { field, dir } = sorters[0];
                rows = [...rows].sort((a, b) => {
                  const va = String(a[field] ?? "");
                  const vb = String(b[field] ?? "");
                  return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
                });
              }
              const start = (page - 1) * size;
              return Promise.resolve({
                data: rows.slice(start, start + size),
                last_page: Math.ceil(rows.length / size)
              });
            }
          } : {},
          initialSort,
          columnHeaderSortMulti: false,
          selectableRows: 1,
          selectableRowsPersistence: false,
          langs: {
            [localeKey]: buildTabulatorLocale(language)
          },
          locale: localeKey,
          rowClick: (_event, row) => {
            row.toggleSelect();
          }
        });
        tableRef.current = table;
        appliedColumnSignatureRef.current = columnSignature;
        table.on("tableBuilt", () => {
          if (tableRef.current !== table) {
            return;
          }
          tableBuiltRef.current = true;
          setIsBuilding(false);
          applyTableData(table);
          applySortState(table);
        });
        if (onSortChangeRef.current) {
          table.on("dataSorted", (sorters) => {
            var _a2, _b;
            const primarySorter = Array.isArray(sorters) ? sorters[0] : void 0;
            if ((primarySorter == null ? void 0 : primarySorter.field) && (primarySorter.dir === "asc" || primarySorter.dir === "desc")) {
              const nextState2 = { column: primarySorter.field, direction: primarySorter.dir };
              if (!areSortStatesEqual(sortStateRef.current, nextState2)) {
                (_a2 = onSortChangeRef.current) == null ? void 0 : _a2.call(onSortChangeRef, nextState2);
              }
              return;
            }
            const nextState = { column: null, direction: "asc" };
            if (!areSortStatesEqual(sortStateRef.current, nextState)) {
              (_b = onSortChangeRef.current) == null ? void 0 : _b.call(onSortChangeRef, nextState);
            }
          });
        }
        table.on("headerDblClick", (_e, column) => {
          var _a2, _b;
          const field = (_a2 = column.getField) == null ? void 0 : _a2.call(column);
          const element = (_b = column.getElement) == null ? void 0 : _b.call(column);
          if (field && element && onColumnHeaderClickRef.current) {
            onColumnHeaderClickRef.current(field, element.getBoundingClientRect());
          }
        });
      }, 0);
    });
    return () => {
      cancelAnimationFrame(frameId);
      if (buildTimerId !== null) clearTimeout(buildTimerId);
      updateGenerationRef.current += 1;
      tableBuiltRef.current = false;
      appliedColumnSignatureRef.current = null;
      if (tableRef.current) {
        tableRef.current.destroy();
        tableRef.current = null;
      }
      containerElement.innerHTML = "";
    };
  }, [
    resolvedEmptyStateText,
    hasColumns,
    language,
    pageSize,
    pageSizeOptionsKey,
    tableKey
  ]);
  reactExports.useEffect(() => {
    const table = tableRef.current;
    if (!table) {
      return;
    }
    applyTableData(table);
  }, [columnDefinitions, data]);
  reactExports.useEffect(() => {
    const table = tableRef.current;
    applySortState(table);
  }, [sortState]);
  if (columns.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-500", children: resolvedEmptyStateText });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `raw-data-tabulator tabulator-table--${variant} h-full w-full ${containerClassName ?? ""}`.trim(), children: [
    isBuilding && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-sm text-slate-400", children: getTranslation("loading_table", language) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        ref: containerRef,
        className: "h-full w-full",
        style: isBuilding ? { visibility: "hidden", position: "absolute" } : void 0
      },
      tableKey ?? "tabulator-root"
    )
  ] });
};
const tabulatorPropsAreEqual = (prev, next) => {
  var _a, _b, _c, _d;
  if (prev.data === next.data && prev.columns === next.columns && prev.displayColumnLabels === next.displayColumnLabels && prev.pageSize === next.pageSize && prev.tableKey === next.tableKey && prev.language === next.language && prev.variant === next.variant && prev.emptyStateText === next.emptyStateText && prev.sortState === next.sortState && prev.annotatedColumns === next.annotatedColumns && prev.pageSizeOptions === next.pageSizeOptions && prev.onSortChange === next.onSortChange && prev.onColumnHeaderClick === next.onColumnHeaderClick && prev.containerClassName === next.containerClassName) {
    return true;
  }
  if (prev.pageSize !== next.pageSize || prev.tableKey !== next.tableKey || prev.language !== next.language || prev.variant !== next.variant || prev.emptyStateText !== next.emptyStateText || prev.containerClassName !== next.containerClassName || prev.displayColumnLabels !== next.displayColumnLabels || prev.annotatedColumns !== next.annotatedColumns || prev.onSortChange !== next.onSortChange || prev.onColumnHeaderClick !== next.onColumnHeaderClick || (((_a = prev.pageSizeOptions) == null ? void 0 : _a.join(",")) ?? "") !== (((_b = next.pageSizeOptions) == null ? void 0 : _b.join(",")) ?? "") || !areSortStatesEqual(prev.sortState, {
    column: ((_c = next.sortState) == null ? void 0 : _c.column) ?? null,
    direction: ((_d = next.sortState) == null ? void 0 : _d.direction) ?? "asc"
  })) {
    return false;
  }
  if (prev.data !== next.data) {
    if (prev.data.length !== next.data.length) return false;
    if (prev.data.length > 0 && (prev.data[0] !== next.data[0] || prev.data[prev.data.length - 1] !== next.data[next.data.length - 1])) return false;
  }
  if (prev.columns !== next.columns) {
    if (prev.columns.length !== next.columns.length) return false;
    if (prev.columns.join(",") !== next.columns.join(",")) return false;
  }
  return true;
};
const TabulatorTable = We.memo(TabulatorTableInner, tabulatorPropsAreEqual);
export {
  TabulatorTable as T
};
