import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClarificationCard } from '../components/chat/ClarificationCard';

const { useAppStoreMock, handleClarificationResponseMock } = vi.hoisted(() => ({
    useAppStoreMock: vi.fn(),
    handleClarificationResponseMock: vi.fn(),
}));

vi.mock('../store/useAppStore', () => ({
    useAppStore: useAppStoreMock,
}));

const createState = (overrides: Record<string, unknown> = {}) => ({
    pendingClarification: {
        question: '请选择分析维度',
        options: [
            { label: '按项目', value: '按项目' },
            { label: '按 Series Label 1', value: '按 Series Label 1' },
        ],
        allowFreeText: false,
    },
    activeTurn: null,
    handleClarificationResponse: handleClarificationResponseMock,
    isBusy: false,
    settings: { language: 'English' },
    ...overrides,
});

describe('ClarificationCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAppStoreMock.mockImplementation((selector: (state: ReturnType<typeof createState>) => unknown) => selector(createState()));
    });

    afterEach(() => {
        cleanup();
    });

    it('renders inline extracted options with selection guidance', () => {
        render(
            <ClarificationCard
                msg={{
                    id: 'msg-1',
                    sender: 'ai',
                    text: 'Clarification needed',
                    timestamp: new Date('2026-03-13T12:00:00.000Z'),
                    type: 'ai_clarification',
                    clarificationRequest: {
                        question: '请选择分析维度：1. 按项目 2. 按 Series Label 1',
                        options: [],
                    },
                }}
            />,
        );

        expect(screen.getByText('按项目')).toBeInTheDocument();
        expect(screen.getByText('按 Series Label 1')).toBeInTheDocument();
        expect(screen.getByText('Select one option above to continue this turn.')).toBeInTheDocument();
    });

    it('submits the selected clarification option when a user clicks a rendered choice', () => {
        render(
            <ClarificationCard
                msg={{
                    id: 'msg-2',
                    sender: 'ai',
                    text: 'Clarification needed',
                    timestamp: new Date('2026-03-13T12:00:00.000Z'),
                    type: 'ai_clarification',
                    clarificationRequest: {
                        question: '请选择分析维度：1. 按项目 2. 按 Series Label 1',
                        options: [],
                    },
                }}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '按项目' }));

        expect(handleClarificationResponseMock).toHaveBeenCalledWith({
            label: '按项目',
            value: '按项目',
        });
    });

    it('renders approval interactions distinctly from ordinary clarification', () => {
        useAppStoreMock.mockImplementation((selector: (state: ReturnType<typeof createState>) => unknown) => selector(createState({
            pendingClarification: {
                question: 'Allow the read-only action?',
                options: [
                    { label: 'Approve', value: 'approve' },
                    { label: 'Deny', value: 'deny' },
                ],
                allowFreeText: false,
                interactionKind: 'approval',
            },
        })));

        render(
            <ClarificationCard
                msg={{
                    id: 'msg-approval',
                    sender: 'ai',
                    text: 'Approval required',
                    timestamp: new Date('2026-03-13T12:00:00.000Z'),
                    type: 'ai_clarification',
                    clarificationRequest: {
                        question: 'Allow the read-only action?',
                        options: [
                            { label: 'Approve', value: 'approve' },
                            { label: 'Deny', value: 'deny' },
                        ],
                        allowFreeText: false,
                        interactionKind: 'approval',
                    },
                }}
            />,
        );

        expect(screen.getByText('Approval Required')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled();
        expect(screen.getByText('Select one option above to continue this turn.')).toBeInTheDocument();
    });
});
