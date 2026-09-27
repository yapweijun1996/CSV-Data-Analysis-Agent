import { useEffect, useRef } from 'react';
import { subscribeToExternalCsvPayload, hasExternalPayloadPending } from '../utils/externalCsvBridge';
import { useAppStore } from '../store/useAppStore';
import { ExternalCsvPayloadEvent } from '../types';

export const ExternalPayloadListener = () => {
    const ingestExternalCsvPayload = useAppStore(state => state.ingestExternalCsvPayload);
    const isAppInitializing = useAppStore(state => state.isAppInitializing);
    const processedPayloadIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!ingestExternalCsvPayload) return;
        // When launched from an external ERP page (cold start), wait for the app
        // to finish initializing before processing the CSV payload. This lets
        // DuckDB WASM, heavy JS modules, and React settle first — avoiding the
        // main-thread contention that causes severe lag during cold boot.
        if (hasExternalPayloadPending && isAppInitializing) return;

        const unsubscribe = subscribeToExternalCsvPayload((event: ExternalCsvPayloadEvent) => {
            const processedPayloadIds = processedPayloadIdsRef.current;
            if (processedPayloadIds.has(event.payloadId)) return;
            processedPayloadIds.add(event.payloadId);
            ingestExternalCsvPayload(event);
        });
        return () => {
            unsubscribe();
        };
    }, [ingestExternalCsvPayload, isAppInitializing]);

    return null;
};
