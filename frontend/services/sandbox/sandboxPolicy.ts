import type { SandboxLanguage, SandboxTransformationProposal } from '../../types';

export const SANDBOX_CODE_MAX_CHARS = 40_000;

const JAVASCRIPT_FORBIDDEN: Array<[RegExp, string]> = [
    [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/i, 'sandbox_network_access_denied'],
    [/\b(?:document|window|globalThis|self|parent|top|frames)\b/i, 'sandbox_dom_or_global_access_denied'],
    [/\b(?:indexedDB|localStorage|sessionStorage|caches|serviceWorker|cookieStore)\b/i, 'sandbox_storage_access_denied'],
    [/(?:\bimportScripts\b|\bimport\s*\(|\brequire\s*\()/i, 'sandbox_module_loading_denied'],
    [/(?:\beval\b|\bconstructor\b|\bFunction\b)/, 'sandbox_dynamic_code_denied'],
    [/\b(?:postMessage|close)\b/i, 'sandbox_worker_control_denied'],
];

const PYTHON_FORBIDDEN: Array<[RegExp, string]> = [
    [/\b(?:import|from)\s+/i, 'sandbox_python_import_denied'],
    [/\b(?:open|exec|eval|compile|globals|locals|getattr|setattr|delattr)\s*\(/i, 'sandbox_dynamic_code_denied'],
    [/\b(?:js|pyodide\.http|micropip|socket|urllib|requests|webbrowser)\b/i, 'sandbox_network_or_host_bridge_denied'],
    [/__/i, 'sandbox_python_dunder_access_denied'],
];

const getForbiddenPatterns = (language: SandboxLanguage) =>
    language === 'javascript' ? JAVASCRIPT_FORBIDDEN : PYTHON_FORBIDDEN;

export const validateSandboxCode = (
    language: SandboxLanguage,
    code: string,
): string[] => {
    const errors: string[] = [];
    if (!code.trim()) errors.push('sandbox_code_missing');
    if (code.length > SANDBOX_CODE_MAX_CHARS) errors.push('sandbox_code_too_large');
    if (code.includes('\0')) errors.push('sandbox_code_contains_nul');
    const hasTransform = language === 'javascript'
        ? /(?:function\s+transform\s*\(|(?:const|let|var)\s+transform\s*=)/.test(code)
        : /def\s+transform\s*\(/.test(code);
    if (!hasTransform) errors.push('sandbox_transform_entry_missing');

    for (const [pattern, reasonCode] of getForbiddenPatterns(language)) {
        if (pattern.test(code)) errors.push(reasonCode);
    }
    return Array.from(new Set(errors));
};

export const validateSandboxProposal = (proposal: SandboxTransformationProposal): string[] => {
    const errors = validateSandboxCode(proposal.language, proposal.code);
    if (!proposal.explanation.trim()) errors.push('sandbox_explanation_missing');
    if (!proposal.primaryTableId.trim()) errors.push('sandbox_primary_table_missing');
    if (proposal.tables.length === 0) errors.push('sandbox_table_contract_missing');
    const tableIds = proposal.tables.map(table => table.tableId.trim());
    if (tableIds.some(id => !id)) errors.push('sandbox_table_id_missing');
    if (new Set(tableIds).size !== tableIds.length) errors.push('sandbox_table_id_duplicate');
    if (!tableIds.includes(proposal.primaryTableId)) errors.push('sandbox_primary_table_unknown');
    if (!Number.isFinite(proposal.maxRowDropRatio)
        || proposal.maxRowDropRatio < 0
        || proposal.maxRowDropRatio > 0.5) {
        errors.push('sandbox_row_drop_ratio_invalid');
    }
    for (const field of proposal.derivedFields ?? []) {
        if (!tableIds.includes(field.tableId)
            || !field.fieldName.trim()
            || !field.unit.trim()
            || !field.grain.trim()
            || field.inputColumns.length === 0) {
            errors.push('sandbox_derived_field_contract_invalid');
        }
        if ((field.operation === 'ratio' || field.operation === 'difference') && field.inputColumns.length !== 2) {
            errors.push('sandbox_derived_field_arity_invalid');
        }
    }
    return Array.from(new Set(errors));
};

export const buildSandboxCodeRef = (language: SandboxLanguage, code: string): string => {
    let hash = 0x811c9dc5;
    const source = `${language}:${code}`;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `sandbox-${language}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};
