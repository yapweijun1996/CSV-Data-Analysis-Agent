import { normalizeHttpMcpConfig } from './httpMcpContract';

type Credential = { token: string; expiresAt: number };
const credentials = new Map<string, Credential>();
const canonical = (endpoint: string) => normalizeHttpMcpConfig({ id: 'credential', endpoint, version: 'auto' }).endpoint;
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const forgetMcpCredential = (endpoint: string) => { credentials.delete(canonical(endpoint)); };
export const setMcpBearerCredential = (endpoint: string, token: string, ttlMs = 3_600_000) => {
    if (!token || token.length > 8192 || /[\r\n\s]/.test(token)) throw new Error('mcp_invalid_credential');
    credentials.set(canonical(endpoint), { token, expiresAt: Date.now() + ttlMs });
};
/** A token is held in a closure for one exact resource. No persistence, logging, model custody or redirect. */
export const mcpAuthorization = (endpoint: string): (() => string | undefined) => {
    const resource = canonical(endpoint), captured = credentials.get(resource);
    return () => captured && credentials.get(resource) === captured && captured.expiresAt > Date.now() ? captured.token : undefined;
};
export interface McpOAuthConfig { endpoint: string; issuer: string; clientId: string; redirectUri: string }
const secureUrl = (value: string) => {
    const url = new URL(value);
    if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new Error('mcp_insecure_oauth_endpoint');
    return url;
};
const json = async (url: URL, fetcher: typeof fetch, init?: RequestInit): Promise<Record<string, unknown>> => {
    const response = await fetcher(url, { ...init, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (!response.ok || response.redirected || (response.url && response.url !== url.href) || !response.headers.get('content-type')?.startsWith('application/json')) throw new Error('mcp_oauth_http_error');
    const reader = response.body?.getReader(); if (!reader) throw new Error('mcp_oauth_empty_response');
    let bytes = 0, body = ''; const decoder = new TextDecoder();
    while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.length;
        if (bytes > 32_768) { await reader.cancel(); throw new Error('mcp_oauth_response_too_large'); } body += decoder.decode(next.value, { stream: true }); }
    const result = JSON.parse(body + decoder.decode());
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('mcp_oauth_invalid_response');
    return result;
};

/** Operator-configured public OAuth client: exact issuer/resource, S256, state and RFC 9207 issuer check. */
export const beginMcpOAuth = async (config: McpOAuthConfig, fetcher: typeof fetch = fetch) => {
    const resource = canonical(config.endpoint), issuer = secureUrl(config.issuer), redirect = secureUrl(config.redirectUri);
    if (issuer.search || !config.clientId || config.clientId.length > 256) throw new Error('mcp_invalid_oauth_configuration');
    const prmUrl = new URL('/.well-known/oauth-protected-resource' + new URL(resource).pathname, resource);
    const prm = await json(prmUrl, fetcher);
    if (prm.resource !== resource || !Array.isArray(prm.authorization_servers) || !prm.authorization_servers.includes(issuer.href)) throw new Error('mcp_oauth_resource_or_issuer_mismatch');
    const metadata = await json(new URL('/.well-known/oauth-authorization-server' + (issuer.pathname === '/' ? '' : issuer.pathname), issuer), fetcher);
    if (metadata.issuer !== issuer.href || !Array.isArray(metadata.code_challenge_methods_supported) || !metadata.code_challenge_methods_supported.includes('S256')
        || metadata.authorization_response_iss_parameter_supported !== true) throw new Error('mcp_oauth_pkce_or_issuer_validation_unavailable');
    const authorization = secureUrl(String(metadata.authorization_endpoint)), tokenUrl = secureUrl(String(metadata.token_endpoint));
    if (authorization.origin !== issuer.origin || tokenUrl.origin !== issuer.origin) throw new Error('mcp_oauth_unapproved_authority');
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32))), state = 'csv-mcp-' + base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const values = { response_type: 'code', client_id: config.clientId, redirect_uri: redirect.href, resource,
        state, code_challenge: challenge, code_challenge_method: 'S256' };
    Object.entries(values).forEach(([key, value]) => authorization.searchParams.set(key, value));
    const expiresAt = Date.now() + 120_000; let consumed = false, cancelled = false;
    return { authorizationUrl: authorization.href, state, cancel() { consumed = true; cancelled = true; },
        async complete(response: { code?: string; state?: string; iss?: string; error?: string }) {
            if (consumed || Date.now() > expiresAt) throw new Error('mcp_oauth_flow_expired'); consumed = true;
            if (response.error || response.state !== state || response.iss !== issuer.href || !response.code || response.code.length > 4096) throw new Error('mcp_oauth_callback_mismatch');
            const result = await json(tokenUrl, fetcher, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, redirect_uri: redirect.href,
                    resource, code: response.code, code_verifier: verifier }) });
            if (cancelled || Date.now() > expiresAt) throw new Error('mcp_oauth_flow_expired');
            if (result.token_type !== 'Bearer' || typeof result.access_token !== 'string' || !result.access_token || result.access_token.length > 8192
                || typeof result.expires_in !== 'number' || result.expires_in <= 0 || result.expires_in > 86_400) throw new Error('mcp_oauth_invalid_token_response');
            credentials.set(resource, { token: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 });
        },
    };
};

