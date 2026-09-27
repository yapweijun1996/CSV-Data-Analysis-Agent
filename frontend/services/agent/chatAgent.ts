import { AiAction } from '../../types';
import { StoreApi } from './types';
import { createChatMessage } from '../../utils/messageState';
import { normalizeSuggestedActionEntry } from '../../utils/suggestedActions';

const LOG_PREFIX = '[ChatAgent]';

const normalizeSuggestedActions = (
    suggestedActions: Extract<AiAction, { type: 'assistant_message' }>['suggestedActions'],
) => {
    if (!Array.isArray(suggestedActions)) {
        return undefined;
    }

    const normalized = suggestedActions
        .map(action => normalizeSuggestedActionEntry(action))
        .filter((action): action is { label: string; action: string } => Boolean(action))
        .slice(0, 3);

    return normalized.length > 0 ? normalized : undefined;
};

export const handleChatAction = (action: AiAction, store: StoreApi) => {
    if (action.type !== 'assistant_message' || !action.message) {
        console.warn(`${LOG_PREFIX} assistant_message chunk ignored because it contained no message.`, action);
        return;
    }

    store.setState(prev => ({
        chatHistory: [
            ...prev.chatHistory,
            createChatMessage({
                sender: 'ai',
                text: action.message,
                timestamp: new Date(),
                type: 'ai_message',
                cardId: action.cardId,
                suggestedActions: normalizeSuggestedActions(action.suggestedActions),
            }),
        ],
    }));
};
