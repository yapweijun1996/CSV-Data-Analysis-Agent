/**
 * The demo gateway validates `/demo/v1/responses` against a strict allowlist
 * (`400 DEMO_FIELD_DISABLED` / `DEMO_INPUT_INVALID` otherwise). Pi replays
 * previous model output verbatim, so each request is reduced to the shapes the
 * gateway accepts at the final browser boundary.
 *
 * Every rule below was confirmed against the live gateway (project
 * `github-pages`). Shapes without a confirmed rule pass through untouched so a
 * wrong guess can never corrupt a request the gateway would accept.
 */

type InputItem = Record<string, unknown>;

const isRecord = (value: unknown): value is InputItem =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const pick = (record: InputItem, fields: readonly string[]): InputItem => {
    const reduced: InputItem = {};
    for (const field of fields) {
        if (record[field] !== undefined) reduced[field] = record[field];
    }
    return reduced;
};

/** Tool results must be a string; arrays of input_text / input_image are rejected. */
export const stringifyToolOutput = (output: unknown): string => {
    if (typeof output === 'string') return output;
    if (Array.isArray(output)) {
        return output.map(part => {
            if (!isRecord(part)) return String(part ?? '');
            if (typeof part.text === 'string') return part.text;
            return part.type === 'input_image' ? '[image omitted]' : '';
        }).filter(Boolean).join('\n');
    }
    return output === undefined || output === null ? '' : JSON.stringify(output);
};

// Assistant output parts allow only type/text/annotations, and annotations must be empty.
const reduceAssistantPart = (part: unknown): unknown => {
    if (!isRecord(part) || part.type !== 'output_text') return part;
    return { type: 'output_text', text: part.text, annotations: [] };
};

const reduceAssistantMessage = (item: InputItem): InputItem => {
    const reduced = pick(item, ['type', 'role', 'id', 'phase']);
    // `phase` is only valid on assistant messages and only with these values.
    if (reduced.phase !== 'commentary' && reduced.phase !== 'final_answer') delete reduced.phase;
    reduced.content = Array.isArray(item.content) ? item.content.map(reduceAssistantPart) : item.content;
    return reduced;
};

const isAssistantMessage = (item: InputItem): boolean =>
    item.role === 'assistant' && (item.type === undefined || item.type === 'message');

const reduceItems = (items: unknown[]): unknown[] => {
    const reduced: unknown[] = [];
    // Function calls that followed a dropped reasoning item lose their fc_ id,
    // otherwise OpenAI rejects a call whose paired reasoning item is missing.
    let reasoningDropped = false;

    for (const item of items) {
        if (!isRecord(item)) {
            reduced.push(item);
            continue;
        }
        if (item.type === 'reasoning') {
            // Replaying reasoning without encrypted_content is rejected, so skip it.
            if (typeof item.encrypted_content !== 'string' || !item.encrypted_content) {
                reasoningDropped = true;
                continue;
            }
            reasoningDropped = false;
            reduced.push({
                ...pick(item, ['type', 'id', 'encrypted_content']),
                summary: Array.isArray(item.summary) ? item.summary : [],
            });
            continue;
        }
        if (item.type === 'function_call') {
            const call = pick(item, ['type', 'id', 'call_id', 'name', 'arguments', 'status']);
            if (reasoningDropped) delete call.id;
            reduced.push(call);
            continue;
        }
        reasoningDropped = false;
        if (item.type === 'function_call_output') {
            reduced.push({ ...pick(item, ['type', 'id', 'call_id', 'status']), output: stringifyToolOutput(item.output) });
            continue;
        }
        reduced.push(isAssistantMessage(item) && item.type === 'message' ? reduceAssistantMessage(item) : item);
    }
    return reduced;
};

/**
 * The upstream model handles a request that ends with an assistant message
 * unreliably (DEMO_UPSTREAM_HTTP_ERROR). The history should end with a user
 * message or a function_call_output; this only reports the shape, it never
 * rewrites the conversation.
 */
export const endsWithAssistantMessage = (input: unknown): boolean => {
    if (!Array.isArray(input) || input.length === 0) return false;
    const last = input[input.length - 1];
    return isRecord(last) && isAssistantMessage(last);
};

export const sanitizeDemoGatewayInput = (body: Record<string, unknown>): Record<string, unknown> => {
    const sanitized: Record<string, unknown> = { ...body };
    if (Array.isArray(body.input)) sanitized.input = reduceItems(body.input);
    // The upstream model rejects top_p (DEMO_UPSTREAM_HTTP_ERROR); the gateway
    // rejects max_output_tokens (DEMO_FIELD_DISABLED, enforced by the caller).
    delete sanitized.top_p;
    return sanitized;
};
