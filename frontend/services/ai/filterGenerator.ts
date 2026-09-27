import { ColumnProfile, CsvRow, Settings, AiFilterResponse } from '../../types';
import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from './streamGenerateText';
import { filterFunctionSchema } from './schemas/dataSchemas';
import { createFilterFunctionPrompt, filterGeneratorSystemPrompt } from '../prompts/dataPrompts';
import { prepareSchemaForProvider } from './googleSchemaAdapter';
import { createProviderModel } from './providerConfig';
import {
    ContextTelemetryTarget,
    createContextSection,
    formatColumnProfiles,
    formatRows,
    prepareManagedContext,
    reportContextDiagnostics,
    trimRawDataSample,
} from './contextManager';
import { runWithOverflowCompaction } from './overflowRetry';
import { withTransientRetry } from './transientRetry';
import { isRuntimeAbortError, throwIfAborted } from '../agent/runtime/runtimeAbort';

export const generateFilterFunction = async (
    query: string,
    columns: ColumnProfile[],
    sampleData: CsvRow[],
    settings: Settings,
    telemetryTarget?: ContextTelemetryTarget,
    abortSignal?: AbortSignal,
): Promise<AiFilterResponse> => {
    
    let lastError: Error | undefined;

    for(let i=0; i < 2; i++) { // Self-correction loop: 1 initial attempt + 1 retry
        try {
            throwIfAborted(abortSignal);
            const systemPrompt = filterGeneratorSystemPrompt;
            const { model, modelId } = createProviderModel(settings, settings.complexModel);
            const result = await runWithOverflowCompaction({
                provider: settings.provider,
                abortSignal,
                execute: async compactionMode => {
                    const managed = await prepareManagedContext({
                        callType: 'tool',
                        systemText: systemPrompt,
                        baseUserText: `Convert the user query into a dataset filter.\nUser query: "${query}"`,
                        sections: [
                            createContextSection('dataset_schema', `Dataset columns (schema):\n${formatColumnProfiles(columns)}`, 'required', 'sticky'),
                            createContextSection('sample_data', `Sample data:\n${formatRows(trimRawDataSample(sampleData, 8))}`, 'high', 'prunable'),
                        ],
                        settings,
                        modelId,
                        compactionMode,
                    });
                    reportContextDiagnostics(telemetryTarget, managed.diagnostics);
                    const promptContent = createFilterFunctionPrompt(query, managed.userText);
                    return withTransientRetry(
                        (fb) => streamGenerateText({
                            model: fb ?? model,
                            messages: [
                                { role: 'system', content: managed.systemText },
                                { role: 'user', content: promptContent },
                            ],
                            output: Output.object({ schema: jsonSchema(prepareSchemaForProvider(filterFunctionSchema, settings.provider) as Parameters<typeof jsonSchema>[0]) }),
                            abortSignal,
                        }),
                        { settings, primaryModelId: modelId, label: 'filterGenerator', abortSignal },
                    );
                },
            });

            const parsed = result.output as AiFilterResponse;

            // Basic validation
            if (parsed.operation && parsed.operation.type === 'filter_rows' && parsed.explanation) {
                return parsed;
            }
            throw new Error("AI response was missing required fields 'operation' or 'explanation'.");
        
        } catch (error) {
            if (isRuntimeAbortError(error, abortSignal)) {
                throw error;
            }
            console.error(`Error in filter function generation (Attempt ${i+1}):`, error);
            lastError = error as Error;
        }
    }

    throw new Error(`AI failed to generate a valid filter function. Last error: ${lastError?.message}`);
};
