import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '../components/modals/SettingsModal';

const clearAllLocalBrowserDataMock = vi.hoisted(() => vi.fn());
const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock('ai', async importOriginal => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: generateTextMock,
}));

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
        language: 'English' as 'English' | 'Japanese',
        autoConfirmGoal: true,
        maxAgentTurns: 12,
        toolOutputCutoff: 2000,
    },
};

vi.mock('../store/useAppStore', () => ({
    useAppStore: Object.assign((selector: (state: typeof modalState) => unknown) => selector(modalState), {
        getState: () => modalState,
        setState: (patch: Partial<typeof modalState>) => Object.assign(modalState, patch),
    }),
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
        expect(options).toEqual(['English', 'Mandarin', 'Malay', 'Vietnamese', 'Japanese']);
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
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Local data could not be fully cleared. Close other app tabs and retry.',
        );
    });

    it.each([
        ['localStorage', 'local storage'],
        ['sessionStorage', 'session storage'],
        ['cacheStorage', 'cache storage'],
    ])(
        'warns without reloading when %s could not be cleared',
        async (failedStore, label) => {
            clearAllLocalBrowserDataMock.mockResolvedValueOnce({
                indexedDbDeleted: true,
                localStorageCleared: failedStore !== 'localStorage',
                sessionStorageCleared: failedStore !== 'sessionStorage',
                cacheCount: 0,
                opfsCleared: true,
                incompleteStores: [failedStore],
            });
            render(<SettingsModal />);

            fireEvent.click(screen.getByRole('button', { name: 'Clear all local data' }));
            fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));

            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Local data could not be fully cleared. Close other app tabs and retry.',
            );
            expect(screen.getByRole('alert')).toHaveTextContent(`Not fully cleared: ${label}.`);
            expect(screen.getByRole('button', { name: 'Delete everything' })).toBeEnabled();
        },
    );

    it('localizes the incomplete deletion warning', async () => {
        modalState.settings = { ...modalState.settings, language: 'Japanese' };
        clearAllLocalBrowserDataMock.mockResolvedValueOnce({ incompleteStores: ['cacheStorage'] });
        render(<SettingsModal />);

        fireEvent.click(screen.getByRole('button', { name: 'すべてのローカルデータを消去' }));
        fireEvent.click(screen.getByRole('button', { name: 'すべて削除' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'ローカルデータを完全に消去できませんでした。他のアプリタブを閉じて再試行してください。',
        );
        expect(screen.getByRole('alert')).toHaveTextContent('完全に消去されなかった保存領域：キャッシュストレージ。');
    });

    it('has a labelled close button, a header title and a 90dvh scroll body', () => {
        render(<SettingsModal />);
        const dialog = screen.getByRole('dialog', { name: 'Settings' });
        expect(dialog.className).toContain('max-h-[90dvh]');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }));
        expect(modalState.setIsSettingsModalOpen).toHaveBeenCalledWith(false);
    });

    it('marks exactly one provider as selected', () => {
        render(<SettingsModal />);
        const pressed = () => screen.getAllByRole('button', { pressed: true }).map(b => b.textContent?.trim());
        expect(pressed().filter(label => ['Google Gemini', 'OpenAI', 'Anthropic', 'OpenRouter'].includes(label ?? ''))).toEqual(['Google Gemini']);
        fireEvent.click(screen.getByRole('button', { name: 'Anthropic' }));
        const selected = ['Google Gemini', 'OpenAI', 'Anthropic', 'OpenRouter']
            .filter(name => screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true');
        expect(selected).toEqual(['Anthropic']);
    });

    it('masks the API key by default and toggles visibility', () => {
        modalState.settings = { ...modalState.settings, geminiApiKey: 'secret-key' };
        render(<SettingsModal />);
        const input = screen.getByLabelText('Gemini API Key') as HTMLInputElement;
        expect(input.type).toBe('password');
        fireEvent.click(screen.getByRole('button', { name: 'Show API key' }));
        expect(input.type).toBe('text');
        fireEvent.click(screen.getByRole('button', { name: 'Hide API key' }));
        expect(input.type).toBe('password');
    });

    it('shows loading then success for a connection test and ignores duplicate clicks', async () => {
        modalState.settings = { ...modalState.settings, geminiApiKey: 'test-gemini-key' };
        let resolve!: (value: { text: string }) => void;
        generateTextMock.mockReset();
        generateTextMock.mockReturnValue(new Promise(r => { resolve = r; }));
        render(<SettingsModal />);

        const button = screen.getByRole('button', { name: 'Test Connection' });
        fireEvent.click(button);
        const busy = await screen.findByRole('button', { name: 'Testing...' });
        expect(busy).toBeDisabled();
        fireEvent.click(busy);
        expect(generateTextMock).toHaveBeenCalledTimes(1);

        resolve({ text: 'OK' });
        expect(await screen.findByText('Connection OK')).toBeInTheDocument();
    });

    it('shows an error state when the connection test fails and clears it after editing the key', async () => {
        modalState.settings = { ...modalState.settings, geminiApiKey: 'bad-key' };
        generateTextMock.mockReset();
        generateTextMock.mockRejectedValue(new Error('401 unauthorized'));
        render(<SettingsModal />);

        fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('401 unauthorized');
        expect(screen.getByText('Connection failed')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Gemini API Key'), { target: { name: 'geminiApiKey', value: 'new-key' } });
        expect(screen.queryByText('Connection failed')).not.toBeInTheDocument();
    });
});
