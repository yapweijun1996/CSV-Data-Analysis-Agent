import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResearchRunSummary } from '../components/analysis-panel/ResearchRunSummary';
import { createDataAnalysisSessionState } from '../services/agent/runtime/dataAnalysisSessionState';

describe('ResearchRunSummary', () => {
    it('shows the version-bound brief and evidence classification', () => {
        const base = createDataAnalysisSessionState({
            sessionId: 'session-1',
            origin: 'auto_analysis',
        });
        render(<ResearchRunSummary session={{
            ...base,
            status: 'completed',
            stopReason: 'all_hypotheses_exhausted',
            researchBrief: {
                goal: 'Find revenue drivers',
                datasetVersionId: 'version-123',
                questions: [{
                    id: 'question-1',
                    hypothesisId: 'hyp-1',
                    question: 'Which region has the highest revenue?',
                    priority: 3,
                    status: 'supported',
                }],
                stopConditions: ['all_hypotheses_exhausted'],
                clarification: null,
                createdAt: new Date('2026-07-25T00:00:00Z'),
            },
            researchFindings: [{
                id: 'finding-1',
                questionId: 'question-1',
                hypothesisId: 'hyp-1',
                claim: 'North has the highest revenue.',
                status: 'supported',
                evidenceRefs: [{ kind: 'query', ref: 'query-1' }],
                reasonCodes: [],
            }],
        }} />);

        expect(screen.getByRole('region', { name: 'Research run' })).toBeInTheDocument();
        expect(screen.getByText('Find revenue drivers')).toBeInTheDocument();
        expect(screen.getByText(/version-123/)).toBeInTheDocument();
        expect(screen.getByText('Which region has the highest revenue?')).toBeInTheDocument();
        expect(screen.getByText('1 supported')).toBeInTheDocument();
        expect(screen.getByText('Technical details')).toBeInTheDocument();
        expect(screen.getByText('all_hypotheses_exhausted')).toBeInTheDocument();
    });

    it('surfaces the clarification boundary', () => {
        const base = createDataAnalysisSessionState({
            sessionId: 'session-1',
            origin: 'auto_analysis',
        });
        render(<ResearchRunSummary session={{
            ...base,
            status: 'degraded',
            researchBrief: {
                goal: 'Analyze the report',
                datasetVersionId: null,
                questions: [],
                stopConditions: [],
                clarification: {
                    reason: 'No safe business grain was verified.',
                    question: 'Which business grain or metric should the research run prioritize?',
                },
                createdAt: new Date('2026-07-25T00:00:00Z'),
            },
        }} />);

        expect(screen.getByText('Clarification needed')).toBeInTheDocument();
        expect(screen.getByText('Which business grain or metric should the research run prioritize?')).toBeInTheDocument();
        expect(screen.getByText('No safe business grain was verified.')).toBeInTheDocument();
    });
});
