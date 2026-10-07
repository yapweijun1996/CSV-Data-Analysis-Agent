import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DEMO_SESSION_REFRESH_MARGIN_MS,
    DemoGatewayError,
    getDemoGatewaySession,
    invalidateDemoGatewaySession,
    resetDemoGatewaySessionForTests,
} from '../services/ai/demoGatewaySession';
import { redactLocalDiagnosticPayload } from '../services/observability/localDiagnostics';

const session = (token: string, expiresIn = 900) =>
    new Response(JSON.stringify({ token, model: 'demo-openai-mini', expires_in: expiresIn }), { status: 201 });

describe('demo gateway session manager', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubEnv('VITE_DEFAULT_GATEWAY_PROJECT_ID', 'test-project');
        resetDemoGatewaySessionForTests();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('posts the configured project id and reuses a fresh session', async () => {
        const upstream = vi.fn(async (_url: unknown, init?: RequestInit) => {
            expect(JSON.parse(String(init?.body))).toEqual({ project_id: 'test-project' });
            return session('dmo_a');
        });
        vi.stubGlobal('fetch', upstream);

        const first = await getDemoGatewaySession();
        const second = await getDemoGatewaySession();

        expect(first.token).toBe('dmo_a');
        expect(first.model).toBe('demo-openai-mini');
        expect(second).toBe(first);
        expect(upstream).toHaveBeenCalledOnce();
    });

    it('single-flights concurrent refreshes', async () => {
        const upstream = vi.fn(async () => session('dmo_a'));
        vi.stubGlobal('fetch', upstream);

        const results = await Promise.all([getDemoGatewaySession(), getDemoGatewaySession(), getDemoGatewaySession()]);

        expect(upstream).toHaveBeenCalledOnce();
        expect(new Set(results.map(item => item.token)).size).toBe(1);
    });

    it('refreshes shortly before expiry', async () => {
        let count = 0;
        vi.stubGlobal('fetch', vi.fn(async () => session(`dmo_${++count}`, 900)));

        await getDemoGatewaySession();
        vi.advanceTimersByTime(900_000 - DEMO_SESSION_REFRESH_MARGIN_MS - 1000);
        expect((await getDemoGatewaySession()).token).toBe('dmo_1');
        vi.advanceTimersByTime(2000);
        expect((await getDemoGatewaySession()).token).toBe('dmo_2');
    });

    it('ignores invalidation of a token that was already replaced', async () => {
        let count = 0;
        vi.stubGlobal('fetch', vi.fn(async () => session(`dmo_${++count}`)));

        await getDemoGatewaySession();
        invalidateDemoGatewaySession('dmo_1');
        const replacement = await getDemoGatewaySession();
        invalidateDemoGatewaySession('dmo_1');

        expect((await getDemoGatewaySession()).token).toBe(replacement.token);
        expect(count).toBe(2);
    });

    it('surfaces the gateway error code when the session is refused', async () => {
        vi.stubGlobal('fetch', vi.fn(async () =>
            new Response(JSON.stringify({ error: { code: 'DEMO_ORIGIN_NOT_REGISTERED', message: 'demo origin is not registered' } }), { status: 403 })));

        await expect(getDemoGatewaySession()).rejects.toMatchObject({
            name: 'DemoGatewayError',
            status: 403,
            code: 'DEMO_ORIGIN_NOT_REGISTERED',
        });
    });

    it('fails with a configuration error instead of guessing a project id', async () => {
        vi.stubEnv('VITE_DEFAULT_GATEWAY_PROJECT_ID', '');
        const upstream = vi.fn();
        vi.stubGlobal('fetch', upstream);

        await expect(getDemoGatewaySession()).rejects.toBeInstanceOf(DemoGatewayError);
        expect(upstream).not.toHaveBeenCalled();
    });

    it('redacts dmo_ tokens from diagnostics', () => {
        const redacted = redactLocalDiagnosticPayload({ note: 'failed with dmo_abc.DEF-123 in request' });
        expect(JSON.stringify(redacted)).not.toContain('dmo_abc');
    });
});
