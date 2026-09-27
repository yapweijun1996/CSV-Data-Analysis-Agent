import React, { useState, useMemo } from 'react';
import { getTranslation } from '../../utils/localization';
import type { CsvRow } from '../../types';
import { IconInsights } from '../../icons/IconInsights';

// --- Helpers ---

export const formatNumber = (n: number): string =>
    Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

const formatCell = (value: unknown): string => {
    if (value == null) return '';
    if (typeof value === 'number') return formatNumber(value);
    return String(value);
};

const isNumericValue = (value: unknown): boolean => {
    if (value == null) return false;
    if (typeof value === 'number') return !Number.isNaN(value);
    const str = String(value).trim().replace(/[$€£¥,()%]/g, '').trim();
    return str !== '' && !Number.isNaN(Number(str));
};

const parseNumeric = (value: unknown): number => {
    if (typeof value === 'number') return value;
    const str = String(value ?? '').trim().replace(/[$€£¥,()%]/g, '').trim();
    return Number(str) || 0;
};

// --- Aggregation logic ---

const MAX_TABLE_ROWS = 30;
const MAX_TABLE_COLS = 10;
const MAX_PIVOT_COLS = 15;
const MAX_PIVOT_ROWS = 20;

export const detectColumns = (rows: CsvRow[]) => {
    const allCols = rows[0] ? Object.keys(rows[0]) : [];
    const sample = rows.slice(0, 20);
    const numeric = allCols.filter(col => {
        const numCount = sample.filter(row => isNumericValue(row[col])).length;
        return numCount >= sample.length * 0.5;
    });
    const categorical = allCols.filter(col => !numeric.includes(col));
    return { allCols, numeric, categorical };
};

export const computeAggregation = (
    rows: CsvRow[],
    groupByCol: string,
    valueCol: string,
    agg: 'sum' | 'count' | 'avg',
): { rows: CsvRow[]; total: number } => {
    const groups = new Map<string, { sum: number; count: number }>();
    for (const row of rows) {
        const key = String(row[groupByCol] ?? '');
        if (!key) continue;
        const entry = groups.get(key) ?? { sum: 0, count: 0 };
        const val = parseNumeric(row[valueCol]);
        entry.sum += val;
        entry.count += 1;
        groups.set(key, entry);
    }
    const result: CsvRow[] = [];
    let grandTotal = 0;
    for (const [key, entry] of groups) {
        const value = agg === 'count' ? entry.count : agg === 'avg' ? (entry.count > 0 ? entry.sum / entry.count : 0) : entry.sum;
        result.push({ [groupByCol]: key, [valueCol]: Math.round(value * 100) / 100 });
        grandTotal += value;
    }
    result.sort((a, b) => (parseNumeric(b[valueCol]) - parseNumeric(a[valueCol])));
    return { rows: result.slice(0, 20), total: Math.round(grandTotal * 100) / 100 };
};

// Smart sort: detect dates and sort chronologically, otherwise alphabetical ASC
const tryParseDate = (value: string): number | null => {
    // DD-MM-YYYY, DD/MM/YYYY, MM-DD-YYYY, MM/DD/YYYY, YYYY-MM-DD, YYYY/MM/DD
    const trimmed = value.trim();
    // ISO format: YYYY-MM-DD
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(trimmed)) {
        const d = new Date(trimmed.replace(/\//g, '-'));
        return Number.isNaN(d.getTime()) ? null : d.getTime();
    }
    // DD-MM-YYYY or DD/MM/YYYY
    const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) {
        const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`);
        return Number.isNaN(d.getTime()) ? null : d.getTime();
    }
    return null;
};

const smartSort = (values: string[]): string[] => {
    if (values.length === 0) return values;
    // Check if majority of values parse as dates
    const dateAttempts = values.map(v => ({ v, ts: tryParseDate(v) }));
    const dateCount = dateAttempts.filter(a => a.ts !== null).length;
    if (dateCount >= values.length * 0.6) {
        // Sort by date timestamp
        return dateAttempts
            .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))
            .map(a => a.v);
    }
    // Alphabetical ASC
    return values.sort((a, b) => a.localeCompare(b));
};

interface PivotResult {
    pivotColumns: string[];
    rows: CsvRow[];
    columnTotals: Record<string, number>;
    grandTotal: number;
    rowCol: string;
}

const computePivotAggregation = (
    rows: CsvRow[],
    rowCol: string,
    pivotCol: string,
    valueCol: string,
    agg: 'sum' | 'count' | 'avg',
): PivotResult => {
    const groups = new Map<string, Map<string, { sum: number; count: number }>>();
    const pivotValuesSet = new Set<string>();

    for (const row of rows) {
        const rk = String(row[rowCol] ?? '');
        const pk = String(row[pivotCol] ?? '');
        if (!rk || !pk) continue;
        pivotValuesSet.add(pk);
        if (!groups.has(rk)) groups.set(rk, new Map());
        const inner = groups.get(rk)!;
        const entry = inner.get(pk) ?? { sum: 0, count: 0 };
        entry.sum += parseNumeric(row[valueCol]);
        entry.count += 1;
        inner.set(pk, entry);
    }

    const pivotColumns = smartSort([...pivotValuesSet]).slice(0, MAX_PIVOT_COLS);
    const aggValue = (e: { sum: number; count: number } | undefined) => {
        if (!e) return 0;
        if (agg === 'count') return e.count;
        if (agg === 'avg') return e.count > 0 ? e.sum / e.count : 0;
        return e.sum;
    };
    const round2 = (n: number) => Math.round(n * 100) / 100;

    const resultRows: CsvRow[] = [];
    const columnTotals: Record<string, number> = {};
    for (const pc of pivotColumns) columnTotals[pc] = 0;
    columnTotals['Total'] = 0;

    for (const [rk, inner] of groups) {
        const row: CsvRow = { [rowCol]: rk };
        let rowTotal = 0;
        for (const pc of pivotColumns) {
            const val = round2(aggValue(inner.get(pc)));
            row[pc] = val;
            rowTotal += val;
            columnTotals[pc] += val;
        }
        row['Total'] = round2(rowTotal);
        columnTotals['Total'] += rowTotal;
        resultRows.push(row);
    }

    // Sort rows by the row dimension (alphabetical / date-aware), not by Total
    resultRows.sort((a, b) => {
        const ak = String(a[rowCol] ?? '');
        const bk = String(b[rowCol] ?? '');
        return ak.localeCompare(bk);
    });
    for (const k of Object.keys(columnTotals)) columnTotals[k] = round2(columnTotals[k]);

    return {
        pivotColumns,
        rows: resultRows.slice(0, MAX_PIVOT_ROWS),
        columnTotals,
        grandTotal: columnTotals['Total'],
        rowCol,
    };
};

// --- Data table component ---

export const DataTable: React.FC<{
    rows: CsvRow[];
    maxRows?: number;
    highlightCols?: string[];
    totalRow?: { label: string; value: string; colSpan: number } | null;
}> = ({ rows, maxRows = MAX_TABLE_ROWS, highlightCols, totalRow }) => {
    if (rows.length === 0) return null;
    const displayRows = rows.slice(0, maxRows);
    const allCols = Object.keys(rows[0] ?? {});
    const cols = allCols.slice(0, MAX_TABLE_COLS);
    const truncatedCols = allCols.length > MAX_TABLE_COLS;
    const truncatedRows = rows.length > maxRows;
    const highlightSet = new Set(highlightCols ?? []);

    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
                <thead>
                    <tr className="bg-slate-50">
                        {cols.map(c => (
                            <th key={c} className={`whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold ${highlightSet.has(c) ? 'text-violet-700 bg-violet-50' : 'text-slate-600'}`}>
                                {c.length > 24 ? `${c.slice(0, 22)}…` : c}
                            </th>
                        ))}
                        {truncatedCols && <th className="border-b border-slate-200 px-3 py-2 text-left text-slate-400">…</th>}
                    </tr>
                </thead>
                <tbody>
                    {displayRows.map((row, i) => (
                        <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/40`}>
                            {cols.map(c => (
                                <td key={c} className={`whitespace-nowrap border-b border-slate-100 px-3 py-1.5 ${highlightSet.has(c) ? 'font-medium text-violet-800' : 'text-slate-700'}`}>
                                    {formatCell(row[c])}
                                </td>
                            ))}
                            {truncatedCols && <td className="border-b border-slate-100 px-3 py-1.5 text-slate-400">…</td>}
                        </tr>
                    ))}
                    {totalRow && (
                        <tr className="bg-emerald-50 font-semibold">
                            <td colSpan={totalRow.colSpan} className="border-t-2 border-emerald-200 px-3 py-2 text-right text-emerald-800">{totalRow.label}</td>
                            <td colSpan={cols.length - totalRow.colSpan + (truncatedCols ? 1 : 0)} className="border-t-2 border-emerald-200 px-3 py-2 text-emerald-800">{totalRow.value}</td>
                        </tr>
                    )}
                </tbody>
            </table>
            {truncatedRows && (
                <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-center text-[11px] text-slate-400">
                    … {rows.length - maxRows} more rows
                </div>
            )}
        </div>
    );
};

// --- Pivot table renderer ---

const PivotTableView: React.FC<{ pivot: PivotResult; language: string }> = ({ pivot, language }) => {
    const totalLabel = getTranslation('provenance_step3_total_label', language);

    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
                <thead>
                    <tr className="bg-slate-50">
                        <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold text-violet-700 bg-violet-50">{pivot.rowCol}</th>
                        {pivot.pivotColumns.map(pc => (
                            <th key={pc} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-600">
                                {pc.length > 16 ? `${pc.slice(0, 14)}…` : pc}
                            </th>
                        ))}
                        <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-right font-bold text-emerald-700 bg-emerald-50">{totalLabel}</th>
                    </tr>
                </thead>
                <tbody>
                    {pivot.rows.map((row, i) => (
                        <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/40`}>
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-1.5 font-medium text-violet-800">{formatCell(row[pivot.rowCol])}</td>
                            {pivot.pivotColumns.map(pc => (
                                <td key={pc} className="whitespace-nowrap border-b border-slate-100 px-3 py-1.5 text-right text-slate-700">{formatNumber(parseNumeric(row[pc]))}</td>
                            ))}
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-1.5 text-right font-semibold text-emerald-800 bg-emerald-50/50">{formatNumber(parseNumeric(row['Total']))}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="bg-emerald-50 font-semibold">
                        <td className="border-t-2 border-emerald-200 px-3 py-2 text-right text-emerald-800">{totalLabel}</td>
                        {pivot.pivotColumns.map(pc => (
                            <td key={pc} className="border-t-2 border-emerald-200 px-3 py-2 text-right text-emerald-800">{formatNumber(pivot.columnTotals[pc] ?? 0)}</td>
                        ))}
                        <td className="border-t-2 border-emerald-300 px-3 py-2 text-right font-bold text-emerald-900 bg-emerald-100">{formatNumber(pivot.grandTotal)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
};

// --- Main GroupByTest component ---

interface GroupByTestProps {
    rows: CsvRow[];
    language: string;
    accentColor: string;
    onRequestCard?: (message: string, precomputedData?: CsvRow[]) => void;
}

export const GroupByTest: React.FC<GroupByTestProps> = ({ rows, language, accentColor, onRequestCard }) => {
    const [groupBy, setGroupBy] = useState('');
    const [pivotBy, setPivotBy] = useState('');
    const [valueCol, setValueCol] = useState('');
    const [agg, setAgg] = useState<'sum' | 'count' | 'avg'>('sum');

    const { numeric, categorical } = useMemo(() => detectColumns(rows), [rows]);

    const flatResult = useMemo(() => {
        if (pivotBy || !groupBy || !valueCol) return null;
        return computeAggregation(rows, groupBy, valueCol, agg);
    }, [rows, groupBy, valueCol, agg, pivotBy]);

    const pivotResult = useMemo(() => {
        if (!pivotBy || !groupBy || !valueCol) return null;
        return computePivotAggregation(rows, groupBy, pivotBy, valueCol, agg);
    }, [rows, groupBy, pivotBy, valueCol, agg]);

    const pivotOptions = useMemo(
        () => categorical.filter(col => col !== groupBy),
        [categorical, groupBy],
    );

    const t = (key: string, params?: Record<string, string | number>) => getTranslation(key, language, params);
    const totalValue = pivotResult?.grandTotal ?? flatResult?.total ?? 0;

    return (
        <div className="flex h-full flex-col gap-3">
            <div className={`flex flex-wrap items-end gap-3 rounded-lg border p-3 border-${accentColor}-200 bg-${accentColor}-50/30`}>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">{t('provenance_step3_group_by_label')}</label>
                    <select value={groupBy} onChange={e => { setGroupBy(e.target.value); if (e.target.value === pivotBy) setPivotBy(''); }} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800">
                        <option value="">—</option>
                        {categorical.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">{t('provenance_pivot_by_label')}</label>
                    <select value={pivotBy} onChange={e => setPivotBy(e.target.value)} disabled={!groupBy} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 disabled:opacity-40">
                        <option value="">{t('provenance_pivot_none')}</option>
                        {pivotOptions.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">{t('provenance_step3_agg_label')}</label>
                    <select value={agg} onChange={e => setAgg(e.target.value as 'sum' | 'count' | 'avg')} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800">
                        <option value="sum">SUM</option>
                        <option value="count">COUNT</option>
                        <option value="avg">AVG</option>
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">{t('provenance_step3_value_label')}</label>
                    <select value={valueCol} onChange={e => setValueCol(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800">
                        <option value="">—</option>
                        {numeric.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
                {pivotResult ? (
                    <PivotTableView pivot={pivotResult} language={language} />
                ) : flatResult ? (
                    <DataTable
                        rows={flatResult.rows}
                        maxRows={30}
                        highlightCols={[groupBy, valueCol]}
                        totalRow={{ label: t('provenance_step3_total_label'), value: formatNumber(flatResult.total), colSpan: 1 }}
                    />
                ) : (
                    <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                        {t('provenance_step3_no_numeric_cols')}
                    </div>
                )}
            </div>
            {(flatResult || pivotResult) && groupBy && valueCol && (
                <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                    <IconInsights className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div className="flex flex-1 items-center justify-between gap-3">
                        <span>
                            {pivotBy
                                ? t('provenance_pivot_excel_hint', { group: groupBy, pivot: pivotBy, agg: agg.toUpperCase(), value: valueCol })
                                : t('provenance_step3_try_excel', { hint: `${agg.toUpperCase()}IF(${groupBy}, "…", ${valueCol}) = ${formatNumber(totalValue)}` })
                            }
                        </span>
                        {onRequestCard && (
                            <button
                                type="button"
                                onClick={() => {
                                    const dataRows = flatResult?.rows ?? pivotResult?.rows ?? [];
                                    const previewLines = dataRows.slice(0, 5).map(r =>
                                        `${String(r[groupBy] ?? '?')}: ${formatNumber(parseNumeric(r[valueCol]))}`
                                    ).join(', ');
                                    const filterNote = `IMPORTANT: The user is viewing a filtered subset of the data. The precomputed results below are the ground truth for this card — do NOT re-query the full dataset. Use these exact figures in your response: ${dataRows.length} groups, total=${formatNumber(totalValue)}. Breakdown: ${previewLines}.`;
                                    const cardDesc = pivotBy
                                        ? `Create a new analysis card: pivot table with rows=${groupBy}, columns=${pivotBy}, values=${agg.toUpperCase()}(${valueCol}). ${filterNote}`
                                        : `Create a new analysis card: ${agg.toUpperCase()}(${valueCol}) grouped by ${groupBy}. ${filterNote}`;
                                    onRequestCard(cardDesc, dataRows);
                                }}
                                className="shrink-0 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                                {t('groupby_create_card')}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- View mode toggle ---

export const ViewModeToggle: React.FC<{
    isGroupBy: boolean;
    onToggle: (v: boolean) => void;
    language: string;
}> = ({ isGroupBy, onToggle, language }) => (
    <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-0.5">
        <button
            type="button"
            onClick={() => onToggle(false)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${!isGroupBy ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
            {getTranslation('provenance_view_data', language)}
        </button>
        <button
            type="button"
            onClick={() => onToggle(true)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${isGroupBy ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
            {getTranslation('provenance_view_group_by', language)}
        </button>
    </div>
);
