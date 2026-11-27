// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startHttpMcpServer } from './fixtures/httpMcpServer';
import { listMcpConnections } from '../services/agent/connectors/mcpConnectorRegistry';
import { __resetMcpManagerForTests, classifyMcpError, connectMcpServer, mcpErrorCode, removeMcpServer, syncEnabledMcpServers, testMcpServer } from '../services/agent/connectors/mcpServerManager';
import { __resetMcpServersCacheForTests, deleteMcpServer, loadMcpServers, mcpServerIdFromName, MCP_SERVERS_KEY, patchMcpServer, upsertMcpServer, type McpServerRecord } from '../services/storage/mcpServers';
import { beginSessionTransition } from '../services/session/sessionOwnership';
import type { StoreApi } from '../services/agent/types';

const servers: Awaited<ReturnType<typeof startHttpMcpServer>>[] = [];
const memory = new Map<string, string>();
beforeEach(() => {
    memory.clear(); __resetMcpServersCacheForTests(); __resetMcpManagerForTests();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); }, removeItem: (k: string) => { memory.delete(k); } };
});
afterEach(async () => { await Promise.all(servers.splice(0).map(s => s.close())); });
const start = async () => { const s = await startHttpMcpServer(); servers.push(s); return s; };
const record = (url: string, extra: Partial<McpServerRecord> = {}): McpServerRecord => ({ id: 'remote', name: 'Remote', url, version: 'auto', auth: 'none', enabled: true, disabledTools: [], ...extra });
const makeStore = () => {
    let state = { sessionId: crypto.randomUUID() } as ReturnType<StoreApi['getState']>;
    const root: StoreApi = { getState: () => state, setState: p => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; } };
    return { root, newSession: () => { state = { ...state, sessionId: crypto.randomUUID() }; beginSessionTransition(root); } };
};

describe('MCP server records', () => {
    it('persists, patches and deletes records and derives safe ids', () => {
        upsertMcpServer(record('https://server.example/mcp', { token: undefined }));
        expect(loadMcpServers()).toHaveLength(1);
        patchMcpServer('remote', { enabled: false, disabledTools: ['inspect'] });
        __resetMcpServersCacheForTests();
        expect(loadMcpServers()[0]).toMatchObject({ enabled: false, disabledTools: ['inspect'] });
        deleteMcpServer('remote');
        expect(JSON.parse(memory.get(MCP_SERVERS_KEY)!)).toEqual([]);
        expect(mcpServerIdFromName('My Data Service!')).toBe('my-data-service');
        expect(mcpServerIdFromName('数据', new Set())).toBe('server');
        expect(mcpServerIdFromName('9lives')).toBe('s-9lives');
        expect(mcpServerIdFromName('a', new Set(['a']))).toBe('a-2');
    });
    it('migrates servers saved by the first release and drops invalid entries', () => {
        memory.set('csv-agent-http-mcp-v1', JSON.stringify([{ id: 'old', endpoint: 'https://old.example/mcp', version: 'auto' }, { id: 'Bad Id', endpoint: 'https://x.example/mcp', version: 'auto' }]));
        expect(loadMcpServers()).toEqual([expect.objectContaining({ id: 'old', name: 'old', url: 'https://old.example/mcp', enabled: true })]);
    });
});

describe('MCP error classification', () => {
    it('maps host codes to user-facing categories', () => {
        expect(classifyMcpError('mcp_transport_cancelled_timeout_cors_or_network')).toBe('network');
        expect(classifyMcpError('mcp_authentication_required:401')).toBe('auth');
        expect(classifyMcpError('mcp_server_unavailable:404')).toBe('not_found');
        expect(classifyMcpError('mcp_server_unavailable:502')).toBe('server');
        expect(classifyMcpError('mcp_unsupported_protocol_version')).toBe('protocol');
        expect(classifyMcpError('mcp_endpoint_requires_https_or_loopback_without_credentials')).toBe('url');
        expect(classifyMcpError('something else')).toBe('unknown');
        expect(mcpErrorCode(new Error('x', { cause: new Error('mcp_authentication_required:401') }))).toBe('mcp_authentication_required:401');
    });
});

describe('MCP server manager against a real loopback server', () => {
    it('tests a connection and lists tools without registering anything', async () => {
        const server = await start(), { root } = makeStore();
        const result = await testMcpServer(record(server.endpoint));
        expect(result).toMatchObject({ ok: true, server: { name: 'synthetic-http-mcp' }, tools: [{ name: 'inspect' }] });
        expect(listMcpConnections(root)).toEqual([]);
    });
    it('reports an unreachable server as a network/CORS problem and a 401 as auth', async () => {
        const server = await start();
        const dead = await testMcpServer(record('http://127.0.0.1:9/mcp'));
        expect(dead).toMatchObject({ ok: false }); expect(classifyMcpError(dead.errorCode)).toBe('network');
        server.state.fault = 'auth';
        const denied = await testMcpServer(record(server.endpoint));
        expect(classifyMcpError(denied.errorCode)).toBe('auth');
    });
    it('connects, grants every tool except the ones the user switched off, and reconnects enabled servers per session', async () => {
        const server = await start(), { root, newSession } = makeStore();
        expect(await connectMcpServer(root, record(server.endpoint, { disabledTools: ['inspect'] }))).toEqual({ ok: true });
        expect(listMcpConnections(root)[0]).toMatchObject({ status: 'connected', grants: {} });
        removeMcpServer(root, 'remote');
        upsertMcpServer(record(server.endpoint));
        await syncEnabledMcpServers(root);
        expect(listMcpConnections(root)[0]).toMatchObject({ status: 'connected', grants: { inspect: 'read_only' } });
        newSession();
        expect(listMcpConnections(root)[0].status).toBe('disconnected');
        await syncEnabledMcpServers(root);
        expect(listMcpConnections(root)[0]).toMatchObject({ status: 'connected', grants: { inspect: 'read_only' } });
        patchMcpServer('remote', { enabled: false });
        newSession();
        await syncEnabledMcpServers(root);
        expect(listMcpConnections(root)[0].status).toBe('disconnected');
    });
    it('tries a failing server once per session instead of looping', async () => {
        const server = await start(), { root } = makeStore();
        server.state.fault = 'auth';
        upsertMcpServer(record(server.endpoint));
        await syncEnabledMcpServers(root);
        const calls = () => server.state.trace.length;
        const before = calls();
        await syncEnabledMcpServers(root);
        expect(calls()).toBe(before);
        expect(classifyMcpError(listMcpConnections(root)[0].error)).toBe('auth');
    });
});
