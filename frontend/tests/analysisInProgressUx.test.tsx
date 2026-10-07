// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiTaskStatusBubble } from '../components/AiTaskStatusBubble';
import { AnalysisResultsSkeleton } from '../components/analysis-panel/AnalysisResultsSkeleton';
import { getTranslation } from '../utils/localization';

vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector: (state: unknown) => unknown) => selector({ settings: { language: 'English' } }),
}));

const LANGUAGES = ['English', 'Mandarin', 'Malay', 'Japanese'] as const;

describe('analysis in-progress UX', () => {
    afterEach(cleanup);

    it('shows a step progress bar with completed steps and a reassurance caption', () => {
        render(<AiTaskStatusBubble task={{
            status: 'acting', title: 'Analysing your data',
            titleKey: 'analysis_initial_stage_4_title', subtitleKey: 'analysis_initial_stage_4_desc',
            totalSteps: 9, currentStep: 4,
        }} />);

        const bar = screen.getByRole('progressbar');
        expect(bar.getAttribute('aria-valuenow')).toBe('3');
        expect(bar.getAttribute('aria-valuemax')).toBe('9');
        expect(bar.children).toHaveLength(9);
        expect(screen.getByText('Preparing a clean analysis view (4/9)')).toBeTruthy();
        expect(screen.getByText(/Your original file is never modified/)).toBeTruthy();
        expect(screen.getByText(/3 of 9 steps done/)).toBeTruthy();
    });

    it('hides the progress bar once the task is finished', () => {
        render(<AiTaskStatusBubble task={{ status: 'done', title: 'Analysis ready', totalSteps: 9, currentStep: 9 }} />);
        expect(screen.queryByRole('progressbar')).toBeNull();
    });

    it('never shows the technical stage description to end users', () => {
        for (let index = 1; index <= 9; index += 1) {
            for (const language of LANGUAGES) {
                const title = getTranslation(`analysis_initial_stage_${index}_title`, language);
                const description = getTranslation(`analysis_initial_stage_${index}_desc`, language);
                expect(title).not.toContain('analysis_initial_stage');
                expect(description).not.toContain('analysis_initial_stage');
                expect(description).not.toMatch(/mutation and lineage|owner|DuckDB session|executors/i);
            }
        }
    });

    it('says the original file is never modified instead of contradicting itself', () => {
        const body = getTranslation('large_dataset_mode_body', 'English', { totalRows: '982,589', sampleRows: '2,000' });
        expect(body).toContain('never modified');
        expect(body).not.toMatch(/No cleaning is applied/i);
    });

    it('reserves space for results with a placeholder skeleton', () => {
        const { container } = render(<AnalysisResultsSkeleton language="English" />);
        expect(container.querySelector('[data-analysis-results-skeleton="true"]')).not.toBeNull();
        expect(screen.getByText(/results will appear here/i)).toBeTruthy();
    });
});
