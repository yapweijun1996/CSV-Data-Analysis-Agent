/**
 * Column Label Classifier — AI-driven harness module.
 *
 * Harness pattern (Phase 4 of dataInvestigationHarness):
 *   1. Identify unnamed columns (_unnamed_column_X)
 *   2. Query sample values from each via DuckDB value_counts
 *   3. Single AI batch call to infer human-readable label for each column
 *   4. Return Record<originalName, inferredLabel> as a runtime directive
 *
 * Fallback: returns {} when AI is unavailable or times out — pipeline continues unaffected.
 */

import type { ColumnProfile, Settings } from '../../../types';
import type { DuckDbAnalysisBinding } from './investigationTypes';

const LOG_PREFIX = '[ColumnLabelClassifier]';
const COLUMN_LABEL_TIMEOUT_MS = 8_000;
const QUERY_TIMEOUT_MS = 5_000;
const MAX_SAMPLE_VALUES = 20;
const UNNAMED_COLUMN_RE = /^_unnamed_column_\d+$/i;

/**
 * Infer human-readable labels for unnamed columns based on their data content.
 *
 * AI-first: sends sample values to the model and parses the response.
 * Falls back to empty map if AI is unavailable or returns unparseable output.
 */
export const classifyUnnamedColumnLabels = async (
    columns: ColumnProfile[],
    binding: DuckDbAnalysisBinding,
    settings: Settings | null | undefined,
): Promise<Record<string, string>> => {
    const unnamedColumns = columns.filter(c => UNNAMED_COLUMN_RE.test(c.name));
    if (unnamedColumns.length === 0) {
        return {};
    }

    // Lazy-load AI dependencies to avoid breaking module loading in test environments.
    let isProviderConfigured: (s: Settings) => boolean;
    try {
        const providerConfig = await import('../../ai/providerConfig');
        isProviderConfigured = providerConfig.isProviderConfigured;
    } catch {
        return {};
    }

    if (!settings || !isProviderConfigured(settings)) {
        console.log(`${LOG_PREFIX} No AI available — skipping label inference for ${unnamedColumns.length} unnamed column(s).`);
        return {};
    }

    // Collect sample values for each unnamed column via DuckDB value_counts.
    const columnSamples: Record<string, string[]> = {};
    try {
        const { executeUnifiedQuery } = await import('../../duckdb/unifiedQueryExecutor');
        for (const col of unnamedColumns) {
            try {
                const result = await executeUnifiedQuery({
                    kind: 'value_counts' as const,
                    purpose: `Sample values for unnamed column "${col.name}"`,
                    params: { column: col.name, limit: MAX_SAMPLE_VALUES },
                    options: { timeout: QUERY_TIMEOUT_MS, skipDirectiveInjection: true },
                }, { binding, allowedColumns: [col.name] });

                const values = result.rows
                    .map(row => String(row[col.name] ?? row.value ?? '').trim())
                    .filter(v => v.length > 0);
                if (values.length > 0) {
                    columnSamples[col.name] = values;
                }
            } catch {
                // Single column query failed — skip this column, continue with others.
            }
        }
    } catch {
        return {};
    }

    const columnsWithSamples = Object.entries(columnSamples);
    if (columnsWithSamples.length === 0) {
        return {};
    }

    // Build a single batched AI prompt for all unnamed columns.
    const columnDescriptions = columnsWithSamples
        .map(([col, samples]) => `${col}: [${samples.slice(0, MAX_SAMPLE_VALUES).map(v => `"${v}"`).join(', ')}]`)
        .join('\n');

    const systemPrompt = [
        'You are a data analyst examining unnamed columns in a CSV dataset.',
        'For each column, you are given its internal name and a sample of its actual data values.',
        'Your task: infer the most likely human-readable label for each column based solely on its values.',
        '',
        'Rules:',
        '- Respond with exactly one line per column: `_unnamed_column_X: Label`',
        '- Label should be concise (1–3 words), title-case (e.g. "Currency Code", "Status", "Unit")',
        '- Base the label entirely on the sample values — do NOT guess from column position',
        '- If the values are ambiguous or you cannot determine the meaning, respond: `_unnamed_column_X: Unknown`',
        '- Do not include any other text, explanations, or formatting',
    ].join('\n');

    const userPrompt = `Unnamed columns and their sample values:\n${columnDescriptions}`;

    try {
        const { generateText } = await import('ai');
        const { createProviderModel } = await import('../../ai/providerConfig');
        const { withTransientRetry } = await import('../../ai/transientRetry');
        const { model, modelId } = createProviderModel(settings, settings.simpleModel);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('column_label_classifier_timeout')), COLUMN_LABEL_TIMEOUT_MS);
        let result: Awaited<ReturnType<typeof generateText>>;
        try {
            result = await withTransientRetry(
                (fb) => generateText({
                    model: fb ?? model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    abortSignal: controller.signal,
                }),
                { settings, primaryModelId: modelId, label: 'columnLabelClassifier', abortSignal: controller.signal },
            );
            clearTimeout(timer);
        } catch (err) {
            clearTimeout(timer);
            throw err;
        }

        const inferredLabels: Record<string, string> = {};
        for (const line of result.text.split('\n')) {
            const match = line.match(/^(_unnamed_column_\d+)\s*:\s*(.+)$/i);
            if (match) {
                const col = match[1].toLowerCase();
                const label = match[2].trim();
                if (label && label.toLowerCase() !== 'unknown') {
                    inferredLabels[col] = label;
                }
            }
        }

        const inferredCount = Object.keys(inferredLabels).length;
        console.log(`${LOG_PREFIX} Inferred ${inferredCount}/${columnsWithSamples.length} column label(s):`,
            Object.entries(inferredLabels).map(([k, v]) => `${k} → "${v}"`).join(', ') || '(none)',
        );
        return inferredLabels;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`${LOG_PREFIX} AI label inference failed: ${msg}`);
        return {};
    }
};
