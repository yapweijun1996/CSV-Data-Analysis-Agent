import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/observability/localDiagnostics', async importOriginal => ({
    ...(await importOriginal<typeof import('../services/observability/localDiagnostics')>()),
    loadRecentLocalDiagnostics: vi.fn(async () => []),
}));

import { buildProblemReport, summarizeProblemReport } from '../services/support/problemReport';
import { __resetConsoleRingForTests, getConsoleRingEntries, recordConsoleEntry, CONSOLE_RING_CAPACITY } from '../services/support/consoleRingBuffer';

const env = { appVersion: '1.0.0', releaseCommit: 'abc123', userAgent: 'UA', language: 'en-US', generatedAt: '2026-01-01T00:00:00.000Z' };
const state = {
    settings: { provider: 'google', geminiApiKey: 'AIzaSyA-SECRET-KEY-0123456789abcdef', simpleModel: 'm1', complexModel: 'm2', reasoningEffort: 'low', language: 'English' },
    chatHistory: [
        { id: '1', sender: 'user', text: 'compare Woodlands', timestamp: new Date('2026-01-01T00:00:01Z'), type: 'user_message' },
        { id: '2', sender: 'ai', text: 'Failed with Bearer abc.def.ghi', timestamp: new Date('2026-01-01T00:00:02Z'), type: 'ai_message', isError: true },
    ],
    agentEvents: [], agentToolLogs: [], runtimeEvents: [], runtimeRunHistory: [], columnProfiles: [{ name: 'price', type: 'numerical' }],
    csvData: { fileName: 'sales.csv', data: [{ price: 1, town: 'A' }, { price: 2, town: 'B' }] },
    canonicalCsvData: null, pipelineOutcome: null,
} as never;

describe('problem report', () => {
    beforeEach(() => __resetConsoleRingForTests());

    it('never contains API keys or bearer tokens and omits rows by default', async () => {
        const report = await buildProblemReport(state, env, { includeSample: false });
        const json = JSON.stringify(report);
        expect(json).not.toContain('AIzaSyA-SECRET');
        expect(json).not.toContain('abc.def.ghi');
        expect(report.dataset?.sampleRows).toBeNull();
        expect(report.dataset?.columns).toEqual([{ name: 'price', type: 'numerical' }, { name: 'town', type: null }]);
        expect(report.ai.provider).toBe('google');
    });

    it('includes sample rows only when opted in and summarizes errors', async () => {
        const report = await buildProblemReport(state, env, { includeSample: true, note: 'broke' });
        expect(report.dataset?.sampleRows).toHaveLength(2);
        expect(report.userNote).toBe('broke');
        const summary = summarizeProblemReport(report);
        expect(summary.errorCount).toBe(1);
        expect(summary.dataset).toContain('sales.csv');
    });

    it('keeps a bounded, redacted console ring', async () => {
        for (let i = 0; i < CONSOLE_RING_CAPACITY + 5; i += 1) recordConsoleEntry('error', [`boom ${i} Bearer topsecret`]);
        const entries = getConsoleRingEntries();
        expect(entries).toHaveLength(CONSOLE_RING_CAPACITY);
        expect(entries[0].message).not.toContain('topsecret');
        const report = await buildProblemReport(state, env, { includeSample: false });
        expect(report.consoleErrors).toHaveLength(CONSOLE_RING_CAPACITY);
    });
});
