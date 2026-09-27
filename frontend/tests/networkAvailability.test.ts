// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForCloudAiConnectivity } from '../services/pwa/networkAvailability';

const setOnline = (value: boolean) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value });
};

describe('waitForCloudAiConnectivity', () => {
    afterEach(() => setOnline(true));

    it('returns immediately while online', async () => {
        setOnline(true);
        await expect(waitForCloudAiConnectivity()).resolves.toBeUndefined();
    });

    it('pauses offline work without consuming an attempt and resumes on reconnect', async () => {
        setOnline(false);
        const resumed = vi.fn();
        const pending = waitForCloudAiConnectivity().then(resumed);

        await Promise.resolve();
        expect(resumed).not.toHaveBeenCalled();
        setOnline(true);
        window.dispatchEvent(new Event('online'));

        await pending;
        expect(resumed).toHaveBeenCalledOnce();
    });

    it('honors cancellation while waiting offline', async () => {
        setOnline(false);
        const controller = new AbortController();
        const pending = waitForCloudAiConnectivity(controller.signal);
        controller.abort(new DOMException('cancelled', 'AbortError'));

        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });
});
