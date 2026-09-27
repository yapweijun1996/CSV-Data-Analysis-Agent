import { describe, expect, it, vi } from 'vitest';
import { applyTabulatorInteractionGuard } from '../components/spreadsheet/tabulatorInteractionGuard';

describe('tabulatorInteractionGuard', () => {
    it('suppresses only the known Tabulator event target lookup warning', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        applyTabulatorInteractionGuard();

        console.warn('Event Target Lookup Error - The row this cell is attached to cannot be found, has the table been reinitialized without being destroyed first?');
        console.warn('Another warning');

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith('Another warning');

        warnSpy.mockRestore();
    });
});
