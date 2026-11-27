/**
 * Shared sizing for the Assistant panel controls (composer row, reply action bar):
 * 44px touch targets on phones, 32px on desktop, one radius, one text size, one focus ring.
 */
const base = 'inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg text-xs transition-colors md:min-h-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-40';

export const chatIconButton = `${base} min-w-[44px] text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:min-w-8`;
export const chatTextButton = `${base} px-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900`;
export const chatDangerButton = `${base} px-2 bg-danger-50 text-danger-700 hover:bg-danger-100`;
export const chatSelect = 'min-h-[44px] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800 md:min-h-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60';
