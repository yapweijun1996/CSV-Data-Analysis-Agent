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
    subtitle?: React.ReactNode;
    /** Id of the element that describes the dialog (aria-describedby), e.g. the subtitle. */
    describedById?: string;
    icon?: React.ReactNode;
    closeLabel: string;
    /** Hide the header close button for dialogs whose footer already carries the dismiss action. */
    hideClose?: boolean;
    /** Move initial focus to the close button (for dialogs with no primary footer action). */
    closeInitialFocus?: boolean;
    /** Replaces the default icon + title + subtitle block; it must still render an element with `titleId`. */
    headerContent?: React.ReactNode;
    /** Extra header rows under the title line (progress bars, usage chips). */
    headerBelow?: React.ReactNode;
    /** Non-scrolling rows between the header and the scrollable body (search, tabs). */
    fixedTop?: React.ReactNode;
    /** Tailwind max-width class; the dialog is always `w-full` and capped at 90dvh. */
    maxWidthClass?: string;
    /** Fixed height class (e.g. `h-[85dvh]`) for list-style dialogs; omit to size to content. */
    heightClass?: string;
    /** Stacking class; keep the default unless the dialog must sit above other overlays. */
    zClass?: string;
    /** Bottom sheet on phones, centred card from `sm`. */
    mobileSheet?: boolean;
    bodyClassName?: string;
    footer?: React.ReactNode;
    footerClassName?: string;
    /** Rendered inside the dialog after the footer (e.g. an inline confirmation overlay). */
    overlay?: React.ReactNode;
    /** Element to refocus on close when the opener may have unmounted (see useDialogAccessibility). */
    restoreFocusSelector?: string;
    testId?: string;
    children: React.ReactNode;
}

/**
 * Shared feature-dialog shell: scrim, rounded card, fixed header (icon, title, close button),
 * scrollable body and fixed footer. Focus trapping, Escape and focus restore come from
 * `useDialogAccessibility`. Service-driven confirm/alert dialogs live in `ModalHost` instead.
 */
export const ModalFrame: React.FC<ModalFrameProps> = ({
    isOpen, onClose, titleId, title, subtitle, describedById, icon, closeLabel, hideClose, closeInitialFocus,
    headerContent, headerBelow, fixedTop, maxWidthClass = 'max-w-2xl', heightClass = '', zClass = 'z-50',
    mobileSheet, bodyClassName = 'px-4 py-4 sm:px-6 sm:py-5', footer, footerClassName = 'px-4 py-3 sm:px-6 sm:py-4',
    overlay, restoreFocusSelector, testId, children,
}) => {
    const dialogRef = useDialogAccessibility<HTMLDivElement>(isOpen, onClose, restoreFocusSelector ? { restoreFocusSelector } : undefined);
    if (!isOpen) return null;
    return (
        <div
            className={`fixed inset-0 ${zClass} flex justify-center bg-scrim/50 backdrop-blur-sm ${
                mobileSheet ? 'items-end p-0 sm:items-center sm:p-6' : 'items-center p-3 sm:p-6'
            }`}
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={describedById}
                tabIndex={-1}
                data-testid={testId}
                className={`relative flex max-h-[90dvh] w-full ${maxWidthClass} ${heightClass} flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl outline-none ${
                    mobileSheet ? 'rounded-t-card sm:rounded-card' : 'rounded-card'
                }`}
                onClick={event => event.stopPropagation()}
            >
                <header className="shrink-0 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
                    <div className="flex items-center gap-3">
                        {headerContent ?? (
                            <>
                                {icon && <span className="shrink-0 text-slate-700" aria-hidden="true">{icon}</span>}
                                <div className="min-w-0 flex-1">
                                    <h2 id={titleId} className={`text-xl font-bold text-slate-900 sm:text-2xl ${subtitle ? '' : 'truncate'}`}>{title}</h2>
                                    {subtitle && <div className="mt-1 text-sm leading-5 text-slate-600">{subtitle}</div>}
                                </div>
                            </>
                        )}
                        {!hideClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label={closeLabel}
                                title={closeLabel}
                                data-dialog-initial-focus={closeInitialFocus ? true : undefined}
                                className={`-mr-2 shrink-0 ${ICON_BUTTON_CLASS}`}
                            >
                                <IconClose className="h-5 w-5" />
                            </button>
                        )}
                    </div>
                    {headerBelow}
                </header>
                {fixedTop}
                <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${bodyClassName}`}>{children}</div>
                {footer && (
                    <footer className={`shrink-0 border-t border-slate-200 bg-white ${footerClassName}`}>{footer}</footer>
                )}
                {overlay}
            </div>
        </div>
    );
};
