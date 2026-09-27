import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisStatusSection } from '../components/analysis-panel/AnalysisStatusSection';
import { createDataAnalysisSessionState } from '../services/agent/runtime/dataAnalysisSessionState';
import { initialAppState, useAppStore } from '../store/useAppStore';

describe('AnalysisStatusSection research cancellation', () => {
    afterEach(() => {
        cleanup();
        useAppStore.setState(initialAppState);
    });

    it('shows a stop action for a running research session', () => {
        const requestActiveResearchCancellation = vi.fn();
        useAppStore.setState({
            aiTaskStatus: {
                status: 'thinking',
                title: 'Researching',
                subtitle: 'Checking evidence',
                totalSteps: 3,
                currentStep: 1,
            },
            activeAnalysisSession: {
                ...createDataAnalysisSessionState({
                    sessionId: 'session-1',
                    origin: 'auto_analysis',
                    runId: 'research-1',
                }),
                status: 'running',
            },
            requestActiveResearchCancellation,
        });

        render(<AnalysisStatusSection />);
        fireEvent.click(screen.getByRole('button', { name: 'Stop research' }));

        expect(requestActiveResearchCancellation).toHaveBeenCalledTimes(1);
    });

    it('disables the action after cancellation is requested', () => {
        useAppStore.setState({
            aiTaskStatus: {
                status: 'thinking',
                title: 'Researching',
                subtitle: 'Stopping',
                totalSteps: 3,
                currentStep: 1,
            },
            activeAnalysisSession: {
                ...createDataAnalysisSessionState({
                    sessionId: 'session-1',
                    origin: 'auto_analysis',
                    runId: 'research-1',
                }),
                status: 'running',
                cancellationRequestedAt: new Date(),
            },
        });

        render(<AnalysisStatusSection />);

        expect(screen.getByRole('button', { name: 'Stopping research…' })).toBeDisabled();
    });
});
