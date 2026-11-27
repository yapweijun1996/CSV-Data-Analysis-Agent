import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { CsvSourceScanPanel } from '../CsvSourceScanPanel';

/** Local semantic inspection must remain reachable even when cloud analysis is declined. */
export const StructureRepairEntry: React.FC = () => {
    const intake = useAppStore(s => s.rawIntakeIr);
    const review = useAppStore(s => s.structureRepairReview);
    const reason = useAppStore(s => s.pipelineOutcome?.reasonCode);
    const open = useAppStore(s => s.setIsReportBoundaryConfirmModalOpen);
    const busy = useAppStore(s => s.isBusy);
    if (!intake || (!intake.diagnostics?.headerShapeDrift && reason !== 'header_shape_drift' && !review)) return <CsvSourceScanPanel />;
    return <><CsvSourceScanPanel /><section className="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm" aria-label="Structural repair review">
        <p className="font-medium text-warning-950">Header alignment needs review. Formal analysis remains blocked.</p>
        <p className="mt-1 text-slate-700">Compare source-bound interpretations locally. Confirming meaning prepares only a read-only mapping draft, not a committed dataset.</p>
        <button disabled={busy} onClick={() => open(true)} className="mt-3 rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">Review structural interpretations</button>
    </section></>;
};
