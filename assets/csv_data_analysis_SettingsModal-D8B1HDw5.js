import { a as reactExports, j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-LvY-J6mW.js";
import { u as useAppStore, f as usePwaLifecycle, d as useDialogAccessibility, r as refreshPwaStorageEstimate } from "./csv_data_analysis_index-L92MBGHW.js";
import { U as getTranslation, bm as DEFAULT_GATEWAY_MODEL, bn as GOOGLE_MODELS, bo as OPENAI_MODELS, bp as DEFAULT_FALLBACK_MODEL, bq as SUPPORTED_APP_LANGUAGES, br as DEFAULT_MAX_AGENT_TURNS, bs as MAX_MAX_AGENT_TURNS, bt as MIN_MAX_AGENT_TURNS, bu as DEFAULT_TOOL_OUTPUT_CUTOFF, bv as MAX_TOOL_OUTPUT_CUTOFF, bw as MIN_TOOL_OUTPUT_CUTOFF, bx as DEFAULT_GOOGLE_MODEL, aZ as createProviderModel, by as clearCloudAiConsentRuntimeDecisions, bz as clearAllLocalBrowserData } from "./csv_data_analysis_app-agent-DytoEScF.js";
import { g as generateText } from "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
const Combobox = ({
  id,
  name,
  value,
  options,
  onChange,
  className,
  placeholder
}) => {
  const listboxId = reactExports.useId();
  const rootRef = reactExports.useRef(null);
  const [isOpen, setIsOpen] = reactExports.useState(false);
  const [activeIndex, setActiveIndex] = reactExports.useState(-1);
  const [isFiltering, setIsFiltering] = reactExports.useState(false);
  const filteredOptions = reactExports.useMemo(() => {
    if (!isFiltering) return options;
    const query = value.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.toLowerCase().includes(query));
  }, [isFiltering, options, value]);
  reactExports.useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex(filteredOptions.length > 0 ? 0 : -1);
  }, [filteredOptions, isOpen]);
  reactExports.useEffect(() => {
    const handlePointerDown = (event) => {
      var _a;
      if (!((_a = rootRef.current) == null ? void 0 : _a.contains(event.target))) {
        setIsOpen(false);
        setIsFiltering(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);
  const emitChange = (nextValue) => {
    const syntheticEvent = {
      target: { name, value: nextValue }
    };
    onChange(syntheticEvent);
  };
  const handleSelect = (nextValue) => {
    emitChange(nextValue);
    setIsOpen(false);
    setIsFiltering(false);
  };
  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setIsFiltering(false);
      setActiveIndex((prev) => {
        if (filteredOptions.length === 0) return -1;
        return prev < filteredOptions.length - 1 ? prev + 1 : 0;
      });
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setIsFiltering(false);
      setActiveIndex((prev) => {
        if (filteredOptions.length === 0) return -1;
        return prev > 0 ? prev - 1 : filteredOptions.length - 1;
      });
      return;
    }
    if (event.key === "Enter" && isOpen && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(filteredOptions[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      setIsOpen(false);
      setIsFiltering(false);
      return;
    }
    if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete") {
      setIsFiltering(true);
      setIsOpen(true);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: rootRef, className: "relative mt-1", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        id,
        name,
        type: "text",
        value,
        placeholder,
        autoComplete: "off",
        role: "combobox",
        "aria-autocomplete": "list",
        "aria-expanded": isOpen,
        "aria-controls": listboxId,
        "aria-activedescendant": activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : void 0,
        onChange: (event) => {
          onChange(event);
          setIsOpen(true);
          setIsFiltering(true);
        },
        onFocus: () => {
          setIsOpen(true);
          setIsFiltering(false);
        },
        onClick: () => {
          setIsOpen(true);
          setIsFiltering(false);
        },
        onKeyDown: handleKeyDown,
        className
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        "aria-label": "Toggle options",
        onClick: () => {
          setIsFiltering(false);
          setIsOpen((prev) => !prev);
        },
        className: "absolute inset-y-0 right-0 flex items-center px-3 text-slate-500",
        children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `transition-transform ${isOpen ? "rotate-180" : ""}`, children: "▾" })
      }
    ),
    isOpen && filteredOptions.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "ul",
      {
        id: listboxId,
        role: "listbox",
        className: "absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg",
        children: filteredOptions.map((option, index) => {
          const isActive = index === activeIndex;
          const isSelected = option === value;
          return /* @__PURE__ */ jsxRuntimeExports.jsx("li", { role: "presentation", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              id: `${listboxId}-option-${index}`,
              type: "button",
              role: "option",
              "aria-selected": isSelected,
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => handleSelect(option),
              className: `flex w-full items-center px-3 py-2 text-left text-sm ${isActive ? "bg-blue-50 text-blue-700" : "text-slate-700"} ${isSelected ? "font-semibold" : ""}`,
              children: option
            }
          ) }, option);
        })
      }
    )
  ] });
};
const languages = SUPPORTED_APP_LANGUAGES;
const googleModels = [...GOOGLE_MODELS];
const openAIModels = [...OPENAI_MODELS];
const numericSettingNames = /* @__PURE__ */ new Set(["maxAgentTurns", "toolOutputCutoff"]);
const reasoningEffortLevels = ["off", "low", "medium", "high"];
const SettingsModal = () => {
  const { isOpen, setIsSettingsModalOpen, onSave, currentSettings } = useAppStore((state) => ({
    isOpen: state.isSettingsModalOpen,
    setIsSettingsModalOpen: state.setIsSettingsModalOpen,
    onSave: state.handleSaveSettings,
    currentSettings: state.settings
  }), shallow$1);
  const onClose = reactExports.useCallback(() => setIsSettingsModalOpen(false), [setIsSettingsModalOpen]);
  const [settings, setSettings] = reactExports.useState(currentSettings);
  const [validationError, setValidationError] = reactExports.useState(null);
  const [testStatus, setTestStatus] = reactExports.useState("idle");
  const [testMessage, setTestMessage] = reactExports.useState("");
  const [showClearConfirmation, setShowClearConfirmation] = reactExports.useState(false);
  const [isClearingLocalData, setIsClearingLocalData] = reactExports.useState(false);
  const [clearLocalDataError, setClearLocalDataError] = reactExports.useState(false);
  const language = settings.language;
  const pwaLifecycle = usePwaLifecycle();
  const dialogRef = useDialogAccessibility(isOpen, onClose);
  reactExports.useEffect(() => {
    setSettings(currentSettings);
    setValidationError(null);
    setTestStatus("idle");
    setTestMessage("");
    setShowClearConfirmation(false);
    setIsClearingLocalData(false);
    setClearLocalDataError(false);
    if (isOpen) void refreshPwaStorageEstimate();
  }, [currentSettings, isOpen]);
  const storageUsageLabel = pwaLifecycle.storageUsageBytes === null ? getTranslation("settings_storage_usage_unavailable", language) : getTranslation("settings_storage_usage_value", language, {
    usage: (pwaLifecycle.storageUsageBytes / (1024 * 1024)).toFixed(1),
    quota: pwaLifecycle.storageQuotaBytes === null ? "—" : (pwaLifecycle.storageQuotaBytes / (1024 * 1024)).toFixed(0)
  });
  const handleTestConnection = async () => {
    const apiKey = settings.provider === "default" ? "configured" : settings.provider === "google" ? settings.geminiApiKey.trim() : settings.openAIApiKey.trim();
    if (!apiKey) {
      setTestStatus("fail");
      setTestMessage(getTranslation("settings_api_key_required_error", language, {
        provider: settings.provider === "google" ? "Gemini" : "OpenAI"
      }));
      return;
    }
    const testModelId = settings.provider === "default" ? DEFAULT_GATEWAY_MODEL : settings.simpleModel;
    setTestStatus("testing");
    setTestMessage("");
    try {
      const { model } = createProviderModel(
        settings,
        testModelId,
        { requireDataConsent: false }
      );
      const result = await generateText({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }]
      });
      if (result.text) {
        setTestStatus("success");
        setTestMessage(getTranslation("settings_test_connection_success", language, { model: testModelId }));
      } else {
        throw new Error("Empty response");
      }
    } catch (err) {
      setTestStatus("fail");
      const errorMsg = err instanceof Error ? err.message : String(err);
      setTestMessage(getTranslation("settings_test_connection_fail", language, { error: errorMsg }));
    }
  };
  if (!isOpen) {
    return null;
  }
  const handleSave = () => {
    if (settings.provider !== "default") {
      const activeApiKey = settings.provider === "google" ? settings.geminiApiKey.trim() : settings.openAIApiKey.trim();
      if (!activeApiKey) {
        setValidationError(getTranslation("settings_api_key_required_error", language, {
          provider: settings.provider === "google" ? "Gemini" : "OpenAI"
        }));
        return;
      }
    }
    onSave(settings);
    setValidationError(null);
    onClose();
  };
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (numericSettingNames.has(name)) {
      const parsedValue = Number(value);
      if (!Number.isFinite(parsedValue)) {
        return;
      }
      setValidationError(null);
      setSettings((prev) => ({ ...prev, [name]: Math.trunc(parsedValue) }));
      return;
    }
    setValidationError(null);
    setSettings((prev) => ({ ...prev, [name]: value }));
  };
  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setValidationError(null);
    setSettings((prev) => ({ ...prev, [name]: checked }));
  };
  const handleClearAllLocalData = async () => {
    setIsClearingLocalData(true);
    setClearLocalDataError(false);
    try {
      clearCloudAiConsentRuntimeDecisions();
      await clearAllLocalBrowserData();
      window.location.reload();
    } catch {
      setClearLocalDataError(true);
      setIsClearingLocalData(false);
    }
  };
  const handleProviderChange = (provider) => {
    setValidationError(null);
    setSettings((prev) => {
      if (provider === "google") {
        return {
          ...prev,
          provider,
          simpleModel: DEFAULT_GOOGLE_MODEL,
          complexModel: DEFAULT_GOOGLE_MODEL,
          fallbackModel: DEFAULT_FALLBACK_MODEL.google
        };
      }
      if (provider === "openai") {
        return {
          ...prev,
          provider,
          simpleModel: "gpt-5-mini",
          complexModel: "gpt-5.2",
          fallbackModel: DEFAULT_FALLBACK_MODEL.openai
        };
      }
      return {
        ...prev,
        provider,
        simpleModel: DEFAULT_GATEWAY_MODEL,
        complexModel: DEFAULT_GATEWAY_MODEL,
        fallbackModel: void 0
      };
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900 bg-opacity-50 p-4",
      onClick: onClose,
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          ref: dialogRef,
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "settings-dialog-title",
          tabIndex: -1,
          className: "flex max-h-[80vh] w-full max-w-md flex-col rounded-card border border-slate-200 bg-white shadow-xl",
          onClick: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "shrink-0 border-b border-slate-200 px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "settings-dialog-title", className: "text-2xl font-bold text-slate-900", children: getTranslation("settings_title", language) }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-grow overflow-y-auto p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "mb-1 block text-sm font-medium text-slate-700", children: getTranslation("settings_ai_provider", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2 rounded-card bg-slate-200 p-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => handleProviderChange("default"), className: `w-full rounded-md py-1.5 text-sm font-medium transition-colors ${settings.provider === "default" ? "bg-blue-600 text-white shadow" : "text-slate-700 hover:bg-slate-300"}`, children: getTranslation("settings_ai_provider_default_label", language) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => handleProviderChange("google"), className: `w-full rounded-md py-1.5 text-sm font-medium transition-colors ${settings.provider === "google" ? "bg-blue-600 text-white shadow" : "text-slate-700 hover:bg-slate-300"}`, children: "Google Gemini" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => handleProviderChange("openai"), className: `w-full rounded-md py-1.5 text-sm font-medium transition-colors ${settings.provider === "openai" ? "bg-blue-600 text-white shadow" : "text-slate-700 hover:bg-slate-300"}`, children: "OpenAI" })
                ] })
              ] }),
              settings.provider === "default" && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500 rounded-md border border-slate-200 bg-slate-50 px-3 py-2", children: getTranslation("settings_ai_provider_default_hint", language, { model: DEFAULT_GATEWAY_MODEL }) }),
              settings.provider === "google" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "geminiApiKey", className: "block text-sm font-medium text-slate-700", children: getTranslation("settings_gemini_api_key", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "password",
                    id: "geminiApiKey",
                    name: "geminiApiKey",
                    value: settings.geminiApiKey,
                    onChange: handleInputChange,
                    "aria-invalid": validationError ? "true" : "false",
                    className: "mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500",
                    placeholder: getTranslation("settings_enter_api_key", language)
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
                  getTranslation("settings_get_key_from", language, { provider: "Google AI Studio" }),
                  " ",
                  /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: "https://aistudio.google.com/app/apikey", target: "_blank", rel: "noopener noreferrer", className: "text-blue-600 hover:underline", children: "Google AI Studio" }),
                  "."
                ] })
              ] }),
              settings.provider === "openai" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "openAIApiKey", className: "block text-sm font-medium text-slate-700", children: getTranslation("settings_openai_api_key", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "password",
                    id: "openAIApiKey",
                    name: "openAIApiKey",
                    value: settings.openAIApiKey,
                    onChange: handleInputChange,
                    "aria-invalid": validationError ? "true" : "false",
                    className: "mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500",
                    placeholder: getTranslation("settings_enter_openai_api_key", language)
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-slate-500 mt-1", children: [
                  getTranslation("settings_get_key_from", language, { provider: "OpenAI Platform" }),
                  " ",
                  /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: "https://platform.openai.com/api-keys", target: "_blank", rel: "noopener noreferrer", className: "text-blue-600 hover:underline", children: "OpenAI Platform" }),
                  "."
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: handleTestConnection,
                    disabled: testStatus === "testing",
                    className: `w-full rounded-md py-1.5 text-sm font-medium transition-colors ${testStatus === "testing" ? "bg-slate-300 text-slate-500 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-700"}`,
                    children: testStatus === "testing" ? getTranslation("settings_test_connection_testing", language) : getTranslation("settings_test_connection", language)
                  }
                ),
                testMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `mt-1.5 rounded-md border px-3 py-2 text-sm ${testStatus === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`, children: testMessage })
              ] }),
              validationError && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700", children: validationError }),
              settings.provider !== "default" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "simpleModel", className: "block text-sm font-medium text-slate-700", children: getTranslation("settings_simple_model", language) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    Combobox,
                    {
                      id: "simpleModel",
                      name: "simpleModel",
                      value: settings.simpleModel,
                      onChange: handleInputChange,
                      options: settings.provider === "google" ? googleModels : openAIModels,
                      className: "mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500 mt-1", children: getTranslation("settings_simple_model_hint", language) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "complexModel", className: "block text-sm font-medium text-slate-700", children: getTranslation("settings_complex_model", language) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    Combobox,
                    {
                      id: "complexModel",
                      name: "complexModel",
                      value: settings.complexModel,
                      onChange: handleInputChange,
                      options: settings.provider === "google" ? googleModels : openAIModels,
                      className: "mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500 mt-1", children: getTranslation("settings_complex_model_hint", language) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "fallbackModel", className: "block text-sm font-medium text-slate-700", children: getTranslation("settings_fallback_model", language) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    Combobox,
                    {
                      id: "fallbackModel",
                      name: "fallbackModel",
                      value: settings.fallbackModel || DEFAULT_FALLBACK_MODEL[settings.provider] || "",
                      onChange: handleInputChange,
                      options: settings.provider === "google" ? googleModels : openAIModels,
                      className: "mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500 mt-1", children: getTranslation("settings_fallback_model_hint", language) })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "reasoningEffort", className: "block text-sm font-medium text-slate-700", children: getTranslation("settings_reasoning_effort", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "select",
                  {
                    id: "reasoningEffort",
                    name: "reasoningEffort",
                    value: settings.reasoningEffort ?? "medium",
                    onChange: handleInputChange,
                    className: "mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500",
                    children: reasoningEffortLevels.map((level) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: level, children: getTranslation(`settings_reasoning_effort_${level}`, language) }, level))
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500 mt-1", children: getTranslation("settings_reasoning_effort_hint", language) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "language", className: "block text-sm font-medium text-slate-700", children: getTranslation("settings_agent_language", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Combobox,
                  {
                    id: "language",
                    name: "language",
                    value: settings.language,
                    onChange: handleInputChange,
                    options: languages,
                    className: "mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500 mt-1", children: getTranslation("settings_agent_language_hint", language) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex items-start", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-6 items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    id: "autoConfirmGoal",
                    name: "autoConfirmGoal",
                    type: "checkbox",
                    checked: settings.autoConfirmGoal,
                    onChange: handleCheckboxChange,
                    className: "h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  }
                ) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-2 space-y-1 text-sm leading-6", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "autoConfirmGoal", className: "font-medium text-slate-900", children: getTranslation("settings_auto_confirm_goal", language) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500", children: getTranslation("settings_auto_confirm_goal_hint", language) })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 p-4", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-slate-900", children: getTranslation("settings_conversation_limits", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 space-y-4", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "maxAgentTurns", className: "block text-sm font-medium text-slate-700", children: getTranslation("settings_max_agent_turns", language) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "number",
                        id: "maxAgentTurns",
                        name: "maxAgentTurns",
                        min: MIN_MAX_AGENT_TURNS,
                        max: MAX_MAX_AGENT_TURNS,
                        value: settings.maxAgentTurns ?? DEFAULT_MAX_AGENT_TURNS,
                        onChange: handleInputChange,
                        className: "mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500 mt-1", children: getTranslation("settings_max_agent_turns_hint", language, { min: MIN_MAX_AGENT_TURNS, max: MAX_MAX_AGENT_TURNS }) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "toolOutputCutoff", className: "block text-sm font-medium text-slate-700", children: getTranslation("settings_tool_output_cutoff", language) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "number",
                        id: "toolOutputCutoff",
                        name: "toolOutputCutoff",
                        min: MIN_TOOL_OUTPUT_CUTOFF,
                        max: MAX_TOOL_OUTPUT_CUTOFF,
                        value: settings.toolOutputCutoff ?? DEFAULT_TOOL_OUTPUT_CUTOFF,
                        onChange: handleInputChange,
                        className: "mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500 mt-1", children: getTranslation("settings_tool_output_cutoff_hint", language, { min: MIN_TOOL_OUTPUT_CUTOFF, max: MAX_TOOL_OUTPUT_CUTOFF }) })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-red-200 bg-red-50 p-4", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-slate-950", children: getTranslation("settings_local_data_title", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs leading-5 text-slate-700", children: getTranslation("settings_local_data_detail", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs font-medium text-slate-700", children: storageUsageLabel }),
                !showClearConfirmation ? /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      setShowClearConfirmation(true);
                      setClearLocalDataError(false);
                    },
                    className: "mt-3 min-h-[44px] rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100",
                    children: getTranslation("settings_clear_local_data", language)
                  }
                ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-lg border border-red-300 bg-white p-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm leading-6 text-red-900", children: getTranslation("settings_clear_local_data_confirm", language) }),
                  clearLocalDataError && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "mt-2 text-sm font-medium text-red-800", children: getTranslation("settings_clear_local_data_error", language) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex flex-col-reverse gap-2 sm:flex-row", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        type: "button",
                        onClick: () => setShowClearConfirmation(false),
                        disabled: isClearingLocalData,
                        className: "min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60",
                        children: getTranslation("settings_clear_local_data_cancel", language)
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        type: "button",
                        onClick: () => void handleClearAllLocalData(),
                        disabled: isClearingLocalData,
                        className: "min-h-[44px] rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60",
                        children: isClearingLocalData ? getTranslation("settings_clear_local_data_clearing", language) : getTranslation("settings_clear_local_data_action", language)
                      }
                    )
                  ] })
                ] })
              ] })
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("footer", { className: "shrink-0 border-t border-slate-200 px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: onClose,
                  className: "rounded-md bg-slate-200 px-3 py-1.5 text-slate-800 transition-colors hover:bg-slate-300",
                  children: getTranslation("settings_cancel", language)
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: handleSave,
                  className: "rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-blue-700",
                  children: getTranslation("settings_save", language)
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
  SettingsModal
};
