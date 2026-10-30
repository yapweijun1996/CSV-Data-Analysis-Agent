import { a as reactExports, j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import { u as useAppStore, e as useDialogAccessibility, C as CsvSourceScanPanel } from "./csv_data_analysis_index-x-Z1054W.js";
import { dY as resolveEffectiveSummaryStartIndex, cJ as getStructureReviewReasonText, dZ as countSummaryContentRows, a8 as getPipelineOutcomeUserText, ad as getTranslation } from "./csv_data_analysis_app-agent-CCgesa_7.js";
import { f as formatSetAsideRowCounts } from "./csv_data_analysis_setAsideTables-D5GptSrp.js";
import "./csv_data_analysis_vendor-state-CMf1uPe1.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import "./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js";
import "./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js";
import "./csv_data_analysis_vendor-ai-google-DYdleeb9.js";
import "./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js";
const MAX_SAMPLED_VALUES = 500;
const PLACEHOLDER_NAME = /^_?unnamed(?:_column)?(?:_\d+)?$/i;
const IDENTIFIER_NAME = /(?:^|[^a-z])(?:id|code|no|num|number|ref|reference|sku|uuid|#)(?:[^a-z]|$)/i;
const PERIOD_NAME = /(?:^|[^a-z])(?:year|yr|fy|fiscal|period|month|quarter|qtr)(?:[^a-z]|$)/i;
const MONTH_NAMES = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
const DATE_VALUE_PATTERNS = [
  /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ t]\d{1,2}:\d{2}(?::\d{2})?)?$/i,
  /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/,
  /^\d{4}[-/]\d{1,2}$/,
  new RegExp(`^\\d{1,2}[ -]${MONTH_NAMES}[ -]\\d{2,4}$`, "i"),
  new RegExp(`^${MONTH_NAMES}[ -]\\d{2,4}$`, "i"),
  new RegExp(`^\\d{4}[ -]?${MONTH_NAMES}$`, "i")
];
const CODE_LIKE_VALUE = /^(?:[A-Za-z]{1,6}[-_]?\d{2,}|\d{4,}|[A-Z]{2,}(?:[-_][A-Z0-9]+)+)$/;
const isDateValue = (value) => DATE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
const mapSemanticRole = (role) => {
  switch (role) {
    case "metric":
      return "metric";
    case "date":
    case "time_dimension":
    case "business_dimension":
    case "business_entity":
    case "entity":
    case "label":
      return "dimension";
    case "code":
      return "identifier";
    case "helper_dimension":
    case "descriptor":
    case "note":
      return "helper";
    default:
      return null;
  }
};
const sampleValues = (rows, column) => {
  const values = [];
  for (const row of rows) {
    const raw = row[column];
    const text = raw === null || raw === void 0 ? "" : String(raw).trim();
    if (text) values.push(text);
    if (values.length >= MAX_SAMPLED_VALUES) break;
  }
  return values;
};
const suggestForColumn = (profile, values, semantic) => {
  if (PLACEHOLDER_NAME.test(profile.name.trim())) return null;
  const semanticRole = semantic && semantic.confidence >= 0.6 ? mapSemanticRole(semantic.semanticRole) : null;
  if (semanticRole) return semanticRole;
  const distinct = new Set(values.map((value) => value.toLowerCase())).size;
  const distinctRatio = values.length > 0 ? distinct / values.length : 0;
  const hasSample = values.length >= 2;
  if (hasSample && IDENTIFIER_NAME.test(profile.name) && distinctRatio >= 0.6) return "identifier";
  if (profile.type === "date" || profile.type === "time") return "dimension";
  if (profile.type === "numerical" || profile.type === "currency" || profile.type === "percentage") {
    const looksLikeYear = hasSample && PERIOD_NAME.test(profile.name) && values.every((value) => /^(?:19|20)\d{2}$/.test(value));
    return looksLikeYear ? "dimension" : "metric";
  }
  if (!hasSample) return null;
  const dateShare = values.filter(isDateValue).length / values.length;
  if (dateShare >= 0.8) return "dimension";
  if (distinct <= 30 || distinctRatio <= 0.5) return "dimension";
  const averageLength = values.reduce((sum, value) => sum + value.length, 0) / values.length;
  if (averageLength > 40) return "helper";
  const codeShare = values.filter((value) => CODE_LIKE_VALUE.test(value)).length / values.length;
  if (distinctRatio >= 0.9 && codeShare >= 0.6) return "identifier";
  return null;
};
const suggestColumnRoles = (params) => {
  const semanticByName = new Map((params.semanticAnnotations ?? []).map((annotation) => [annotation.columnName, annotation]));
  const result = {};
  for (const profile of params.profiles) {
    result[profile.name] = suggestForColumn(
      profile,
      sampleValues(params.rows ?? [], profile.name),
      semanticByName.get(profile.name)
    );
  }
  return result;
};
const reviewConsumers = /* @__PURE__ */ new WeakMap();
const StructureRepairReviewPanel = () => {
  const review = useAppStore((s) => s.structureRepairReview);
  const intake = useAppStore((s) => s.rawIntakeIr);
  const sessionId = useAppStore((s) => s.sessionId);
  const sourceSha = useAppStore((s) => {
    var _a, _b;
    return (_b = (_a = s.datasetBundle) == null ? void 0 : _a.source.inspection) == null ? void 0 : _b.sha256;
  });
  const intakeKey = JSON.stringify([intake == null ? void 0 : intake.columnCount, intake == null ? void 0 : intake.rawRows]);
  const prepare = useAppStore((s) => s.prepareStructureRepairReview);
  const confirm = useAppStore((s) => s.confirmStructureRepairMeaning);
  const resume = useAppStore((s) => s.resumeStructureRepairDraft);
  const continueRepair = useAppStore((s) => s.continueStructureRepairAnalysis);
  const cancel = useAppStore((s) => s.cancelStructureRepairReview);
  const [error, setError] = reactExports.useState("");
  const [pending, setPending] = reactExports.useState(false);
  reactExports.useEffect(() => {
    let active = true;
    let id;
    const consumer = Symbol("structure-review-consumer");
    if (prepare) reviewConsumers.set(prepare, consumer);
    const cancelOwnedReview = () => {
      if (!prepare || !id || reviewConsumers.get(prepare) !== consumer) return;
      cancel == null ? void 0 : cancel(id, true);
      reviewConsumers.delete(prepare);
    };
    setError("");
    void (prepare == null ? void 0 : prepare().then((result) => {
      id = result == null ? void 0 : result.reviewId;
      if (!active) cancelOwnedReview();
    }).catch(() => {
      if (active) setError("Bound source review unavailable. Re-upload the original or corrected source; analysis remains blocked.");
    }));
    return () => {
      active = false;
      cancelOwnedReview();
    };
  }, [prepare, cancel, intakeKey, sessionId, sourceSha]);
  const act = async (action) => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await action();
    } catch {
      setError("Review is stale, cancelled or already used. Re-open review from the current source. No dataset was committed.");
    } finally {
      setPending(false);
    }
  };
  if (!review && !error) return null;
  const current = (review == null ? void 0 : review.sessionId) === sessionId && (review == null ? void 0 : review.sourceSha256) === sourceSha;
  const waiting = current && (review == null ? void 0 : review.status) === "awaiting_semantic_confirmation";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { "aria-label": "Structural semantic confirmation", className: "rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-blue-950", children: "Confirm business meaning — not Dataset Commit approval" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-700", children: "This choice confirms only which repeated header group owns the expanded metric columns. Other fields, row grain, units and summary roles still require a separate complete meaning review." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-700", children: current ? review == null ? void 0 : review.message : "Source/session changed. Re-open review to inspect the current source." }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "text-sm text-red-800", children: error }),
    current && review && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "text-xs break-all", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { children: "Source binding" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          "Raw bytes SHA-256 / source version: ",
          review.sourceSha256
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          "Session: ",
          review.sessionId,
          " / epoch ",
          review.sessionEpoch
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          "Candidate set: ",
          review.candidateSetDigest
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: review.choices.map((choice) => {
        const c = choice.candidate;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded border border-blue-200 bg-white p-3 text-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "font-medium", children: [
            "Candidate ",
            choice.label,
            ": categories belong to header group at source columns ",
            c.mainStartColumn + 1,
            "–",
            c.mainStartColumn + c.groupCount
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
            "Expanded data columns ",
            c.mainStartColumn + 1,
            "–",
            c.mainEndColumn,
            "; ",
            c.groupCount,
            " groups × ",
            c.groupWidth,
            " categories. Header source rows ",
            c.headerSourceRows.map((r) => r + 1).join(", "),
            "."
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("summary", { className: "cursor-pointer", children: [
              "Inspect mapping and source sample values (",
              choice.label,
              ")"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-auto max-h-56", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "text-xs w-full", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { children: "Data column" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { children: "Header evidence (row:column)" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { children: "Source samples (not validated)" })
              ] }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: c.mappings.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { children: [
                  m.targetColumn + 1,
                  (m.targetColumn < c.mainStartColumn || m.targetColumn >= c.mainEndColumn) && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-slate-500", children: "Structural suggestion — not confirmed here" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { children: m.headerPath.map((ref) => {
                  var _a;
                  return `${((_a = intake == null ? void 0 : intake.rawRows[ref.rowIndex]) == null ? void 0 : _a[ref.columnIndex]) ?? ""} [${ref.rowIndex + 1}:${ref.columnIndex + 1}]`;
                }).join(" → ") }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { children: intake == null ? void 0 : intake.rawRows.slice(c.bodySourceRows.start, Math.min(c.bodySourceRows.endExclusive, c.bodySourceRows.start + 3)).map((row) => row[m.targetColumn]).join(" | ") })
              ] }, m.targetColumn)) })
            ] }) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { disabled: !waiting || pending, onClick: () => void act(() => confirm(review.reviewId, choice.candidateDigest, { review, intakeSignature: intakeKey })), className: "mt-2 rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50", children: [
            "Choose ",
            choice.label,
            " — confirm meaning"
          ] })
        ] }, choice.candidateDigest);
      }) }),
      review.status === "repair_blocked" && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "text-sm text-amber-900", children: "Repair cannot safely resume in this session. There is no pending approval to click. Keep the source and diagnostic details; no automatic retry or budget reset will be performed." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { disabled: !waiting || pending, onClick: () => void act(() => confirm(review.reviewId, "neither", { review, intakeSignature: intakeKey })), className: "rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50", children: "Neither / Correct mapping" }),
        review.status === "confirmed" && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { disabled: pending, onClick: () => void act(() => resume(review.reviewId)), className: "rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50", children: "Resume read-only mapping draft" }),
        ["confirmed", "draft_uncommitted", "repair_failed"].includes(review.status) && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { disabled: pending, onClick: () => void act(() => continueRepair(review.reviewId, { review, intakeSignature: intakeKey })), className: "rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50", children: "Continue repair and validation" }),
        review.status !== "repair_blocked" && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { disabled: pending && review.status !== "continuing", onClick: () => cancel(review.reviewId), className: "rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50", children: "Cancel semantic review" })
      ] }),
      review.draft && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { "aria-label": "Read-only mapping draft", className: "rounded border border-amber-300 bg-amber-50 p-3 text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "font-semibold", children: "Draft / Uncommitted — not validated" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          review.draft.totalSourceRows,
          " structurally proposed source rows; showing ",
          review.draft.rows.length,
          ". No totals or business grain are asserted."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-auto max-h-56", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "text-xs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { children: "Source row" }),
            review.draft.columns.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs("th", { children: [
              c.headerPath.map((p) => p.value).join(" → "),
              " [",
              c.targetColumn + 1,
              "]"
            ] }, c.targetColumn))
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: review.draft.rows.map((row) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { children: row.sourceRow + 1 }),
            row.cells.map((value, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("td", { children: value }, i))
          ] }, row.sourceRow)) })
        ] }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium text-slate-700", children: (review == null ? void 0 : review.status) === "repair_blocked" ? "You may close this review. Its diagnostic state is preserved; reopening does not restart repair or approve a dataset." : "Header confirmation and preview do not approve a dataset. Continue repair for full validation, then review a separate exact Dataset Commit in Assistant." })
  ] });
};
const ROLE_OPTIONS = [
  { value: "dimension", labelKey: "review_role_option_dimension" },
  { value: "metric", labelKey: "review_role_option_metric" },
  { value: "identifier", labelKey: "review_role_option_identifier" },
  { value: "helper", labelKey: "review_role_option_helper" }
];
const MAX_PREVIEW_COLS = 7;
const MAX_BODY_PREVIEW_ROWS = 4;
const ReportBoundaryConfirmModal = () => {
  var _a, _b, _c;
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
  const csvData = useAppStore((s) => s.csvData);
  const semanticSnapshot = useAppStore((s) => s.datasetSemanticSnapshot);
  const repairReview = useAppStore((s) => s.structureRepairReview);
  const semanticReviewRequired = ((_a = rawIntakeIr == null ? void 0 : rawIntakeIr.diagnostics) == null ? void 0 : _a.headerShapeDrift) === true || (pipelineOutcome == null ? void 0 : pipelineOutcome.reasonCode) === "header_shape_drift" || Boolean(repairReview);
  const repairRequired = semanticReviewRequired || (pipelineOutcome == null ? void 0 : pipelineOutcome.reasonCode) === "source_scan_anomalies";
  const [bodyStart, setBodyStart] = reactExports.useState(0);
  const [summaryStart, setSummaryStart] = reactExports.useState(null);
  const [confirming, setConfirming] = reactExports.useState(false);
  const [declinedSuggestions, setDeclinedSuggestions] = reactExports.useState(/* @__PURE__ */ new Set());
  const [canScrollMore, setCanScrollMore] = reactExports.useState(false);
  const scrollRef = reactExports.useRef(null);
  const roleSuggestions = reactExports.useMemo(() => suggestColumnRoles({
    profiles: columnProfiles ?? [],
    rows: csvData == null ? void 0 : csvData.data,
    semanticAnnotations: semanticSnapshot == null ? void 0 : semanticSnapshot.columnAnnotations
  }), [columnProfiles, csvData, semanticSnapshot]);
  const updateScrollCue = reactExports.useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    setCanScrollMore(element.scrollHeight - element.scrollTop - element.clientHeight > 8);
  }, []);
  reactExports.useEffect(() => {
    updateScrollCue();
  });
  reactExports.useEffect(() => {
    if (!isOpen) return void 0;
    window.addEventListener("resize", updateScrollCue);
    return () => window.removeEventListener("resize", updateScrollCue);
  }, [isOpen, updateScrollCue]);
  const t = (key, params) => getTranslation(key, language, params);
  const handleClose = reactExports.useCallback(() => {
    if (!confirming && !isBusy) setModalOpen(false);
  }, [confirming, isBusy, setModalOpen]);
  const dialogRef = useDialogAccessibility(isOpen, handleClose);
  reactExports.useEffect(() => {
    if (isOpen && reportStructureResolution) {
      setBodyStart(reportStructureResolution.bodyStartIndex ?? 0);
      setSummaryStart(resolveEffectiveSummaryStartIndex(
        (rawIntakeIr == null ? void 0 : rawIntakeIr.normalizedRows) ?? [],
        reportStructureResolution.summaryStartIndex
      ));
      setConfirming(false);
      setDeclinedSuggestions(/* @__PURE__ */ new Set());
    }
  }, [isOpen, reportStructureResolution, rawIntakeIr]);
  if (!isOpen) return null;
  if (!reportStructureResolution || repairRequired) return rawIntakeIr ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4", onClick: handleClose, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: dialogRef,
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "repair-review-title",
      tabIndex: -1,
      onClick: (event) => event.stopPropagation(),
      className: "bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-6 space-y-4",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "repair-review-title", className: "text-base font-semibold", children: reportStructureResolution ? t("guided_repair_title") : "Review structural interpretations" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CsvSourceScanPanel, {}),
        semanticReviewRequired && /* @__PURE__ */ jsxRuntimeExports.jsx(StructureRepairReviewPanel, {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-amber-950", children: "Boundary confirmation cannot approve structural repair. Full validation and separate exact Dataset Commit approval remain required." }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: handleClose, className: "rounded border px-4 py-2 text-sm", children: "Cancel" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { disabled: true, className: "rounded bg-blue-600 px-4 py-2 text-sm text-white opacity-50", children: t("boundary_confirm_button") })
        ] })
      ]
    }
  ) }) : null;
  const rows = (rawIntakeIr == null ? void 0 : rawIntakeIr.normalizedRows) ?? [];
  const totalRows = rows.length;
  const headerLayerIdxs = reportStructureResolution.headerLayerRowIndexes;
  const headerDepth = headerLayerIdxs.length || 1;
  const structureReviewPending = (pipelineOutcome == null ? void 0 : pipelineOutcome.status) === "needs_structure_review" || reportStructureResolution.requiresHumanReview === true;
  const blockingReasonCodes = reportStructureResolution.blockingReasons ?? [];
  const reasonCodes = blockingReasonCodes.length > 0 ? blockingReasonCodes : structureReviewPending && (pipelineOutcome == null ? void 0 : pipelineOutcome.reasonCode) ? [pipelineOutcome.reasonCode] : [];
  const reasonTexts = Array.from(new Set(reasonCodes.map((code) => getStructureReviewReasonText(code, language))));
  const technicalMessages = Array.from(new Set(
    [(_b = reportStructureResolution.decision) == null ? void 0 : _b.reason, pipelineOutcome == null ? void 0 : pipelineOutcome.message].filter((message) => Boolean(message))
  ));
  const effectiveSummaryStart = summaryStart !== null && summaryStart < totalRows ? summaryStart : null;
  const sections = ((_c = rawIntakeIr == null ? void 0 : rawIntakeIr.diagnostics) == null ? void 0 : _c.setAsideSections) ?? [];
  const analysedRowsEnd = sections.reduce((end, section) => Math.min(end, section.rowStart), totalRows);
  const setAsideSections = effectiveSummaryStart === null ? [] : sections.filter((section) => section.rowStart >= effectiveSummaryStart);
  const previewRows = [];
  const headerIdxSet = new Set(headerLayerIdxs);
  for (const idx of headerIdxSet) {
    if (rows[idx]) previewRows.push({ rowIndex: idx, role: "header", cells: rows[idx] });
  }
  const bStart = Math.max(0, Math.min(bodyStart, Math.max(0, totalRows - 1)));
  const bodyEnd = Math.min(effectiveSummaryStart ?? totalRows, analysedRowsEnd, totalRows);
  for (let i = bStart; i < Math.min(bStart + MAX_BODY_PREVIEW_ROWS, bodyEnd); i++) {
    if (rows[i] && !headerIdxSet.has(i)) previewRows.push({ rowIndex: i, role: "body", cells: rows[i] });
  }
  if (effectiveSummaryStart !== null) {
    for (let i = effectiveSummaryStart; i < Math.min(effectiveSummaryStart + 2, analysedRowsEnd); i++) {
      if (rows[i] && !headerIdxSet.has(i)) previewRows.push({ rowIndex: i, role: "summary", cells: rows[i] });
    }
  }
  const summaryRowCount = countSummaryContentRows(
    rows.slice(0, analysedRowsEnd).map((row, index) => headerIdxSet.has(index) ? [] : row),
    effectiveSummaryStart
  );
  const dataRowCount = Math.max(0, bodyEnd - bStart) - [...headerIdxSet].filter((index) => index >= bStart && index < bodyEnd).length;
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
  const handleRoleChange = (columnName, value) => {
    const businessRole = value || void 0;
    setDeclinedSuggestions((previous) => {
      const next = new Set(previous);
      if (businessRole) next.delete(columnName);
      else next.add(columnName);
      return next;
    });
    updateColumnRole(columnName, businessRole);
  };
  const roleEntries = columnProfiles.slice(0, 24).map((profile) => {
    var _a2;
    const chosen = (_a2 = userColumnAnnotations[profile.name]) == null ? void 0 : _a2.businessRole;
    const suggested = declinedSuggestions.has(profile.name) ? null : roleSuggestions[profile.name] ?? null;
    return {
      profile,
      value: chosen ?? suggested ?? "",
      isSuggestion: !chosen && suggested !== null
    };
  });
  const orderedRoleEntries = [
    ...roleEntries.filter((entry) => entry.value === ""),
    ...roleEntries.filter((entry) => entry.value !== "")
  ];
  const summaryReason = reasonTexts[0] ?? (structureReviewPending ? t("structure_review_required_message") : getPipelineOutcomeUserText(pipelineOutcome, language) ?? (pipelineOutcome == null ? void 0 : pipelineOutcome.message) ?? t("guided_repair_default_block_reason"));
  const otherReasonTexts = reasonTexts.slice(1);
  const setAsideRowCounts = setAsideSections.map((section) => section.rowCount);
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
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex min-h-0 flex-1 flex-col", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: scrollRef, onScroll: updateScrollCue, className: "px-6 py-4 overflow-y-auto flex-1 space-y-4", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(StructureRepairReviewPanel, {}),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-lg border border-amber-200 bg-amber-50 p-4", "aria-label": t("guided_repair_safety_summary"), children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-amber-950", children: t("guided_repair_safety_summary") }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-slate-700", children: summaryReason }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm font-medium text-slate-800", children: t("review_summary_do") }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mt-3 text-sm text-slate-600", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer text-xs font-medium text-slate-700", children: t("review_more_details") }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "mt-3 grid gap-3 text-sm sm:grid-cols-2", children: [
                      otherReasonTexts.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sm:col-span-2", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-700", children: t("review_other_reasons") }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "mt-1 text-slate-600", children: /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "list-disc space-y-1 pl-4", children: otherReasonTexts.map((text) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: text }, text)) }) })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-700", children: t("guided_repair_why_blocked") }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "mt-1 text-slate-600", children: structureReviewPending ? t("structure_review_required_message") : getPipelineOutcomeUserText(pipelineOutcome, language) ?? (pipelineOutcome == null ? void 0 : pipelineOutcome.message) ?? t("guided_repair_default_block_reason") })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-700", children: t("guided_repair_attempted") }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "mt-1 text-slate-600", children: (cleaningRun == null ? void 0 : cleaningRun.loopCount) ? t("guided_repair_attempt_count", { count: cleaningRun.loopCount }) : t("guided_repair_inspection_only") })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sm:col-span-2", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "font-semibold text-slate-700", children: t("guided_repair_required") }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "mt-1 text-slate-600", children: t("guided_repair_required_action") })
                      ] })
                    ] }),
                    (reasonCodes.length > 0 || technicalMessages.length > 0) && /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mt-3 text-xs text-slate-600", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer font-medium text-slate-700", children: t("structure_review_technical_details") }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 space-y-1 break-words font-mono", children: [
                        reasonCodes.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: t("structure_review_technical_codes", { codes: reasonCodes.join(", ") }) }),
                        technicalMessages.map((message) => /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: message }, message))
                      ] })
                    ] })
                  ] })
                ] }),
                setAsideSections.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900", children: t("review_set_aside_stacked", { count: setAsideSections.length + 1 }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `grid grid-cols-1 gap-3 ${setAsideSections.length > 0 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`, children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-blue-50 rounded-lg p-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-blue-600 font-medium mb-0.5", children: t("boundary_confirm_header_depth") }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-semibold text-blue-800", children: t(headerDepth === 1 ? "review_header_layers_one" : "review_header_layers_many", { count: headerDepth }) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-blue-500", children: t("boundary_confirm_header_rows_label", { rows: headerLayerIdxs.map((i) => i + 1).join(", ") }) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-green-50 rounded-lg p-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-green-600 font-medium mb-0.5", children: t("boundary_confirm_data_rows") }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-semibold text-green-800", children: dataRowCount }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-green-500", children: t("boundary_confirm_data_rows_from", { row: bStart + 1 }) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-amber-50 rounded-lg p-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-amber-600 font-medium mb-0.5", children: t("boundary_confirm_summary_rows") }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-semibold text-amber-800", children: summaryRowCount }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-amber-500", children: effectiveSummaryStart !== null && summaryRowCount > 0 ? t("boundary_confirm_summary_rows_from", { row: effectiveSummaryStart + 1 }) : t("boundary_confirm_no_summary") })
                  ] }),
                  setAsideSections.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-slate-100 rounded-lg p-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-slate-600 font-medium mb-0.5", children: t(setAsideSections.length === 1 ? "review_set_aside_tile_one" : "review_set_aside_tile_many") }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-semibold text-slate-800", children: setAsideSections.length }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-slate-500", children: formatSetAsideRowCounts(setAsideRowCounts, language) })
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { "aria-label": t("review_boundary_title"), children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mb-2 text-sm font-semibold text-slate-900", children: t("review_boundary_title") }),
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
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-lg border border-slate-200 bg-slate-50 p-4", "aria-label": t("review_roles_title"), children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-slate-900", children: t("review_roles_title") }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-slate-600", children: t("review_roles_hint") }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-slate-500", children: t("review_roles_example") }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 space-y-2", children: orderedRoleEntries.map(({ profile, value, isSuggestion }) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "label",
                    {
                      className: `grid grid-cols-1 items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(14rem,auto)] sm:gap-3 ${value === "" ? "border-amber-300" : "border-slate-200"}`,
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex min-w-0 items-center gap-2", children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "min-w-0 truncate font-medium text-slate-800", title: profile.name, children: profile.name }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500", children: profile.type }),
                          isSuggestion && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700", children: t("review_role_suggested") }),
                          value === "" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800", children: t("review_role_needs_choice") })
                        ] }),
                        /* @__PURE__ */ jsxRuntimeExports.jsxs(
                          "select",
                          {
                            value,
                            onChange: (event) => handleRoleChange(profile.name, event.target.value),
                            className: "min-h-[44px] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 md:min-h-0",
                            "aria-label": t("guided_repair_field_role_label", { column: profile.name }),
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: t("review_role_option_unspecified") }),
                              ROLE_OPTIONS.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: option.value, children: t(option.labelKey) }, option.value))
                            ]
                          }
                        )
                      ]
                    },
                    profile.name
                  )) })
                ] })
              ] }),
              canScrollMore && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-center bg-gradient-to-t from-white to-transparent pb-2", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm", children: [
                "↓",
                " ",
                t("review_scroll_more")
              ] }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 py-4 border-t border-slate-200 flex flex-col items-end gap-2 flex-shrink-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-3", children: [
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
                    disabled: confirming || isBusy || repairRequired,
                    className: "px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2",
                    children: confirming ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" }),
                      t("boundary_confirm_processing")
                    ] }) : t("boundary_confirm_button")
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500", children: repairRequired ? "Boundary confirmation cannot approve structural repair. Use the bound semantic review above; dataset commit is separate." : t("review_confirm_reassurance") })
            ] })
          ]
        }
      )
    }
  );
};
export {
  ReportBoundaryConfirmModal
};
