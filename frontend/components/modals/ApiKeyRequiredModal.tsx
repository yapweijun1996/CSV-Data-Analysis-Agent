import React, { useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';
import { IconApiKeyRequired } from '../../icons/IconApiKeyRequired';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

export const ApiKeyRequiredModal: React.FC = () => {
    const isOpen = useAppStore(s => s.isApiKeyRequiredModalOpen);
    const setModalOpen = useAppStore(s => s.setIsApiKeyRequiredModalOpen);
    const language = useAppStore(s => s.settings.language);
    const handleClose = useCallback(() => setModalOpen(false), [setModalOpen]);
    const dialogRef = useDialogAccessibility<HTMLDivElement>(isOpen, handleClose);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={handleClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="api-key-required-title"
                aria-describedby="api-key-required-desc"
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
                className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col outline-none"
            >
                <div className="px-6 pt-8 pb-2 flex flex-col items-center text-center">
                    <IconApiKeyRequired className="w-14 h-14 text-slate-400 mb-4" />
                    <h2 id="api-key-required-title" className="text-lg font-semibold text-slate-800">
                        {getTranslation('api_key_required_modal_title', language)}
                    </h2>
                    <p id="api-key-required-desc" className="mt-3 text-sm text-slate-500 leading-relaxed">
                        {getTranslation('api_key_required_modal_message', language)}
                    </p>
                </div>

                <div className="px-6 py-5 flex justify-center">
                    <button
                        data-dialog-initial-focus
                        onClick={handleClose}
                        className="min-h-[44px] px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                        {getTranslation('api_key_required_modal_ok', language)}
                    </button>
                </div>
            </div>
        </div>
    );
};
