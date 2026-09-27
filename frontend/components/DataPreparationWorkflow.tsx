import React, { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore, type AppStore } from '../store/useAppStore';
import { buildDataPreparationWorkflowBundle } from '../services/agent/buildDataPreparationWorkflowBundle';
import { pickDataPreparationWorkflowState } from './data-preparation/workflowStore';
import { getTranslation } from '../utils/localization';

const badgeClasses: Record<NonNullable<ReturnType<typeof buildDataPreparationWorkflowBundle>['preparation']['badgeLabel']>, string> = {
    'AI Cleaned': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'No Data Edits Applied Yet': 'bg-amber-100 text-amber-800 border-amber-200',
    'Cleaning Blocked': 'bg-rose-100 text-rose-800 border-rose-200',
    'Baseline Prepared': 'bg-sky-100 text-sky-800 border-sky-200',
};

export const DataPreparationWorkflow: React.FC = () => {
    const { workflowState, openWorkflow, openActivity, openLogs, openWorkspace, revertToOriginal, cleaningStatus, language } = useAppStore((state: AppStore) => ({
        workflowState: pickDataPreparationWorkflowState(state),
        openWorkflow: () => state.setIsDataPreparationModalOpen(true),
        openActivity: () => state.setIsAgentModalOpen(true),
        openLogs: () => state.setIsDebugLogsModalOpen(true),
        openWorkspace: () => state.setIsWorkspaceModalOpen(true),
        revertToOriginal: () => state.revertToOriginal(),
        cleaningStatus: state.cleaningRun?.status ?? null,
        language: state.settings.language,
    }), shallow);

    const workflow = useMemo(() => buildDataPreparationWorkflowBundle(workflowState as AppStore), [workflowState]);

    if (!workflow.summary.fileName) {
        return null;
    }

    return (
        <section className="rounded-card border border-slate-200 bg-white shadow-sm p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">AI Data IDE workflow</p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">Open workflow or logs</h2>
                    <p className="mt-1 text-sm text-slate-500">The full Data Preparation Workflow is hidden from the dashboard and now opens as a fullscreen modal.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {workflow.preparation.badgeLabel && (
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badgeClasses[workflow.preparation.badgeLabel]}`}>
                            {workflow.preparation.badgeLabel}
                        </span>
                    )}
                    <button
                        onClick={openWorkflow}
                        className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                    >
                        Open Workflow
                    </button>
                    <button
                        onClick={openActivity}
                        className="px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors"
                    >
                        Assistant Activity
                    </button>
                    <button
                        onClick={openLogs}
                        className="px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors"
                    >
                        Open Logs
                    </button>
                    <button
                        onClick={openWorkspace}
                        className="px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors"
                    >
                        Artifacts
                    </button>
                    {cleaningStatus === 'completed' && (
                        <button
                            onClick={revertToOriginal}
                            className="px-3 py-2 bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium rounded-md hover:bg-amber-100 transition-colors"
                            title={getTranslation('data_preparation_revert_title', language)}
                        >
                            {getTranslation('data_preparation_revert_button', language)}
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
};
