/**
 * Centralized model name lists for provider selection UI.
 * Edit this file to add/remove models from the settings dropdown.
 */

export const GOOGLE_MODELS = [
    'gemini-3.8-flash',
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

/** Anthropic API model ids (dated aliases omitted; the bare alias tracks the latest snapshot). */
export const ANTHROPIC_MODELS = [
    'claude-haiku-4-5',
    'claude-sonnet-4-5',
    'claude-sonnet-4-6',
    'claude-sonnet-5',
    'claude-opus-4-5',
    'claude-opus-4-8',
    'claude-opus-5',
] as const;

export const DEFAULT_ANTHROPIC_SIMPLE_MODEL = 'claude-haiku-4-5';
export const DEFAULT_ANTHROPIC_COMPLEX_MODEL = 'claude-sonnet-4-6';

/** OpenRouter model ids use the `<vendor>/<model>` form. Any other id can be typed in. */
export const OPENROUTER_MODELS = [
    'anthropic/claude-haiku-4.5',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-sonnet-4.6',
    'anthropic/claude-opus-4.8',
    'openai/gpt-5-mini',
    'openai/gpt-5.2',
    'google/gemini-2.5-flash',
    'google/gemini-2.5-pro',
] as const;

export const DEFAULT_OPENROUTER_SIMPLE_MODEL = 'anthropic/claude-haiku-4.5';
export const DEFAULT_OPENROUTER_COMPLEX_MODEL = 'anthropic/claude-sonnet-4.6';

/**
 * Recommended fallback models per provider.
 * These are GA (generally available) models with high capacity,
 * used when the primary model returns transient errors (503, rate-limit).
 */
export const DEFAULT_FALLBACK_MODEL: Record<string, string> = {
    google: 'gemini-2.5-flash',
    openai: 'gpt-5-mini',
    anthropic: 'claude-sonnet-4-5',
    openrouter: 'anthropic/claude-sonnet-4.5',
};

/**
 * Ordered fallback chain per provider.
 * When the default fallback equals the primary model, the resolver walks
 * this list to find the first model that differs from the primary.
 */
export const FALLBACK_MODEL_CHAIN: Record<string, readonly string[]> = {
    google: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview'],
    openai: ['gpt-5-mini', 'gpt-5-nano', 'gpt-5.2'],
    anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-sonnet-4-6'],
    openrouter: ['anthropic/claude-sonnet-4.5', 'anthropic/claude-haiku-4.5', 'openai/gpt-5-mini'],
};
