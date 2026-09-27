
import React from 'react';

/**
 * Placeholder UI that mirrors the AnalysisCard layout while content is loading.
 */
export const SkeletonCard: React.FC = () => {
  return (
    <div className="bg-white rounded-card shadow-lg p-4 w-full mx-auto border border-slate-200">
      <div className="animate-pulse flex flex-col space-y-4">
        {/* Header placeholder */}
        <div className="flex justify-between items-start">
          <div className="space-y-2 flex-1 pr-4">
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            <div className="h-3 bg-slate-200 rounded w-full"></div>
          </div>
          <div className="h-8 w-24 bg-slate-200 rounded-md"></div>
        </div>
        
        {/* Chart placeholder */}
        <div className="h-48 bg-slate-200 rounded-md"></div>
        
        {/* Summary placeholder */}
        <div className="space-y-2 pt-4 border-t border-slate-200">
            <div className="space-y-3 bg-slate-50 p-3 rounded-md">
                <div className="h-3 bg-slate-200 rounded w-1/4"></div>
                <div className="h-3 bg-slate-200 rounded"></div>
                <div className="h-3 bg-slate-200 rounded w-5/6"></div>
            </div>
        </div>
      </div>
    </div>
  );
};
