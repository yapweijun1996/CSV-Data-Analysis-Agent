
import React, { useState, useEffect, useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { Settings } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { Combobox } from '../ui/Combobox';
import {
    DEFAULT_MAX_AGENT_TURNS,
    DEFAULT_TOOL_OUTPUT_CUTOFF,
    MAX_MAX_AGENT_TURNS,
    MAX_TOOL_OUTPUT_CUTOFF,
    MIN_MAX_AGENT_TURNS,
    MIN_TOOL_OUTPUT_CUTOFF,
} from '../../services/agent/runtime/runtimePolicySettings';
import { getTranslation } from '../../utils/localization';
import { SUPPORTED_APP_LANGUAGES } from '../../utils/localizedText';
import { GOOGLE_MODELS, OPENAI_MODELS, DEFAULT_FALLBACK_MODEL, DEFAULT_GOOGLE_MODEL } from '../../config/modelDefaults';
import { DEFAULT_GATEWAY_MODEL } from '../../config/defaultGatewayConfig';
import { createProviderModel } from '../../services/ai/providerConfig';
import { generateText } from 'ai';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { clearAllLocalBrowserData } from '../../services/storageService';
import { clearCloudAiConsentRuntimeDecisions } from '../../services/privacy/cloudAiConsent';
import { usePwaLifecycle } from '../../hooks/usePwaLifecycle';
import { refreshPwaStorageEstimate } from '../../services/pwa/pwaManager';
import { AgentSkillsSection } from './AgentSkillsSection';

const languages: Settings['language'][] = SUPPORTED_APP_LANGUAGES;
const googleModels = [...GOOGLE_MODELS];
const openAIModels = [...OPENAI_MODELS];
const numericSettingNames = new Set<keyof Pick<Settings, 'maxAgentTurns' | 'toolOutputCutoff'>>(['maxAgentTurns', 'toolOutputCutoff']);
const reasoningEffortLevels: NonNullable<Settings['reasoningEffort']>[] = ['off', 'low', 'medium', 'high'];


export const SettingsModal: React.FC = () => {
    const { isOpen, setIsSettingsModalOpen, onSave, currentSettings } = useAppStore(state => ({
        isOpen: state.isSettingsModalOpen,
        setIsSettingsModalOpen: state.setIsSettingsModalOpen,
        onSave: state.handleSaveSettings,
        currentSettings: state.settings,
    }), shallow);
    const onClose = useCallback(() => setIsSettingsModalOpen(false), [setIsSettingsModalOpen]);

    const [settings, setSettings] = useState<Settings>(currentSettings);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');
    const [testMessage, setTestMessage] = useState<string>('');
    const [showClearConfirmation, setShowClearConfirmation] = useState(false);
    const [isClearingLocalData, setIsClearingLocalData] = useState(false);
    const [clearLocalDataError, setClearLocalDataError] = useState(false);
    const language = settings.language;
    const pwaLifecycle = usePwaLifecycle();
    const dialogRef = useDialogAccessibility<HTMLDivElement>(isOpen, onClose);

    useEffect(() => {
        setSettings(currentSettings);
        setValidationError(null);
        setTestStatus('idle');
        setTestMessage('');
        setShowClearConfirmation(false);
        setIsClearingLocalData(false);
        setClearLocalDataError(false);
        if (isOpen) void refreshPwaStorageEstimate();
    }, [currentSettings, isOpen]);

    const storageUsageLabel = pwaLifecycle.storageUsageBytes === null
        ? getTranslation('settings_storage_usage_unavailable', language)
        : getTranslation('settings_storage_usage_value', language, {
            usage: (pwaLifecycle.storageUsageBytes / (1024 * 1024)).toFixed(1),
            quota: pwaLifecycle.storageQuotaBytes === null
                ? '—'
                : (pwaLifecycle.storageQuotaBytes / (1024 * 1024)).toFixed(0),
        });

    const handleTestConnection = async () => {
        const apiKey = settings.provider === 'default'
            ? 'configured' // the default gateway key is bundled — never blank
            : settings.provider === 'google'
                ? settings.geminiApiKey.trim()
                : settings.openAIApiKey.trim();
        if (!apiKey) {
            setTestStatus('fail');
            setTestMessage(getTranslation('settings_api_key_required_error', language, {
                provider: settings.provider === 'google' ? 'Gemini' : 'OpenAI',
            }));
            return;
        }

        const testModelId = settings.provider === 'default' ? DEFAULT_GATEWAY_MODEL : settings.simpleModel;
        setTestStatus('testing');
        setTestMessage('');
        try {
            const { model } = createProviderModel(
                settings,
                testModelId,
                { requireDataConsent: false },
            );
            const result = await generateText({
                model,
                messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
            });
            if (result.text) {
                setTestStatus('success');
                setTestMessage(getTranslation('settings_test_connection_success', language, { model: testModelId }));
            } else {
                throw new Error('Empty response');
            }
        } catch (err) {
            setTestStatus('fail');
            const errorMsg = err instanceof Error ? err.message : String(err);
            setTestMessage(getTranslation('settings_test_connection_fail', language, { error: errorMsg }));
        }
    };

    if (!isOpen) {
        return null;
    }

    const handleSave = () => {
        if (settings.provider !== 'default') {
            const activeApiKey = settings.provider === 'google'
                ? settings.geminiApiKey.trim()
                : settings.openAIApiKey.trim();
            if (!activeApiKey) {
                setValidationError(getTranslation('settings_api_key_required_error', language, {
                    provider: settings.provider === 'google' ? 'Gemini' : 'OpenAI',
                }));
                return;
            }
        }
        onSave(settings);
        setValidationError(null);
        onClose();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (numericSettingNames.has(name as keyof Pick<Settings, 'maxAgentTurns' | 'toolOutputCutoff'>)) {
            const parsedValue = Number(value);
            if (!Number.isFinite(parsedValue)) {
                return;
            }
            setValidationError(null);
            setSettings(prev => ({ ...prev, [name]: Math.trunc(parsedValue) }));
            return;
        }
        setValidationError(null);
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setValidationError(null);
        setSettings(prev => ({ ...prev, [name]: checked }));
    };

    const handleClearAllLocalData = async () => {
        setIsClearingLocalData(true);
        setClearLocalDataError(false);
        try {
            clearCloudAiConsentRuntimeDecisions();
            await clearAllLocalBrowserData();
            window.location.reload();
        } catch {
            setClearLocalDataError(true);
            setIsClearingLocalData(false);
        }
    };

    const handleProviderChange = (provider: 'google' | 'openai' | 'default') => {
        setValidationError(null);
        setSettings(prev => {
            if (provider === 'google') {
                return {
                    ...prev,
                    provider,
                    simpleModel: DEFAULT_GOOGLE_MODEL,
                    complexModel: DEFAULT_GOOGLE_MODEL,
                    fallbackModel: DEFAULT_FALLBACK_MODEL.google,
                };
            }
            if (provider === 'openai') {
                return {
                    ...prev,
                    provider,
                    simpleModel: 'gpt-5-mini',
                    complexModel: 'gpt-5.2',
                    fallbackModel: DEFAULT_FALLBACK_MODEL.openai,
                };
            }
            // 'default' — model is fixed server-side, not user-selectable.
            return {
                ...prev,
                provider,
                simpleModel: DEFAULT_GATEWAY_MODEL,
                complexModel: DEFAULT_GATEWAY_MODEL,
                fallbackModel: undefined,
            };
        });
    };


    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 bg-opacity-50 p-4"
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-dialog-title"
                tabIndex={-1}
                className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-card border border-slate-200 bg-white shadow-xl sm:max-h-[80vh]"
                onClick={e => e.stopPropagation()}
            >
                <header className="shrink-0 border-b border-slate-200 px-4 py-3">
                    <h2 id="settings-dialog-title" className="text-2xl font-bold text-slate-900">{getTranslation('settings_title', language)}</h2>
                </header>
                
                <div className="flex-grow overflow-y-auto p-4">
                    <div className="space-y-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">
                                {getTranslation('settings_ai_provider', language)}
                            </label>
                            <div className="flex gap-2 rounded-card bg-slate-200 p-1">
                                <button onClick={() => handleProviderChange('default')} className={`min-h-[44px] w-full rounded-md px-1 py-2 text-sm font-medium transition-colors ${settings.provider === 'default' ? 'bg-blue-600 text-white shadow' : 'text-slate-700 hover:bg-slate-300'}`}>
                                    {getTranslation('settings_ai_provider_default_label', language)}
                                </button>
                                <button onClick={() => handleProviderChange('google')} className={`min-h-[44px] w-full rounded-md px-1 py-2 text-sm font-medium transition-colors ${settings.provider === 'google' ? 'bg-blue-600 text-white shadow' : 'text-slate-700 hover:bg-slate-300'}`}>
                                    Google Gemini
                                </button>
                                <button onClick={() => handleProviderChange('openai')} className={`min-h-[44px] w-full rounded-md px-1 py-2 text-sm font-medium transition-colors ${settings.provider === 'openai' ? 'bg-blue-600 text-white shadow' : 'text-slate-700 hover:bg-slate-300'}`}>
                                    OpenAI
                                </button>
                            </div>
                        </div>

                        {settings.provider === 'default' && (
                            <p className="text-xs text-slate-500 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                                {getTranslation('settings_ai_provider_default_hint', language, { model: DEFAULT_GATEWAY_MODEL })}
                            </p>
                        )}

                        {settings.provider === 'google' && (
                            <div>
                                <label htmlFor="geminiApiKey" className="block text-sm font-medium text-slate-700">
                                    {getTranslation('settings_gemini_api_key', language)}
                                </label>
                                <input
                                    type="password"
                                    id="geminiApiKey"
                                    name="geminiApiKey"
                                    value={settings.geminiApiKey}
                                    onChange={handleInputChange}
                                    aria-invalid={validationError ? 'true' : 'false'}
                                    className="mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={getTranslation('settings_enter_api_key', language)}
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    {getTranslation('settings_get_key_from', language, { provider: 'Google AI Studio' })}{' '}
                                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google AI Studio</a>.
                                </p>
                            </div>
                        )}
                        
                        {settings.provider === 'openai' && (
                            <div>
                                <label htmlFor="openAIApiKey" className="block text-sm font-medium text-slate-700">
                                    {getTranslation('settings_openai_api_key', language)}
                                </label>
                                <input
                                    type="password"
                                    id="openAIApiKey"
                                    name="openAIApiKey"
                                    value={settings.openAIApiKey}
                                    onChange={handleInputChange}
                                    aria-invalid={validationError ? 'true' : 'false'}
                                    className="mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={getTranslation('settings_enter_openai_api_key', language)}
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    {getTranslation('settings_get_key_from', language, { provider: 'OpenAI Platform' })}{' '}
                                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">OpenAI Platform</a>.
                                </p>
                            </div>
                        )}

                        <div>
                            <button
                                type="button"
                                onClick={handleTestConnection}
                                disabled={testStatus === 'testing'}
                                className={`min-h-[44px] w-full rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                                    testStatus === 'testing'
                                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                }`}
                            >
                                {testStatus === 'testing'
                                    ? getTranslation('settings_test_connection_testing', language)
                                    : getTranslation('settings_test_connection', language)}
                            </button>
                            {testMessage && (
                                <p className={`mt-1.5 rounded-md border px-3 py-2 text-sm ${
                                    testStatus === 'success'
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : 'border-red-200 bg-red-50 text-red-700'
                                }`}>
                                    {testMessage}
                                </p>
                            )}
                        </div>

                        {validationError && (
                            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {validationError}
                            </p>
                        )}

                        {settings.provider !== 'default' && (
                            <>
                                <div>
                                    <label htmlFor="simpleModel" className="block text-sm font-medium text-slate-700">
                                        {getTranslation('settings_simple_model', language)}
                                    </label>
                                    <Combobox
                                        id="simpleModel"
                                        name="simpleModel"
                                        value={settings.simpleModel}
                                        onChange={handleInputChange}
                                        options={settings.provider === 'google' ? googleModels : openAIModels}
                                        className="mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">
                                        {getTranslation('settings_simple_model_hint', language)}
                                    </p>
                                </div>

                                <div>
                                    <label htmlFor="complexModel" className="block text-sm font-medium text-slate-700">
                                        {getTranslation('settings_complex_model', language)}
                                    </label>
                                    <Combobox
                                        id="complexModel"
                                        name="complexModel"
                                        value={settings.complexModel}
                                        onChange={handleInputChange}
                                        options={settings.provider === 'google' ? googleModels : openAIModels}
                                        className="mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">
                                        {getTranslation('settings_complex_model_hint', language)}
                                    </p>
                                </div>

                                <div>
                                    <label htmlFor="fallbackModel" className="block text-sm font-medium text-slate-700">
                                        {getTranslation('settings_fallback_model', language)}
                                    </label>
                                    <Combobox
                                        id="fallbackModel"
                                        name="fallbackModel"
                                        value={settings.fallbackModel || DEFAULT_FALLBACK_MODEL[settings.provider] || ''}
                                        onChange={handleInputChange}
                                        options={settings.provider === 'google' ? googleModels : openAIModels}
                                        className="mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">
                                        {getTranslation('settings_fallback_model_hint', language)}
                                    </p>
                                </div>
                            </>
                        )}

                        <div>
                            <label htmlFor="reasoningEffort" className="block text-sm font-medium text-slate-700">
                                {getTranslation('settings_reasoning_effort', language)}
                            </label>
                            <select
                                id="reasoningEffort"
                                name="reasoningEffort"
                                value={settings.reasoningEffort ?? 'medium'}
                                onChange={handleInputChange}
                                className="mt-1 block min-h-[44px] w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                            >
                                {reasoningEffortLevels.map(level => (
                                    <option key={level} value={level}>
                                        {getTranslation(`settings_reasoning_effort_${level}`, language)}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-slate-500 mt-1">
                                {getTranslation('settings_reasoning_effort_hint', language)}
                            </p>
                        </div>

                        <div>
                            <label htmlFor="language" className="block text-sm font-medium text-slate-700">
                                {getTranslation('settings_agent_language', language)}
                            </label>
                            <Combobox
                                id="language"
                                name="language"
                                value={settings.language}
                                onChange={handleInputChange}
                                options={languages}
                                className="mt-1 block min-h-[44px] w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                {getTranslation('settings_agent_language_hint', language)}
                            </p>
                        </div>
                        
                        <div className="relative flex items-start">
                            <div className="flex h-6 items-center">
                                <input
                                    id="autoConfirmGoal"
                                    name="autoConfirmGoal"
                                    type="checkbox"
                                    checked={settings.autoConfirmGoal}
                                    onChange={handleCheckboxChange}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                                />
                            </div>
                            <div className="ml-2 space-y-1 text-sm leading-6">
                                <label htmlFor="autoConfirmGoal" className="font-medium text-slate-900">
                                    {getTranslation('settings_auto_confirm_goal', language)}
                                </label>
                                <p className="text-xs text-slate-500">
                                    {getTranslation('settings_auto_confirm_goal_hint', language)}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-card border border-slate-200 bg-slate-50 p-4">
                            <h3 className="text-sm font-semibold text-slate-900">{getTranslation('settings_conversation_limits', language)}</h3>
                            <div className="mt-4 space-y-4">
                                <div>
                                    <label htmlFor="maxAgentTurns" className="block text-sm font-medium text-slate-700">
                                        {getTranslation('settings_max_agent_turns', language)}
                                    </label>
                                    <input
                                        type="number"
                                        id="maxAgentTurns"
                                        name="maxAgentTurns"
                                        min={MIN_MAX_AGENT_TURNS}
                                        max={MAX_MAX_AGENT_TURNS}
                                        value={settings.maxAgentTurns ?? DEFAULT_MAX_AGENT_TURNS}
                                        onChange={handleInputChange}
                                        className="mt-1 block min-h-[44px] w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">
                                        {getTranslation('settings_max_agent_turns_hint', language, { min: MIN_MAX_AGENT_TURNS, max: MAX_MAX_AGENT_TURNS })}
                                    </p>
                                </div>

                                <div>
                                    <label htmlFor="toolOutputCutoff" className="block text-sm font-medium text-slate-700">
                                        {getTranslation('settings_tool_output_cutoff', language)}
                                    </label>
                                    <input
                                        type="number"
                                        id="toolOutputCutoff"
                                        name="toolOutputCutoff"
                                        min={MIN_TOOL_OUTPUT_CUTOFF}
                                        max={MAX_TOOL_OUTPUT_CUTOFF}
                                        value={settings.toolOutputCutoff ?? DEFAULT_TOOL_OUTPUT_CUTOFF}
                                        onChange={handleInputChange}
                                        className="mt-1 block min-h-[44px] w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">
                                        {getTranslation('settings_tool_output_cutoff_hint', language, { min: MIN_TOOL_OUTPUT_CUTOFF, max: MAX_TOOL_OUTPUT_CUTOFF })}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <AgentSkillsSection language={language} />

                        <div className="rounded-card border border-red-200 bg-red-50 p-4">
                            <h3 className="text-sm font-semibold text-slate-950">
                                {getTranslation('settings_local_data_title', language)}
                            </h3>
                            <p className="mt-2 text-xs leading-5 text-slate-700">
                                {getTranslation('settings_local_data_detail', language)}
                            </p>
                            <p className="mt-2 text-xs font-medium text-slate-700">
                                {storageUsageLabel}
                            </p>
                            {!showClearConfirmation ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowClearConfirmation(true);
                                        setClearLocalDataError(false);
                                    }}
                                    className="mt-3 min-h-[44px] rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                                >
                                    {getTranslation('settings_clear_local_data', language)}
                                </button>
                            ) : (
                                <div className="mt-3 rounded-lg border border-red-300 bg-white p-3">
                                    <p className="text-sm leading-6 text-red-900">
                                        {getTranslation('settings_clear_local_data_confirm', language)}
                                    </p>
                                    {clearLocalDataError && (
                                        <p role="alert" className="mt-2 text-sm font-medium text-red-800">
                                            {getTranslation('settings_clear_local_data_error', language)}
                                        </p>
                                    )}
                                    <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row">
                                        <button
                                            type="button"
                                            onClick={() => setShowClearConfirmation(false)}
                                            disabled={isClearingLocalData}
                                            className="min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                        >
                                            {getTranslation('settings_clear_local_data_cancel', language)}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleClearAllLocalData()}
                                            disabled={isClearingLocalData}
                                            className="min-h-[44px] rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                                        >
                                            {isClearingLocalData
                                                ? getTranslation('settings_clear_local_data_clearing', language)
                                                : getTranslation('settings_clear_local_data_action', language)}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <footer className="shrink-0 border-t border-slate-200 px-4 py-3">
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={onClose}
                            className="min-h-[44px] rounded-md bg-slate-200 px-4 py-2 text-sm text-slate-800 transition-colors hover:bg-slate-300"
                        >
                            {getTranslation('settings_cancel', language)}
                        </button>
                        <button
                            onClick={handleSave}
                            className="min-h-[44px] rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                        >
                            {getTranslation('settings_save', language)}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};
