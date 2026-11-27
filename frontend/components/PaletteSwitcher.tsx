import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { shallow } from 'zustand/shallow';
import { IconPalette } from '../icons/IconPalette';
import { IconCheck } from '../icons/IconCheck';
import { useAppStore, AppStore } from '../store/useAppStore';
import { getTranslation } from '../utils/localization';
import { COLOR_MODES, readStoredColorMode, saveColorMode, type ColorMode } from '../utils/colorMode';
import { PALETTE_IDS, readStoredPalette, savePalette, type PaletteId } from '../utils/palette';

interface PaletteSwitcherProps {
    buttonClassName: string;
}

export const PaletteSwitcher: React.FC<PaletteSwitcherProps> = ({ buttonClassName }) => {
    const language = useAppStore((state: AppStore) => state.settings?.language ?? 'English', shallow);
    const [palette, setPalette] = useState<PaletteId>(readStoredPalette);
    const [mode, setMode] = useState<ColorMode>(readStoredColorMode);
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

    const select = (next: PaletteId) => {
        setPalette(next);
        savePalette(next);
        close(true);
    };

    const selectMode = (next: ColorMode) => {
        setMode(next);
        saveColorMode(next);
    };

    return (
        <div ref={rootRef} className="relative shrink-0" data-palette-switcher="true">
            <button
                ref={buttonRef}
                type="button"
                data-palette-trigger="true"
                className={buttonClassName}
                title={getTranslation('header_palette_title', language)}
                aria-label={`${getTranslation('header_palette', language)}: ${getTranslation(`palette_${palette}`, language)}`}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                onClick={() => setIsOpen(open => !open)}
            >
                <IconPalette />
            </button>
            {isOpen && createPortal(
                <div
                    ref={menuRef}
                    style={position}
                    role="menu"
                    aria-label={getTranslation('header_palette_menu', language)}
                    className="fixed z-50 w-52 max-w-[calc(100vw-1.5rem)] rounded-card border border-slate-200 bg-white p-1.5 shadow-xl"
                >
                    <div role="group" aria-label={getTranslation('header_color_mode', language)} className="mb-1.5 grid grid-cols-3 gap-1 rounded-card bg-slate-100 p-1">
                        {COLOR_MODES.map(option => (
                            <button
                                key={option}
                                type="button"
                                role="menuitemradio"
                                aria-checked={option === mode}
                                data-color-mode-option={option}
                                onClick={() => selectMode(option)}
                                className={`min-h-[36px] rounded-md px-1 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${option === mode ? 'bg-white text-accent-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                                {getTranslation(`color_mode_${option}`, language)}
                            </button>
                        ))}
                    </div>
                    {PALETTE_IDS.map(option => (
                        <button
                            key={option}
                            type="button"
                            role="menuitemradio"
                            aria-checked={option === palette}
                            data-palette-option={option}
                            onClick={() => select(option)}
                            className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-card px-3 py-2 text-left text-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 md:min-h-0 ${option === palette ? 'font-semibold text-accent-700' : 'text-slate-700'}`}
                        >
                            <span className="flex items-center gap-2.5">
                                {/* Scoped data-palette lets each swatch read its own palette's tokens. */}
                                <span data-palette={option} aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full bg-accent-600 ring-1 ring-inset ring-slate-900/10" />
                                {getTranslation(`palette_${option}`, language)}
                            </span>
                            {option === palette && <IconCheck className="h-4 w-4" />}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </div>
    );
};
