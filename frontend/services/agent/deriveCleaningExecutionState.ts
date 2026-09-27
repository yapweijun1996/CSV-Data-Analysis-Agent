import type { DataOperation } from '../../types';
import type { AppStore } from '../../store/useAppStore';
import { WORKSPACE_DATASET_CLEAN_CSV } from './workspaceFileUtils';

type DerivedPlanStatus = 'operations' | 'schema_only' | 'inconsistent' | null;

type DerivedCleaningOperation = Pick<DataOperation, 'id' | 'type' | 'reason'>;

export type CleaningExecutionState = {
    hasDatasetEdits: boolean;
    datasetEditCount: number;
    lastDatasetEditAt: string | null;
    lastDatasetEditOperation: 'replace' | 'write' | 'append' | null;
    effectivePlanStatus: DerivedPlanStatus;
    effectiveExplanation: string | null;
    syntheticOperations: DerivedCleaningOperation[];
    staleFailureMessagePresent: boolean;
};

const DATASET_EDIT_OPERATIONS = new Set(['replace', 'write', 'append']);

const isDatasetEdit = (entry: AppStore['workspaceActionHistory'][number]) =>
    entry.path === WORKSPACE_DATASET_CLEAN_CSV
    && entry.success
    && DATASET_EDIT_OPERATIONS.has(entry.operation);

const toSyntheticOperation = (
    entry: { operation: string; message: string; timestamp: Date | string },
    index: number,
): DerivedCleaningOperation => ({
    id: `workspace-${entry.operation}-${entry.timestamp instanceof Date ? entry.timestamp.toISOString() : String(entry.timestamp)}-${index}`,
    type: entry.operation === 'replace'
        ? 'replace_values'
        : entry.operation === 'append'
            ? 'derive_column'
            : 'unpivot_columns',
    reason: entry.message,
});

const deriveDatasetEditsFromToolLogs = (toolLogs: AppStore['agentToolLogs'] | undefined) =>
    (toolLogs ?? [])
        .filter(entry =>
            ['workspace.replace', 'workspace.write', 'workspace.append'].includes(entry.tool)
            && entry.description.startsWith('workspace success:')
            && (entry.detail as { path?: string; success?: boolean } | undefined)?.path === WORKSPACE_DATASET_CLEAN_CSV
            && (entry.detail as { success?: boolean } | undefined)?.success !== false,
        )
        .map(entry => ({
            timestamp: entry.timestamp,
            operation: entry.tool.replace('workspace.', ''),
            message: entry.description,
        }));

export const deriveCleaningExecutionState = (
    state: Pick<AppStore, 'workspaceActionHistory' | 'agentToolLogs' | 'dataPreparationPlan' | 'chatHistory'>,
): CleaningExecutionState => {
    const workspaceEdits = (state.workspaceActionHistory ?? []).filter(isDatasetEdit);
    const datasetEdits = workspaceEdits.length > 0 ? workspaceEdits : deriveDatasetEditsFromToolLogs(state.agentToolLogs);
    const lastDatasetEdit = datasetEdits[datasetEdits.length - 1] ?? null;
    const existingPlan = state.dataPreparationPlan ?? null;
    const hasPlanOperations = (existingPlan?.operations?.length ?? 0) > 0;
    const hasDatasetEdits = datasetEdits.length > 0;
    const effectivePlanStatus: DerivedPlanStatus = existingPlan?.planStatus === 'inconsistent'
        ? 'inconsistent'
        : hasPlanOperations || hasDatasetEdits
            ? 'operations'
            : existingPlan?.planStatus ?? null;
    const effectiveExplanation = existingPlan?.planStatus === 'inconsistent'
        ? existingPlan.explanation ?? null
        : hasPlanOperations || hasDatasetEdits
            ? existingPlan?.explanation ?? 'AI cleaning applied deterministic dataset mutations.'
            : existingPlan?.explanation ?? null;
    const syntheticOperations = hasPlanOperations
        ? []
        : hasDatasetEdits
        ? datasetEdits.map(toSyntheticOperation)
        : [];
    const staleFailureMessagePresent = (state.chatHistory ?? []).some(message =>
        message.type === 'ai_cleaning_failure'
        && message.resolved !== true,
    );

    return {
        hasDatasetEdits,
        datasetEditCount: datasetEdits.length,
        lastDatasetEditAt: lastDatasetEdit
            ? (lastDatasetEdit.timestamp instanceof Date ? lastDatasetEdit.timestamp.toISOString() : String(lastDatasetEdit.timestamp))
            : null,
        lastDatasetEditOperation: lastDatasetEdit && DATASET_EDIT_OPERATIONS.has(lastDatasetEdit.operation)
            ? lastDatasetEdit.operation as 'replace' | 'write' | 'append'
            : null,
        effectivePlanStatus,
        effectiveExplanation,
        syntheticOperations,
        staleFailureMessagePresent,
    };
};
