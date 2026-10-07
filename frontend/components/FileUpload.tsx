import React, { useState, useCallback, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../store/useAppStore';
import { IconApiKeyRequired } from '../icons/IconApiKeyRequired';
import { IconFileUpload } from '../icons/IconFileUpload';
import { IconLoadingSpinner } from '../icons/IconLoadingSpinner';
import { ImportProgressCard } from './ImportProgressCard';
import { shouldAllowLogsSurface, shouldAllowSettingsSurface, shouldShowNewSessionButton } from '../config/runtimeConfig';
import { getCloudAiProviderLabel } from '../utils/cloudAiProviderLabel';
import { getTranslation } from '../utils/localization';

interface FileUploadProps {
    isWorkspaceRestoring?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ isWorkspaceRestoring = false }) => {
    const {
        handleFileUpload,
        isBusy,
        isApiKeySet,
        progressMessages,
        aiTaskStatus,
        setIsDebugLogsModalOpen,
        datasetBundle,
        fileName,
        language,
        cleaningRunStatus,
        provider,
    } = useAppStore(state => ({
        handleFileUpload: state.handleFileUpload,
        isBusy: state.isBusy,
        isApiKeySet: state.isApiKeySet,
        progressMessages: state.progressMessages,
        aiTaskStatus: state.aiTaskStatus,
        setIsDebugLogsModalOpen: state.setIsDebugLogsModalOpen,
        datasetBundle: state.datasetBundle,
        fileName: state.csvData?.fileName ?? null,
        language: state.settings.language,
        cleaningRunStatus: state.cleaningRun?.status ?? null,
        provider: state.settings.provider,
    }), shallow);
    const openDebugLogs = useCallback(() => setIsDebugLogsModalOpen(true), [setIsDebugLogsModalOpen]);

    const [dragActive, setDragActive] = useState(false);
    const [demoLoadState, setDemoLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Relative (no leading slash) so it resolves against <base href> in
    // index.html — this app supports deployment from arbitrary subpaths.
    const DEMO_DATA_URL = 'demo-data/singapore-hdb-resale-prices.csv';
    const DEMO_DATA_FILE_NAME = 'singapore-hdb-resale-prices.csv';

    const handleLoadDemoData = useCallback(async () => {
        if (!isApiKeySet || isBusy || isWorkspaceRestoring) return;
        setDemoLoadState('loading');
        try {
            const response = await fetch(DEMO_DATA_URL);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const file = new File([blob], DEMO_DATA_FILE_NAME, { type: 'text/csv' });
            setDemoLoadState('idle');
            handleFileUpload(file);
        } catch (error) {
            console.error('Failed to load demo dataset:', error);
            setDemoLoadState('error');
        }
    }, [DEMO_DATA_URL, handleFileUpload, isApiKeySet, isBusy, isWorkspaceRestoring]);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isApiKeySet || isWorkspaceRestoring) return;
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, [isApiKeySet, isWorkspaceRestoring]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (!isApiKeySet || isWorkspaceRestoring) return;
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    }, [handleFileUpload, isApiKeySet, isWorkspaceRestoring]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!isApiKeySet || isWorkspaceRestoring) return;
        if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
            e.target.value = '';
        }
    };

    const apiKeyMessage = shouldAllowSettingsSurface()
        ? getTranslation('api_key_required_settings_message', language)
        : getTranslation('api_key_required_managed_message', language);
    const allowManualUpload = shouldShowNewSessionButton();
    const latestProgress = progressMessages[progressMessages.length - 1] ?? null;
    const canOpenLogs = shouldAllowLogsSurface();
    const isUploadUnavailable = isBusy || isWorkspaceRestoring;

    const resolveBusyCard = () => {
        if (latestProgress?.type === 'error') {
            return {
                title: getTranslation('upload_status_preparing_title', language),
                detail: latestProgress.text,
                tone: 'error' as const,
            };
        }

        if (aiTaskStatus && aiTaskStatus.status !== 'done' && aiTaskStatus.status !== 'error') {
            return {
                title: getTranslation('upload_status_generating_title', language),
                detail: aiTaskStatus.subtitle || getTranslation('upload_status_generating_detail', language),
                tone: 'info' as const,
            };
        }

        if (cleaningRunStatus === 'running') {
            return {
                title: getTranslation('upload_status_preparing_title', language),
                detail: latestProgress?.text || getTranslation('upload_status_preparing_detail', language),
                tone: 'info' as const,
            };
        }

        return {
            title: getTranslation('upload_status_importing_title', language),
            detail: latestProgress?.text || getTranslation('upload_status_importing_detail', language),
            tone: 'info' as const,
        };
    };


    if (isBusy && fileName) {
        const busyCard = resolveBusyCard();
        const analysing = Boolean(aiTaskStatus && aiTaskStatus.status !== 'done' && aiTaskStatus.status !== 'error')
            || cleaningRunStatus === 'running';
        return (
            <ImportProgressCard
                language={language}
                fileName={fileName}
                title={busyCard.title}
                detail={busyCard.detail}
                tone={busyCard.tone}
                stage={analysing ? 'analyse' : 'parse'}
                providerLabel={getCloudAiProviderLabel(provider, language)}
                onOpenLogs={canOpenLogs ? openDebugLogs : undefined}
            />
        );
    }

    if (!allowManualUpload) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="w-full max-w-3xl rounded-card border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-8 shadow-sm">
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                        {getTranslation('managed_reports_welcome_title', language)}
                    </h2>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                        {getTranslation('managed_reports_welcome_message', language)}
                    </p>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                        {getTranslation('managed_reports_welcome_detail', language)}
                    </p>
                </div>
            </div>
        );
    }

    if (!isApiKeySet && !isWorkspaceRestoring) {
        return (
             <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-card border-slate-300 h-full">
                <IconApiKeyRequired />
                <h3 className="text-xl font-semibold text-slate-800">{getTranslation('api_key_required_title', language)}</h3>
                <p className="mt-2 max-w-sm text-center text-slate-500">
                    {apiKeyMessage}
                </p>
                <p className="mt-6 text-xs text-slate-400">{getTranslation('data_privacy_note', language)}</p>
             </div>
        );
    }

    return (
        <div 
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            aria-busy={isWorkspaceRestoring}
            className={`flex h-full flex-col items-center justify-center rounded-card border-2 border-dashed p-8 transition-colors duration-300 ${
                isWorkspaceRestoring
                    ? 'border-slate-300 bg-slate-50'
                    : dragActive
                        ? 'border-blue-500 bg-slate-100'
                        : 'border-slate-300 hover:border-blue-500'
            }`}
        >
            {isWorkspaceRestoring && (
                <div
                    role="status"
                    aria-live="polite"
                    className="mb-6 flex w-full max-w-xl items-start gap-3 rounded-card border border-blue-200 bg-blue-50 p-4 text-left"
                >
                    <IconLoadingSpinner className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                    <div>
                        <p className="font-semibold text-slate-900">
                            {getTranslation('file_upload_restoring_title', language)}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                            {getTranslation('file_upload_restoring_detail', language)}
                        </p>
                    </div>
                </div>
            )}
            {!isWorkspaceRestoring && latestProgress?.type === 'error' && (
                <div
                    role="alert"
                    className="mb-6 w-full max-w-xl rounded-card border border-red-200 bg-red-50 p-4 text-left"
                >
                    <p className="font-semibold text-red-800">
                        {getTranslation('file_upload_processing_error_title', language)}
                    </p>
                    <p className="mt-1 break-words text-sm leading-6 text-red-700">
                        {latestProgress.text}
                    </p>
                </div>
            )}
            {!isWorkspaceRestoring && datasetBundle && !fileName && (
                <div role="status" className="mb-6 w-full max-w-xl rounded-card border border-amber-300 bg-amber-50 p-4 text-left">
                    <p className="font-semibold text-amber-950">Re-select the original CSV to restore this analysis</p>
                    <p className="mt-1 text-sm leading-6 text-amber-900">
                        History keeps the source fingerprint and transformation lineage, not the CSV rows. Select {datasetBundle.source.fileName}; the app will verify its fingerprint before replaying any transformation.
                    </p>
                </div>
            )}
            <IconFileUpload />
            <h2 className="mb-2 text-2xl font-bold tracking-tight text-slate-900">
                {getTranslation('file_upload_title', language)}
            </h2>
            <p className="mb-5 max-w-xl text-center text-sm leading-6 text-slate-600">
                {getTranslation('file_upload_outcome', language)}
            </p>
            <p className="mb-2 text-lg text-slate-500">{getTranslation('file_upload_drag_drop', language)}</p>
            <p className="text-slate-600">{getTranslation('file_upload_or', language)}</p>
            <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadUnavailable}
                className={`mt-4 inline-flex min-h-[44px] items-center justify-center rounded-card px-4 py-2 text-sm font-bold text-white transition-colors ${
                    isUploadUnavailable
                        ? 'cursor-wait bg-slate-400'
                        : 'cursor-pointer bg-blue-600 hover:bg-blue-700'
                }`}
            >
                {isWorkspaceRestoring
                    ? getTranslation('file_upload_preparing_action', language)
                    : getTranslation('file_upload_select', language)}
            </button>
            <input ref={fileInputRef} id="file-upload" type="file" accept=".csv" onChange={handleChange} className="hidden" disabled={isUploadUnavailable} tabIndex={-1} />

            {!datasetBundle && <div className="mt-6 w-full max-w-sm rounded-card border border-blue-100 bg-blue-50 p-4 text-center">
                <p className="text-sm text-slate-600">{getTranslation('file_upload_load_demo_hint', language)}</p>
                <button
                    type="button"
                    onClick={handleLoadDemoData}
                    disabled={isUploadUnavailable || demoLoadState === 'loading'}
                    className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-card border-2 border-blue-600 bg-white px-4 py-2 text-sm font-bold text-blue-600 transition-colors hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {demoLoadState === 'loading' && <IconLoadingSpinner className="h-4 w-4" />}
                    {demoLoadState === 'loading'
                        ? getTranslation('file_upload_load_demo_loading', language)
                        : getTranslation('file_upload_load_demo', language)}
                </button>
                {demoLoadState === 'error' && (
                    <p className="mt-2 text-xs text-red-600">{getTranslation('file_upload_load_demo_error', language)}</p>
                )}
            </div>}

            <p className="mt-4 max-w-sm text-center text-sm leading-5 text-slate-500">{getTranslation('data_privacy_note', language)}</p>
        </div>
    );
};
