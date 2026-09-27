import type { AppStore } from '../../../store/useAppStore';
import { AnalysisCardData, CsvData, AnalysisPlan, CsvRow } from '../../../types';
import type { AggregationSpec } from './executors/aggregationCore';
import { executeAggregationWithWorker } from '../../workers/dataWorkerClient';
import { executeNonAggregatingPlan } from './executors/nonAggregatingExecutor';

const executeAggregation = async (
    data: CsvData,
    spec: AnalysisPlan & { _internal_groupByColumns?: string[] }
): Promise<CsvRow[]> => executeAggregationWithWorker(data, spec as AggregationSpec);
import { createNewCard } from './cardCreator';
import { evaluateAggregationQuality } from './aggregationQuality';
import { normalizeAndValidatePlan } from '../../../utils/planValidator';
import { emitAgentEvent } from '../monitoring/agentMonitor';
import { agentMemoryCollector } from '../memory/agentMemoryCollector';
import { PlanExecutionSoftError } from './planExecutionErrors';

type StoreApi = {
    getState: () => AppStore;
    setState: (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;
};

const LOG_PREFIX = '[CardExecutor]';

/**
 * The single, reliable tool for taking an analysis plan, executing it, and creating a card.
 * This includes validation, aggregation, summarization, and state updates.
 * @param plan The analysis plan to execute.
 * @param data The full dataset.
 * @param store The Zustand store API.
 * @returns The created card data, or null if execution failed.
 */
export const executePlanAndCreateCard = async (
    plan: AnalysisPlan,
    data: CsvData,
    store: StoreApi,
    options?: { throwOnSoftFailure?: boolean },
): Promise<AnalysisCardData | null> => {
    console.log(`${LOG_PREFIX} Executing plan: "${plan.title}"`);
    let explorationId: string | null = null;
    try {
        const { getState } = store;

        // Step 1: Validate & Normalize the plan
        const { validPlan, errors } = normalizeAndValidatePlan(plan, getState().columnProfiles);
        if (!validPlan) {
            throw new Error(`Invalid plan: ${errors.join(', ')}`);
        }
        console.log(`${LOG_PREFIX} Plan validated for "${plan.title}".`);
        emitAgentEvent(store, {
            phase: 'planning',
            step: 'plan_validated',
            status: 'done',
            message: `Plan "${plan.title}" validated with groupBy ${validPlan.groupByColumn || 'n/a'} and aggregation ${validPlan.aggregation || 'n/a'}.`,
            detail: {
                groupBy: validPlan.groupByColumn,
                valueColumn: validPlan.valueColumn,
                aggregation: validPlan.aggregation,
            },
        });
        explorationId = agentMemoryCollector.beginExploration({
            planTitle: validPlan.title,
            groupBy: validPlan.groupByColumn ? [validPlan.groupByColumn] : [],
            metric: validPlan.valueColumn ?? validPlan.yValueColumn ?? null,
            aggregation: validPlan.aggregation,
        });

        // Step 2: Execute data aggregation/processing by calling the correct executor
        const isAggregatingPlan = validPlan.chartType !== 'scatter';
        const processedData: CsvRow[] = isAggregatingPlan
            ? await executeAggregation(data, validPlan)
            : executeNonAggregatingPlan(data, validPlan);

        console.log(`${LOG_PREFIX} Data processing complete for plan "${plan.title}". Rows:`, processedData.length);

        if (processedData.length === 0) {
            getState().addProgress(`Plan "${validPlan.title}" resulted in no data. It might be too specific.`, 'error');
            console.warn(`${LOG_PREFIX} Plan "${plan.title}" resulted in no data.`);
            emitAgentEvent(store, {
                phase: 'execution',
                step: 'card_generation',
                status: 'error',
                message: `Plan "${plan.title}" produced no rows.`,
            });
            agentMemoryCollector.completeExploration(explorationId, {
                verdict: 'no_data',
                commentary: 'Plan produced no rows.',
            });
            if (options?.throwOnSoftFailure) {
                throw new PlanExecutionSoftError('empty_result', `Plan "${validPlan.title}" produced no rows.`, {
                    title: validPlan.title,
                    chartType: validPlan.chartType,
                });
            }
            return null;
        }

        // When AI specifies valueColumns (multi-series), map to matrixValueColumns
        // before quality check so aggregationQuality sees the multi-column metadata.
        if (validPlan.valueColumns && validPlan.valueColumns.length >= 2 && !validPlan.artifactMetadata?.matrixValueColumns?.length) {
            validPlan.artifactMetadata = {
                ...validPlan.artifactMetadata,
                matrixValueColumns: validPlan.valueColumns,
            };
        }

        const insights = evaluateAggregationQuality(validPlan, processedData);
        emitAgentEvent(store, {
            phase: 'evaluation',
            step: 'aggregation_result',
            status: 'done',
            message: insights.description,
            detail: {
                metrics: insights.metrics,
                tablePreview: insights.tablePreview,
                columns: insights.columns,
            },
        });
        emitAgentEvent(store, {
            phase: 'evaluation',
            step: 'insight_evaluation',
            status: insights.qualityWarning ? 'error' : 'done',
            message: insights.commentary,
            detail: {
                metrics: insights.metrics,
                qualityWarning: insights.qualityWarning,
            },
        });
        const verdict = insights.qualityWarning
            ? insights.qualityWarning === 'flat_metric'
                ? 'flat_metric'
                : insights.qualityWarning === 'low_value'
                    ? 'noisy'
                    : 'no_data'
            : 'useful';
        agentMemoryCollector.completeExploration(explorationId, {
            verdict,
            qualityWarning: insights.qualityWarning,
            metrics: insights.metrics,
            commentary: insights.commentary,
        });

        // Step 3: Create the card (which includes summary generation, state update, and vector store update)
        // Quality warnings are passed as metadata — they no longer block card creation.
        const qualityWarnings = insights.qualityWarning ? [insights.qualityWarning] : [];
        const card = await createNewCard(validPlan, processedData, store, { qualityWarnings });
        if (card) {
            agentMemoryCollector.markExplorationAsCard(explorationId);
        } else {
            agentMemoryCollector.failExploration(explorationId, 'Card generation returned no data.');
            if (options?.throwOnSoftFailure) {
                throw new PlanExecutionSoftError('no_card_created', `Plan "${validPlan.title}" did not create a card.`, {
                    title: validPlan.title,
                    chartType: validPlan.chartType,
                });
            }
        }
        return card;

    } catch (error) {
        if (error instanceof PlanExecutionSoftError) {
            throw error;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`${LOG_PREFIX} Error executing plan "${plan.title}":`, error);
        store.getState().addProgress(`Error executing plan "${plan.title}": ${errorMessage}`, 'error');
        agentMemoryCollector.failExploration(explorationId, errorMessage);
        return null;
    }
};
