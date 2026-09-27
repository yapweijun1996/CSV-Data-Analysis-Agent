// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __resetPwaManagerForTests,
    applyPwaUpdate,
    getPwaLifecycleState,
    registerPwa,
} from '../services/pwa/pwaManager';

describe('PWA lifecycle manager', () => {
    const waitingWorker = { postMessage: vi.fn() };
    const activeWorker = { postMessage: vi.fn() };
    const registration = {
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
        __resetPwaManagerForTests();
    });

    afterEach(() => __resetPwaManagerForTests());

    it('registers inside the current repository subpath and reports a waiting update', async () => {
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

    it('applies only after an explicit update action', async () => {
        await registerPwa();
        expect(waitingWorker.postMessage).not.toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

        await expect(applyPwaUpdate()).resolves.toBe(true);

        expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(getPwaLifecycleState().status).toBe('applying_update');
    });

    it('shows offline state while preserving the registered shell', async () => {
        await registerPwa();
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        window.dispatchEvent(new Event('offline'));

        expect(getPwaLifecycleState()).toMatchObject({ status: 'offline', isOnline: false });
    });
});
