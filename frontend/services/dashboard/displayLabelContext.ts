import type { AnalysisPlan, CardContext } from '../../types';
import {
    resolveColumnDisplayLabel,
    resolveDisplayPlanDescription,
    resolveDisplayPlanTitle,
} from './businessLabelResolver';

export type DisplayPlanSource = Pick<AnalysisPlan, 'title' | 'description' | 'groupByColumn' | 'valueColumn'>;

export const resolveDisplayPlanLabels = <T extends DisplayPlanSource>(
    plan: T,
    plans: DisplayPlanSource[] = [plan],
): T => ({
    ...plan,
    title: resolveDisplayPlanTitle(plan),
    description: resolveDisplayPlanDescription(plan),
    groupByColumn: plan.groupByColumn ? resolveColumnDisplayLabel(plan.groupByColumn, plans) : plan.groupByColumn,
    valueColumn: plan.valueColumn ? resolveColumnDisplayLabel(plan.valueColumn, plans) : plan.valueColumn,
});

export const buildDisplayCardContext = (cardContext: CardContext[]): CardContext[] => {
    const plans = cardContext.map(card => ({
        title: card.title,
        description: card.description ?? '',
        groupByColumn: card.groupByColumn,
        valueColumn: card.valueColumn,
    }));

    return cardContext.map(card => {
        const displayPlan = resolveDisplayPlanLabels({
            title: card.title,
            description: card.description ?? '',
            groupByColumn: card.groupByColumn,
            valueColumn: card.valueColumn,
        }, plans);

        return {
            ...card,
            title: displayPlan.title,
            description: displayPlan.description,
            groupByColumn: displayPlan.groupByColumn,
            valueColumn: displayPlan.valueColumn,
        };
    });
};
