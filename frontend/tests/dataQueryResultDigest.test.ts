import { describe, expect, it } from 'vitest';
import { buildDataQueryResultDigest } from '../services/agent/execution/dataQueryResultDigest';

describe('buildDataQueryResultDigest', () => {
    it('summarizes the complete ordered result instead of only preview rows', () => {
        const digest = buildDataQueryResultDigest([
            { Month: '2025-01', Amount: 100 },
            { Month: '2025-02', Amount: 80 },
            { Month: '2025-03', Amount: 150 },
            { Month: '2025-04', Amount: 125 },
            { Month: '2025-05', Amount: 200 },
            { Month: '2025-06', Amount: 250 },
        ], ['Month', 'Amount']);

        expect(digest).toMatchObject({
            rowCount: 6,
            labelColumn: 'Month',
            firstRow: { Month: '2025-01', Amount: 100 },
            lastRow: { Month: '2025-06', Amount: 250 },
            numericColumns: [{
                column: 'Amount',
                observedValues: 6,
                first: 100,
                last: 250,
                min: 80,
                max: 250,
                absoluteChange: 150,
                percentChange: 150,
                firstLabel: '2025-01',
                lastLabel: '2025-06',
                minLabel: '2025-02',
                maxLabel: '2025-06',
            }],
        });
    });

    it('handles empty and zero-baseline results safely', () => {
        expect(buildDataQueryResultDigest([])).toMatchObject({
            rowCount: 0,
            numericColumns: [],
        });
        expect(buildDataQueryResultDigest([
            { Period: 'A', Value: 0 },
            { Period: 'B', Value: 10 },
        ], ['Period', 'Value']).numericColumns[0]?.percentChange).toBeNull();
    });
});
