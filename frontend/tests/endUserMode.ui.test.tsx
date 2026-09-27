import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../components/AppHeader';
import { ChatPanel } from '../components/ChatPanel';
import { FileUpload } from '../components/FileUpload';
import { __resetRuntimeConfigForTests } from '../config/runtimeConfig';
import { createUISlice } from '../store/slices/uiSlice';

const { useAppStoreMock } = vi.hoisted(() => ({
    useAppStoreMock: Object.assign(vi.fn(), {
        // PERF-305: ChatPanel uses useAppStore.getState() for lazy progress read
        getState: () => ({ progressMessages: [] }),
    }),
}));

vi.mock('../store/useAppStore', () => ({
    useAppStore: useAppStoreMock,
}));

const setRuntimeUiConfig = (ui: Record<string, boolean>) => {
    window.__CSV_AGENT_CONFIG__ = { ui };
    __resetRuntimeConfigForTests();
};

describe('end user mode UI surfaces', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete window.__CSV_AGENT_CONFIG__;
        __resetRuntimeConfigForTests();
    });

    afterEach(() => {
        cleanup();
        delete window.__CSV_AGENT_CONFIG__;
        __resetRuntimeConfigForTests();
    });

    it('hides advanced header buttons by default in end user mode', () => {
        setRuntimeUiConfig({ endUserMode: true });
        const state = {
            handleNewSession: vi.fn(),
            loadReportsList: vi.fn(),
            setIsHistoryPanelOpen: vi.fn(),
            setIsDatabaseModalOpen: vi.fn(),
            setIsWorkspaceModalOpen: vi.fn(),
            setIsDataPreparationModalOpen: vi.fn(),
            setIsDebugLogsModalOpen: vi.fn(),
            isAsideVisible: false,
            setIsAsideVisible: vi.fn(),
            confirmedAnalysisGoal: 'Goal',
            reproposeAnalysisGoals: vi.fn(),
            csvData: { fileName: 'sales.csv' },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<AppHeader />);

        expect(screen.queryByText('New')).not.toBeInTheDocument();
        expect(screen.getByText('History')).toBeInTheDocument();
        expect(screen.queryByText('Data Explorer')).not.toBeInTheDocument();
        expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
        expect(screen.queryByText('Workflow')).not.toBeInTheDocument();
        expect(screen.queryByText('Logs')).not.toBeInTheDocument();
        expect(screen.queryByText('Change Goal')).not.toBeInTheDocument();
    });

    it('shows the new session button when explicitly re-enabled in runtime config', () => {
        setRuntimeUiConfig({ endUserMode: true, showNewSessionButton: true });
        const state = {
            handleNewSession: vi.fn(),
            loadReportsList: vi.fn(),
            setIsHistoryPanelOpen: vi.fn(),
            setIsDatabaseModalOpen: vi.fn(),
            setIsWorkspaceModalOpen: vi.fn(),
            setIsDataPreparationModalOpen: vi.fn(),
            setIsDebugLogsModalOpen: vi.fn(),
            isAsideVisible: false,
            setIsAsideVisible: vi.fn(),
            confirmedAnalysisGoal: 'Goal',
            reproposeAnalysisGoals: vi.fn(),
            csvData: { fileName: 'sales.csv' },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<AppHeader />);

        expect(screen.getByText('New')).toBeInTheDocument();
        expect(screen.getByText('History')).toBeInTheDocument();
    });

    it('requires confirmation before clearing the current analysis', async () => {
        setRuntimeUiConfig({ showNewSessionButton: true });
        const handleNewSession = vi.fn();
        const state = {
            handleNewSession,
            loadReportsListIfNeeded: vi.fn(),
            setIsHistoryPanelOpen: vi.fn(),
            setIsDatabaseModalOpen: vi.fn(),
            setIsDataPreparationModalOpen: vi.fn(),
            setIsDebugLogsModalOpen: vi.fn(),
            isAsideVisible: true,
            setIsAsideVisible: vi.fn(),
            confirmedAnalysisGoal: null,
            reproposeAnalysisGoals: vi.fn(),
            csvData: { fileName: 'sales.csv' },
            settings: { language: 'English' as const },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<AppHeader />);
        const newButton = screen.getByRole('button', { name: 'New' });
        fireEvent.click(newButton);

        expect(handleNewSession).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog', { name: 'Start a new analysis?' })).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Keep current analysis' })).toHaveFocus());

        fireEvent.click(screen.getByRole('button', { name: 'Keep current analysis' }));
        expect(handleNewSession).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog', { name: 'Start a new analysis?' })).not.toBeInTheDocument();

        fireEvent.click(newButton);
        fireEvent.click(screen.getByRole('button', { name: 'Start new analysis' }));
        expect(handleNewSession).toHaveBeenCalledTimes(1);
    });

    it('keeps dataset-only actions unavailable before a CSV is loaded', () => {
        setRuntimeUiConfig({
            showNewSessionButton: true,
            showDatabaseButton: true,
        });
        const openDatabase = vi.fn();
        const state = {
            handleNewSession: vi.fn(),
            loadReportsListIfNeeded: vi.fn(),
            setIsHistoryPanelOpen: vi.fn(),
            setIsDatabaseModalOpen: openDatabase,
            setIsDataPreparationModalOpen: vi.fn(),
            setIsDebugLogsModalOpen: vi.fn(),
            isAsideVisible: false,
            setIsAsideVisible: vi.fn(),
            confirmedAnalysisGoal: null,
            reproposeAnalysisGoals: vi.fn(),
            csvData: null,
            settings: { language: 'English' as const },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<AppHeader />);

        expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
        const explorer = screen.getByRole('button', { name: 'Data Explorer' });
        expect(explorer).toBeDisabled();
        expect(explorer).toHaveAttribute('title', 'Upload a CSV before opening Data Explorer');
        fireEvent.click(explorer);
        expect(openDatabase).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Show Assistant panel' })).toHaveTextContent('Assistant');
    });

    it('offers a new-session escape hatch while a history source file is pending', () => {
        setRuntimeUiConfig({
            showNewSessionButton: true,
            showDatabaseButton: true,
        });
        const state = {
            handleNewSession: vi.fn(),
            loadReportsListIfNeeded: vi.fn(),
            setIsHistoryPanelOpen: vi.fn(),
            setIsDatabaseModalOpen: vi.fn(),
            setIsDataPreparationModalOpen: vi.fn(),
            setIsDebugLogsModalOpen: vi.fn(),
            isAsideVisible: false,
            setIsAsideVisible: vi.fn(),
            confirmedAnalysisGoal: null,
            reproposeAnalysisGoals: vi.fn(),
            csvData: null,
            datasetBundle: { bundleId: 'pending-restore' },
            settings: { language: 'English' as const },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<AppHeader />);

        expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Data Explorer' })).toBeDisabled();
    });

    it('keeps the complete analysis header on one horizontally contained row', () => {
        setRuntimeUiConfig({
            showNewSessionButton: true,
            showHistoryButton: true,
            showDatabaseButton: true,
            showWorkflowButton: true,
            showLogsButton: true,
            showChangeGoalButton: true,
        });
        const state = {
            handleNewSession: vi.fn(),
            loadReportsListIfNeeded: vi.fn(),
            setIsHistoryPanelOpen: vi.fn(),
            setIsDatabaseModalOpen: vi.fn(),
            setIsDataPreparationModalOpen: vi.fn(),
            setIsDebugLogsModalOpen: vi.fn(),
            isAsideVisible: true,
            setIsAsideVisible: vi.fn(),
            confirmedAnalysisGoal: 'Goal',
            reproposeAnalysisGoals: vi.fn(),
            csvData: { fileName: 'sales.csv' },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        const { container } = render(<AppHeader />);

        const header = container.querySelector('[data-app-header-root="true"]');
        const navigation = screen.getByRole('navigation', { name: 'Analysis actions' });
        expect(header).toHaveClass('flex-row', 'flex-nowrap', 'min-w-0', 'overflow-hidden');
        expect(navigation).toHaveClass('flex-nowrap', 'min-w-0');
        expect(screen.getByRole('heading', { name: 'AI Analysis' })).toHaveClass('whitespace-nowrap');
        expect(screen.queryByRole('menuitem', { name: 'Change goal' })).not.toBeInTheDocument();

        const advancedButton = screen.getByRole('button', { name: 'Advanced' });
        vi.spyOn(advancedButton, 'getBoundingClientRect').mockReturnValue({
            x: 540,
            y: 8,
            width: 100,
            height: 32,
            top: 8,
            right: 640,
            bottom: 40,
            left: 540,
            toJSON: () => ({}),
        });
        fireEvent.click(advancedButton);
        expect(screen.getByRole('menu', { name: 'Advanced' })).toHaveStyle({ left: '352px', top: '48px', width: '288px' });
        expect(screen.getByRole('menuitem', { name: 'Change goal' })).toHaveClass('min-h-[44px]');
        expect(screen.getByRole('menuitem', { name: /Workflow/ })).toHaveFocus();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('menuitem', { name: 'Change goal' })).not.toBeInTheDocument();
        expect(advancedButton).toHaveFocus();
    });

    it('opens Workflow from the anchored Advanced menu and removes the menu from the page', () => {
        setRuntimeUiConfig({
            showWorkflowButton: true,
            showLogsButton: true,
            showChangeGoalButton: true,
        });
        const openWorkflow = vi.fn();
        const state = {
            handleNewSession: vi.fn(),
            loadReportsListIfNeeded: vi.fn(),
            setIsHistoryPanelOpen: vi.fn(),
            setIsDatabaseModalOpen: vi.fn(),
            setIsDataPreparationModalOpen: openWorkflow,
            setIsDebugLogsModalOpen: vi.fn(),
            isAsideVisible: true,
            setIsAsideVisible: vi.fn(),
            confirmedAnalysisGoal: 'Goal',
            reproposeAnalysisGoals: vi.fn(),
            csvData: { fileName: 'sales.csv' },
            settings: { language: 'English' as const },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<AppHeader />);
        fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
        fireEvent.click(screen.getByRole('menuitem', { name: /Workflow/ }));

        expect(openWorkflow).toHaveBeenCalledWith(true);
        expect(screen.queryByRole('menu', { name: 'Advanced' })).not.toBeInTheDocument();
    });

    it.each([
        ['Mandarin', '新建', '历史', '数据探索', '高级', '工作流程', '日志', '更改目标'],
        ['Japanese', '新規', '履歴', 'データ探索', '詳細', 'ワークフロー', 'ログ', '目標を変更'],
    ] as const)('localizes all primary and advanced header actions in %s', (
        language,
        newLabel,
        historyLabel,
        explorerLabel,
        advancedLabel,
        workflowLabel,
        logsLabel,
        changeGoalLabel,
    ) => {
        const state = {
            handleNewSession: vi.fn(),
            loadReportsListIfNeeded: vi.fn(),
            setIsHistoryPanelOpen: vi.fn(),
            setIsDatabaseModalOpen: vi.fn(),
            setIsDataPreparationModalOpen: vi.fn(),
            setIsDebugLogsModalOpen: vi.fn(),
            isAsideVisible: true,
            setIsAsideVisible: vi.fn(),
            confirmedAnalysisGoal: 'Goal',
            reproposeAnalysisGoals: vi.fn(),
            csvData: { fileName: 'sales.csv' },
            settings: { language },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<AppHeader />);

        expect(screen.getByRole('button', { name: newLabel })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: historyLabel })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: explorerLabel })).toBeInTheDocument();
        expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: advancedLabel }));
        expect(screen.getByRole('menuitem', { name: new RegExp(workflowLabel) })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: new RegExp(logsLabel) })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: changeGoalLabel })).toBeInTheDocument();
    });

    it('hides chat advanced buttons and shows managed placeholder in end user mode', () => {
        setRuntimeUiConfig({ endUserMode: true });
        const state = {
            progressMessages: [],
            chatHistory: [],
            isBusy: false,
            handleChatMessage: vi.fn(),
            isApiKeySet: false,
            setIsAsideVisible: vi.fn(),
            setIsSettingsModalOpen: vi.fn(),
            setIsMemoryPanelOpen: vi.fn(),
            setIsAgentModalOpen: vi.fn(),
            currentView: 'analysis_dashboard',
            pendingClarification: null,
            pendingMutationConfirmation: null,
            goalState: 'idle',
            isGeneratingReport: false,
            aiTaskStatus: null,
            cleaningRun: null,
            settings: { language: 'English' as const },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<ChatPanel />);

        expect(screen.queryByLabelText('Settings')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('View AI Memory')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('View Agent Timeline')).not.toBeInTheDocument();
        expect(screen.getByPlaceholderText('AI access is managed by this app owner. Contact them to finish setup.')).toBeInTheDocument();
    });

    it('hides progress-log model badges in end user mode', () => {
        setRuntimeUiConfig({ endUserMode: true });
        const state = {
            progressMessages: [
                {
                    id: 'progress-1',
                    text: 'AI is thinking...',
                    type: 'system' as const,
                    timestamp: new Date('2026-03-11T10:00:00.000Z'),
                    model: 'gemini-3.1-flash-lite-preview',
                },
            ],
            chatHistory: [],
            isBusy: false,
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
            aiTaskStatus: null,
            cleaningRun: null,
            settings: { language: 'English' as const },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<ChatPanel />);

        expect(screen.getByText('Tell the assistant what to inspect next: trends, anomalies, segments, or anything specific to your business question.')).toBeInTheDocument();
        expect(screen.queryByText('gemini-3.1-flash-lite-preview')).not.toBeInTheDocument();
    });

    it('hides thinking-loader model badges in end user mode', () => {
        setRuntimeUiConfig({ endUserMode: true });
        const state = {
            progressMessages: [
                {
                    id: 'progress-2',
                    text: 'AI is thinking...',
                    type: 'system' as const,
                    timestamp: new Date('2026-03-11T10:00:00.000Z'),
                    model: 'gemini-3.1-flash-lite-preview',
                },
            ],
            chatHistory: [],
            isBusy: true,
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
            aiTaskStatus: null,
            cleaningRun: null,
            settings: { language: 'English' as const },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<ChatPanel />);

        expect(screen.getByText('Thinking...')).toBeInTheDocument();
        expect(screen.queryByText('gemini-3.1-flash-lite-preview')).not.toBeInTheDocument();
    });

    it('keeps provider model names out of the ordinary Assistant surface', () => {
        const state = {
            progressMessages: [
                {
                    id: 'progress-3',
                    text: 'AI is thinking...',
                    type: 'system' as const,
                    timestamp: new Date('2026-03-11T10:00:00.000Z'),
                    model: 'gemini-3.1-flash-lite-preview',
                },
            ],
            chatHistory: [],
            isBusy: true,
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
            aiTaskStatus: null,
            cleaningRun: null,
            settings: { language: 'English' as const },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<ChatPanel />);

        expect(screen.queryByText('gemini-3.1-flash-lite-preview')).not.toBeInTheDocument();
    });

    it('renders only the recent timeline window and shows a performance notice for older activity', () => {
        const progressMessages = Array.from({ length: 15 }, (_, index) => ({
            id: `progress-${index + 1}`,
            text: `Progress ${index + 1}`,
            type: 'system' as const,
            timestamp: new Date(`2026-03-11T10:${String(index).padStart(2, '0')}:00.000Z`),
        }));
        const chatHistory = Array.from({ length: 130 }, (_, index) => ({
            id: `chat-${index + 1}`,
            sender: index % 2 === 0 ? 'user' as const : 'ai' as const,
            text: `Message ${index + 1}`,
            timestamp: new Date(`2026-03-11T11:${String(index % 60).padStart(2, '0')}:00.000Z`),
            type: index % 2 === 0 ? 'user_message' as const : 'ai_message' as const,
        }));
        const state = {
            progressMessages,
            chatHistory,
            isBusy: false,
            handleChatMessage: vi.fn(),
            handleShowCardFromChat: vi.fn(),
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
            aiTaskStatus: null,
            cleaningRun: null,
            settings: { language: 'English' as const },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<ChatPanel />);

        expect(screen.getByText('Showing recent activity for performance. Older conversation remains saved.')).toBeInTheDocument();
        expect(screen.queryByText('Progress 1')).not.toBeInTheDocument();
        expect(screen.queryByText('Progress 15')).not.toBeInTheDocument();
        expect(screen.queryByText('Message 1')).not.toBeInTheDocument();
        expect(screen.getByText('Message 130')).toBeInTheDocument();
    });

    it('shows a cancel control for an active runtime turn and forwards the action', () => {
        const requestActiveTurnCancellation = vi.fn();
        const state = {
            progressMessages: [],
            chatHistory: [],
            isBusy: true,
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
            aiTaskStatus: null,
            cleaningRun: null,
            activeTurn: {
                turnId: 'turn-1',
                userMessage: 'Help me analyze',
                status: 'running' as const,
                startedAt: new Date('2026-03-12T00:00:00.000Z'),
                budgetStatus: {
                    maxSteps: 6,
                    stepsUsed: 0,
                    retryCounts: {},
                    exhausted: false,
                },
                steps: [],
            },
            cancelRequestedTurnId: null,
            requestActiveTurnCancellation,
            settings: { language: 'English' as const },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<ChatPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }));

        expect(requestActiveTurnCancellation).toHaveBeenCalledTimes(1);
    });

    it('shows a separate send-next action while keeping stop available for the active run', () => {
        const handleChatMessage = vi.fn();
        const state = {
            progressMessages: [],
            chatHistory: [],
            isBusy: true,
            handleChatMessage,
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
            aiTaskStatus: null,
            cleaningRun: null,
            activeTurn: {
                turnId: 'turn-1',
                userMessage: 'Help me analyze',
                status: 'running' as const,
                startedAt: new Date('2026-03-12T00:00:00.000Z'),
                budgetStatus: {
                    maxSteps: 6,
                    stepsUsed: 0,
                    retryCounts: {},
                    exhausted: false,
                },
                steps: [],
            },
            queuedChatTurns: [
                {
                    id: 'queued-1',
                    message: 'second question',
                    enqueuedAt: new Date('2026-03-12T00:00:05.000Z'),
                },
            ],
            cancelRequestedTurnId: null,
            requestActiveTurnCancellation: vi.fn(),
            settings: { language: 'English' as const },
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        render(<ChatPanel />);

        const composer = screen.getByRole('textbox');

        fireEvent.change(composer, {
            target: { value: 'queue this next' },
        });

        expect(screen.getByText('Next message ready')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Send next' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel run' })).toBeInTheDocument();

        fireEvent.keyDown(composer, {
            key: 'Enter',
            code: 'Enter',
        });

        expect(screen.getByText('1 queued')).toBeInTheDocument();
        expect(handleChatMessage).toHaveBeenCalledWith('queue this next', { source: 'composer' });
    });

    it('shows the managed API key message unless settings are explicitly re-enabled', () => {
        const state = {
            handleFileUpload: vi.fn(),
            isBusy: false,
            isApiKeySet: false,
            progressMessages: [],
            fileName: null,
            settings: { language: 'English' as const },
            csvData: null,
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        setRuntimeUiConfig({ endUserMode: true, showNewSessionButton: true });
        const { rerender } = render(<FileUpload />);
        expect(screen.getByText('AI analysis is not configured for this deployment. Contact the person who set up this app to provide the API key.')).toBeInTheDocument();

        setRuntimeUiConfig({ endUserMode: true, showNewSessionButton: true, showSettingsButton: true });
        rerender(<FileUpload />);
        expect(screen.getByText('To unlock the AI analysis features, please add your API key in the Assistant settings panel.')).toBeInTheDocument();
    });

    it('replaces upload controls with a welcome state by default in end user mode', () => {
        const state = {
            handleFileUpload: vi.fn(),
            isBusy: false,
            isApiKeySet: false,
            progressMessages: [],
            fileName: null,
            settings: { language: 'English' as const },
            csvData: null,
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

        setRuntimeUiConfig({ endUserMode: true });
        render(<FileUpload />);

        expect(screen.getByText('Welcome to AI Analysis')).toBeInTheDocument();
        expect(screen.getByText('Open a saved report to get started. This workspace uses prepared reports instead of manual CSV uploads.')).toBeInTheDocument();
        expect(screen.getByText('The AI agent will help you review the data, explain trends, and summarize key findings.')).toBeInTheDocument();
        expect(screen.queryByText('API Key Required')).not.toBeInTheDocument();
        expect(screen.queryByText('Drag & drop your CSV file here')).not.toBeInTheDocument();
        expect(screen.queryByText('Select a file')).not.toBeInTheDocument();
    });

    it('blocks protected modal state from opening in end user mode', () => {
        setRuntimeUiConfig({ endUserMode: true });

        let state: ReturnType<typeof createUISlice>;
        const set = (update: Record<string, boolean> | ((prev: ReturnType<typeof createUISlice>) => Record<string, boolean>)) => {
            const next = typeof update === 'function' ? update(state) : update;
            state = { ...state, ...next };
        };

        state = createUISlice(set as never, (() => state) as never, {} as never);
        state.setIsSettingsModalOpen(true);
        state.setIsWorkspaceModalOpen(true);
        state.setIsDataPreparationModalOpen(true);
        state.setIsDebugLogsModalOpen(true);
        state.setIsHistoryPanelOpen(true);

        expect(state.isSettingsModalOpen).toBe(false);
        expect(state.isWorkspaceModalOpen).toBe(false);
        expect(state.isDataPreparationModalOpen).toBe(false);
        expect(state.isDebugLogsModalOpen).toBe(false);
        expect(state.isHistoryPanelOpen).toBe(true);
    });
});
