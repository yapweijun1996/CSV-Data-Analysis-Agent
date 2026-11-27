import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Settings } from '../../types';
import { getTranslation } from '../../utils/localization';
import { IconArrowLeft } from '../../icons/IconArrowLeft';
import { IconDelete } from '../../icons/IconDelete';
import { IconMcpServer } from '../../icons/IconMcpServer';
import { IconLoadingSpinner } from '../../icons/IconLoadingSpinner';
import { confirmModal } from '../../services/ui/modalService';
import { toast } from '../../services/ui/toastService';
import { normalizeHttpMcpConfig } from '../../services/agent/connectors/httpMcpContract';
import { listMcpConnections, subscribeMcpConnections } from '../../services/agent/connectors/mcpConnectorRegistry';
import { forgetMcpCredential } from '../../services/agent/connectors/mcpCredentials';
import { mcpAppStore } from '../../services/agent/connectors/mcpAppStore';
import {
    applyMcpToolSwitches, classifyMcpError, connectMcpServer, disconnectMcpServer, mcpErrorCode, removeMcpServer,
    signInMcpOAuth, testMcpServer, type McpTestResult,
} from '../../services/agent/connectors/mcpServerManager';
import {
    MAX_MCP_SERVERS, deleteMcpServer, loadMcpServers, mcpServerIdFromName, patchMcpServer,
    subscribeMcpServers, upsertMcpServer, type McpServerRecord,
} from '../../services/storage/mcpServers';

type Language = Settings['language'];
const t = (key: string, language: Language, params?: Record<string, string | number>) => getTranslation(key, language, params);
const FIELD = 'mt-1 block min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm';
const BUTTON = 'min-h-[44px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

const subscribeConnections = (listener: () => void) => subscribeMcpConnections(mcpAppStore, listener);

export const useMcpServers = () => {
    const records = useSyncExternalStore(subscribeMcpServers, loadMcpServers);
    const connections = useSyncExternalStore(
        subscribeConnections,
        useMemo(() => { let last = '', value = listMcpConnections(mcpAppStore);
            return () => { const next = listMcpConnections(mcpAppStore), key = JSON.stringify(next.map(c => [c.config.id, c.status, c.error, c.pin?.digest, c.grants]));
                if (key !== last) { last = key; value = next; } return value; }; }, []),
    );
    return { records, connections };
};

export const McpServersEntry: React.FC<{ language: Language; onOpen: () => void }> = ({ language, onOpen }) => {
    const { records, connections } = useMcpServers();
    const enabled = records.filter(r => r.enabled).length;
    const tools = connections.reduce((sum, c) => sum + Object.keys(c.grants).length, 0);
    return (
        <div className="rounded-card border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><IconMcpServer className="h-4 w-4" />{t('mcp_title', language)}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                        {records.length === 0 ? t('mcp_summary_none', language) : t('mcp_summary', language, { enabled, tools })}
                    </p>
                </div>
                <button type="button" onClick={onOpen} className={`${BUTTON} shrink-0`}>{t('mcp_manage', language)}</button>
            </div>
        </div>
    );
};

const toolSummary = (record: McpServerRecord, live: { name: string; description: string }[], tested?: McpTestResult) => {
    const list = live.length ? live : tested?.tools ?? [];
    return list.map(tool => ({ ...tool, on: !record.disabledTools.includes(tool.name) }));
};

export const McpServersPage: React.FC<{ language: Language; onBack: () => void }> = ({ language, onBack }) => {
    const { records, connections } = useMcpServers();
    const [adding, setAdding] = useState(records.length === 0);
    const [name, setName] = useState(''), [url, setUrl] = useState(''), [auth, setAuth] = useState<McpServerRecord['auth']>('none');
    const [token, setToken] = useState(''), [issuer, setIssuer] = useState(''), [clientId, setClientId] = useState('');
    const [formError, setFormError] = useState(''), [busyId, setBusyId] = useState<string | null>(null);
    const [tests, setTests] = useState<Record<string, McpTestResult | 'testing'>>({});
    const [signingIn, setSigningIn] = useState<string | null>(null);
    const cancelAuth = useRef<(() => void) | null>(null), mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelAuth.current?.(); }; }, []);

    const errorText = (code: string | undefined) => t(`mcp_error_${classifyMcpError(code)}`, language, { max: MAX_MCP_SERVERS });
    const saveFailed = () => toast.error(t('mcp_error_save', language));

    const connect = async (record: McpServerRecord) => {
        setBusyId(record.id);
        const result = await connectMcpServer(mcpAppStore, record);
        if (mounted.current) setBusyId(null);
        if (!result.ok) toast.error(errorText(result.errorCode), { detail: result.errorCode, id: `mcp-${record.id}` });
        return result.ok;
    };
    const signIn = async (record: McpServerRecord) => {
        setSigningIn(record.id);
        try { await signInMcpOAuth(mcpAppStore, record, cancel => { cancelAuth.current = cancel; }); await connect(record); }
        catch (e) { toast.error(errorText(mcpErrorCode(e)), { detail: mcpErrorCode(e) }); }
        finally { if (mounted.current) setSigningIn(null); }
    };
    const submit = async (event: React.FormEvent) => {
        event.preventDefault(); setFormError('');
        const trimmedName = name.trim();
        if (!trimmedName || !url.trim()) { setFormError(t('mcp_error_required', language)); return; }
        let endpoint: string;
        try { endpoint = normalizeHttpMcpConfig({ id: 'probe', endpoint: url.trim(), version: 'auto' }).endpoint; }
        catch (e) { setFormError(errorText(mcpErrorCode(e) ?? 'mcp_invalid_configuration')); return; }
        if (records.length >= MAX_MCP_SERVERS) { setFormError(errorText('mcp_connector_limit')); return; }
        if (records.some(r => r.url === endpoint)) { setFormError(t('mcp_error_duplicate', language)); return; }
        if (auth === 'bearer' && (!token || /\s/.test(token))) { setFormError(errorText('mcp_invalid_credential')); return; }
        if (auth === 'oauth' && (!issuer.trim() || !clientId.trim())) { setFormError(t('mcp_error_required', language)); return; }
        const record: McpServerRecord = {
            id: mcpServerIdFromName(trimmedName, new Set(records.map(r => r.id))), name: trimmedName, url: endpoint, version: 'auto', auth,
            ...(auth === 'bearer' ? { token } : {}), ...(auth === 'oauth' ? { oauthIssuer: issuer.trim(), oauthClientId: clientId.trim() } : {}),
            enabled: true, disabledTools: [],
        };
        if (!upsertMcpServer(record)) saveFailed();
        setName(''); setUrl(''); setToken(''); setIssuer(''); setClientId(''); setAuth('none'); setAdding(false);
        toast.success(t('mcp_added_toast', language, { name: record.name }));
        if (auth === 'oauth') await signIn(record); else await connect(record);
    };
    const runTest = async (record: McpServerRecord) => {
        setTests(prev => ({ ...prev, [record.id]: 'testing' }));
        const result = await testMcpServer(record);
        if (mounted.current) setTests(prev => ({ ...prev, [record.id]: result }));
    };
    const toggleEnabled = async (record: McpServerRecord, enabled: boolean) => {
        if (!patchMcpServer(record.id, { enabled })) saveFailed();
        if (enabled) await connect({ ...record, enabled }); else disconnectMcpServer(mcpAppStore, record.id);
    };
    const toggleTool = (record: McpServerRecord, tool: string, on: boolean) => {
        const disabledTools = on ? record.disabledTools.filter(n => n !== tool) : [...record.disabledTools, tool];
        if (!patchMcpServer(record.id, { disabledTools })) saveFailed();
        applyMcpToolSwitches(mcpAppStore, { ...record, disabledTools });
    };
    const remove = async (record: McpServerRecord) => {
        const confirmed = await confirmModal({ title: t('mcp_delete_title', language), message: t('mcp_delete_message', language, { name: record.name }),
            confirmLabel: t('mcp_delete', language), cancelLabel: t('mcp_cancel', language), tone: 'danger' });
        if (!confirmed) return;
        removeMcpServer(mcpAppStore, record.id); forgetMcpCredential(record.url);
        if (!deleteMcpServer(record.id)) saveFailed();
        setTests(prev => { const { [record.id]: _removed, ...rest } = prev; return rest; });
        toast.info(t('mcp_deleted_toast', language, { name: record.name }));
    };

    return (
        <div className="space-y-4" data-testid="mcp-servers-page">
            <div className="flex items-center gap-2">
                <button type="button" onClick={onBack} aria-label={t('mcp_back', language)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"><IconArrowLeft /></button>
                <h3 className="text-lg font-bold text-slate-900">{t('mcp_title', language)}</h3>
            </div>
            <p className="text-xs leading-5 text-slate-600">{t('mcp_intro', language)}</p>

            {records.map(record => {
                const connection = connections.find(c => c.config.id === record.id);
                const test = tests[record.id];
                const connecting = busyId === record.id || connection?.status === 'connecting';
                const connected = connection?.status === 'connected';
                const status = !record.enabled ? 'disabled' : connecting ? 'connecting' : connected ? 'connected' : connection?.error ? 'failed' : 'idle';
                const tools = toolSummary(record, connection?.pin?.tools.map(tool => ({ name: tool.remoteName, description: tool.description })) ?? [], typeof test === 'object' ? test : undefined);
                const needsSignIn = record.auth === 'oauth' && record.enabled && !connected && !connecting;
                const dot = { connected: 'bg-emerald-500', connecting: 'bg-amber-400', failed: 'bg-red-500', disabled: 'bg-slate-300', idle: 'bg-slate-400' }[status];
                return (
                    <section key={record.id} aria-label={record.name} className="space-y-3 rounded-card border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h4 className="break-words text-sm font-semibold text-slate-900">{record.name}</h4>
                                <p className="break-all text-xs text-slate-500">{record.url}</p>
                                <p className="mt-1 flex items-center gap-2 text-xs text-slate-700" role="status">
                                    <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
                                    {t(`mcp_status_${status}`, language)}
                                    {connected && connection?.pin && <span className="text-slate-500">· {connection.pin.server.name} {connection.pin.server.version}</span>}
                                </p>
                            </div>
                            <button type="button" role="switch" aria-checked={record.enabled} aria-label={t('mcp_enable_label', language, { name: record.name })}
                                onClick={() => void toggleEnabled(record, !record.enabled)}
                                className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${record.enabled ? 'bg-blue-600' : 'bg-slate-300'}`}>
                                <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${record.enabled ? 'translate-x-5' : ''}`} />
                            </button>
                        </div>
                        {status === 'failed' && typeof test !== 'object' && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2 text-xs leading-5 text-red-800">{errorText(connection?.error)}<span className="mt-1 block font-mono text-[11px] text-red-600">{connection?.error}</span></p>}
                        {typeof test === 'object' && (test.ok
                            ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs leading-5 text-emerald-800">{t('mcp_test_ok', language, { server: `${test.server?.name} ${test.server?.version}`, count: test.tools.length, ms: test.ms })}</p>
                            : <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2 text-xs leading-5 text-red-800">{errorText(test.errorCode)}<span className="mt-1 block font-mono text-[11px] text-red-600">{test.errorCode}</span></p>)}
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={BUTTON} disabled={test === 'testing'} onClick={() => void runTest(record)}>
                                {test === 'testing' ? <span className="inline-flex items-center gap-2"><IconLoadingSpinner className="h-4 w-4" />{t('mcp_testing', language)}</span> : t('mcp_test', language)}
                            </button>
                            {needsSignIn && <button type="button" className={BUTTON} disabled={signingIn === record.id} onClick={() => void signIn(record)}>{t('mcp_sign_in', language)}</button>}
                            {record.enabled && !needsSignIn && !connected && !connecting && <button type="button" className={BUTTON} onClick={() => void connect(record)}>{t('mcp_reconnect', language)}</button>}
                            <button type="button" className={`${BUTTON} ml-auto inline-flex items-center gap-2 border-red-200 text-red-700 hover:bg-red-50`} aria-label={`${t('mcp_delete', language)} ${record.name}`} onClick={() => void remove(record)}><IconDelete />{t('mcp_delete', language)}</button>
                        </div>
                        <div className="border-t border-slate-200 pt-3">
                            <h5 className="text-xs font-semibold text-slate-800">{t('mcp_tools_title', language, { count: tools.length })}</h5>
                            {tools.length === 0 && <p className="mt-1 text-xs text-slate-500">{t('mcp_tools_none', language)}</p>}
                            <ul className="mt-2 space-y-2">
                                {tools.map(tool => (
                                    <li key={tool.name} className="flex items-start gap-3">
                                        <input type="checkbox" id={`${record.id}-${tool.name}`} checked={tool.on} disabled={!connected}
                                            onChange={e => toggleTool(record, tool.name, e.target.checked)} aria-label={t('mcp_tool_toggle', language, { tool: tool.name })}
                                            className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                        <label htmlFor={`${record.id}-${tool.name}`} className="min-w-0 text-xs">
                                            <span className="block break-all font-mono font-medium text-slate-900">{tool.name}</span>
                                            {tool.description && <span className="block break-words text-slate-500">{tool.description.slice(0, 200)}</span>}
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </section>
                );
            })}

            {adding ? (
                <form onSubmit={e => void submit(e)} className="space-y-3 rounded-card border border-blue-200 bg-blue-50/40 p-4" aria-label={t('mcp_add', language)}>
                    <h4 className="text-sm font-semibold text-slate-900">{t('mcp_add', language)}</h4>
                    <label className="block text-sm font-medium text-slate-700">{t('mcp_form_name', language)}
                        <input className={FIELD} value={name} onChange={e => setName(e.target.value)} placeholder="Data service" maxLength={60} autoComplete="off" /></label>
                    <label className="block text-sm font-medium text-slate-700">{t('mcp_form_url', language)}
                        <input className={FIELD} type="url" inputMode="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://server.example/mcp" autoComplete="off" /></label>
                    <label className="block text-sm font-medium text-slate-700">{t('mcp_form_auth', language)}
                        <select className={FIELD} value={auth} onChange={e => setAuth(e.target.value as McpServerRecord['auth'])}>
                            <option value="none">{t('mcp_auth_none', language)}</option><option value="bearer">{t('mcp_auth_bearer', language)}</option><option value="oauth">{t('mcp_auth_oauth', language)}</option></select></label>
                    {auth === 'bearer' && <label className="block text-sm font-medium text-slate-700">{t('mcp_form_token', language)}
                        <input className={FIELD} type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} />
                        <span className="mt-1 block text-xs font-normal text-slate-500">{t('mcp_token_hint', language)}</span></label>}
                    {auth === 'oauth' && <>
                        <label className="block text-sm font-medium text-slate-700">{t('mcp_form_issuer', language)}<input className={FIELD} value={issuer} onChange={e => setIssuer(e.target.value)} placeholder="https://auth.example/" autoComplete="off" /></label>
                        <label className="block text-sm font-medium text-slate-700">{t('mcp_form_client', language)}<input className={FIELD} value={clientId} onChange={e => setClientId(e.target.value)} autoComplete="off" /></label></>}
                    <p className="text-xs leading-5 text-slate-600">{t('mcp_cors_hint', language)}</p>
                    {formError && <p role="alert" className="text-xs font-medium text-red-700">{formError}</p>}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        {records.length > 0 && <button type="button" className={BUTTON} onClick={() => { setAdding(false); setFormError(''); }}>{t('mcp_cancel', language)}</button>}
                        <button type="submit" className="min-h-[44px] rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{t('mcp_add_submit', language)}</button>
                    </div>
                </form>
            ) : (
                <button type="button" className={`${BUTTON} w-full`} disabled={records.length >= MAX_MCP_SERVERS} onClick={() => setAdding(true)}>+ {t('mcp_add', language)}</button>
            )}
        </div>
    );
};
