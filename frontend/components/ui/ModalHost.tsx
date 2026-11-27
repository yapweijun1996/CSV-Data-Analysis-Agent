import React, { useCallback, useSyncExternalStore } from 'react';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import {
    closeActiveModal,
    getActiveModal,
    subscribeModals,
} from '../../services/ui/modalService';

/** The only renderer for service-driven dialogs (see services/ui/modalService.ts). */
export const ModalHost: React.FC = () => {
    const active = useSyncExternalStore(subscribeModals, getActiveModal, getActiveModal);
    const cancel = useCallback(() => closeActiveModal(false), []);
    const dialogRef = useDialogAccessibility<HTMLDivElement>(Boolean(active), cancel);
    if (!active) return null;

    const confirmClass = active.tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';
    return (
        <div
            className="fixed inset-0 z-[9500] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={cancel}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${active.id}-title`}
                aria-describedby={`${active.id}-desc`}
                tabIndex={-1}
                className="w-full max-w-md rounded-card border border-slate-200 bg-white p-5 shadow-2xl outline-none"
                onClick={event => event.stopPropagation()}
            >
                <h2 id={`${active.id}-title`} className="text-lg font-bold text-slate-950">{active.title}</h2>
                <p id={`${active.id}-desc`} className="mt-2 text-sm leading-6 text-slate-600">{active.message}</p>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    {active.cancelLabel && (
                        <button
                            type="button"
                            data-dialog-initial-focus
                            onClick={cancel}
                            className="min-h-[44px] rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            {active.cancelLabel}
                        </button>
                    )}
                    <button
                        type="button"
                        data-dialog-initial-focus={active.cancelLabel ? undefined : true}
                        onClick={() => closeActiveModal(true)}
                        className={`min-h-[44px] rounded-md px-4 py-2 text-sm font-semibold text-white ${confirmClass}`}
                    >
                        {active.confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
