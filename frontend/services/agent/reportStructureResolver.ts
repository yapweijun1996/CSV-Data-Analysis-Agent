import type {
    ReportBoundary,
    ReportBoundaryConfidence,
    ReportNormalizationPlan,
    ReportRowRole,
    ReportRowRoleAssignment,
    ReportStructureResolution,
    ResolveReportStructureInput,
} from '../../types';
import { inspectCsvRows } from './rowInspectionService';
import { buildDeterministicNormalizationPlan, hasCalendarPeriodBandPattern, hasNarrowComparisonWindowBandRow, inferRowTableShapeFromHeaders } from './reportStructureNormalization';
import { verifyReportStructureProposal } from './reportStructureProposalVerifier';

const clampConfidence = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const buildBoundaryFromIntake = (input: ResolveReportStructureInput): ReportBoundary | null => {
    const table = input.rawIntakeIr?.provisionalTable;
    if (!table) {
        return null;
    }

    return {
        headerRowIndex: table.headerRowIndex,
        headerLayerRowIndexes: [...table.headerLayerRowIndexes],
        bodyStartIndex: table.bodyStartIndex,
        summaryStartIndex: table.summaryStartIndex,
        parameterRowIndexes: [...table.parameterRowIndexes],
        repeatedHeaderRowIndexes: [...table.repeatedHeaderRowIndexes],
    };
};

const buildBoundaryFromRuntime = (input: ResolveReportStructureInput): ReportBoundary | null => {
    const runtime = input.runtimeTableAssessment;
    if (!runtime) {
        return null;
    }

    return {
        headerRowIndex: runtime.headerRowIndex,
        headerLayerRowIndexes: [...runtime.headerLayerRowIndexes],
        bodyStartIndex: runtime.bodyStartIndex,
        summaryStartIndex: runtime.summaryStartIndex,
        parameterRowIndexes: [...runtime.parameterRowIndexes],
        repeatedHeaderRowIndexes: [...runtime.repeatedHeaderRowIndexes],
    };
};

const countNonEmptyCells = (row: string[] | undefined) =>
    (row ?? []).filter(cell => String(cell ?? '').trim().length > 0);

const getNumericRatio = (cells: string[]) => {
    if (cells.length === 0) {
        return 0;
    }
    const numericCount = cells.filter(cell => /^-?\d[\d,]*(?:\.\d+)?$/.test(String(cell).trim())).length;
    return numericCount / cells.length;
};

/**
 * Structural header-like detection: a row looks like a header when it
 * contains mostly short text labels (not data values or long sentences).
 * Domain-agnostic — no hardcoded vocabulary.
 */
const looksLikeHeaderRow = (cells: string[]) => {
    if (cells.length < 2) return false;
    const shortTextCount = cells.filter(cell => {
        const trimmed = String(cell).trim();
        return trimmed.length > 0 && trimmed.length <= 30 && /[A-Za-z]/.test(trimmed);
    }).length;
    return shortTextCount >= Math.max(2, Math.floor(cells.length * 0.5));
};

const hasUniquelyAddressableLeafHeaders = (cells: string[]) => {
    const normalized = cells
        .map(cell => String(cell ?? '').trim().toLowerCase())
        .filter(Boolean);
    if (normalized.length < 3) return false;
    return new Set(normalized).size / normalized.length >= 0.98;
};

const shouldPromotePreviousRowIntoHeader = (
    rows: string[][],
    boundary: ReportBoundary,
) => {
    if (
        boundary.headerRowIndex === null
        || boundary.bodyStartIndex === null
        || boundary.headerRowIndex <= 0
        || boundary.bodyStartIndex - boundary.headerRowIndex !== 1
        || boundary.headerLayerRowIndexes.length > 0
    ) {
        return false;
    }

    const previousRow = rows[boundary.headerRowIndex - 1];
    const headerRow = rows[boundary.headerRowIndex];
    const previousNonEmpty = countNonEmptyCells(previousRow);
    const headerNonEmpty = countNonEmptyCells(headerRow);
    if (previousNonEmpty.length < 2 || headerNonEmpty.length < 2) {
        return false;
    }

    // Structural signals: both rows have low numeric ratio and contain
    // short text labels — typical of multi-layer column headers.
    const previousNumericRatio = getNumericRatio(previousNonEmpty);
    const headerNumericRatio = getNumericRatio(headerNonEmpty);

    // A preceding stage/band row must not rewrite a leaf row whose labels are
    // already unique and directly addressable. Promotion is only useful when
    // repeated leaf labels need outer-band disambiguation.
    if (hasUniquelyAddressableLeafHeaders(headerRow)) {
        return false;
    }

    return looksLikeHeaderRow(previousNonEmpty)
        && looksLikeHeaderRow(headerNonEmpty)
        && previousNumericRatio <= 0.35
        && headerNumericRatio <= 0.35;
};

const normalizeBoundary = (
    input: ResolveReportStructureInput,
    boundary: ReportBoundary,
): ReportBoundary => {
    const allHeaderIndexes = Array.from(new Set([
        boundary.headerRowIndex,
        ...boundary.headerLayerRowIndexes,
    ].filter((value): value is number => Number.isInteger(value) && value >= 0))).sort((left, right) => left - right);

    let normalizedBoundary: ReportBoundary = {
        ...boundary,
        headerRowIndex: allHeaderIndexes[0] ?? boundary.headerRowIndex,
        headerLayerRowIndexes: allHeaderIndexes.slice(1),
    };

    const rows = input.rawIntakeIr?.normalizedRows ?? [];
    if (!shouldPromotePreviousRowIntoHeader(rows, normalizedBoundary)) {
        return normalizedBoundary;
    }

    const promotedHeaderRowIndex = (normalizedBoundary.headerRowIndex ?? 0) - 1;
    return {
        ...normalizedBoundary,
        headerRowIndex: promotedHeaderRowIndex,
        headerLayerRowIndexes: Array.from(new Set([
            normalizedBoundary.headerRowIndex ?? 0,
            ...normalizedBoundary.headerLayerRowIndexes,
        ])).sort((left, right) => left - right),
    };
};

const chooseBoundarySource = (
    input: ResolveReportStructureInput,
    intakeBoundary: ReportBoundary | null,
    runtimeBoundary: ReportBoundary | null,
) => {
    if (input.humanBoundary) {
        return {
            source: 'human_confirmed' as const,
            boundary: input.humanBoundary,
        };
    }

    if (input.runtimeTableAssessment?.status === 'confirmed' && runtimeBoundary) {
        return {
            source: 'runtime_resolved' as const,
            boundary: runtimeBoundary,
        };
    }

    if (intakeBoundary) {
        return {
            source: 'intake_provisional' as const,
            boundary: intakeBoundary,
        };
    }

    return {
        source: 'intake_provisional' as const,
        boundary: {
            headerRowIndex: null,
            headerLayerRowIndexes: [],
            bodyStartIndex: null,
            summaryStartIndex: null,
            parameterRowIndexes: [],
            repeatedHeaderRowIndexes: [],
        },
    };
};

const buildConfidence = (
    input: ResolveReportStructureInput,
    source: ReportStructureResolution['source'],
): ReportBoundaryConfidence => {
    const intakeDetectionConfidence = input.rawIntakeIr?.detection?.confidence;
    const intakeBase = intakeDetectionConfidence === 'high'
        ? 0.9
        : intakeDetectionConfidence === 'medium'
            ? 0.72
            : intakeDetectionConfidence === 'low'
                ? 0.55
                : 0.45;
    const runtimeBoost = input.runtimeTableAssessment?.status === 'confirmed'
        ? 0.2
        : input.runtimeTableAssessment?.status === 'ambiguous'
            ? -0.15
            : 0;
    const humanBoost = source === 'human_confirmed' ? 0.28 : source === 'ai_confirmed' ? 0.18 : 0;
    const driftPenalty = input.rawIntakeIr?.diagnostics.headerShapeDrift ? 0.22 : 0;
    const shapePenalty = input.shapeVerificationPassed === false ? 0.18 : 0;
    const base = clampConfidence(intakeBase + runtimeBoost + humanBoost - driftPenalty - shapePenalty);
    const agreement = source === 'human_confirmed'
        ? 1
        : source === 'ai_confirmed'
            ? 0.95
            : input.runtimeTableAssessment?.status === 'confirmed'
                ? 0.92
                : intakeDetectionConfidence === 'high'
                    ? 0.8
                    : 0.62;

    return {
        header: base,
        body: clampConfidence(base - (input.rawIntakeIr?.diagnostics.headerShapeDrift ? 0.06 : 0)),
        summary: clampConfidence(base - 0.04),
        overall: clampConfidence((base + agreement) / 2),
        sourceAgreement: clampConfidence(agreement),
    };
};

const mapPreparedRole = (role: string): ReportRowRole => {
    switch (role) {
        case 'detail':
            return 'detail';
        case 'group_header':
            return 'group_header';
        case 'summary_like':
            return 'subtotal';
        case 'note':
            return 'note';
        case 'blank':
            return 'blank';
        default:
            return 'unknown';
    }
};

const buildRawRowRoleAssignments = (
    input: ResolveReportStructureInput,
    boundary: ReportBoundary,
): ReportRowRoleAssignment[] => {
    const rawRows = input.rawIntakeIr?.normalizedRows ?? [];
    if (rawRows.length === 0) {
        return [];
    }

    const assignments: ReportRowRoleAssignment[] = [];
    const segmentRoleByIndex = new Map<number, ReportRowRole>();
    (input.rawIntakeIr?.segments ?? []).forEach(segment => {
        let role: ReportRowRole;
        switch (segment.kind) {
            case 'title':
            case 'subtitle':
                role = 'title';
                break;
            case 'metadata':
            case 'parameter':
                role = 'parameter';
                break;
            case 'header':
            case 'repeated_header':
                role = 'header';
                break;
            case 'summary':
                role = 'summary';
                break;
            case 'footer':
                role = 'footer';
                break;
            case 'blank':
                role = 'blank';
                break;
            case 'body':
                role = 'detail';
                break;
            default:
                role = 'unknown';
                break;
        }
        for (let index = segment.rowStart; index <= segment.rowEnd; index += 1) {
            segmentRoleByIndex.set(index, role);
        }
    });

    rawRows.forEach((_row, rowIndex) => {
        const assignedSegmentRole = segmentRoleByIndex.get(rowIndex);
        let role: ReportRowRole;

        if (assignedSegmentRole) {
            role = assignedSegmentRole;
        } else if (
            boundary.headerRowIndex === rowIndex
            || boundary.headerLayerRowIndexes.includes(rowIndex)
            || boundary.repeatedHeaderRowIndexes.includes(rowIndex)
        ) {
            role = 'header';
        } else if (boundary.parameterRowIndexes.includes(rowIndex)) {
            role = 'parameter';
        } else if (
            boundary.bodyStartIndex !== null
            && rowIndex >= boundary.bodyStartIndex
            && (boundary.summaryStartIndex === null || rowIndex < boundary.summaryStartIndex)
        ) {
            role = 'detail';
        } else if (rowIndex < (boundary.bodyStartIndex ?? Number.POSITIVE_INFINITY)) {
            role = 'note';
        } else {
            role = 'summary';
        }

        assignments.push({
            rowIndex,
            dataset: 'raw',
            role,
            confidence: role === 'unknown' ? 0.45 : 0.88,
            source: 'intake',
        });
    });

    return assignments;
};

const buildPreparedRowRoleAssignments = (
    input: ResolveReportStructureInput,
): { rowInspection: NonNullable<ReportStructureResolution['rowInspection']>; assignments: ReportRowRoleAssignment[] } => {
    const rowInspection = input.rowInspection ?? inspectCsvRows(input.csvData ?? null, { source: 'cleaned' });
    const assignments = rowInspection.rows.map(row => ({
        rowIndex: row.rowIndex,
        dataset: 'prepared' as const,
        role: mapPreparedRole(row.rowRole),
        confidence: row.confidence,
        source: 'deterministic' as const,
        notes: row.sourceRowClassCandidate ? [row.sourceRowClassCandidate] : undefined,
    }));

    return {
        rowInspection,
        assignments,
    };
};

const dedupeReasons = (values: string[]) => {
    const seen = new Set<string>();
    const deduped: string[] = [];
    values.forEach(value => {
        const normalized = value.trim();
        if (!normalized || seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        deduped.push(normalized);
    });
    return deduped;
};

const buildBlockingReasons = (
    input: ResolveReportStructureInput,
    source: ReportStructureResolution['source'],
    boundary: ReportBoundary,
    confidence: ReportBoundaryConfidence,
    rowInspection: NonNullable<ReportStructureResolution['rowInspection']>,
) => {
    const reasons: string[] = [];
    const preparedLooksTabular = Boolean(
        (input.csvData?.headerDepth ?? 1) <= 1
        && rowInspection.totalRows > 0
        && (rowInspection.countsByRole.detail ?? 0) >= Math.max(1, Math.floor(rowInspection.totalRows * 0.6))
        && (rowInspection.countsByRole.note ?? 0) <= Math.max(1, Math.floor(rowInspection.totalRows * 0.15))
        && (rowInspection.countsByRole.summary_like ?? 0) <= Math.max(1, Math.floor(rowInspection.totalRows * 0.15)),
    );
    if ((boundary.headerRowIndex === null || boundary.bodyStartIndex === null) && !preparedLooksTabular) {
        reasons.push('boundary_incomplete');
    }
    if (input.rawIntakeIr?.diagnostics.headerShapeDrift) {
        reasons.push('header_shape_drift');
    }
    if (input.runtimeTableAssessment?.status === 'ambiguous') {
        reasons.push('runtime_boundary_ambiguous');
    }
    if (input.runtimeTableAssessment?.status === 'rejected') {
        reasons.push('runtime_boundary_rejected');
    }
    if (input.shapeVerificationPassed === false && input.shapeFailureSignalKey) {
        reasons.push(input.shapeFailureSignalKey);
    } else if (input.shapeFailureSignalKey) {
        reasons.push(input.shapeFailureSignalKey);
    }
    const preparedRepeatedHeaderEchoCount = rowInspection.rows.filter(
        row => row.signals.repeatedHeaderEcho === true,
    ).length;
    const preparedRepeatedHeaderEchoRate = rowInspection.totalRows > 0
        ? preparedRepeatedHeaderEchoCount / rowInspection.totalRows
        : 0;
    // repeatedHeaderRowIndexes describe the raw report boundary. They are not
    // proof that a repeated header leaked into the prepared dataset: the
    // canonicalization/cleaning path may already have removed those raw rows.
    // Block only when post-intake row inspection still observes leakage above
    // the same 2% tolerance used by shape verification.
    if (
        boundary.repeatedHeaderRowIndexes.length > 0
        && preparedRepeatedHeaderEchoRate > 0.02
    ) {
        reasons.push('repeated_header_leakage');
    }
    if (source !== 'human_confirmed' && source !== 'ai_confirmed' && confidence.overall < 0.78 && !preparedLooksTabular) {
        reasons.push('low_structure_confidence');
    }
    return dedupeReasons(reasons);
};

const inferTargetShape = (input: ResolveReportStructureInput) => {
    const runtimeRequiresReshape = Boolean(input.runtimeTableAssessment?.requiresReshape);
    const headerLayerCount = input.rawIntakeIr?.provisionalTable?.headerLayerRowIndexes.length ?? 0;
    const summaryLikeCount = input.rowInspection?.countsByRole.summary_like ?? 0;
    const groupHeaderCount = input.rowInspection?.countsByRole.group_header ?? 0;
    const totalRows = input.rowInspection?.totalRows ?? 0;
    const hasStatementStructure = totalRows > 0
        && (summaryLikeCount + groupHeaderCount) >= 3
        && (summaryLikeCount + groupHeaderCount) / totalRows >= 0.2;

    if (runtimeRequiresReshape || headerLayerCount > 0) {
        return 'long_fact_table' as const;
    }
    if (hasStatementStructure) {
        return 'long_statement_table' as const;
    }
    return 'row_table' as const;
};

export const resolveReportStructure = (
    input: ResolveReportStructureInput,
): ReportStructureResolution => {
    const intakeBoundary = buildBoundaryFromIntake(input);
    const runtimeBoundary = buildBoundaryFromRuntime(input);
    const selected = chooseBoundarySource(input, intakeBoundary, runtimeBoundary);
    const normalizedBoundary = normalizeBoundary(input, selected.boundary);
    const normalization = buildDeterministicNormalizationPlan({
        rawRows: input.rawIntakeIr?.normalizedRows ?? [],
        boundary: normalizedBoundary,
        source: selected.source,
        structureProposal: input.structureProposal ?? null,
    });
    const { rowInspection, assignments: preparedAssignments } = buildPreparedRowRoleAssignments(input);
    const rawAssignments = buildRawRowRoleAssignments(input, normalizedBoundary);
    const overrideByRowIndex = new Map(
        normalization.plan.rawRowRoleOverrides.map(assignment => [assignment.rowIndex, assignment]),
    );
    const resolvedRawAssignments = rawAssignments.map(assignment => overrideByRowIndex.get(assignment.rowIndex) ?? assignment);
    normalization.plan.rawRowRoleOverrides.forEach(assignment => {
        if (!resolvedRawAssignments.some(existing => existing.rowIndex === assignment.rowIndex)) {
            resolvedRawAssignments.push(assignment);
        }
    });
    const deterministicTargetShape = inferTargetShape({ ...input, rowInspection });
    const rawRows = input.rawIntakeIr?.normalizedRows ?? [];
    // Data-driven shape override: actual body numeric density takes precedence
    // over header-layer-based reshape heuristics. Multi-line headers can be
    // merged column labels (row table) or pivot layers (wide table) — body
    // content disambiguates without relying on carry-forward detection.
    const isRowTableShape = inferRowTableShapeFromHeaders(
        normalization.plan.mergedHeaders,
        rawRows.length > 0 ? rawRows : undefined,
        normalizedBoundary.bodyStartIndex ?? undefined,
        normalizedBoundary.summaryStartIndex ?? undefined,
    );
    // A multi-layer header only justifies melting into a long fact table when
    // it repeats a genuinely enumerable dimension (the taxonomy's F2
    // definition: month/quarter/week/project code/year-over-year). Two
    // independent, narrow signals must BOTH hold before overriding to
    // row_table — numeric-dominant column density alone can't separate a
    // generic 2-way comparison window ("Year To Date" vs "Monthly Record")
    // from a genuine wide pivot (12 months, dozens of project codes), since
    // both are mostly-numeric. Requiring both signals keeps the override
    // from firing on real period/project-code files that merely lack
    // calendar vocabulary in their band labels (verified against the full
    // corpus — see task.md GAP-7 fix record).
    const hasNonPeriodicBand = normalizedBoundary.headerLayerRowIndexes.length > 0
        && !hasCalendarPeriodBandPattern(rawRows, normalizedBoundary.headerRowIndex, normalizedBoundary.headerLayerRowIndexes)
        && hasNarrowComparisonWindowBandRow(rawRows, normalizedBoundary.headerRowIndex, normalizedBoundary.headerLayerRowIndexes);
    const targetShape = (isRowTableShape || hasNonPeriodicBand)
        && deterministicTargetShape !== 'long_statement_table'
        ? 'row_table'
        : deterministicTargetShape;
    const proposalVerification = verifyReportStructureProposal({
        proposal: input.structureProposal,
        mergedHeaders: normalization.plan.mergedHeaders,
        rawRows,
        boundary: normalizedBoundary,
        deterministicTargetShape: targetShape,
        normalizationWarnings: normalization.warnings,
    });
    // AI can auto-confirm only when the model proposal agrees with the
    // deterministic evidence and the verifier places every material decision
    // in the pass band. Low-confidence reshape/carry-forward/row exclusion
    // stays inspectable and requires explicit human confirmation.
    const aiProposalCanAutoConfirm = Boolean(
        normalization.proposalAccepted
        && proposalVerification?.autoApplySafe,
    );
    const effectiveSource: ReportStructureResolution['source'] = selected.source === 'human_confirmed'
        ? 'human_confirmed'
        : aiProposalCanAutoConfirm
            ? 'ai_confirmed'
            : selected.source;
    const confidence = buildConfidence(input, effectiveSource);
    const baseBlockingReasons = buildBlockingReasons(input, effectiveSource, normalizedBoundary, confidence, rowInspection);
    const complexReportNeedsConfirmation = Boolean(
        (
            input.rawIntakeIr?.diagnostics.headerShapeDrift
            && normalization.plan.carryForwardColumns.length > 0
        )
        || proposalVerification?.requiresHumanConfirmation
    ) && effectiveSource !== 'human_confirmed' && effectiveSource !== 'ai_confirmed';
    const blockingReasons = dedupeReasons([
        ...baseBlockingReasons,
        ...(proposalVerification?.tier === 'fail' ? ['structure_proposal_verification_failed'] : []),
        ...(complexReportNeedsConfirmation ? ['complex_report_requires_confirmation'] : []),
    ]);
    const missingBoundary = normalizedBoundary.headerRowIndex === null || normalizedBoundary.bodyStartIndex === null;
    const requiresHumanReview = effectiveSource !== 'human_confirmed'
        && effectiveSource !== 'ai_confirmed'
        && (
            blockingReasons.length > 0
            || complexReportNeedsConfirmation
            || (missingBoundary && blockingReasons.includes('boundary_incomplete'))
        );

    return {
        headerRowIndex: normalizedBoundary.headerRowIndex,
        headerLayerRowIndexes: [...normalizedBoundary.headerLayerRowIndexes],
        bodyStartIndex: normalizedBoundary.bodyStartIndex,
        summaryStartIndex: normalizedBoundary.summaryStartIndex,
        parameterRowIndexes: [...normalizedBoundary.parameterRowIndexes],
        repeatedHeaderRowIndexes: [...normalizedBoundary.repeatedHeaderRowIndexes],
        rowRoles: [...resolvedRawAssignments, ...preparedAssignments],
        confidence,
        blockingReasons,
        requiresHumanReview,
        source: effectiveSource,
        decision: {
            targetShape,
            shouldCanonicalize: !requiresHumanReview,
            reason: requiresHumanReview
                ? `Structure needs review: ${blockingReasons.join(', ') || 'boundary confirmation required'}.`
                : `Structure resolved as ${targetShape}.`,
        },
        rawIntakeBoundary: intakeBoundary,
        runtimeBoundary,
        humanBoundary: input.humanBoundary ?? null,
        runtimeTableAssessment: input.runtimeTableAssessment ?? null,
        rowInspection,
        proposalSource: (effectiveSource === 'human_confirmed' || effectiveSource === 'ai_confirmed')
            ? (effectiveSource === 'human_confirmed' ? 'human' : 'ai')
            : normalization.proposalAccepted
                ? 'ai'
                : 'none',
        structureProposal: input.structureProposal ?? null,
        proposalVerification,
        normalizationPlan: normalization.plan,
        resolvedRawRowRoles: resolvedRawAssignments,
        verificationSummary: normalization.warnings.length > 0
            ? {
                passed: false,
                footerTotalsMatched: null,
                unresolvedMissingKeyDimensions: [],
                warnings: normalization.warnings,
                comparedFooterTotals: {},
            }
            : null,
    };
};
