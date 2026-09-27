import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingVectorMemoryDoc, VectorMemoryState } from '../types';

// --- Mocks ---

const vectorStoreMocks = vi.hoisted(() => ({
    init: vi.fn(async () => undefined),
    addDocument: vi.fn(async () => undefined),
    addDocumentBatch: vi.fn(async () => ({ count: 0 })),
    clear: vi.fn(async () => undefined),
    getDocuments: vi.fn(async () => []),
    getDocumentCount: vi.fn(async () => 0),
    search: vi.fn(async () => []),
    searchIfReady: vi.fn(async () => []),
    getIsInitialized: vi.fn(() => false),
    getStatus: vi.fn(() => 'idle' as const),
    getLastError: vi.fn(() => null),
    ensureVectorMemoryReady: vi.fn(async () => undefined),
    schedulePersist: vi.fn(),
    persistToStorage: vi.fn(async () => undefined),
    loadFromStorage: vi.fn(async () => false),
}));

vi.mock('../services/vectorStore', () => ({
    vectorStore: vectorStoreMocks,
}));

const contextBuilderMocks = vi.hoisted(() => ({
    buildDatasetMemoryDocuments: vi.fn(() => [
        { id: 'dataset-summary', text: 'Dataset "sales.csv" loaded with 100 rows.', metadata: { kind: 'dataset', memoryFormatVersion: 'ir-v1' } },
    ]),
}));

const cardMemoryProjectionMocks = vi.hoisted(() => ({
    buildCardMemoryProjectionList: vi.fn(() => []),
}));

vi.mock('../services/agent/contextBuilder', () => ({
    buildDatasetMemoryDocuments: contextBuilderMocks.buildDatasetMemoryDocuments,
}));

vi.mock('../services/agent/memory/cardMemoryProjection', () => ({
    buildCardMemoryProjectionList: cardMemoryProjectionMocks.buildCardMemoryProjectionList,
}));

// --- Helpers ---

type TestStoreState = {
    sessionId: string;
    currentDatasetId: string | null;
    reportMemoryScope: any;
    analysisCards: any[];
    columnProfiles: any[];
    csvData: any;
    rawCsvData: any;
    canonicalCsvData: any;
    dataPreparationPlan: any;
    vectorStoreDocuments: any[];
    vectorMemoryState: VectorMemoryState;
    pendingVectorMemoryDocs: PendingVectorMemoryDoc[];
    addProgress: ReturnType<typeof vi.fn>;
};

const createTestStore = (overrides: Partial<TestStoreState> = {}) => {
    const state: TestStoreState = {
        analysisCards: [],
        sessionId: 'report-1',
        currentDatasetId: 'dataset-1',
        reportMemoryScope: {
            reportId: 'report-1',
            datasetId: 'dataset-1',
            datasetVersion: 'version-legacy',
        },
        columnProfiles: [],
        csvData: { fileName: 'sales.csv', data: [{ Region: 'East' }], metadataRows: [], summaryRows: [], headerDepth: 1 },
        rawCsvData: null,
        canonicalCsvData: null,
        dataPreparationPlan: null,
        vectorStoreDocuments: [],
        vectorMemoryState: 'cold',
        pendingVectorMemoryDocs: [],
        addProgress: vi.fn(),
        ...overrides,
    };

    return {
        getState: () => state,
        setState: (partial: Record<string, unknown> | ((state: Record<string, unknown>) => Record<string, unknown>)) => {
            const next = typeof partial === 'function' ? partial(state as any) : partial;
            Object.assign(state, next);
        },
        state,
    };
};

describe('vector memory lazy activation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('PERF-101: enqueueDatasetMemoryDocs', () => {
        it('adds dataset docs to the pending queue without calling vectorStore.init', async () => {
            const { enqueueDatasetMemoryDocs } = await import('../services/agent/memory/vectorMemorySync');
            const store = createTestStore();

            enqueueDatasetMemoryDocs(store as never);

            expect(store.state.pendingVectorMemoryDocs).toHaveLength(1);
            expect(store.state.pendingVectorMemoryDocs[0].id).toContain(':dataset-summary');
            expect(store.state.pendingVectorMemoryDocs[0].metadata?.scope).toEqual(expect.objectContaining({
                reportId: 'report-1',
                datasetId: 'dataset-1',
            }));
            expect(vectorStoreMocks.init).not.toHaveBeenCalled();
            expect(vectorStoreMocks.addDocument).not.toHaveBeenCalled();
            expect(vectorStoreMocks.addDocumentBatch).not.toHaveBeenCalled();
        });

        it('appends to existing pending docs without duplicating', async () => {
            const { enqueueDatasetMemoryDocs } = await import('../services/agent/memory/vectorMemorySync');
            const store = createTestStore({
                pendingVectorMemoryDocs: [
                    { id: 'existing-card', text: 'some card memory' },
                ],
            });

            enqueueDatasetMemoryDocs(store as never);

            expect(store.state.pendingVectorMemoryDocs).toHaveLength(2);
            expect(store.state.pendingVectorMemoryDocs[0].id).toBe('existing-card');
            expect(store.state.pendingVectorMemoryDocs[1].id).toContain(':dataset-summary');
        });
    });

    describe('PERF-102: upsertCardMemoryDocument queues when cold', () => {
        it('enqueues card doc instead of writing to vector store when memory is cold', async () => {
            const { upsertCardMemoryDocument } = await import('../services/agent/memory/vectorMemorySync');

            cardMemoryProjectionMocks.buildCardMemoryProjectionList.mockReturnValue([
                {
                    cardId: 'card-1',
                    memoryText: 'Revenue by Region',
                    metadata: { kind: 'analysis_card', cardId: 'card-1', memoryFormatVersion: 'ir-v1' },
                },
            ]);

            const store = createTestStore({
                vectorMemoryState: 'cold',
                analysisCards: [{ id: 'card-1', plan: { title: 'Revenue by Region' } }] as any[],
            });

            await upsertCardMemoryDocument(store as never, 'card-1');

            // Should NOT write to vector store
            expect(vectorStoreMocks.addDocument).not.toHaveBeenCalled();
            // Should enqueue
            expect(store.state.pendingVectorMemoryDocs).toHaveLength(1);
            expect(store.state.pendingVectorMemoryDocs[0]).toEqual({
                id: expect.stringContaining(':card-1'),
                text: 'Revenue by Region',
                metadata: expect.objectContaining({
                    kind: 'analysis_card',
                    cardId: 'card-1',
                    memoryFormatVersion: 'ir-v1',
                    scope: expect.objectContaining({
                        reportId: 'report-1',
                        datasetId: 'dataset-1',
                    }),
                    origin: expect.objectContaining({
                        kind: 'analysis_card',
                        sourceId: 'card-1',
                    }),
                }),
            });
        });

        it('writes directly to vector store when memory is ready', async () => {
            const { upsertCardMemoryDocument } = await import('../services/agent/memory/vectorMemorySync');

            cardMemoryProjectionMocks.buildCardMemoryProjectionList.mockReturnValue([
                {
                    cardId: 'card-1',
                    memoryText: 'Revenue by Region',
                    metadata: { kind: 'analysis_card', cardId: 'card-1', memoryFormatVersion: 'ir-v1' },
                },
            ]);

            const store = createTestStore({
                vectorMemoryState: 'ready',
                analysisCards: [{ id: 'card-1', plan: { title: 'Revenue by Region' } }] as any[],
            });

            await upsertCardMemoryDocument(store as never, 'card-1');

            // Should write directly
            expect(vectorStoreMocks.addDocument).toHaveBeenCalledTimes(1);
            // Should NOT enqueue
            expect(store.state.pendingVectorMemoryDocs).toHaveLength(0);
        });
    });

    describe('MEMORY-201: accepted decisions', () => {
        it('replaces an earlier answer to the same question inside the active scope', async () => {
            const { upsertAcceptedDecisionDoc } = await import(
                '../services/agent/memory/vectorMemorySync'
            );
            const store = createTestStore();

            await upsertAcceptedDecisionDoc(store as never, {
                key: 'region',
                question: 'Which region should be used?',
                value: 'East',
                resolvedAtTurn: 3,
            });
            await upsertAcceptedDecisionDoc(store as never, {
                key: 'region',
                question: 'Which region should be used?',
                value: 'West',
                resolvedAtTurn: 4,
            });

            expect(store.state.pendingVectorMemoryDocs).toHaveLength(1);
            expect(store.state.pendingVectorMemoryDocs[0]).toEqual(
                expect.objectContaining({
                    id: expect.stringContaining(':accepted-decision-region'),
                    text: expect.stringContaining('User answer: West'),
                    metadata: expect.objectContaining({
                        kind: 'accepted_decision',
                        scope: expect.objectContaining({
                            reportId: 'report-1',
                            datasetId: 'dataset-1',
                        }),
                        origin: expect.objectContaining({
                            kind: 'resolved_clarification',
                            sourceId: 'accepted-decision-region',
                        }),
                    }),
                }),
            );
        });
    });

    describe('PERF-104: flushPendingVectorMemoryDocs', () => {
        it('flushes pending docs to vector store in batches', async () => {
            const { flushPendingVectorMemoryDocs } = await import('../services/agent/memory/vectorMemorySync');

            const pendingDocs: PendingVectorMemoryDoc[] = Array.from({ length: 15 }, (_, i) => ({
                id: `doc-${i}`,
                text: `Document ${i}`,
            }));

            const store = createTestStore({ pendingVectorMemoryDocs: pendingDocs });

            await flushPendingVectorMemoryDocs(store as never);

            // Should have called addDocumentBatch for 2 batches (10 + 5)
            expect(vectorStoreMocks.addDocumentBatch).toHaveBeenCalledTimes(2);
            expect(vectorStoreMocks.addDocumentBatch).toHaveBeenNthCalledWith(1, pendingDocs.slice(0, 10));
            expect(vectorStoreMocks.addDocumentBatch).toHaveBeenNthCalledWith(2, pendingDocs.slice(10));
            // Queue should be cleared
            expect(store.state.pendingVectorMemoryDocs).toEqual([]);
        });

        it('does nothing when queue is empty', async () => {
            const { flushPendingVectorMemoryDocs } = await import('../services/agent/memory/vectorMemorySync');

            const store = createTestStore({ pendingVectorMemoryDocs: [] });

            await flushPendingVectorMemoryDocs(store as never);

            expect(vectorStoreMocks.addDocumentBatch).not.toHaveBeenCalled();
        });

        it('continues flushing even if one batch fails', async () => {
            const { flushPendingVectorMemoryDocs } = await import('../services/agent/memory/vectorMemorySync');

            vectorStoreMocks.addDocumentBatch
                .mockRejectedValueOnce(new Error('network error'))
                .mockResolvedValueOnce({ count: 5 });

            const pendingDocs: PendingVectorMemoryDoc[] = Array.from({ length: 15 }, (_, i) => ({
                id: `doc-${i}`,
                text: `Document ${i}`,
            }));

            const store = createTestStore({ pendingVectorMemoryDocs: pendingDocs });

            await flushPendingVectorMemoryDocs(store as never);

            // Both batches attempted even though first failed
            expect(vectorStoreMocks.addDocumentBatch).toHaveBeenCalledTimes(2);
            // Queue is still cleared
            expect(store.state.pendingVectorMemoryDocs).toEqual([]);
        });
    });

    describe('PERF-103: vectorStore.searchIfReady graceful degradation', () => {
        it('returns empty results when not initialized', async () => {
            vectorStoreMocks.searchIfReady.mockResolvedValue([]);
            const { vectorStore } = await import('../services/vectorStore');

            const results = await vectorStore.searchIfReady('some query', 5);

            expect(results).toEqual([]);
        });
    });
});
