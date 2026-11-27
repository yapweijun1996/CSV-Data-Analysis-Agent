import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Agent } from '@earendil-works/pi-agent-core';
import { useAppStore } from '../../store/useAppStore';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

interface PiBrowserLabProps {
    onClose: () => void;
}

export const PiBrowserLab: React.FC<PiBrowserLabProps> = ({ onClose }) => {
    const dataset = useAppStore(state => state.canonicalCsvData ?? state.csvData);
    const datasetId = useAppStore(state => state.currentDatasetId);
    const [question, setQuestion] = useState('What is the total for the first numeric column?');
    const [answer, setAnswer] = useState('');
    const [error, setError] = useState('');
    const [events, setEvents] = useState<string[]>([]);
    const [running, setRunning] = useState(false);
    const agentRef = useRef<Agent | null>(null);
    const guestController = useRef<AbortController | null>(null);
    const [guestRunning, setGuestRunning] = useState(false);
    const [guestResult, setGuestResult] = useState('');
    const dialogRef = useDialogAccessibility<HTMLDivElement>(true, onClose, {
        restoreFocusSelector: '[data-pi-browser-lab-trigger="true"]',
    });

    useEffect(() => {
        setAnswer('');
        setEvents([]);
        setError('');
        agentRef.current?.abort();
        guestController.current?.abort();
        guestController.current = null;
        setGuestRunning(false);
        setGuestResult('');
    }, [datasetId]);

    useEffect(() => () => { agentRef.current?.abort(); guestController.current?.abort(); }, []);

    const runGuestChecks = async (mode: 'guest' | 'adapter' | 'coding' | 'sql' | 'table' | 'preparation' | 'candidate' | 'validation' | 'meaning' | 'commit' | 'approval' | 'recovery' | 'admission' | 'skills' | 'lifecycle' | 'capacity' = 'guest') => {
        if (running || guestRunning) return;
        const controller = new AbortController();
        guestController.current = controller;
        setGuestRunning(true); setGuestResult('');
        try {
            if (mode === 'capacity') {
                const { qualifyCodeCapacity } = await import('../../services/agent/execution/codeCapacityQualification');
                if (controller.signal.aborted) return;
                const result = await qualifyCodeCapacity(controller.signal, observation => {
                    if (!controller.signal.aborted && guestController.current === controller)
                        setGuestResult(previous => `${previous}${observation.id}: ${observation.passed ? 'pass' : 'FAIL'} (${observation.elapsedMs} ms; heartbeat ${observation.maxHeartbeatGapMs} ms)\n`);
                });
                if (guestController.current === controller) setGuestResult(previous => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.`
                    : `${previous}${result.passed ? 'Local capacity checks passed.' : 'Local capacity checks incomplete or failed.'} Browser observations only; machine limits and physical worker closure need external qualification.`);
            } else if (mode === 'lifecycle') {
                const {qualifyPiLifecycle} = await import('../../services/agent/runtime/pi/piLifecycleQualification');
                if(controller.signal.aborted)return;
                const result = await qualifyPiLifecycle(controller.signal, group => {
                    if(!controller.signal.aborted && guestController.current === controller)
                        setGuestResult(previous => `${previous}${group.group}: ${group.passed ? 'pass' : 'FAIL'} (${group.cases.length} cases)\n`);
                });
                if(guestController.current === controller)setGuestResult(previous => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.`
                    : `${previous}${result.passed ? 'Browser lifecycle checks passed.' : 'Browser lifecycle checks incomplete or failed.'} HTTP MCP/deferred coordination need separate evidence; full profile and live-model autonomy are not evaluated.`);
            } else if (mode === 'skills') {
                const {qualifySkills}=await import('../../services/agent/skills/skillQualification');
                if(controller.signal.aborted)return;
                const result=await qualifySkills(controller.signal,observation=>{
                    if(!controller.signal.aborted&&guestController.current===controller)setGuestResult(previous=>`${previous}${observation.id}: ${observation.passed?'pass':'FAIL'}\n`);
                });
                if(guestController.current===controller)setGuestResult(previous=>controller.signal.aborted?`${previous}Checks cancelled. Results are incomplete.`
                    :`${previous}${result.passed?'Pinned skill checks passed.':'Pinned skill checks incomplete or failed.'} Local scripted provider and controlled JavaScript; live-model autonomy and full profile are not evaluated.`);
            } else if (mode === 'admission') {
                const {qualifyEvidenceAdmission}=await import('../../services/agent/execution/evidenceAdmissionQualification');
                if(controller.signal.aborted)return;
                const result=await qualifyEvidenceAdmission(controller.signal,observation=>{
                    if(controller.signal.aborted||guestController.current!==controller)return;
                    setGuestResult(previous=>`${previous}${observation.id}: ${observation.passed?'pass':'FAIL'}\n`);
                });
                if(guestController.current===controller)setGuestResult(previous=>controller.signal.aborted?`${previous}Checks cancelled. Results are incomplete.`
                    :`${previous}${result.status==='passed'?'Evidence admission checks passed.':'Evidence admission checks failed.'} Local synthetic host checks; model autonomy is not evaluated.`);
            } else if (mode === 'recovery') {
                const {qualifyDatasetRecovery}=await import('../../services/data/datasetRecoveryQualification');
                if(controller.signal.aborted)return;
                const result=await qualifyDatasetRecovery(controller.signal,observation=>{
                    if(controller.signal.aborted||guestController.current!==controller)return;
                    setGuestResult(previous=>`${previous}${observation.id}: ${observation.passed?'pass':'FAIL'}\n`);
                });
                if(guestController.current===controller)setGuestResult(previous=>controller.signal.aborted?`${previous}Checks cancelled. Results are incomplete.`
                    :`${previous}${result.passed?'Recovery, retention and rollback checks passed.':'Recovery checks incomplete or failed.'} Local synthetic checks; other platforms and model autonomy are not evaluated.`);
            } else if (mode === 'approval') {
                const {qualifyPiCandidateApproval}=await import('../../services/agent/runtime/pi/piCandidateApprovalQualification');
                if(controller.signal.aborted)return;
                const result=await qualifyPiCandidateApproval(controller.signal,observation=>{
                    if(controller.signal.aborted||guestController.current!==controller)return;
                    setGuestResult(previous=>`${previous}${observation.id}: ${observation.passed?'pass':'FAIL'}\n`);
                });
                if(guestController.current===controller)setGuestResult(previous=>controller.signal.aborted?`${previous}Checks cancelled. Results are incomplete.`
                    :`${previous}${result.passed?'Fresh lease approval checks passed.':'Fresh lease approval checks incomplete or failed.'} Synthetic host checks; durable row recovery and model autonomy are not evaluated.`);
            } else if (mode === 'commit') {
                const { qualifyCandidateCommit } = await import('../../services/data/candidateCommitQualification');
                if (controller.signal.aborted) return;
                const result = await qualifyCandidateCommit(controller.signal, observation => {
                    if (controller.signal.aborted || guestController.current !== controller) return;
                    setGuestResult(previous => `${previous}${observation.id}: ${observation.passed ? 'pass' : 'FAIL'}\n`);
                });
                if (guestController.current === controller) setGuestResult(previous => controller.signal.aborted ? `${previous}Checks cancelled. Results are incomplete.`
                    : `${previous}${result.passed ? 'Atomic commit checks passed.' : 'Atomic commit checks incomplete or failed.'} Durable row recovery remains pending.`);
            } else if (mode === 'meaning') {
                const {qualifyInferredMeaning}=await import('../../services/data/inferredMeaningQualification');
                if(controller.signal.aborted)return;
                const result=await qualifyInferredMeaning(controller.signal,observation=>{
                    if(!controller.signal.aborted&&guestController.current===controller)setGuestResult(previous=>`${previous}${observation.id}: ${observation.passed?'pass':'fail'}\n`);
                });
                if(guestController.current===controller)setGuestResult(previous=>`${previous}${result.passed?'Automatic meaning checks passed.':'Automatic meaning checks incomplete or failed.'} AI interpretation is an assumption; host checks source equivalence. Initial production cutover remains pending.`);
            } else if (mode === 'validation') {
                const { qualifyCandidateValidation } = await import('../../services/data/candidateValidationQualification');
                if (controller.signal.aborted) return;
                const result = await qualifyCandidateValidation(controller.signal, observation => {
                    if (guestController.current === controller) setGuestResult(previous => `${previous}${observation.id}: ${observation.passed ? 'pass' : 'fail'}\n`);
                });
                if (guestController.current === controller) setGuestResult(previous => controller.signal.aborted
                    ? `${previous}Checks cancelled. Results are incomplete.`
                    : `${previous}${result.passed ? 'Independent validation checks passed.' : 'Independent validation checks incomplete or failed.'} Exact approval and commit remain pending.`);
            } else if (mode === 'candidate') {
                const { qualifyCandidateStaging } = await import('../../services/data/candidateStagingQualification');
                if (controller.signal.aborted) return;
                const result = await qualifyCandidateStaging(controller.signal, observation => {
                    if (guestController.current === controller) setGuestResult(previous => `${previous}${observation.id}: ${observation.passed ? 'pass' : 'fail'}\n`);
                });
                if (guestController.current === controller) setGuestResult(previous => controller.signal.aborted
                    ? `${previous}Checks cancelled. Results are incomplete.`
                    : `${previous}${result.passed ? 'Candidate staging checks passed.' : 'Candidate staging checks incomplete or failed.'} Independent validation and commit remain pending.`);
            } else if (mode === 'preparation') {
                const { qualifyPiExecutorPreparation } = await import('../../services/agent/runtime/pi/piExecutorPreparationQualification');
                if (controller.signal.aborted) return;
                const result = await qualifyPiExecutorPreparation(controller.signal, observation => {
                    if (guestController.current === controller) setGuestResult(previous => `${previous}${observation.id}: ${observation.passed ? 'pass' : 'fail'}\n`);
                });
                if (guestController.current === controller) setGuestResult(previous => controller.signal.aborted
                    ? `${previous}Checks cancelled. Results are incomplete.`
                    : `${previous}${result.passed ? 'Shared preparation checks passed.' : 'Shared preparation checks incomplete or failed.'} Initial coding remains disabled in production.`);
            } else if (mode === 'table') {
                const { qualifyCodeTableExecution } = await import('../../services/agent/execution/codeTableExecutionQualification');
                if (controller.signal.aborted) return;
                const result = await qualifyCodeTableExecution(controller.signal, observation => {
                    if (guestController.current === controller) setGuestResult(previous => `${previous}${observation.id}: ${observation.passed ? 'pass' : 'fail'}\n`);
                });
                if (guestController.current === controller) setGuestResult(previous => controller.signal.aborted
                    ? `${previous}Checks cancelled. Results are incomplete.`
                    : `${previous}${result.passed ? 'Full-table checks passed.' : 'Full-table checks incomplete or failed.'} Scripted provider; data publication and model autonomy are not evaluated.`);
            } else if (mode === 'sql') {
                const { qualifySqlWorker } = await import('../../services/duckdb/sqlQualification');
                if (controller.signal.aborted) return;
                const result = await qualifySqlWorker(controller.signal, observation => {
                    if (guestController.current === controller) setGuestResult(previous => `${previous}${observation.id}: ${observation.passed ? 'pass' : 'fail'}\n`);
                });
                if (guestController.current === controller) setGuestResult(previous => controller.signal.aborted
                    ? `${previous}Checks cancelled. Results are incomplete.`
                    : `${previous}${result.passed ? 'Local SQL checks passed.' : 'SQL checks incomplete or failed.'}`);
            } else if (mode === 'coding') {
                const { qualifyPiCodingLoop } = await import('../../services/agent/runtime/pi/piCodingLoopQualification');
                if (controller.signal.aborted) return;
                const result = await qualifyPiCodingLoop(controller.signal, observation => {
                    if (guestController.current === controller) setGuestResult(previous => `${previous}${observation.id}: ${observation.passed ? 'pass' : 'fail'} (${observation.status})\n`);
                });
                if (guestController.current === controller) setGuestResult(previous => controller.signal.aborted
                    ? `${previous}Checks cancelled. Results are incomplete.`
                    : `${previous}${result.passed ? 'Pi coding checks passed.' : 'Pi coding checks incomplete or failed.'} Scripted provider; model autonomy is not evaluated.`);
            } else if (mode === 'adapter') {
                const { qualifyCodeExecutionAdapter } = await import('../../services/agent/execution/codeExecutionQualification');
                if (controller.signal.aborted) return;
                const result = await qualifyCodeExecutionAdapter(controller.signal, observation => {
                    if (guestController.current === controller) setGuestResult(previous => `${previous}${observation.id}: ${observation.passed ? 'pass' : 'fail'} (${observation.receipt?.status})\n`);
                });
                if (guestController.current === controller) setGuestResult(previous => `${previous}${result.passed ? 'Adapter checks passed.' : 'Adapter checks incomplete or failed.'}`);
            } else {
                const { qualifyJavaScriptGuest } = await import('../../services/sandbox/javascriptGuestQualification');
                if (controller.signal.aborted) return;
                const result = await qualifyJavaScriptGuest(useAppStore, controller.signal, observation => {
                    if (guestController.current === controller) setGuestResult(previous => `${previous}${observation.id}: ${observation.passed ? 'pass' : 'fail'} (${observation.status})\n`);
                });
                if (guestController.current === controller) setGuestResult(previous => `${previous}${result.passed ? 'Local checks passed.' : 'Checks incomplete or failed.'}`);
            }
        } catch {
            if (guestController.current === controller) setGuestResult(controller.signal.aborted ? 'Checks cancelled. Results are incomplete.' : 'Local checks failed or executor is unavailable.');
        } finally {
            if (guestController.current === controller) { guestController.current = null; setGuestRunning(false); }
        }
    };

    const run = async (mode: 'mock' | 'live') => {
        if (!dataset || !question.trim() || running) return;
        setRunning(true);
        setAnswer('');
        setError('');
        setEvents([]);
        let agent: Agent | null = null;
        try {
            const [{ buildEffectiveColumnRegistryFromState }, { createPiBrowserAgent, getPiFinalText }] = await Promise.all([
                import('../../services/data/columnRegistry'),
                import('../../services/agent/runtime/pi/piBrowserAgent'),
            ]);
            const state = useAppStore.getState();
            const currentDataset = state.canonicalCsvData ?? state.csvData;
            if (!currentDataset || currentDataset !== dataset) throw new Error('The active dataset changed. Reopen Pi Browser Lab.');
            const registry = buildEffectiveColumnRegistryFromState(state, { datasetOverride: dataset });
            if (!registry) throw new Error('The active dataset has no column registry.');
            const numericColumns = state.columnProfiles
                .filter(profile => profile.type === 'numerical' || profile.type === 'currency' || profile.type === 'percentage')
                .map(profile => profile.name);
            if (mode === 'live') {
                if (!state.settings.openAIApiKey.trim()) throw new Error('Set an OpenAI API key in Settings first.');
                const { ensureCloudAiConsent } = await import('../../services/privacy/cloudAiConsent');
                await ensureCloudAiConsent('openai');
            }
            agent = createPiBrowserAgent({
                mode,
                context: { dataset, columnRegistry: registry, numericColumns },
                apiKey: mode === 'live' ? state.settings.openAIApiKey : undefined,
                onEvent: event => {
                    setEvents(previous => [...previous.slice(-19), event.type]);
                },
            });
            agentRef.current = agent;
            await agent.prompt(question.trim());
            if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
            const result = getPiFinalText(agent);
            if (!result) throw new Error('Pi completed without a text answer.');
            setAnswer(result);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            if (agentRef.current === agent) agentRef.current = null;
            setRunning(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim/60 p-3" onMouseDown={event => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="pi-lab-title" tabIndex={-1}
                className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-card bg-white p-5 shadow-xl">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="pi-lab-title" className="text-lg font-semibold text-slate-900">Pi Browser Lab</h2>
                        <p className="mt-1 text-sm text-slate-600">Read-only Pi test on the active CSV. Model: gpt-5.4-mini · reasoning: medium.</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close Pi Browser Lab" className="rounded p-2 text-slate-600 hover:bg-slate-100">✕</button>
                </div>
                <p className="mt-4 text-sm text-slate-700">Dataset: {dataset?.fileName ?? 'No CSV loaded'} · {dataset?.backing?.rowCount ?? dataset?.data.length ?? 0} rows</p>
                <label htmlFor="pi-lab-question" className="mt-4 text-sm font-medium text-slate-800">Question</label>
                <textarea id="pi-lab-question" value={question} onChange={event => setQuestion(event.target.value)} rows={3}
                    disabled={running || !dataset} className="mt-1 w-full rounded border border-slate-300 p-2 text-sm" />
                <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void run('mock')} disabled={running || guestRunning || !dataset || !question.trim()}
                        className="rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Run mock tool cycle</button>
                    <button type="button" onClick={() => void run('live')} disabled={running || guestRunning || !dataset || !question.trim()}
                        className="rounded bg-accent-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Run live OpenAI</button>
                    {running && <button type="button" onClick={() => agentRef.current?.abort()} className="rounded border border-slate-300 px-3 py-2 text-sm">Cancel</button>}
                </div>
                <p className="mt-3 text-xs text-slate-500">Live mode sends your question, column names, and bounded aggregate results to OpenAI using the key in Settings. CSV rows remain in this browser. Mock mode makes no provider request.</p>
                {running && <p role="status" className="mt-4 text-sm text-accent-700">Pi is running…</p>}
                {error && <p role="alert" className="mt-4 rounded bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
                {answer && <section className="mt-4 rounded bg-slate-50 p-3" aria-label="Pi answer"><p className="whitespace-pre-wrap text-sm text-slate-800">{answer}</p></section>}
                {events.length > 0 && <details className="mt-4 text-xs text-slate-500"><summary>Pi event trace ({events.length})</summary><p className="mt-2 break-words">{events.join(' → ')}</p></details>}
                <section className="mt-5 border-t border-slate-200 pt-4" aria-label="Local executor checks">
                    <p className="text-sm text-slate-700">Local checks use synthetic data and make no AI provider request. Pi coding checks exercise a scripted provider with real tools and workers.</p>
                    <button type="button" onClick={() => void runGuestChecks('capacity')} disabled={running || guestRunning}
                        className="mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local capacity checks</button>
                    <button type="button" onClick={() => void runGuestChecks()} disabled={running || guestRunning}
                        className="mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local JavaScript checks</button>
                    <button type="button" onClick={() => void runGuestChecks('adapter')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local adapter checks</button>
                    <button type="button" onClick={() => void runGuestChecks('coding')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local Pi coding checks</button>
                    <button type="button" onClick={() => void runGuestChecks('sql')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local SQL checks</button>
                    <button type="button" onClick={() => void runGuestChecks('table')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local full-table checks</button>
                    <button type="button" onClick={() => void runGuestChecks('preparation')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local shared preparation checks</button>
                    <button type="button" onClick={() => void runGuestChecks('meaning')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local automatic meaning checks</button>
                    <button type="button" onClick={() => void runGuestChecks('commit')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local commit checks</button>
                    <button type="button" onClick={() => void runGuestChecks('approval')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local approval checks</button>
                    <button type="button" onClick={() => void runGuestChecks('admission')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local evidence checks</button>
                    <button type="button" onClick={() => void runGuestChecks('skills')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run pinned skill checks</button>
                    <button type="button" onClick={() => void runGuestChecks('lifecycle')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run browser lifecycle checks</button>
                    <button type="button" onClick={() => void runGuestChecks('recovery')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local recovery checks</button>
                    <button type="button" onClick={() => void runGuestChecks('validation')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local validation checks</button>
                    <button type="button" onClick={() => void runGuestChecks('candidate')} disabled={running || guestRunning}
                        className="ml-2 mt-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Run local candidate checks</button>
                    {guestRunning && <button type="button" onClick={() => guestController.current?.abort()}
                        className="ml-2 rounded border border-slate-300 px-3 py-2 text-sm">Stop local checks</button>}
                    {guestResult && <pre role="status" className="mt-2 whitespace-pre-wrap text-xs text-slate-600">{guestResult}</pre>}
                </section>
            </div>
        </div>,
        document.body,
    );
};
