import {
    DEMO_IP_MAX_REQUESTS_PER_MINUTE,
    DEMO_IP_WINDOW_MS,
    DEMO_SESSION_MAX_CONCURRENT_REQUESTS,
    createConcurrencyLimiter,
    createRateWindowLimiter,
    releaseWhenBodyDone,
} from './demoGatewayConcurrency';
import { recordDemoGatewayRequest } from './demoGatewayRequestLog';
import { endsWithAssistantMessage, sanitizeDemoGatewayInput } from './demoGatewayInputSanitizer';
import {
    getDemoGatewaySession,
    invalidateDemoGatewaySession,
    readGatewayErrorBody,
} from './demoGatewaySession';

/**
 * Normalizes browser provider requests across Chromium and WebKit.
 *
 * Some provider SDKs add a User-Agent header. Chromium silently removes this
 * forbidden browser header, while WebKit may include it in the CORS preflight.
 * Removing it at the shared provider boundary keeps both engines equivalent.
 */
export const fetchWithoutForbiddenUserAgent: typeof fetch = (
    input,
    init,
) => {
    const inheritedHeaders = input instanceof Request
        ? input.headers
        : undefined;
    const headers = new Headers(init?.headers ?? inheritedHeaders);
    headers.delete('user-agent');
    return globalThis.fetch(input, {
        ...init,
        headers,
    });
};

const sendWithSession = async (request: Request, body: Record<string, unknown>) => {
    const session = await getDemoGatewaySession();
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${session.token}`);
    const response = await fetchWithoutForbiddenUserAgent(new Request(request, {
        headers,
        // The wire model is the alias the session was issued for.
        body: JSON.stringify({ ...body, model: session.model }),
    }));
    return { response, token: session.token };
};

const SESSION_LIMIT_MESSAGE = 'demo session request limit reached';
const CONCURRENCY_RETRY_DELAYS_MS = [400, 1200];

const IP_RATE_RETRY_DEFAULT_MS = 20_000;
const IP_RATE_RETRY_MAX_MS = 60_000;
const IP_RATE_MAX_WAITS = 2;

let requestLimiter = createConcurrencyLimiter(DEMO_SESSION_MAX_CONCURRENT_REQUESTS);
let rateWindowLimiter = createRateWindowLimiter(DEMO_IP_MAX_REQUESTS_PER_MINUTE, DEMO_IP_WINDOW_MS);

export const resetDemoGatewayRequestLimiterForTests = (): void => {
    requestLimiter = createConcurrencyLimiter(DEMO_SESSION_MAX_CONCURRENT_REQUESTS);
    rateWindowLimiter = createRateWindowLimiter(DEMO_IP_MAX_REQUESTS_PER_MINUTE, DEMO_IP_WINDOW_MS);
};

type Rejection = 'refresh_session' | 'wait_for_slot' | 'wait_for_ip_window' | null;

/** Seconds from a Retry-After header, clamped; a default when absent or not a number. */
const ipRetryDelayMs = (response: Response): number => {
    const seconds = Number(response.headers.get('retry-after'));
    return Number.isFinite(seconds) && seconds > 0
        ? Math.min(seconds * 1000, IP_RATE_RETRY_MAX_MS)
        : IP_RATE_RETRY_DEFAULT_MS;
};

/** Classifies gateway rejections the client can recover from by itself. */
const classifyRejection = async (response: Response): Promise<Rejection> => {
    if (response.status === 401) return 'refresh_session';
    if (response.status !== 429) return null;
    const { code, message } = await readGatewayErrorBody(response);
    if (code === 'DEMO_SESSION_REQUEST_LIMIT' || message?.toLowerCase().includes(SESSION_LIMIT_MESSAGE)) {
        return 'refresh_session';
    }
    if (message?.toLowerCase().includes('demo ip rate limit') || code === 'DEMO_IP_RATE_LIMIT') return 'wait_for_ip_window';
    return code === 'DEMO_SESSION_CONCURRENCY_LIMIT' ? 'wait_for_slot' : null;
};

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Enforce the demo gateway's request contract at the final browser boundary:
 * confirmed-schema input items, no max_output_tokens/top_p, a short-lived dmo_
 * bearer token, the session's model alias, at most 2 requests in flight, and
 * one session refresh (plus short waits for a free slot) on recoverable 4xx.
 */
export const fetchDefaultGateway: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method.toUpperCase() !== 'POST') {
        return fetchWithoutForbiddenUserAgent(request);
    }

    let payload: unknown;
    try {
        payload = JSON.parse(await request.clone().text());
    } catch {
        throw new Error('The demo gateway requires a JSON request body.');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('The demo gateway requires a JSON object request body.');
    }

    const body = sanitizeDemoGatewayInput(payload as Record<string, unknown>);
    delete body.max_output_tokens;
    if (endsWithAssistantMessage(body.input)) {
        console.warn('[DemoGateway] Request history ends with an assistant message; the upstream model may reject it.');
    }

    recordDemoGatewayRequest(body);
    let refreshed = false;
    let slotWaits = 0;
    let ipWaits = 0;
    for (;;) {
        await rateWindowLimiter.waitForTurn();
        const release = await requestLimiter.acquire();
        let outcome: { response: Response; token: string };
        try {
            outcome = await sendWithSession(request.clone(), body);
        } catch (error) {
            release();
            throw error;
        }

        const rejection = await classifyRejection(outcome.response);
        const canRefresh = rejection === 'refresh_session' && !refreshed;
        const canWait = rejection === 'wait_for_slot' && slotWaits < CONCURRENCY_RETRY_DELAYS_MS.length;
        const canWaitForWindow = rejection === 'wait_for_ip_window' && ipWaits < IP_RATE_MAX_WAITS;
        if (!canRefresh && !canWait && !canWaitForWindow) return releaseWhenBodyDone(outcome.response, release);

        const ipDelayMs = canWaitForWindow ? ipRetryDelayMs(outcome.response) : 0;
        await outcome.response.body?.cancel().catch(() => undefined);
        release();
        if (canRefresh) {
            refreshed = true;
            invalidateDemoGatewaySession(outcome.token);
        } else if (canWaitForWindow) {
            ipWaits += 1;
            await sleep(ipDelayMs);
        } else {
            await sleep(CONCURRENCY_RETRY_DELAYS_MS[slotWaits]);
            slotWaits += 1;
        }
    }
};
