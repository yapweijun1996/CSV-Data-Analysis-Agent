import type { Page } from '@playwright/test';
import { loadEnv } from 'vite';
import { DEFAULT_GATEWAY_MODEL } from '../../config/defaultGatewayConfig';

type BrowserTestAiSettings = {
    geminiApiKey: string;
    geminiModel: string;
};

export const resolveBrowserTestAiSettings = (
    environment: Record<string, string | undefined>,
): BrowserTestAiSettings => ({
    geminiApiKey: environment.E2E_GEMINI_API_KEY?.trim()
        || environment.DEVELOPMENT_GEMINI_API_KEY?.trim()
        || environment.GEMINI_API_KEY_FOR_DEVELOPMENT_ONLY?.trim()
        || '',
    geminiModel: environment.E2E_GEMINI_MODEL?.trim()
        || environment.DEVELOPMENT_GEMINI_MODEL?.trim()
        || environment.GEMINI_MODEL_FOR_DEVELOPMENT_ONLY?.trim()
        || '',
});

/**
 * Use the keyless shared gateway by default. Release operators may opt into a
 * Gemini browser canary with E2E_GEMINI_API_KEY/E2E_GEMINI_MODEL. Local
 * operator runs also consume the established development-only aliases from
 * .env.local so a requested Gemini acceptance run cannot silently exercise
 * the shared gateway instead. Playwright tracing stays disabled so the
 * injected credential is never written to an acceptance artifact.
 */
export const applyDefaultGatewaySettings = async (page: Page): Promise<void> => {
    const fileEnvironment = loadEnv('test', process.cwd(), '');
    const { geminiApiKey, geminiModel } = resolveBrowserTestAiSettings({
        ...fileEnvironment,
        ...process.env,
    });
    await page.addInitScript(({ defaultModel, geminiApiKey, geminiModel }) => {
        const useGemini = Boolean(geminiApiKey && geminiModel);
        localStorage.setItem('csv-ai-assistant-settings', JSON.stringify({
            provider: useGemini ? 'google' : 'default',
            geminiApiKey,
            openAIApiKey: '',
            simpleModel: useGemini ? geminiModel : defaultModel,
            complexModel: useGemini ? geminiModel : defaultModel,
            language: 'English',
            autoConfirmGoal: true,
        }));
    }, { defaultModel: DEFAULT_GATEWAY_MODEL, geminiApiKey, geminiModel });
};
