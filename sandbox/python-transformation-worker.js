let runtimePromise = null;
let runtimeBaseUrl = null;

const validatePythonCode = (code) => {
    const errors = [];
    if (!/def\s+transform\s*\(/.test(code)) errors.push('sandbox_transform_entry_missing');
    if (/\b(?:import|from)\s+/i.test(code)) errors.push('sandbox_python_import_denied');
    if (/\b(?:open|exec|eval|compile|globals|locals|getattr|setattr|delattr)\s*\(/i.test(code)) errors.push('sandbox_dynamic_code_denied');
    if (/\b(?:js|pyodide\.http|micropip|socket|urllib|requests|webbrowser)\b/i.test(code)) errors.push('sandbox_network_or_host_bridge_denied');
    if (/__/i.test(code)) errors.push('sandbox_python_dunder_access_denied');
    return Array.from(new Set(errors));
};

const getRuntime = async (baseUrl) => {
    if (runtimePromise && runtimeBaseUrl === baseUrl) return runtimePromise;
    runtimeBaseUrl = baseUrl;
    runtimePromise = (async () => {
        importScripts(new URL('pyodide.js', baseUrl).href);
        const runtime = await self.loadPyodide({ indexURL: baseUrl });
        const deny = () => Promise.reject(new Error('sandbox_network_access_denied'));
        try { self.fetch = deny; } catch { /* read-only in some engines */ }
        try { self.XMLHttpRequest = undefined; } catch { /* read-only in some engines */ }
        try { self.WebSocket = undefined; } catch { /* read-only in some engines */ }
        try { self.EventSource = undefined; } catch { /* read-only in some engines */ }
        try { self.indexedDB = undefined; } catch { /* read-only in some engines */ }
        try { self.caches = undefined; } catch { /* read-only in some engines */ }
        try { self.importScripts = undefined; } catch { /* read-only in some engines */ }
        return runtime;
    })();
    return runtimePromise;
};

self.onmessage = async (event) => {
    const request = event.data;
    try {
        if (request.language !== 'python') throw new Error('sandbox_worker_language_mismatch');
        const policyErrors = validatePythonCode(request.code);
        if (policyErrors.length > 0) throw new Error(policyErrors.join(','));
        const context = { ...(request.context || {}) };
        const baseUrl = context.pyodideBaseUrl;
        delete context.pyodideBaseUrl;
        if (typeof baseUrl !== 'string' || !baseUrl) throw new Error('sandbox_python_runtime_url_missing');
        const runtime = await getRuntime(baseUrl);
        runtime.globals.set('_sandbox_code', request.code);
        runtime.globals.set('_sandbox_rows_json', JSON.stringify(request.rows));
        runtime.globals.set('_sandbox_context_json', JSON.stringify(context));
        const serialized = await runtime.runPythonAsync(`
import json as _json

_safe_builtins = {
    "abs": abs, "all": all, "any": any, "bool": bool, "dict": dict,
    "enumerate": enumerate, "float": float, "int": int, "isinstance": isinstance,
    "len": len, "list": list, "max": max, "min": min, "range": range,
    "reversed": reversed, "round": round, "set": set, "sorted": sorted,
    "str": str, "sum": sum, "tuple": tuple, "zip": zip,
    "Exception": Exception, "TypeError": TypeError, "ValueError": ValueError,
}
_namespace = {"__builtins__": _safe_builtins}
exec(_sandbox_code, _namespace, _namespace)
_transform = _namespace.get("transform")
if not callable(_transform):
    raise ValueError("sandbox_transform_entry_missing")
_result = _transform(_json.loads(_sandbox_rows_json), _json.loads(_sandbox_context_json))
_result_json = _json.dumps(_result, separators=(",", ":"), allow_nan=False)
_result_json
        `);
        runtime.globals.delete('_sandbox_code');
        runtime.globals.delete('_sandbox_rows_json');
        runtime.globals.delete('_sandbox_context_json');
        const outputBytes = new TextEncoder().encode(serialized).byteLength;
        if (outputBytes > request.maxOutputBytes) throw new Error('sandbox_output_limit_exceeded');
        self.postMessage({ id: request.id, success: true, result: JSON.parse(serialized) });
    } catch (error) {
        self.postMessage({
            id: request.id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
