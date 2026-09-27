// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    getCloudAiConsentMock,
    saveCloudAiConsentMock,
} = vi.hoisted(() => ({
    getCloudAiConsentMock: vi.fn(),
    saveCloudAiConsentMock: vi.fn(),
}));

vi.mock('../services/storageService', () => ({
    getCloudAiConsent: getCloudAiConsentMock,
    saveCloudAiConsent: saveCloudAiConsentMock,
}));

const {
    CLOUD_AI_DISCLOSURE_VERSION,
    CloudAiConsentDeclinedError,
    __resetCloudAiConsentRuntimeForTests,
    buildCloudAiConsentKey,
    configureCloudAiConsentRuntime,
    ensureCloudAiConsent,
    grantCloudAiConsent,
    hasDeclinedCloudAiConsent,
} = await import('../services/privacy/cloudAiConsent');

beforeEach(() => {
    vi.clearAllMocks();
    getCloudAiConsentMock.mockResolvedValue(null);
    saveCloudAiConsentMock.mockResolvedValue(undefined);
    __resetCloudAiConsentRuntimeForTests();
});

describe('cloud AI consent guard', () => {
    it('reuses a persisted grant for the same provider and disclosure version', async () => {
        const requestConsent = vi.fn();
        const request = {
            datasetId: 'dataset-a',
            provider: 'default' as const,
            disclosureVersion: CLOUD_AI_DISCLOSURE_VERSION,
            consentScope: 'provider' as const,
            sensitiveDataWarning: null,
        };
        getCloudAiConsentMock.mockResolvedValue({
            ...request,
            key: buildCloudAiConsentKey(request),
            grantedAt: '2026-07-25T00:00:00.000Z',
        });
        configureCloudAiConsentRuntime(() => ({
            datasetId: request.datasetId,
            requestConsent,
        }));

        await expect(ensureCloudAiConsent('default')).resolves.toBeUndefined();

        expect(getCloudAiConsentMock).toHaveBeenCalledWith(buildCloudAiConsentKey(request));
        expect(requestConsent).not.toHaveBeenCalled();
    });

    it('persists consent before allowing the first data-bearing model request', async () => {
        const requestConsent = vi.fn(async request => {
            await grantCloudAiConsent(request);
            return true;
        });
        configureCloudAiConsentRuntime(() => ({
            datasetId: 'dataset-a',
            requestConsent,
        }));

        await expect(ensureCloudAiConsent('google')).resolves.toBeUndefined();
        await expect(ensureCloudAiConsent('google')).resolves.toBeUndefined();

        expect(requestConsent).toHaveBeenCalledOnce();
        expect(saveCloudAiConsentMock).toHaveBeenCalledWith(expect.objectContaining({
            datasetId: 'dataset-a',
            provider: 'google',
            disclosureVersion: CLOUD_AI_DISCLOSURE_VERSION,
            consentScope: 'provider',
            key: expect.not.stringContaining('dataset-a'),
            grantedAt: expect.any(String),
        }));
    });

    it('remembers a decline for the session and does not repeatedly prompt', async () => {
        const requestConsent = vi.fn(async () => false);
        configureCloudAiConsentRuntime(() => ({
            datasetId: 'dataset-declined',
            requestConsent,
        }));

        await expect(ensureCloudAiConsent('openai')).rejects.toBeInstanceOf(CloudAiConsentDeclinedError);
        await expect(ensureCloudAiConsent('openai')).rejects.toBeInstanceOf(CloudAiConsentDeclinedError);

        expect(requestConsent).toHaveBeenCalledOnce();
        expect(hasDeclinedCloudAiConsent('dataset-declined', 'openai')).toBe(true);
        expect(saveCloudAiConsentMock).not.toHaveBeenCalled();
    });

    it('reuses provider consent across datasets and prompts again for another provider', async () => {
        let datasetId = 'dataset-a';
        const requestConsent = vi.fn(async request => {
            await grantCloudAiConsent(request);
            return true;
        });
        configureCloudAiConsentRuntime(() => ({ datasetId, requestConsent }));

        await ensureCloudAiConsent('default');
        datasetId = 'dataset-b';
        await ensureCloudAiConsent('default');
        await ensureCloudAiConsent('google');

        expect(requestConsent).toHaveBeenCalledTimes(2);
    });

    it('requires a dataset-scoped acknowledgement when sensitive data is detected', async () => {
        let datasetId = 'dataset-a';
        const requestConsent = vi.fn(async request => {
            await grantCloudAiConsent(request);
            return true;
        });
        configureCloudAiConsentRuntime(() => ({
            datasetId,
            sensitiveDataWarning: {
                reasonCodes: ['contact_information'],
                matchedColumns: ['email'],
                sampleMatchCount: 2,
            },
            requestConsent,
        }));

        await ensureCloudAiConsent('google');
        await ensureCloudAiConsent('google');
        datasetId = 'dataset-b';
        await ensureCloudAiConsent('google');

        expect(requestConsent).toHaveBeenCalledTimes(2);
        expect(requestConsent).toHaveBeenNthCalledWith(1, expect.objectContaining({
            datasetId: 'dataset-a',
            consentScope: 'sensitive_dataset',
        }));
        expect(requestConsent).toHaveBeenNthCalledWith(2, expect.objectContaining({
            datasetId: 'dataset-b',
            consentScope: 'sensitive_dataset',
        }));
        expect(saveCloudAiConsentMock).toHaveBeenCalledTimes(3);
    });

    it('does not reuse a grant from an older disclosure version', async () => {
        const requestConsent = vi.fn(async request => {
            await grantCloudAiConsent(request);
            return true;
        });
        getCloudAiConsentMock.mockImplementation(async key => key.includes('2026-07-25-v1')
            ? { key, grantedAt: '2026-07-25T00:00:00.000Z' }
            : null);
        configureCloudAiConsentRuntime(() => ({
            datasetId: 'dataset-a',
            requestConsent,
        }));

        await ensureCloudAiConsent('default');

        expect(requestConsent).toHaveBeenCalledOnce();
    });
});
