import type { AppStore } from '../../store/useAppStore';
import {
    CURRENT_SESSION_KEY,
    saveReport,
} from '../storageService';
import {
    buildPersistedAppState,
    buildPersistedReportRecord,
    hasSavableSession,
} from './persistedAppState';

/**
 * Commits both the tab-owned report and the shared current-session alias.
 *
 * Callers that establish a crash-recovery anchor use this helper instead of
 * waiting for the normal autosave debounce.
 */
export const persistCurrentAppSessionSnapshot = async (
    state: AppStore,
): Promise<boolean> => {
    if (!hasSavableSession(state)) return false;
    const currentReport = buildPersistedReportRecord(state, {
        id: state.sessionId,
        filename: state.csvData?.fileName || 'Current Session',
    });
    currentReport.appState = buildPersistedAppState(state);
    await saveReport(currentReport);
    await saveReport({
        ...currentReport,
        id: CURRENT_SESSION_KEY,
    });
    return true;
};
