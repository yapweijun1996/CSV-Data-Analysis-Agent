import { describe, expect, it } from 'vitest';
import { classifyGatewayError, describeGatewayError, presentGatewayError } from '../utils/gatewayErrorMessage';

const raw = (status: number, body: Record<string, unknown>) => `OpenAI API error (${status}): ${JSON.stringify(body)}`;

describe('gateway error messages', () => {
    it('explains the live reasoning-content rejection with its code', () => {
        const text = raw(400, { message: 'content is not allowed in reasoning items', code: 'DEMO_FIELD_DISABLED', type: 'invalid_request_error' });
        const friendly = describeGatewayError(text, 'English');

        expect(friendly?.message).toBe('The shared AI service rejected this request.');
        expect(friendly?.code).toBe('DEMO_FIELD_DISABLED');
        expect(friendly?.fullText).toContain('(DEMO_FIELD_DISABLED)');
        expect(friendly?.fullText).not.toContain('reasoning items');
    });

    it('recognises an old cached build hitting the retired private key', () => {
        const info = classifyGatewayError(raw(401, { message: 'invalid api key' }));
        expect(info).toEqual({ kind: 'stale_build' });
        expect(presentGatewayError(raw(401, { message: 'invalid api key' }), 'English')).toContain('Reload the page');
    });

    it.each([
        ['DEMO_SESSION_REQUEST_LIMIT', 429, 'demo session request limit reached', 'session'],
        ['DEMO_SESSION_CONCURRENCY_LIMIT', 429, 'too many concurrent requests', 'concurrency'],
        ['DEMO_SESSION_EXPIRED', 401, 'expired', 'session'],
        ['DEMO_UPSTREAM_HTTP_ERROR', 400, 'upstream rejected', 'upstream'],
        ['DEMO_ALL_ROUTES_EXHAUSTED', 503, 'no route', 'quota'],
        ['DEMO_ORIGIN_NOT_REGISTERED', 403, 'demo origin is not registered', 'unavailable'],
        ['DEMO_SCHEMA_UNSUPPORTED', 400, 'schema', 'rejected'],
        ['DEMO_INPUT_INVALID', 400, 'bad input', 'rejected'],
    ])('maps %s to %s', (code, status, message, kind) => {
        expect(classifyGatewayError(raw(status, { message, code }))).toMatchObject({ kind, code });
    });

    it('maps quota and IP limits that carry no code', () => {
        expect(classifyGatewayError(raw(429, { message: 'demo daily budget exhausted' }))?.kind).toBe('quota');
        expect(classifyGatewayError(raw(429, { message: 'demo IP rate limit reached' }))?.kind).toBe('ip_rate_limit');
        expect(classifyGatewayError('public demo is disabled')?.kind).toBe('unavailable');
    });

    it('localises copy and falls back to English for unknown languages', () => {
        const text = raw(429, { message: 'x', code: 'DEMO_SESSION_CONCURRENCY_LIMIT' });
        expect(describeGatewayError(text, 'Mandarin')?.message).toContain('同时进行');
        expect(describeGatewayError(text, 'French')?.message).toBe('Too many AI requests were running at once.');
    });

    it('leaves non-gateway errors untouched', () => {
        expect(classifyGatewayError('TypeError: x is not a function')).toBeNull();
        expect(classifyGatewayError('OpenAI API error (401): {"message":"Incorrect API key provided"}')).toBeNull();
        expect(presentGatewayError('Query timed out after 5000ms', 'English')).toBe('Query timed out after 5000ms');
    });
});
