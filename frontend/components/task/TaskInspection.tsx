import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../../store/useAppStore';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { readTaskProgram } from '../../services/agent/runtime/pi/piTaskInspection';
import { inspectPiCandidateReview } from '../../services/agent/runtime/pi/piCandidateReviewState';
import { cancelOwnedRun } from '../../services/session/sessionOwnership';
import { useCandidateReview } from './useCandidateReview';
import { TaskExport } from './TaskExport';
import { CandidateDraft } from './CandidateDraft';

const control = 'min-h-[44px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50';
const pre = 'max-w-full whitespace-pre-wrap break-all rounded-md bg-slate-100 p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500';
const useInspection = () => useAppStore(s => ({ task: s.activeAgentTask, view: s.taskInspection, sessionId: s.sessionId,
    active: s.activeExecution, busy: s.isBusy, pending: s.pendingClarification, bundle: s.datasetBundle,
    bindingStatus: s.datasetCommitBindingStatus, checkpoint: s.candidateRecovery,
    respond: s.handleClarificationResponse, openWorkspace: s.setIsWorkspaceModalOpen }), shallow);

/** These are read-only projections. Buttons delegate to existing host cancellation/approval/recovery flows. */
export const TaskInspectionView: React.FC<{ onReturnToChat?: () => void; onOpenRecovery: () => void }> = ({ onReturnToChat, onOpenRecovery }) => {
    const { task, view, sessionId, active, busy, pending, bundle, bindingStatus, checkpoint, respond } = useInspection();
    const [section, setSection] = useState('Overview'), [selected, setSelected] = useState(''), [offset, setOffset] = useState(0);
    const [range, setRange] = useState<ReturnType<typeof readTaskProgram> | null>(null), [codeError, setCodeError] = useState('');
    const current = Boolean(task && view && task.sessionId === sessionId && view.sessionId === sessionId && task.taskId === view.taskId);
    const program = view?.programs.find(p => `${p.path}@${p.revision}` === selected) ?? view?.programs.at(-1);
    const review = useCandidateReview(pending) ?? { available: false, reason: 'Review is historical or unavailable. Start a fresh request or revalidate the interrupted candidate.' };
    useEffect(() => { setOffset(0); }, [selected, task?.taskId]);
    useEffect(() => {
        setRange(null); setCodeError('');
        if (section !== 'Code' || !current || !task || !program) return;
        try { setRange(readTaskProgram(useAppStore, task.taskId, program, offset)); }
        catch { setCodeError('Live revisioned source is unavailable. Saved files are historical; start a fresh task to execute.'); }
    }, [section, current, task?.taskId, program?.path, program?.revision, program?.sha256, offset]);
    if (!task || !current || !view) return <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm text-slate-700">
        <h3 className="font-semibold">No live task inspection</h3>
        <p className="mt-2">History and reload do not restore task authority, approvals or answer evidence. Start a fresh request to inspect a new task.</p>
        {(bundle?.acceptedCommit || checkpoint) && <button className={`${control} mt-3`} onClick={onOpenRecovery}>Open dataset recovery</button>}
    </div>;
    const candidate = view.candidate;
    return <div className="flex h-full min-h-0 min-w-0 flex-col" data-task-inspection="true">
        <nav aria-label="Task inspection sections" className="flex shrink-0 flex-wrap gap-1 border-b border-slate-200 bg-white p-2">
            {['Overview', 'Code', 'Observations', 'Review'].map(name => <button key={name} type="button" aria-pressed={section === name}
                className={`${control} ${section === name ? 'border-blue-600 bg-blue-50 font-semibold' : ''}`} onClick={() => setSection(name)}>{name}</button>)}
        </nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4" data-task-scroll="true">
            {section === 'Overview' && <section className="space-y-3 text-sm text-slate-700">
                <h3 className="font-semibold text-slate-900">Task diagnosis and scope</h3>
                <p className="whitespace-pre-wrap break-words">{task.goal}</p>
                <p role="status">Task status: <strong>{task.status.replaceAll('_', ' ')}</strong></p>
                {view.outcome && <p className="whitespace-pre-wrap break-words">Runtime outcome: {view.outcome}</p>}
                <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                    <dt>Task / revision</dt><dd className="break-all">{task.taskId} / {task.revision}</dd>
                    <dt>Run</dt><dd className="break-all">{view.runId}</dd>
                    <dt>Scope</dt><dd className="break-all">{task.scope.digest}</dd>
                    <dt>Committed version</dt><dd className="break-all">{bundle?.acceptedCommit ? `${bundle.acceptedCommit.revision} · ${bundle.datasetVersion}` : 'No committed version'}</dd>
                </dl>
                <h3 className="font-semibold text-slate-900">Execution profile</h3>
                <p className="break-words">Browser JavaScript · {view.runtime}. Whole-table / explicit stateful stream: up to 50,000 rows, 256 columns, 8 MiB complete input. Execution remains subject to current access policy.</p>
                <p>Shell, packages, general Python, guest network and stdio MCP are unavailable in this profile. Separately reviewed HTTP MCP tools run through the host connector and return observations with unverified upstream completeness. A file-backed preview cannot replace complete execution input.</p>
                {bindingStatus && bindingStatus !== 'ready' && <p role="status">Source / binding: {bindingStatus}. Restore or reattach verified rows before new facts.</p>}
                <h3 className="font-semibold text-slate-900">Task budget</h3>
                <p>{task.budget.pausedForUser ? 'Paused for user review; waiting time is not charged.' : 'Counters retained across revisions and resumes.'}</p>
                <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1">
                    {Object.entries(task.budget.limits).map(([dimension, limit]) => <React.Fragment key={dimension}><dt>{dimension === 'activeMs' ? 'Active milliseconds' : dimension}</dt><dd>{task.budget.used[dimension as keyof typeof task.budget.used]} / {limit}</dd></React.Fragment>)}
                </dl>
                <h3 className="font-semibold text-slate-900">Current admitted evidence</h3>
                {view.grounding ? <><p>Admission: {view.grounding.status}</p>
                    {[...view.grounding.queryIds, ...(view.grounding.computationIds ?? [])].map(id => <p key={id} className="break-all font-mono text-xs">{id}</p>)}
                    {view.grounding.reasons.map((reason, i) => <p className="break-words" key={i}>{reason}</p>)}</> : <p>No current admitted query or computation evidence. Historical observations are inspection references.</p>}
                <details><summary className="cursor-pointer py-2">Typed scope and required outputs</summary><pre className={pre}>{JSON.stringify({ answer: task.scope.answer, requiredOutputs: task.requiredOutputs, inputs: task.inputBindings }, null, 2)}</pre></details>
                <TaskExport key={task.taskId} taskId={task.taskId} />
            </section>}
            {section === 'Code' && <section className="space-y-3 text-sm text-slate-700">
                <h3 className="font-semibold text-slate-900">Revisioned task code</h3>
                <p>Source is read-only. Each range comes from its exact live task namespace and immutable revision.</p>
                {view.omittedPrograms > 0 && <p>{view.omittedPrograms} older program references omitted from this bounded view.</p>}
                {view.programs.length ? <><label className="block" htmlFor="task-program-revision">Program revision</label>
                    <select id="task-program-revision" className="min-h-[44px] w-full min-w-0 rounded border border-slate-300 p-2" value={program ? `${program.path}@${program.revision}` : ''} onChange={e => setSelected(e.target.value)}>
                        {view.programs.map(p => <option key={`${p.path}@${p.revision}`} value={`${p.path}@${p.revision}`}>{p.path} · revision {p.revision}</option>)}
                    </select>
                    <p className="break-all text-xs">SHA-256: {program?.sha256} · {program?.byteSize} bytes</p>
                    {codeError && <p role="status">{codeError}</p>}
                    {range && <><p>Characters {range.startOffset}–{range.endOffset}{range.complete ? ' · final range' : ' · partial range; continue to inspect'}</p>
                        <pre aria-label="Task code range" tabIndex={0} className={pre}>{range.content}</pre>
                        <div className="flex flex-wrap gap-2"><button className={control} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 3000))}>Previous code range</button>
                            <button className={control} disabled={range.complete} onClick={() => setOffset(range.endOffset)}>Next code range</button></div></>}
                </> : <p>No program was written for this task.</p>}
            </section>}
            {section === 'Observations' && <section className="space-y-3 text-sm text-slate-700">
                <h3 className="font-semibold text-slate-900">Actual tool observations</h3>
                <p>Bounded tool results and execution logs. Older run/revision observations remain informational; they do not authorize new facts.</p>
                {view.omittedObservations > 0 && <p>{view.omittedObservations} older observations omitted.</p>}
                {view.observations.length === 0 && <p>No tool observation yet.</p>}
                {view.observations.map(o => <article key={o.id} className="border-b border-slate-200 pb-3">
                    <h4 className="font-medium">{o.tool} · {o.status}</h4>
                    <p className="break-words whitespace-pre-wrap">{o.message}</p>
                    <p className="break-all text-xs">Revision {o.taskRevision} · run {o.runId}{o.jobId ? ` · execution ${o.jobId}` : ''}{o.durationMs !== undefined ? ` · ${o.durationMs} ms` : ''}</p>
                    {(o.stdout || o.stderr) && <pre tabIndex={0} aria-label={`${o.tool} execution logs`} className={`${pre} mt-2`}>{o.stdout ? `stdout:\n${o.stdout}\n` : ''}{o.stderr ? `stderr:\n${o.stderr}` : ''}</pre>}
                    {o.externalObservation && <><p className="break-all text-xs">MCP observation {o.externalObservation.receiptId} · {o.externalObservation.protocol} · generation {o.externalObservation.generation}</p>
                        <p className="text-xs">Untrusted remote output. Upstream selection, completeness and snapshot are unknown; this is not verified dataset evidence.</p>
                        <pre tabIndex={0} aria-label={`${o.tool} external observation`} className={`${pre} mt-2`}>{o.externalObservation.preview}</pre>
                        {o.externalObservation.previewTruncated && <p className="text-xs">Remote preview truncated.</p>}</>}
                    {o.truncated && <p className="text-xs">Observation truncated; it does not prove full output coverage.</p>}
                </article>)}
            </section>}
            {section === 'Review' && <section className="space-y-3 text-sm text-slate-700">
                <h3 className="font-semibold text-slate-900">Candidate review</h3>
                {view.candidateError && <p role="alert">Candidate unavailable: {view.candidateError}</p>}
                {candidate ? <>
                    <ol aria-label="Read-only candidate review status" className="grid grid-cols-1 gap-2 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
                        <li><span>1.</span> <span>Confirm Meaning</span></li><li><span>2.</span> <span>Independent Validation</span></li><li><span>3.</span> <span>Approve Dataset</span></li>
                    </ol>
                    <p>Current accepted dataset: {bundle?.acceptedCommit ? bundle.datasetVersion || bundle.acceptedCommit.commitId : 'none'}</p>
                    <p>Pending candidate: {candidate.candidateId}</p>
                    <p role="note">Review only. This view adds no action that can commit a dataset; the existing candidate approval gate remains authoritative.</p>
                    <p className="break-all text-xs">{candidate.candidateId} · task revision {candidate.taskRevision}</p>
                    <p className="break-all text-xs">Scope: {candidate.scopeDigest}</p><p className="break-all text-xs">Change: {candidate.changeDigest}</p>
                    <h4 className="font-medium">Host grain and scope requirements</h4><pre className={pre}>{candidate.requirements}</pre>
                    {(candidate.requirementsTruncated || !candidate.requirements || candidate.tables.some(table => !Array.isArray(table.columns) || table.columns.length === 0)) && <p role="status">Mapping unavailable or truncated.</p>}
                    {candidate.commitRestriction === 'candidate_multi_table_atomic_promotion_unavailable' && <p role="status">Multi-table Draft / Uncommitted. Atomic all-table promotion is unavailable; neither table can be accepted. Meaning selection is not exact Dataset Commit approval.</p>}
                    {candidate.tables.map(t => <p key={t.name} className="break-words">{t.name}: {t.rows} rows · {t.columns?.join(', ') || 'mapping unavailable'}</p>)}
                    <h4 className="font-medium">Structural diff</h4><p>This comparison is structural; independent validation supplies the semantic decision.</p><pre className={pre}>{candidate.diff}</pre>
                    {candidate.diffTruncated && <p>Diff preview truncated.</p>}
                    <h4 className="font-medium">Excluded rows: {candidate.excludedCount ?? 'unknown'}</h4>{candidate.exclusions.map((e, i) => <p key={i} className="break-words">{e}</p>)}
                    {candidate.excludedCount !== null && candidate.excludedCount !== undefined && candidate.excludedCount > candidate.exclusions.length && <p>Exclusions preview truncated.</p>}
                    <h4 className="font-medium">Independent validation</h4>
                    {candidate.validationError && <p role="alert">Validation unavailable: {candidate.validationError}</p>}
                    {!candidate.validationError && candidate.validation?.decision === 'validated' && candidate.validation.receiptDigest && candidate.tables.map(table =>
                        <CandidateDraft key={`${candidate.candidateId}:${candidate.validation!.receiptDigest}:${table.name}`} taskId={task.taskId} candidateId={candidate.candidateId} table={table.name} digest={candidate.validation!.receiptDigest!} />)}
                    {candidate.validation ? <><p>Decision: {candidate.validation.decision}</p><p className="break-words">{candidate.validation.reasons.join('; ') || 'No rejection reasons.'}</p>
                        <p className="break-words">{candidate.validation.checks.join('; ')}</p><pre className={pre}>{candidate.validation.reconciliation}</pre>
                        {candidate.validation.truncated && <p>Validation preview truncated.</p>}</> : <p>Independent validation is pending; staging cannot change accepted data.</p>}
                </> : <p>No current candidate snapshot. Historical metadata cannot be approved here.</p>}
                {review.review && <><p>Primary table: {review.review.primaryTable}</p><p>Expires: {new Date(review.review.expiresAt).toISOString()}</p>
                    {(review.review.acceptedDualGrain || review.review.acceptedStreamedDual) && <div role="note"><p>Exact approval publishes both tables together and retains their verified source and lineage locally. Meaning selection is not commit approval.</p>
                        {review.review.tables.map(t => <p key={t.name}>{t.name}: {t.rowCount} rows · key/grain: {review.review!.grains?.find(g => g.table === t.name)?.grain.join(', ')}</p>)}
                        {review.review.relationships?.map((r, i) => <p key={i}>{r.fromTable} ({r.fromKeys.join(', ')}) → {r.toTable} ({r.toKeys.join(', ')}): {r.cardinality}</p>)}
                        <p>Summary/excluded rows are evidence only, not additional facts. Joins are unsupported; query each grain separately.</p></div>}
                    {review.review.spill && <p>Approval retains {review.review.spill.rowCount} projected rows in immutable local storage ({review.review.spill.bytes} bytes). Host-declared source-record grain and units remain explicit assumptions. Draft reads never grant commit.</p>}
                    <details><summary className="cursor-pointer py-2">Exact approval identity</summary><pre className={pre}>{JSON.stringify(review.review, null, 2)}</pre></details></>}
                <p role="status">{review.reason}</p>
            </section>}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-white p-3" data-task-actions="true">
            {active && active.runId === view.runId && <button className={control} onClick={() => {
                if (useAppStore.getState().activeExecution?.runId === view.runId) cancelOwnedRun(useAppStore);
            }}>Stop task</button>}
            {section === 'Review' && review.available && pending && pending.options.map(option => <button key={option.value} className={control} disabled={busy}
                onClick={() => { if (inspectPiCandidateReview(useAppStore, pending).available) void respond(option); }}>{option.label}</button>)}
            {task.status === 'awaiting_clarification' && pending && onReturnToChat && <button className={control} onClick={onReturnToChat}>Reply in chat</button>}
            {(bundle?.acceptedCommit || checkpoint) && <button className={control} onClick={onOpenRecovery}>Open dataset recovery</button>}
            {task.status === 'awaiting_source' && !bundle?.acceptedCommit && <p className="text-sm">Reattach the exact source to continue.</p>}
        </footer>
    </div>;
};

const TaskInspectionDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const ref = useDialogAccessibility<HTMLDivElement>(true, onClose);
    const { openWorkspace } = useInspection();
    return createPortal(<div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={onClose}>
        <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="task-inspection-title" tabIndex={-1}
            className="flex h-[75dvh] max-h-[80dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:h-[80dvh] sm:max-w-4xl sm:rounded-xl" onClick={e => e.stopPropagation()}>
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-3">
                <h2 id="task-inspection-title" className="font-semibold text-slate-900">Task inspection</h2>
                <button className={control} data-dialog-initial-focus onClick={onClose} aria-label="Close task inspection">Close</button>
            </header>
            <TaskInspectionView onReturnToChat={onClose} onOpenRecovery={() => { onClose(); openWorkspace(true); }} />
        </div>
    </div>, document.body);
};

export const TaskInspectionEntry: React.FC = () => {
    const { task, sessionId, checkpoint, bundle } = useInspection();
    const [open, setOpen] = useState(false);
    useEffect(() => { setOpen(false); }, [sessionId, task?.taskId]);
    if ((!task || task.sessionId !== sessionId) && !checkpoint && !bundle?.acceptedCommit) return null;
    return <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-1">
        <p className="min-w-0 truncate text-xs text-slate-600">{task ? `Task · ${task.status.replaceAll('_', ' ')}` : 'Saved dataset · source recovery'}</p>
        <button className={control} aria-expanded={open} onClick={() => setOpen(true)}>Inspect task</button>
        {open && <TaskInspectionDialog onClose={() => setOpen(false)} />}
    </div>;
};
