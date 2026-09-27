import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { __resetRuntimeConfigForTests } from '../config/runtimeConfig';

const { useAppStoreMock } = vi.hoisted(() => ({
    useAppStoreMock: vi.fn(),
}));

vi.mock('../store/useAppStore', () => ({
    useAppStore: useAppStoreMock,
}));

vi.mock('../hooks/useAutoHideHeader', () => ({
    useAutoHideHeader: () => ({
        headerRef: { current: null },
        headerHeight: 0,
        isHeaderHidden: false,
    }),
}));

vi.mock('../components/ChatPanel', () => ({
    ChatPanel: () => <div data-testid="chat-panel" />,
}));

vi.mock('../components/FileUpload', () => ({
    FileUpload: ({ isWorkspaceRestoring = false }: { isWorkspaceRestoring?: boolean }) => (
        <div data-testid="file-upload" data-workspace-restoring={String(isWorkspaceRestoring)} />
    ),
}));

vi.mock('../components/AppHeader', () => ({
    AppHeader: React.forwardRef<HTMLElement>((_props, _ref) => <div data-testid="app-header" />),
}));

vi.mock('../components/AnalysisPanel', () => ({
    AnalysisPanel: () => <div data-testid="analysis-panel" />,
}));

vi.mock('../components/SpreadsheetPanel', () => ({
    SpreadsheetPanel: () => <div data-testid="spreadsheet-panel" />,
}));

vi.mock('../components/AutoSaveManager', () => ({
    AutoSaveManager: () => <div data-testid="autosave-manager" />,
}));

vi.mock('../components/ExternalPayloadListener', () => ({
    ExternalPayloadListener: () => <div data-testid="external-payload-listener" />,
}));

vi.mock('../components/ErrorBoundary', () => ({
    ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../icons/IconLoadingSpinner', () => ({
    IconLoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock('../components/modals/SettingsModal', () => ({
    SettingsModal: () => <div data-testid="settings-modal" />,
}));

vi.mock('../components/modals/HistoryPanel', () => ({
    HistoryPanel: () => <div data-testid="history-panel" />,
}));

vi.mock('../components/modals/MemoryPanel', () => ({
    MemoryPanel: () => <div data-testid="memory-panel" />,
}));

vi.mock('../components/modals/AgentMonitorModal', () => ({
    AgentMonitorModal: () => <div data-testid="agent-monitor-modal" />,
}));

vi.mock('../components/modals/DatabaseModal', () => ({
    DatabaseModal: () => <div data-testid="database-modal" />,
}));

vi.mock('../components/modals/WorkspaceModal', () => ({
    WorkspaceModal: () => <div data-testid="workspace-modal" />,
}));

vi.mock('../components/modals/DataPreparationWorkflowModal', () => ({
    DataPreparationWorkflowModal: () => <div data-testid="workflow-modal" />,
}));

vi.mock('../components/modals/DebugLogsModal', () => ({
    DebugLogsModal: () => <div data-testid="logs-modal" />,
}));

const baseState = {
    init: vi.fn(async () => undefined),
    currentView: 'analysis_dashboard',
    csvData: {
        fileName: 'report.csv',
        data: [],
        metadataRows: [],
        summaryRows: [],
        headerDepth: 1,
    },
    isAppInitializing: false,
    isAsideVisible: false,
    asideWidth: 360,
    isResizing: false,
    handleAsideMouseDown: vi.fn(),
    isSpreadsheetVisible: true,
    resultsViewMode: 'simple' as const,
    isSettingsModalOpen: true,
    isHistoryPanelOpen: true,
    isDatabaseModalOpen: true,
    isWorkspaceModalOpen: true,
    isDataPreparationModalOpen: true,
    isDebugLogsModalOpen: true,
    isMemoryPanelOpen: true,
    isAgentModalOpen: true,
    analysisCards: [],
    finalSummary: null,
    aiTaskStatus: null,
    settings: { language: 'English' as const },
    setIsAsideVisible: vi.fn(),
};

const setRuntimeUiConfig = (ui: Record<string, boolean>) => {
    window.__CSV_AGENT_CONFIG__ = { ui };
    __resetRuntimeConfigForTests();
};

describe('App end user mode modal gating', () => {
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

    it('does not mount protected modals in end user mode', async () => {
        setRuntimeUiConfig({ endUserMode: true });
        useAppStoreMock.mockImplementation((selector: (value: typeof baseState) => unknown) => selector(baseState));

        render(<App />);

        expect(await screen.findByTestId('history-panel')).toBeInTheDocument();
        expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
        expect(screen.queryByTestId('database-modal')).not.toBeInTheDocument();
        expect(screen.queryByTestId('workspace-modal')).not.toBeInTheDocument();
        expect(screen.queryByTestId('workflow-modal')).not.toBeInTheDocument();
        expect(screen.queryByTestId('logs-modal')).not.toBeInTheDocument();
        expect(screen.queryByTestId('memory-panel')).not.toBeInTheDocument();
        expect(screen.queryByTestId('agent-monitor-modal')).not.toBeInTheDocument();
    });

    it('keeps the upload flow visible while first-time workspace initialization completes', () => {
        const initializingUploadState = {
            ...baseState,
            currentView: 'file_upload',
            csvData: null,
            isAppInitializing: true,
            isSettingsModalOpen: false,
            isHistoryPanelOpen: false,
            isDatabaseModalOpen: false,
            isWorkspaceModalOpen: false,
            isDataPreparationModalOpen: false,
            isDebugLogsModalOpen: false,
            isMemoryPanelOpen: false,
            isAgentModalOpen: false,
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof initializingUploadState) => unknown) => selector(initializingUploadState));

        render(<App />);

        expect(screen.getByTestId('file-upload')).toHaveAttribute('data-workspace-restoring', 'true');
        expect(screen.queryByText('Restoring workspace...')).not.toBeInTheDocument();
    });

    it('only mounts the raw spreadsheet explorer in the in-depth results view', async () => {
        const simpleState = {
            ...baseState,
            isSettingsModalOpen: false,
            isHistoryPanelOpen: false,
            isDatabaseModalOpen: false,
            isWorkspaceModalOpen: false,
            isDataPreparationModalOpen: false,
            isDebugLogsModalOpen: false,
            isMemoryPanelOpen: false,
            isAgentModalOpen: false,
        };
        useAppStoreMock.mockImplementation((selector: (value: typeof simpleState) => unknown) => selector(simpleState));

        const { rerender } = render(<App />);
        expect(screen.queryByTestId('spreadsheet-panel')).not.toBeInTheDocument();

        const exploreState = { ...simpleState, resultsViewMode: 'explore' as const };
        useAppStoreMock.mockImplementation((selector: (value: typeof exploreState) => unknown) => selector(exploreState));
        rerender(<App />);

        expect(await screen.findByTestId('spreadsheet-panel')).toBeInTheDocument();
    });

    it('honors explicit overrides when mounting protected modals', async () => {
        setRuntimeUiConfig({
            endUserMode: true,
            showSettingsButton: true,
            showWorkspaceButton: true,
        });
        useAppStoreMock.mockImplementation((selector: (value: typeof baseState) => unknown) => selector(baseState));

        render(<App />);

        expect(await screen.findByTestId('settings-modal')).toBeInTheDocument();
        expect(await screen.findByTestId('workspace-modal')).toBeInTheDocument();
        expect(screen.queryByTestId('database-modal')).not.toBeInTheDocument();
    });

    it('renders the mobile Assistant as an accessible full-screen dialog', async () => {
        const mobileState = {
            ...baseState,
            isAsideVisible: true,
            isSettingsModalOpen: false,
            isHistoryPanelOpen: false,
            isDatabaseModalOpen: false,
            isWorkspaceModalOpen: false,
            isDataPreparationModalOpen: false,
            isDebugLogsModalOpen: false,
            isMemoryPanelOpen: false,
            isAgentModalOpen: false,
        };
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn().mockImplementation(() => ({
                matches: true,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        });
        useAppStoreMock.mockImplementation((selector: (value: typeof baseState) => unknown) => selector(mobileState));

        const { container } = render(<App />);

        const dialog = await screen.findByRole('dialog', { name: 'Assistant' });
        expect(dialog).toHaveClass('fixed', 'h-[100dvh]', 'w-full');
        await waitFor(() => expect(within(container).getByRole('main', { hidden: true })).toHaveAttribute('inert'));

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(mobileState.setIsAsideVisible).toHaveBeenCalledWith(false);
    });
});
