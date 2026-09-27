import { describe, expect, it } from 'vitest';
import { createAnalysisTopicsSchema } from '../services/ai/schemas/analysisSchemas';

describe('createAnalysisTopicsSchema', () => {
    it('defaults to 4-8 topics when no arguments are provided', () => {
        const schema = createAnalysisTopicsSchema();
        expect(schema.properties.topics.description).toContain('4 to 8');
    });

    it('accepts custom min/max topic counts', () => {
        const schema = createAnalysisTopicsSchema(1, 2);
        expect(schema.properties.topics.description).toContain('1 to 2');
        expect(schema.properties.topics.description).not.toContain('4 to 8');
    });

    it('uses the mid-range when 2 dimensions are available', () => {
        const schema = createAnalysisTopicsSchema(2, 4);
        expect(schema.properties.topics.description).toContain('2 to 4');
    });
});
