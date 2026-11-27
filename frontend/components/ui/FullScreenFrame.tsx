import React from 'react';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { IconClose } from '../../icons/IconClose';
import { ICON_BUTTON_CLASS } from './formStyles';

interface FullScreenFrameProps {
    isOpen: boolean;
    onClose: () => void;
    titleId: string;
    /** Used instead of `titleId` when the dialog has no visible title (the `header` override owns it). */
    ariaLabel?: string;
    eyebrow?: string;
    title?: string;
    /** Badges or status chips rendered next to the title. */
    titleExtras?: React.ReactNode;
    description?: React.ReactNode;
    /** Buttons on the right of the header, before the close button. */
    actions?: React.ReactNode;
    closeLabel?: string;
    /** Replaces the whole header (e.g. a dialog with its own toolbar). The override must provide its own close button. */
    header?: React.ReactNode;
    zClass?: string;
    restoreFocusSelector?: string;
    /** Body rows; each caller owns its own scroll/layout because panels differ (split panes, lists, forms). */
    children: React.ReactNode;
}

/**
 * Shared shell for full-screen work panels (Data Explorer, Artifacts, Data Preparation Workflow,
 * diagnostic logs): scrim, `100dvh` surface from design tokens (so dark mode works), consistent
 * header with eyebrow/title/actions and one close button. Centred card dialogs use `ModalFrame`.
 */
export const FullScreenFrame: React.FC<FullScreenFrameProps> = ({
    isOpen, onClose, titleId, ariaLabel, eyebrow, title, titleExtras, description, actions, closeLabel = 'Close',
    header, zClass = 'z-50', restoreFocusSelector, children,
}) => {
    const dialogRef = useDialogAccessibility<HTMLDivElement>(isOpen, onClose, restoreFocusSelector ? { restoreFocusSelector } : undefined);
    if (!isOpen) return null;
    return (
        <div className={`fixed inset-0 ${zClass} bg-scrim/50 backdrop-blur-sm`} onClick={onClose}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={ariaLabel ? undefined : titleId}
                aria-label={ariaLabel}
                tabIndex={-1}
                className="relative flex h-dvh w-screen flex-col bg-slate-50 outline-none"
                onClick={event => event.stopPropagation()}
            >
                {header ?? (
                    <header className="shrink-0 border-b border-slate-200 bg-white">
                        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                            <div className="min-w-0 max-w-3xl">
                                {eyebrow && <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{eyebrow}</p>}
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <h2 id={titleId} className="text-xl font-semibold leading-tight text-slate-950 sm:text-2xl">{title}</h2>
                                    {titleExtras}
                                </div>
                                {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                {actions}
                                <button
                                    type="button"
                                    data-dialog-initial-focus
                                    onClick={onClose}
                                    aria-label={closeLabel}
                                    title={closeLabel}
                                    className={ICON_BUTTON_CLASS}
                                >
                                    <IconClose className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    </header>
                )}
                {children}
            </div>
        </div>
    );
};
