import { redactLocalDiagnosticPayload } from '../observability/localDiagnostics';

/**
 * Keeps the most recent console errors/warnings and uncaught errors in memory so a
 * "Report problem" export can show what the browser saw. Nothing is persisted or uploaded.
 * Messages pass through the credential redactor before they are stored.
 */
export interface ConsoleRingEntry {
    at: string;
    level: 'error' | 'warn' | 'uncaught' | 'unhandledrejection';
    message: string;
    stack?: string;
}

export const CONSOLE_RING_CAPACITY = 100;
const MAX_MESSAGE_CHARS = 1500;
const MAX_STACK_CHARS = 2000;

let entries: ConsoleRingEntry[] = [];
let installed = false;

const stringify = (value: unknown): string => {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof value === 'string') return value;
    try { return JSON.stringify(redactLocalDiagnosticPayload(value)) ?? String(value); } catch { return String(value); }
};

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)}…` : text);

export const recordConsoleEntry = (level: ConsoleRingEntry['level'], parts: unknown[], stack?: string): void => {
    const message = clip(String(redactLocalDiagnosticPayload(parts.map(stringify).join(' '))), MAX_MESSAGE_CHARS);
    const entry: ConsoleRingEntry = { at: new Date().toISOString(), level, message };
    if (stack) entry.stack = clip(String(redactLocalDiagnosticPayload(stack)), MAX_STACK_CHARS);
    entries = [...entries, entry].slice(-CONSOLE_RING_CAPACITY);
};

export const getConsoleRingEntries = (): ConsoleRingEntry[] => [...entries];

export const installConsoleRingBuffer = (target: Window & typeof globalThis = window): void => {
    if (installed) return;
    installed = true;
    for (const level of ['error', 'warn'] as const) {
        const original = target.console[level].bind(target.console);
        target.console[level] = (...args: unknown[]) => {
            try {
                const firstError = args.find((arg): arg is Error => arg instanceof Error);
                recordConsoleEntry(level, args, firstError?.stack);
            } catch { /* Never let diagnostics break logging. */ }
            original(...args);
        };
    }
    target.addEventListener('error', event => {
        recordConsoleEntry('uncaught', [event.message || 'Uncaught error', event.filename ? `(${event.filename}:${event.lineno})` : ''], (event.error as Error | undefined)?.stack);
    });
    target.addEventListener('unhandledrejection', event => {
        const reason = event.reason as unknown;
        recordConsoleEntry('unhandledrejection', [reason], reason instanceof Error ? reason.stack : undefined);
    });
};

export const __resetConsoleRingForTests = (): void => { entries = []; };
