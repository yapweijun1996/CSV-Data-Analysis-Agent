import { a as reactExports, j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { bP as selectReportScopedActivity } from "./csv_data_analysis_app-agent-DytoEScF.js";
const lifecycleClasses = {
  queued: "border-slate-200 bg-slate-100 text-slate-700",
  running: "border-blue-200 bg-blue-100 text-blue-800",
  waiting: "border-violet-200 bg-violet-100 text-violet-800",
  degraded: "border-amber-200 bg-amber-100 text-amber-800",
  failed: "border-rose-200 bg-rose-100 text-rose-800",
  cancelled: "border-slate-300 bg-slate-200 text-slate-700",
  completed: "border-emerald-200 bg-emerald-100 text-emerald-800"
};
const kindLabels = {
  intake: "Intake",
  preparation: "Preparation",
  research: "Research",
  follow_up: "Follow-up",
  tool: "Tool",
  approval: "Approval",
  artifact: "Artifact",
  terminal: "Outcome"
};
const AgentActivityView = ({
  events,
  sessionId,
  datasetId,
  limit = 50,
  compact = false,
  emptyMessage = "No assistant activity has been recorded for this report yet."
}) => {
  const activity = reactExports.useMemo(
    () => selectReportScopedActivity(events, { sessionId, datasetId }).slice(-limit),
    [datasetId, events, limit, sessionId]
  );
  if (activity.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "rounded-card border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500", children: emptyMessage });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "ol",
    {
      className: compact ? "space-y-2" : "space-y-3",
      "aria-label": "Assistant activity",
      "aria-live": "polite",
      children: activity.map((event) => {
        const descriptor = event.activity;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "li",
          {
            "data-agent-activity-kind": descriptor.kind,
            "data-agent-lifecycle": descriptor.lifecycle,
            className: `rounded-card border border-slate-200 bg-white ${compact ? "p-3" : "p-4"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-start justify-between gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-semibold uppercase tracking-wide text-slate-500", children: kindLabels[descriptor.kind] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${lifecycleClasses[descriptor.lifecycle]}`, children: descriptor.lifecycle })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("time", { className: "text-xs text-slate-400", dateTime: event.timestamp.toISOString(), children: event.timestamp.toLocaleString() })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm font-semibold text-slate-900", children: descriptor.title }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 whitespace-pre-wrap text-sm text-slate-700", children: event.message }),
              descriptor.explanation && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs text-slate-500", children: descriptor.explanation })
            ]
          },
          event.id
        );
      })
    }
  );
};
export {
  AgentActivityView as A
};
