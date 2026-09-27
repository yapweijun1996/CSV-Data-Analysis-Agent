import React, { useCallback, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { useAppStore } from '../../store/useAppStore';
import type { AppLanguage, CloudAiProvider } from '../../types';
import { getTranslation } from '../../utils/localization';

const getProviderLabel = (
    provider: CloudAiProvider,
    language: AppLanguage,
): string => {
    if (provider === 'default') {
        return getTranslation('cloud_ai_provider_default', language);
    }
    if (provider === 'google') return 'Google Gemini';
    return 'OpenAI';
};

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
    const dialogRef = useDialogAccessibility<HTMLDivElement>(isOpen, handleDecline);

    if (!request) return null;

    const handleAccept = async () => {
        setIsSaving(true);
        try {
            await resolveConsent(true);
        } finally {
            setIsSaving(false);
        }
    };

    const providerLabel = getProviderLabel(request.provider, language);
    const sensitiveWarning = request.sensitiveDataWarning ?? null;
    const disclosures = [
        ['cloud_ai_consent_sent_title', 'cloud_ai_consent_sent_detail'],
        ['cloud_ai_consent_storage_title', 'cloud_ai_consent_storage_detail'],
        ['cloud_ai_consent_sensitive_title', 'cloud_ai_consent_sensitive_detail'],
    ] as const;

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4"
            onClick={handleDecline}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="cloud-ai-consent-title"
                aria-describedby="cloud-ai-consent-description"
                tabIndex={-1}
                className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-card border border-slate-200 bg-white shadow-2xl"
                onClick={event => event.stopPropagation()}
            >
                <header className="border-b border-slate-200 px-5 py-4">
                    <h2 id="cloud-ai-consent-title" className="text-xl font-bold text-slate-950">
                        {getTranslation('cloud_ai_consent_title', language)}
                    </h2>
                    <p id="cloud-ai-consent-description" className="mt-2 text-sm leading-6 text-slate-600">
                        {getTranslation('cloud_ai_consent_intro', language, { provider: providerLabel })}
                    </p>
                </header>

                <div className="space-y-3 overflow-y-auto px-5 py-4">
                    {sensitiveWarning && (
                        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
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
                        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {getTranslation('cloud_ai_consent_save_error', language)}
                        </p>
                    )}
                </div>

                <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-3 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        data-dialog-initial-focus
                        onClick={handleDecline}
                        disabled={isSaving}
                        className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                    >
                        {getTranslation('cloud_ai_consent_decline', language)}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleAccept()}
                        disabled={isSaving}
                        className="min-h-[44px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                        {getTranslation('cloud_ai_consent_accept', language)}
                    </button>
                </footer>
            </div>
        </div>
    );
};
