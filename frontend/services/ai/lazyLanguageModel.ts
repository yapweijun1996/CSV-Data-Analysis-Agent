import type { LanguageModelV3 } from '@ai-sdk/provider';

/**
 * A model that downloads its provider SDK on first use, so provider packages
 * stay out of the startup bundle while model construction stays synchronous.
 * The same-origin SDK chunk may be fetched before the consent gate runs (the AI
 * SDK reads `supportedUrls` while preparing a call); wrapped consent middleware
 * still runs before any request reaches the provider.
 *
 * `provider` and `modelId` must match what the real SDK model reports.
 */
export const createLazyLanguageModel = (
    provider: string,
    modelId: string,
    load: () => Promise<LanguageModelV3>,
): LanguageModelV3 => {
    let pending: Promise<LanguageModelV3> | undefined;
    const model = (): Promise<LanguageModelV3> => {
        // A failed chunk download must not poison later attempts.
        pending ??= load().catch(error => {
            pending = undefined;
            throw error;
        });
        return pending;
    };

    return {
        specificationVersion: 'v3',
        provider,
        modelId,
        get supportedUrls() {
            return model().then(loaded => loaded.supportedUrls);
        },
        doGenerate: async options => (await model()).doGenerate(options),
        doStream: async options => (await model()).doStream(options),
    };
};
