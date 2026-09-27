import React from 'react';
import { useAppStore } from '../../../store/useAppStore';
import type { DatasetKnowledgeHighlight } from '../../../types';

export const DatasetKnowledgeView: React.FC = () => {
    const knowledge = useAppStore(state => state.agentMemoryRun?.findings.datasetKnowledge);
    if (!knowledge) {
        return <div className="text-center text-slate-500 text-sm">Dataset knowledge will appear after the current analysis finishes.</div>;
    }

    const renderHighlightList = (title: string, highlights: DatasetKnowledgeHighlight[]) => (
        <section className="border border-slate-200 rounded-card p-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">{title}</h3>
            {highlights.length === 0 ? (
                <p className="text-sm text-slate-500">No items recorded.</p>
            ) : (
                <ul className="space-y-2 text-sm text-slate-700">
                    {highlights.map(entry => (
                        <li key={`${entry.name}-${entry.reason}`} className="flex items-start">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-500 mr-2 mt-2" />
                            <span>
                                <span className="font-semibold">{entry.name}</span>
                                <span className="text-slate-500"> — {entry.reason}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );

    const noiseColumns = knowledge.columns.filter(column => column.role === 'noise' || column.role === 'metadata');

    return (
        <div className="space-y-6">
            <section className="border border-slate-200 rounded-card p-4 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Dataset Facts</h3>
                <div className="grid grid-cols-2 gap-3 text-sm text-slate-700">
                    <div>
                        <span className="font-semibold">Rows (cleaned):</span> {knowledge.facts.cleanedRowCount.toLocaleString()}
                    </div>
                    <div>
                        <span className="font-semibold">Columns (cleaned):</span> {knowledge.facts.cleanedColumnCount}
                    </div>
                    <div>
                        <span className="font-semibold">Primary Dimensions:</span> {knowledge.facts.primaryDimensions.join(', ') || '—'}
                    </div>
                    <div>
                        <span className="font-semibold">Primary Metrics:</span> {knowledge.facts.primaryMetrics.join(', ') || '—'}
                    </div>
                    <div className="col-span-2">
                        <span className="font-semibold">Noise / Removed Columns:</span>{' '}
                        {noiseColumns.length > 0 ? noiseColumns.map(column => column.name).join(', ') : 'None'}
                    </div>
                </div>
            </section>

            <section className="border border-slate-200 rounded-card p-4">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Column Knowledge</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-xs text-left text-slate-700 border border-slate-200 rounded-card overflow-hidden">
                        <thead className="bg-slate-100 uppercase tracking-wide">
                            <tr>
                                <th className="px-3 py-2">Name</th>
                                <th className="px-3 py-2">Role</th>
                                <th className="px-3 py-2">Semantic Guess</th>
                                <th className="px-3 py-2">Distinct</th>
                                <th className="px-3 py-2">Missing%</th>
                                <th className="px-3 py-2">Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {knowledge.columns.map(column => (
                                <tr key={column.name} className="border-t border-slate-100">
                                    <td className="px-3 py-2 font-semibold">{column.name}</td>
                                    <td className="px-3 py-2 capitalize">{column.role}</td>
                                    <td className="px-3 py-2 text-slate-600">{column.semanticGuess || '—'}</td>
                                    <td className="px-3 py-2">{column.distinctValues ?? '—'}</td>
                                    <td className="px-3 py-2">{column.missingPercentage !== undefined ? `${column.missingPercentage.toFixed(1)}%` : '—'}</td>
                                    <td className="px-3 py-2 text-slate-500">{column.notes || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="border border-slate-200 rounded-card p-4">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Dimension Map</h3>
                <dl className="grid grid-cols-2 gap-3 text-sm text-slate-700">
                    <div>
                        <dt className="font-semibold">Project</dt>
                        <dd>{knowledge.dimensionMap.project.join(', ') || '—'}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold">Account</dt>
                        <dd>{knowledge.dimensionMap.account.join(', ') || '—'}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold">Allocation</dt>
                        <dd>{knowledge.dimensionMap.allocation.join(', ') || '—'}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold">Keys</dt>
                        <dd>{knowledge.dimensionMap.keys.join(', ') || '—'}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold">Other Dimensions</dt>
                        <dd>{knowledge.dimensionMap.otherDimensions.join(', ') || '—'}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold">Metrics</dt>
                        <dd>{knowledge.dimensionMap.metrics.join(', ') || '—'}</dd>
                    </div>
                </dl>
            </section>

            {renderHighlightList('High-Value Dimensions', knowledge.highValueDimensions)}
            {renderHighlightList('Suspicious Metrics / Noise Signals', knowledge.suspiciousMetrics)}

            <section className="border border-slate-200 rounded-card p-4 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Dataset Summary</h3>
                <p className="text-sm text-slate-700 whitespace-pre-line">{knowledge.summary || 'Summary pending.'}</p>
            </section>
        </div>
    );
};