import type { Settings } from './app';

export interface RuntimeUIConfig {
    endUserMode?: boolean;
    showSettingsButton?: boolean;
    showDataWarnings?: boolean;
    showAgentThinkingModal?: boolean;
    showLongTermMemory?: boolean;
    showNewSessionButton?: boolean;
    showHistoryButton?: boolean;
    showDatabaseButton?: boolean;
    showWorkspaceButton?: boolean;
    showWorkflowButton?: boolean;
    showLogsButton?: boolean;
    showChangeGoalButton?: boolean;
    showAssistantToggleButton?: boolean;
    enableDuckDbQueryEngine?: boolean;
}

export interface BootstrapConfig {
    defaultSettings?: Partial<Settings>;
    ui?: RuntimeUIConfig;
    /** Force the simple model for all AI calls — overrides user settings. */
    forceSimpleModel?: string;
    /** Force the complex model for all AI calls — overrides user settings. */
    forceComplexModel?: string;
    /** Force the fallback model — used when the primary model returns a transient error (e.g. 503). */
    forceFallbackModel?: string;
}
