import React, { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { alertModal } from '../../services/ui/modalService';
import { getTranslation } from '../../utils/localization';

/**
 * Bridges the store flag (set by the file orchestrator) to the shared modal service,
 * so the dialog itself is rendered only by ModalHost.
 */
export const ApiKeyRequiredModal: React.FC = () => {
    const isOpen = useAppStore(s => s.isApiKeyRequiredModalOpen);
    const setModalOpen = useAppStore(s => s.setIsApiKeyRequiredModalOpen);
    const language = useAppStore(s => s.settings.language);

    useEffect(() => {
        if (!isOpen) return;
        void alertModal({
            title: getTranslation('api_key_required_modal_title', language),
            message: getTranslation('api_key_required_modal_message', language),
            confirmLabel: getTranslation('api_key_required_modal_ok', language),
        }).then(() => setModalOpen(false));
        // Open once per flag flip; the language at that moment is used.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    return null;
};
