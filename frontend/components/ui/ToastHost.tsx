import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
    dismissToast,
    getToasts,
    subscribeToasts,
    type ToastItem,
    type ToastType,
} from '../../services/ui/toastService';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';

const TONE: Record<ToastType, string> = {
    info: 'border-accent-300 bg-accent-50 text-accent-950',
    success: 'border-success-300 bg-success-50 text-success-950',
    warning: 'border-warning-300 bg-warning-50 text-warning-950',
    error: 'border-danger-300 bg-danger-50 text-danger-950',
};
const ACTION_TONE: Record<ToastType, string> = {
    info: 'bg-accent-600 hover:bg-accent-700',
    success: 'bg-success-600 hover:bg-success-700',
    warning: 'bg-warning-600 hover:bg-warning-700',
    error: 'bg-danger-600 hover:bg-danger-700',
};

const ToastCard: React.FC<{ item: ToastItem; language: string }> = ({ item, language }) => {
    const [paused, setPaused] = useState(false);
    const [showDetail, setShowDetail] = useState(false);

    // Hover or focus pauses the countdown; a merged repeat (new revision) restarts it.
    useEffect(() => {
        if (item.duration <= 0 || paused) return undefined;
        const timer = setTimeout(() => dismissToast(item.id), item.duration);
        return () => clearTimeout(timer);
    }, [item.duration, item.id, item.revision, paused]);

    return (
        <div
            data-toast-type={item.type}
            className={`pointer-events-auto w-full rounded-lg border p-3 shadow-lg motion-safe:animate-[toast-in_160ms_ease-out] ${TONE[item.type]}`}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
        >
            <div className="flex items-start gap-2">
                <p className="flex-1 whitespace-pre-line text-sm leading-snug">{item.message}</p>
                <button
                    type="button"
                    onClick={() => dismissToast(item.id)}
                    aria-label={getTranslation('toast_dismiss', language)}
                    className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none opacity-70 hover:opacity-100"
                >
                    ×
                </button>
            </div>
            {item.detail && (
                <>
                    <button
                        type="button"
                        onClick={() => setShowDetail(value => !value)}
                        className="mt-1 text-xs underline-offset-2 hover:underline"
                    >
                        {getTranslation(showDetail ? 'error_detail_hide' : 'error_detail_show', language)}
                    </button>
                    {showDetail && (
                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-black/5 p-2 text-xs">{item.detail}</pre>
                    )}
                </>
            )}
            {item.actions.length > 0 && (
                <div className="mt-3 flex gap-2">
                    {item.actions.map((action, index) => (
                        <button
                            key={action.label}
                            type="button"
                            onClick={() => { action.onClick(); dismissToast(item.id); }}
                            className={index === 0
                                ? `min-h-[44px] flex-1 rounded px-3 py-1.5 text-xs font-semibold text-white ${ACTION_TONE[item.type]}`
                                : 'min-h-[44px] flex-1 rounded border border-current px-3 py-1.5 text-xs font-semibold hover:bg-black/5'}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

/** The only toast renderer. Mount once, near the app root. */
export const ToastHost: React.FC = () => {
    const items = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
    const language = useAppStore(state => state.settings.language);
    const itemsRef = useRef(items);
    itemsRef.current = items;

    // Escape closes the newest toast unless the user is typing.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key !== 'Escape') return;
            const target = event.target as HTMLElement | null;
            if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
            if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
            const newest = itemsRef.current[itemsRef.current.length - 1];
            if (newest) dismissToast(newest.id);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const polite = items.filter(item => item.type !== 'error');
    const assertive = items.filter(item => item.type === 'error');
    // Regions stay mounted so assistive tech announces the first message.
    return (
        <div
            data-toast-host="true"
            className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[9000] mx-auto flex max-w-[480px] flex-col gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:mx-0 md:w-96"
        >
            <div role="status" aria-live="polite" className="flex flex-col gap-2">
                {polite.map(item => <ToastCard key={item.id} item={item} language={language} />)}
            </div>
            <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
                {assertive.map(item => <ToastCard key={item.id} item={item} language={language} />)}
            </div>
        </div>
    );
};
