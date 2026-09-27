const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

const normalizeBigInt = (value: bigint): number | string =>
    value <= MAX_SAFE_BIGINT && value >= MIN_SAFE_BIGINT
        ? Number(value)
        : value.toString();

export const toSerializable = <T>(value: T, seen = new WeakSet<object>()): T => {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'function') {
        return undefined as T;
    }

    if (typeof value === 'bigint') {
        return normalizeBigInt(value) as T;
    }

    if (typeof value !== 'object') {
        return value;
    }

    if (value instanceof Date) {
        return new Date(value.getTime()) as T;
    }

    if (seen.has(value as object)) {
        return undefined as T;
    }

    seen.add(value as object);

    if (Array.isArray(value)) {
        return value
            .map(entry => toSerializable(entry, seen))
            .filter(entry => entry !== undefined) as T;
    }

    if (isPlainObject(value)) {
        return Object.fromEntries(
            Object.entries(value)
                .map(([key, entry]) => [key, toSerializable(entry, seen)] as const)
                .filter(([, entry]) => entry !== undefined),
        ) as T;
    }

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .map(([key, entry]) => [key, toSerializable(entry, seen)] as const)
            .filter(([, entry]) => entry !== undefined),
    ) as T;
};

export const toJsonCompatible = <T>(value: T, seen = new WeakSet<object>()): T => {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'function') {
        return undefined as T;
    }

    if (typeof value === 'bigint') {
        return normalizeBigInt(value) as T;
    }

    if (typeof value !== 'object') {
        return value;
    }

    if (value instanceof Date) {
        return value.toISOString() as T;
    }

    if (seen.has(value as object)) {
        return undefined as T;
    }

    seen.add(value as object);

    if (Array.isArray(value)) {
        return value
            .map(entry => toJsonCompatible(entry, seen))
            .filter(entry => entry !== undefined) as T;
    }

    const entries = Object.entries(value as Record<string, unknown>)
        .map(([key, entry]) => [key, toJsonCompatible(entry, seen)] as const)
        .filter(([, entry]) => entry !== undefined);

    if (isPlainObject(value)) {
        return Object.fromEntries(entries) as T;
    }

    return Object.fromEntries(entries) as T;
};

export const safeJsonStringify = (value: unknown, space?: number | string): string =>
    JSON.stringify(toJsonCompatible(value), null, space);
