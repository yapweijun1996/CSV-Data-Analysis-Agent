/**
 * Deterministic chat insight extractor.
 *
 * Periodically scans chat history for user questions and AI findings
 * that reference dataset columns. Produces structured insight documents
 * for vector memory so the AI can recall earlier conversation context.
 *
 * No AI calls — extraction is purely pattern-based.
 */

import type { ChatMessage, ColumnProfile, VectorStoreDocumentMetadata } from '../../../types';

// --- Constants ---

/** Extract insights every N user turns. */
export const INSIGHT_EXTRACT_INTERVAL = 5;

/** Max insights per extraction window to avoid flooding memory. */
const MAX_INSIGHTS_PER_WINDOW = 3;

// --- Types ---

export interface ChatInsightDocument {
    id: string;
    text: string;
    metadata: VectorStoreDocumentMetadata;
}

// --- Helpers ---

const simpleHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
};

const normalize = (text: string) => text.toLowerCase().trim().replace(/\s+/g, ' ');

/** Check if text mentions any column name (case-insensitive). */
const findMentionedColumns = (text: string, columnNames: string[]): string[] => {
    const lower = normalize(text);
    return columnNames.filter(col => lower.includes(normalize(col)));
};

/** Check if text contains numeric comparison language. */
const hasComparisonLanguage = (text: string): boolean =>
    /\b(higher|lower|increase|decrease|more|less|top|bottom|largest|smallest|compared|versus|vs\.?|差异|增长|下降|最高|最低)\b/i.test(text);

/** Check if text contains numeric values (e.g., 45%, $1,234, 0.5). */
const hasNumericValues = (text: string): boolean =>
    /\b\d+[.,]?\d*\s*%|\$\s*[\d,]+\.?\d*|\b\d{2,}[.,]\d+\b/.test(text);

// --- Core logic ---

/** Whether it's time to extract insights based on turn count. */
export const shouldExtractInsights = (
    userTurnCount: number,
    lastExtractedAtTurn: number,
): boolean => userTurnCount - lastExtractedAtTurn >= INSIGHT_EXTRACT_INTERVAL;

/**
 * Extract chat insights from the recent window of chat history.
 *
 * Strategy:
 * 1. Take messages since `lastExtractedAtTurn`
 * 2. Find user messages referencing column names
 * 3. Find AI messages with findings (numeric values or comparisons)
 * 4. Group by mentioned column → one insight per topic
 * 5. Deduplicate against existing insight IDs
 */
export const extractChatInsights = (
    chatHistory: ChatMessage[],
    columnProfiles: ColumnProfile[],
    existingInsightIds: Set<string>,
    lastExtractedAtTurn = 0,
): ChatInsightDocument[] => {
    if (chatHistory.length === 0 || columnProfiles.length === 0) return [];

    const columnNames = columnProfiles.map(c => c.name);

    // Count user turns to determine the extraction window
    let userTurnIndex = 0;
    const windowStart = chatHistory.findIndex(msg => {
        if (msg.sender === 'user') userTurnIndex++;
        return userTurnIndex > lastExtractedAtTurn;
    });
    if (windowStart < 0) return [];

    const window = chatHistory.slice(windowStart);
    const currentUserTurnCount = chatHistory.filter(m => m.sender === 'user').length;

    // Collect user questions and AI findings in the window
    const topicMap = new Map<string, { userQuestions: string[]; aiFindings: string[]; turnStart: number; turnEnd: number }>();

    let windowUserTurn = lastExtractedAtTurn;
    for (const msg of window) {
        const text = msg.text ?? '';
        if (msg.sender === 'user') {
            windowUserTurn++;
            const type = msg.type ?? 'user_message';
            if (type !== 'user_message') continue;

            const mentioned = findMentionedColumns(text, columnNames);
            for (const col of mentioned) {
                const entry = topicMap.get(col) ?? { userQuestions: [], aiFindings: [], turnStart: windowUserTurn, turnEnd: windowUserTurn };
                entry.userQuestions.push(text.length > 200 ? text.slice(0, 200) + '...' : text);
                entry.turnEnd = windowUserTurn;
                topicMap.set(col, entry);
            }
        } else if (msg.sender === 'ai') {
            const type = msg.type ?? 'ai_message';
            if (type !== 'ai_message') continue;
            if (!hasComparisonLanguage(text) && !hasNumericValues(text)) continue;

            const mentioned = findMentionedColumns(text, columnNames);
            for (const col of mentioned) {
                const entry = topicMap.get(col) ?? { userQuestions: [], aiFindings: [], turnStart: windowUserTurn, turnEnd: windowUserTurn };
                // Take first sentence or first 200 chars as the finding
                const firstSentence = text.match(/^[^.!?]*[.!?]/)?.[0] ?? text.slice(0, 200);
                entry.aiFindings.push(firstSentence.trim());
                entry.turnEnd = windowUserTurn;
                topicMap.set(col, entry);
            }
        }
    }

    // Build insight documents from topics with at least a user question or AI finding
    const insights: ChatInsightDocument[] = [];

    for (const [column, topic] of topicMap) {
        if (topic.userQuestions.length === 0 && topic.aiFindings.length === 0) continue;

        const contentKey = `${column}:${topic.turnStart}-${topic.turnEnd}`;
        const id = `chat-insight-${simpleHash(contentKey)}`;
        if (existingInsightIds.has(id)) continue;

        const lines = [`[Chat Insight] ${column} analysis`];
        if (topic.userQuestions.length > 0) {
            lines.push(`User question: ${topic.userQuestions[0]}`);
        }
        if (topic.aiFindings.length > 0) {
            lines.push(`AI finding: ${topic.aiFindings[0]}`);
        }
        lines.push(`Turns: ${topic.turnStart}-${topic.turnEnd}`);

        insights.push({
            id,
            text: lines.join('\n'),
            metadata: {
                kind: 'chat_insight',
                memoryFormatVersion: 'ir-v1',
                extractedAtTurn: topic.turnEnd,
                extractedAt: new Date().toISOString(),
            },
        });

        if (insights.length >= MAX_INSIGHTS_PER_WINDOW) break;
    }

    return insights;
};
