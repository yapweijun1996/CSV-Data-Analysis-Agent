import type { UnpivotColumnsOperation } from '../../../types';
import type {
    CrossDimensionCardinality,
    DimensionCompleteness,
    DuplicateLabelPair,
    HierarchyGroup,
    MetricRelationship,
    MissingColumnPattern,
    OutlierInfo,
    PivotCandidate,
    TemporalProfile,
    ValueConcentrationResult,
} from './investigationTypes';
import type { PeriodColumnFamily } from './periodColumnDetector';
import { COMPLETENESS_SUMMARY_THRESHOLD } from './dimensionMetadata';

export const formatCurrency = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toFixed(2);
};

export const buildInvestigationSummary = (
    hierarchyGroups: HierarchyGroup[],
    duplicateLabels: DuplicateLabelPair[],
    semanticCategories: Record<string, string>,
    leafDescriptions: string[],
    parentDescriptions: string[],
    metricRelationships: MetricRelationship[],
    recommendedTopN: number | null,
    outlierDescriptions: OutlierInfo[],
    missingDataPatterns: MissingColumnPattern[],
    rowClassColumn: string | null,
    rowClassDetailValue: string | null,
    suggestedDerivedTopics: string[] = [],
    pivotCandidates: PivotCandidate[] = [],
    valueConcentration: ValueConcentrationResult | null = null,
    temporalProfile: TemporalProfile | null = null,
    crossDimCardinality: CrossDimensionCardinality[] = [],
    dimCompleteness: DimensionCompleteness[] = [],
    widePivotShape: boolean = false,
    formattedNumberColumns: string[] = [],
    periodColumnFamilies: PeriodColumnFamily[] = [],
    suggestedUnpivotPlan: UnpivotColumnsOperation | null = null,
    unpivotExcludedColumns: string[] = [],
): string => {
    const lines: string[] = ['## Data Value Hierarchy Investigation'];

    if (hierarchyGroups.length > 0) {
        lines.push('\n### Detected Parent-Child Relationships');
        for (const group of hierarchyGroups) {
            const childList = group.children
                .map(c => `${c.description} (${formatCurrency(c.total)})`)
                .join(' + ');
            const coverage = Math.round(group.coverageRatio * 100);
            lines.push(`- **${group.parent}** (${formatCurrency(group.parentTotal)}) = ${childList} [coverage: ${coverage}%]`);
        }
    }

    if (duplicateLabels.length > 0) {
        lines.push(`\n### Duplicate/Alias Labels (${duplicateLabels.length} pair(s) with same total value)`);
        for (const pair of duplicateLabels.slice(0, 10)) {
            lines.push(`- "${pair.descriptionA}" (${formatCurrency(pair.total)}) ≈ "${pair.descriptionB}" — likely aliases, not independent items.`);
        }
        if (duplicateLabels.length > 10) {
            lines.push(`- ... and ${duplicateLabels.length - 10} more duplicate pairs.`);
        }
    }

    const categories = new Map<string, string[]>();
    for (const [desc, cat] of Object.entries(semanticCategories)) {
        if (!categories.has(cat)) categories.set(cat, []);
        categories.get(cat)!.push(desc);
    }
    if (categories.size > 1) {
        lines.push('\n### Semantic Categories');
        Array.from(categories.entries()).forEach(([cat, descs]) => {
            if (descs.length > 0 && cat !== 'operating') {
                lines.push(`${cat.charAt(0).toUpperCase() + cat.slice(1)} items: ${descs.slice(0, 8).join(', ')}${descs.length > 8 ? ` (+${descs.length - 8} more)` : ''}`);
            }
        });
    }

    if (parentDescriptions.length > 0 || leafDescriptions.length > 0) {
        lines.push(`\n### Data Scale`);
        lines.push(`- ${leafDescriptions.length} leaf items, ${parentDescriptions.length} subtotal(s).`);
        if (parentDescriptions.length > 0) {
            lines.push(`- Subtotals: ${parentDescriptions.slice(0, 8).join(', ')}${parentDescriptions.length > 8 ? ` (+${parentDescriptions.length - 8} more)` : ''}`);
            lines.push(`- When grouping by this column, exclude subtotals from SUM to avoid double-counting.`);
        }
        if (leafDescriptions.length > 15) {
            lines.push(`- Many items — use ORDER BY DESC LIMIT 8-15 for focused results.`);
        }
    }

    if (metricRelationships.length > 0) {
        lines.push('\n### Metric Relationships (A - B ≈ C)');
        for (const rel of metricRelationships) {
            const matchPct = Math.round(rel.matchRatio * 100);
            lines.push(`- ${rel.left} (${formatCurrency(rel.leftTotal)}) - ${rel.right} (${formatCurrency(rel.rightTotal)}) ≈ ${rel.result} (${formatCurrency(rel.resultTotal)}) [match: ${matchPct}%]`);
        }
        if (suggestedDerivedTopics.length > 0) {
            lines.push('Suggested derived metric topics:');
            suggestedDerivedTopics.forEach(t => lines.push(`  - ${t}`));
        } else {
            lines.push('These relationships suggest derived metric analysis opportunities (e.g. margin ratios, cost breakdowns).');
        }
    }

    if (outlierDescriptions.length > 0) {
        lines.push('\n### Outlier Values (IQR method)');
        for (const o of outlierDescriptions.slice(0, 5)) {
            lines.push(`- "${o.description}" (${formatCurrency(o.total)}) is ${o.iqrDistance.toFixed(1)} IQR ${o.direction === 'high' ? 'above Q3' : 'below Q1'} — extreme ${o.direction} value.`);
        }
        lines.push('Consider excluding outliers from average-based analyses or using median instead of mean.');
    }

    if (missingDataPatterns.length > 0) {
        lines.push('\n### Data Quality: Missing Values');
        for (const p of missingDataPatterns) {
            const pct = Math.round((p.nullRate + p.blankRate) * 100);
            lines.push(`- Column "${p.column}" has ${pct}% missing values (${p.severity}) — ${p.severity === 'severe' ? 'avoid as groupBy or add WHERE IS NOT NULL' : 'NULL groups may appear in aggregations'}.`);
        }
    }

    if (rowClassColumn && rowClassDetailValue) {
        lines.push(`\n### Row Classification`);
        lines.push(`- Column "${rowClassColumn}" has detail rows marked as "${rowClassDetailValue}".`);
        lines.push(`- Filter to detail rows only (WHERE "${rowClassColumn}" = '${rowClassDetailValue}') to avoid counting subtotals.`);
    }

    if (pivotCandidates.length > 0) {
        lines.push('\n### Cross-Tabulation Opportunities');
        for (const c of pivotCandidates) {
            lines.push(`- ${c.metric} by ${c.rowDimension} × ${c.columnDimension} (${c.crossProductSize} cells, confidence: ${c.confidence})`);
        }
    }

    if (valueConcentration !== null) {
        const pct = Math.round(valueConcentration.top20Pct * 100);
        lines.push('\n### Value Concentration (Pareto Analysis)');
        if (valueConcentration.isPareto) {
            lines.push(`- **Pareto distribution detected**: the top 20% of categories account for ${pct}% of total value.`);
            lines.push(`- Recommended topN: ${valueConcentration.recommendedTopN} — focus charts on dominant items and hide "Others".`);
        } else {
            lines.push(`- Value is distributed broadly: top 20% of categories account for ${pct}% of total value (no strong Pareto effect).`);
        }
    }

    if (temporalProfile !== null) {
        lines.push('\n### Temporal Profile');
        lines.push(`- Date column: "${temporalProfile.column}" — ${temporalProfile.granularity} granularity, ${temporalProfile.spanPeriods} period(s) spanning the data.`);
        if (temporalProfile.gapCount === 0) {
            lines.push('- No missing periods detected — the time series is complete.');
        } else {
            const gapPct = Math.round((temporalProfile.gapCount / temporalProfile.spanPeriods) * 100);
            lines.push(`- ${temporalProfile.gapCount} missing period(s) detected (${gapPct}% of span) — ${temporalProfile.isContinuous ? 'minor gaps, series treated as continuous' : 'significant gaps detected'}.`);
        }
        if (temporalProfile.isContinuous && temporalProfile.spanPeriods >= 6) {
            lines.push('- Time series is continuous with sufficient span → line chart recommended.');
        } else if (temporalProfile.gapCount > temporalProfile.spanPeriods * 0.3) {
            lines.push('- Too many gaps for a meaningful line chart → bar chart recommended instead.');
        }
    }

    const pivotOnlyPairs = crossDimCardinality.filter(c => c.recommendPivotOnly);
    if (crossDimCardinality.length > 0) {
        lines.push('\n### Cross-Dimension Cardinality');
        for (const c of crossDimCardinality.slice(0, 8)) {
            const note = c.recommendPivotOnly
                ? `(${c.product} combinations — use pivot, NOT flat bar chart)`
                : `(${c.product} combinations — flat bar chart acceptable)`;
            lines.push(`- ${c.dimA} × ${c.dimB}: ${note}`);
        }
        if (pivotOnlyPairs.length > 0) {
            lines.push(`IMPORTANT: ${pivotOnlyPairs.map(c => `${c.dimA} × ${c.dimB}`).join(', ')} — these dimension pairs exceed 100 combinations and MUST use pivot chart type, not flat bar.`);
        }
    }

    const lowCompletenessItems = dimCompleteness.filter(d => d.completenessRate < COMPLETENESS_SUMMARY_THRESHOLD);
    if (lowCompletenessItems.length > 0) {
        lines.push('\n### Dimension Completeness');
        for (const d of lowCompletenessItems.slice(0, 8)) {
            const pct = Math.round(d.completenessRate * 100);
            const advice = d.deprioritize
                ? `— deprioritize as groupBy (${100 - pct}% missing); consider WHERE IS NOT NULL filter`
                : `— usable as groupBy but ${100 - pct}% of rows may produce NULL groups`;
            lines.push(`- "${d.column}": ${pct}% complete ${advice}`);
        }
    }

    if (widePivotShape) {
        lines.push('\n### Wide Pivot / Cross-Tab Format');
        lines.push('- This table is in wide pivot format: many numerical columns represent a cross-section (e.g. by project, period, or category).');
        lines.push('- Row-based analysis (group by the first categorical columns) works directly.');
        lines.push('- Column-dimension analysis (treat column headers as a dimension) requires selecting specific columns or using a pivot_matrix card type.');
        lines.push('- IMPORTANT: Do NOT use the many numerical columns as groupBy dimensions — they are column headers, not row values.');
    }

    if (periodColumnFamilies.length > 0) {
        lines.push('\n### Period Column Families');
        for (const family of periodColumnFamilies) {
            lines.push(`- ${family.pattern} period columns (${family.year ?? 'no year'}): ${family.columns.join(', ')}`);
            const quarters = Object.entries(family.quarterMap).filter(([, cols]) => cols.length > 0);
            if (quarters.length > 0) {
                lines.push(`- Quarter mapping: ${quarters.map(([q, cols]) => `${q}=[${cols.join(', ')}]`).join(', ')}`);
            }
        }
        lines.push('- To analyze a quarter (e.g. Q4 2010), use one plan.aggregates entry per month column (e.g. sum of "OCT 2010", sum of "NOV 2010", sum of "DEC 2010") and add all aliases to plan.select. Then reference those aliases in the answer.');
        lines.push('- Do NOT use "OCT 2010 + NOV 2010 + DEC 2010" as a column name — each is a separate column.');
    }

    if (suggestedUnpivotPlan) {
        lines.push('\n### Auto-Unpivot Plan (Period → Long Table)');
        lines.push(`- A \`data.mutate\` unpivot plan is available to convert ${suggestedUnpivotPlan.sourceColumns.length} wide period columns into a long table.`);
        lines.push(`- Output columns: **${suggestedUnpivotPlan.keyColumn}** (period key), **${suggestedUnpivotPlan.valueColumn}** (cell value), **${suggestedUnpivotPlan.sourceColumnNameColumn ?? 'SourceColumnName'}** (original header).`);
        if (suggestedUnpivotPlan.keepColumns && suggestedUnpivotPlan.keepColumns.length > 0) {
            const displayKeep = suggestedUnpivotPlan.keepColumns.slice(0, 6);
            const suffix = suggestedUnpivotPlan.keepColumns.length > 6 ? ` (+${suggestedUnpivotPlan.keepColumns.length - 6} more)` : '';
            lines.push(`- Preserved dimension columns: ${displayKeep.join(', ')}${suffix}`);
        }
        if (unpivotExcludedColumns.length > 0) {
            lines.push(`- Excluded from period series (total/summary): ${unpivotExcludedColumns.join(', ')}`);
        }
        lines.push('- Apply this plan via `data.mutate` with `unpivot_columns` before running period-based trend analysis.');
    }

    if (formattedNumberColumns.length > 0) {
        lines.push('\n### Comma-Formatted Number Columns');
        lines.push(`- The following columns store numbers with comma thousands separators (e.g. "1,234.56"): ${formattedNumberColumns.slice(0, 8).join(', ')}${formattedNumberColumns.length > 8 ? ` (+${formattedNumberColumns.length - 8} more)` : ''}.`);
        lines.push('- DuckDB cannot CAST these directly. Use replace_values to strip commas first, then cast_column to convert to numeric type.');
        lines.push('- Until cleaned, SQL aggregations on these columns will return NULL or errors.');
    }

    return lines.join('\n');
};
