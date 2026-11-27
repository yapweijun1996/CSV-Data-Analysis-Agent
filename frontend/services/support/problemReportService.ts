/**
 * Open/close state for the "Report problem" dialog, kept outside the app store so any surface
 * (chat header, error reply, future menus) can open it with one call.
 * Rendered only by `components/modals/ReportProblemModal.tsx`.
 */
const listeners = new Set<() => void>();
let open = false;
const emit = (): void => listeners.forEach(listener => listener());

export const subscribeProblemReport = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
export const isProblemReportOpen = (): boolean => open;
export const openProblemReport = (): void => { if (!open) { open = true; emit(); } };
export const closeProblemReport = (): void => { if (open) { open = false; emit(); } };
