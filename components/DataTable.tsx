import React from 'react';
import { CsvRow } from '../types';

interface DataTableProps {
    data: CsvRow[];
}

export const DataTable: React.FC<DataTableProps> = ({ data }) => {
    if (!data || data.length === 0) {
        return <p className="text-slate-500">No data to display.</p>;
    }

    const headers = Object.keys(data[0]);
    
    // Check if value is a number and format it
    const formatValue = (value: string | number) => {
        if (typeof value === 'number') {
            return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }
        return value;
    };

    return (
        <div className="w-full text-sm">
            <table className="w-full text-left">
                <thead className="bg-slate-100 text-slate-600">
                    <tr>
                        {headers.map(header => (
                            <th key={header} className="p-2 font-semibold">{header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white">
                    {data.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-slate-200 last:border-b-0">
                            {headers.map(header => (
                                <td key={`${rowIndex}-${header}`} className="p-2 text-slate-700">
                                    {formatValue(row[header])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};