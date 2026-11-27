
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import {
    GOOGLE_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS, OPENROUTER_MODELS,
    DEFAULT_FALLBACK_MODEL, DEFAULT_GOOGLE_MODEL,
    DEFAULT_ANTHROPIC_SIMPLE_MODEL, DEFAULT_ANTHROPIC_COMPLEX_MODEL,
    DEFAULT_OPENROUTER_SIMPLE_MODEL, DEFAULT_OPENROUTER_COMPLEX_MODEL,
} from '../../config/modelDefaults';
import { DEFAULT_GATEWAY_MODEL } from '../../config/defaultGatewayConfig';
import { createProviderModel, resolveProviderApiKey, resolveProviderDisplayName } from '../../services/ai/providerConfig';
import { generateText } from 'ai';
import { ModalFrame } from '../ui/ModalFrame';
import {
    BUTTON_PRIMARY_CLASS, BUTTON_SECONDARY_CLASS, BUTTON_SUCCESS_CLASS, FIELD_CLASS, FIELD_ERROR_CLASS,
    HELP_TEXT_CLASS, LABEL_CLASS, OUTLINE_ICON_BUTTON_CLASS,
} from '../ui/formStyles';
import { toast } from '../../services/ui/toastService';
import { IconGear } from '../../icons/IconGear';
import { IconSettings } from '../../icons/IconSettings';
import {
    IconAlertCircle, IconBars, IconBrain, IconChatBubble, IconCheckCircle, IconChevronDown, IconCopy, IconDatabase,
    IconExternalLink, IconEye, IconEyeOff, IconKey, IconLayers, IconLink, IconSave,
} from '../../icons/IconSettingsGlyphs';
import {
    IconProviderAnthropic, IconProviderDefault, IconProviderGoogle, IconProviderOpenAI, IconProviderOpenRouter,
} from '../../icons/IconProviders';
import { IconCheck } from '../../icons/IconCheck';
import { IconLoadingSpinner } from '../../icons/IconLoadingSpinner';
import { clearAllLocalBrowserData } from '../../services/storageService';
import type { IncompleteLocalDataStore } from '../../services/storageService';
import { clearCloudAiConsentRuntimeDecisions } from '../../services/privacy/cloudAiConsent';
import { usePwaLifecycle } from '../../hooks/usePwaLifecycle';
import { refreshPwaStorageEstimate } from '../../services/pwa/pwaManager';
import { AgentSkillsSection } from './AgentSkillsSection';
import { McpServersEntry, McpServersPage } from './McpServersPage';

const languages: Settings['language'][] = SUPPORTED_APP_LANGUAGES;
const googleModels = [...GOOGLE_MODELS];
const openAIModels = [...OPENAI_MODELS];
const anthropicModels = [...ANTHROPIC_MODELS];
const openRouterModels = [...OPENROUTER_MODELS];
const modelOptionsFor = (provider: Settings['provider']): string[] => {
    switch (provider) {
        case 'google': return googleModels;
        case 'anthropic': return anthropicModels;
        case 'openrouter': return openRouterModels;
        default: return openAIModels;
    }
};

type ByokProvider = Exclude<Settings['provider'], 'default'>;
interface ByokKeyField {
    keyName: 'geminiApiKey' | 'openAIApiKey' | 'anthropicApiKey' | 'openRouterApiKey';
    labelKey: string;
    placeholderKey: string;
    linkLabel: string;
    linkUrl: string;
}
// One entry per BYOK provider: which Settings field stores its key and where users get one.
const BYOK_KEY_FIELDS: Record<ByokProvider, ByokKeyField> = {
    google: { keyName: 'geminiApiKey', labelKey: 'settings_gemini_api_key', placeholderKey: 'settings_enter_api_key', linkLabel: 'Google AI Studio', linkUrl: 'https://aistudio.google.com/app/apikey' },
    openai: { keyName: 'openAIApiKey', labelKey: 'settings_openai_api_key', placeholderKey: 'settings_enter_openai_api_key', linkLabel: 'OpenAI Platform', linkUrl: 'https://platform.openai.com/api-keys' },
    anthropic: { keyName: 'anthropicApiKey', labelKey: 'settings_anthropic_api_key', placeholderKey: 'settings_enter_anthropic_api_key', linkLabel: 'Anthropic Console', linkUrl: 'https://console.anthropic.com/settings/keys' },
    openrouter: { keyName: 'openRouterApiKey', labelKey: 'settings_openrouter_api_key', placeholderKey: 'settings_enter_openrouter_api_key', linkLabel: 'OpenRouter', linkUrl: 'https://openrouter.ai/keys' },
};
const PROVIDER_BUTTONS: { id: Settings['provider']; label: string | null; Icon: React.FC<React.SVGProps<SVGSVGElement>> }[] = [
    { id: 'default', label: null, Icon: IconProviderDefault },
    { id: 'google', label: 'Google Gemini', Icon: IconProviderGoogle },
    { id: 'openai', label: 'OpenAI', Icon: IconProviderOpenAI },
    { id: 'anthropic', label: 'Anthropic', Icon: IconProviderAnthropic },
    { id: 'openrouter', label: 'OpenRouter', Icon: IconProviderOpenRouter },
];
// Fields that change which credentials/model a connection test would use; editing one makes an earlier result stale.
const CONNECTION_FIELDS = new Set(['geminiApiKey', 'openAIApiKey', 'anthropicApiKey', 'openRouterApiKey', 'simpleModel', 'complexModel', 'fallbackModel']);
const numericSettingNames = new Set<keyof Pick<Settings, 'maxAgentTurns' | 'toolOutputCutoff'>>(['maxAgentTurns', 'toolOutputCutoff']);
const reasoningEffortLevels: NonNullable<Settings['reasoningEffort']>[] = ['off', 'low', 'medium', 'high', 'xhigh'];


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
    const [view, setView] = useState<'main' | 'mcp'>('main');
    const [showClearConfirmation, setShowClearConfirmation] = useState(false);
    const [isClearingLocalData, setIsClearingLocalData] = useState(false);
    const [clearLocalDataError, setClearLocalDataError] = useState(false);
    const [incompleteStores, setIncompleteStores] = useState<IncompleteLocalDataStore[]>([]);
    const language = settings.language;
    const pwaLifecycle = usePwaLifecycle();
    const [showApiKey, setShowApiKey] = useState(false);
    const testRunRef = useRef(0);
    const isTestingRef = useRef(false);

    useEffect(() => {
        setSettings(currentSettings);
        setView('main');
        setValidationError(null);
        setTestStatus('idle');
        setTestMessage('');
        setShowApiKey(false);
        testRunRef.current += 1;
        isTestingRef.current = false;
        setShowClearConfirmation(false);
        setIsClearingLocalData(false);
        setClearLocalDataError(false);
        setIncompleteStores([]);
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

    // Any edit that changes credentials or models invalidates an in-flight or finished test.
    const invalidateConnectionTest = () => {
        testRunRef.current += 1;
        isTestingRef.current = false;
        setTestStatus('idle');
        setTestMessage('');
    };

    const handleTestConnection = async () => {
        if (isTestingRef.current) return; // block duplicate submissions
        const apiKey = settings.provider === 'default'
            ? 'configured' // the default gateway key is bundled — never blank
            : resolveProviderApiKey(settings).trim();
        if (!apiKey) {
            setTestStatus('fail');
            setTestMessage(getTranslation('settings_api_key_required_error', language, {
                provider: resolveProviderDisplayName(settings.provider),
            }));
            return;
        }

        const runId = ++testRunRef.current;
        isTestingRef.current = true;
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
            if (runId !== testRunRef.current) return;
            if (result.text) {
                setTestStatus('success');
                setTestMessage(getTranslation('settings_test_connection_success', language, { model: testModelId }));
            } else {
                throw new Error('Empty response');
            }
        } catch (err) {
            if (runId !== testRunRef.current) return;
            setTestStatus('fail');
            const errorMsg = err instanceof Error ? err.message : String(err);
            setTestMessage(getTranslation('settings_test_connection_fail', language, { error: errorMsg }));
        } finally {
            if (runId === testRunRef.current) isTestingRef.current = false;
        }
    };

    if (!isOpen) {
        return null;
    }

    const handleSave = () => {
        if (settings.provider !== 'default') {
            const activeApiKey = resolveProviderApiKey(settings).trim();
            if (!activeApiKey) {
                setValidationError(getTranslation('settings_api_key_required_error', language, {
                    provider: resolveProviderDisplayName(settings.provider),
                }));
                return;
            }
        }
        onSave(settings);
        setValidationError(null);
        toast.success(getTranslation('settings_saved', language));
        onClose();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (CONNECTION_FIELDS.has(name)) invalidateConnectionTest();
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
        setIncompleteStores([]);
        try {
            clearCloudAiConsentRuntimeDecisions();
            const result = await clearAllLocalBrowserData();
            if (result.incompleteStores.length > 0) {
                setIncompleteStores(result.incompleteStores);
                setClearLocalDataError(true);
                setIsClearingLocalData(false);
                return;
            }
            window.location.reload();
        } catch {
            setClearLocalDataError(true);
            setIsClearingLocalData(false);
        }
    };

    const handleProviderChange = (provider: Settings['provider']) => {
        if (provider !== settings.provider) invalidateConnectionTest();
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
            if (provider === 'anthropic') {
                return {
                    ...prev,
                    provider,
                    simpleModel: DEFAULT_ANTHROPIC_SIMPLE_MODEL,
                    complexModel: DEFAULT_ANTHROPIC_COMPLEX_MODEL,
                    fallbackModel: DEFAULT_FALLBACK_MODEL.anthropic,
                };
            }
            if (provider === 'openrouter') {
                return {
                    ...prev,
                    provider,
                    simpleModel: DEFAULT_OPENROUTER_SIMPLE_MODEL,
                    complexModel: DEFAULT_OPENROUTER_COMPLEX_MODEL,
                    fallbackModel: DEFAULT_FALLBACK_MODEL.openrouter,
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


    const activeKeyField = settings.provider !== 'default' ? BYOK_KEY_FIELDS[settings.provider] : null;
    const activeKeyValue = activeKeyField ? (settings[activeKeyField.keyName] ?? '') : '';
    const isTesting = testStatus === 'testing';
    const modelOptions = modelOptionsFor(settings.provider);

    const handleCopyApiKey = async () => {
        try {
            await navigator.clipboard.writeText(activeKeyValue);
            toast.success(getTranslation('settings_api_key_copied', language));
        } catch {
            // Clipboard can be blocked (insecure context / permissions); the key stays visible via the toggle.
        }
    };

    const modelRows: { name: 'simpleModel' | 'complexModel' | 'fallbackModel'; labelKey: string; hintKey: string; value: string; Icon: React.FC<React.SVGProps<SVGSVGElement>> }[] = [
        { name: 'simpleModel', labelKey: 'settings_simple_model', hintKey: 'settings_simple_model_hint', value: settings.simpleModel, Icon: IconChatBubble },
        { name: 'complexModel', labelKey: 'settings_complex_model', hintKey: 'settings_complex_model_hint', value: settings.complexModel, Icon: IconBars },
        { name: 'fallbackModel', labelKey: 'settings_fallback_model', hintKey: 'settings_fallback_model_hint', value: settings.fallbackModel || DEFAULT_FALLBACK_MODEL[settings.provider] || '', Icon: IconDatabase },
    ];

    const footer = view === 'mcp' ? (
        <div className="flex justify-end">
            <button type="button" onClick={() => setView('main')} className={BUTTON_PRIMARY_CLASS}>
                {getTranslation('mcp_done', language)}
            </button>
        </div>
    ) : (
        <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className={BUTTON_SECONDARY_CLASS}>
                {getTranslation('settings_cancel', language)}
            </button>
            <button type="button" onClick={handleSave} disabled={isTesting || isClearingLocalData} className={BUTTON_PRIMARY_CLASS}>
                {isClearingLocalData ? <IconLoadingSpinner className="h-4 w-4" /> : <IconSave className="h-4 w-4" aria-hidden="true" />}
                {getTranslation('settings_save', language)}
            </button>
        </div>
    );

    return (
        <ModalFrame
            isOpen={isOpen}
            onClose={onClose}
            titleId="settings-dialog-title"
            title={getTranslation('settings_title', language)}
            icon={<IconGear className="h-6 w-6" />}
            closeLabel={getTranslation('settings_close', language)}
            maxWidthClass={view === 'mcp' ? 'max-w-2xl' : 'max-w-4xl'}
            footer={footer}
        >
            {view === 'mcp' ? <McpServersPage language={language} onBack={() => setView('main')} /> : (
                <div className="space-y-6">
                    <section aria-labelledby="settings-provider-heading" className="space-y-3">
                        <SectionHeading id="settings-provider-heading" icon={<IconLayers className="h-5 w-5" />}>
                            {getTranslation('settings_ai_provider', language)}
                        </SectionHeading>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {PROVIDER_BUTTONS.map(({ id, label, Icon }) => {
                                const selected = settings.provider === id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => handleProviderChange(id)}
                                        className={`relative flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                                            selected
                                                ? 'border-accent-600 bg-accent-600 text-white shadow-sm'
                                                : 'border-slate-300 bg-slate-100 text-slate-800 hover:border-slate-400 hover:bg-slate-200'
                                        }`}
                                    >
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 ring-1 ring-slate-200">
                                            <Icon className={`h-5 w-5 ${id === 'default' ? 'text-accent-600' : ''}`} />
                                        </span>
                                        <span className="min-w-0 truncate">{label ?? getTranslation('settings_ai_provider_default_label', language)}</span>
                                        {selected && (
                                            <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-accent-600 shadow ring-1 ring-accent-600">
                                                <IconCheck className="h-3 w-3" />
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        {settings.provider === 'default' && (
                            <p className={`${HELP_TEXT_CLASS} rounded-lg border border-slate-200 bg-slate-50 px-3 py-2`}>
                                {getTranslation('settings_ai_provider_default_hint', language, { model: DEFAULT_GATEWAY_MODEL })}
                            </p>
                        )}
                    </section>

                    {activeKeyField && (
                        <div className="space-y-2">
                            <label htmlFor={activeKeyField.keyName} className={`${LABEL_CLASS} flex items-center gap-2 text-base font-semibold text-slate-900`}>
                                <IconKey className="h-5 w-5 text-slate-700" aria-hidden="true" />
                                {getTranslation(activeKeyField.labelKey, language)}
                            </label>
                            <div className="flex items-stretch gap-2">
                                <div className="relative min-w-0 flex-1">
                                    <input
                                        type={showApiKey ? 'text' : 'password'}
                                        id={activeKeyField.keyName}
                                        name={activeKeyField.keyName}
                                        value={activeKeyValue}
                                        onChange={handleInputChange}
                                        autoComplete="off"
                                        spellCheck={false}
                                        aria-invalid={validationError ? 'true' : 'false'}
                                        className={`${FIELD_CLASS} pr-12 ${validationError ? FIELD_ERROR_CLASS : ''}`}
                                        placeholder={getTranslation(activeKeyField.placeholderKey, language)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowApiKey(prev => !prev)}
                                        aria-pressed={showApiKey}
                                        aria-label={getTranslation(showApiKey ? 'settings_hide_api_key' : 'settings_show_api_key', language)}
                                        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                                    >
                                        {showApiKey ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handleCopyApiKey()}
                                    disabled={!activeKeyValue}
                                    aria-label={getTranslation('settings_copy_api_key', language)}
                                    className={OUTLINE_ICON_BUTTON_CLASS}
                                >
                                    <IconCopy className="h-5 w-5" />
                                </button>
                            </div>
                            <p className={HELP_TEXT_CLASS}>
                                {getTranslation('settings_get_key_from', language, { provider: activeKeyField.linkLabel })}{' '}
                                <a href={activeKeyField.linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-600 hover:underline">
                                    <IconExternalLink className="h-3.5 w-3.5" aria-hidden="true" />{activeKeyField.linkLabel}
                                </a>
                            </p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={handleTestConnection}
                                disabled={isTesting}
                                aria-busy={isTesting}
                                className={`${BUTTON_SUCCESS_CLASS} min-w-0 flex-1 basis-48`}
                            >
                                {isTesting ? <IconLoadingSpinner className="h-4 w-4" /> : <IconLink className="h-4 w-4" aria-hidden="true" />}
                                {isTesting
                                    ? getTranslation('settings_test_connection_testing', language)
                                    : getTranslation('settings_test_connection', language)}
                            </button>
                            {testStatus === 'success' && (
                                <span role="status" className="inline-flex items-center gap-1.5 rounded-full border border-success-200 bg-success-50 px-3 py-1.5 text-sm font-semibold text-success-700">
                                    <IconCheckCircle className="h-4 w-4" aria-hidden="true" />
                                    {getTranslation('settings_test_connection_ok', language)}
                                </span>
                            )}
                            {testStatus === 'fail' && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-danger-200 bg-danger-50 px-3 py-1.5 text-sm font-semibold text-danger-700">
                                    <IconAlertCircle className="h-4 w-4" aria-hidden="true" />
                                    {getTranslation('settings_test_connection_failed_badge', language)}
                                </span>
                            )}
                        </div>
                        {testMessage && (
                            <p
                                role={testStatus === 'fail' ? 'alert' : 'status'}
                                className={`break-words rounded-lg border px-3 py-2 text-sm ${
                                    testStatus === 'success'
                                        ? 'border-success-200 bg-success-50 text-success-700'
                                        : 'border-danger-200 bg-danger-50 text-danger-700'
                                }`}
                            >
                                {testMessage}
                            </p>
                        )}
                        {validationError && (
                            <p role="alert" className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
                                {validationError}
                            </p>
                        )}
                    </div>

                    {settings.provider !== 'default' && (
                        <section aria-labelledby="settings-models-heading" className="space-y-4 border-t border-slate-200 pt-6">
                            <SectionHeading id="settings-models-heading" icon={<IconSettings className="h-5 w-5" />}>
                                {getTranslation('settings_section_models', language)}
                            </SectionHeading>
                            {modelRows.map(({ name, labelKey, hintKey, value, Icon }) => (
                                <div key={name} className="grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] sm:items-center">
                                    <label htmlFor={name} className={`${LABEL_CLASS} flex items-center gap-2 text-base font-semibold text-slate-900`}>
                                        <Icon className="h-5 w-5 shrink-0 text-slate-600" aria-hidden="true" />
                                        {getTranslation(labelKey, language)}
                                    </label>
                                    <Combobox
                                        id={name}
                                        name={name}
                                        value={value}
                                        onChange={handleInputChange}
                                        options={modelOptions}
                                        className={`${FIELD_CLASS} pr-9`}
                                    />
                                    <p className={`${HELP_TEXT_CLASS} sm:col-span-2 sm:pl-7`}>{getTranslation(hintKey, language)}</p>
                                </div>
                            ))}
                        </section>
                    )}

                    <section aria-labelledby="settings-reasoning-heading" className="space-y-2 border-t border-slate-200 pt-6">
                        <SectionHeading id="settings-reasoning-heading" icon={<IconBrain className="h-5 w-5" />}>
                            <label htmlFor="reasoningEffort">{getTranslation('settings_reasoning_effort', language)}</label>
                        </SectionHeading>
                        <div className="relative">
                            <select
                                id="reasoningEffort"
                                name="reasoningEffort"
                                value={settings.reasoningEffort ?? 'medium'}
                                onChange={handleInputChange}
                                className={`${FIELD_CLASS} appearance-none pr-10`}
                            >
                                {reasoningEffortLevels.map(level => (
                                    <option key={level} value={level}>
                                        {getTranslation(`settings_reasoning_effort_${level}`, language)}
                                    </option>
                                ))}
                            </select>
                            <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                        </div>
                        <p className={HELP_TEXT_CLASS}>{getTranslation('settings_reasoning_effort_hint', language)}</p>
                    </section>

                    <section aria-labelledby="settings-general-heading" className="space-y-4 border-t border-slate-200 pt-6">
                        <SectionHeading id="settings-general-heading" icon={<IconGear className="h-5 w-5" />}>
                            {getTranslation('settings_section_general', language)}
                        </SectionHeading>
                        <div className="space-y-1">
                            <label htmlFor="language" className={LABEL_CLASS}>
                                {getTranslation('settings_agent_language', language)}
                            </label>
                            <Combobox
                                id="language"
                                name="language"
                                value={settings.language}
                                onChange={handleInputChange}
                                options={languages}
                                className={`${FIELD_CLASS} pr-9`}
                            />
                            <p className={HELP_TEXT_CLASS}>{getTranslation('settings_agent_language_hint', language)}</p>
                        </div>

                        <div className="flex items-start gap-3">
                            <input
                                id="autoConfirmGoal"
                                name="autoConfirmGoal"
                                type="checkbox"
                                checked={settings.autoConfirmGoal}
                                onChange={handleCheckboxChange}
                                className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-accent-600 focus:ring-accent-600"
                            />
                            <div className="space-y-1">
                                <label htmlFor="autoConfirmGoal" className={LABEL_CLASS}>
                                    {getTranslation('settings_auto_confirm_goal', language)}
                                </label>
                                <p className={HELP_TEXT_CLASS}>{getTranslation('settings_auto_confirm_goal_hint', language)}</p>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-card border border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-base font-semibold text-slate-900">{getTranslation('settings_conversation_limits', language)}</h3>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1">
                                <label htmlFor="maxAgentTurns" className={LABEL_CLASS}>
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
                                    className={FIELD_CLASS}
                                />
                                <p className={HELP_TEXT_CLASS}>
                                    {getTranslation('settings_max_agent_turns_hint', language, { min: MIN_MAX_AGENT_TURNS, max: MAX_MAX_AGENT_TURNS })}
                                </p>
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="toolOutputCutoff" className={LABEL_CLASS}>
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
                                    className={FIELD_CLASS}
                                />
                                <p className={HELP_TEXT_CLASS}>
                                    {getTranslation('settings_tool_output_cutoff_hint', language, { min: MIN_TOOL_OUTPUT_CUTOFF, max: MAX_TOOL_OUTPUT_CUTOFF })}
                                </p>
                            </div>
                        </div>
                    </section>

                    <AgentSkillsSection language={language} />
                    <McpServersEntry language={language} onOpen={() => setView('mcp')} />

                    <section className="rounded-card border border-danger-200 bg-danger-50 p-4">
                        <h3 className="text-base font-semibold text-slate-950">
                            {getTranslation('settings_local_data_title', language)}
                        </h3>
                        <p className="mt-2 text-[13px] leading-5 text-slate-700">
                            {getTranslation('settings_local_data_detail', language)}
                        </p>
                        <p className="mt-2 text-[13px] font-medium text-slate-700">
                            {storageUsageLabel}
                        </p>
                        {!showClearConfirmation ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setShowClearConfirmation(true);
                                    setClearLocalDataError(false);
                                }}
                                className="mt-3 min-h-[44px] rounded-lg border border-danger-300 bg-white px-3 py-2 text-sm font-semibold text-danger-700 hover:bg-danger-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-500"
                            >
                                {getTranslation('settings_clear_local_data', language)}
                            </button>
                        ) : (
                            <div className="mt-3 rounded-lg border border-danger-300 bg-white p-3">
                                <p className="text-sm leading-6 text-danger-900">
                                    {getTranslation('settings_clear_local_data_confirm', language)}
                                </p>
                                {clearLocalDataError && (
                                    <p role="alert" className="mt-2 text-sm font-medium text-danger-800">
                                        {getTranslation('settings_clear_local_data_error', language)}
                                        {incompleteStores.length > 0 && (
                                            <> {getTranslation('settings_clear_local_data_incomplete_stores', language, {
                                                stores: incompleteStores.map(store =>
                                                    getTranslation(`settings_clear_local_data_store_${store}`, language),
                                                ).join(', '),
                                            })}</>
                                        )}
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
                                        className="min-h-[44px] rounded-lg bg-danger-700 px-3 py-2 text-sm font-semibold text-white hover:bg-danger-800 disabled:opacity-60"
                                    >
                                        {isClearingLocalData
                                            ? getTranslation('settings_clear_local_data_clearing', language)
                                            : getTranslation('settings_clear_local_data_action', language)}
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </ModalFrame>
    );
};

const SectionHeading: React.FC<{ id: string; icon: React.ReactNode; children: React.ReactNode }> = ({ id, icon, children }) => (
    <h3 id={id} className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <span className="shrink-0 text-slate-700" aria-hidden="true">{icon}</span>
        {children}
    </h3>
);
