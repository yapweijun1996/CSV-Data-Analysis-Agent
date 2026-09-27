import React from 'react';
import type { CleaningRun, SqlPrecheckFinding } from '../../types';

type CleaningRunBannerProps = {
    cleaningRun: CleaningRun;
    onContinue: () => void;
    onRestart: () => void;
    variant?: 'analysis' | 'spreadsheet';
    sqlPrecheck?: {
        status: 'passed' | 'warning' | 'blocked';
        summary: string;
        findings: SqlPrecheckFinding[];
    } | null;
    onInspectFinding?: (finding: SqlPrecheckFinding) => void;
};

const messageByStatus: Record<CleaningRun['status'], string> = {
    idle: 'Dataset cleaning is ready to continue. Choose whether to resume from the saved step or restart from the beginning.',
    running: 'Dataset cleaning is currently running. Wait for it to finish before relying on analysis results.',
    paused: 'Dataset cleaning is paused. Continue from the last saved step or restart from the beginning.',
    failed: 'Dataset cleaning stopped after an error. Continue from the last saved step or restart from the beginning.',
    completed: 'Dataset cleaning is complete.',
};

export const CleaningRunBanner: React.FC<CleaningRunBannerProps> = ({
    cleaningRun,
    onContinue,
    onRestart,
    variant = 'analysis',
    sqlPrecheck = null,
    onInspectFinding,
}) => {
    const hasSqlPrecheckAttention = cleaningRun.status === 'completed' && (sqlPrecheck?.status === 'warning' || sqlPrecheck?.status === 'blocked');
    if (cleaningRun.status === 'completed' && !hasSqlPrecheckAttention) {
        return null;
    }

    const isRunning = cleaningRun.status === 'running';
    const visibleFindings = hasSqlPrecheckAttention
        ? (sqlPrecheck?.findings ?? []).filter(finding => finding.severity === 'block' || finding.severity === 'warn').slice(0, 3)
        : [];
    const containerClassName = variant === 'spreadsheet'
        ? 'rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'
        : 'mb-4 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900';

    return (
        <div className={containerClassName}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                    <p>{hasSqlPrecheckAttention ? sqlPrecheck?.summary : (cleaningRun.userFacingMessage ?? messageByStatus[cleaningRun.status])}</p>
                    {!hasSqlPrecheckAttention && cleaningRun.actionTakenMessage && (
                        <p className="text-xs text-amber-950/90">{cleaningRun.actionTakenMessage}</p>
                    )}
                    {!hasSqlPrecheckAttention && cleaningRun.dataSafetyMessage && (
                        <p className="text-xs text-amber-950/90">{cleaningRun.dataSafetyMessage}</p>
                    )}
                    {!hasSqlPrecheckAttention && cleaningRun.nextStateMessage && (
                        <p className="text-xs text-amber-950/90">{cleaningRun.nextStateMessage}</p>
                    )}
                    {!hasSqlPrecheckAttention && cleaningRun.technicalDetail && (
                        <details className="rounded-md border border-amber-200 bg-white/70 p-2 text-xs text-amber-950/90">
                            <summary className="cursor-pointer font-medium text-amber-900">Technical detail</summary>
                            <p className="mt-2 whitespace-pre-wrap break-words font-mono">{cleaningRun.technicalDetail}</p>
                        </details>
                    )}
                    {visibleFindings.length > 0 && (
                        <ul className="space-y-2 text-xs text-amber-950/90">
                            {visibleFindings.map((finding, index) => (
                                <li key={`${finding.kind}-${finding.metric ?? finding.column ?? finding.dimension ?? index}`} className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <span>{finding.message}</span>
                                    {onInspectFinding && (
                                        <button
                                            type="button"
                                            onClick={() => onInspectFinding(finding)}
                                            className="self-start rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-100"
                                        >
                                            Inspect
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                {!isRunning && (
                    <div className="flex flex-wrap gap-2">
                        {!hasSqlPrecheckAttention && (
                            <button
                                type="button"
                                onClick={onContinue}
                                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
                            >
                                Continue cleaning
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onRestart}
                            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
                        >
                            {hasSqlPrecheckAttention ? 'Restart cleaning from prepared dataset' : 'Restart cleaning'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
