import type { AiAction, CsvData, DataPreparationPlan, ReportIntakeIr, ReportShapeProfile, ReshapeHypothesis, RuntimeTableAssessment, VerificationReport } from '../../../types';
import { detectReportShape } from '../reportShapeDetector';
import { getVerificationFailureReason } from '../reportShapeVerification';
import { buildDeterministicCleaningFallbackAction } from './deterministicCleaningFallback';
import { evaluateCleaningIrGate, type CleaningIrGateResult } from './cleaningIrGate';
import type { CleaningRuntimeState } from './cleaningRuntimePolicy';

export type CleaningStrategyKind =
    | 'already_valid'
    | 'deterministic_cleanup'
    | 'deterministic_reshape'
    | 'llm_guided';

export type CleaningStrategyDecision = {
    kind: CleaningStrategyKind;
    targetShape?: ReshapeHypothesis['targetShape'];
    reason: string;
    verificationGap: string | null;
    promptGuidance: string;
    preferredActionSource?: 'raw' | 'cleaned';
    preferredAction?: AiAction | null;
    irGate?: CleaningIrGateResult;
};

export type CleaningTurnOutcome = {
    phase: 'inspect' | 'edit' | 'verify';
    outcome: 'continue' | 'complete' | 'fail';
    strategyKind: CleaningStrategyKind;
    recoveryMode: 'model_selected' | 'deterministic_recovery';
    reason?: string | null;
};

type CleaningStrategyResolverInput = {
    rawData: CsvData | null;
    cleanedData: CsvData | null;
    rawIntakeIr?: ReportIntakeIr | null;
    runtimeTableAssessment?: RuntimeTableAssessment | null;
    dataPreparationPlan?: DataPreparationPlan | null;
    runtimeState?: CleaningRuntimeState | null;
    verificationReport: VerificationReport;
    reportShapeProfile: ReportShapeProfile | null;
    reshapeHypotheses: ReshapeHypothesis[];
};

const RESHAPE_SEMANTIC_LOSS_SIGNAL_KEYS = new Set([
    'multi_header_layer_retention_rate',
    'summary_series_exclusion_rate',
    'hierarchy_depth_retention_rate',
]);

const getPreferredActionShape = (action: AiAction | null | undefined) => {
    if (action?.type !== 'tool_call' || !Array.isArray(action.args?.operations)) return 'cleanup';
    return action.args.operations.some(operation => operation?.type === 'unpivot_columns')
        ? 'reshape'
        : 'cleanup';
};

const summarizePreferredAction = (action: AiAction | null | undefined) => {
    if (action?.type !== 'tool_call' || !Array.isArray(action.args?.operations) || action.args.operations.length === 0) {
        return 'No bounded deterministic action is currently available.';
    }
    const operationTypes = action.args.operations
        .map(operation => String(operation?.type ?? '').trim())
        .filter(Boolean);
    return `Preferred bounded action: data.mutate with ${operationTypes.join(' -> ')}.`;
};

export const resolveCleaningStrategy = ({
    rawData,
    cleanedData,
    rawIntakeIr,
    runtimeTableAssessment,
    verificationReport,
    reportShapeProfile,
    reshapeHypotheses,
}: CleaningStrategyResolverInput): CleaningStrategyDecision => {
    const verificationGap = getVerificationFailureReason(verificationReport);
    const targetShape = reshapeHypotheses[0]?.targetShape;
    const cleanedProfile = detectReportShape(cleanedData);
    const hasResidualNoise = cleanedProfile.rowRoles.some(candidate => ['comment', 'noise'].includes(candidate.role));

    // ── Evaluate the shared IR-first gate ──
    const irGate = evaluateCleaningIrGate({
        rawCsvData: rawData,
        rawIntakeIr: rawIntakeIr ?? null,
        reportShapeProfile,
    });

    // ── Runtime assessment enforcement ──
    // If a RuntimeTableAssessment exists, its status governs strategy.
    if (runtimeTableAssessment) {
        if (runtimeTableAssessment.status === 'ambiguous') {
            return {
                kind: 'llm_guided',
                targetShape,
                reason: `RuntimeTableAssessment is ambiguous: ${runtimeTableAssessment.reason}. Must stay in inspect-first.`,
                verificationGap,
                promptGuidance: 'Strategy: llm_guided (inspect-first). RuntimeTableAssessment is ambiguous — continue inspection to resolve structure before any mutation.',
                preferredActionSource: 'cleaned',
                preferredAction: null,
                irGate,
            };
        }
        if (runtimeTableAssessment.status === 'confirmed') {
            // already_valid: confirmed + verification passes + no reshape/cleanup needed
            if (verificationReport.overallStatus === 'pass' && !hasResidualNoise
                && !runtimeTableAssessment.requiresReshape && !runtimeTableAssessment.requiresCleanupOnly) {
                return {
                    kind: 'already_valid',
                    targetShape,
                    reason: 'RuntimeTableAssessment confirmed, verification passes, no reshape or cleanup needed.',
                    verificationGap: null,
                    promptGuidance: 'The current cleaned.csv already satisfies verification. Verify once, then complete without editing.',
                    preferredActionSource: 'cleaned',
                    preferredAction: null,
                    irGate,
                };
            }
        }
    }

    // ── already_valid: verification passes, no residual noise ──
    // When a RuntimeTableAssessment has been produced (post-inspect), it must
    // be 'confirmed' for already_valid. If assessment exists but is
    // ambiguous/rejected, already_valid is blocked.
    // When no assessment exists yet (pre-inspect first turn), allow already_valid
    // so datasets that are genuinely already clean can complete immediately.
    if (verificationReport.overallStatus === 'pass' && !hasResidualNoise) {
        const assessmentBlocksAlreadyValid = runtimeTableAssessment != null
            && runtimeTableAssessment.status !== 'confirmed';
        if (!assessmentBlocksAlreadyValid) {
            return {
                kind: 'already_valid',
                targetShape,
                reason: runtimeTableAssessment?.status === 'confirmed'
                    ? 'RuntimeTableAssessment confirmed and verification passes.'
                    : 'Verification already passes for the current cleaned dataset.',
                verificationGap: null,
                promptGuidance: 'The current cleaned.csv already satisfies verification. Verify once, then complete without editing.',
                preferredActionSource: 'cleaned',
                preferredAction: null,
                irGate,
            };
        }
        // Assessment exists but not confirmed — fall through to inspect-first routing.
    }

    // ── IR-first: stable single-layer detail → inspect-first llm_guided ──
    // When IR confirms a stable single-layer detail table, do NOT allow
    // reportShapeDetector to misclassify it as wide/mixed and trigger reshape.
    if (irGate.isStableSingleLayerDetail && !irGate.allowsDeterministicReshape) {
        return {
            kind: 'llm_guided',
            targetShape,
            reason: `IR confirms stable single-layer detail; reshape blocked. ${irGate.reason}`,
            verificationGap,
            promptGuidance: [
                'Strategy: llm_guided (inspect-first).',
                'IR confirms this is a stable single-layer detail table.',
                'Do NOT reshape or unpivot. First inspect the cleaned dataset, then apply only cleanup mutations if needed.',
                verificationGap ? `Close this verification gap: ${verificationGap}.` : '',
            ].filter(Boolean).join(' '),
            preferredActionSource: 'cleaned',
            preferredAction: null,
            irGate,
        };
    }

    const requiresRawSemanticRepair = verificationReport.signals.some(signal =>
        RESHAPE_SEMANTIC_LOSS_SIGNAL_KEYS.has(signal.key) && signal.status === 'fail',
    );
    // Only use raw source when the reshape gate is open AND the action
    // actually reshapes. Cleanup-only actions must stay on cleaned data.
    const reshapeGatePassesForRaw = requiresRawSemanticRepair && rawData && irGate.allowsDeterministicReshape;
    const fallbackSourceData = reshapeGatePassesForRaw ? rawData : cleanedData;
    const preferredAction = buildDeterministicCleaningFallbackAction(fallbackSourceData, rawIntakeIr);
    const preferredActionShape = getPreferredActionShape(preferredAction);
    if (preferredAction) {
        const kind = preferredActionShape === 'reshape' ? 'deterministic_reshape' : 'deterministic_cleanup';

        // IR gate override: if fallback wants reshape but IR disallows it, downgrade
        if (kind === 'deterministic_reshape' && !irGate.allowsDeterministicReshape) {
            return {
                kind: 'llm_guided',
                targetShape,
                reason: `Deterministic reshape blocked by IR gate. ${irGate.reason}`,
                verificationGap,
                promptGuidance: [
                    'Strategy: llm_guided (inspect-first).',
                    'IR gate blocked deterministic reshape — no multi-header or repeated-header evidence in IR.',
                    'Inspect the current cleaned dataset, then apply only cleanup mutations if needed.',
                    verificationGap ? `Close this verification gap: ${verificationGap}.` : '',
                ].filter(Boolean).join(' '),
                preferredActionSource: 'cleaned',
                preferredAction: null,
                irGate,
            };
        }

        // preferredActionSource = 'raw' only when reshape gate passed and
        // the action is a reshape; cleanup-only stays on cleaned.
        const useRawSource = reshapeGatePassesForRaw && kind === 'deterministic_reshape';
        const shapeReason = reportShapeProfile
            ? `Detected ${reportShapeProfile.primaryKind} with verification gap: ${verificationGap ?? 'unknown gap'}.`
            : `Verification gap: ${verificationGap ?? 'unknown gap'}.`;
        return {
            kind,
            targetShape,
            reason: shapeReason,
            verificationGap,
            promptGuidance: [
                `Strategy: ${kind}.`,
                shapeReason,
                summarizePreferredAction(preferredAction),
                'Stay agent-led: inspect if needed, then execute the bounded data.mutate action instead of inventing a new freeform mutation.',
            ].join(' '),
            preferredActionSource: useRawSource ? 'raw' : 'cleaned',
            preferredAction,
            irGate,
        };
    }

    return {
        kind: 'llm_guided',
        targetShape,
        reason: reportShapeProfile
            ? `No bounded deterministic action was available for ${reportShapeProfile.primaryKind}.`
            : 'No bounded deterministic action was available.',
        verificationGap,
        promptGuidance: [
            `Strategy: llm_guided.`,
            verificationGap ? `Close this verification gap: ${verificationGap}.` : 'Inspect the current cleaned dataset and determine the next bounded mutation.',
            'Use the existing report context, shape profile, and allowed tools to decide the next move.',
        ].join(' '),
        preferredActionSource: 'cleaned',
        preferredAction: null,
        irGate,
    };
};
