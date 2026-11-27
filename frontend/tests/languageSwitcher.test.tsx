import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { getTranslation } from '../utils/localization';

const { useAppStoreMock } = vi.hoisted(() => ({ useAppStoreMock: vi.fn() }));
vi.mock('../store/useAppStore', () => ({ useAppStore: useAppStoreMock }));

const mountWith = (language: string) => {
    const save = vi.fn();
    const state = { settings: { language }, handleSaveSettings: save };
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
    render(<LanguageSwitcher buttonClassName="x" />);
    return save;
};

describe('LanguageSwitcher', () => {
    afterEach(() => cleanup());

    it('lists the five languages and saves the chosen one', () => {
        const save = mountWith('English');
        fireEvent.click(document.querySelector('[data-language-trigger="true"]')!);
        const options = screen.getAllByRole('menuitemradio').map(o => o.getAttribute('data-language-option'));
        expect(options).toEqual(['English', 'Mandarin', 'Malay', 'Vietnamese', 'Japanese']);
        fireEvent.click(screen.getByText('Tiếng Việt'));
        expect(save).toHaveBeenCalledWith({ language: 'Vietnamese' });
    });

    it('does not save when the current language is picked again', () => {
        const save = mountWith('Japanese');
        fireEvent.click(document.querySelector('[data-language-trigger="true"]')!);
        fireEvent.click(screen.getByRole('menuitemradio', { name: '日本語' }));
        expect(save).not.toHaveBeenCalled();
    });
});

describe('Vietnamese translations', () => {
    it('uses the overlay and falls back to English for missing keys', () => {
        expect(getTranslation('header_new', 'Vietnamese')).toBe('Mới');
        expect(getTranslation('report_header_ai_badge', 'Vietnamese')).toBe(getTranslation('report_header_ai_badge', 'English'));
    });
});
