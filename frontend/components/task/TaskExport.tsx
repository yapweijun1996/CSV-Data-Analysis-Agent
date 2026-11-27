import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { buildTaskExport, inspectTaskExport } from '../../services/agent/runtime/pi/piTaskExports';

export const TaskExport: React.FC<{ taskId: string }> = ({ taskId }) => {
    const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    // Subscribe to task/ownership projections; private custody is rechecked at each click and after awaits.
    useAppStore(s => s.activeExecution); useAppStore(s => s.taskInspection);
    const admission = inspectTaskExport(useAppStore, taskId);
    const download = async () => {
        setBusy(true); setMessage('');
        try {
            const result = await buildTaskExport(useAppStore, taskId);
            if (!inspectTaskExport(useAppStore, taskId).available) throw new Error('task_export_custody_replaced');
            const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes).buffer], { type: 'application/zip' }));
            try {
                const link = document.createElement('a'); link.href = url; link.download = result.fileName; link.click();
                setMessage('Download requested. Inspect manifest.json and reconcile outputs; file existence does not certify facts.');
            } finally { URL.revokeObjectURL(url); }
        } catch (error) { setMessage(error instanceof Error ? error.message.replaceAll('_', ' ') : 'Task export unavailable.'); }
        finally { setBusy(false); }
    };
    return <section className="space-y-2 border-t border-slate-200 pt-3">
        <h3 className="font-semibold text-slate-900">Inspectable outputs</h3>
        <p>ZIP includes actual output bytes, executed program/environment, input coverage, evidence references and SHA-256 manifest. Unvalidated artifacts remain unvalidated.</p>
        <p className="text-xs">No automatic persistence. Live custody ends on task/session replacement, reload or seven-day expiry. Downloads are user-managed; local row retention remains a separate explicit action.</p>
        <button className="min-h-[44px] rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-accent-500 disabled:opacity-50"
            disabled={busy || !admission.available} onClick={() => void download()}>Export task bundle</button>
        <p role="status" className="break-words">{message || admission.reason.replaceAll('_', ' ')}</p>
    </section>;
};
