import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

export const AgentMemoryView: React.FC = () => {
    const memory = useAppStore(state => state.agentMemoryRun ?? state.liveAgentMemoryRun);
    const [isQaMode, setIsQaMode] = useState(false);
    if (!memory) {
        return (
            <div className="text-center text-slate-500 text-sm">
                Memory will appear after the current analysis run finishes.
            </div>
        );
    }
    const { datasetFacts, columnVerdicts, explorations, warnings } = memory.findings;
    const sortedExplorations = [...explorations].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

    return (
        <div className="space-y-6">
            <section className="rounded-card border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                    Memory Origin
                </h3>
                <p>{memory.origin?.label ?? 'Legacy agent run (unverified origin)'}</p>
                {memory.reportId && memory.datasetVersion && (
                    <p className="mt-1 break-words text-xs text-slate-500">
                        Report {memory.reportId} · Dataset {memory.datasetId} · Version {memory.datasetVersion}
                    </p>
                )}
            </section>
            {datasetFacts && (
                <section className="border border-slate-200 rounded-card p-4 bg-slate-50">
                    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Dataset Facts</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm text-slate-700">
                        <div><span className="font-semibold">File:</span> {datasetFacts.fileName}</div>
                        <div><span className="font-semibold">Rows:</span> {datasetFacts.rowCount}</div>
                        <div><span className="font-semibold">Columns:</span> {datasetFacts.columnCount}</div>
                        <div><span className="font-semibold">Dimensions:</span> {datasetFacts.dimensions.join(', ') || '—'}</div>
                        <div><span className="font-semibold">Metrics:</span> {datasetFacts.metrics.join(', ') || '—'}</div>
                    </div>
                </section>
            )}
            <section className="border border-slate-200 rounded-card p-4">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Columns & Verdicts</h3>
                        <p className="text-xs text-slate-500 mt-1">Evaluated on original columns before AI cleaning. Enable QA mode for samples.</p>
                    </div>
                    <label className="flex items-center text-xs font-semibold text-slate-600 space-x-1">
                        <input
                            type="checkbox"
                            checked={isQaMode}
                            onChange={event => setIsQaMode(event.target.checked)}
                            className="rounded border-slate-300 text-slate-700 focus:ring-slate-400"
                        />
                        <span>QA Mode</span>
                    </label>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left text-slate-700 border border-slate-200 rounded-card overflow-hidden">
                        <thead className="bg-slate-100 text-xs uppercase tracking-wide">
                            <tr>
                                <th className="px-3 py-2">Column</th>
                                <th className="px-3 py-2">Role</th>
                                <th className="px-3 py-2">Distinct</th>
                                <th className="px-3 py-2">Removed?</th>
                                <th className="px-3 py-2">Reason</th>
                                {isQaMode && <th className="px-3 py-2">QA Sample (first 5)</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {columnVerdicts.map(verdict => (
                                <tr key={verdict.name} className="border-t border-slate-200">
                                    <td className="px-3 py-2 font-semibold">{verdict.name}</td>
                                    <td className="px-3 py-2 capitalize">{verdict.role}</td>
                                    <td className="px-3 py-2">{verdict.distinctValues ?? '—'}</td>
                                    <td className="px-3 py-2">{verdict.removed ? 'Yes' : 'No'}</td>
                                    <td className="px-3 py-2 text-slate-600">{verdict.reason || '—'}</td>
                                    {isQaMode && (
                                        <td className="px-3 py-2 text-slate-600">
                                            {verdict.sampleValues?.length
                                                ? verdict.sampleValues.join(', ')
                                                : verdict.constantValue || '—'}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
            <section className="border border-slate-200 rounded-card p-4">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Group-by Explorations</h3>
                {sortedExplorations.length === 0 ? (
                    <p className="text-sm text-slate-500">No explorations were recorded for this run.</p>
                ) : (
                    <ul className="space-y-3">
                        {sortedExplorations.map(exploration => (
                            <li key={exploration.id} className="border border-slate-200 rounded-card p-3 bg-white">
                                <div className="flex justify-between text-xs text-slate-500 mb-1">
                                    <span>{exploration.startedAt.toLocaleTimeString()}</span>
                                    <span className="uppercase font-semibold">{exploration.verdict}</span>
                                </div>
                                <p className="text-sm font-semibold text-slate-800">{exploration.planTitle}</p>
                                <p className="text-sm text-slate-600">
                                    Group by {exploration.groupBy.join(', ') || 'n/a'} • Metric {exploration.metric || 'n/a'}
                                </p>
                                {exploration.metrics && (
                                    <p className="text-xs text-slate-500 mt-1">
                                        {exploration.metrics.groups} groups, unique values {exploration.metrics.uniqueValues}, top share {exploration.metrics.topShare !== null ? `${(exploration.metrics.topShare * 100).toFixed(1)}%` : 'n/a'}
                                    </p>
                                )}
                                {exploration.commentary && (
                                    <p className="text-sm text-slate-600 mt-1">{exploration.commentary}</p>
                                )}
                                {exploration.cardCreated && (
                                    <span className="inline-block mt-2 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                        Card created
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            <section className="border border-slate-200 rounded-card p-4 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">High-Level Findings</h3>
                {warnings.length === 0 ? (
                    <p className="text-sm text-slate-500">No warnings were recorded during this run.</p>
                ) : (
                    <ul className="space-y-2 text-sm text-slate-700">
                        {warnings.map(warning => (
                            <li key={warning.id} className="flex items-start">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mr-2 mt-2"></span>
                                <span>{warning.message}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
};
