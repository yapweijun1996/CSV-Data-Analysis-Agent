import React, { useEffect, useRef } from 'react';
import { usePwaLifecycle } from '../hooks/usePwaLifecycle';
import { acknowledgePwaFlow, checkForPwaUpdate, type PwaUpdateFlow } from '../services/pwa/pwaManager';
import { toast } from '../services/ui/toastService';
import { useAppStore } from '../store/useAppStore';
import { getTranslation } from '../utils/localization';
import { IconRefresh } from '../icons/IconRefresh';
import { formatPwaVersion } from './PwaUpdateButton';

const BUSY_FLOWS: ReadonlySet<PwaUpdateFlow> = new Set(['checking', 'downloading', 'reloading']);
const STEPS = [
    { flow: 'checking', key: 'pwa_flow_step_check' },
    { flow: 'downloading', key: 'pwa_flow_step_download' },
    { flow: 'reloading', key: 'pwa_flow_step_install' },
] as const;

/**
 * Full-screen loader for the update flow (check, download, install and reload).
 * Final outcomes (latest version, deferred, error) are reported through the toast service.
 */
export const UpdateOverlay: React.FC = () => {
    const pwa = usePwaLifecycle();
    const language = useAppStore(state => state.settings.language);
    const panelRef = useRef<HTMLDivElement>(null);
    const visible = pwa.flowManual && BUSY_FLOWS.has(pwa.flow);

    useEffect(() => {
        if (!pwa.flowManual) return;
        if (pwa.flow === 'up_to_date') {
            toast.success(getTranslation('pwa_flow_up_to_date_toast', language, { version: formatPwaVersion(pwa.version) ?? '' }).replace(/\s+\./, '.'), { id: 'pwa-update-result' });
        } else if (pwa.flow === 'deferred') {
            toast.info(getTranslation('pwa_flow_deferred_toast', language), { id: 'pwa-update-result' });
        } else if (pwa.flow === 'error') {
            toast.error(getTranslation('pwa_flow_error_toast', language), {
                id: 'pwa-update-result',
                actions: [{ label: getTranslation('pwa_flow_retry', language), onClick: () => { void checkForPwaUpdate({ manual: true }); } }],
            });
        } else {
            return;
        }
        acknowledgePwaFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pwa.flow, pwa.flowManual]);

    useEffect(() => {
        if (visible) panelRef.current?.focus();
    }, [visible]);

    if (!visible) return null;

    const activeIndex = STEPS.findIndex(step => step.flow === pwa.flow);
    const title = getTranslation(`pwa_flow_${pwa.flow}_title`, language);
    const detail = getTranslation(`pwa_flow_${pwa.flow}_detail`, language);

    return (
        <div
            data-update-overlay="true"
            className="fixed inset-0 z-[9800] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
            aria-busy="true"
        >
            <div
                ref={panelRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="update-overlay-title"
                aria-describedby="update-overlay-detail"
                tabIndex={-1}
                className="w-full max-w-sm rounded-card border border-slate-200 bg-white p-6 text-center shadow-2xl outline-none"
            >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-50 text-accent-600">
                    <IconRefresh className="h-7 w-7 motion-safe:animate-spin" />
                </div>
                <h2 id="update-overlay-title" role="status" aria-live="polite" className="mt-4 text-lg font-bold text-slate-950">{title}</h2>
                <p id="update-overlay-detail" className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
                <ol className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold">
                    {STEPS.map((step, index) => {
                        const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'todo';
                        return (
                            <li
                                key={step.flow}
                                data-step-state={state}
                                className={`rounded-full px-3 py-1 ${state === 'active' ? 'bg-accent-600 text-white' : state === 'done' ? 'bg-success-100 text-success-800' : 'bg-slate-100 text-slate-500'}`}
                            >
                                {state === 'done' ? '✓ ' : ''}{getTranslation(step.key, language)}
                            </li>
                        );
                    })}
                </ol>
            </div>
        </div>
    );
};
