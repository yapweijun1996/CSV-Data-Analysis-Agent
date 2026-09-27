/**
 * streamGenerateText — drop-in replacement for `generateText` that uses
 * `streamText` + activity-aware idle timeout under the hood.
 *
 * Why: `generateText` is non-streaming — the entire response must complete
 * before any data is returned.  Thinking models (Gemma 4, etc.) can spend
 * 30-60+ seconds in a reasoning phase that produces `reasoning-delta` SSE
 * chunks but zero `text-delta` chunks.  A fixed-deadline timeout treats
 * this healthy thinking as silence and kills the request.
 *
 * This helper drains `fullStream` (which includes reasoning-delta) and
 * calls `signalActivity()` on every chunk, resetting the idle timer.
 * The timeout only fires when the connection goes truly idle for
 * `activityTimeoutMs` consecutive milliseconds.
 *
 * Usage:
 *   // Before:
 *   const result = await generateText({ model, messages, output, abortSignal });
 *
 *   // After:
 *   const result = await streamGenerateText({ model, messages, output, abortSignal });
 *
 * Returns `{ text, finishReason, output }` — same shape consumers expect
 * from `generateText`.
 */

import { streamText } from 'ai';
import type { LanguageModel } from 'ai';
import {
    isProviderTimeoutError,
    raceWithActivityTimeout,
} from './providerActivityGuards';
import { CloudAiConsentDeclinedError } from '../privacy/cloudAiConsent';

/** Default idle timeout: 30 seconds between SSE chunks. */
export const DEFAULT_ACTIVITY_TIMEOUT_MS = 30_000;

/**
 * Activity-aware wrapper around `streamText`.
 *
 * Accepts the same options as `streamText` plus an optional
 * `activityTimeoutMs` (default 30 s).  Every SSE chunk — including
 * reasoning/thinking tokens — resets the idle timer.
 */
export const streamGenerateText = async (
    options: Parameters<typeof streamText>[0] & { activityTimeoutMs?: number },
): Promise<{ text: string; finishReason: string; output: unknown }> => {
    const { activityTimeoutMs = DEFAULT_ACTIVITY_TIMEOUT_MS, ...streamOptions } = options;
    const callerOnError = streamOptions.onError;
    let streamedError: unknown;
    const stream = streamText({
        ...streamOptions,
        onError: async event => {
            streamedError = event.error;
            if (callerOnError) {
                await callerOnError(event);
                return;
            }
            if (!(event.error instanceof CloudAiConsentDeclinedError)) {
                console.error(event.error);
            }
        },
    });

    const { promise, signalActivity } = raceWithActivityTimeout(
        (async () => {
            // Attach rejection handlers immediately. Some AI SDK providers reject
            // text, finishReason, and output together. Waiting until fullStream
            // finishes before observing these promises leaves sibling rejections
            // unhandled when the stream or text promise fails first.
            const settle = <T>(value: PromiseLike<T>) => Promise.resolve(value).then(
                result => ({ status: 'fulfilled' as const, value: result }),
                reason => ({ status: 'rejected' as const, reason }),
            );
            const textResultPromise = settle(stream.text);
            const finishReasonResultPromise = settle(stream.finishReason);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const outputResultPromise = settle(Promise.resolve((stream as any).output));

            // Drain fullStream so every SSE event (including reasoning-delta)
            // resets the idle timer.
            for await (const part of stream.fullStream) {
                signalActivity();
                void part;
            }

            const [textResult, finishReasonResult, outputResult] = await Promise.all([
                textResultPromise,
                finishReasonResultPromise,
                outputResultPromise,
            ]);
            if (streamedError instanceof CloudAiConsentDeclinedError) {
                throw streamedError;
            }
            if (textResult.status === 'rejected') {
                throw textResult.reason;
            }
            if (finishReasonResult.status === 'rejected') {
                throw finishReasonResult.reason;
            }

            // stream.output only resolves when Output.object({ schema }) was
            // passed. A rejected output sibling is non-fatal for text callers.
            const output = outputResult.status === 'fulfilled'
                ? outputResult.value
                : undefined;

            return {
                text: textResult.value,
                finishReason: finishReasonResult.value as string,
                output,
            };
        })(),
        activityTimeoutMs,
    );

    return promise;
};

export { isProviderTimeoutError };
