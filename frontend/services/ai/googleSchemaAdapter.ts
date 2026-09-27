const cloneSchema = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const inferEnumType = (values: unknown[]): 'string' | 'number' | 'boolean' | null => {
    if (values.length === 0) return null;
    if (values.every(value => typeof value === 'string')) return 'string';
    if (values.every(value => typeof value === 'number')) return 'number';
    if (values.every(value => typeof value === 'boolean')) return 'boolean';
    return null;
};

const mergeObjectAlternatives = (alternatives: Record<string, unknown>[]): Record<string, unknown> => {
    const properties: Record<string, unknown> = {};
    alternatives.forEach(alternative => {
        const rawProperties = isRecord(alternative.properties) ? alternative.properties : {};
        Object.entries(rawProperties).forEach(([key, value]) => {
            properties[key] = sanitizeGoogleSchemaNode(value);
        });
    });
    return {
        type: 'object',
        properties,
    };
};

const sanitizeGoogleSchemaNode = (node: unknown): Record<string, unknown> => {
    if (!isRecord(node)) {
        return { type: 'string' };
    }

    const description = typeof node.description === 'string' ? node.description : undefined;
    const enumValues = Array.isArray(node.enum) ? node.enum.filter(value => value !== undefined) : undefined;
    const inferredEnumType = enumValues ? inferEnumType(enumValues) : null;
    const type = typeof node.type === 'string' ? node.type : inferredEnumType;
    const hasObjectShape = type === 'object' || isRecord(node.properties);
    const combinators = [node.anyOf, node.oneOf, node.allOf].find(Array.isArray) as unknown[] | undefined;

    if (combinators?.length && !hasObjectShape) {
        const sanitizedAlternatives = combinators
            .map(candidate => sanitizeGoogleSchemaNode(candidate))
            .filter(isRecord);
        const objectAlternatives = sanitizedAlternatives.filter(candidate =>
            candidate.type === 'object' || isRecord(candidate.properties),
        );
        if (objectAlternatives.length > 0) {
            return mergeObjectAlternatives(objectAlternatives);
        }
        const arrayAlternative = sanitizedAlternatives.find(candidate => candidate.type === 'array');
        if (arrayAlternative) {
            return arrayAlternative;
        }
        const stringAlternative = sanitizedAlternatives.find(candidate => candidate.type === 'string');
        if (stringAlternative) {
            return stringAlternative;
        }
        return sanitizedAlternatives[0] ?? { type: 'string' };
    }

    if (hasObjectShape) {
        const rawProperties = isRecord(node.properties) ? node.properties : {};
        const properties = Object.fromEntries(
            Object.entries(rawProperties).map(([key, value]) => [key, sanitizeGoogleSchemaNode(value)]),
        );
        const required = Array.isArray(node.required)
            ? node.required.filter((key): key is string => typeof key === 'string' && key in properties)
            : [];
        return {
            type: 'object',
            ...(description ? { description } : {}),
            properties,
            ...(required.length > 0 ? { required } : {}),
        };
    }

    if (type === 'array' || 'items' in node) {
        return {
            type: 'array',
            ...(description ? { description } : {}),
            items: sanitizeGoogleSchemaNode(node.items),
        };
    }

    if (type === 'string' || type === 'number' || type === 'integer' || type === 'boolean') {
        return {
            type,
            ...(description ? { description } : {}),
            ...(enumValues ? { enum: enumValues } : {}),
        };
    }

    return {
        type: 'string',
        ...(description ? { description } : {}),
    };
};

/**
 * OpenAI structured output requires on every object node:
 *   1. additionalProperties: false
 *   2. required: [every key in properties]
 * It also does NOT support combinators (anyOf/oneOf/allOf) on object nodes that
 * already have properties — those are typically "required-at-least-one" constraints
 * which become redundant once we force all keys into required.
 * Recursively sanitize so individual schemas don't need to remember.
 */
const isRequiredOnlyCombinator = (items: unknown[]): boolean =>
    items.every(item => {
        if (!isRecord(item)) return false;
        const keys = Object.keys(item);
        return keys.length === 1 && keys[0] === 'required';
    });

const sanitizeOpenAiSchemaNode = (node: unknown): unknown => {
    if (!isRecord(node)) return node;
    const result: Record<string, unknown> = { ...node };

    // Strip unsupported keywords that OpenAI rejects
    delete result.minLength;
    delete result.maxLength;
    delete result.minimum;
    delete result.maximum;
    delete result.minItems;
    delete result.maxItems;
    delete result.pattern;
    delete result.format;

    // OpenAI requires every schema node to have a 'type'.
    // Bare `{}` (any-type) nodes default to string.
    const hasCombinator = ['anyOf', 'oneOf', 'allOf'].some(c => Array.isArray(node[c]));
    if (!node.type && !isRecord(node.properties) && !hasCombinator) {
        result.type = 'string';
    }

    if (node.type === 'object' || isRecord(node.properties)) {
        result.additionalProperties = false;
        if (isRecord(node.properties)) {
            const propEntries = Object.entries(node.properties);
            result.properties = Object.fromEntries(
                propEntries.map(([key, value]) => [key, sanitizeOpenAiSchemaNode(value)]),
            );
            // OpenAI requires ALL property keys in required
            result.required = propEntries.map(([key]) => key);
        } else {
            // Bare { type: 'object' } without properties — OpenAI needs empty properties + required
            result.properties = {};
            result.required = [];
        }

        // Strip combinators used as conditional-required on object nodes
        // (e.g., anyOf: [{ required: ['predicates'] }, { required: ['groups'] }])
        // These are redundant now that all keys are required.
        for (const combinator of ['anyOf', 'oneOf', 'allOf'] as const) {
            if (Array.isArray(result[combinator]) && isRequiredOnlyCombinator(result[combinator] as unknown[])) {
                delete result[combinator];
            }
        }
        // Also strip description from object nodes — OpenAI may reject it at root level
        // (keep it at property level though)
    }

    if (node.type === 'array' && node.items) {
        result.items = sanitizeOpenAiSchemaNode(node.items);
    }

    // OpenAI only supports anyOf — convert oneOf and allOf to anyOf
    if (Array.isArray(result.oneOf)) {
        result.anyOf = [...(Array.isArray(result.anyOf) ? result.anyOf as unknown[] : []), ...(result.oneOf as unknown[])];
        delete result.oneOf;
    }
    if (Array.isArray(result.allOf)) {
        result.anyOf = [...(Array.isArray(result.anyOf) ? result.anyOf as unknown[] : []), ...(result.allOf as unknown[])];
        delete result.allOf;
    }

    // Recurse into anyOf (the only combinator OpenAI supports)
    if (Array.isArray(result.anyOf)) {
        result.anyOf = (result.anyOf as unknown[]).map(sanitizeOpenAiSchemaNode);
    }

    return result;
};

export const prepareSchemaForProvider = <T extends Record<string, unknown>>(
    schema: T,
    provider?: 'google' | 'openai' | 'default',
): Record<string, unknown> => {
    const cloned = cloneSchema(schema);
    if (provider === 'google') return sanitizeGoogleSchemaNode(cloned);
    // OpenAI and the OpenAI-compatible 'default' gateway share the same schema
    // shape: inject additionalProperties: false + required: [all keys] on all object nodes.
    return sanitizeOpenAiSchemaNode(cloned) as Record<string, unknown>;
};
