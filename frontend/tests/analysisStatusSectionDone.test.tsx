// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisStatusSection } from '../components/analysis-panel/AnalysisStatusSection';

const state = vi.hoisted(() => ({
    aiTaskStatus: null as unknown,
    analysisCards: [] as unknown[],
    finalSummary: null as unknown,
    activeAnalysisSession: null,
    requestActiveResearchCancellation: () => undefined,
    settings: { language: 'English' },
}));
vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

const done = { status: 'done', title: 'Analysis ready with limitations', subtitle: 'x', totalSteps: 9, currentStep: 9 };

describe('AnalysisStatusSection finished status', () => {
    afterEach(() => {
        cleanup();
        Object.assign(state, { aiTaskStatus: null, analysisCards: [], finalSummary: null });
    });

    it('hides a finished status line once results are on screen', () => {
        Object.assign(state, { aiTaskStatus: done, analysisCards: [{ id: 'c1' }] });
        const { container } = render(<AnalysisStatusSection />);
        expect(container).toBeEmptyDOMElement();
    });

    it('still shows a finished status when there are no results to speak for it', () => {
        Object.assign(state, { aiTaskStatus: done });
        const { container } = render(<AnalysisStatusSection />);
        expect(container.textContent).toContain('Analysis ready with limitations');
    });

    it('keeps showing progress and errors even when cards exist', () => {
        Object.assign(state, { aiTaskStatus: { ...done, status: 'acting' }, analysisCards: [{ id: 'c1' }] });
        expect(render(<AnalysisStatusSection />).container.textContent).toContain('Analysis ready with limitations');
    });
});
