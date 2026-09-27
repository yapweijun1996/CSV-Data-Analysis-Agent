/**
 * Presentation skill module — composes multi-series detection + upgrade + execution.
 *
 * This module consumes the `analysis.presentation_upgrade` manifest contract.
 * All presentation detection logic flows through here instead of being inline
 * in orchestrators.
 */

import type { AnalysisPlan, CsvRow, ToolExecutionResult } from '../../../types';
import type { StoreApi } from '../types';
import { detectMultiSeriesOpportunity, MIN_MULTI_SERIES_COLUMNS } from '../../../utils/presentationHarness';

export { MIN_MULTI_SERIES_COLUMNS };

export interface MultiSeriesUpgradeResult {
    upgraded: boolean;
    plan: AnalysisPlan;
    numericColumns: string[] | null;
}

/**
 * Pure function: evaluate a plan + data for multi-series upgrade opportunity.
 * Returns the upgraded plan if applicable, or the original plan unchanged.
 */
export const applyMultiSeriesUpgrade = (
    plan: AnalysisPlan,
    data: CsvRow[],
): MultiSeriesUpgradeResult => {
    const opportunity = detectMultiSeriesOpportunity(plan, data);
    if (!opportunity) {
        return { upgraded: false, plan, numericColumns: null };
    }
    return {
        upgraded: true,
        plan: {
            ...plan,
            chartType: 'multi_line',
            artifactMetadata: {
                ...plan.artifactMetadata,
                matrixValueColumns: opportunity.numericColumns,
            },
        },
        numericColumns: opportunity.numericColumns,
    };
};

/**
 * Tool executor for `analysis.presentation_upgrade`.
 * Retrieves a card from state, evaluates for multi-series upgrade, and patches if applicable.
 */
export const executePresentationUpgrade = async (
    args: { cardId: string },
    store: StoreApi,
): Promise<ToolExecutionResult> => {
    const state = store.getState();
    const card = state.analysisCards.find(c => c.id === args.cardId);

    if (!card) {
        return {
            status: 'error',
            toolName: 'analysis.presentation_upgrade',
            message: `Card "${args.cardId}" not found.`,
            shouldStop: false,
        };
    }

    const result = applyMultiSeriesUpgrade(card.plan, card.aggregatedData);

    if (!result.upgraded) {
        return {
            status: 'success',
            toolName: 'analysis.presentation_upgrade',
            message: 'No multi-series upgrade applicable — card already uses multi-series or has fewer than 3 numeric columns.',
            shouldStop: false,
            observation: {
                type: 'tool_result',
                status: 'success',
                summary: 'No upgrade needed.',
                toolName: 'analysis.presentation_upgrade',
            },
        };
    }

    // Patch the card in store with upgraded plan and chart type.
    store.setState(prev => ({
        analysisCards: prev.analysisCards.map(c =>
            c.id === args.cardId
                ? {
                    ...c,
                    plan: result.plan,
                    displayChartType: 'multi_line',
                }
                : c,
        ),
    }));

    return {
        status: 'success',
        toolName: 'analysis.presentation_upgrade',
        message: `Upgraded card "${args.cardId}" to multi_line with ${result.numericColumns!.length} series.`,
        shouldStop: false,
        observation: {
            type: 'tool_result',
            status: 'success',
            summary: `Multi-series upgrade applied: ${result.numericColumns!.join(', ')}.`,
            toolName: 'analysis.presentation_upgrade',
        },
    };
};
