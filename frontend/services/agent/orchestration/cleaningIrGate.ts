/**
 * cleaningIrGate.ts
 *
 * Shared IR-first structural judgement for the cleaning pipeline.
 * All cleaning routing decisions (strategy resolver, deterministic fallback,
 * autonomous pipeline) consume this single gate so that reshape/cleanup/inspect
 * decisions are consistent and traceable.
 *
 * The reportShapeDetector may still provide auxiliary shape information,
 * but it can NOT independently trigger reshape when the IR gate disallows it.
 */

import type { CsvData, ReportIntakeIr, ReportShapeProfile } from '../../../types';

export interface CleaningIrGateResult {
    /** True when the IR confirms a stable, single-layer detail table with no structural anomalies. */
    isStableSingleLayerDetail: boolean;
    /** True when non-body segments (metadata, parameter, footer, blank, repeated_header) exist. */
    hasStructuralNoise: boolean;
    /** True when deterministic cleanup-only operations (drop rows, drop blanks) are safe. */
    allowsDeterministicCleanup: boolean;
    /** True only when the IR has explicit multi-header / repeated-header evidence for reshape. */
    allowsDeterministicReshape: boolean;
    /** True when the dataset should start from inspect phase rather than direct reshape. */
    requiresInspectFirst: boolean;
    /** Human-readable reason for the gate decision. */
    reason: string;
}

export interface CleaningIrGateInput {
    rawCsvData: CsvData | null;
    rawIntakeIr: ReportIntakeIr | null | undefined;
    reportShapeProfile: ReportShapeProfile | null;
}

const STRUCTURAL_NOISE_SEGMENT_KINDS = new Set([
    'metadata',
    'parameter',
    'footer',
    'blank',
    'repeated_header',
]);

/**
 * Evaluate the IR-first cleaning gate.
 *
 * This function is the single source of truth for whether the cleaning
 * pipeline may reshape, cleanup-only, or must inspect-first.
 */
export const evaluateCleaningIrGate = ({
    rawCsvData,
    rawIntakeIr,
    reportShapeProfile,
}: CleaningIrGateInput): CleaningIrGateResult => {
    // ── No IR available: conservative fallback ──
    // Without IR we have no structural evidence to justify reshape.
    // Block deterministic reshape so the shape-detector alone cannot
    // trigger false-positive reshapes (the exact bug this gate prevents).
    // Cleanup-only is still allowed when metadata noise is visible.
    if (!rawIntakeIr || !rawIntakeIr.provisionalTable) {
        const hasNoise = (rawCsvData?.metadataRows?.length ?? 0) > 0;
        return {
            isStableSingleLayerDetail: false,
            hasStructuralNoise: hasNoise,
            allowsDeterministicCleanup: hasNoise,
            allowsDeterministicReshape: false,
            requiresInspectFirst: true,
            reason: 'No intake IR or provisionalTable available; reshape blocked, inspect-first required.',
        };
    }

    const table = rawIntakeIr.provisionalTable;
    const diag = rawIntakeIr.diagnostics;

    // ── isStableSingleLayerDetail ──
    const isStableSingleLayerDetail =
        table.headerLayerRowIndexes.length === 0
        && table.repeatedHeaderRowIndexes.length === 0
        && diag.headerShapeDrift === false
        && diag.singleColumnFallbackApplied === false
        && diag.bodyEvidenceKind !== 'unknown';

    // ── hasStructuralNoise ──
    const segmentNoise = rawIntakeIr.segments.some(
        seg => STRUCTURAL_NOISE_SEGMENT_KINDS.has(seg.kind),
    );
    const metadataNoise = (rawCsvData?.metadataRows?.length ?? 0) > 0;
    const irMetadataNoise = table.metadataRowIndexes.length > 0
        || table.parameterRowIndexes.length > 0
        || table.repeatedHeaderRowIndexes.length > 0;
    const hasStructuralNoise = segmentNoise || metadataNoise || irMetadataNoise;

    // ── allowsDeterministicReshape ──
    // Only when IR has explicit multi-header or repeated-header evidence.
    // "series-label bands" are mapped as headerLayerRowIndexes for this round.
    const hasMultiHeaderEvidence = table.headerLayerRowIndexes.length > 0;
    const hasRepeatedHeaderEvidence = table.repeatedHeaderRowIndexes.length > 0;
    const allowsDeterministicReshape = hasMultiHeaderEvidence || hasRepeatedHeaderEvidence;

    // ── allowsDeterministicCleanup ──
    // Cleanup-only is allowed when there IS structural noise to clean,
    // regardless of whether reshape is allowed.
    const allowsDeterministicCleanup = hasStructuralNoise;

    // ── requiresInspectFirst ──
    // Stable single-layer detail tables that still have residual noise or
    // verification gaps should inspect first, not reshape.
    const requiresInspectFirst = isStableSingleLayerDetail && !allowsDeterministicReshape;

    // ── Build reason ──
    const reasons: string[] = [];
    if (isStableSingleLayerDetail) {
        reasons.push('IR confirms stable single-layer detail table');
    }
    if (hasMultiHeaderEvidence) {
        reasons.push(`IR has ${table.headerLayerRowIndexes.length} header layer row(s)`);
    }
    if (hasRepeatedHeaderEvidence) {
        reasons.push(`IR has ${table.repeatedHeaderRowIndexes.length} repeated header row(s)`);
    }
    if (hasStructuralNoise) {
        reasons.push('structural noise detected');
    }
    if (allowsDeterministicReshape) {
        reasons.push('deterministic reshape allowed by IR evidence');
    } else {
        reasons.push('deterministic reshape blocked — no IR reshape evidence');
    }
    if (reportShapeProfile) {
        reasons.push(`reportShapeDetector advisory: ${reportShapeProfile.primaryKind}`);
    }

    return {
        isStableSingleLayerDetail,
        hasStructuralNoise,
        allowsDeterministicCleanup,
        allowsDeterministicReshape,
        requiresInspectFirst,
        reason: reasons.join('; ') + '.',
    };
};
