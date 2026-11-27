import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';
import { GOOGLE_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS, OPENROUTER_MODELS } from '../../config/modelDefaults';
import { DEFAULT_GATEWAY_MODEL } from '../../config/defaultGatewayConfig';
import type { Settings } from '../../types';

// Reasoning is always on here; 'off' stays available only in Settings.
const EFFORT_LEVELS: NonNullable<Settings['reasoningEffort']>[] = ['low', 'medium', 'high', 'xhigh'];

const selectClass = 'min-h-[44px] max-w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 md:min-h-8';

interface ComposerToolbarProps {
    language: string;
    disabled?: boolean;
    onAddMention: () => void;
}

/** Controls row under the composer textarea: + on the left, model + reasoning level below. */
export const ComposerToolbar: React.FC<ComposerToolbarProps> = ({ language, disabled, onAddMention }) => {
    const settings = useAppStore(state => state.settings);
    const save = useAppStore(state => state.handleSaveSettings);
    const effort = settings.reasoningEffort ?? 'medium';
    const isDefaultGateway = settings.provider === 'default';
    const models: string[] = isDefaultGateway
        ? [DEFAULT_GATEWAY_MODEL]
        : [...({ google: GOOGLE_MODELS, anthropic: ANTHROPIC_MODELS, openrouter: OPENROUTER_MODELS }[settings.provider as string] ?? OPENAI_MODELS)];
    const currentModel = isDefaultGateway ? DEFAULT_GATEWAY_MODEL : settings.simpleModel;
    const modelOptions = models.includes(currentModel) ? models : [currentModel, ...models];

    const update = (patch: Partial<Settings>) => { void save({ ...settings, ...patch }); };

    return (
        <div className="flex min-w-0 flex-1 items-center gap-1.5" data-testid="composer-toolbar">
            <button
                type="button"
                onClick={onAddMention}
                disabled={disabled}
                title="Reference an analysis card (@)"
                aria-label="Reference an analysis card"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-lg text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 md:min-h-8 md:min-w-8"
            >+</button>
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
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
                    {(effort === 'off' ? ['off' as const, ...EFFORT_LEVELS] : EFFORT_LEVELS).map(level => (
                        <option key={level} value={level}>{getTranslation(`settings_reasoning_effort_${level}`, language)}</option>
                    ))}
                </select>
            </span>
        </div>
    );
};
