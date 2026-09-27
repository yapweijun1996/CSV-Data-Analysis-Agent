/**
 * AGRUN-005: maps final-prose token callbacks into the existing streaming
 * assistant surface. The lifecycle adapter owns late-event suppression; this
 * module only normalizes and projects accepted deltas.
 */
import type { AgrunRecord, AgrunRunAdapterContext } from './types';

const asRecord = (value: unknown): AgrunRecord | null =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as AgrunRecord
        : null;

export const readAgrunTokenDelta = (value: unknown): string => {
    if (typeof value === 'string') return value;
    const record = asRecord(value);
    if (!record) return '';
    for (const candidate of [
        record.delta,
        record.text,
        record.token,
        record.content,
    ]) {
        if (typeof candidate === 'string') return candidate;
    }
    return '';
};

export const createAgrunTokenProjector = () => {
    const accumulatedTextByTurn = new Map<string, string>();

    return {
        project(delta: unknown, context: AgrunRunAdapterContext): void {
            const text = readAgrunTokenDelta(delta);
            if (!text) return;
            const nextText = `${accumulatedTextByTurn.get(context.appTurnId) ?? ''}${text}`;
            accumulatedTextByTurn.set(context.appTurnId, nextText);
            context.store.getState().setStreamingMessage(nextText);
        },
        clear(appTurnId: string): void {
            accumulatedTextByTurn.delete(appTurnId);
        },
    };
};
