import { ColumnProfile, Settings, AnalysisCardData, CardContext, CsvRow, AppState, LocalizedText } from '../../types';
import { streamGenerateText } from './streamGenerateText';
import { createSummaryPrompt, createCoreAnalysisPrompt, cardSummarySystemPrompt, coreAnalysisBriefingSystemPrompt, executiveSummarySystemPrompt, executiveBriefSystemPrompt, createExecutiveBriefPrompt } from '../prompts/summaryPrompts';
import { createProviderModel, isProviderConfigured } from './providerConfig';
import { withTransientRetry } from './transientRetry';
import {
    ContextTelemetryTarget,
    createContextSection,
    formatCardContext,
    formatColumnNames,
    formatRows,
    prepareManagedContext,
    reportContextDiagnostics,
    trimAnalysisCards,
    trimCardContext,
    trimRawDataSample,
} from './contextManager';
import { formatColumnDisplayHints } from '../dashboard/businessLabelResolver';
import { buildDisplayCardContext } from '../dashboard/displayLabelContext';
import {
    buildNarrativeAnalysisIrInputList,
    formatNarrativeAnalysisInputs,
    selectNarrativeAnalysisInputs,
} from '../dashboard/displayAnalysisNarrative';
import { runWithOverflowCompaction } from './overflowRetry';
import { formatReportContextForPrompt, resolveEffectiveReportContext } from '../agent/reportContext';
import { emitSilentFailure } from '../agent/monitoring/silentFailureTracker';
import type { AnyStoreWithTelemetry } from '../agent/monitoring/silentFailureTracker';

/**
 * Wraps a telemetry target (which may be a full AppStore) as the minimal
 * StoreApi shape expected by emitSilentFailure. Safe to call even when
 * target is undefined or lacks recordRuntimeEvent — emitSilentFailure never
 * throws.
 */
const wrapAsTelemetryStore = (target: unknown): AnyStoreWithTelemetry => ({
    getState: () => (target ?? {}) as ReturnType<AnyStoreWithTelemetry['getState']>,
});

export const generateSummary = async (
    title: string,
    data: CsvRow[],
    settings: Settings,
    allColumns: ColumnProfile[],
    telemetryTarget?: ContextTelemetryTarget,
): Promise<LocalizedText> => {
    if (!isProviderConfigured(settings)) {
        return {
            language: settings.language,
            text: 'AI Summaries are disabled. No API Key provided.',
        };
    }

    try {
        const state = telemetryTarget as (ContextTelemetryTarget & Partial<Pick<AppState, 'rawCsvData' | 'csvData' | 'reportContextResolution'>>) | undefined;
        const reportContext = resolveEffectiveReportContext(
            state?.reportContextResolution ?? null,
            state?.rawCsvData ?? null,
            state?.csvData ?? null,
        );
        const systemPrompt = cardSummarySystemPrompt;
        const { model, modelId } = createProviderModel(settings, settings.simpleModel);
        const result = await runWithOverflowCompaction({
            provider: settings.provider,
            execute: async compactionMode => {
                const managed = await prepareManagedContext({
                    callType: 'summary',
                    systemText: systemPrompt,
                    baseUserText: `Summarize the chart titled "${title}".`,
                    sections: [
                        createContextSection('report_context', `Report context:\n${formatReportContextForPrompt(reportContext)}`, 'high', 'sticky'),
                        createContextSection('chart_data', `Chart data sample:\n${formatRows(trimRawDataSample(data, 8))}`, 'required', 'sticky'),
                        createContextSection('dataset_columns', `Dataset columns:\n${formatColumnNames(allColumns)}`, 'medium', 'prunable'),
                        createContextSection('column_display_hints', `User-facing column label hints:\n${formatColumnDisplayHints(allColumns)}`, 'medium', 'prunable'),
                    ],
                    settings,
                    modelId,
                    compactionMode,
                });
                reportContextDiagnostics(telemetryTarget, managed.diagnostics);
                const promptContent = createSummaryPrompt(title, managed.userText, settings.language);
                return withTransientRetry(
                    (fb) => streamGenerateText({
                        model: fb ?? model,
                        messages: [
                            { role: 'system', content: managed.systemText },
                            { role: 'user', content: promptContent },
                        ],
                    }),
                    { settings, primaryModelId: modelId, label: 'summaryGenerator' },
                );
            },
        });

        return {
            language: settings.language,
            text: result.text || 'No summary generated.',
        };
    } catch (error) {
        console.error("Error generating summary:", error);
        emitSilentFailure(wrapAsTelemetryStore(telemetryTarget), error, {
            component: 'SummaryGenerator',
            recoveryAction: 'fallback_text_shown',
            userNotified: false,
        });
        return {
            language: settings.language,
            text: 'Failed to generate AI summary.',
        };
    }
};

export const generateCoreAnalysisSummary = async (
    cardContext: CardContext[],
    columns: ColumnProfile[],
    settings: Settings,
    telemetryTarget?: ContextTelemetryTarget,
): Promise<LocalizedText> => {
    if (!isProviderConfigured(settings) || cardContext.length === 0) {
        return {
            language: settings.language,
            text: 'Could not generate an initial analysis summary.',
        };
    }

    try {
        const state = telemetryTarget as (ContextTelemetryTarget & Partial<Pick<AppState, 'rawCsvData' | 'csvData' | 'reportContextResolution'>>) | undefined;
        const reportContext = resolveEffectiveReportContext(
            state?.reportContextResolution ?? null,
            state?.rawCsvData ?? null,
            state?.csvData ?? null,
        );
        const planHints = cardContext.map(card => ({
            title: card.title,
            description: card.description ?? '',
            groupByColumn: card.groupByColumn,
            valueColumn: card.valueColumn,
        }));
        const displayCardContext = buildDisplayCardContext(trimCardContext(cardContext));
        const systemPrompt = coreAnalysisBriefingSystemPrompt(settings.language);
        const { model, modelId } = createProviderModel(settings, settings.complexModel);
        const result = await runWithOverflowCompaction({
            provider: settings.provider,
            execute: async compactionMode => {
                const managed = await prepareManagedContext({
                    callType: 'summary',
                    systemText: systemPrompt,
                    baseUserText: 'Create an initial briefing based on the generated cards and dataset columns.',
                    sections: [
                        createContextSection('report_context', `Report context:\n${formatReportContextForPrompt(reportContext)}`, 'high', 'sticky'),
                        createContextSection('dataset_columns', `Dataset columns:\n${formatColumnNames(columns)}`, 'required', 'sticky'),
                        createContextSection('column_display_hints', `User-facing column label hints:\n${formatColumnDisplayHints(columns, planHints)}`, 'high', 'sticky'),
                        createContextSection('generated_cards', `Generated cards:\n${formatCardContext(displayCardContext)}`, 'required', 'sticky'),
                    ],
                    settings,
                    modelId,
                    compactionMode,
                });
                reportContextDiagnostics(telemetryTarget, managed.diagnostics);
                const promptContent = createCoreAnalysisPrompt(managed.userText, settings.language);
                return withTransientRetry(
                    (fb) => streamGenerateText({
                        model: fb ?? model,
                        messages: [
                            { role: 'system', content: managed.systemText },
                            { role: 'user', content: promptContent },
                        ],
                    }),
                    { settings, primaryModelId: modelId, label: 'coreAnalysisSummary' },
                );
            },
        });

        return {
            language: settings.language,
            text: result.text || 'No summary generated.',
        };
    } catch (error) {
        console.error("Error generating core analysis summary:", error);
        emitSilentFailure(wrapAsTelemetryStore(telemetryTarget), error, {
            component: 'SummaryGenerator',
            recoveryAction: 'core_analysis_fallback_text_shown',
            userNotified: false,
        });
        return {
            language: settings.language,
            text: 'An error occurred while the AI was forming its initial analysis.',
        };
    }
};

export const generateFinalSummary = async (
    cards: AnalysisCardData[],
    settings: Settings,
    telemetryTarget?: ContextTelemetryTarget,
): Promise<LocalizedText> => {
    if (!isProviderConfigured(settings)) {
        return {
            language: settings.language,
            text: 'AI Summaries are disabled. No API Key provided.',
        };
    }

    const trimmedCards = trimAnalysisCards(cards, 6, 5);
    const narrativeInputs = selectNarrativeAnalysisInputs(buildNarrativeAnalysisIrInputList(trimmedCards), 6);
    const narrativePayload = formatNarrativeAnalysisInputs(narrativeInputs);

    try {
        const state = telemetryTarget as (ContextTelemetryTarget & Partial<Pick<AppState, 'rawCsvData' | 'csvData' | 'reportContextResolution'>>) | undefined;
        const reportContext = resolveEffectiveReportContext(
            state?.reportContextResolution ?? null,
            state?.rawCsvData ?? null,
            state?.csvData ?? null,
        );
        const systemPrompt = executiveBriefSystemPrompt(settings.language);
        const { model, modelId } = createProviderModel(settings, settings.complexModel);
        const result = await runWithOverflowCompaction({
            provider: settings.provider,
            execute: async compactionMode => {
                const managed = await prepareManagedContext({
                    callType: 'summary',
                    systemText: systemPrompt,
                    baseUserText: 'Create a structured executive brief from the completed analysis cards.',
                    sections: [
                        createContextSection('report_context', `Report context:\n${formatReportContextForPrompt(reportContext)}`, 'high', 'sticky'),
                        createContextSection('generated_card_summaries', `Narrative-ready card summaries:\n${narrativePayload || '[]'}`, 'required', 'sticky'),
                    ],
                    settings,
                    modelId,
                    compactionMode,
                });
                reportContextDiagnostics(telemetryTarget, managed.diagnostics);
                const promptContent = createExecutiveBriefPrompt(managed.userText, settings.language);
                return withTransientRetry(
                    (fb) => streamGenerateText({
                        model: fb ?? model,
                        messages: [
                            { role: 'system', content: managed.systemText },
                            { role: 'user', content: promptContent },
                        ],
                    }),
                    { settings, primaryModelId: modelId, label: 'executiveBrief' },
                );
            },
        });

        return {
            language: settings.language,
            text: result.text || 'No final summary generated.',
        };
    } catch (error) {
        console.error("Error generating final summary:", error);
        emitSilentFailure(wrapAsTelemetryStore(telemetryTarget), error, {
            component: 'SummaryGenerator',
            recoveryAction: 'final_summary_fallback_text_shown',
            userNotified: false,
        });
        return {
            language: settings.language,
            text: 'Failed to generate the final AI summary.',
        };
    }
}
