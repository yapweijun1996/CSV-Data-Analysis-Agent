import React, { useId, useState } from 'react';
import type {
    AppLanguage,
    WorkspaceQueryPredicateDraft,
    WorkspaceQueryPredicateGroupDraft,
} from '../../../types';
import {
    DEFAULT_WORKSPACE_QUERY_LIMIT,
    WORKSPACE_QUERY_LIMIT_OPTIONS,
} from '../../../services/agent/execution/workspaceDataQuery';
import { getTranslation } from '../../../utils/localization';

export const PREDICATE_OPERATOR_OPTIONS: Array<{ value: WorkspaceQueryPredicateDraft['operator']; label: string }> = [
    { value: 'eq', label: 'Equals' },
    { value: 'neq', label: 'Not equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'starts_with', label: 'Starts with' },
    { value: 'ends_with', label: 'Ends with' },
    { value: 'gt', label: 'Greater than' },
    { value: 'gte', label: 'Greater than or equal' },
    { value: 'lt', label: 'Less than' },
    { value: 'lte', label: 'Less than or equal' },
    { value: 'between', label: 'Between' },
    { value: 'in', label: 'In list' },
    { value: 'is_null', label: 'Is null / blank' },
    { value: 'not_null', label: 'Is not null / blank' },
];

export const isValueOptionalOperator = (operator: WorkspaceQueryPredicateDraft['operator']) =>
    operator === 'is_null' || operator === 'not_null';

export const usesRangeValues = (operator: WorkspaceQueryPredicateDraft['operator']) => operator === 'between';
export const usesListValues = (operator: WorkspaceQueryPredicateDraft['operator']) => operator === 'in';

export const createEmptyPredicate = (availableColumns: string[]): WorkspaceQueryPredicateDraft => ({
    column: availableColumns[0] ?? '',
    operator: 'eq',
    value: '',
});

export const createEmptyGroup = (availableColumns: string[]): WorkspaceQueryPredicateGroupDraft => ({
    predicates: [createEmptyPredicate(availableColumns)],
});

export const ColumnPicker: React.FC<{
    label: string;
    availableColumns: string[];
    selectedColumns: string[];
    onToggle: (column: string) => void;
    description?: string;
    language?: AppLanguage;
}> = ({ label, availableColumns, selectedColumns, onToggle, description, language = 'English' }) => {
    const [isExpanded, setIsExpanded] = useState(availableColumns.length <= 12);
    const pickerId = useId();
    const selectedPreview = selectedColumns.slice(0, 4).join(', ');
    const hiddenSelectedCount = Math.max(0, selectedColumns.length - 4);

    return (
        <fieldset className="min-w-0">
            <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</legend>
            {description ? (
                <p className="mt-2 text-sm text-slate-500">{description}</p>
            ) : null}
            <div className="mt-3 flex min-w-0 flex-col gap-3 rounded-card border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 text-sm text-slate-700">
                    <span className="font-semibold">
                        {getTranslation('explorer_selected_columns_count', language, { count: selectedColumns.length })}
                    </span>
                    {selectedPreview ? (
                        <span className="ml-2 break-words text-slate-500">
                            {selectedPreview}{hiddenSelectedCount > 0 ? ` +${hiddenSelectedCount}` : ''}
                        </span>
                    ) : null}
                </p>
                <button
                    type="button"
                    aria-controls={pickerId}
                    aria-expanded={isExpanded}
                    onClick={() => setIsExpanded(current => !current)}
                    className="min-h-[44px] shrink-0 rounded-card border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                >
                    {getTranslation(isExpanded ? 'explorer_hide_columns' : 'explorer_choose_columns', language)}
                </button>
            </div>
            {isExpanded ? (
                <div
                    id={pickerId}
                    role="group"
                    aria-label={label}
                    className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-card border border-slate-200 bg-white p-3"
                >
                    {availableColumns.length > 0 ? availableColumns.map(column => {
                        const isSelected = selectedColumns.includes(column);
                        return (
                            <button
                                key={column}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => onToggle(column)}
                                className={`min-h-[44px] rounded-full px-3 py-2 text-sm font-medium transition ${
                                    isSelected
                                        ? 'bg-slate-900 text-white'
                                        : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                }`}
                            >
                                {column}
                            </button>
                        );
                    }) : (
                        <p className="text-sm text-slate-500">{getTranslation('explorer_no_columns', language)}</p>
                    )}
                </div>
            ) : null}
        </fieldset>
    );
};

export const SelectField: React.FC<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    disabled?: boolean;
}> = ({ label, value, onChange, options, disabled = false }) => (
    <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
        <select
            value={value}
            onChange={event => onChange(event.target.value)}
            disabled={disabled}
            className="mt-2 min-h-[44px] w-full rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
        >
            {options.map(option => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    </label>
);

export const TextField: React.FC<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
    <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
        <input
            type="text"
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder={placeholder}
            className="mt-2 min-h-[44px] w-full rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        />
    </label>
);

export const LimitField: React.FC<{
    limit: number;
    onChange: (limit: number) => void;
    language?: AppLanguage;
}> = ({ limit, onChange, language = 'English' }) => (
    <SelectField
        label={getTranslation('explorer_limit', language)}
        value={String(limit || DEFAULT_WORKSPACE_QUERY_LIMIT)}
        onChange={value => onChange(Number(value))}
        options={WORKSPACE_QUERY_LIMIT_OPTIONS.map(option => ({
            value: String(option),
            label: getTranslation('explorer_rows_count', language, { count: option }),
        }))}
    />
);

export const PredicateEditor: React.FC<{
    title: string;
    predicates: WorkspaceQueryPredicateDraft[];
    availableColumns: string[];
    onChange: (predicates: WorkspaceQueryPredicateDraft[]) => void;
    language?: AppLanguage;
}> = ({ title, predicates, availableColumns, onChange, language = 'English' }) => {
    const updatePredicate = (index: number, updater: (predicate: WorkspaceQueryPredicateDraft) => WorkspaceQueryPredicateDraft) => {
        onChange(predicates.map((predicate, predicateIndex) => (
            predicateIndex === index ? updater(predicate) : predicate
        )));
    };

    return (
        <section className="rounded-card border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="mt-1 text-xs text-slate-500">{getTranslation('explorer_predicate_hint', language)}</p>
                </div>
                <button
                    type="button"
                    onClick={() => onChange([...predicates, createEmptyPredicate(availableColumns)])}
                    className="min-h-[44px] rounded-card border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300"
                >
                    {getTranslation('explorer_add_predicate', language)}
                </button>
            </div>
            <div className="mt-4 space-y-3">
                {predicates.map((predicate, index) => (
                    <div key={`${title}-${index}`} className="rounded-card border border-slate-200 bg-white p-3">
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                            <SelectField
                                label={getTranslation('explorer_column', language)}
                                value={predicate.column}
                                onChange={value => updatePredicate(index, current => ({ ...current, column: value }))}
                                options={availableColumns.map(column => ({ value: column, label: column }))}
                            />
                            <SelectField
                                label={getTranslation('explorer_operator', language)}
                                value={predicate.operator}
                                onChange={value => updatePredicate(index, current => ({
                                    ...current,
                                    operator: value as WorkspaceQueryPredicateDraft['operator'],
                                    ...(value === 'between'
                                        ? { secondaryValue: current.secondaryValue ?? '' }
                                        : {}),
                                }))}
                                options={PREDICATE_OPERATOR_OPTIONS.map(option => ({
                                    value: option.value,
                                    label: getTranslation(`explorer_operator_${option.value}`, language),
                                }))}
                            />
                            <div className="flex items-end justify-end">
                                <button
                                    type="button"
                                    onClick={() => onChange(predicates.filter((_, predicateIndex) => predicateIndex !== index))}
                                    disabled={predicates.length <= 1}
                                    className={`min-h-[44px] rounded-card px-3 py-2 text-sm font-medium transition ${
                                        predicates.length > 1
                                            ? 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                            : 'cursor-not-allowed border border-slate-100 bg-slate-100 text-slate-400'
                                    }`}
                                >
                                    {getTranslation('explorer_remove', language)}
                                </button>
                            </div>
                        </div>
                        {!isValueOptionalOperator(predicate.operator) ? (
                            <div className={`mt-3 grid gap-3 ${usesRangeValues(predicate.operator) ? 'md:grid-cols-2' : ''}`}>
                                <TextField
                                    label={usesListValues(predicate.operator)
                                        ? getTranslation('explorer_values_comma_separated', language)
                                        : getTranslation('explorer_value', language)}
                                    value={predicate.value ?? ''}
                                    onChange={value => updatePredicate(index, current => ({ ...current, value }))}
                                    placeholder={usesListValues(predicate.operator)
                                        ? 'A, B, C'
                                        : getTranslation('explorer_enter_value', language)}
                                />
                                {usesRangeValues(predicate.operator) ? (
                                    <TextField
                                        label={getTranslation('explorer_and', language)}
                                        value={predicate.secondaryValue ?? ''}
                                        onChange={value => updatePredicate(index, current => ({ ...current, secondaryValue: value }))}
                                        placeholder={getTranslation('explorer_upper_bound', language)}
                                    />
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>
        </section>
    );
};
