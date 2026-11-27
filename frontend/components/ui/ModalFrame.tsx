import React from 'react';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { IconClose } from '../../icons/IconClose';
import { ICON_BUTTON_CLASS } from './formStyles';

interface ModalFrameProps {
    isOpen: boolean;
    onClose: () => void;
    /** Id used for aria-labelledby; must be unique on the page. */
    titleId: string;
    title: string;
    icon?: React.ReactNode;
    closeLabel: string;
    /** Tailwind max-width class; the dialog is always `w-full` and capped at 90dvh. */
    maxWidthClass?: string;
    footer?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Shared feature-dialog shell: scrim, rounded card, fixed header (icon, title, close button),
 * scrollable body and fixed footer. Focus trapping, Escape and focus restore come from
 * `useDialogAccessibility`. Service-driven confirm/alert dialogs live in `ModalHost` instead.
 */
export const ModalFrame: React.FC<ModalFrameProps> = ({
    isOpen, onClose, titleId, title, icon, closeLabel, maxWidthClass = 'max-w-2xl', footer, children,
}) => {
    const dialogRef = useDialogAccessibility<HTMLDivElement>(isOpen, onClose);
    if (!isOpen) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-3 backdrop-blur-sm sm:p-6"
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className={`flex max-h-[90dvh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-card border border-slate-200 bg-white shadow-2xl outline-none`}
                onClick={event => event.stopPropagation()}
            >
                <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
                    {icon && <span className="shrink-0 text-slate-700" aria-hidden="true">{icon}</span>}
                    <h2 id={titleId} className="min-w-0 flex-1 truncate text-xl font-bold text-slate-900 sm:text-2xl">{title}</h2>
                    <button type="button" onClick={onClose} aria-label={closeLabel} className={`-mr-2 ${ICON_BUTTON_CLASS}`}>
                        <IconClose className="h-5 w-5" />
                    </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">{children}</div>
                {footer && (
                    <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">{footer}</footer>
                )}
            </div>
        </div>
    );
};
