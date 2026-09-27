// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { normalizeAndValidateSqlEvidenceQueryPlan } from '../services/agent/planning/sqlPlanValidator';

describe('sqlEvidenceQueryPlan', () => {
    it('accepts a grouped evidence query that selects its aggregate alias', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Revenue evidence by project',
            queryMode: 'aggregate',
            intentSummary: 'Inspect grouped revenue evidence by project.',
            preferredResultShape: 'ranked_aggregate',
            query: {
                select: ['Project', 'total_revenue'],
                groupBy: ['Project'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                orderBy: [{ column: 'total_revenue', direction: 'desc' }],
                limit: 10,
            },
        }, [
            { name: 'Project', type: 'categorical', uniqueValues: 12 },
            { name: 'Revenue', type: 'numerical' },
        ]);

        expect(result.errors).toEqual([]);
        expect(result.validPlan?.preferredResultShape).toBe('ranked_aggregate');
    });
});
