import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from './streamGenerateText';
import type {
    AiIntakeStructureBoundary,
    IntakePreScanSignals,
    Settings,
} from '../../types';
import { createProviderModel, isProviderConfigured } from './providerConfig';
import { prepareSchemaForProvider } from './googleSchemaAdapter';
import { intakeStructureBoundarySchema } from './schemas/intakeStructureSchema';
import { withTransientRetry } from './transientRetry';
import {
    type ContextTelemetryTarget,
    createContextSection,
    prepareManagedContext,
    reportContextDiagnostics,
} from './contextManager';
import {
    createIntakeStructurePrompt,
    formatPreScanSignalsForPrompt,
    formatRowsForIntakePrompt,
    intakeStructureSystemPrompt,
} from '../prompts/runtime/reportIntakePrompts';
import { runWithOverflowCompaction } from './overflowRetry';
import { CloudAiConsentDeclinedError } from '../privacy/cloudAiConsent';

const LOG_PREFIX = '[IntakeStructureDetector]';

const normalizeRowKey = (row: string[] | undefined): string =>
    (row ?? [])
        .map(cell => String(cell ?? '').trim())
        .filter(Boolean)
        .join(' | ')
        .toLowerCase();

const inferRepeatedHeaderRowIndexes = (
    rows: string[][],
    headerRowIndex: number,
    bodyStartIndex: number,
): number[] => {
    const headerKey = normalizeRowKey(rows[headerRowIndex]);
    if (!headerKey) {
        return [];
    }

    const repeatedHeaderRowIndexes: number[] = [];
    for (let index = 0; index < Math.min(bodyStartIndex, rows.length); index += 1) {
        if (index === headerRowIndex) continue;
        if (normalizeRowKey(rows[index]) === headerKey) {
            repeatedHeaderRowIndexes.push(index);
        }
    }

    return repeatedHeaderRowIndexes;
};

/**
 * Use AI to detect header/body/summary boundaries in a report-shaped CSV.
 * Returns null if AI is not configured, or if the AI call fails.
 * The caller should fall back to deterministic heuristics when null is returned.
 */
export const detectIntakeStructureWithAi = async (
    normalizedRows: string[][],
    preScanSignals: IntakePreScanSignals,
    settings: Settings,
    telemetryTarget?: ContextTelemetryTarget,
): Promise<AiIntakeStructureBoundary | null> => {
    if (!isProviderConfigured(settings)) {
        return null;
    }

    try {
        const { model, modelId } = createProviderModel(settings, settings.simpleModel);
        const result = await runWithOverflowCompaction({
            provider: settings.provider,
            execute: async compactionMode => {
                const managed = await prepareManagedContext({
                    callType: 'goal',
                    systemText: intakeStructureSystemPrompt,
                    baseUserText: 'Detect the header, body, and summary boundaries for this CSV file.',
                    sections: [
                        createContextSection(
                            'raw_rows',
                            `Total rows: ${normalizedRows.length}, columns: ${normalizedRows[0]?.length ?? 0}\n\n${formatRowsForIntakePrompt(
                                normalizedRows,
                                26,
                                6,
                                typeof preScanSignals.deterministicSummaryStartIndex === 'number'
                                    ? { summaryStartIndex: preScanSignals.deterministicSummaryStartIndex }
                                    : undefined,
                            )}`,
                            'required',
                            'sticky',
                        ),
                        createContextSection(
                            'prescan_signals',
                            formatPreScanSignalsForPrompt(preScanSignals),
                            'high',
                            'sticky',
                        ),
                    ],
                    settings,
                    modelId,
                    compactionMode,
                });

                if (telemetryTarget) {
                    reportContextDiagnostics(telemetryTarget, managed.diagnostics);
                }

                return withTransientRetry(
                    (fb) => streamGenerateText({
                        model: fb ?? model,
                        messages: [
                            { role: 'system', content: managed.systemText },
                            { role: 'user', content: createIntakeStructurePrompt(managed.userText) },
                        ],
                        output: Output.object({
                            schema: jsonSchema(prepareSchemaForProvider(intakeStructureBoundarySchema, settings.provider)),
                        }),
                    }),
                    { settings, primaryModelId: modelId, label: 'intakeStructureDetector' },
                );
            },
        });

        const raw = result.output as Partial<AiIntakeStructureBoundary>;
        if (
            typeof raw?.headerRowIndex !== 'number'
            || typeof raw?.bodyStartIndex !== 'number'
            || typeof raw?.summaryStartIndex !== 'number'
        ) {
            console.warn(`${LOG_PREFIX} AI returned incomplete boundary, discarding.`, raw);
            return null;
        }

        // Headerless path: skip repeated header inference when headerRowIndex is -1
        const repeatedHeaderRowIndexes = raw.headerRowIndex >= 0
            ? Array.from(new Set([
                ...inferRepeatedHeaderRowIndexes(normalizedRows, raw.headerRowIndex, raw.bodyStartIndex),
                ...(Array.isArray(raw.repeatedHeaderRowIndexes) ? raw.repeatedHeaderRowIndexes.filter(index => Number.isInteger(index)) : []),
            ])).sort((left, right) => left - right)
            : [];

        return {
            headerRowIndex: raw.headerRowIndex,
            headerLayerIndexes: Array.isArray(raw.headerLayerIndexes) ? raw.headerLayerIndexes : [],
            bodyStartIndex: raw.bodyStartIndex,
            summaryStartIndex: raw.summaryStartIndex,
            parameterRowIndexes: Array.isArray(raw.parameterRowIndexes) ? raw.parameterRowIndexes : [],
            repeatedHeaderRowIndexes,
            confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.5,
            reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : '',
            // Pass through AI-inferred synthetic headers for headerless files.
            // If AI returned -1 but omitted syntheticHeaders, generate positional
            // fallback names so the headerless path can still proceed.
            ...(raw.headerRowIndex === -1
                ? {
                    syntheticHeaders: Array.isArray(raw.syntheticHeaders) && raw.syntheticHeaders.length > 0
                        ? raw.syntheticHeaders
                        : Array.from({ length: normalizedRows[0]?.length ?? 0 }, (_, i) => `Column_${i + 1}`),
                }
                : {}),
        };
    } catch (error) {
        if (error instanceof CloudAiConsentDeclinedError) {
            return null;
        }
        console.warn(`${LOG_PREFIX} AI detection failed, falling back to deterministic.`, error);
        return null;
    }
};
