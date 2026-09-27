import type {
    CloudAiConsentRequest,
    CloudAiConsentRecord,
    CloudAiProvider,
    SensitiveDataWarning,
} from '../../types';
import { getCloudAiConsent, saveCloudAiConsent } from '../storageService';

export const CLOUD_AI_DISCLOSURE_VERSION = '2026-07-27-v2';

export interface CloudAiConsentRuntimeContext {
    datasetId: string | null;
    sensitiveDataWarning?: SensitiveDataWarning | null;
    requestConsent: (request: CloudAiConsentRequest) => Promise<boolean>;
}

type CloudAiConsentRuntimeResolver = () => CloudAiConsentRuntimeContext;

let runtimeResolver: CloudAiConsentRuntimeResolver | null = null;
const declinedConsentKeys = new Set<string>();
const grantedConsentKeys = new Set<string>();

export class CloudAiConsentDeclinedError extends Error {
    readonly code = 'cloud_ai_consent_declined';

    constructor() {
        super('Cloud AI processing was not authorized for this dataset and provider.');
        this.name = 'CloudAiConsentDeclinedError';
    }
}

export const buildCloudAiConsentKey = (
    request: CloudAiConsentRequest,
): string => {
    const scope = request.consentScope ?? 'provider';
    const parts = [request.disclosureVersion, request.provider, scope];
    if (scope === 'sensitive_dataset') parts.push(request.datasetId);
    return parts.map(encodeURIComponent).join(':');
};

const buildProviderRequest = (
    datasetId: string,
    provider: CloudAiProvider,
): CloudAiConsentRequest => ({
    datasetId,
    provider,
    disclosureVersion: CLOUD_AI_DISCLOSURE_VERSION,
    consentScope: 'provider',
    sensitiveDataWarning: null,
});

const buildSensitiveDatasetRequest = (
    datasetId: string,
    provider: CloudAiProvider,
    sensitiveDataWarning: SensitiveDataWarning,
): CloudAiConsentRequest => ({
    datasetId,
    provider,
    disclosureVersion: CLOUD_AI_DISCLOSURE_VERSION,
    consentScope: 'sensitive_dataset',
    sensitiveDataWarning,
});

export const configureCloudAiConsentRuntime = (
    resolver: CloudAiConsentRuntimeResolver | null,
): void => {
    runtimeResolver = resolver;
};

export const clearCloudAiConsentRuntimeDecisions = (): void => {
    declinedConsentKeys.clear();
    grantedConsentKeys.clear();
};

export const grantCloudAiConsent = async (
    request: CloudAiConsentRequest,
): Promise<CloudAiConsentRecord> => {
    if (request.consentScope === 'sensitive_dataset') {
        const providerRequest = buildProviderRequest(request.datasetId, request.provider);
        const providerKey = buildCloudAiConsentKey(providerRequest);
        if (!grantedConsentKeys.has(providerKey)) {
            const existingProviderGrant = await getCloudAiConsent(providerKey);
            if (!existingProviderGrant) {
                const providerRecord: CloudAiConsentRecord = {
                    ...providerRequest,
                    key: providerKey,
                    grantedAt: new Date().toISOString(),
                };
                await saveCloudAiConsent(providerRecord);
            }
            grantedConsentKeys.add(providerKey);
            declinedConsentKeys.delete(providerKey);
        }
    }
    const record: CloudAiConsentRecord = {
        datasetId: request.datasetId,
        provider: request.provider,
        disclosureVersion: request.disclosureVersion,
        consentScope: request.consentScope ?? 'provider',
        sensitiveDataWarning: null,
        key: buildCloudAiConsentKey(request),
        grantedAt: new Date().toISOString(),
    };
    await saveCloudAiConsent(record);
    declinedConsentKeys.delete(record.key);
    grantedConsentKeys.add(record.key);
    return record;
};

export const hasDeclinedCloudAiConsent = (
    datasetId: string,
    provider: CloudAiProvider,
): boolean => {
    const providerKey = buildCloudAiConsentKey(buildProviderRequest(datasetId, provider));
    const sensitiveKey = buildCloudAiConsentKey({
        ...buildProviderRequest(datasetId, provider),
        consentScope: 'sensitive_dataset',
    });
    return declinedConsentKeys.has(providerKey) || declinedConsentKeys.has(sensitiveKey);
};

export const ensureCloudAiConsent = async (
    provider: CloudAiProvider,
): Promise<void> => {
    const context = runtimeResolver?.();
    const datasetId = context?.datasetId?.trim();
    if (!context || !datasetId) {
        // Calls without an active dataset cannot contain dataset context.
        return;
    }

    const providerRequest = buildProviderRequest(datasetId, provider);
    const sensitiveWarning = context.sensitiveDataWarning ?? null;
    const sensitiveRequest = sensitiveWarning
        ? buildSensitiveDatasetRequest(datasetId, provider, sensitiveWarning)
        : null;
    const providerKey = buildCloudAiConsentKey(providerRequest);
    const sensitiveKey = sensitiveRequest ? buildCloudAiConsentKey(sensitiveRequest) : null;

    if (declinedConsentKeys.has(providerKey)
        || (sensitiveKey ? declinedConsentKeys.has(sensitiveKey) : false)) {
        throw new CloudAiConsentDeclinedError();
    }
    const providerGranted = grantedConsentKeys.has(providerKey)
        || Boolean(await getCloudAiConsent(providerKey));
    if (providerGranted) grantedConsentKeys.add(providerKey);

    const sensitiveGranted = !sensitiveKey
        || grantedConsentKeys.has(sensitiveKey)
        || Boolean(await getCloudAiConsent(sensitiveKey));
    if (sensitiveKey && sensitiveGranted) grantedConsentKeys.add(sensitiveKey);
    if (providerGranted && sensitiveGranted) return;

    const requestedConsent = sensitiveGranted
        ? providerRequest
        : sensitiveRequest ?? providerRequest;
    const requestedKey = buildCloudAiConsentKey(requestedConsent);
    if (declinedConsentKeys.has(requestedKey)) {
        throw new CloudAiConsentDeclinedError();
    }
    const granted = await context.requestConsent(requestedConsent);
    if (!granted) {
        declinedConsentKeys.add(requestedKey);
        throw new CloudAiConsentDeclinedError();
    }
};

export const __resetCloudAiConsentRuntimeForTests = (): void => {
    runtimeResolver = null;
    clearCloudAiConsentRuntimeDecisions();
};
