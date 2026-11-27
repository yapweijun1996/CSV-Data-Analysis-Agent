import React, { useEffect, useRef, useState } from 'react';
import { getTranslation } from '../utils/localization';
import { MAX_REPORT_NAME_LENGTH } from '../services/storageService';

interface RenameReportFieldProps {
    /** Current custom name (empty when the default name is in use). */
    initialValue: string;
    /** Shown while the field is empty; the default name that will be used. */
    placeholder: string;
    language: string;
    onCommit: (name: string) => void;
    onCancel: () => void;
    className?: string;
}

/** Inline text field: Enter or blur saves, Escape cancels. */
export const RenameReportField: React.FC<RenameReportFieldProps> = ({
    initialValue, placeholder, language, onCommit, onCancel, className = '',
}) => {
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);
    const doneRef = useRef(false);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const finish = (save: boolean) => {
        if (doneRef.current) return;
        doneRef.current = true;
        if (save) onCommit(value); else onCancel();
    };

    return (
        <input
            ref={inputRef}
            type="text"
            value={value}
            maxLength={MAX_REPORT_NAME_LENGTH}
            placeholder={placeholder}
            aria-label={getTranslation('report_rename_label', language)}
            title={getTranslation('report_rename_hint', language)}
            data-rename-report-input="true"
            onChange={event => setValue(event.target.value)}
            onClick={event => event.stopPropagation()}
            onBlur={() => finish(true)}
            onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); finish(true); }
                else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
            }}
            className={`min-h-[36px] w-full rounded-md border border-accent-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-500 ${className}`}
        />
    );
};
