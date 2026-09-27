/**
 * Visual-grounded summary generator — sends chart image + data to AI
 * so the summary describes what the user actually sees in the chart.
 *
 * Uses simpleModel (flash) for cost control. Non-blocking: returns null on failure.
 */

import type { Settings, CsvRow, LocalizedText } from '../../types';
import { createProviderModel, isProviderConfigured } from './providerConfig';
import { withTransientRetry } from './transientRetry';
import { streamGenerateText } from './streamGenerateText';
import { visualSummarySystemPrompt } from '../prompts/summaryPrompts';

const LOG_PREFIX = '[VisualSummary]';
const VISUAL_SUMMARY_TIMEOUT_MS = 15_000;

/**
 * Generate a summary grounded in the actual chart image.
 * Returns null if the AI call fails or provider is not configured.
 */
export const generateVisualGroundedSummary = async (
    title: string,
    chartImageBase64: string,
    dataSample: CsvRow[],
    settings: Settings,
    language: LocalizedText['language'],
): Promise<LocalizedText | null> => {
    if (!isProviderConfigured(settings)) {
        return null;
    }

    try {
        const { model } = createProviderModel(settings, settings.simpleModel);

        // Strip data URL prefix — Vercel AI SDK expects raw base64.
        const rawBase64 = chartImageBase64.replace(/^data:image\/\w+;base64,/, '');

        // Build a brief data context so the AI can cross-reference chart with numbers.
        const dataContext = dataSample.length > 0
            ? `\nData sample (first ${Math.min(dataSample.length, 5)} rows):\n${JSON.stringify(dataSample.slice(0, 5), null, 0)}`
            : '';

        const messages = [
            { role: 'system' as const, content: visualSummarySystemPrompt },
            {
                role: 'user' as const,
                content: [
                    {
                        type: 'text' as const,
                        text: `Chart title: "${title}". Language: ${language}.${dataContext}\n\nDescribe what you see in this chart.`,
                    },
                    {
                        type: 'image' as const,
                        image: rawBase64,
                    },
                ],
            },
        ];

        const result = await withTransientRetry(
            (fb) => streamGenerateText({
                model: fb ?? model,
                messages,
                activityTimeoutMs: VISUAL_SUMMARY_TIMEOUT_MS,
            }),
            { settings, primaryModelId: settings.simpleModel, label: 'visualSummary' },
        );

        const text = result.text?.trim();
        if (!text) {
            console.warn(`${LOG_PREFIX} Empty response for "${title}".`);
            return null;
        }

        console.log(`${LOG_PREFIX} Generated visual summary for "${title}" (${text.length} chars).`);
        return { language, text };
    } catch (err) {
        console.warn(`${LOG_PREFIX} Failed for "${title}" (non-blocking):`, err instanceof Error ? err.message : err);
        return null;
    }
};
