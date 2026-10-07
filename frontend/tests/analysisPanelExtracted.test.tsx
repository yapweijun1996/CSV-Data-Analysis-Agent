// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveNextStepCopyKeys, resolveNextStepKind } from '../components/analysis-panel/nextStep';
import { RecommendedNextStep } from '../components/analysis-panel/RecommendedNextStep';
import { ResultsViewToggle } from '../components/analysis-panel/ResultsViewToggle';
import { LargeDatasetNotice } from '../components/analysis-panel/LargeDatasetNotice';
import { summarizeCardCredibility } from '../components/analysis-panel/credibilitySummary';
import { selectSimpleViewCardIds } from '../components/analysis-panel/simpleViewSelection';
import { useCardWindow } from '../components/analysis-panel/useCardWindow';
import { useResponsiveColumnCount } from '../components/analysis-panel/useResponsiveColumnCount';

const trust = vi.hoisted(() => ({ statusById: {} as Record<string, string>, trustedIds: [] as string[], scoreById: {} as Record<string, number> }));
vi.mock('../services/agent/cardTrustDecision', () => ({
    resolveCardTrustDecision: (card: { id: string }) => ({ status: trust.statusById[card.id] ?? 'verified' }),
}));
vi.mock('../services/agent/analysisCompletionGate', () => ({
    resolveAnalysisCompletionGate: () => ({ trustedBusinessCardIds: trust.trustedIds }),
}));
vi.mock('../services/agent/artifactProvenance', () => ({ getCurrentAnalysisDatasetVersion: () => 'v1' }));
vi.mock('../services/dashboard/displayAnalysisIr', () => ({
    buildDisplayAnalysisIr: (card: { id: string }) => ({
        helperExposureLevel: 'none', narrativeEligibility: 'preferred', businessMeaningConfidence: 0.5,
        selectionScore: trust.scoreById[card.id] ?? 0,
    }),
}));

const card = (id: string, isFallback = false) => ({ id, plan: { isFallback } }) as never;

describe('next step resolution', () => {
    it('prefers structure repair, then provider recovery, then evidence review, then the report', () => {
        expect(resolveNextStepKind({ needsStructureRepair: true, needsProviderRecovery: true, needsEvidenceReview: true })).toBe('repair_structure');
        expect(resolveNextStepKind({ needsStructureRepair: false, needsProviderRecovery: true, needsEvidenceReview: true })).toBe('recover_provider');
        expect(resolveNextStepKind({ needsStructureRepair: false, needsProviderRecovery: false, needsEvidenceReview: true })).toBe('review_evidence');
        expect(resolveNextStepKind({ needsStructureRepair: false, needsProviderRecovery: false, needsEvidenceReview: false })).toBe('report');
    });

    it('picks report copy by degraded, existing report and running state', () => {
        const base = { kind: 'report' as const, degraded: false, hasReport: false, isGeneratingReport: false };
        expect(resolveNextStepCopyKeys(base)).toMatchObject({ reason: 'analysis_results_next_step_reason_ready_report', action: 'generate_analyst_report' });
        expect(resolveNextStepCopyKeys({ ...base, degraded: true }).reason).toBe('analysis_results_next_step_reason_degraded_report');
        expect(resolveNextStepCopyKeys({ ...base, hasReport: true }).action).toBe('report_open');
        expect(resolveNextStepCopyKeys({ ...base, isGeneratingReport: true }).action).toBe('generate_analyst_report_running');
        expect(resolveNextStepCopyKeys({ ...base, kind: 'recover_provider' }).action).toBe('analysis_results_retry_action');
    });
});

describe('extracted panel components', () => {
    afterEach(cleanup);

    it('lets the user switch between simple and explore views', () => {
        const onChange = vi.fn();
        render(<ResultsViewToggle mode="simple" language="English" onChange={onChange} />);

        expect(screen.getByRole('button', { name: 'Simple view' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: 'Explore in depth' }));
        expect(onChange).toHaveBeenCalledWith('explore');
    });

    it('runs the primary action, disables it on request, and offers a provider change only when recovering', () => {
        const onPrimary = vi.fn();
        const onChangeProvider = vi.fn();
        const { rerender } = render(<RecommendedNextStep
            kind="recover_provider" language="English" degraded={false} hasReport={false} isGeneratingReport={false}
            disabled={false} onPrimaryAction={onPrimary} onChangeProvider={onChangeProvider}
        />);

        fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }));
        expect(onPrimary).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole('button', { name: 'Change provider' }));
        expect(onChangeProvider).toHaveBeenCalledOnce();

        rerender(<RecommendedNextStep
            kind="report" language="English" degraded hasReport={false} isGeneratingReport={false}
            disabled blockedTitle="Blocked" onPrimaryAction={onPrimary} onChangeProvider={onChangeProvider}
        />);
        expect((screen.getByRole('button', { name: 'Generate Analyst Report' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.queryByRole('button', { name: 'Change provider' })).toBeNull();
    });

    it('states the full row count and the sample size once', () => {
        render(<LargeDatasetNotice rowCount={982589} sampleRowCount={2000} language="English" />);
        expect(screen.getByRole('status').textContent).toContain('982,589');
        expect(screen.getByRole('status').textContent).toContain('2,000');
    });
});

describe('card ranking and credibility', () => {
    beforeEach(() => {
        trust.statusById = {};
        trust.trustedIds = [];
        trust.scoreById = {};
    });

    it('keeps only verified cards, best first, up to the limit, and penalises fallbacks', () => {
        trust.trustedIds = ['a', 'b', 'c'];
        trust.scoreById = { a: 10, b: 30, c: 20 };
        const base = { canonicalCsvData: null, csvData: null, columnProfiles: [] } as never;

        expect(selectSimpleViewCardIds({ ...(base as object), cards: [card('a'), card('b'), card('c'), card('x')] } as never)).toEqual(['b', 'c']);
        expect(selectSimpleViewCardIds({ ...(base as object), cards: [card('a'), card('b', true), card('c')], limit: 3 } as never)).toEqual(['c', 'a', 'b']);
    });

    it('derives one verdict from card trust statuses', () => {
        const run = (statuses: Record<string, string>) => {
            trust.statusById = statuses;
            return summarizeCardCredibility({ cards: Object.keys(statuses).map(id => card(id)), canonicalCsvData: null, csvData: null } as never);
        };

        expect(summarizeCardCredibility({ cards: [], canonicalCsvData: null, csvData: null } as never)).toBeNull();
        expect(run({ a: 'verified', b: 'verified' })).toMatchObject({ overallVerdict: 'trusted', trustedCount: 2 });
        expect(run({ a: 'verified', b: 'caveated' })).toMatchObject({ overallVerdict: 'caveated' });
        expect(run({ a: 'verified', b: 'weak' })).toMatchObject({ overallVerdict: 'caveated', weakCount: 1 });
        expect(run({ a: 'caveated' })).toMatchObject({ overallVerdict: 'caveated' });
        expect(run({ a: 'weak', b: 'unverified' })).toMatchObject({ overallVerdict: 'weak' });
    });
});

describe('panel hooks', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('keeps the card id list stable until the cards change and spotlights a new card briefly', () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(({ cards }) => useCardWindow(cards), {
            initialProps: { cards: [card('a'), card('b')] },
        });
        const firstIds = result.current.stableCardIds;

        rerender({ cards: [card('a'), card('b')] });
        expect(result.current.stableCardIds).toBe(firstIds);
        expect(result.current.spotlightCardId).toBeNull();

        rerender({ cards: [card('c'), card('a'), card('b')] });
        expect(result.current.stableCardIds).toEqual(['c', 'a', 'b']);
        expect(result.current.spotlightCardId).toBe('c');

        act(() => { vi.advanceTimersByTime(10_001); });
        expect(result.current.spotlightCardId).toBeNull();
    });

    it('maps the measured panel width to one, two or three columns', () => {
        let callback: ((entries: Array<{ contentRect: { width: number } }>) => void) | null = null;
        vi.stubGlobal('ResizeObserver', class {
            constructor(cb: typeof callback) { callback = cb; }
            observe() {}
            unobserve() {}
            disconnect() {}
        });
        const element = document.createElement('div');
        Object.defineProperty(element, 'offsetWidth', { value: 1000 });
        const panelRef = { current: element }; // a stable ref, like useRef in the panel
        const { result } = renderHook(() => useResponsiveColumnCount(panelRef));

        expect(result.current).toBe(2);
        act(() => callback!([{ contentRect: { width: 800 } }]));
        expect(result.current).toBe(1);
        act(() => callback!([{ contentRect: { width: 1600 } }]));
        expect(result.current).toBe(3);
    });
});
