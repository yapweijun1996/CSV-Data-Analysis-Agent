import type {
    DataAnalysisNextStepDecision,
    DataAnalysisStep,
    DataAnalysisStepType,
    VisibleAnalysisTraceEntry,
} from '../../../types';
import { buildSurfaceTraceContract } from './runtimeControlPlaneContract';

const deriveLabelFromStepType = (type: DataAnalysisStepType): string =>
    type.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

const STEP_LABEL_I18N_KEYS: Record<DataAnalysisStepType, string> = {
    observe_dataset: 'analysis_trace_label_observe_dataset',
    build_semantic_understanding: 'analysis_trace_label_build_semantic_understanding',
    screen_row_quality: 'analysis_trace_label_screen_row_quality',
    explore_data_with_sql: 'analysis_trace_label_explore_data_with_sql',
    propose_hypotheses: 'analysis_trace_label_propose_hypotheses',
    select_hypothesis: 'analysis_trace_label_select_hypothesis',
    plan_probe_query: 'analysis_trace_label_plan_probe_query',
    execute_probe_query: 'analysis_trace_label_execute_probe_query',
    evaluate_evidence: 'analysis_trace_label_evaluate_evidence',
    refine_hypothesis: 'analysis_trace_label_refine_hypothesis',
    dedupe_candidate: 'analysis_trace_label_dedupe_candidate',
    plan_presentation: 'analysis_trace_label_plan_presentation',
    emit_standard_card: 'analysis_trace_label_emit_standard_card',
    finalize_session: 'analysis_trace_label_finalize_session',
    stop_session: 'analysis_trace_label_stop_session',
};

const STEP_WHYS_I18N_KEYS: Record<DataAnalysisStepType, string> = {
    observe_dataset: 'analysis_trace_why_observe_dataset',
    build_semantic_understanding: 'analysis_trace_why_build_semantic_understanding',
    screen_row_quality: 'analysis_trace_why_screen_row_quality',
    explore_data_with_sql: 'analysis_trace_why_explore_data_with_sql',
    propose_hypotheses: 'analysis_trace_why_propose_hypotheses',
    select_hypothesis: 'analysis_trace_why_select_hypothesis',
    plan_probe_query: 'analysis_trace_why_plan_probe_query',
    execute_probe_query: 'analysis_trace_why_execute_probe_query',
    evaluate_evidence: 'analysis_trace_why_evaluate_evidence',
    refine_hypothesis: 'analysis_trace_why_refine_hypothesis',
    dedupe_candidate: 'analysis_trace_why_dedupe_candidate',
    plan_presentation: 'analysis_trace_why_plan_presentation',
    emit_standard_card: 'analysis_trace_why_emit_standard_card',
    finalize_session: 'analysis_trace_why_finalize_session',
    stop_session: 'analysis_trace_why_stop_session',
};

export const buildVisibleAnalysisTraceEntry = (step: DataAnalysisStep): VisibleAnalysisTraceEntry => ({
    stepId: step.id,
    stepIndex: step.index,
    label: deriveLabelFromStepType(step.type),
    labelI18n: step.labelI18n ?? {
        key: STEP_LABEL_I18N_KEYS[step.type],
    },
    status: step.status,
    summary: step.inputSummary,
    summaryI18n: step.inputSummaryI18n,
    whyThisStep: '',
    whyI18n: step.whyI18n ?? {
        key: STEP_WHYS_I18N_KEYS[step.type],
    },
    result: step.outputSummary,
    resultI18n: step.outputSummaryI18n,
    nextDecision: step.decision ?? null,
    queryPreview: step.queryRef,
    reasonCodes: step.reasonCodes,
    hypothesisId: step.hypothesisId,
    traceContract: step.traceContract ?? buildSurfaceTraceContract({
        detail: {
            stepType: step.type,
            stepStatus: step.status,
            hypothesisId: step.hypothesisId ?? null,
            stage: step.type,
        },
        reasonCode: step.reasonCodes[0] ?? step.type,
        source: 'analysis_runtime_trace',
    }),
});
