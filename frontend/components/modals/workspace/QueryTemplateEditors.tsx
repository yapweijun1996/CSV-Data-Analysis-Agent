import React from 'react';
import type {
    AppLanguage,
    WorkspaceAggregateBreakdownQueryRequest,
    WorkspaceDataQueryRequest,
    WorkspaceFilterLookupQueryRequest,
    WorkspaceNullBlankScanQueryRequest,
    WorkspacePreviewRowsQueryRequest,
} from '../../../types';
import {
    ColumnPicker,
    SelectField,
    TextField,
    LimitField,
    PredicateEditor,
    createEmptyGroup,
} from './QueryComposerPrimitives';
import { getTranslation } from '../../../utils/localization';

export const PreviewRowsEditor: React.FC<{
    draft: WorkspacePreviewRowsQueryRequest;
    availableColumns: string[];
    onDraftChange: (draft: WorkspacePreviewRowsQueryRequest) => void;
    language: AppLanguage;
}> = ({ draft, availableColumns, onDraftChange, language }) => {
    const selectableSortColumns = draft.columns.length > 0 ? draft.columns : availableColumns;
    return (
        <div className="space-y-4">
            <ColumnPicker
                label={getTranslation('explorer_visible_columns', language)}
                availableColumns={availableColumns}
                selectedColumns={draft.columns}
                onToggle={column => onDraftChange({
                    ...draft,
                    columns: draft.columns.includes(column)
                        ? draft.columns.filter(entry => entry !== column)
                        : [...draft.columns, column],
                })}
                description={getTranslation('explorer_visible_columns_hint', language)}
                language={language}
            />
            <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                    label={getTranslation('explorer_sort_column', language)}
                    value={draft.orderBy?.column ?? ''}
                    onChange={value => onDraftChange({
                        ...draft,
                        orderBy: value ? { column: value, direction: draft.orderBy?.direction ?? 'asc' } : null,
                    })}
                    options={[
                        { value: '', label: getTranslation('explorer_no_sort', language) },
                        ...selectableSortColumns.map(column => ({ value: column, label: column })),
                    ]}
                />
                <SelectField
                    label={getTranslation('explorer_sort_direction', language)}
                    value={draft.orderBy?.direction ?? 'asc'}
                    onChange={value => onDraftChange({
                        ...draft,
                        orderBy: draft.orderBy ? { ...draft.orderBy, direction: value === 'desc' ? 'desc' : 'asc' } : null,
                    })}
                    options={[
                        { value: 'asc', label: getTranslation('explorer_ascending', language) },
                        { value: 'desc', label: getTranslation('explorer_descending', language) },
                    ]}
                    disabled={!draft.orderBy?.column}
                />
            </div>
            <LimitField
                limit={draft.limit}
                onChange={limit => onDraftChange({ ...draft, limit })}
                language={language}
            />
        </div>
    );
};

export const FilterLookupEditor: React.FC<{
    draft: WorkspaceFilterLookupQueryRequest;
    availableColumns: string[];
    onDraftChange: (draft: WorkspaceFilterLookupQueryRequest) => void;
    language: AppLanguage;
}> = ({ draft, availableColumns, onDraftChange, language }) => {
    const selectableSortColumns = draft.columns.length > 0 ? draft.columns : availableColumns;
    return (
        <div className="space-y-4">
            <ColumnPicker
                label={getTranslation('explorer_output_columns', language)}
                availableColumns={availableColumns}
                selectedColumns={draft.columns}
                onToggle={column => onDraftChange({
                    ...draft,
                    columns: draft.columns.includes(column)
                        ? draft.columns.filter(entry => entry !== column)
                        : [...draft.columns, column],
                })}
                description={getTranslation('explorer_output_columns_hint', language)}
                language={language}
            />
            <PredicateEditor
                title={getTranslation('explorer_match_all', language)}
                predicates={draft.predicates}
                availableColumns={availableColumns}
                onChange={predicates => onDraftChange({ ...draft, predicates })}
                language={language}
            />
            <section className="rounded-card border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-slate-900">{getTranslation('explorer_or_groups', language)}</p>
                        <p className="mt-1 text-xs text-slate-500">{getTranslation('explorer_or_groups_hint', language)}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => onDraftChange({
                            ...draft,
                            groups: [...(draft.groups ?? []), createEmptyGroup(availableColumns)],
                        })}
                        className="min-h-[44px] rounded-card border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300"
                    >
                        {getTranslation('explorer_add_or_group', language)}
                    </button>
                </div>
                <div className="mt-4 space-y-3">
                    {(draft.groups ?? []).length > 0 ? (draft.groups ?? []).map((group, groupIndex) => (
                        <div key={`group-${groupIndex}`} className="rounded-card border border-slate-200 bg-white p-3">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-900">{getTranslation('explorer_or_group_number', language, { count: groupIndex + 1 })}</p>
                                <button
                                    type="button"
                                    onClick={() => onDraftChange({
                                        ...draft,
                                        groups: (draft.groups ?? []).filter((_, index) => index !== groupIndex),
                                    })}
                                    className="min-h-[44px] rounded-card border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300"
                                >
                                    {getTranslation('explorer_remove_group', language)}
                                </button>
                            </div>
                            <PredicateEditor
                                title={getTranslation('explorer_group_predicates', language)}
                                predicates={group.predicates}
                                availableColumns={availableColumns}
                                onChange={predicates => onDraftChange({
                                    ...draft,
                                    groups: (draft.groups ?? []).map((entry, index) => (
                                        index === groupIndex ? { ...entry, predicates } : entry
                                    )),
                                })}
                                language={language}
                            />
                        </div>
                    )) : (
                        <p className="text-sm text-slate-500">{getTranslation('explorer_no_or_groups', language)}</p>
                    )}
                </div>
            </section>
            <div className="grid gap-4 md:grid-cols-3">
                <SelectField
                    label={getTranslation('explorer_sort_column', language)}
                    value={draft.orderBy?.column ?? ''}
                    onChange={value => onDraftChange({
                        ...draft,
                        orderBy: value ? { column: value, direction: draft.orderBy?.direction ?? 'asc' } : null,
                    })}
                    options={[
                        { value: '', label: getTranslation('explorer_no_sort', language) },
                        ...selectableSortColumns.map(column => ({ value: column, label: column })),
                    ]}
                />
                <SelectField
                    label={getTranslation('explorer_sort_direction', language)}
                    value={draft.orderBy?.direction ?? 'asc'}
                    onChange={value => onDraftChange({
                        ...draft,
                        orderBy: draft.orderBy ? { ...draft.orderBy, direction: value === 'desc' ? 'desc' : 'asc' } : null,
                    })}
                    options={[
                        { value: 'asc', label: getTranslation('explorer_ascending', language) },
                        { value: 'desc', label: getTranslation('explorer_descending', language) },
                    ]}
                    disabled={!draft.orderBy?.column}
                />
                <LimitField
                    limit={draft.limit}
                    onChange={limit => onDraftChange({ ...draft, limit })}
                    language={language}
                />
            </div>
        </div>
    );
};

export const AggregateBreakdownEditor: React.FC<{
    draft: WorkspaceAggregateBreakdownQueryRequest;
    groupableColumns: string[];
    selectableColumns: string[];
    onDraftChange: (draft: WorkspaceAggregateBreakdownQueryRequest) => void;
    language: AppLanguage;
}> = ({ draft, groupableColumns, selectableColumns, onDraftChange, language }) => {
    const sortColumns = Array.from(new Set([
        ...draft.groupBy,
        draft.aggregate.as || 'row_count',
    ]));
    const currentAlias = draft.aggregate.as || 'row_count';

    return (
        <div className="space-y-4">
            <ColumnPicker
                label={getTranslation('explorer_group_by', language)}
                availableColumns={groupableColumns}
                selectedColumns={draft.groupBy}
                onToggle={column => onDraftChange({
                    ...draft,
                    groupBy: draft.groupBy.includes(column)
                        ? draft.groupBy.filter(entry => entry !== column)
                        : [...draft.groupBy, column],
                })}
                description={getTranslation('explorer_group_by_hint', language)}
                language={language}
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SelectField
                    label={getTranslation('explorer_aggregate_function', language)}
                    value={draft.aggregate.function}
                    onChange={value => onDraftChange({
                        ...draft,
                        aggregate: {
                            ...draft.aggregate,
                            function: value as WorkspaceAggregateBreakdownQueryRequest['aggregate']['function'],
                        },
                    })}
                    options={[
                        { value: 'count', label: getTranslation('explorer_count', language) },
                        { value: 'sum', label: getTranslation('explorer_sum', language) },
                        { value: 'avg', label: getTranslation('explorer_average', language) },
                    ]}
                />
                <SelectField
                    label={getTranslation('explorer_aggregate_column', language)}
                    value={draft.aggregate.column ?? ''}
                    onChange={value => onDraftChange({
                        ...draft,
                        aggregate: {
                            ...draft.aggregate,
                            column: value || null,
                        },
                    })}
                    options={[
                        {
                            value: '',
                            label: draft.aggregate.function === 'count'
                                ? getTranslation('explorer_all_rows', language)
                                : getTranslation('explorer_select_column', language),
                        },
                        ...selectableColumns.map(column => ({ value: column, label: column })),
                    ]}
                />
                <TextField
                    label={getTranslation('explorer_alias', language)}
                    value={draft.aggregate.as}
                    onChange={value => onDraftChange({
                        ...draft,
                        aggregate: { ...draft.aggregate, as: value },
                        orderBy: draft.orderBy
                            ? {
                                column: draft.orderBy.column === currentAlias ? value : draft.orderBy.column,
                                direction: draft.orderBy.direction,
                            }
                            : draft.orderBy,
                    })}
                    placeholder="row_count"
                />
                <LimitField
                    limit={draft.limit}
                    onChange={limit => onDraftChange({ ...draft, limit })}
                    language={language}
                />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                    label={getTranslation('explorer_sort_column', language)}
                    value={draft.orderBy?.column ?? currentAlias}
                    onChange={value => onDraftChange({
                        ...draft,
                        orderBy: value ? { column: value, direction: draft.orderBy?.direction ?? 'desc' } : null,
                    })}
                    options={sortColumns.map(column => ({ value: column, label: column }))}
                />
                <SelectField
                    label={getTranslation('explorer_sort_direction', language)}
                    value={draft.orderBy?.direction ?? 'desc'}
                    onChange={value => onDraftChange({
                        ...draft,
                        orderBy: {
                            column: draft.orderBy?.column ?? currentAlias,
                            direction: value === 'asc' ? 'asc' : 'desc',
                        },
                    })}
                    options={[
                        { value: 'desc', label: getTranslation('explorer_descending', language) },
                        { value: 'asc', label: getTranslation('explorer_ascending', language) },
                    ]}
                />
            </div>
        </div>
    );
};

export const DuplicateCandidatesEditor: React.FC<{
    draft: Extract<WorkspaceDataQueryRequest, { templateId: 'duplicate_candidates' }>;
    availableColumns: string[];
    onDraftChange: (draft: Extract<WorkspaceDataQueryRequest, { templateId: 'duplicate_candidates' }>) => void;
    language: AppLanguage;
}> = ({ draft, availableColumns, onDraftChange, language }) => (
    <div className="space-y-4">
        <ColumnPicker
            label={getTranslation('explorer_key_columns', language)}
            availableColumns={availableColumns}
            selectedColumns={draft.keyColumns}
            onToggle={column => onDraftChange({
                ...draft,
                keyColumns: draft.keyColumns.includes(column)
                    ? draft.keyColumns.filter(entry => entry !== column)
                    : [...draft.keyColumns, column],
            })}
            description={getTranslation('explorer_key_columns_hint', language)}
            language={language}
        />
        <div className="grid gap-4 md:grid-cols-2">
            <TextField
                label={getTranslation('explorer_count_alias', language)}
                value={draft.countAlias ?? 'duplicate_count'}
                onChange={value => onDraftChange({ ...draft, countAlias: value })}
                placeholder="duplicate_count"
            />
            <LimitField
                limit={draft.limit}
                onChange={limit => onDraftChange({ ...draft, limit })}
                language={language}
            />
        </div>
    </div>
);

export const NullBlankScanEditor: React.FC<{
    draft: WorkspaceNullBlankScanQueryRequest;
    availableColumns: string[];
    onDraftChange: (draft: WorkspaceNullBlankScanQueryRequest) => void;
    language: AppLanguage;
}> = ({ draft, availableColumns, onDraftChange, language }) => (
    <div className="space-y-4">
        <SelectField
            label={getTranslation('explorer_target_column', language)}
            value={draft.column}
            onChange={value => onDraftChange({ ...draft, column: value })}
            options={[
                { value: '', label: getTranslation('explorer_select_column', language) },
                ...availableColumns.map(column => ({ value: column, label: column })),
            ]}
        />
        <div className="rounded-card border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{getTranslation('explorer_result_mode', language)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
                {[
                    { value: 'preview', label: getTranslation('explorer_preview_matching_rows', language) },
                    { value: 'count', label: getTranslation('explorer_count_matching_rows', language) },
                ].map(option => (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onDraftChange({ ...draft, resultMode: option.value as WorkspaceNullBlankScanQueryRequest['resultMode'] })}
                        className={`min-h-[44px] rounded-full px-3 py-2 text-sm font-medium transition ${
                            draft.resultMode === option.value
                                ? 'bg-slate-900 text-white'
                                : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
        <LimitField
            limit={draft.limit}
            onChange={limit => onDraftChange({ ...draft, limit })}
            language={language}
        />
    </div>
);
