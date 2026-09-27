
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { vectorStore } from '../../services/vectorStore';
import { VectorStoreDocument } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { flushPendingVectorMemoryDocs } from '../../services/agent/memory/vectorMemorySync';
import { IconClose } from '../../icons/IconClose';
import { IconMemory } from '../../icons/IconMemory';
import { IconDelete } from '../../icons/IconDelete';
import { resolveReportMemoryScope } from '../../services/agent/memory/memoryScope';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

type SearchResult = {
    text: string;
    score: number;
    origin?: string;
};

// Soft capacity limit for the visual progress bar (in KB)
const MEMORY_CAPACITY_KB = 5 * 1024; // 5 MB

export const MemoryPanel: React.FC = () => {
    const isOpen = useAppStore(state => state.isMemoryPanelOpen);
    const onClose = () => useAppStore.getState().setIsMemoryPanelOpen(false);

    const [documents, setDocuments] = useState<VectorStoreDocument[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [highlightedDocText, setHighlightedDocText] = useState<string | null>(null);
    const [modelStatus, setModelStatus] = useState(vectorStore.getStatus());
    const [modelError, setModelError] = useState(vectorStore.getLastError());
    const dialogRef = useDialogAccessibility<HTMLDivElement>(isOpen, onClose);

    const isModelReady = modelStatus === 'ready';
    const activeMemoryScope = resolveReportMemoryScope(useAppStore.getState());

    const refreshDocuments = useCallback(async () => {
        const scope = resolveReportMemoryScope(useAppStore.getState());
        const docs = await vectorStore.getDocumentsForScope(scope);
        setDocuments(docs);
    }, []);

    const syncModelState = useCallback(() => {
        setModelStatus(vectorStore.getStatus());
        setModelError(vectorStore.getLastError());
    }, []);

    const memoryUsage = useMemo(() => {
        if (documents.length === 0) return 0;
        // Estimate the size of the stored documents
        // Size of text (assuming average 2 bytes per char for UTF-16)
        const textSize = documents.reduce((acc, doc) => acc + (doc.text.length * 2), 0);
        // Size of embeddings (384 dimensions * 4 bytes per float32)
        const embeddingSize = documents.length * 384 * 4;
        return (textSize + embeddingSize) / 1024; // in KB
    }, [documents]);

    // Track whether we've already triggered activation for this panel open.
    const activationTriggered = useRef(false);

    useEffect(() => {
        if (isOpen) {
            void refreshDocuments();
            syncModelState();

            // Trigger on-demand vector memory activation when the panel opens (PERF-103).
            if (!activationTriggered.current) {
                activationTriggered.current = true;
                const store = { getState: useAppStore.getState, setState: useAppStore.setState };
                void vectorStore.ensureVectorMemoryReady(
                    'memory_panel',
                    store as never,
                    async (s) => {
                        await flushPendingVectorMemoryDocs(s as never);
                        void refreshDocuments();
                        syncModelState();
                    },
                ).then(() => {
                    syncModelState();
                    void refreshDocuments();
                });
            }
        } else {
            // Reset state on close
            activationTriggered.current = false;
            setSearchQuery('');
            setSearchResults([]);
            setHighlightedDocText(null);
        }
    }, [isOpen, refreshDocuments, syncModelState]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim() || modelStatus === 'loading') return;
        setIsSearching(true);
        setHighlightedDocText(null);
        syncModelState();
        const scope = resolveReportMemoryScope(useAppStore.getState());
        if (!scope) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }
        const results = await vectorStore.search(searchQuery, 5, scope);
        setSearchResults(results.map(item => ({
            text: item.text,
            score: item.score,
            origin: item.metadata?.origin?.label,
        })));
        syncModelState();
        setIsSearching(false);
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this memory item?')) {
            await vectorStore.deleteDocument(id);
            vectorStore.schedulePersist();
            useAppStore.setState({
                vectorStoreDocuments: await vectorStore.getDocuments(),
            });
            await refreshDocuments();
        }
    };

    const handleClearAll = async () => {
        if (window.confirm('Are you sure you want to clear all memory items for this report and dataset version? This cannot be undone.')) {
            await Promise.all(documents.map(document =>
                vectorStore.deleteDocument(document.id)));
            vectorStore.schedulePersist();
            useAppStore.setState({
                vectorStoreDocuments: await vectorStore.getDocuments(),
            });
            await refreshDocuments();
            setSearchResults([]);
        }
    };

    const handleSearchResultClick = (text: string) => {
        setHighlightedDocText(text);
        const element = document.getElementById(`memory-doc-${text.substring(0, 30)}`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (!isOpen) return null;

    const memoryUsagePercentage = Math.min((memoryUsage / MEMORY_CAPACITY_KB) * 100, 100);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 bg-opacity-50 p-4 transition-opacity"
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="memory-dialog-title"
                tabIndex={-1}
                className="flex h-full max-h-[85vh] w-full max-w-4xl flex-col rounded-card border border-slate-200 bg-white p-4 shadow-xl"
                onClick={e => e.stopPropagation()}
            >
                <header className="mb-3 flex shrink-0 items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700" aria-hidden="true">
                                <IconMemory />
                            </span>
                            <h2 id="memory-dialog-title" className="text-2xl font-bold text-slate-900">AI Long-Term Memory</h2>
                        </div>
                        <div className="mt-2 pl-12">
                            <div className="flex items-baseline gap-2 text-sm text-slate-500">
                                <span>{documents.length} items</span>
                                <span className="text-slate-300">|</span>
                                <span>Using ~{memoryUsage.toFixed(2)} KB</span>
                             </div>
                            {activeMemoryScope && (
                                <p className="mt-1 max-w-2xl break-words text-[11px] text-slate-500">
                                    Active scope: Report {activeMemoryScope.reportId} · Dataset {activeMemoryScope.datasetId} · Version {activeMemoryScope.datasetVersion}
                                </p>
                            )}
                            <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200">
                                <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${memoryUsagePercentage}%` }}></div>
                            </div>
                        </div>
                    </div>
                    <button
                        data-dialog-initial-focus
                        onClick={onClose}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        title="Close"
                        aria-label="Close memory"
                    >
                        <IconClose />
                    </button>
                </header>

                <div className="grid min-h-0 flex-grow gap-4 md:grid-cols-2">
                    {/* Left Column: Search */}
                    <div className="flex flex-col min-h-0">
                        <div className="mb-4 shrink-0 rounded-card border border-slate-200 bg-slate-50 p-4">
                            <h3 className="mb-2 font-semibold text-slate-800">Test Similarity Search</h3>
                            <p className="mb-2 text-xs text-slate-500">
                                {modelStatus === 'idle' && 'The local memory model will load the first time semantic search runs.'}
                                {modelStatus === 'loading' && 'Loading the local memory model and WASM assets.'}
                                {modelStatus === 'ready' && 'Local memory model is ready.'}
                                {modelStatus === 'error' && `Local memory model failed to load. ${modelError ?? ''}`.trim()}
                            </p>
                            <form onSubmit={handleSearch} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={isModelReady ? "Enter query to find memories..." : modelStatus === 'loading' ? "Memory model is loading..." : "Run a search to load the memory model"}
                                    disabled={modelStatus === 'loading' || isSearching}
                                    className="flex-grow bg-white border border-slate-300 rounded-md py-1.5 px-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                                />
                                <button type="submit" disabled={modelStatus === 'loading' || isSearching || !searchQuery.trim()} className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed">
                                    {isSearching ? '...' : 'Search'}
                                </button>
                            </form>
                        </div>
                        <div className="flex-grow overflow-y-auto pr-2">
                            {searchResults.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium text-slate-600">Top Results:</h4>
                                    {searchResults.map((result) => (
                                        <div key={result.text} onClick={() => handleSearchResultClick(result.text)} className="bg-white p-2.5 border border-slate-200 rounded-card text-xs cursor-pointer hover:border-blue-500 hover:ring-1 hover:ring-blue-500">
                                            <div className="flex justify-between items-center mb-1">
                                                 <p className="text-slate-700 font-semibold">Match</p>
                                                 <p className="text-blue-600 font-bold">{(result.score * 100).toFixed(1)}%</p>
                                            </div>
                                            <div className="w-full bg-slate-200 rounded-full h-1 mb-2">
                                                <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${result.score * 100}%`}}></div>
                                            </div>
                                            <p className="text-slate-600 italic">"{result.text}"</p>
                                            {result.origin && (
                                                <p className="mt-1 text-[11px] text-slate-500">Origin: {result.origin}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: All Documents */}
                    <div className="flex flex-col min-h-0">
                        <div className="mb-2 flex shrink-0 items-center justify-between">
                            <h3 className="font-semibold text-slate-800">All Stored Memories ({documents.length})</h3>
                            {documents.length > 0 && (
                                <button onClick={handleClearAll} className="text-xs text-red-600 hover:underline">
                                    Clear Report Memory
                                </button>
                            )}
                        </div>
                        <div className="flex-grow overflow-y-auto pr-2 border-t border-slate-200 pt-2">
                            {documents.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                                    <p>The AI's memory is currently empty.</p>
                                </div>
                            ) : (
                                <ul className="space-y-2">
                                    {documents.map(doc => (
                                        <li
                                            key={doc.id}
                                            id={`memory-doc-${doc.text.substring(0, 30)}`}
                                            className={`p-3 bg-slate-50 rounded-card text-sm text-slate-800 border border-slate-200 flex justify-between items-start group transition-all duration-300 ${highlightedDocText === doc.text ? 'border-blue-500 ring-2 ring-blue-500' : ''}`}>
                                            <div className="flex-grow pr-4 break-words">
                                                <p>{doc.text}</p>
                                                <p className="mt-2 text-xs text-slate-500">
                                                    Origin: {doc.metadata?.origin?.label ?? 'Legacy memory (unverified origin)'}
                                                </p>
                                                {doc.metadata?.scope && (
                                                    <p className="mt-0.5 text-[11px] text-slate-400">
                                                        Report {doc.metadata.scope.reportId} · Dataset {doc.metadata.scope.datasetId} · Version {doc.metadata.scope.datasetVersion}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleDelete(doc.id)}
                                                className="p-1 text-slate-400 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                                                title="Delete Memory"
                                            >
                                                <IconDelete />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
