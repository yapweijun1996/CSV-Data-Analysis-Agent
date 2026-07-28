import { a as reactExports, j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { u as useAppStore, d as useDialogAccessibility } from "./csv_data_analysis_index-L92MBGHW.js";
import { U as getTranslation } from "./csv_data_analysis_app-agent-DytoEScF.js";
import "./csv_data_analysis_vendor-state-LvY-J6mW.js";
import "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
const MAX_PREVIEW_COLS = 7;
const MAX_BODY_PREVIEW_ROWS = 4;
const ReportBoundaryConfirmModal = () => {
  const isOpen = useAppStore((s) => s.isReportBoundaryConfirmModalOpen);
  const setModalOpen = useAppStore((s) => s.setIsReportBoundaryConfirmModalOpen);
  const reportStructureResolution = useAppStore((s) => s.reportStructureResolution);
  const rawIntakeIr = useAppStore((s) => s.rawIntakeIr);
  const saveReportStructureBoundaryOverride = useAppStore((s) => s.saveReportStructureBoundaryOverride);
  const isBusy = useAppStore((s) => s.isBusy);
  const language = useAppStore((s) => s.settings.language);
  const pipelineOutcome = useAppStore((s) => s.pipelineOutcome);
  const cleaningRun = useAppStore((s) => s.cleaningRun);
  const columnProfiles = useAppStore((s) => s.columnProfiles);
  const userColumnAnnotations = useAppStore((s) => s.userColumnAnnotations);
  const setColumnAnnotation = useAppStore((s) => s.setColumnAnnotation);
  const [bodyStart, setBodyStart] = reactExports.useState(0);
  const [summaryStart, setSummaryStart] = reactExports.useState(null);
  const [confirming, setConfirming] = reactExports.useState(false);
  const t = (key, params) => getTranslation(key, language, params);
  const handleClose = reactExports.useCallback(() => {
    if (!confirming && !isBusy) setModalOpen(false);
  }, [confirming, isBusy, setModalOpen]);
  const dialogRef = useDialogAccessibility(isOpen, handleClose);
  reactExports.useEffect(() => {
    if (isOpen && reportStructureResolution) {
      setBodyStart(reportStructureResolution.bodyStartIndex ?? 0);
      setSummaryStart(reportStructureResolution.summaryStartIndex ?? null);
      setConfirming(false);
    }
  }, [isOpen, reportStructureResolution]);
  if (!isOpen || !reportStructureResolution) return null;
  const rows = (rawIntakeIr == null ? void 0 : rawIntakeIr.normalizedRows) ?? [];
  const totalRows = rows.length;
  const headerLayerIdxs = reportStructureResolution.headerLayerRowIndexes;
  const headerDepth = headerLayerIdxs.length || 1;
  const previewRows = [];
  const headerIdxSet = new Set(headerLayerIdxs);
  for (const idx of headerLayerIdxs) {
    if (rows[idx]) previewRows.push({ rowIndex: idx, role: "header", cells: rows[idx] });
  }
  const bStart = Math.max(0, Math.min(bodyStart, totalRows - 1));
  for (let i = bStart; i < Math.min(bStart + MAX_BODY_PREVIEW_ROWS, totalRows); i++) {
    if (rows[i] && !headerIdxSet.has(i)) previewRows.push({ rowIndex: i, role: "body", cells: rows[i] });
  }
  if (summaryStart !== null) {
    for (let i = summaryStart; i < Math.min(summaryStart + 2, totalRows); i++) {
      if (rows[i] && !headerIdxSet.has(i)) previewRows.push({ rowIndex: i, role: "summary", cells: rows[i] });
    }
  }
  const effectiveSummaryStart = summaryStart !== null ? summaryStart : null;
  const dataRowCount = effectiveSummaryStart !== null ? Math.max(0, effectiveSummaryStart - bStart) : Math.max(0, totalRows - bStart);
  const triggerConfirm = async () => {
    if (confirming) return;
    setConfirming(true);
    const boundary = {
      headerRowIndex: reportStructureResolution.headerRowIndex,
      headerLayerRowIndexes: reportStructureResolution.headerLayerRowIndexes,
      bodyStartIndex: bStart,
      summaryStartIndex: effectiveSummaryStart,
      parameterRowIndexes: reportStructureResolution.parameterRowIndexes,
      repeatedHeaderRowIndexes: reportStructureResolution.repeatedHeaderRowIndexes
    };
    try {
      await saveReportStructureBoundaryOverride(boundary);
    } catch (err) {
      console.error("[BoundaryConfirm] save failed:", err);
    } finally {
      setConfirming(false);
    }
  };
  const updateColumnRole = (columnName, businessRole) => {
    const existing = userColumnAnnotations[columnName];
    setColumnAnnotation({
      columnName,
      businessLabel: (existing == null ? void 0 : existing.businessLabel) || columnName,
      description: (existing == null ? void 0 : existing.description) || "",
      businessRole
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4",
      onClick: handleClose,
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          ref: dialogRef,
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "boundary-confirm-title",
          "aria-describedby": "boundary-confirm-desc",
          tabIndex: -1,
          onClick: (e) => e.stopPropagation(),
          className: "bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] outline-none",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 py-4 border-b border-slate-200 flex-shrink-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "boundary-confirm-title", className: "text-base font-semibold text-slate-800", children: t("guided_repair_title") }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { id: "boundary-confirm-desc", className: "text-sm text-slate-500 mt-0.5", children: t("guided_repair_description") })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 py-4 overflow-y-auto flex-1 space-y-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-lg border border-amber-200 bg-amber-50 p-4", "aria-label": t("guided_repair_safety_summary"), children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-amber-950", children: t("guided_repair_safety_summary") }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "mt-3 grid gap-3 text-sm sm:grid-cols-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-700", children: t("guided_repair_detected") }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "mt-1 text-slate-600", children: reportStructureResolution.decision.reason })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-700", children: t("guided_repair_why_blocked") }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "mt-1 text-slate-600", children: (pipelineOutcome == null ? void 0 : pipelineOutcome.message) ?? t("guided_repair_default_block_reason") })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-700", children: t("guided_repair_attempted") }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "mt-1 text-slate-600", children: (cleaningRun == null ? void 0 : cleaningRun.loopCount) ? t("guided_repair_attempt_count", { count: cleaningRun.loopCount }) : t("guided_repair_inspection_only") })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-700", children: t("guided_repair_required") }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "mt-1 text-slate-600", children: t("guided_repair_required_action") })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-blue-50 rounded-lg p-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-blue-600 font-medium mb-0.5", children: t("boundary_confirm_header_depth") }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-semibold text-blue-800", children: t("boundary_confirm_header_depth_unit", { count: headerDepth }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-blue-500", children: t("boundary_confirm_header_rows_label", { rows: headerLayerIdxs.map((i) => i + 1).join(", ") }) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-green-50 rounded-lg p-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-green-600 font-medium mb-0.5", children: t("boundary_confirm_data_rows") }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-semibold text-green-800", children: dataRowCount }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-green-500", children: t("boundary_confirm_data_rows_from", { row: bStart + 1 }) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-amber-50 rounded-lg p-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-amber-600 font-medium mb-0.5", children: t("boundary_confirm_summary_rows") }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-semibold text-amber-800", children: effectiveSummaryStart !== null ? totalRows - effectiveSummaryStart : 0 }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-amber-500", children: effectiveSummaryStart !== null ? t("boundary_confirm_summary_rows_from", { row: effectiveSummaryStart + 1 }) : t("boundary_confirm_no_summary") })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-lg border border-slate-200 bg-slate-50 p-4", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-slate-900", children: t("guided_repair_field_roles") }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-slate-600", children: t("guided_repair_field_roles_hint") }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 max-h-56 space-y-2 overflow-y-auto pr-1", children: columnProfiles.slice(0, 24).map((profile) => {
                  var _a;
                  return /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "grid grid-cols-[minmax(0,1fr)_auto_minmax(9rem,auto)] items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "min-w-0 truncate font-medium text-slate-800", title: profile.name, children: profile.name }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded bg-slate-100 px-2 py-1 text-xs text-slate-600", children: profile.type }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "select",
                      {
                        value: ((_a = userColumnAnnotations[profile.name]) == null ? void 0 : _a.businessRole) ?? "",
                        onChange: (event) => updateColumnRole(
                          profile.name,
                          event.target.value || void 0
                        ),
                        className: "min-h-[44px] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 md:min-h-0",
                        "aria-label": t("guided_repair_field_role_label", { column: profile.name }),
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: t("column_annotation_role_unspecified") }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "dimension", children: t("column_annotation_role_dimension") }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "metric", children: t("column_annotation_role_metric") }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "identifier", children: t("column_annotation_role_identifier") }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "helper", children: t("column_annotation_role_helper") })
                        ]
                      }
                    )
                  ] }, profile.name);
                }) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs font-medium text-slate-600 mb-1", children: [
                    t("boundary_confirm_body_start_label"),
                    " ",
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-400", children: t("boundary_confirm_body_start_hint") })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "input",
                    {
                      type: "number",
                      min: 1,
                      max: totalRows,
                      value: bStart + 1,
                      onChange: (e) => {
                        const parsed = parseInt(e.target.value, 10);
                        if (Number.isNaN(parsed)) return;
                        const v = Math.max(0, parsed - 1);
                        setBodyStart(v);
                        if (summaryStart !== null && summaryStart <= v) {
                          setSummaryStart(v + 1 < totalRows ? v + 1 : null);
                        }
                      },
                      className: "w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs font-medium text-slate-600 mb-1", children: [
                    t("boundary_confirm_summary_start_label"),
                    " ",
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-400", children: t("boundary_confirm_summary_start_hint") })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "input",
                    {
                      type: "number",
                      min: bStart + 2,
                      max: totalRows,
                      value: summaryStart !== null ? summaryStart + 1 : "",
                      placeholder: t("boundary_confirm_no_summary"),
                      onChange: (e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          setSummaryStart(null);
                          return;
                        }
                        const parsed = parseInt(raw, 10);
                        if (Number.isNaN(parsed)) return;
                        setSummaryStart(Math.max(bStart + 1, parsed - 1));
                      },
                      className: "w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    }
                  )
                ] })
              ] }),
              previewRows.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border border-slate-200 rounded-lg overflow-hidden", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-medium text-slate-500 bg-slate-50 px-3 py-2 border-b border-slate-200", children: t("boundary_confirm_preview_label") }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto max-h-60", children: /* @__PURE__ */ jsxRuntimeExports.jsx("table", { className: "w-full text-xs border-collapse", children: /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: previewRows.map(({ rowIndex, role, cells }) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "tr",
                  {
                    className: role === "header" ? "bg-blue-50" : role === "summary" ? "bg-amber-50" : "bg-white even:bg-slate-50",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-2 py-1 text-slate-400 border-r border-slate-200 w-10 text-right font-mono", children: rowIndex + 1 }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-2 py-1 border-r border-slate-200 w-12 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${role === "header" ? "bg-blue-100 text-blue-700" : role === "summary" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`, children: role === "header" ? t("boundary_confirm_role_header") : role === "summary" ? t("boundary_confirm_role_summary") : t("boundary_confirm_role_data") }) }),
                      cells.slice(0, MAX_PREVIEW_COLS).map((cell, ci) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "td",
                        {
                          className: `px-2 py-1 border-r border-slate-100 max-w-[110px] truncate ${role === "header" ? "font-medium text-blue-800" : "text-slate-600"}`,
                          title: cell,
                          children: cell || ""
                        },
                        ci
                      )),
                      cells.length > MAX_PREVIEW_COLS && /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-2 py-1 text-slate-400 whitespace-nowrap", children: [
                        "+",
                        cells.length - MAX_PREVIEW_COLS
                      ] })
                    ]
                  },
                  rowIndex
                )) }) }) })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 flex-shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setModalOpen(false),
                  disabled: confirming || isBusy,
                  title: t("boundary_confirm_cancel_hint"),
                  className: "px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50",
                  children: t("boundary_confirm_cancel")
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => void triggerConfirm(),
                  disabled: confirming || isBusy,
                  className: "px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2",
                  children: confirming ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" }),
                    t("boundary_confirm_processing")
                  ] }) : t("boundary_confirm_button")
                }
              )
            ] }) })
          ]
        }
      )
    }
  );
};
export {
  ReportBoundaryConfirmModal
};
