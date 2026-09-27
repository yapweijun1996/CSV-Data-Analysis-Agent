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
});
