const STALE_CHUNK_RELOAD_KEY = 'csv-data-analysis:stale-chunk-reload';
const RELOAD_COOLDOWN_MS = 15_000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

interface ReloadMarker {
    href: string;
    at: number;
}

function readReloadMarker(storage: StorageLike): ReloadMarker | null {
    try {
        const raw = storage.getItem(STALE_CHUNK_RELOAD_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as Partial<ReloadMarker>;
        if (typeof parsed.href !== 'string' || typeof parsed.at !== 'number') {
            return null;
        }

        return { href: parsed.href, at: parsed.at };
    } catch {
        return null;
    }
}

function writeReloadMarker(storage: StorageLike, href: string, now: number): void {
    try {
        storage.setItem(STALE_CHUNK_RELOAD_KEY, JSON.stringify({ href, at: now }));
    } catch {
        // Ignore storage failures and still let the page reload.
    }
}

function readErrorMessage(reason: unknown): string {
    if (typeof reason === 'string') {
        return reason;
    }

    if (!reason || typeof reason !== 'object') {
        return '';
    }

    if ('message' in reason && typeof reason.message === 'string') {
        return reason.message;
    }

    if ('reason' in reason) {
        return readErrorMessage((reason as { reason?: unknown }).reason);
    }

    if ('payload' in reason) {
        return readErrorMessage((reason as { payload?: unknown }).payload);
    }

    if ('detail' in reason) {
        return readErrorMessage((reason as { detail?: unknown }).detail);
    }

    return '';
}

export function isRecoverableChunkLoadError(reason: unknown): boolean {
    const message = readErrorMessage(reason).trim();
    if (!message) {
        return false;
    }

    return (
        message.includes('Failed to fetch dynamically imported module')
        || message.includes('Importing a module script failed')
        || message.includes('ChunkLoadError')
        || message.includes('Loading chunk')
    );
}

export function shouldReloadForStaleChunk(
    storage: StorageLike,
    href: string,
    now: number,
): boolean {
    const lastReload = readReloadMarker(storage);
    if (lastReload && lastReload.href === href && now - lastReload.at < RELOAD_COOLDOWN_MS) {
        return false;
    }

    writeReloadMarker(storage, href, now);
    return true;
}

export function installStaleChunkRecovery(targetWindow: Window = window): () => void {
    const recover = (reason: unknown): void => {
        if (!isRecoverableChunkLoadError(reason)) {
            return;
        }

        const canReload = shouldReloadForStaleChunk(
            targetWindow.sessionStorage,
            targetWindow.location.href,
            Date.now(),
        );

        if (!canReload) {
            console.error('Dynamic import failed after a recent stale chunk reload attempt.', reason);
            return;
        }

        targetWindow.location.reload();
    };

    const handlePreloadError = (event: Event): void => {
        const preloadEvent = event as CustomEvent<unknown> & { payload?: unknown };
        const payload = preloadEvent.payload ?? preloadEvent.detail;
        if (!isRecoverableChunkLoadError(payload)) {
            return;
        }

        event.preventDefault?.();
        recover(payload);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
        if (!isRecoverableChunkLoadError(event.reason)) {
            return;
        }

        event.preventDefault();
        recover(event.reason);
    };

    targetWindow.addEventListener('vite:preloadError', handlePreloadError as EventListener);
    targetWindow.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
        targetWindow.removeEventListener('vite:preloadError', handlePreloadError as EventListener);
        targetWindow.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
}
