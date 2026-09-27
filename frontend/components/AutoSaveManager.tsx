import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { checkStorageHealth } from '../services/storageService';
import {
    buildPersistedAppStateSignature,
} from '../services/persistence/persistedAppState';
import { persistCurrentAppSessionSnapshot } from '../services/persistence/currentSessionPersistence';

const AUTOSAVE_DEBOUNCE_MS = 1500;
/** Run storage health check every 5 minutes. */
const STORAGE_HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** Let startup hydration and the user's first action finish before maintenance. */
const INITIAL_STORAGE_HEALTH_CHECK_DELAY_MS = 5_000;

export const AutoSaveManager: React.FC = () => {
    const lastSavedSignatureRef = useRef<string | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isSavingRef = useRef(false);
    const pendingFlushRef = useRef(false);
    const lastSaveErrorRef = useRef<string | null>(null);

    useEffect(() => {
        const flushSave = async () => {
            const state = useAppStore.getState();
            const nextSignature = buildPersistedAppStateSignature(state);

            if (!nextSignature || nextSignature === lastSavedSignatureRef.current) {
                return;
            }

            if (isSavingRef.current) {
                pendingFlushRef.current = true;
                return;
            }

            isSavingRef.current = true;
            try {
                await persistCurrentAppSessionSnapshot(state);

                lastSavedSignatureRef.current = nextSignature;
                lastSaveErrorRef.current = null;

                if (!state.sessionCreatedAt) {
                    useAppStore.setState({ sessionCreatedAt: new Date() });
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (lastSaveErrorRef.current !== message) {
                    state.addProgress(`Autosave failed: ${message}`, 'error');
                    lastSaveErrorRef.current = message;
                }
            } finally {
                isSavingRef.current = false;
                if (pendingFlushRef.current) {
                    pendingFlushRef.current = false;
                    void flushSave();
                }
            }
        };

        const scheduleSave = (delay = AUTOSAVE_DEBOUNCE_MS) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => {
                timeoutRef.current = null;
                void flushSave();
            }, delay);
        };

        const flushImmediately = () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            void flushSave();
        };

        /**
         * Emergency synchronous snapshot to localStorage on page unload.
         *
         * IndexedDB writes are async — `void flushSave()` fires the write but
         * the browser can close before it commits.  As a safety net we store
         * a JSON snapshot in localStorage (sync, guaranteed to complete during
         * beforeunload).  On next init the app can recover from this if the
         * IndexedDB record is stale/missing.
         *
         * localStorage is size-limited (~5-10 MB) so we store a trimmed
         * payload: core identity + status fields, without heavy data arrays.
         */
        const emergencySyncSnapshot = () => {
            try {
                const state = useAppStore.getState();
                if (!state.sessionId || !state.csvData) return;

                const snapshot = {
                    sessionId: state.sessionId,
                    fileName: state.csvData.fileName,
                    currentView: state.currentView,
                    aiTaskStatus: state.aiTaskStatus,
                    initialAnalysisStatus: state.initialAnalysisStatus,
                    goalState: state.goalState,
                    pipelineOutcome: state.pipelineOutcome?.status ?? null,
                    cardCount: state.analysisCards.length,
                    chatCount: state.chatHistory.length,
                    savedAt: Date.now(),
                };
                localStorage.setItem('csv_agent_emergency_snapshot', JSON.stringify(snapshot));
            } catch {
                // localStorage full or unavailable — silently skip
            }
        };

        lastSavedSignatureRef.current = buildPersistedAppStateSignature(useAppStore.getState());

        const unsubscribe = useAppStore.subscribe((state) => {
            const nextSignature = buildPersistedAppStateSignature(state);
            if (!nextSignature || nextSignature === lastSavedSignatureRef.current) {
                return;
            }
            scheduleSave();
        });

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flushImmediately();
            }
        };

        const handleBeforeUnload = () => {
            emergencySyncSnapshot();
            flushImmediately();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);

        // Periodic storage health check — evicts old records before quota is hit.
        const runHealthCheck = async () => {
            const currentState = useAppStore.getState();
            // WebKit can stall a user-initiated IndexedDB transaction when the
            // startup cleanup opens competing transactions at the same time.
            // Maintenance is best-effort and the interval will retry it later.
            if (currentState.isBusy || currentState.isAppInitializing) return;
            const sessionId = currentState.sessionId;
            const { evictedReports } = await checkStorageHealth(sessionId);
            if (evictedReports > 0) {
                useAppStore.getState().addProgress(
                    `Storage cleanup: removed ${evictedReports} old report(s) to free space.`,
                    'warning',
                );
            }
        };
        const healthCheckInterval = setInterval(() => {
            void runHealthCheck();
        }, STORAGE_HEALTH_CHECK_INTERVAL_MS);
        const initialHealthCheckTimer = setTimeout(() => {
            void runHealthCheck();
        }, INITIAL_STORAGE_HEALTH_CHECK_DELAY_MS);

        return () => {
            unsubscribe();
            clearInterval(healthCheckInterval);
            clearTimeout(initialHealthCheckTimer);
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    return null;
};
