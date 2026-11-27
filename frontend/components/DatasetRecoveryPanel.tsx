import { CandidateDraft } from './task/CandidateDraft';
import React, { useEffect, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../store/useAppStore';
import { beginRun, finishRun, scopeRunStore, scopeStore, ownsSessionScope, canCommitRun, ownsRun, cancelOwnedRun, awaitOwned } from '../services/session/sessionOwnership';
import {hasPiInitialCheckpoint} from '../services/agent/runtime/pi/piInitialCheckpoint';
import {recoverPiInitialAnalysisIfNeeded} from '../services/agent/runtime/pi/piInitialAnalysisRuntimeService';
import { restoreAcceptedDataset, retainAcceptedDataset, collectExpiredDatasetRows, listRollbackTargets,
    reviewDatasetRollback, commitDatasetRollback, type DatasetRollbackReview } from '../services/data/datasetRecoveryActions';
import { persistCurrentAppSessionSnapshot } from '../services/persistence/currentSessionPersistence';
import type { StoreApi } from '../services/agent/types';
import type { DatasetCommitReference } from '../types/datasetCommit';
import { recoverCandidateReview, commitRecoveredCandidate, type RecoveredCandidateReview } from '../services/data/candidateRecovery';
import { inspectPiCandidateReview } from '../services/agent/runtime/pi/piCandidateReviewState';

/** These are explicit local host operations; saved approvals and model text cannot invoke them. */
export const DatasetRecoveryPanel: React.FC = () => {
    const { reference, status, busy, ready, checkpoint, liveApproval, recovering, sessionId } = useAppStore(s => ({ reference: s.datasetBundle?.acceptedCommit, sessionId:s.sessionId,
        status: s.datasetCommitBindingStatus, busy: s.isBusy || Boolean(s.activeExecution), ready: Boolean(s.csvData), checkpoint:s.candidateRecovery,
        liveApproval:Boolean(s.pendingClarification?.resumeContext?.piCandidateApproval && inspectPiCandidateReview(useAppStore,s.pendingClarification).review),recovering:s.activeExecution?.runId.startsWith('dataset-recovery-')??false }), shallow);
    const [message, setMessage] = useState('');
    const [targets, setTargets] = useState<DatasetCommitReference[]>([]);
    const [selected, setSelected] = useState('');
    const [review, setReview] = useState<DatasetRollbackReview | null>(null);
    const [candidateReview, setCandidateReview] = useState<RecoveredCandidateReview | null>(null);
    const source = useRef<HTMLInputElement>(null), rollbackSource = useRef<HTMLInputElement>(null);
    const candidateSource = useRef<HTMLInputElement>(null);
    useEffect(() => { setTargets([]); setSelected(''); setReview(null); setCandidateReview(null); setMessage(''); }, [sessionId, reference?.commitId]);
    const perform = async (operation: (store: StoreApi) => Promise<unknown>, success: string, continueInitial=false) => {
        if (useAppStore.getState().isBusy || useAppStore.getState().activeExecution) return;
        const lease = beginRun(useAppStore, 'follow_up', `dataset-recovery-${crypto.randomUUID()}`,`dataset-recovery-turn-${crypto.randomUUID()}`), store = scopeRunStore(useAppStore, lease);
        useAppStore.setState({ isBusy: true }); setMessage('Verifying local dataset…');
        let succeeded=false;
        try {
            await awaitOwned(operation(store),store,lease);
            if (!canCommitRun(store, lease)) return;
            await awaitOwned(persistCurrentAppSessionSnapshot(useAppStore.getState(), { store, scope: lease.scope }),store,lease);
            if (canCommitRun(store, lease)) {setMessage(success);succeeded=true;}
        } catch (error) {
            if (ownsRun(store, lease)) setMessage(`Blocked: ${lease.signal.aborted?'local_operation_cancelled':error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : 'local_operation_unavailable'}. Accepted history is preserved.`);
        } finally { finishRun(useAppStore, lease, { isBusy: false }); }
        if(continueInitial&&succeeded&&ownsSessionScope(useAppStore,lease.scope)&&!useAppStore.getState().activeExecution
            &&hasPiInitialCheckpoint(lease.scope.sessionId)){
            // Release recovery ownership before the existing initial runtime acquires its fresh lease.
            useAppStore.setState({initialAnalysisStatus:'paused'});
            try {await recoverPiInitialAnalysisIfNeeded(scopeStore(useAppStore,lease.scope));}
            catch {if(ownsSessionScope(useAppStore,lease.scope)&&!useAppStore.getState().activeExecution)setMessage('Initial continuation unavailable. Accepted rows are preserved; retry recovery.');}
        }
    };
    if (!reference && !checkpoint && status !== 'commit_unknown') return null;
    const prepareRollback = (file?: File) => {
        const target = targets.find(t => t.commitId === selected);
        if (!target) return;
        void perform(async store => { const exact = await reviewDatasetRollback(store, target, { file }); setReview(exact); }, 'Review the exact rollback below.');
    };
    return <section aria-label="Accepted dataset recovery" className="max-h-80 overflow-y-auto rounded-lg border border-accent-200 bg-accent-50 p-4 text-sm text-slate-800">
        <h3 className="font-semibold">Accepted dataset · version {reference?.revision ?? 'unresolved'}</h3>
        {recovering&&<button onClick={()=>cancelOwnedRun(useAppStore)} className="my-2 rounded border bg-white px-3 py-2">Stop local recovery</button>}
        <p className="mt-1">{status === 'ready' ? 'Current rows are verified and bound.' : 'Saved history contains metadata. Restore verified local rows or reattach the exact original CSV.'}</p>
        <p className="mt-1 text-xs">Recovery never restores an old approval or answer evidence. Missing source, environment or uncertain effects block execution.</p>
        {checkpoint && !liveApproval && <div className="mt-3 rounded border bg-white p-3">
            <p>Interrupted candidate: reattach its exact source to revalidate. A new approval is required; task budgets remain consumed.</p>
            <button disabled={busy} onClick={() => candidateSource.current?.click()} className="mt-2 rounded border px-3 py-2">Revalidate interrupted candidate</button>
            <input ref={candidateSource} type="file" accept=".csv,text/csv" className="hidden" aria-label="Interrupted candidate original CSV" onChange={e => {
                const file=e.target.files?.[0];e.target.value='';if(file)void perform(async s=>{const result=await recoverCandidateReview(s,{file});setCandidateReview(result.status==='review'?result.review:null);},'Durable outcome checked; review a newly revalidated candidate below.');
            }} />
            {candidateReview && <div className="mt-2">
                <p>Fresh review: {candidateReview.tables.map(t=>`${t.name}: ${t.rowCount} rows`).join('; ')}</p>
                <p className="break-all text-xs">{candidateReview.digest}</p>
                {candidateReview.exact && <div>
                    <p className="break-all text-xs">Program: {candidateReview.exact.programDigest} · Validation: {candidateReview.exact.validationDigest} · Source: {candidateReview.exact.spill?.source.sha256}</p>
                    <CandidateDraft taskId={candidateReview.exact.spill!.taskId} candidateId={candidateReview.exact.candidateId} table={candidateReview.exact.primaryTable} digest={candidateReview.exact.validationDigest} />
                </div>}
                <button disabled={busy} onClick={()=>void perform(async s=>{await commitRecoveredCandidate(s,candidateReview);setCandidateReview(null);},'Revalidated candidate committed once. Run a fresh query for facts.',true)} className="mt-2 rounded bg-accent-700 px-3 py-2 text-white">Approve recovered candidate</button>
                <button disabled={busy} onClick={()=>void perform(async s=>{s.setState({candidateRecovery:null});setCandidateReview(null);},'Recovered candidate denied; accepted data unchanged.')} className="ml-2 rounded border px-3 py-2">Deny recovered candidate</button>
            </div>}
        </div>}
        <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={busy || !reference && status!=='commit_unknown'} onClick={() => void perform(s => restoreAcceptedDataset(s), 'Verified dataset restored. New facts require a fresh query.',true)} className="rounded border bg-white px-3 py-2 disabled:opacity-50">Restore local rows</button>
            <button disabled={busy || !reference && status!=='commit_unknown'} onClick={() => source.current?.click()} className="rounded border bg-white px-3 py-2 disabled:opacity-50">Reattach original CSV</button>
            <button disabled={busy || !ready || status !== 'ready'} onClick={() => void perform(s => retainAcceptedDataset(s), 'Verified rows retained locally.')} className="rounded border bg-white px-3 py-2 disabled:opacity-50">Keep rows locally · 7 days</button>
            <button disabled={busy} onClick={() => void perform(s => collectExpiredDatasetRows(s), 'Expired unreferenced rows collected; accepted references remain protected.')} className="rounded border bg-white px-3 py-2 disabled:opacity-50">Remove expired unused rows</button>
            <button disabled={busy} onClick={() => void perform(async s => { const versions = await listRollbackTargets(s); setTargets(versions); setSelected(versions[0]?.commitId ?? ''); setReview(null); }, 'Available earlier versions listed. Metadata-only versions may require source reattachment.')} className="rounded border bg-white px-3 py-2 disabled:opacity-50">Review rollback</button>
        </div>
        <p className="mt-2 text-xs">Local retention is optional: 32 MiB per artifact, 128 MiB total. Expired rows stay protected while accepted history or an active read references them. Clear all local data removes retained rows.</p>
        <input ref={source} type="file" accept=".csv,text/csv" className="hidden" aria-label="Recovery original CSV" onChange={e => {
            const file = e.target.files?.[0]; e.target.value = ''; if (file) void perform(s => restoreAcceptedDataset(s, { file }), 'Exact source verified; dataset independently revalidated and restored.',true);
        }} />
        {targets.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2">
            <label>Earlier version <select value={selected} disabled={busy} onChange={e => { setSelected(e.target.value); setReview(null); }} className="ml-2 rounded border bg-white p-2">
                {targets.map(t => <option key={t.commitId} value={t.commitId}>Version {t.revision}</option>)}
            </select></label>
            <button disabled={busy} onClick={() => prepareRollback()} className="rounded border bg-white px-3 py-2">Verify rollback</button>
            <button disabled={busy} onClick={() => rollbackSource.current?.click()} className="rounded border bg-white px-3 py-2">Reattach for rollback</button>
            <input ref={rollbackSource} type="file" accept=".csv,text/csv" className="hidden" aria-label="Rollback original CSV" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) prepareRollback(file); }} />
        </div>}
        {review && <div className="mt-3 rounded border bg-white p-3">
            <p>Append rollback: version {review.current.revision} → rows/schema/relationships from version {review.target.revision}.</p>
            <p className="break-all text-xs">Review {review.digest}</p>
            <ul className="my-2">{review.tables.map(t => <li key={t.name}>{t.name}: {t.rowCount} rows · {t.columns.join(', ')}</li>)}</ul>
            <button disabled={busy} onClick={() => void perform(async s => { await commitDatasetRollback(s, review); setReview(null); }, 'Rollback appended once; previous evidence invalidated.')} className="rounded bg-accent-700 px-3 py-2 text-white disabled:opacity-50">Approve exact rollback</button>
            <button disabled={busy} onClick={() => setReview(null)} className="ml-2 rounded border px-3 py-2">Deny</button>
        </div>}
        {message && <p role="status" className="mt-3 break-words">{message}</p>}
    </section>;
};
