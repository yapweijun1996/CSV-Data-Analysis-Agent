export interface PlanLearningHints {
    avoidGroupBys?: string[];
    preferGroupBys?: string[];
}

export interface AnalysisDatasetContext {
    title?: string;
    reportTitle?: string;
    parameterPreview?: string;
    footerPreview?: string;
    metadataPreview?: string;
    summaryPreview?: string;
    reportShapeKind?: string;
    headerHintPreview?: string;
    rowCount?: number;
    dimensionColumns: string[];
    metricColumns: string[];
    preferredGrainColumns?: string[];
    avoidGrainColumns?: string[];
    /** Dimensions with extreme quality failures; automatic pivots must not use them. */
    qualityBlockedDimensions?: string[];
    avoidMetricColumns?: string[];
    preferredMetricTerms?: string[];
    preferredTimeColumns?: string[];
    preferredBusinessTerms?: string[];
    businessGrains?: string[];
    helperDimensions?: string[];
    blockedDimensions?: string[];
    businessGrainConfidence?: 'high' | 'medium' | 'low';
    unsafeForBusinessNarrative?: boolean;
    headerSemantics?: string;
    diagnosticModeRecommended?: boolean;
    /** Harness-suggested topics from detected metric relationships (A - B ≈ C). */
    suggestedDerivedTopics?: string[];
    /** Metric terms involved in detected relationships (for priority boosting). */
    metricRelationshipTerms?: string[];
    /** Dimension pairs where cardinality product > 100 — must use pivot, not flat bar. */
    pivotOnlyCombinations?: Array<{ dimA: string; dimB: string; product: number }>;
    /** Non-additive metrics (percentages, ratios, averages) — AI should use AVG not SUM. */
    nonAdditiveMetrics?: string[];
    /** Deterministic quality governance summary used to steer auto analysis. */
    qualityHintsSummary?: string;
    /** Structured steering bundle derived from harness and quality governance. */
    analysisSteering?: import('../../types').EvidenceHarnessContext | null;
}

/**
 * Concise semantic type reference for topic generation.
 * Guides the AI on how to interpret column and description categories
 * from the data investigation harness findings.
 */
export const SEMANTIC_TYPE_REFERENCE = `
Column semantic categories for topic generation:
| Category | Typical terms | Aggregation guidance |
|---|---|---|
| Revenue | revenue, sales, income, turnover | SUM; compare across dimensions |
| Cost | cost, expense, salary, wages, depreciation | SUM; breakdown by category |
| Profit | profit, margin, gross, net, earnings | SUM or derived (Revenue - Cost); signed values |
| Temporal | date, month, quarter, year, period | Use as groupBy for trends |
| Categorical | name, type, category, region, project | Use as groupBy for comparisons |
| Identifier | ID, code, key, index | Do NOT use as groupBy |
`.trim();

export const buildAnalysisPlannerSystemPrompt = (
    stage: 'topics' | 'evidence_query' | 'presentation' = 'evidence_query',
) => {
    if (stage === 'topics') {
        return [
            'You are a senior business intelligence analyst designing SQL-safe analysis topics for DuckDB.',
            '',
            'When the context includes a data investigation section:',
            '- Respect parent-child hierarchies: avoid topics that would double-count subtotals.',
            '- Use leaf-level descriptions for groupBy, not parent/subtotal descriptions.',
            '- Leverage detected metric relationships (A - B ≈ C) to suggest derived metric topics.',
            '- Observe semantic categories (revenue, cost, profit) when choosing aggregation functions.',
            '- Note data quality warnings (missing values, outliers) and avoid affected columns as primary groupBy.',
            '',
            SEMANTIC_TYPE_REFERENCE,
            '',
            'Return one JSON object with a "topics" array.',
        ].join('\n');
    }

    if (stage === 'presentation') {
        return [
            'You are a senior business intelligence analyst deciding how to present already-executed SQL evidence.',
            'Your goal is to choose the chart type and presentation mode that best communicates the evidence to a business reader.',
            '',
            'Chart type selection — apply in priority order:',
            '1. "line": Use ONLY when the groupBy column is a time column (date/datetime) or a recognized ordinal sequence (month names, quarter names, weekday names) AND the preview rows are in chronological or ordinal order. Time series with ≤ 24 rows → "table_then_chart". Time series with > 24 rows → "chart".',
            '2. "combo": Use ONLY when the evidence exposes exactly TWO stable aggregate metric columns AND the row count is ≤ 12.',
            '3. "scatter": Use ONLY when the evidence is a rowset query (queryMode=rowset) with TWO numeric columns for x/y axes AND row count ≤ 60.',
            '4. "pie" or "doughnut": Use when grouped aggregate evidence has ≤ 6 distinct groups AND a single metric. Prefer "pie" when group count ≤ 4, "doughnut" when 5–6. Never use pie/doughnut with > 8 groups.',
            '5. "bar": The default for grouped aggregate evidence with > 6 groups or when other types do not fit.',
            '',
            'Presentation mode selection:',
            '- "chart": Use ONLY for time series evidence with > 24 rows where the trend is the primary story.',
            '- "table_then_chart": The preferred mode for most grouped evidence — data table shown first, chart accessible.',
            '- "table": Use when evidence is informative but not chart-friendly, or when the quality signals indicate caution.',
            '',
            'TopN guidance:',
            '- When distinct group count > 8 for a bar chart, set defaultTopN to 8 and defaultHideOthers to true.',
            '',
            'Hard safety rules — these override your chart and mode choices:',
            '- If the review context contains helper_dimension, blocked_dimension, hierarchy_contamination, duplicate_label_contamination, missing_detail_row_filter, reshape_required, low_signal_confidence, unsafe_business_narrative, or not_chart_worthy → use "table" with no chart.',
            '- If the review context shows value gate "table_only" → ceiling is "table_then_chart"; do NOT choose "chart".',
            '- If the review context shows value gate "reject" → use presentationMode "hidden".',
            '- If evidence has < 2 rows or ≤ 1 distinct group → use "table" with no chart.',
            '- All binding columns (groupByColumn, valueColumn, etc.) MUST exist in the executed output columns list.',
            '- Never choose radar, bubble, stacked_bar, or stacked_column.',
            '- pie and doughnut are allowed for ≤ 6 distinct groups with a single metric.',
            '- When in doubt, prefer "table" or "table_then_chart" over forcing a chart.',
        ].join('\n');
    }

    return [
        'You are an expert analytics engineer planning SQL evidence queries for DuckDB.',
        'Your job is to produce a valid evidence query first.',
        'Do not decide the final chart before the query evidence is stable.',
        'Do not invent output aliases unless they are explicitly declared in query.aggregates[].as and included in query.select.',
        'Use only the supported SQL contract: select, groupBy, aggregates, where, orderBy, and limit.',
        'Prefer simple, deterministic grouped queries that are likely to return meaningful evidence.',
    ].join(' ');
};

export const buildPlanRetryFeedback = (lastError?: string) => {
    if (!lastError) return '';

    const normalized = lastError.toLowerCase();
    if (normalized.includes('bindings.valuecolumn')) {
        return `Previous attempt failed because the plan referenced a value binding that was not present in the selected query output. Rebuild the query first and only use aliases that appear in query.select.`;
    }
    if (normalized.includes('selected output column')) {
        return 'Previous attempt failed because a referenced column or alias was not included in query.select. Ensure every referenced output field is explicitly selected.';
    }
    if (normalized.includes('sql compilation failed')) {
        return 'Previous attempt failed during SQL compilation. Keep the query simpler and use only legal dataset columns, legal aggregate aliases, and deterministic orderBy fields.';
    }
    if (normalized.includes('empty result')) {
        return 'Previous attempt returned no rows. Broaden the slice while keeping the same business intent.';
    }

    return `Previous attempt failed with this system validation error: "${lastError}". Fix that exact problem and avoid repeating the same structure.`;
};

export const buildTopicPlanningUserPrompt = (
    topic: string,
    contextText: string,
    retryFeedback?: string,
    learningHints?: PlanLearningHints,
): string => `
    Plan a SQL evidence query for this analysis topic.

    Analysis Topic: "${topic}"

    ${retryFeedback ? `Retry guidance:\n${retryFeedback}\n` : ''}
    ${learningHints?.avoidGroupBys && learningHints.avoidGroupBys.length > 0
        ? `Historical context only: these groupings previously produced flat or noisy evidence. Treat them as hints, not hard rules: ${learningHints.avoidGroupBys.join(', ')}.`
        : ''}
    ${learningHints?.preferGroupBys && learningHints.preferGroupBys.length > 0
        ? `Historical context only: these groupings previously produced stable evidence. Use them when they fit, but do not force them: ${learningHints.preferGroupBys.join(', ')}.`
        : ''}

    ${contextText}

    Return one JSON object for an evidence query plan with these fields:
    - title
    - queryMode
    - query
    - intentSummary
    - optional preferredResultShape

    Evidence-query rules (hard constraints — SQL contract limits):
    - First decide what grouped evidence should be computed.
    - Do not decide chartType yet.
    - Do not return bindings, defaultTopN, or defaultHideOthers.
    - query.select must explicitly include every output column or aggregate alias used later.
    - If you define aggregate aliases, keep them simple and legal, and include them in query.select.
    - Use only the supported SQL contract: select, groupBy, aggregates, where, orderBy, and limit.

    Evidence-query preferences (ranked guidance — use your judgement):
    - Do NOT use blocked dimensions as groupBy columns. Use business grains instead. However, blocked dimensions CAN be used in WHERE clauses for filtering.
    - Prefer a single stable metric over speculative multi-metric comparisons.
    - Prefer aggregate evidence over raw rowset evidence unless the topic clearly requires a scatter-style rowset.
    - For any grouped aggregate query, ALWAYS include orderBy sorting by the primary aggregate descending and set a reasonable limit (8–15 unless the topic specifies a different N). This keeps results focused and chart-ready.
    - If the topic implies a time trend and a stable time column exists, set preferredResultShape to "time_series".
    - If the topic implies ranked grouped evidence, set preferredResultShape to "ranked_aggregate".
    - If the best result is a row-level exploratory view, set preferredResultShape to "rowset_scatter_candidate" or "detail_table".
    - Use business-facing naming when the dataset evidence supports it, but do not invent unsupported business aliases.
    - If the data exploration context mentions a row-classification column with detail/fact rows, ALWAYS include a WHERE predicate filtering to detail rows only. This prevents double-counting from subtotal/header rows.
`;

export const createAnalysisTopicsPrompt = (contextText: string, goal: string | null, availableDimensions?: string[], existingCardTitles?: string[]): string => {
    const dimCount = availableDimensions?.length ?? 999;
    const groupByConstraint = dimCount <= 1
        ? `3. Only ${dimCount} groupBy dimension${dimCount === 1 ? ` ("${availableDimensions![0]}")` : ''} is available. Generate at most 2 topics. Vary topics by metric scope (different WHERE filters, different value ranges), filter conditions, or aggregation granularity (e.g. top-5 vs full breakdown) — NOT by groupBy column.`
        : dimCount <= 2
            ? `3. Only ${dimCount} groupBy dimensions are available: ${availableDimensions!.join(', ')}. Generate at most ${Math.min(4, dimCount * 2)} topics. Each topic SHOULD use a different groupBy when possible, but you may reuse a groupBy if you vary the metric or filter.`
            : `3. Each topic MUST use a DIFFERENT groupBy dimension — no two topics with the same groupBy column. Spread across available dimensions${availableDimensions ? `: ${availableDimensions.join(', ')}` : ''}.`;

    return `
    You are a senior business intelligence analyst designing SQL-first analyses for DuckDB.
    Your task is to identify ${dimCount <= 1 ? '1 to 2' : dimCount <= 2 ? '2 to 4' : '4 to 8'} high-level analysis topics or questions that can be answered with a deterministic SQL query against the provided dataset schema and sample.

    ${goal ? `\nThe user's primary analysis goal is: "${goal}". Your topics should be highly relevant to this goal.\n` : ''}

    ${contextText}

    Based on this, generate a list of concise analysis topics.
    - List the topics from most to least useful for a decision-maker; the order is kept. Prefer a measure that matches what the column means (for example a typical price, not a sum of prices).
    - Good examples: "Sum of Revenue by Product Category", "Count of Orders per Month", "Relationship between Unit Cost and Profit".
    - Bad examples: "Chart of the data", "Analyze everything", "Make a pie chart".

    Hard constraints (SQL contract limits — these cannot be violated):
    - Each topic must be answerable with one SQL query using grouping, filtering, ordering, and limiting.
    - Each topic must be compatible with the available SQL contract and supported chart bindings.
    - Avoid topics requesting descriptive statistics (like mean, median, standard deviation, quartiles) that the current SQL contract cannot express directly.

    Preferences:
    1. Do NOT use blocked dimensions as groupBy — use only the available non-blocked dimensions listed below. Blocked dimensions are identified by the data investigation harness based on data content, not column names.
    2. Use preferred business terms from report title/parameters when supported. Use report scope for topic selection (e.g. "Income Statement By Project" → compare across projects).
    ${groupByConstraint}
    4. Prefer SUM for financial metric aggregations. Use COUNT when the topic asks about frequency or occurrence count.
    5. If exploration results are provided, use them: low-cardinality dimensions are good for groupBy, fragmented dimensions need WHERE filters.
    6. Do not invent qualifiers (fiscal, primary, category) unless explicitly supported by the data.
    7. Do NOT mention row-classification or row-index columns in topic text. Row filtering is handled automatically during query planning.
    8. Prefer decision-useful outcomes such as revenue, profit, margin, change over time, concentration, and exceptions over mechanical breakdowns by unit, currency, or formatting fields. Use unit or currency only when it materially changes interpretation.
    9. Keep each topic to one clear analytical relationship: one primary metric and one grouping dimension, or an explicit two-dimension cross-tab with a stated comparison purpose. Do not combine unrelated dimensions in one sentence.
    ${availableDimensions && availableDimensions.length > 0 ? `\n    Available non-blocked groupBy dimensions: ${availableDimensions.join(', ')}.` : ''}
    ${existingCardTitles?.length ? `\n    IMPORTANT: The following analysis cards already exist. Do NOT propose topics that overlap with them — find genuinely new angles, metrics, or dimensions instead:\n${existingCardTitles.map(t => `    - ${t}`).join('\n')}` : ''}
`;
};

export const createAnalysisPlanPrompt = (
    topic: string,
    contextText: string,
    lastError?: string,
    learningHints?: PlanLearningHints,
): string => `
    ${buildTopicPlanningUserPrompt(
        topic,
        contextText,
        buildPlanRetryFeedback(lastError),
        learningHints,
    )}
`;

export const createSqlPresentationPlanPrompt = (
    topic: string,
    contextText: string,
    evidenceSummary: string,
    reviewContext?: string | null,
): string => `
    Decide how to present already-executed SQL evidence for this topic.

    Analysis Topic: "${topic}"

    ${contextText}

    Evidence summary:
    ${evidenceSummary}
    ${reviewContext ? `\n    Review context:\n    ${reviewContext}` : ''}

    Return one JSON object with:
    - title
    - description
    - presentationMode
    - optional chartType (only bar, line, scatter, or combo)
    - optional bindings (must reference executed output columns only)
    - optional defaultTopN
    - optional defaultHideOthers

    Presentation rules:
    - The binding domain is the executed output columns listed above — do NOT reference dataset columns that are not in the evidence output.
    - Prefer presentationMode "table" when the result is informative but not clearly chart-friendly.
    - Use "table_then_chart" when the grouped result is stable and a chart would help interpretation.
    - Use "chart" only when the chart is clearly the primary value.
    - Only choose "combo" when the executed query already exposes two stable metric aliases in its output.
    - Only choose "line" when the groupBy column is a time or ordinal dimension with monotonic ordering in the evidence.
    - Only choose "scatter" when the evidence is a rowset query with two numeric columns suitable for x/y axes.
    - If the review context indicates contamination, unsafe narrative, or blocked dimensions, prefer "table".
    - If the review context indicates a "table_only" value gate decision, do NOT choose "chart" — "table_then_chart" is the maximum.
    - If category fragmentation is high, prefer "table" over forcing a chart.
    - Do not choose pie, doughnut, radar, bubble, stacked_bar, or stacked_column — these are not supported for SQL evidence presentation.
`;

export const buildEvidenceEvaluationPrompt = (
    topic: string,
    evidenceSummaryText: string,
    semanticContext: string,
): string => `
    Evaluate the quality and relevance of SQL evidence produced for this analysis topic.

    Analysis Topic: "${topic}"

    ${semanticContext}

    Evidence summary:
    ${evidenceSummaryText}

    Return one JSON object with:
    - decision: "pass" | "table_only" | "reject"
    - reasoning: one sentence explaining why
    - chartWorthy: boolean — whether a chart would add value beyond a table

    Evaluation guidelines:
    - "pass" when the evidence clearly answers the topic with meaningful grouped or trend data.
    - "table_only" when the evidence is informative but too weak, fragmented, or ambiguous for a chart. A data table is still useful.
    - "reject" when the evidence is empty, trivially uniform, or does not answer the topic at all.
    - A result with 2 rows can still be "pass" if the topic asks for a comparison between exactly 2 items.
    - A result with 50+ distinct groups is usually "table_only" because a chart would be unreadable.
    - A result with only 1 group or 0 metric variance should be "reject".
    - If the groupBy column is a blocked or helper dimension (listed in the semantic context), prefer "table_only" rather than "reject" — the data may still be useful as a table even if it's not chart-worthy.
    - If the semantic context lists parent/subtotal labels or hierarchy information, check whether the preview rows contain those labels. If they do, the aggregation may be contaminated (double-counting parent totals) — prefer "table_only" and set chartWorthy to false.
    - If the semantic context lists duplicate/alias labels, check whether the preview rows contain those labels. If they do, the grouping may produce misleading totals — prefer "table_only" and set chartWorthy to false.
    - If the groupBy column is listed as a blocked grain column by the harness, the evidence is not chart-worthy.
    - chartWorthy should be true when the evidence has a clear visual story (trend, ranking, comparison), false when the table alone is sufficient or the evidence has contamination signals.
`;
