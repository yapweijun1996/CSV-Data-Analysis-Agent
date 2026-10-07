import {
    DEFAULT_GATEWAY_MODEL,
    DEFAULT_GATEWAY_SESSION_URL,
    resolveDefaultGatewayProjectId,
} from '../../config/defaultGatewayConfig';

/** Refresh this long before expiry so an in-flight stream never outlives its token. */
export const DEMO_SESSION_REFRESH_MARGIN_MS = 60_000;

export interface DemoGatewaySession {
    token: string;
    /** Wire model alias chosen by the gateway for this project. */
    model: string;
    expiresAtMs: number;
}

/** Carries the gateway's `error.code` so callers and diagnostics can surface it. */
export class DemoGatewayError extends Error {
    readonly status: number;
    readonly code?: string;

    constructor(message: string, status: number, code?: string) {
        super(code ? `${message} (${code})` : message);
        this.name = 'DemoGatewayError';
        this.status = status;
        this.code = code;
    }
}

// The token lives in memory only: a page reload simply opens a new session.
let currentSession: DemoGatewaySession | null = null;
let inFlightRefresh: Promise<DemoGatewaySession> | null = null;

const isFresh = (session: DemoGatewaySession): boolean =>
    session.expiresAtMs - DEMO_SESSION_REFRESH_MARGIN_MS > Date.now();

export const readGatewayErrorBody = async (
    response: Response,
): Promise<{ code?: string; message?: string }> => {
    try {
        const body = await response.clone().json() as { error?: { code?: unknown; message?: unknown } | string };
        if (typeof body.error === 'string') return { message: body.error };
        return {
            code: typeof body.error?.code === 'string' ? body.error.code : undefined,
            message: typeof body.error?.message === 'string' ? body.error.message : undefined,
        };
    } catch {
        return {};
    }
};

const openSession = async (): Promise<DemoGatewaySession> => {
    const projectId = resolveDefaultGatewayProjectId();
    if (!projectId) {
        throw new DemoGatewayError('The default gateway project is not configured for this build.', 0, 'DEMO_PROJECT_NOT_CONFIGURED');
    }

    const response = await globalThis.fetch(DEFAULT_GATEWAY_SESSION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
    });
    if (!response.ok) {
        const { code, message } = await readGatewayErrorBody(response);
        throw new DemoGatewayError(message ?? `Demo session request failed with status ${response.status}.`, response.status, code);
    }

    const body = await response.json() as { token?: unknown; model?: unknown; expires_in?: unknown };
    if (typeof body.token !== 'string' || !body.token) {
        throw new DemoGatewayError('The demo gateway returned no session token.', response.status, 'DEMO_SESSION_INVALID');
    }
    // Relative TTL avoids trusting the visitor's clock against a server timestamp.
    const ttlSeconds = typeof body.expires_in === 'number' && body.expires_in > 0 ? body.expires_in : 900;
    return {
        token: body.token,
        model: typeof body.model === 'string' && body.model ? body.model : DEFAULT_GATEWAY_MODEL,
        expiresAtMs: Date.now() + ttlSeconds * 1000,
    };
};

/** Returns a live session, opening or refreshing one with a single in-flight request. */
export const getDemoGatewaySession = async (): Promise<DemoGatewaySession> => {
    if (currentSession && isFresh(currentSession)) return currentSession;
    if (!inFlightRefresh) {
        inFlightRefresh = openSession()
            .then(session => {
                currentSession = session;
                return session;
            })
            .finally(() => {
                inFlightRefresh = null;
            });
    }
    return inFlightRefresh;
};

/** Drops the cached session when the gateway rejected it (expired or request cap reached). */
export const invalidateDemoGatewaySession = (rejectedToken?: string): void => {
    // A concurrent caller may already have replaced the rejected token.
    if (rejectedToken && currentSession && currentSession.token !== rejectedToken) return;
    currentSession = null;
};

export const resetDemoGatewaySessionForTests = (): void => {
    currentSession = null;
    inFlightRefresh = null;
};
