import type { MouseEvent as ReactMouseEvent } from 'react';
import type { StateCreator } from 'zustand';
import type { AppStore } from '../useAppStore';
import type { CloudAiConsentRequest, CsvData, CsvRow } from '../../types';
import { getPreferredAnalysisDataset } from '../../services/agent/reportStructureState';
import { getCsvDataRowCount } from '../../utils/datasetId';
import {
    shouldAllowAgentThinkingSurface,
    shouldAllowDatabaseSurface,
    shouldAllowLogsSurface,
    shouldAllowLongTermMemorySurface,
    shouldAllowSettingsSurface,
    shouldAllowWorkflowSurface,
    shouldAllowWorkspaceSurface,
} from '../../config/runtimeConfig';
import {
    buildCloudAiConsentKey,
    grantCloudAiConsent,
} from '../../services/privacy/cloudAiConsent';

const MIN_ASIDE_WIDTH = 320;
const MAX_ASIDE_WIDTH = 800;
const MIN_MAIN_WIDTH = 600;

export interface IUISlice {
    resultsViewMode: 'simple' | 'explore';
    isAsideVisible: boolean;
    asideWidth: number;
    isSpreadsheetVisible: boolean;
    isSettingsModalOpen: boolean;
    isHistoryPanelOpen: boolean;
    isDatabaseModalOpen: boolean;
    /** Live UI intent only; never persisted or a candidate/commit authority. */
    localDataPreviewRequest: { dataset: CsvData; sessionId: string } | null;
    openLocalDataPreview: () => void;
    isWorkspaceModalOpen: boolean;
    isDataPreparationModalOpen: boolean;
    isDebugLogsModalOpen: boolean;
    isMemoryPanelOpen: boolean;
    isAgentModalOpen: boolean;
    isReportBoundaryConfirmModalOpen: boolean;
    isApiKeyRequiredModalOpen: boolean;
    pendingCloudAiConsent: CloudAiConsentRequest | null;
    cloudAiConsentError: string | null;
    isResizing: boolean;
    /** Transient: precomputed aggregate rows from GroupByTest, consumed by executeAggregateTableAction. */
    pendingPrecomputedCardData: CsvRow[] | null;
    setResultsViewMode: (mode: 'simple' | 'explore') => void;
    setPendingPrecomputedCardData: (data: CsvRow[] | null) => void;
    handleAsideMouseDown: (e: ReactMouseEvent) => void;
    setIsAsideVisible: (isVisible: boolean) => void;
    setIsSpreadsheetVisible: (isVisible: boolean) => void;
    setIsSettingsModalOpen: (isOpen: boolean) => void;
    setIsHistoryPanelOpen: (isOpen: boolean) => void;
    setIsDatabaseModalOpen: (isOpen: boolean) => void;
    setIsWorkspaceModalOpen: (isOpen: boolean) => void;
    setIsDataPreparationModalOpen: (isOpen: boolean) => void;
    setIsDebugLogsModalOpen: (isOpen: boolean) => void;
    setIsMemoryPanelOpen: (isOpen: boolean) => void;
    setIsAgentModalOpen: (isOpen: boolean) => void;
    setIsReportBoundaryConfirmModalOpen: (isOpen: boolean) => void;
    setIsApiKeyRequiredModalOpen: (isOpen: boolean) => void;
    requestCloudAiConsent: (request: CloudAiConsentRequest) => Promise<boolean>;
    resolveCloudAiConsent: (granted: boolean) => Promise<void>;
}

interface PendingCloudAiConsentCoordinator {
    key: string;
    promise: Promise<boolean>;
    resolve: (granted: boolean) => void;
}

let pendingConsentCoordinator: PendingCloudAiConsentCoordinator | null = null;

export const __resetPendingCloudAiConsentForTests = (): void => {
    pendingConsentCoordinator?.resolve(false);
    pendingConsentCoordinator = null;
};

export const createUISlice: StateCreator<AppStore, [], [], IUISlice> = (set, get) => ({
    // Show the Assistant by default on desktop. Keep the full-screen mobile
    // drawer closed so it does not cover the upload flow (App breakpoint: 768px).
    // Manual hide/show and resizing remain independent of this initial value.
    isAsideVisible: window.innerWidth >= 768,
    resultsViewMode: (() => {
        try {
            return window.sessionStorage.getItem('csv_agent_results_view') === 'explore'
                ? 'explore'
                : 'simple';
        } catch {
            return 'simple';
        }
    })(),
    asideWidth: window.innerWidth / 4 > MIN_ASIDE_WIDTH ? window.innerWidth / 4 : MIN_ASIDE_WIDTH,
    isSpreadsheetVisible: false,
    isSettingsModalOpen: false,
    isHistoryPanelOpen: false,
    isDatabaseModalOpen: false,
    localDataPreviewRequest: null,
    isWorkspaceModalOpen: false,
    isDataPreparationModalOpen: false,
    isDebugLogsModalOpen: false,
    isMemoryPanelOpen: false,
    isAgentModalOpen: false,
    isReportBoundaryConfirmModalOpen: false,
    isApiKeyRequiredModalOpen: false,
    pendingCloudAiConsent: null,
    cloudAiConsentError: null,
    isResizing: false,
    pendingPrecomputedCardData: null,
    setResultsViewMode: (mode) => {
        try {
            window.sessionStorage.setItem('csv_agent_results_view', mode);
        } catch {
            // Session-only preference is best effort when storage is unavailable.
        }
        set({ resultsViewMode: mode });
    },
    setPendingPrecomputedCardData: (data) => set({ pendingPrecomputedCardData: data }),

    handleAsideMouseDown: (e) => {
        e.preventDefault();
        set({ isResizing: true });
        const handleMouseMove = (moveEvent: MouseEvent) => {
            // At constrained desktop widths, preserve the same readable minimum
            // as the initial sidebar. The responsive main can be narrower than
            // its preferred 600px; dragging must not collapse Assistant to 168px.
            const maxAllowedAsideWidth = Math.max(MIN_ASIDE_WIDTH, window.innerWidth - MIN_MAIN_WIDTH);
            let newWidth = window.innerWidth - moveEvent.clientX;
            newWidth = Math.max(MIN_ASIDE_WIDTH, newWidth);
            newWidth = Math.min(MAX_ASIDE_WIDTH, newWidth, maxAllowedAsideWidth);
            set({ asideWidth: newWidth });
        };
        const handleMouseUp = () => {
            set({ isResizing: false });
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    },
    
    setIsAsideVisible: (isVisible) => set({ isAsideVisible: isVisible }),
    setIsSpreadsheetVisible: (isVisible) => set({ isSpreadsheetVisible: isVisible }),
    setIsSettingsModalOpen: (isOpen) => set({ isSettingsModalOpen: isOpen ? shouldAllowSettingsSurface() : false }),
    setIsHistoryPanelOpen: (isOpen) => set({ isHistoryPanelOpen: isOpen }),
    setIsDatabaseModalOpen: (isOpen) => set({ isDatabaseModalOpen: isOpen ? shouldAllowDatabaseSurface() : false, localDataPreviewRequest: null }),
    openLocalDataPreview: () => {
        const state = get(), dataset = getPreferredAnalysisDataset(state);
        if (!shouldAllowDatabaseSurface() || !dataset || getCsvDataRowCount(dataset) < 1 || state.isBusy
            || state.initialAnalysisFailureKind !== 'cloud_consent_declined') return;
        set({ isDatabaseModalOpen: true, localDataPreviewRequest: { dataset, sessionId: state.sessionId } });
    },
    setIsWorkspaceModalOpen: (isOpen) => set({ isWorkspaceModalOpen: isOpen ? shouldAllowWorkspaceSurface() : false }),
    setIsDataPreparationModalOpen: (isOpen) => set({ isDataPreparationModalOpen: isOpen ? shouldAllowWorkflowSurface() : false }),
    setIsDebugLogsModalOpen: (isOpen) => set({ isDebugLogsModalOpen: isOpen ? shouldAllowLogsSurface() : false }),
    setIsMemoryPanelOpen: (isOpen) => set({ isMemoryPanelOpen: isOpen ? shouldAllowLongTermMemorySurface() : false }),
    setIsAgentModalOpen: (isOpen) => set({ isAgentModalOpen: isOpen ? shouldAllowAgentThinkingSurface() : false }),
    setIsReportBoundaryConfirmModalOpen: (isOpen) => set({ isReportBoundaryConfirmModalOpen: isOpen }),
    setIsApiKeyRequiredModalOpen: (isOpen) => set({ isApiKeyRequiredModalOpen: isOpen }),
    requestCloudAiConsent: (request) => {
        const key = buildCloudAiConsentKey(request);
        if (pendingConsentCoordinator?.key === key) {
            return pendingConsentCoordinator.promise;
        }
        pendingConsentCoordinator?.resolve(false);

        let resolveConsent!: (granted: boolean) => void;
        const promise = new Promise<boolean>(resolve => {
            resolveConsent = resolve;
        });
        pendingConsentCoordinator = {
            key,
            promise,
            resolve: resolveConsent,
        };
        set({
            pendingCloudAiConsent: request,
            cloudAiConsentError: null,
        });
        return promise;
    },
    resolveCloudAiConsent: async (granted) => {
        const coordinator = pendingConsentCoordinator;
        if (!coordinator) return;

        if (granted) {
            try {
                const request = get().pendingCloudAiConsent;
                if (!request) {
                    throw new Error('The pending cloud AI consent request is unavailable.');
                }
                await grantCloudAiConsent(request);
            } catch (error) {
                set({
                    cloudAiConsentError: error instanceof Error
                        ? error.message
                        : 'Cloud AI consent could not be saved.',
                });
                return;
            }
        }

        pendingConsentCoordinator = null;
        set({
            pendingCloudAiConsent: null,
            cloudAiConsentError: null,
        });
        coordinator.resolve(granted);
    },
});
