import React, { useCallback, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { ModalFrame } from '../ui/ModalFrame';
import { BUTTON_PRIMARY_CLASS, BUTTON_SECONDARY_CLASS } from '../ui/formStyles';
import { useAppStore } from '../../store/useAppStore';
import { getCloudAiProviderLabel } from '../../utils/cloudAiProviderLabel';
import { getTranslation } from '../../utils/localization';

export const CloudAiConsentModal: React.FC = () => {
    const {
        request,
        consentError,
        language,
        resolveConsent,
    } = useAppStore(state => ({
        request: state.pendingCloudAiConsent,
        consentError: state.cloudAiConsentError,
        language: state.settings.language,
        resolveConsent: state.resolveCloudAiConsent,
    }), shallow);
    const [isSaving, setIsSaving] = useState(false);
    const isOpen = Boolean(request);
    const handleDecline = useCallback(() => {
        if (!isSaving) void resolveConsent(false);
    }, [isSaving, resolveConsent]);

    if (!request) return null;

    const handleAccept = async () => {
        setIsSaving(true);
        try {
            await resolveConsent(true);
        } finally {
            setIsSaving(false);
        }
    };

    const providerLabel = getCloudAiProviderLabel(request.provider, language);
    const sensitiveWarning = request.sensitiveDataWarning ?? null;
    const disclosures = [
        ['cloud_ai_consent_sent_title', 'cloud_ai_consent_sent_detail'],
        ['cloud_ai_consent_storage_title', 'cloud_ai_consent_storage_detail'],
        ['cloud_ai_consent_sensitive_title', 'cloud_ai_consent_sensitive_detail'],
    ] as const;

    return (
        <ModalFrame
            isOpen={isOpen}
            onClose={handleDecline}
            titleId="cloud-ai-consent-title"
            title={getTranslation('cloud_ai_consent_title', language)}
            subtitle={<span id="cloud-ai-consent-description">{getTranslation('cloud_ai_consent_intro', language, { provider: providerLabel })}</span>}
            describedById="cloud-ai-consent-description"
            closeLabel={getTranslation('cloud_ai_consent_decline', language)}
            hideClose
            maxWidthClass="max-w-lg"
            zClass="z-[70]"
            bodyClassName="space-y-3 px-4 py-4 sm:px-6"
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        data-dialog-initial-focus
                        onClick={handleDecline}
                        disabled={isSaving}
                        className={BUTTON_SECONDARY_CLASS}
                    >
                        {getTranslation('cloud_ai_consent_decline', language)}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleAccept()}
                        disabled={isSaving}
                        className={BUTTON_PRIMARY_CLASS}
                    >
                        {getTranslation('cloud_ai_consent_accept', language)}
                    </button>
                </div>
            }
        >
                    {sensitiveWarning && (
                        <div role="alert" className="rounded-lg border border-warning-300 bg-warning-50 p-3 text-sm text-warning-950">
                            <strong className="font-semibold">
                                {getTranslation('cloud_ai_sensitive_detected_title', language)}
                            </strong>
                            <p className="mt-1 leading-5">
                                {getTranslation('cloud_ai_sensitive_detected_detail', language, {
                                    count: sensitiveWarning.matchedColumns.length,
                                })}
                            </p>
                            <p className="mt-2 break-words text-xs leading-5">
                                {getTranslation('cloud_ai_sensitive_detected_columns', language, {
                                    columns: sensitiveWarning.matchedColumns.join(', '),
                                })}
                            </p>
                        </div>
                    )}
                    <ul className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        {disclosures.map(([titleKey, detailKey]) => (
                            <li key={titleKey} className="flex gap-2 text-sm leading-5 text-slate-700">
                                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                                <span>
                                    <strong className="font-semibold text-slate-900">
                                        {getTranslation(titleKey, language)}:
                                    </strong>{' '}
                                    {getTranslation(detailKey, language)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs leading-5 text-slate-600">
                        {getTranslation(
                            sensitiveWarning
                                ? 'cloud_ai_consent_sensitive_once'
                                : 'cloud_ai_consent_once',
                            language,
                            { provider: providerLabel },
                        )}
                    </p>
                    {consentError && (
                        <p role="alert" className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">
                            {getTranslation('cloud_ai_consent_save_error', language)}
                        </p>
                    )}
        </ModalFrame>
    );
};
