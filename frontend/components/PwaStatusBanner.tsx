import React, { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { usePwaLifecycle } from '../hooks/usePwaLifecycle';
import { applyPwaUpdate } from '../services/pwa/pwaManager';
import { useAppStore } from '../store/useAppStore';
import { getTranslation } from '../utils/localization';

export const PwaStatusBanner: React.FC = () => {
    const { language, isRunActive } = useAppStore(state => ({
        language: state.settings.language,
        isRunActive: state.isBusy
            || state.initialAnalysisStatus === 'running'
            || state.activeTurn?.status === 'running'
            || state.isGeneratingReport
            || state.isSummaryGenerating,
    }), shallow);
    const pwa = usePwaLifecycle();
    const [applyFailed, setApplyFailed] = useState(false);

    if (pwa.status === 'offline') {
        return (
            <div role="status" aria-live="polite" className="fixed inset-x-3 top-3 z-[80] mx-auto max-w-2xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg">
                <strong className="font-semibold">{getTranslation('pwa_offline_title', language)}</strong>{' '}
                {getTranslation('pwa_offline_detail', language)}
            </div>
        );
    }

    if (pwa.status !== 'update_available' && pwa.status !== 'applying_update') return null;

    const handleApply = async () => {
        setApplyFailed(false);
        if (!await applyPwaUpdate()) setApplyFailed(true);
    };

    return (
        <div role="status" aria-live="polite" className="fixed inset-x-3 top-3 z-[80] mx-auto flex max-w-2xl flex-col gap-3 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-950 shadow-lg sm:flex-row sm:items-center sm:justify-between">
            <div>
                <strong className="font-semibold">{getTranslation('pwa_update_title', language)}</strong>{' '}
                {getTranslation(
                    isRunActive ? 'pwa_update_after_run' : 'pwa_update_detail',
                    language,
                )}
                {applyFailed && (
                    <p role="alert" className="mt-1 text-red-800">
                        {getTranslation('pwa_update_error', language)}
                    </p>
                )}
            </div>
            <button
                type="button"
                onClick={() => void handleApply()}
                disabled={isRunActive || pwa.status === 'applying_update'}
                className="min-h-[44px] shrink-0 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {getTranslation(
                    pwa.status === 'applying_update'
                        ? 'pwa_update_applying'
                        : 'pwa_update_action',
                    language,
                )}
            </button>
        </div>
    );
};
