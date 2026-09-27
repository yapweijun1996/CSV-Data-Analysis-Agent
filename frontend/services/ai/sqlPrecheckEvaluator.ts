import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from './streamGenerateText';
import type {
    ColumnProfile,
    CsvData,
    Settings,
    SqlPrecheckCandidatePair,
    SqlPrecheckFinding,
} from '../../types';
import { createProviderModel, isProviderConfigured } from './providerConfig';
import { prepareSchemaForProvider } from './googleSchemaAdapter';
import { sqlPrecheckAssessmentSchema } from './schemas/dataSchemas';
import {
    createContextSection,
    formatColumnQualitySummary,
    formatRows,
    prepareManagedContext,
    trimRawDataSample,
} from './contextManager';
import { createSqlPrecheckPrompt, sqlPrecheckSystemPrompt } from '../prompts/sqlPrecheckPrompts';
import { runWithOverflowCompaction } from './overflowRetry';
import { withTransientRetry } from './transientRetry';

export type AiSqlPrecheckAssessment = {
    status: 'passed' | 'blocked';
    summary: string;
    findings: SqlPrecheckFinding[];
    candidatePairs: SqlPrecheckCandidatePair[];
};

const VALID_FINDING_KINDS = new Set<SqlPrecheckFinding['kind']>([
    'null_heavy_metric',
    'constant_metric',
    'zero_total_metric',
    'flat_grouped_metric',
    'low_distinct_dimension',
    'parse_failures_remaining',
    'high_fragmentation',
    'no_viable_candidates',
]);

const VALID_CONFIDENCE = new Set<SqlPrecheckCandidatePair['confidence']>(['high', 'medium', 'low']);
const NUMERIC_TYPES = new Set<ColumnProfile['type']>(['numerical', 'currency', 'percentage']);
const DIMENSION_TYPES = new Set<ColumnProfile['type']>(['categorical', 'date', 'time']);

const sanitizeFinding = (value: unknown, profileMap: Map<string, ColumnProfile>): SqlPrecheckFinding | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const candidate = value as Record<string, unknown>;
    const kind = typeof candidate.kind === 'string' && VALID_FINDING_KINDS.has(candidate.kind as SqlPrecheckFinding['kind'])
        ? candidate.kind as SqlPrecheckFinding['kind']
        : null;
    const severity = candidate.severity === 'block' ? 'block' : candidate.severity === 'warn' ? 'warn' : null;
    const message = typeof candidate.message === 'string' ? candidate.message.trim() : '';

    if (!kind || !severity || !message) {
        return null;
    }

    const finding: SqlPrecheckFinding = { kind, severity, message };

    if (typeof candidate.column === 'string' && profileMap.has(candidate.column)) {
        finding.column = candidate.column;
    }
    if (typeof candidate.metric === 'string' && NUMERIC_TYPES.has(profileMap.get(candidate.metric)?.type ?? 'categorical')) {
        finding.metric = candidate.metric;
    }
    if (typeof candidate.dimension === 'string' && DIMENSION_TYPES.has(profileMap.get(candidate.dimension)?.type ?? 'numerical')) {
        finding.dimension = candidate.dimension;
    }

    return finding;
};

const sanitizeCandidatePair = (
    value: unknown,
    profileMap: Map<string, ColumnProfile>,
): SqlPrecheckCandidatePair | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const candidate = value as Record<string, unknown>;
    const dimension = typeof candidate.dimension === 'string' ? candidate.dimension.trim() : '';
    const metric = typeof candidate.metric === 'string' ? candidate.metric.trim() : '';
    const confidence = typeof candidate.confidence === 'string' && VALID_CONFIDENCE.has(candidate.confidence as SqlPrecheckCandidatePair['confidence'])
        ? candidate.confidence as SqlPrecheckCandidatePair['confidence']
        : 'medium';
    const reason = typeof candidate.reason === 'string' ? candidate.reason.trim() : '';

    if (!dimension || !metric || !reason) {
        return null;
    }

    const dimensionProfile = profileMap.get(dimension);
    const metricProfile = profileMap.get(metric);
    if (!dimensionProfile || !metricProfile) {
        return null;
    }
    if (!DIMENSION_TYPES.has(dimensionProfile.type) || !NUMERIC_TYPES.has(metricProfile.type)) {
        return null;
    }

    return { dimension, metric, confidence, reason };
};

export const evaluateAiSqlPrecheck = async ({
    data,
    columns,
    settings,
}: {
    data: CsvData;
    columns: ColumnProfile[];
    settings: Settings;
}): Promise<AiSqlPrecheckAssessment | null> => {
    if (!isProviderConfigured(settings)) {
        return null;
    }

    const profileMap = new Map(columns.map(column => [column.name, column]));

    try {
        const { model, modelId } = createProviderModel(settings, settings.complexModel);
        const result = await runWithOverflowCompaction({
            provider: settings.provider,
            execute: async compactionMode => {
                const managed = await prepareManagedContext({
                    callType: 'goal',
                    systemText: sqlPrecheckSystemPrompt,
                    baseUserText: 'Assess SQL analysis readiness, propose stable metric/dimension pairs, and list any blockers.',
                    sections: [
                        createContextSection('dataset_identity', `File name: ${data.fileName}\nPrepared row count: ${data.data.length}`, 'required', 'sticky'),
                        createContextSection('column_profiles', `Column profiles:\n${formatColumnQualitySummary(columns)}`, 'required', 'sticky'),
                        createContextSection('row_sample', `Prepared row sample:\n${formatRows(trimRawDataSample(data.data, 12))}`, 'required', 'sticky'),
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
                            { role: 'user', content: createSqlPrecheckPrompt(managed.userText) },
                        ],
                        output: Output.object({
                            schema: jsonSchema(prepareSchemaForProvider(sqlPrecheckAssessmentSchema, settings.provider)),
                        }),
                    }),
                    { settings, primaryModelId: modelId, label: 'sqlPrecheckEvaluator' },
                );
            },
        });

        const rawOutput = (result.output ?? {}) as Record<string, unknown>;
        const aiCandidatePairs = Array.isArray(rawOutput.candidatePairs)
            ? rawOutput.candidatePairs
                .map(candidate => sanitizeCandidatePair(candidate, profileMap))
                .filter((candidate): candidate is SqlPrecheckCandidatePair => Boolean(candidate))
                .filter((candidate, index, array) =>
                    array.findIndex(entry => entry.dimension === candidate.dimension && entry.metric === candidate.metric) === index)
                .slice(0, 3)
            : [];
        const findings = Array.isArray(rawOutput.findings)
            ? rawOutput.findings
                .map(finding => sanitizeFinding(finding, profileMap))
                .filter((finding): finding is SqlPrecheckFinding => Boolean(finding))
                .slice(0, 8)
            : [];

        // If AI returned 0 candidate pairs despite the dataset having valid dimension+metric
        // columns (common when AI is overly conservative about null rates), synthesize a
        // profile-based fallback pair so verification can proceed. Missing values in a
        // dimension are fine for SQL GROUP BY — NULLs simply form their own group.
        const candidatePairs: SqlPrecheckCandidatePair[] = aiCandidatePairs.length > 0
            ? aiCandidatePairs
            : (() => {
                const dimCol = columns
                    .filter(p => DIMENSION_TYPES.has(p.type) && (p.missingPercentage ?? 0) < 100)
                    .sort((a, b) => (a.missingPercentage ?? 0) - (b.missingPercentage ?? 0))[0];
                // Also match columns with hasFormattedNumbers — these are comma-formatted
                // strings ("1,234.56") that the profiler tagged as numeric-like but may
                // have a categorical type at this stage of the pipeline.
                const isMetricLike = (p: ColumnProfile) =>
                    NUMERIC_TYPES.has(p.type) || p.hasFormattedNumbers === true;
                const metricCol = columns
                    .filter(p => isMetricLike(p) && (p.missingPercentage ?? 0) < 100)
                    .sort((a, b) => (a.missingPercentage ?? 0) - (b.missingPercentage ?? 0))[0];
                if (dimCol && metricCol) {
                    console.info('[SqlPrecheckEvaluator] AI returned 0 candidate pairs; synthesizing profile-based fallback pair:', dimCol.name, 'x', metricCol.name);
                    return [{
                        dimension: dimCol.name,
                        metric: metricCol.name,
                        confidence: 'low' as const,
                        reason: 'Profile-based fallback: AI returned no candidates but valid dimension and metric columns were detected from column profiles.',
                    }];
                }
                return [];
            })();

        const status = rawOutput.status === 'blocked' || candidatePairs.length === 0
            ? 'blocked'
            : 'passed';
        const summary = typeof rawOutput.summary === 'string' && rawOutput.summary.trim()
            ? rawOutput.summary.trim()
            : (status === 'passed'
                ? 'AI SQL precheck found at least one viable grouped analysis path.'
                : 'AI SQL precheck did not find a stable grouped analysis path.');

        return {
            status,
            summary,
            findings,
            candidatePairs,
        };
    } catch (error) {
        console.warn('[SqlPrecheckEvaluator] AI SQL precheck failed, falling back to deterministic guard.', error);
        return null;
    }
};
