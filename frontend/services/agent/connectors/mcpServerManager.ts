import type { StoreApi } from '../types';
import { connectHttpMcp } from './httpMcpAdapter';
import { configureHttpMcp, disconnectMcp, listMcpConnections, removeMcp, setMcpToolGrant } from './mcpConnectorRegistry';
import { beginMcpOAuth, mcpAuthorization, setMcpBearerCredential } from './mcpCredentials';
import { captureSessionScope, ownsSessionScope, registerSessionResource } from '../../session/sessionOwnership';
import { mcpErrorCode } from './mcpErrorCode';
import { loadMcpServers, type McpServerRecord } from '../../storage/mcpServers';

/** Persisted bearer tokens live for a day in the credential map; re-applied on every connect. */
const TOKEN_TTL_MS = 86_400_000;

export { mcpErrorCode };
export type McpErrorKind = 'network' | 'auth' | 'not_found' | 'server' | 'protocol' | 'no_tools' | 'url' | 'limit' | 'popup' | 'oauth' | 'unknown';

/** Map a host error code to a user-facing category. The UI localizes the category, never the raw code. */
export const classifyMcpError = (code: string | undefined): McpErrorKind => {
    if (!code) return 'unknown';
    if (code.startsWith('mcp_transport_cancelled_timeout_cors_or_network')) return 'network';
    if (code.startsWith('mcp_authentication_required') || code === 'mcp_invalid_credential') return 'auth';
    if (code === 'mcp_server_unavailable:404') return 'not_found';
    if (code.startsWith('mcp_server_unavailable')) return 'server';
    if (/^mcp_(unsupported_(protocol_version|discovery_versions)|discovery_rejected|response_version_mismatch)/.test(code)) return 'protocol';
    if (code === 'mcp_missing_server_identity_or_tools') return 'no_tools';
    if (code === 'mcp_invalid_configuration' || code.startsWith('mcp_endpoint_requires_https')) return 'url';
    if (code === 'mcp_connector_limit') return 'limit';
    if (code === 'mcp_popup_blocked') return 'popup';
    if (code.startsWith('mcp_oauth') || code === 'mcp_insecure_oauth_endpoint' || code === 'mcp_invalid_oauth_configuration') return 'oauth';
    return 'unknown';
};

const tokenFor = (record: McpServerRecord): (() => string | undefined) | undefined => {
    if (record.auth === 'bearer' && record.token) { setMcpBearerCredential(record.url, record.token, TOKEN_TTL_MS); return mcpAuthorization(record.url); }
    return record.auth === 'oauth' ? mcpAuthorization(record.url) : undefined;
};

export interface McpTestResult {
    ok: boolean;
    errorCode?: string;
    server?: { name: string; version: string };
    protocol?: string;
    tools: { name: string; description: string }[];
    ms: number;
}

/** Connect once, list the tools, and close. Nothing is registered with the agent. */
export const testMcpServer = async (record: McpServerRecord, signal?: AbortSignal): Promise<McpTestResult> => {
    const started = performance.now();
    try {
        const adapter = await connectHttpMcp({ id: record.id, endpoint: record.url, version: record.version },
            { token: tokenFor(record), timeoutMs: 10_000, signal });
        const { pin } = adapter; adapter.close();
        return { ok: true, server: pin.server, protocol: pin.protocol, ms: Math.round(performance.now() - started),
            tools: pin.tools.map(t => ({ name: t.remoteName, description: t.description })) };
    } catch (error) {
        return { ok: false, errorCode: mcpErrorCode(error) ?? 'mcp_connection_failed', tools: [], ms: Math.round(performance.now() - started) };
    }
};

/** Apply the user's per-tool switches. Every discovered tool is on unless the user turned it off. */
export const applyMcpToolSwitches = (store: StoreApi, record: McpServerRecord): void => {
    const pin = listMcpConnections(store).find(c => c.config.id === record.id)?.pin;
    pin?.tools.forEach(tool => {
        try { setMcpToolGrant(store, record.id, tool.remoteName, record.disabledTools.includes(tool.remoteName) ? undefined : 'read_only'); }
        catch { /* The connection was retired while we applied switches. */ }
    });
};

/** Operator-run OAuth (PKCE) sign-in in a popup. Must start from a click so the popup is allowed. */
export const signInMcpOAuth = async (store: StoreApi, record: McpServerRecord, setCancel: (cancel: (() => void) | null) => void): Promise<void> => {
    const scope = captureSessionScope(store);
    const popup = window.open('about:blank', 'csv-mcp-oauth', 'popup,width=600,height=700');
    if (!popup) throw new Error('mcp_popup_blocked');
    try {
        const flow = await beginMcpOAuth({ endpoint: record.url, issuer: record.oauthIssuer ?? '', clientId: record.oauthClientId ?? '',
            redirectUri: new URL('index.html', window.location.href).href.split('?')[0] });
        if (!ownsSessionScope(store, scope)) { flow.cancel(); throw new Error('mcp_oauth_session_changed'); }
        await new Promise<void>((resolve, reject) => {
            let unregister = () => {};
            const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); popup.close(); unregister(); setCancel(null); };
            const cancel = () => { flow.cancel(); cleanup(); reject(new Error('mcp_oauth_cancelled')); };
            const receive = (event: MessageEvent) => {
                if (event.origin !== window.location.origin || event.source !== popup || event.data?.kind !== 'csv-mcp-oauth') return;
                clearTimeout(timer); window.removeEventListener('message', receive); popup.close();
                flow.complete(event.data).then(() => { cleanup(); resolve(); }, e => { cleanup(); reject(e); });
            };
            const timer = setTimeout(() => { cleanup(); flow.cancel(); reject(new Error('mcp_oauth_flow_expired')); }, 120_000);
            setCancel(cancel); unregister = registerSessionResource(scope, cancel);
            window.addEventListener('message', receive); popup.location.href = flow.authorizationUrl;
        });
    } finally { popup.close(); }
};

const attempted = new Map<string, string>();
export const connectMcpServer = async (store: StoreApi, record: McpServerRecord): Promise<{ ok: boolean; errorCode?: string }> => {
    attempted.set(record.id, store.getState().sessionId);
    try {
        await configureHttpMcp(store, { id: record.id, endpoint: record.url, version: record.version }, { token: tokenFor(record), timeoutMs: 10_000 });
        applyMcpToolSwitches(store, record);
        return { ok: true };
    } catch (error) { return { ok: false, errorCode: mcpErrorCode(error) ?? 'mcp_connection_failed' }; }
};

export const removeMcpServer = (store: StoreApi, id: string): void => { attempted.delete(id); removeMcp(store, id); };
export const disconnectMcpServer = (store: StoreApi, id: string): void => { attempted.delete(id); disconnectMcp(store, id); };

/** Connect every enabled server that is not live. A failed server is tried once per session, not in a loop. */
export const syncEnabledMcpServers = async (store: StoreApi): Promise<void> => {
    const session = store.getState().sessionId;
    const live = new Map(listMcpConnections(store).map(c => [c.config.id, c.status]));
    await Promise.all(loadMcpServers().filter(r => r.enabled && live.get(r.id) !== 'connected' && live.get(r.id) !== 'connecting'
        && attempted.get(r.id) !== session).map(r => connectMcpServer(store, r)));
};

export const __resetMcpManagerForTests = (): void => attempted.clear();
