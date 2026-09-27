import type { LanguageModelMiddleware } from 'ai';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import type { CloudAiProvider } from '../../types';
import { recordLocalDiagnosticBestEffort } from './localDiagnostics';

const nowMs = (): number => typeof performance !== 'undefined'
    ? performance.now()
    : Date.now();

const reasonCodeFromError = (error: unknown): string => {
    const candidate = error as { code?: unknown; status?: unknown; name?: unknown };
    if (typeof candidate?.code === 'string' && candidate.code.trim()) {
        return candidate.code.trim().slice(0, 100);
    }
    if (typeof candidate?.status === 'number') return `http_${candidate.status}`;
    if (typeof candidate?.name === 'string' && candidate.name.trim()) {
        return candidate.name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 100);
    }
    return 'provider_error';
};

const buildRequestSnapshot = (params: Record<string, unknown>): unknown => ({
    prompt: params.prompt ?? null,
    maxOutputTokens: params.maxOutputTokens ?? null,
    temperature: params.temperature ?? null,
    toolChoice: params.toolChoice ?? null,
    tools: params.tools ?? null,
});

/**
 * Captures every provider call at the shared model boundary. Diagnostics remain
 * local and are credential-redacted before their bounded IndexedDB write.
 */
export const createLlmDiagnosticMiddleware = (
    provider: CloudAiProvider,
    model: string,
): LanguageModelMiddleware => ({
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate, params }) => {
        const startedAt = nowMs();
        try {
            const result = await doGenerate();
            recordLocalDiagnosticBestEffort({
                provider,
                model,
                durationMs: nowMs() - startedAt,
                outcome: 'succeeded',
                reasonCode: String(result.finishReason ?? 'completed'),
                payload: {
                    request: buildRequestSnapshot(params as unknown as Record<string, unknown>),
                    response: {
                        content: result.content,
                        finishReason: result.finishReason,
                        usage: result.usage,
                        warnings: result.warnings,
                    },
                },
            });
            return result;
        } catch (error) {
            recordLocalDiagnosticBestEffort({
                provider,
                model,
                durationMs: nowMs() - startedAt,
                outcome: 'failed',
                reasonCode: reasonCodeFromError(error),
                payload: {
                    request: buildRequestSnapshot(params as unknown as Record<string, unknown>),
                    error,
                },
            });
            throw error;
        }
    },
    wrapStream: async ({ doStream, params }) => {
        const startedAt = nowMs();
        try {
            const { stream, ...rest } = await doStream();
            const responseParts: LanguageModelV3StreamPart[] = [];
            let recorded = false;
            const persist = (
                outcome: 'succeeded' | 'failed',
                reasonCode: string,
            ) => {
                if (recorded) return;
                recorded = true;
                recordLocalDiagnosticBestEffort({
                    provider,
                    model,
                    durationMs: nowMs() - startedAt,
                    outcome,
                    reasonCode,
                    payload: {
                        request: buildRequestSnapshot(params as unknown as Record<string, unknown>),
                        responseParts,
                    },
                });
            };
            const diagnosticStream = new TransformStream<
                LanguageModelV3StreamPart,
                LanguageModelV3StreamPart
            >({
                transform(part, controller) {
                    responseParts.push(part);
                    if (part.type === 'finish') {
                        persist('succeeded', String(part.finishReason ?? 'completed'));
                    } else if (part.type === 'error') {
                        persist('failed', reasonCodeFromError(part.error));
                    }
                    controller.enqueue(part);
                },
                flush() {
                    persist('succeeded', 'stream_closed');
                },
            });
            return {
                ...rest,
                stream: stream.pipeThrough(diagnosticStream),
            };
        } catch (error) {
            recordLocalDiagnosticBestEffort({
                provider,
                model,
                durationMs: nowMs() - startedAt,
                outcome: 'failed',
                reasonCode: reasonCodeFromError(error),
                payload: {
                    request: buildRequestSnapshot(params as unknown as Record<string, unknown>),
                    error,
                },
            });
            throw error;
        }
    },
});
