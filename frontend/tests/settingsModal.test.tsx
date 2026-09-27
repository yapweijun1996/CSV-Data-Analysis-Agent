import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '../components/modals/SettingsModal';

const clearAllLocalBrowserDataMock = vi.hoisted(() => vi.fn());

vi.mock('../services/storageService', () => ({
    clearAllLocalBrowserData: clearAllLocalBrowserDataMock,
}));

const modalState = {
    isSettingsModalOpen: true,
    setIsSettingsModalOpen: vi.fn(),
    handleSaveSettings: vi.fn(),
    settings: {
        provider: 'google' as const,
        geminiApiKey: '',
        openAIApiKey: '',
        simpleModel: 'gemini-3-flash-preview',
        complexModel: 'gemini-3-flash-preview',
        language: 'English' as const,
        autoConfirmGoal: true,
        maxAgentTurns: 12,
        toolOutputCutoff: 2000,
    },
};

vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector: (state: typeof modalState) => unknown) => selector(modalState),
}));

describe('SettingsModal', () => {
    afterEach(() => {
        cleanup();
    });

    beforeEach(() => {
        modalState.isSettingsModalOpen = true;
        modalState.handleSaveSettings.mockReset();
        modalState.setIsSettingsModalOpen.mockReset();
        modalState.settings = {
            ...modalState.settings,
            geminiApiKey: '',
            openAIApiKey: '',
            language: 'English',
        };
        clearAllLocalBrowserDataMock.mockReset();
    });

    it('shows only the four supported app languages', () => {
        render(<SettingsModal />);

        fireEvent.focus(screen.getByLabelText('Agent Language'));

        // Scoped to the language Combobox's own listbox — the modal now also
        // contains a native <select> (Thinking Depth) whose <option>s are
        // always in the DOM and would otherwise leak into an unscoped query.
        const listbox = screen.getByRole('listbox');
        const options = within(listbox).getAllByRole('option').map(option => option.textContent);
        expect(options).toEqual(['English', 'Mandarin', 'Malay', 'Japanese']);
        expect(within(listbox).queryByRole('option', { name: 'Spanish' })).not.toBeInTheDocument();
        expect(within(listbox).queryByRole('option', { name: 'French' })).not.toBeInTheDocument();
    });

    it('saves the selected supported language', () => {
        modalState.settings = {
            ...modalState.settings,
            geminiApiKey: 'test-gemini-key',
        };
        render(<SettingsModal />);

        fireEvent.focus(screen.getByLabelText('Agent Language'));
        fireEvent.click(screen.getByRole('option', { name: 'Japanese' }));
        fireEvent.click(screen.getByRole('button', { name: '設定を保存' }));

        expect(modalState.handleSaveSettings).toHaveBeenCalledWith(expect.objectContaining({ language: 'Japanese' }));
    });

    it('blocks save and shows an error when the active provider key is empty', () => {
        render(<SettingsModal />);

        fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

        expect(modalState.handleSaveSettings).not.toHaveBeenCalled();
        expect(modalState.setIsSettingsModalOpen).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('Enter the Gemini API key before saving settings.');
    });

    it('switches validation to the OpenAI key when the provider changes', () => {
        render(<SettingsModal />);

        fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

        expect(modalState.handleSaveSettings).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('Enter the OpenAI API key before saving settings.');
    });

    it('discloses plaintext local storage and requires confirmation before deleting it', async () => {
        clearAllLocalBrowserDataMock.mockRejectedValueOnce(new Error('blocked by another tab'));
        render(<SettingsModal />);

        expect(screen.getByText(/full local diagnostics are stored unencrypted in this browser/i)).toBeInTheDocument();
        expect(screen.getByText(/Diagnostics expire after 7 days/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Clear all local data' }));
        expect(screen.getByText(/permanently deletes all local CSV data/i)).toBeInTheDocument();
        expect(clearAllLocalBrowserDataMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));

        await waitFor(() => expect(clearAllLocalBrowserDataMock).toHaveBeenCalledOnce());
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Local data could not be fully cleared. Close other app tabs and retry.',
        );
    });
});
