import React from 'react';
import { ReportListItem } from '../types';
import { CURRENT_SESSION_KEY } from '../storageService';

interface HistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    reports: ReportListItem[];
    onLoadReport: (id: string) => void;
    onDeleteReport: (id: string) => void;
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


export const HistoryPanel: React.FC<HistoryPanelProps> = ({ isOpen, onClose, reports, onLoadReport, onDeleteReport }) => {
    if (!isOpen) {
        return null;
    }

    const handleDelete = (e: React.MouseEvent, id: string, filename: string) => {
        e.stopPropagation(); // Prevent load action when clicking delete
        if (window.confirm(`Are you sure you want to delete the report for "${filename}"? This cannot be undone.`)) {
            onDeleteReport(id);
        }
    };

    return (
        <div 
            className="fixed inset-0 bg-slate-900 bg-opacity-50 flex items-center justify-center z-50"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl h-full max-h-[80vh] border border-slate-200 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                     <h2 className="text-2xl font-bold text-slate-900">Analysis History</h2>
                     <button
                        onClick={onClose}
                        className="p-1 text-slate-500 rounded-full hover:bg-slate-100 hover:text-slate-800 transition-colors"
                        title="Close History"
                    >
                        <CloseIcon />
                    </button>
                </div>
                
                <div className="flex-grow overflow-y-auto pr-2">
                    {reports.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-slate-500">No past reports found. Upload a CSV to start.</p>
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {reports.map(report => {
                                const isCurrentSession = report.id === CURRENT_SESSION_KEY;
                                return (
                                <li key={report.id}>
                                    <div
                                        onClick={() => !isCurrentSession && onLoadReport(report.id)}
                                        className={`block p-4 bg-slate-50 rounded-lg transition-all ${isCurrentSession ? 'ring-2 ring-blue-500 cursor-default' : 'hover:bg-slate-100 hover:ring-2 hover:ring-blue-500 cursor-pointer'}`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="font-semibold text-slate-800 truncate">
                                                  {isCurrentSession ? 
                                                    <span className="text-blue-600 font-bold">[Current Session] </span> 
                                                    : null
                                                  }
                                                  {report.filename}
                                                </p>
                                                <p className="text-sm text-slate-500">
                                                    Last saved: {new Date(report.updatedAt).toLocaleString()}
                                                </p>
                                            </div>
                                            {!isCurrentSession && (
                                              <button 
                                                  onClick={(e) => handleDelete(e, report.id, report.filename)}
                                                  className="p-2 text-slate-500 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors flex-shrink-0 ml-4"
                                                  title="Delete Report"
                                              >
                                                  <DeleteIcon />
                                              </button>
                                            )}
                                        </div>
                                    </div>
                                </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
                <p className="text-xs text-slate-500 mt-4 text-center">Your reports are saved securely in your browser's IndexedDB.</p>
            </div>
        </div>
    );
};