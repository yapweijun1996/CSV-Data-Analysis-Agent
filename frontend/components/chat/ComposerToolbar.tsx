import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';
import { GOOGLE_MODELS, OPENAI_MODELS } from '../../config/modelDefaults';
import { DEFAULT_GATEWAY_MODEL } from '../../config/defaultGatewayConfig';
import type { Settings } from '../../types';

const EFFORT_LEVELS: NonNullable<Settings['reasoningEffort']>[] = ['off', 'low', 'medium', 'high', 'xhigh'];
/** Level restored when Reasoning is switched back on after being off. */
const REASONING_ON_DEFAULT: NonNullable<Settings['reasoningEffort']> = 'medium';

const chipBase = 'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors md:min-h-8';
const chipOn = 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100';
const chipOff = 'bg-slate-100 text-slate-500 hover:bg-slate-200';
const selectClass = 'min-h-[44px] max-w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 md:min-h-8';

interface ComposerToolbarProps {
    language: string;
    disabled?: boolean;
    onAddMention: () => void;
}

/** Controls row under the composer textarea: + / Tools / Reasoning on the left, model + effort on the right. */
export const ComposerToolbar: React.FC<ComposerToolbarProps> = ({ language, disabled, onAddMention }) => {
    const settings = useAppStore(state => state.settings);
    const save = useAppStore(state => state.handleSaveSettings);
    const effort = settings.reasoningEffort ?? 'medium';
    const reasoningOn = effort !== 'off';
    const toolsOn = settings.externalToolsEnabled !== false;
    const isDefaultGateway = settings.provider === 'default';
    const models: string[] = isDefaultGateway
        ? [DEFAULT_GATEWAY_MODEL]
        : [...(settings.provider === 'google' ? GOOGLE_MODELS : OPENAI_MODELS)];
    const currentModel = isDefaultGateway ? DEFAULT_GATEWAY_MODEL : settings.simpleModel;
    const modelOptions = models.includes(currentModel) ? models : [currentModel, ...models];

    const update = (patch: Partial<Settings>) => { void save({ ...settings, ...patch }); };

    return (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" data-testid="composer-toolbar">
            <button
                type="button"
                onClick={onAddMention}
                disabled={disabled}
                title="Reference an analysis card (@)"
                aria-label="Reference an analysis card"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-lg text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 md:min-h-8 md:min-w-8"
            >+</button>
            <button
                type="button"
                aria-pressed={toolsOn}
                onClick={() => update({ externalToolsEnabled: !toolsOn })}
                title="Allow the agent to use external (MCP) tools"
                className={`${chipBase} ${toolsOn ? chipOn : chipOff}`}
            >
                <span aria-hidden="true" className="font-mono">&lt;/&gt;</span>Tools
            </button>
            <button
                type="button"
                aria-pressed={reasoningOn}
                onClick={() => update({ reasoningEffort: reasoningOn ? 'off' : REASONING_ON_DEFAULT })}
                title={getTranslation('settings_reasoning_effort_hint', language)}
                className={`${chipBase} ${reasoningOn ? chipOn : chipOff}`}
            >
                <span aria-hidden="true">🧠</span>Reasoning
            </button>
            <span className="flex w-full min-w-0 items-center gap-1.5">
                <select
                    aria-label="Model"
                    value={currentModel}
                    disabled={disabled || isDefaultGateway}
                    onChange={e => update({ simpleModel: e.target.value })}
                    className={`${selectClass} min-w-0 flex-1 truncate`}
                >
                    {modelOptions.map(model => <option key={model} value={model}>{model}</option>)}
                </select>
                <select
                    aria-label={getTranslation('settings_reasoning_effort', language)}
                    value={effort}
                    disabled={disabled}
                    onChange={e => update({ reasoningEffort: e.target.value as Settings['reasoningEffort'] })}
                    className={`${selectClass} w-28 flex-shrink-0`}
                >
                    {EFFORT_LEVELS.map(level => (
                        <option key={level} value={level}>{getTranslation(`settings_reasoning_effort_${level}`, language)}</option>
                    ))}
                </select>
            </span>
        </div>
    );
};
