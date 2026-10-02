import type { StateCreator } from 'zustand';
import type { AppStore } from '../useAppStore';
import { Settings } from '../../types';
import { getDefaultSettings, saveSettings } from '../../services/storageService';
import { normalizeRuntimeAccessControlSettings } from '../../services/runtimeAccessControl';
import { normalizeAppLanguage } from '../../utils/localizedText';

// isProviderConfigured is loaded dynamically to keep services/ai/ out of
// the cold-start graph.  The initial isApiKeySet value is false — the
// store's init() sets the correct value before the loading spinner clears.
let _isProviderConfigured: ((s: Settings) => boolean) | null = null;

export interface ISettingsSlice {
    settings: Settings;
    isApiKeySet: boolean;
    handleSaveSettings: (newSettings: Settings) => void;
    setReportTemplate: (template: Settings['reportTemplate']) => void;
}

const defaultSettings = getDefaultSettings();

export const createSettingsSlice: StateCreator<AppStore, [], [], ISettingsSlice> = (set, get) => ({
    settings: defaultSettings,
    isApiKeySet: false,
    handleSaveSettings: async (newSettings) => {
        if (!_isProviderConfigured) {
            const mod = await import('../../services/ai/providerConfig');
            _isProviderConfigured = mod.isProviderConfigured;
        }
        const normalizedSettings: Settings = {
            ...newSettings,
            language: normalizeAppLanguage(newSettings.language),
            runtimeAccessControl: normalizeRuntimeAccessControlSettings(newSettings.runtimeAccessControl),
        };
        const previousSettings = get().settings;
        set({ settings: normalizedSettings, isApiKeySet: _isProviderConfigured(normalizedSettings) });

        // Invalidate provider health cache so the next API call re-validates
        // with the new key/provider settings. Unrelated saves (for example the
        // report template) keep the cached result and avoid an extra LLM call.
        const providerConfig = await import('../../services/ai/providerConfig');
        const connectionChanged = previousSettings.provider !== normalizedSettings.provider
            || previousSettings.simpleModel !== normalizedSettings.simpleModel
            || providerConfig.resolveProviderApiKey(previousSettings) !== providerConfig.resolveProviderApiKey(normalizedSettings);
        if (connectionChanged) {
            providerConfig.invalidateProviderHealthCache();
        }

        void saveSettings(normalizedSettings).catch(error => {
            const message = error instanceof Error ? error.message : String(error);
            get().addProgress(`Failed to save settings: ${message}`, 'error');
        });
    },
    setReportTemplate: (reportTemplate) => {
        const currentSettings = get().settings;
        get().handleSaveSettings({
            ...currentSettings,
            reportTemplate,
        });
    },
});
