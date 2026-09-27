// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaStatusBanner } from '../components/PwaStatusBanner';

const applyPwaUpdateMock = vi.hoisted(() => vi.fn(async () => true));
const pwaState: {
    status: 'update_available' | 'offline' | 'applying_update';
    isOnline: boolean;
    version: string;
    storageUsageBytes: number;
    storageQuotaBytes: number;
} = {
    status: 'update_available',
    isOnline: true,
    version: '1.0.0-test',
    storageUsageBytes: 1024,
    storageQuotaBytes: 4096,
};
const appState: {
    settings: { language: 'English' };
    isBusy: boolean;
    initialAnalysisStatus: 'ready' | 'running';
    activeTurn: null | { status: 'running' };
    isGeneratingReport: boolean;
    isSummaryGenerating: boolean;
} = {
    settings: { language: 'English' as const },
    isBusy: false,
    initialAnalysisStatus: 'ready',
    activeTurn: null,
    isGeneratingReport: false,
    isSummaryGenerating: false,
};

vi.mock('../hooks/usePwaLifecycle', () => ({
    usePwaLifecycle: () => pwaState,
}));
vi.mock('../services/pwa/pwaManager', () => ({
    applyPwaUpdate: applyPwaUpdateMock,
}));
vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

describe('PwaStatusBanner', () => {
    beforeEach(() => {
        pwaState.status = 'update_available';
        pwaState.isOnline = true;
        appState.isBusy = false;
        appState.initialAnalysisStatus = 'ready';
        appState.activeTurn = null;
        applyPwaUpdateMock.mockClear();
        applyPwaUpdateMock.mockResolvedValue(true);
    });

    afterEach(cleanup);

    it('requires an explicit user action before applying a waiting update', async () => {
        render(<PwaStatusBanner />);

        fireEvent.click(screen.getByRole('button', { name: 'Refresh to update' }));

        await waitFor(() => expect(applyPwaUpdateMock).toHaveBeenCalledOnce());
    });

    it('does not allow an update to interrupt an active analysis', () => {
        appState.initialAnalysisStatus = 'running';
        render(<PwaStatusBanner />);

        expect(screen.getByRole('button', { name: 'Refresh to update' })).toBeDisabled();
        expect(screen.getByText(/current analysis will not be interrupted/i)).toBeInTheDocument();
    });

    it('explains that cloud AI pauses while local features remain available offline', () => {
        pwaState.status = 'offline';
        pwaState.isOnline = false;
        render(<PwaStatusBanner />);

        expect(screen.getByRole('status')).toHaveTextContent('Cloud AI is paused');
        expect(screen.getByRole('status')).toHaveTextContent('History');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
