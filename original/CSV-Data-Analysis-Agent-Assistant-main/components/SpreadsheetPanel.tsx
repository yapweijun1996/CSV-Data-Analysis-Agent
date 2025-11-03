import React, { useState, useMemo, useEffect } from 'react';
import { CsvData, SortConfig, CsvRow } from '../types';
import { SpreadsheetTable } from './SpreadsheetTable';

interface SpreadsheetPanelProps {
    csvData: CsvData;
    isVisible: boolean;
    onToggleVisibility: () => void;
}

const SearchIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

const ChevronIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);


export const SpreadsheetPanel: React.FC<SpreadsheetPanelProps> = ({ csvData, isVisible, onToggleVisibility }) => {
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
    const [filterText, setFilterText] = useState('');
    const [isWholeWordSearch, setIsWholeWordSearch] = useState(false);
    
    const headers = useMemo(() => csvData.data.length > 0 ? Object.keys(csvData.data[0]) : [], [csvData.data]);
    const [columnWidths, setColumnWidths] = useState<{[key: string]: number}>({});

    useEffect(() => {
        const initialWidths: {[key: string]: number} = {};
        headers.forEach(h => {
            const headerLength = h.length * 8 + 30; // Estimate width based on text
            const sampleDataLength = String(csvData.data[0]?.[h] || '').length * 7;
            initialWidths[h] = Math.max(120, headerLength, sampleDataLength);
        });
        setColumnWidths(initialWidths);
    }, [headers, csvData.data]);


    const handleSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const handleColumnResizeStart = (header: string, e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = columnWidths[header];

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = startWidth + (moveEvent.clientX - startX);
            if (newWidth > 60) { // Min width
                setColumnWidths(prev => ({ ...prev, [header]: newWidth }));
            }
        };
        
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
        };

        document.body.style.cursor = 'col-resize';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const processedData = useMemo(() => {
        let dataToProcess: CsvRow[] = [...csvData.data];

        // Filtering
        if (filterText) {
            if (isWholeWordSearch) {
                const escapedFilter = filterText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regex = new RegExp(`\\b${escapedFilter}\\b`, 'i');
                dataToProcess = dataToProcess.filter(row =>
                    Object.values(row).some(value =>
                        regex.test(String(value))
                    )
                );
            } else {
                const lowercasedFilter = filterText.toLowerCase();
                dataToProcess = dataToProcess.filter(row =>
                    Object.values(row).some(value =>
                        String(value).toLowerCase().includes(lowercasedFilter)
                    )
                );
            }
        }

        // Sorting
        if (sortConfig !== null) {
            dataToProcess.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;
                
                if (typeof aValue === 'number' && typeof bValue === 'number') {
                     return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
                }
                
                const strA = String(aValue).toLowerCase();
                const strB = String(bValue).toLowerCase();

                if (strA < strB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (strA > strB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }

        return dataToProcess;
    }, [csvData.data, sortConfig, filterText, isWholeWordSearch]);
    
    return (
        <div className="bg-white rounded-lg shadow-lg flex flex-col transition-all duration-300 border border-slate-200">
            <button
                onClick={onToggleVisibility}
                className="flex justify-between items-center p-4 cursor-pointer w-full text-left rounded-t-lg hover:bg-slate-50"
                aria-expanded={isVisible}
            >
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Raw Data Explorer</h3>
                    <p className="text-sm text-slate-500">File: {csvData.fileName}</p>
                </div>
                <ChevronIcon isOpen={isVisible} />
            </button>
            
            {isVisible && (
                <div className="flex flex-col h-full p-4 pt-0">
                    <div className="flex items-center space-x-4 mb-4">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <SearchIcon />
                            </div>
                            <input
                                type="text"
                                placeholder="Search table..."
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                                className="bg-white border border-slate-300 rounded-md py-1.5 pl-10 pr-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-64"
                            />
                        </div>
                         <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="whole-word-search"
                                checked={isWholeWordSearch}
                                onChange={(e) => setIsWholeWordSearch(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 bg-slate-100 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <label htmlFor="whole-word-search" className="ml-2 text-sm text-slate-700 select-none cursor-pointer">
                                Whole word
                            </label>
                        </div>
                    </div>
                    <div className="flex-grow overflow-auto border border-slate-200 rounded-md" style={{maxHeight: '60vh'}}>
                         <SpreadsheetTable 
                            data={processedData}
                            sortConfig={sortConfig}
                            onSort={handleSort}
                            columnWidths={columnWidths}
                            onColumnResizeStart={handleColumnResizeStart}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};