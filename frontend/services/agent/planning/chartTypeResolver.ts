/**
 * AI Chart Type Resolver (AGENT-302)
 *
 * Centralizes the mapping from AI-proposed chart type names to canonical
 * ChartType values. AI models may return non-canonical names ("scatter plot",
 * "donut", "stacked bar chart") or unknown types — this module normalizes
 * them deterministically with a fallback chain.
 *
 * Adapted from data-formulator chartRecommendation.ts pattern.
 */

import type { ChartType } from '../../../types';

// --- AI short-name → canonical ChartType mapping ---

const AGENT_CHART_TYPE_MAP: Record<string, ChartType> = {
    // Canonical identity mappings
    'bar': 'bar',
    'horizontal_bar': 'horizontal_bar',
    'line': 'line',
    'area': 'area',
    'pie': 'pie',
    'doughnut': 'doughnut',
    'polar_area': 'polar_area',
    'scatter': 'scatter',
    'combo': 'combo',
    'radar': 'radar',
    'bubble': 'bubble',
    'stacked_bar': 'stacked_bar',
    'stacked_column': 'stacked_column',
    'multi_line': 'multi_line',

    // AI aliases
    'bar_chart': 'bar',
    'bar chart': 'bar',
    'column': 'bar',
    'column_chart': 'bar',
    'horizontal bar': 'horizontal_bar',
    'hbar': 'horizontal_bar',
    'line_chart': 'line',
    'line chart': 'line',
    'area_chart': 'area',
    'area chart': 'area',
    'pie_chart': 'pie',
    'pie chart': 'pie',
    'donut': 'doughnut',
    'donut_chart': 'doughnut',
    'doughnut_chart': 'doughnut',
    'scatter_plot': 'scatter',
    'scatter plot': 'scatter',
    'scatterplot': 'scatter',
    'bubble_chart': 'bubble',
    'bubble chart': 'bubble',
    'combo_chart': 'combo',
    'mixed': 'combo',
    'radar_chart': 'radar',
    'spider': 'radar',
    'polar': 'polar_area',
    'polar_chart': 'polar_area',
    'stacked': 'stacked_bar',
    'stacked bar': 'stacked_bar',
    'stacked_bar_chart': 'stacked_bar',
    'stacked bar chart': 'stacked_bar',
    'stacked column': 'stacked_column',
    'stacked_column_chart': 'stacked_column',
    'multiline': 'multi_line',
    'multi line': 'multi_line',
};

const DEFAULT_FALLBACK: ChartType = 'bar';

/**
 * Resolve an AI-proposed chart type to a canonical ChartType.
 * Handles aliases, case variations, and whitespace. Falls back to
 * the provided fallback or 'bar' if unrecognizable.
 */
export function resolveAiChartType(
    aiChartType: string | undefined | null,
    fallback?: ChartType,
): ChartType {
    if (!aiChartType) return fallback ?? DEFAULT_FALLBACK;
    const normalized = aiChartType.trim().toLowerCase();
    if (!normalized) return fallback ?? DEFAULT_FALLBACK;
    return AGENT_CHART_TYPE_MAP[normalized] ?? fallback ?? DEFAULT_FALLBACK;
}

/**
 * Try to resolve an AI-proposed chart type. Returns undefined if the
 * input is not recognizable (no fallback). Useful when callers want to
 * let a downstream deterministic recommender decide instead.
 */
export function tryResolveAiChartType(
    aiChartType: string | undefined | null,
): ChartType | undefined {
    if (!aiChartType) return undefined;
    const normalized = aiChartType.trim().toLowerCase();
    if (!normalized) return undefined;
    return AGENT_CHART_TYPE_MAP[normalized];
}

/**
 * Check whether a string is a valid canonical ChartType.
 */
export function isValidChartType(value: string): value is ChartType {
    const normalized = value.trim().toLowerCase();
    const resolved = AGENT_CHART_TYPE_MAP[normalized];
    // Valid only if it resolves to itself (i.e., it's a canonical name)
    return resolved !== undefined && resolved === normalized;
}

// --- Encoding channel normalization ---

const ENCODING_CHANNEL_MAP: Record<string, string> = {
    'facet': 'column',
    'color': 'series',
    'colour': 'series',
    'x_axis': 'x',
    'y_axis': 'y',
    'x-axis': 'x',
    'y-axis': 'y',
    'category': 'x',
    'value': 'y',
    'label': 'x',
    'metric': 'y',
};

/**
 * Normalize an AI-proposed encoding channel name to the app's canonical form.
 * Unknown channels pass through unchanged.
 */
export function normalizeEncodingChannel(channel: string): string {
    const normalized = channel.trim().toLowerCase();
    return ENCODING_CHANNEL_MAP[normalized] ?? normalized;
}
