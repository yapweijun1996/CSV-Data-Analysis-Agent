import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisStatusSection } from '../components/analysis-panel/AnalysisStatusSection';
import { initialAppState, useAppStore } from '../store/useAppStore';

const task = {
    status: 'acting' as const,
    title: 'Analysing your data',
    titleKey: 'analysis_initial_stage_4_title',
    totalSteps: 9,
    currentStep: 4,
    rowCount: 982589,
};

describe('AnalysisStatusSection initial analysis', () => {
    afterEach(() => {
        cleanup();
        useAppStore.setState(initialAppState);
    });

    it('lets the user stop the running initial analysis and shows the stopping state', () => {
        const requestInitialAnalysisCancellation = vi.fn();
        useAppStore.setState({ aiTaskStatus: task, initialAnalysisStatus: 'running', requestInitialAnalysisCancellation });

        render(<AnalysisStatusSection />);
        fireEvent.click(screen.getByRole('button', { name: 'Stop analysis' }));

        expect(requestInitialAnalysisCancellation).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Stopping…' })).toBeDisabled();
    });

    it('shows the real row count of the current dataset', () => {
        useAppStore.setState({ aiTaskStatus: task, initialAnalysisStatus: 'running' });

        render(<AnalysisStatusSection />);

        expect(screen.getByText(/982,589 rows in the current dataset/)).toBeTruthy();
    });

    it('hides the stop button when no initial analysis is running', () => {
        useAppStore.setState({ aiTaskStatus: task, initialAnalysisStatus: 'ready' });

        render(<AnalysisStatusSection />);

        expect(screen.queryByRole('button', { name: 'Stop analysis' })).toBeNull();
    });
});
