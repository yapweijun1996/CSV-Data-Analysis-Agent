import React, { useEffect, useState } from 'react';
import { usePwaLifecycle } from '../hooks/usePwaLifecycle';
import { usePwaAutoUpdate } from '../hooks/usePwaAutoUpdate';
import { checkForPwaUpdate } from '../services/pwa/pwaManager';
import type { Settings } from '../types';
import { getTranslation } from '../utils/localization';
import { IconRefresh } from '../icons/IconRefresh';

const RESULT_VISIBLE_MS = 3000;

/** "1.0.0-6ff1812f5311" -> "v1.0.0 · 6ff1812" */
export const formatPwaVersion = (version: string | null): string | null => {
    if (!version) return null;
    const [base, build] = version.split(/-(.+)/);
    return build ? `v${base} · ${build.slice(0, 7)}` : `v${base}`;
};

export const PwaUpdateButton: React.FC<{ className: string; language: Settings['language'] }> = ({ className, language }) => {
    const pwa = usePwaLifecycle();
    const [showResult, setShowResult] = useState(false);
    usePwaAutoUpdate();

    useEffect(() => {
        if (pwa.checkStatus !== 'up_to_date' && pwa.checkStatus !== 'error') return undefined;
        setShowResult(true);
        const timer = setTimeout(() => setShowResult(false), RESULT_VISIBLE_MS);
        return () => clearTimeout(timer);
    }, [pwa.checkStatus]);

    if (pwa.status === 'unsupported') return null;

    const updating = pwa.status === 'applying_update' || pwa.checkStatus === 'update_found';
    const checking = pwa.checkStatus === 'checking';
    const versionLabel = formatPwaVersion(pwa.version);
    let label = versionLabel ?? getTranslation('pwa_check_action', language);
    if (checking) label = getTranslation('pwa_check_checking', language);
    else if (updating) label = getTranslation('pwa_check_updating', language);
    else if (showResult && pwa.checkStatus === 'up_to_date') label = getTranslation('pwa_check_up_to_date', language);
    else if (showResult && pwa.checkStatus === 'error') label = getTranslation('pwa_check_failed', language);

    return (
        <button
            type="button"
            data-pwa-update-trigger="true"
            onClick={() => void checkForPwaUpdate()}
            disabled={!pwa.isOnline || checking || updating}
            className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
            title={getTranslation('pwa_check_title', language)}
            aria-label={`${getTranslation('pwa_check_action', language)}${versionLabel ? ` (${versionLabel})` : ''}`}
        >
            <IconRefresh className={`h-5 w-5 ${checking || updating ? 'animate-spin' : ''}`} />
            <span role="status" aria-live="polite" className="hidden whitespace-nowrap md:inline">{label}</span>
        </button>
    );
};
