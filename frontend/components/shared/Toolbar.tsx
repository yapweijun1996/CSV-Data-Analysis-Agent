
import React from 'react';

/**
 * Shared container for grouped toolbar buttons.
 */
export const ToolbarButtonGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex items-center space-x-1 bg-slate-200 p-1 rounded-md">
        {children}
    </div>
);

/**
 * Button used inside ToolbarButtonGroup with active and inactive styling.
 */
export const ToolbarButton: React.FC<{ title: string; isActive: boolean; onClick: () => void; children: React.ReactNode; }> = ({ title, isActive, onClick, children }) => (
    <button
        onClick={onClick}
        title={title}
        className={`p-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isActive ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-300 hover:text-slate-700'}`}
    >
        {children}
    </button>
);
