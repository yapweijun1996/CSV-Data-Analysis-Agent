import React from 'react';
import { DataPreparationPlan, CsvRow } from '../types';
import { DataTable } from './DataTable';

interface DataPrepDebugPanelProps {
    plan: DataPreparationPlan;
    originalSample: CsvRow[];
    transformedSample: CsvRow[];
    isVisible: boolean;
    onToggleVisibility: () => void;
}

const ChevronIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);

const CodeIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);


export const DataPrepDebugPanel: React.FC<DataPrepDebugPanelProps> = ({ plan, originalSample, transformedSample, isVisible, onToggleVisibility }) => {
    return (
        <div className="bg-white rounded-lg shadow-lg flex flex-col transition-all duration-300 border border-slate-200">
            <button
                onClick={onToggleVisibility}
                className="flex justify-between items-center p-4 cursor-pointer w-full text-left rounded-t-lg hover:bg-slate-50"
                aria-expanded={isVisible}
            >
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center"><CodeIcon /> AI Data Transformation Log</h3>
                    <p className="text-sm text-slate-500">See how the AI cleaned and reshaped your data.</p>
                </div>
                <ChevronIcon isOpen={isVisible} />
            </button>
            
            {isVisible && (
                <div className="p-4 pt-0 space-y-6">
                    <div>
                        <h4 className="font-semibold text-slate-800 mb-2">AI's Plan</h4>
                        <p className="text-sm bg-slate-50 p-3 rounded-md border border-slate-200 text-slate-700 italic">"{plan.explanation}"</p>
                    </div>

                    <div>
                        <h4 className="font-semibold text-slate-800 mb-2">Transformation Code</h4>
                        <pre className="bg-slate-900 text-slate-100 p-3 rounded-md text-xs overflow-x-auto">
                            <code>
                                {`// AI-generated function to transform data\nfunction transform(data, _util) {\n${plan.jsFunctionBody}\n}`}
                            </code>
                        </pre>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="font-semibold text-slate-800 mb-2">Data Before (Raw Sample)</h4>
                            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-md">
                                <DataTable data={originalSample} />
                            </div>
                        </div>
                        <div>
                            <h4 className="font-semibold text-slate-800 mb-2">Data After (Transformed Sample)</h4>
                             <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-md">
                                <DataTable data={transformedSample} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};