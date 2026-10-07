import type { CloudAiProvider } from '../types';
import { getTranslation } from './localization';

export type CloudAiLanguage = Parameters<typeof getTranslation>[1];

export const getCloudAiProviderLabel = (
    provider: CloudAiProvider,
    language: CloudAiLanguage,
): string => {
    if (provider === 'default') {
        return getTranslation('cloud_ai_provider_default', language);
    }
    if (provider === 'google') return 'Google Gemini';
    return 'OpenAI';
};
