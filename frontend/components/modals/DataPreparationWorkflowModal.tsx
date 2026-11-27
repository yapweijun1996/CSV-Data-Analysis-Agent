import React, { useEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore, type AppStore } from '../../store/useAppStore';
import {
    buildCleaningFailureBundleExport,
    buildWorkflowSnapshotExport,
} from '../../services/agent/buildHandoffExports';
import { copyText } from '../../services/utils/copyText';
import { buildDataPreparationWorkflowBundle } from '../../services/agent/buildDataPreparationWorkflowBundle';
import { DataPreparationWorkflowContent } from '../data-preparation/DataPreparationWorkflowContent';
import { pickDataPreparationWorkflowState } from '../data-preparation/workflowStore';
import { FullScreenFrame } from '../ui/FullScreenFrame';
import { BUTTON_PRIMARY_CLASS, BUTTON_SECONDARY_CLASS } from '../ui/formStyles';
import { exportDatasetToCsv, type ExportResult } from '../../utils/exportUtils';
import { buildCsvFileName, saveCsv } from '../../utils/csvExport';
import { getTranslation } from '../../utils/localization';
import { buildPublicBetaSupportBundle } from '../../services/support/publicBetaSupportBundle';
import { downloadDatasetBundleZip } from '../../services/data/datasetBundleExport';
import { readDatasetFileFromOpfs } from '../../services/data/opfsDatasetStorage';
import { getSandboxTableRows } from '../../services/data/sandboxTableRegistry';
import { getCsvDataRowCount } from '../../utils/datasetId';

const PUBLIC_SUPPORT_ISSUES_URL = 'https://github.com/yapweijun1996/React-CSV-Data-Analysis-Agent-Backup/issues';

const downloadTextFile = (contents: string, fileName: string): void => {
    const objectUrl = URL.createObjectURL(new Blob([contents], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(objectUrl);
};

export const DataPreparationWorkflowModal: React.FC = () => {
    const isOpen = useAppStore((state: AppStore) => state.isDataPreparationModalOpen);

    if (!isOpen) {
        return null;
    }

    return <OpenDataPreparationWorkflowModal />;
};

const OpenDataPreparationWorkflowModal: React.FC = () => {
    const {
        setIsDataPreparationModalOpen,
        setIsWorkspaceModalOpen,
        setIsDebugLogsModalOpen,
        setIsAgentModalOpen,
        sessionId,
        currentDatasetId,
        logAgentToolUsage,
        syncTelemetryToStore,
        saveReportStructureBoundaryOverride,
        csvData,
        canonicalCsvData,
        language,
        datasetBundle,
    } = useAppStore((state: AppStore) => ({
        setIsDataPreparationModalOpen: state.setIsDataPreparationModalOpen,
        setIsWorkspaceModalOpen: state.setIsWorkspaceModalOpen,
        setIsDebugLogsModalOpen: state.setIsDebugLogsModalOpen,
        setIsAgentModalOpen: state.setIsAgentModalOpen,
        sessionId: state.sessionId,
        currentDatasetId: state.currentDatasetId,
        logAgentToolUsage: state.logAgentToolUsage,
        syncTelemetryToStore: state.syncTelemetryToStore,
        saveReportStructureBoundaryOverride: state.saveReportStructureBoundaryOverride,
        csvData: state.csvData,
        canonicalCsvData: state.canonicalCsvData,
        language: state.settings.language,
        datasetBundle: state.datasetBundle,
    }), shallow);
    const workflowState = useAppStore(pickDataPreparationWorkflowState, shallow);
    const closeModal = () => setIsDataPreparationModalOpen(false);
    const openWorkspace = () => setIsWorkspaceModalOpen(true);
    const openLogs = () => setIsDebugLogsModalOpen(true);
    const openActivity = () => setIsAgentModalOpen(true);
    const hasLoggedOpenRef = useRef(false);
    const exportMenuRef = useRef<HTMLDetailsElement>(null);
    const workflow = useMemo(() => buildDataPreparationWorkflowBundle(workflowState as AppStore), [workflowState]);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'workflow' | 'failure' | 'download' | 'bundle' | 'support' | 'error'>('idle');
    const closeExportMenu = () => {
        if (exportMenuRef.current) exportMenuRef.current.open = false;
    };

    useEffect(() => {
        if (!hasLoggedOpenRef.current) {
            hasLoggedOpenRef.current = true;
            syncTelemetryToStore();
            logAgentToolUsage({
                tool: 'workspace_builder',
                description: 'Opened data preparation workflow modal.',
                detail: {
                    datasetId: currentDatasetId,
                    fileName: workflow.summary.fileName,
                    issueCount: workflow.summary.issueCount,
                },
            });
        }
    }, [currentDatasetId, logAgentToolUsage, syncTelemetryToStore, workflow.summary.fileName, workflow.summary.issueCount]);

    const handleOpenWorkspace = () => {
        closeModal();
        openWorkspace();
    };

    const handleOpenLogs = () => {
        closeModal();
        openLogs();
    };

    const handleOpenActivity = () => {
        closeModal();
        openActivity();
    };

    const handleCopyWorkflowSnapshot = async () => {
        closeExportMenu();
        try {
            await copyText(buildWorkflowSnapshotExport(workflowState as AppStore));
            setCopyStatus('workflow');
        } catch {
            setCopyStatus('error');
        }
    };

    const handleCopyFailureHandoff = async () => {
        closeExportMenu();
        try {
            await copyText(buildCleaningFailureBundleExport(workflowState as AppStore));
            setCopyStatus('failure');
        } catch {
            setCopyStatus('error');
        }
    };

    const handleDownloadCleanedCsv = async () => {
        closeExportMenu();
        const dataset = canonicalCsvData ?? csvData;
        if (!dataset) {
            setCopyStatus('error');
            return;
        }

        let result: ExportResult = { success: false, error: 'Dataset export failed.' };
        if (dataset.backing?.opfsPath) {
            // Open the save destination first (needs the click's user activation), then stream the stored file into it.
            const opfsPath = dataset.backing.opfsPath;
            try {
                const saved = await saveCsv(buildCsvFileName(`cleaned_${dataset.fileName}`), async sink => {
                    const sourceFile = await readDatasetFileFromOpfs(opfsPath);
                    if (!sourceFile) throw new Error('The temporary source file is unavailable. Re-import the original CSV.');
                    await sink.writeBlob(sourceFile);
                });
                result = { success: true, cancelled: !saved };
            } catch (error) {
                result = { success: false, error: error instanceof Error ? error.message : 'Dataset export failed.' };
            }
        } else {
            result = await exportDatasetToCsv(dataset.data, `cleaned_${dataset.fileName}`);
        }
        if (!result.success) {
            setCopyStatus('error');
            return;
        }
        if (result.cancelled) return;
        setCopyStatus('download');
        logAgentToolUsage({
            tool: 'workspace_builder',
            description: 'Downloaded the complete prepared CSV dataset.',
            detail: {
                datasetId: currentDatasetId,
                fileName: dataset.fileName,
                rowCount: getCsvDataRowCount(dataset),
            },
        });
    };

    const handleDownloadDatasetBundle = async () => {
        closeExportMenu();
        const dataset = canonicalCsvData ?? csvData;
        if (!datasetBundle || !dataset) {
            setCopyStatus('error');
            return;
        }
        try {
            await downloadDatasetBundleZip({
                bundle: datasetBundle,
                loadTableRows: async table => {
                    if (table.storage.mode === 'duckdb' && table.storage.opfsPath) {
                        const sourceFile = await readDatasetFileFromOpfs(table.storage.opfsPath);
                        if (sourceFile) return sourceFile;
                        throw new Error('The temporary source file is unavailable. Re-import the original CSV.');
                    }
                    if (table.tableId === datasetBundle.primaryTableId) return dataset.data;
                    const sandboxRows = getSandboxTableRows(datasetBundle.bundleId, table.tableId);
                    if (sandboxRows) return sandboxRows;
                    throw new Error(`Table data is unavailable for ${table.name}.`);
                },
                lineage: [],
                validationReport: {
                    structureResolution: datasetBundle.structureResolution,
                    pipelineOutcome: workflowState.pipelineOutcome,
                    workflowVerification: workflow.verification,
                },
            }, `${dataset.fileName.replace(/\.csv$/i, '')}-dataset-bundle.zip`);
            setCopyStatus('bundle');
        } catch (error) {
            setCopyStatus('error');
            logAgentToolUsage({
                tool: 'workspace_builder',
                description: 'Dataset bundle export failed.',
                detail: { error: error instanceof Error ? error.message : String(error) },
            });
        }
    };

    const handleDownloadSupportBundle = () => {
        closeExportMenu();
        const bundle = buildPublicBetaSupportBundle(workflowState as AppStore, {
            appVersion: import.meta.env.VITE_APP_VERSION ?? '0.1.0-beta.1',
            releaseCommit: import.meta.env.VITE_RELEASE_COMMIT ?? 'local-build',
            userAgent: navigator.userAgent,
            language: navigator.language,
        });
        downloadTextFile(bundle, 'csv-analysis-public-beta-support.md');
        setCopyStatus('support');
        logAgentToolUsage({
            tool: 'workspace_builder',
            description: 'Downloaded a sanitized public Beta support bundle.',
            detail: {
                datasetId: currentDatasetId,
                automaticUpload: false,
            },
        });
    };

    const handlePrimaryAction = () => {
        closeModal();
        if (workflow.cta.primaryAction === 'open_workspace') {
            openWorkspace();
            return;
        }
        requestAnimationFrame(() => {
            document.getElementById('analysis-results-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    const handleConfirmStructureBoundary = () => {
        const detectedBoundary = workflow.structureReview?.detectedBoundary;
        if (!detectedBoundary || detectedBoundary.headerRowIndex === null || detectedBoundary.bodyStartIndex === null) {
            return;
        }
        void saveReportStructureBoundaryOverride({
            headerRowIndex: detectedBoundary.headerRowIndex,
            headerLayerRowIndexes: detectedBoundary.headerLayerRowIndexes,
            bodyStartIndex: detectedBoundary.bodyStartIndex,
            summaryStartIndex: detectedBoundary.summaryStartIndex,
            parameterRowIndexes: detectedBoundary.parameterRowIndexes,
            repeatedHeaderRowIndexes: detectedBoundary.repeatedHeaderRowIndexes,
        });
    };

    return (
        <FullScreenFrame
            isOpen
            onClose={closeModal}
            titleId="workflow-dialog-title"
            eyebrow="AI Data IDE workflow"
            title="Data Preparation Workflow"
            description="Fullscreen review for import, inspection, preparation, verification, and analysis readiness."
            closeLabel="Close workflow modal"
            restoreFocusSelector='[data-advanced-trigger="true"]'
            actions={
                <>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                                copyStatus === 'error'
                                    ? 'bg-danger-100 text-danger-700'
                                    : copyStatus === 'workflow'
                                        ? 'bg-info-100 text-info-800'
                                        : copyStatus === 'failure'
                                            ? 'bg-success-100 text-success-700'
                                            : 'bg-slate-200 text-slate-700'
                            }`}>
                                {copyStatus === 'workflow'
                                    ? 'Workflow snapshot copied'
                                    : copyStatus === 'failure'
                                        ? 'Cleaning failure bundle copied'
                                        : copyStatus === 'support'
                                            ? getTranslation('support_bundle_downloaded', language)
                                        : copyStatus === 'download'
                                            ? getTranslation('cleaned_csv_downloaded', language)
                                        : copyStatus === 'bundle'
                                            ? 'Dataset bundle downloaded'
                                        : copyStatus === 'error'
                                            ? 'Copy failed'
                                            : 'Copy ready'}
                            </span>
                            <details ref={exportMenuRef} className="relative">
                                <summary className="flex min-h-[44px] cursor-pointer items-center rounded-card border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                                    Advanced exports
                                </summary>
                                <div className="absolute right-0 z-30 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-2 rounded-card border border-slate-200 bg-white p-3 shadow-xl">
                                    <p className="text-xs text-slate-600">Download the complete prepared dataset or copy a technical handoff bundle.</p>
                                    <button
                                        onClick={() => void handleDownloadCleanedCsv()}
                                        disabled={!(canonicalCsvData ?? csvData)}
                                        className="min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {getTranslation('download_complete_cleaned_csv', language)}
                                    </button>
                                    <button
                                        onClick={() => void handleDownloadDatasetBundle()}
                                        disabled={!datasetBundle || !(canonicalCsvData ?? csvData)}
                                        className="min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Download complete dataset bundle (ZIP)
                                    </button>
                                    <button onClick={handleDownloadSupportBundle} className="min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700">
                                        {getTranslation('download_sanitized_support_bundle', language)}
                                    </button>
                                    <a
                                        href={PUBLIC_SUPPORT_ISSUES_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={closeExportMenu}
                                        className="flex min-h-[44px] items-center rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700"
                                    >
                                        {getTranslation('open_github_support', language)}
                                    </a>
                                    <button onClick={handleCopyWorkflowSnapshot} className="min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700">Copy workflow snapshot</button>
                                    <button onClick={handleCopyFailureHandoff} className="min-h-[44px] rounded-card border border-slate-300 px-3 py-2 text-left text-sm text-slate-700">Copy cleaning failure bundle</button>
                                </div>
                            </details>
                            <button
                                onClick={handleOpenLogs}
                                className={BUTTON_SECONDARY_CLASS}
                            >
                                Open Logs
                            </button>
                            <button
                                onClick={handleOpenWorkspace}
                                className={BUTTON_PRIMARY_CLASS}
                            >
                                Open Artifacts
                            </button>
                </>
            }
        >
                <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-4 lg:px-5 xl:px-6">
                    {!workflow.summary.fileName ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 min-h-[320px] rounded-card border border-slate-200 bg-white">
                            <p className="text-lg font-semibold text-slate-700">No workflow is available yet.</p>
                            <p className="mt-2 max-w-md text-sm">Upload a CSV or open a saved report first. Then this modal will show the full Data Preparation Workflow.</p>
                        </div>
                    ) : (
                        <DataPreparationWorkflowContent
                            workflow={workflow}
                            defaultDetailMode="summary"
                            embeddedInDialog
                            onPrimaryAction={handlePrimaryAction}
                            onOpenWorkspace={handleOpenWorkspace}
                            onOpenActivity={handleOpenActivity}
                            activityEvents={workflowState.agentEvents}
                            activitySessionId={sessionId}
                            activityDatasetId={currentDatasetId}
                            onConfirmStructureBoundary={handleConfirmStructureBoundary}
                            onSaveStructureBoundaryOverride={(boundary) => {
                                void saveReportStructureBoundaryOverride(boundary);
                            }}
                        />
                    )}
                </div>
        </FullScreenFrame>
    );
};
