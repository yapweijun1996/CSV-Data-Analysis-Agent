import React from 'react';
import { ChartType } from '../types';

interface ChartTypeSwitcherProps {
    currentType: ChartType;
    onChange: (type: ChartType) => void;
}

const ChartIcon: React.FC<{ type: ChartType }> = ({ type }) => {
    switch (type) {
        case 'bar':
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 10a1 1 0 011-1h1a1 1 0 011 1v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-4zM8 8a1 1 0 011-1h1a1 1 0 011 1v6a1 1 0 01-1 1H9a1 1 0 01-1-1V8zM14 4a1 1 0 011-1h1a1 1 0 011 1v10a1 1 0 01-1 1h-1a1 1 0 01-1-1V4z" />
                </svg>
            );
        case 'line':
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a1 1 0 001 1h12a1 1 0 100-2H5V3a1 1 0 00-2 0zm12.293 4.293a1 1 0 011.414 0l2 2a1 1 0 01-1.414 1.414L15 8.414l-2.293 2.293a1 1 0 01-1.414 0l-2-2a1 1 0 111.414-1.414L12 7.586l1.293-1.293z" clipRule="evenodd" />
                </svg>
            );
        case 'pie':
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                    <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
                </svg>
            );
        case 'doughnut':
             return (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 10a3 3 0 116 0 3 3 0 01-6 0z" clipRule="evenodd" />
                </svg>
            );
        case 'scatter':
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 3a2 2 0 100 4 2 2 0 000-4zM5 13a2 2 0 100 4 2 2 0 000-4zM15 3a2 2 0 100 4 2 2 0 000-4zM15 13a2 2 0 100 4 2 2 0 000-4zM8 8a2 2 0 100 4 2 2 0 000-4zM12 8a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
            );
        default:
            return null;
    }
};

const chartTypes: ChartType[] = ['bar', 'line', 'pie', 'doughnut', 'scatter'];

export const ChartTypeSwitcher: React.FC<ChartTypeSwitcherProps> = ({ currentType, onChange }) => {
    return (
        <div className="flex items-center space-x-1 bg-slate-200 p-1 rounded-md">
            {chartTypes.map(type => (
                <button
                    key={type}
                    onClick={() => onChange(type)}
                    title={`Switch to ${type} chart`}
                    className={`p-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${currentType === type ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-300 hover:text-slate-700'}`}
                >
                    <ChartIcon type={type} />
                </button>
            ))}
        </div>
    );
};