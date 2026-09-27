/**
 * PERF-303: Isolated status section that subscribes independently to
 * aiTaskStatus. During the hypothesis loop, aiTaskStatus changes per
 * hypothesis but this re-render is now isolated (~<50ms) instead of
 * triggering a full AnalysisPanel re-render (~2.3s).
 */
import React, { memo } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../../store/useAppStore';
import { AiTaskStatusBubble } from '../AiTaskStatusBubble';

export const AnalysisStatusSection: React.FC = memo(() => {
    const { aiTaskStatus, hasCards, hasFinalSummary, activeResearchRun, requestActiveResearchCancellation } = useAppStore(
        state => ({
            aiTaskStatus: state.aiTaskStatus,
            hasCards: state.analysisCards.length > 0,
            hasFinalSummary: !!state.finalSummary,
            activeResearchRun: state.activeAnalysisSession,
            requestActiveResearchCancellation: state.requestActiveResearchCancellation,
        }),
        shallow,
    );

    if (!aiTaskStatus) return null;

    return (
        <div className="space-y-2">
            <AiTaskStatusBubble
                task={aiTaskStatus}
                variant={!hasCards && !hasFinalSummary ? 'default' : 'compact'}
            />
            {activeResearchRun?.status === 'running' && (
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => requestActiveResearchCancellation()}
                        disabled={Boolean(activeResearchRun.cancellationRequestedAt)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                    >
                        {activeResearchRun.cancellationRequestedAt ? 'Stopping research…' : 'Stop research'}
                    </button>
                </div>
            )}
        </div>
    );
});

AnalysisStatusSection.displayName = 'AnalysisStatusSection';
