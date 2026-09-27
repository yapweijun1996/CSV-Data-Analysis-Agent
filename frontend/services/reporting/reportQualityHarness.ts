import type { CsvRow, ReportCardEvidence, ReportEvidenceBundle } from '../../types';

/* ── Interfaces ──────────────────────────────────────────── */

export interface BusinessKpiDirective {
    label: string;
    value: string;
    supportingNote: string;
    tone: 'neutral' | 'good' | 'warning';
    source: 'card_aggregation' | 'card_count' | 'derived';
}

export interface ReportQualityDirectives {
    businessKpis: BusinessKpiDirective[];
    caveatRewrites: Map<string, string>;
    detectedCurrency: string | null;
}

/* ── Constants ───────────────────────────────────────────── */

const MAX_BUSINESS_KPIS = 4;

const REVENUE_PATTERN = /revenue|sales|income|turnover/i;
const PROFIT_PATTERN = /profit|margin|earnings|ebitda|ebit/i;
const COST_PATTERN = /cost|expense|expenditure|spending|outflow/i;
const COUNT_PATTERN = /count|number|quantity|volume/i;

const CURRENCY_DETECT_PATTERN = /\b(SGD|USD|EUR|GBP|JPY|CNY|MYR|HKD|AUD|CAD)\b/i;

const CAVEAT_REWRITES: Array<[RegExp, string]> = [
    /* ── row expansion & structural normalization ──────────── */
    [
        /cleaned rows expanded [\d.]+x over raw rows/i,
        'Data preparation expanded the dataset from the original file, which may indicate structural normalization.',
    ],
    [
        /metadata\/header recovery signals suggest structural ambiguity/i,
        'The file structure required automated recovery, which may affect data precision.',
    ],
    /* ── validation & precheck ────────────────────────────── */
    [
        /sql precheck used a fallback path/i,
        'Some automated data validation checks required alternative approaches.',
    ],
    [
        /sql precheck (is )?blocked/i,
        'Automated data validation was unable to complete, which may limit analysis confidence.',
    ],
    [
        /verification (status|outcome).*?(warning|fail)/i,
        'Data verification flagged potential issues that may affect result accuracy.',
    ],
    /* ── analyst disagreement ─────────────────────────────── */
    [
        /open disagreements remain and should be reviewed/i,
        'Some analytical perspectives differ and should be reviewed before finalizing conclusions.',
    ],
    /* ── parser & intake ──────────────────────────────────── */
    [
        /parser confidence.*(limited|low|reduced)/i,
        'The file format was not fully recognized, which may affect how some values are interpreted.',
    ],
    [
        /intake gate.*(warning|caution|partial)/i,
        'Initial data intake flagged items that may require manual review.',
    ],
    /* ── column & data quality ────────────────────────────── */
    [
        /helper column.*unverified/i,
        'Some auxiliary data columns have not been independently verified.',
    ],
    [
        /unclassified.*(share|portion|percentage|rate).*(\d+%|high|significant)/i,
        'A significant portion of the data lacks category labels, which may affect distribution analysis.',
    ],
    [
        /null (values?|data|entries|records).*(\d+%|significant|high|many)/i,
        'Missing values are present in the dataset and may affect the completeness of findings.',
    ],
    /* ── aggregation & calculation ─────────────────────────── */
    [
        /aggregation quality (warning|flag|concern)/i,
        'The method used to aggregate values may not fully represent the underlying data.',
    ],
    [
        /duplicate (labels?|rows?|entries|records).*detected/i,
        'Duplicate entries were detected, which may inflate totals if not accounted for.',
    ],
    /* ── workflow & preparation ────────────────────────────── */
    [
        /preparation (state|status).*(partial|incomplete|pending)/i,
        'Data preparation did not fully complete, so some values may not reflect the final cleaned state.',
    ],
    [
        /workflow review remains manual/i,
        'Some data quality checks were not automated and may need manual confirmation.',
    ],
    [
        /consistency (issues?|problems?|concerns?).*detected/i,
        'Minor data consistency issues were found that could affect precision of certain figures.',
    ],
    /* ── precheck & workflow status ────────────────────────── */
    [
        /sql precheck status is warning/i,
        'Some automated data validation checks produced warnings that may warrant review.',
    ],
    [
        /workflow warnings remain unresolved/i,
        'Data preparation flagged items that have not yet been resolved.',
    ],
    [
        /\d+ dataset caveat\(s\) remain active/i,
        'Multiple data quality caveats are still active and should be reviewed before acting on the findings.',
    ],
];

/* ── Phase 1: Extract Business KPIs from cards ───────────── */

interface CardMetric {
    label: string;
    total: number;
    groupCount: number;
    groupLabel: string;
    priority: number;
    card: ReportCardEvidence;
}

const classifyMetricFromCard = (card: ReportCardEvidence): { category: string; priority: number } => {
    // Check valueColumn, displayTitle, and description for classification signals
    const signals = [card.valueColumn ?? '', card.displayTitle ?? '', card.description ?? ''].join(' ');
    if (REVENUE_PATTERN.test(signals)) return { category: 'revenue', priority: 4 };
    if (PROFIT_PATTERN.test(signals)) return { category: 'profit', priority: 3 };
    if (COST_PATTERN.test(signals)) return { category: 'cost', priority: 2 };
    if (COUNT_PATTERN.test(signals)) return { category: 'count', priority: 1 };
    // Generic "total_value" or "value" columns — use card ID to avoid dedup collision
    return { category: card.cardId, priority: 0 };
};

const toNumericValue = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = typeof value === 'string'
        ? Number(String(value).replace(/[,$%()]/g, '').trim())
        : NaN;
    return Number.isFinite(parsed) ? parsed : null;
};

const computeCardTotal = (rows: CsvRow[], valueColumn: string): number =>
    rows.reduce((sum, row) => {
        const numeric = toNumericValue(row[valueColumn]);
        return sum + (numeric ?? 0);
    }, 0);

const formatKpiValue = (value: number, currency: string | null): string => {
    const abs = Math.abs(value);
    const formatted = abs >= 1_000_000
        ? `${(value / 1_000_000).toFixed(1)}M`
        : abs >= 1_000
            ? `${(value / 1_000).toFixed(0)}K`
            : value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return currency ? `${formatted} ${currency}` : formatted;
};

const GENERIC_VALUE_COLUMNS = /^(total_value|value|amount|sum|count|entry_count|total|qty|row_total|sum_\w+|total_\w+|po_qty)$/i;

const buildMetricLabel = (card: ReportCardEvidence): string => {
    const valueColumn = card.valueColumn ?? '';
    // If the valueColumn is a generic SQL alias, use the card displayTitle instead
    if (GENERIC_VALUE_COLUMNS.test(valueColumn)) {
        return card.displayTitle;
    }
    const clean = valueColumn
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
    if (/^total\b/i.test(clean)) return clean;
    return `Total ${clean}`;
};

const buildKpiSupportingNote = (m: CardMetric, currency: string | null): string => {
    const rows = m.card.reportChartRows?.length ? m.card.reportChartRows : m.card.aggregatedDataSample;
    if (!rows?.length || !m.card.valueColumn || m.groupCount <= 1) {
        return `Aggregated across ${m.groupCount} ${m.groupLabel.toLowerCase()} categories.`;
    }

    // Find the top group by absolute value
    let topLabel = '';
    let topValue = 0;
    for (const row of rows) {
        const num = toNumericValue(row[m.card.valueColumn]);
        if (num !== null && Math.abs(num) > Math.abs(topValue)) {
            topValue = num;
            topLabel = String(row[m.card.groupByColumn ?? ''] ?? '').trim();
        }
    }

    if (!topLabel || m.total === 0) {
        return `Aggregated across ${m.groupCount} ${m.groupLabel.toLowerCase()} categories.`;
    }

    const share = Math.round((Math.abs(topValue) / Math.abs(m.total)) * 100);
    const topFormatted = formatKpiValue(topValue, currency);
    return `Top: ${topLabel} (${topFormatted}, ${share}% of total) across ${m.groupCount} categories.`;
};

const extractBusinessKpis = (
    cards: ReportCardEvidence[],
    currency: string | null,
): BusinessKpiDirective[] => {
    const metrics: CardMetric[] = [];
    const seenCategories = new Set<string>();

    for (const card of cards) {
        if (!card.valueColumn || card.aggregation !== 'sum') continue;
        if (!card.reportChartRows?.length && !card.aggregatedDataSample?.length) continue;

        const rows = card.reportChartRows?.length ? card.reportChartRows : card.aggregatedDataSample;
        const total = computeCardTotal(rows, card.valueColumn);
        if (!Number.isFinite(total) || total === 0) continue;

        const { category, priority } = classifyMetricFromCard(card);
        if (seenCategories.has(category)) continue;
        seenCategories.add(category);

        metrics.push({
            label: buildMetricLabel(card),
            total,
            groupCount: rows.length,
            groupLabel: card.groupByColumn ?? 'items',
            priority,
            card,
        });
    }

    metrics.sort((a, b) => b.priority - a.priority);

    const kpis: BusinessKpiDirective[] = metrics.slice(0, MAX_BUSINESS_KPIS - 1).map(m => ({
        label: m.label,
        value: formatKpiValue(m.total, currency),
        supportingNote: buildKpiSupportingNote(m, currency),
        tone: m.priority >= 3 ? 'good' : 'neutral',
        source: 'card_aggregation' as const,
    }));

    // Add a group count KPI from the card with the most groups
    const topCard = metrics[0];
    if (topCard && topCard.groupCount > 1) {
        const groupLabel = topCard.groupLabel
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
        kpis.push({
            label: groupLabel,
            value: String(topCard.groupCount),
            supportingNote: `Distinct categories in the primary analysis dimension.`,
            tone: 'neutral',
            source: 'card_count',
        });
    }

    return kpis.slice(0, MAX_BUSINESS_KPIS);
};

/* ── Phase 2: Caveat rewrites ────────────────────────────── */

const buildCaveatRewrites = (
    caveats: string[],
    risks: string[],
): Map<string, string> => {
    const rewrites = new Map<string, string>();

    for (const text of [...caveats, ...risks]) {
        for (const [pattern, replacement] of CAVEAT_REWRITES) {
            if (pattern.test(text)) {
                rewrites.set(text, replacement);
                break;
            }
        }
    }

    return rewrites;
};

/* ── Phase 3: Currency detection ─────────────────────────── */

const detectCurrency = (bundle: ReportEvidenceBundle): string | null => {
    // Check report title and file name
    const titleAndParams = [
        bundle.dataset.reportTitle,
        bundle.dataset.fileName,
    ].filter(Boolean).join(' ');
    const titleMatch = CURRENCY_DETECT_PATTERN.exec(titleAndParams);
    if (titleMatch) return titleMatch[1].toUpperCase();

    // Check card value column names
    for (const card of bundle.cards) {
        if (!card.valueColumn) continue;
        const colMatch = CURRENCY_DETECT_PATTERN.exec(card.valueColumn);
        if (colMatch) return colMatch[1].toUpperCase();
    }

    return null;
};

/* ── Entry point ─────────────────────────────────────────── */

export const runReportQualityHarness = (
    bundle: ReportEvidenceBundle,
): ReportQualityDirectives => {
    const detectedCurrency = detectCurrency(bundle);

    return {
        businessKpis: extractBusinessKpis(bundle.cards, detectedCurrency),
        caveatRewrites: buildCaveatRewrites(
            bundle.dataset.caveats,
            bundle.dataset.readinessRisks,
        ),
        detectedCurrency,
    };
};
