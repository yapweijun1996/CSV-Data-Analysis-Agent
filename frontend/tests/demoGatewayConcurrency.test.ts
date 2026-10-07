import { describe, expect, it, vi } from 'vitest';
import { createConcurrencyLimiter, releaseWhenBodyDone } from '../services/ai/demoGatewayConcurrency';

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
