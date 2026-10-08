// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeDataDescribeAction } from '../services/agent/execution/diagnosticDataActions';
import { createRuntimeTestStore } from './runtimeTestStore';
import { buildDatasetId } from '../utils/datasetId';

const { executeUnifiedQueryMock } = vi.hoisted(() => ({
    executeUnifiedQueryMock: vi.fn(),
}));

vi.mock('../services/duckdb/unifiedQueryExecutor', () => ({
    executeUnifiedQuery: executeUnifiedQueryMock,
}));

describe('diagnostic data actions', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('resolves data.describe against the preferred canonical dataset binding', async () => {
        const prepared = {
            fileName: 'prepared.csv',
            data: [{ Amount: 999 }],
        };
        const canonical = {
            fileName: 'canonical.csv',
            data: [{ Amount: 10 }, { Amount: 20 }],
        };
        const canonicalLoadVersion = buildDatasetId(canonical.fileName, canonical.data);
        const store = createRuntimeTestStore({
            csvData: prepared,
            columnProfiles: [{ name: 'Amount', type: 'numerical' }],
        } as never);
        store.setState({
            canonicalCsvData: canonical,
            duckDbSessionStatus: {
                status: 'ready',
                engine: 'duckdb',
                tableName: 'session_clean_dataset',
                loadVersion: canonicalLoadVersion,
                fallbackReason: null,
                fallbackStage: null,
                lastSyncedAt: new Date(),
            },
        } as never);
        executeUnifiedQueryMock.mockResolvedValue({
            rows: [{
                column: 'Amount',
                count: 2,
                min: 10,
                max: 20,
            }],
            selectedColumns: ['column', 'count', 'min', 'max'],
            totalMatchedRows: 1,
            returnedRows: 1,
            engine: 'duckdb',
            sqlPreview: 'SELECT ...',
            durationMs: 5,
            injectedDirectives: [],
        });

        const result = await executeDataDescribeAction({
            type: 'tool_call',
            thought: 'Describe Amount.',
            toolName: 'data.describe',
            args: {
                columns: ['Amount'],
                explanation: 'Describe Amount.',
            },
        }, store as never);

        expect(result.status).toBe('success');
        expect(executeUnifiedQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'describe',
                params: { columns: ['Amount'] },
            }),
            expect.objectContaining({
                binding: {
                    tableName: 'session_clean_dataset',
                    loadVersion: canonicalLoadVersion,
                },
            }),
        );
    });

    it('describes only columns the table has and gives a large file a longer timeout', async () => {
        const store = createRuntimeTestStore({
            csvData: {
                fileName: 'big.csv',
                data: [{ price: 1 }],
                backing: {
                    mode: 'duckdb_file', loadVersion: 'lv', datasetVersion: 'dv', rowCount: 982_589,
                    sampleRowCount: 2000, byteSize: 1, columnNames: ['price', 'area'], readOnly: true, ephemeral: true,
                },
            },
            // SourceRowIndex is a lineage column that profiles can list but the table does not have.
            columnProfiles: [
                { name: 'price', type: 'currency' },
                { name: 'area', type: 'numerical' },
                { name: 'SourceRowIndex', type: 'numerical' },
            ],
        } as never);
        store.setState({
            duckDbSessionStatus: {
                status: 'ready', engine: 'duckdb', tableName: 'session_clean_dataset', loadVersion: 'lv',
                fallbackReason: null, fallbackStage: null, lastSyncedAt: new Date(),
            },
        } as never);
        executeUnifiedQueryMock.mockResolvedValue({
            rows: [], selectedColumns: [], totalMatchedRows: 0, returnedRows: 0,
            engine: 'duckdb', sqlPreview: null, durationMs: 1, injectedDirectives: [],
        });

        await executeDataDescribeAction({ type: 'tool_call', thought: 'd', toolName: 'data.describe', args: {} }, store as never);

        const [intent, options] = executeUnifiedQueryMock.mock.calls[0];
        expect(intent.params.columns).toEqual(['price', 'area']);
        expect(options.allowedColumns).toEqual(['price', 'area']);
        expect(intent.options.timeout).toBeGreaterThan(8000);
        expect(intent.options.timeout).toBeLessThanOrEqual(30_000);
    });
});
