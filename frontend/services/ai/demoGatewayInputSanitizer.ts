/**
 * The demo gateway validates `/demo/v1/responses` input items against a strict
 * allowlist and answers `400 DEMO_FIELD_DISABLED` for anything else. Pi replays
 * previous assistant output verbatim, so replayed items are reduced to the
 * fields the gateway accepts at the final request boundary.
 *
 * Only item types with a *confirmed* allowlist are reduced. Unknown shapes pass
 * through untouched so a wrong guess can never corrupt a request the gateway
 * would have accepted. Extend CONFIRMED_ITEM_FIELDS from the gateway's
 * reported `error.code` / schema, never from assumptions.
 */

type InputItem = Record<string, unknown>;

interface ItemRule {
    /** Fields the gateway accepts for this item type. */
    allowed: readonly string[];
    /** Fields that must exist, with the default used when the client omitted them. */
    defaults?: Record<string, unknown>;
}

// Confirmed live: a reasoning item with `content` is rejected with DEMO_FIELD_DISABLED.
const CONFIRMED_ITEM_FIELDS: Record<string, ItemRule> = {
    reasoning: {
        allowed: ['type', 'id', 'summary', 'encrypted_content'],
        defaults: { summary: [] },
    },
};

const reduceItem = (item: unknown): unknown => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const record = item as InputItem;
    const type = typeof record.type === 'string' ? record.type : undefined;
    const rule = type ? CONFIRMED_ITEM_FIELDS[type] : undefined;
    if (!rule) return item;

    const reduced: InputItem = {};
    for (const field of rule.allowed) {
        if (record[field] !== undefined) reduced[field] = record[field];
    }
    for (const [field, fallback] of Object.entries(rule.defaults ?? {})) {
        const current = reduced[field];
        // A default array also replaces a malformed non-array value.
        const missing = current === undefined || (Array.isArray(fallback) && !Array.isArray(current));
        if (missing) reduced[field] = fallback;
    }
    return reduced;
};

export const sanitizeDemoGatewayInput = (body: Record<string, unknown>): Record<string, unknown> =>
    Array.isArray(body.input) ? { ...body, input: body.input.map(reduceItem) } : body;
