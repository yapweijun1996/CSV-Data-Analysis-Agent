import type { Settings } from '../../types';
import { getRuntimeDefaultSettings, getForceSimpleModel, getForceComplexModel, getForceFallbackModel } from '../../config/runtimeConfig';
import { DEFAULT_GATEWAY_MODEL } from '../../config/defaultGatewayConfig';
import { normalizeRuntimePolicySettings } from '../agent/runtime/runtimePolicySettings';
import { createDefaultRuntimeAccessControl, normalizeRuntimeAccessControlSettings } from '../runtimeAccessControl';
import { normalizeAppLanguage } from '../../utils/localizedText';
import { SETTINGS_KEY, SETTINGS_RECORD_KEY, SETTINGS_STORE_NAME, StorageOperationError, getDb } from './connection';

// key needed) rather than 'google' — a brand-new visitor with no localStorage
// state yet should be able to try the app (including "Load Demo Data") with
// zero setup. isApiKeySet derives from isProviderConfigured(), which treats
// 'default' as always configured.
export const staticDefaultSettings: Settings = {
    provider: 'default',
    geminiApiKey: '',
    openAIApiKey: '',
    anthropicApiKey: '',
    openRouterApiKey: '',
    simpleModel: DEFAULT_GATEWAY_MODEL,
    complexModel: DEFAULT_GATEWAY_MODEL,
    reasoningEffort: 'medium',
    language: 'English',
    reportTemplate: 'management_review',
    autoConfirmGoal: true,
    runtimeAccessControl: createDefaultRuntimeAccessControl(),
    ...normalizeRuntimePolicySettings({}),
};

/** Apply deployment-level model overrides from __CSV_AGENT_CONFIG__. */
export const applyForceModelOverrides = (settings: Settings): Settings => {
    const forceSimple = getForceSimpleModel();
    const forceComplex = getForceComplexModel();
    const forceFallback = getForceFallbackModel();
    if (!forceSimple && !forceComplex && !forceFallback) return settings;
    return {
        ...settings,
        ...(forceSimple ? { simpleModel: forceSimple } : {}),
        ...(forceComplex ? { complexModel: forceComplex } : {}),
        ...(forceFallback ? { fallbackModel: forceFallback } : {}),
    };
};

export const getDefaultSettings = (): Settings => applyForceModelOverrides({
    ...staticDefaultSettings,
    ...getRuntimeDefaultSettings(),
});

export const normalizeStoredSettings = (settings: Partial<Settings> & { model?: string; apiKey?: string }): Partial<Settings> => {
    const normalizedSettings = { ...settings };
    // Before the keyless Default provider existed, Google was the app default.
    // A persisted Google selection without a Gemini key therefore represents
    // legacy setup state, not a usable provider choice. Migrate only that
    // unconfigured state; users who supplied a Gemini key keep Google selected.
    if (
        normalizedSettings.provider === 'google'
        && !String(normalizedSettings.geminiApiKey ?? '').trim()
    ) {
        normalizedSettings.provider = 'default';
    }
    if (normalizedSettings.provider === 'default') {
        normalizedSettings.simpleModel = DEFAULT_GATEWAY_MODEL;
        normalizedSettings.complexModel = DEFAULT_GATEWAY_MODEL;
        normalizedSettings.fallbackModel = undefined;
    }
    if (normalizedSettings.model) {
        normalizedSettings.simpleModel = normalizedSettings.model;
        normalizedSettings.complexModel = normalizedSettings.model;
        delete normalizedSettings.model;
    }
    if (normalizedSettings.apiKey) {
        delete normalizedSettings.apiKey;
    }
    normalizedSettings.language = normalizeAppLanguage(normalizedSettings.language);
    normalizedSettings.runtimeAccessControl = normalizeRuntimeAccessControlSettings(normalizedSettings.runtimeAccessControl);
    Object.assign(normalizedSettings, normalizeRuntimePolicySettings(normalizedSettings));
    return normalizedSettings;
};

export const readLegacyLocalStorageSettings = (): Settings | null => {
    try {
        const settingsJson = localStorage.getItem(SETTINGS_KEY);
        if (!settingsJson) {
            return null;
        }

        const savedSettings = JSON.parse(settingsJson);
        const normalizedSettings = normalizeStoredSettings(savedSettings);
        localStorage.removeItem(SETTINGS_KEY);
        return { ...getDefaultSettings(), ...normalizedSettings };
    } catch (error) {
        console.error('Failed to migrate settings from localStorage:', error);
        return null;
    }
};

export const saveSettings = async (settings: Settings): Promise<void> => {
    try {
        const db = await getDb();
        const normalizedSettings: Settings = {
            ...getDefaultSettings(),
            ...normalizeStoredSettings(settings),
        };
        await db.put(SETTINGS_STORE_NAME, {
            key: SETTINGS_RECORD_KEY,
            settings: normalizedSettings,
        });
    } catch (error) {
        console.error('Failed to save settings to IndexedDB:', error);
        throw new StorageOperationError('saveSettings', error);
    }
};

export const getSettings = async (): Promise<Settings> => {
    const runtimeAwareDefaults = getDefaultSettings();
    try {
        const db = await getDb();
        const savedSettingsRecord = await db.get(SETTINGS_STORE_NAME, SETTINGS_RECORD_KEY);
        if (savedSettingsRecord?.settings) {
            const normalizedSettings = normalizeStoredSettings(savedSettingsRecord.settings);
            return applyForceModelOverrides({ ...runtimeAwareDefaults, ...normalizedSettings });
        }

        const legacySettings = readLegacyLocalStorageSettings();
        if (legacySettings) {
            await saveSettings(legacySettings);
            return applyForceModelOverrides(legacySettings);
        }
    } catch (error) {
        console.error('Failed to get settings from IndexedDB:', error);
    }
    return runtimeAwareDefaults;
};
