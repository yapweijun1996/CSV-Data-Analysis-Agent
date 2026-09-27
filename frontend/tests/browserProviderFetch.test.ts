import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDefaultGateway } from '../services/ai/browserProviderFetch';

describe('default gateway browser fetch', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('removes the banned output limit field at the final request boundary', async () => {
        const providerFetch = vi.fn(async (request: Request, init?: RequestInit) => {
            expect(new Headers(init?.headers).has('user-agent')).toBe(false);
            expect(await request.json()).toEqual({ model: 'gpt-5.4-mini', input: 'test' });
            return new Response('{}', { status: 200 });
        });
        vi.stubGlobal('fetch', providerFetch);

        const response = await fetchDefaultGateway('https://example.invalid/v1/responses', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'user-agent': 'sdk-test' },
            body: JSON.stringify({ model: 'gpt-5.4-mini', input: 'test', max_output_tokens: 4096 }),
        });

        expect(response.status).toBe(200);
        expect(providerFetch).toHaveBeenCalledOnce();
    });

    it('rejects non-JSON bodies before sending to the gateway', async () => {
        const providerFetch = vi.fn();
        vi.stubGlobal('fetch', providerFetch);

        await expect(fetchDefaultGateway('https://example.invalid/v1/responses', {
            method: 'POST', body: 'bad',
        })).rejects.toThrow('requires a JSON request body');
        expect(providerFetch).not.toHaveBeenCalled();
    });
});
