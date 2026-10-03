import { beforeEach, describe, expect, it, vi } from 'vitest';

const { evaluateMock, summaryMock } = vi.hoisted(() => ({
    evaluateMock: vi.fn(),
    summaryMock: vi.fn(() => ({ rowCount: 1 })),
}));

vi.mock('../services/agent/evidenceValueGate', () => ({ evaluateEvidenceValue: evaluateMock }));
vi.mock('../services/agent/execution/sqlCardExecutor', () => ({ buildEvidenceResultSummary: summaryMock }));

import { gatePiCreatedCards } from '../services/agent/runtime/pi/piCardEvidenceGate';

const makeCard = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    plan: { title: `Card ${id}`, description: 'desc' },
    aggregatedData: [{ Town: 'A', Amount: 1 }],
    provenance: { queryEvidence: { traceId: `trace-${id}` } },
    ...extra,
});

const makeStore = (overrides: Record<string, unknown> = {}) => {
    let state: any = {
        analysisCards: [makeCard('c1'), makeCard('c2')],
        latestAnalysisSession: { semanticUnderstanding: { businessGrains: [] } },
        queryHistory: ['c1', 'c2'].map(id => ({
            id: `trace-${id}`,
            plan: { groupBy: ['Town'], aggregates: [{ function: 'sum', column: 'Amount', as: 'Total' }] },
            result: { totalMatchedRows: 1, truncated: false, selectedColumns: ['Town', 'Total'] },
        })),
        columnProfiles: [],
        deleteAnalysisCard: vi.fn((id: string) => {
            state = { ...state, analysisCards: state.analysisCards.filter((card: any) => card.id !== id) };
        }),
        recordRuntimeEvent: vi.fn(),
        ...overrides,
    };
    return {
        getState: () => state,
        setState: (patch: any) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; },
    };
};

const gate = (decision: 'pass' | 'table_only' | 'reject', detail = 'reason') => ({
    decision, reasonCodes: [], detail, querySignature: `q-${decision}`, semanticSignature: `s-${decision}`, semanticRisk: 'low',
});

describe('gatePiCreatedCards', () => {
    beforeEach(() => vi.clearAllMocks());

    it('removes a rejected card and reports why', () => {
        evaluateMock.mockReturnValueOnce(gate('reject', 'duplicate_semantic')).mockReturnValueOnce(gate('pass'));
        const store = makeStore();

        const outcome = gatePiCreatedCards(store as never, ['c1', 'c2']);

        expect(outcome.rejected).toEqual([{ cardId: 'c1', title: 'Card c1', detail: 'duplicate_semantic' }]);
        expect(store.getState().analysisCards.map((card: any) => card.id)).toEqual(['c2']);
        expect(store.getState().analysisCards[0].evidenceValueGate).toMatchObject({
            decision: 'pass', source: 'evidence_value_gate_v1',
        });
    });

    it('keeps a table-only card, stores the gate result, and flags it', () => {
        evaluateMock.mockReturnValue(gate('table_only'));
        const store = makeStore();

        const outcome = gatePiCreatedCards(store as never, ['c1']);

        expect(outcome.tableOnlyIds).toEqual(['c1']);
        expect(outcome.rejected).toEqual([]);
        expect(store.getState().analysisCards[0].evidenceValueGate.decision).toBe('table_only');
    });

    it('passes earlier accepted cards to the gate so duplicates are detectable', () => {
        evaluateMock.mockReturnValue(gate('pass'));
        const store = makeStore({
            analysisCards: [
                makeCard('old', { evidenceValueGate: { ...gate('pass'), querySignature: 'old-q', semanticSignature: 'old-s' } }),
                makeCard('c1'),
            ],
        });

        gatePiCreatedCards(store as never, ['c1']);

        expect(evaluateMock.mock.calls[0][0].existingAcceptedOutputs).toEqual([
            { querySignature: 'old-q', semanticSignature: 'old-s', decision: 'pass', title: 'Card old' },
        ]);
    });

    it('leaves the card untouched when no semantic understanding is available', () => {
        const store = makeStore({ latestAnalysisSession: null });

        const outcome = gatePiCreatedCards(store as never, ['c1']);

        expect(outcome).toEqual({ rejected: [], tableOnlyIds: [] });
        expect(evaluateMock).not.toHaveBeenCalled();
        expect(store.getState().analysisCards).toHaveLength(2);
    });

    it('keeps the card and reports telemetry when the gate throws', () => {
        evaluateMock.mockImplementationOnce(() => { throw new Error('gate exploded'); });
        const store = makeStore();

        const outcome = gatePiCreatedCards(store as never, ['c1']);

        expect(outcome.rejected).toEqual([]);
        expect(store.getState().analysisCards).toHaveLength(2);
        expect(store.getState().recordRuntimeEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'silent_failure',
        }));
    });
});
