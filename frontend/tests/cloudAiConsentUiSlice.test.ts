// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const grantCloudAiConsentMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../services/privacy/cloudAiConsent', () => ({
    buildCloudAiConsentKey: (request: {
        disclosureVersion: string;
        provider: string;
        datasetId: string;
    }) => `${request.disclosureVersion}:${request.provider}:${request.datasetId}`,
    grantCloudAiConsent: grantCloudAiConsentMock,
}));

const {
    __resetPendingCloudAiConsentForTests,
    createUISlice,
} = await import('../store/slices/uiSlice');

const createSliceHarness = () => {
    let state: Record<string, unknown> = {};
    const set = (
        update: Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown>),
    ) => {
        state = {
            ...state,
            ...(typeof update === 'function' ? update(state) : update),
        };
    };
    const get = () => state;
    state = createUISlice(set as never, get as never, {} as never) as unknown as Record<string, unknown>;
    return {
        getState: () => state as unknown as ReturnType<typeof createUISlice>,
    };
};

const request = {
    datasetId: 'dataset-a',
    provider: 'default' as const,
    disclosureVersion: '2026-07-25-v1',
};

describe('cloud AI consent UI coordination', () => {
    beforeEach(() => {
        grantCloudAiConsentMock.mockClear();
        grantCloudAiConsentMock.mockResolvedValue(undefined);
        __resetPendingCloudAiConsentForTests();
    });

    afterEach(() => {
        __resetPendingCloudAiConsentForTests();
    });

    it('deduplicates concurrent prompts and resolves only after the grant is persisted', async () => {
        const harness = createSliceHarness();
        const first = harness.getState().requestCloudAiConsent(request);
        const second = harness.getState().requestCloudAiConsent(request);

        expect(first).toBe(second);
        expect(harness.getState().pendingCloudAiConsent).toEqual(request);

        await harness.getState().resolveCloudAiConsent(true);

        await expect(first).resolves.toBe(true);
        expect(grantCloudAiConsentMock).toHaveBeenCalledWith(request);
        expect(harness.getState().pendingCloudAiConsent).toBeNull();
    });

    it('keeps the modal open and the model request blocked when persistence fails', async () => {
        grantCloudAiConsentMock.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
        const harness = createSliceHarness();
        const pendingResult = harness.getState().requestCloudAiConsent(request);

        await harness.getState().resolveCloudAiConsent(true);

        expect(harness.getState().pendingCloudAiConsent).toEqual(request);
        expect(harness.getState().cloudAiConsentError).toContain('IndexedDB unavailable');

        await harness.getState().resolveCloudAiConsent(false);
        await expect(pendingResult).resolves.toBe(false);
    });
});
