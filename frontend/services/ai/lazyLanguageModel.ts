import type { LanguageModelV3 } from '@ai-sdk/provider';

/**
 * A model that downloads its provider SDK on the first request, so provider
 * packages stay out of the startup bundle while model construction stays
 * synchronous. Middleware wrapped around this model (consent included) runs
 * before the SDK is loaded or any request is sent.
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
