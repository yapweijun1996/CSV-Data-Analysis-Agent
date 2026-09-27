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
    const dialogRef = useDialogAccessibility<HTMLDivElement>(true, onClose, {
        restoreFocusSelector: '[data-pi-browser-lab-trigger="true"]',
    });

    useEffect(() => {
        setAnswer('');
        setEvents([]);
        setError('');
        agentRef.current?.abort();
    }, [datasetId]);

    useEffect(() => () => agentRef.current?.abort(), []);

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-3" onMouseDown={event => {
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
                    <button type="button" onClick={() => void run('mock')} disabled={running || !dataset || !question.trim()}
                        className="rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Run mock tool cycle</button>
                    <button type="button" onClick={() => void run('live')} disabled={running || !dataset || !question.trim()}
                        className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Run live OpenAI</button>
                    {running && <button type="button" onClick={() => agentRef.current?.abort()} className="rounded border border-slate-300 px-3 py-2 text-sm">Cancel</button>}
                </div>
                <p className="mt-3 text-xs text-slate-500">Live mode sends your question, column names, and bounded aggregate results to OpenAI using the key in Settings. CSV rows remain in this browser. Mock mode makes no provider request.</p>
                {running && <p role="status" className="mt-4 text-sm text-blue-700">Pi is running…</p>}
                {error && <p role="alert" className="mt-4 rounded bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
                {answer && <section className="mt-4 rounded bg-slate-50 p-3" aria-label="Pi answer"><p className="whitespace-pre-wrap text-sm text-slate-800">{answer}</p></section>}
                {events.length > 0 && <details className="mt-4 text-xs text-slate-500"><summary>Pi event trace ({events.length})</summary><p className="mt-2 break-words">{events.join(' → ')}</p></details>}
            </div>
        </div>,
        document.body,
    );
};
