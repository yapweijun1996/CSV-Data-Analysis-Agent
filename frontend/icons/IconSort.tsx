import React from 'react';

export const IconSort: React.FC<{ direction?: 'ascending' | 'descending' }> = ({ direction }) => {
    if (!direction) {
        return <span className="text-slate-400">↕</span>;
    }
    return direction === 'ascending' ? <span className="text-slate-800">↑</span> : <span className="text-slate-800">↓</span>;
};
