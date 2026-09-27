// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { applyTabulatorStyleGuard } from '../components/spreadsheet/tabulatorStyleGuard';

describe('tabulatorStyleGuard', () => {
    it('removes invalid text-align and min-height assignments before Firefox logs parser warnings', () => {
        const originalCSS = globalThis.CSS;
        const supports = vi.fn((property: string, value: string) => {
            const normalized = String(value).trim();
            if (!normalized) {
                return false;
            }

            if (/\b(?:undefined|null|NaN)\b/i.test(normalized)) {
                return false;
            }

            if (property === 'text-align') {
                return ['left', 'right', 'center', 'justify', 'start', 'end'].includes(normalized);
            }

            if (property === 'min-height') {
                return normalized === '0'
                    || /^\d+px$/.test(normalized)
                    || /^calc\(100% - \d+px\)$/.test(normalized);
            }

            return true;
        });
        Object.defineProperty(globalThis, 'CSS', {
            configurable: true,
            value: {
                ...(originalCSS ?? {}),
                supports,
            },
        });

        applyTabulatorStyleGuard();

        const style = document.createElement('div').style;

        style.textAlign = 'center';
        style.minHeight = '24px';

        expect(style.getPropertyValue('text-align')).toBe('center');
        expect(style.getPropertyValue('min-height')).toBe('24px');

        style.textAlign = undefined as unknown as string;
        style.minHeight = 'NaNpx';

        expect(style.getPropertyValue('text-align')).toBe('');
        expect(style.getPropertyValue('min-height')).toBe('');

        style.setProperty('min-height', 'calc(100% - NaNpx)');
        expect(style.getPropertyValue('min-height')).toBe('');

        style.setProperty('min-height', 'calc(100% - 120px)');
        expect(style.getPropertyValue('min-height')).toBe('calc(100% - 120px)');

        Object.defineProperty(globalThis, 'CSS', {
            configurable: true,
            value: originalCSS,
        });
    });
});
