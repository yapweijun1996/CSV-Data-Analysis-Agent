import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDefaultGateway } from '../services/ai/browserProviderFetch';
import { resetDemoGatewaySessionForTests } from '../services/ai/demoGatewaySession';

const sessionResponse = (token: string, model = 'demo-openai-mini') =>
    new Response(JSON.stringify({ token, model, expires_in: 900 }), { status: 201 });

const isSessionCall = (input: unknown) => String(input).endsWith('/demo/session');

describe('default gateway browser fetch', () => {
    beforeEach(() => {
        vi.stubEnv('VITE_DEFAULT_GATEWAY_PROJECT_ID', 'test-project');
        resetDemoGatewaySessionForTests();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('removes banned fields, injects the session token and uses the session model', async () => {
        const upstream = vi.fn(async (input: unknown, init?: RequestInit) => {
            if (isSessionCall(input)) return sessionResponse('dmo_token_a');
            const request = input as Request;
            expect(new Headers(init?.headers).has('user-agent')).toBe(false);
            expect(request.headers.get('authorization')).toBe('Bearer dmo_token_a');
            const body = await request.json();
            expect(body).toEqual({ model: 'demo-openai-mini', input: 'test' });
            expect(body).not.toHaveProperty('max_output_tokens');
            expect(body).not.toHaveProperty('store', true);
            return new Response('{}', { status: 200 });
        });
        vi.stubGlobal('fetch', upstream);

        const response = await fetchDefaultGateway('https://example.invalid/demo/v1/responses', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer demo-session', 'user-agent': 'sdk-test' },
            body: JSON.stringify({ model: 'gpt-5.4-mini', input: 'test', max_output_tokens: 4096 }),
        });

        expect(response.status).toBe(200);
        expect(upstream).toHaveBeenCalledTimes(2);
    });

    it('refreshes the session once and replays the request after a 401', async () => {
        let sessions = 0;
        const seenTokens: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
            if (isSessionCall(input)) return sessionResponse(`dmo_token_${++sessions}`);
            const request = input as Request;
            const token = request.headers.get('authorization') ?? '';
            seenTokens.push(token);
            expect((await request.json()).input).toBe('retry me');
            return token.endsWith('token_1')
                ? new Response(JSON.stringify({ error: { code: 'DEMO_SESSION_EXPIRED', message: 'expired' } }), { status: 401 })
                : new Response('{}', { status: 200 });
        }));

        const response = await fetchDefaultGateway('https://example.invalid/demo/v1/responses', {
            method: 'POST',
            body: JSON.stringify({ model: 'x', input: 'retry me' }),
        });

        expect(response.status).toBe(200);
        expect(seenTokens).toEqual(['Bearer dmo_token_1', 'Bearer dmo_token_2']);
    });

    it('refreshes after the session request cap but not after other 429s', async () => {
        let sessions = 0;
        let responsesCalls = 0;
        vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
            if (isSessionCall(input)) return sessionResponse(`dmo_token_${++sessions}`);
            responsesCalls += 1;
            return new Response(
                JSON.stringify({ error: { message: responsesCalls === 1 ? 'demo session request limit reached' : 'daily budget exhausted' } }),
                { status: 429 },
            );
        }));

        const response = await fetchDefaultGateway('https://example.invalid/demo/v1/responses', {
            method: 'POST',
            body: JSON.stringify({ input: 'cap' }),
        });

        // First 429 refreshes and replays; the second 429 is returned as-is, not retried again.
        expect(response.status).toBe(429);
        expect(sessions).toBe(2);
        expect(responsesCalls).toBe(2);
    });

    it('does not refresh on other client errors such as 400', async () => {
        let sessions = 0;
        vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
            if (isSessionCall(input)) return sessionResponse(`dmo_token_${++sessions}`);
            return new Response(JSON.stringify({ error: { code: 'DEMO_FIELD_DISABLED' } }), { status: 400 });
        }));

        const response = await fetchDefaultGateway('https://example.invalid/demo/v1/responses', {
            method: 'POST',
            body: JSON.stringify({ input: 'bad' }),
        });

        expect(response.status).toBe(400);
        expect(sessions).toBe(1);
    });

    it('rejects non-JSON bodies before contacting the gateway', async () => {
        const upstream = vi.fn();
        vi.stubGlobal('fetch', upstream);

        await expect(fetchDefaultGateway('https://example.invalid/demo/v1/responses', {
            method: 'POST', body: 'bad',
        })).rejects.toThrow('requires a JSON request body');
        expect(upstream).not.toHaveBeenCalled();
    });
});
