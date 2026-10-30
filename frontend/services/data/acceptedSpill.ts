import { Hash } from 'fast-sha256';
import type { CsvData, CsvSourceMetadata } from '../../types';
import type { StoreApi } from '../agent/types';
import type { CandidateStagingPort } from './candidateStaging';
import type { SpillManifest } from './candidateSpill';
import { spillBytes, spillDigest, SPILL_LIMITS } from './candidateSpill';
import { spillRow, assertSpillMeaning, type SpillCandidateMeaning } from './spillCandidateValidation';
import { validateCodeRunRequest } from '../agent/execution/codeExecutionContract';
import type { DatasetCommitMarker } from '../../types/datasetCommit';
import { spillSchema } from './spillCandidateValidation';
import { sha256Bytes } from './sourceDigest';
import { codeDigest } from '../agent/execution/codeTableInputs';

/** Only fields changed by accepted publication; compensation must not restore task, UI, settings or ownership. */
export const acceptedPublicationSnapshot=(state:ReturnType<StoreApi['getState']>):Partial<ReturnType<StoreApi['getState']>>=>Object.fromEntries([
    'datasetBundle','csvData','canonicalCsvData','rawCsvData','candidateRecovery','datasetCommitBindingStatus','datasetSemanticSnapshot','semanticDatasetVersion',
    'semanticStatus','columnRegistry','columnProfiles','canonicalBuildMeta','activeMetricMappingValidation','activeSpreadsheetFilter','spreadsheetFilterFunction',
    'vectorStoreDocuments','pendingVectorMemoryDocs','vectorMemoryState','reportMemoryScope','duckDbSessionStatus',
].map(k=>[k,state[k as keyof typeof state]]));

export interface AcceptedSpillManifest {
    version: 1; kind: 'accepted-spill-csv'; generation: string; identityDigest: string;
    source: CsvSourceMetadata; structural: SpillManifest; meaning: SpillCandidateMeaning;
    candidateId: string; changeDigest: string; validationDigest: string; programDigest: string;
    sessionId: string; sessionEpoch: number; taskId: string; taskRevision: number;
    sourceBudget:import('../agent/execution/codeSourceRecordStream').SourceStreamBudget;
    rowCount: number; bytes: number; sha256: string; digest: string;
}
export interface AcceptedSpillDirectory {
    writeCsv(parts: AsyncIterable<string>, current: () => void): Promise<void>;
    seal(text: string, current: () => void): Promise<void>;
    manifest(): Promise<string>;
    file(): Promise<File>;
    remove(): Promise<void>;
}
export type AcceptedSpillStorage = (generation: string, create: boolean, current: () => void) => Promise<AcceptedSpillDirectory>;
const ROOT = 'csv-analysis-agent-accepted';
/** Explicit user Clear All only. Routine session, scratch and retention cleanup must never call this. */
export const clearAllAcceptedSpillData=async()=>{
    if(typeof navigator==='undefined'||!navigator.storage?.getDirectory)return true;
    const root=await navigator.storage.getDirectory();
    try{await root.removeEntry(ROOT,{recursive:true});return true;}
    catch(e){if(e instanceof DOMException&&e.name==='NotFoundError')return true;throw e;}
};
/** Deliberately outside temporary session cleanup. Only the allocating attempt may remove its new generation. */
export const openAcceptedSpill: AcceptedSpillStorage = async (generation, create, current) => {
    if (!/^[a-f0-9-]{36}$/.test(generation)) throw new Error('accepted_generation_invalid');
    current();
    if (!navigator.storage?.getDirectory) throw new Error('accepted_storage_unavailable');
    const root = await navigator.storage.getDirectory(); current();
    const app = await root.getDirectoryHandle(ROOT, {create}); current();
    if (create) {
        try { await app.getDirectoryHandle(generation); throw new Error('accepted_generation_conflict'); }
        catch (e) { if (!(e instanceof DOMException) || e.name !== 'NotFoundError') throw e; }
    }
    const directory = await app.getDirectoryHandle(generation, {create});
    const remove = () => app.removeEntry(generation, {recursive:true});
    try { current(); } catch (e) { if(create) await remove().catch(()=>{}); throw e; }
    const write = async (name:string, parts:AsyncIterable<string>, fence:()=>void) => {
        fence();
        try { await directory.getFileHandle(name); throw new Error('accepted_generation_conflict'); }
        catch(e) { if (!(e instanceof DOMException) || e.name !== 'NotFoundError') throw e; }
        fence(); const handle = await directory.getFileHandle(name,{create:true}); fence();
        const writer = await handle.createWritable();
        try { for await(const part of parts) { fence(); await writer.write(part); fence(); } await writer.close(); fence(); }
        catch(e) { await writer.abort().catch(()=>{}); throw e; }
    };
    return {
        writeCsv: (parts,fence)=>write('data.csv',parts,fence),
        seal: (text,fence)=>write('manifest.json',(async function*(){yield text;})(),fence),
        manifest: async()=>{const file=await (await directory.getFileHandle('manifest.json')).getFile();if(file.size>256*1024)throw new Error('accepted_manifest_capacity');return file.text();},
        file: async()=> (await directory.getFileHandle('data.csv')).getFile(),remove,
    };
};
const hex = (bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const quote = (value:string)=>`"${value.replace(/"/g,'""')}"`;
// spillRow already verifies exact base-10 minor-unit round-trip. toFixed would round the
// underlying binary float again (90071992547409.9 -> .91), changing approved cents.
const decimalText = (value:number,scale:number) => {
    const [whole,fraction='']=String(value).split('.');
    return whole+(scale?'.'+fraction.padEnd(scale,'0'):'');
};
export type SpillReadCustody = ReturnType<CandidateStagingPort['captureSpillRead']>;
/** One authenticated chunk and one CSV row live at a time. Never creates a full rows/string/byte clone. */
async function* projectedCsv(custody:SpillReadCustody,store:StoreApi,current:()=>void) {
    const c=custody.candidate,spill=c.spill!,end=c.tables[0].rowCount+1;
    let buffer=spill.meaning.columns.map(col=>quote(col.name)).join(',')+'\n',bufferBytes=spillBytes(buffer);
    for(let i=0;i<spill.manifest.chunks;i++){
        const chunk=await custody.readChunk(i,store,current);current();
        for(const raw of chunk.rows){
            if(raw.sourceRow===0||raw.sourceRow>=end)continue;
            const row=spillRow(spill.meaning,raw.cells);
            const text=spill.meaning.columns.map(col=>col.conversion==='decimal'
                ? decimalText(row[col.name] as number,col.scale!) : quote(String(row[col.name]))).join(',')+'\n';
            const size=spillBytes(text);if(size>SPILL_LIMITS.chunkBytes)throw new Error('accepted_row_capacity');
            if(bufferBytes+size>SPILL_LIMITS.chunkBytes){yield buffer;buffer='';bufferBytes=0;}
            buffer+=text;bufferBytes+=size;
        }
    }
    if(buffer)yield buffer;
    current();
}
export const planAcceptedSpill = async(custody:SpillReadCustody,store:StoreApi,current:()=>void):Promise<AcceptedSpillManifest>=>{
    const c=custody.candidate,receipt=custody.receipt,hash=new Hash();let bytes=0;
    for await(const text of projectedCsv(custody,store,current)){const part=new TextEncoder().encode(text);hash.update(part);bytes+=part.length;if(bytes>SPILL_LIMITS.totalBytes)throw new Error('accepted_capacity');}
    const identityDigest=await codeDigest({source:store.getState().datasetBundle!.source.inspection,inputBindings:c.inputBindings,
        program:c.execution.program,environment:c.execution.environmentDigest,grant:c.execution.grant,task:c.requestedChange,
        candidateId:c.candidateId,changeDigest:c.changeDigest,receipt:receipt.receiptDigest,spill:c.spill});current();
    const body={version:1 as const,kind:'accepted-spill-csv' as const,generation:crypto.randomUUID(),identityDigest,
        source:structuredClone(store.getState().datasetBundle!.source.inspection!),structural:c.spill!.manifest,meaning:{
            ...c.spill!.meaning,columns:c.spill!.meaning.columns.map(col=>col.conversion==='decimal'
                ? {...col,provenance:col.provenance??'confirmed',source:col.source??'user'} : {...col})},
        candidateId:c.candidateId,changeDigest:c.changeDigest,validationDigest:receipt.receiptDigest,programDigest:receipt.programDigest,
        sessionId:c.sessionId,sessionEpoch:c.sessionEpoch,taskId:c.taskId,taskRevision:c.taskRevision,
        sourceBudget:custody.budget(),rowCount:c.tables[0].rowCount,bytes,sha256:hex(hash.digest())};
    const result={...body,digest:await codeDigest(body)};current();return result;
};
export const writeAcceptedSpill = async(manifest:AcceptedSpillManifest,custody:SpillReadCustody,store:StoreApi,current:()=>void,storage:AcceptedSpillStorage=openAcceptedSpill)=>{
    current();const directory=await storage(manifest.generation,true,current);
    try {
        const hash=new Hash();let bytes=0;
        await directory.writeCsv((async function*(){for await(const text of projectedCsv(custody,store,current)){
            const part=new TextEncoder().encode(text);hash.update(part);bytes+=part.length;
            if(bytes>manifest.bytes)throw new Error('accepted_content_mismatch');yield text;
        }})(),current);current();
        if(bytes!==manifest.bytes||hex(hash.digest())!==manifest.sha256)throw new Error('accepted_content_mismatch');
        await directory.seal(JSON.stringify(manifest),current);current();
        const file=await verifyAcceptedSpill(manifest,current,storage);current();
        return {file,remove:directory.remove};
    }catch(e){await directory.remove().catch(()=>{});throw e;}
};
/** Persisted metadata is only a locator: every activation/recovery rehashes bounded native File slices. */
export const verifyAcceptedSpill = async(manifest:AcceptedSpillManifest,current:()=>void,storage:AcceptedSpillStorage=openAcceptedSpill):Promise<File>=>{
    current();const {digest,...body}=manifest;
    assertSpillMeaning(manifest.meaning);
    if(manifest.version!==1||manifest.kind!=='accepted-spill-csv'||await codeDigest(body)!==digest
        ||!Number.isSafeInteger(manifest.bytes)||manifest.bytes<1||manifest.bytes>SPILL_LIMITS.totalBytes
        ||manifest.rowCount!==manifest.structural.sourceRows-1-(manifest.meaning.summary==='last_record_sum'?1:0))throw new Error('accepted_manifest_invalid');
    current();const directory=await storage(manifest.generation,false,current),text=await directory.manifest();current();
    if(spillBytes(text)>256*1024||await spillDigest(text)!==await spillDigest(JSON.stringify(manifest)))throw new Error('accepted_manifest_corrupt');
    current();const file=await directory.file();current();
    if(file.size!==manifest.bytes)throw new Error('accepted_content_mismatch');
    const hash=new Hash();
    for(let offset=0;offset<file.size;offset+=65536){current();const bytes=new Uint8Array(await file.slice(offset,offset+65536).arrayBuffer());current();hash.update(bytes);}
    if(hex(hash.digest())!==manifest.sha256)throw new Error('accepted_content_mismatch');current();return file;
};
export const verifyAcceptedSpillMarker=async(marker:DatasetCommitMarker,proposal=false)=>{
    const m=marker.acceptedSpill,v=marker.validation,{receiptDigest,...receipt}=v;
    const request=marker.spillRunRequest;
    if(!m||!request||!validateCodeRunRequest(request)||request.mode!=='source_records'||!request.sourceRecords
        ||request.program.sha256!==marker.program.sha256||request.program.revision!==marker.program.revision||request.program.path!==marker.program.path
        ||request.sourceRecords.sourceId!==m.source.sourceId||request.sourceRecords.sha256!==m.source.sha256||request.sourceRecords.width!==m.meaning.columns.length
        ||request.inputs.length||request.tables?.length||request.sources?.length
        ||marker.activationFailed||marker.rowStorage!=='durable_spill'||m.candidateId!==marker.candidateId
        ||m.changeDigest!==marker.changeDigest||m.validationDigest!==receiptDigest||await codeDigest(receipt)!==receiptDigest
        ||v.decision!=='validated'||v.changeDigest!==m.changeDigest||v.programDigest!==m.programDigest
        ||marker.program.sha256!==m.programDigest||await sha256Bytes(new TextEncoder().encode(marker.program.content))!==m.programDigest
        ||await codeDigest(marker.environment)!==v.environmentDigest||marker.sessionId!==m.sessionId||marker.audit.taskId!==m.taskId
        ||marker.audit.taskRevision!==m.taskRevision||marker.audit.sessionEpoch!==m.sessionEpoch
        ||JSON.stringify(marker.bundle.source.inspection)!==JSON.stringify(m.source)
        ||marker.bundle.datasetVersion!==`accepted-${m.digest}`||marker.bundle.tables.length!==1
        ||marker.bundle.tables[0].rowCount!==m.rowCount||JSON.stringify(marker.bundle.tables[0].schema)!==JSON.stringify(spillSchema(m.meaning))
        ||!proposal&&(!marker.approval.approvalId||marker.approval.approvedAt<=0||marker.approval.consumedAt<marker.approval.approvedAt
        ||marker.approval.consumedAt>=marker.approval.expiresAt))throw new Error('accepted_marker_mismatch');
    return m;
};
export const acceptedSpillCsv = (m:AcceptedSpillManifest,preview:CsvData['data']=[]):CsvData=>({fileName:m.source.fileName,data:preview,
    backing:{mode:'duckdb_file',rowCount:m.rowCount,sampleRowCount:preview.length,loadVersion:`accepted-${m.digest}`,datasetVersion:`accepted-${m.digest}`,
        readOnly:true,ephemeral:false,columnNames:m.meaning.columns.map(c=>c.name),
        exactDecimalColumns:m.meaning.columns.filter(c=>c.conversion==='decimal').map(c=>({name:c.name,scale:c.scale!,unit:c.unit!,provenance:c.provenance??'confirmed',source:c.source??'user'})),opfsPath:`${ROOT}/${m.generation}/data.csv`,byteSize:m.bytes}});
