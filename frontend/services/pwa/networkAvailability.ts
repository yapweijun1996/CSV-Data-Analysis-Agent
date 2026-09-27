export class CloudAiOfflineError extends Error {
    readonly code = 'cloud_ai_offline';

    constructor() {
        super('Cloud AI is paused until the browser is online.');
        this.name = 'CloudAiOfflineError';
    }
}

export const isBrowserOnline = (): boolean =>
    typeof navigator === 'undefined' || navigator.onLine !== false;

/** Waits without consuming an AI attempt while the browser is offline. */
export const waitForCloudAiConnectivity = async (
    abortSignal?: AbortSignal,
): Promise<void> => {
    if (isBrowserOnline()) return;
    if (abortSignal?.aborted) {
        throw abortSignal.reason ?? new DOMException('The AI request was cancelled.', 'AbortError');
    }
    if (typeof window === 'undefined') throw new CloudAiOfflineError();

    await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            window.removeEventListener('online', handleOnline);
            abortSignal?.removeEventListener('abort', handleAbort);
        };
        const handleOnline = () => {
            cleanup();
            resolve();
        };
        const handleAbort = () => {
            cleanup();
            reject(abortSignal?.reason ?? new DOMException('The AI request was cancelled.', 'AbortError'));
        };
        window.addEventListener('online', handleOnline, { once: true });
        abortSignal?.addEventListener('abort', handleAbort, { once: true });
    });
};
