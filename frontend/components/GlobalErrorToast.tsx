import React, { useState } from 'react';
import type { GlobalErrorToast as GlobalErrorToastData } from '../store/slices/uiSlice';
import { getTranslation } from '../utils/localization';

interface GlobalErrorToastProps {
    toast: GlobalErrorToastData;
    language: string;
    onDismiss: () => void;
    onStartOver: () => void;
}

export const GlobalErrorToast: React.FC<GlobalErrorToastProps> = ({
    toast,
    language,
    onDismiss,
    onStartOver,
}) => {
    const [isDetailExpanded, setIsDetailExpanded] = useState(false);

    const handleDismiss = () => {
        setIsDetailExpanded(false);
        onDismiss();
    };

    const handleStartOver = () => {
        setIsDetailExpanded(false);
        onStartOver();
    };

    return (
        <div
            role="alert"
            aria-live="assertive"
            className="fixed bottom-4 right-4 z-[9999] w-80 rounded-lg border border-amber-300 bg-amber-50 shadow-lg p-4"
        >
            <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-amber-900 leading-snug flex-1">
                    {toast.message}
                </p>
                <button
                    onClick={handleDismiss}
                    className="shrink-0 text-amber-600 hover:text-amber-900 text-lg leading-none"
                    aria-label="close"
                >
                    ×
                </button>
            </div>
            {toast.errorSummary && (
                <button
                    onClick={() => setIsDetailExpanded(v => !v)}
                    className="mt-1 text-xs text-amber-600 hover:underline"
                >
                    {getTranslation(isDetailExpanded ? 'error_detail_hide' : 'error_detail_show', language)}
                </button>
            )}
            {isDetailExpanded && toast.errorSummary && (
                <pre className="mt-1 text-xs bg-amber-100 rounded p-2 overflow-auto max-h-24 text-amber-800 whitespace-pre-wrap break-all">
                    {toast.errorSummary}
                </pre>
            )}
            <div className="mt-3 flex gap-2">
                <button
                    onClick={handleStartOver}
                    className="flex-1 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                >
                    {getTranslation('global_error_restart_button', language)}
                </button>
                <button
                    onClick={handleDismiss}
                    className="flex-1 rounded border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                    {getTranslation('global_error_dismiss_button', language)}
                </button>
            </div>
        </div>
    );
};
