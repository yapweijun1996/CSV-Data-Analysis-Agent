import type {
    CanonicalizationDecision,
    ReportBoundary,
    ReportStructureFieldProposal,
    ReportStructurePivotShape,
    ReportStructureProposal,
    ReportStructureProposalVerification,
    ReportStructureProposalVerificationIssue,
} from '../../types';
import { computeColumnStatistics } from './columnRoleClassifier';
import { normalizeReportCellText } from './reportStructureNormalization';

const PASS_CONFIDENCE = 0.8;
const WARN_CONFIDENCE = 0.6;
const PASS_UNRESOLVED_RATE = 0.02;
const WARN_UNRESOLVED_RATE = 0.1;

const clampConfidence = (value: number) =>
    Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const normalizeHeaderKey = (value: string) =>
    normalizeReportCellText(value).toLowerCase();

const unique = (values: string[]) =>
    [...new Set(values.filter(Boolean))];

const mapPivotShape = (
    shape: ReportStructurePivotShape,
): CanonicalizationDecision['targetShape'] | null => {
    switch (shape) {
        case 'row_table':
            return 'row_table';
        case 'wide_pivot':
            return 'long_fact_table';
        case 'statement_table':
            return 'long_statement_table';
        default:
            return null;
    }
};

const buildHeaderResolver = (headers: string[]) => {
    const byKey = new Map(headers.map(header => [normalizeHeaderKey(header), header]));
    return (candidate: string): string | null =>
        byKey.get(normalizeHeaderKey(candidate)) ?? null;
};

const resolveColumns = (
    candidates: string[],
    resolveHeader: (candidate: string) => string | null,
) => {
    const resolved: string[] = [];
    const unresolved: string[] = [];
    unique(candidates).forEach(candidate => {
        const header = resolveHeader(candidate);
        if (header) {
            resolved.push(header);
        } else {
            unresolved.push(candidate);
        }
    });
    return {
        resolved: unique(resolved),
        unresolved,
    };
};

const addUnresolvedIssue = (
    issues: ReportStructureProposalVerificationIssue[],
    code: 'grain_column_unresolved' | 'field_column_unresolved',
    label: string,
    unresolved: string[],
    proposedCount: number,
) => {
    if (unresolved.length === 0) {
        return;
    }
    const unresolvedRate = unresolved.length / Math.max(1, proposedCount);
    if (unresolvedRate <= PASS_UNRESOLVED_RATE) {
        return;
    }
    issues.push({
        code,
        severity: unresolvedRate > WARN_UNRESOLVED_RATE ? 'error' : 'warning',
        message: `${label} referenced ${unresolved.length} column${unresolved.length === 1 ? '' : 's'} that could not be resolved to the merged header.`,
        columns: unresolved,
    });
};

const resolveFieldProposals = (
    fields: ReportStructureFieldProposal[],
    resolveHeader: (candidate: string) => string | null,
) => {
    const resolved: ReportStructureFieldProposal[] = [];
    const unresolved: string[] = [];
    const seen = new Set<string>();
    fields.forEach(field => {
        const columnName = resolveHeader(field.columnName);
        if (!columnName) {
            unresolved.push(field.columnName);
            return;
        }
        const key = normalizeHeaderKey(columnName);
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        resolved.push({
            ...field,
            columnName,
            confidence: clampConfidence(field.confidence),
        });
    });
    return { resolved, unresolved };
};

const verifyFieldEvidence = (
    fields: ReportStructureFieldProposal[],
    headers: string[],
    bodyRows: string[][],
): ReportStructureProposalVerificationIssue[] => {
    const issues: ReportStructureProposalVerificationIssue[] = [];
    fields.forEach(field => {
        if (field.role !== 'metric') {
            return;
        }
        const columnIndex = headers.indexOf(field.columnName);
        if (columnIndex < 0) {
            return;
        }
        const stats = computeColumnStatistics(field.columnName, columnIndex, bodyRows);
        if (
            stats.nonEmptyCount >= 5
            && stats.numericRatio < 0.45
            && field.confidence >= WARN_CONFIDENCE
        ) {
            issues.push({
                code: 'field_role_evidence_mismatch',
                severity: 'warning',
                message: `Field "${field.columnName}" was proposed as a metric, but fewer than 45% of its populated sample values are numeric-like.`,
                columns: [field.columnName],
            });
        }
    });
    return issues;
};

export const verifyReportStructureProposal = (params: {
    proposal: ReportStructureProposal | null | undefined;
    mergedHeaders: string[];
    rawRows: string[][];
    boundary: ReportBoundary;
    deterministicTargetShape: CanonicalizationDecision['targetShape'];
    normalizationWarnings?: string[];
}): ReportStructureProposalVerification | null => {
    const proposal = params.proposal;
    if (!proposal) {
        return null;
    }

    const issues: ReportStructureProposalVerificationIssue[] = [];
    const resolveHeader = buildHeaderResolver(params.mergedHeaders);
    const grain = resolveColumns(proposal.grain.columns, resolveHeader);
    const fields = resolveFieldProposals(proposal.fields, resolveHeader);
    const pivotDimensions = resolveColumns(proposal.pivot.dimensionColumns, resolveHeader);
    const pivotMeasures = resolveColumns(proposal.pivot.measureColumns, resolveHeader);
    const pivotLabels = resolveColumns(proposal.pivot.labelColumns, resolveHeader);

    if (!proposal.purpose.summary.trim()) {
        issues.push({
            code: 'purpose_missing',
            severity: 'error',
            message: 'The model did not provide an evidence-backed report purpose.',
        });
    }
    if (grain.resolved.length === 0) {
        issues.push({
            code: 'grain_missing',
            severity: 'warning',
            message: 'No proposed grain column could be verified; downstream grouping must remain conservative.',
        });
    }
    addUnresolvedIssue(
        issues,
        'grain_column_unresolved',
        'The proposed grain',
        grain.unresolved,
        proposal.grain.columns.length,
    );
    addUnresolvedIssue(
        issues,
        'field_column_unresolved',
        'The field-role map',
        fields.unresolved,
        proposal.fields.length,
    );
    const pivotUnresolved = [
        ...pivotDimensions.unresolved,
        ...pivotMeasures.unresolved,
        ...pivotLabels.unresolved,
    ];
    addUnresolvedIssue(
        issues,
        'field_column_unresolved',
        'The pivot field map',
        pivotUnresolved,
        proposal.pivot.dimensionColumns.length
            + proposal.pivot.measureColumns.length
            + proposal.pivot.labelColumns.length,
    );

    const bodyStart = params.boundary.bodyStartIndex ?? 0;
    const bodyEnd = params.boundary.summaryStartIndex ?? params.rawRows.length;
    const bodyRows = params.rawRows.slice(bodyStart, Math.min(bodyEnd, bodyStart + 80));
    issues.push(...verifyFieldEvidence(fields.resolved, params.mergedHeaders, bodyRows));

    const proposedPivotShape = mapPivotShape(proposal.pivot.shape);
    if (!proposedPivotShape) {
        issues.push({
            code: 'pivot_shape_unknown',
            severity: 'warning',
            message: 'The model could not resolve the pivot shape; automatic reshape is not permitted.',
        });
    } else if (proposedPivotShape !== params.deterministicTargetShape) {
        issues.push({
            code: 'pivot_shape_conflict',
            severity: 'error',
            message: `The model proposed ${proposedPivotShape}, while deterministic structure evidence supports ${params.deterministicTargetShape}.`,
        });
    }

    const proposalConfidence = clampConfidence((
        clampConfidence(proposal.confidence)
        + clampConfidence(proposal.purpose.confidence)
        + clampConfidence(proposal.grain.confidence)
        + clampConfidence(proposal.pivot.confidence)
    ) / 4);
    if (proposalConfidence < WARN_CONFIDENCE) {
        issues.push({
            code: 'proposal_low_confidence',
            severity: 'error',
            message: `The combined structure confidence is ${Math.round(proposalConfidence * 100)}%, below the degraded acceptance band.`,
        });
    } else if (proposalConfidence < PASS_CONFIDENCE) {
        issues.push({
            code: 'proposal_low_confidence',
            severity: 'warning',
            message: `The combined structure confidence is ${Math.round(proposalConfidence * 100)}%; the proposal remains inspectable but is not safe for automatic high-impact changes.`,
        });
    }

    (params.normalizationWarnings ?? []).forEach(warning => {
        issues.push({
            code: 'normalization_warning',
            severity: 'warning',
            message: `Normalization verifier reported ${warning}.`,
        });
    });

    const proposesHighImpactChange = proposedPivotShape !== 'row_table'
        || proposal.carryForwardColumns.length > 0
        || proposal.bodyRowRoles.some(row => row.role !== 'detail');
    if (proposesHighImpactChange && proposalConfidence < PASS_CONFIDENCE) {
        issues.push({
            code: 'high_impact_low_confidence',
            severity: 'warning',
            message: 'The proposal includes reshape, carry-forward, or row-exclusion changes without pass-band confidence.',
        });
    }

    const hasErrors = issues.some(issue => issue.severity === 'error');
    const tier = hasErrors
        ? 'fail'
        : issues.length > 0 || proposalConfidence < PASS_CONFIDENCE
            ? 'warn'
            : 'pass';
    const requiresHumanConfirmation = tier === 'fail'
        || (proposesHighImpactChange && tier !== 'pass');

    return {
        tier,
        proposalConfidence,
        purpose: proposal.purpose.summary.trim() || null,
        grainColumns: grain.resolved,
        fields: fields.resolved,
        pivotShape: proposedPivotShape,
        issues,
        accepted: tier !== 'fail',
        autoApplySafe: tier === 'pass' && !requiresHumanConfirmation,
        requiresHumanConfirmation,
    };
};
