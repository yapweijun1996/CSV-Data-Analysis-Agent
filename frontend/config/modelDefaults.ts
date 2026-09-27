/**
 * Centralized model name lists for provider selection UI.
 * Edit this file to add/remove models from the settings dropdown.
 */

export const GOOGLE_MODELS = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemma-4-31b-it',
    'gemma-4-26b-a4b-it',
] as const;

/** Default Google model — bump this when a newer recommended model ships. */
export const DEFAULT_GOOGLE_MODEL = 'gemini-3.5-flash-lite';

export const OPENAI_MODELS = [
    'gpt-5-nano',
    'gpt-5-mini',
    'gpt-5.2',
    'gpt-5.2-pro',
    'gpt-5.4-mini',
] as const;

/**
 * Recommended fallback models per provider.
 * These are GA (generally available) models with high capacity,
 * used when the primary model returns transient errors (503, rate-limit).
 */
export const DEFAULT_FALLBACK_MODEL: Record<string, string> = {
    google: 'gemini-2.5-flash',
    openai: 'gpt-5-mini',
};

/**
 * Ordered fallback chain per provider.
 * When the default fallback equals the primary model, the resolver walks
 * this list to find the first model that differs from the primary.
 */
export const FALLBACK_MODEL_CHAIN: Record<string, readonly string[]> = {
    google: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview'],
    openai: ['gpt-5-mini', 'gpt-5-nano', 'gpt-5.2'],
};
