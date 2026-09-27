import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from './streamGenerateText';
import type {
    ColumnProfile,
    CsvData,
    DatasetSemanticSnapshot,
    ReportContextResolution,
    ReportStructureResolution,
    Settings,
} from '../../types';
import { createProviderModel, isProviderConfigured } from './providerConfig';
import { withTransientRetry } from './transientRetry';
import { prepareSchemaForProvider } from './googleSchemaAdapter';
import { datasetSemanticAnnotationSchema } from './schemas/dataSchemas';
import {
    type ContextTelemetryTarget,
    createContextSection,
    formatColumnQualitySummary,
    formatRows,
    prepareManagedContext,
    trimRawDataSample,
} from './contextManager';
import { createDatasetSemanticAnnotationPrompt, datasetSemanticAnnotationSystemPrompt } from '../prompts/datasetSemanticPrompts';
import { runWithOverflowCompaction } from './overflowRetry';
import { buildDatasetContext } from '../agent/contextBuilder';
import { buildSemanticDatasetVersion, sanitizeDatasetSemanticSnapshot } from '../agent/datasetSemantics';
import { detectTabularRowRole, inferTabularShapeContext } from '../agent/reportShapeTabular';

const FULL_ANNOTATION_ROW_LIMIT = 40;
const HEAD_SAMPLE = 8;
const TAIL_SAMPLE = 6;
const EVEN_SAMPLE = 6;
const PRIORITY_NON_DETAIL_SAMPLE = 8;
const MAX_CONTEXT_COLUMNS = 8;
const MAX_CONTEXT_TEXT_LENGTH = 180;
const MAX_CANDIDATE_ROWS = 20;

const truncateText = (value: string | undefined, limit = MAX_CONTEXT_TEXT_LENGTH) => {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();
    if (trimmed.length <= limit) {
        return trimmed;
    }
    return `${trimmed.slice(0, limit - 3).trimEnd()}...`;
};

const formatSemanticDatasetContext = (context: ReturnType<typeof buildDatasetContext>) =>
    [
        `Title: ${context.reportTitle ?? context.title ?? 'unknown'}`,
        context.reportShapeKind ? `Detected report shape: ${context.reportShapeKind}` : null,
        context.headerHintPreview ? `Header hint: ${truncateText(context.headerHintPreview)}` : null,
        typeof context.rowCount === 'number' ? `Prepared rows: ${context.rowCount}` : null,
        `Dimension columns: ${context.dimensionColumns.slice(0, MAX_CONTEXT_COLUMNS).join(', ') || 'none'}`,
        `Metric columns: ${context.metricColumns.slice(0, MAX_CONTEXT_COLUMNS).join(', ') || 'none'}`,
        truncateText(context.parameterPreview) ? `Parameters: ${truncateText(context.parameterPreview)}` : null,
        truncateText(context.footerPreview) ? `Footer: ${truncateText(context.footerPreview)}` : null,
        truncateText(context.metadataPreview) ? `Metadata preview: ${truncateText(context.metadataPreview)}` : null,
        truncateText(context.summaryPreview) ? `Summary preview: ${truncateText(context.summaryPreview)}` : null,
    ]
        .filter(Boolean)
        .join('\n');

const formatCandidateRows = (data: CsvData, rowIndices: number[]) =>
    rowIndices.map(index => ({
        rowIndex: index,
        ...data.data[index],
    }));

const buildPriorityNonDetailRowIndices = (data: CsvData): number[] => {
    const context = inferTabularShapeContext(data);
    if (!context) {
        return [];
    }

    return data.data
        .map((row, rowIndex) => ({
            rowIndex,
            detection: detectTabularRowRole(row, context),
        }))
        .filter(candidate =>
            ['subtotal', 'total', 'comment', 'group_header', 'noise'].includes(candidate.detection.role)
            && candidate.detection.confidence >= 0.7,
        )
        .sort((left, right) => right.detection.confidence - left.detection.confidence || left.rowIndex - right.rowIndex)
        .slice(0, PRIORITY_NON_DETAIL_SAMPLE)
        .map(candidate => candidate.rowIndex);
};

const buildCandidateRowIndices = (data: CsvData): number[] => {
    const rowCount = data.data.length;
    if (rowCount <= FULL_ANNOTATION_ROW_LIMIT) {
        return Array.from({ length: rowCount }, (_, index) => index);
    }

    const orderedCandidates = [
        ...buildPriorityNonDetailRowIndices(data),
        ...Array.from({ length: Math.min(HEAD_SAMPLE, rowCount) }, (_, index) => index),
        ...Array.from({ length: TAIL_SAMPLE }, (_, offset) => Math.max(rowCount - TAIL_SAMPLE + offset, 0)),
        ...Array.from({ length: EVEN_SAMPLE }, (_, slot) => Math.floor(((slot + 1) * rowCount) / (EVEN_SAMPLE + 1))),
    ];

    const indices: number[] = [];
    const seen = new Set<number>();
    for (const index of orderedCandidates) {
        if (index < 0 || index >= rowCount || seen.has(index)) {
            continue;
        }
        seen.add(index);
        indices.push(index);
        if (indices.length >= MAX_CANDIDATE_ROWS) {
            break;
        }
    }

    return indices.sort((left, right) => left - right);
};

export const annotateDatasetSemantics = async ({
    data,
    rawData,
    columns,
    settings,
    reportContextResolution,
    reportStructureResolution,
    telemetryTarget,
}: {
    data: CsvData;
    rawData?: CsvData | null;
    columns: ColumnProfile[];
    settings: Settings;
    reportContextResolution?: ReportContextResolution | null;
    reportStructureResolution?: ReportStructureResolution | null;
    telemetryTarget?: ContextTelemetryTarget;
}): Promise<DatasetSemanticSnapshot | null> => {
    if (!isProviderConfigured(settings)) {
        return null;
    }

    const datasetVersion = buildSemanticDatasetVersion(data);
    const candidateRowIndices = buildCandidateRowIndices(data);
    const candidateRows = formatCandidateRows(data, candidateRowIndices);
    const datasetContext = buildDatasetContext(data, columns, reportContextResolution, undefined, undefined, undefined, rawData ?? data);

    try {
        const { model, modelId } = createProviderModel(settings, settings.complexModel);
        const result = await runWithOverflowCompaction({
            provider: settings.provider,
            execute: async compactionMode => {
                const managed = await prepareManagedContext({
                        callType: 'goal',
                        systemText: datasetSemanticAnnotationSystemPrompt,
                        baseUserText: 'Classify dataset semantics, annotate candidate rows, infer column roles, and summarize header/report semantics.',
                        sections: [
                            createContextSection('dataset_identity', `File name: ${data.fileName}\nDataset version: ${datasetVersion}\nPrepared row count: ${data.data.length}`, 'required', 'sticky'),
                            createContextSection('dataset_context', `Dataset context summary:\n${formatSemanticDatasetContext(datasetContext)}`, 'medium', 'sticky'),
                            createContextSection(
                                'report_context',
                                `Report title: ${reportContextResolution?.effective?.reportTitle ?? 'unknown'}\nParameters:\n${reportContextResolution?.effective?.parameterLines?.join('\n') || 'none'}\nFooter lines:\n${reportContextResolution?.effective?.footerLines?.join('\n') || 'none'}\nCandidate header line: ${reportContextResolution?.effective?.candidateHeaderLine?.join(' | ') || 'none'}`,
                                'high',
                                'sticky',
                            ),
                            createContextSection(
                                'verified_structure',
                                [
                                    `Target shape: ${reportStructureResolution?.decision.targetShape ?? 'unknown'}`,
                                    `Structure source: ${reportStructureResolution?.source ?? 'unknown'}`,
                                    `Proposal verification: ${reportStructureResolution?.proposalVerification?.tier ?? 'deterministic-only'}`,
                                    `Purpose: ${reportStructureResolution?.proposalVerification?.purpose ?? 'unknown'}`,
                                    `Verified grain: ${reportStructureResolution?.proposalVerification?.grainColumns.join(', ') || 'unresolved'}`,
                                    `Human review required: ${reportStructureResolution?.requiresHumanReview ? 'yes' : 'no'}`,
                                ].join('\n'),
                                'high',
                                'sticky',
                            ),
                            createContextSection('column_profiles', `Column profiles:\n${formatColumnQualitySummary(columns)}`, 'required', 'sticky'),
                            createContextSection('candidate_rows', `Candidate rows (rowIndex is zero-based):\n${formatRows(trimRawDataSample(candidateRows, candidateRows.length))}`, 'required', 'sticky'),
                            createContextSection('report_metadata', `Metadata rows:\n${formatRows(trimRawDataSample((data.summaryRows ?? []).map((row, index) => ({ rowIndex: index, ...row })), 5))}`, 'medium', 'prunable'),
                        ],
                    settings,
                    modelId,
                    compactionMode,
                });

                return withTransientRetry(
                    (fb) => streamGenerateText({
                        model: fb ?? model,
                        messages: [
                            { role: 'system', content: managed.systemText },
                            { role: 'user', content: createDatasetSemanticAnnotationPrompt(managed.userText) },
                        ],
                        output: Output.object({
                            schema: jsonSchema(prepareSchemaForProvider(datasetSemanticAnnotationSchema, settings.provider)),
                        }),
                    }),
                    { settings, primaryModelId: modelId, label: 'datasetSemanticAnnotator' },
                );
            },
        });

        return sanitizeDatasetSemanticSnapshot(
            {
                ...(result.output as Partial<DatasetSemanticSnapshot>),
                generatedAt: new Date().toISOString(),
            },
            data,
            modelId,
            datasetVersion,
            columns,
            reportContextResolution,
            reportStructureResolution,
        );
    } catch (error) {
        console.warn('[DatasetSemanticAnnotator] Semantic annotation failed. Falling back to prepared dataset.', error);
        return null;
    }
};
