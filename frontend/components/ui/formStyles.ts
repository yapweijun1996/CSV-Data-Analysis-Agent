/**
 * Single source of truth for form-control and button classes in feature dialogs.
 * Built only from design tokens (slate / accent / success / danger) so light, dark and every
 * accent palette work without per-dialog overrides. New dialogs should reuse these instead of
 * re-declaring Tailwind strings.
 */
export const FIELD_CLASS = 'block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder-slate-400 shadow-sm transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40 sm:text-sm';
export const FIELD_ERROR_CLASS = 'border-danger-400 focus:border-danger-500 focus:ring-danger-500/40';
export const LABEL_CLASS = 'block text-sm font-medium text-slate-800';
export const HELP_TEXT_CLASS = 'text-[13px] leading-5 text-slate-500';

const BUTTON_BASE = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60';
export const BUTTON_PRIMARY_CLASS = `${BUTTON_BASE} bg-accent-600 text-white shadow-sm hover:bg-accent-700`;
export const BUTTON_SECONDARY_CLASS = `${BUTTON_BASE} border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200`;
export const BUTTON_SUCCESS_CLASS = `${BUTTON_BASE} bg-success-600 text-white shadow-sm hover:bg-success-700`;
export const ICON_BUTTON_CLASS = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-40';
export const OUTLINE_ICON_BUTTON_CLASS = `${ICON_BUTTON_CLASS} border border-slate-300 bg-white shadow-sm`;
