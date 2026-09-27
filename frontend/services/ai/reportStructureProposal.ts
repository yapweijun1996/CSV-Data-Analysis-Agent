import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from './streamGenerateText';
import type {
    ReportBoundary,
    ReportIntakeIr,
    ReportStructureFieldRole,
    ReportStructurePivotShape,
    ReportStructureProposal,
    RowInspectionBundle,
    RuntimeTableAssessment,
    Settings,
} from '../../types';
import { createProviderModel, isProviderConfigured } from './providerConfig';
import { withTransientRetry } from './transientRetry';
import { prepareSchemaForProvider } from './googleSchemaAdapter';
import { reportStructureProposalSchema } from './schemas/reportStructureProposalSchema';
import {
    createContextSection,
    prepareManagedContext,
    reportContextDiagnostics,
    type ContextTelemetryTarget,
} from './contextManager';
import { runWithOverflowCompaction } from './overflowRetry';
import {
    formatReportStructureProposalPrompt,
    reportStructureProposalSystemPrompt,
} from '../prompts/runtime/reportStructureProposalPrompts';
import { buildMergedBoundaryHeaders, normalizeReportCellText } from '../agent/reportStructureNormalization';

const LOG_PREFIX = '[ReportStructureProposal]';
const MAX_HEAD_BODY_ROWS = 18;
const MAX_TAIL_ROWS = 6;

const formatBoundarySummary = (
    boundary: ReportBoundary,
    runtimeTableAssessment: RuntimeTableAssessment | null | undefined,
) => [
    `headerRowIndex: ${boundary.headerRowIndex ?? 'unknown'}`,
    `headerLayerRowIndexes: [${boundary.headerLayerRowIndexes.join(', ')}]`,
    `bodyStartIndex: ${boundary.bodyStartIndex ?? 'unknown'}`,
    `summaryStartIndex: ${boundary.summaryStartIndex ?? 'none'}`,
    `parameterRowIndexes: [${boundary.parameterRowIndexes.join(', ')}]`,
    `repeatedHeaderRowIndexes: [${boundary.repeatedHeaderRowIndexes.join(', ')}]`,
    runtimeTableAssessment
        ? `runtimeTableAssessment: ${runtimeTableAssessment.status}; requiresReshape=${runtimeTableAssessment.requiresReshape}; reason=${runtimeTableAssessment.reason}`
        : 'runtimeTableAssessment: unavailable',
].join('\n');

const formatRowInspectionSummary = (rowInspection: RowInspectionBundle | null | undefined) => {
    if (!rowInspection) {
        return 'No deterministic row inspection bundle is available.';
    }
    return [
        `totalRows: ${rowInspection.totalRows}`,
        `detail: ${rowInspection.countsByRole.detail ?? 0}`,
        `group_header: ${rowInspection.countsByRole.group_header ?? 0}`,
        `summary_like: ${rowInspection.countsByRole.summary_like ?? 0}`,
        `note: ${rowInspection.countsByRole.note ?? 0}`,
        `blank: ${rowInspection.countsByRole.blank ?? 0}`,
    ].join('\n');
};

const MAX_AMBIGUOUS_INJECT_ROWS = 4;
const FIELD_ROLES = new Set<ReportStructureFieldRole>([
    'grain',
    'metric',
    'time_dimension',
    'identifier',
    'descriptor',
    'helper',
    'unknown',
]);
const PIVOT_SHAPES = new Set<ReportStructurePivotShape>([
    'row_table',
    'wide_pivot',
    'statement_table',
    'unknown',
]);

const buildSampledRows = (
    rawIntakeIr: ReportIntakeIr,
    boundary: ReportBoundary,
    rowInspection?: RowInspectionBundle | null,
) => {
    const bodyStart = boundary.bodyStartIndex ?? 0;
    const summaryStart = boundary.summaryStartIndex ?? rawIntakeIr.normalizedRows.length;
    const bodyRows = rawIntakeIr.normalizedRows.slice(bodyStart, summaryStart);
    const sampled = bodyRows
        .slice(0, MAX_HEAD_BODY_ROWS)
        .map((cells, index) => ({ rowIndex: bodyStart + index, cells: cells.map(normalizeReportCellText) }));
    const tailStart = Math.max(bodyStart + MAX_HEAD_BODY_ROWS, summaryStart - MAX_TAIL_ROWS);
    for (let rowIndex = tailStart; rowIndex < summaryStart; rowIndex += 1) {
        const cells = rawIntakeIr.normalizedRows[rowIndex];
        if (!cells) {
            continue;
        }
        sampled.push({
            rowIndex,
            cells: cells.map(normalizeReportCellText),
        });
    }
    const summaryRow = boundary.summaryStartIndex !== null ? rawIntakeIr.normalizedRows[boundary.summaryStartIndex] : null;
    if (summaryRow) {
        sampled.push({
            rowIndex: boundary.summaryStartIndex!,
            cells: summaryRow.map(normalizeReportCellText),
        });
    }

    // Inject representative ambiguous rows that the head/tail sample may have
    // missed, so the AI can see and classify them explicitly.
    if (rowInspection) {
        const sampledIndexes = new Set(sampled.map(row => row.rowIndex));
        const ambiguousIndexes = [
            ...(rowInspection.residualUnknownRowIndexes ?? []),
            ...(rowInspection.residualSummaryLikeRowIndexes ?? []),
        ].filter(idx => !sampledIndexes.has(idx) && idx >= bodyStart && idx < summaryStart);

        for (const idx of ambiguousIndexes.slice(0, MAX_AMBIGUOUS_INJECT_ROWS)) {
            const cells = rawIntakeIr.normalizedRows[idx];
            if (cells) {
                sampled.push({ rowIndex: idx, cells: cells.map(normalizeReportCellText) });
            }
        }
    }

    const seen = new Set<number>();
    return sampled.filter(row => {
        if (seen.has(row.rowIndex)) {
            return false;
        }
        seen.add(row.rowIndex);
        return true;
    });
};

const normalizeProposal = (value: unknown): ReportStructureProposal | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const raw = value as Partial<ReportStructureProposal>;
    if (
        !raw.purpose
        || typeof raw.purpose.summary !== 'string'
        || typeof raw.purpose.confidence !== 'number'
        || !raw.grain
        || !Array.isArray(raw.grain.columns)
        || typeof raw.grain.description !== 'string'
        || typeof raw.grain.confidence !== 'number'
        || !Array.isArray(raw.fields)
        || !raw.pivot
        || !PIVOT_SHAPES.has(raw.pivot.shape)
        || !Array.isArray(raw.pivot.dimensionColumns)
        || !Array.isArray(raw.pivot.measureColumns)
        || !Array.isArray(raw.pivot.labelColumns)
        || typeof raw.pivot.confidence !== 'number'
    ) {
        return null;
    }
    if (!Array.isArray(raw.carryForwardColumns) || !Array.isArray(raw.sectionLabelColumns) || !Array.isArray(raw.detailInclusionRoles)) {
        return null;
    }
    if (typeof raw.confidence !== 'number' || typeof raw.reasoning !== 'string' || !Array.isArray(raw.bodyRowRoles)) {
        return null;
    }
    return {
        purpose: {
            summary: raw.purpose.summary.trim(),
            confidence: raw.purpose.confidence,
        },
        grain: {
            columns: raw.grain.columns.filter(column => typeof column === 'string'),
            description: raw.grain.description.trim(),
            confidence: raw.grain.confidence,
        },
        fields: raw.fields
            .filter(candidate => (
                candidate
                && typeof candidate.columnName === 'string'
                && FIELD_ROLES.has(candidate.role)
                && typeof candidate.confidence === 'number'
                && typeof candidate.reasoning === 'string'
            ))
            .map(candidate => ({
                columnName: candidate.columnName,
                role: candidate.role,
                confidence: candidate.confidence,
                reasoning: candidate.reasoning.trim(),
            })),
        pivot: {
            shape: raw.pivot.shape,
            dimensionColumns: raw.pivot.dimensionColumns.filter(column => typeof column === 'string'),
            measureColumns: raw.pivot.measureColumns.filter(column => typeof column === 'string'),
            labelColumns: raw.pivot.labelColumns.filter(column => typeof column === 'string'),
            confidence: raw.pivot.confidence,
        },
        bodyRowRoles: raw.bodyRowRoles
            .filter(candidate => candidate && typeof candidate.rowIndex === 'number' && typeof candidate.role === 'string' && typeof candidate.confidence === 'number')
            .map(candidate => ({
                rowIndex: candidate.rowIndex,
                role: candidate.role,
                confidence: candidate.confidence,
                notes: Array.isArray(candidate.notes) ? candidate.notes.filter(note => typeof note === 'string') : undefined,
            })),
        carryForwardColumns: raw.carryForwardColumns.filter(column => typeof column === 'string'),
        sectionLabelColumns: raw.sectionLabelColumns.filter(column => typeof column === 'string'),
        detailInclusionRoles: raw.detailInclusionRoles.filter(role => typeof role === 'string'),
        confidence: raw.confidence,
        reasoning: raw.reasoning,
    };
};

export const shouldRequestReportStructureProposal = (params: {
    settings: Settings;
    rawIntakeIr: ReportIntakeIr | null | undefined;
    boundary: ReportBoundary | null | undefined;
    runtimeTableAssessment?: RuntimeTableAssessment | null | undefined;
    rowInspection?: RowInspectionBundle | null | undefined;
}): boolean => {
    if (!isProviderConfigured(params.settings) || !params.rawIntakeIr || !params.boundary) {
        return false;
    }

    // Noise/ambiguous row trigger: when the deterministic inspector found a
    // meaningful proportion of note/unknown/summary_like rows, the AI should
    // review them rather than letting the deterministic classifier auto-exclude.
    const ambiguousRowCount = (params.rowInspection?.countsByRole.note ?? 0)
        + (params.rowInspection?.countsByRole.unknown ?? 0)
        + (params.rowInspection?.countsByRole.summary_like ?? 0);
    const totalInspected = params.rowInspection?.totalRows ?? 0;
    const hasAmbiguousBodyRows = totalInspected > 0
        && ambiguousRowCount >= 3
        && ambiguousRowCount / totalInspected >= 0.08;

    return Boolean(
        params.rawIntakeIr.diagnostics.headerShapeDrift
        || (params.boundary.headerLayerRowIndexes.length > 0)
        || (params.boundary.repeatedHeaderRowIndexes.length > 0)
        || params.runtimeTableAssessment?.requiresReshape
        || params.runtimeTableAssessment?.status === 'ambiguous'
        || hasAmbiguousBodyRows,
    );
};

export const detectReportStructureProposalWithAi = async (params: {
    rawIntakeIr: ReportIntakeIr;
    boundary: ReportBoundary;
    rowInspection?: RowInspectionBundle | null;
    runtimeTableAssessment?: RuntimeTableAssessment | null;
    settings: Settings;
    telemetryTarget?: ContextTelemetryTarget;
}): Promise<ReportStructureProposal | null> => {
    if (!shouldRequestReportStructureProposal({
        settings: params.settings,
        rawIntakeIr: params.rawIntakeIr,
        boundary: params.boundary,
        runtimeTableAssessment: params.runtimeTableAssessment,
        rowInspection: params.rowInspection,
    })) {
        return null;
    }

    try {
        const { model, modelId } = createProviderModel(params.settings, params.settings.simpleModel);
        const mergedHeaders = buildMergedBoundaryHeaders(params.rawIntakeIr.normalizedRows, params.boundary);
        const sampledRows = buildSampledRows(params.rawIntakeIr, params.boundary, params.rowInspection);
        const boundarySummary = formatBoundarySummary(params.boundary, params.runtimeTableAssessment);
        const rowInspectionSummary = formatRowInspectionSummary(params.rowInspection);

        const result = await runWithOverflowCompaction({
            provider: params.settings.provider,
            execute: async compactionMode => {
                const managed = await prepareManagedContext({
                    callType: 'goal',
                    systemText: reportStructureProposalSystemPrompt,
                    baseUserText: 'Propose a normalization plan for a report-style CSV.',
                    sections: [
                        createContextSection('boundary', boundarySummary, 'required', 'sticky'),
                        createContextSection('merged_headers', mergedHeaders.join('\n'), 'required', 'sticky'),
                        createContextSection('row_inspection', rowInspectionSummary, 'high', 'sticky'),
                        createContextSection(
                            'sampled_rows',
                            sampledRows.map(row => `Row ${row.rowIndex}: ${row.cells.join(' | ')}`).join('\n'),
                            'required',
                            'sticky',
                        ),
                    ],
                    settings: params.settings,
                    modelId,
                    compactionMode,
                });

                if (params.telemetryTarget) {
                    reportContextDiagnostics(params.telemetryTarget, managed.diagnostics);
                }

                return withTransientRetry(
                    (fb) => streamGenerateText({
                        model: fb ?? model,
                        messages: [
                            { role: 'system', content: managed.systemText },
                            {
                                role: 'user',
                                content: formatReportStructureProposalPrompt({
                                    mergedHeaders,
                                    boundarySummary,
                                    rowInspectionSummary,
                                    sampledRows,
                                }),
                            },
                        ],
                        output: Output.object({
                            schema: jsonSchema(prepareSchemaForProvider(reportStructureProposalSchema, params.settings.provider)),
                        }),
                    }),
                    { settings: params.settings, primaryModelId: modelId, label: 'reportStructureProposal' },
                );
            },
        });

        const proposal = normalizeProposal(result.output);
        if (!proposal) {
            console.warn(`${LOG_PREFIX} AI returned an invalid normalization proposal; ignoring it.`, result.output);
            return null;
        }
        return proposal;
    } catch (error) {
        console.warn(`${LOG_PREFIX} AI structure proposal failed; continuing with deterministic normalization.`, error);
        return null;
    }
};
