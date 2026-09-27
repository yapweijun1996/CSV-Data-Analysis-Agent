import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CsvData } from '../types';
import { buildColumnRegistry } from '../services/data/columnRegistry';
import { compileQueryPlanToDuckDbSql } from '../services/duckdb/queryCompiler';
import { createPiBrowserAgent, createPiDatasetTools, getPiFinalText } from '../services/agent/runtime/pi/piBrowserAgent';

const { executeManagedDataQueryMock } = vi.hoisted(() => ({
    executeManagedDataQueryMock: vi.fn(),
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    executeManagedDataQuery: executeManagedDataQueryMock,
}));

const dataset = {
    fileName: 'report.csv',
    data: [{ Region: 'East', Amount: '10' }],
    backing: {
        mode: 'duckdb_file',
        rowCount: 100,
        sampleRowCount: 1,
        byteSize: 1024,
        loadVersion: 'load-1',
        datasetVersion: 'dataset-1',
        readOnly: true,
        ephemeral: true,
    },
} as CsvData;

const columnRegistry = buildColumnRegistry({
    data: dataset,
    columnProfiles: [
        { name: 'Region', type: 'categorical' },
        { name: 'Amount', type: 'numerical' },
    ],
});

const context = { dataset, columnRegistry, numericColumns: ['Amount'] };

beforeEach(() => {
    executeManagedDataQueryMock.mockReset();
    executeManagedDataQueryMock.mockResolvedValue({
        engine: 'duckdb',
        result: {
            rows: [{ row_count: 100, metric_sum: 250 }],
            truncated: false,
        },
    });
});

describe('Pi browser dataset tools', () => {
    it('reports the full backed row count without returning sample rows', async () => {
        const inspect = createPiDatasetTools(context).find(tool => tool.name === 'inspect_dataset')!;
        const result = await inspect.execute('inspect', {});
        const output = JSON.parse(result.content[0].type === 'text' ? result.content[0].text : '{}');
        expect(output).toMatchObject({ rowCount: 100, columns: ['Region', 'Amount'], numericColumns: ['Amount'] });
        expect(JSON.stringify(output)).not.toContain('East');
    });

    it('uses a bounded full-dataset query for filtered aggregation', async () => {
        const aggregate = createPiDatasetTools(context).find(tool => tool.name === 'aggregate_rows')!;
        const result = await aggregate.execute('aggregate', {
            metric: 'Amount',
            filters: [{ column: 'Region', operator: 'equals', value: 'East' }],
        });
        expect(executeManagedDataQueryMock).toHaveBeenCalledWith(dataset, expect.objectContaining({
            where: { predicates: [{ column: 'Region', operator: 'eq', value: 'East' }] },
            aggregates: [
                { function: 'count', as: 'row_count' },
                { function: 'sum', column: 'Amount', as: 'metric_sum' },
            ],
            limit: 30,
        }), ['Region', 'Amount'], expect.objectContaining({ allowNativeFallback: false }));
        const plan = executeManagedDataQueryMock.mock.calls[0][1];
        const compiled = compileQueryPlanToDuckDbSql(plan, {
            allowedColumns: ['Region', 'Amount'],
            tableName: 'session_clean_dataset',
            maxRows: 500,
            maxColumns: 50,
            maxOrderBy: 3,
        });
        expect(compiled.sql).toContain('row_count');
        expect(compiled.sql).toContain('metric_sum');
        expect(result.content[0]).toMatchObject({ type: 'text' });
    });

    it('completes the Pi tool loop in mock mode without a provider key', async () => {
        const agent = createPiBrowserAgent({ mode: 'mock', context });
        await agent.prompt('Sum Amount');
        expect(agent.state.errorMessage).toBeUndefined();
        expect(getPiFinalText(agent)).toContain('metric_sum');
        expect(executeManagedDataQueryMock).toHaveBeenCalledOnce();
    });

    it('rejects unsupported filters before querying', async () => {
        const aggregate = createPiDatasetTools(context).find(tool => tool.name === 'aggregate_rows')!;
        await expect(aggregate.execute('aggregate', {
            filters: [{ column: 'Region', operator: 'contains', value: 'East' }],
        })).rejects.toThrow('Unsupported filter operator');
        expect(executeManagedDataQueryMock).not.toHaveBeenCalled();
    });
});
