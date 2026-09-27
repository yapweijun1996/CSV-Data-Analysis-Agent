import type { AppState } from '../../../types';
import { createIdleDuckDbSessionStatus } from '../../duckdb/sessionStatus';
import type { StoreApi } from '../types';

type RuntimeMutationRollbackKeys =
    | 'csvData'
    | 'columnProfiles'
    | 'columnRegistry'
    | 'dataPreparationPlan'
    | 'analysisCards'
    | 'finalSummary'
    | 'aiCoreAnalysisSummary'
    | 'contextualSummary'
    | 'activeDataQuery'
    | 'activeSpreadsheetFilter'
    | 'spreadsheetFilterFunction'
    | 'aiFilterExplanation'
    | 'activeMetricMappingValidation'
    | 'queryHistory'
    | 'datasetSemanticSnapshot'
    | 'semanticStatus'
    | 'semanticDatasetVersion'
    | 'duckDbSessionStatus';

export type RuntimeMutationRollbackSnapshot = Pick<AppState, RuntimeMutationRollbackKeys>;

const cloneSnapshotValue = <T>(value: T): T => {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof globalThis.structuredClone === 'function') {
        try {
            return globalThis.structuredClone(value);
        } catch {
            // structuredClone can fail on functions, DOM nodes, etc. — fall through to JSON path.
        }
    }
    if (typeof value !== 'object') {
        return value;
    }
    try {
        return JSON.parse(JSON.stringify(value)) as T;
    } catch (error) {
        console.warn('[RuntimeMutationRollback] Snapshot clone failed, returning original reference:', error);
        return value;
    }
};

export const captureRuntimeMutationRollbackSnapshot = (
    store: StoreApi,
): RuntimeMutationRollbackSnapshot => {
    const state = store.getState();
    return {
        csvData: cloneSnapshotValue(state.csvData),
        columnProfiles: cloneSnapshotValue(state.columnProfiles),
        columnRegistry: cloneSnapshotValue(state.columnRegistry),
        dataPreparationPlan: cloneSnapshotValue(state.dataPreparationPlan),
        analysisCards: cloneSnapshotValue(state.analysisCards),
        finalSummary: cloneSnapshotValue(state.finalSummary),
        aiCoreAnalysisSummary: cloneSnapshotValue(state.aiCoreAnalysisSummary),
        contextualSummary: cloneSnapshotValue(state.contextualSummary),
        activeDataQuery: cloneSnapshotValue(state.activeDataQuery),
        activeSpreadsheetFilter: cloneSnapshotValue(state.activeSpreadsheetFilter),
        spreadsheetFilterFunction: cloneSnapshotValue(state.spreadsheetFilterFunction),
        aiFilterExplanation: cloneSnapshotValue(state.aiFilterExplanation),
        activeMetricMappingValidation: cloneSnapshotValue(state.activeMetricMappingValidation),
        queryHistory: cloneSnapshotValue(state.queryHistory),
        datasetSemanticSnapshot: cloneSnapshotValue(state.datasetSemanticSnapshot),
        semanticStatus: cloneSnapshotValue(state.semanticStatus),
        semanticDatasetVersion: cloneSnapshotValue(state.semanticDatasetVersion),
        duckDbSessionStatus: cloneSnapshotValue(state.duckDbSessionStatus),
    };
};

export const restoreRuntimeMutationRollbackSnapshot = (
    store: StoreApi,
    snapshot: RuntimeMutationRollbackSnapshot,
) => {
    store.setState({
        ...cloneSnapshotValue(snapshot),
        // The backing DuckDB table may already contain the rejected mutation.
        // Force the next query to bind the restored canonical CSV data again.
        duckDbSessionStatus: createIdleDuckDbSessionStatus(),
    });
};
