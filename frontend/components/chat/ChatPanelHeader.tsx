import React from 'react';
import { IconHide } from '../../icons/IconHide';
import { IconSettings } from '../../icons/IconSettings';
import { IconMemory } from '../../icons/IconMemory';
import { IconAi } from '../../icons/IconAi';
import { chatIconButton } from './chatControlStyles';
import { getTranslation } from '../../utils/localization';

interface ChatPanelHeaderProps {
    language: string;
    isAssistantBusy: boolean;
    showMemoryPanel: boolean;
    showAgentThinking: boolean;
    showSettings: boolean;
    showPiBrowserLab: boolean;
    onOpenMemory: () => void;
    onOpenAgent: () => void;
    onOpenSettings: () => void;
    onOpenPiBrowserLab: () => void;
    onHidePanel: () => void;
}

export const ChatPanelHeader: React.FC<ChatPanelHeaderProps> = ({
    language,
    isAssistantBusy,
    showMemoryPanel,
    showAgentThinking,
    showSettings,
    showPiBrowserLab,
    onOpenMemory,
    onOpenAgent,
    onOpenSettings,
    onOpenPiBrowserLab,
    onHidePanel,
}) => (
    <div className="relative flex shrink-0 items-center justify-between border-b border-slate-200 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:h-[40px] md:py-0">
        <h2 className="text-xl font-semibold text-slate-900 md:text-base">{getTranslation('assistant', language)}</h2>
        <div className="flex items-center gap-2">
            {showPiBrowserLab && (
                <button type="button" data-pi-browser-lab-trigger="true" onClick={onOpenPiBrowserLab}
                    className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    aria-label="Open Pi Browser Lab" title="Open Pi Browser Lab">Pi Lab</button>
            )}
            {showMemoryPanel && (
                <button
                    onClick={onOpenMemory}
                    className={chatIconButton}
                    title={getTranslation('view_ai_memory', language)}
                    aria-label={getTranslation('view_ai_memory', language)}
                >
                    <IconMemory />
                </button>
            )}
            {showAgentThinking && (
                <button
                    onClick={onOpenAgent}
                    className={chatIconButton}
                    title={getTranslation('view_agent_timeline', language)}
                    aria-label={getTranslation('view_agent_timeline', language)}
                >
                    <IconAi />
                </button>
            )}
            {showSettings && (
                <button
                    onClick={onOpenSettings}
                    className={chatIconButton}
                    title={getTranslation('settings', language)}
                    aria-label={getTranslation('settings', language)}
                >
                    <IconSettings />
                </button>
            )}
            <button
                onClick={onHidePanel}
                className={chatIconButton}
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
