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

/**
 * Pi replays each stored reasoning item verbatim, including the optional
 * `content` and `status` fields the model streamed back. The demo gateway
 * accepts only the replayable core (DEMO_FIELD_DISABLED otherwise), so reduce
 * reasoning input items to it. Encrypted content carries the real state.
 */
const sanitizeReasoningInput = (body: Record<string, unknown>): Record<string, unknown> => {
    if (!Array.isArray(body.input)) return body;
    return {
        ...body,
        input: body.input.map(item => {
            if (!item || typeof item !== 'object' || (item as { type?: unknown }).type !== 'reasoning') return item;
            const { id, summary, encrypted_content: encryptedContent } = item as Record<string, unknown>;
            return {
                type: 'reasoning',
                ...(id !== undefined ? { id } : {}),
                summary: Array.isArray(summary) ? summary : [],
                ...(encryptedContent !== undefined ? { encrypted_content: encryptedContent } : {}),
            };
        }),
    };
};

const SESSION_LIMIT_MESSAGE = 'demo session request limit reached';

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

/** True when the gateway says this session is expired or has spent its request cap. */
const isRefreshableRejection = async (response: Response): Promise<boolean> => {
    if (response.status === 401) return true;
    if (response.status !== 429) return false;
    const { message } = await readGatewayErrorBody(response);
    return Boolean(message?.toLowerCase().includes(SESSION_LIMIT_MESSAGE));
};

/**
 * Enforce the demo gateway's request contract at the final browser boundary:
 * no max_output_tokens, a short-lived dmo_ bearer token, and the session's
 * model alias. An expired or exhausted session is refreshed once and the same
 * request is replayed.
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

    const body = sanitizeReasoningInput({ ...payload as Record<string, unknown> });
    delete body.max_output_tokens;

    const first = await sendWithSession(request.clone(), body);
    if (!await isRefreshableRejection(first.response)) return first.response;

    invalidateDemoGatewaySession(first.token);
    return (await sendWithSession(request, body)).response;
};
