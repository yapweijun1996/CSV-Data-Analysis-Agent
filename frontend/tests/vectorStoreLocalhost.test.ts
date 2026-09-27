import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the vector worker client — jsdom does not support Web Workers.
const initMock = vi.fn();
const addDocumentMock = vi.fn();
const addDocumentBatchMock = vi.fn();
const searchMock = vi.fn();
const clearMock = vi.fn();
const rehydrateMock = vi.fn();
const getDocumentsMock = vi.fn();
const getDocumentCountMock = vi.fn();
const deleteDocumentMock = vi.fn();
const onStatusMock = vi.fn();
const onProgressMock = vi.fn();

vi.mock('../services/workers/vectorWorkerClient', () => ({
    vectorWorkerClient: {
        init: initMock,
        addDocument: addDocumentMock,
        addDocumentBatch: addDocumentBatchMock,
        search: searchMock,
        clear: clearMock,
        rehydrate: rehydrateMock,
        getDocuments: getDocumentsMock,
        getDocumentCount: getDocumentCountMock,
        deleteDocument: deleteDocumentMock,
        onStatus: onStatusMock.mockReturnValue(() => {}),
        onProgress: onProgressMock.mockReturnValue(() => {}),
        getStatus: () => 'idle' as const,
        getLastError: () => null,
    },
}));

describe('vectorStore worker-backed facade', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        initMock.mockResolvedValue(undefined);
        addDocumentMock.mockResolvedValue({ added: true });
        addDocumentBatchMock.mockResolvedValue({ count: 0 });
        searchMock.mockResolvedValue([]);
        clearMock.mockResolvedValue(undefined);
        rehydrateMock.mockResolvedValue({ count: 0 });
        getDocumentsMock.mockResolvedValue([]);
        getDocumentCountMock.mockResolvedValue(0);
        deleteDocumentMock.mockResolvedValue(false);
    });

    it('delegates init to the worker client', async () => {
        const { vectorStore } = await import('../services/vectorStore');
        await vectorStore.init();
        expect(initMock).toHaveBeenCalledTimes(1);
    });

    it('delegates addDocument to the worker client', async () => {
        const { vectorStore } = await import('../services/vectorStore');
        await vectorStore.addDocument({ id: 'doc-1', text: 'Hello world' });
        expect(addDocumentMock).toHaveBeenCalledWith({ id: 'doc-1', text: 'Hello world' });
    });

    it('delegates search to the worker client', async () => {
        searchMock.mockResolvedValue([{ id: 'doc-1', text: 'Hello', score: 0.9 }]);
        const { vectorStore } = await import('../services/vectorStore');
        // Simulate initialized state so searchIfReady proceeds.
        // The facade mirrors worker status via onStatus listener.
        // For this test, call search() directly which doesn't check isInitialized.
        const results = await vectorStore.search('Hello', 3);
        expect(searchMock).toHaveBeenCalledWith('Hello', 3);
        expect(results).toEqual([{ id: 'doc-1', text: 'Hello', score: 0.9 }]);
    });

    it('does not retry init after permanent failure', async () => {
        initMock.mockRejectedValue(new Error('WASM backend unavailable'));
        const { vectorStore } = await import('../services/vectorStore');

        await vectorStore.init();
        expect(vectorStore.getStatus()).toBe('error');

        // Second call should not retry
        initMock.mockClear();
        await vectorStore.init();
        expect(initMock).not.toHaveBeenCalled();
    });

    it('delegates clear and rehydrate to the worker client', async () => {
        const { vectorStore } = await import('../services/vectorStore');
        await vectorStore.clear();
        expect(clearMock).toHaveBeenCalledTimes(1);

        const docs = [{ id: 'doc-1', text: 'Test', embedding: [0.1, 0.2], metadata: { kind: 'dataset' as const, memoryFormatVersion: 'ir-v1' as const } }];
        await vectorStore.rehydrate(docs);
        expect(rehydrateMock).toHaveBeenCalledWith(docs);
    });

    it('delegates getDocuments to the worker client', async () => {
        const mockDocs = [{ id: 'doc-1', text: 'Test', embedding: [0.1] }];
        getDocumentsMock.mockResolvedValue(mockDocs);
        const { vectorStore } = await import('../services/vectorStore');

        const docs = await vectorStore.getDocuments();
        expect(getDocumentsMock).toHaveBeenCalledTimes(1);
        expect(docs).toEqual(mockDocs);
    });
});
