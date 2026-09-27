
import React from 'react';
import { getTranslation } from '../../utils/localization';

const MoreDotsIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
    </svg>
);

interface HistoryOverflowMenuProps {
    reportId: string;
    reportFilename: string;
    isOpen: boolean;
    isProtected: boolean;
    language: string;
    overflowRef: React.RefObject<HTMLDivElement | null>;
    onToggle: (id: string | null) => void;
    onOpenReport: (id: string) => void;
    onExportPdf: (id: string) => void;
    onDelete: (id: string, filename: string) => void;
}

export const HistoryOverflowMenu: React.FC<HistoryOverflowMenuProps> = ({
    reportId, reportFilename, isOpen, isProtected, language,
    overflowRef, onToggle, onOpenReport, onExportPdf, onDelete,
}) => (
    <div className="relative" ref={isOpen ? overflowRef : undefined}>
        <button
            onClick={(e) => { e.stopPropagation(); onToggle(isOpen ? null : reportId); }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
            title={getTranslation('history_more_actions', language)}
        >
            <MoreDotsIcon />
        </button>
        {isOpen && (
            <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
                <button
                    onClick={() => { onOpenReport(reportId); onToggle(null); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                    {getTranslation('history_open_report', language)}
                </button>
                <button
                    onClick={() => { onExportPdf(reportId); onToggle(null); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                    {getTranslation('history_export_pdf', language)}
                </button>
                {!isProtected && (
                    <>
                        <div className="my-1 border-t border-slate-100" />
                        <button
                            onClick={() => onDelete(reportId, reportFilename)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                            {getTranslation('history_delete', language)}
                        </button>
                    </>
                )}
            </div>
        )}
    </div>
);
