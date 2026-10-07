/**
 * "Default" AI provider: a shared demo gateway (owned by the maintainer, not
 * the end user) so the project works out of the box without BYOK.
 *
 * No long-lived gateway key ships in the bundle. The browser opens a
 * short-lived, origin-bound `dmo_*` session through `POST /demo/session` (see
 * services/ai/demoGatewaySession.ts). The gateway enforces origin
 * registration, request caps and a daily token quota server-side.
 */

export const DEFAULT_GATEWAY_ORIGIN = 'https://gpt.yapweijun1996.com';
export const DEFAULT_GATEWAY_SESSION_URL = `${DEFAULT_GATEWAY_ORIGIN}/demo/session`;
export const DEFAULT_GATEWAY_BASE_URL = `${DEFAULT_GATEWAY_ORIGIN}/demo/v1`;

/**
 * Stable logical model id used by settings, the UI label and context-window
 * planning. The wire model is the alias returned by the session response and
 * is substituted at the final request boundary (browserProviderFetch.ts).
 */
export const DEFAULT_GATEWAY_MODEL = 'gpt-5.4-mini';

/**
 * Non-secret placeholder for SDKs that insist on an apiKey. The real
 * `Authorization: Bearer dmo_...` header is injected per request.
 */
export const DEFAULT_GATEWAY_API_KEY_PLACEHOLDER = 'demo-session';

/**
 * Demo project registered in the gateway for this app's exact origin. It is
 * supplied at build time (VITE_DEFAULT_GATEWAY_PROJECT_ID) so it lives in one
 * place and is never duplicated in source. An empty value makes the session
 * flow fail with a clear configuration error instead of guessing.
 */
export const resolveDefaultGatewayProjectId = (): string =>
    (import.meta.env.VITE_DEFAULT_GATEWAY_PROJECT_ID ?? '').trim();
