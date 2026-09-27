import React from 'react';
import { IconAi } from '../../icons/IconAi';
import { IconLoadingSpinner } from '../../icons/IconLoadingSpinner';
import { IconSearch } from '../../icons/IconSearch';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';

interface SpreadsheetControlsProps {
    filterText: string;
    onFilterTextChange: (text: string) => void;
    onQuerySubmit: () => void;
    isAiFiltering: boolean;
    aiEnabled: boolean;
}

export const SpreadsheetControls: React.FC<SpreadsheetControlsProps> = ({
    filterText,
    onFilterTextChange,
    onQuerySubmit,
    isAiFiltering,
    aiEnabled
}) => {
    const language = useAppStore(state => state.settings.language);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            onQuerySubmit();
        }
    };

    return (
        <div className="flex items-center gap-2">
            <div className="relative flex-grow">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <IconSearch />
                </div>
                <input
                    type="text"
                    placeholder={getTranslation('spreadsheet_search_placeholder', language)}
                    value={filterText}
                    onChange={(e) => onFilterTextChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="bg-white border border-slate-300 rounded-md py-1.5 pl-10 pr-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                />
            </div>
            <button
                onClick={onQuerySubmit}
                disabled={!aiEnabled || isAiFiltering || !filterText.trim()}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                title={getTranslation('spreadsheet_ask_ai', language)}
            >
                {isAiFiltering ? <IconLoadingSpinner /> : <IconAi />}
                <span>{getTranslation('spreadsheet_ask_ai', language)}</span>
            </button>
        </div>
    );
};
