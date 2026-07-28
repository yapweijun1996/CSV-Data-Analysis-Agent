const SANDBOX_CODE_MAX_CHARS = 4e4;
const JAVASCRIPT_FORBIDDEN = [
  [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/i, "sandbox_network_access_denied"],
  [/\b(?:document|window|globalThis|self|parent|top|frames)\b/i, "sandbox_dom_or_global_access_denied"],
  [/\b(?:indexedDB|localStorage|sessionStorage|caches|serviceWorker|cookieStore)\b/i, "sandbox_storage_access_denied"],
  [/(?:\bimportScripts\b|\bimport\s*\(|\brequire\s*\()/i, "sandbox_module_loading_denied"],
  [/(?:\beval\b|\bconstructor\b|\bFunction\b)/, "sandbox_dynamic_code_denied"],
  [/\b(?:postMessage|close)\b/i, "sandbox_worker_control_denied"]
];
const PYTHON_FORBIDDEN = [
  [/\b(?:import|from)\s+/i, "sandbox_python_import_denied"],
  [/\b(?:open|exec|eval|compile|globals|locals|getattr|setattr|delattr)\s*\(/i, "sandbox_dynamic_code_denied"],
  [/\b(?:js|pyodide\.http|micropip|socket|urllib|requests|webbrowser)\b/i, "sandbox_network_or_host_bridge_denied"],
  [/__/i, "sandbox_python_dunder_access_denied"]
];
const getForbiddenPatterns = (language) => language === "javascript" ? JAVASCRIPT_FORBIDDEN : PYTHON_FORBIDDEN;
const validateSandboxCode = (language, code) => {
  const errors = [];
  if (!code.trim()) errors.push("sandbox_code_missing");
  if (code.length > SANDBOX_CODE_MAX_CHARS) errors.push("sandbox_code_too_large");
  if (code.includes("\0")) errors.push("sandbox_code_contains_nul");
  const hasTransform = /(?:function\s+transform\s*\(|(?:const|let|var)\s+transform\s*=)/.test(code);
  if (!hasTransform) errors.push("sandbox_transform_entry_missing");
  for (const [pattern, reasonCode] of getForbiddenPatterns(language)) {
    if (pattern.test(code)) errors.push(reasonCode);
  }
  return Array.from(new Set(errors));
};
const workerScope = self;
const disableWorkerCapability = (name, value) => {
  try {
    Object.defineProperty(workerScope, name, {
      configurable: false,
      enumerable: false,
      writable: false,
      value
    });
  } catch {
  }
};
const lockDownWorkerCapabilities = () => {
  const denyNetwork = () => Promise.reject(new Error("sandbox_network_access_denied"));
  disableWorkerCapability("fetch", denyNetwork);
  disableWorkerCapability("XMLHttpRequest", void 0);
  disableWorkerCapability("WebSocket", void 0);
  disableWorkerCapability("EventSource", void 0);
  disableWorkerCapability("indexedDB", void 0);
  disableWorkerCapability("caches", void 0);
};
lockDownWorkerCapabilities();
const executeJavaScript = async (request) => {
  const policyErrors = validateSandboxCode("javascript", request.code);
  if (policyErrors.length > 0) throw new Error(policyErrors.join(","));
  const buildTransform = new Function(`
        "use strict";
        const globalThis = undefined;
        const self = undefined;
        const window = undefined;
        const document = undefined;
        const navigator = undefined;
        const location = undefined;
        const fetch = undefined;
        const XMLHttpRequest = undefined;
        const WebSocket = undefined;
        const EventSource = undefined;
        const Worker = undefined;
        const SharedWorker = undefined;
        const indexedDB = undefined;
        const localStorage = undefined;
        const sessionStorage = undefined;
        const caches = undefined;
        const importScripts = undefined;
        const postMessage = undefined;
        const module = undefined;
        const exports = undefined;
        const require = undefined;
        ${request.code}
        if (typeof transform !== "function") throw new Error("sandbox_transform_entry_missing");
        return transform;
    `);
  const transform = buildTransform();
  const rawResult = await transform(
    request.rows.map((row) => ({ ...row })),
    Object.freeze({ ...request.context })
  );
  const serialized = JSON.stringify(rawResult);
  if (typeof serialized !== "string") throw new Error("sandbox_output_not_serializable");
  if (new TextEncoder().encode(serialized).byteLength > request.maxOutputBytes) {
    throw new Error("sandbox_output_limit_exceeded");
  }
  return JSON.parse(serialized);
};
workerScope.onmessage = async (event) => {
  const request = event.data;
  try {
    if (request.language !== "javascript") throw new Error("sandbox_worker_language_mismatch");
    const result = await executeJavaScript(request);
    const response = { id: request.id, success: true, result };
    workerScope.postMessage(response);
  } catch (error) {
    const response = {
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
    workerScope.postMessage(response);
  }
};
