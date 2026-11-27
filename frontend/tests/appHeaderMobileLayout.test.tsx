import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../components/AppHeader';
import { __resetRuntimeConfigForTests } from '../config/runtimeConfig';

const { useAppStoreMock } = vi.hoisted(() => ({ useAppStoreMock: vi.fn() }));
vi.mock('../store/useAppStore', () => ({ useAppStore: useAppStoreMock }));

// jsdom has no layout engine, so this pins the class contract that a real browser
// measured at 360/390 px: the title stays whole and the actions wrap below it.
describe('AppHeader mobile layout', () => {
    afterEach(() => {
        cleanup();
        __resetRuntimeConfigForTests();
    });

    it('wraps the actions below a whole title on phones and keeps one row and 44px targets', () => {
        const state = {
            handleNewSession: vi.fn(),
            loadReportsListIfNeeded: vi.fn(),
            setIsHistoryPanelOpen: vi.fn(),
            setIsDatabaseModalOpen: vi.fn(),
            setIsDataPreparationModalOpen: vi.fn(),
            setIsDebugLogsModalOpen: vi.fn(),
            isAsideVisible: false,
            setIsAsideVisible: vi.fn(),
            confirmedAnalysisGoal: 'Summarize sales.',
            csvData: { fileName: 'sales.csv', data: [{ Amount: 1 }] },
            datasetBundle: null,
            settings: { language: 'English' },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        const { container } = render(<AppHeader />);
        const header = container.querySelector('[data-app-header-root="true"]')!;
        const title = header.querySelector('h1')!;
        const nav = header.querySelector('nav')!;

        expect(header.classList).toContain('flex-wrap');
        expect(header.classList).toContain('md:flex-nowrap');
        expect(header.classList).not.toContain('flex-nowrap');
        expect(title.textContent).toBe('AI Analysis');
        expect(title.classList).toContain('whitespace-nowrap');
        expect(title.parentElement!.classList).toContain('shrink-0');
        expect(nav.classList).toContain('ml-auto');

        const actions = [...nav.querySelectorAll('button')];
        expect(actions.length).toBeGreaterThanOrEqual(5);
        for (const action of actions) {
            expect(action.classList).toContain('min-h-[44px]');
            expect(action.classList).toContain('min-w-[44px]');
        }
    });
});
