import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisCardData } from '../types';
import { useAppStore, initialAppState } from '../store/useAppStore';
import { AnalysisCard } from '../components/analysis-card/AnalysisCard';
import { createNewCard } from '../services/agent/execution/cardCreator';

const { toPngMock } = vi.hoisted(() => ({ toPngMock: vi.fn(async (element: HTMLElement) => {
    expect(element.querySelector('canvas')).toBeNull();
    expect(element.querySelector('table')?.textContent).toContain('Alpha');
    expect(element.querySelector('table')?.textContent).toContain('Beta');
    return 'data:image/png;base64,local-mock';
}) }));
vi.mock('html-to-image', () => ({ toPng: toPngMock }));

vi.mock('../components/analysis-card/AnalysisCardChart', () => ({
    AnalysisCardChart: () => <canvas data-testid="card-chart" />,
}));
const card = (decision: 'pass' | 'table_only'): AnalysisCardData => ({
    id: 'table-only-card',
    plan: { title: 'Total by Project', description: 'Project totals.', chartType: 'bar', groupByColumn: 'Project', valueColumn: 'Total', aggregation: 'sum' },
    displayChartType: 'bar', aggregatedData: [{ Project: 'Alpha', Total: 50 }, { Project: 'Beta', Total: 30 }],
    summary: null, isDataVisible: false, topN: null, hideOthers: false, hiddenLabels: [],
    evidenceValueGate: { decision, detail: 'unsafe_business_narrative', reasonCodes: ['unsafe_business_narrative'],
        querySignature: 'q', semanticSignature: 's', semanticRisk: 'high', evaluatedAt: '2026-10-09T00:00:00Z', source: 'evidence_value_gate_v1' },
});

describe('AnalysisCard table-only evidence presentation', () => {
    beforeEach(() => useAppStore.setState({ ...initialAppState, settings: { ...initialAppState.settings, language: 'English', enableVisualEvaluation: false } }));
    afterEach(() => { cleanup(); useAppStore.setState(initialAppState); vi.restoreAllMocks(); vi.clearAllMocks(); });

    it.each([false, true])('shows inferred-unit provenance when expanded is %s', expanded => {
        useAppStore.setState({ analysisCards: [{ ...card('pass'), unitInferred: true }] });
        render(<AnalysisCard cardId="table-only-card" isSpotlighted={expanded} />);
        expect(screen.getByText('unit inferred, not confirmed')).toBeInTheDocument();
    });

    it('persists inferred provenance when creating and reusing a card', async () => {
        const existing = card('pass');
        useAppStore.setState({ currentDatasetId: 'synthetic-inferred', csvData: { fileName: 'synthetic.csv', data: existing.aggregatedData } });
        const original = await createNewCard(existing.plan, existing.aggregatedData, useAppStore);
        const reused = await createNewCard(existing.plan, existing.aggregatedData, useAppStore, { unitInferred: true });
        expect(reused.id).toBe(original.id);
        expect(useAppStore.getState().analysisCards[0].unitInferred).toBe(true);
    });

    it('creates restricted cards in table mode and preserves a passing chart plan', async () => {
        const restricted = card('table_only');
        const created = await createNewCard(restricted.plan, restricted.aggregatedData, useAppStore, { evidenceValueGate: restricted.evidenceValueGate });
        expect(created.plan.presentationMode).toBe('table');
        expect(created.isDataVisible).toBe(true);
        expect(created.evidenceValueGate?.detail).toBe(restricted.evidenceValueGate?.detail);
        useAppStore.setState({ analysisCards: [] });
        const passing = card('pass');
        const unchanged = await createNewCard(passing.plan, passing.aggregatedData, useAppStore, { evidenceValueGate: passing.evidenceValueGate });
        expect(unchanged.plan).toEqual(passing.plan);
        expect(unchanged.isDataVisible).toBe(false);
    });

    it('applies the restriction when card creation reuses an existing query-equivalent chart', async () => {
        const passing = card('pass');
        useAppStore.setState({ currentDatasetId: 'synthetic-table-only', csvData: { fileName: 'synthetic.csv', data: passing.aggregatedData } });
        const original = await createNewCard(passing.plan, passing.aggregatedData, useAppStore, { evidenceValueGate: passing.evidenceValueGate });
        const restricted = card('table_only');
        const reused = await createNewCard(restricted.plan, restricted.aggregatedData, useAppStore, { evidenceValueGate: restricted.evidenceValueGate });
        expect(reused.id).toBe(original.id);
        expect(useAppStore.getState().analysisCards).toHaveLength(1);
        expect(reused.evidenceValueGate?.decision).toBe('table_only');
        expect(reused.plan.presentationMode).toBe('table');
        expect(reused.isDataVisible).toBe(true);
    });

    it.each([true, false])('enforces a legacy saved verdict with exploration controls %s', showExplorationControls => {
        // Legacy persisted cards have the verdict but no presentation projection.
        useAppStore.setState({ analysisCards: [JSON.parse(JSON.stringify(card('table_only')))] });
        render(<AnalysisCard cardId="table-only-card" isSpotlighted showExplorationControls={showExplorationControls} />);
        expect(screen.queryByTestId('card-chart')).not.toBeInTheDocument();
        const table = screen.getByRole('table');
        expect(within(table).getByText('Alpha')).toBeInTheDocument();
        expect(within(table).getByText('Beta')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /chart type/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /hide table/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: 'Labels' })).not.toBeInTheDocument();
        if (showExplorationControls) {
            fireEvent.click(screen.getByRole('button', { name: /export chart or data/i }));
            expect(screen.queryByRole('menuitem', { name: /PNG — Chart only/i })).not.toBeInTheDocument();
            expect(screen.getByRole('menuitem', { name: /CSV table data/i })).toBeInTheDocument();
            expect(screen.getByRole('menuitem', { name: /HTML/i })).toBeInTheDocument();
        }
    });

    it('applies a late gate verdict to an already-mounted card and preserves passing presentation', () => {
        useAppStore.setState({ analysisCards: [card('pass')] });
        const { rerender } = render(<AnalysisCard cardId="table-only-card" isSpotlighted />);
        expect(screen.getByTestId('card-chart')).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        useAppStore.setState({ analysisCards: [card('table_only')] });
        rerender(<AnalysisCard cardId="table-only-card" isSpotlighted />);
        expect(screen.queryByTestId('card-chart')).not.toBeInTheDocument();
        expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('includes the result table in full-card PNG export even when the card was collapsed', async () => {
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        useAppStore.setState({ analysisCards: [card('table_only')] });
        render(<AnalysisCard cardId="table-only-card" />);
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /export chart or data/i }));
        fireEvent.click(screen.getByRole('menuitem', { name: /PNG — Full card/i }));
        await waitFor(() => expect(toPngMock).toHaveBeenCalledOnce());
        await waitFor(() => expect(useAppStore.getState().globalErrorToast).toBeNull());
        expect(screen.getByRole('button', { name: 'Expand Analysis' })).toBeInTheDocument();
    });

    it.each([true, false])('captures the hidden passing table and restores expansion %s', async expanded => {
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,chart');
        toPngMock.mockImplementationOnce(async element => {
            expect(element.querySelector('table')?.textContent).toContain('Alpha');
            expect(element.querySelector('table')?.textContent).toContain('Beta');
            expect(element.querySelector('img')).not.toBeNull();
            return 'data:image/png;base64,full';
        });
        useAppStore.setState({ analysisCards: [card('pass')] });
        render(<AnalysisCard cardId="table-only-card" isSpotlighted={expanded} />);
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /export chart or data/i }));
        fireEvent.click(screen.getByRole('menuitem', { name: /PNG — Full card/i }));
        await waitFor(() => expect(toPngMock).toHaveBeenCalledOnce());
        await waitFor(() => expect(useAppStore.getState().globalErrorToast).toBeNull());
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: expanded ? 'Collapse Analysis' : 'Expand Analysis' })).toBeInTheDocument();
    });
});
