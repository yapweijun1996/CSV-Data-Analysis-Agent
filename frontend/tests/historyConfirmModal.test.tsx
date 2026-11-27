import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryPanel } from '../components/modals/HistoryPanel';

const { useAppStoreMock, confirmModalMock } = vi.hoisted(() => ({
    useAppStoreMock: vi.fn(),
    confirmModalMock: vi.fn(),
}));

vi.mock('../store/useAppStore', () => ({ useAppStore: useAppStoreMock }));
vi.mock('../services/storageService', () => ({
    CURRENT_SESSION_KEY: 'current_session',
    getStorageBreakdown: vi.fn(async () => ({ totalIdbBytes: 0 })),
}));
vi.mock('../services/ui/modalService', () => ({ confirmModal: confirmModalMock }));

const makeState = () => ({
    isHistoryPanelOpen: true,
    setIsHistoryPanelOpen: vi.fn(),
    reportsList: [
        { id: 'cur', filename: 'a.csv', createdAt: new Date('2026-03-14T09:00:00Z'), updatedAt: new Date('2026-03-14T09:10:00Z') },
        { id: 'old', filename: 'b.csv', createdAt: new Date('2026-03-13T09:00:00Z'), updatedAt: new Date('2026-03-13T09:10:00Z') },
    ],
    handleLoadReport: vi.fn(),
    handleDeleteReport: vi.fn(),
    handlePurgeStorage: vi.fn(async () => undefined),
    openPersistedReportArtifact: vi.fn(),
    exportPersistedReportPdf: vi.fn(),
    sessionId: 'cur',
    settings: { language: 'English' },
    csvData: null,
});

describe('history confirmations use the shared modal service', () => {
    afterEach(() => { cleanup(); vi.clearAllMocks(); });

    it('deletes a report only after the modal resolves true', async () => {
        const state = makeState();
        useAppStoreMock.mockImplementation((selector: (v: typeof state) => unknown) => selector(state));
        confirmModalMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        render(<HistoryPanel />);

        fireEvent.click(screen.getAllByTitle('More actions')[1]);
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(confirmModalMock).toHaveBeenCalledTimes(1));
        expect(confirmModalMock.mock.calls[0][0]).toMatchObject({ tone: 'danger' });
        expect(state.handleDeleteReport).not.toHaveBeenCalled();

        fireEvent.click(screen.getAllByTitle('More actions')[1]);
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(state.handleDeleteReport).toHaveBeenCalledWith('old'));
    });

    it('clears all only after the modal resolves true', async () => {
        const state = makeState();
        useAppStoreMock.mockImplementation((selector: (v: typeof state) => unknown) => selector(state));
        confirmModalMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        render(<HistoryPanel />);

        fireEvent.click(screen.getByRole('button', { name: /Clear all/ }));
        await waitFor(() => expect(confirmModalMock).toHaveBeenCalledTimes(1));
        expect(state.handlePurgeStorage).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /Clear all/ }));
        await waitFor(() => expect(state.handlePurgeStorage).toHaveBeenCalledTimes(1));
    });
});
