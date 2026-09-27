
import { Settings, AnalysisPlan, CsvRow, NextStepResponse } from '../../types';
import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from './streamGenerateText';
import { robustlyParseJsonObject } from '../../utils/jsonParser';
import { nextStepSchema } from './schemas/agentSchemas';
import { prepareSchemaForProvider } from './googleSchemaAdapter';
import { createNextStepPrompt, nextStepSystemPrompt } from '../prompts/nextStepPrompts';
import { createProviderModel } from './providerConfig';
import {
    ContextTelemetryTarget,
    createContextSection,
    formatRows,
    prepareManagedContext,
    reportContextDiagnostics,
    trimRawDataSample,
} from './contextManager';
import { runWithOverflowCompaction } from './overflowRetry';
import { withTransientRetry } from './transientRetry';

export const generateNextStep = async (
    goal: string,
    contextualSummary: string,
    lastObservation: { cardTitle: string; dataSample: CsvRow[]; summary: string } | null,
    planQueue: AnalysisPlan[],
    settings: Settings,
    telemetryTarget?: ContextTelemetryTarget,
): Promise<NextStepResponse> => {
    
    let lastError: Error | undefined;

    for(let i=0; i < 2; i++) { // Self-correction loop
        try {
            const systemPrompt = nextStepSystemPrompt;
            const lastObservationText = lastObservation
                ? `Last observation:\nChart "${lastObservation.cardTitle}"\nSummary: ${lastObservation.summary}\nData sample: ${formatRows(trimRawDataSample(lastObservation.dataSample, 5))}`
                : 'Last observation:\nThis is the first step.';
            const planQueueText = planQueue.length > 0 ? JSON.stringify(planQueue.map(plan => plan.title), null, 2) : 'The analysis plan is empty.';
            const { model, modelId } = createProviderModel(settings, settings.complexModel);
            const result = await runWithOverflowCompaction({
                provider: settings.provider,
                execute: async compactionMode => {
                    const managed = await prepareManagedContext({
                        callType: 'next_step',
                        systemText: systemPrompt,
                        baseUserText: `Decide the next step for the goal "${goal}".`,
                        sections: [
                            createContextSection('contextual_summary', `Current understanding:\n${contextualSummary || 'You have not started the analysis yet.'}`, 'required', 'sticky'),
                            createContextSection('last_observation', lastObservationText, 'high', 'prunable'),
                            createContextSection('plan_queue', `Pending analysis plan:\n${planQueueText}`, 'high', 'sticky'),
                        ],
                        settings,
                        modelId,
                        compactionMode,
                    });
                    reportContextDiagnostics(telemetryTarget, managed.diagnostics);
                    const promptContent = createNextStepPrompt(goal, managed.userText);
                    return withTransientRetry(
                        (fb) => streamGenerateText({
                            model: fb ?? model,
                            messages: [
                                { role: 'system', content: managed.systemText },
                                { role: 'user', content: promptContent },
                            ],
                            output: Output.object({ schema: jsonSchema(prepareSchemaForProvider(nextStepSchema, settings.provider) as Parameters<typeof jsonSchema>[0]) }),
                        }),
                        { settings, primaryModelId: modelId, label: 'stepGenerator' },
                    );
                },
            });

            const parsedResponse = result.output !== undefined
                ? result.output as NextStepResponse
                : robustlyParseJsonObject(result.text) as NextStepResponse;

            // More detailed validation to improve self-correction feedback
            const errors: string[] = [];
            if (!parsedResponse.thought) errors.push("The 'thought' field is missing.");
            if (!parsedResponse.updatedContextualSummary) errors.push("The 'updatedContextualSummary' field is missing.");
            if (!parsedResponse.nextAction) {
                errors.push("The 'nextAction' object is missing.");
            } else {
                const { type, plan, reasonForFinishing } = parsedResponse.nextAction;
                if (!type) {
                    errors.push("The 'nextAction.type' field is missing.");
                } else {
                    if (type === 'EXECUTE_PLAN' || type === 'CREATE_AND_EXECUTE_PLAN') {
                        if (!plan) {
                            errors.push(`For a 'nextAction.type' of '${type}', the 'plan' object is required.`);
                        }
                    }
                    if (type === 'FINISH_AND_SUMMARIZE') {
                        if (!reasonForFinishing) {
                            errors.push("For a 'nextAction.type' of 'FINISH_AND_SUMMARIZE', the 'reasonForFinishing' string is required.");
                        }
                    }
                }
            }
            
            if (errors.length > 0) {
                throw new Error(`AI response failed validation: ${errors.join(' ')}`);
            }

            return parsedResponse;
        
        } catch (error) {
            console.error(`Error in generating next step (Attempt ${i+1}):`, error);
            lastError = error as Error;
        }
    }

    throw new Error(`AI failed to generate a valid next step. Last error: ${lastError?.message}`);
};
