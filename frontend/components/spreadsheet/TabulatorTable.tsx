import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    TabulatorFull as Tabulator,
    type TabulatorColumnDefinition,
    type TabulatorSortDescriptor,
} from 'tabulator-tables';
import 'tabulator-tables/dist/css/tabulator.min.css';
import './tabulator-overrides.css';
import type { CsvRow, Settings } from '../../types';
import { getTranslation } from '../../utils/localization';
import { applyTabulatorInteractionGuard } from './tabulatorInteractionGuard';
import { applyTabulatorStyleGuard } from './tabulatorStyleGuard';
import { formatAnalysisMeasureValue } from '../../utils/analysisCardPresentation';

// Patch CSSStyleDeclaration before any Tabulator instance is created so
// that empty/undefined style assignments use removeProperty() instead of
// writing invalid CSS values that trigger Firefox console warnings.
applyTabulatorStyleGuard();
applyTabulatorInteractionGuard();

export type TabulatorTableSortState = {
    column: string | null;
    direction: 'asc' | 'desc';
};

interface TabulatorTableProps {
    data: CsvRow[];
    columns: string[];
    displayColumnLabels?: Record<string, string>;
    pageSize: number;
    tableKey?: string;
    language: Settings['language'];
    variant?: 'raw-explorer' | 'database-modal';
    pageSizeOptions?: number[];
    sortState?: TabulatorTableSortState;
    onSortChange?: (next: TabulatorTableSortState) => void;
    containerClassName?: string;
    emptyStateText?: string;
    /** Aggregate value aliases that should use a stable two-decimal scale. */
    measureColumns?: string[];
    /** Column names that have user annotations (show badge in header). */
    annotatedColumns?: Set<string>;
    /** Called when user clicks a column header (for annotation popover). */
    onColumnHeaderClick?: (columnName: string, rect: DOMRect) => void;
}

type ManagedTabulator = Tabulator & {
    blockRedraw?: () => void;
    restoreRedraw?: () => void;
    redraw?: (force?: boolean) => void;
    clearSort?: () => void;
    getSorters?: () => Array<{ field?: string; dir?: string }>;
    setColumns?: (definition: TabulatorColumnDefinition[]) => void;
    setData?: (data: CsvRow[]) => Promise<unknown> | unknown;
    setSort?: (field: string, dir: 'asc' | 'desc') => void;
};

const DEFAULT_EMPTY_STATE_KEY = 'tabulator_empty_state';

/**
 * PERF-103: Datasets with ≥ this many rows use remote pagination
 * (in-memory slicing) instead of Tabulator local pagination.
 * Tabulator local mode indexes ALL rows on construction (~7s for 885×18).
 * Remote mode only processes the current page slice (<50ms).
 */
const REMOTE_PAGINATION_THRESHOLD = 1000;

const areSortStatesEqual = (
    left: TabulatorTableSortState | undefined,
    right: TabulatorTableSortState,
) => (left?.column ?? null) === right.column && (left?.direction ?? 'asc') === right.direction;

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const getColumnLetter = (index: number) => {
    let nextIndex = index;
    let letter = '';
    while (nextIndex >= 0) {
        const remainder = nextIndex % 26;
        letter = String.fromCharCode(remainder + 65) + letter;
        nextIndex = Math.floor(nextIndex / 26) - 1;
    }
    return letter;
};

const calculateColumnWidth = (header: string, field: string, data: CsvRow[]) => {
    const headerLength = header.length * 8 + 30;
    const sampleLength = data.slice(0, 10).reduce((max, row) => {
        const value = row[field];
        return Math.max(max, String(value ?? '').length * 7);
    }, 0);

    return Math.max(120, headerLength, sampleLength);
};

const buildTabulatorLocale = (language: Settings['language']): Record<string, unknown> => ({
    pagination: {
        page_size: getTranslation('tabulator_page_size', language),
        page_title: getTranslation('tabulator_page_title', language),
        first: getTranslation('tabulator_first', language),
        first_title: getTranslation('tabulator_first_title', language),
        last: getTranslation('tabulator_last', language),
        last_title: getTranslation('tabulator_last_title', language),
        prev: getTranslation('tabulator_prev', language),
        prev_title: getTranslation('tabulator_prev_title', language),
        next: getTranslation('tabulator_next', language),
        next_title: getTranslation('tabulator_next_title', language),
        all: getTranslation('tabulator_all', language),
        counter: {
            showing: getTranslation('tabulator_showing', language),
            of: getTranslation('tabulator_of', language),
            rows: getTranslation('tabulator_rows', language),
            pages: getTranslation('tabulator_pages', language),
        },
    },
});

const localeKeyByLanguage: Record<Settings['language'], string> = {
    English: 'en',
    Mandarin: 'zh-cn',
    Malay: 'ms',
    Japanese: 'ja',
};

const buildColumns = (
    columns: string[],
    data: CsvRow[],
    language: Settings['language'],
    displayColumnLabels?: Record<string, string>,
    annotatedColumns?: Set<string>,
    measureColumns: string[] = [],
): TabulatorColumnDefinition[] => [
    {
        title: '#',
        formatter: cell => {
            const rowPosition = cell.getRow().getPosition(true);
            return rowPosition === false ? '' : String(rowPosition);
        },
        cssClass: 'raw-data-tabulator__index-column',
        headerSort: false,
        resizable: false,
        frozen: true,
        hozAlign: 'center',
        headerHozAlign: 'center',
        width: 60,
        minWidth: 60,
        maxWidth: 60,
    },
    ...columns.map((column, index) => {
        const displayLabel = displayColumnLabels?.[column] ?? column;
        const badge = annotatedColumns?.has(column) ? ' \u270F' : '';
        const isMeasure = measureColumns.includes(column);
        return {
            title: `${getColumnLetter(index)} - ${displayLabel}${badge}`,
            field: column,
            hozAlign: 'left' as const,
            headerHozAlign: 'left' as const,
            minWidth: 120,
            width: calculateColumnWidth(displayLabel, column, data),
            tooltip: (_event, cell) => {
                const rawValue = cell.getValue();
                return rawValue === null || rawValue === undefined || String(rawValue).trim() === ''
                    ? getTranslation('tabulator_blank_value', language)
                    : String(rawValue);
            },
            formatter: cell => {
                const rawValue = cell.getValue();
                const isBlank = rawValue === null || rawValue === undefined || String(rawValue).trim() === '';
                const displayValue = isBlank
                    ? getTranslation('tabulator_blank_value', language)
                    : isMeasure
                        ? formatAnalysisMeasureValue(rawValue)
                        : String(rawValue);
                const escapedValue = escapeHtml(displayValue);
                const blankClass = isBlank ? ' text-slate-400 italic' : '';
                return `<span class="raw-data-tabulator__cell-value${blankClass}" title="${escapedValue}">${escapedValue}</span>`;
            },
        };
    }),
];

// PERF-310: Memoize TabulatorTable to prevent re-renders when parent
// (SpreadsheetPanel) re-renders due to unrelated state changes.
// Without memo, every Zustand setState triggers a full TabulatorTable
// re-render cycle (~2.3s) even when data/columns haven't changed.
const TabulatorTableInner: React.FC<TabulatorTableProps> = ({
    data,
    columns,
    displayColumnLabels,
    pageSize,
    tableKey,
    language,
    variant = 'raw-explorer',
    pageSizeOptions,
    sortState,
    onSortChange,
    containerClassName,
    emptyStateText,
    measureColumns = [],
    annotatedColumns,
    onColumnHeaderClick,
}) => {
    const resolvedEmptyStateText = emptyStateText ?? getTranslation(DEFAULT_EMPTY_STATE_KEY, language);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const tableRef = useRef<ManagedTabulator | null>(null);
    const tableBuiltRef = useRef(false);
    const sortStateRef = useRef<TabulatorTableSortState | undefined>(sortState);
    const onSortChangeRef = useRef<typeof onSortChange>(onSortChange);
    const onColumnHeaderClickRef = useRef<typeof onColumnHeaderClick>(onColumnHeaderClick);
    const hasColumns = columns.length > 0;
    const pageSizeOptionsKey = pageSizeOptions?.join(',') ?? '';
    // PERF-101: Show skeleton while Tabulator constructs to unblock main thread.
    const [isBuilding, setIsBuilding] = useState(true);

    const columnDefinitions = useMemo(
        () => buildColumns(columns, data, language, displayColumnLabels, annotatedColumns, measureColumns),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [columns, data, language, displayColumnLabels, annotatedColumns?.size, measureColumns.join('|')],
    );
    const columnSignature = useMemo(
        () => columnDefinitions
            .map(definition => `${String(definition.field ?? '')}:${String(definition.title ?? '')}`)
            .join('|'),
        [columnDefinitions],
    );
    const latestDataRef = useRef(data);
    const latestColumnDefinitionsRef = useRef(columnDefinitions);
    const latestColumnSignatureRef = useRef(columnSignature);
    const appliedColumnSignatureRef = useRef<string | null>(null);
    latestDataRef.current = data;
    latestColumnDefinitionsRef.current = columnDefinitions;
    latestColumnSignatureRef.current = columnSignature;

    // BUG-503: Generation counter prevents stale async restoreRedraw callbacks
    // from operating on rows that belong to a superseded data update.
    const updateGenerationRef = useRef(0);

    // PERF-103: Track whether current table instance uses remote pagination.
    const useRemotePaginationRef = useRef(false);

    const applyTableData = (table: ManagedTabulator | null) => {
        if (!table || !tableBuiltRef.current) {
            return;
        }

        const generation = ++updateGenerationRef.current;
        table.blockRedraw?.();
        try {
            if (appliedColumnSignatureRef.current !== latestColumnSignatureRef.current) {
                table.setColumns?.(latestColumnDefinitionsRef.current);
                appliedColumnSignatureRef.current = latestColumnSignatureRef.current;
            }

            // PERF-103: Remote mode — update data ref and re-trigger page fetch.
            // Local mode — replace full dataset as before.
            if (useRemotePaginationRef.current) {
                latestDataRef.current = latestDataRef.current; // already set by ref sync
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (table as any).setPage?.(1);
                table.restoreRedraw?.();
                table.redraw?.(true);
                return;
            }

            const setDataResult = table.setData?.(latestDataRef.current);
            Promise.resolve(setDataResult)
                .catch(() => undefined)
                .finally(() => {
                    // Discard if a newer update has started or the table was replaced.
                    if (updateGenerationRef.current !== generation
                        || tableRef.current !== table
                        || !tableBuiltRef.current) {
                        return;
                    }
                    table.restoreRedraw?.();
                    table.redraw?.(true);
                });
        } catch (error) {
            table.restoreRedraw?.();
            throw error;
        }
    };

    const applySortState = (table: ManagedTabulator | null) => {
        if (!table || !tableBuiltRef.current) {
            return;
        }

        const currentSorter = table.getSorters?.()?.[0];
        const currentState: TabulatorTableSortState = currentSorter?.field && (currentSorter.dir === 'asc' || currentSorter.dir === 'desc')
            ? { column: currentSorter.field, direction: currentSorter.dir }
            : { column: null, direction: 'asc' };

        if (areSortStatesEqual(sortStateRef.current, currentState)) {
            return;
        }

        if (sortStateRef.current?.column) {
            table.setSort?.(sortStateRef.current.column, sortStateRef.current.direction);
            return;
        }

        table.clearSort?.();
    };

    useEffect(() => {
        sortStateRef.current = sortState;
    }, [sortState]);

    useEffect(() => {
        onSortChangeRef.current = onSortChange;
    }, [onSortChange]);

    useEffect(() => {
        onColumnHeaderClickRef.current = onColumnHeaderClick;
    }, [onColumnHeaderClick]);

    useEffect(() => {
        const containerElement = containerRef.current;
        if (!hasColumns || !containerElement) {
            return undefined;
        }

        // PERF-101: Defer Tabulator construction to next frame so React can
        // paint the skeleton / expanded container before the heavy init blocks.
        setIsBuilding(true);
        let buildTimerId: ReturnType<typeof setTimeout> | null = null;
        const frameId = requestAnimationFrame(() => {
            buildTimerId = setTimeout(() => {
                const localeKey = localeKeyByLanguage[language];
                const initialSort: TabulatorSortDescriptor[] | false = sortStateRef.current?.column
                    ? [{ column: sortStateRef.current.column, dir: sortStateRef.current.direction }]
                    : false;
                tableBuiltRef.current = false;
                // PERF-103: Large datasets use remote pagination (in-memory slicing)
                // to avoid Tabulator indexing all rows on construction.
                const isRemote = data.length >= REMOTE_PAGINATION_THRESHOLD;
                useRemotePaginationRef.current = isRemote;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- columnDefaults + ajaxRequestFunc are valid Tabulator options missing from the TS types
                const table = new Tabulator(containerElement, {
                    data: isRemote ? [] : data,
                    columns: columnDefinitions,
                    nestedFieldSeparator: false,
                    columnDefaults: { hozAlign: 'left', headerHozAlign: 'left' },
                    layout: 'fitDataTable',
                    layoutColumnsOnNewData: false,
                    height: '100%',
                    placeholder: resolvedEmptyStateText,
                    pagination: true,
                    paginationMode: isRemote ? 'remote' : 'local',
                    paginationSize: pageSize,
                    paginationSizeSelector: pageSizeOptions && pageSizeOptions.length > 0 ? pageSizeOptions : false,
                    paginationCounter: 'rows',
                    ...(isRemote ? {
                        ajaxURL: 'local://in-memory',
                        ajaxRequestFunc: (
                            _url: string,
                            _config: unknown,
                            params: { page: number; size: number; sorters?: Array<{ field: string; dir: string }> },
                        ) => {
                            const { page, size, sorters } = params;
                            let rows = latestDataRef.current;
                            if (sorters?.[0]) {
                                const { field, dir } = sorters[0];
                                rows = [...rows].sort((a, b) => {
                                    const va = String(a[field] ?? '');
                                    const vb = String(b[field] ?? '');
                                    return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
                                });
                            }
                            const start = (page - 1) * size;
                            return Promise.resolve({
                                data: rows.slice(start, start + size),
                                last_page: Math.ceil(rows.length / size),
                            });
                        },
                    } : {}),
                    initialSort,
                    columnHeaderSortMulti: false,
                    selectableRows: 1,
                    selectableRowsPersistence: false,
                    langs: {
                        [localeKey]: buildTabulatorLocale(language),
                    },
                    locale: localeKey,
                    rowClick: (_event, row) => {
                        row.toggleSelect();
                    },
                } as ConstructorParameters<typeof Tabulator>[1]) as ManagedTabulator;
                tableRef.current = table;
                appliedColumnSignatureRef.current = columnSignature;
                table.on('tableBuilt', () => {
                    if (tableRef.current !== table) {
                        return;
                    }
                    tableBuiltRef.current = true;
                    setIsBuilding(false);
                    applyTableData(table);
                    applySortState(table);
                });
                if (onSortChangeRef.current) {
                    table.on('dataSorted', (sorters: unknown[]) => {
                        const primarySorter = Array.isArray(sorters) ? sorters[0] as { field?: string; dir?: string } | undefined : undefined;
                        if (primarySorter?.field && (primarySorter.dir === 'asc' || primarySorter.dir === 'desc')) {
                            const nextState: TabulatorTableSortState = { column: primarySorter.field, direction: primarySorter.dir };
                            if (!areSortStatesEqual(sortStateRef.current, nextState)) {
                                onSortChangeRef.current?.(nextState);
                            }
                            return;
                        }
                        const nextState = { column: null, direction: 'asc' as const };
                        if (!areSortStatesEqual(sortStateRef.current, nextState)) {
                            onSortChangeRef.current?.(nextState);
                        }
                    });
                }

                // Double-click header to open column annotation popover.
                table.on('headerDblClick' as never, (_e: unknown, column: { getField?: () => string; getElement?: () => HTMLElement }) => {
                    const field = column.getField?.();
                    const element = column.getElement?.();
                    if (field && element && onColumnHeaderClickRef.current) {
                        onColumnHeaderClickRef.current(field, element.getBoundingClientRect());
                    }
                });
            }, 0);
        });

        return () => {
            cancelAnimationFrame(frameId);
            if (buildTimerId !== null) clearTimeout(buildTimerId);
            updateGenerationRef.current += 1;
            tableBuiltRef.current = false;
            appliedColumnSignatureRef.current = null;
            if (tableRef.current) {
                tableRef.current.destroy();
                tableRef.current = null;
            }
            containerElement.innerHTML = '';
        };
    }, [
        resolvedEmptyStateText,
        hasColumns,
        language,
        pageSize,
        pageSizeOptionsKey,
        tableKey,
    ]);

    useEffect(() => {
        const table = tableRef.current;
        if (!table) {
            return;
        }

        applyTableData(table);
    }, [columnDefinitions, data]);

    useEffect(() => {
        const table = tableRef.current;
        applySortState(table);
    }, [sortState]);

    if (columns.length === 0) {
        return <p className="text-sm text-slate-500">{resolvedEmptyStateText}</p>;
    }

    return (
        <div className={`raw-data-tabulator tabulator-table--${variant} h-full w-full ${containerClassName ?? ''}`.trim()}>
            {isBuilding && (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">
                    {getTranslation('loading_table', language)}
                </div>
            )}
            <div key={tableKey ?? 'tabulator-root'} ref={containerRef} className="h-full w-full"
                 style={isBuilding ? { visibility: 'hidden', position: 'absolute' } : undefined} />
        </div>
    );
};

// PERF-310: Custom comparison — only re-render when data content or
// column structure actually changes, not on every parent re-render.
const tabulatorPropsAreEqual = (
    prev: Readonly<TabulatorTableProps>,
    next: Readonly<TabulatorTableProps>,
): boolean => {
    // Fast path: same references = same content
    if (prev.data === next.data
        && prev.columns === next.columns
        && prev.displayColumnLabels === next.displayColumnLabels
        && prev.pageSize === next.pageSize
        && prev.tableKey === next.tableKey
        && prev.language === next.language
        && prev.variant === next.variant
        && prev.emptyStateText === next.emptyStateText
        && prev.sortState === next.sortState
        && prev.annotatedColumns === next.annotatedColumns
        && prev.pageSizeOptions === next.pageSizeOptions
        && prev.onSortChange === next.onSortChange
        && prev.onColumnHeaderClick === next.onColumnHeaderClick
        && prev.containerClassName === next.containerClassName) {
        return true;
    }
    // Scalar props changed → must re-render
    if (prev.pageSize !== next.pageSize
        || prev.tableKey !== next.tableKey
        || prev.language !== next.language
        || prev.variant !== next.variant
        || prev.emptyStateText !== next.emptyStateText
        || prev.containerClassName !== next.containerClassName
        || prev.displayColumnLabels !== next.displayColumnLabels
        || prev.annotatedColumns !== next.annotatedColumns
        || prev.onSortChange !== next.onSortChange
        || prev.onColumnHeaderClick !== next.onColumnHeaderClick
        || (prev.pageSizeOptions?.join(',') ?? '') !== (next.pageSizeOptions?.join(',') ?? '')
        || !areSortStatesEqual(prev.sortState, {
            column: next.sortState?.column ?? null,
            direction: next.sortState?.direction ?? 'asc',
        })) {
        return false;
    }
    // Data array: compare length + first/last row reference (fast heuristic)
    if (prev.data !== next.data) {
        if (prev.data.length !== next.data.length) return false;
        if (prev.data.length > 0 && (prev.data[0] !== next.data[0] || prev.data[prev.data.length - 1] !== next.data[next.data.length - 1])) return false;
    }
    // Columns: compare joined string
    if (prev.columns !== next.columns) {
        if (prev.columns.length !== next.columns.length) return false;
        if (prev.columns.join(',') !== next.columns.join(',')) return false;
    }
    return true;
};

export const TabulatorTable = React.memo(TabulatorTableInner, tabulatorPropsAreEqual);
