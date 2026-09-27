import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore, type AppStore } from '../../store/useAppStore';
import { buildWorkspaceBundle } from '../../services/agent/buildWorkspaceBundle';
import { isWorkspaceWritablePath } from '../../services/agent/workspaceFileUtils';
import { hasOpenableLatestReport } from '../../services/reporting/reportArtifactManifest';
import type { WorkspaceFile } from '../../types';
import { IconClose } from '../../icons/IconClose';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

const splitLines = (value: string): string[] => value.replace(/\r\n/g, '\n').split('\n');
const countLines = (value: string): number => splitLines(value).length;

const getRootGroup = (path: string) => path.split('/').filter(Boolean)[0] ?? 'root';

const getMonacoLanguage = (language: WorkspaceFile['language']) => {
    switch (language) {
        case 'json':
            return 'json';
        case 'markdown':
            return 'markdown';
        case 'javascript':
            return 'javascript';
        case 'csv':
            return 'plaintext';
        case 'ndjson':
            return 'json';
        default:
            return 'plaintext';
    }
};

const WorkspaceModalEditor = lazy(() =>
    import('./WorkspaceModalEditor').then(module => ({ default: module.WorkspaceModalEditor })),
);

export const WorkspaceModal: React.FC = () => {
    const { isOpen, onClose, logAgentToolUsage, workspaceState, openLatestAnalystReport, exportLatestAnalystReportPdf, hasLatestAnalystReport } = useAppStore((store: AppStore) => ({
        isOpen: store.isWorkspaceModalOpen,
        onClose: () => store.setIsWorkspaceModalOpen(false),
        logAgentToolUsage: store.logAgentToolUsage,
        openLatestAnalystReport: store.openLatestAnalystReport,
        exportLatestAnalystReportPdf: store.exportLatestAnalystReportPdf,
        hasLatestAnalystReport: hasOpenableLatestReport(store.workspaceFiles),
        workspaceState: {
            sessionId: store.sessionId,
            currentDatasetId: store.currentDatasetId,
            confirmedAnalysisGoal: store.confirmedAnalysisGoal,
            settings: store.settings,
            csvData: store.csvData,
            rawCsvData: store.rawCsvData,
            initialDataSample: store.initialDataSample,
            columnProfiles: store.columnProfiles,
            analysisCards: store.analysisCards,
            chatHistory: store.chatHistory,
            dataPreparationPlan: store.dataPreparationPlan,
            spreadsheetFilterFunction: store.spreadsheetFilterFunction,
            activeSpreadsheetFilter: store.activeSpreadsheetFilter,
            aiFilterExplanation: store.aiFilterExplanation,
            activeDataQuery: store.activeDataQuery,
            dataQualityIssues: store.dataQualityIssues,
            finalSummary: store.finalSummary,
            agentEvents: store.agentEvents,
            agentToolLogs: store.agentToolLogs,
            telemetryEvents: store.telemetryEvents,
            workspaceFiles: store.workspaceFiles,
            workspaceActionHistory: store.workspaceActionHistory,
        } as Pick<AppStore,
            'sessionId'
            | 'currentDatasetId'
            | 'confirmedAnalysisGoal'
            | 'settings'
            | 'csvData'
            | 'rawCsvData'
            | 'initialDataSample'
            | 'columnProfiles'
            | 'analysisCards'
            | 'chatHistory'
            | 'dataPreparationPlan'
            | 'spreadsheetFilterFunction'
            | 'activeSpreadsheetFilter'
            | 'aiFilterExplanation'
            | 'activeDataQuery'
            | 'dataQualityIssues'
            | 'finalSummary'
            | 'agentEvents'
            | 'agentToolLogs'
            | 'telemetryEvents'
            | 'workspaceFiles'
            | 'workspaceActionHistory'
        >,
    }), shallow);
    const dialogRef = useDialogAccessibility<HTMLDivElement>(isOpen, onClose);
    const bundle = useMemo(() => buildWorkspaceBundle(workspaceState as AppStore), [workspaceState]);

    const [selectedPath, setSelectedPath] = useState('/dataset/cleaned.json');
    const [fileFilter, setFileFilter] = useState('');
    const [showDebugFiles, setShowDebugFiles] = useState(false);
    const hasLoggedOpenRef = useRef(false);

    const visibleFiles = useMemo(() => {
        const base = showDebugFiles
            ? [...bundle.primaryFiles, ...bundle.debugFiles]
            : bundle.primaryFiles;
        const query = fileFilter.trim().toLowerCase();
        if (!query) return base;
        return base.filter(file => file.path.toLowerCase().includes(query));
    }, [bundle.debugFiles, bundle.primaryFiles, fileFilter, showDebugFiles]);

    const groupedFiles = useMemo(() => visibleFiles.reduce<Record<string, typeof visibleFiles>>((acc, file) => {
        const group = file.group === 'debug' ? getRootGroup(file.path) : file.group;
        acc[group] = [...(acc[group] ?? []), file];
        return acc;
    }, {}), [visibleFiles]);

    const selectedFile = visibleFiles.find(file => file.path === selectedPath)
        ?? bundle.primaryFiles.find(file => file.path === selectedPath)
        ?? bundle.primaryFiles[0]
        ?? (showDebugFiles ? bundle.debugFiles[0] : null)
        ?? null;
    const selectedFileWritable = Boolean(selectedFile && isWorkspaceWritablePath(selectedFile.path));
    const selectedFileLineCount = selectedFile ? countLines(selectedFile.content) : 0;
    const selectedFileBytes = selectedFile ? new TextEncoder().encode(selectedFile.content).length : 0;

    useEffect(() => {
        if (!isOpen) {
            hasLoggedOpenRef.current = false;
            setShowDebugFiles(false);
            setFileFilter('');
            return;
        }
        if (!hasLoggedOpenRef.current) {
            hasLoggedOpenRef.current = true;
            logAgentToolUsage({
                tool: 'workspace_builder',
                description: 'Opened workspace modal.',
                detail: {
                    fileCount: bundle.files.length,
                    primaryFileCount: bundle.primaryFiles.length,
                    debugFileCount: bundle.debugFiles.length,
                },
            });
        }
    }, [bundle.debugFiles.length, bundle.files.length, bundle.primaryFiles.length, isOpen, logAgentToolUsage]);

    useEffect(() => {
        if (!selectedFile) return;
        setSelectedPath(selectedFile.path);
    }, [selectedFile?.path]);

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm" onClick={onClose}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="workspace-dialog-title"
                tabIndex={-1}
                className="relative flex h-screen w-screen flex-col bg-[#f8fafc]"
                onClick={event => event.stopPropagation()}
            >
                <header className="border-b border-slate-200 bg-white/95 backdrop-blur-xl">
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Artifacts</div>
                            <div className="mt-1 flex items-center gap-3">
                                <h2 id="workspace-dialog-title" className="text-lg font-semibold text-slate-900">Session Artifacts</h2>
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                                    {bundle.primaryFiles.length} files
                                </span>
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                                    {bundle.editableFiles.length} editable
                                </span>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {hasLatestAnalystReport ? (
                                <>
                                    <button
                                        onClick={openLatestAnalystReport}
                                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                                    >
                                        Open Report
                                    </button>
                                    <button
                                        onClick={exportLatestAnalystReportPdf}
                                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                                    >
                                        Export PDF
                                    </button>
                                </>
                            ) : null}
                            <button
                                onClick={() => setShowDebugFiles(current => !current)}
                                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                                    showDebugFiles
                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                }`}
                            >
                                {showDebugFiles ? 'Hide Debug' : `Show Debug (${bundle.debugFiles.length})`}
                            </button>
                            <button
                                data-dialog-initial-focus
                                onClick={onClose}
                                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                                aria-label="Close workspace modal"
                            >
                                <IconClose />
                            </button>
                        </div>
                    </div>
                </header>

                <div className="flex-1 min-h-0 overflow-hidden p-4">
                    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-card border border-slate-200 bg-white shadow-2xl lg:grid-cols-[300px_minmax(0,1fr)]">
                        <aside className="min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
                            <div className="border-b border-slate-200 px-4 py-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Explorer</div>
                                <label htmlFor="workspaceFileFilter" className="sr-only">
                                    File filter
                                </label>
                                <input
                                    id="workspaceFileFilter"
                                    value={fileFilter}
                                    onChange={event => setFileFilter(event.target.value)}
                                    placeholder="Filter files"
                                    className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
                                />
                            </div>
                            <div className="p-4">
                            <div className="mb-3">
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">
                                        {bundle.primaryFiles.length} primary
                                    </span>
                                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">
                                        {bundle.editableFiles.length} editable
                                    </span>
                                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">
                                        {visibleFiles.length} visible
                                    </span>
                                </div>
                            </div>

                            {visibleFiles.length === 0 ? (
                                <p className="text-sm text-slate-500">No files match the current filter.</p>
                            ) : (
                                <div className="space-y-3">
                                    {(Object.entries(groupedFiles) as Array<[string, typeof visibleFiles]>).map(([group, files]) => (
                                        <section key={group}>
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{group}</p>
                                                <span className="text-[11px] text-slate-500">{files.length}</span>
                                            </div>
                                            <div className="space-y-1">
                                                {files.map(file => (
                                                    <button
                                                        key={file.path}
                                                        onClick={() => setSelectedPath(file.path)}
                                                        className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                                                            selectedFile?.path === file.path
                                                                ? 'bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-400/40'
                                                                : 'text-slate-700 hover:bg-slate-100'
                                                        }`}
                                                    >
                                                        <span className="min-w-0 break-all">
                                                            {file.group === 'debug'
                                                                ? file.path.replace(`/${group}/`, '')
                                                                : file.path.replace(`/${file.group}/`, '')}
                                                        </span>
                                                        {file.badges?.includes('editable') ? (
                                                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                                selectedFile?.path === file.path
                                                                    ? 'bg-blue-100 text-blue-700'
                                                                    : 'bg-emerald-100 text-emerald-700'
                                                            }`}>
                                                                edit
                                                            </span>
                                                        ) : null}
                                                    </button>
                                                ))}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            )}
                            </div>
                        </aside>

                        <section className="min-h-0 flex flex-col bg-white">
                            <div className="border-b border-slate-200 bg-slate-50">
                                <div className="flex min-h-[44px] items-center justify-between gap-3 px-4">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <div className="rounded-t-md border border-b-0 border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                                            {selectedFile?.label ?? 'untitled'}
                                        </div>
                                        <span className="hidden text-xs text-slate-500 md:inline">{selectedFile?.path ?? 'No file selected'}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
                                            selectedFileWritable ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                                        }`}>
                                            {selectedFileWritable ? 'Writable' : 'Read only'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="border-b border-slate-200 bg-white px-4 py-3">
                                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-xs uppercase tracking-wide text-slate-500">Preview</p>
                                        <p className="mt-1 break-all text-sm font-semibold text-slate-900">{selectedFile?.path ?? 'No file selected'}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {selectedFile?.language.toUpperCase() ?? 'TEXT'} · {selectedFileLineCount} line{selectedFileLineCount === 1 ? '' : 's'} · {selectedFileBytes.toLocaleString()} bytes
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 min-h-0 bg-white">
                                {!selectedFile ? (
                                    <div className="flex h-full items-center justify-center p-5">
                                        <p className="text-sm text-slate-500">No workspace file available yet.</p>
                                    </div>
                                ) : (
                                    <Suspense fallback={
                                        <div className="flex h-full items-center justify-center p-5">
                                            <p className="text-sm text-slate-500">Loading workspace editor...</p>
                                        </div>
                                    }
                                    >
                                        <WorkspaceModalEditor
                                            path={selectedFile.path}
                                            language={getMonacoLanguage(selectedFile.language)}
                                            value={selectedFile.content}
                                        />
                                    </Suspense>
                                )}
                            </div>

                            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                                <div className="flex items-center gap-3">
                                    <span>{selectedFile?.language.toUpperCase() ?? 'TEXT'}</span>
                                    <span>{selectedFileLineCount} lines</span>
                                    <span>{selectedFileBytes.toLocaleString()} bytes</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span>{selectedFile?.path ?? ''}</span>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
};
