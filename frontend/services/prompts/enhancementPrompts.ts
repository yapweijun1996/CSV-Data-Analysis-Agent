import { CardContext, Settings } from '../../types';

export const enhancementSystemPrompt = 'You help product analysts improve dashboards. Return a single JSON object with a \'suggestions\' array describing up to three concrete improvements.';

export const createCardEnhancementPrompt = (cardContext: CardContext[], language: Settings['language']) => {
    return `
You are a senior analytics engineer. Review the current dashboard cards listed below and propose up to three targeted enhancements.

Focus on practical improvements that unlock deeper insight, most often by adding calculated columns (ratios, spreads, growth, margin). Only propose ideas that can be executed with the available columns inside each card's aggregated table.

For each suggestion, provide:
- cardId: Which card should be improved.
- cardTitle: Optional human-readable title.
- rationale: Why this matters for the business stakeholder (use ${language} where possible).
- priority: high / medium / low.
- action: Use 'add_calculated_column' when a new derived column is suitable, otherwise 'none'. (Future actions may be added.)
- proposedColumnName + formula: When adding a column, reference existing columns in single-quotes, e.g., "('Revenue' - 'Cost') / 'Revenue'".
- updateChart: Only when the new column should replace or supplement the existing metric.

Keep suggestions specific and data-driven. Do not exceed three suggestions.

CARDS JSON:
${JSON.stringify(cardContext, null, 2)}
`;
};
