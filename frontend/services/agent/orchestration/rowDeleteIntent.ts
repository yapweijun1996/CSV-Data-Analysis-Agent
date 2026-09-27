export type RowDeleteIntent =
    | { kind: 'supported' }
    | { kind: 'ambiguous' }
    | { kind: 'ignored' };

const DELETE_VERB_PATTERN = /\b(delete|remove|drop)\b/i;
const ROW_TARGET_PATTERN = /\b(row|rows|record|records|entry|entries)\b/i;
const COLUMN_OR_CELL_PATTERN = /\b(column|columns|cell|cells)\b/i;
const RAW_SNAPSHOT_PATTERN = /\b(raw(?:\s+upload)?\s+snapshot|original\s+upload(?:\s+snapshot)?|raw\s+data\s+snapshot)\b/i;
const ROW_INDEX_PATTERN = /\b(?:row|rows|record|records|entry|entries)\s+(?:#?\d+(?:\s*(?:-|to|,|and)\s*#?\d+)*)\b/i;
const ROW_INDEX_KEYWORD_PATTERN = /\b(?:row\s+)?(?:index|indices|number|numbers|line|lines)\b/i;
const CONDITION_HINT_PATTERN = /\b(where|with|whose|matching|that\s+(?:have|has|are|is))\b|[=<>]/i;
const SPECIAL_ROW_CONDITION_PATTERN = /\b(blank|empty|null|missing)\b/i;

const normalizeVoiceCommand = (message: string) =>
    message
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9'\s]+/g, ' ')
        .replace(/\s+/g, ' ');

export const classifyRowDeleteIntent = (message: string): RowDeleteIntent => {
    if (!DELETE_VERB_PATTERN.test(message) || !ROW_TARGET_PATTERN.test(message)) {
        return { kind: 'ignored' };
    }
    if (COLUMN_OR_CELL_PATTERN.test(message) || RAW_SNAPSHOT_PATTERN.test(message)) {
        return { kind: 'ignored' };
    }
    if (ROW_INDEX_PATTERN.test(message) || ROW_INDEX_KEYWORD_PATTERN.test(message)) {
        return { kind: 'ignored' };
    }

    if (CONDITION_HINT_PATTERN.test(message) || SPECIAL_ROW_CONDITION_PATTERN.test(message)) {
        return { kind: 'supported' };
    }

    return { kind: 'ambiguous' };
};

export const getMutationConfirmationCommand = (message: string): 'confirm' | 'cancel' | null => {
    const normalized = normalizeVoiceCommand(message);
    if (['confirm delete', 'yes delete', 'proceed'].includes(normalized)) {
        return 'confirm';
    }
    if (['cancel delete', "don't delete", 'dont delete', 'stop'].includes(normalized)) {
        return 'cancel';
    }
    return null;
};
