import type { AgentEvent, ProgressMessage, QueryTraceEntry, WorkspaceActionHistoryEntry } from '../types';

export const MAX_PROGRESS_MESSAGES = 40;
export const MAX_AGENT_EVENTS = 200;
export const MAX_QUERY_HISTORY = 50;
export const MAX_WORKSPACE_ACTION_HISTORY = 100;
export const MAX_TIMELINE_CHAT_MESSAGES = 120;
export const MAX_TIMELINE_PROGRESS_MESSAGES = 12;

export const trimProgressMessages = (messages: ProgressMessage[]): ProgressMessage[] =>
    messages.slice(-MAX_PROGRESS_MESSAGES);

export const trimAgentEvents = (events: AgentEvent[]): AgentEvent[] =>
    events.slice(-MAX_AGENT_EVENTS);

export const trimQueryHistory = (history: QueryTraceEntry[]): QueryTraceEntry[] =>
    history.slice(-MAX_QUERY_HISTORY);

export const trimWorkspaceActionHistory = (history: WorkspaceActionHistoryEntry[]): WorkspaceActionHistoryEntry[] =>
    history.slice(-MAX_WORKSPACE_ACTION_HISTORY);
