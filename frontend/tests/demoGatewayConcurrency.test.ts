import { describe, expect, it, vi } from 'vitest';
import { createConcurrencyLimiter, createRateWindowLimiter, releaseWhenBodyDone } from '../services/ai/demoGatewayConcurrency';

describe('demo gateway concurrency limiter', () => {
    it('queues requests beyond the limit and frees slots on release', async () => {
        const limiter = createConcurrencyLimiter(2);
        const order: string[] = [];
        const first = await limiter.acquire();
        const second = await limiter.acquire();
        const third = limiter.acquire().then(release => { order.push('third'); return release; });

        await Promise.resolve();
        expect(order).toEqual([]);
        first();
        const releaseThird = await third;
        expect(order).toEqual(['third']);
        first(); // a second release of the same slot is ignored
        second();
        releaseThird();
    });

    it('holds the slot until the response body is fully read', async () => {
        let released = 0;
        const response = releaseWhenBodyDone(new Response('hello', { status: 200 }), () => { released += 1; });

        expect(released).toBe(0);
        expect(await response.text()).toBe('hello');
        expect(released).toBe(1);
    });

    it('frees a slot whose body is never read after the safety timeout', async () => {
        vi.useFakeTimers();
        let released = 0;
        releaseWhenBodyDone(new Response('unread', { status: 200 }), () => { released += 1; }, 1000);

        await vi.advanceTimersByTimeAsync(1001);
        vi.useRealTimers();
        expect(released).toBe(1);
    });

    it('releases when the body is cancelled and for bodiless responses', async () => {
        let released = 0;
        const response = releaseWhenBodyDone(new Response('data', { status: 200 }), () => { released += 1; });
        await response.body?.cancel();
        expect(released).toBe(1);

        releaseWhenBodyDone(new Response(null, { status: 204 }), () => { released += 1; });
        expect(released).toBe(2);
    });
});

describe('demo gateway rolling-window limiter', () => {
    it('lets the first requests through and delays the one that would exceed the window', async () => {
        let clock = 0;
        const sleeps: number[] = [];
        const limiter = createRateWindowLimiter(3, 60_000, () => clock, async ms => { sleeps.push(ms); clock += ms; });

        await limiter.waitForTurn();
        clock = 10;
        await limiter.waitForTurn();
        clock = 20;
        await limiter.waitForTurn();
        expect(sleeps).toEqual([]);

        await limiter.waitForTurn();
        // The oldest request (t=0) leaves the window at 60,000; the limiter waits for exactly that.
        expect(sleeps).toEqual([60_000 - 20 + 25]);
        expect(clock).toBe(60_025);
    });

    it('forgets requests once they are older than the window', async () => {
        let clock = 0;
        const sleep = vi.fn(async () => undefined);
        const limiter = createRateWindowLimiter(1, 1_000, () => clock, sleep);
        await limiter.waitForTurn();
        clock = 1_000;
        await limiter.waitForTurn();
        expect(sleep).not.toHaveBeenCalled();
    });
});
