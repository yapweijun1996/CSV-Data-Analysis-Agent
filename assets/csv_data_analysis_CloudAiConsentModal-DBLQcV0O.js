import { a as reactExports, j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-LvY-J6mW.js";
import { u as useAppStore, d as useDialogAccessibility } from "./csv_data_analysis_index-L92MBGHW.js";
import { U as getTranslation } from "./csv_data_analysis_app-agent-DytoEScF.js";
import "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
const getProviderLabel = (provider, language) => {
  if (provider === "default") {
    return getTranslation("cloud_ai_provider_default", language);
  }
  if (provider === "google") return "Google Gemini";
  return "OpenAI";
};
const CloudAiConsentModal = () => {
  const {
    request,
    consentError,
    language,
    resolveConsent
  } = useAppStore((state) => ({
    request: state.pendingCloudAiConsent,
    consentError: state.cloudAiConsentError,
    language: state.settings.language,
    resolveConsent: state.resolveCloudAiConsent
  }), shallow$1);
  const [isSaving, setIsSaving] = reactExports.useState(false);
  const isOpen = Boolean(request);
  const handleDecline = reactExports.useCallback(() => {
    if (!isSaving) void resolveConsent(false);
  }, [isSaving, resolveConsent]);
  const dialogRef = useDialogAccessibility(isOpen, handleDecline);
  if (!request) return null;
  const handleAccept = async () => {
    setIsSaving(true);
    try {
      await resolveConsent(true);
    } finally {
      setIsSaving(false);
    }
  };
  const providerLabel = getProviderLabel(request.provider, language);
  const sensitiveWarning = request.sensitiveDataWarning ?? null;
  const disclosures = [
    ["cloud_ai_consent_sent_title", "cloud_ai_consent_sent_detail"],
    ["cloud_ai_consent_storage_title", "cloud_ai_consent_storage_detail"],
    ["cloud_ai_consent_sensitive_title", "cloud_ai_consent_sensitive_detail"]
  ];
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4",
      onClick: handleDecline,
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          ref: dialogRef,
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "cloud-ai-consent-title",
          "aria-describedby": "cloud-ai-consent-description",
          tabIndex: -1,
          className: "flex max-h-[90vh] w-full max-w-lg flex-col rounded-card border border-slate-200 bg-white shadow-2xl",
          onClick: (event) => event.stopPropagation(),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "border-b border-slate-200 px-5 py-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "cloud-ai-consent-title", className: "text-xl font-bold text-slate-950", children: getTranslation("cloud_ai_consent_title", language) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { id: "cloud-ai-consent-description", className: "mt-2 text-sm leading-6 text-slate-600", children: getTranslation("cloud_ai_consent_intro", language, { provider: providerLabel }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 overflow-y-auto px-5 py-4", children: [
              sensitiveWarning && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { role: "alert", className: "rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: "font-semibold", children: getTranslation("cloud_ai_sensitive_detected_title", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 leading-5", children: getTranslation("cloud_ai_sensitive_detected_detail", language, {
                  count: sensitiveWarning.matchedColumns.length
                }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 break-words text-xs leading-5", children: getTranslation("cloud_ai_sensitive_detected_columns", language, {
                  columns: sensitiveWarning.matchedColumns.join(", ")
                }) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3", children: disclosures.map(([titleKey, detailKey]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-2 text-sm leading-5 text-slate-700", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", className: "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("strong", { className: "font-semibold text-slate-900", children: [
                    getTranslation(titleKey, language),
                    ":"
                  ] }),
                  " ",
                  getTranslation(detailKey, language)
                ] })
              ] }, titleKey)) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs leading-5 text-slate-600", children: getTranslation(
                sensitiveWarning ? "cloud_ai_consent_sensitive_once" : "cloud_ai_consent_once",
                language,
                { provider: providerLabel }
              ) }),
              consentError && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800", children: getTranslation("cloud_ai_consent_save_error", language) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-3 sm:flex-row sm:justify-end", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  "data-dialog-initial-focus": true,
                  onClick: handleDecline,
                  disabled: isSaving,
                  className: "min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60",
                  children: getTranslation("cloud_ai_consent_decline", language)
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: () => void handleAccept(),
                  disabled: isSaving,
                  className: "min-h-[44px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60",
                  children: getTranslation("cloud_ai_consent_accept", language)
                }
              )
            ] })
          ]
        }
      )
    }
  );
};
export {
  CloudAiConsentModal
};
