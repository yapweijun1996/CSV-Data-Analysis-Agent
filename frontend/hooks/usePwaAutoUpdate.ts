import { useEffect } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../store/useAppStore';
import { autoApplyPwaUpdate, setPwaAutoUpdateGuard } from '../services/pwa/pwaManager';

/**
 * Updates install automatically, but a reload must never interrupt an import,
 * analysis or report. The guard reflects the live busy state, and a pending
 * update is applied as soon as the app becomes idle.
 */
export const usePwaAutoUpdate = (): void => {
    const isRunActive = useAppStore(state => state.isBusy
        || state.initialAnalysisStatus === 'running'
        || state.activeTurn?.status === 'running'
        || state.isGeneratingReport
        || state.isSummaryGenerating, shallow);

    useEffect(() => {
        setPwaAutoUpdateGuard(() => !isRunActive);
        if (!isRunActive) void autoApplyPwaUpdate();
    }, [isRunActive]);
};
