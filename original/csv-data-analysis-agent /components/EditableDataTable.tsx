import React, { useState } from 'react';
import { CsvRow } from '../types';

interface EditableDataTableProps {
    data: CsvRow[];
}

const ROWS_PER_PAGE = 50;

export const EditableDataTable: React.FC<EditableDataTableProps> = ({ data }) => {
    const [currentPage, setCurrentPage] = useState(0);

    if (!data || data.length === 0) {
        return <p className="text-gray-400 p-4">No data to display.</p>;
    }

    const headers = Object.keys(data[0]);
    const totalPages = Math.ceil(data.length / ROWS_PER_PAGE);
    const startIndex = currentPage * ROWS_PER_PAGE;
    const paginatedData = data.slice(startIndex, startIndex + ROWS_PER_PAGE);

    const handlePrevPage = () => {
        setCurrentPage(prev => Math.max(0, prev - 1));
    };

    const handleNextPage = () => {
        setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
    };
    
    const formatValue = (value: string | number) => {
        if (typeof value === 'number') {
            return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }
        return value;
    };

    return (
        <div className="w-full text-sm bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left table-auto">
                    <thead className="bg-gray-700 text-gray-300 sticky top-0">
                        <tr>
                            <th className="p-2 font-semibold text-gray-400 w-12 text-center">#</th>
                            {headers.map(header => (
                                <th key={header} className="p-2 font-semibold whitespace-nowrap">{header}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800">
                        {paginatedData.map((row, rowIndex) => (
                            <tr key={rowIndex} className="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50">
                                <td className="p-2 text-gray-500 text-center">{startIndex + rowIndex + 1}</td>
                                {headers.map(header => (
                                    <td key={`${rowIndex}-${header}`} className="p-2 text-gray-400 whitespace-nowrap">
                                        {formatValue(row[header])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {totalPages > 1 && (
                <div className="flex justify-between items-center p-2 bg-gray-700 border-t border-gray-600">
                    <span className="text-xs text-gray-400">
                        Showing {startIndex + 1} - {Math.min(startIndex + ROWS_PER_PAGE, data.length)} of {data.length} rows
                    </span>
                    <div className="flex items-center space-x-2">
                        <button onClick={handlePrevPage} disabled={currentPage === 0} className="px-2 py-1 text-xs bg-gray-600 rounded disabled:opacity-50 hover:bg-gray-500">
                            Previous
                        </button>
                        <span className="text-xs text-gray-400">Page {currentPage + 1} of {totalPages}</span>
                        <button onClick={handleNextPage} disabled={currentPage === totalPages - 1} className="px-2 py-1 text-xs bg-gray-600 rounded disabled:opacity-50 hover:bg-gray-500">
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
