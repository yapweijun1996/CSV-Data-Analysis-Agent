export type PwaLifecycleStatus =
    | 'idle'
    | 'ready'
    | 'offline'
    | 'update_available'
    | 'applying_update'
    | 'unsupported'
    | 'error';

export interface PwaLifecycleState {
    status: PwaLifecycleStatus;
    isOnline: boolean;
    version: string | null;
    storageUsageBytes: number | null;
    storageQuotaBytes: number | null;
}

let state: PwaLifecycleState = {
    status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'idle',
    isOnline: typeof navigator === 'undefined' || navigator.onLine !== false,
    version: null,
    storageUsageBytes: null,
    storageQuotaBytes: null,
};
let registration: ServiceWorkerRegistration | null = null;
let initialized = false;
let reloadOnControllerChange = false;
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
};

export const registerPwa = async (): Promise<void> => {
    if (initialized) return;
    initialized = true;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        emit({ status: 'unsupported' });
        return;
    }

    const handleOnline = () => emit({ isOnline: true, status: registration?.waiting ? 'update_available' : 'ready' });
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
    runtimeCleanup.push(
        () => window.removeEventListener('online', handleOnline),
        () => window.removeEventListener('offline', handleOffline),
        () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange),
        () => navigator.serviceWorker.removeEventListener('message', handleMessage),
    );

    try {
        const workerUrl = new URL('service-worker.js', document.baseURI);
        registration = await navigator.serviceWorker.register(workerUrl.toString(), {
            scope: new URL('./', workerUrl).pathname,
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
        isOnline: typeof navigator === 'undefined' || navigator.onLine !== false,
        version: null,
        storageUsageBytes: null,
        storageQuotaBytes: null,
    };
    registration = null;
    initialized = false;
    reloadOnControllerChange = false;
    listeners.clear();
};
