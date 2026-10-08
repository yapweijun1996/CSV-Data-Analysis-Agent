/**
 * Each demo session allows 2 concurrent requests. Queue requests client-side
 * so bursts wait instead of failing with DEMO_SESSION_CONCURRENCY_LIMIT.
 */
export const DEMO_SESSION_MAX_CONCURRENT_REQUESTS = 2;

/** The gateway allows 30 requests per minute per IP; stay under it so a busy run waits instead of failing. */
export const DEMO_IP_MAX_REQUESTS_PER_MINUTE = 28;
export const DEMO_IP_WINDOW_MS = 60_000;

export interface RateWindowLimiter {
    /** Resolves once sending one more request keeps the rolling window within its limit. */
    waitForTurn: () => Promise<void>;
}

export const createRateWindowLimiter = (
    maxRequests: number,
    windowMs: number,
    now: () => number = Date.now,
    sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): RateWindowLimiter => {
    const sentAt: number[] = [];
    return {
        waitForTurn: async () => {
            for (;;) {
                const current = now();
                while (sentAt.length > 0 && current - sentAt[0] >= windowMs) sentAt.shift();
                if (sentAt.length < maxRequests) {
                    sentAt.push(current);
                    return;
                }
                await sleep(sentAt[0] + windowMs - current + 25);
            }
        },
    };
};

export interface ConcurrencyLimiter {
    /** Resolves with a one-shot release function once a slot is free. */
    acquire: () => Promise<() => void>;
}

export const createConcurrencyLimiter = (max: number): ConcurrencyLimiter => {
    let active = 0;
    const waiting: Array<() => void> = [];

    const grant = (): (() => void) => {
        active += 1;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            active -= 1;
            waiting.shift()?.();
        };
    };

    return {
        acquire: () => new Promise(resolve => {
            if (active < max) resolve(grant());
            else waiting.push(() => resolve(grant()));
        }),
    };
};

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

// Safety net: a caller that never reads or cancels a body must not hold a slot forever.
const MAX_SLOT_HOLD_MS = 10 * 60 * 1000;

/** Holds the slot until the response body is fully read, errored or cancelled. */
export const releaseWhenBodyDone = (
    response: Response,
    releaseSlot: () => void,
    maxHoldMs = MAX_SLOT_HOLD_MS,
): Response => {
    if (!response.body || NULL_BODY_STATUSES.has(response.status)) {
        releaseSlot();
        return response;
    }
    const holdTimer = setTimeout(releaseSlot, maxHoldMs);
    const release = () => {
        clearTimeout(holdTimer);
        releaseSlot();
    };
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const { done, value } = await reader.read();
                if (done) {
                    controller.close();
                    release();
                } else {
                    controller.enqueue(value);
                }
            } catch (error) {
                release();
                controller.error(error);
            }
        },
        cancel(reason) {
            release();
            return reader.cancel(reason);
        },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
};
