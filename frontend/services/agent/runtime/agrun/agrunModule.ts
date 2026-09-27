/**
 * AGRUN-001: consumption boundary for the agrun single-file UMD bundle.
 *
 * Why the UMD file and not `esm/`: the pinned dist's `esm/` tree contains
 * relative `../../node_modules/...` imports (ai, @ai-sdk/*, @vercel/oidc)
 * that only resolve inside the source repo, so it cannot be consumed
 * externally at this revision. The repo's own usage-quickstart documents the
 * UMD bundle as the supported bundler consumption path.
 *
 * Because the dist package declares `"type": "module"`, ESM hosts execute the
 * UMD wrapper's global branch (`globalThis.Agrun`) instead of populating
 * module exports, while CJS-interop hosts may surface named or default
 * exports. `resolveAgrunModule` normalizes all three shapes and validates the
 * factories the migration needs, so a packaging change fails loudly here
 * rather than surfacing as undefined-function errors deeper in an adapter.
 *
 * This file is the sole dynamic-import site for the dist, so the ~4MB agrun
 * bundle stays in the deterministic lazy `agrun` chunk reached only on demand.
 * It must ONLY be imported dynamically, and only by agrunLoader.ts. Vite's
 * module-preload filter and the bundle budget gate prevent it from becoming
 * part of the eager startup graph.
 */
import type { AgrunModule } from './types';

const REQUIRED_FACTORIES = [
    'createRuntime',
    'defineAction',
    'createSessionStore',
    'createMemoryStore',
    'createIndexedDBMessageStorage',
    'exportState',
    'importState',
] as const;

const isAgrunModule = (candidate: unknown): candidate is AgrunModule =>
    typeof candidate === 'object'
    && candidate !== null
    && REQUIRED_FACTORIES.every(name =>
        typeof (candidate as Record<string, unknown>)[name] === 'function');

export const resolveAgrunModule = async (): Promise<AgrunModule> => {
    const namespace: Record<string, unknown> =
        await import('agent-runtime-javascript-dist/agrun.js');
    const globalCandidate = (globalThis as Record<string, unknown>).Agrun;
    const candidates: unknown[] = [namespace, namespace.default, globalCandidate];
    for (const candidate of candidates) {
        if (isAgrunModule(candidate)) return candidate;
    }
    throw new Error(
        'agrun UMD bundle loaded but no export shape (named / default / globalThis.Agrun) '
        + `provided the required factories: ${REQUIRED_FACTORIES.join(', ')}`);
};
