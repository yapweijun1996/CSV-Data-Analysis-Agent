import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UserColumnAnnotation } from '../../types';
import { getTranslation } from '../../utils/localization';

interface ColumnAnnotationPopoverProps {
    columnName: string;
    columnType?: string;
    existingAnnotation?: UserColumnAnnotation;
    anchorRect: DOMRect;
    language?: string;
    onSave: (annotation: UserColumnAnnotation) => void;
    onRemove: (columnName: string) => void;
    onClose: () => void;
}

const getRoleOptions = (language: string): Array<{ value: UserColumnAnnotation['businessRole']; label: string }> => [
    { value: undefined, label: getTranslation('column_annotation_role_unspecified', language) },
    { value: 'dimension', label: getTranslation('column_annotation_role_dimension', language) },
    { value: 'metric', label: getTranslation('column_annotation_role_metric', language) },
    { value: 'identifier', label: getTranslation('column_annotation_role_identifier', language) },
    { value: 'helper', label: getTranslation('column_annotation_role_helper', language) },
];

export const ColumnAnnotationPopover: React.FC<ColumnAnnotationPopoverProps> = ({
    columnName,
    columnType,
    existingAnnotation,
    anchorRect,
    language = 'English',
    onSave,
    onRemove,
    onClose,
}) => {
    const ROLE_OPTIONS = useMemo(() => getRoleOptions(language), [language]);
    const [businessLabel, setBusinessLabel] = useState(existingAnnotation?.businessLabel ?? '');
    const [description, setDescription] = useState(existingAnnotation?.description ?? '');
    const [businessRole, setBusinessRole] = useState<UserColumnAnnotation['businessRole']>(existingAnnotation?.businessRole);
    const popoverRef = useRef<HTMLDivElement>(null);
    const labelInputRef = useRef<HTMLInputElement>(null);

    // Focus label input on mount
    useEffect(() => {
        labelInputRef.current?.focus();
    }, []);

    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        // Delay to avoid catching the triggering click
        const timer = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 50);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const handleSave = useCallback(() => {
        if (!businessLabel.trim() && !description.trim() && !businessRole) {
            onClose();
            return;
        }
        onSave({
            columnName,
            businessLabel: businessLabel.trim() || columnName,
            description: description.trim(),
            businessRole,
        });
        onClose();
    }, [columnName, businessLabel, description, businessRole, onSave, onClose]);

    const handleRemove = useCallback(() => {
        onRemove(columnName);
        onClose();
    }, [columnName, onRemove, onClose]);

    // Position below the header, clamped to viewport
    const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 320);
    const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 320));

    return (
        <div
            ref={popoverRef}
            className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-4 w-72"
            style={{ top, left }}
        >
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800 truncate" title={columnName}>
                    {columnName}
                </h3>
                {columnType && (
                    <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                        {columnType}
                    </span>
                )}
            </div>

            <div className="space-y-2.5">
                <div>
                    <label className="block text-xs text-slate-500 mb-1">{getTranslation('column_annotation_label_business_tag', language)}</label>
                    <input
                        ref={labelInputRef}
                        type="text"
                        value={businessLabel}
                        onChange={e => setBusinessLabel(e.target.value)}
                        placeholder={columnName}
                        className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                </div>

                <div>
                    <label className="block text-xs text-slate-500 mb-1">{getTranslation('column_annotation_label_description', language)}</label>
                    <input
                        type="text"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder={getTranslation('column_annotation_description_placeholder', language)}
                        className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                </div>

                <div>
                    <label className="block text-xs text-slate-500 mb-1">{getTranslation('column_annotation_label_business_role', language)}</label>
                    <select
                        value={businessRole ?? ''}
                        onChange={e => setBusinessRole((e.target.value || undefined) as UserColumnAnnotation['businessRole'])}
                        className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                    >
                        {ROLE_OPTIONS.map(opt => (
                            <option key={opt.value ?? '__none__'} value={opt.value ?? ''}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex items-center justify-between mt-4">
                {existingAnnotation ? (
                    <button
                        onClick={handleRemove}
                        className="text-xs text-red-500 hover:text-red-700"
                    >
                        {getTranslation('column_annotation_remove', language)}
                    </button>
                ) : (
                    <span />
                )}
                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
                    >
                        {getTranslation('column_annotation_cancel', language)}
                    </button>
                    <button
                        onClick={handleSave}
                        className="text-xs bg-blue-500 text-white rounded px-3 py-1 hover:bg-blue-600"
                    >
                        {getTranslation('column_annotation_save', language)}
                    </button>
                </div>
            </div>
        </div>
    );
};
