// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { executeAggregationCore } from '../services/agent/execution/executors/aggregationCore';

describe('aggregationCore preFilter operators', () => {
    it('applies numeric greater-than filters before aggregation', () => {
        const result = executeAggregationCore({
            fileName: 'aggregation.csv',
            data: [
                { Project: 'A', Amount: '-5', Description: 'Cost' },
                { Project: 'A', Amount: '10', Description: 'Cost' },
                { Project: 'B', Amount: '20', Description: 'Cost' },
            ],
        }, {
            chartType: 'bar',
            title: 'Positive Costs by Project',
            description: 'Compare positive costs by project.',
            aggregation: 'sum',
            groupByColumn: 'Project',
            valueColumn: 'Amount',
            preFilter: [{
                column: 'Amount',
                operator: 'gt',
                value: 0,
            }],
        });

        expect(result).toEqual([
            { Project: 'B', Amount: 20 },
            { Project: 'A', Amount: 10 },
        ]);
    });
});
