const TABULATOR_EVENT_TARGET_LOOKUP_WARNING =
    'Event Target Lookup Error - The row this cell is attached to cannot be found, has the table been reinitialized without being destroyed first?';

let applied = false;

export function applyTabulatorInteractionGuard(): void {
    if (applied) return;
    applied = true;

    const originalWarn = console.warn;

    console.warn = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0] === TABULATOR_EVENT_TARGET_LOOKUP_WARNING) {
            return;
        }

        originalWarn(...args);
    };
}
