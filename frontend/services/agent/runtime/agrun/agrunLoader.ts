/**
 * AGRUN-001: app-owned intake boundary for Agent-Runtime-JavaScript (agrun).
 *
 * - The dist is consumed ONLY through this loader (dynamic import, cached
 *   module promise) so agrun never enters the eager preload chain.
 * - AGRUN-012 made this the only follow-up runtime. The module remains lazy so
 *   initial analysis does not pull Agrun into the eager application graph.
 * - Load lifecycle and failures are visible via debug telemetry
 *   (AGRUN-US-01: adapter initialization errors are visible).
 */
import { debugLog } from '../../../ai/llmLogger';
import type { AgrunLoadStatus, AgrunModule, AgrunRuntimeDebugState } from './types';

/** Git revision of yapweijun1996/Agent-Runtime-JavaScript pinned in package.json. */
export const PINNED_AGRUN_REVISION = '8336b03d9117fd2014a8e78f0e180047f680488b';
export const AGRUN_DIST_PACKAGE = 'agent-runtime-javascript-dist@0.2.0';

type AgrunImporter = () => Promise<AgrunModule>;

const defaultImporter: AgrunImporter = async () =>
    (await import('./agrunModule')).resolveAgrunModule();

let modulePromise: Promise<AgrunModule> | null = null;
let loadStatus: AgrunLoadStatus = 'idle';
let loadError: string | null = null;

/**
 * Load the agrun module once; concurrent and repeat callers share the cached
 * promise. A failed load records the error, clears the cache so a later call
 * can retry, and rethrows so the caller surfaces the failure.
 */
export const loadAgrunModule = (importer: AgrunImporter = defaultImporter): Promise<AgrunModule> => {
    if (modulePromise) return modulePromise;
    loadStatus = 'loading';
    loadError = null;
    debugLog('agrun_load_start', {
        pinnedRevision: PINNED_AGRUN_REVISION,
    });
    // Invoke the importer inside the promise chain so a *synchronous* throw
    // (a contract-violating importer) becomes a rejection routed through the
    // same failure handler, and the caller always receives a rejected promise
    // rather than a synchronous throw.
    modulePromise = Promise.resolve().then(importer).then(
        (module) => {
            loadStatus = 'loaded';
            debugLog('agrun_load_success', { pinnedRevision: PINNED_AGRUN_REVISION });
            return module;
        },
        (error: unknown) => {
            loadStatus = 'failed';
            loadError = error instanceof Error ? error.message : String(error);
            modulePromise = null;
            debugLog('agrun_load_failure', { pinnedRevision: PINNED_AGRUN_REVISION }, error);
            throw error;
        },
    );
    return modulePromise;
};

/** Debug telemetry snapshot: pinned revision, flag state, load lifecycle. */
export const getAgrunRuntimeDebugState = (): AgrunRuntimeDebugState => ({
    pinnedRevision: PINNED_AGRUN_REVISION,
    distPackage: AGRUN_DIST_PACKAGE,
    loadStatus,
    loadError,
});

export const __resetAgrunLoaderForTests = (): void => {
    modulePromise = null;
    loadStatus = 'idle';
    loadError = null;
};
