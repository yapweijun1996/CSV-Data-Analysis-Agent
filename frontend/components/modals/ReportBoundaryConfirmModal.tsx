
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { getPipelineOutcomeUserText, getStructureReviewReasonText, getTranslation, STRUCTURE_REVIEW_REASON_CODES } from '../../utils/localization';
import type { ReportBoundary } from '../../types';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import {
    countSummaryContentRows,
    resolveEffectiveSummaryStartIndex,
} from '../../services/agent/reportStructureNormalization';
import { suggestColumnRoles } from '../../services/data/columnRoleSuggestion';
import { formatSetAsideRowCounts } from '../../utils/setAsideTables';
import { StructureRepairReviewPanel } from './StructureRepairReviewPanel';
import { CsvSourceScanPanel } from '../CsvSourceScanPanel';

type BusinessRole = 'dimension' | 'metric' | 'identifier' | 'helper';
const ROLE_OPTIONS: Array<{ value: BusinessRole; labelKey: string }> = [
    { value: 'dimension', labelKey: 'review_role_option_dimension' },
    { value: 'metric', labelKey: 'review_role_option_metric' },
    { value: 'identifier', labelKey: 'review_role_option_identifier' },
    { value: 'helper', labelKey: 'review_role_option_helper' },
];

const MAX_PREVIEW_COLS = 7;
const SAFE_REASON_CODES: readonly string[] = STRUCTURE_REVIEW_REASON_CODES;
const SAFE_TECHNICAL_MESSAGES: readonly string[] = [
    'Structure review is required before automatic analysis.',
    'Canonical dataset generation did not complete, so automatic analysis remains blocked.',
    'Shape verification failed after canonicalization.',
    'Canonical dataset is ready, but SQL precheck blocked the preferred SQL path. Analysis can proceed with degraded guidance.',
    'Canonical dataset is ready, but SQL precheck could not confirm the preferred SQL path. Analysis can proceed with degraded guidance.',
    'Waiting for the final SQL readiness checks before automatic analysis continues.',
    'Structure resolved as row_table.',
    'Structure resolved as long_fact_table.',
    'Structure resolved as long_statement_table.',
];

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
    const csvData = useAppStore(s => s.csvData);
    const semanticSnapshot = useAppStore(s => s.datasetSemanticSnapshot);
    const repairReview = useAppStore(s => s.structureRepairReview);
    const semanticReviewRequired = rawIntakeIr?.diagnostics?.headerShapeDrift === true
        || pipelineOutcome?.reasonCode === 'header_shape_drift' || Boolean(repairReview);
    const repairRequired = semanticReviewRequired || pipelineOutcome?.reasonCode === 'source_scan_anomalies';

    const [bodyStart, setBodyStart] = useState(0);
    const [summaryStart, setSummaryStart] = useState<number | null>(null);
    const [confirming, setConfirming] = useState(false);
    // Columns where the user chose "not sure" over the app's suggestion.
    const [declinedSuggestions, setDeclinedSuggestions] = useState<ReadonlySet<string>>(new Set());
    const [canScrollMore, setCanScrollMore] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Only the guess shown in the dialog; it is stored only when the user changes a role.
    const roleSuggestions = useMemo(() => suggestColumnRoles({
        profiles: columnProfiles ?? [],
        rows: csvData?.data,
        semanticAnnotations: semanticSnapshot?.columnAnnotations,
    }), [columnProfiles, csvData, semanticSnapshot]);

    const updateScrollCue = useCallback(() => {
        const element = scrollRef.current;
        if (!element) return;
        setCanScrollMore(element.scrollHeight - element.scrollTop - element.clientHeight > 8);
    }, []);
    useEffect(() => {
        updateScrollCue();
    });
    useEffect(() => {
        if (!isOpen) return undefined;
        window.addEventListener('resize', updateScrollCue);
        return () => window.removeEventListener('resize', updateScrollCue);
    }, [isOpen, updateScrollCue]);

    const t = (key: string, params?: Record<string, string | number>) =>
        getTranslation(key, language, params);

    const handleClose = useCallback(() => {
        if (!confirming && !isBusy) setModalOpen(false);
    }, [confirming, isBusy, setModalOpen]);
    const dialogRef = useDialogAccessibility<HTMLDivElement>(isOpen, handleClose);

    useEffect(() => {
        if (isOpen && reportStructureResolution) {
            setBodyStart(reportStructureResolution.bodyStartIndex ?? 0);
            // A boundary followed only by trailing blank lines is "no summary".
            setSummaryStart(resolveEffectiveSummaryStartIndex(
                rawIntakeIr?.normalizedRows ?? [],
                reportStructureResolution.summaryStartIndex,
            ));
            setConfirming(false);
            setDeclinedSuggestions(new Set());
        }
    }, [isOpen, reportStructureResolution, rawIntakeIr]);

    if (!isOpen) return null;
    // Do not present positional header guesses or role suggestions as trusted repair evidence.
    // Compacted headers may also have no provisional boundary; local review must remain reachable.
    if (!reportStructureResolution || repairRequired) return rawIntakeIr ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={handleClose}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="repair-review-title" tabIndex={-1}
                onClick={event => event.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-6 space-y-4">
                <h2 id="repair-review-title" className="text-base font-semibold">{reportStructureResolution ? t('guided_repair_title') : 'Review structural interpretations'}</h2>
                <CsvSourceScanPanel />
                {semanticReviewRequired && <StructureRepairReviewPanel />}
                <p className="text-sm text-amber-950">Boundary confirmation cannot approve structural repair. Full validation and separate exact Dataset Commit approval remain required.</p>
                <div className="flex justify-end gap-3">
                    <button onClick={handleClose} className="rounded border px-4 py-2 text-sm">Cancel</button>
                    <button disabled className="rounded bg-blue-600 px-4 py-2 text-sm text-white opacity-50">{t('boundary_confirm_button')}</button>
                </div>
            </div>
        </div>
    ) : null;

    const rows = rawIntakeIr?.normalizedRows ?? [];
    const totalRows = rows.length;
    const headerLayerIdxs = reportStructureResolution.headerLayerRowIndexes;
    const headerDepth = headerLayerIdxs.length || 1;
    // Reason codes are internal check identifiers; end users get plain
    // explanations and the codes stay in the technical details disclosure.
    const structureReviewPending = pipelineOutcome?.status === 'needs_structure_review'
        || reportStructureResolution.requiresHumanReview === true;
    const blockingReasonCodes = reportStructureResolution.blockingReasons ?? [];
    const reasonCodes = blockingReasonCodes.length > 0
        ? blockingReasonCodes
        : structureReviewPending && pipelineOutcome?.reasonCode
            ? [pipelineOutcome.reasonCode]
            : [];
    const reasonTexts = Array.from(new Set(reasonCodes.map(code => getStructureReviewReasonText(code, language))));
    // Both fields may contain source-derived text, including inside code-looking strings.
    const safeReasonCodes = Array.from(new Set(reasonCodes.map(code =>
        SAFE_REASON_CODES.includes(code) ? code : 'unknown_diagnostic',
    )));
    const technicalMessages = Array.from(new Set(
        [reportStructureResolution.decision?.reason, pipelineOutcome?.message]
            .filter((message): message is string => Boolean(message))
            .map(message => SAFE_TECHNICAL_MESSAGES.includes(message)
                ? message
                : `${t('structure_review_reason_unknown')} (unknown_diagnostic)`),
    ));

    const effectiveSummaryStart = summaryStart !== null && summaryStart < totalRows ? summaryStart : null;
    const sections = rawIntakeIr?.diagnostics?.setAsideSections ?? [];
    const analysedRowsEnd = sections.reduce((end, section) => Math.min(end, section.rowStart), totalRows);
    // Keep the set-aside notice tied to the selected summary boundary.
    const setAsideSections = effectiveSummaryStart === null
        ? []
        : sections.filter(section => section.rowStart >= effectiveSummaryStart);

    // Build preview: header rows + first body rows + summary rows
    type PreviewRow = { rowIndex: number; role: 'header' | 'body' | 'summary'; cells: string[] };
    const previewRows: PreviewRow[] = [];

    const headerIdxSet = new Set(headerLayerIdxs);
    for (const idx of headerIdxSet) {
        if (rows[idx]) previewRows.push({ rowIndex: idx, role: 'header', cells: rows[idx] });
    }
    const bStart = Math.max(0, Math.min(bodyStart, Math.max(0, totalRows - 1)));
    const bodyEnd = Math.min(effectiveSummaryStart ?? totalRows, analysedRowsEnd, totalRows);
    for (let i = bStart; i < Math.min(bStart + MAX_BODY_PREVIEW_ROWS, bodyEnd); i++) {
        if (rows[i] && !headerIdxSet.has(i)) previewRows.push({ rowIndex: i, role: 'body', cells: rows[i] });
    }
    if (effectiveSummaryStart !== null) {
        for (let i = effectiveSummaryStart; i < Math.min(effectiveSummaryStart + 2, analysedRowsEnd); i++) {
            if (rows[i] && !headerIdxSet.has(i)) previewRows.push({ rowIndex: i, role: 'summary', cells: rows[i] });
        }
    }

    const summaryRowCount = countSummaryContentRows(
        rows.slice(0, analysedRowsEnd).map((row, index) => headerIdxSet.has(index) ? [] : row),
        effectiveSummaryStart,
    );
    const dataRowCount = Math.max(0, bodyEnd - bStart)
        - [...headerIdxSet].filter(index => index >= bStart && index < bodyEnd).length;

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
    const updateColumnRole = (columnName: string, businessRole: BusinessRole | undefined) => {
        const existing = userColumnAnnotations[columnName];
        setColumnAnnotation({
            columnName,
            businessLabel: existing?.businessLabel || columnName,
            description: existing?.description || '',
            businessRole,
        });
    };
    const handleRoleChange = (columnName: string, value: string) => {
        const businessRole = (value || undefined) as BusinessRole | undefined;
        setDeclinedSuggestions(previous => {
            const next = new Set(previous);
            if (businessRole) next.delete(columnName); else next.add(columnName);
            return next;
        });
        updateColumnRole(columnName, businessRole);
    };

    // The role a column shows: the user's choice, else the app's suggestion unless declined.
    const roleEntries = columnProfiles.slice(0, 24).map(profile => {
        const chosen = userColumnAnnotations[profile.name]?.businessRole;
        const suggested = declinedSuggestions.has(profile.name) ? null : roleSuggestions[profile.name] ?? null;
        return {
            profile,
            value: chosen ?? suggested ?? '',
            isSuggestion: !chosen && suggested !== null,
        };
    });
    // Columns the app could not decide come first: they are the only ones that need an answer.
    const orderedRoleEntries = [
        ...roleEntries.filter(entry => entry.value === ''),
        ...roleEntries.filter(entry => entry.value !== ''),
    ];

    const summaryReason = reasonTexts[0]
        ?? (structureReviewPending
            ? t('structure_review_required_message')
            : getPipelineOutcomeUserText(pipelineOutcome, language)
                ?? t('guided_repair_default_block_reason'));
    const otherReasonTexts = reasonTexts.slice(1);
    const setAsideRowCounts = setAsideSections.map(section => section.rowCount);


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

                {/* Body: one scroll area, so no list is clipped inside another */}
                <div className="relative flex min-h-0 flex-1 flex-col">
                    <div ref={scrollRef} onScroll={updateScrollCue} className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
                        <StructureRepairReviewPanel />
                        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4" aria-label={t('guided_repair_safety_summary')}>
                            <h3 className="text-sm font-semibold text-amber-950">{t('guided_repair_safety_summary')}</h3>
                            <p className="mt-2 text-sm text-slate-700">{summaryReason}</p>
                            <p className="mt-1 text-sm font-medium text-slate-800">{t('review_summary_do')}</p>
                            <details className="mt-3 text-sm text-slate-600">
                                <summary className="cursor-pointer text-xs font-medium text-slate-700">{t('review_more_details')}</summary>
                                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                                    {otherReasonTexts.length > 0 && (
                                        <div className="sm:col-span-2">
                                            <dt className="font-semibold text-slate-700">{t('review_other_reasons')}</dt>
                                            <dd className="mt-1 text-slate-600">
                                                <ul className="list-disc space-y-1 pl-4">
                                                    {otherReasonTexts.map(text => <li key={text}>{text}</li>)}
                                                </ul>
                                            </dd>
                                        </div>
                                    )}
                                    <div>
                                        <dt className="font-semibold text-slate-700">{t('guided_repair_why_blocked')}</dt>
                                        <dd className="mt-1 text-slate-600">
                                            {structureReviewPending
                                                ? t('structure_review_required_message')
                                                : getPipelineOutcomeUserText(pipelineOutcome, language)
                                                    ?? t('guided_repair_default_block_reason')}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="font-semibold text-slate-700">{t('guided_repair_attempted')}</dt>
                                        <dd className="mt-1 text-slate-600">
                                            {cleaningRun?.loopCount
                                                ? t('guided_repair_attempt_count', { count: cleaningRun.loopCount })
                                                : t('guided_repair_inspection_only')}
                                        </dd>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <dt className="font-semibold text-slate-700">{t('guided_repair_required')}</dt>
                                        <dd className="mt-1 text-slate-600">{t('guided_repair_required_action')}</dd>
                                    </div>
                                </dl>
                                {(reasonCodes.length > 0 || technicalMessages.length > 0) && (
                                    <details className="mt-3 text-xs text-slate-600">
                                        <summary className="cursor-pointer font-medium text-slate-700">{t('structure_review_technical_details')}</summary>
                                        <div className="mt-2 space-y-1 break-words font-mono">
                                            {safeReasonCodes.length > 0 && (
                                                <p>{t('structure_review_technical_codes', { codes: safeReasonCodes.join(', ') })}</p>
                                            )}
                                            {technicalMessages.map(message => <p key={message}>{message}</p>)}
                                        </div>
                                    </details>
                                )}
                            </details>
                        </section>

                        {setAsideSections.length > 0 && (
                            <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                                {t('review_set_aside_stacked', { count: setAsideSections.length + 1 })}
                            </p>
                        )}

                        {/* Summary cards */}
                        <div className={`grid grid-cols-1 gap-3 ${setAsideSections.length > 0 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
                            <div className="bg-blue-50 rounded-lg p-3">
                                <div className="text-xs text-blue-600 font-medium mb-0.5">{t('boundary_confirm_header_depth')}</div>
                                <div className="text-xl font-semibold text-blue-800">
                                    {t(headerDepth === 1 ? 'review_header_layers_one' : 'review_header_layers_many', { count: headerDepth })}
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
                                    {summaryRowCount}
                                </div>
                                <div className="text-xs text-amber-500">
                                    {effectiveSummaryStart !== null && summaryRowCount > 0
                                        ? t('boundary_confirm_summary_rows_from', { row: effectiveSummaryStart + 1 })
                                        : t('boundary_confirm_no_summary')}
                                </div>
                            </div>
                            {setAsideSections.length > 0 && (
                                <div className="bg-slate-100 rounded-lg p-3">
                                    <div className="text-xs text-slate-600 font-medium mb-0.5">
                                        {t(setAsideSections.length === 1 ? 'review_set_aside_tile_one' : 'review_set_aside_tile_many')}
                                    </div>
                                    <div className="text-xl font-semibold text-slate-800">{setAsideSections.length}</div>
                                    <div className="text-xs text-slate-500">{formatSetAsideRowCounts(setAsideRowCounts, language)}</div>
                                </div>
                            )}
                        </div>

                        {/* Adjustable inputs */}
                        <section aria-label={t('review_boundary_title')}>
                            <h3 className="mb-2 text-sm font-semibold text-slate-900">{t('review_boundary_title')}</h3>
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
                        </section>

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

                        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4" aria-label={t('review_roles_title')}>
                            <h3 className="text-sm font-semibold text-slate-900">{t('review_roles_title')}</h3>
                            <p className="mt-1 text-xs text-slate-600">{t('review_roles_hint')}</p>
                            <p className="mt-1 text-xs text-slate-500">{t('review_roles_example')}</p>
                            <div className="mt-3 space-y-2">
                                {orderedRoleEntries.map(({ profile, value, isSuggestion }) => (
                                    <label
                                        key={profile.name}
                                        className={`grid grid-cols-1 items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(14rem,auto)] sm:gap-3 ${
                                            value === '' ? 'border-amber-300' : 'border-slate-200'
                                        }`}
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span className="min-w-0 truncate font-medium text-slate-800" title={profile.name}>{profile.name}</span>
                                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{profile.type}</span>
                                            {isSuggestion && (
                                                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                                    {t('review_role_suggested')}
                                                </span>
                                            )}
                                            {value === '' && (
                                                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                                    {t('review_role_needs_choice')}
                                                </span>
                                            )}
                                        </span>
                                        <select
                                            value={value}
                                            onChange={event => handleRoleChange(profile.name, event.target.value)}
                                            className="min-h-[44px] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 md:min-h-0"
                                            aria-label={t('guided_repair_field_role_label', { column: profile.name })}
                                        >
                                            <option value="">{t('review_role_option_unspecified')}</option>
                                            {ROLE_OPTIONS.map(option => (
                                                <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                                            ))}
                                        </select>
                                    </label>
                                ))}
                            </div>
                        </section>
                    </div>
                    {canScrollMore && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-center bg-gradient-to-t from-white to-transparent pb-2" aria-hidden="true">
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                                {'↓'} {t('review_scroll_more')}
                            </span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 flex flex-col items-end gap-2 flex-shrink-0">
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
                            disabled={confirming || isBusy || repairRequired}
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
                    <p className="text-xs text-slate-500">{repairRequired ? 'Boundary confirmation cannot approve structural repair. Use the bound semantic review above; dataset commit is separate.' : t('review_confirm_reassurance')}</p>
                </div>
            </div>
        </div>
    );
};
