import { describe, expect, it, vi } from 'vitest';
import { gatePiCreatedCards } from '../services/agent/runtime/pi/piCardEvidenceGate';

// Real evidence gate and result summary: guards the trace-to-evidence-plan mapping.
const makeCard = (id: string) => ({
    id,
    plan: { title: `Total Value by Project ${id}`, description: 'Value per project.' },
    aggregatedData: [
        { Project: 'A', total_value: 50 }, { Project: 'B', total_value: 30 }, { Project: 'C', total_value: 20 },
    ],
    provenance: { queryEvidence: { traceId: `trace-${id}` } },
});

const makeStore = (cards: any[]) => {
    let state: any = {
        analysisCards: cards,
        latestAnalysisSession: { semanticUnderstanding: {
            businessGrains: ['Project'], candidateMetrics: ['Value'], timeGrains: [], helperDimensions: [],
            blockedDimensions: [], detailRowPolicy: 'exclude_non_detail_rows', businessGlossary: [],
            businessGrainConfidence: 'high', unsafeForBusinessNarrative: false,
        } },
        queryHistory: cards.map(card => ({
            id: `trace-${card.id}`,
            plan: {
                select: ['Project', 'total_value'], groupBy: ['Project'],
                aggregates: [{ function: 'sum', column: 'Value', as: 'total_value' }],
            },
            result: { totalMatchedRows: 3, truncated: false, selectedColumns: ['Project', 'total_value'] },
        })),
        columnProfiles: [{ name: 'Project', type: 'categorical' }, { name: 'Value', type: 'numerical' }],
        deleteAnalysisCard: vi.fn((id: string) => {
            state = { ...state, analysisCards: state.analysisCards.filter((card: any) => card.id !== id) };
        }),
    };
    return {
        getState: () => state,
        setState: (patch: any) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; },
    };
};

describe('gatePiCreatedCards with the real evidence gate', () => {
    it('stores a gate result on a valid card and rejects an identical second card as a duplicate', () => {
        const store = makeStore([makeCard('c1'), makeCard('c2')]);

        const first = gatePiCreatedCards(store as never, ['c1']);
        expect(first.rejected).toEqual([]);
        expect(store.getState().analysisCards[0].evidenceValueGate).toMatchObject({ source: 'evidence_value_gate_v1' });

        const second = gatePiCreatedCards(store as never, ['c2']);
        expect(second.rejected).toHaveLength(1);
        expect(second.rejected[0].cardId).toBe('c2');
        expect(store.getState().analysisCards.map((card: any) => card.id)).toEqual(['c1']);
    });
});
