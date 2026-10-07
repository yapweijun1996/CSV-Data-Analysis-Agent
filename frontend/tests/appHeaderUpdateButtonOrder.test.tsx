import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../components/AppHeader';
import { __resetRuntimeConfigForTests } from '../config/runtimeConfig';

const { useAppStoreMock } = vi.hoisted(() => ({ useAppStoreMock: vi.fn() }));
vi.mock('../store/useAppStore', () => ({ useAppStore: useAppStoreMock }));

describe('AppHeader update button placement', () => {
    afterEach(() => {
        cleanup();
        delete window.__CSV_AGENT_CONFIG__;
        __resetRuntimeConfigForTests();
    });

    it('puts the version/update button directly in front of History', () => {
        window.__CSV_AGENT_CONFIG__ = { ui: { showHistoryButton: true } };
        __resetRuntimeConfigForTests();
        const state = {
            handleNewSession: vi.fn(),
            loadReportsListIfNeeded: vi.fn(),
            setIsHistoryPanelOpen: vi.fn(),
            setIsDatabaseModalOpen: vi.fn(),
            setIsDataPreparationModalOpen: vi.fn(),
            setIsDebugLogsModalOpen: vi.fn(),
            isAsideVisible: true,
            setIsAsideVisible: vi.fn(),
            confirmedAnalysisGoal: null,
            reproposeAnalysisGoals: vi.fn(),
            csvData: null,
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        const { container } = render(<AppHeader />);
        const update = container.querySelector('[data-pwa-update-trigger="true"]');
        const history = container.querySelector('[data-history-trigger="true"]');

        expect(update).not.toBeNull();
        expect(history).not.toBeNull();
        expect(update!.compareDocumentPosition(history!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(update!.nextElementSibling).toBe(history);
    });
});
