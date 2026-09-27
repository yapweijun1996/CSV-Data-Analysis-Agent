import type { CsvData, DataPreparationPlan } from '../../../types';
import { applyDataOperations, type DataOperationExecutionLog } from './dataOperationRunner';
import { profileDataWithWorker } from '../../workers/dataWorkerClient';
import { throwIfAborted } from '../runtime/runtimeAbort';
import type { StoreApi } from '../types';
import { ensureDuckDbSessionSync } from '../../duckdb/storeSessionSync';
import { createWorkerDiagnosticsTelemetryReporter } from '../../workers/workerDiagnostics';
import { buildColumnRegistry } from '../../data/columnRegistry';

export interface DeterministicMutationExecutionResult {
    data: CsvData;
    logs: DataOperationExecutionLog[];
    rowCountBefore: number;
    rowCountAfter: number;
}

export const executeDeterministicMutationPlan = async (
    plan: DataPreparationPlan,
    store: StoreApi,
    abortSignal?: AbortSignal,
): Promise<DeterministicMutationExecutionResult> => {
    const { getState, setState } = store;
    const currentData = getState().csvData;
    if (!currentData) {
        throw new Error('No cleaned dataset is available for mutation.');
    }
    if (!Array.isArray(plan.operations) || plan.operations.length === 0) {
        throw new Error('Deterministic mutation plan must include at least one operation.');
    }

    const rowCountBefore = currentData.data.length;
    getState().addProgress(`AI is executing deterministic dataset changes: ${plan.explanation}`);

    throwIfAborted(abortSignal);
    const mutationResult = applyDataOperations(currentData.data, plan.operations);
    const nextData = { ...currentData, data: mutationResult.data };
    throwIfAborted(abortSignal);
    const profileResult = await profileDataWithWorker(mutationResult.data, abortSignal);
    throwIfAborted(abortSignal);
    const isCleaningRunActive = getState().cleaningRun?.status === 'running';
    const isRuntimeTurnActive = getState().activeTurn?.status === 'running';
    const existingPlan = getState().dataPreparationPlan;
    const accumulatedOperations = isCleaningRunActive
        ? [...(existingPlan?.operations ?? []), ...plan.operations]
        : plan.operations;

    getState().logAgentToolUsage({
        tool: 'data.mutate',
        description: plan.explanation,
        detail: {
            operations: plan.operations,
            derivedMetricValidations: plan.derivedMetricValidations ?? [],
            logs: mutationResult.logs,
            rowCountBefore,
            rowCountAfter: mutationResult.data.length,
        },
    });

    throwIfAborted(abortSignal);
    const nextRegistry = buildColumnRegistry({
        data: nextData,
        columnProfiles: profileResult.profiles,
        semanticSnapshot: getState().datasetSemanticSnapshot,
        userColumnAnnotations: getState().userColumnAnnotations,
        steering: getState().latestAnalysisSession?.analysisSteering,
        existingRegistry: getState().columnRegistry,
    });
    throwIfAborted(abortSignal);
    setState({
        csvData: nextData,
        columnProfiles: profileResult.profiles,
        columnRegistry: nextRegistry,
        activeDataQuery: null,
        activeSpreadsheetFilter: null,
        spreadsheetFilterFunction: null,
        aiFilterExplanation: null,
        dataPreparationPlan: {
            explanation: plan.explanation,
            operations: accumulatedOperations,
            outputColumns: profileResult.profiles,
            planStatus: 'operations',
            consistencyIssues: [],
            ...(existingPlan?.labelNormalization ? { labelNormalization: existingPlan.labelNormalization } : {}),
            ...(plan.derivedMetricValidations?.length
                ? { derivedMetricValidations: plan.derivedMetricValidations }
                : {}),
        },
    });

    throwIfAborted(abortSignal);
    const duckDbSync = await ensureDuckDbSessionSync(store, nextData, createWorkerDiagnosticsTelemetryReporter(store));
    throwIfAborted(abortSignal);
    if (duckDbSync.status === 'ready') {
        getState().logAgentToolUsage({
            tool: 'duckdb_query_engine',
            description: 'Synced cleaned dataset into DuckDB after permanent mutation.',
            detail: {
                tableName: duckDbSync.tableName,
                loadVersion: duckDbSync.loadVersion,
            },
        });
    } else if (duckDbSync.fallbackStage === 'bind_failed' || duckDbSync.fallbackStage === 'query_failed') {
        getState().logAgentToolUsage({
            tool: 'duckdb_query_engine',
            description: 'DuckDB dataset sync failed after permanent mutation.',
            detail: {
                tableName: duckDbSync.tableName,
                loadVersion: duckDbSync.loadVersion,
                fallbackStage: duckDbSync.fallbackStage,
                error: duckDbSync.fallbackReason,
            },
        });
    }

    if (!isCleaningRunActive && !isRuntimeTurnActive) {
        throwIfAborted(abortSignal);
        await getState().regenerateAnalyses(nextData);
    }

    return {
        data: nextData,
        logs: mutationResult.logs,
        rowCountBefore,
        rowCountAfter: mutationResult.data.length,
    };
};
