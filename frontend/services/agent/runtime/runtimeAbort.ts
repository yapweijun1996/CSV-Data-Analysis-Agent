import type {
    RuntimeAbortMode,
    RuntimeAbortPropagationStatus,
    RuntimeAbortSource,
} from '../../../types';

const turnAbortControllers = new Map<string, AbortController>();

export const RUNTIME_TURN_ABORT_MESSAGE = 'Cancelled the current agent run.';

export interface RuntimeAbortReason {
    name: 'AbortError';
    message: string;
    abortMode?: RuntimeAbortMode;
    abortSource?: RuntimeAbortSource | string;
    abortPropagationStatus?: RuntimeAbortPropagationStatus;
}

const createAbortError = (message = RUNTIME_TURN_ABORT_MESSAGE): Error => {
    if (typeof DOMException !== 'undefined') {
        return new DOMException(message, 'AbortError');
    }

    const error = new Error(message);
    error.name = 'AbortError';
    return error;
};

export const normalizeAbortError = (reason?: unknown, fallbackMessage = RUNTIME_TURN_ABORT_MESSAGE): Error => {
    if (
        reason
        && typeof reason === 'object'
        && 'name' in reason
        && (reason as { name?: unknown }).name === 'AbortError'
        && typeof (reason as { message?: unknown }).message === 'string'
    ) {
        return createAbortError((reason as { message?: string }).message ?? fallbackMessage);
    }

    if (reason instanceof Error) {
        return reason;
    }

    if (typeof reason === 'string' && reason.trim().length > 0) {
        return createAbortError(reason.trim());
    }

    return createAbortError(fallbackMessage);
};

export const buildRuntimeAbortReason = ({
    message = RUNTIME_TURN_ABORT_MESSAGE,
    abortMode,
    abortSource,
    abortPropagationStatus,
}: {
    message?: string;
    abortMode?: RuntimeAbortMode;
    abortSource?: RuntimeAbortSource | string;
    abortPropagationStatus?: RuntimeAbortPropagationStatus;
} = {}): RuntimeAbortReason => ({
    name: 'AbortError',
    message,
    ...(abortMode ? { abortMode } : {}),
    ...(abortSource ? { abortSource } : {}),
    ...(abortPropagationStatus ? { abortPropagationStatus } : {}),
});

export const extractRuntimeAbortMetadata = (reason?: unknown): {
    abortMode?: RuntimeAbortMode;
    abortSource?: RuntimeAbortSource | string;
    abortPropagationStatus?: RuntimeAbortPropagationStatus;
} => {
    if (!reason || typeof reason !== 'object') {
        return {};
    }

    const candidate = reason as {
        abortMode?: unknown;
        abortSource?: unknown;
        abortPropagationStatus?: unknown;
    };

    return {
        ...(typeof candidate.abortMode === 'string' ? { abortMode: candidate.abortMode as RuntimeAbortMode } : {}),
        ...(typeof candidate.abortSource === 'string' ? { abortSource: candidate.abortSource } : {}),
        ...(typeof candidate.abortPropagationStatus === 'string'
            ? { abortPropagationStatus: candidate.abortPropagationStatus as RuntimeAbortPropagationStatus }
            : {}),
    };
};

export const registerRuntimeTurnAbortController = (turnId: string): AbortController => {
    const controller = new AbortController();
    turnAbortControllers.set(turnId, controller);
    return controller;
};

export const abortRuntimeTurn = (
    turnId: string,
    reason: unknown = buildRuntimeAbortReason({
        abortMode: 'checkpoint_abort',
        abortSource: 'runtime_cancellation',
        abortPropagationStatus: 'checkpoint_only',
    }),
): boolean => {
    const controller = turnAbortControllers.get(turnId);
    if (!controller || controller.signal.aborted) {
        return false;
    }

    controller.abort(reason);
    return true;
};

export const clearRuntimeTurnAbortController = (turnId: string) => {
    turnAbortControllers.delete(turnId);
};

export const throwIfAborted = (signal?: AbortSignal) => {
    if (!signal?.aborted) {
        return;
    }

    throw normalizeAbortError(signal.reason);
};

export const isRuntimeAbortError = (error: unknown, signal?: AbortSignal): boolean => {
    if (signal?.aborted && error === signal.reason) {
        return true;
    }

    if (
        error
        && typeof error === 'object'
        && 'name' in error
        && (error as { name?: unknown }).name === 'AbortError'
    ) {
        return true;
    }

    return error instanceof Error && error.name === 'AbortError';
};
