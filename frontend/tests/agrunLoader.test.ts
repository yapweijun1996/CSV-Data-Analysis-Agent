/**
 * AGRUN-001 focused tests: pinned revision, lazy loader caching, failure
 * visibility and debug telemetry exposure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AGRUN_DIST_PACKAGE,
    PINNED_AGRUN_REVISION,
    __resetAgrunLoaderForTests,
    getAgrunRuntimeDebugState,
    loadAgrunModule,
} from '../services/agent/runtime/agrun/agrunLoader';
import { selectAgrunRuntimeDebugState } from '../services/agent/debugSelectors';
import type { AgrunModule } from '../services/agent/runtime/agrun/types';

const fakeModule: AgrunModule = {
    createRuntime: () => ({
        run: async () => ({}),
        getState: () => ({}),
        getRuntimeConfig: () => ({}),
    }),
    defineAction: spec => spec,
    createSessionStore: () => ({}),
    createMemoryStore: () => ({}),
    createIndexedDBMessageStorage: () => ({}),
};

beforeEach(() => {
    __resetAgrunLoaderForTests();
});

afterEach(() => {
    __resetAgrunLoaderForTests();
});

describe('AGRUN-001 pinned revision', () => {
    it('package.json pins the same revision the loader reports', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
        const spec = pkg.dependencies['agent-runtime-javascript-dist'] as string;
        expect(spec).toContain('yapweijun1996/Agent-Runtime-JavaScript');
        expect(spec).toContain(`#${PINNED_AGRUN_REVISION}`);
    });

    it('the pinned dist is installed and its version matches the loader constant', () => {
        const distPkg = JSON.parse(fs.readFileSync(
            path.join(process.cwd(), 'node_modules', 'agent-runtime-javascript-dist', 'package.json'), 'utf8'));
        expect(AGRUN_DIST_PACKAGE).toBe(`${distPkg.name}@${distPkg.version}`);
    });
});

describe('AGRUN-001 lazy loader', () => {
    it('caches the module promise across repeat and concurrent callers', async () => {
        const importer = vi.fn(async () => fakeModule);
        const [a, b] = [loadAgrunModule(importer), loadAgrunModule(importer)];
        expect(a).toBe(b);
        await a;
        expect(loadAgrunModule(importer)).toBe(a);
        expect(importer).toHaveBeenCalledTimes(1);
        expect(getAgrunRuntimeDebugState().loadStatus).toBe('loaded');
    });

    it('records a visible failure, rethrows, and allows a later retry', async () => {
        const importer = vi.fn(async () => { throw new Error('agrun dist unreachable'); });
        await expect(loadAgrunModule(importer)).rejects.toThrow('agrun dist unreachable');
        const failedState = getAgrunRuntimeDebugState();
        expect(failedState.loadStatus).toBe('failed');
        expect(failedState.loadError).toBe('agrun dist unreachable');

        const recovery = vi.fn(async () => fakeModule);
        await expect(loadAgrunModule(recovery)).resolves.toBe(fakeModule);
        expect(getAgrunRuntimeDebugState().loadStatus).toBe('loaded');
        expect(getAgrunRuntimeDebugState().loadError).toBeNull();
    });

    it('routes a synchronously-throwing importer through the failure path (no stuck loading state)', async () => {
        const importer = vi.fn(() => { throw new Error('sync boom'); }) as unknown as () => Promise<AgrunModule>;
        // Must reject, not throw synchronously.
        await expect(loadAgrunModule(importer)).rejects.toThrow('sync boom');
        const state = getAgrunRuntimeDebugState();
        expect(state.loadStatus).toBe('failed');
        expect(state.loadError).toBe('sync boom');
        // Cache cleared → a later valid load recovers.
        await expect(loadAgrunModule(vi.fn(async () => fakeModule))).resolves.toBe(fakeModule);
    });

    it('loads the real pinned UMD distribution through the default importer', async () => {
        const module = await loadAgrunModule();
        expect(typeof module.createRuntime).toBe('function');
        expect(typeof module.defineAction).toBe('function');
        expect(typeof module.createSessionStore).toBe('function');
        expect(typeof module.createMemoryStore).toBe('function');
        expect(typeof module.createIndexedDBMessageStorage).toBe('function');
    }, 30_000);
});

describe('AGRUN-001 debug telemetry surface', () => {
    it('selectAgrunRuntimeDebugState exposes revision and idle load state', () => {
        const state = selectAgrunRuntimeDebugState();
        expect(state.pinnedRevision).toBe(PINNED_AGRUN_REVISION);
        expect(state.distPackage).toBe(AGRUN_DIST_PACKAGE);
        expect(state.loadStatus).toBe('idle');
        expect(state.loadError).toBeNull();
    });
});
