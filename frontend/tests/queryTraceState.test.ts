import { describe, expect, it } from 'vitest';
import { createQueryTraceEntry } from '../services/agent/queryTraceState';
import type { ActiveDataQuery } from '../types';

const buildActiveDataQuery = (): ActiveDataQuery => ({
    sessionId: 'session-123',
    runId: 'run-234',
    turnId: 'turn-456',
    stepId: 'step-789',
    toolCallId: 'tool-call-321',
    explanation: 'Inspect top customers',
    plan: {
        select: ['customer', 'revenue'],
        limit: 10,
    },
    result: {
        rows: [{ customer: 'A', revenue: 100 }],
        totalMatchedRows: 1,
        returnedRows: 1,
        truncated: false,
        selectedColumns: ['customer', 'revenue'],
        appliedOrderBy: [],
        appliedLimit: 10,
        durationMs: 25,
    },
    appliedAt: new Date('2026-03-12T10:00:00.000Z'),
    source: 'execute_data_query',
    engine: 'duckdb',
    sqlPreview: 'select customer, revenue from dataset limit 10',
    tableName: 'dataset',
    loadVersion: 'load-1',
    fallbackReason: null,
    fallbackFilterOperation: null,
});

describe('queryTraceState', () => {
    it('propagates runtime identifiers from the active query by default', () => {
        const entry = createQueryTraceEntry(buildActiveDataQuery(), 'analysis');

        expect(entry).toMatchObject({
            sessionId: 'session-123',
            runId: 'run-234',
            turnId: 'turn-456',
            stepId: 'step-789',
            toolCallId: 'tool-call-321',
            traceContract: {
                contractVersion: 'runtime_v1',
                reasonCode: 'query_trace_recorded',
                source: 'query_trace',
            },
        });
    });

    it('allows explicit trace identifier overrides', () => {
        const entry = createQueryTraceEntry(buildActiveDataQuery(), 'analysis', {
            sessionId: 'session-override',
            runId: 'run-override',
            turnId: 'turn-override',
            stepId: 'step-override',
            toolCallId: 'tool-call-override',
            origin: 'workspace',
        });

        expect(entry).toMatchObject({
            sessionId: 'session-override',
            runId: 'run-override',
            turnId: 'turn-override',
            stepId: 'step-override',
            toolCallId: 'tool-call-override',
            origin: 'workspace',
        });
    });

    it('marks fallback query traces with canonical trace metadata', () => {
        const entry = createQueryTraceEntry({
            ...buildActiveDataQuery(),
            fallbackReason: 'native_fallback',
            fallbackStage: 'query_failed',
        }, 'analysis');

        expect(entry.traceContract).toMatchObject({
            contractVersion: 'runtime_v1',
            reasonCode: 'query_fallback_recorded',
            source: 'query_trace',
        });
    });
});
