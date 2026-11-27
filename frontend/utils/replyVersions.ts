import type { ChatMessage, ReplyTelemetry, ReplyVersion } from '../types/chat';

/** Snapshot of the reply content that is currently shown at the top level of a message. */
const currentAsVersion = (msg: ChatMessage): ReplyVersion => ({
    text: msg.text,
    timestamp: msg.timestamp,
    ...(msg.cardId ? { cardId: msg.cardId } : {}),
    ...(msg.telemetry ? { telemetry: msg.telemetry } : {}),
});

export const getReplyVersions = (msg: ChatMessage): ReplyVersion[] =>
    msg.versions && msg.versions.length > 0 ? msg.versions : [currentAsVersion(msg)];

export const getReplyVersionIndex = (msg: ChatMessage): number =>
    Math.min(Math.max(msg.versionIndex ?? getReplyVersions(msg).length - 1, 0), getReplyVersions(msg).length - 1);

const withVersion = (msg: ChatMessage, versions: ReplyVersion[], index: number): ChatMessage => {
    const target = versions[index];
    const { cardId: _cardId, telemetry: _telemetry, ...rest } = msg;
    return {
        ...rest,
        text: target.text,
        timestamp: target.timestamp,
        ...(target.cardId ? { cardId: target.cardId } : {}),
        ...(target.telemetry ? { telemetry: target.telemetry as ReplyTelemetry } : {}),
        versions,
        versionIndex: index,
    };
};

/** Adds a regenerated reply as a new version and makes it the active one. */
export const appendReplyVersion = (msg: ChatMessage, version: ReplyVersion): ChatMessage => {
    const versions = [...getReplyVersions(msg), version];
    return withVersion(msg, versions, versions.length - 1);
};

/** Switches the visible reply to another stored version; out-of-range indexes are ignored. */
export const selectReplyVersion = (msg: ChatMessage, index: number): ChatMessage => {
    const versions = getReplyVersions(msg);
    if (!Number.isInteger(index) || index < 0 || index >= versions.length) return msg;
    return withVersion(msg, versions, index);
};

/**
 * While a retry is running, the retried question and its previous answer must not reach the model
 * as history: the retry sends the same question again, so keeping both would duplicate the turn.
 */
export const excludeRetriedTurn = (history: ChatMessage[], retryMessageId: string | null | undefined): ChatMessage[] => {
    if (!retryMessageId) return history;
    const index = history.findIndex(m => m.id === retryMessageId);
    if (index < 0) return history;
    let start = index;
    for (let i = index - 1; i >= 0; i -= 1) {
        if (history[i].sender === 'user' && history[i].type === 'user_message') { start = i; break; }
    }
    return [...history.slice(0, start), ...history.slice(index + 1)];
};
