import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { vectorStore } from '../services/vectorStore';
import { VectorStoreDocument } from '../types';

interface MemoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const CloseIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const DeleteIcon: React.FC = () => (
     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

type SearchResult = { text: string; score: number };

// Soft capacity limit for the visual progress bar (in KB)
const MEMORY_CAPACITY_KB = 5 * 1024; // 5 MB

export const MemoryPanel: React.FC<MemoryPanelProps> = ({ isOpen, onClose }) => {
    const [documents, setDocuments] = useState<VectorStoreDocument[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [highlightedDocText, setHighlightedDocText] = useState<string | null>(null);

    const isModelReady = vectorStore.getIsInitialized();

    const refreshDocuments = useCallback(() => {
        setDocuments(vectorStore.getDocuments());
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

    useEffect(() => {
        if (isOpen) {
            refreshDocuments();
        } else {
            // Reset state on close
            setSearchQuery('');
            setSearchResults([]);
            setHighlightedDocText(null);
        }
    }, [isOpen, refreshDocuments]);
    
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim() || !isModelReady) return;
        setIsSearching(true);
        setHighlightedDocText(null);
        const results = await vectorStore.search(searchQuery, 5);
        setSearchResults(results);
        setIsSearching(false);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this memory item?')) {
            vectorStore.deleteDocument(id);
            refreshDocuments();
        }
    };
    
    const handleClearAll = () => {
        if (window.confirm('Are you sure you want to clear all items from the AI\'s memory? This cannot be undone.')) {
            vectorStore.clear();
            refreshDocuments();
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
            className="fixed inset-0 bg-slate-900 bg-opacity-50 flex items-center justify-center z-50 transition-opacity"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl h-full max-h-[85vh] border border-slate-200 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex justify-between items-start mb-4 flex-shrink-0">
                     <div>
                        <div className="flex items-center space-x-3">
                            <span className="text-3xl">🧠</span>
                            <h2 className="text-2xl font-bold text-slate-900">AI Long-Term Memory</h2>
                        </div>
                        <div className="mt-2 pl-12">
                             <div className="flex items-baseline space-x-2 text-sm text-slate-500">
                                <span>{documents.length} items</span>
                                <span className="text-slate-300">|</span>
                                <span>Using ~{memoryUsage.toFixed(2)} KB</span>
                             </div>
                             <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1">
                                <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${memoryUsagePercentage}%` }}></div>
                             </div>
                        </div>
                     </div>
                     <button
                        onClick={onClose}
                        className="p-1 text-slate-500 rounded-full hover:bg-slate-100 hover:text-slate-800 transition-colors"
                        title="Close"
                    >
                        <CloseIcon />
                    </button>
                </header>
                
                <div className="flex-grow grid md:grid-cols-2 gap-6 min-h-0">
                    {/* Left Column: Search */}
                    <div className="flex flex-col min-h-0">
                         <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-lg flex-shrink-0">
                            <h3 className="font-semibold text-slate-800 mb-2">Test Similarity Search</h3>
                            <form onSubmit={handleSearch} className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={isModelReady ? "Enter query to find memories..." : "Memory model is loading..."}
                                    disabled={!isModelReady || isSearching}
                                    className="flex-grow bg-white border border-slate-300 rounded-md py-1.5 px-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                                />
                                <button type="submit" disabled={!isModelReady || isSearching || !searchQuery.trim()} className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed">
                                    {isSearching ? '...' : 'Search'}
                                </button>
                            </form>
                        </div>
                        <div className="flex-grow overflow-y-auto pr-2">
                            {searchResults.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium text-slate-600">Top Results:</h4>
                                    {searchResults.map((result, index) => (
                                        <div key={index} onClick={() => handleSearchResultClick(result.text)} className="bg-white p-2.5 border border-slate-200 rounded-lg text-xs cursor-pointer hover:border-blue-500 hover:ring-1 hover:ring-blue-500">
                                            <div className="flex justify-between items-center mb-1">
                                                 <p className="text-slate-700 font-semibold">Match</p>
                                                 <p className="text-blue-600 font-bold">{(result.score * 100).toFixed(1)}%</p>
                                            </div>
                                            <div className="w-full bg-slate-200 rounded-full h-1 mb-2">
                                                <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${result.score * 100}%`}}></div>
                                            </div>
                                            <p className="text-slate-600 italic">"{result.text}"</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Right Column: All Documents */}
                    <div className="flex flex-col min-h-0">
                        <div className="flex justify-between items-center mb-2 flex-shrink-0">
                            <h3 className="font-semibold text-slate-800">All Stored Memories ({documents.length})</h3>
                            {documents.length > 0 && (
                                <button onClick={handleClearAll} className="text-xs text-red-600 hover:underline">
                                    Clear All
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
                                            className={`p-3 bg-slate-50 rounded-lg text-sm text-slate-800 border border-slate-200 flex justify-between items-start group transition-all duration-300 ${highlightedDocText === doc.text ? 'border-blue-500 ring-2 ring-blue-500' : ''}`}>
                                            <p className="flex-grow pr-4 break-words">{doc.text}</p>
                                            <button 
                                                onClick={() => handleDelete(doc.id)}
                                                className="p-1 text-slate-400 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                                                title="Delete Memory"
                                            >
                                                <DeleteIcon />
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
