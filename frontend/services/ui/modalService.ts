/**
 * Single source of truth for blocking dialogs. Only `components/ui/ModalHost.tsx`
 * renders them. Use `confirmModal` for yes/no decisions and `alertModal` for
 * acknowledgements; both resolve when the dialog closes, so callers never own dialog state.
 * Text is passed already translated.
 */
export type ModalTone = 'default' | 'danger';

export interface ModalRequest {
    id: string;
    title: string;
    message: string;
    confirmLabel: string;
    /** Omit for an acknowledgement-only dialog. */
    cancelLabel?: string;
    tone: ModalTone;
    resolve: (confirmed: boolean) => void;
}

export interface ModalOptions {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: ModalTone;
}

let queue: ModalRequest[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach(listener => listener());

export const subscribeModals = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
/** The modal currently on screen; later requests wait their turn. */
export const getActiveModal = (): ModalRequest | null => queue[0] ?? null;

export const openModal = (options: ModalOptions): Promise<boolean> => new Promise(resolve => {
    counter += 1;
    queue = [...queue, { ...options, tone: options.tone ?? 'default', id: `modal-${counter}`, resolve }];
    emit();
});

export const closeActiveModal = (confirmed: boolean): void => {
    const active = queue[0];
    if (!active) return;
    queue = queue.slice(1);
    emit();
    active.resolve(confirmed);
};

export const confirmModal = (options: ModalOptions): Promise<boolean> => openModal(options);
export const alertModal = (options: Omit<ModalOptions, 'cancelLabel'>): Promise<boolean> => openModal(options);

export const __resetModalsForTests = (): void => {
    queue.forEach(request => request.resolve(false));
    queue = [];
    listeners.clear();
};
