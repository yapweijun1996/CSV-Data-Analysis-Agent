import { describe, expect, it } from 'vitest';
import { filterFunctionSchema } from '../services/ai/schemas/dataSchemas';

describe('filterFunctionSchema', () => {
    it('uses a Gemini-safe filter_rows response shape without nested anyOf requirements', () => {
        const operation = filterFunctionSchema.properties.operation as Record<string, unknown>;

        expect(operation.type).toBe('object');
        expect(operation.anyOf).toBeUndefined();
        expect(operation.oneOf).toBeUndefined();
        expect(operation.allOf).toBeUndefined();
        expect(operation.required).toEqual(['id', 'type', 'reason']);
        expect((operation.properties as Record<string, unknown>).predicates).toBeDefined();
        expect((operation.properties as Record<string, unknown>).groups).toBeDefined();
    });
});
