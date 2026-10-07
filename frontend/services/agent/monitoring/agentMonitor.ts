import { keepInitialAnalysisStageFrame } from './analysisStageFrame';
import { AgentEvent, AiTaskStatusMessage } from '../../../types';
import { StoreApi } from '../types';

export type AgentEventPayload = Omit<AgentEvent, 'id' | 'timestamp'> & {
    id?: string;
    timestamp?: Date;
};

export const emitAgentEvent = (store: StoreApi, payload: AgentEventPayload) => {
    const recorder = store.getState().recordAgentEvent;
    if (!recorder) return;
    recorder(payload);
};

export const updateAgentTaskStatus = (store: StoreApi, status: AiTaskStatusMessage | null) => {
    const setter = store.getState().setAiTaskStatus;
    if (!setter) return;
    setter(keepInitialAnalysisStageFrame(store.getState().aiTaskStatus, status));
};
