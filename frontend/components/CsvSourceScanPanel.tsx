import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { cancelCsvSourceScan, resumeCsvSourceScan } from '../services/data/csvSourceScan';

/** Progress is a display projection; all actions use the private source/version host entry. */
export const CsvSourceScanPanel: React.FC = () => {
    const scan = useAppStore(state => state.csvSourceScan);
    const [details, setDetails] = useState(false);
    const [error, setError] = useState('');
    if (!scan) return null;
    const store = { getState: useAppStore.getState, setState: useAppStore.setState };
    const percent = scan.totalBytes ? Math.floor(100 * scan.bytesRead / scan.totalBytes) : 0;
    const label = {
        running: 'Scanning the whole original CSV locally',
        cancelled: 'Structural scan cancelled — incomplete, not verified',
        failed: 'Structural scan failed — not verified',
        completed_clean: 'Full-source parsing complete — no structural signal detected',
        completed_anomalies: 'Full-source parsing complete — structural evidence needs repair',
    }[scan.status];
    const act = async (resume: boolean) => {
        setError('');
        try {
            if (resume) await resumeCsvSourceScan(store, scan.scanId, scan.sourceVersion);
            else cancelCsvSourceScan(store, scan.scanId, scan.sourceVersion);
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Scan action is stale.'); }
    };
    return <section aria-label="Full-source CSV scan" className="my-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-left text-sm text-slate-900">
        <p role="status" className="font-semibold">{label}</p>
        <p className="mt-1">{scan.bytesRead.toLocaleString()} / {scan.totalBytes.toLocaleString()} bytes ({percent}%) · {scan.rows.toLocaleString()} logical records scanned</p>
        {scan.status === 'running' && <>
            <progress aria-label="Source bytes scanned" max={scan.totalBytes || 1} value={scan.bytesRead} className="mt-2 w-full" />
            <button onClick={() => void act(false)} className="mt-2 rounded bg-slate-700 px-3 py-2 text-white">Cancel structural scan</button>
        </>}
        {scan.status === 'cancelled' && <>
            <p>The original source and exact parser checkpoint remain in this tab. No clean result or commit approval was issued.</p>
            <button onClick={() => void act(true)} className="mt-2 rounded bg-blue-600 px-3 py-2 text-white">Resume structural scan</button>
        </>}
        {scan.status === 'failed' && <p>Recoverable limit: {scan.reason}. Re-select the original CSV after resolving its encoding or parser/resource limit. A reload does not restore scan authority.</p>}
        {scan.status === 'completed_anomalies' && <p className="mt-2">The whole source was inspected, not just a sample. Open scan details to locate the structural evidence, then correct the original CSV and re-import it. Repair and independent validation are still required; completing this scan does not mean repair succeeded. File size alone is not a reason for human review. Canonical publication remains blocked.</p>}
        {scan.status === 'completed_clean' && <p className="mt-2">All bytes parsed and hashed. Schema checks are bounded heuristics, not proof of unchanged structure or business meaning, a repaired candidate, or Dataset Commit approval.</p>}
        <button aria-expanded={details} onClick={() => setDetails(!details)} className="mt-2 font-medium text-blue-800 underline">{details ? 'Hide scan details' : 'Show scan details'}</button>
        {details && <div className="mt-2 break-all">
            <p>Parsing coverage: {scan.parsingCoverage}; schema coverage: {scan.schemaCoverage}; schema confidence: {scan.schemaConfidence}.</p>
            <p>Source version: {scan.sourceVersion}</p><p>SHA-256: {scan.sha256 ?? 'unverified'}</p>
            <p>Header hypothesis: logical row {scan.headerRow === null ? 'unknown' : scan.headerRow + 1}; width {scan.expectedWidth ?? 'unknown'}. This is not confirmed business meaning.</p>
            <p>{Object.entries(scan.counts).map(([kind, count]) => `${kind}: ${count}`).join(' · ') || 'No structural anomalies recorded.'}</p>
            <ul>{scan.examples.map((example, i) => <li key={i}>{example.kind}: logical row {example.row + 1}, physical lines {example.startLine}–{example.endLine}, bytes [{example.byteStart}, {example.byteEnd}), width {example.width}</li>)}</ul>
            {scan.examplesTruncated && <p>Evidence examples capped; counts and scan coverage include the whole source.</p>}
        </div>}
        {error && <p role="alert">{error}</p>}
    </section>;
};
