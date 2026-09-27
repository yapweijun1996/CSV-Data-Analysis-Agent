import type { BootstrapConfig, Settings } from '../types';

type NormalizedRuntimeConfig = {
    defaultSettings: Partial<Settings>;
    forceSimpleModel: string | null;
    forceComplexModel: string | null;
    forceFallbackModel: string | null;
    ui: {
        endUserMode: boolean;
        showSettingsButton: boolean;
        showDataWarnings: boolean;
        showAgentThinkingModal: boolean;
        showLongTermMemory: boolean;
        showNewSessionButton: boolean;
        showHistoryButton: boolean;
        showDatabaseButton: boolean;
        showWorkspaceButton: boolean;
        showWorkflowButton: boolean;
        showLogsButton: boolean;
        showChangeGoalButton: boolean;
        showAssistantToggleButton: boolean;
        enableDuckDbQueryEngine: boolean;
    };
};

const defaultConfig: NormalizedRuntimeConfig = {
    defaultSettings: {},
    forceSimpleModel: null,
    forceComplexModel: null,
    forceFallbackModel: null,
    ui: {
        endUserMode: false,
        showSettingsButton: true,
        showDataWarnings: false,
        showAgentThinkingModal: true,
        showLongTermMemory: true,
        showNewSessionButton: true,
        showHistoryButton: true,
        showDatabaseButton: true,
        showWorkspaceButton: true,
        showWorkflowButton: true,
        showLogsButton: true,
        showChangeGoalButton: true,
        showAssistantToggleButton: true,
        enableDuckDbQueryEngine: true,
    },
};

const endUserModeConfig: NormalizedRuntimeConfig['ui'] = {
    ...defaultConfig.ui,
    endUserMode: true,
    showSettingsButton: false,
    showAgentThinkingModal: false,
    showLongTermMemory: false,
    showNewSessionButton: false,
    showDatabaseButton: false,
    showWorkspaceButton: false,
    showWorkflowButton: false,
    showLogsButton: false,
    showChangeGoalButton: false,
};

declare global {
    interface Window {
        __CSV_AGENT_CONFIG__?: BootstrapConfig;
    }
}

const safeWindow = (): Window | undefined => (typeof window === 'undefined' ? undefined : window);

const resolveBoolean = (override: boolean | undefined, fallback: boolean): boolean =>
    override ?? fallback;

const normalizeConfig = (config?: BootstrapConfig | null): NormalizedRuntimeConfig => {
    if (!config) {
        return defaultConfig;
    }
    const endUserMode = config.ui?.endUserMode === true;
    const uiDefaults = endUserMode ? endUserModeConfig : defaultConfig.ui;
    return {
        defaultSettings: { ...(config.defaultSettings ?? {}) },
        forceSimpleModel: config.forceSimpleModel?.trim() || null,
        forceComplexModel: config.forceComplexModel?.trim() || null,
        forceFallbackModel: config.forceFallbackModel?.trim() || null,
        ui: {
            endUserMode,
            showSettingsButton: resolveBoolean(config.ui?.showSettingsButton, uiDefaults.showSettingsButton),
            showDataWarnings: resolveBoolean(config.ui?.showDataWarnings, uiDefaults.showDataWarnings),
            showAgentThinkingModal: resolveBoolean(config.ui?.showAgentThinkingModal, uiDefaults.showAgentThinkingModal),
            showLongTermMemory: resolveBoolean(config.ui?.showLongTermMemory, uiDefaults.showLongTermMemory),
            showNewSessionButton: resolveBoolean(config.ui?.showNewSessionButton, uiDefaults.showNewSessionButton),
            showHistoryButton: resolveBoolean(config.ui?.showHistoryButton, uiDefaults.showHistoryButton),
            showDatabaseButton: resolveBoolean(config.ui?.showDatabaseButton, uiDefaults.showDatabaseButton),
            showWorkspaceButton: resolveBoolean(config.ui?.showWorkspaceButton, uiDefaults.showWorkspaceButton),
            showWorkflowButton: resolveBoolean(config.ui?.showWorkflowButton, uiDefaults.showWorkflowButton),
            showLogsButton: resolveBoolean(config.ui?.showLogsButton, uiDefaults.showLogsButton),
            showChangeGoalButton: resolveBoolean(config.ui?.showChangeGoalButton, uiDefaults.showChangeGoalButton),
            showAssistantToggleButton: resolveBoolean(config.ui?.showAssistantToggleButton, uiDefaults.showAssistantToggleButton),
            enableDuckDbQueryEngine: resolveBoolean(config.ui?.enableDuckDbQueryEngine, uiDefaults.enableDuckDbQueryEngine),
        },
    };
};

let cachedConfig: NormalizedRuntimeConfig | null = null;

export const getRuntimeConfig = (): NormalizedRuntimeConfig => {
    if (cachedConfig) return cachedConfig;
    const win = safeWindow();
    cachedConfig = normalizeConfig(win?.__CSV_AGENT_CONFIG__);
    return cachedConfig;
};

export const __resetRuntimeConfigForTests = (): void => {
    cachedConfig = null;
};

export const getRuntimeDefaultSettings = (): Partial<Settings> => getRuntimeConfig().defaultSettings;

export const getForceSimpleModel = (): string | null => getRuntimeConfig().forceSimpleModel;
export const getForceComplexModel = (): string | null => getRuntimeConfig().forceComplexModel;
export const getForceFallbackModel = (): string | null => getRuntimeConfig().forceFallbackModel;

export const isEndUserMode = (): boolean => getRuntimeConfig().ui.endUserMode;
export const shouldAllowSettingsSurface = (): boolean => getRuntimeConfig().ui.showSettingsButton;
export const shouldAllowAgentThinkingSurface = (): boolean => getRuntimeConfig().ui.showAgentThinkingModal;
export const shouldAllowLongTermMemorySurface = (): boolean => getRuntimeConfig().ui.showLongTermMemory;
export const shouldAllowDatabaseSurface = (): boolean => getRuntimeConfig().ui.showDatabaseButton;
export const shouldAllowWorkspaceSurface = (): boolean => getRuntimeConfig().ui.showWorkspaceButton;
export const shouldAllowWorkflowSurface = (): boolean => getRuntimeConfig().ui.showWorkflowButton;
export const shouldAllowLogsSurface = (): boolean => getRuntimeConfig().ui.showLogsButton;

export const shouldShowSettingsButton = (): boolean => shouldAllowSettingsSurface();
export const shouldShowDataWarnings = (): boolean => getRuntimeConfig().ui.showDataWarnings;
export const shouldShowAgentThinkingModal = (): boolean => shouldAllowAgentThinkingSurface();
export const shouldShowLongTermMemory = (): boolean => shouldAllowLongTermMemorySurface();
export const shouldShowNewSessionButton = (): boolean => getRuntimeConfig().ui.showNewSessionButton;
export const shouldShowHistoryButton = (): boolean => getRuntimeConfig().ui.showHistoryButton;
export const shouldShowDatabaseButton = (): boolean => shouldAllowDatabaseSurface();
export const shouldShowWorkspaceButton = (): boolean => shouldAllowWorkspaceSurface();
export const shouldShowWorkflowButton = (): boolean => shouldAllowWorkflowSurface();
export const shouldShowLogsButton = (): boolean => shouldAllowLogsSurface();
export const shouldShowChangeGoalButton = (): boolean => getRuntimeConfig().ui.showChangeGoalButton;
export const shouldShowAssistantToggleButton = (): boolean => getRuntimeConfig().ui.showAssistantToggleButton;
export const shouldEnableDuckDbQueryEngine = (): boolean => getRuntimeConfig().ui.enableDuckDbQueryEngine;
