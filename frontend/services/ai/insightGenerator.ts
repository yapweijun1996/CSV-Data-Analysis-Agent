import { CardContext, DisplayAnalysisNarrativeInput, Settings } from '../../types';
import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from './streamGenerateText';
import { robustlyParseJsonObject } from '../../utils/jsonParser';
import { proactiveInsightSchema } from './schemas/agentSchemas';
import { prepareSchemaForProvider } from './googleSchemaAdapter';
import { createProactiveInsightPrompt, insightGeneratorSystemPrompt } from '../prompts/insightPrompts';
import { createProviderModel, isProviderConfigured } from './providerConfig';
import {
    ContextTelemetryTarget,
    createContextSection,
    prepareManagedContext,
    reportContextDiagnostics,
} from './contextManager';
import {
    formatNarrativeAnalysisInputs,
    selectNarrativeAnalysisInputs,
} from '../dashboard/displayAnalysisNarrative';
import { runWithOverflowCompaction } from './overflowRetry';
import { withTransientRetry } from './transientRetry';

// ── Grounding validation (deterministic, no AI) ────────────────────────

/** Domain concepts that should NEVER appear unless they exist in the actual data */
const DOMAIN_BLOCKLIST = [
    'supply chain', 'logistics hub', 'logistics', 'procurement', 'warehouse',
    'manufacturing', 'shipping', 'transportation', 'delivery delay',
    'inventory volume', 'bottleneck',
];

/** Extract all known entity terms from narrative inputs for grounding checks */
function buildGroundingVocabulary(inputs: DisplayAnalysisNarrativeInput[]): string[] {
    const terms = new Set<string>();
    for (const input of inputs) {
        if (input.safeNarrativeLabels.dimension) terms.add(input.safeNarrativeLabels.dimension.toLowerCase());
        if (input.safeNarrativeLabels.metric) terms.add(input.safeNarrativeLabels.metric.toLowerCase());
        for (const word of input.displayTitle.split(/\s+/)) {
            if (word.length > 2) terms.add(word.toLowerCase());
        }
        for (const row of input.aggregatedDataSample) {
            for (const [key, val] of Object.entries(row)) {
                terms.add(key.toLowerCase());
                if (typeof val === 'string' && val.length > 1) terms.add(val.toLowerCase());
            }
        }
        for (const word of (input.summary ?? '').split(/\s+/)) {
            if (word.length > 2) terms.add(word.toLowerCase());
        }
    }
    return [...terms];
}

/**
 * Check whether an AI-generated insight is grounded in the actual data.
 * Returns { grounded: false } if the insight references domain concepts
 * absent from the narrative inputs (hallucination signal).
 */
export function validateInsightGrounding(
    insightText: string,
    narrativeInputs: DisplayAnalysisNarrativeInput[],
): { grounded: boolean; ungroundedTerms: string[] } {
    const vocabulary = buildGroundingVocabulary(narrativeInputs);
    const lowerInsight = insightText.replace(/\*\*/g, '').toLowerCase();

    const ungroundedTerms: string[] = [];
    for (const blocked of DOMAIN_BLOCKLIST) {
        if (lowerInsight.includes(blocked) && !vocabulary.some(v => v.includes(blocked) || blocked.includes(v))) {
            ungroundedTerms.push(blocked);
        }
    }

    return { grounded: ungroundedTerms.length === 0, ungroundedTerms };
}

// ── Legacy fallback ────────────────────────────────────────────────────

const buildLegacyNarrativeInputs = (cardContext: CardContext[]): DisplayAnalysisNarrativeInput[] =>
    cardContext.map(card => ({
        cardId: card.id,
        displayTitle: card.title,
        displayDescription: card.description ?? '',
        safeNarrativeLabels: {
            title: card.title,
            dimension: card.groupByColumn ?? null,
            metric: card.valueColumn ?? null,
        },
        semanticRole: 'business_dimension',
        helperExposureLevel: 'medium',
        businessMeaningConfidence: 0.4,
        aggregationQualityFlags: ['legacy_card_context'],
        narrativeEligibility: 'allowed_neutral',
        selectionScore: 0,
        selectionReasons: ['legacy_card_context'],
        summary: card.summary ?? '',
        aggregatedDataSample: card.aggregatedDataSample.slice(0, 5),
        isFallback: false,
    }));

export const generateProactiveInsights = async (
    cardContext: CardContext[],
    settings: Settings,
    telemetryTarget?: ContextTelemetryTarget,
    narrativeInputs?: DisplayAnalysisNarrativeInput[],
): Promise<{ insight: string; cardId: string; } | null> => {
    if (!isProviderConfigured(settings) || cardContext.length === 0) return null;

    try {
        const safeNarrativeInputs = selectNarrativeAnalysisInputs(
            narrativeInputs && narrativeInputs.length > 0
                ? narrativeInputs
                : buildLegacyNarrativeInputs(cardContext),
            6,
        );
        const systemPrompt = insightGeneratorSystemPrompt;
        const { model, modelId } = createProviderModel(settings, settings.simpleModel);
        const result = await runWithOverflowCompaction({
            provider: settings.provider,
            execute: async compactionMode => {
                const managed = await prepareManagedContext({
                    callType: 'insight',
                    systemText: systemPrompt,
                    baseUserText: 'Identify the single most important proactive insight from the generated cards.',
                    sections: [
                        createContextSection(
                            'generated_cards',
                            `Narrative-ready analysis cards:\n${formatNarrativeAnalysisInputs(safeNarrativeInputs)}`,
                            'required',
                            'sticky',
                        ),
                    ],
                    settings,
                    modelId,
                    compactionMode,
                });
                reportContextDiagnostics(telemetryTarget, managed.diagnostics);
                const promptContent = createProactiveInsightPrompt(managed.userText, settings.language);

                return withTransientRetry(
                    (fb) => streamGenerateText({
                        model: fb ?? model,
                        messages: [
                            { role: 'system', content: managed.systemText },
                            { role: 'user', content: promptContent },
                        ],
                        output: Output.object({ schema: jsonSchema(prepareSchemaForProvider(proactiveInsightSchema, settings.provider) as Parameters<typeof jsonSchema>[0]) }),
                    }),
                    { settings, primaryModelId: modelId, label: 'insightGenerator' },
                );
            },
        });

        const parsed = result.output !== undefined
            ? result.output as { insight: string; cardId: string }
            : robustlyParseJsonObject(result.text);

        // Gate 1: Empty insight = AI couldn't find a grounded insight
        if (!parsed || !parsed.insight || parsed.insight.trim() === '') return null;

        // Gate 2: Validate cardId references an actual provided card
        if (!safeNarrativeInputs.some(i => i.cardId === parsed.cardId)) {
            parsed.cardId = safeNarrativeInputs[0]?.cardId ?? '';
        }

        // Gate 3: Grounding validation — suppress hallucinated insights
        const grounding = validateInsightGrounding(parsed.insight, safeNarrativeInputs);
        if (!grounding.grounded) {
            console.warn('[InsightGenerator] Suppressed ungrounded insight:', parsed.insight, 'terms:', grounding.ungroundedTerms);
            return null;
        }

        return parsed;

    } catch (error) {
        console.error("Error generating proactive insight:", error);
        return null;
    }
};
