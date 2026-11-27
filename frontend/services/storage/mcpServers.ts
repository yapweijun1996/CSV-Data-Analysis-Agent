import { normalizeHttpMcpConfig, type HttpMcpConfig } from '../agent/connectors/httpMcpContract';

/**
 * Browser-side list of the MCP servers the user manages in Settings.
 * Everything lives in localStorage; a bearer token is stored in this browser only and is
 * never sent anywhere except as the Authorization header of its own server.
 */
export interface McpServerRecord {
    id: string;
    name: string;
    url: string;
    version: HttpMcpConfig['version'];
    auth: 'none' | 'bearer' | 'oauth';
    token?: string;
    oauthIssuer?: string;
    oauthClientId?: string;
    enabled: boolean;
    /** Remote tool names the user switched off; every other discovered tool stays available. */
    disabledTools: string[];
}

export const MCP_SERVERS_KEY = 'csv-agent-mcp-servers-v2';
const LEGACY_KEY = 'csv-agent-http-mcp-v1';
export const MAX_MCP_SERVERS = 8;

const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach(listener => listener());
export const subscribeMcpServers = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/** Derive a registry-safe id (lowercase, digits, hyphen) from a display name. */
export const mcpServerIdFromName = (name: string, taken: ReadonlySet<string> = new Set()): string => {
    const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'server';
    const start = /^[a-z]/.test(base) ? base : `s-${base}`;
    let candidate = start, n = 2;
    while (taken.has(candidate)) candidate = `${start.slice(0, 28)}-${n++}`;
    return candidate;
};

const clean = (value: unknown): McpServerRecord | null => {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    try {
        const config = normalizeHttpMcpConfig({ id: String(raw.id), endpoint: String(raw.url ?? raw.endpoint), version: (raw.version as HttpMcpConfig['version']) ?? 'auto' });
        const auth = raw.auth === 'bearer' || raw.auth === 'oauth' ? raw.auth : 'none';
        return {
            id: config.id, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : config.id,
            url: config.endpoint, version: config.version, auth,
            ...(auth === 'bearer' && typeof raw.token === 'string' && raw.token ? { token: raw.token } : {}),
            ...(auth === 'oauth' ? { oauthIssuer: String(raw.oauthIssuer ?? ''), oauthClientId: String(raw.oauthClientId ?? '') } : {}),
            enabled: raw.enabled !== false,
            disabledTools: Array.isArray(raw.disabledTools) ? raw.disabledTools.filter((t): t is string => typeof t === 'string').slice(0, 64) : [],
        };
    } catch { return null; }
};

const readList = (key: string): unknown[] => {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
        return Array.isArray(parsed) ? parsed.slice(0, MAX_MCP_SERVERS) : [];
    } catch { return []; }
};

let cache: McpServerRecord[] | null = null;
export const loadMcpServers = (): McpServerRecord[] => {
    if (cache) return cache;
    const current = readList(MCP_SERVERS_KEY).map(clean).filter((r): r is McpServerRecord => r !== null);
    // The first release stored only {id, endpoint, version}; keep those servers.
    const legacy = current.length ? [] : readList(LEGACY_KEY).map(clean).filter((r): r is McpServerRecord => r !== null);
    cache = current.length ? current : legacy;
    return cache;
};

/** Returns false when the browser refused the write (private mode, quota). */
export const saveMcpServers = (records: McpServerRecord[]): boolean => {
    cache = records.slice(0, MAX_MCP_SERVERS);
    emit();
    try { localStorage.setItem(MCP_SERVERS_KEY, JSON.stringify(cache)); return true; } catch { return false; }
};

export const upsertMcpServer = (record: McpServerRecord): boolean => {
    const list = loadMcpServers();
    return saveMcpServers(list.some(r => r.id === record.id) ? list.map(r => r.id === record.id ? record : r) : [...list, record]);
};
export const patchMcpServer = (id: string, patch: Partial<McpServerRecord>): boolean =>
    saveMcpServers(loadMcpServers().map(r => r.id === id ? { ...r, ...patch } : r));
export const deleteMcpServer = (id: string): boolean => saveMcpServers(loadMcpServers().filter(r => r.id !== id));

export const __resetMcpServersCacheForTests = (): void => { cache = null; listeners.clear(); };
