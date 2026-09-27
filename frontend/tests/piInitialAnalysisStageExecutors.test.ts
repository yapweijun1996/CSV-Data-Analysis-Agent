import { describe, expect, it, vi } from 'vitest';
import {
    createInitialAnalysisStageExecutors,
    INITIAL_EVIDENCE_RESEARCH_BUDGET_MS,
    INITIAL_LARGE_DATASET_EVIDENCE_RESEARCH_BUDGET_MS,
    resolveEvidenceResearchBudgetMs,
} from '../services/agent/runtime/pi/initialAnalysisStageExecutors';
import type { InitialAnalysisRunRequest } from '../services/agent/runtime/pi/initialAnalysisTypes';
import type { StoreApi } from '../services/agent/types';

const request: InitialAnalysisRunRequest = {
    appSessionId: 'session-1',
    datasetId: 'dataset-1',
    datasetVersion: 'version-1',
    researchGoal: 'Find notable patterns.',
    provider: {
        provider: 'google',
        modelId: 'gemini-3.5-flash-lite',
    },
};

const createState = (targetShape: 'row_table' | 'long_fact_table' = 'row_table') => ({
    csvData: {
        fileName: 'large.csv',
        data: [{ Town: 'A', Amount: 1 }],
        backing: {
            mode: 'duckdb_file' as const,
            loadVersion: 'dataset-large',
            datasetVersion: 'version-large',
            rowCount: 100_000,
            sampleRowCount: 1,
            byteSize: 30_000_000,
            readOnly: true as const,
            ephemeral: true as const,
        },
    },
    canonicalCsvData: null,
    columnProfiles: [
        { name: 'Town', type: 'categorical' as const },
        { name: 'Amount', type: 'numerical' as const },
    ],
    duckDbSessionStatus: { status: 'ready' as const },
    pipelineOutcome: {
        status: 'needs_structure_review' as const,
        canAutoAnalyze: false,
        severity: 'warning' as const,
        reasonCode: 'wide_reshape_contract_complete',
        message: 'Review requested.',
    },
    reportStructureResolution: {
        decision: { targetShape },
    },
});

describe('initial analysis evidence executor', () => {
    it('uses an extended bounded evidence budget for million-row file-backed datasets', () => {
        const state = createState();
        state.csvData.backing.rowCount = 1_000_000;
        state.csvData.backing.byteSize = 100 * 1024 * 1024;

        expect(resolveEvidenceResearchBudgetMs(state as never)).toBe(
            INITIAL_LARGE_DATASET_EVIDENCE_RESEARCH_BUDGET_MS,
        );
    });

    it('uses a visible degraded fallback for queryable read-only row tables', async () => {
        const state = createState();
        const store = {
            getState: () => state,
            setState: vi.fn(),
        } as unknown as StoreApi;
        const runEvidence = vi.fn(async () => ({
            acceptedCardCount: 1,
            session: {
                runId: 'research-run-1',
                status: 'completed' as const,
                acceptedOutputs: [{ cardId: 'card-1' }],
            },
        }));
        const executors = createInitialAnalysisStageExecutors({
            runEvidence: runEvidence as never,
        });

        const result = await executors['analysis.executeEvidence']({
            request,
            store,
            signal: new AbortController().signal,
        }, {
            runtimeRunId: 'runtime-1',
        });

        expect(runEvidence).toHaveBeenCalledOnce();
        expect(result).toMatchObject({
            decision: 'warn',
            warningCodes: ['read_only_structure_review_bypassed'],
            cardIds: ['card-1'],
        });
    });

    it('does not bypass structure review for a non-row-table shape', async () => {
        const state = createState('long_fact_table');
        const store = {
            getState: () => state,
            setState: vi.fn(),
        } as unknown as StoreApi;
        const runEvidence = vi.fn();
        const executors = createInitialAnalysisStageExecutors({
            runEvidence: runEvidence as never,
        });

        const result = await executors['analysis.executeEvidence']({
            request,
            store,
            signal: new AbortController().signal,
        }, {
            runtimeRunId: 'runtime-1',
        });

        expect(runEvidence).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            decision: 'fail',
            warningCodes: ['wide_reshape_contract_complete'],
        });
    });

    it('does not synthesize headline insights when no card passes the trust gate', async () => {
        const state = {
            ...createState(),
            analysisCards: [{
                id: 'review-card',
                plan: {
                    chartType: 'table',
                    title: 'Amount by Town',
                    description: 'Review-only aggregate.',
                },
                aggregatedData: [{ Town: 'A', Amount: 1 }],
                summary: { language: 'English', text: 'Review this result.' },
                displayChartType: 'table',
                isDataVisible: true,
                topN: null,
                hideOthers: false,
            }],
            finalSummary: { language: 'English', text: 'Stale headline.' },
            aiCoreAnalysisSummary: { language: 'English', text: 'Stale core.' },
        };
        const setState = vi.fn();
        const generateSummaries = vi.fn();
        const store = {
            getState: () => state,
            setState,
        } as unknown as StoreApi;
        const executors = createInitialAnalysisStageExecutors({
            generateSummaries: generateSummaries as never,
        });

        const result = await executors['analysis.finalizeArtifacts']({
            request,
            store,
            signal: new AbortController().signal,
        }, {});

        expect(generateSummaries).not.toHaveBeenCalled();
        expect(setState).toHaveBeenCalledWith(expect.objectContaining({
            finalSummary: null,
            finalSummaryProvenance: null,
        }));
        expect(result).toMatchObject({
            decision: 'warn',
            warningCodes: ['no_verified_analysis_cards'],
            cardIds: [],
        });
    });

    it('turns the evidence-stage budget expiry into a governed terminal result instead of cancelling the parent run', async () => {
        vi.useFakeTimers();
        try {
            const state = {
                ...createState(),
                csvData: {
                    fileName: 'empty-shape.csv',
                    data: [{}],
                },
                columnProfiles: [],
                pipelineOutcome: {
                    status: 'ready' as const,
                    canAutoAnalyze: true,
                    severity: 'info' as const,
                    reasonCode: 'ready',
                    message: 'Ready.',
                },
                analysisCards: [],
            };
            const store = {
                getState: () => state,
                setState: vi.fn(),
            } as unknown as StoreApi;
            const runEvidence = vi.fn(({ abortSignal }: { abortSignal: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    abortSignal.addEventListener('abort', () => reject(abortSignal.reason), {
                        once: true,
                    });
                }));
            const executors = createInitialAnalysisStageExecutors({
                runEvidence: runEvidence as never,
            });

            const pending = executors['analysis.executeEvidence']({
                request,
                store,
                signal: new AbortController().signal,
            }, {
                runtimeRunId: 'runtime-budget',
            });
            await vi.advanceTimersByTimeAsync(INITIAL_EVIDENCE_RESEARCH_BUDGET_MS);
            const result = await pending;

            expect(result).toMatchObject({
                decision: 'fail',
                warningCodes: ['evidence_research_budget_expired'],
            });
        } finally {
            vi.useRealTimers();
        }
    });
});
