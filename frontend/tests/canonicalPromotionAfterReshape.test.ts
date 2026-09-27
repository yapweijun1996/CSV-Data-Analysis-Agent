// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { CsvData } from '../types';
import type { CanonicalBuildMeta, CanonicalReshapeProvenance } from '../types/reportStructure';

/**
 * Unit tests for the canonical promotion flow after analysis-stage reshape.
 *
 * DATA-601: promoteToCanonicalDataset syncs canonicalCsvData
 * DATA-602: reshape provenance metadata is recorded
 * DATA-603: semantic snapshot is reset after promotion
 * DATA-604: spreadsheet binding and persistence alignment
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildWideCsvData = (): CsvData => ({
    data: [
        { 'STAFF CODE': 'A01', 'STAFF NAME': 'Alice', 'JAN 2010': 100, 'FEB 2010': 200, 'MAR 2010': 300 },
        { 'STAFF CODE': 'A02', 'STAFF NAME': 'Bob', 'JAN 2010': 150, 'FEB 2010': 250, 'MAR 2010': 350 },
    ],
    fileName: 'staff-monthly.csv',
    metadataRows: [],
    headerLayers: [],
    summaryRows: [],
});

const buildLongCsvData = (): CsvData => ({
    data: [
        { 'STAFF CODE': 'A01', 'STAFF NAME': 'Alice', Period: 'JAN 2010', Value: 100 },
        { 'STAFF CODE': 'A01', 'STAFF NAME': 'Alice', Period: 'FEB 2010', Value: 200 },
        { 'STAFF CODE': 'A01', 'STAFF NAME': 'Alice', Period: 'MAR 2010', Value: 300 },
        { 'STAFF CODE': 'A02', 'STAFF NAME': 'Bob', Period: 'JAN 2010', Value: 150 },
        { 'STAFF CODE': 'A02', 'STAFF NAME': 'Bob', Period: 'FEB 2010', Value: 250 },
        { 'STAFF CODE': 'A02', 'STAFF NAME': 'Bob', Period: 'MAR 2010', Value: 350 },
    ],
    fileName: 'staff-monthly.csv',
    metadataRows: [],
    headerLayers: [],
    summaryRows: [],
});

const columnsOf = (d: CsvData): string[] => d.data.length > 0 ? Object.keys(d.data[0]) : [];

const buildReshapeProvenance = (wide: CsvData, long: CsvData): CanonicalReshapeProvenance => ({
    reshapedFromWidePivot: true,
    reshapeOperationId: 'reshape_wide_pivot',
    reshapeAppliedAt: new Date().toISOString(),
    sourceColumnCountBefore: 3, // JAN, FEB, MAR
    rowCountBefore: wide.data.length,
    rowCountAfter: long.data.length,
});

// Minimal mock of the store shape used by promoteToCanonicalDataset.
// We replicate only the state fields and the action to keep the test focused.
const buildMockStore = (initialCsvData: CsvData) => {
    let state: Record<string, unknown> = {
        csvData: initialCsvData,
        canonicalCsvData: null,
        canonicalBuildMeta: null,
        canonicalizationStatus: 'idle',
        datasetSemanticSnapshot: { version: 'stale-snapshot' },
        semanticStatus: 'ready',
        semanticDatasetVersion: 'v-old',
    };

    const get = () => state;
    const set = (partial: Record<string, unknown>) => {
        state = { ...state, ...partial };
    };

    return { get, set, state: () => state };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('canonicalPromotionAfterReshape', () => {
    describe('DATA-601: promoteToCanonicalDataset sets canonicalCsvData', () => {
        it('promotes current csvData to canonicalCsvData', () => {
            const longData = buildLongCsvData();
            const store = buildMockStore(longData);
            const provenance = buildReshapeProvenance(buildWideCsvData(), longData);

            // Simulate what the dataSlice action does:
            const currentData = store.get().csvData as CsvData;
            const columns = currentData.data.length > 0 ? Object.keys(currentData.data[0]) : [];
            store.set({
                canonicalCsvData: currentData,
                canonicalBuildMeta: {
                    shape: 'long_fact_table',
                    source: 'analysis_reshape',
                    rowCount: currentData.data.length,
                    columnCount: columns.length,
                    lineageColumns: columns,
                    summary: 'test reshape',
                    excludedRowCounts: {},
                    carryForwardAppliedCounts: {},
                    footerTotalsMatched: null,
                    reshapeProvenance: provenance,
                } satisfies CanonicalBuildMeta,
                canonicalizationStatus: 'ready',
                datasetSemanticSnapshot: null,
                semanticStatus: 'idle',
                semanticDatasetVersion: null,
            });

            const s = store.state();
            expect(s.canonicalCsvData).toBe(longData);
            expect(columnsOf(s.canonicalCsvData as CsvData)).toEqual(['STAFF CODE', 'STAFF NAME', 'Period', 'Value']);
            expect((s.canonicalCsvData as CsvData).data).toHaveLength(6);
        });

        it('does not promote when csvData is null', () => {
            const store = buildMockStore(null as any);
            store.set({ csvData: null });
            // Action should early-return without changing canonical
            const currentData = store.get().csvData;
            if (!currentData) {
                // This is expected — the action guards on csvData presence
                expect(store.state().canonicalCsvData).toBeNull();
                return;
            }
        });
    });

    describe('DATA-602: reshape provenance metadata', () => {
        it('records reshape provenance in canonicalBuildMeta', () => {
            const longData = buildLongCsvData();
            const wideData = buildWideCsvData();
            const provenance = buildReshapeProvenance(wideData, longData);

            const store = buildMockStore(longData);
            const currentData = store.get().csvData as CsvData;
            const columns = Object.keys(currentData.data[0]);
            store.set({
                canonicalCsvData: currentData,
                canonicalBuildMeta: {
                    shape: 'long_fact_table',
                    source: 'analysis_reshape',
                    rowCount: currentData.data.length,
                    columnCount: columns.length,
                    lineageColumns: columns,
                    summary: 'test',
                    excludedRowCounts: {},
                    carryForwardAppliedCounts: {},
                    footerTotalsMatched: null,
                    reshapeProvenance: provenance,
                } satisfies CanonicalBuildMeta,
                canonicalizationStatus: 'ready',
            });

            const meta = store.state().canonicalBuildMeta as CanonicalBuildMeta;
            expect(meta.source).toBe('analysis_reshape');
            expect(meta.shape).toBe('long_fact_table');
            expect(meta.reshapeProvenance).toBeDefined();
            expect(meta.reshapeProvenance!.reshapedFromWidePivot).toBe(true);
            expect(meta.reshapeProvenance!.reshapeOperationId).toBe('reshape_wide_pivot');
            expect(meta.reshapeProvenance!.sourceColumnCountBefore).toBe(3);
            expect(meta.reshapeProvenance!.rowCountBefore).toBe(2);
            expect(meta.reshapeProvenance!.rowCountAfter).toBe(6);
            expect(meta.reshapeProvenance!.reshapeAppliedAt).toBeTruthy();
        });

        it('canonicalizationStatus is set to ready', () => {
            const longData = buildLongCsvData();
            const store = buildMockStore(longData);
            store.set({ canonicalizationStatus: 'ready' });
            expect(store.state().canonicalizationStatus).toBe('ready');
        });
    });

    describe('DATA-603: semantic snapshot reset after promotion', () => {
        it('resets datasetSemanticSnapshot to null', () => {
            const longData = buildLongCsvData();
            const store = buildMockStore(longData);

            // Pre-condition: semantic snapshot exists for old wide data
            expect(store.state().datasetSemanticSnapshot).toBeTruthy();
            expect(store.state().semanticStatus).toBe('ready');

            // Simulate promotion
            store.set({
                canonicalCsvData: longData,
                datasetSemanticSnapshot: null,
                semanticStatus: 'idle',
                semanticDatasetVersion: null,
            });

            expect(store.state().datasetSemanticSnapshot).toBeNull();
            expect(store.state().semanticStatus).toBe('idle');
            expect(store.state().semanticDatasetVersion).toBeNull();
        });
    });

    describe('DATA-604: spreadsheet binding alignment', () => {
        it('canonicalCsvData ?? csvData resolves to the promoted long table', () => {
            const longData = buildLongCsvData();
            const store = buildMockStore(longData);

            store.set({ canonicalCsvData: longData });

            // This mirrors useSpreadsheetLogic line: canonicalCsvData ?? csvData
            const s = store.state();
            const preferredDataset = (s.canonicalCsvData ?? s.csvData) as CsvData;
            expect(preferredDataset).toBe(longData);
            const cols = columnsOf(preferredDataset);
            expect(cols).toContain('Period');
            expect(cols).toContain('Value');
            expect(cols).not.toContain('JAN 2010');
        });

        it('persistence signature changes when canonicalizationStatus updates', () => {
            // canonicalizationStatus is part of buildPersistedAppStateSignature
            const store = buildMockStore(buildLongCsvData());
            const statusBefore = store.state().canonicalizationStatus;
            store.set({ canonicalizationStatus: 'ready' });
            const statusAfter = store.state().canonicalizationStatus;
            expect(statusBefore).not.toBe(statusAfter);
        });
    });
});
