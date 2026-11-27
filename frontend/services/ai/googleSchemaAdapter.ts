import type { Settings } from '../../types';
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

/**
 * Merges the properties of object alternatives (a discriminated union) into one
 * object. A key that every variant pins to its own enum value (such as an
 * operation's `type`) keeps the union of those values; otherwise the merged
 * object could only ever name the last variant.
 */
const mergeObjectAlternatives = (
    alternatives: Record<string, unknown>[],
    sanitizeProperty: (value: unknown) => unknown,
): Record<string, unknown> => {
    const properties: Record<string, unknown> = {};
    alternatives.forEach(alternative => {
        const rawProperties = isRecord(alternative.properties) ? alternative.properties : {};
        Object.entries(rawProperties).forEach(([key, value]) => {
            const next = sanitizeProperty(value);
            const previous = properties[key];
            if (isRecord(previous) && isRecord(next) && Array.isArray(previous.enum) && Array.isArray(next.enum)
                && previous.type === next.type) {
                properties[key] = { ...next, enum: [...new Set([...previous.enum, ...next.enum])] };
                return;
            }
            properties[key] = next;
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
            return mergeObjectAlternatives(objectAlternatives, sanitizeGoogleSchemaNode);
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

const COMBINATORS = ['anyOf', 'oneOf', 'allOf'] as const;

/**
 * Property names renamed on the wire for the Default demo gateway. `type` is a
 * JSON Schema keyword; it was renamed while diagnosing HTTP 400
 * DEMO_SCHEMA_UNSUPPORTED "JSON Schema property names are invalid", and every
 * schema verified against the live gateway (2026-10-23) sent `kind`, so the
 * rename stays until `type` itself is shown to be accepted. The parsed output
 * is renamed back (restoreGatewayPropertyNames), so callers keep the canonical keys.
 */
export const GATEWAY_PROPERTY_ALIASES: Readonly<Record<string, string>> = {
    type: 'kind',
};

/**
 * The Default demo gateway answers HTTP 400 "JSON Schema field 'anyOf' is not
 * supported" for any combinator in `text.format.schema`. Value-level unions
 * collapse the way the Google adapter already collapses them, so both
 * providers return the same shapes: object variants merge into one object,
 * otherwise the array alternative wins (a scalar-or-list value becomes a list),
 * then the string alternative. Combinators on an object node are left for the
 * OpenAI pass, which drops the "required at least one of" form.
 * A schema whose union cannot collapse without losing meaning needs its own
 * gateway variant instead (see defaultGatewayDataPreparationSchema).
 */
const collapseCombinatorsForGateway = (node: unknown): unknown => {
    if (!isRecord(node)) return node;
    const result: Record<string, unknown> = { ...node };
    if (isRecord(node.properties)) {
        result.properties = Object.fromEntries(
            Object.entries(node.properties).map(([key, value]) => [key, collapseCombinatorsForGateway(value)]),
        );
    }
    if (isRecord(node.items)) {
        result.items = collapseCombinatorsForGateway(node.items);
    }
    const combinator = COMBINATORS.find(key => Array.isArray(node[key]));
    if (!combinator) return result;
    const alternatives = (node[combinator] as unknown[]).map(collapseCombinatorsForGateway).filter(isRecord);
    if (result.type === 'object' || isRecord(result.properties)) {
        result[combinator] = alternatives;
        return result;
    }
    const objectAlternatives = alternatives.filter(candidate => candidate.type === 'object' || isRecord(candidate.properties));
    const chosen = objectAlternatives.length > 0
        ? mergeObjectAlternatives(objectAlternatives, value => value)
        : alternatives.find(candidate => candidate.type === 'array')
            ?? alternatives.find(candidate => candidate.type === 'string')
            ?? alternatives[0]
            ?? { type: 'string' };
    return { ...chosen, ...(typeof node.description === 'string' ? { description: node.description } : {}) };
};

const renamePropertiesForGateway = (node: unknown): unknown => {
    if (!isRecord(node)) return node;
    const result: Record<string, unknown> = { ...node };
    if (isRecord(node.properties)) {
        const keys = Object.keys(node.properties);
        result.properties = Object.fromEntries(Object.entries(node.properties).map(([key, value]) => {
            const alias = GATEWAY_PROPERTY_ALIASES[key];
            if (alias && keys.includes(alias)) {
                throw new Error(`Cannot rename schema property "${key}" to "${alias}" for the demo gateway: the object already has "${alias}".`);
            }
            return [alias ?? key, renamePropertiesForGateway(value)];
        }));
        if (Array.isArray(node.required)) {
            result.required = node.required.map(key => (typeof key === 'string' ? GATEWAY_PROPERTY_ALIASES[key] ?? key : key));
        }
    }
    if (isRecord(node.items)) {
        result.items = renamePropertiesForGateway(node.items);
    }
    return result;
};

/** Walks the parsed output alongside the pre-rename schema and restores renamed keys. */
const restoreGatewayPropertyNames = (value: unknown, node: unknown): unknown => {
    if (!isRecord(node)) return value;
    if (Array.isArray(value)) {
        return isRecord(node.items) ? value.map(item => restoreGatewayPropertyNames(item, node.items)) : value;
    }
    if (!isRecord(value) || !isRecord(node.properties)) return value;
    const properties = node.properties;
    const restored: Record<string, unknown> = {};
    Object.entries(value).forEach(([wireKey, child]) => {
        const original = Object.keys(properties).find(key => (GATEWAY_PROPERTY_ALIASES[key] ?? key) === wireKey) ?? wireKey;
        restored[original] = restoreGatewayPropertyNames(child, properties[original]);
    });
    return restored;
};

/**
 * Prepares a structured-output (`text.format`) schema for the Default demo
 * gateway: combinators collapse, aliased property names are renamed, then the
 * OpenAI strict-mode rules apply. `restore` maps a parsed output back to the
 * canonical property names. Tool parameter schemas keep prepareSchemaForProvider.
 */
export const prepareGatewayStructuredOutputSchema = <T extends Record<string, unknown>>(schema: T) => {
    const collapsed = collapseCombinatorsForGateway(cloneSchema(schema));
    return {
        schema: sanitizeOpenAiSchemaNode(renamePropertiesForGateway(collapsed)) as Record<string, unknown>,
        restore: (value: unknown) => restoreGatewayPropertyNames(value, collapsed),
    };
};

export const prepareSchemaForProvider = <T extends Record<string, unknown>>(
    schema: T,
    provider?: Settings['provider'],
): Record<string, unknown> => {
    const cloned = cloneSchema(schema);
    if (provider === 'google') return sanitizeGoogleSchemaNode(cloned);
    // OpenAI and the OpenAI-compatible 'default' gateway share the same schema
    // shape: inject additionalProperties: false + required: [all keys] on all object nodes.
    return sanitizeOpenAiSchemaNode(cloned) as Record<string, unknown>;
};
