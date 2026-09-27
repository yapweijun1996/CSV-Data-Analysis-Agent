// @vitest-environment jsdom

/**
 * Tests for the card.refine tool:
 *   - manifest validation (validateCardRefine)
 *   - executor (executeCardRefineAction via handleExecutorAction)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { validateCardRefine } from '../services/agent/tools/toolManifestSupport';
import { handleExecutorAction } from '../services/agent/execution/executorAgent';
import type { AiAction, AnalysisCardData, ToolAvailabilityContext } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeContext = (cardIds: string[]): ToolAvailabilityContext => ({
    hasCsvData: true,
    cleaningCompleted: true,
    hasCards: cardIds.length > 0,
    hasCleaningRun: false,
    cardIds,
    columnNames: ['Region', 'Revenue'],
    suggestionIds: [],
    settingsKey: 'en',
});

const makeCard = (id: string): AnalysisCardData => ({
    id,
    plan: {
        title: `Card ${id}`,
        chartType: 'bar',
        aggregation: 'sum',
    } as AnalysisCardData['plan'],
    displayChartType: 'bar',
    isDataVisible: false,
    topN: 10,
    aggregatedData: [],
    summary: { en: '', zh: '' } as any,
    hideOthers: false,
});

const makeStore = (cards: AnalysisCardData[]) => {
    let state = {
        analysisCards: cards,
        csvData: { fileName: 'test.csv', data: [], headers: [] },
        handleShowCardFromChat: vi.fn(),
    };
    return {
        getState: () => state as any,
        setState: (updater: any) => {
            const update = typeof updater === 'function' ? updater(state) : updater;
            state = { ...state, ...update };
        },
    };
};

const makeAction = (args: Record<string, any>): AiAction => ({
    type: 'tool_call',
    toolName: 'card.refine',
    args,
    thought: undefined,
});

// ---------------------------------------------------------------------------
// validateCardRefine
// ---------------------------------------------------------------------------

describe('validateCardRefine', () => {
    it('returns error when args is undefined', () => {
        const errors = validateCardRefine(undefined, makeContext(['card-1']));
        expect(errors.length).toBeGreaterThan(0);
    });

    it('returns error when cardId is missing', () => {
        const errors = validateCardRefine({ changes: { topN: 5 } }, makeContext(['card-1']));
        expect(errors.some(e => e.includes('cardId'))).toBe(true);
    });

    it('returns error when cardId does not reference a valid card', () => {
        const errors = validateCardRefine(
            { cardId: 'nonexistent', changes: { topN: 5 } },
            makeContext(['card-1']),
        );
        expect(errors.some(e => e.includes('nonexistent'))).toBe(true);
    });

    it('returns error when changes is not an object', () => {
        const errors = validateCardRefine(
            { cardId: 'card-1', changes: 'invalid' },
            makeContext(['card-1']),
        );
        expect(errors.length).toBeGreaterThan(0);
    });

    it('returns error when topN is negative', () => {
        const errors = validateCardRefine(
            { cardId: 'card-1', changes: { topN: -1 } },
            makeContext(['card-1']),
        );
        expect(errors.some(e => e.includes('topN'))).toBe(true);
    });

    it('returns error when chartType is invalid', () => {
        const errors = validateCardRefine(
            { cardId: 'card-1', changes: { chartType: 'heatmap' } },
            makeContext(['card-1']),
        );
        expect(errors.some(e => e.includes('chartType'))).toBe(true);
    });

    it('returns error when filter is missing column', () => {
        const errors = validateCardRefine(
            { cardId: 'card-1', changes: { filter: { values: ['North'] } } },
            makeContext(['card-1']),
        );
        expect(errors.some(e => e.includes('filter.column'))).toBe(true);
    });

    it('returns error when filter.values is not an array', () => {
        const errors = validateCardRefine(
            { cardId: 'card-1', changes: { filter: { column: 'Region', values: 'North' } } },
            makeContext(['card-1']),
        );
        expect(errors.some(e => e.includes('filter.values'))).toBe(true);
    });

    it('passes for valid topN change', () => {
        const errors = validateCardRefine(
            { cardId: 'card-1', changes: { topN: 5 } },
            makeContext(['card-1']),
        );
        expect(errors).toEqual([]);
    });

    it('passes for valid chartType change', () => {
        const errors = validateCardRefine(
            { cardId: 'card-1', changes: { chartType: 'line' } },
            makeContext(['card-1']),
        );
        expect(errors).toEqual([]);
    });

    it('passes for valid filter change', () => {
        const errors = validateCardRefine(
            { cardId: 'card-1', changes: { filter: { column: 'Region', values: ['North', 'South'] } } },
            makeContext(['card-1']),
        );
        expect(errors).toEqual([]);
    });

    it('passes for clearing a filter (empty values array)', () => {
        const errors = validateCardRefine(
            { cardId: 'card-1', changes: { filter: { column: 'Region', values: [] } } },
            makeContext(['card-1']),
        );
        expect(errors).toEqual([]);
    });

    it('passes for isDataVisible change', () => {
        const errors = validateCardRefine(
            { cardId: 'card-1', changes: { isDataVisible: true } },
            makeContext(['card-1']),
        );
        expect(errors).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// handleExecutorAction — card.refine
// ---------------------------------------------------------------------------

describe('handleExecutorAction — card.refine', () => {
    it('returns error when card is not found', async () => {
        const store = makeStore([makeCard('card-1')]);
        const action = makeAction({ cardId: 'nonexistent', changes: { topN: 5 } });
        const result = await handleExecutorAction(action, store as any);
        expect(result.status).toBe('error');
        expect(result.message).toMatch(/not found/i);
    });

    it('applies topN change', async () => {
        const store = makeStore([makeCard('card-1')]);
        const action = makeAction({ cardId: 'card-1', changes: { topN: 5 } });
        const result = await handleExecutorAction(action, store as any);
        expect(result.status).toBe('success');
        const updatedCard = store.getState().analysisCards.find((c: AnalysisCardData) => c.id === 'card-1');
        expect(updatedCard?.topN).toBe(5);
    });

    it('applies chartType change', async () => {
        const store = makeStore([makeCard('card-1')]);
        const action = makeAction({ cardId: 'card-1', changes: { chartType: 'line' } });
        await handleExecutorAction(action, store as any);
        const updatedCard = store.getState().analysisCards.find((c: AnalysisCardData) => c.id === 'card-1');
        expect(updatedCard?.displayChartType).toBe('line');
    });

    it('applies filter change', async () => {
        const store = makeStore([makeCard('card-1')]);
        const action = makeAction({
            cardId: 'card-1',
            changes: { filter: { column: 'Region', values: ['North'] } },
        });
        await handleExecutorAction(action, store as any);
        const updatedCard = store.getState().analysisCards.find((c: AnalysisCardData) => c.id === 'card-1');
        expect(updatedCard?.filter).toEqual({ column: 'Region', values: ['North'] });
    });

    it('clears filter when values array is empty', async () => {
        const card = { ...makeCard('card-1'), filter: { column: 'Region', values: ['North'] } };
        const store = makeStore([card]);
        const action = makeAction({
            cardId: 'card-1',
            changes: { filter: { column: 'Region', values: [] } },
        });
        await handleExecutorAction(action, store as any);
        const updatedCard = store.getState().analysisCards.find((c: AnalysisCardData) => c.id === 'card-1');
        expect(updatedCard?.filter).toBeUndefined();
    });

    it('applies isDataVisible change', async () => {
        const store = makeStore([makeCard('card-1')]);
        const action = makeAction({ cardId: 'card-1', changes: { isDataVisible: true } });
        await handleExecutorAction(action, store as any);
        const updatedCard = store.getState().analysisCards.find((c: AnalysisCardData) => c.id === 'card-1');
        expect(updatedCard?.isDataVisible).toBe(true);
    });

    it('applies multiple changes in one call', async () => {
        const store = makeStore([makeCard('card-1')]);
        const action = makeAction({
            cardId: 'card-1',
            changes: { topN: 3, chartType: 'pie', isDataVisible: true },
        });
        const result = await handleExecutorAction(action, store as any);
        expect(result.status).toBe('success');
        const updatedCard = store.getState().analysisCards.find((c: AnalysisCardData) => c.id === 'card-1');
        expect(updatedCard?.topN).toBe(3);
        expect(updatedCard?.displayChartType).toBe('pie');
        expect(updatedCard?.isDataVisible).toBe(true);
    });

    it('does not mutate other cards', async () => {
        const store = makeStore([makeCard('card-1'), makeCard('card-2')]);
        const action = makeAction({ cardId: 'card-1', changes: { topN: 7 } });
        await handleExecutorAction(action, store as any);
        const card2 = store.getState().analysisCards.find((c: AnalysisCardData) => c.id === 'card-2');
        expect(card2?.topN).toBe(10); // original value
    });

    it('returns error when payload is missing', async () => {
        const store = makeStore([makeCard('card-1')]);
        const action: AiAction = { type: 'tool_call', toolName: 'card.refine', args: null as any, thought: undefined };
        const result = await handleExecutorAction(action, store as any);
        expect(result.status).toBe('error');
    });
});
