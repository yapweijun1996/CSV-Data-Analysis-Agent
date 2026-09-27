import type { Settings } from '../../types';

export interface LlmError extends Error {
    stage: string;
    provider: Settings['provider'];
    model: string;
    status?: number;
    code?: string;
}

export const createLlmError = (params: {
    message: string;
    detail?: string;
    stage: string;
    provider: Settings['provider'];
    model: string;
    status?: number;
    code?: string;
}): LlmError => {
    const baseMessage = params.detail ? `${params.message}: ${params.detail}` : params.message;
    const error = new Error(baseMessage) as LlmError;
    error.stage = params.stage;
    error.provider = params.provider;
    error.model = params.model;
    error.status = params.status;
    error.code = params.code;
    return error;
};

export const debugLog = (stage: string, details: Record<string, any>, error?: unknown) => {
    const payload = { stage, ...details };
    if (error) {
        console.error(`[LLM][${stage}]`, payload, error);
    } else {
        console.debug(`[LLM][${stage}]`, payload);
    }
};
