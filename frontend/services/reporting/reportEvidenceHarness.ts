/**
 * Report Evidence Harness — runs BEFORE LLM analyst memo calls.
 *
 * Pattern: investigate → typed findings → runtime directives → prompt context.
 *
 * Unlike reportQualityHarness (post-LLM, normalizes IR output), this harness
 * inspects the raw evidence bundle and produces a structured BRIEFING that
 * steers the LLM toward business-relevant findings and away from technical
 * noise. The briefing becomes part of the prompt, not advisory text — the LLM
 * can't produce findings about topics excluded by the harness.
 */

import type { ReportCardEvidence, ReportEvidenceBundle, CsvRow } from '../../types';

/* ── Interfaces ──────────────────────────────────────────── */

export interface EvidenceMetricProfile {
    column: string;
    displayLabel: string;
    total: number;
    formattedTotal: string;
    groupColumn: string | null;
    groupCount: number;
    topGroups: Array<{ label: string; value: number; share: number }>;
    category: 'revenue' | 'profit' | 'cost' | 'count' | 'other';
    cardId: string;
}

export interface EvidenceConcentration {
    topGroupLabel: string;
    topGroupShare: number;
    top3Share: number;
    hasUnclassified: boolean;
    unclassifiedValue: number | null;
}

export interface EvidenceDataQualitySignal {
    signal: string;
    severity: 'info' | 'warning' | 'critical';
}

export interface ReportEvidenceBriefing {
    /** Structured metric profiles extracted from cards */
    metricProfiles: EvidenceMetricProfile[];
    /** Concentration analysis from the primary metric */
    concentration: EvidenceConcentration | null;
    /** Data quality signals to highlight */
    qualitySignals: EvidenceDataQualitySignal[];
    /** Suggested narrative themes the LLM should prioritize */
    narrativeThemes: string[];
    /** Topics the LLM should AVOID (internal/technical) */
    blockedTopics: string[];
    /** Markdown briefing text injected into the prompt */
    briefingMarkdown: string;
    /** Detected currency code */
    detectedCurrency: string | null;
    /** Business entity name (cleaned) */
    entityName: string | null;
}

/* ── Constants ───────────────────────────────────────────── */

const REVENUE_PATTERN = /revenue|sales|income|turnover/i;
const PROFIT_PATTERN = /profit|margin|earnings|ebitda|ebit/i;
const COST_PATTERN = /cost|expense|expenditure|spending|outflow/i;
const COUNT_PATTERN = /count|number|quantity|volume/i;
const NULL_PATTERN = /^(null|n\/a|unknown|unclassified|undefined|\s*)$/i;
const CURRENCY_PATTERN = /\b(SGD|USD|EUR|GBP|JPY|CNY|MYR|HKD|AUD|CAD)\b/i;

const MAX_TOP_GROUPS = 5;
const MAX_THEMES = 5;

/* ── Helpers ─────────────────────────────────────────────── */

const toNumericValue = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = typeof value === 'string'
        ? Number(String(value).replace(/[,$%()]/g, '').trim())
        : NaN;
    return Number.isFinite(parsed) ? parsed : null;
};

const classifyMetric = (column: string): EvidenceMetricProfile['category'] => {
    if (REVENUE_PATTERN.test(column)) return 'revenue';
    if (PROFIT_PATTERN.test(column)) return 'profit';
    if (COST_PATTERN.test(column)) return 'cost';
    if (COUNT_PATTERN.test(column)) return 'count';
    return 'other';
};

const formatCurrency = (value: number, currency: string | null): string => {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    const formatted = abs >= 1_000_000
        ? `${(abs / 1_000_000).toFixed(2)}M`
        : abs >= 1_000
            ? `${Math.round(abs).toLocaleString()}`
            : abs.toFixed(2);
    return currency ? `${sign}${formatted} ${currency}` : `${sign}${formatted}`;
};

const cleanLabel = (value: string): string =>
    value.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();

const isNullLabel = (value: unknown): boolean =>
    NULL_PATTERN.test(String(value ?? '').trim());

/* ── Phase 1: Profile each card's metrics ────────────────── */

const profileCard = (
    card: ReportCardEvidence,
    currency: string | null,
): EvidenceMetricProfile | null => {
    if (!card.valueColumn || card.aggregation !== 'sum') return null;
    const rows = card.reportChartRows?.length ? card.reportChartRows : card.aggregatedDataSample;
    if (!rows?.length) return null;

    const groupCol = card.groupByColumn;
    const valueCol = card.valueColumn;

    const entries: Array<{ label: string; value: number }> = [];
    let total = 0;

    for (const row of rows) {
        const numeric = toNumericValue(row[valueCol]);
        if (numeric == null) continue;
        total += numeric;
        const label = groupCol ? String(row[groupCol] ?? 'Unclassified').trim() : 'Total';
        entries.push({ label: isNullLabel(label) ? 'Unclassified' : label, value: numeric });
    }

    if (!Number.isFinite(total) || total === 0) return null;

    entries.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const topGroups = entries.slice(0, MAX_TOP_GROUPS).map(e => ({
        label: e.label,
        value: e.value,
        share: total !== 0 ? e.value / total : 0,
    }));

    return {
        column: valueCol,
        displayLabel: cleanLabel(valueCol),
        total,
        formattedTotal: formatCurrency(total, currency),
        groupColumn: groupCol,
        groupCount: entries.length,
        topGroups,
        category: classifyMetric(valueCol),
        cardId: card.cardId,
    };
};

/* ── Phase 2: Concentration analysis ─────────────────────── */

const analyzeConcentration = (
    profile: EvidenceMetricProfile,
): EvidenceConcentration | null => {
    if (profile.topGroups.length < 2) return null;
    const top = profile.topGroups[0];
    const top3Total = profile.topGroups.slice(0, 3).reduce((s, g) => s + g.value, 0);
    const unclassifiedGroup = profile.topGroups.find(g => g.label === 'Unclassified');

    return {
        topGroupLabel: top.label,
        topGroupShare: top.share,
        top3Share: profile.total !== 0 ? top3Total / profile.total : 0,
        hasUnclassified: Boolean(unclassifiedGroup),
        unclassifiedValue: unclassifiedGroup?.value ?? null,
    };
};

/* ── Phase 3: Data quality signals ───────────────────────── */

const detectQualitySignals = (
    bundle: ReportEvidenceBundle,
    profiles: EvidenceMetricProfile[],
): EvidenceDataQualitySignal[] => {
    const signals: EvidenceDataQualitySignal[] = (bundle.dataset.qualitySignals ?? []).map(signal => ({
        signal: signal.message,
        severity: signal.severity,
    }));

    // Check for unclassified groups
    for (const profile of profiles) {
        const unclassified = profile.topGroups.find(g => g.label === 'Unclassified');
        if (unclassified && profile.total !== 0) {
            const share = Math.round(Math.abs(unclassified.value / profile.total) * 100);
            if (share >= 10) {
                signals.push({
                    signal: `${share}% of ${profile.displayLabel} (${formatCurrency(Math.abs(unclassified.value), null)}) is assigned to an unclassified category, preventing granular tracking.`,
                    severity: share >= 30 ? 'critical' : 'warning',
                });
            }
        }
    }

    // Row expansion
    const ratio = bundle.dataset.structuralSignals.rowExpansionRatio;
    if (typeof ratio === 'number' && ratio > 5) {
        signals.push({
            signal: `Data preparation expanded the original file by ${ratio.toFixed(0)} times, which may indicate a hierarchical report structure with embedded subtotals.`,
            severity: ratio > 20 ? 'warning' : 'info',
        });
    }

    // Low trusted card count
    if (bundle.dataset.trustedCardsCount === 0 && bundle.cards.length > 0) {
        signals.push({
            signal: `All ${bundle.cards.length} analysis cards carry caveats — findings should be stated as preliminary observations, not definitive conclusions.`,
            severity: 'warning',
        });
    }

    const deduped = new Map<string, EvidenceDataQualitySignal>();
    for (const signal of signals) {
        const key = `${signal.severity}:${signal.signal}`;
        if (!deduped.has(key)) {
            deduped.set(key, signal);
        }
    }

    return Array.from(deduped.values());
};

/* ── Phase 4: Narrative themes ───────────────────────────── */

const buildNarrativeThemes = (
    profiles: EvidenceMetricProfile[],
    concentration: EvidenceConcentration | null,
    signals: EvidenceDataQualitySignal[],
): string[] => {
    const themes: string[] = [];

    // Revenue/profit distribution
    const revenueProfile = profiles.find(p => p.category === 'revenue');
    const profitProfile = profiles.find(p => p.category === 'profit');
    const costProfile = profiles.find(p => p.category === 'cost');

    if (revenueProfile && profitProfile) {
        themes.push(`Compare revenue (${revenueProfile.formattedTotal}) against profit (${profitProfile.formattedTotal}) to assess margin health.`);
    } else if (profitProfile) {
        themes.push(`Analyze the ${profitProfile.formattedTotal} profit distribution across ${profitProfile.groupCount} categories.`);
    } else if (revenueProfile) {
        themes.push(`Analyze the ${revenueProfile.formattedTotal} revenue distribution across ${revenueProfile.groupCount} categories.`);
    }

    // Concentration risk
    if (concentration && concentration.topGroupShare > 0.4) {
        themes.push(`"${concentration.topGroupLabel}" holds ${Math.round(concentration.topGroupShare * 100)}% — assess whether this concentration poses a risk.`);
    }
    if (concentration && concentration.top3Share > 0.7) {
        themes.push(`Top 3 categories hold ${Math.round(concentration.top3Share * 100)}% of the total — evaluate diversification.`);
    }

    // Unclassified data
    if (concentration?.hasUnclassified && concentration.unclassifiedValue != null) {
        themes.push(`A significant unclassified amount needs reconciliation before finalizing conclusions.`);
    }

    // Cost structure
    if (costProfile && costProfile.groupCount > 5) {
        themes.push(`Break down the ${costProfile.formattedTotal} in total costs across ${costProfile.groupCount} categories to identify the largest cost drivers.`);
    }

    return themes.slice(0, MAX_THEMES);
};

/* ── Phase 5: Blocked topics ─────────────────────────────── */

const BLOCKED_TOPICS = [
    'row expansion ratio or data cleaning internals',
    'parser confidence or intake gate status',
    'helper exposure levels or semantic role classifications',
    'trusted card counts or evidence gate mechanics',
    'column data types, null rates, or profiling statistics',
    'workflow preparation states or verification pipeline details',
];

/* ── Build briefing markdown ─────────────────────────────── */

const buildBriefingMarkdown = (
    profiles: EvidenceMetricProfile[],
    concentration: EvidenceConcentration | null,
    signals: EvidenceDataQualitySignal[],
    themes: string[],
    entityName: string | null,
    currency: string | null,
): string => {
    const lines: string[] = ['## Evidence Briefing (Pre-Analysis Harness)'];

    if (entityName) {
        lines.push(`\nEntity: **${entityName}**`);
    }
    if (currency) {
        lines.push(`Currency: **${currency}** (use uppercase in all text)`);
    }

    if (profiles.length > 0) {
        lines.push('\n### Key Metrics Detected');
        for (const p of profiles) {
            lines.push(`- **${p.displayLabel}**: ${p.formattedTotal} across ${p.groupCount} ${p.groupColumn ? cleanLabel(p.groupColumn) : 'item'}(s)`);
            if (p.topGroups.length > 0) {
                const topLabels = p.topGroups.slice(0, 3).map(g =>
                    `${g.label} (${Math.round(g.share * 100)}%)`
                ).join(', ');
                lines.push(`  Top: ${topLabels}`);
            }
        }
    }

    if (concentration) {
        lines.push('\n### Concentration Analysis');
        lines.push(`- Top category: "${concentration.topGroupLabel}" at ${Math.round(concentration.topGroupShare * 100)}% share`);
        lines.push(`- Top 3 share: ${Math.round(concentration.top3Share * 100)}%`);
        if (concentration.hasUnclassified && concentration.unclassifiedValue != null) {
            lines.push(`- WARNING: Unclassified category holds ${formatCurrency(Math.abs(concentration.unclassifiedValue), currency)}`);
        }
    }

    if (signals.length > 0) {
        lines.push('\n### Data Quality Signals');
        for (const s of signals) {
            const prefix = s.severity === 'critical' ? 'CRITICAL' : s.severity === 'warning' ? 'WARNING' : 'INFO';
            lines.push(`- [${prefix}] ${s.signal}`);
        }
    }

    if (themes.length > 0) {
        lines.push('\n### Recommended Narrative Focus');
        lines.push('Prioritize these themes in your findings:');
        for (const theme of themes) {
            lines.push(`- ${theme}`);
        }
    }

    lines.push('\n### BLOCKED Topics (do NOT include in findings)');
    for (const topic of BLOCKED_TOPICS) {
        lines.push(`- ${topic}`);
    }

    return lines.join('\n');
};

/* ── Entry point ─────────────────────────────────────────── */

export const runReportEvidenceHarness = (
    bundle: ReportEvidenceBundle,
): ReportEvidenceBriefing => {
    // Detect currency first — used by profiling
    const titleAndFile = [bundle.dataset.reportTitle, bundle.dataset.fileName].filter(Boolean).join(' ');
    const currencyMatch = CURRENCY_PATTERN.exec(titleAndFile)
        ?? bundle.cards.reduce<RegExpExecArray | null>((found, card) =>
            found ?? (card.valueColumn ? CURRENCY_PATTERN.exec(card.valueColumn) : null), null);
    const detectedCurrency = currencyMatch ? currencyMatch[1].toUpperCase() : null;

    // Extract entity name from report title
    const entityName = bundle.dataset.reportTitle
        ? bundle.dataset.reportTitle
            .replace(/\b(income\s+statement|balance\s+sheet|cash\s+flow|report|statement)\b/gi, '')
            .replace(/\b(by|for|of|the)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim() || null
        : null;

    // Phase 1: Profile metrics
    const metricProfiles = bundle.cards
        .map(card => profileCard(card, detectedCurrency))
        .filter((p): p is EvidenceMetricProfile => p !== null)
        .sort((a, b) => {
            const priorityOrder: Record<EvidenceMetricProfile['category'], number> = {
                revenue: 4, profit: 3, cost: 2, count: 1, other: 0,
            };
            return priorityOrder[b.category] - priorityOrder[a.category];
        });

    // Phase 2: Concentration
    const primaryProfile = metricProfiles[0] ?? null;
    const concentration = primaryProfile ? analyzeConcentration(primaryProfile) : null;

    // Phase 3: Quality signals
    const qualitySignals = detectQualitySignals(bundle, metricProfiles);

    // Phase 4: Themes
    const narrativeThemes = buildNarrativeThemes(metricProfiles, concentration, qualitySignals);

    // Phase 5: Build briefing
    const briefingMarkdown = buildBriefingMarkdown(
        metricProfiles, concentration, qualitySignals, narrativeThemes, entityName, detectedCurrency,
    );

    return {
        metricProfiles,
        concentration,
        qualitySignals,
        narrativeThemes,
        blockedTopics: [...BLOCKED_TOPICS],
        briefingMarkdown,
        detectedCurrency,
        entityName,
    };
};
