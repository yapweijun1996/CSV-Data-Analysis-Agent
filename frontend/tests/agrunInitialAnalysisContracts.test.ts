import { describe, expect, it } from 'vitest';
import {
    INITIAL_ANALYSIS_BUDGET_LIMITS,
    INITIAL_ANALYSIS_PHASES,
    assertInitialAnalysisBudgetState,
    assertInitialAnalysisRunRequest,
    createInitialAnalysisBudgetState,
    createInitialAnalysisCheckpointHostState,
    getNextInitialAnalysisPhase,
    isInitialAnalysisTerminalStatus,
} from '../services/agent/runtime/agrun/initialAnalysisTypes';
import type {
    InitialAnalysisRunOutcome,
    InitialAnalysisRunRequest,
} from '../services/agent/runtime/agrun/types';

const createRequest = (): InitialAnalysisRunRequest => ({
    appSessionId: 'session-1',
    datasetId: 'dataset-1',
    datasetVersion: 'version-1',
    researchGoal: 'Summarize patterns and notable segments.',
    provider: {
        provider: 'default',
        modelId: 'gpt-5.4-mini',
    },
});

describe('AGRUN-100 initial-analysis public contracts', () => {
    it('keeps the accepted eight-phase order fixed', () => {
        expect(INITIAL_ANALYSIS_PHASES).toEqual([
            'inspect_structure',
            'propose_cleaning',
            'apply_safe_cleaning',
            'verify_prepared_data',
            'bind_query_engine',
            'research_questions',
            'execute_evidence',
            'finalize_artifacts',
        ]);
        expect(getNextInitialAnalysisPhase('inspect_structure'))
            .toBe('propose_cleaning');
        expect(getNextInitialAnalysisPhase('finalize_artifacts')).toBeNull();
    });

    it('accepts app-owned dataset references without a duplicate CSV payload', () => {
        const request = createRequest();

        expect(() => assertInitialAnalysisRunRequest(request)).not.toThrow();
        expect(request).not.toHaveProperty('csvData');
        expect(request).not.toHaveProperty('rows');
    });

    it.each(['csvData', 'rawCsvData', 'rows', 'data', 'file'])(
        'rejects the duplicate payload field %s',
        field => {
            expect(() => assertInitialAnalysisRunRequest({
                ...createRequest(),
                [field]: [{ amount: 1 }],
            })).toThrow(`initial_analysis_duplicate_payload_${field}`);
        },
    );

    it('publishes the accepted cleaning, hypothesis, card, repair, and finalization budgets', () => {
        expect(INITIAL_ANALYSIS_BUDGET_LIMITS).toEqual({
            cleaningRounds: 3,
            hypotheses: 8,
            acceptedCards: 5,
            equivalentQueryRepairsPerHypothesis: 2,
            reservedFinalizationSteps: 1,
        });
        expect(createInitialAnalysisBudgetState()).toEqual({
            cleaningRoundsUsed: 0,
            hypothesesUsed: 0,
            acceptedCards: 0,
            equivalentQueryRepairsByHypothesis: {},
            finalizationStepsReserved: 1,
        });
    });

    it('rejects budget state that exceeds a declared limit', () => {
        const budget = createInitialAnalysisBudgetState();
        budget.equivalentQueryRepairsByHypothesis['hypothesis-1'] = 3;

        expect(() => assertInitialAnalysisBudgetState(budget))
            .toThrow('initial_analysis_budget_query_repairs_hypothesis-1_invalid');
    });

    it('creates a sanitized checkpoint host state without data or credentials', () => {
        const checkpoint = createInitialAnalysisCheckpointHostState();

        expect(checkpoint).toEqual({
            runKind: 'initial_analysis',
            runtimeRunId: '',
            traceId: '',
            phase: 'inspect_structure',
            phaseAttempt: 1,
            budget: createInitialAnalysisBudgetState(),
            committedTransformationIds: [],
            materializedCardFingerprints: [],
            warningCodes: [],
            completedToolNames: [],
        });
        expect(checkpoint).not.toHaveProperty('rows');
        expect(checkpoint).not.toHaveProperty('queryResults');
        expect(checkpoint).not.toHaveProperty('apiKey');
    });

    it('exposes only visible terminal statuses', () => {
        const outcome: InitialAnalysisRunOutcome = {
            status: 'degraded',
            currentDatasetVersion: 'version-2',
            finalDatasetVersion: 'version-2',
            trustedCardIds: ['card-1'],
            warnings: [{
                code: 'evidence_degraded',
                message: 'One evidence query could not be confirmed.',
                phase: 'execute_evidence',
            }],
            runtimeRunId: 'runtime-run-1',
            traceId: 'trace-1',
        };

        expect(isInitialAnalysisTerminalStatus(outcome.status)).toBe(true);
        expect(isInitialAnalysisTerminalStatus('running')).toBe(false);
    });
});
