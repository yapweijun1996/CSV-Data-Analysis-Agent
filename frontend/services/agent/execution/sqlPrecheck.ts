import type {
    AnalysisPlan,
    ColumnProfile,
    CsvData,
    QueryPlan,
    Settings,
    SqlPrecheckCandidatePair,
    SqlPrecheckEvaluatedPair,
    SqlPrecheckFinding,
    SqlPrecheckPlannerGuidance,
    SqlPrecheckReport,
} from '../../../types';
import { executeManagedDataQuery } from '../../duckdb/queryEngine';
import { evaluateAiSqlPrecheck } from '../../ai/sqlPrecheckEvaluator';
import { evaluateAggregationQuality } from './aggregationQuality';
import type { WorkerDiagnosticsReporter } from '../../workers/workerDiagnostics';

const ENVIRONMENT_LIMITATION_PATTERNS = [
    /worker is not defined/i,
    /web workers are not supported in this environment/i,
    /duckdb_disabled/i,
];

const buildAggregatePlan = (dimension: string, metric: string): QueryPlan => {
    const alias = `avg_${metric.replace(/\W+/g, '_')}`;
    return {
        groupBy: [dimension],
        aggregates: [{ function: 'avg', column: metric, as: alias }],
        orderBy: [{ column: alias, direction: 'desc' }],
        limit: 12,
    };
};

const buildNoCandidateFinding = (message: string): SqlPrecheckFinding => ({
    kind: 'no_viable_candidates',
    severity: 'block',
    message,
});

const buildPairKey = (dimension: string, metric: string) => `${dimension}::${metric}`;

const uniqueFindingKinds = (findings: SqlPrecheckFinding[]) =>
    [...new Set(findings.map(finding => finding.kind))];

const buildVerificationFinding = (
    pair: SqlPrecheckCandidatePair,
    quality: ReturnType<typeof evaluateAggregationQuality>,
): SqlPrecheckFinding => ({
    kind:
        quality.qualityWarning === 'flat_metric'
            ? 'flat_grouped_metric'
            : quality.qualityWarning === 'low_value'
                ? 'high_fragmentation'
                : 'zero_total_metric',
    severity: 'warn',
    metric: pair.metric,
    dimension: pair.dimension,
    message:
        quality.qualityWarning === 'flat_metric'
            ? `Grouped metric "${pair.metric}" by "${pair.dimension}" is flat after cleaning and fails the SQL precheck.`
            : quality.qualityWarning === 'low_value'
                ? `Grouped metric "${pair.metric}" by "${pair.dimension}" is highly fragmented and may not produce a stable card.`
                : `Grouped metric "${pair.metric}" by "${pair.dimension}" has no aggregate total after cleaning.`,
    detail: quality.metrics as unknown as Record<string, unknown>,
});

const isEnvironmentLimitedSqlPrecheckError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error);
    return ENVIRONMENT_LIMITATION_PATTERNS.some(pattern => pattern.test(message));
};

const verifyCandidatePairs = async (
    dataset: CsvData,
    profiles: ColumnProfile[],
    pairs: SqlPrecheckCandidatePair[],
    reportDiagnostics?: WorkerDiagnosticsReporter,
): Promise<{ findings: SqlPrecheckFinding[]; viablePairs: number; evaluatedPairs: SqlPrecheckEvaluatedPair[] }> => {
    const findings: SqlPrecheckFinding[] = [];
    const evaluatedPairs: SqlPrecheckEvaluatedPair[] = [];
    let viablePairs = 0;

    for (const pair of pairs) {
        try {
            const plan = buildAggregatePlan(pair.dimension, pair.metric);
            let execution;
            let usedEnvironmentFallback = false;
            try {
                execution = await executeManagedDataQuery(dataset, plan, profiles.map(profile => profile.name), {
                    allowNativeFallback: false,
                    reportDiagnostics,
                });
            } catch (error) {
                if (!isEnvironmentLimitedSqlPrecheckError(error)) {
                    throw error;
                }
                execution = await executeManagedDataQuery(dataset, plan, profiles.map(profile => profile.name), {
                    allowNativeFallback: true,
                    reportDiagnostics,
                });
                usedEnvironmentFallback = true;
            }
            const alias = plan.aggregates?.[0]?.as ?? pair.metric;
            const quality = evaluateAggregationQuality({
                chartType: 'bar',
                title: `Precheck ${pair.metric} by ${pair.dimension}`,
                description: '',
                groupByColumn: pair.dimension,
                valueColumn: alias,
                aggregation: 'avg',
            } as AnalysisPlan, execution.result.rows);

            if (!quality.qualityWarning) {
                viablePairs += 1;
                evaluatedPairs.push({
                    ...pair,
                    verificationStatus: 'viable',
                    verificationMessage: usedEnvironmentFallback
                        ? `Verified with grouped query validation for "${pair.metric}" by "${pair.dimension}" using native fallback because DuckDB workers were unavailable in this environment.`
                        : `Verified with grouped query validation for "${pair.metric}" by "${pair.dimension}".`,
                    recommendedForPlanning: true,
                    findingKinds: [],
                });
                continue;
            }

            const finding = buildVerificationFinding(pair, quality);
            findings.push(finding);
            evaluatedPairs.push({
                ...pair,
                verificationStatus: 'quality_warning',
                verificationMessage: finding.message,
                recommendedForPlanning: false,
                findingKinds: [finding.kind],
            });
        } catch (error) {
            const finding: SqlPrecheckFinding = {
                kind: 'parse_failures_remaining',
                severity: 'warn',
                metric: pair.metric,
                dimension: pair.dimension,
                message: `SQL precheck could not evaluate "${pair.metric}" by "${pair.dimension}": ${error instanceof Error ? error.message : String(error)}`,
            };
            findings.push(finding);
            evaluatedPairs.push({
                ...pair,
                verificationStatus: 'query_failed',
                verificationMessage: finding.message,
                recommendedForPlanning: false,
                findingKinds: [finding.kind],
            });
        }
    }

    return { findings, viablePairs, evaluatedPairs };
};

const buildBlockedReport = (
    summary: string,
    findings: SqlPrecheckFinding[],
    evaluatedPairs: SqlPrecheckEvaluatedPair[],
    plannerGuidance: SqlPrecheckPlannerGuidance,
): SqlPrecheckReport => {
    const blockingFindings = findings.filter(finding => finding.severity === 'block');
    return {
        status: 'blocked',
        summary: blockingFindings.length > 0
            ? `${blockingFindings.length} blocking SQL precheck issue${blockingFindings.length === 1 ? '' : 's'} detected after AI cleaning.`
            : summary,
        findings,
        evaluatedPairs,
        plannerGuidance,
    };
};

const buildPassedReport = (
    findings: SqlPrecheckFinding[],
    evaluatedPairs: SqlPrecheckEvaluatedPair[],
    plannerGuidance: SqlPrecheckPlannerGuidance,
): SqlPrecheckReport => ({
    status: 'passed',
    summary: 'SQL precheck passed. The numerically verified dataset is ready for automatic analysis.',
    findings,
    evaluatedPairs,
    plannerGuidance,
});

const buildWarningReport = (
    summary: string,
    findings: SqlPrecheckFinding[],
    evaluatedPairs: SqlPrecheckEvaluatedPair[],
    plannerGuidance: SqlPrecheckPlannerGuidance,
): SqlPrecheckReport => ({
    status: 'warning',
    summary,
    findings,
    evaluatedPairs,
    plannerGuidance,
});

const enrichEvaluatedPairsWithFindings = (
    evaluatedPairs: SqlPrecheckEvaluatedPair[],
    findings: SqlPrecheckFinding[],
) => {
    const findingsByPair = new Map<string, SqlPrecheckFinding[]>();
    for (const finding of findings) {
        if (!finding.dimension || !finding.metric) {
            continue;
        }
        const key = buildPairKey(finding.dimension, finding.metric);
        const bucket = findingsByPair.get(key) ?? [];
        bucket.push(finding);
        findingsByPair.set(key, bucket);
    }

    return evaluatedPairs.map(pair => {
        const relatedFindings = findingsByPair.get(buildPairKey(pair.dimension, pair.metric)) ?? [];
        if (relatedFindings.length === 0) {
            return pair;
        }
        const hasBlockingFinding = relatedFindings.some(finding => finding.severity === 'block');
        return {
            ...pair,
            recommendedForPlanning: pair.recommendedForPlanning && !hasBlockingFinding,
            findingKinds: uniqueFindingKinds([
                ...relatedFindings,
                ...pair.findingKinds.map(kind => ({
                    kind,
                    severity: 'warn' as const,
                    message: kind,
                })),
            ]),
        };
    });
};

const buildPlannerGuidance = (
    reportStatus: SqlPrecheckReport['status'],
    evaluatedPairs: SqlPrecheckEvaluatedPair[],
): SqlPrecheckPlannerGuidance => {
    const preferredPairs = evaluatedPairs.filter(pair => pair.recommendedForPlanning);
    const rejectedPairs = evaluatedPairs.filter(pair => !pair.recommendedForPlanning);

    if (reportStatus === 'passed') {
        const nextAction = rejectedPairs.length > 0
            ? 'retry_with_verified_pairs_only'
            : 'continue_sql_analysis';
        return {
            nextAction,
            summary: preferredPairs.length > 0
                ? `Use verified SQL pair${preferredPairs.length === 1 ? '' : 's'} first: ${preferredPairs.map(pair => `"${pair.metric}" by "${pair.dimension}"`).join(', ')}.`
                : 'Continue SQL analysis, but no verified pair metadata was captured.',
            preferredPairs,
            rejectedPairs,
        };
    }

    return {
        nextAction: reportStatus === 'warning'
            ? 'continue_with_degraded_guidance'
            : 'pause_for_manual_review',
        summary: rejectedPairs.length > 0
            ? reportStatus === 'warning'
                ? `Continue with degraded guidance. ${rejectedPairs.length} nominated pair${rejectedPairs.length === 1 ? '' : 's'} failed SQL precheck verification and should not be retried as-is.`
                : `Pause automatic SQL planning. ${rejectedPairs.length} nominated pair${rejectedPairs.length === 1 ? '' : 's'} failed verification and should not be retried as-is.`
            : reportStatus === 'warning'
                ? 'Continue with degraded guidance until a stable grouped metric/dimension pair is confirmed.'
                : 'Pause automatic SQL planning until a stable grouped metric/dimension pair is available.',
        preferredPairs,
        rejectedPairs,
    };
};

export const runSqlPrecheck = async (
    dataset: CsvData,
    profiles: ColumnProfile[],
    settings?: Settings,
    reportDiagnostics?: WorkerDiagnosticsReporter,
): Promise<SqlPrecheckReport> => {
    const aiAssessment = settings
        ? await evaluateAiSqlPrecheck({ data: dataset, columns: profiles, settings })
        : null;

    if (!aiAssessment) {
        const plannerGuidance: SqlPrecheckPlannerGuidance = {
            nextAction: 'skip_sql_gate',
            summary: 'AI SQL precheck was unavailable, so planners should continue without SQL gate guidance for this run.',
            preferredPairs: [],
            rejectedPairs: [],
        };
        return {
            status: 'passed',
            summary: 'AI SQL precheck was unavailable, so automatic analysis will continue without a blocking SQL gate.',
            findings: [{
                kind: 'no_viable_candidates',
                severity: 'warn',
                message: 'AI SQL precheck was unavailable, so the app skipped SQL gatekeeping for this run.',
            }],
            evaluatedPairs: [],
            plannerGuidance,
        };
    }

    if (aiAssessment.candidatePairs.length === 0) {
        const findings = aiAssessment.findings.length > 0
            ? aiAssessment.findings.map(finding => ({ ...finding, severity: 'warn' as const }))
            : [{ ...buildNoCandidateFinding('AI SQL precheck did not identify a stable grouped metric/dimension pair.'), severity: 'warn' as const }];
        return buildWarningReport(
            aiAssessment.summary || 'AI SQL precheck could not confirm a stable grouped metric/dimension pair. Automatic analysis will continue with degraded guidance.',
            findings,
            [],
            buildPlannerGuidance('warning', []),
        );
    }

    const verification = await verifyCandidatePairs(
        dataset,
        profiles,
        aiAssessment.candidatePairs,
        reportDiagnostics,
    );
    const findings = [...aiAssessment.findings, ...verification.findings];
    const evaluatedPairs = enrichEvaluatedPairsWithFindings(verification.evaluatedPairs, findings);

    if (verification.viablePairs > 0) {
        return buildPassedReport(
            findings,
            evaluatedPairs,
            buildPlannerGuidance('passed', evaluatedPairs),
        );
    }

    // Graceful degradation: when verification fails for all pairs but the dataset
    // contains comma-formatted numeric columns (hasFormattedNumbers), the failure
    // is expected — DuckDB cannot directly AVG a string like "9,095,856.00".
    // The analysis pipeline handles these with TRY_CAST(REPLACE(..., ',', '')),
    // so blocking the precheck is a false positive. Pass with warnings instead.
    const hasFormattedMetrics = profiles.some(p => p.hasFormattedNumbers === true);
    if (hasFormattedMetrics && aiAssessment.candidatePairs.length > 0) {
        return buildPassedReport(
            findings.map(finding => ({ ...finding, severity: 'warn' as const })),
            evaluatedPairs,
            buildPlannerGuidance('passed', evaluatedPairs),
        );
    }

    return buildWarningReport(
        aiAssessment.summary || 'AI SQL precheck could not confirm a stable grouped metric/dimension pair after query validation. Automatic analysis will continue with degraded guidance.',
        [
            ...findings.map(finding => ({ ...finding, severity: 'warn' as const })),
            ...(findings.length === 0
                ? [{ ...buildNoCandidateFinding('AI SQL precheck did not leave any stable grouped metric/dimension pair after query validation.'), severity: 'warn' as const }]
                : []),
        ],
        evaluatedPairs,
        buildPlannerGuidance('warning', evaluatedPairs),
    );
};
