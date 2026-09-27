import React from 'react';

export const SkeletonCard: React.FC = () => {
    return (
        <div className="bg-white rounded-card shadow-sm border border-slate-200 p-4 w-full max-w-md animate-pulse">
            <div className="flex items-center space-x-3 mb-4">
                <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
                <div className="h-4 w-32 bg-slate-200 rounded"></div>
            </div>
            <div className="space-y-3">
                <div className="h-3 w-full bg-slate-200 rounded"></div>
                <div className="h-3 w-5/6 bg-slate-200 rounded"></div>
                <div className="h-3 w-4/6 bg-slate-200 rounded"></div>
            </div>
            <div className="mt-6 h-32 bg-slate-100 rounded-md border border-slate-100"></div>
            <div className="mt-4 flex justify-between">
                <div className="h-3 w-16 bg-slate-200 rounded"></div>
                <div className="h-3 w-16 bg-slate-200 rounded"></div>
            </div>
        </div>
    );
};
