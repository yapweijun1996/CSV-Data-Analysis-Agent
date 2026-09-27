import type {
    CleaningRun,
    ColumnProfile,
    PipelineOutcome,
    ReportStructureResolution,
} from '../../types';
import { evaluatePostCleaningGateRelaxation } from './intakeDiagnosticsPolicy';

type PipelineVerificationState = {
    passed: boolean;
    signalKey?: string | null;
} | null | undefined;

const HUMAN_CONFIRMABLE_INTAKE_BLOCKS = new Set([
    'header_shape_drift',
    'intake_structure_uncertain',
    'intake_diagnostics_missing',
]);

const HUMAN_CONFIRMABLE_VERIFICATION_SIGNALS = new Set([
    'header_band_resolved',
    // Boolean terminal alias for multi_header_layer_retention_rate.
    'label_layer_retention_complete',
    'multi_header_layer_retention_rate',
    'summary_series_exclusion_rate',
    'hierarchy_depth_retention_rate',
    'noise_leakage_rate',
    'repeated_header_leakage_rate',
    'summary_like_series_key_leakage',
    'wide_crosstab_persistence',
    'wide_reshape_contract_complete',
]);

export const resolvePipelineOutcome = (input: {
    reportStructureResolution: ReportStructureResolution | null | undefined;
    intakeGuard: {
        shouldBlockAutomaticAnalysis: boolean;
        blockingReasonCode?: string | null;
        analysisBlockedMessage?: string | null;
        severity: 'clear' | 'warning' | 'blocked';
    };
    cleaningRun: CleaningRun | null | undefined;
    sqlPrecheckStatus?: 'pending' | 'passed' | 'warning' | 'blocked' | null | undefined;
    verificationReport?: PipelineVerificationState;
    hasCanonicalData: boolean;
    /** Post-cleaning evidence for gate relaxation (optional — enables evidence-based unblocking). */
    columnProfiles?: ColumnProfile[];
    cleanedRowCount?: number;
}): PipelineOutcome => {
    const structure = input.reportStructureResolution;
    const sqlStatus = input.sqlPrecheckStatus ?? input.cleaningRun?.sqlPrecheckStatus ?? null;
    const profiles = input.columnProfiles ?? [];
    const postCleaningRelaxation = evaluatePostCleaningGateRelaxation({
        cleaningCompleted: input.cleaningRun?.status === 'completed',
        sqlPrecheckPassed: ['passed', 'warning'].includes(sqlStatus ?? ''),
        cleanedRowCount: input.cleanedRowCount ?? 0,
        queryableMetricCount: profiles.filter(p =>
            ['numerical', 'currency', 'percentage'].includes(p.type),
        ).length,
        queryableDimensionCount: profiles.filter(p =>
            ['categorical', 'date', 'time'].includes(p.type),
        ).length,
        residualUnknownRowCount: input.cleaningRun?.residualUnknownRowCount ?? 0,
    });
    const confirmedSource = structure?.source === 'human_confirmed' || structure?.source === 'ai_confirmed';
    const confirmedStructureClearsIntakeBlock = Boolean(
        confirmedSource
        && !structure!.requiresHumanReview
        && input.intakeGuard.blockingReasonCode
        && HUMAN_CONFIRMABLE_INTAKE_BLOCKS.has(input.intakeGuard.blockingReasonCode),
    );
    const confirmedStructureClearsVerificationBlock = Boolean(
        confirmedSource
        && !structure!.requiresHumanReview
        && input.verificationReport?.signalKey
        && HUMAN_CONFIRMABLE_VERIFICATION_SIGNALS.has(input.verificationReport.signalKey),
    );

    if (input.cleaningRun?.status === 'failed') {
        return {
            status: 'cleaning_failed',
            canAutoAnalyze: false,
            severity: 'blocked',
            reasonCode: 'cleaning_failed',
            message: input.cleaningRun.userFacingMessage
                ?? input.cleaningRun.lastError
                ?? 'Cleaning failed before analysis readiness could be finalized.',
        };
    }

    if (structure?.requiresHumanReview) {
        if (postCleaningRelaxation.canRelax) {
            return {
                status: 'degraded_but_usable',
                canAutoAnalyze: true,
                severity: 'warning',
                reasonCode: structure.blockingReasons[0] ?? 'needs_structure_review',
                message: `Structure review is recommended, but post-cleaning evidence is strong enough to continue with visible caveats. ${postCleaningRelaxation.reason}`,
            };
        }
        return {
            status: 'needs_structure_review',
            canAutoAnalyze: false,
            severity: 'warning',
            reasonCode: structure.blockingReasons[0] ?? 'needs_structure_review',
            message: `Structure review is required before automatic analysis. ${structure.decision.reason}`,
        };
    }

    if (
        input.intakeGuard.shouldBlockAutomaticAnalysis
        && !confirmedStructureClearsIntakeBlock
    ) {
        return {
            status: 'blocked_by_intake',
            canAutoAnalyze: false,
            severity: 'blocked',
            reasonCode: input.intakeGuard.blockingReasonCode ?? 'blocked_by_intake',
            message: input.intakeGuard.analysisBlockedMessage ?? 'Automatic analysis is blocked by intake diagnostics.',
        };
    }

    if (!input.hasCanonicalData) {
        // Apply post-cleaning gate relaxation: if cleaning completed with strong
        // evidence (SQL passes, queryable metrics + dimensions exist), degrade
        // gracefully instead of hard-blocking.  This covers headerless files,
        // ambiguous runtime boundaries, and other cases where structure is uncertain
        // but the data is actually queryable.
        if (postCleaningRelaxation.canRelax) {
            return {
                status: 'degraded_but_usable',
                canAutoAnalyze: true,
                severity: 'warning',
                reasonCode: structure?.blockingReasons[0] ?? 'canonicalization_missing',
                message: `Structure verification is incomplete, but post-cleaning evidence is strong enough to proceed. ${postCleaningRelaxation.reason}`,
            };
        }
        return {
            status: 'blocked_by_shape_verification',
            canAutoAnalyze: false,
            severity: 'blocked',
            reasonCode: structure?.blockingReasons[0] ?? 'canonicalization_missing',
            message: 'Canonical dataset generation did not complete, so automatic analysis remains blocked.',
        };
    }

    if (
        input.verificationReport
        && input.verificationReport.passed === false
        && !confirmedStructureClearsVerificationBlock
    ) {
        return {
            status: 'blocked_by_shape_verification',
            canAutoAnalyze: false,
            severity: 'blocked',
            reasonCode: input.verificationReport.signalKey ?? 'shape_verification_failed',
            message: 'Shape verification failed after canonicalization.',
        };
    }

    if (sqlStatus === 'blocked') {
        return {
            status: 'degraded_but_usable',
            canAutoAnalyze: true,
            severity: 'warning',
            reasonCode: 'sql_precheck_blocked',
            message: 'Canonical dataset is ready, but SQL precheck blocked the preferred SQL path. Analysis can proceed with degraded guidance.',
        };
    }

    if (sqlStatus === 'warning') {
        return {
            status: 'degraded_but_usable',
            canAutoAnalyze: true,
            severity: 'warning',
            reasonCode: 'sql_precheck_warning',
            message: 'Canonical dataset is ready, but SQL precheck could not confirm the preferred SQL path. Analysis can proceed with degraded guidance.',
        };
    }

    if (sqlStatus === 'pending' || input.cleaningRun?.status === 'paused') {
        return {
            status: 'blocked_by_sql_precheck',
            canAutoAnalyze: false,
            severity: 'warning',
            reasonCode: 'sql_precheck_pending',
            message: 'Waiting for the final SQL readiness checks before automatic analysis continues.',
        };
    }

    return {
        status: 'ready',
        canAutoAnalyze: true,
        severity: 'info',
        reasonCode: 'ready',
        message: 'Canonical dataset and readiness checks are complete. Automatic analysis may continue.',
    };
};
