import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

// Preparation can finish after this panel closes. A new mount may reuse the
// same host review, so only the latest UI consumer may revoke it on cleanup.
const reviewConsumers = new WeakMap<() => unknown, symbol>();

/** This panel dispatches human actions; a copied/persisted UI projection grants no authority. */
export const StructureRepairReviewPanel: React.FC = () => {
    const review = useAppStore(s => s.structureRepairReview);
    const intake = useAppStore(s => s.rawIntakeIr);
    const sessionId = useAppStore(s => s.sessionId);
    const sourceSha = useAppStore(s => s.datasetBundle?.source.inspection?.sha256);
    const intakeKey = JSON.stringify([intake?.columnCount, intake?.rawRows]);
    const prepare = useAppStore(s => s.prepareStructureRepairReview);
    const confirm = useAppStore(s => s.confirmStructureRepairMeaning);
    const resume = useAppStore(s => s.resumeStructureRepairDraft);
    const continueRepair = useAppStore(s => s.continueStructureRepairAnalysis);
    const cancel = useAppStore(s => s.cancelStructureRepairReview);
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);
    useEffect(() => {
        let active = true;
        let id: string | undefined;
        const consumer = Symbol('structure-review-consumer');
        if (prepare) reviewConsumers.set(prepare, consumer);
        const cancelOwnedReview = () => {
            if (!prepare || !id || reviewConsumers.get(prepare) !== consumer) return;
            cancel?.(id, true);
            reviewConsumers.delete(prepare);
        };
        setError('');
        void prepare?.().then(result => {
            id = result?.reviewId;
            if (!active) cancelOwnedReview();
        }).catch(() => { if (active) setError('Bound source review unavailable. Re-upload the original or corrected source; analysis remains blocked.'); });
        return () => { active = false; cancelOwnedReview(); };
    }, [prepare, cancel, intakeKey, sessionId, sourceSha]);
    const act = async (action: () => Promise<void>) => {
        if (pending) return;
        setPending(true); setError('');
        try { await action(); }
        catch { setError('Review is stale, cancelled or already used. Re-open review from the current source. No dataset was committed.'); }
        finally { setPending(false); }
    };
    if (!review && !error) return null;
    const current = review?.sessionId === sessionId && review?.sourceSha256 === sourceSha;
    const waiting = current && review?.status === 'awaiting_semantic_confirmation';
    return <section aria-label="Structural semantic confirmation" className="rounded-lg border border-accent-200 bg-accent-50 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-accent-950">Confirm business meaning — not Dataset Commit approval</h3>
        <p className="text-sm text-slate-700">This choice confirms only which repeated header group owns the expanded metric columns. Other fields, row grain, units and summary roles still require a separate complete meaning review.</p>
        <p className="text-sm text-slate-700">{current ? review?.message : 'Source/session changed. Re-open review to inspect the current source.'}</p>
        {error && <p role="alert" className="text-sm text-danger-800">{error}</p>}
        {current && review && <>
            <details className="text-xs break-all"><summary>Source binding</summary>
                <p>Raw bytes SHA-256 / source version: {review.sourceSha256}</p>
                <p>Session: {review.sessionId} / epoch {review.sessionEpoch}</p>
                <p>Candidate set: {review.candidateSetDigest}</p>
            </details>
            <div className="space-y-3">{review.choices.map(choice => {
                const c = choice.candidate;
                return <div key={choice.candidateDigest} className="rounded border border-accent-200 bg-white p-3 text-sm">
                    <p className="font-medium">Candidate {choice.label}: categories belong to header group at source columns {c.mainStartColumn + 1}–{c.mainStartColumn + c.groupCount}</p>
                    <p>Expanded data columns {c.mainStartColumn + 1}–{c.mainEndColumn}; {c.groupCount} groups × {c.groupWidth} categories. Header source rows {c.headerSourceRows.map(r => r + 1).join(', ')}.</p>
                    <details><summary className="cursor-pointer">Inspect mapping and source sample values ({choice.label})</summary>
                        <div className="overflow-auto max-h-56"><table className="text-xs w-full"><thead><tr><th>Data column</th><th>Header evidence (row:column)</th><th>Source samples (not validated)</th></tr></thead><tbody>
                            {c.mappings.map(m => <tr key={m.targetColumn}><td>{m.targetColumn + 1}{(m.targetColumn < c.mainStartColumn || m.targetColumn >= c.mainEndColumn) && <span className="block text-slate-500">Structural suggestion — not confirmed here</span>}</td><td>{m.headerPath.map(ref => `${intake?.rawRows[ref.rowIndex]?.[ref.columnIndex] ?? ''} [${ref.rowIndex + 1}:${ref.columnIndex + 1}]`).join(' → ')}</td><td>{intake?.rawRows.slice(c.bodySourceRows.start, Math.min(c.bodySourceRows.endExclusive, c.bodySourceRows.start + 3)).map(row => row[m.targetColumn]).join(' | ')}</td></tr>)}
                        </tbody></table></div>
                    </details>
                    <button disabled={!waiting || pending} onClick={() => void act(() => confirm(review.reviewId, choice.candidateDigest, { review, intakeSignature: intakeKey }))} className="mt-2 rounded bg-accent-600 px-3 py-2 text-white disabled:opacity-50">Choose {choice.label} — confirm meaning</button>
                </div>;
            })}</div>
            {review.status === 'repair_blocked' && <p role="alert" className="text-sm text-warning-900">Repair cannot safely resume in this session. There is no pending approval to click. Keep the source and diagnostic details; no automatic retry or budget reset will be performed.</p>}
            <div className="flex flex-wrap gap-2">
                <button disabled={!waiting || pending} onClick={() => void act(() => confirm(review.reviewId, 'neither', { review, intakeSignature: intakeKey }))} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50">Neither / Correct mapping</button>
                {review.status === 'confirmed' && <button disabled={pending} onClick={() => void act(() => resume(review.reviewId))} className="rounded bg-accent-600 px-3 py-2 text-sm text-white disabled:opacity-50">Resume read-only mapping draft</button>}
                {['confirmed', 'draft_uncommitted', 'repair_failed'].includes(review.status) && <button disabled={pending} onClick={() => void act(() => continueRepair(review.reviewId, { review, intakeSignature: intakeKey }))} className="rounded bg-accent-600 px-3 py-2 text-sm text-white disabled:opacity-50">Continue repair and validation</button>}
                {review.status !== 'repair_blocked' && <button disabled={pending && review.status !== 'continuing'} onClick={() => cancel(review.reviewId)} className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Cancel semantic review</button>}
            </div>
            {review.draft && <div aria-label="Read-only mapping draft" className="rounded border border-warning-300 bg-warning-50 p-3 text-sm">
                <h4 className="font-semibold">Draft / Uncommitted — not validated</h4>
                <p>{review.draft.totalSourceRows} structurally proposed source rows; showing {review.draft.rows.length}. No totals or business grain are asserted.</p>
                <div className="overflow-auto max-h-56"><table className="text-xs"><thead><tr><th>Source row</th>{review.draft.columns.map(c => <th key={c.targetColumn}>{c.headerPath.map(p => p.value).join(' → ')} [{c.targetColumn + 1}]</th>)}</tr></thead><tbody>
                    {review.draft.rows.map(row => <tr key={row.sourceRow}><td>{row.sourceRow + 1}</td>{row.cells.map((value, i) => <td key={i}>{value}</td>)}</tr>)}
                </tbody></table></div>
            </div>}
        </>}
        <p className="text-xs font-medium text-slate-700">{review?.status === 'repair_blocked' ? 'You may close this review. Its diagnostic state is preserved; reopening does not restart repair or approve a dataset.' : 'Header confirmation and preview do not approve a dataset. Continue repair for full validation, then review a separate exact Dataset Commit in Assistant.'}</p>
    </section>;
};
