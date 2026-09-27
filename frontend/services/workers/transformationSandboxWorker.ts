/// <reference lib="webworker" />

import type { CsvRow, SandboxLanguage, SandboxTransformationOutput } from '../../types';
import { validateSandboxCode } from '../sandbox/sandboxPolicy';

type SandboxWorkerRequest = {
    id: number;
    language: SandboxLanguage;
    code: string;
    rows: CsvRow[];
    context: Record<string, unknown>;
    maxOutputBytes: number;
};

type SandboxWorkerResponse = {
    id: number;
    success: boolean;
    result?: SandboxTransformationOutput;
    error?: string;
};

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const disableWorkerCapability = (name: string, value: unknown) => {
    try {
        Object.defineProperty(workerScope, name, {
            configurable: false,
            enumerable: false,
            writable: false,
            value,
        });
    } catch {
        // Some browser-owned properties are non-configurable. The generated
        // function also shadows every capability listed here.
    }
};

const lockDownWorkerCapabilities = () => {
    const denyNetwork = () => Promise.reject(new Error('sandbox_network_access_denied'));
    disableWorkerCapability('fetch', denyNetwork);
    disableWorkerCapability('XMLHttpRequest', undefined);
    disableWorkerCapability('WebSocket', undefined);
    disableWorkerCapability('EventSource', undefined);
    disableWorkerCapability('indexedDB', undefined);
    disableWorkerCapability('caches', undefined);
};

lockDownWorkerCapabilities();

const executeJavaScript = async (request: SandboxWorkerRequest): Promise<SandboxTransformationOutput> => {
    const policyErrors = validateSandboxCode('javascript', request.code);
    if (policyErrors.length > 0) throw new Error(policyErrors.join(','));

    const buildTransform = new Function(`
        "use strict";
        const globalThis = undefined;
        const self = undefined;
        const window = undefined;
        const document = undefined;
        const navigator = undefined;
        const location = undefined;
        const fetch = undefined;
        const XMLHttpRequest = undefined;
        const WebSocket = undefined;
        const EventSource = undefined;
        const Worker = undefined;
        const SharedWorker = undefined;
        const indexedDB = undefined;
        const localStorage = undefined;
        const sessionStorage = undefined;
        const caches = undefined;
        const importScripts = undefined;
        const postMessage = undefined;
        const module = undefined;
        const exports = undefined;
        const require = undefined;
        ${request.code}
        if (typeof transform !== "function") throw new Error("sandbox_transform_entry_missing");
        return transform;
    `) as () => (rows: CsvRow[], context: Record<string, unknown>) => unknown;
    const transform = buildTransform();
    const rawResult = await transform(
        request.rows.map(row => ({ ...row })),
        Object.freeze({ ...request.context }),
    );
    const serialized = JSON.stringify(rawResult);
    if (typeof serialized !== 'string') throw new Error('sandbox_output_not_serializable');
    if (new TextEncoder().encode(serialized).byteLength > request.maxOutputBytes) {
        throw new Error('sandbox_output_limit_exceeded');
    }
    return JSON.parse(serialized) as SandboxTransformationOutput;
};

workerScope.onmessage = async (event: MessageEvent<SandboxWorkerRequest>) => {
    const request = event.data;
    try {
        if (request.language !== 'javascript') throw new Error('sandbox_worker_language_mismatch');
        const result = await executeJavaScript(request);
        const response: SandboxWorkerResponse = { id: request.id, success: true, result };
        workerScope.postMessage(response);
    } catch (error) {
        const response: SandboxWorkerResponse = {
            id: request.id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
        workerScope.postMessage(response);
    }
};
