export type PwaLifecycleStatus =
    | 'idle'
    | 'ready'
    | 'offline'
    | 'update_available'
    | 'applying_update'
    | 'unsupported'
    | 'error';

export type PwaCheckStatus = 'idle' | 'checking' | 'up_to_date' | 'update_found' | 'error';

/**
 * Phases of one update run, for the full-screen loader. `flowManual` is true only when the
 * user pressed the button (or an update is being applied), so silent background checks
 * never cover the screen.
 */
export type PwaUpdateFlow =
    | 'idle'
    | 'checking'
    | 'downloading'
    | 'reloading'
    | 'up_to_date'
    | 'deferred'
    | 'error';

export interface PwaLifecycleState {
    flow: PwaUpdateFlow;
    flowManual: boolean;
    status: PwaLifecycleStatus;
    /** Result of the latest update check, for the manual check button. */
    checkStatus: PwaCheckStatus;
    isOnline: boolean;
    version: string | null;
    storageUsageBytes: number | null;
    storageQuotaBytes: number | null;
}

let state: PwaLifecycleState = {
    flow: 'idle',
    flowManual: false,
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
/** A manual check shows its "checking" phase at least this long so the loader never flashes. */
const MIN_MANUAL_CHECK_MS = 800;
/** If the new worker never takes control, stop the loader instead of spinning forever. */
const APPLY_TIMEOUT_MS = 20_000;
const RELOAD_NOTICE_MS = 900;
let applyTimer: ReturnType<typeof setTimeout> | null = null;
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
export const checkForPwaUpdate = async (options: { manual?: boolean } = {}): Promise<PwaCheckStatus> => {
    if (!registration) {
        if (options.manual) emit({ flow: 'error', flowManual: true });
        return 'error';
    }
    if (state.checkStatus === 'checking' || state.status === 'applying_update') return state.checkStatus;
    const manual = Boolean(options.manual);
    emit({ checkStatus: 'checking', flow: manual ? 'checking' : state.flow, flowManual: manual });
    const minimumShown = manual
        ? new Promise<void>(resolve => setTimeout(resolve, MIN_MANUAL_CHECK_MS))
        : Promise.resolve();
    try {
        await registration.update();
        if (!registration.waiting && registration.installing) {
            if (manual) emit({ flow: 'downloading' });
            const installed = await waitForInstalled(registration.installing);
            if (!installed && !registration.waiting) throw new Error('pwa_install_failed');
            if (manual) await new Promise<void>(resolve => setTimeout(resolve, MIN_MANUAL_CHECK_MS));
        }
        await minimumShown;
        if (registration.waiting) {
            emit({ checkStatus: 'update_found' });
            markWaitingWorker(registration.waiting);
            const applied = await autoApplyPwaUpdate();
            // Held back (a run is active): the banner keeps the explicit action.
            if (!applied && manual) emit({ flow: 'deferred' });
            return 'update_found';
        }
        emit({ checkStatus: 'up_to_date', flow: manual ? 'up_to_date' : 'idle', flowManual: manual });
        return 'up_to_date';
    } catch {
        await minimumShown;
        emit({ checkStatus: 'error', flow: manual ? 'error' : 'idle', flowManual: manual });
        return 'error';
    }
};

/** Called by the loader once it has told the user the outcome (toast) and can go away. */
export const acknowledgePwaFlow = (): void => {
    if (state.flow === 'idle' && !state.flowManual) return;
    emit({ flow: 'idle', flowManual: false });
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
    if (state.status === 'applying_update') return true;
    if (!registration.waiting) await registration.update();
    if (!registration.waiting) return false;
    reloadOnControllerChange = true;
    const waiting = registration.waiting;
    emit({ status: 'applying_update', flow: 'reloading', flowManual: true });
    // Let the "installing and reloading" step be readable before the page restarts.
    await new Promise<void>(resolve => setTimeout(resolve, RELOAD_NOTICE_MS));
    waiting.postMessage({ type: 'SKIP_WAITING' });
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
        if (state.status !== 'applying_update') return;
        reloadOnControllerChange = false;
        emit({ status: 'update_available', flow: 'error', flowManual: true });
    }, APPLY_TIMEOUT_MS);
    return true;
};

export const __resetPwaManagerForTests = (): void => {
    runtimeCleanup.splice(0).forEach(cleanup => cleanup());
    state = {
        flow: 'idle',
        flowManual: false,
        status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'idle',
        checkStatus: 'idle',
        isOnline: typeof navigator === 'undefined' || navigator.onLine !== false,
        version: null,
        storageUsageBytes: null,
        storageQuotaBytes: null,
    };
    autoUpdateGuard = () => true;
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = null;
    registration = null;
    initialized = false;
    reloadOnControllerChange = false;
    listeners.clear();
};
