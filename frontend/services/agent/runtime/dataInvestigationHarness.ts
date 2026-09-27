import type {
    ColumnProfile,
    EvidenceHarnessContext,
    RuntimeSemanticUnderstanding,
    Settings,
} from '../../../types';
import { duckDbWorkerClient } from '../../workers/duckDbWorkerClient';
import { emitSilentFailure } from '../monitoring/silentFailureTracker';
import type { AnyStoreWithTelemetry } from '../monitoring/silentFailureTracker';
import { classifyDuckDbError } from './dataExplorationQueries';
import { buildCanonicalAnalysisSteering } from '../analysisSteering';
import { classifyUnnamedColumnLabels } from './columnLabelClassifier';

// --- Sub-module imports ---
import type {
    DescriptionTotal,
    DuckDbAnalysisBinding,
    HierarchyGroup,
    DuplicateLabelPair,
    MetricRelationship,
    OutlierInfo,
    MissingColumnPattern,
    TopicConstraint,
    ValueConcentrationResult,
    TemporalProfile,
    CrossDimensionCardinality,
    DimensionCompleteness,
    HarnessCoverageMetric,
    DataInvestigationFindings,
} from './investigationTypes';
import {
    LOG_PREFIX,
    QUERY_TIMEOUT_MS,
    HARNESS_TIMEOUT_MS,
    HIGH_CARDINALITY_DESCRIPTION_THRESHOLD,
    HIGH_CARDINALITY_DESCRIPTION_LIMIT,
    DEFAULT_DESCRIPTION_LIMIT,
    createEmptyRuntimeDirectives,
} from './investigationTypes';
import { detectHierarchyGroups, detectDuplicateLabels, detectMetricRelationships, buildDerivedTopicSuggestions, validateHierarchyCandidatesWithAI } from './hierarchyDetector';
import { detectOutliers, detectMissingDataPatterns, classifySemanticCategories } from './outlierDetector';
import { analyzeTemporalContinuity, detectTemporalProfile } from './temporalProfiler';
import { detectValueConcentration } from './valueConcentration';
import { computeCrossDimensionCardinality, computeDimensionCompleteness, detectPivotCandidates, detectWidePivotShape } from './dimensionMetadata';
import { buildInvestigationSummary, formatCurrency } from './investigationSummaryBuilder';
import { buildRuntimeDirectives } from './investigationDirectives';
import { detectPeriodColumnFamilies } from './periodColumnDetector';
import { generateAllPeriodUnpivotPlans } from './unpivotPlanGenerator';

// --- Re-exports (preserve public API) ---
export * from './investigationTypes';
export { buildDerivedTopicSuggestions } from './hierarchyDetector';
export { analyzeTemporalContinuity } from './temporalProfiler';
export { detectValueConcentration } from './valueConcentration';
export { computeCrossDimensionCardinality, computeDimensionCompleteness, detectPivotCandidates, detectWidePivotShape } from './dimensionMetadata';
export { detectPeriodColumnFamilies, expandPeriodExpression } from './periodColumnDetector';
export type { PeriodColumnFamily } from './periodColumnDetector';

// --- Column Detection ---

const findColumnByPattern = (columns: ColumnProfile[], pattern: RegExp) =>
    columns.find(col => pattern.test(col.name));

const findDescriptionColumn = (columns: ColumnProfile[], semanticUnderstanding: RuntimeSemanticUnderstanding) => {
    // 1. Use AI-identified business grains — pick highest cardinality categorical
    const grainCols = columns
        .filter(col => semanticUnderstanding.businessGrains.includes(col.name) && col.type === 'categorical')
        .sort((a, b) => (b.uniqueValues ?? 0) - (a.uniqueValues ?? 0));
    if (grainCols.length > 0) return grainCols[0];
    // 2. Fall back to /^description$/i pattern
    const descMatch = findColumnByPattern(columns, /^description$/i);
    if (descMatch) return descMatch;
    // 3. Fall back to highest cardinality categorical
    return columns
        .filter(col => col.type === 'categorical' && (col.uniqueValues ?? 0) >= 5)
        .sort((a, b) => (b.uniqueValues ?? 0) - (a.uniqueValues ?? 0))[0]
        ?? null;
};

const findValueColumns = (
    columns: ColumnProfile[],
    semanticUnderstanding: RuntimeSemanticUnderstanding,
    blockedMetricColumns: string[] = [],
): ColumnProfile[] => {
    const metricTypes = new Set(['numerical', 'currency', 'percentage']);
    const blockedMetrics = new Set(blockedMetricColumns.map(name => name.trim().toLowerCase()));
    const candidates: ColumnProfile[] = [];
    const seen = new Set<string>();
    const add = (col: ColumnProfile) => {
        if (!seen.has(col.name)) {
            seen.add(col.name);
            candidates.push(col);
        }
    };
    // 1. AI-identified candidate metrics — prefer non-zero-variance first
    const aiMetrics = columns.filter(col =>
        semanticUnderstanding.candidateMetrics.includes(col.name)
        && metricTypes.has(col.type),
    ).filter(col =>
        !blockedMetrics.has(col.name.trim().toLowerCase()),
    );
    const hasVariance = (col: ColumnProfile) => {
        const range = col.valueRange;
        return !Array.isArray(range) || range.length !== 2 || range[0] !== range[1];
    };
    aiMetrics.filter(hasVariance).forEach(add);
    aiMetrics.filter(c => !hasVariance(c)).forEach(add);
    // 2. Fall back to /^value$/i pattern
    const valMatch = findColumnByPattern(columns, /^value$/i);
    if (valMatch && metricTypes.has(valMatch.type) && !blockedMetrics.has(valMatch.name.trim().toLowerCase())) add(valMatch);
    // 3. Fall back to all numerical columns, non-zero-variance first
    const remaining = columns.filter(c =>
        metricTypes.has(c.type)
        && !blockedMetrics.has(c.name.trim().toLowerCase()),
    );
    remaining.filter(hasVariance).forEach(add);
    remaining.filter(c => !hasVariance(c)).forEach(add);
    return candidates;
};

const findValueColumn = (columns: ColumnProfile[], semanticUnderstanding: RuntimeSemanticUnderstanding) =>
    findValueColumns(columns, semanticUnderstanding)[0] ?? null;

const findRowClassColumn = (columns: ColumnProfile[]) =>
    findColumnByPattern(columns, /^rowclass$/i)
    ?? findColumnByPattern(columns, /^rowrole$/i)
    ?? null;

// --- RowClass detail value detection ---

const detectRowClassDetailValue = async (
    binding: DuckDbAnalysisBinding,
    rowClassCol: string,
): Promise<string | null> => {
    try {
        const { executeUnifiedQuery } = await import('../../duckdb/unifiedQueryExecutor');
        const intent = {
            kind: 'value_counts' as const,
            purpose: `RowClass value distribution for "${rowClassCol}"`,
            params: { column: rowClassCol, limit: 5 },
            options: { timeout: QUERY_TIMEOUT_MS, skipDirectiveInjection: true },
        };
        const result = await executeUnifiedQuery(intent, {
            binding,
            allowedColumns: [rowClassCol],
        });
        if (result.rows.length === 0) return null;
        // The most frequent value is typically the detail/fact row type
        const topValue = String(result.rows[0][rowClassCol] ?? result.rows[0]['value'] ?? '').toLowerCase().trim();
        return topValue || null;
    } catch {
        return null;
    }
};

// --- SQL Query ---

const runDescriptionValueQuery = async (
    binding: DuckDbAnalysisBinding,
    descCol: string,
    valueCol: string,
    rowClassCol: string | null,
    rowClassDetailValue: string | null = null,
    limit: number = DEFAULT_DESCRIPTION_LIMIT,
): Promise<DescriptionTotal[]> => {
    const { executeUnifiedQuery } = await import('../../duckdb/unifiedQueryExecutor');
    const intent = {
        kind: 'description_totals' as const,
        purpose: `Description totals: ${descCol} × ${valueCol}`,
        params: {
            descriptionColumn: descCol,
            valueColumn: valueCol,
            ...(rowClassCol ? { rowClassColumn: rowClassCol } : {}),
            ...(rowClassDetailValue ? { rowClassDetailValue } : {}),
            limit,
        },
        options: { timeout: QUERY_TIMEOUT_MS, skipDirectiveInjection: true },
    };

    const result = await executeUnifiedQuery(intent, { binding });

    return result.rows.map(row => ({
        description: String(row['description'] ?? ''),
        total: Number(row['total']) || 0,
        rowCount: Number(row['row_count']) || 0,
    })).filter(r => r.description.trim() !== '' && r.total !== 0);
};

const runDescriptionRowCountQuery = async (
    binding: DuckDbAnalysisBinding,
    descCol: string,
    rowClassCol: string | null,
    rowClassDetailValue: string | null = null,
    limit: number = DEFAULT_DESCRIPTION_LIMIT,
): Promise<DescriptionTotal[]> => {
    const whereClause = rowClassCol && rowClassDetailValue
        ? `WHERE LOWER(COALESCE(CAST("${rowClassCol}" AS VARCHAR), '')) = '${rowClassDetailValue}'`
        : '';
    const sql = `SELECT "${descCol}" AS desc_name, COUNT(*) AS total_value, COUNT(*) AS row_count ` +
        `FROM "${binding.tableName}" ${whereClause} ` +
        `GROUP BY "${descCol}" HAVING COUNT(*) > 0 ` +
        `ORDER BY COUNT(*) DESC LIMIT ${limit}`;

    const result = await duckDbWorkerClient.executeCompiledQuery({
        sql,
        countSql: 'SELECT 1 AS total',
        selectedColumns: ['desc_name', 'total_value', 'row_count'],
        appliedOrderBy: [],
        appliedLimit: limit,
    }, QUERY_TIMEOUT_MS);

    return result.rows.map(row => ({
        description: String(row['desc_name'] ?? ''),
        total: Number(row['total_value']) || 0,
        rowCount: Number(row['row_count']) || 0,
    })).filter(r => r.description.trim() !== '' && r.rowCount > 0);
};

// --- Main Entry Point ---

export const runDataInvestigationHarness = async (
    columns: ColumnProfile[],
    binding: DuckDbAnalysisBinding,
    semanticUnderstanding: RuntimeSemanticUnderstanding,
    _options?: {
        harnessTimeoutMs?: number;
        store?: AnyStoreWithTelemetry;
        settings?: Settings;
        replicatedMetricColumns?: string[];
    },
): Promise<DataInvestigationFindings | null> => {
    const descCol = findDescriptionColumn(columns, semanticUnderstanding);
    const valueCandidates = findValueColumns(
        columns,
        semanticUnderstanding,
        _options?.replicatedMetricColumns,
    );
    if (!descCol || valueCandidates.length === 0) {
        console.log(`${LOG_PREFIX} Skipped — no suitable description or value column found.`);
        return null;
    }

    const rowClassCol = findRowClassColumn(columns);

    // Set a 30s hard cap on the entire harness. Each individual SQL query already has a
    // 5s timeout (QUERY_TIMEOUT_MS), so this is a failsafe against unexpected hangs.
    // The optional _options.harnessTimeoutMs override exists for testing only.
    const effectiveTimeout = _options?.harnessTimeoutMs ?? HARNESS_TIMEOUT_MS;
    const harnessDeadline = Date.now() + effectiveTimeout;
    const isOverBudget = () => Date.now() > harnessDeadline;

    // Detect the detail row value dynamically instead of hardcoding 'fact'.
    // Has its own internal try-catch — failure is non-fatal.
    let rowClassDetailValue = rowClassCol
        ? await detectRowClassDetailValue(binding, rowClassCol.name)
        : null;

    // Validate the detected detail row filter actually retains a meaningful
    // portion of the dataset. If it would eliminate >90% of rows, it's likely
    // a false positive (e.g. column values are NULL or casing doesn't match).
    // We reuse value_counts (already a supported diagnostic kind) to get the
    // distribution and derive retention from it.
    if (rowClassCol && rowClassDetailValue) {
        try {
            const { executeUnifiedQuery } = await import('../../duckdb/unifiedQueryExecutor');
            const vcResult = await executeUnifiedQuery({
                kind: 'value_counts' as const,
                purpose: `RowRole retention validation for "${rowClassCol.name}"`,
                params: { column: rowClassCol.name, limit: 20 },
                options: { timeout: QUERY_TIMEOUT_MS, skipDirectiveInjection: true },
            }, { binding, allowedColumns: [rowClassCol.name] });

            // Sum all counts for total; find the matching value's count for filtered.
            let totalCount = 0;
            let filteredCount = 0;
            for (const row of vcResult.rows) {
                const count = Number(row.count ?? row.frequency ?? 0);
                totalCount += count;
                const val = String(row[rowClassCol.name] ?? row.value ?? '').toLowerCase().trim();
                if (val === rowClassDetailValue) {
                    filteredCount = count;
                }
            }
            const retentionRatio = totalCount > 0 ? filteredCount / totalCount : 0;

            if (filteredCount === 0 || retentionRatio < 0.10) {
                console.warn(
                    `${LOG_PREFIX} Detail row filter "${rowClassCol.name}" = "${rowClassDetailValue}" retains `
                    + `${filteredCount}/${totalCount} rows (${(retentionRatio * 100).toFixed(1)}%) — disabling filter.`,
                );
                rowClassDetailValue = null;
            }
        } catch {
            // Validation query failed — keep the detected value as-is (non-fatal).
        }
    }

    // For high-cardinality description columns (50k+ unique values), cap at 200 rows
    // to bound GROUP BY scan cost while still giving phases enough data for analysis.
    const descriptionQueryLimit = (descCol.uniqueValues ?? 0) > HIGH_CARDINALITY_DESCRIPTION_THRESHOLD
        ? HIGH_CARDINALITY_DESCRIPTION_LIMIT
        : DEFAULT_DESCRIPTION_LIMIT;
    if (descriptionQueryLimit === HIGH_CARDINALITY_DESCRIPTION_LIMIT) {
        console.log(`${LOG_PREFIX} High-cardinality column "${descCol.name}" (${descCol.uniqueValues} unique values) — using LIMIT ${HIGH_CARDINALITY_DESCRIPTION_LIMIT} for description query.`);
    }

    // Adaptive minimum description threshold: for small/report datasets (≤ 50
    // unique descriptions) even 1 distinct description is worth investigating.
    // For larger datasets, require at least 3 to avoid wasting budget on
    // degenerate groupings.
    const descriptionCardinality = descCol.uniqueValues ?? 0;
    const minDescriptionThreshold = descriptionCardinality <= 50 ? 1 : 3;

    // Main description+value query — try each candidate value column until one yields
    // enough results. This prevents the harness from giving up entirely when the first
    // metric is zero-variance (e.g. "Sales" = 0.00 for all rows) while other metrics
    // (e.g. "YTD Sales") have meaningful data.
    let totals: DescriptionTotal[] = [];
    let valueCol: ColumnProfile = valueCandidates[0];
    for (const candidate of valueCandidates) {
        if (isOverBudget()) break;
        try {
            const candidateTotals = await runDescriptionValueQuery(
                binding,
                descCol.name,
                candidate.name,
                rowClassCol?.name ?? null,
                rowClassDetailValue,
                descriptionQueryLimit,
            );
            if (candidateTotals.length >= minDescriptionThreshold) {
                totals = candidateTotals;
                valueCol = candidate;
                break;
            }
            // Keep trying if this metric yielded too few results
            if (candidateTotals.length > totals.length) {
                totals = candidateTotals;
                valueCol = candidate;
            }
        } catch (error) {
            const category = classifyDuckDbError(error);
            console.warn(`${LOG_PREFIX} Description query with metric "${candidate.name}" failed, trying next.`, error);
            if (_options?.store) {
                emitSilentFailure(_options.store, error, {
                    component: 'DataInvestigationHarness',
                    recoveryAction: 'harness_metric_fallback',
                    userNotified: false,
                    detail: { category, phase: 'main_description_query', metric: candidate.name },
                });
            }
        }
    }

    if (totals.length < minDescriptionThreshold) {
        try {
            const fallbackTotals = await runDescriptionRowCountQuery(
                binding,
                descCol.name,
                rowClassCol?.name ?? null,
                rowClassDetailValue,
                descriptionQueryLimit,
            );
            if (fallbackTotals.length >= minDescriptionThreshold) {
                totals = fallbackTotals;
                console.log(`${LOG_PREFIX} Metric-based description totals were insufficient; continuing investigation with row-count fallback for "${descCol.name}".`);
            }
        } catch (error) {
            const category = classifyDuckDbError(error);
            console.warn(`${LOG_PREFIX} Row-count fallback for "${descCol.name}" failed, skipping harness.`, error);
            if (_options?.store) {
                emitSilentFailure(_options.store, error, {
                    component: 'DataInvestigationHarness',
                    recoveryAction: 'harness_row_count_fallback_failed',
                    userNotified: false,
                    detail: { category, phase: 'row_count_fallback', descriptionColumn: descCol.name },
                });
            }
        }
    }

    if (totals.length < minDescriptionThreshold) {
        console.log(`${LOG_PREFIX} Skipped — fewer than ${minDescriptionThreshold} distinct descriptions (${totals.length}) after trying ${valueCandidates.length} metric(s).`);
        return null;
    }

    console.log(`${LOG_PREFIX} Investigating ${totals.length} descriptions from column "${descCol.name}".`);

    // --- Coverage tracking for the 10 core analytics phases ---
    const PLANNED_PHASES = 10;
    let phaseAttempted = 0;
    let phaseSucceeded = 0;
    let phaseSkipped = 0;

    /** Run one budget-tracked analytics phase with a uniform guard + error recovery. */
    async function runPhase<T>(name: string, defaultValue: T, fn: () => T | Promise<T>): Promise<T> {
        if (isOverBudget()) {
            phaseSkipped++;
            return defaultValue;
        }
        phaseAttempted++;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
            const remainingMs = Math.max(500, harnessDeadline - Date.now());
            const result = await Promise.race([
                Promise.resolve().then(fn),
                new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(`Phase "${name}" timed out`)), remainingMs);
                }),
            ]);
            if (timeoutId !== null) clearTimeout(timeoutId);
            phaseSucceeded++;
            return result;
        } catch (error) {
            if (timeoutId !== null) clearTimeout(timeoutId);
            const category = classifyDuckDbError(error);
            console.warn(`${LOG_PREFIX} ${name} failed, continuing.`, error);
            if (_options?.store) {
                emitSilentFailure(_options.store, error, {
                    component: 'DataInvestigationHarness',
                    recoveryAction: 'phase_skipped_on_error',
                    userNotified: false,
                    detail: { category, phase: name },
                });
            }
            return defaultValue;
        }
    }

    // Phase 1: Detect hierarchy candidates (deterministic numeric matching)
    const rawHierarchyGroups = await runPhase('Hierarchy detection', [] as HierarchyGroup[], () =>
        detectHierarchyGroups(totals),
    );

    // Phase 1b: AI validation of hierarchy candidates — confirms or rejects
    // each candidate using semantic understanding (column name, value labels).
    // Fallback: keyword matching (only confirms parents containing "Total", etc.)
    const hierarchyGroups = await runPhase('Hierarchy AI validation', rawHierarchyGroups, async () => {
        if (rawHierarchyGroups.length === 0) return [];
        const validation = await validateHierarchyCandidatesWithAI(
            rawHierarchyGroups,
            descCol.name,
            totals,
            _options?.settings ?? null,
        );
        return validation.confirmed;
    });
    const parentSet = new Set(hierarchyGroups.map(g => g.parent));

    // Phase 2: Detect duplicates (exclude hierarchy parents from comparison)
    const duplicateLabels = await runPhase('Duplicate label detection', [] as DuplicateLabelPair[], () =>
        detectDuplicateLabels(totals, parentSet),
    );

    // Phase 2b: Detect metric relationships (A - B ≈ C)
    const metricRelationships = await runPhase('Metric relationship detection', [] as MetricRelationship[], () =>
        detectMetricRelationships(totals),
    );

    // Phase 2c: Detect outliers (IQR)
    const outlierDescriptions = await runPhase('Outlier detection', [] as OutlierInfo[], () =>
        detectOutliers(totals),
    );

    // Phase 2d: Detect missing data patterns (SQL)
    // detectMissingDataPatterns has its own internal try-catch but runPhase wraps it too
    // so a throw before its internal guard still returns empty, not null.
    const missingDataPatterns = await runPhase('Missing data pattern detection', [] as MissingColumnPattern[], () =>
        detectMissingDataPatterns(columns, binding),
    );

    // Phase 2e: Value concentration / Pareto detection — sync.
    // Uses leaf-only totals (parents excluded) to avoid double-counting distorting concentration.
    const valueConcentration = await runPhase('Value concentration detection', null as ValueConcentrationResult | null, () => {
        const leafTotals = totals.filter(t => !parentSet.has(t.description));
        return detectValueConcentration(leafTotals);
    });

    // Phase 2f: Temporal continuity detection — async.
    // Only runs when a date-typed column is present.
    const temporalProfile = await runPhase('Temporal continuity detection', null as TemporalProfile | null, () =>
        detectTemporalProfile(columns, binding),
    );

    // Phase 3: Semantic classification (pre-classified map reserved for future AI row-value annotations)
    const allDescriptions = totals.map(t => t.description);
    const semanticCategories = await runPhase('Semantic classification', {} as Record<string, string>, () =>
        classifySemanticCategories(allDescriptions, null),
    );

    // Phase 4: AI-driven unnamed column label inference
    // Queries sample values for _unnamed_column_X columns and asks AI to classify each.
    const inferredColumnLabels = await runPhase('Unnamed column label inference', {} as Record<string, string>, () =>
        classifyUnnamedColumnLabels(columns, binding, _options?.settings ?? null),
    );

    // Compute leaf vs parent descriptions
    const parentDescriptions = Array.from(parentSet);
    const leafDescriptions = allDescriptions.filter(d => !parentSet.has(d));

    // Build topic constraints
    const topicConstraints: TopicConstraint[] = [];
    try {
        for (const group of hierarchyGroups) {
            topicConstraints.push({
                rule: 'exclude_parent_from_sum',
                target: group.parent,
                reason: `${group.parent} is a subtotal of: ${group.children.map(c => c.description).join(', ')}`,
            });
        }
        for (const pair of duplicateLabels) {
            topicConstraints.push({
                rule: 'deduplicate_alias',
                target: `${pair.descriptionA} / ${pair.descriptionB}`,
                reason: `Both descriptions have the same total value (${formatCurrency(pair.total)})`,
            });
        }
    } catch (error) {
        console.warn(`${LOG_PREFIX} Topic constraint build failed, continuing with empty constraints.`, error);
    }

    // Build derived topic suggestions from metric relationships + semantic categories
    let suggestedDerivedTopics: string[] = [];
    try {
        suggestedDerivedTopics = buildDerivedTopicSuggestions(metricRelationships, semanticCategories);
    } catch (error) {
        console.warn(`${LOG_PREFIX} Derived topic suggestions failed, continuing with empty.`, error);
    }

    // Phase 5: Build runtime directives — independently guarded
    let runtimeDirectives: DataInvestigationFindings['runtimeDirectives'] = createEmptyRuntimeDirectives();
    try {
        runtimeDirectives = buildRuntimeDirectives(
            columns,
            leafDescriptions,
            parentDescriptions,
            duplicateLabels,
            semanticUnderstanding,
            descCol.name,
            { replicatedMetricColumns: _options?.replicatedMetricColumns },
        );
    } catch (error) {
        console.warn(`${LOG_PREFIX} Runtime directive build failed, continuing with empty directives.`, error);
    }
    runtimeDirectives.inferredColumnLabels = inferredColumnLabels;

    // Phase 5b: Detect pivot candidates — independently guarded
    try {
        const pivotCandidates = detectPivotCandidates(
            columns,
            [...semanticUnderstanding.blockedDimensions, ...runtimeDirectives.blockGroupBy],
            hierarchyGroups,
            missingDataPatterns,
            semanticUnderstanding.businessGrains,
            {
                columnRoles: runtimeDirectives.columnRoles,
                preferredMetrics: runtimeDirectives.preferredMetrics,
                blockedMetrics: runtimeDirectives.blockedMetrics,
            },
        );
        runtimeDirectives.suggestedPivots = pivotCandidates;
    } catch (error) {
        console.warn(`${LOG_PREFIX} Pivot candidate detection failed, continuing with empty.`, error);
    }

    // Wide pivot shape detection — pure, cheap, independently guarded.
    try {
        runtimeDirectives.widePivotShape = detectWidePivotShape(columns);
        if (runtimeDirectives.widePivotShape) {
            console.log(`${LOG_PREFIX} Wide pivot shape detected (${columns.length} columns). Row-based analysis safe; column-dimension analysis needs explicit column selection.`);
        }
    } catch (error) {
        console.warn(`${LOG_PREFIX} Wide pivot shape detection failed, continuing.`, error);
    }

    // Period column family detection — only runs when wide pivot is detected.
    try {
        if (runtimeDirectives.widePivotShape) {
            runtimeDirectives.periodColumnFamilies = detectPeriodColumnFamilies(
                columns.map(c => c.name),
            );
            if (runtimeDirectives.periodColumnFamilies.length > 0) {
                console.log(`${LOG_PREFIX} Period column families: ${
                    runtimeDirectives.periodColumnFamilies.map(f =>
                        `${f.pattern}/${f.year ?? 'no-year'} (${f.columns.length} cols)`
                    ).join(', ')
                }`);
                // Period columns represent a temporal dimension — promote line chart
                // so that downstream presentation planning prefers time-series rendering.
                // Only promote if not already set by the temporal profile phase.
                if (!runtimeDirectives.promotedChartType) {
                    runtimeDirectives.promotedChartType = 'line';
                    console.log(`${LOG_PREFIX} Promoted chart type to 'line' for period column families.`);
                }
            }
        }
    } catch (error) {
        console.warn(`${LOG_PREFIX} Period column detection failed, continuing.`, error);
    }

    // Auto-unpivot plan generation — when period families exist, produce a
    // controlled unpivot_columns plan that converts wide month columns to a
    // long table. TOTAL/summary columns are excluded automatically.
    try {
        if (runtimeDirectives.periodColumnFamilies.length > 0) {
            const unpivotResult = generateAllPeriodUnpivotPlans(
                runtimeDirectives.periodColumnFamilies,
                columns,
            );
            runtimeDirectives.suggestedUnpivotPlan = unpivotResult.operation;
            runtimeDirectives.unpivotExcludedColumns = unpivotResult.excludedColumns;
            if (unpivotResult.operation) {
                console.log(`${LOG_PREFIX} Auto-unpivot plan generated: ${unpivotResult.operation.sourceColumns.length} period columns → long table (${unpivotResult.operation.keyColumn}, ${unpivotResult.operation.valueColumn}). Excluded: [${unpivotResult.excludedColumns.join(', ')}].`);
            } else {
                console.log(`${LOG_PREFIX} Auto-unpivot skipped: ${unpivotResult.skipReason}`);
            }
        }
    } catch (error) {
        console.warn(`${LOG_PREFIX} Auto-unpivot plan generation failed, continuing.`, error);
    }

    // Reshape conflict resolution — when the harness detects BOTH hierarchy
    // signals (parentDescriptions, hierarchyColumn) AND wide-pivot signals
    // (widePivotShape, periodColumnFamilies), resolve the conflict here as a
    // structured directive rather than leaving it to downstream if/else chains.
    //
    // Decision rule:
    //   - Period column families (JAN 2010 … DEC 2010) are a deterministic,
    //     high-confidence signal that the columns encode a temporal dimension.
    //   - Hierarchy/subtotal detection is heuristic and may fire on summary rows
    //     that coexist with a genuinely wide report layout.
    //   - When both are present, period columns win → reshape_required.
    //   - When wide pivot is detected but no period families exist, hierarchy
    //     dominates → annotation_fallback.
    try {
        if (runtimeDirectives.widePivotShape) {
            const hasPeriodFamilies = runtimeDirectives.periodColumnFamilies.length > 0;
            const hasHierarchySignals = parentDescriptions.length > 0
                || Boolean(runtimeDirectives.hierarchyColumn);
            const reasons: string[] = [];

            if (hasPeriodFamilies && hasHierarchySignals) {
                // Conflict: both hierarchy and period columns detected.
                // Period column evidence is deterministic string-match → higher confidence.
                runtimeDirectives.reshapeDecision = 'reshape_required';
                reasons.push('period_columns_override_hierarchy');
                reasons.push(`period_families=${runtimeDirectives.periodColumnFamilies.length}`);
                reasons.push(`parent_descriptions=${parentDescriptions.length}`);
                console.log(`${LOG_PREFIX} Reshape conflict resolved: period columns (${runtimeDirectives.periodColumnFamilies.length} families) override hierarchy (${parentDescriptions.length} parents) → reshape_required.`);
            } else if (hasPeriodFamilies) {
                // No conflict — straightforward wide pivot with period columns.
                runtimeDirectives.reshapeDecision = 'reshape_required';
                reasons.push('period_columns_detected');
                reasons.push(`period_families=${runtimeDirectives.periodColumnFamilies.length}`);
                console.log(`${LOG_PREFIX} Reshape decision: period columns detected → reshape_required.`);
            } else if (hasHierarchySignals) {
                // Wide pivot without period columns + hierarchy detected → annotation only.
                runtimeDirectives.reshapeDecision = 'annotation_fallback';
                reasons.push('hierarchy_without_period_columns');
                reasons.push(`parent_descriptions=${parentDescriptions.length}`);
                console.log(`${LOG_PREFIX} Reshape decision: hierarchy without period columns → annotation_fallback.`);
            } else {
                // Wide pivot without period columns or hierarchy — insufficient
                // evidence for deterministic reshape.  Leave reshapeDecision null
                // so the AI agent can decide in the OODAE loop whether the wide
                // table should be unpivoted or used as-is (e.g. paired-column
                // reports like Sales MT + Ave Price per month).
                runtimeDirectives.reshapeDecision = null;
                reasons.push('wide_pivot_no_period_no_hierarchy');
                reasons.push('deferred_to_ai');
                console.log(`${LOG_PREFIX} Reshape decision: wide pivot but no period columns or hierarchy — deferring to AI agent.`);
            }
            runtimeDirectives.reshapeDecisionReasons = reasons;
        }
    } catch (error) {
        console.warn(`${LOG_PREFIX} Reshape conflict resolution failed, continuing.`, error);
    }

    // Comma-formatted number columns — sourced from ColumnProfile flags set by dataProfiler.
    try {
        runtimeDirectives.formattedNumberColumns = columns
            .filter(c => c.hasFormattedNumbers === true)
            .map(c => c.name);
        if (runtimeDirectives.formattedNumberColumns.length > 0) {
            console.log(`${LOG_PREFIX} Comma-formatted number columns: ${runtimeDirectives.formattedNumberColumns.join(', ')}. Cleaning required before SQL CAST.`);
        }
    } catch (error) {
        console.warn(`${LOG_PREFIX} Formatted number column detection failed, continuing.`, error);
    }

    // Cross-dimension cardinality — pure, cheap, independently guarded.
    // No phase budget tracking since this is a pure computation (no SQL).
    let crossDimensionCardinality: CrossDimensionCardinality[] = [];
    try {
        crossDimensionCardinality = computeCrossDimensionCardinality(
            columns,
            [...semanticUnderstanding.blockedDimensions, ...runtimeDirectives.blockGroupBy],
        );
    } catch (error) {
        console.warn(`${LOG_PREFIX} Cross-dimension cardinality check failed, continuing with empty.`, error);
    }

    // Dimension completeness — pure, cheap, independently guarded.
    let dimensionCompleteness: DimensionCompleteness[] = [];
    try {
        dimensionCompleteness = computeDimensionCompleteness(
            columns,
            [...semanticUnderstanding.blockedDimensions, ...runtimeDirectives.blockGroupBy],
        );
    } catch (error) {
        console.warn(`${LOG_PREFIX} Dimension completeness check failed, continuing with empty.`, error);
    }

    // Propagate Pareto findings into runtime directives.
    // If Pareto is detected, lower the recommended topN and flag hideOthers.
    // Only override topN if Pareto's recommendation is more restrictive.
    if (valueConcentration?.isPareto && valueConcentration.recommendedTopN !== null) {
        const paretoTopN = valueConcentration.recommendedTopN;
        if (runtimeDirectives.recommendedTopN === null || paretoTopN < runtimeDirectives.recommendedTopN) {
            runtimeDirectives.recommendedTopN = paretoTopN;
        }
        runtimeDirectives.suggestedHideOthers = true;
    }

    // Propagate temporal findings into runtime directives.
    // Continuous time series with sufficient span → promote line chart.
    // Too many gaps → block line chart, recommend bar instead.
    if (temporalProfile !== null) {
        if (temporalProfile.isContinuous && temporalProfile.spanPeriods >= 6) {
            runtimeDirectives.promotedChartType = 'line';
        } else if (temporalProfile.gapCount > temporalProfile.spanPeriods * 0.3) {
            runtimeDirectives.blockedChartTypes = ['line'];
            runtimeDirectives.promotedChartType = 'bar';
        }
    }

    // Propagate RowClass detection into runtime directives so downstream
    // consumers (evidence value gate) can check whether a query plan
    // includes a detail-row filter — without hardcoding column names.
    runtimeDirectives.detailRowColumn = rowClassCol?.name ?? null;
    runtimeDirectives.detailRowValue = rowClassDetailValue;
    runtimeDirectives.detailRowFilter = rowClassCol?.name && rowClassDetailValue
        ? { column: rowClassCol.name, value: rowClassDetailValue }
        : null;

    let investigationSummary = '';
    try {
        investigationSummary = buildInvestigationSummary(
            hierarchyGroups,
            duplicateLabels,
            semanticCategories,
            leafDescriptions,
            parentDescriptions,
            metricRelationships,
            runtimeDirectives.recommendedTopN,
            outlierDescriptions,
            missingDataPatterns,
            rowClassCol?.name ?? null,
            rowClassDetailValue,
            suggestedDerivedTopics,
            runtimeDirectives.suggestedPivots,
            valueConcentration,
            temporalProfile,
            crossDimensionCardinality,
            dimensionCompleteness,
            runtimeDirectives.widePivotShape,
            runtimeDirectives.formattedNumberColumns,
            runtimeDirectives.periodColumnFamilies,
            runtimeDirectives.suggestedUnpivotPlan,
            runtimeDirectives.unpivotExcludedColumns,
        );
    } catch (error) {
        console.warn(`${LOG_PREFIX} Summary build failed, continuing with empty summary.`, error);
    }

    const coverageMetric: HarnessCoverageMetric = {
        planned: PLANNED_PHASES,
        attempted: phaseAttempted,
        succeeded: phaseSucceeded,
        skipped: phaseSkipped,
        successRate: phaseAttempted === 0 ? 1.0 : phaseSucceeded / phaseAttempted,
    };

    console.log(`${LOG_PREFIX} Found ${hierarchyGroups.length} hierarchy(s), ${duplicateLabels.length} duplicate(s), ${metricRelationships.length} relationship(s), ${outlierDescriptions.length} outlier(s), ${missingDataPatterns.length} missing pattern(s), ${leafDescriptions.length} leaves, ${suggestedDerivedTopics.length} derived topic(s), ${runtimeDirectives.suggestedPivots.length} pivot candidate(s). Directives: prefer=${runtimeDirectives.preferredDimensions.join(',')}, block=${runtimeDirectives.blockedDimensions.join(',')}, metrics=${runtimeDirectives.preferredMetrics.join(',')}, topN=${runtimeDirectives.recommendedTopN}, inferredLabels=${Object.keys(inferredColumnLabels).length}. Coverage: ${phaseSucceeded}/${phaseAttempted} phases succeeded (${phaseSkipped} skipped).`);

    const analysisSteering = buildCanonicalAnalysisSteering({
        semanticUnderstanding,
        base: {
            preferGroupBy: runtimeDirectives.preferGroupBy,
            blockGroupBy: runtimeDirectives.blockGroupBy,
            softDeprioritizeGroupBy: runtimeDirectives.softDeprioritizeGroupBy,
            preferredDimensions: runtimeDirectives.preferredDimensions,
            blockedDimensions: runtimeDirectives.blockedDimensions,
            preferredMetrics: runtimeDirectives.preferredMetrics,
            blockedMetrics: runtimeDirectives.blockedMetrics,
            columnRoles: runtimeDirectives.columnRoles,
            excludeFromAggregation: runtimeDirectives.excludeFromAggregation,
            hierarchyColumn: runtimeDirectives.hierarchyColumn,
            parentDescriptions,
            duplicateDescriptions: duplicateLabels.map(pair => pair.descriptionB),
            detailRowColumn: runtimeDirectives.detailRowColumn,
            detailRowValue: runtimeDirectives.detailRowValue,
            detailRowFilter: runtimeDirectives.detailRowFilter,
            promotedChartType: runtimeDirectives.promotedChartType,
            blockedChartTypes: runtimeDirectives.blockedChartTypes,
            suggestedHideOthers: runtimeDirectives.suggestedHideOthers,
            recommendedTopN: runtimeDirectives.recommendedTopN,
            widePivotShape: runtimeDirectives.widePivotShape,
            periodColumnFamilies: runtimeDirectives.periodColumnFamilies,
            formattedNumberColumns: runtimeDirectives.formattedNumberColumns,
            pivotOnlyCombinations: crossDimensionCardinality
                .filter(combination => combination.recommendPivotOnly)
                .map(combination => ({ dimA: combination.dimA, dimB: combination.dimB, product: combination.product })),
            pairingSignals: runtimeDirectives.pairingSignals,
            duplicateSignatureHints: runtimeDirectives.duplicateSignatureHints,
            reshapeDecision: runtimeDirectives.reshapeDecision,
            reshapeDecisionReasons: runtimeDirectives.reshapeDecisionReasons,
            inferredColumnLabels: runtimeDirectives.inferredColumnLabels,
        },
    });

    return {
        hierarchyGroups,
        duplicateLabels,
        metricRelationships,
        outlierDescriptions,
        missingDataPatterns,
        semanticCategories,
        leafDescriptions,
        parentDescriptions,
        investigationSummary,
        topicConstraints,
        suggestedDerivedTopics,
        valueConcentration,
        temporalProfile,
        crossDimensionCardinality,
        dimensionCompleteness,
        coverageMetric,
        analysisSteering,
        runtimeDirectives,
    };
};
