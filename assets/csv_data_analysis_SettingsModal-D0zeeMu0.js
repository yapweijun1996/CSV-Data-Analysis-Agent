import { a as reactExports, j as jsxRuntimeExports, W as We } from "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import { s as shallow$1 } from "./csv_data_analysis_vendor-state-CMf1uPe1.js";
import { u as useAppStore, i as usePwaLifecycle, e as useDialogAccessibility, r as refreshPwaStorageEstimate } from "./csv_data_analysis_index-DfWqDXZ0.js";
import { cS as subscribeUserSkills, cT as getUserSkillsSnapshot, cU as resolveSkillEntries, ad as getTranslation, cV as setSkillEnabled, cW as serializeSkillMarkdown, cX as removeUserSkill, cY as saveEditedUserSkill, cZ as importUserSkills, c_ as listMcpConnections, c$ as subscribeMcpConnections, d0 as disconnectMcp, d1 as forgetMcpCredential, d2 as removeMcp, d3 as setMcpToolGrant, d4 as normalizeHttpMcpConfig, W as captureSessionScope, d5 as setMcpBearerCredential, d6 as beginMcpOAuth, Y as ownsSessionScope, d7 as registerSessionResource, d8 as configureHttpMcp, d9 as mcpAuthorization, da as DEFAULT_GATEWAY_MODEL, db as GOOGLE_MODELS, dc as OPENAI_MODELS, dd as DEFAULT_FALLBACK_MODEL, de as SUPPORTED_APP_LANGUAGES, df as DEFAULT_MAX_AGENT_TURNS, dg as MAX_MAX_AGENT_TURNS, dh as MIN_MAX_AGENT_TURNS, di as DEFAULT_TOOL_OUTPUT_CUTOFF, dj as MAX_TOOL_OUTPUT_CUTOFF, dk as MIN_TOOL_OUTPUT_CUTOFF, dl as DEFAULT_GOOGLE_MODEL, cl as createProviderModel, dm as clearCloudAiConsentRuntimeDecisions, dn as clearAllLocalBrowserData } from "./csv_data_analysis_app-agent-BUnEDAJa.js";
import { g as generateText } from "./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import "./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js";
import "./csv_data_analysis_vendor-ai-google-DYdleeb9.js";
import "./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js";
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
const EXAMPLE_SKILL = `---
name: house-style
description: Use when writing summaries for our leadership team.
---

Lead with the decision, then the evidence. Keep numbers to two figures.`;
const downloadSkill = (name, text) => {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.md`;
    link.click();
    URL.revokeObjectURL(url);
  } catch {
  }
};
const AgentSkillsSection = ({ language }) => {
  const snapshot = reactExports.useSyncExternalStore(subscribeUserSkills, getUserSkillsSnapshot, getUserSkillsSnapshot);
  const { entries } = We.useMemo(() => resolveSkillEntries({}), [snapshot]);
  const fileInputRef = reactExports.useRef(null);
  const folderInputRef = reactExports.useRef(null);
  const [lastImport, setLastImport] = reactExports.useState(null);
  const [editing, setEditing] = reactExports.useState(null);
  const builtinNames = We.useMemo(
    () => new Set(resolveSkillEntries({}, {}).entries.map((entry) => entry.skill.name)),
    []
  );
  const handleFiles = async (event) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (files.length === 0) return;
    if (files.length > 512 || files.reduce((bytes, file) => bytes + file.size, 0) > 8 * 1024 * 1024) {
      setLastImport({ added: [], rejected: [{ fileName: "Selected files", reason: "Import at most 512 files and 8 MiB." }] });
      return;
    }
    const loaded = await Promise.all(files.map(async (file) => ({ fileName: file.webkitRelativePath || file.name, text: await file.text() })));
    setLastImport(importUserSkills(loaded));
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-card border border-slate-200 bg-slate-50 p-4", "data-agent-skills-section": "true", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-slate-900", children: getTranslation("settings_skills_title", language) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs leading-5 text-slate-600", children: getTranslation("settings_skills_detail", language) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white", children: entries.map(({ skill, source, enabled, supportingSources }) => {
      var _a;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "px-3 py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "checkbox",
              role: "switch",
              checked: enabled,
              onChange: (event) => setSkillEnabled(skill.name, event.target.checked),
              "aria-label": getTranslation("settings_skills_toggle_label", language, { name: skill.name }),
              className: "mt-1 h-4 w-4 shrink-0"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `min-w-0 flex-1 ${enabled ? "" : "opacity-60"}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "flex items-center gap-2 text-sm font-medium text-slate-900", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: skill.name }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${source === "user" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`, children: getTranslation(source === "user" ? "settings_skills_yours" : "settings_skills_builtin", language) }),
              !enabled && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800", children: getTranslation("settings_skills_off", language) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-xs text-slate-500", children: skill.description }),
            skill.manifest && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-xs text-slate-500", children: [
              "Version ",
              skill.manifest.version,
              " · Profiles: ",
              skill.manifest.profiles.join(", ") || "guidance only",
              " · Required: ",
              skill.manifest.requires.join(", ") || "none",
              " · Supporting files: ",
              skill.manifest.supportingFiles.length
            ] }),
            ((_a = skill.manifest) == null ? void 0 : _a.supportingFiles.some((file) => typeof supportingSources[file.path] !== "string")) && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "status", className: "text-xs text-amber-800", children: "Supporting files missing; this skill is unavailable to the agent. Import its complete folder." }),
            skill.disableModelInvocation && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-amber-800", children: "Model invocation restricted." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => setEditing({ name: skill.name, text: serializeSkillMarkdown(skill), error: null }),
                "aria-label": getTranslation("settings_skills_edit_label", language, { name: skill.name }),
                className: "min-h-[44px] rounded-md px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 md:min-h-0 md:py-1",
                children: getTranslation("settings_skills_edit", language)
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => downloadSkill(skill.name, serializeSkillMarkdown(skill)),
                "aria-label": getTranslation("settings_skills_export_label", language, { name: skill.name }),
                className: "min-h-[44px] rounded-md px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 md:min-h-0 md:py-1",
                children: getTranslation("settings_skills_export", language)
              }
            ),
            source === "user" && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => removeUserSkill(skill.name),
                "aria-label": getTranslation(
                  builtinNames.has(skill.name) ? "settings_skills_restore" : "settings_skills_remove",
                  language,
                  { name: skill.name }
                ),
                className: "min-h-[44px] rounded-md px-2 text-xs font-semibold text-red-700 hover:bg-red-50 md:min-h-0 md:py-1",
                children: builtinNames.has(skill.name) ? getTranslation("settings_skills_restore", language) : "✕"
              }
            )
          ] })
        ] }),
        (editing == null ? void 0 : editing.name) === skill.name && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "textarea",
            {
              value: editing.text,
              onChange: (event) => setEditing({ ...editing, text: event.target.value, error: null }),
              rows: 10,
              spellCheck: false,
              "aria-label": getTranslation("settings_skills_edit_label", language, { name: skill.name }),
              className: "w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-[12px] text-slate-800"
            }
          ),
          source === "builtin" && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500", children: getTranslation("settings_skills_edit_hint", language) }),
          editing.error && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "text-xs text-red-800", children: editing.error }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => {
                  const outcome = saveEditedUserSkill(skill.name, editing.text, supportingSources);
                  setEditing(outcome.ok ? null : { ...editing, error: outcome.reason ?? null });
                },
                className: "min-h-[44px] rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 md:min-h-0",
                children: getTranslation("settings_skills_save", language)
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => setEditing(null),
                className: "min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 md:min-h-0",
                children: getTranslation("settings_skills_cancel", language)
              }
            )
          ] })
        ] })
      ] }, skill.name);
    }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        ref: fileInputRef,
        type: "file",
        accept: ".md,text/markdown",
        multiple: true,
        className: "sr-only",
        "aria-label": getTranslation("settings_skills_import", language),
        onChange: (event) => void handleFiles(event)
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: () => {
          var _a;
          return (_a = fileInputRef.current) == null ? void 0 : _a.click();
        },
        className: "mt-3 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100",
        children: getTranslation("settings_skills_import", language)
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("input", { ref: folderInputRef, type: "file", multiple: true, ...{ webkitdirectory: "" }, className: "sr-only", "aria-label": "Add skill folder", onChange: (event) => void handleFiles(event) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => {
      var _a;
      return (_a = folderInputRef.current) == null ? void 0 : _a.click();
    }, className: "ml-2 mt-3 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100", children: "Add skill folder" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs text-slate-600", children: "A task pins enabled skill versions. Edits apply to a new task; switching a skill off immediately blocks further loads. Supporting JavaScript uses the controlled code executor and existing permissions." }),
    lastImport && (lastImport.added.length > 0 || lastImport.rejected.length > 0) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { role: "status", className: "mt-2 space-y-1 text-xs", children: [
      lastImport.added.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-emerald-800", children: getTranslation("settings_skills_added", language, { names: lastImport.added.join(", ") }) }),
      lastImport.rejected.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-red-800", children: getTranslation("settings_skills_rejected", language, { fileName: item.fileName, reason: item.reason }) }, `${item.fileName}-${item.reason}`))
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mt-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer text-xs font-medium text-slate-600", children: getTranslation("settings_skills_format_title", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-slate-600", children: getTranslation("settings_skills_format_hint", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "mt-2 overflow-x-auto rounded-md bg-white p-2 text-[11px] text-slate-700", children: EXAMPLE_SKILL })
    ] })
  ] });
};
const CONFIG_KEY = "csv-agent-http-mcp-v1";
const loadConfigs = () => {
  try {
    const value = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "[]");
    if (!Array.isArray(value) || value.length > 8) return [];
    return value.map(normalizeHttpMcpConfig);
  } catch {
    return [];
  }
};
const store = { getState: useAppStore.getState, setState: useAppStore.setState };
const McpConnectorsSection = () => {
  const [configs, setConfigs] = reactExports.useState(loadConfigs), [connections, setConnections] = reactExports.useState(() => listMcpConnections(store));
  const [id, setId] = reactExports.useState(""), [endpoint, setEndpoint] = reactExports.useState(""), [version, setVersion] = reactExports.useState("auto");
  const [auth, setAuth] = reactExports.useState("none"), [token, setToken] = reactExports.useState(""), [issuer, setIssuer] = reactExports.useState(""), [clientId, setClientId] = reactExports.useState("");
  const [error, setError] = reactExports.useState(""), [busy, setBusy] = reactExports.useState(false);
  const cancelAuth = reactExports.useRef(null), mounted = reactExports.useRef(true);
  reactExports.useEffect(() => {
    mounted.current = true;
    return () => {
      var _a;
      mounted.current = false;
      (_a = cancelAuth.current) == null ? void 0 : _a.call(cancelAuth);
    };
  }, []);
  reactExports.useEffect(() => subscribeMcpConnections(store, () => setConnections(listMcpConnections(store))), []);
  reactExports.useEffect(() => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(configs));
    } catch {
      setError("Connection settings could not be saved.");
    }
  }, [configs]);
  const connect = async (config) => {
    setBusy(true);
    setError("");
    try {
      await configureHttpMcp(store, config, { token: mcpAuthorization(config.endpoint) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const add = async () => {
    setError("");
    try {
      const scope = captureSessionScope(store);
      const config = normalizeHttpMcpConfig({ id, endpoint, version });
      if (configs.length >= 8 && !configs.some((c) => c.id === id)) throw new Error("Maximum eight connections.");
      disconnectMcp(store, id);
      if (auth === "bearer") {
        setMcpBearerCredential(config.endpoint, token);
        setToken("");
      }
      if (auth === "none") forgetMcpCredential(config.endpoint);
      if (auth === "oauth") {
        const popup = window.open("about:blank", "csv-mcp-oauth", "popup,width=600,height=700");
        if (!popup) throw new Error("Allow the sign-in popup to continue.");
        setBusy(true);
        try {
          const flow = await beginMcpOAuth({
            endpoint: config.endpoint,
            issuer,
            clientId,
            redirectUri: new URL("index.html", window.location.href).href.split("?")[0]
          });
          if (!mounted.current || !ownsSessionScope(store, scope)) {
            flow.cancel();
            throw new Error("Sign-in cancelled because the session changed.");
          }
          await new Promise((resolve, reject) => {
            let unregister = () => {
            };
            const cleanup = () => {
              clearTimeout(timer);
              window.removeEventListener("message", receive);
              popup.close();
              unregister();
              cancelAuth.current = null;
            };
            const cancel = () => {
              flow.cancel();
              cleanup();
              reject(new Error("Sign-in cancelled."));
            };
            const receive = (event) => {
              var _a;
              if (event.origin !== window.location.origin || event.source !== popup || ((_a = event.data) == null ? void 0 : _a.kind) !== "csv-mcp-oauth") return;
              clearTimeout(timer);
              window.removeEventListener("message", receive);
              popup.close();
              flow.complete(event.data).then(() => {
                cleanup();
                resolve();
              }, (e) => {
                cleanup();
                reject(e);
              });
            };
            const timer = setTimeout(() => {
              cleanup();
              flow.cancel();
              reject(new Error("Sign-in expired."));
            }, 12e4);
            cancelAuth.current = cancel;
            unregister = registerSessionResource(scope, cancel);
            window.addEventListener("message", receive);
            popup.location.href = flow.authorizationUrl;
          });
        } finally {
          popup.close();
          if (mounted.current) setBusy(false);
        }
      }
      if (!mounted.current || !ownsSessionScope(store, scope)) throw new Error("Connection cancelled because the session changed.");
      setConfigs((current) => [...current.filter((c) => c.id !== config.id), config]);
      await connect(config);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Invalid connection.");
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-3 rounded-card border border-slate-200 bg-white p-4", "aria-label": "HTTP MCP connections", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-slate-950", children: "HTTP MCP connections" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-600", children: "Connect a server, then review each tool and grant diagnostic or read-only access. Tool arguments are sent to this server. Remote hints do not grant access. New tasks pin the reviewed tools; changes stop their old pins. Credentials stay in memory and expire on reload." }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-2 sm:grid-cols-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-xs", children: [
        "Connection ID",
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { "aria-label": "MCP connection ID", value: id, onChange: (e) => setId(e.target.value), className: "mt-1 w-full rounded border p-2", placeholder: "data-service" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-xs", children: [
        "Server URL",
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { "aria-label": "MCP server URL", value: endpoint, onChange: (e) => setEndpoint(e.target.value), className: "mt-1 w-full rounded border p-2", placeholder: "https://server.example/mcp" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-xs", children: [
        "Protocol",
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { "aria-label": "MCP protocol", value: version, onChange: (e) => setVersion(e.target.value), className: "mt-1 w-full rounded border p-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "auto", children: "Auto (tested versions only)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { children: "2026-07-28" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { children: "2025-11-25" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-xs", children: [
        "Authentication",
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { "aria-label": "MCP authentication", value: auth, onChange: (e) => setAuth(e.target.value), className: "mt-1 w-full rounded border p-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "none", children: "None" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "bearer", children: "Bearer token for this server" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "oauth", children: "OAuth with PKCE" })
        ] })
      ] })
    ] }),
    auth === "bearer" && /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs", children: [
      "Session token",
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "password", autoComplete: "off", "aria-label": "MCP session token", value: token, onChange: (e) => setToken(e.target.value), className: "mt-1 w-full rounded border p-2" })
    ] }),
    auth === "oauth" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-2 sm:grid-cols-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-xs", children: [
        "Authorization issuer",
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { "aria-label": "MCP OAuth issuer", value: issuer, onChange: (e) => setIssuer(e.target.value), className: "mt-1 w-full rounded border p-2" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-xs", children: [
        "Public client ID",
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { "aria-label": "MCP OAuth client ID", value: clientId, onChange: (e) => setClientId(e.target.value), className: "mt-1 w-full rounded border p-2" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", disabled: busy || !id || !endpoint, onClick: () => void add(), className: "rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50", children: busy ? "Connecting…" : auth === "oauth" ? "Sign in and connect MCP" : "Connect MCP" }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "text-xs text-red-700", children: error }),
    configs.map((config) => {
      var _a;
      const connection = connections.find((c) => c.config.id === config.id);
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 rounded border p-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm font-medium", children: [
          config.id,
          " — ",
          (connection == null ? void 0 : connection.status) ?? "disconnected"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "break-all text-xs text-slate-500", children: config.endpoint }),
        (connection == null ? void 0 : connection.pin) && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs", children: [
          connection.pin.server.name,
          " / ",
          connection.pin.protocol
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", disabled: busy, onClick: () => void connect(config), className: "rounded border px-2 py-1 text-xs", children: [
            "Reconnect ",
            config.id
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: () => {
            disconnectMcp(store, config.id);
            forgetMcpCredential(config.endpoint);
          }, className: "rounded border px-2 py-1 text-xs", children: [
            "Disconnect ",
            config.id
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: () => {
            removeMcp(store, config.id);
            forgetMcpCredential(config.endpoint);
            setConfigs((current) => current.filter((c) => c.id !== config.id));
          }, className: "rounded border px-2 py-1 text-xs", children: [
            "Remove ",
            config.id
          ] })
        ] }),
        (_a = connection == null ? void 0 : connection.pin) == null ? void 0 : _a.tools.map((tool) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1 border-t pt-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium", children: tool.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "break-words text-xs text-slate-500", children: [
            "Remote description: ",
            tool.description
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "text-xs", children: "Review schema" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "max-h-40 overflow-auto text-xs", children: JSON.stringify(tool.inputSchema, null, 2) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-xs", children: [
            "Host grant",
            /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { "aria-label": `Grant ${tool.name}`, value: connection.grants[tool.remoteName] ?? "", onChange: (e) => setMcpToolGrant(store, config.id, tool.remoteName, e.target.value || void 0), className: "ml-2 rounded border p-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Unavailable" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "diagnostic", children: "Diagnostic" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "read_only", children: "Read-only" })
            ] })
          ] })
        ] }, tool.name))
      ] }, config.id);
    }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500", children: "HTTPS and server CORS are required outside loopback. HTTP+SSE endpoints, stdio, external writes, remote images/resources and uncertain retries are unavailable. Upstream completeness and snapshot remain unknown." })
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
          className: "flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-card border border-slate-200 bg-white shadow-xl sm:max-h-[80vh]",
          onClick: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "shrink-0 border-b border-slate-200 px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "settings-dialog-title", className: "text-2xl font-bold text-slate-900", children: getTranslation("settings_title", language) }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-grow overflow-y-auto p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "mb-1 block text-sm font-medium text-slate-700", children: getTranslation("settings_ai_provider", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2 rounded-card bg-slate-200 p-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => handleProviderChange("default"), className: `min-h-[44px] w-full rounded-md px-1 py-2 text-sm font-medium transition-colors ${settings.provider === "default" ? "bg-blue-600 text-white shadow" : "text-slate-700 hover:bg-slate-300"}`, children: getTranslation("settings_ai_provider_default_label", language) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => handleProviderChange("google"), className: `min-h-[44px] w-full rounded-md px-1 py-2 text-sm font-medium transition-colors ${settings.provider === "google" ? "bg-blue-600 text-white shadow" : "text-slate-700 hover:bg-slate-300"}`, children: "Google Gemini" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => handleProviderChange("openai"), className: `min-h-[44px] w-full rounded-md px-1 py-2 text-sm font-medium transition-colors ${settings.provider === "openai" ? "bg-blue-600 text-white shadow" : "text-slate-700 hover:bg-slate-300"}`, children: "OpenAI" })
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
                    className: `min-h-[44px] w-full rounded-md px-3 py-2 text-sm font-medium transition-colors ${testStatus === "testing" ? "bg-slate-300 text-slate-500 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-700"}`,
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
                    className: "mt-1 block min-h-[44px] w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm",
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
                    className: "mt-1 block min-h-[44px] w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
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
                        className: "mt-1 block min-h-[44px] w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
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
                        className: "mt-1 block min-h-[44px] w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500 mt-1", children: getTranslation("settings_tool_output_cutoff_hint", language, { min: MIN_TOOL_OUTPUT_CUTOFF, max: MAX_TOOL_OUTPUT_CUTOFF }) })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(AgentSkillsSection, { language }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(McpConnectorsSection, {}),
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
                  className: "min-h-[44px] rounded-md bg-slate-200 px-4 py-2 text-sm text-slate-800 transition-colors hover:bg-slate-300",
                  children: getTranslation("settings_cancel", language)
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: handleSave,
                  className: "min-h-[44px] rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700",
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
