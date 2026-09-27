import React from 'react';
import { ProgressMessage } from '../../types';

export const ProgressLog: React.FC<{ msg: ProgressMessage }> = ({ msg }) => {
    const toneClass = msg.type === 'error'
        ? 'text-red-600'
        : msg.type === 'warning'
            ? 'text-amber-700'
            : 'text-slate-500';

    return (
        <div className={`flex text-xs animate-fade-in ${toneClass}`}>
            {/* Timestamp */}
            <span className="mr-2 text-slate-400">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span>
                {/* Render the log message text. */}
                {msg.text}
            </span>
        </div>
    );
};
