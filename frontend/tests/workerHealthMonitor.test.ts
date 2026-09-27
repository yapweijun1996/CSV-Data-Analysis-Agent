import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    WorkerHealthMonitor,
    HEALTH_PING_INTERVAL_MS,
    HEALTH_FAILURE_THRESHOLD,
} from '../services/workers/workerHealthMonitor';

describe('WorkerHealthMonitor', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts stopped with zero failures', () => {
        const monitor = new WorkerHealthMonitor({
            workerFamily: 'test',
            pingFn: () => Promise.resolve(),
            onUnhealthy: vi.fn(),
        });
        expect(monitor.isRunning).toBe(false);
        expect(monitor.currentConsecutiveFailures).toBe(0);
    });

    it('start/stop lifecycle', () => {
        const monitor = new WorkerHealthMonitor({
            workerFamily: 'test',
            pingFn: () => Promise.resolve(),
            onUnhealthy: vi.fn(),
        });
        monitor.start();
        expect(monitor.isRunning).toBe(true);
        monitor.stop();
        expect(monitor.isRunning).toBe(false);
    });

    it('successful ping keeps failure count at zero', async () => {
        const onUnhealthy = vi.fn();
        const monitor = new WorkerHealthMonitor({
            workerFamily: 'test',
            pingFn: () => Promise.resolve({ pong: true }),
            onUnhealthy,
        });
        monitor.start();
        await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        expect(monitor.currentConsecutiveFailures).toBe(0);
        expect(onUnhealthy).not.toHaveBeenCalled();
        monitor.stop();
    });

    it('single failure does not trigger onUnhealthy', async () => {
        const onUnhealthy = vi.fn();
        let shouldFail = true;
        const monitor = new WorkerHealthMonitor({
            workerFamily: 'test',
            pingFn: () => shouldFail ? Promise.reject(new Error('timeout')) : Promise.resolve(),
            onUnhealthy,
        });
        monitor.start();
        // First tick: fail
        await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        expect(monitor.currentConsecutiveFailures).toBe(1);
        expect(onUnhealthy).not.toHaveBeenCalled();

        // Second tick: succeed
        shouldFail = false;
        await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        expect(monitor.currentConsecutiveFailures).toBe(0);
        expect(onUnhealthy).not.toHaveBeenCalled();
        monitor.stop();
    });

    it('3 consecutive failures trigger onUnhealthy and auto-stop', async () => {
        const onUnhealthy = vi.fn();
        const monitor = new WorkerHealthMonitor({
            workerFamily: 'test',
            pingFn: () => Promise.reject(new Error('dead')),
            onUnhealthy,
        });
        monitor.start();

        for (let i = 0; i < HEALTH_FAILURE_THRESHOLD; i++) {
            await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        }

        expect(onUnhealthy).toHaveBeenCalledTimes(1);
        expect(onUnhealthy).toHaveBeenCalledWith(
            HEALTH_FAILURE_THRESHOLD,
            expect.objectContaining({ message: 'dead' }),
        );
        // Auto-stopped after triggering
        expect(monitor.isRunning).toBe(false);
    });

    it('custom failureThreshold is respected', async () => {
        const onUnhealthy = vi.fn();
        const customThreshold = 5;
        const monitor = new WorkerHealthMonitor({
            workerFamily: 'test',
            pingFn: () => Promise.reject(new Error('fail')),
            onUnhealthy,
            failureThreshold: customThreshold,
        });
        monitor.start();

        // 4 failures: not yet
        for (let i = 0; i < customThreshold - 1; i++) {
            await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        }
        expect(onUnhealthy).not.toHaveBeenCalled();

        // 5th failure: triggers
        await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        expect(onUnhealthy).toHaveBeenCalledTimes(1);
        monitor.stop();
    });

    it('skips overlapping ping when previous is still in-flight', async () => {
        const pingFn = vi.fn(() => new Promise<void>(() => {})); // never resolves
        const monitor = new WorkerHealthMonitor({
            workerFamily: 'test',
            pingFn,
            onUnhealthy: vi.fn(),
        });
        monitor.start();

        // First tick: starts ping (never resolves)
        await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        // Second tick: should skip because first is still in-flight
        await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);

        expect(pingFn).toHaveBeenCalledTimes(1);
        monitor.stop();
    });

    it('onRecovered fires when ping succeeds after failures', async () => {
        const onRecovered = vi.fn();
        let failCount = 0;
        const monitor = new WorkerHealthMonitor({
            workerFamily: 'test',
            pingFn: () => {
                failCount++;
                if (failCount <= 2) return Promise.reject(new Error('fail'));
                return Promise.resolve();
            },
            onUnhealthy: vi.fn(),
            onRecovered,
        });
        monitor.start();

        // 2 failures
        await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        expect(onRecovered).not.toHaveBeenCalled();

        // 3rd tick: success → recovery
        await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        expect(onRecovered).toHaveBeenCalledTimes(1);
        monitor.stop();
    });

    it('stop() resets failure counter', async () => {
        const onUnhealthy = vi.fn();
        const monitor = new WorkerHealthMonitor({
            workerFamily: 'test',
            pingFn: () => Promise.reject(new Error('fail')),
            onUnhealthy,
        });
        monitor.start();

        // 2 failures (below threshold)
        await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        expect(monitor.currentConsecutiveFailures).toBe(2);

        // Stop resets counter
        monitor.stop();
        expect(monitor.currentConsecutiveFailures).toBe(0);

        // Restart: next failure counted from 0
        monitor.start();
        await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        expect(monitor.currentConsecutiveFailures).toBe(1);
        expect(onUnhealthy).not.toHaveBeenCalled();
        monitor.stop();
    });

    it('start() is a no-op if already running', async () => {
        const pingFn = vi.fn(() => Promise.resolve());
        const monitor = new WorkerHealthMonitor({
            workerFamily: 'test',
            pingFn,
            onUnhealthy: vi.fn(),
        });
        monitor.start();
        monitor.start(); // second call — no-op

        await vi.advanceTimersByTimeAsync(HEALTH_PING_INTERVAL_MS);
        // Should only have 1 ping, not 2 (no duplicate interval)
        expect(pingFn).toHaveBeenCalledTimes(1);
        monitor.stop();
    });
});
