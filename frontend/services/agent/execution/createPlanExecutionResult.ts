import type { AnalysisCardData, AnalysisPlan, ToolExecutionResult } from '../../../types';
import { resolveDisplayPlanLabels } from '../../dashboard/displayLabelContext';
import type { PlanExecutionSoftErrorCode } from './planExecutionErrors';

const buildCreatePlanRetryHint = (code?: PlanExecutionSoftErrorCode) => {
    switch (code) {
        case 'empty_result':
            return 'Retry analysis.create_plan with broader filters, a less specific slice, or a wider grouping so the query returns rows.';
        case 'duckdb_unavailable':
            return 'Retry analysis.create_plan only after a cleaned dataset is loaded into DuckDB, or use a non-SQL plan path.';
        default:
            return 'Choose a different analysis plan or ask for clarification.';
    }
};

export const buildCreatePlanExecutionResult = (
    plan: AnalysisPlan,
    createdCard: AnalysisCardData | null,
    failure?: { code?: PlanExecutionSoftErrorCode; message?: string; detail?: Record<string, unknown> },
): ToolExecutionResult => {
    const displayPlan = resolveDisplayPlanLabels(plan);
    const detail = {
        requestedTitle: displayPlan.title,
        chartType: plan.chartType,
        groupByColumn: plan.groupByColumn ?? null,
        valueColumn: plan.valueColumn ?? plan.yValueColumn ?? null,
    };

    if (!createdCard) {
        const message = failure?.message || `Plan "${displayPlan.title}" did not create a card.`;
        const retryHint = buildCreatePlanRetryHint(failure?.code);
        return {
            status: 'blocked',
            toolName: 'analysis.create_plan',
            message,
            shouldStop: false,
            retryHint,
            artifacts: detail,
            artifactMetadata: {
                artifactType: 'analysis_card_attempt',
                metricDefinition: plan.valueColumn ?? plan.yValueColumn ?? null,
                grain: plan.groupByColumn ?? null,
                sourceArtifactIds: [],
            },
            observation: {
                type: 'tool_result',
                status: 'blocked',
                summary: message,
                toolName: 'analysis.create_plan',
                code: failure?.code,
                retryHint,
                detail: {
                    ...detail,
                    ...(failure?.detail ?? {}),
                    artifactMetadata: {
                        artifactType: 'analysis_card_attempt',
                        metricDefinition: plan.valueColumn ?? plan.yValueColumn ?? null,
                        grain: plan.groupByColumn ?? null,
                        sourceArtifactIds: [],
                    },
                },
            },
        };
    }

    const successDetail = {
        ...detail,
        createdCardId: createdCard.id,
        createdCardTitle: displayPlan.title,
        rowCount: createdCard.aggregatedData.length,
    };

    return {
        status: 'success',
        toolName: 'analysis.create_plan',
        message: `Created analysis card "${displayPlan.title}".`,
        shouldStop: true,
        artifacts: successDetail,
        artifactMetadata: {
            artifactType: 'analysis_card',
            metricDefinition: plan.valueColumn ?? plan.yValueColumn ?? null,
            grain: plan.groupByColumn ?? null,
            sourceArtifactIds: [createdCard.id],
        },
        observation: {
            type: 'tool_result',
            status: 'success',
            summary: `Created analysis card "${displayPlan.title}" with ${createdCard.aggregatedData.length} rows.`,
            toolName: 'analysis.create_plan',
            detail: {
                ...successDetail,
                artifactMetadata: {
                    artifactType: 'analysis_card',
                    metricDefinition: plan.valueColumn ?? plan.yValueColumn ?? null,
                    grain: plan.groupByColumn ?? null,
                    sourceArtifactIds: [createdCard.id],
                },
            },
        },
    };
};
