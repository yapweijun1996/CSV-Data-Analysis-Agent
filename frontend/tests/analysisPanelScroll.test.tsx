import type { ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { initialAppState, useAppStore } from '../store/useAppStore';
import type { AnalysisCardData } from '../types';

const asEnglishText = (text: string) => ({ language: 'English' as const, text });

vi.mock('../services/vectorStore', () => ({
    vectorStore: {
        searchIfReady: vi.fn().mockResolvedValue([]),
        clear: vi.fn(),
        getDocuments: vi.fn(() => []),
        rehydrate: vi.fn(),
    },
}));

vi.mock('react-masonry-css', () => ({
    default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/analysis-card/AnalysisCard', () => ({
    AnalysisCard: ({ cardId, isSpotlighted }: { cardId: string; isSpotlighted?: boolean }) => (
        <div data-testid="analysis-card" data-spotlighted={isSpotlighted ? 'true' : 'false'} id={cardId}>{cardId}</div>
    ),
}));

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

const makeCard = (id: string, title: string): AnalysisCardData => ({
    id,
    plan: {
        title,
        description: `${title} description`,
        chartType: 'bar',
    },
    aggregatedData: [{ label: title, value: 1 }],
    summary: asEnglishText(`${title} summary`),
    displayChartType: 'bar',
    isDataVisible: false,
    topN: null,
    hideOthers: false,
});

describe('analysis panel auto-scroll', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.sessionStorage.setItem('csv_agent_results_view', 'explore');
        (globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
        useAppStore.setState({
            ...initialAppState,
            analysisCards: [makeCard('card-existing', 'Existing Card')],
            finalSummary: null,
            isGeneratingReport: false,
            reportGenerationProgress: null,
            aiTaskStatus: null,
            cleaningRun: null,
            isSpreadsheetVisible: false,
            resultsViewMode: 'explore',
            settings: {
                ...initialAppState.settings,
                language: 'English',
            },
        });
    });

    afterEach(() => {
        cleanup();
        window.sessionStorage.removeItem('csv_agent_results_view');
        useAppStore.setState({
            ...initialAppState,
            settings: {
                ...initialAppState.settings,
            },
        });
    });

    it('spotlights the newest card without aggressive auto-scroll when a new card is prepended', async () => {
        const scrollIntoView = vi.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoView,
        });

        render(<AnalysisPanel />);
        expect(scrollIntoView).not.toHaveBeenCalled();

        act(() => {
            useAppStore.setState(state => ({
                analysisCards: [makeCard('card-new', 'Newest Card'), ...state.analysisCards],
            }));
        });

        // No forced scrollIntoView — spotlight highlight is sufficient
        expect(scrollIntoView).not.toHaveBeenCalled();

        const renderedCards = screen.getAllByTestId('analysis-card');
        expect(renderedCards[0]).toHaveAttribute('id', 'card-new');
        expect(renderedCards[0]).toHaveAttribute('data-spotlighted', 'true');
    });

    it('clears the spotlight after the highlight window', () => {
        const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

        render(<AnalysisPanel />);

        act(() => {
            useAppStore.setState(state => ({
                analysisCards: [makeCard('card-new', 'Newest Card'), ...state.analysisCards],
            }));
        });

        expect(screen.getAllByTestId('analysis-card')[0]).toHaveAttribute('data-spotlighted', 'true');

        expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 10000);

        const spotlightTimeout = setTimeoutSpy.mock.calls.at(-1)?.[0];
        expect(typeof spotlightTimeout).toBe('function');

        act(() => {
            (spotlightTimeout as () => void)();
        });

        expect(screen.getAllByTestId('analysis-card')[0]).toHaveAttribute('data-spotlighted', 'false');

        setTimeoutSpy.mockRestore();
    });
});
