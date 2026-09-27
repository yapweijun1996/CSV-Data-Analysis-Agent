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

/** Enforce the demo gateway's request contract at the final browser boundary. */
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

    const body = { ...payload as Record<string, unknown> };
    delete body.max_output_tokens;
    return fetchWithoutForbiddenUserAgent(new Request(request, {
        body: JSON.stringify(body),
    }));
};
