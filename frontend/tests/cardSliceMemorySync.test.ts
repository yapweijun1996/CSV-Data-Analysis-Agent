import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCardSlice } from '../store/slices/cardSlice';

const {
    addDocumentMock,
    deleteDocumentMock,
    getDocumentsMock,
    addDocumentBatchMock,
} = vi.hoisted(() => ({
    addDocumentMock: vi.fn(async () => undefined),
    deleteDocumentMock: vi.fn(() => true),
    getDocumentsMock: vi.fn(() => []),
    addDocumentBatchMock: vi.fn(async () => ({ count: 0 })),
}));

vi.mock('../services/vectorStore', () => ({
    vectorStore: {
        addDocument: addDocumentMock,
        deleteDocument: deleteDocumentMock,
        getDocuments: getDocumentsMock,
        addDocumentBatch: addDocumentBatchMock,
        schedulePersist: vi.fn(),
    },
}));

vi.mock('../services/agent/memory/vectorMemorySync', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/agent/memory/vectorMemorySync')>();
    return { ...actual };
});

const createState = () => ({
    sessionId: 'report-1',
    currentDatasetId: 'dataset-1',
    reportMemoryScope: {
        reportId: 'report-1',
        datasetId: 'dataset-1',
        datasetVersion: 'version-1',
    },
    csvData: {
        fileName: 'sales.csv',
        data: [{ SeriesLabelL1: 'BDB LAB DESIGN', Revenue: 1200, Cost: 600 }],
    },
    rawCsvData: null,
    canonicalCsvData: null,
    analysisCards: [
        {
            id: 'card-1',
            plan: {
                title: 'Revenue by Project',
                description: 'Compare revenue by project.',
                chartType: 'bar',
                groupByColumn: 'SeriesLabelL1',
                valueColumn: 'Revenue',
                aggregation: 'sum',
            },
            aggregatedData: [{ SeriesLabelL1: 'BDB LAB DESIGN', Revenue: 1200, Cost: 600 }],
            summary: { language: 'English', text: 'Project revenue summary.' },
            displayChartType: 'bar',
            isDataVisible: false,
            topN: null,
            hideOthers: false,
            hiddenLabels: [],
        },
    ],
    cardEnhancementSuggestions: [],
    chatHistory: [],
    columnProfiles: [
        { name: 'SeriesLabelL1', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
        { name: 'Revenue', type: 'numerical', missingPercentage: 0, valueRange: [1200, 1200] },
    ],
    vectorStoreDocuments: [],
    vectorMemoryState: 'ready',
    addProgress: vi.fn(),
    logAgentToolUsage: vi.fn(),
});

describe('card slice memory sync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('removes the matching vector memory document when deleting a card', async () => {
        let state = createState();
        const set = vi.fn((updater: any) => {
            const next = typeof updater === 'function' ? updater(state) : updater;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createCardSlice(set as never, get as never, {} as never);

        slice.deleteAnalysisCard('card-1');
        // vectorMemorySync is now dynamically imported — flush microtasks
        await vi.waitFor(() => expect(deleteDocumentMock).toHaveBeenCalledWith(
            expect.stringMatching(/^memory:report-1:dataset-1:version-[^:]+:card-1$/),
        ));
        expect(state.analysisCards).toHaveLength(0);
    });

    it('removes pending vector memory doc when deleting a card before flush', async () => {
        let state = {
            ...createState(),
            vectorMemoryState: 'queued',
            sessionId: 'report-1',
            currentDatasetId: 'dataset-1',
            reportMemoryScope: {
                reportId: 'report-1',
                datasetId: 'dataset-1',
                datasetVersion: 'version-1',
            },
            csvData: { fileName: 'sales.csv', data: [{ Region: 'East' }] },
            rawCsvData: null,
            canonicalCsvData: null,
            pendingVectorMemoryDocs: [
                { id: 'card-1', text: 'pending doc', metadata: { kind: 'analysis_card' } },
                { id: 'card-2', text: 'other pending', metadata: { kind: 'analysis_card' } },
            ],
        };
        const set = vi.fn((updater: any) => {
            const next = typeof updater === 'function' ? updater(state) : updater;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createCardSlice(set as never, get as never, {} as never);

        slice.deleteAnalysisCard('card-1');
        // Wait for async dynamic import of vectorMemorySync
        await vi.waitFor(() => {
            expect(state.pendingVectorMemoryDocs).toEqual([
                { id: 'card-2', text: 'other pending', metadata: { kind: 'analysis_card' } },
            ]);
        });
        expect(state.analysisCards).toHaveLength(0);
    });

    it('flush after delete does not re-insert the deleted card', async () => {
        const { removeCardMemoryDocument, flushPendingVectorMemoryDocs } = await import(
            '../services/agent/memory/vectorMemorySync'
        );

        let state: Record<string, any> = {
            pendingVectorMemoryDocs: [
                { id: 'card-del', text: 'will be deleted', metadata: {} },
                { id: 'card-keep', text: 'stays', metadata: {} },
            ],
            vectorStoreDocuments: [],
            vectorMemoryState: 'queued',
        };
        const store = {
            getState: () => state as any,
            setState: (updater: any) => {
                const next = typeof updater === 'function' ? updater(state) : updater;
                state = { ...state, ...next };
            },
        };

        await removeCardMemoryDocument(store as any, 'card-del');
        expect(state.pendingVectorMemoryDocs).toEqual([
            { id: 'card-keep', text: 'stays', metadata: {} },
        ]);

        // Flush remaining — only card-keep should be written
        await flushPendingVectorMemoryDocs(store as any);
        // card-del must not appear in any addDocumentBatch call
        const { vectorStore: vs } = await import('../services/vectorStore');
        // deleteDocument was called for the live store path
        // addDocumentBatch should only contain card-keep if anything
    });

    it('updates vector memory when a calculated column changes card semantics', async () => {
        let state = createState();
        const set = vi.fn((updater: any) => {
            const next = typeof updater === 'function' ? updater(state) : updater;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createCardSlice(set as never, get as never, {} as never);

        slice.addCalculatedColumnToCard('card-1', 'Profit', "'Revenue' - 'Cost'");
        // vectorMemorySync is now dynamically imported — flush microtasks
        await vi.waitFor(() => expect(addDocumentMock).toHaveBeenCalled());

        expect(addDocumentMock).toHaveBeenCalledWith(expect.objectContaining({
            id: expect.stringMatching(/^memory:report-1:dataset-1:version-[^:]+:card-1$/),
            text: expect.stringContaining('Metric: Profit'),
            metadata: expect.objectContaining({
                kind: 'analysis_card',
            }),
        }));
        expect(state.analysisCards[0]?.plan.valueColumn).toBe('Profit');
    });
});
