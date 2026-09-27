import React, { memo } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../components/ChatPanel';

const { useAppStoreMock, messageRendererRenderCount } = vi.hoisted(() => ({
    useAppStoreMock: vi.fn(),
    messageRendererRenderCount: { current: 0 },
}));

vi.mock('../store/useAppStore', () => ({
    useAppStore: useAppStoreMock,
}));

vi.mock('../components/chat/MessageRenderer', () => ({
    MessageRenderer: memo(({ item }: { item: { id: string; text: string } }) => {
        messageRendererRenderCount.current += 1;
        return <div data-testid={`timeline-item-${item.id}`}>{item.text}</div>;
    }),
}));

type MockState = ReturnType<typeof createState>;

const createState = (overrides: Record<string, unknown> = {}) => ({
    progressMessages: [],
    chatHistory: [],
    isBusy: false,
    chatLifecycleState: 'idle' as const,
    handleChatMessage: vi.fn(),
    isApiKeySet: true,
    setIsAsideVisible: vi.fn(),
    setIsSettingsModalOpen: vi.fn(),
    setIsMemoryPanelOpen: vi.fn(),
    setIsAgentModalOpen: vi.fn(),
    currentView: 'analysis_dashboard',
    pendingClarification: null,
    pendingMutationConfirmation: null,
    goalState: 'idle',
    isGeneratingReport: false,
    reportGenerationProgress: null,
    aiTaskStatus: null,
    cleaningRun: null,
    language: 'English' as const,
    activeTurnId: null,
    activeTurn: null,
    activeTurnStatus: null,
    queuedChatTurns: [],
    cancelRequestedTurnId: null,
    requestActiveTurnCancellation: vi.fn(),
    handleShowCardFromChat: vi.fn(),
    settings: { language: 'English' as const },
    ...overrides,
});

describe('ChatPanel behavior', () => {
    let state: MockState;
    let resizeObserverCallback: ResizeObserverCallback | null;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        state = createState();
        resizeObserverCallback = null;
        messageRendererRenderCount.current = 0;

        useAppStoreMock.mockImplementation((selector: (value: MockState) => unknown) => selector(state));
        // PERF-305: ChatPanel uses useAppStore.getState() for lazy progress read
        (useAppStoreMock as unknown as { getState: () => MockState }).getState = () => state;

        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
        vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle));
        vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
            constructor(callback: ResizeObserverCallback) {
                resizeObserverCallback = callback;
            }

            observe() {}
            disconnect() {}
            unobserve() {}
        });
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('follows content height changes while the user is already at the bottom', async () => {
        state = createState({
            chatHistory: [
                {
                    id: 'chat-1',
                    sender: 'ai' as const,
                    text: 'First reply',
                    timestamp: new Date('2026-03-12T00:00:00.000Z'),
                    type: 'ai_message' as const,
                },
            ],
        });

        const { container } = render(<ChatPanel />);
        const scrollContainer = container.querySelector('.h-full.overflow-y-auto') as HTMLElement;

        let scrollHeight = 120;
        let scrollTop = 40;
        const scrollTo = vi.fn(({ top }: { top: number }) => {
            scrollTop = top;
        });

        Object.defineProperty(scrollContainer, 'scrollHeight', {
            configurable: true,
            get: () => scrollHeight,
        });
        Object.defineProperty(scrollContainer, 'clientHeight', {
            configurable: true,
            get: () => 80,
        });
        Object.defineProperty(scrollContainer, 'scrollTop', {
            configurable: true,
            get: () => scrollTop,
            set: (value: number) => {
                scrollTop = value;
            },
        });
        Object.defineProperty(scrollContainer, 'scrollTo', {
            configurable: true,
            value: scrollTo,
        });

        await act(async () => {
            await vi.runAllTimersAsync();
        });

        scrollTo.mockClear();
        scrollTop = scrollHeight - 80;
        scrollHeight = 220;

        act(() => {
            resizeObserverCallback?.([], {} as ResizeObserver);
        });

        await act(async () => {
            await vi.runAllTimersAsync();
        });

        expect(scrollTo).toHaveBeenCalledWith({
            top: 220,
            behavior: 'auto',
        });
    });

    it('shows the latest AI next-step suggestions above the composer and routes them as action turns', () => {
        const handleChatMessage = vi.fn();
        state = createState({
            handleChatMessage,
            chatHistory: [
                {
                    id: 'chat-2',
                    sender: 'ai' as const,
                    text: 'Choose a next step.',
                    timestamp: new Date('2026-03-12T00:00:00.000Z'),
                    type: 'ai_message' as const,
                    suggestedActions: [
                        { label: 'Inspect duplicates', action: 'inspect duplicates' },
                        { label: 'Check missing values', action: 'check missing values' },
                    ],
                },
            ],
        });

        render(<ChatPanel />);

        const nextSteps = screen.getByLabelText('Recommended next step');
        expect(within(nextSteps).getByText('Recommended next step')).toBeInTheDocument();
        expect(within(nextSteps).getByText('Why:')).toBeInTheDocument();
        expect(within(nextSteps).getByText('Expected outcome:')).toBeInTheDocument();
        expect(within(nextSteps).queryByRole('button', { name: 'Check missing values' })).not.toBeInTheDocument();

        fireEvent.click(within(nextSteps).getByRole('button', { name: 'Inspect duplicates' }));

        expect(handleChatMessage).toHaveBeenCalledWith('inspect duplicates', { source: 'action' });
    });

    it('does not render internal ai_thought messages in the main chat timeline', () => {
        state = createState({
            chatHistory: [
                {
                    id: 'chat-thought-1',
                    sender: 'ai' as const,
                    text: 'Internal reasoning that should stay off the main chat timeline.',
                    timestamp: new Date('2026-03-12T00:00:00.000Z'),
                    type: 'ai_thought' as const,
                },
                {
                    id: 'chat-visible-1',
                    sender: 'ai' as const,
                    text: 'Visible assistant reply',
                    timestamp: new Date('2026-03-12T00:00:01.000Z'),
                    type: 'ai_message' as const,
                },
            ],
        });

        render(<ChatPanel />);

        expect(screen.queryByTestId('timeline-item-chat-thought-1')).not.toBeInTheDocument();
        expect(screen.getByTestId('timeline-item-chat-visible-1')).toHaveTextContent('Visible assistant reply');
    });

    it('routes composer suggested actions through the visible label when the stored action is an internal tool name', () => {
        const handleChatMessage = vi.fn();
        state = createState({
            handleChatMessage,
            chatHistory: [
                {
                    id: 'chat-technical-next-step',
                    sender: 'ai' as const,
                    text: 'Choose a next step.',
                    timestamp: new Date('2026-03-12T00:00:00.000Z'),
                    type: 'ai_message' as const,
                    suggestedActions: [
                        { label: '验证利润与毛利率映射逻辑', action: 'analysis.validate_metric_mapping' },
                    ],
                },
            ],
        });

        render(<ChatPanel />);

        const nextSteps = screen.getByLabelText('Recommended next step');
        fireEvent.click(within(nextSteps).getByRole('button', { name: '验证利润与毛利率映射逻辑' }));

        expect(handleChatMessage).toHaveBeenCalledWith('验证利润与毛利率映射逻辑', { source: 'action' });
    });

    it('blocks Enter from submitting while the assistant is busy without an active runtime turn', () => {
        const handleChatMessage = vi.fn();
        state = createState({
            handleChatMessage,
            isBusy: true,
            chatLifecycleState: 'running',
            activeTurn: null,
            activeTurnStatus: null,
        });

        render(<ChatPanel />);

        const composer = screen.getByRole('textbox');

        fireEvent.change(composer, {
            target: { value: 'should stay as draft' },
        });
        fireEvent.keyDown(composer, {
            key: 'Enter',
            code: 'Enter',
        });

        expect(handleChatMessage).not.toHaveBeenCalled();
        expect(composer).toHaveValue('should stay as draft');
    });

    it('shows the goal confirmation placeholder while awaiting goal confirmation', () => {
        state = createState({
            goalState: 'awaiting_user_confirmation',
        });

        render(<ChatPanel />);

        expect(screen.getByRole('textbox')).toHaveAttribute(
            'placeholder',
            'Please confirm an analysis goal above, or type your own...',
        );
    });

    it('does not re-render timeline messages while the composer input changes', () => {
        state = createState({
            chatHistory: [
                {
                    id: 'chat-3',
                    sender: 'ai' as const,
                    text: 'Large markdown payload',
                    timestamp: new Date('2026-03-12T00:00:00.000Z'),
                    type: 'ai_message' as const,
                },
            ],
        });

        render(<ChatPanel />);

        expect(messageRendererRenderCount.current).toBe(1);

        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'typing into the composer should stay local' },
        });

        expect(messageRendererRenderCount.current).toBe(1);
    });

    it('shows a stage-aware loader pill while dataset cleaning is running', () => {
        state = createState({
            isBusy: true,
            cleaningRun: {
                status: 'running' as const,
            },
            progressMessages: [
                {
                    id: 'progress-cleaning',
                    text: 'Inspecting cleaned.csv before verification.',
                    type: 'system' as const,
                    timestamp: new Date('2026-03-12T00:01:00.000Z'),
                },
            ],
        });

        render(<ChatPanel />);

        const busyButton = screen.getByRole('button', { name: 'Cleaning' });

        expect(busyButton).toBeDisabled();
        expect(screen.getByText('Cleaning dataset')).toBeInTheDocument();
        expect(screen.getAllByText('Inspecting cleaned.csv before verification.')).toHaveLength(1);
        expect(busyButton.querySelector('.animate-spin')).toBeTruthy();
        expect(busyButton.querySelector('.animate-pulse')).toBeTruthy();
    });

    it('keeps the composer and send action enabled while a blocked clarification waits for the user', () => {
        const handleChatMessage = vi.fn();
        state = createState({
            chatLifecycleState: 'blocked',
            handleChatMessage,
            pendingClarification: {
                question: 'Which analysis dimension should we prioritize?',
                options: [],
                allowFreeText: true,
                clarificationMode: 'free_text' as const,
            },
        });

        render(<ChatPanel />);

        const textbox = screen.getByRole('textbox');
        expect(textbox).not.toBeDisabled();
        expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();

        fireEvent.change(textbox, {
            target: { value: 'Prioritize town.' },
        });
        const send = screen.getByRole('button', { name: 'Send message' });
        expect(send).toBeEnabled();
        fireEvent.click(send);
        expect(handleChatMessage).toHaveBeenCalledWith(
            'Prioritize town.',
            { source: 'composer' },
        );
    });

    it('explains the empty assistant state and opens the existing CSV picker', () => {
        state = createState({
            currentView: 'file_upload',
        });
        const fileInput = document.createElement('input');
        fileInput.id = 'file-upload';
        fileInput.type = 'file';
        const clickSpy = vi.spyOn(fileInput, 'click');
        document.body.appendChild(fileInput);

        render(<ChatPanel />);

        expect(screen.getByRole('heading', { name: 'Upload data to start asking' })).toBeVisible();
        expect(screen.getByText('Recognize fields and structure')).toBeVisible();
        expect(screen.getByText('Check data quality and limitations')).toBeVisible();
        expect(screen.getByText('Answer follow-up questions with traceable results')).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: 'Select a CSV file' }));

        expect(clickSpy).toHaveBeenCalledTimes(1);
        fileInput.remove();
    });
});
