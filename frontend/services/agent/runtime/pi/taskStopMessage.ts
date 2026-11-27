import { getTranslation } from '../../../../utils/localization';

const FRIENDLY_REASONS = new Set(['toolCalls', 'providerTurns', 'activeMs', 'providerOutput']);

/**
 * Turns an internal `task_budget_exhausted:<dimension>` code into a localized message that says what happened and
 * what to do next. Returns null for codes without friendly copy so callers keep their technical fallback.
 */
export const describeTaskStop = (reason: string | undefined, language: string): string | null => {
    const match = /^task_budget_exhausted:(\w+)$/.exec(reason ?? '');
    if (!match || !FRIENDLY_REASONS.has(match[1])) return null;
    return getTranslation(`task_stop_${match[1]}`, language);
};
