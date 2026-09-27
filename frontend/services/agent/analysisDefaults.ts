import type { AnalysisGoalCandidate, ChatMessage } from '../../types';
import type { AnalysisRankingHints } from './analysisBrief';

export const DEFAULT_AUTO_ANALYSIS_GOAL = 'Summarize key patterns, anomalies, trends, and notable segments in this dataset.';

export const DEFAULT_REFINE_SUGGESTIONS: NonNullable<ChatMessage['suggestedActions']> = [
    { label: 'Explore trends', action: 'Focus on the most important trends and changes over time in this dataset.' },
    { label: 'Find anomalies', action: 'Identify notable anomalies, outliers, or unusual segments in this dataset.' },
    { label: 'Compare segments', action: 'Compare the most important segments, groups, or categories in this dataset.' },
];

export const mapGoalCandidatesToSuggestedActions = (
    goals: AnalysisGoalCandidate[] | null | undefined,
    hints?: AnalysisRankingHints | null,
): NonNullable<ChatMessage['suggestedActions']> => {
    const normalizeText = (value: string) => value.trim().toLowerCase();
    const timeIntentPattern = /\b(trend|over time|time|month|monthly|quarter|quarterly|year|yearly|period|daily|weekly|mom|yoy|qoq)\b/i;
    const scoreGoalAgainstHints = (goal: AnalysisGoalCandidate) => {
        const haystack = `${goal.title} ${goal.description}`.toLowerCase();
        let score = goal.isRecommended ? goal.confidence + 1 : goal.confidence;

        (hints?.preferredGrainColumns ?? []).forEach(term => {
            if (haystack.includes(normalizeText(term))) {
                score += 0.35;
            }
        });
        (hints?.preferredMetricTerms ?? []).forEach(term => {
            if (haystack.includes(normalizeText(term))) {
                score += 0.25;
            }
        });
        (hints?.preferredTimeColumns ?? []).forEach(term => {
            if (haystack.includes(normalizeText(term))) {
                score += 0.35;
            }
        });
        (hints?.preferredBusinessTerms ?? []).forEach(term => {
            if (haystack.includes(normalizeText(term))) {
                score += 0.2;
            }
        });
        if ((hints?.preferredTimeColumns?.length ?? 0) > 0 && timeIntentPattern.test(haystack)) {
            score += 0.45;
        }
        if ((hints?.preferredBusinessTerms?.length ?? 0) > 0 && /\b(value|amount|metric|measure)\b/i.test(haystack)) {
            score -= 0.3;
        }
        (hints?.avoidGrainColumns ?? []).forEach(term => {
            if (haystack.includes(normalizeText(term))) {
                score -= 0.5;
            }
        });

        return score;
    };

    const mapped = (goals ?? [])
        .map(goal => ({
            label: goal.title.length > 32 ? `${goal.title.slice(0, 29).trim()}...` : goal.title,
            action: goal.title,
            score: scoreGoalAgainstHints(goal),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, 3)
        .map(({ label, action }) => ({ label, action }));

    return mapped.length > 0 ? mapped : DEFAULT_REFINE_SUGGESTIONS;
};
