/**
 * Accent palette selection. Colour values live in index.css as CSS custom properties
 * scoped by `[data-palette="<id>"]` (SSOT); this module only stores and applies the choice.
 */
export const PALETTE_IDS = ['blue', 'violet', 'green', 'orange', 'rose', 'slate'] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];
export const DEFAULT_PALETTE: PaletteId = 'blue';
export const PALETTE_STORAGE_KEY = 'csv-agent-palette';

export const isPaletteId = (value: unknown): value is PaletteId =>
    typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value);

export const readStoredPalette = (): PaletteId => {
    try {
        const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);
        return isPaletteId(stored) ? stored : DEFAULT_PALETTE;
    } catch {
        return DEFAULT_PALETTE;
    }
};

export const applyPalette = (palette: PaletteId): void => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-palette', palette);
};

export const savePalette = (palette: PaletteId): void => {
    applyPalette(palette);
    try {
        window.localStorage.setItem(PALETTE_STORAGE_KEY, palette);
    } catch {
        // Storage may be unavailable (private mode); the palette still applies for this tab.
    }
};
