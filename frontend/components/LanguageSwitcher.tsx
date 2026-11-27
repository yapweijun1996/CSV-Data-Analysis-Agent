import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { shallow } from 'zustand/shallow';
import { IconGlobe } from '../icons/IconGlobe';
import { IconCheck } from '../icons/IconCheck';
import { useAppStore, AppStore } from '../store/useAppStore';
import { getTranslation } from '../utils/localization';
import { SUPPORTED_APP_LANGUAGES } from '../utils/localizedText';
import type { AppLanguage } from '../types';

/** Each language is shown in its own script so a user can always find theirs. */
export const LANGUAGE_NATIVE_NAMES: Record<AppLanguage, string> = {
    English: 'English',
    Mandarin: '简体中文',
    Malay: 'Bahasa Melayu',
    Vietnamese: 'Tiếng Việt',
    Japanese: '日本語',
};

interface LanguageSwitcherProps {
    buttonClassName: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ buttonClassName }) => {
    const { settings, saveSettings } = useAppStore(
        (state: AppStore) => ({ settings: state.settings, saveSettings: state.handleSaveSettings }),
        shallow,
    );
    const language = settings?.language ?? 'English';
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<React.CSSProperties>({ top: 56, right: 12 });

    const close = useCallback((restoreFocus: boolean) => {
        setIsOpen(false);
        if (restoreFocus) buttonRef.current?.focus();
    }, []);

    useEffect(() => {
        if (!isOpen) return undefined;
        // The header clips overflow, so the menu is portalled and positioned from the trigger.
        const place = () => {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (rect) setPosition({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;
            if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setIsOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close(true);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('touchstart', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('touchstart', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isOpen, close]);

    const select = (next: AppLanguage) => {
        if (next !== language && settings) saveSettings({ ...settings, language: next });
        close(true);
    };

    return (
        <div ref={rootRef} className="relative shrink-0" data-language-switcher="true">
            <button
                ref={buttonRef}
                type="button"
                data-language-trigger="true"
                className={buttonClassName}
                title={getTranslation('header_language_title', language)}
                aria-label={`${getTranslation('header_language', language)}: ${LANGUAGE_NATIVE_NAMES[language]}`}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                onClick={() => setIsOpen(open => !open)}
            >
                <IconGlobe />
                <span className="hidden lg:inline">{LANGUAGE_NATIVE_NAMES[language]}</span>
            </button>
            {isOpen && createPortal(
                <div
                    ref={menuRef}
                    style={position}
                    role="menu"
                    aria-label={getTranslation('header_language_menu', language)}
                    className="fixed z-50 w-52 max-w-[calc(100vw-1.5rem)] rounded-card border border-slate-200 bg-white p-1.5 shadow-xl"
                >
                    {SUPPORTED_APP_LANGUAGES.map(option => (
                        <button
                            key={option}
                            type="button"
                            role="menuitemradio"
                            aria-checked={option === language}
                            data-language-option={option}
                            onClick={() => select(option)}
                            className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-card px-3 py-2 text-left text-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 md:min-h-0 ${option === language ? 'font-semibold text-accent-700' : 'text-slate-700'}`}
                        >
                            <span>{LANGUAGE_NATIVE_NAMES[option]}</span>
                            {option === language && <IconCheck className="h-4 w-4" />}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </div>
    );
};
