import type { AppStore } from '../../../store/useAppStore';
import type {
    CsvData,
    DataAnalysisSessionState,
    EvidenceHarnessContext,
} from '../../../types';
import type { TopicProcessingStepRecord } from '../planning/topicProcessor';
import { ensureDuckDbSessionSync } from '../../duckdb/storeSessionSync';
import { createWorkerDiagnosticsTelemetryReporter } from '../../workers/workerDiagnostics';
import { SqlAutoAnalysisError } from '../planning/planGenerator';
import type { DataInvestigationFindings } from './dataInvestigationHarness';
import {
    appendDataAnalysisStep,
    appendAnalysisQueryHistory,
} from './dataAnalysisSessionState';
import {
    DATA_ANALYSIS_FINALIZE_RESERVE_STEPS,
    DATA_ANALYSIS_MAX_TOPIC_ROUNDS,
} from './dataAnalysisPolicy';
import { recordRuntimeEvent } from './runtimeHelpers';

export type StoreApi = {
    getState: () => AppStore;
    setState: (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;
};

export interface DuckDbAnalysisBinding {
    tableName: string;
    loadVersion: string;
}

export interface DataAnalysisSessionRunResult {
    session: DataAnalysisSessionState;
    semanticData: CsvData;
    binding: DuckDbAnalysisBinding;
    acceptedCardCount: number;
}

const DUCKDB_STALE_ASSET_HINT = 'If this happened right after a rebuild, refresh the page or restart preview so the browser loads the latest DuckDB worker asset.';

/**
 * Computes card yield metrics after an analysis session.
 * Exported for unit testing — the logic is used inside runDataAnalysisSession.
 */
export const computeCardYieldMetric = (
    cardsProduced: number,
    topicsAttempted: number,
    cardsFailed: number,
) => {
    const yieldRate = topicsAttempted > 0 ? cardsProduced / topicsAttempted : 0;
    return {
        cardsProduced,
        topicsAttempted,
        cardsFailed,
        yieldRate,
        /** True when more than half of attempted hypotheses produced no card. */
        shouldFlagLow: topicsAttempted > 0 && yieldRate < 0.5,
    };
};

export const explainDuckDbUnavailableReason = (fallbackReason: string | null | undefined) => {
    const reason = fallbackReason || 'Dataset could not be loaded into DuckDB.';
    if (/duckdb worker crashed|mime type|corrupted_content|failed to fetch|worker task .* timed out/i.test(reason)) {
        return `${reason} ${DUCKDB_STALE_ASSET_HINT}`;
    }
    return reason;
};

export const syncSessionState = (store: StoreApi, session: DataAnalysisSessionState, isActive = true) => {
    // PERF-101: columnRegistry is NOT rebuilt per-step — it doesn't change
    // during the hypothesis loop (no columns added/removed, semantic snapshot stable).
    // It's rebuilt once at session end via the final syncSessionState call in
    // dataAnalysisSessionRunner.ts. This avoids ~13s of main-thread blocking
    // from buildEffectiveColumnRegistryFromState (O(rows×cols) per call × 16 calls).
    store.setState(state => ({
        activeAnalysisSession: isActive ? session : null,
        latestAnalysisSession: session,
        visibleAnalysisTrace: session.trace,
        analysisSessionHistory: isActive
            ? state.analysisSessionHistory ?? []
            : [
                ...(state.analysisSessionHistory ?? []).filter(entry => entry.runId !== session.runId),
                session,
            ].slice(-20),
    }));
};

export const SEMANTIC_DIAGNOSTIC_REASON = 'Semantic screening did not identify a safe business grain for trusted narrative analysis.';

export const buildHarnessCoverageState = (
    coverageMetric: DataInvestigationFindings['coverageMetric'] | null | undefined,
): DataAnalysisSessionState['harnessCoverage'] => {
    if (!coverageMetric) {
        return null;
    }
    const forcedDiagnostic = coverageMetric.attempted > 0 && coverageMetric.successRate < 0.5;
    return {
        ...coverageMetric,
        forcedDiagnostic,
        reason: forcedDiagnostic
            ? `Harness coverage degraded: only ${coverageMetric.succeeded}/${coverageMetric.attempted} phases succeeded (${Math.round(coverageMetric.successRate * 100)}%).`
            : null,
    };
};

export const resolveAnalysisMode = (params: {
    semanticDiagnosticMode: boolean;
    harnessCoverage: DataAnalysisSessionState['harnessCoverage'];
}) => {
    if (params.harnessCoverage?.forcedDiagnostic) {
        return {
            analysisMode: 'diagnostic' as const,
            analysisModeReason: params.harnessCoverage.reason,
            effectiveDiagnosticMode: true,
        };
    }
    if (params.semanticDiagnosticMode) {
        return {
            analysisMode: 'diagnostic' as const,
            analysisModeReason: SEMANTIC_DIAGNOSTIC_REASON,
            effectiveDiagnosticMode: true,
        };
    }
    return {
        analysisMode: 'business' as const,
        analysisModeReason: null,
        effectiveDiagnosticMode: false,
    };
};

export const resolveTopicRoundLimit = (harnessSummary: EvidenceHarnessContext | null | undefined) => {
    if (!harnessSummary) {
        return DATA_ANALYSIS_MAX_TOPIC_ROUNDS;
    }
    if (harnessSummary.signalConfidence === 'low') {
        return 1;
    }
    if (harnessSummary.reportShapeClass === 'hierarchical_statement' || harnessSummary.reportShapeClass === 'wide_pivot') {
        return Math.min(2, DATA_ANALYSIS_MAX_TOPIC_ROUNDS);
    }
    return DATA_ANALYSIS_MAX_TOPIC_ROUNDS;
};

export const resolveSuggestedPivotsForDataset = (
    data: CsvData,
    findings: DataInvestigationFindings | null | undefined,
) => data.backing?.readOnly
    ? []
    : findings?.runtimeDirectives.suggestedPivots ?? [];

export const requireDuckDbBinding = async (store: StoreApi, dataForAnalysis: CsvData) => {
    store.setState(state => ({
        duckDbSessionStatus: {
            ...state.duckDbSessionStatus,
            status: 'binding',
            fallbackReason: null,
        },
    }));
    const sync = await ensureDuckDbSessionSync(store, dataForAnalysis, createWorkerDiagnosticsTelemetryReporter(store));
    if (sync.engine !== 'duckdb' || !sync.tableName || !sync.loadVersion) {
        throw new SqlAutoAnalysisError(
            'duckdb_unavailable',
            `Automatic analysis requires DuckDB. ${explainDuckDbUnavailableReason(sync.fallbackReason)}`,
            { analysisEngine: 'duckdb', duckDbRequired: true },
        );
    }
    return {
        tableName: sync.tableName,
        loadVersion: sync.loadVersion,
    };
};

export const buildSessionTraceRecorder = (
    store: StoreApi,
    getSession: () => DataAnalysisSessionState,
    setSession: (session: DataAnalysisSessionState) => void,
    options?: { suppressSync?: boolean },
) => (record: TopicProcessingStepRecord) => {
    const session = getSession();
    if (session.stepsUsed >= session.maxSteps - DATA_ANALYSIS_FINALIZE_RESERVE_STEPS) {
        return '';
    }

    const { session: nextSession, step } = appendDataAnalysisStep(session, {
        type: record.type,
        status: record.status,
        inputSummary: record.inputSummary,
        outputSummary: record.outputSummary,
        inputSummaryI18n: record.inputSummaryI18n,
        outputSummaryI18n: record.outputSummaryI18n,
        labelI18n: record.labelI18n,
        whyI18n: record.whyI18n,
        decision: record.decision,
        queryRef: record.queryRef ?? null,
        hypothesisId: record.hypothesisId ?? null,
        reasonCodes: record.reasonCodes ?? [],
    });

    let updatedSession = nextSession;
    if (record.querySignature && record.semanticSignature) {
        updatedSession = appendAnalysisQueryHistory(updatedSession, {
            stepId: step.id,
            hypothesisId: record.hypothesisId ?? null,
            title: record.queryTitle ?? step.outputSummary,
            queryMode: record.queryMode ?? 'aggregate',
            sqlPreview: record.queryRef ?? null,
            querySignature: record.querySignature,
            semanticSignature: record.semanticSignature,
        });
    }

    setSession(updatedSession);
    // PERF-301: When suppressSync is true, skip store.setState to avoid ~2.3s
    // re-render per recordStep. Session state is flushed once per hypothesis
    // by the main loop's batched setState.
    if (!options?.suppressSync) {
        syncSessionState(store, updatedSession, true);
    }
    store.getState().logTelemetryEvent?.({
        stage: 'planner_ready',
        responseType: 'analysis_step',
        detail: `${record.type}:${record.status}`,
        meta: {
            runId: updatedSession.runId,
            stepId: step.id,
            stepType: record.type,
            hypothesisId: record.hypothesisId ?? null,
            decision: record.decision ?? null,
            reasonCodes: record.reasonCodes ?? [],
        },
        runId: updatedSession.runId,
        stepId: step.id,
    });
    return step.id;
};
