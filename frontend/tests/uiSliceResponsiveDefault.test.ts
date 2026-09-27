import { afterEach, describe, expect, it } from 'vitest';
import { createUISlice } from '../store/slices/uiSlice';

const originalInnerWidth = window.innerWidth;

const createState = () => {
    let state: ReturnType<typeof createUISlice>;
    const set = (update: Partial<typeof state>) => {
        state = { ...state, ...update } as typeof state;
    };
    state = createUISlice(set as never, (() => state) as never, {} as never);
    return state;
};

afterEach(() => {
    window.sessionStorage.removeItem('csv_agent_results_view');
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalInnerWidth,
    });
});

describe('UI slice responsive defaults', () => {
    it('starts with the Assistant drawer closed on mobile', () => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 390,
        });

        expect(createState().isAsideVisible).toBe(false);
    });

    it('starts with the Assistant sidebar closed on desktop so upload keeps focus', () => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 1280,
        });

        expect(createState().isAsideVisible).toBe(false);
    });

    it('persists the results disclosure preference for the current session', () => {
        const state = createState();
        expect(state.resultsViewMode).toBe('simple');

        state.setResultsViewMode('explore');

        expect(window.sessionStorage.getItem('csv_agent_results_view')).toBe('explore');
        expect(createState().resultsViewMode).toBe('explore');
    });
});
