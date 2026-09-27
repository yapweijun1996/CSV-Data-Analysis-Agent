import { ColumnProfile, Settings, CsvRow, AnalysisGoalCandidate, AppState } from '../../types';
import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from './streamGenerateText';
import { robustlyParseJsonObject } from '../../utils/jsonParser';
import { analysisGoalCandidateSchema } from './schemas/agentSchemas';
import { prepareSchemaForProvider } from './googleSchemaAdapter';
import { createGoalCandidatesPrompt, goalGeneratorSystemPrompt } from '../prompts/goalPrompts';
import { createProviderModel, isProviderConfigured } from './providerConfig';
import {
    ContextTelemetryTarget,
    createContextSection,
    formatColumnProfiles,
    formatRows,
    prepareManagedContext,
    reportContextDiagnostics,
    trimRawDataSample,
} from './contextManager';
import { formatColumnDisplayHints } from '../dashboard/businessLabelResolver';
import { runWithOverflowCompaction } from './overflowRetry';
import { withTransientRetry } from './transientRetry';
import { formatReportContextForPrompt, resolveEffectiveReportContext } from '../agent/reportContext';
import { formatDatasetSemanticsForPrompt } from '../agent/datasetSemantics';
import { buildAnalysisIntentBrief, buildAnalysisRankingHints, formatAnalysisIntentBrief } from '../agent/analysisBrief';

export const generateAnalysisGoalCandidates = async (
    columns: ColumnProfile[],
    sampleData: CsvRow[],
    settings: Settings,
    telemetryTarget?: ContextTelemetryTarget,
): Promise<AnalysisGoalCandidate[]> => {
    if (!isProviderConfigured(settings)) return [{ title: "Perform a general analysis of the dataset.", description: "Explore the data to find key patterns and insights.", confidence: 0.5, isRecommended: true }];

    try {
        const state = telemetryTarget as (ContextTelemetryTarget & Partial<Pick<
            AppState,
            'rawCsvData' | 'csvData' | 'reportContextResolution' | 'datasetSemanticSnapshot' | 'semanticDatasetVersion' | 'dataPreparationPlan'
        >>) | undefined;
        const reportContext = resolveEffectiveReportContext(
            state?.reportContextResolution ?? null,
            state?.rawCsvData ?? null,
            state?.csvData ?? null,
        );
        const semanticContext = formatDatasetSemanticsForPrompt(
            state?.datasetSemanticSnapshot ?? null,
            state?.semanticDatasetVersion ?? null,
            state?.csvData ?? null,
            columns,
        );
        const analysisBrief = buildAnalysisIntentBrief({
            columns,
            csvData: state?.csvData ?? null,
            dataPreparationPlan: state?.dataPreparationPlan ?? null,
            datasetSemanticSnapshot: state?.datasetSemanticSnapshot ?? null,
            semanticDatasetVersion: state?.semanticDatasetVersion ?? null,
        });
        const rankingHints = buildAnalysisRankingHints(analysisBrief, columns, {
            title: state?.csvData?.fileName ?? null,
            reportTitle: reportContext?.reportTitle ?? null,
            parameterLines: reportContext?.parameterLines ?? [],
        });
        const systemPrompt = goalGeneratorSystemPrompt;
        const { model, modelId } = createProviderModel(settings, settings.complexModel);
        const result = await runWithOverflowCompaction({
            provider: settings.provider,
            execute: async compactionMode => {
                const managed = await prepareManagedContext({
                    callType: 'goal',
                    systemText: systemPrompt,
                    baseUserText: 'Infer the most likely analysis goals for this dataset.',
                    sections: [
                        createContextSection('report_context', `Report context:\n${formatReportContextForPrompt(reportContext)}`, 'high', 'sticky'),
                        createContextSection('dataset_semantics', `Dataset semantics:\n${semanticContext}`, 'high', 'sticky'),
                        createContextSection('analysis_intent_brief', `Analysis intent brief:\n${formatAnalysisIntentBrief(analysisBrief)}`, 'high', 'sticky'),
                        createContextSection('planning_hints', `Preferred grain columns: ${rankingHints.preferredGrainColumns.join(', ') || 'none'}\nPreferred time columns: ${rankingHints.preferredTimeColumns.join(', ') || 'none'}\nAvoid grain columns: ${rankingHints.avoidGrainColumns.join(', ') || 'none'}\nPreferred metric terms: ${rankingHints.preferredMetricTerms.join(', ') || 'none'}\nPreferred business terms: ${rankingHints.preferredBusinessTerms.join(', ') || 'none'}`, 'high', 'sticky'),
                        createContextSection('dataset_schema', `Dataset columns (schema):\n${formatColumnProfiles(columns)}`, 'required', 'sticky'),
                        createContextSection('column_display_hints', `User-facing column label hints:\n${formatColumnDisplayHints(columns)}`, 'high', 'sticky'),
                        createContextSection('sample_data', `Sample data:\n${formatRows(trimRawDataSample(sampleData, 8))}`, 'high', 'prunable'),
                    ],
                    settings,
                    modelId,
                    compactionMode,
                });
                reportContextDiagnostics(telemetryTarget, managed.diagnostics);
                const promptContent = createGoalCandidatesPrompt(managed.userText);
                return withTransientRetry(
                    (fb) => streamGenerateText({
                        model: fb ?? model,
                        messages: [
                            { role: 'system', content: managed.systemText },
                            { role: 'user', content: promptContent },
                        ],
                        output: Output.object({ schema: jsonSchema(prepareSchemaForProvider(analysisGoalCandidateSchema, settings.provider) as Parameters<typeof jsonSchema>[0]) }),
                    }),
                    { settings, primaryModelId: modelId, label: 'goalGenerator' },
                );
            },
        });

        const parsed = result.output !== undefined
            ? result.output as { goals: AnalysisGoalCandidate[] }
            : robustlyParseJsonObject(result.text);
        const goals = parsed.goals as AnalysisGoalCandidate[];
        
        if (!goals || goals.length === 0) {
            throw new Error("AI did not return any goal candidates.");
        }

        // Find the goal with the highest confidence and mark it as recommended
        let highestConfidence = -1;
        let recommendedIndex = -1;
        goals.forEach((goal, index) => {
            if (goal.confidence > highestConfidence) {
                highestConfidence = goal.confidence;
                recommendedIndex = index;
            }
        });

        if (recommendedIndex !== -1) {
            goals[recommendedIndex].isRecommended = true;
        }

        return goals;

    } catch (error) {
        console.error("Error generating analysis goal candidates:", error);
        return [{ title: "Perform a general analysis of the dataset.", description: "Explore the data to find key patterns and insights.", confidence: 0.5, isRecommended: true }]; // Fallback on error
    }
};
