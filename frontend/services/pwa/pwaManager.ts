export type PwaLifecycleStatus =
    | 'idle'
    | 'ready'
    | 'offline'
    | 'update_available'
    | 'applying_update'
    | 'unsupported'
    | 'error';

export type PwaCheckStatus = 'idle' | 'checking' | 'up_to_date' | 'update_found' | 'error';

export interface PwaLifecycleState {
    status: PwaLifecycleStatus;
    /** Result of the latest update check, for the manual check button. */
    checkStatus: PwaCheckStatus;
    isOnline: boolean;
    version: string | null;
    storageUsageBytes: number | null;
    storageQuotaBytes: number | null;
}

let state: PwaLifecycleState = {
    status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'idle',
    checkStatus: 'idle',
    isOnline: typeof navigator === 'undefined' || navigator.onLine !== false,
    version: null,
    storageUsageBytes: null,
    storageQuotaBytes: null,
};
let registration: ServiceWorkerRegistration | null = null;
let initialized = false;
let reloadOnControllerChange = false;
// Auto-update reloads the page, so it only runs while the app reports it is idle.
let autoUpdateGuard: () => boolean = () => true;
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const INSTALL_WAIT_TIMEOUT_MS = 30_000;
const listeners = new Set<() => void>();
const runtimeCleanup: Array<() => void> = [];

const emit = (patch: Partial<PwaLifecycleState>): void => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
};

export const getPwaLifecycleState = (): PwaLifecycleState => state;
export const subscribePwaLifecycle = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const refreshPwaStorageEstimate = async (): Promise<void> => {
    try {
        const estimate = await navigator.storage?.estimate?.();
        emit({
            storageUsageBytes: estimate?.usage ?? null,
            storageQuotaBytes: estimate?.quota ?? null,
        });
    } catch {
        emit({ storageUsageBytes: null, storageQuotaBytes: null });
    }
};

const markWaitingWorker = (worker: ServiceWorker): void => {
    if (!navigator.serviceWorker.controller) {
        emit({ status: state.isOnline ? 'ready' : 'offline' });
        worker.postMessage({ type: 'SKIP_WAITING' });
        return;
    }
    emit({ status: state.isOnline ? 'update_available' : 'offline' });
    void autoApplyPwaUpdate();
};

/** Lets the app say when a reload is safe (no import, analysis or report in flight). */
export const setPwaAutoUpdateGuard = (guard: () => boolean): void => {
    autoUpdateGuard = guard;
};

/** Applies a waiting update by default; call again whenever the app becomes idle. */
export const autoApplyPwaUpdate = async (): Promise<boolean> => {
    if (!registration?.waiting || !state.isOnline || !autoUpdateGuard()) return false;
    return applyPwaUpdate();
};

const waitForInstalled = (worker: ServiceWorker): Promise<boolean> => new Promise(resolve => {
    if (worker.state === 'installed' || worker.state === 'activated') return resolve(true);
    const timeout = setTimeout(() => resolve(false), INSTALL_WAIT_TIMEOUT_MS);
    worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') { clearTimeout(timeout); resolve(true); }
        if (worker.state === 'redundant') { clearTimeout(timeout); resolve(false); }
    });
});

/**
 * Checks the server for a newer service worker. Used by the manual button and
 * the periodic/visibility checks. A found update is applied automatically when
 * the app is idle; otherwise the banner keeps the explicit refresh action.
 */
export const checkForPwaUpdate = async (): Promise<PwaCheckStatus> => {
    if (!registration) return 'error';
    emit({ checkStatus: 'checking' });
    try {
        await registration.update();
        if (!registration.waiting && registration.installing) await waitForInstalled(registration.installing);
        if (registration.waiting) {
            emit({ checkStatus: 'update_found' });
            markWaitingWorker(registration.waiting);
            return 'update_found';
        }
        emit({ checkStatus: 'up_to_date' });
        return 'up_to_date';
    } catch {
        emit({ checkStatus: 'error' });
        return 'error';
    }
};

export const registerPwa = async (): Promise<void> => {
    if (initialized) return;
    initialized = true;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        emit({ status: 'unsupported' });
        return;
    }

    const handleOnline = () => {
        emit({ isOnline: true, status: registration?.waiting ? 'update_available' : 'ready' });
        void autoApplyPwaUpdate();
    };
    const handleOffline = () => emit({ isOnline: false, status: 'offline' });
    const handleControllerChange = () => {
        if (reloadOnControllerChange) window.location.reload();
    };
    const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'PWA_VERSION') emit({ version: String(event.data.version) });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    navigator.serviceWorker.addEventListener('message', handleMessage);
    const handleVisible = () => {
        if (document.visibilityState === 'visible' && state.isOnline) void checkForPwaUpdate();
    };
    document.addEventListener('visibilitychange', handleVisible);
    const checkTimer = setInterval(() => {
        if (state.isOnline) void checkForPwaUpdate();
    }, UPDATE_CHECK_INTERVAL_MS);
    runtimeCleanup.push(
        () => document.removeEventListener('visibilitychange', handleVisible),
        () => clearInterval(checkTimer),
        () => window.removeEventListener('online', handleOnline),
        () => window.removeEventListener('offline', handleOffline),
        () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange),
        () => navigator.serviceWorker.removeEventListener('message', handleMessage),
    );

    try {
        const workerUrl = new URL('service-worker.js', document.baseURI);
        registration = await navigator.serviceWorker.register(workerUrl.toString(), {
            scope: new URL('./', workerUrl).pathname,
            // Always revalidate the worker script so a new release is noticed.
            updateViaCache: 'none',
        });
        if (registration.waiting) markWaitingWorker(registration.waiting);
        registration.addEventListener('updatefound', () => {
            const installing = registration?.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
                if (installing.state === 'installed') markWaitingWorker(installing);
            });
        });
        registration.active?.postMessage({ type: 'GET_VERSION' });
        // The active worker may not exist yet on a first install.
        void navigator.serviceWorker.ready?.then(ready => ready.active?.postMessage({ type: 'GET_VERSION' }));
        if (!registration.waiting) emit({ status: state.isOnline ? 'ready' : 'offline' });
        await refreshPwaStorageEstimate();
    } catch {
        emit({ status: state.isOnline ? 'error' : 'offline' });
    }
};

export const applyPwaUpdate = async (): Promise<boolean> => {
    if (!registration) return false;
    if (!registration.waiting) await registration.update();
    if (!registration.waiting) return false;
    reloadOnControllerChange = true;
    emit({ status: 'applying_update' });
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
};

export const __resetPwaManagerForTests = (): void => {
    runtimeCleanup.splice(0).forEach(cleanup => cleanup());
    state = {
        status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'idle',
        checkStatus: 'idle',
        isOnline: typeof navigator === 'undefined' || navigator.onLine !== false,
        version: null,
        storageUsageBytes: null,
        storageQuotaBytes: null,
    };
    autoUpdateGuard = () => true;
    registration = null;
    initialized = false;
    reloadOnControllerChange = false;
    listeners.clear();
};
