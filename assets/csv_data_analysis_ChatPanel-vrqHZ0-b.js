import { a as reactExports, j as jsxRuntimeExports, W as We } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-LvY-J6mW.js";
import { u as useAppStore, I as IconChangeGoal } from "./csv_data_analysis_index-L92MBGHW.js";
import { U as getTranslation, ay as normalizeClarificationRequest, az as resolveEffectivePendingClarification, aA as resolveDisplayPlanTitle, aB as resolveSuggestedActionPrompt, aC as MAX_TIMELINE_CHAT_MESSAGES, aD as TERMINAL_CHAT_LIFECYCLE_STATES, aE as shouldShowSettingsButton, av as shouldShowAgentThinkingModal, aw as shouldShowLongTermMemory, g as shouldAllowSettingsSurface } from "./csv_data_analysis_app-agent-DytoEScF.js";
import { M as MarkdownRenderer } from "./csv_data_analysis_MarkdownRenderer-8qXuZeTk.js";
import { I as IconInsights } from "./csv_data_analysis_IconInsights-miXHhJGo.js";
import { I as IconThinking, a as IconSettings } from "./csv_data_analysis_IconSettings-B7Z7C3gl.js";
import { I as IconMemory } from "./csv_data_analysis_IconMemory-CuUVrq-7.js";
import { I as IconAi } from "./csv_data_analysis_IconAi-zaXrTUAQ.js";
import "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
import "./csv_data_analysis_vendor-ui-DPkU1-1J.js";
const GoalConfirmationCard = ({ msg }) => {
  var _a, _b;
  const { confirmGoal, isBusy, settings, isChangingGoal } = useAppStore((state) => ({
    confirmGoal: state.confirmGoal,
    isBusy: state.isBusy,
    settings: state.settings,
    isChangingGoal: state.isChangingGoal,
    dataQualityIssues: state.dataQualityIssues
  }), shallow$1);
  const [customGoal, setCustomGoal] = reactExports.useState("");
  const [countdown, setCountdown] = reactExports.useState(null);
  const timerRef = reactExports.useRef(null);
  const recommendedGoal = (_a = msg.goalCandidates) == null ? void 0 : _a.find((g) => g.isRecommended);
  const otherGoals = (_b = msg.goalCandidates) == null ? void 0 : _b.filter((g) => !g.isRecommended);
  const isAutoConfirmSafe = !!recommendedGoal;
  const canAutoConfirm = settings.autoConfirmGoal && isAutoConfirmSafe && !isChangingGoal;
  const cancelTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCountdown(null);
  };
  reactExports.useEffect(() => {
    if (canAutoConfirm) {
      setCountdown(10);
      timerRef.current = window.setInterval(() => {
        setCountdown((prev) => prev !== null && prev > 1 ? prev - 1 : 0);
      }, 1e3);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [canAutoConfirm]);
  reactExports.useEffect(() => {
    if (countdown === 0 && recommendedGoal) {
      if (timerRef.current) clearInterval(timerRef.current);
      confirmGoal(recommendedGoal.title);
    }
  }, [countdown, recommendedGoal, confirmGoal]);
  if (!msg.goalCandidates) return null;
  const handleCustomGoalChange = (e) => {
    cancelTimer();
    setCustomGoal(e.target.value);
  };
  const handleConfirm = (goalTitle) => {
    cancelTimer();
    confirmGoal(goalTitle);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "animate-fade-in rounded-card border border-blue-200 bg-white p-4 shadow-md", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 flex items-start text-blue-700", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconChangeGoal, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "font-semibold text-base", children: getTranslation("goal_confirm_title", settings.language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-600", children: getTranslation("goal_confirm_description", settings.language) })
      ] })
    ] }),
    recommendedGoal && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-blue-200 bg-blue-50 p-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-1 text-sm font-bold text-blue-800", children: getTranslation("goal_confirm_recommended", settings.language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-800", children: recommendedGoal.title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-600 mt-1", children: recommendedGoal.description }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => handleConfirm(recommendedGoal.title),
          disabled: isBusy,
          className: "mt-3 w-full rounded-md bg-blue-600 px-3 py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60",
          children: getTranslation("goal_confirm_use_recommended", settings.language)
        }
      ),
      canAutoConfirm && countdown !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500 text-center", children: getTranslation("goal_confirm_auto_start", settings.language, { count: countdown }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full bg-blue-200 rounded-full h-1 mt-1 overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-blue-500 h-1 rounded-full", style: { width: `${countdown * 10}%`, transition: "width 1s linear" } }) })
      ] })
    ] }),
    otherGoals && otherGoals.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium text-slate-500", children: getTranslation("goal_confirm_other_options", settings.language) }),
      otherGoals.map((goal) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => handleConfirm(goal.title),
          disabled: isBusy,
          className: "w-full rounded-md border border-slate-200 bg-slate-100 p-3 text-left text-sm transition-colors hover:border-blue-500 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-800", children: goal.title }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-600 mt-0.5", children: goal.description })
          ]
        },
        goal.title
      ))
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium text-slate-500 mb-1", children: getTranslation("goal_confirm_custom", settings.language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            name: "custom-analysis-goal",
            value: customGoal,
            onChange: handleCustomGoalChange,
            placeholder: getTranslation("goal_confirm_custom_placeholder", settings.language),
            disabled: isBusy,
            className: "flex-grow bg-white border border-slate-300 rounded-md py-1.5 px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => handleConfirm(customGoal),
            disabled: isBusy || !customGoal.trim(),
            className: "rounded-md bg-slate-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:bg-slate-300",
            children: getTranslation("goal_confirm_use", settings.language)
          }
        )
      ] })
    ] })
  ] });
};
const CopyButton = ({ text, className = "" }) => {
  const [copied, setCopied] = reactExports.useState(false);
  const language = useAppStore((state) => state.settings.language);
  const label = getTranslation(copied ? "chat_copied" : "chat_copy", language);
  const handleCopy = reactExports.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [text]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      type: "button",
      onClick: handleCopy,
      title: label,
      "aria-label": label,
      className: `flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1 opacity-100 transition-opacity md:min-h-0 md:min-w-0 md:opacity-0 md:group-hover/bubble:opacity-100 ${className}`,
      children: copied ? /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3.5 8.5l3 3 6-7" }) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "5", y: "5", width: "8", height: "8", rx: "1.5" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 11V3.5A1.5 1.5 0 014.5 2H11" })
      ] })
    }
  );
};
function translateCleaningKind(kind, language) {
  const key = `cleaning_step_kind_${kind}`;
  const result = getTranslation(key, language);
  return result !== key ? result : kind;
}
function translateCleaningStatus(status, language) {
  const key = `cleaning_step_status_${status}`;
  const result = getTranslation(key, language);
  return result !== key ? result : status;
}
function sanitizeAssistantDisplayText(text) {
  return text.replace(/`?cleaned\.csv`?/gi, "prepared dataset").replace(/\bSQL[- ]first\b/gi, "query-based").replace(/\bSQL precheck\b/gi, "data readiness check").replace(/\bSQL evidence\b/gi, "query result").replace(/\bgrouped SQL analysis\b/gi, "grouped analysis").replace(/\bpreferred SQL path\b/gi, "preferred analysis path").replace(/\bSQL path\b/gi, "analysis path").replace(/\bDuckDB\b/gi, "local query engine").replace(/\btrace ID\b/gi, "technical reference").replace(/\bSQL\b/gi, "query").replace(/\bdegraded guidance\b/gi, "visible caveats").replace(/^\s*(?:[-*]|\d+\.)\s+\*\*[^*\n]+:?\*\*\s*:?\s*$/gm, "").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}
const AiMessage = ({
  msg,
  onShowCardFromChat
}) => {
  var _a, _b;
  const language = useAppStore((state) => state.settings.language);
  const isActiveError = Boolean(msg.isError && !msg.resolved);
  const borderAccent = isActiveError ? "border-l-4 border-l-red-400" : msg.type === "ai_cleaning_step" ? "border-l-4 border-l-amber-300" : msg.type === "ai_query_trace" ? "border-l-4 border-l-indigo-300" : msg.type === "ai_mutation_confirmation" ? "border-l-4 border-l-rose-300" : msg.type === "ai_cleaning_failure" ? "border-l-4 border-l-red-300" : "";
  const timestamp = msg.timestamp instanceof Date ? msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  const displayText = sanitizeAssistantDisplayText(msg.text);
  const isOperationalMessage = msg.type === "ai_cleaning_step" || msg.type === "ai_query_trace";
  const titleKey = isActiveError ? "chat_error" : msg.resolved ? "chat_resolved" : msg.type === "ai_cleaning_step" ? "chat_data_preparation_activity" : msg.type === "ai_query_trace" ? "chat_analysis_activity" : "assistant";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-w-0 w-full", "data-testid": "chat-ai-message", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `group/bubble animate-fade-in min-w-0 w-full max-w-full rounded-card text-sm xl:max-w-3xl ${isOperationalMessage ? "px-3 py-2.5" : "p-4"} ${borderAccent} ${isActiveError ? "bg-red-50 border border-red-200 text-red-800" : msg.resolved || isOperationalMessage ? "bg-slate-50 border border-slate-200 text-slate-600" : "bg-white border border-slate-200 text-slate-800 shadow-sm"}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `${isOperationalMessage ? "mb-1" : "mb-2"} flex items-center justify-between`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: `font-semibold ${isActiveError ? "text-red-800" : "text-slate-900"}`, children: getTranslation(titleKey, language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { text: displayText, className: "text-slate-300 hover:text-slate-500" }),
        timestamp && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-slate-400", children: timestamp })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
      msg.cleaningStep && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 flex flex-wrap gap-2 text-[11px] font-medium", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-slate-100 px-2 py-1 text-slate-600", children: translateCleaningKind(msg.cleaningStep.kind, language) }),
        msg.cleaningStep.status === "done" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-emerald-50 px-2 py-1 text-emerald-700", children: translateCleaningStatus("done", language) }),
        msg.cleaningStep.status === "warning" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-amber-50 px-2 py-1 text-amber-700", children: translateCleaningStatus("warning", language) }),
        msg.cleaningStep.status === "error" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-red-50 px-2 py-1 text-red-700", children: translateCleaningStatus("error", language) }),
        msg.cleaningStep.status === "in_progress" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-slate-100 px-2 py-1 text-slate-600", children: translateCleaningStatus("in_progress", language) }),
        msg.cleaningStep.status === "blocked" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-amber-50 px-2 py-1 text-amber-700", children: translateCleaningStatus("blocked", language) })
      ] }),
      ((_a = msg.queryTrace) == null ? void 0 : _a.sqlPreview) && /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer font-medium text-slate-800", children: getTranslation("chat_query_technical_details", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
            msg.queryTrace.returnedRows,
            "/",
            msg.queryTrace.totalMatchedRows,
            " rows · ",
            msg.queryTrace.durationMs,
            "ms"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "max-h-56 overflow-auto rounded bg-slate-950 p-2 text-[11px] leading-5 text-slate-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: msg.queryTrace.sqlPreview }) })
        ] })
      ] }),
      msg.mutationConfirmation && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 flex flex-wrap gap-2 text-[11px] font-medium", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-rose-50 px-2 py-1 text-rose-700", children: getTranslation("mutation_confirmation_pending_delete", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full bg-slate-100 px-2 py-1 text-slate-600", children: [
            msg.mutationConfirmation.matchedRowCount,
            " rows"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer font-medium text-slate-800", children: getTranslation("mutation_review_filter", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 space-y-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-1 font-medium text-slate-800", children: getTranslation("mutation_generated_filter", language) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "overflow-x-auto rounded bg-white p-2 text-[11px] leading-5 text-slate-700", children: JSON.stringify(msg.mutationConfirmation.filterRows, null, 2) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-1 font-medium text-slate-800", children: getTranslation("mutation_preview_rows", language) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "overflow-x-auto rounded bg-white p-2 text-[11px] leading-5 text-slate-700", children: JSON.stringify(msg.mutationConfirmation.previewRows, null, 2) })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(MarkdownRenderer, { content: displayText, compact: true }),
      ((_b = msg.cleaningFailure) == null ? void 0 : _b.technicalDetail) && /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer font-medium text-slate-800", children: getTranslation("technical_detail", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 space-y-2", children: [
          msg.cleaningFailure.actionTaken && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-800", children: getTranslation("technical_action_taken", language) }),
            " ",
            msg.cleaningFailure.actionTaken
          ] }),
          msg.cleaningFailure.dataSafety && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-800", children: getTranslation("technical_data_safety", language) }),
            " ",
            msg.cleaningFailure.dataSafety
          ] }),
          msg.cleaningFailure.nextState && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-slate-800", children: getTranslation("technical_next_state", language) }),
            " ",
            msg.cleaningFailure.nextState
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "overflow-x-auto rounded bg-white p-2 text-[11px] leading-5 text-slate-700", children: msg.cleaningFailure.technicalDetail })
        ] })
      ] }),
      msg.cardId && !isActiveError && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => onShowCardFromChat(msg.cardId),
          className: "mt-3 min-h-[44px] w-full rounded-md bg-blue-100 px-2 py-1.5 text-left text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 md:min-h-0",
          children: [
            "→ ",
            getTranslation("chat_show_related_card", language)
          ]
        }
      )
    ] })
  ] }) });
};
const ClarificationCard = ({ msg }) => {
  const { pendingClarification, activeTurn, handleClarificationResponse, isBusy, language } = useAppStore((state) => ({
    pendingClarification: state.pendingClarification,
    activeTurn: state.activeTurn,
    handleClarificationResponse: state.handleClarificationResponse,
    isBusy: state.isBusy,
    language: state.settings.language
  }), shallow$1);
  if (!msg.clarificationRequest) return null;
  const renderedClarification = normalizeClarificationRequest(msg.clarificationRequest);
  if (!renderedClarification.question) {
    return null;
  }
  const effectivePendingClarification = resolveEffectivePendingClarification({
    pendingClarification,
    activeTurn
  });
  const isPending = (effectivePendingClarification == null ? void 0 : effectivePendingClarification.question) === renderedClarification.question;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-blue-200 bg-white p-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center text-blue-700", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mr-2 text-lg", children: "🤔" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "font-semibold", children: getTranslation(
        renderedClarification.interactionKind === "approval" ? "approval_required_title" : "clarification_needed_title",
        language
      ) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-3 text-sm text-slate-700", children: renderedClarification.question }),
    renderedClarification.options.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-3 flex flex-col space-y-2", children: renderedClarification.options.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => handleClarificationResponse(option),
        disabled: !isPending || isBusy,
        className: "min-h-11 w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-left text-sm transition-colors hover:border-blue-500 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-slate-100",
        children: option.label
      },
      option.value
    )) }),
    renderedClarification.allowFreeText ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-500", children: getTranslation("clarification_reply_to_continue", language) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-500", children: getTranslation("clarification_select_to_continue", language) })
  ] });
};
const PlanStartCard = ({ msg }) => {
  const language = useAppStore((state) => state.settings.language);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-white p-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center text-slate-700", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mr-2 text-lg", children: "⚙️" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "font-semibold", children: getTranslation("chat_executing_plan", language) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-700 whitespace-pre-wrap", children: msg.text })
  ] });
};
const ProactiveInsightCard = ({ msg }) => {
  const handleShowCardFromChat = useAppStore((state) => state.handleShowCardFromChat);
  const language = useAppStore((state) => state.settings.language);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-yellow-300 bg-yellow-50 p-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center text-yellow-800", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(IconInsights, { className: "mr-2 h-5 w-5 shrink-0", "aria-hidden": "true" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "font-semibold", children: getTranslation("proactive_insight_title", language) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-slate-700", children: /* @__PURE__ */ jsxRuntimeExports.jsx(MarkdownRenderer, { content: msg.text, compact: true }) }),
    msg.cardId && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => handleShowCardFromChat(msg.cardId),
        className: "mt-2 w-full rounded-md bg-yellow-100 px-2 py-1.5 text-left text-xs font-medium text-yellow-800 transition-colors hover:bg-yellow-200",
        children: "→ Show Related Chart"
      }
    )
  ] });
};
const ThinkingCard = ({ msg }) => {
  const language = useAppStore((state) => state.settings.language);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "my-2 p-3 bg-blue-50 border border-blue-200 rounded-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center text-blue-700 mb-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-blue-600 ring-1 ring-blue-200", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconThinking, { className: "h-4 w-4" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "font-semibold", children: getTranslation("chat_initial_analysis", language) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm mb-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(MarkdownRenderer, { content: msg.text, compact: true }) })
  ] });
};
const renderWithMentionChips = (text, cardTitles) => {
  if (cardTitles.length === 0) return null;
  const sorted = [...cardTitles].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@(${escaped.join("|")})`, "g");
  const parts = [];
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(lastIndex, match.index);
    if (before) parts.push(before);
    parts.push(
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center rounded bg-white/20 px-1 py-0.5 text-[13px] font-medium text-blue-100", children: [
        "@",
        match[1]
      ] }, match.index)
    );
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  const remaining = text.slice(lastIndex);
  if (remaining) parts.push(remaining);
  return parts.some((p) => typeof p !== "string") ? /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: parts }) : null;
};
const UserMessage = ({ msg }) => {
  const timestamp = msg.timestamp instanceof Date ? msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  const cardIds = msg.referencedCardIds;
  const cardTitles = reactExports.useMemo(() => {
    if (!cardIds || cardIds.length === 0) return [];
    const cards = useAppStore.getState().analysisCards ?? [];
    return cardIds.map((id) => {
      var _a, _b;
      return (_b = (_a = cards.find((c) => c.id === id)) == null ? void 0 : _a.plan) == null ? void 0 : _b.title;
    }).filter(Boolean);
  }, [cardIds]);
  const chipContent = cardTitles.length > 0 ? renderWithMentionChips(msg.text, cardTitles) : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-w-0 w-full justify-end", "data-testid": "chat-user-message", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "group/bubble min-w-0 max-w-[85%] xl:max-w-2xl", children: [
    timestamp && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-1 flex items-center justify-end gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { text: msg.text, className: "text-slate-300 hover:text-slate-500" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-slate-400", children: timestamp })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-card bg-blue-600 px-3 py-1.5", children: chipContent ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-white whitespace-pre-wrap leading-relaxed", children: chipContent }) : /* @__PURE__ */ jsxRuntimeExports.jsx(MarkdownRenderer, { content: msg.text, compact: true, tone: "inverse" }) })
  ] }) });
};
const EnhancementSuggestionCard = ({ msg }) => {
  const applySuggestion = useAppStore((state) => state.applyCardEnhancementSuggestion);
  const dismissSuggestion = useAppStore((state) => state.dismissCardEnhancementSuggestion);
  const suggestions = useAppStore((state) => state.cardEnhancementSuggestions);
  const language = useAppStore((state) => state.settings.language);
  const suggestion = suggestions.find((s) => s.id === msg.enhancementSuggestionId);
  const isExecutable = (suggestion == null ? void 0 : suggestion.action) === "add_calculated_column";
  if (!suggestion) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-w-0 w-full", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 w-full max-w-full rounded-card border border-slate-200 bg-white p-4 text-sm text-slate-600 xl:max-w-3xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-900", children: getTranslation("enhancement_title", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1", children: getTranslation("enhancement_unavailable", language) })
    ] }) });
  }
  const handleApply = () => {
    if (isExecutable && (suggestion.status === "pending" || suggestion.status === "failed")) {
      applySuggestion(suggestion.id);
    }
  };
  const handleDismiss = () => {
    if (suggestion.status !== "applied" && suggestion.status !== "dismissed") {
      dismissSuggestion(suggestion.id);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-w-0 w-full", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "animate-fade-in min-w-0 w-full max-w-full rounded-card border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-sm xl:max-w-3xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs uppercase tracking-wide text-slate-500", children: getTranslation("enhancement_title", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-900", children: suggestion.cardTitle || suggestion.cardId })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: `rounded-full px-2 py-0.5 text-xs ${suggestion.priority === "high" ? "bg-red-100 text-red-700" : suggestion.priority === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-slate-100 text-slate-600"}`,
          children: getTranslation(`priority_${suggestion.priority}`, language)
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-700 whitespace-pre-wrap", children: suggestion.rationale }),
    suggestion.action === "add_calculated_column" && suggestion.proposedColumnName && suggestion.formula && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-1 font-semibold text-slate-600", children: getTranslation("enhancement_proposed_column", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-slate-800", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: suggestion.proposedColumnName }),
        " = ",
        suggestion.formula
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs text-slate-500", children: getTranslation(
      isExecutable ? "enhancement_command_hint" : "enhancement_info_only_hint",
      language,
      { code: suggestion.shortCode }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: handleApply,
          disabled: !isExecutable || suggestion.status === "applied" || suggestion.status === "applying",
          className: `rounded-md px-3 py-1.5 text-sm font-medium ${!isExecutable ? "bg-slate-200 text-slate-500 cursor-not-allowed" : suggestion.status === "applied" ? "bg-green-100 text-green-700 cursor-default" : suggestion.status === "applying" ? "bg-slate-200 text-slate-500 cursor-progress" : "bg-blue-600 text-white hover:bg-blue-700"}`,
          children: !isExecutable ? getTranslation("enhancement_info_only", language) : suggestion.status === "applied" ? getTranslation("enhancement_applied", language) : suggestion.status === "applying" ? getTranslation("enhancement_applying", language) : getTranslation("enhancement_approve", language)
        }
      ),
      suggestion.status !== "applied" && suggestion.status !== "dismissed" && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: handleDismiss,
          className: "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50",
          children: getTranslation("enhancement_dismiss", language)
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto text-xs text-slate-500", children: getTranslation("enhancement_status", language, {
        status: getTranslation(`enhancement_status_${suggestion.status}`, language)
      }) })
    ] })
  ] }) });
};
const MessageRendererComponent = ({
  item,
  onShowCardFromChat
}) => {
  const msg = item;
  switch (msg.type) {
    case "ai_goal_clarification":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(GoalConfirmationCard, { msg });
    case "ai_clarification":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(ClarificationCard, { msg });
    case "ai_plan_start":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(PlanStartCard, { msg });
    case "ai_thought":
      return null;
    case "ai_thinking":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(ThinkingCard, { msg });
    case "ai_proactive_insight":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(ProactiveInsightCard, { msg });
    case "ai_enhancement_suggestion":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(EnhancementSuggestionCard, { msg });
    case "ai_cleaning_step":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(AiMessage, { msg, onShowCardFromChat });
    case "ai_query_trace":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(AiMessage, { msg, onShowCardFromChat });
    case "ai_mutation_confirmation":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(AiMessage, { msg, onShowCardFromChat });
    case "user_message":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(UserMessage, { msg });
    default:
      return /* @__PURE__ */ jsxRuntimeExports.jsx(AiMessage, { msg, onShowCardFromChat });
  }
};
const MessageRenderer = reactExports.memo(MessageRendererComponent);
const IconHide = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 5l7 7-7 7" }) });
const ChatPanelHeader = ({
  language,
  isAssistantBusy,
  showMemoryPanel,
  showAgentThinking,
  showSettings,
  onOpenMemory,
  onOpenAgent,
  onOpenSettings,
  onHidePanel
}) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex items-center justify-between border-b border-slate-200 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:py-3", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-xl font-semibold text-slate-900", children: getTranslation("assistant", language) }),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
    showMemoryPanel && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: onOpenMemory,
        className: "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 md:min-h-8 md:min-w-8",
        title: getTranslation("view_ai_memory", language),
        "aria-label": getTranslation("view_ai_memory", language),
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconMemory, {})
      }
    ),
    showAgentThinking && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: onOpenAgent,
        className: "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 md:min-h-8 md:min-w-8",
        title: getTranslation("view_agent_timeline", language),
        "aria-label": getTranslation("view_agent_timeline", language),
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconAi, {})
      }
    ),
    showSettings && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: onOpenSettings,
        className: "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 md:min-h-8 md:min-w-8",
        title: getTranslation("settings", language),
        "aria-label": getTranslation("settings", language),
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSettings, {})
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: onHidePanel,
        className: "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 md:min-h-8 md:min-w-8",
        title: getTranslation("hide_panel", language),
        "aria-label": getTranslation("hide_panel", language),
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconHide, {})
      }
    )
  ] }),
  isAssistantBusy && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "loading-shimmer-bar absolute bottom-0 left-0 right-0 h-0.5 animate-loading-shimmer" })
] });
const IconSend = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M10 17a1 1 0 01-1-1V5.414L5.707 8.707a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L11 5.414V16a1 1 0 01-1 1z", clipRule: "evenodd" }) });
const IconStop = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "5", y: "5", width: "10", height: "10", rx: "2" }) });
const chartTypeLabel = (t) => {
  const map = {
    bar: "Bar",
    column: "Bar",
    line: "Line",
    pie: "Pie",
    doughnut: "Pie",
    scatter: "Dot",
    radar: "Radar",
    area: "Area",
    stacked_bar: "Stack",
    stacked_column: "Stack",
    combo: "Combo",
    bubble: "Dot",
    polar_area: "Polar",
    pivot_matrix: "Pivot"
  };
  return map[t] ?? "";
};
const CardMentionPopup = ({
  cards,
  query,
  onSelect,
  onClose
}) => {
  const [activeIndex, setActiveIndex] = reactExports.useState(0);
  const listRef = reactExports.useRef(null);
  const filtered = cards.filter(
    (c) => c.title.toLowerCase().includes(query.toLowerCase())
  );
  reactExports.useEffect(() => {
    setActiveIndex(0);
  }, [query]);
  reactExports.useEffect(() => {
    var _a;
    const item = (_a = listRef.current) == null ? void 0 : _a.children[activeIndex];
    item == null ? void 0 : item.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);
  const handleKeyDown = reactExports.useCallback((e) => {
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onSelect(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }, [filtered, activeIndex, onSelect, onClose]);
  reactExports.useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);
  if (filtered.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute bottom-full left-0 right-0 z-50 mb-1 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-400 shadow-lg", children: "No matching cards" });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "ul",
    {
      ref: listRef,
      role: "listbox",
      className: "absolute bottom-full left-0 right-0 z-50 mb-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg",
      children: filtered.map((card, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "li",
        {
          role: "option",
          "aria-selected": i === activeIndex,
          onMouseEnter: () => setActiveIndex(i),
          onMouseDown: (e) => {
            e.preventDefault();
            onSelect(card);
          },
          className: `flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors ${i === activeIndex ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500", children: chartTypeLabel(card.chartType) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: card.title })
          ]
        },
        card.id
      ))
    }
  );
};
const renderHighlightedInput = (text, mentionMap) => {
  if (mentionMap.size === 0) return text;
  const titles = [...mentionMap.keys()].sort((a, b) => b.length - a.length);
  const escaped = titles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(@(?:${escaped.join("|")}))`, "g");
  const parts = text.split(pattern);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: parts.map(
    (part, i) => pattern.test(part) ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded bg-blue-100 text-blue-700 font-medium", children: part }, i) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-900", children: part }, i)
  ) });
};
const BusyButtonSpinner = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "relative flex h-4 w-4 items-center justify-center", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute inset-0 rounded-full border-2 border-white/35 border-t-white animate-spin" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-white/90 animate-pulse" })
] });
const getComposerBusyState = ({
  currentView,
  isBusy,
  isGeneratingReport,
  goalState,
  isTaskStatusActive,
  cleaningRunStatus,
  latestProgressText,
  language
}) => {
  if (currentView === "file_upload" && isBusy) {
    return {
      shortLabel: getTranslation("chat_processing_import_short", language),
      title: getTranslation("chat_processing_import_title", language),
      detail: latestProgressText ?? getTranslation("chat_processing_import_detail", language),
      accentClassName: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
      indicatorClassName: "bg-sky-500",
      buttonClassName: "bg-sky-600 hover:bg-sky-600 focus:ring-sky-300 disabled:cursor-wait disabled:bg-sky-600 disabled:text-white disabled:opacity-100"
    };
  }
  if (cleaningRunStatus === "running") {
    return {
      shortLabel: getTranslation("chat_processing_cleaning_short", language),
      title: getTranslation("chat_processing_cleaning_title", language),
      detail: latestProgressText ?? getTranslation("chat_processing_cleaning_detail", language),
      accentClassName: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
      indicatorClassName: "bg-amber-500",
      buttonClassName: "bg-amber-600 hover:bg-amber-600 focus:ring-amber-300 disabled:cursor-wait disabled:bg-amber-600 disabled:text-white disabled:opacity-100"
    };
  }
  if (isGeneratingReport || goalState === "pending_ai" || isTaskStatusActive) {
    return {
      shortLabel: getTranslation("chat_processing_analysis_short", language),
      title: getTranslation("chat_processing_analysis_title", language),
      detail: latestProgressText ?? getTranslation("chat_processing_analysis_detail", language),
      accentClassName: "bg-violet-50 text-violet-800 ring-1 ring-violet-200",
      indicatorClassName: "bg-violet-500",
      buttonClassName: "bg-violet-600 hover:bg-violet-600 focus:ring-violet-300 disabled:cursor-wait disabled:bg-violet-600 disabled:text-white disabled:opacity-100"
    };
  }
  if (isBusy) {
    return {
      shortLabel: getTranslation("chat_processing_short", language),
      title: getTranslation("chat_processing_title", language),
      detail: latestProgressText ?? getTranslation("chat_processing_detail", language),
      accentClassName: "bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm",
      indicatorClassName: "bg-slate-500",
      buttonClassName: "bg-slate-700 hover:bg-slate-700 focus:ring-slate-300 disabled:cursor-wait disabled:bg-slate-700 disabled:text-white disabled:opacity-100"
    };
  }
  return null;
};
const ChatComposer = ({
  language,
  isAssistantBusy,
  isComposerDisabled,
  currentView,
  timelineLength,
  composerBusyState,
  composerSuggestedActions,
  analysisStatusTitle,
  hasRunningTurn,
  queuedCount,
  reportProgressLabel,
  canCancelActiveTurn,
  isCancellationPending,
  effectivePendingClarification,
  pendingMutationConfirmation,
  placeholder,
  onSend,
  onSuggestedAction,
  onCancelActiveTurn,
  onScrollNeeded
}) => {
  const [input, setInput] = reactExports.useState("");
  const textareaRef = reactExports.useRef(null);
  const isMultilineRef = reactExports.useRef(false);
  const onScrollNeededRef = reactExports.useRef(onScrollNeeded);
  onScrollNeededRef.current = onScrollNeeded;
  const disclaimerTextId = "chat-composer-disclaimer";
  const [mentionState, setMentionState] = reactExports.useState(null);
  const mentionMapRef = reactExports.useRef(/* @__PURE__ */ new Map());
  const [mentionCount, setMentionCount] = reactExports.useState(0);
  const mentionCards = reactExports.useMemo(() => {
    if (!(mentionState == null ? void 0 : mentionState.isOpen)) return [];
    return (useAppStore.getState().analysisCards ?? []).map((c) => ({
      id: c.id,
      title: resolveDisplayPlanTitle(c.plan),
      chartType: c.displayChartType ?? "bar"
    }));
  }, [mentionState == null ? void 0 : mentionState.isOpen]);
  const handleMentionSelect = reactExports.useCallback((card) => {
    var _a;
    if (!mentionState) return;
    const before = input.slice(0, mentionState.startIndex);
    const cursorPos = ((_a = textareaRef.current) == null ? void 0 : _a.selectionStart) ?? input.length;
    const after = input.slice(cursorPos);
    const displayMention = `@${card.title} `;
    mentionMapRef.current.set(card.title, card.id);
    setMentionCount((c) => c + 1);
    const newInput = before + displayMention + after;
    setInput(newInput);
    setMentionState(null);
    requestAnimationFrame(() => {
      var _a2, _b;
      const pos = before.length + displayMention.length;
      (_a2 = textareaRef.current) == null ? void 0 : _a2.setSelectionRange(pos, pos);
      (_b = textareaRef.current) == null ? void 0 : _b.focus();
    });
  }, [input, mentionState]);
  const handleMentionClose = reactExports.useCallback(() => setMentionState(null), []);
  const hasComposerInput = Boolean(input.trim());
  const canQueueComposerMessage = hasRunningTurn && !isComposerDisabled && hasComposerInput;
  const showQueueSendButton = hasRunningTurn && hasComposerInput;
  const showSecondaryCancelButton = canCancelActiveTurn && hasComposerInput;
  const canSubmitComposerMessage = !isComposerDisabled && hasComposerInput && (!isAssistantBusy || canQueueComposerMessage);
  const isSendDisabled = isComposerDisabled || isAssistantBusy && !canQueueComposerMessage || !hasComposerInput;
  const showComposerSuggestedActions = composerSuggestedActions.length > 0 && !effectivePendingClarification && !pendingMutationConfirmation;
  const primarySuggestedAction = showComposerSuggestedActions ? composerSuggestedActions[0] ?? null : null;
  const primaryActsAsCancel = canCancelActiveTurn && !showSecondaryCancelButton;
  const queueStatusTitle = hasComposerInput ? getTranslation("chat_queue_ready_title", language) : getTranslation("chat_queue_active_title", language);
  const queueStatusDetail = hasComposerInput ? getTranslation("chat_queue_ready_detail", language) : getTranslation("chat_queue_active_detail", language);
  const sendButtonTitle = showQueueSendButton ? getTranslation("chat_send_next", language) : primaryActsAsCancel ? getTranslation("cancel_run", language) : composerBusyState ? composerBusyState.detail : isAssistantBusy ? getTranslation("chat_send_locked_hint", language) : getTranslation("send_message", language);
  const sendButtonDisabled = showQueueSendButton ? isSendDisabled : primaryActsAsCancel ? isCancellationPending : isSendDisabled;
  const sendButtonLabel = showQueueSendButton ? getTranslation("chat_send_next", language) : primaryActsAsCancel ? isCancellationPending ? getTranslation("cancelling_run", language) : getTranslation("cancel_run", language) : composerBusyState ? composerBusyState.shortLabel : getTranslation("send_message", language);
  reactExports.useEffect(() => {
    var _a;
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const nextHeight = Math.min(scrollHeight, 200);
      textarea.style.height = `${nextHeight}px`;
      textarea.style.overflowY = scrollHeight > 200 ? "auto" : "hidden";
      const nextIsMultiline = scrollHeight > 40;
      if (nextIsMultiline !== isMultilineRef.current) {
        isMultilineRef.current = nextIsMultiline;
        (_a = onScrollNeededRef.current) == null ? void 0 : _a.call(onScrollNeededRef);
      }
    }
  }, [input]);
  const handleSend = (e) => {
    e.preventDefault();
    if (!canSubmitComposerMessage) return;
    let messageToSend = input.trim();
    for (const [title, cardId] of mentionMapRef.current) {
      messageToSend = messageToSend.replace(`@${title}`, `@[${title}](${cardId})`);
    }
    const remainingMentionPattern = /@([A-Z][^\n@]*?)(?=\s|$)/g;
    if (remainingMentionPattern.test(messageToSend) && !messageToSend.includes("](")) {
      const cards = useAppStore.getState().analysisCards ?? [];
      const titleToId = new Map(cards.map((c) => [resolveDisplayPlanTitle(c.plan), c.id]));
      const sortedTitles = [...titleToId.keys()].sort((a, b) => b.length - a.length);
      for (const title of sortedTitles) {
        const cardId = titleToId.get(title);
        if (messageToSend.includes(`@${title}`)) {
          messageToSend = messageToSend.replace(`@${title}`, `@[${title}](${cardId})`);
        }
      }
    }
    onSend(messageToSend);
    setInput("");
    setMentionState(null);
    mentionMapRef.current.clear();
    setMentionCount(0);
  };
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInput(newValue);
    const cursorPos = e.target.selectionStart ?? newValue.length;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    if (lastAtIndex >= 0) {
      const afterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if (/\[[^\]]*\]\([^)]*\)/.test(textBeforeCursor.slice(lastAtIndex))) {
        setMentionState(null);
        return;
      }
      const isCompletedMention = [...mentionMapRef.current.keys()].some(
        (title) => afterAt.startsWith(title)
      );
      if (isCompletedMention) {
        setMentionState(null);
        return;
      }
      if (!/\n/.test(afterAt)) {
        setMentionState({ isOpen: true, query: afterAt, startIndex: lastAtIndex });
        return;
      }
    }
    setMentionState(null);
  };
  const handleKeyDown = (e) => {
    if ((mentionState == null ? void 0 : mentionState.isOpen) && ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 md:pb-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto w-full max-w-3xl", children: [
    primarySuggestedAction && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "section",
      {
        className: "mb-2.5 rounded-card border border-blue-200 bg-blue-50/80 p-3 shadow-sm",
        "aria-label": getTranslation("chat_recommended_next_step", language),
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700", children: getTranslation("chat_recommended_next_step", language) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-blue-100", children: analysisStatusTitle ?? getTranslation("chat_current_analysis", language) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-xs leading-5 text-slate-700", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold", children: getTranslation("chat_next_step_reason_label", language) }),
            " ",
            getTranslation("chat_next_step_reason", language)
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-xs leading-5 text-slate-600", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-700", children: getTranslation("chat_next_step_outcome_label", language) }),
            " ",
            getTranslation("chat_next_step_outcome", language)
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => onSuggestedAction(resolveSuggestedActionPrompt(primarySuggestedAction)),
              disabled: isAssistantBusy,
              title: primarySuggestedAction.action || primarySuggestedAction.label,
              className: "mt-3 min-h-[44px] w-full rounded-card bg-blue-600 px-3 py-2 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 md:min-h-0",
              children: primarySuggestedAction.label
            }
          )
        ]
      }
    ),
    currentView === "analysis_dashboard" && timelineLength === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-2.5 text-xs text-slate-500", children: getTranslation("chat_focus_hint", language) }),
    hasRunningTurn && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-emerald-50 px-3 py-1.5", role: "status", "aria-live": "polite", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 items-start gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "relative mt-1 inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute inset-0 rounded-full bg-emerald-500 opacity-75 animate-ping" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 flex-col gap-0.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-medium text-emerald-700", children: queueStatusTitle }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-emerald-600", children: queueStatusDetail })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        queuedCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700", children: getTranslation("chat_queue_count", language, { count: queuedCount }) }),
        reportProgressLabel && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700", children: reportProgressLabel })
      ] })
    ] }),
    composerBusyState && !hasRunningTurn && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl px-3 py-1.5 ${composerBusyState.accentClassName}`, role: "status", "aria-live": "polite", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 items-start gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `relative mt-1 inline-flex h-2 w-2 flex-shrink-0 rounded-full ${composerBusyState.indicatorClassName}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `absolute inset-0 rounded-full opacity-75 animate-ping ${composerBusyState.indicatorClassName}` }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 flex-col gap-0.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-medium", children: composerBusyState.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs opacity-80", children: composerBusyState.detail })
        ] })
      ] }),
      reportProgressLabel && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold", children: reportProgressLabel })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
      (mentionState == null ? void 0 : mentionState.isOpen) && mentionCards.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
        CardMentionPopup,
        {
          cards: mentionCards,
          query: mentionState.query,
          onSelect: handleMentionSelect,
          onClose: handleMentionClose
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "w-full overflow-hidden rounded-2xl bg-white px-4 pb-2 pt-3 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-200 focus-within:shadow-[0_0_0_2px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.08)]",
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "form",
            {
              onSubmit: handleSend,
              className: "flex flex-col gap-1.5",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
                  mentionCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "div",
                    {
                      "aria-hidden": "true",
                      className: "pointer-events-none absolute inset-0 whitespace-pre-wrap break-words px-1 py-2 text-base leading-6",
                      style: { color: "transparent" },
                      children: renderHighlightedInput(input, mentionMapRef.current)
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "textarea",
                    {
                      ref: textareaRef,
                      name: "assistant-message",
                      rows: 1,
                      value: input,
                      onChange: handleInputChange,
                      onKeyDown: handleKeyDown,
                      placeholder,
                      disabled: isComposerDisabled,
                      "aria-describedby": disclaimerTextId,
                      className: `composer-textarea min-h-[24px] max-h-[200px] w-full resize-none bg-transparent px-1 py-2 text-base leading-6 placeholder-slate-400/60 outline-none disabled:cursor-not-allowed disabled:text-slate-400 ${mentionCount > 0 ? "text-transparent caret-slate-900" : "text-slate-900"}`
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-shrink-0 items-center justify-end gap-2", children: [
                  showSecondaryCancelButton && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: onCancelActiveTurn,
                      disabled: isCancellationPending,
                      title: getTranslation("cancel_run", language),
                      "aria-label": isCancellationPending ? getTranslation("cancelling_run", language) : getTranslation("cancel_run", language),
                      className: "flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 transition hover:bg-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300 md:h-8 md:min-h-0 md:min-w-0 md:w-8",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconStop, { className: "h-3.5 w-3.5" })
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: showQueueSendButton ? "submit" : primaryActsAsCancel ? "button" : "submit",
                      onClick: !showQueueSendButton && primaryActsAsCancel ? onCancelActiveTurn : void 0,
                      disabled: sendButtonDisabled,
                      title: sendButtonTitle,
                      className: `flex flex-shrink-0 items-center justify-center rounded-full text-white transition ${showQueueSendButton ? "min-h-[44px] min-w-[100px] gap-1.5 px-3 bg-black hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-[#d9d9d9] disabled:text-[#f4f4f4] md:h-8 md:min-h-0" : primaryActsAsCancel ? "min-h-[44px] min-w-[44px] bg-black hover:bg-gray-800 md:h-8 md:min-h-0 md:min-w-0 md:w-8" : composerBusyState ? `min-h-[44px] min-w-[88px] gap-1.5 px-3 md:h-8 md:min-h-0 ${composerBusyState.buttonClassName}` : "min-h-[44px] min-w-[44px] bg-black hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-[#d9d9d9] disabled:text-[#f4f4f4] md:h-8 md:min-h-0 md:min-w-0 md:w-8"}`,
                      "aria-label": sendButtonLabel,
                      children: showQueueSendButton ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(IconSend, { className: "h-4 w-4" }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-semibold leading-none", children: getTranslation("chat_send_next", language) })
                      ] }) : primaryActsAsCancel ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconStop, { className: "h-3.5 w-3.5" }) : composerBusyState ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(BusyButtonSpinner, {}),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-semibold leading-none", children: composerBusyState.shortLabel })
                      ] }) : isAssistantBusy ? /* @__PURE__ */ jsxRuntimeExports.jsx(BusyButtonSpinner, {}) : /* @__PURE__ */ jsxRuntimeExports.jsx(IconSend, { className: "h-4 w-4" })
                    }
                  )
                ] })
              ]
            }
          )
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { id: disclaimerTextId, className: "mt-1.5 text-center text-xs text-slate-600", children: getTranslation("chat_disclaimer_verify", language) })
  ] }) });
};
const chatDebug = (message, detail) => {
  return;
};
const getLatestComposerSuggestedActions = (chatHistory) => {
  const latestMessage = chatHistory[chatHistory.length - 1];
  if (!latestMessage || latestMessage.sender !== "ai" || latestMessage.resolved || !Array.isArray(latestMessage.suggestedActions)) {
    return [];
  }
  return latestMessage.suggestedActions.slice(0, 3);
};
const StreamingBubble = We.memo(() => {
  const streamingMessage = useAppStore((state) => state.streamingMessage, shallow$1);
  const language = useAppStore((state) => state.settings.language);
  if (!streamingMessage || !streamingMessage.isStreaming || !streamingMessage.text) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-w-0 w-full animate-fade-in", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 w-full max-w-full rounded-card p-4 text-sm xl:max-w-3xl bg-white border border-blue-200 text-slate-800 shadow-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2 text-xs text-slate-400", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-blue-500", children: getTranslation("assistant", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: streamingMessage.startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto text-blue-400 text-[10px] uppercase tracking-wider font-medium", children: getTranslation("chat_streaming", language) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-slate-700 leading-relaxed", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(MarkdownRenderer, { content: streamingMessage.text }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-block w-1.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" })
    ] })
  ] }) });
});
const ThinkingIndicator = We.memo(({ isVisible }) => {
  const [isExpanded, setIsExpanded] = reactExports.useState(false);
  const { latestProgress, language, recentMessages } = useAppStore((state) => ({
    latestProgress: state.progressMessages[state.progressMessages.length - 1] ?? null,
    language: state.settings.language,
    recentMessages: state.progressMessages.slice(-10)
  }), shallow$1);
  if (!isVisible) return null;
  const timestamp = ((latestProgress == null ? void 0 : latestProgress.timestamp) ?? /* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "animate-fade-in text-xs text-slate-500", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => setIsExpanded((prev) => !prev),
        className: "flex items-center gap-1 w-full text-left hover:text-slate-700 transition-colors",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "svg",
            {
              className: `h-3 w-3 shrink-0 text-slate-400 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`,
              viewBox: "0 0 20 20",
              fill: "currentColor",
              "aria-hidden": "true",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z", clipRule: "evenodd" })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mr-2 text-slate-400", children: timestamp }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "chat-thinking-text select-none", children: [
            getTranslation("chat_loader_thinking", language),
            "..."
          ] }) })
        ]
      }
    ),
    isExpanded && recentMessages.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 ml-5 max-h-48 overflow-y-auto space-y-1 border-l-2 border-slate-200 pl-3", children: recentMessages.map((msg) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-400 shrink-0", children: msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: msg.type === "error" ? "text-red-500" : msg.type === "warning" ? "text-amber-500" : "text-slate-500", children: msg.text })
    ] }, msg.id)) })
  ] });
});
const ChatPanel = We.memo(() => {
  const SCROLL_BOTTOM_THRESHOLD = 24;
  const {
    chatHistory,
    isBusy,
    handleChatMessage,
    isApiKeySet,
    setIsAsideVisible,
    setIsSettingsModalOpen,
    setIsMemoryPanelOpen,
    setIsAgentModalOpen,
    currentView,
    pendingClarification,
    pendingMutationConfirmation,
    goalState,
    isGeneratingReport,
    isSummaryGenerating,
    reportGenerationProgress,
    aiTaskStatus,
    cleaningRunStatus,
    language,
    activeTurnId,
    activeTurnPendingClarification,
    activeTurnStatus,
    queuedChatTurns,
    cancelRequestedTurnId,
    requestActiveTurnCancellation,
    handleShowCardFromChat
  } = useAppStore((state) => {
    var _a, _b, _c, _d;
    return {
      chatHistory: state.chatHistory,
      isBusy: state.isBusy,
      handleChatMessage: state.handleChatMessage,
      isApiKeySet: state.isApiKeySet,
      setIsAsideVisible: state.setIsAsideVisible,
      setIsSettingsModalOpen: state.setIsSettingsModalOpen,
      setIsMemoryPanelOpen: state.setIsMemoryPanelOpen,
      setIsAgentModalOpen: state.setIsAgentModalOpen,
      currentView: state.currentView,
      pendingClarification: state.pendingClarification,
      pendingMutationConfirmation: state.pendingMutationConfirmation,
      goalState: state.goalState,
      isGeneratingReport: state.isGeneratingReport,
      isSummaryGenerating: state.isSummaryGenerating,
      reportGenerationProgress: state.reportGenerationProgress,
      aiTaskStatus: state.aiTaskStatus,
      cleaningRunStatus: ((_a = state.cleaningRun) == null ? void 0 : _a.status) ?? null,
      language: state.settings.language,
      activeTurnId: ((_b = state.activeTurn) == null ? void 0 : _b.turnId) ?? null,
      activeTurnPendingClarification: ((_c = state.activeTurn) == null ? void 0 : _c.pendingClarificationRequest) ?? null,
      activeTurnStatus: ((_d = state.activeTurn) == null ? void 0 : _d.status) ?? null,
      queuedChatTurns: state.queuedChatTurns ?? [],
      cancelRequestedTurnId: state.cancelRequestedTurnId ?? null,
      requestActiveTurnCancellation: state.requestActiveTurnCancellation,
      handleShowCardFromChat: state.handleShowCardFromChat
    };
  }, shallow$1);
  const [showScrollToBottom, setShowScrollToBottom] = We.useState(false);
  const messagesContainerRef = reactExports.useRef(null);
  const messagesContentRef = reactExports.useRef(null);
  const autoScrollEnabledRef = reactExports.useRef(true);
  const scheduledScrollFrameRef = reactExports.useRef(null);
  const effectivePendingClarification = resolveEffectivePendingClarification({
    pendingClarification,
    activeTurn: activeTurnPendingClarification ? { pendingClarificationRequest: activeTurnPendingClarification } : null
  });
  const timeline = reactExports.useMemo(
    () => chatHistory.filter((message) => message.type !== "ai_thought").slice(-MAX_TIMELINE_CHAT_MESSAGES),
    [chatHistory]
  );
  const composerSuggestedActions = reactExports.useMemo(
    () => getLatestComposerSuggestedActions(chatHistory),
    [chatHistory]
  );
  const analysisStatusTitle = aiTaskStatus ? aiTaskStatus.titleKey ? getTranslation(aiTaskStatus.titleKey, language, aiTaskStatus.titleParams) : aiTaskStatus.title : null;
  const hiddenTimelineItemsCount = Math.max(0, chatHistory.length - MAX_TIMELINE_CHAT_MESSAGES);
  const hasRunningTurn = activeTurnStatus === "running";
  const isCleaningActive = cleaningRunStatus === "running";
  const isTaskStatusActive = !!aiTaskStatus && aiTaskStatus.status !== "done" && aiTaskStatus.status !== "error";
  const chatLifecycleState = useAppStore((state) => state.chatLifecycleState);
  const isAssistantBusy = chatLifecycleState !== "blocked" && !TERMINAL_CHAT_LIFECYCLE_STATES.has(chatLifecycleState) || isGeneratingReport || isSummaryGenerating || goalState === "pending_ai" || isCleaningActive || isTaskStatusActive;
  const isComposerDisabled = !isApiKeySet || currentView === "file_upload";
  const composerBusyState = reactExports.useMemo(() => {
    var _a;
    const latestText = ((_a = useAppStore.getState().progressMessages.slice(-1)[0]) == null ? void 0 : _a.text) ?? null;
    return getComposerBusyState({
      currentView,
      isBusy,
      isGeneratingReport,
      goalState,
      isTaskStatusActive,
      cleaningRunStatus,
      latestProgressText: latestText,
      language
    });
  }, [
    currentView,
    isBusy,
    isGeneratingReport,
    goalState,
    isTaskStatusActive,
    cleaningRunStatus,
    language
  ]);
  const handleSuggestedAction = reactExports.useCallback((prompt, label) => {
    void handleChatMessage(prompt, { source: "action", displayText: label });
  }, [handleChatMessage]);
  const handleSelectCsv = reactExports.useCallback(() => {
    const fileInput = document.getElementById("file-upload");
    if (fileInput instanceof HTMLInputElement && !fileInput.disabled) {
      fileInput.click();
    }
  }, []);
  const renderedTimeline = reactExports.useMemo(() => timeline.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx(
    MessageRenderer,
    {
      item,
      onShowCardFromChat: handleShowCardFromChat
    },
    item.id
  )), [timeline, handleShowCardFromChat]);
  const canCancelActiveTurn = isAssistantBusy && activeTurnStatus === "running";
  const isCancellationPending = hasRunningTurn && cancelRequestedTurnId === activeTurnId;
  const reportProgressLabel = isGeneratingReport && reportGenerationProgress ? `${reportGenerationProgress.completed}/${reportGenerationProgress.total}` : null;
  const updateScrollTracking = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const scrollHeight = container.scrollHeight;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD;
    autoScrollEnabledRef.current = isNearBottom;
    setShowScrollToBottom(!isNearBottom);
  };
  const cancelScheduledAutoScroll = () => {
    if (scheduledScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scheduledScrollFrameRef.current);
      scheduledScrollFrameRef.current = null;
    }
  };
  const scrollToBottom = (behavior = "smooth") => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const targetTop = container.scrollHeight;
    container.scrollTo({ top: targetTop, behavior });
    autoScrollEnabledRef.current = true;
    setShowScrollToBottom(false);
  };
  const scheduleAutoScroll = (behavior = "auto") => {
    cancelScheduledAutoScroll();
    scheduledScrollFrameRef.current = window.requestAnimationFrame(() => {
      scheduledScrollFrameRef.current = null;
      scrollToBottom(behavior);
    });
  };
  reactExports.useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    autoScrollEnabledRef.current = true;
    updateScrollTracking();
  }, []);
  reactExports.useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (!autoScrollEnabledRef.current) {
      updateScrollTracking();
      return;
    }
    scheduleAutoScroll("auto");
  }, [timeline, isAssistantBusy]);
  reactExports.useEffect(() => {
    const content = messagesContentRef.current;
    if (!content || typeof ResizeObserver === "undefined") {
      return void 0;
    }
    let resizeRafId = null;
    const observer = new ResizeObserver(() => {
      if (resizeRafId !== null) return;
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = null;
        if (!autoScrollEnabledRef.current) {
          updateScrollTracking();
          return;
        }
        scheduleAutoScroll("auto");
      });
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
    };
  }, []);
  reactExports.useEffect(() => () => {
    cancelScheduledAutoScroll();
  }, []);
  reactExports.useEffect(() => {
    chatDebug("Composer gate state changed.", {
      pendingClarificationQuestion: (effectivePendingClarification == null ? void 0 : effectivePendingClarification.question) ?? null,
      queuedChatTurns: queuedChatTurns.length,
      composerBusyTitle: (composerBusyState == null ? void 0 : composerBusyState.title) ?? null,
      composerBusyDetail: (composerBusyState == null ? void 0 : composerBusyState.detail) ?? null
    });
  }, [
    isAssistantBusy,
    isComposerDisabled,
    activeTurnStatus,
    hasRunningTurn,
    effectivePendingClarification,
    pendingMutationConfirmation,
    currentView,
    isApiKeySet,
    queuedChatTurns.length,
    composerBusyState
  ]);
  const getPlaceholder = () => {
    if (!isApiKeySet) {
      return shouldAllowSettingsSurface() ? getTranslation("chat_placeholder_api_key", language) : getTranslation("chat_placeholder_api_key_managed", language);
    }
    if (isGeneratingReport) return getTranslation("chat_placeholder_auto_analysis", language);
    if (goalState === "awaiting_user_confirmation") return getTranslation("chat_placeholder_confirm_goal", language);
    if (effectivePendingClarification) {
      return effectivePendingClarification.allowFreeText ? effectivePendingClarification.question : getTranslation("chat_placeholder_clarification", language);
    }
    if (pendingMutationConfirmation) return getTranslation("chat_placeholder_mutation_confirmation", language);
    switch (currentView) {
      case "analysis_dashboard":
        return getTranslation("chat_placeholder_auto_analysis_ready", language);
      case "file_upload":
      default:
        return getTranslation("chat_placeholder_upload", language);
    }
  };
  const handleComposerScrollNeeded = reactExports.useCallback(() => {
    if (!autoScrollEnabledRef.current) return;
    scheduleAutoScroll("auto");
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col rounded-card bg-slate-100 md:rounded-none", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ChatPanelHeader,
      {
        language,
        isAssistantBusy,
        showMemoryPanel: shouldShowLongTermMemory(),
        showAgentThinking: shouldShowAgentThinkingModal(),
        showSettings: shouldShowSettingsButton(),
        onOpenMemory: () => setIsMemoryPanelOpen(true),
        onOpenAgent: () => setIsAgentModalOpen(true),
        onOpenSettings: () => setIsSettingsModalOpen(true),
        onHidePanel: () => setIsAsideVisible(false)
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex-1 min-h-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          ref: messagesContainerRef,
          onScroll: updateScrollTracking,
          className: "h-full overflow-y-auto p-4",
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              ref: messagesContentRef,
              className: `space-y-4 ${currentView === "file_upload" && timeline.length === 0 ? "h-full" : ""}`,
              children: [
                currentView === "file_upload" && timeline.length === 0 && !isAssistantBusy && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "section",
                  {
                    "aria-labelledby": "assistant-upload-title",
                    className: "flex h-full flex-col items-center justify-center px-3 text-center",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700", children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.75", className: "h-6 w-6", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-3" }) }) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { id: "assistant-upload-title", className: "mt-4 text-base font-semibold text-slate-900", children: getTranslation("assistant_empty_title", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 max-w-xs text-sm leading-6 text-slate-600", children: getTranslation("assistant_empty_description", language) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-4 w-full max-w-xs space-y-2 text-left text-sm text-slate-700", children: [
                        "assistant_empty_capability_fields",
                        "assistant_empty_capability_quality",
                        "assistant_empty_capability_questions"
                      ].map((key) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-2", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "2", className: "mt-0.5 h-4 w-4 shrink-0 text-emerald-600", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "m4 10 3.5 3.5L16 5" }) }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation(key, language) })
                      ] }, key)) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          type: "button",
                          onClick: handleSelectCsv,
                          className: "mt-5 min-h-[44px] rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2",
                          children: getTranslation("assistant_empty_select_csv", language)
                        }
                      )
                    ]
                  }
                ),
                hiddenTimelineItemsCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500", children: "Showing recent activity for performance. Older conversation remains saved." }),
                renderedTimeline,
                /* @__PURE__ */ jsxRuntimeExports.jsx(StreamingBubble, {}),
                /* @__PURE__ */ jsxRuntimeExports.jsx(ThinkingIndicator, { isVisible: isAssistantBusy })
              ]
            }
          )
        }
      ),
      showScrollToBottom && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => scrollToBottom("smooth"),
          className: "absolute bottom-4 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-lg transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300",
          "aria-label": getTranslation("scroll_to_latest", language),
          title: getTranslation("scroll_to_latest", language),
          children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-4 w-4", viewBox: "0 0 20 20", fill: "currentColor", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M10 14a1 1 0 0 1-.707-.293l-4-4a1 1 0 1 1 1.414-1.414L10 11.586l3.293-3.293a1 1 0 0 1 1.414 1.414l-4 4A1 1 0 0 1 10 14Z", clipRule: "evenodd" }) })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ChatComposer,
      {
        language,
        isApiKeySet,
        isAssistantBusy,
        isComposerDisabled,
        isGeneratingReport,
        currentView,
        timelineLength: timeline.length,
        composerBusyState,
        composerSuggestedActions,
        analysisStatusTitle,
        hasRunningTurn,
        queuedCount: queuedChatTurns.length,
        reportProgressLabel,
        canCancelActiveTurn,
        isCancellationPending,
        effectivePendingClarification,
        pendingMutationConfirmation,
        placeholder: getPlaceholder(),
        onSend: (msg) => {
          handleChatMessage(msg, { source: "composer" });
        },
        onSuggestedAction: handleSuggestedAction,
        onCancelActiveTurn: requestActiveTurnCancellation,
        onScrollNeeded: handleComposerScrollNeeded
      }
    )
  ] });
});
export {
  ChatPanel
};
