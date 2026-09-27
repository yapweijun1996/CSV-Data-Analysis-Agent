import { describe, expect, it, vi } from 'vitest';
import type { CsvData } from '../types';
import { ensureDuckDbSessionSync } from '../services/duckdb/storeSessionSync';

describe('storeSessionSync', () => {
    it('passes the explicit dataset override through refreshDuckDbSession', async () => {
        const dataset: CsvData = {
            fileName: 'canonical.csv',
            data: [{ Buyer: 'SO-1', Value: 10 }],
            metadataRows: [],
            summaryRows: [],
            headerLayers: [],
            headerDepth: 1,
            summaryRowCount: 0,
        };
        const expectedStatus = {
            status: 'ready',
            engine: 'duckdb',
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-test',
            fallbackReason: null,
            fallbackStage: null,
            lastSyncedAt: null,
        } as const;
        const refreshDuckDbSession = vi.fn(async (datasetOverride?: CsvData | null) => {
            expect(datasetOverride).toBe(dataset);
            return expectedStatus;
        });

        const status = await ensureDuckDbSessionSync({
            getState: () => ({
                csvData: null,
                duckDbSessionStatus: undefined,
                refreshDuckDbSession,
            }),
            setState: vi.fn(),
        }, dataset);

        expect(status).toEqual(expectedStatus);
        expect(refreshDuckDbSession).toHaveBeenCalledWith(dataset);
    });
});
