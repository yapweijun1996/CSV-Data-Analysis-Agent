import { CardContext, Settings } from '../../types';
import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from './streamGenerateText';
import type { ModelMessage } from 'ai';
import { createProviderModel, isProviderConfigured } from './providerConfig';
import { withTransientRetry } from './transientRetry';
import { createCardEnhancementPrompt, enhancementSystemPrompt } from '../prompts/enhancementPrompts';
import { cardEnhancementSuggestionsSchema } from './schemas/agentSchemas';
import { robustlyParseJsonObject } from '../../utils/jsonParser';
import { prepareSchemaForProvider } from './googleSchemaAdapter';

export interface AiCardEnhancementSuggestion {
    id?: string;
    cardId: string;
    cardTitle?: string;
    rationale: string;
    priority: 'high' | 'medium' | 'low';
    action: 'add_calculated_column' | 'none';
    proposedColumnName?: string;
    formula?: string;
    updateChart?: {
        useAs: 'primaryY' | 'secondaryY';
        newChartType?: string;
    };
}

const isExecutableEnhancementSuggestion = (
    suggestion: AiCardEnhancementSuggestion
): suggestion is AiCardEnhancementSuggestion & { action: 'add_calculated_column'; proposedColumnName: string; formula: string } => (
    suggestion.action === 'add_calculated_column'
    && typeof suggestion.cardId === 'string'
    && suggestion.cardId.trim().length > 0
    && typeof suggestion.proposedColumnName === 'string'
    && suggestion.proposedColumnName.trim().length > 0
    && typeof suggestion.formula === 'string'
    && suggestion.formula.trim().length > 0
);

export const generateCardEnhancementSuggestions = async (
    cardContext: CardContext[],
    settings: Settings
): Promise<AiCardEnhancementSuggestion[]> => {
    if (!isProviderConfigured(settings) || cardContext.length === 0) return [];

    try {
        const promptContent = createCardEnhancementPrompt(cardContext, settings.language);
        const systemPrompt = enhancementSystemPrompt;
        const { model, modelId } = createProviderModel(settings, settings.complexModel);
        const messages: ModelMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: promptContent },
        ];

        const result = await withTransientRetry(
            (fb) => streamGenerateText({
                model: fb ?? model,
                messages,
                output: Output.object({ schema: jsonSchema(prepareSchemaForProvider(cardEnhancementSuggestionsSchema, settings.provider) as Parameters<typeof jsonSchema>[0]) }),
            }),
            { settings, primaryModelId: modelId, label: 'enhancementGenerator' },
        );

        const parsed = result.output !== undefined
            ? result.output as { suggestions: AiCardEnhancementSuggestion[] }
            : robustlyParseJsonObject(result.text);
        return Array.isArray(parsed?.suggestions)
            ? parsed.suggestions.filter(isExecutableEnhancementSuggestion)
            : [];
    } catch (error) {
        console.error('Failed to generate card enhancement suggestions:', error);
        return [];
    }
};
