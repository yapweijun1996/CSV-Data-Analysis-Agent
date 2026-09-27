import type { AppLanguage, LocalizedText } from '../types';

const LEGACY_LANGUAGE_FALLBACKS: Record<string, AppLanguage> = {
    Spanish: 'English',
    French: 'English',
};

const SUMMARY_SEPARATOR = '\n---\n';

export const SUPPORTED_APP_LANGUAGES: AppLanguage[] = ['English', 'Mandarin', 'Malay', 'Japanese'];

export const normalizeAppLanguage = (value: unknown, fallback: AppLanguage = 'English'): AppLanguage => {
    if (typeof value !== 'string') {
        return fallback;
    }

    if ((SUPPORTED_APP_LANGUAGES as string[]).includes(value)) {
        return value as AppLanguage;
    }

    return LEGACY_LANGUAGE_FALLBACKS[value] ?? fallback;
};

const splitLegacySummary = (value: string) => {
    if (value.includes(SUMMARY_SEPARATOR)) {
        return value.split(SUMMARY_SEPARATOR);
    }

    if (value.includes('---')) {
        return value.split('---');
    }

    return [value];
};

export const normalizeLocalizedText = (
    value: unknown,
    preferredLanguage: AppLanguage = 'English',
): LocalizedText | null => {
    if (!value) {
        return null;
    }

    if (typeof value === 'object' && value !== null && 'text' in value) {
        const candidate = value as { language?: unknown; text?: unknown };
        if (typeof candidate.text !== 'string') {
            return null;
        }

        return {
            language: normalizeAppLanguage(candidate.language, preferredLanguage),
            text: candidate.text,
        };
    }

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const parts = splitLegacySummary(trimmed).map(part => part.trim()).filter(Boolean);
    if (parts.length > 1) {
        if (preferredLanguage === 'Mandarin' && parts[1]) {
            return { language: 'Mandarin', text: parts[1] };
        }
        return { language: 'English', text: parts[0] ?? trimmed };
    }

    return {
        language: preferredLanguage,
        text: parts[0] ?? trimmed,
    };
};

export const getLocalizedText = (
    value: LocalizedText | string | null | undefined,
    fallback = '',
): string => {
    if (!value) {
        return fallback;
    }

    if (typeof value === 'string') {
        return value;
    }

    return value.text || fallback;
};
