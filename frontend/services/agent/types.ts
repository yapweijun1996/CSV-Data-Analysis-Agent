import type { AppStore } from '../../store/useAppStore';
import type { AgentPhase, AiAction, CorrelationFields, ToolExecutionResult } from '../../types';

export type StoreApi = {
    getState: () => AppStore;
    setState: (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;
};

export type AgentStage =
    | 'received'
    | 'validated'
    | 'llm_request'
    | 'llm_response'
    | 'worker_diagnostics'
    | 'chat'
    | 'context_prepared'
    | 'context_compacted'
    | 'planner_start'
    | 'planner_ready'
    | 'executor_start'
    | 'executor_blocked'
    | 'executor_success'
    | 'executor_error';

export type AgentResult = ToolExecutionResult;

export type MonitorPayload = {
    stage: AgentStage;
    action: AiAction;
    detail?: string;
    isError?: boolean;
    chunkSize?: number;
    phase?: AgentPhase;
} & CorrelationFields;
