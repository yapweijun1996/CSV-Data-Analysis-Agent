import { j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { I as IconSearch } from "./csv_data_analysis_IconSearch-BADyiBOM.js";
import { a as IconSettings, I as IconThinking } from "./csv_data_analysis_IconSettings-B7Z7C3gl.js";
import { u as useAppStore, a as IconWarning } from "./csv_data_analysis_index-L92MBGHW.js";
import { U as getTranslation } from "./csv_data_analysis_app-agent-DytoEScF.js";
const IconCheck = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-3 w-3", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "3", d: "M5 13l4 4L19 7" }) });
const IconWrapper = ({ children, colorClass }) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`, children });
const ThinkingIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx(IconWrapper, { colorClass: "bg-blue-100 text-blue-600", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconThinking, { className: "h-5 w-5" }) });
const ExecutingIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx(IconWrapper, { colorClass: "bg-indigo-100 text-indigo-600", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSettings, { className: "h-5 w-5", "aria-hidden": "true" }) });
const ObservingIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx(IconWrapper, { colorClass: "bg-purple-100 text-purple-600", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSearch, { className: "h-5 w-5 text-current", "aria-hidden": "true" }) });
const DoneIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx(IconWrapper, { colorClass: "bg-emerald-100 text-emerald-700", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconCheck, { className: "h-5 w-5", "aria-hidden": "true" }) });
const ErrorIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx(IconWrapper, { colorClass: "bg-red-100 text-red-600", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconWarning, { className: "h-5 w-5", "aria-hidden": "true" }) });
const useLocalizedTask = (task) => {
  const language = useAppStore((state) => state.settings.language);
  const title = task.titleKey ? getTranslation(task.titleKey, language, task.titleParams) : task.title;
  const subtitle = task.subtitleKey ? getTranslation(task.subtitleKey, language, task.subtitleParams) : task.subtitle;
  return { title, subtitle, language };
};
const MicroTaskStep = ({ task }) => {
  const { name, status } = task;
  const renderIcon = () => {
    switch (status) {
      case "done":
        return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconCheck, {}) });
      case "in_progress":
        return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-4 h-4 rounded-full bg-blue-500 ring-4 ring-blue-100 flex items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-1.5 h-1.5 bg-white rounded-full animate-pulse" }) });
      case "pending":
      default:
        return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-4 h-4 rounded-full border-2 border-slate-300" });
    }
  };
  const textClass = () => {
    switch (status) {
      case "done":
        return "text-slate-400 line-through";
      case "in_progress":
        return "text-slate-800 font-medium";
      default:
        return "text-slate-500";
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mr-3 mt-1 flex-shrink-0", children: renderIcon() }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `transition-colors duration-300 ${textClass()}`, children: name })
  ] });
};
const AiTaskStatusBubble = ({ task, variant = "default" }) => {
  const { title, subtitle, language } = useLocalizedTask(task);
  const renderIcon = () => {
    switch (task.status) {
      case "thinking":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(ThinkingIcon, {});
      case "acting":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(ExecutingIcon, {});
      case "observing":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(ObservingIcon, {});
      case "done":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(DoneIcon, {});
      case "error":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(ErrorIcon, {});
    }
  };
  if (variant === "compact") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-card border border-slate-200 bg-white/90 px-4 py-3 shadow-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "scale-75", children: renderIcon() }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "truncate text-sm font-semibold text-slate-900", children: title }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "shrink-0 text-xs font-medium text-slate-400", children: [
            task.currentStep,
            "/",
            task.totalSteps
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 truncate text-xs text-slate-500", children: subtitle })
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "animate-fade-in flex flex-col rounded-card border border-slate-200 bg-white p-4 shadow-lg", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 flex items-center", children: [
      renderIcon(),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "text-lg font-bold text-slate-900", children: [
          title,
          " (",
          task.currentStep,
          "/",
          task.totalSteps,
          ")"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-500", children: subtitle })
      ] })
    ] }),
    task.microTasks && task.microTasks.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2 border-t border-slate-200 pt-4 text-sm", children: task.microTasks.map((microTask) => /* @__PURE__ */ jsxRuntimeExports.jsx(MicroTaskStep, { task: microTask }, microTask.name)) }),
    task.status === "error" && task.error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer font-semibold", children: getTranslation("task_error_details", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 whitespace-pre-wrap font-mono break-all", children: task.error })
    ] }) })
  ] });
};
export {
  AiTaskStatusBubble as A
};
