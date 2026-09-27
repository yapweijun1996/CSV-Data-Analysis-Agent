import { ExternalCsvPayloadEvent, ExternalCsvTransport } from '../types';
import { createId } from './createId';

type ExternalCsvListener = (event: ExternalCsvPayloadEvent) => void;

const listeners = new Set<ExternalCsvListener>();
const seenPayloadIds = new Set<string>();
let lastEvent: ExternalCsvPayloadEvent | null = null;
let initialized = false;
const PENDING_QUERY_KEY = 'pendingPayloadKey';

/** True when the app was launched from an external ERP page with a pending CSV payload.
 *  Set synchronously during initExternalCsvBridge() — safe to read any time after. */
export let hasExternalPayloadPending = false;

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

const sanitizeHeaderForFileName = (raw?: string | null) => {
    if (!raw) return '';
    const firstLine = raw.split(/\r?\n/)[0] ?? raw;
    return firstLine.trim();
};

const buildEventId = () => createId('csv-event');

const hashCsvPayload = (csv: string, header?: string) => {
    const input = `${header ?? ''}\n${csv}`;
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `csv-payload-${(hash >>> 0).toString(36)}`;
};

const emitEvent = (event: ExternalCsvPayloadEvent) => {
    if (seenPayloadIds.has(event.payloadId)) {
        console.debug('[ExternalCsvBridge] Ignored duplicate external CSV payload.', {
            payloadId: event.payloadId,
            transport: event.meta.transport,
        });
        return;
    }
    seenPayloadIds.add(event.payloadId);
    lastEvent = event;
    listeners.forEach(listener => listener(event));
};

const normalizePayload = (data: any, transport: ExternalCsvTransport, pendingKey?: string): ExternalCsvPayloadEvent | null => {
    if (!data || typeof data !== 'object') return null;
    if (data.type !== 'table_csv') return null;
    if (typeof data.csv !== 'string' || !data.csv.trim()) return null;
    const payloadId = typeof data.payloadId === 'string' && data.payloadId.trim()
        ? data.payloadId.trim()
        : hashCsvPayload(data.csv, typeof data.header === 'string' ? data.header : undefined);
    return {
        payload: {
            csv: data.csv,
            header: typeof data.header === 'string' ? sanitizeHeaderForFileName(data.header) : undefined,
        },
        payloadId,
        meta: {
            transport,
            receivedAt: Date.now(),
            pendingKey,
        },
        eventId: buildEventId(),
    };
};

const recoverSessionPayload = (pendingKey: string): ExternalCsvPayloadEvent | null => {
    if (!isBrowser) return null;
    // Try sessionStorage first, then localStorage (main_page2.html writes to localStorage
    // because window.open creates a new sessionStorage context that cannot see the opener's).
    const stores: Array<[Storage, ExternalCsvTransport]> = [];
    try { if (window.sessionStorage) stores.push([window.sessionStorage, 'sessionStorage']); } catch { /* blocked */ }
    try { if (window.localStorage) stores.push([window.localStorage, 'localStorage']); } catch { /* blocked */ }

    for (const [store, transport] of stores) {
        try {
            const raw = store.getItem(pendingKey);
            if (!raw) continue;
            store.removeItem(pendingKey);
            const parsed = JSON.parse(raw);
            const event = normalizePayload(parsed, transport, pendingKey);
            if (event) return event;
        } catch (error) {
            console.error(`[ExternalCsvBridge] Failed to recover payload from ${transport}:`, error);
        }
    }
    return null;
};

const notifyOpenerReady = () => {
    if (!isBrowser) return;
    const targetOrigin = window.location.origin;
    if (!window.opener || window.opener === window) return;
    try {
        window.opener.postMessage({ type: 'ready' }, targetOrigin);
    } catch (error) {
        console.warn('[ExternalCsvBridge] Unable to notify opener about readiness:', error);
    }
};

const handlePostMessage = (event: MessageEvent) => {
    if (!isBrowser) return;
    if (event.origin !== window.location.origin) return;
    const normalized = normalizePayload(event.data, 'postMessage');
    if (normalized) {
        emitEvent(normalized);
    }
};

const removePendingQueryParam = () => {
    if (!isBrowser) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PENDING_QUERY_KEY)) return;
    url.searchParams.delete(PENDING_QUERY_KEY);
    const newUrl = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''}${url.hash}`;
    window.history.replaceState({}, document.title, newUrl);
};

export const initExternalCsvBridge = () => {
    if (!isBrowser || initialized) return;
    initialized = true;

    const params = new URLSearchParams(window.location.search);
    const pendingKey = params.get(PENDING_QUERY_KEY);
    let recoveredFromStorage = false;

    if (pendingKey) {
        hasExternalPayloadPending = true;
        const sessionEvent = recoverSessionPayload(pendingKey);
        if (sessionEvent) {
            recoveredFromStorage = true;
            emitEvent(sessionEvent);
        } else {
            console.warn('[ExternalCsvBridge] Pending payload key found but no data restored.');
        }
        removePendingQueryParam();
    }

    // Only set up postMessage channel if storage recovery didn't already deliver
    // the payload. Both channels carry the same CSV — listening to both causes
    // duplicate ingestion (double file processing, double analysis cards).
    if (!recoveredFromStorage) {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            notifyOpenerReady();
        } else {
            window.addEventListener('DOMContentLoaded', notifyOpenerReady, { once: true });
        }
        window.addEventListener('message', handlePostMessage);
    }
};

export const subscribeToExternalCsvPayload = (listener: ExternalCsvListener) => {
    listeners.add(listener);
    if (lastEvent) {
        listener(lastEvent);
    }
    return () => {
        listeners.delete(listener);
    };
};
