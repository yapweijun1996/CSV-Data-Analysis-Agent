/**
 * Provider-call timeout utilities shared by browser AI workflows.
 *
 * These guards are provider infrastructure, not follow-up loop state. A
 * streaming caller should call signalActivity whenever a response chunk
 * arrives so only an idle connection reaches the timeout.
 */
export const PROVIDER_MODEL_CALL_TIMEOUT_MS = 60_000;

export class ProviderTimeoutError extends Error {
    readonly timeoutMs: number;
    readonly timeoutReason = 'model_call_timeout' as const;

    constructor(timeoutMs: number) {
        super(`Provider model call timed out after ${timeoutMs}ms`);
        this.name = 'ProviderTimeoutError';
        this.timeoutMs = timeoutMs;
    }
}

export const isProviderTimeoutError = (
    error: unknown,
): error is ProviderTimeoutError => error instanceof ProviderTimeoutError;

export const raceWithModelTimeout = <T>(
    promise: Promise<T>,
    timeoutMs: number,
): Promise<T> => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
            () => reject(new ProviderTimeoutError(timeoutMs)),
            timeoutMs,
        );
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutHandle);
    }) as Promise<T>;
};

export const raceWithActivityTimeout = <T>(
    task: Promise<T>,
    timeoutMs: number,
): { promise: Promise<T>; signalActivity: () => void } => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let rejectTimeout: (reason: Error) => void;

    const resetTimer = () => {
        clearTimeout(timeoutHandle);
        if (!settled) {
            timeoutHandle = setTimeout(
                () => rejectTimeout(new ProviderTimeoutError(timeoutMs)),
                timeoutMs,
            );
        }
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
        rejectTimeout = reject;
        resetTimer();
    });
    const signalActivity = () => resetTimer();
    const promise = Promise.race([task, timeoutPromise]).finally(() => {
        settled = true;
        clearTimeout(timeoutHandle);
    }) as Promise<T>;

    return { promise, signalActivity };
};
