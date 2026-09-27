/**
 * Parses @[Card Title](cardId) mention tokens from chat messages.
 *
 * Format: @[visible title](internal-card-id)
 * Example: @[Sum Qty by STOCK](card-abc123)
 */

const CARD_MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** Extract all referenced card IDs from a message. */
export const extractMentionedCardIds = (text: string): string[] => {
    const ids: string[] = [];
    for (const match of text.matchAll(CARD_MENTION_RE)) {
        ids.push(match[2]);
    }
    return ids;
};

/**
 * Parse mentions and produce a display-friendly version.
 * Returns { cardIds, displayText } where displayText replaces
 * @[title](id) with @title for user-facing chat bubbles.
 */
export const parseCardMentions = (text: string): {
    cardIds: string[];
    displayText: string;
} => {
    const cardIds: string[] = [];
    const displayText = text.replace(CARD_MENTION_RE, (_match, title: string, id: string) => {
        cardIds.push(id);
        return `@${title}`;
    });
    return { cardIds, displayText };
};
