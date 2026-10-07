// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __resetPwaManagerForTests,
    applyPwaUpdate,
    autoApplyPwaUpdate,
    checkForPwaUpdate,
    getPwaLifecycleState,
    registerPwa,
    setPwaAutoUpdateGuard,
} from '../services/pwa/pwaManager';

describe('PWA lifecycle manager', () => {
    const waitingWorker = { postMessage: vi.fn() };
    const activeWorker = { postMessage: vi.fn() };
    const registration: {
        waiting: typeof waitingWorker | null;
        active: typeof activeWorker;
        installing: null;
        addEventListener: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    } = {
        waiting: waitingWorker,
        active: activeWorker,
        installing: null,
        addEventListener: vi.fn(),
        update: vi.fn(async () => undefined),
    };
    const serviceWorker = {
        controller: {},
        register: vi.fn(async () => registration),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
        Object.defineProperty(navigator, 'storage', {
            configurable: true,
            value: { estimate: vi.fn(async () => ({ usage: 2048, quota: 8192 })) },
        });
        registration.waiting = waitingWorker;
        __resetPwaManagerForTests();
    });

    afterEach(() => __resetPwaManagerForTests());

    it('registers inside the current repository subpath and reports a waiting update', async () => {
        setPwaAutoUpdateGuard(() => false);
        await registerPwa();

        expect(serviceWorker.register).toHaveBeenCalledWith(
            expect.stringContaining('/service-worker.js'),
            expect.objectContaining({ scope: '/' }),
        );
        expect(getPwaLifecycleState()).toMatchObject({
            status: 'update_available',
            storageUsageBytes: 2048,
            storageQuotaBytes: 8192,
        });
    });

    it('applies a waiting update automatically when the app is idle', async () => {
        await registerPwa();

        expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(getPwaLifecycleState().status).toBe('applying_update');
    });

    it('holds the update while a run is active, then applies it once idle', async () => {
        let busy = true;
        setPwaAutoUpdateGuard(() => !busy);
        await registerPwa();
        expect(waitingWorker.postMessage).not.toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(getPwaLifecycleState().status).toBe('update_available');

        busy = false;
        await expect(autoApplyPwaUpdate()).resolves.toBe(true);
        expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('still lets the explicit action apply a held update', async () => {
        setPwaAutoUpdateGuard(() => false);
        await registerPwa();

        await expect(applyPwaUpdate()).resolves.toBe(true);
        expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('registers with updateViaCache none so new releases are noticed', async () => {
        await registerPwa();
        expect(serviceWorker.register).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ updateViaCache: 'none' }),
        );
    });

    it('manual check reports up to date when no newer worker exists', async () => {
        registration.waiting = null;
        await registerPwa();

        await expect(checkForPwaUpdate()).resolves.toBe('up_to_date');
        expect(registration.update).toHaveBeenCalled();
        expect(getPwaLifecycleState().checkStatus).toBe('up_to_date');
    });

    it('manual check finds a newer worker and applies it when idle', async () => {
        registration.waiting = null;
        await registerPwa();
        registration.update.mockImplementationOnce(async () => { registration.waiting = waitingWorker; });

        await expect(checkForPwaUpdate()).resolves.toBe('update_found');
        expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('manual check reports an error when the update request fails', async () => {
        registration.waiting = null;
        await registerPwa();
        registration.update.mockRejectedValueOnce(new Error('network'));

        await expect(checkForPwaUpdate()).resolves.toBe('error');
        expect(getPwaLifecycleState().checkStatus).toBe('error');
    });

    it('shows offline state while preserving the registered shell', async () => {
        await registerPwa();
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        window.dispatchEvent(new Event('offline'));

        expect(getPwaLifecycleState()).toMatchObject({ status: 'offline', isOnline: false });
    });
});
