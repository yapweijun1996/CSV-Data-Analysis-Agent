import React from 'react';
import { IconHide } from '../../icons/IconHide';
import { IconSettings } from '../../icons/IconSettings';
import { IconMemory } from '../../icons/IconMemory';
import { IconAi } from '../../icons/IconAi';
import { getTranslation } from '../../utils/localization';

interface ChatPanelHeaderProps {
    language: string;
    isAssistantBusy: boolean;
    showMemoryPanel: boolean;
    showAgentThinking: boolean;
    showSettings: boolean;
    onOpenMemory: () => void;
    onOpenAgent: () => void;
    onOpenSettings: () => void;
    onHidePanel: () => void;
}

export const ChatPanelHeader: React.FC<ChatPanelHeaderProps> = ({
    language,
    isAssistantBusy,
    showMemoryPanel,
    showAgentThinking,
    showSettings,
    onOpenMemory,
    onOpenAgent,
    onOpenSettings,
    onHidePanel,
}) => (
    <div className="relative flex items-center justify-between border-b border-slate-200 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:py-3">
        <h2 className="text-xl font-semibold text-slate-900">{getTranslation('assistant', language)}</h2>
        <div className="flex items-center gap-2">
            {showMemoryPanel && (
                <button
                    onClick={onOpenMemory}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 md:min-h-8 md:min-w-8"
                    title={getTranslation('view_ai_memory', language)}
                    aria-label={getTranslation('view_ai_memory', language)}
                >
                    <IconMemory />
                </button>
            )}
            {showAgentThinking && (
                <button
                    onClick={onOpenAgent}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 md:min-h-8 md:min-w-8"
                    title={getTranslation('view_agent_timeline', language)}
                    aria-label={getTranslation('view_agent_timeline', language)}
                >
                    <IconAi />
                </button>
            )}
            {showSettings && (
                <button
                    onClick={onOpenSettings}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 md:min-h-8 md:min-w-8"
                    title={getTranslation('settings', language)}
                    aria-label={getTranslation('settings', language)}
                >
                    <IconSettings />
                </button>
            )}
            <button
                onClick={onHidePanel}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 md:min-h-8 md:min-w-8"
                title={getTranslation('hide_panel', language)}
                aria-label={getTranslation('hide_panel', language)}
            >
                <IconHide />
            </button>
        </div>
        {isAssistantBusy && (
            <div className="loading-shimmer-bar absolute bottom-0 left-0 right-0 h-0.5 animate-loading-shimmer"></div>
        )}
    </div>
);
