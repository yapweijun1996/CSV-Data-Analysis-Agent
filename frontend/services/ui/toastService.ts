/**
 * Single source of truth for non-blocking notifications.
 * Only `components/ui/ToastHost.tsx` renders toasts; every caller goes through `toast`.
 * Messages are plain strings that the caller has already translated with getTranslation.
 */
export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

export interface ToastOptions {
    type?: ToastType;
    message: string;
    /** Collapsed technical detail shown behind a "show details" toggle. */
    detail?: string;
    /** At most two actions. */
    actions?: ToastAction[];
    /** Same id merges repeats and restarts the timer. Defaults to type + message. */
    id?: string;
    /** Milliseconds; 0 keeps the toast until dismissed. Defaults depend on type. */
    duration?: number;
}

export interface ToastItem extends Required<Pick<ToastOptions, 'type' | 'message' | 'id' | 'duration'>> {
    detail?: string;
    actions: ToastAction[];
    /** Bumps on every merge so the host can restart its timer. */
    revision: number;
}

export const MAX_VISIBLE_TOASTS = 3;
const DEFAULT_DURATION_MS: Record<ToastType, number> = { info: 4000, success: 4000, warning: 6000, error: 0 };

let items: ToastItem[] = [];
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach(listener => listener());

export const subscribeToasts = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
export const getToasts = (): ToastItem[] => items;

export const dismissToast = (id: string): void => {
    if (!items.some(item => item.id === id)) return;
    items = items.filter(item => item.id !== id);
    emit();
};

export const showToast = (options: ToastOptions): string => {
    const type = options.type ?? 'info';
    const actions = (options.actions ?? []).slice(0, 2);
    const id = options.id ?? `${type}:${options.message}`;
    const duration = options.duration ?? (actions.length > 0 && type !== 'error' ? 6000 : DEFAULT_DURATION_MS[type]);
    const previous = items.find(item => item.id === id);
    const next: ToastItem = {
        type,
        message: options.message,
        detail: options.detail,
        actions,
        id,
        duration,
        revision: (previous?.revision ?? 0) + 1,
    };
    items = previous ? items.map(item => (item.id === id ? next : item)) : [...items, next];
    // Over the cap, the oldest non-sticky toast leaves first; sticky ones only when nothing else can.
    while (items.length > MAX_VISIBLE_TOASTS) {
        const victim = items.find(item => item.duration > 0 && item.id !== id) ?? items.find(item => item.id !== id);
        if (!victim) break;
        items = items.filter(item => item !== victim);
    }
    emit();
    return id;
};

export const toast = {
    show: showToast,
    info: (message: string, rest: Omit<ToastOptions, 'message' | 'type'> = {}) => showToast({ ...rest, message, type: 'info' }),
    success: (message: string, rest: Omit<ToastOptions, 'message' | 'type'> = {}) => showToast({ ...rest, message, type: 'success' }),
    warning: (message: string, rest: Omit<ToastOptions, 'message' | 'type'> = {}) => showToast({ ...rest, message, type: 'warning' }),
    error: (message: string, rest: Omit<ToastOptions, 'message' | 'type'> = {}) => showToast({ ...rest, message, type: 'error' }),
    dismiss: dismissToast,
};

export const __resetToastsForTests = (): void => {
    items = [];
    listeners.clear();
};
