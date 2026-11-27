

/** Estimated usage / quota via the Storage Manager API (best-effort). */
export interface StorageEstimate {
    usageBytes: number;
    quotaBytes: number;
    usagePercent: number;
}

/**
 * Estimate Cache Storage size (used by @huggingface/transformers ONNX model cache).
 * Cached after first call since Cache Storage content rarely changes during a session.
 */
let _cacheStorageBytesEstimate: number | null = null;
/** Drop the cached Cache Storage size so the next estimate re-measures. */
export const resetCacheStorageBytesEstimate = (): void => { _cacheStorageBytesEstimate = null; };
export const estimateCacheStorageBytes = async (): Promise<number> => {
    if (_cacheStorageBytesEstimate !== null) return _cacheStorageBytesEstimate;
    try {
        if (typeof caches === 'undefined') { _cacheStorageBytesEstimate = 0; return 0; }
        const keys = await caches.keys();
        if (keys.length === 0) { _cacheStorageBytesEstimate = 0; return 0; }
        let total = 0;
        for (const key of keys) {
            const cache = await caches.open(key);
            const requests = await cache.keys();
            for (const req of requests) {
                try {
                    const resp = await cache.match(req);
                    if (resp) {
                        // Use Content-Length header if available (cheap), else read body size.
                        const cl = resp.headers.get('content-length');
                        if (cl) {
                            total += parseInt(cl, 10) || 0;
                        } else {
                            const body = await resp.clone().arrayBuffer();
                            total += body.byteLength;
                        }
                    }
                } catch { /* non-fatal — skip this entry */ }
            }
        }
        _cacheStorageBytesEstimate = total;
        return total;
    } catch {
        _cacheStorageBytesEstimate = 0;
        return 0;
    }
};

/**
 * Get storage estimate excluding Cache Storage (ONNX model cache).
 * navigator.storage.estimate() includes ALL origin storage (IndexedDB + Cache API + etc).
 * Since Cache Storage is used by @huggingface/transformers for ONNX model files (~200-300 MB)
 * and we cannot control it, we subtract it to get the actual IndexedDB usage.
 */
export const getStorageEstimate = async (): Promise<StorageEstimate | null> => {
    try {
        if (!navigator?.storage?.estimate) return null;
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        const cacheBytes = await estimateCacheStorageBytes();
        const idbUsage = Math.max(0, usage - cacheBytes);
        return {
            usageBytes: idbUsage,
            quotaBytes: quota,
            usagePercent: quota > 0 ? (idbUsage / quota) * 100 : 0,
        };
    } catch {
        return null;
    }
};
/** Clear all Cache Storage entries, continuing if an individual deletion fails. */
export const clearCacheStorage = async (): Promise<{ count: number; complete: boolean }> => {
    let count = 0;
    let complete = true;
    try {
        if (typeof caches !== 'undefined') {
            const keys = await caches.keys();
            for (const key of keys) {
                try {
                    if (await caches.delete(key)) count += 1;
                    else complete = false;
                } catch {
                    complete = false;
                }
            }
        }
    } catch {
        complete = false;
    }
    resetCacheStorageBytesEstimate();
    return { count, complete };
};

/** Clear all Cache Storage entries. Returns number of caches deleted. */
export const clearAllCacheStorage = async (): Promise<number> => {
    return (await clearCacheStorage()).count;
};
