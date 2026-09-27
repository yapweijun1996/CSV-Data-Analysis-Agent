/**
 * Projects app-owned JSON schemas into Agrun's compact planner schema and
 * removes provider-added placeholders before app manifest validation.
 */
import type { ToolManifest } from '../../../../types';
import type { AgrunRecord } from './types';

const AGRUN_SCHEMA_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array']);
const OMIT = Symbol('agrun-schema-omit');

const asRecord = (value: unknown): AgrunRecord | null =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as AgrunRecord
        : null;

const readAlternatives = (rule: AgrunRecord): AgrunRecord[] => {
    const rawAlternatives = Array.isArray(rule.anyOf)
        ? rule.anyOf
        : Array.isArray(rule.oneOf)
            ? rule.oneOf
            : [];
    return rawAlternatives
        .map(asRecord)
        .filter((candidate): candidate is AgrunRecord => candidate !== null);
};

const intersectRequired = (alternatives: AgrunRecord[]): string[] => {
    const requiredSets = alternatives
        .map(alternative =>
            new Set(
                Array.isArray(alternative.required)
                    ? alternative.required.filter((key): key is string => typeof key === 'string')
                    : [],
            ))
        .filter(required => required.size > 0);
    if (requiredSets.length === 0) return [];
    return [...requiredSets[0]].filter(key =>
        requiredSets.every(required => required.has(key)));
};

const mergeSchemaAlternatives = (rawRule: unknown): AgrunRecord => {
    const rule = asRecord(rawRule) ?? {};
    const alternatives = readAlternatives(rule);
    if (alternatives.length === 0 || rule.type) return rule;

    const properties = Object.assign(
        {},
        ...alternatives.map(alternative => asRecord(alternative.properties) ?? {}),
    );
    const required = intersectRequired(alternatives);
    const inferredType = alternatives.every(alternative => alternative.type === 'object')
        ? 'object'
        : undefined;

    return {
        ...rule,
        ...(inferredType ? { type: inferredType } : {}),
        ...(Object.keys(properties).length > 0 ? { properties } : {}),
        ...(required.length > 0 ? { required } : {}),
    };
};

const normalizeSchemaType = (value: unknown, rule: AgrunRecord): string => {
    if (value === 'integer') return 'number';
    if (typeof value === 'string' && AGRUN_SCHEMA_TYPES.has(value)) {
        return value;
    }
    if (Array.isArray(value)) {
        if (value.includes('integer')) return 'number';
        const supported = value.find(item =>
            typeof item === 'string' && AGRUN_SCHEMA_TYPES.has(item));
        if (typeof supported === 'string') return supported;
    }
    if (asRecord(rule.properties)) return 'object';
    return 'string';
};

const projectSchemaRule = (rawRule: unknown): AgrunRecord => {
    const merged = mergeSchemaAlternatives(rawRule);
    const type = normalizeSchemaType(merged.type, merged);
    const projected: AgrunRecord = {
        ...merged,
        type,
    };
    delete projected.anyOf;
    delete projected.oneOf;
    delete projected.allOf;

    const properties = asRecord(merged.properties);
    if (type === 'object' && properties) {
        projected.properties = Object.fromEntries(
            Object.entries(properties).map(([key, child]) => [
                key,
                projectSchemaRule(child),
            ]),
        );
    }
    if (type === 'array' && merged.items) {
        projected.items = projectSchemaRule(merged.items);
    }
    return projected;
};

export const mapManifestSchemaToAgrunArgs = (
    manifest: ToolManifest,
): Record<string, AgrunRecord> => {
    const schema = manifest.parameterSchema ?? manifest.inputSchema;
    const properties = asRecord(schema.properties) ?? {};
    const required = new Set(
        Array.isArray(schema.required)
            ? schema.required.filter((key): key is string => typeof key === 'string')
            : [],
    );

    return Object.fromEntries(
        Object.entries(properties).map(([key, rawRule]) => [
            key,
            {
                ...projectSchemaRule(rawRule),
                required: required.has(key),
            },
        ]),
    );
};

const isPlaceholder = (value: unknown): boolean => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0 || value.every(isPlaceholder);
    const record = asRecord(value);
    return record ? Object.keys(record).length === 0 || Object.values(record).every(isPlaceholder) : false;
};

const shouldOmitPlaceholder = (
    rule: AgrunRecord,
    required: boolean,
): boolean => !required && (
    Number(rule.minItems) > 0
    || Number(rule.minLength) > 0
    || readAlternatives(rule).length > 0
    || (Array.isArray(rule.required) && rule.required.length > 0)
);

const normalizeValue = (
    value: unknown,
    rawRule: unknown,
    required: boolean,
): unknown | typeof OMIT => {
    const rule = mergeSchemaAlternatives(rawRule);
    const type = normalizeSchemaType(rule.type, rule);

    if (isPlaceholder(value) && shouldOmitPlaceholder(rule, required)) {
        return OMIT;
    }

    if ((rule.type === 'integer' || type === 'number') && typeof value === 'string') {
        const normalizedNumber = Number(value);
        if (value.trim() && Number.isFinite(normalizedNumber)) {
            return normalizedNumber;
        }
    }

    if (type === 'array' && Array.isArray(value)) {
        const normalizedItems = value
            .map(item => normalizeValue(item, rule.items ?? {}, false))
            .filter(item => item !== OMIT);
        if (normalizedItems.length === 0 && shouldOmitPlaceholder(rule, required)) {
            return OMIT;
        }
        return normalizedItems;
    }

    const record = asRecord(value);
    const properties = asRecord(rule.properties);
    if (type === 'object' && record && properties) {
        const requiredChildren = new Set(
            Array.isArray(rule.required)
                ? rule.required.filter((key): key is string => typeof key === 'string')
                : [],
        );
        const normalizedEntries = Object.entries(record)
            .map(([key, childValue]) => {
                const childRule = properties[key];
                if (!childRule) return [key, childValue] as const;
                const normalized = normalizeValue(
                    childValue,
                    childRule,
                    requiredChildren.has(key),
                );
                return normalized === OMIT ? null : [key, normalized] as const;
            })
            .filter((entry): entry is readonly [string, unknown] => entry !== null);
        const normalizedRecord = Object.fromEntries(normalizedEntries);
        if (isPlaceholder(normalizedRecord) && shouldOmitPlaceholder(rule, required)) {
            return OMIT;
        }
        return normalizedRecord;
    }

    return value;
};

export const normalizeAgrunActionArgs = (
    manifest: ToolManifest,
    args: AgrunRecord,
): AgrunRecord => {
    const schema = manifest.parameterSchema ?? manifest.inputSchema;
    const normalized = normalizeValue(args, schema, true);
    return asRecord(normalized) ?? args;
};
