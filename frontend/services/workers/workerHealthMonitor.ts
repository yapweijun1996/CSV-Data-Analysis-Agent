/**
 * Shared worker health check utility.
 *
 * Sends periodic lightweight `ping` RPCs through the client's existing
 * call() method.  After N consecutive failures the monitor triggers a
 * callback (typically resetWorker) so the worker can be recreated.
 */

export interface WorkerHealthMonitorConfig {
    /** Label for logging (e.g. 'data', 'duckdb', 'vector'). */
    workerFamily: string;
    /** Function that sends a ping RPC and resolves/rejects. */
    pingFn: () => Promise<unknown>;
    /** Called when consecutiveFailures >= failureThreshold. */
    onUnhealthy: (consecutiveFailures: number, lastError: Error) => void;
    /** Called when a ping succeeds after prior failures (recovery). */
    onRecovered?: () => void;
    /** Milliseconds between pings. Default: 15 000. */
    intervalMs?: number;
    /** Consecutive failures required before calling onUnhealthy. Default: 3. */
    failureThreshold?: number;
}

export const HEALTH_PING_INTERVAL_MS = 15_000;
export const HEALTH_PING_TIMEOUT_MS = 5_000;
export const HEALTH_FAILURE_THRESHOLD = 3;

const LOG_PREFIX = '[WorkerHealthMonitor]';

export class WorkerHealthMonitor {
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private consecutiveFailures = 0;
    private lastError: Error | null = null;
    private pingInFlight = false;

    constructor(private readonly config: WorkerHealthMonitorConfig) {}

    get isRunning(): boolean {
        return this.intervalId !== null;
    }

    get currentConsecutiveFailures(): number {
        return this.consecutiveFailures;
    }

    /** Start the periodic health check. No-op if already running. */
    start(): void {
        if (this.intervalId) return;
        this.intervalId = setInterval(
            () => { this.doPing(); },
            this.config.intervalMs ?? HEALTH_PING_INTERVAL_MS,
        );
    }

    /** Stop the health check and reset failure counters. */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.intervalId = null;
        this.consecutiveFailures = 0;
        this.lastError = null;
        this.pingInFlight = false;
    }

    private async doPing(): Promise<void> {
        // Skip if a previous ping is still in-flight (avoid pile-up).
        if (this.pingInFlight) return;
        this.pingInFlight = true;
        try {
            await this.config.pingFn();
            const wasFailing = this.consecutiveFailures > 0;
            this.consecutiveFailures = 0;
            this.lastError = null;
            if (wasFailing) {
                console.log(`${LOG_PREFIX} ${this.config.workerFamily} worker recovered after prior failures.`);
                this.config.onRecovered?.();
            }
        } catch (err) {
            this.consecutiveFailures++;
            this.lastError = err instanceof Error ? err : new Error(String(err));
            const threshold = this.config.failureThreshold ?? HEALTH_FAILURE_THRESHOLD;
            if (this.consecutiveFailures >= threshold) {
                console.error(
                    `${LOG_PREFIX} ${this.config.workerFamily} worker unresponsive `
                    + `(${this.consecutiveFailures} consecutive ping failures). Triggering reset.`,
                );
                // Auto-stop before invoking the callback.  The callback will
                // typically call resetWorker() which also calls stop(), but
                // stopping first ensures the interval is cleared even if the
                // callback throws.
                const failures = this.consecutiveFailures;
                const error = this.lastError;
                this.stop();
                this.config.onUnhealthy(failures, error);
            }
        } finally {
            this.pingInFlight = false;
        }
    }
}
