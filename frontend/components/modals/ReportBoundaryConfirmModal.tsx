
import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';
import type { ReportBoundary } from '../../types';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

const MAX_PREVIEW_COLS = 7;
const MAX_BODY_PREVIEW_ROWS = 4;
export const ReportBoundaryConfirmModal: React.FC = () => {
    const isOpen = useAppStore(s => s.isReportBoundaryConfirmModalOpen);
    const setModalOpen = useAppStore(s => s.setIsReportBoundaryConfirmModalOpen);
    const reportStructureResolution = useAppStore(s => s.reportStructureResolution);
    const rawIntakeIr = useAppStore(s => s.rawIntakeIr);
    const saveReportStructureBoundaryOverride = useAppStore(s => s.saveReportStructureBoundaryOverride);
    const isBusy = useAppStore(s => s.isBusy);
    const language = useAppStore(s => s.settings.language);
    const pipelineOutcome = useAppStore(s => s.pipelineOutcome);
    const cleaningRun = useAppStore(s => s.cleaningRun);
    const columnProfiles = useAppStore(s => s.columnProfiles);
    const userColumnAnnotations = useAppStore(s => s.userColumnAnnotations);
    const setColumnAnnotation = useAppStore(s => s.setColumnAnnotation);

    const [bodyStart, setBodyStart] = useState(0);
    const [summaryStart, setSummaryStart] = useState<number | null>(null);
    const [confirming, setConfirming] = useState(false);

    const t = (key: string, params?: Record<string, string | number>) =>
        getTranslation(key, language, params);

    const handleClose = useCallback(() => {
        if (!confirming && !isBusy) setModalOpen(false);
    }, [confirming, isBusy, setModalOpen]);
    const dialogRef = useDialogAccessibility<HTMLDivElement>(isOpen, handleClose);

    useEffect(() => {
        if (isOpen && reportStructureResolution) {
            setBodyStart(reportStructureResolution.bodyStartIndex ?? 0);
            setSummaryStart(reportStructureResolution.summaryStartIndex ?? null);
            setConfirming(false);
        }
    }, [isOpen, reportStructureResolution]);

    if (!isOpen || !reportStructureResolution) return null;

    const rows = rawIntakeIr?.normalizedRows ?? [];
    const totalRows = rows.length;
    const headerLayerIdxs = reportStructureResolution.headerLayerRowIndexes;
    const headerDepth = headerLayerIdxs.length || 1;

    // Build preview: header rows + first body rows + summary rows
    type PreviewRow = { rowIndex: number; role: 'header' | 'body' | 'summary'; cells: string[] };
    const previewRows: PreviewRow[] = [];

    const headerIdxSet = new Set(headerLayerIdxs);
    for (const idx of headerLayerIdxs) {
        if (rows[idx]) previewRows.push({ rowIndex: idx, role: 'header', cells: rows[idx] });
    }
    const bStart = Math.max(0, Math.min(bodyStart, totalRows - 1));
    for (let i = bStart; i < Math.min(bStart + MAX_BODY_PREVIEW_ROWS, totalRows); i++) {
        if (rows[i] && !headerIdxSet.has(i)) previewRows.push({ rowIndex: i, role: 'body', cells: rows[i] });
    }
    if (summaryStart !== null) {
        for (let i = summaryStart; i < Math.min(summaryStart + 2, totalRows); i++) {
            if (rows[i] && !headerIdxSet.has(i)) previewRows.push({ rowIndex: i, role: 'summary', cells: rows[i] });
        }
    }

    const effectiveSummaryStart = summaryStart !== null ? summaryStart : null;
    const dataRowCount = effectiveSummaryStart !== null
        ? Math.max(0, effectiveSummaryStart - bStart)
        : Math.max(0, totalRows - bStart);

    const triggerConfirm = async () => {
        if (confirming) return;
        setConfirming(true);
        const boundary: ReportBoundary = {
            headerRowIndex: reportStructureResolution.headerRowIndex,
            headerLayerRowIndexes: reportStructureResolution.headerLayerRowIndexes,
            bodyStartIndex: bStart,
            summaryStartIndex: effectiveSummaryStart,
            parameterRowIndexes: reportStructureResolution.parameterRowIndexes,
            repeatedHeaderRowIndexes: reportStructureResolution.repeatedHeaderRowIndexes,
        };
        try {
            await saveReportStructureBoundaryOverride(boundary);
        } catch (err) {
            console.error('[BoundaryConfirm] save failed:', err);
        } finally {
            setConfirming(false);
        }
    };
    const updateColumnRole = (
        columnName: string,
        businessRole: 'dimension' | 'metric' | 'identifier' | 'helper' | undefined,
    ) => {
        const existing = userColumnAnnotations[columnName];
        setColumnAnnotation({
            columnName,
            businessLabel: existing?.businessLabel || columnName,
            description: existing?.description || '',
            businessRole,
        });
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={handleClose}
        >
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="boundary-confirm-title"
                aria-describedby="boundary-confirm-desc"
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
                className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] outline-none"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex-shrink-0">
                    <h2 id="boundary-confirm-title" className="text-base font-semibold text-slate-800">{t('guided_repair_title')}</h2>
                    <p id="boundary-confirm-desc" className="text-sm text-slate-500 mt-0.5">
                        {t('guided_repair_description')}
                    </p>
                </div>

                {/* Body */}
                <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
                    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4" aria-label={t('guided_repair_safety_summary')}>
                        <h3 className="text-sm font-semibold text-amber-950">{t('guided_repair_safety_summary')}</h3>
                        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="font-semibold text-slate-700">{t('guided_repair_detected')}</dt>
                                <dd className="mt-1 text-slate-600">{reportStructureResolution.decision.reason}</dd>
                            </div>
                            <div>
                                <dt className="font-semibold text-slate-700">{t('guided_repair_why_blocked')}</dt>
                                <dd className="mt-1 text-slate-600">{pipelineOutcome?.message ?? t('guided_repair_default_block_reason')}</dd>
                            </div>
                            <div>
                                <dt className="font-semibold text-slate-700">{t('guided_repair_attempted')}</dt>
                                <dd className="mt-1 text-slate-600">
                                    {cleaningRun?.loopCount
                                        ? t('guided_repair_attempt_count', { count: cleaningRun.loopCount })
                                        : t('guided_repair_inspection_only')}
                                </dd>
                            </div>
                            <div>
                                <dt className="font-semibold text-slate-700">{t('guided_repair_required')}</dt>
                                <dd className="mt-1 text-slate-600">{t('guided_repair_required_action')}</dd>
                            </div>
                        </dl>
                    </section>

                    {/* Summary cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-blue-50 rounded-lg p-3">
                            <div className="text-xs text-blue-600 font-medium mb-0.5">{t('boundary_confirm_header_depth')}</div>
                            <div className="text-xl font-semibold text-blue-800">
                                {t('boundary_confirm_header_depth_unit', { count: headerDepth })}
                            </div>
                            <div className="text-xs text-blue-500">
                                {t('boundary_confirm_header_rows_label', { rows: headerLayerIdxs.map(i => i + 1).join(', ') })}
                            </div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3">
                            <div className="text-xs text-green-600 font-medium mb-0.5">{t('boundary_confirm_data_rows')}</div>
                            <div className="text-xl font-semibold text-green-800">{dataRowCount}</div>
                            <div className="text-xs text-green-500">
                                {t('boundary_confirm_data_rows_from', { row: bStart + 1 })}
                            </div>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-3">
                            <div className="text-xs text-amber-600 font-medium mb-0.5">{t('boundary_confirm_summary_rows')}</div>
                            <div className="text-xl font-semibold text-amber-800">
                                {effectiveSummaryStart !== null ? totalRows - effectiveSummaryStart : 0}
                            </div>
                            <div className="text-xs text-amber-500">
                                {effectiveSummaryStart !== null
                                    ? t('boundary_confirm_summary_rows_from', { row: effectiveSummaryStart + 1 })
                                    : t('boundary_confirm_no_summary')}
                            </div>
                        </div>
                    </div>

                    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-sm font-semibold text-slate-900">{t('guided_repair_field_roles')}</h3>
                        <p className="mt-1 text-xs text-slate-600">{t('guided_repair_field_roles_hint')}</p>
                        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                            {columnProfiles.slice(0, 24).map(profile => (
                                <label key={profile.name} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(9rem,auto)] items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                                    <span className="min-w-0 truncate font-medium text-slate-800" title={profile.name}>{profile.name}</span>
                                    <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{profile.type}</span>
                                    <select
                                        value={userColumnAnnotations[profile.name]?.businessRole ?? ''}
                                        onChange={event => updateColumnRole(
                                            profile.name,
                                            (event.target.value || undefined) as 'dimension' | 'metric' | 'identifier' | 'helper' | undefined,
                                        )}
                                        className="min-h-[44px] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 md:min-h-0"
                                        aria-label={t('guided_repair_field_role_label', { column: profile.name })}
                                    >
                                        <option value="">{t('column_annotation_role_unspecified')}</option>
                                        <option value="dimension">{t('column_annotation_role_dimension')}</option>
                                        <option value="metric">{t('column_annotation_role_metric')}</option>
                                        <option value="identifier">{t('column_annotation_role_identifier')}</option>
                                        <option value="helper">{t('column_annotation_role_helper')}</option>
                                    </select>
                                </label>
                            ))}
                        </div>
                    </section>

                    {/* Adjustable inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                {t('boundary_confirm_body_start_label')}{' '}
                                <span className="text-slate-400">{t('boundary_confirm_body_start_hint')}</span>
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={totalRows}
                                value={bStart + 1}
                                onChange={e => {
                                    const parsed = parseInt(e.target.value, 10);
                                    if (Number.isNaN(parsed)) return;
                                    const v = Math.max(0, parsed - 1);
                                    setBodyStart(v);
                                    if (summaryStart !== null && summaryStart <= v) {
                                        setSummaryStart(v + 1 < totalRows ? v + 1 : null);
                                    }
                                }}
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                {t('boundary_confirm_summary_start_label')}{' '}
                                <span className="text-slate-400">{t('boundary_confirm_summary_start_hint')}</span>
                            </label>
                            <input
                                type="number"
                                min={bStart + 2}
                                max={totalRows}
                                value={summaryStart !== null ? summaryStart + 1 : ''}
                                placeholder={t('boundary_confirm_no_summary')}
                                onChange={e => {
                                    const raw = e.target.value;
                                    if (raw === '') { setSummaryStart(null); return; }
                                    const parsed = parseInt(raw, 10);
                                    if (Number.isNaN(parsed)) return;
                                    setSummaryStart(Math.max(bStart + 1, parsed - 1));
                                }}
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Preview table */}
                    {previewRows.length > 0 && (
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <div className="text-xs font-medium text-slate-500 bg-slate-50 px-3 py-2 border-b border-slate-200">
                                {t('boundary_confirm_preview_label')}
                            </div>
                            <div className="overflow-x-auto max-h-60">
                                <table className="w-full text-xs border-collapse">
                                    <tbody>
                                        {previewRows.map(({ rowIndex, role, cells }) => (
                                            <tr
                                                key={rowIndex}
                                                className={
                                                    role === 'header' ? 'bg-blue-50' :
                                                    role === 'summary' ? 'bg-amber-50' :
                                                    'bg-white even:bg-slate-50'
                                                }
                                            >
                                                <td className="px-2 py-1 text-slate-400 border-r border-slate-200 w-10 text-right font-mono">
                                                    {rowIndex + 1}
                                                </td>
                                                <td className="px-2 py-1 border-r border-slate-200 w-12 text-center">
                                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                        role === 'header' ? 'bg-blue-100 text-blue-700' :
                                                        role === 'summary' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-green-100 text-green-700'
                                                    }`}>
                                                        {role === 'header'
                                                            ? t('boundary_confirm_role_header')
                                                            : role === 'summary'
                                                            ? t('boundary_confirm_role_summary')
                                                            : t('boundary_confirm_role_data')}
                                                    </span>
                                                </td>
                                                {cells.slice(0, MAX_PREVIEW_COLS).map((cell, ci) => (
                                                    <td
                                                        key={ci}
                                                        className={`px-2 py-1 border-r border-slate-100 max-w-[110px] truncate ${
                                                            role === 'header' ? 'font-medium text-blue-800' : 'text-slate-600'
                                                        }`}
                                                        title={cell}
                                                    >
                                                        {cell || ''}
                                                    </td>
                                                ))}
                                                {cells.length > MAX_PREVIEW_COLS && (
                                                    <td className="px-2 py-1 text-slate-400 whitespace-nowrap">
                                                        +{cells.length - MAX_PREVIEW_COLS}
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 flex-shrink-0">
                    <div className="flex gap-3">
                        <button
                            onClick={() => setModalOpen(false)}
                            disabled={confirming || isBusy}
                            title={t('boundary_confirm_cancel_hint')}
                            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                        >
                            {t('boundary_confirm_cancel')}
                        </button>
                        <button
                            onClick={() => void triggerConfirm()}
                            disabled={confirming || isBusy}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {confirming ? (
                                <>
                                    <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    {t('boundary_confirm_processing')}
                                </>
                            ) : t('boundary_confirm_button')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
