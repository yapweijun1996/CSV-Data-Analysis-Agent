import React, { useState } from 'react';
import { CsvRow, SortConfig } from '../types';

interface SpreadsheetTableProps {
    data: CsvRow[];
    sortConfig: SortConfig | null;
    onSort: (key: string) => void;
    columnWidths: { [key: string]: number };
    onColumnResizeStart: (header: string, e: React.MouseEvent) => void;
}

const ROWS_PER_PAGE = 50;

const SortIcon: React.FC<{ direction?: 'ascending' | 'descending' }> = ({ direction }) => {
    if (!direction) {
        return <span className="text-slate-400">↕</span>;
    }
    return direction === 'ascending' ? <span className="text-slate-800">↑</span> : <span className="text-slate-800">↓</span>;
};


export const SpreadsheetTable: React.FC<SpreadsheetTableProps> = ({ data, sortConfig, onSort, columnWidths, onColumnResizeStart }) => {
    const [currentPage, setCurrentPage] = useState(0);

    if (!data || data.length === 0) {
        return <p className="text-slate-500 p-4 text-center">No data matches your search.</p>;
    }

    const headers = Object.keys(data[0]);
    const totalPages = Math.ceil(data.length / ROWS_PER_PAGE);
    const startIndex = currentPage * ROWS_PER_PAGE;
    const paginatedData = data.slice(startIndex, startIndex + ROWS_PER_PAGE);

    const handlePrevPage = () => setCurrentPage(prev => Math.max(0, prev - 1));
    const handleNextPage = () => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
    
    const formatValue = (value: string | number) => {
        if (typeof value === 'number') {
            return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }
        return value;
    };
    
    const getColumnLetter = (index: number) => {
        let temp, letter = '';
        while (index >= 0) {
            temp = index % 26;
            letter = String.fromCharCode(temp + 65) + letter;
            index = Math.floor(index / 26) - 1;
        }
        return letter;
    }

    return (
        <div className="w-full text-sm h-full flex flex-col">
            <div className="flex-grow overflow-auto">
                <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                    <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10">
                        <tr>
                            <th className="p-2 font-semibold text-slate-500 text-center sticky left-0 z-20 bg-slate-100 border-r border-slate-200" style={{width: '60px'}}>#</th>
                            {headers.map((header, index) => (
                                <th 
                                    key={header} 
                                    className="p-2 font-semibold whitespace-nowrap border-r border-l border-slate-200 relative"
                                    style={{ width: columnWidths[header] || 150 }}
                                >
                                    <button onClick={() => onSort(header)} className="flex items-center justify-between w-full h-full">
                                        <span className="truncate" title={header}>{getColumnLetter(index)} - {header}</span>
                                        <SortIcon direction={sortConfig?.key === header ? sortConfig.direction : undefined} />
                                    </button>
                                    <div 
                                        onMouseDown={(e) => onColumnResizeStart(header, e)}
                                        className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-30" 
                                    />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        {paginatedData.map((row, rowIndex) => (
                            <tr key={rowIndex} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
                                <td className="p-2 text-slate-400 text-center sticky left-0 z-10 bg-white border-r border-slate-200" style={{width: '60px'}}>{startIndex + rowIndex + 1}</td>
                                {headers.map(header => (
                                    <td key={`${rowIndex}-${header}`} className="p-2 text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis border-r border-l border-slate-200">
                                        {formatValue(row[header])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {totalPages > 1 && (
                <div className="flex justify-between items-center p-2 bg-slate-100 border-t border-slate-200 flex-shrink-0">
                    <span className="text-xs text-slate-500">
                        Showing {startIndex + 1} - {Math.min(startIndex + ROWS_PER_PAGE, data.length)} of {data.length} rows
                    </span>
                    <div className="flex items-center space-x-2">
                        <button onClick={handlePrevPage} disabled={currentPage === 0} className="px-2 py-1 text-xs bg-slate-200 rounded disabled:opacity-50 hover:bg-slate-300">
                            Previous
                        </button>
                        <span className="text-xs text-slate-500">Page {currentPage + 1} of {totalPages}</span>
                        <button onClick={handleNextPage} disabled={currentPage === totalPages - 1} className="px-2 py-1 text-xs bg-slate-200 rounded disabled:opacity-50 hover:bg-slate-300">
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};