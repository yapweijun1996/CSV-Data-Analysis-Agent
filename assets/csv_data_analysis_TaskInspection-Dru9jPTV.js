import { a as reactExports, j as jsxRuntimeExports, W as We, r as reactDomExports } from "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-CMf1uPe1.js";
import { u as useAppStore, k as CandidateDraft, e as useDialogAccessibility } from "./csv_data_analysis_index-x-Z1054W.js";
import { bo as inspectPiCandidateReview, dB as inspectTaskExport, dC as buildTaskExport, dD as readTaskProgram, aK as cancelOwnedRun } from "./csv_data_analysis_app-agent-CCgesa_7.js";
const useCandidateReview = (request) => {
  var _a, _b;
  const [, refresh] = reactExports.useState(0);
  const result = ((_a = request == null ? void 0 : request.resumeContext) == null ? void 0 : _a.piCandidateApproval) ? inspectPiCandidateReview(useAppStore, request) : null;
  const expiresAt = (_b = result == null ? void 0 : result.review) == null ? void 0 : _b.expiresAt;
  reactExports.useEffect(() => {
    if (!expiresAt || expiresAt <= Date.now()) return;
    const timer = setTimeout(() => refresh((value) => value + 1), expiresAt - Date.now() + 1);
    return () => clearTimeout(timer);
  }, [expiresAt]);
  return result;
};
const TaskExport = ({ taskId }) => {
  const [busy, setBusy] = reactExports.useState(false), [message, setMessage] = reactExports.useState("");
  useAppStore((s) => s.activeExecution);
  useAppStore((s) => s.taskInspection);
  const admission = inspectTaskExport(useAppStore, taskId);
  const download = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await buildTaskExport(useAppStore, taskId);
      if (!inspectTaskExport(useAppStore, taskId).available) throw new Error("task_export_custody_replaced");
      const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes).buffer], { type: "application/zip" }));
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = result.fileName;
        link.click();
        setMessage("Download requested. Inspect manifest.json and reconcile outputs; file existence does not certify facts.");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message.replaceAll("_", " ") : "Task export unavailable.");
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-2 border-t border-slate-200 pt-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold text-slate-900", children: "Inspectable outputs" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "ZIP includes actual output bytes, executed program/environment, input coverage, evidence references and SHA-256 manifest. Unvalidated artifacts remain unvalidated." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs", children: "No automatic persistence. Live custody ends on task/session replacement, reload or seven-day expiry. Downloads are user-managed; local row retention remains a separate explicit action." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        className: "min-h-[44px] rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50",
        disabled: busy || !admission.available,
        onClick: () => void download(),
        children: "Export task bundle"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "status", className: "break-words", children: message || admission.reason.replaceAll("_", " ") })
  ] });
};
const control = "min-h-[44px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50";
const pre = "max-w-full whitespace-pre-wrap break-all rounded-md bg-slate-100 p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";
const useInspection = () => useAppStore((s) => ({
  task: s.activeAgentTask,
  view: s.taskInspection,
  sessionId: s.sessionId,
  active: s.activeExecution,
  busy: s.isBusy,
  pending: s.pendingClarification,
  bundle: s.datasetBundle,
  bindingStatus: s.datasetCommitBindingStatus,
  checkpoint: s.candidateRecovery,
  respond: s.handleClarificationResponse,
  openWorkspace: s.setIsWorkspaceModalOpen
}), shallow$1);
const TaskInspectionView = ({ onReturnToChat, onOpenRecovery }) => {
  var _a, _b;
  const { task, view, sessionId, active, busy, pending, bundle, bindingStatus, checkpoint, respond } = useInspection();
  const [section, setSection] = reactExports.useState("Overview"), [selected, setSelected] = reactExports.useState(""), [offset, setOffset] = reactExports.useState(0);
  const [range, setRange] = reactExports.useState(null), [codeError, setCodeError] = reactExports.useState("");
  const current = Boolean(task && view && task.sessionId === sessionId && view.sessionId === sessionId && task.taskId === view.taskId);
  const program = (view == null ? void 0 : view.programs.find((p) => `${p.path}@${p.revision}` === selected)) ?? (view == null ? void 0 : view.programs.at(-1));
  const review = useCandidateReview(pending) ?? { available: false, reason: "Review is historical or unavailable. Start a fresh request or revalidate the interrupted candidate." };
  reactExports.useEffect(() => {
    setOffset(0);
  }, [selected, task == null ? void 0 : task.taskId]);
  reactExports.useEffect(() => {
    setRange(null);
    setCodeError("");
    if (section !== "Code" || !current || !task || !program) return;
    try {
      setRange(readTaskProgram(useAppStore, task.taskId, program, offset));
    } catch {
      setCodeError("Live revisioned source is unavailable. Saved files are historical; start a fresh task to execute.");
    }
  }, [section, current, task == null ? void 0 : task.taskId, program == null ? void 0 : program.path, program == null ? void 0 : program.revision, program == null ? void 0 : program.sha256, offset]);
  if (!task || !current || !view) return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto p-4 text-sm text-slate-700", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold", children: "No live task inspection" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2", children: "History and reload do not restore task authority, approvals or answer evidence. Start a fresh request to inspect a new task." }),
    ((bundle == null ? void 0 : bundle.acceptedCommit) || checkpoint) && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: `${control} mt-3`, onClick: onOpenRecovery, children: "Open dataset recovery" })
  ] });
  const candidate = view.candidate;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full min-h-0 min-w-0 flex-col", "data-task-inspection": "true", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("nav", { "aria-label": "Task inspection sections", className: "flex shrink-0 flex-wrap gap-1 border-b border-slate-200 bg-white p-2", children: ["Overview", "Code", "Observations", "Review"].map((name) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        "aria-pressed": section === name,
        className: `${control} ${section === name ? "border-blue-600 bg-blue-50 font-semibold" : ""}`,
        onClick: () => setSection(name),
        children: name
      },
      name
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 min-w-0 flex-1 overflow-y-auto p-4", "data-task-scroll": "true", children: [
      section === "Overview" && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-3 text-sm text-slate-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold text-slate-900", children: "Task diagnosis and scope" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "whitespace-pre-wrap break-words", children: task.goal }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { role: "status", children: [
          "Task status: ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: task.status.replaceAll("_", " ") })
        ] }),
        view.outcome && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "whitespace-pre-wrap break-words", children: [
          "Runtime outcome: ",
          view.outcome
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Task / revision" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("dd", { className: "break-all", children: [
            task.taskId,
            " / ",
            task.revision
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Run" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all", children: view.runId }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Scope" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all", children: task.scope.digest }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Committed version" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "break-all", children: (bundle == null ? void 0 : bundle.acceptedCommit) ? `${bundle.acceptedCommit.revision} · ${bundle.datasetVersion}` : "No committed version" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold text-slate-900", children: "Execution profile" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "break-words", children: [
          "Browser JavaScript · ",
          view.runtime,
          ". Whole-table / explicit stateful stream: up to 50,000 rows, 256 columns, 8 MiB complete input. Execution remains subject to current access policy."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Shell, packages, general Python, guest network and stdio MCP are unavailable in this profile. Separately reviewed HTTP MCP tools run through the host connector and return observations with unverified upstream completeness. A file-backed preview cannot replace complete execution input." }),
        bindingStatus && bindingStatus !== "ready" && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { role: "status", children: [
          "Source / binding: ",
          bindingStatus,
          ". Restore or reattach verified rows before new facts."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold text-slate-900", children: "Task budget" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: task.budget.pausedForUser ? "Paused for user review; waiting time is not charged." : "Counters retained across revisions and resumes." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dl", { className: "grid grid-cols-[auto_auto] gap-x-3 gap-y-1", children: Object.entries(task.budget.limits).map(([dimension, limit]) => /* @__PURE__ */ jsxRuntimeExports.jsxs(We.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: dimension === "activeMs" ? "Active milliseconds" : dimension }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("dd", { children: [
            task.budget.used[dimension],
            " / ",
            limit
          ] })
        ] }, dimension)) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold text-slate-900", children: "Current admitted evidence" }),
        view.grounding ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
            "Admission: ",
            view.grounding.status
          ] }),
          [...view.grounding.queryIds, ...view.grounding.computationIds ?? []].map((id) => /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "break-all font-mono text-xs", children: id }, id)),
          view.grounding.reasons.map((reason, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "break-words", children: reason }, i))
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "No current admitted query or computation evidence. Historical observations are inspection references." }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer py-2", children: "Typed scope and required outputs" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: pre, children: JSON.stringify({ answer: task.scope.answer, requiredOutputs: task.requiredOutputs, inputs: task.inputBindings }, null, 2) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TaskExport, { taskId: task.taskId }, task.taskId)
      ] }),
      section === "Code" && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-3 text-sm text-slate-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold text-slate-900", children: "Revisioned task code" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Source is read-only. Each range comes from its exact live task namespace and immutable revision." }),
        view.omittedPrograms > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          view.omittedPrograms,
          " older program references omitted from this bounded view."
        ] }),
        view.programs.length ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block", htmlFor: "task-program-revision", children: "Program revision" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("select", { id: "task-program-revision", className: "min-h-[44px] w-full min-w-0 rounded border border-slate-300 p-2", value: program ? `${program.path}@${program.revision}` : "", onChange: (e) => setSelected(e.target.value), children: view.programs.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: `${p.path}@${p.revision}`, children: [
            p.path,
            " · revision ",
            p.revision
          ] }, `${p.path}@${p.revision}`)) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "break-all text-xs", children: [
            "SHA-256: ",
            program == null ? void 0 : program.sha256,
            " · ",
            program == null ? void 0 : program.byteSize,
            " bytes"
          ] }),
          codeError && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "status", children: codeError }),
          range && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
              "Characters ",
              range.startOffset,
              "–",
              range.endOffset,
              range.complete ? " · final range" : " · partial range; continue to inspect"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { "aria-label": "Task code range", tabIndex: 0, className: pre, children: range.content }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: control, disabled: offset === 0, onClick: () => setOffset(Math.max(0, offset - 3e3)), children: "Previous code range" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: control, disabled: range.complete, onClick: () => setOffset(range.endOffset), children: "Next code range" })
            ] })
          ] })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "No program was written for this task." })
      ] }),
      section === "Observations" && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-3 text-sm text-slate-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold text-slate-900", children: "Actual tool observations" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Bounded tool results and execution logs. Older run/revision observations remain informational; they do not authorize new facts." }),
        view.omittedObservations > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          view.omittedObservations,
          " older observations omitted."
        ] }),
        view.observations.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "No tool observation yet." }),
        view.observations.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "border-b border-slate-200 pb-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "font-medium", children: [
            o.tool,
            " · ",
            o.status
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "break-words whitespace-pre-wrap", children: o.message }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "break-all text-xs", children: [
            "Revision ",
            o.taskRevision,
            " · run ",
            o.runId,
            o.jobId ? ` · execution ${o.jobId}` : "",
            o.durationMs !== void 0 ? ` · ${o.durationMs} ms` : ""
          ] }),
          (o.stdout || o.stderr) && /* @__PURE__ */ jsxRuntimeExports.jsxs("pre", { tabIndex: 0, "aria-label": `${o.tool} execution logs`, className: `${pre} mt-2`, children: [
            o.stdout ? `stdout:
${o.stdout}
` : "",
            o.stderr ? `stderr:
${o.stderr}` : ""
          ] }),
          o.externalObservation && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "break-all text-xs", children: [
              "MCP observation ",
              o.externalObservation.receiptId,
              " · ",
              o.externalObservation.protocol,
              " · generation ",
              o.externalObservation.generation
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs", children: "Untrusted remote output. Upstream selection, completeness and snapshot are unknown; this is not verified dataset evidence." }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { tabIndex: 0, "aria-label": `${o.tool} external observation`, className: `${pre} mt-2`, children: o.externalObservation.preview }),
            o.externalObservation.previewTruncated && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs", children: "Remote preview truncated." })
          ] }),
          o.truncated && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs", children: "Observation truncated; it does not prove full output coverage." })
        ] }, o.id))
      ] }),
      section === "Review" && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-3 text-sm text-slate-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold text-slate-900", children: "Candidate review" }),
        view.candidateError && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { role: "alert", children: [
          "Candidate unavailable: ",
          view.candidateError
        ] }),
        candidate ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "break-all text-xs", children: [
            candidate.candidateId,
            " · task revision ",
            candidate.taskRevision
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "break-all text-xs", children: [
            "Scope: ",
            candidate.scopeDigest
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "break-all text-xs", children: [
            "Change: ",
            candidate.changeDigest
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "font-medium", children: "Host grain and scope requirements" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: pre, children: candidate.requirements }),
          candidate.requirementsTruncated && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Requirements preview truncated." }),
          candidate.commitRestriction === "candidate_multi_table_atomic_promotion_unavailable" && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "status", children: "Multi-table Draft / Uncommitted. Atomic all-table promotion is unavailable; neither table can be accepted. Meaning selection is not exact Dataset Commit approval." }),
          candidate.tables.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "break-words", children: [
            t.name,
            ": ",
            t.rows,
            " rows · ",
            t.columns.join(", ")
          ] }, t.name)),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "font-medium", children: "Structural diff" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "This comparison is structural; independent validation supplies the semantic decision." }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: pre, children: candidate.diff }),
          candidate.diffTruncated && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Diff preview truncated." }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "font-medium", children: [
            "Excluded rows: ",
            candidate.excludedCount
          ] }),
          candidate.exclusions.map((e, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "break-words", children: e }, i)),
          candidate.excludedCount > candidate.exclusions.length && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Exclusions preview truncated." }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "font-medium", children: "Independent validation" }),
          candidate.validationError && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { role: "alert", children: [
            "Validation unavailable: ",
            candidate.validationError
          ] }),
          !candidate.validationError && ((_a = candidate.validation) == null ? void 0 : _a.decision) === "validated" && candidate.validation.receiptDigest && candidate.tables.map((table) => /* @__PURE__ */ jsxRuntimeExports.jsx(CandidateDraft, { taskId: task.taskId, candidateId: candidate.candidateId, table: table.name, digest: candidate.validation.receiptDigest }, `${candidate.candidateId}:${candidate.validation.receiptDigest}:${table.name}`)),
          candidate.validation ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
              "Decision: ",
              candidate.validation.decision
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "break-words", children: candidate.validation.reasons.join("; ") || "No rejection reasons." }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "break-words", children: candidate.validation.checks.join("; ") }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: pre, children: candidate.validation.reconciliation }),
            candidate.validation.truncated && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Validation preview truncated." })
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Independent validation is pending; staging cannot change accepted data." })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "No current candidate snapshot. Historical metadata cannot be approved here." }),
        review.review && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
            "Primary table: ",
            review.review.primaryTable
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
            "Expires: ",
            new Date(review.review.expiresAt).toISOString()
          ] }),
          (review.review.acceptedDualGrain || review.review.acceptedStreamedDual) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { role: "note", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Exact approval publishes both tables together and retains their verified source and lineage locally. Meaning selection is not commit approval." }),
            review.review.tables.map((t) => {
              var _a2, _b2;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
                t.name,
                ": ",
                t.rowCount,
                " rows · key/grain: ",
                (_b2 = (_a2 = review.review.grains) == null ? void 0 : _a2.find((g) => g.table === t.name)) == null ? void 0 : _b2.grain.join(", ")
              ] }, t.name);
            }),
            (_b = review.review.relationships) == null ? void 0 : _b.map((r, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
              r.fromTable,
              " (",
              r.fromKeys.join(", "),
              ") → ",
              r.toTable,
              " (",
              r.toKeys.join(", "),
              "): ",
              r.cardinality
            ] }, i)),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Summary/excluded rows are evidence only, not additional facts. Joins are unsupported; query each grain separately." })
          ] }),
          review.review.spill && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
            "Approval retains ",
            review.review.spill.rowCount,
            " projected rows in immutable local storage (",
            review.review.spill.bytes,
            " bytes). Host-declared source-record grain and units remain explicit assumptions. Draft reads never grant commit."
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer py-2", children: "Exact approval identity" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: pre, children: JSON.stringify(review.review, null, 2) })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "status", children: review.reason })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-white p-3", "data-task-actions": "true", children: [
      active && active.runId === view.runId && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: control, onClick: () => {
        var _a2;
        if (((_a2 = useAppStore.getState().activeExecution) == null ? void 0 : _a2.runId) === view.runId) cancelOwnedRun(useAppStore);
      }, children: "Stop task" }),
      section === "Review" && review.available && pending && pending.options.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: control,
          disabled: busy,
          onClick: () => {
            if (inspectPiCandidateReview(useAppStore, pending).available) void respond(option);
          },
          children: option.label
        },
        option.value
      )),
      task.status === "awaiting_clarification" && pending && onReturnToChat && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: control, onClick: onReturnToChat, children: "Reply in chat" }),
      ((bundle == null ? void 0 : bundle.acceptedCommit) || checkpoint) && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: control, onClick: onOpenRecovery, children: "Open dataset recovery" }),
      task.status === "awaiting_source" && !(bundle == null ? void 0 : bundle.acceptedCommit) && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "Reattach the exact source to continue." })
    ] })
  ] });
};
const TaskInspectionDialog = ({ onClose }) => {
  const ref = useDialogAccessibility(true, onClose);
  const { openWorkspace } = useInspection();
  return reactDomExports.createPortal(/* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4", onClick: onClose, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref,
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "task-inspection-title",
      tabIndex: -1,
      className: "flex h-[75dvh] max-h-[80dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:h-[80dvh] sm:max-w-4xl sm:rounded-xl",
      onClick: (e) => e.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "task-inspection-title", className: "font-semibold text-slate-900", children: "Task inspection" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: control, "data-dialog-initial-focus": true, onClick: onClose, "aria-label": "Close task inspection", children: "Close" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TaskInspectionView, { onReturnToChat: onClose, onOpenRecovery: () => {
          onClose();
          openWorkspace(true);
        } })
      ]
    }
  ) }), document.body);
};
const TaskInspectionEntry = () => {
  const { task, sessionId, checkpoint, bundle } = useInspection();
  const [open, setOpen] = reactExports.useState(false);
  reactExports.useEffect(() => {
    setOpen(false);
  }, [sessionId, task == null ? void 0 : task.taskId]);
  if ((!task || task.sessionId !== sessionId) && !checkpoint && !(bundle == null ? void 0 : bundle.acceptedCommit)) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-1", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "min-w-0 truncate text-xs text-slate-600", children: task ? `Task · ${task.status.replaceAll("_", " ")}` : "Saved dataset · source recovery" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: control, "aria-expanded": open, onClick: () => setOpen(true), children: "Inspect task" }),
    open && /* @__PURE__ */ jsxRuntimeExports.jsx(TaskInspectionDialog, { onClose: () => setOpen(false) })
  ] });
};
export {
  TaskInspectionEntry as T,
  TaskInspectionView as a,
  useCandidateReview as u
};
