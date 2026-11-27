// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import { executeQuickJsGuest } from '../services/sandbox/quickJsGuest';
import { resolveGuestLimits } from '../services/sandbox/javascriptGuestProtocol';
import { prepareCandidateCommitFixture } from '../services/data/candidateCommitQualificationFixture';
import { stageRecoveryQualificationCandidate } from '../services/data/datasetRecoveryQualificationFixture';
import { createCandidateCommitService } from '../services/data/candidateCommit';
import { restoreAcceptedDataset, reviewDatasetRollback, commitDatasetRollback, listRollbackTargets } from '../services/data/datasetRecoveryActions';
import { recoverCandidateReview, commitRecoveredCandidate } from '../services/data/candidateRecovery';
import { reconstructDatasetCommit } from '../services/data/datasetRecovery';
import { projectCommittedReport } from '../services/persistence/datasetCommitProjection';
import { buildPersistedReportRecord } from '../services/persistence/persistedAppState';
import { beginRun, finishRun, scopeRunStore, beginSessionTransition, cancelOwnedRun } from '../services/session/sessionOwnership';
import { drainSessionPersistence } from '../services/persistence/currentSessionPersistence';
import type { StorageDatabase } from '../services/storageService';
import type { DatasetCommitMarker } from '../types/datasetCommit';
import type { StoreApi } from '../services/agent/types';
import { codeDigest } from '../services/agent/execution/codeTableInputs';

const io=vi.hoisted(()=>({records:new Map<string,unknown>(),commits:0,failReads:false,fault:''}));
vi.mock('../services/persistence/datasetCommitStorage',()=>({
    readCommitIntent:async(_db,sid,key)=>{if(io.failReads)throw new Error('unavailable');return io.records.get(JSON.stringify(['intent',sid,key]));},
    commitDatasetTransaction:async(_db,marker:DatasetCommitMarker,baseline,check,admit)=>{
        check();admit();if(io.fault==='abort')throw new DOMException('aborted','AbortError');
        const prior=io.records.get(JSON.stringify(['head',marker.sessionId])) as {commitId:string;revision:number}|undefined;
        if((prior?.commitId??null)!==marker.parentCommitId||(prior?.revision??0)+1!==marker.revision)throw new Error('input_version_changed');
        io.commits++;io.records.set(marker.recordId,structuredClone(marker));io.records.set(JSON.stringify(['head',marker.sessionId]),
            {kind:'head',sessionId:marker.sessionId,commitId:marker.commitId,revision:marker.revision,markerKey:marker.recordId});
        io.records.set('report:'+marker.sessionId,projectCommittedReport(baseline,marker));
        if(io.fault==='unknown'){io.failReads=true;throw new Error('lost_ack');}
        if(io.fault==='lost_ack')throw new Error('lost_ack');
        return {marker,replay:false};
    },
}));
const db={get:async(store:string,key:string)=>{if(io.failReads)throw new Error('unavailable');return io.records.get(store==='reports'?'report:'+key:key);},
    getAllFromIndex:async(_store:string,index:string,key:string)=>{if(io.failReads)throw new Error('unavailable');return [...io.records.values()].filter(v=>(v as Record<string,unknown>).kind==='commit'&&(v as Record<string,unknown>)[index]===key);}} as unknown as StorageDatabase;
const wasm=newQuickJSWASMModuleFromVariant(variant);
const guest={running:false,run:vi.fn((code,inputJson,options)=>executeQuickJsGuest({generation:1,code,inputJson,limits:resolveGuestLimits(options.limits)},()=>wasm,options.onStarted)),cancel(){},dispose(){}};
const bind=vi.fn(async()=>({engine:'duckdb' as const,tableName:'accepted',loadVersion:'version',fallbackReason:null,fallbackStage:null}));
const persist=vi.fn(async(store:StoreApi)=>{const state=store.getState();io.records.set('report:'+state.sessionId,buildPersistedReportRecord(state,{id:state.sessionId,filename:'synthetic-commit.csv'}));return true;});
const deps={database:async()=>db,bind,persist};
const file=()=>new File(['Name,Amount\nTotal Solutions,0\n Detail ,-5\nSubtotal,-5\n'],'synthetic-commit.csv');
const setup=async(commit=true)=>{
    const f=await prepareCandidateCommitFixture({guest}),service=createCandidateCommitService(f.store,deps);
    const review=await service.review(f.candidate.candidateId,{primaryTable:'facts',idempotencyKey:'actions-recovery-intent'}),checkpoint=await service.recoveryCheckpoint(review);
    f.root.setState({candidateRecovery:checkpoint,chatHistory:[],queryHistory:[]});await persist(f.store);
    const outcome=commit?await service.commit(service.approve(review)):undefined;
    return {...f,service,review,checkpoint,marker:outcome?.marker??checkpoint.proposal};
};
const fresh=(f:Awaited<ReturnType<typeof setup>>,switchEpoch=false)=>{
    f.prep.task.close('blocked');finishRun(f.root,f.lease);if(switchEpoch)beginSessionTransition(f.root);
    const lease=beginRun(f.root,'follow_up',crypto.randomUUID()),store=scopeRunStore(f.root,lease);return {lease,store};
};
const finish=(f:Awaited<ReturnType<typeof setup>>,lease:ReturnType<typeof beginRun>)=>finishRun(f.root,lease);
describe('fresh host recovery, retention admission and append-only rollback',()=>{
    beforeEach(async()=>{await drainSessionPersistence();io.records.clear();io.commits=0;io.failReads=false;io.fault='';bind.mockClear();persist.mockClear();});
    it('resolves a durable commit before reconstruction and invalidates old query evidence',async()=>{
        const f=await setup(),next=fresh(f,true);try{
            f.root.setState({csvData:null,canonicalCsvData:null,activeDataQuery:{result:{rows:[{Amount:999}]}} as never});
            await restoreAcceptedDataset(next.store,{file:file(),guest},deps);
            expect(f.root.getState().csvData!.data).toHaveLength(2);expect(f.root.getState().datasetCommitBindingStatus).toBe('ready');
            expect(f.root.getState().activeDataQuery).toBeNull();expect(io.commits).toBe(1);expect(f.root.getState().candidateRecovery).toBeNull();
        }finally{finish(f,next.lease);f.cleanup();}
    });
    it('does not execute a worker when the journal read is uncertain',async()=>{
        const f=await setup(),next=fresh(f,true);try{
            io.failReads=true;const calls=guest.run.mock.calls.length;
            await expect(restoreAcceptedDataset(next.store,{file:file(),guest},deps)).rejects.toThrow('unavailable');
            expect(guest.run.mock.calls).toHaveLength(calls);expect(f.root.getState().datasetCommitBindingStatus).toBe('commit_unknown');
        }finally{io.failReads=false;finish(f,next.lease);f.cleanup();}
    });
    it.each(['stop','switch'] as const)('keeps a newer run unchanged after a deferred recovery binding and %s',async(mode)=>{
        const f=await setup(),next=fresh(f,true);let release!:()=>void,started!:()=>void;
        const gate=new Promise<void>(r=>release=r),began=new Promise<void>(r=>started=r);
        try{
            const running=restoreAcceptedDataset(next.store,{file:file(),guest},{...deps,bind:async()=>{started();await gate;return bind();}});await began;
            if(mode==='switch'){beginSessionTransition(f.root);f.root.setState({sessionId:'replacement'});}else{cancelOwnedRun(f.root);finish(f,next.lease);}
            const newer=beginRun(f.root,'follow_up','newer-recovery-run');f.root.setState({isBusy:true,streamingMessage:'new-stream'} as never);
            const before=JSON.stringify(f.root.getState());release();await expect(running).rejects.toThrow();
            expect(JSON.stringify(f.root.getState())).toBe(before);expect(f.root.getState().activeExecution?.runId).toBe(newer.runId);finish(f,newer);
        }finally{release();finish(f,next.lease);f.cleanup();}
    });
    it('revalidates interrupted approval with consumed counters and requires another fresh lease',async()=>{
        const f=await setup(false),next=fresh(f,true);try{
            const result=await recoverCandidateReview(next.store,{file:file(),guest},deps);expect(result.status).toBe('review');
            expect(f.root.getState().candidateRecovery!.task.budget.used.transformationAttempts).toBe(2);
            if(result.status!=='review')throw new Error('missing_review');
            await expect(commitRecoveredCandidate(next.store,result.review,deps)).rejects.toThrow('approval_invalid');
            finish(f,next.lease);const approved=fresh(f);
            const marker=await commitRecoveredCandidate(approved.store,result.review,deps);
            expect(marker.audit.runId).toBe(approved.lease.runId);expect(marker.approval.approvalId).not.toBe(f.marker.approval.approvalId);
            expect(marker.validation.runId).toBe(approved.lease.runId);expect(marker.validation.answerEvidence).toBe(false);
            expect(f.root.getState().csvData!.data).toHaveLength(2);expect(io.commits).toBe(1);finish(f,approved.lease);
        }finally{finish(f,next.lease);f.cleanup();}
    });
    it('blocks copied, stale and changed-policy recovered approvals',async()=>{
        const f=await setup(false),next=fresh(f,true);try{
            const result=await recoverCandidateReview(next.store,{file:file(),guest},deps);if(result.status!=='review')throw new Error('missing_review');
            finish(f,next.lease);const approved=fresh(f);
            await expect(commitRecoveredCandidate(approved.store,{...result.review},deps)).rejects.toThrow('approval_invalid');
            f.root.setState({settings:{...f.root.getState().settings,runtimeAccessControl:{...f.root.getState().settings.runtimeAccessControl,toolOverrides:{'data.mutate':'deny'}}}});
            await expect(commitRecoveredCandidate(approved.store,result.review,deps)).rejects.toThrow();expect(io.commits).toBe(0);finish(f,approved.lease);
        }finally{finish(f,next.lease);f.cleanup();}
    });
    it('rejects a recovered review when current inputs change before the fresh approval',async()=>{
        const f=await setup(false),next=fresh(f,true);try{
            const result=await recoverCandidateReview(next.store,{file:file(),guest},deps);if(result.status!=='review')throw new Error('missing_review');
            finish(f,next.lease);const approved=fresh(f),bundle=structuredClone(f.root.getState().datasetBundle!);
            bundle.tables[0].datasetVersion='changed-input-version';f.root.setState({datasetBundle:bundle});
            await expect(commitRecoveredCandidate(approved.store,result.review,deps)).rejects.toThrow('input_version_changed');
            expect(io.commits).toBe(0);finish(f,approved.lease);
        }finally{finish(f,next.lease);f.cleanup();}
    });
    it('does not replay an interrupted proposal when its commit already exists',async()=>{
        const f=await setup();f.root.setState({candidateRecovery:f.checkpoint});const next=fresh(f,true);try{
            // Simulate a stale outgoing snapshot after an acknowledgement was lost.
            io.records.delete('report:'+f.root.getState().sessionId);
            const result=await recoverCandidateReview(next.store,{file:file(),guest},deps);
            expect(result.status).toBe('already_committed');expect(io.commits).toBe(1);expect(f.root.getState().candidateRecovery).toBeNull();
        }finally{finish(f,next.lease);f.cleanup();}
    });
    it('reconciles a lost recovery-commit acknowledgement exactly once',async()=>{
        const f=await setup(false),next=fresh(f,true);try{
            const result=await recoverCandidateReview(next.store,{file:file(),guest},deps);if(result.status!=='review')throw new Error('missing_review');
            finish(f,next.lease);const approved=fresh(f);io.fault='lost_ack';
            await commitRecoveredCandidate(approved.store,result.review,deps);expect(io.commits).toBe(1);expect(f.root.getState().datasetCommitBindingStatus).toBe('ready');finish(f,approved.lease);
        }finally{io.fault='';finish(f,next.lease);f.cleanup();}
    });
    it('keeps an unknown recovery commit fenced and restores durable truth on a later explicit request',async()=>{
        const f=await setup(false),next=fresh(f,true);try{
            const result=await recoverCandidateReview(next.store,{file:file(),guest},deps);if(result.status!=='review')throw new Error('missing_review');
            finish(f,next.lease);const approved=fresh(f);io.fault='unknown';
            await expect(commitRecoveredCandidate(approved.store,result.review,deps)).rejects.toThrow('commit_outcome_unknown');
            expect(f.root.getState().datasetCommitBindingStatus).toBe('commit_unknown');expect(io.commits).toBe(1);finish(f,approved.lease);
            io.failReads=false;io.fault='';const recovery=fresh(f,true);await restoreAcceptedDataset(recovery.store,{file:file(),guest},deps);
            expect(io.commits).toBe(1);expect(f.root.getState().datasetCommitBindingStatus).toBe('ready');finish(f,recovery.lease);
        }finally{io.failReads=false;io.fault='';finish(f,next.lease);f.cleanup();}
    });
    it('does not execute recovery if its updated budget cannot be durably saved',async()=>{
        const f=await setup(false),next=fresh(f,true);try{
            const calls=guest.run.mock.calls.length;
            await expect(recoverCandidateReview(next.store,{file:file(),guest},{...deps,persist:async()=>false})).rejects.toThrow('recovery_checkpoint_unavailable');
            expect(guest.run.mock.calls).toHaveLength(calls);expect(io.commits).toBe(0);
        }finally{finish(f,next.lease);f.cleanup();}
    });
    it.each(['multi','stream'] as const)('reconstructs actual %s execution semantics and complete metadata',async(kind)=>{
        const f=await setup(false);f.prep.task.close('blocked');finishRun(f.root,f.lease);
        const next=await stageRecoveryQualificationCandidate(f.root,kind,guest);try{
            const s=createCandidateCommitService(next.store,deps),review=await s.review(next.candidate.candidateId,{primaryTable:'facts',idempotencyKey:'multi-stream-recovery'}),cp=await s.recoveryCheckpoint(review);
            const reconstructed=await reconstructDatasetCommit(next.store,cp.proposal,{file:file(),guest});
            expect(reconstructed.output.tables[0].rows).toHaveLength(2);expect(reconstructed.output.tables[0].rows[1].Amount).toBe(-5);
            if(kind==='multi'){expect(reconstructed.output.tables).toHaveLength(2);expect(cp.proposal.bundle.relationships[0].decision).toBe('trusted');}
            else expect(cp.proposal.replayManifest!.request.stream!.batchRows).toBe(1);
        }finally{next.prep.task.close('cancelled');finishRun(f.root,next.lease);f.cleanup();}
    });
    it('rolls back rows/schema/relationships by appending one accepted version and invalidating abandoned facts',async()=>{
        const f=await setup();f.prep.task.close('completed');finishRun(f.root,f.lease);
        const second=await stageRecoveryQualificationCandidate(f.root,'names',guest);try{
            const s=createCandidateCommitService(second.store,deps),r=await s.review(second.candidate.candidateId,{primaryTable:'names',idempotencyKey:'second-names-version'});
            await s.commit(s.approve(r));second.prep.task.close('completed');finishRun(f.root,second.lease);
            const next=fresh(f),targets=await listRollbackTargets(next.store,deps);expect(targets[0].commitId).toBe(f.marker.commitId);
            const review=await reviewDatasetRollback(next.store,targets[0],{file:file(),guest},deps);
            await expect(commitDatasetRollback(next.store,review,deps)).rejects.toThrow('approval_invalid');finish(f,next.lease);
            const approved=fresh(f);f.root.setState({activeDataQuery:{result:{rows:[{Name:'Wrong',Amount:999}]}}} as never);
            const marker=await commitDatasetRollback(approved.store,review,deps),duplicate=await commitDatasetRollback(approved.store,review,deps);
            expect(marker.commitId).toBe(duplicate.commitId);expect(marker.revision).toBe(3);expect(marker.parentCommitId).not.toBe(f.marker.commitId);
            expect(marker.rollbackTarget!.commitId).toBe(f.marker.commitId);expect(marker.bundle.tables[0].schema.map(c=>c.name)).toEqual(['Name','Amount']);
            expect(f.root.getState().activeDataQuery).toBeNull();expect(f.root.getState().csvData!.data[1]).toEqual({Name:'Detail',Amount:-5});expect(io.commits).toBe(3);finish(f,approved.lease);
        }finally{second.prep.task.close('cancelled');finishRun(f.root,second.lease);f.cleanup();}
    });
    it('requires source for metadata-only rollback and does not approve an unavailable target',async()=>{
        const f=await setup();f.prep.task.close('completed');finishRun(f.root,f.lease);
        const second=await stageRecoveryQualificationCandidate(f.root,'names',guest);try{
            const s=createCandidateCommitService(second.store,deps),r=await s.review(second.candidate.candidateId,{primaryTable:'names',idempotencyKey:'metadata-rollback'});
            await s.commit(s.approve(r));second.prep.task.close('completed');finishRun(f.root,second.lease);beginSessionTransition(f.root);
            const next=fresh(f),target={sessionId:f.marker.sessionId,commitId:f.marker.commitId,revision:f.marker.revision};
            await expect(reviewDatasetRollback(next.store,target,{},deps)).rejects.toThrow('recovery_source_unavailable');
            expect(io.commits).toBe(2);finish(f,next.lease);
        }finally{second.prep.task.close('cancelled');finishRun(f.root,second.lease);f.cleanup();}
    });
    it('rejects edited interrupted metadata before source access or execution',async()=>{
        const f=await setup(false),next=fresh(f,true);try{
            io.records.delete('report:'+f.root.getState().sessionId);
            const altered=structuredClone(f.checkpoint);altered.proposal.program.content='return 999;';const {digest:_digest,...body}=altered;altered.digest=await codeDigest(body);f.root.setState({candidateRecovery:altered});
            const calls=guest.run.mock.calls.length;
            await expect(recoverCandidateReview(next.store,{file:file(),guest},deps)).rejects.toThrow('recovery_metadata_mismatch');expect(guest.run.mock.calls).toHaveLength(calls);
        }finally{finish(f,next.lease);f.cleanup();}
    });
});
