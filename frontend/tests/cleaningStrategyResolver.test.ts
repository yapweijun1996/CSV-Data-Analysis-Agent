import { describe, expect, it } from 'vitest';
import type { CsvData, ReportIntakeIr, VerificationReport } from '../types';
import { buildCleaningVerificationReport } from '../services/agent/cleaningVerification';
import { resolveCleaningStrategy } from '../services/agent/orchestration/cleaningStrategyResolver';
import { detectReportShape } from '../services/agent/reportShapeDetector';
import { buildReshapeHypotheses } from '../services/agent/reportShapeHypothesis';
import { createMultiHeaderProjectMatrixCase, createMultiHeaderIntakeIr } from './reportShapeFixtures/cases';

// Minimal stable single-layer detail table fixture.
const stableDetailData: CsvData = {
    fileName: 'quotation_listing.csv',
    data: [
        { QuoNo: 'Q001', Customer: 'Acme', Amount: '1000.00' },
        { QuoNo: 'Q002', Customer: 'Beta', Amount: '2000.00' },
        { QuoNo: 'Q003', Customer: 'Gamma', Amount: '3000.00' },
    ],
    metadataRows: [],
    headerLayers: [],
    summaryRows: [],
    headerDepth: 1,
};

// IR confirming a stable single-layer detail table — no header layers, no repeated headers.
const stableDetailIr: ReportIntakeIr = {
    fileName: 'quotation_listing.csv',
    columnCount: 3,
    rawRows: [],
    normalizedRows: [],
    segments: [{ kind: 'body', rowStart: 0, rowEnd: 2, confidence: 0.95, notes: [] }],
    provisionalTable: {
        headerRowIndex: 0,
        headerLayerRowIndexes: [],
        bodyStartIndex: 1,
        summaryStartIndex: -1,
        repeatedHeaderRowIndexes: [],
        metadataRowIndexes: [],
        parameterRowIndexes: [],
    },
    diagnostics: {
        hasRepeatedHeader: false,
        hasParameterRowsBetweenHeaderAndBody: false,
        headerShapeDrift: false,
        singleColumnFallbackApplied: false,
        bodyEvidenceKind: 'numeric',
        segmentCountsByKind: { body: 1 },
        headerCandidates: [],
        bodyStartCandidates: [],
        evidenceStrength: 'moderate',
        fallbackReason: null,
    },
};

// A verification report that says "fail" so the resolver doesn't short-circuit to already_valid.
const failingVerification: VerificationReport = {
    overallStatus: 'fail',
    signals: [
        { key: 'row_count_preservation', status: 'fail', detail: { message: 'Row count mismatch.' }, value: 0.5 },
    ],
    blockingSignalKeys: [],
};

describe('cleaningStrategyResolver', () => {
    it('uses raw report semantics to rebuild a deterministic reshape after label layers are lost', () => {
        const testCase = createMultiHeaderProjectMatrixCase();
        const broken = testCase.cleanedBroken.missingSeriesLabel!;
        const profile = detectReportShape(testCase.rawLike);
        const decision = resolveCleaningStrategy({
            rawData: testCase.rawLike,
            cleanedData: broken.cleanedData,
            rawIntakeIr: createMultiHeaderIntakeIr(),
            verificationReport: buildCleaningVerificationReport(testCase.rawLike, broken.cleanedData, broken.plan),
            reportShapeProfile: profile,
            reshapeHypotheses: buildReshapeHypotheses(profile, testCase.rawLike),
        });

        expect(decision.kind).toBe('deterministic_reshape');
        expect(decision.verificationGap).toBe('Multi-header label layers were not preserved during reshaping.');
        expect(decision.preferredActionSource).toBe('raw');
        expect(decision.preferredAction).toMatchObject({
            type: 'tool_call',
            toolName: 'data.mutate',
            args: {
                operations: [
                    { type: 'drop_rows_by_index' },
                    { type: 'promote_header_row' },
                    { type: 'drop_blank_rows' },
                    {
                        type: 'unpivot_columns',
                        labelColumns: [{ outputColumn: 'SeriesLabelL1' }],
                    },
                ],
            },
        });
        expect(decision.irGate?.allowsDeterministicReshape).toBe(true);
    });

    it('routes stable single-layer detail tables to inspect-first and blocks reshape', () => {
        const profile = detectReportShape(stableDetailData);
        const decision = resolveCleaningStrategy({
            rawData: stableDetailData,
            cleanedData: stableDetailData,
            rawIntakeIr: stableDetailIr,
            verificationReport: failingVerification,
            reportShapeProfile: profile,
            reshapeHypotheses: [],
        });

        expect(decision.kind).toBe('llm_guided');
        expect(decision.preferredAction).toBeNull();
        expect(decision.irGate?.isStableSingleLayerDetail).toBe(true);
        expect(decision.irGate?.allowsDeterministicReshape).toBe(false);
        expect(decision.irGate?.requiresInspectFirst).toBe(true);
        expect(decision.reason).toContain('stable single-layer detail');
    });

    it('blocks reshape when no rawIntakeIr is provided', () => {
        const testCase = createMultiHeaderProjectMatrixCase();
        const broken = testCase.cleanedBroken.missingSeriesLabel!;
        const profile = detectReportShape(testCase.rawLike);
        const decision = resolveCleaningStrategy({
            rawData: testCase.rawLike,
            cleanedData: broken.cleanedData,
            // rawIntakeIr deliberately omitted
            verificationReport: buildCleaningVerificationReport(testCase.rawLike, broken.cleanedData, broken.plan),
            reportShapeProfile: profile,
            reshapeHypotheses: buildReshapeHypotheses(profile, testCase.rawLike),
        });

        // Without IR, reshape must be blocked even though the shape detector sees a wide matrix
        expect(decision.kind).not.toBe('deterministic_reshape');
        expect(decision.irGate?.allowsDeterministicReshape).toBe(false);
        expect(decision.preferredAction).toBeNull();
    });

    it('does not switch preferredActionSource to raw for cleanup-only actions', () => {
        // Use a stable detail table with a semantic loss signal but no reshape evidence.
        // Even with a failing label-layer signal, source should stay cleaned
        // because the IR gate blocks reshape.
        const profile = detectReportShape(stableDetailData);
        const verificationWithSemanticLoss: VerificationReport = {
            overallStatus: 'fail',
            signals: [
                { key: 'multi_header_layer_retention_rate', status: 'fail', detail: { message: 'Label layers not preserved.' }, value: 0 },
            ],
            blockingSignalKeys: [],
        };
        const decision = resolveCleaningStrategy({
            rawData: stableDetailData,
            cleanedData: stableDetailData,
            rawIntakeIr: stableDetailIr,
            verificationReport: verificationWithSemanticLoss,
            reportShapeProfile: profile,
            reshapeHypotheses: [],
        });

        // The IR gate blocks reshape, so even with semantic loss signals
        // the source must not flip to raw.
        expect(decision.preferredActionSource).toBe('cleaned');
        expect(decision.irGate?.allowsDeterministicReshape).toBe(false);
    });
});
