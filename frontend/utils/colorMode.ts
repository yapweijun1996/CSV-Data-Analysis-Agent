/**
 * Light / Dark / System colour mode. The CSS tokens for dark live in index.css under
 * `:root[data-theme="dark"]`; this module resolves the preference and applies it.
 */
import { useSyncExternalStore } from 'react';

export const COLOR_MODES = ['light', 'dark', 'system'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];
export const DEFAULT_COLOR_MODE: ColorMode = 'system';
export const COLOR_MODE_STORAGE_KEY = 'csv-agent-color-mode';
export const THEME_CHANGE_EVENT = 'csv-agent-theme-change';

export const isColorMode = (value: unknown): value is ColorMode =>
    typeof value === 'string' && (COLOR_MODES as readonly string[]).includes(value);

export const readStoredColorMode = (): ColorMode => {
    try {
        const stored = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
        return isColorMode(stored) ? stored : DEFAULT_COLOR_MODE;
    } catch {
        return DEFAULT_COLOR_MODE;
    }
};

export const resolveColorMode = (mode: ColorMode): 'light' | 'dark' => {
    if (mode !== 'system') return mode;
    try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
        return 'light';
    }
};

/** Notify chart code and legends that token values changed. */
export const notifyThemeChanged = (): void => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
};

export const applyColorMode = (mode: ColorMode): void => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', resolveColorMode(mode));
    notifyThemeChanged();
};

export const saveColorMode = (mode: ColorMode): void => {
    applyColorMode(mode);
    try {
        window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
    } catch {
        // Storage may be unavailable; the mode still applies for this tab.
    }
};

/** Keeps `System` in sync with the OS setting. Returns an unsubscribe function. */
export const watchSystemColorMode = (): (() => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
        if (readStoredColorMode() === 'system') applyColorMode('system');
    };
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
};

let themeVersion = 0;
const subscribe = (listener: () => void) => {
    const handler = () => { themeVersion += 1; listener(); };
    window.addEventListener(THEME_CHANGE_EVENT, handler);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handler);
};
/** Re-renders a component whenever the palette or colour mode changes. */
export const useThemeVersion = (): number => useSyncExternalStore(subscribe, () => themeVersion, () => 0);
