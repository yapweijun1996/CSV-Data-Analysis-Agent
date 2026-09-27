import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from './streamGenerateText';
import type {
    AiExtractedReportContext,
    CsvData,
    Settings,
} from '../../types';
import { createProviderModel, isProviderConfigured } from './providerConfig';
import { withTransientRetry } from './transientRetry';
import { prepareSchemaForProvider } from './googleSchemaAdapter';
import { reportContextExtractionSchema } from './schemas/dataSchemas';
import {
    type ContextTelemetryTarget,
    createContextSection,
    formatRows,
    prepareManagedContext,
    trimRawDataSample,
} from './contextManager';
import {
    createReportContextExtractionPrompt,
    reportContextExtractionSystemPrompt,
} from '../prompts/runtime/reportIntakePrompts';
import { runWithOverflowCompaction } from './overflowRetry';
import {
    createFallbackReportContext,
    mergeAiExtractedReportContextWithFallback,
    sanitizeAiExtractedReportContext,
} from '../agent/reportContext';
import { CloudAiConsentDeclinedError } from '../privacy/cloudAiConsent';

const formatTextRows = (rows: string[][] | undefined, emptyMessage: string) => {
    if (!rows || rows.length === 0) {
        return emptyMessage;
    }

    return rows
        .map((row, index) => `${index + 1}. ${row.filter(Boolean).join(' | ')}`)
        .join('\n');
};

const formatSummaryRows = (data: CsvData) => {
    if (!data.summaryRows || data.summaryRows.length === 0) {
        return 'No summary rows were preserved.';
    }

    return formatRows(trimRawDataSample(data.summaryRows, 5));
};

export const extractAiReportContext = async (
    data: CsvData,
    settings: Settings,
    telemetryTarget?: ContextTelemetryTarget,
): Promise<AiExtractedReportContext | null> => {
    if (!isProviderConfigured(settings)) {
        return null;
    }

    try {
        const { model, modelId } = createProviderModel(settings, settings.complexModel);
        const result = await runWithOverflowCompaction({
            provider: settings.provider,
            execute: async compactionMode => {
                const managed = await prepareManagedContext({
                    callType: 'goal',
                    systemText: reportContextExtractionSystemPrompt,
                    baseUserText: 'Extract the report title, parameter lines, footer lines, and likely header hint.',
                    sections: [
                        createContextSection('report_file', `File name: ${data.fileName}\nHeader depth: ${data.headerDepth ?? 1}`, 'high', 'sticky'),
                        createContextSection('metadata_rows', `Metadata rows:\n${formatTextRows(data.metadataRows, 'No metadata rows were preserved.')}`, 'required', 'sticky'),
                        createContextSection('header_layers', `Header layers:\n${formatTextRows(data.headerLayers, 'No header layers were preserved.')}`, 'high', 'sticky'),
                        createContextSection('summary_rows', `Summary rows:\n${formatSummaryRows(data)}`, 'medium', 'sticky'),
                        createContextSection('body_sample', `Body sample:\n${formatRows(trimRawDataSample(data.data, 5))}`, 'high', 'prunable'),
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
                            { role: 'user', content: createReportContextExtractionPrompt(managed.userText) },
                        ],
                        output: Output.object({
                            schema: jsonSchema(prepareSchemaForProvider(reportContextExtractionSchema, settings.provider)),
                        }),
                    }),
                    { settings, primaryModelId: modelId, label: 'reportContextExtractor' },
                );
            },
        });

        const extracted = sanitizeAiExtractedReportContext(result.output as Partial<AiExtractedReportContext>);
        if (!extracted) {
            return null;
        }

        return mergeAiExtractedReportContextWithFallback(extracted, createFallbackReportContext(data));
    } catch (error) {
        if (error instanceof CloudAiConsentDeclinedError) {
            return null;
        }
        console.warn('[ReportContextExtractor] AI extraction failed, falling back to deterministic verification.', error);
        return null;
    }
};
