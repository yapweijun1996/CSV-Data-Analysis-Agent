/**
 * Canonical ID generator for the entire application.
 * Prefers crypto.randomUUID() for collision resistance; falls back to timestamp + random.
 */
export const createId = (prefix: string): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};
