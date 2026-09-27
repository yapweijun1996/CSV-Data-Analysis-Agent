/**
 * AI Visual Presentation Evaluator — evaluates rendered chart image for quality issues.
 *
 * Uses simpleModel (flash) for cost control. Non-blocking: returns null on failure.
 * Settings-gated: only runs when settings.enableVisualEvaluation is true.
 */

import type { Settings, AnalysisPlan, ChartType } from '../../types';
import { createProviderModel, isProviderConfigured } from './providerConfig';
import { withTransientRetry } from './transientRetry';
import { streamGenerateText } from './streamGenerateText';
import { visualEvaluationSystemPrompt } from '../prompts/summaryPrompts';

const LOG_PREFIX = '[VisualEvaluation]';
const VISUAL_EVALUATION_TIMEOUT_MS = 12_000;

export interface VisualEvaluationResult {
    quality: 'good' | 'acceptable' | 'poor';
    suggestedChartType?: ChartType;
    reason?: string;
}

const VALID_QUALITIES = new Set(['good', 'acceptable', 'poor']);

const parseEvaluationResponse = (text: string): VisualEvaluationResult | null => {
    try {
        // Strip markdown code fences if present
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!VALID_QUALITIES.has(parsed.quality)) return null;
        return {
            quality: parsed.quality,
            suggestedChartType: parsed.suggestedChartType ?? undefined,
            reason: parsed.reason ?? undefined,
        };
    } catch {
        return null;
    }
};

/**
 * Evaluate a rendered chart image for visual quality issues.
 * Returns null if the AI call fails, provider is not configured, or response is unparseable.
 */
export const evaluateChartPresentation = async (
    chartImageBase64: string,
    plan: AnalysisPlan,
    displayChartType: ChartType,
    categoryCount: number,
    settings: Settings,
): Promise<VisualEvaluationResult | null> => {
    if (!isProviderConfigured(settings)) {
        return null;
    }

    try {
        const { model, modelId } = createProviderModel(settings, settings.simpleModel);

        const rawBase64 = chartImageBase64.replace(/^data:image\/\w+;base64,/, '');

        const context = `Chart type: ${displayChartType}. Title: "${plan.title ?? ''}". Categories: ${categoryCount}. Group by: ${plan.groupByColumn ?? 'N/A'}. Value: ${plan.valueColumn ?? plan.yValueColumn ?? 'N/A'}.`;

        const result = await withTransientRetry(
            (fb) => streamGenerateText({
                model: fb ?? model,
                messages: [
                    { role: 'system', content: visualEvaluationSystemPrompt },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: context },
                            { type: 'image', image: rawBase64 },
                        ],
                    },
                ],
                activityTimeoutMs: VISUAL_EVALUATION_TIMEOUT_MS,
            }),
            { settings, primaryModelId: modelId, label: 'visualPresentationEvaluator' },
        );

        const text = result.text?.trim();
        if (!text) {
            console.warn(`${LOG_PREFIX} Empty response.`);
            return null;
        }

        const evaluation = parseEvaluationResponse(text);
        if (!evaluation) {
            console.warn(`${LOG_PREFIX} Unparseable response: ${text.slice(0, 120)}`);
            return null;
        }

        console.log(`${LOG_PREFIX} quality=${evaluation.quality}, suggested=${evaluation.suggestedChartType ?? 'none'}, reason=${evaluation.reason ?? 'none'}`);
        return evaluation;
    } catch (err) {
        console.warn(`${LOG_PREFIX} Failed (non-blocking):`, err instanceof Error ? err.message : err);
        return null;
    }
};
