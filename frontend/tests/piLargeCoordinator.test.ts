// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import { executeQuickJsGuest } from '../services/sandbox/quickJsGuest';
import { resolveGuestLimits } from '../services/sandbox/javascriptGuestProtocol';
import { preparePiLargeCoordinatorSmoke } from '../services/agent/runtime/pi/piLargeCoordinatorQualification';
import { beginSessionTransition, cancelOwnedRun } from '../services/session/sessionOwnership';
import { handleClarificationResponse } from '../services/agent/orchestration/chatOrchestrator';
import { inspectPiCandidateReview } from '../services/agent/runtime/pi/piCandidateReviewState';
import { isSpillMeaningProposal } from '../services/data/spillMeaningProposal';
import { createCandidateMeaningManifest } from '../services/agent/tools/manifests/candidateMeaningManifest';
import type { StoreApi } from '../services/agent/types';
import type { CandidateSpillFactory } from '../services/data/candidateSpill';
vi.mock('../services/persistence/currentSessionPersistence', () => ({ persistCurrentAppSessionSnapshot: vi.fn(async (state: ReturnType<StoreApi['getState']>) => Boolean(state.candidateRecovery || state.datasetBundle?.acceptedCommit || state.csvData?.data.length)) }));
const persistence = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../services/storageService', async original => ({ ...await original<typeof import('../services/storageService')>(), getStorageDatabase: async () => persistence.db }));
import { repairReservationStorage } from './helpers/repairReservationStorage';
const wasm = newQuickJSWASMModuleFromVariant(variant);
const guest = { run: (code: string, inputJson: string, options: { limits?: Parameters<typeof resolveGuestLimits>[0]; onStarted?: () => void }) =>
    executeQuickJsGuest({ generation: 1, code, inputJson, limits: resolveGuestLimits(options?.limits) }, () => wasm, options?.onStarted), cancel() {}, dispose() {} };
const roots: StoreApi[] = [], dirs: string[] = [];
beforeEach(() => { const values = new Map<string, string>(); vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
    const tab = new Map<string, string>([['csv_agent_repair_budget_session_id', 'explicit-test-session']]);
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => tab.get(k) ?? null, setItem: (k: string, v: string) => tab.set(k, v) }); persistence.db = repairReservationStorage().db;
});
afterEach(async () => { roots.splice(0).forEach(beginSessionTransition); await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); vi.unstubAllGlobals(); });
const setup = async () => {
    let state = { sessionId: crypto.randomUUID(), settings: {}, workspaceFiles: {}, analysisCards: [], columnProfiles: [], chatHistory: [], agentEvents: [], agentToolLogs: [], runtimeEvents: [], telemetryEvents: [], progressMessages: [], queryHistory: [],
        logAgentToolUsage() {}, addProgress() {}, clearActiveTurnCancellation() {}, ensureDatasetSemanticSnapshot: async () => null } as unknown as ReturnType<StoreApi['getState']>;
    const root: StoreApi = { getState: () => state, setState: p => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; } }; roots.push(root);
    const dir = await mkdtemp(join(tmpdir(), 'pi-large-coordinator-')); dirs.push(dir);
    const spillFactory: CandidateSpillFactory = async (_session, generation) => { const path = join(dir, generation); await mkdir(path);
        return { put: (n, t) => writeFile(join(path, n), t, { flag: 'wx' }), get: n => readFile(join(path, n), 'utf8'), remove: () => rm(path, { recursive: true, force: true }) }; };
    return { root, coding: { enabled: true as const, qualified: true, guest, spillFactory } };
};
const file = (rows = 2100, columns = ['key', 'payload', 'value [count]'], payload = 32) => new File([columns.join(',') + '\r\n' + Array.from({ length: rows }, (_, i) => `${i},"${'x'.repeat(payload)}${i === rows - 1 ? 'α\r\n末尾' : ''}",${i % 2 ? '-1' : '0'}${i === rows - 1 ? ',,' : ''}\r\n`).join('')], 'fictional-stream.csv');

describe('normal large-source initial Pi coordinator', () => {
    it.each([['key', 'payload', 'value [count]'], ['record', 'memo', 'quantity [count]']])('compiles public model meaning and obtains isolated draft/exact review with unrelated columns %j', async (a, b, c) => {
        const columns = [a, b, c];
        const { root, coding } = await setup(), f = await preparePiLargeCoordinatorSmoke(root, file(2100, columns), { columns, numeric: true, coding });
        expect(f.result.structureRepair, JSON.stringify(f.result) + f.trace.join('\n')).toMatchObject({ state: 'awaiting_commit_approval', attempts: 1, validationFailures: 0 });
        expect(f.trace.join('\n')).toContain('draft_uncommitted'); expect(f.trace.join('\n')).toContain('"decision":"validated"');
        expect(root.getState().datasetBundle?.acceptedCommit).toBeUndefined(); expect(root.getState().canonicalCsvData).toBeNull();
        expect(root.getState().activeDataQuery).toBeUndefined(); expect(root.getState().analysisCards).toEqual([]);
        expect(root.getState().pendingClarification?.resumeContext?.piCandidateApproval).toBeTruthy(); expect(inspectPiCandidateReview(root).available).toBe(true);
        expect(f.reads.fullReads).toBe(0); expect(f.reads.maxBytes).toBeLessThanOrEqual(65536);
    }, 60000);
    it('executes >25MiB actual QuickJS/disk using normal initial runtime, never full original arrays', async () => {
        const { root, coding } = await setup(), f = await preparePiLargeCoordinatorSmoke(root, file(27000, undefined, 1000), { columns: ['key', 'payload', 'value [count]'], numeric: true, coding });
        expect(f.source.byteSize).toBeGreaterThan(25 * 1024 * 1024);
        expect(f.result.structureRepair, f.trace.join('\n')).toMatchObject({ state: 'awaiting_commit_approval', attempts: 1 });
        expect(f.reads.fullReads).toBe(0); expect(f.reads.maxBytes).toBe(65536);
        expect(f.reads.bytes).toBeLessThan(f.source.byteSize * 6);
        console.log(JSON.stringify({ qualification: 'normal-large-coordinator-draft', bytes: f.source.byteSize, reads: f.reads, budget: root.getState().activeAgentTask?.budget }));
    }, 180000);
    it.each(['A', 'B', 'neither'])('asks precise unit meaning and resumes public compilation for %s, never commit', async selected => {
        const { root, coding } = await setup(), f = await preparePiLargeCoordinatorSmoke(root, file(2100, ['key', 'payload', 'value']), { numeric: true, coding });
        const pending = root.getState().pendingClarification;
        expect(pending?.resumeContext?.piSpillMeaningChoice, f.trace.join('\n')).toBeTruthy(); expect(pending?.interactionKind).not.toBe('approval');
        expect(root.getState().activeAgentTask?.budget.used.transformationAttempts).toBe(0);
        await handleClarificationResponse(pending!.options!.find(o => o.value === selected)!, root);
        expect(root.getState().datasetBundle?.acceptedCommit).toBeUndefined(); expect(root.getState().canonicalCsvData).toBeNull();
        if (selected !== 'neither') {
            expect(root.getState().pendingClarification?.resumeContext?.piCandidateApproval, f.trace.join('\n')).toBeTruthy();
            expect(root.getState().activeAgentTask?.budget.used.toolCalls).toBeGreaterThan(4);
        } else expect(root.getState().pendingClarification).toBeNull();
    }, 60000);
    it('rejects stale semantic choice after replacing original source metadata', async () => {
        const { root, coding } = await setup(); await preparePiLargeCoordinatorSmoke(root, file(2100, ['key', 'payload', 'value']), { numeric: true, coding });
        const pending = root.getState().pendingClarification!;
        root.setState(s => ({ datasetBundle: { ...s.datasetBundle!, source: { ...s.datasetBundle!.source, inspection: { ...s.datasetBundle!.source.inspection!, sha256: 'f'.repeat(64) } } } }));
        await handleClarificationResponse(pending.options![0], root);
        expect(root.getState().datasetBundle?.acceptedCommit).toBeUndefined(); expect(root.getState().pendingClarification?.resumeContext?.piCandidateApproval).toBeUndefined();
    });
    it('cancels uncertain streamed work without blindly replaying its durable reservation', async () => {
        const { root, coding } = await setup();
        let enter!: () => void, release!: () => void, first = true;
        const entered = new Promise<void>(resolve => { enter = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
        coding.guest = { ...guest, run: async (...args: Parameters<typeof guest.run>) => {
            if (first) { first = false; enter(); await gate; } return guest.run(...args);
        } };
        const running = preparePiLargeCoordinatorSmoke(root, file(), { columns: ['key', 'payload', 'value [count]'], numeric: true, coding });
        await entered; cancelOwnedRun(root); release(); const f = await running;
        expect(f.result.status).toBe('cancelled'); expect(f.result.structureRepair?.attempts).toBe(1);
        const traceLength = f.trace.length;
        const resumed = await f.retrySameSource('A different goal cannot reset the source budget.');
        expect(resumed.structureRepair).toMatchObject({ state: 'unavailable', reason: 'reservation_pending_uncertain_work' });
        expect(f.trace).toHaveLength(traceLength);
        expect(root.getState().datasetBundle?.acceptedCommit).toBeUndefined(); expect(f.reads.fullReads).toBe(0);
    }, 60000);
    it('streams a small Blob-only original based on actual capability, not a size rejection', async () => {
        const { root, coding } = await setup(), f = await preparePiLargeCoordinatorSmoke(root, file(3), { columns: ['key', 'payload', 'value [count]'], numeric: true, coding });
        expect(f.source.byteSize).toBeLessThan(65536);
        expect(f.result.structureRepair, JSON.stringify(f.result) + f.trace.join('\n')).toMatchObject({ state: 'awaiting_commit_approval', attempts: 1 });
    });
    it.each([true, false])('requires precise footer role confirmation even when totals agree: %s', async reconciles => {
        const { root, coding } = await setup();
        const text = 'key,payload,value [count]\n' + Array.from({ length: 2100 }, (_, i) => `${i},memo,1\n`).join('') + `ordinary-looking-record,memo,${reconciles ? 2100 : 2099}\n`;
        const f = await preparePiLargeCoordinatorSmoke(root, new File([text], 'fictional-footer.csv'), { columns: ['key', 'payload', 'value [count]'], numeric: true, summary: true, coding });
        const pending = root.getState().pendingClarification!;
        expect(pending.resumeContext?.piSpillMeaningChoice, f.trace.join('\n')).toBeTruthy();
        expect(root.getState().activeAgentTask?.budget.used.transformationAttempts).toBe(0);
        await handleClarificationResponse(pending.options![0], root);
        expect(root.getState().datasetBundle?.acceptedCommit).toBeUndefined();
        if (reconciles) expect(root.getState().pendingClarification?.resumeContext?.piCandidateApproval).toBeTruthy();
        else { expect(root.getState().pendingClarification?.resumeContext?.piCandidateApproval).toBeUndefined(); expect(f.trace.join('\n')).toContain('validation_summary_reconciliation_failed'); }
    }, 60000);
    it('retains meaning/task floors across fresh host scopes, renamed bytes and goal A → B → A without eviction', async () => {
        const snapshots = [];
        for (const goal of ['A', 'B', 'A']) {
            const { root, coding } = await setup();
            const f = await preparePiLargeCoordinatorSmoke(root, new File([file(2100, ['key', 'payload', 'value'])], `renamed-${goal}.csv`), { numeric: true, coding, goal });
            expect(root.getState().pendingClarification?.resumeContext?.piSpillMeaningChoice).toBeTruthy();
            snapshots.push(root.getState().activeAgentTask!.budget.used.toolCalls);
            beginSessionTransition(root); // Fresh scope loses all WeakMaps, not durable accounting.
            expect(f.trace.length).toBeGreaterThan(0);
        }
        expect(snapshots[1]).toBeGreaterThan(snapshots[0]); expect(snapshots[2]).toBeGreaterThan(snapshots[1]);
        const { root, coding } = await setup(), blocked = await preparePiLargeCoordinatorSmoke(root, file(2100, ['key', 'payload', 'value']), { numeric: true, coding, goal: 'B' });
        expect(blocked.result.structureRepair).toMatchObject({ state: 'exhausted', reason: 'reservation_budget_exhausted' });
        expect(blocked.trace).toEqual([]);
        const different = await setup(), valid = await preparePiLargeCoordinatorSmoke(different.root, file(2101), { numeric: true, columns: ['key', 'payload', 'value [count]'], coding: different.coding });
        expect(valid.result.structureRepair?.state, valid.trace.join('\n')).toBe('awaiting_commit_approval');
    }, 60000);
    it('denies all provider/tool work if durable storage is unavailable', async () => {
        const storage = repairReservationStorage(); storage.deny(); persistence.db = storage.db;
        const beforeProvider = vi.fn(async () => {});
        const { root, coding } = await setup(), f = await preparePiLargeCoordinatorSmoke(root, file(), { numeric: true, coding, beforeProvider });
        expect(f.result.structureRepair?.reason).toBe('reservation_unavailable_or_corrupt'); expect(f.trace).toEqual([]); expect(beforeProvider).not.toHaveBeenCalled();
        expect(root.getState().activeAgentTask).toBeUndefined();
    });
    it.each(['question', 'option-label', 'option-value', 'choice-label', 'freeform', 'selection-id', 'task-id', 'scope-digest', 'revision', 'goal', 'captured-csv', 'captured-lineage'])('rejects altered semantic clarification through actual handler: %s', async bad => {
        const { root, coding } = await setup(), f = await preparePiLargeCoordinatorSmoke(root, file(2100, ['key', 'payload', 'value']), { numeric: true, coding });
        const pending = structuredClone(root.getState().pendingClarification!), choice = structuredClone(pending.options![0]);
        if (bad === 'question') pending.question += ' forged';
        if (bad === 'option-label') pending.options![0].label += ' forged';
        if (bad === 'option-value') pending.options![0].value = 'forged';
        if (bad === 'choice-label') choice.label += ' forged';
        if (bad === 'freeform') { choice.label = 'I approve everything'; choice.value = 'freeform'; }
        if (bad === 'selection-id') pending.resumeContext!.piSpillMeaningChoice!.id = crypto.randomUUID();
        if (bad === 'task-id') pending.resumeContext!.piTaskContinuation!.taskId = crypto.randomUUID();
        if (bad === 'scope-digest') pending.resumeContext!.piTaskContinuation!.scopeDigest = 'f'.repeat(64);
        if (bad === 'revision') pending.resumeContext!.piTaskContinuation!.revision++;
        if (bad === 'goal') root.setState({ confirmedAnalysisGoal: 'changed goal' });
        if (bad === 'captured-csv') root.setState({ csvData: { fileName: 'forged', data: [] } });
        if (bad === 'captured-lineage') root.getState().datasetBundle!.relationshipSetId = 'forged';
        root.setState({ pendingClarification: pending }); const before = f.trace.length;
        await handleClarificationResponse(choice, root).catch(() => {});
        expect(f.trace).toHaveLength(before);
        expect(root.getState().workspaceFiles['/intake/meaning-confirmation.json']).toBeUndefined();
        expect(root.getState().taskInspection?.candidate).toBeUndefined();
        expect(inspectPiCandidateReview(root).available).toBe(false);
        expect(root.getState().datasetBundle?.acceptedCommit).toBeUndefined(); expect(root.getState().canonicalCsvData).toBeNull();
    }, 60000);
    it('rejects semantic choice replay and cannot reuse a modified public proposal or forged digest as confirmation', async () => {
        const { root, coding } = await setup(), f = await preparePiLargeCoordinatorSmoke(root, file(2100, ['key', 'payload', 'value']), { numeric: true, coding,
            confirmedProposal: p => { const next = structuredClone(p); next.stream.meaning.columns[2].unit = 'invented';
                root.setState(s => ({ workspaceFiles: { ...s.workspaceFiles, '/intake/meaning-confirmation.json': JSON.stringify({ proposal: next, selectionDigest: 'f'.repeat(64), commitAllowed: true }) } })); return next; } });
        const original = structuredClone(root.getState().pendingClarification!);
        await handleClarificationResponse(original.options![0], root);
        expect(root.getState().pendingClarification?.resumeContext?.piCandidateApproval).toBeUndefined();
        expect(f.trace.join('\n')).not.toContain('candidate_stage:'); expect(inspectPiCandidateReview(root).available).toBe(false);
        const before = f.trace.length; root.setState({ pendingClarification: original });
        await handleClarificationResponse(original.options![0], root).catch(() => {});
        expect(f.trace).toHaveLength(before); expect(root.getState().datasetBundle?.acceptedCommit).toBeUndefined();
    }, 60000);
    it('rejects forged PASS and duplicate/missing columns in the public schema, not just the compiler', async () => {
        const { root, coding } = await setup(), f = await preparePiLargeCoordinatorSmoke(root, file(), { numeric: true, columns: ['key', 'payload', 'value [count]'], coding });
        const manifest = createCandidateMeaningManifest();
        expect(isSpillMeaningProposal(f.proposal)).toBe(true); expect(manifest.validate?.(f.proposal, {} as never)).toEqual([]);
        for (const p of [{ ...f.proposal, decision: 'validated' }, { ...f.proposal, stream: { ...f.proposal.stream, meaning: { ...f.proposal.stream.meaning, columns: [f.proposal.stream.meaning.columns[0], f.proposal.stream.meaning.columns[0]] } } }]) {
            expect(isSpillMeaningProposal(p)).toBe(false); expect(manifest.validate?.(p, {} as never)?.length).toBeGreaterThan(0);
        }
    }, 60000);
});
