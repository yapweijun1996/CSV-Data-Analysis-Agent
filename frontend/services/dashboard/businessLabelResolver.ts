import type { AnalysisPlan } from '../../types';
import { pluralizeLabel, toDisplayLabel } from './executiveKpiUtils';
import { isHelperLikeGroupHint } from './businessLabelHeuristics';

const INTERNAL_GROUP_COLUMNS = new Set([
    'rowlabel',
    'serieskey',
    'serieslabel',
    'serieslabell1',
    'serieslabell2',
    'serieslabell3',
    'sourcecolumnname',
    'sourcerowindex',
    'rowclass',
    'hierarchydepth',
]);

const INTERNAL_METRIC_COLUMNS = new Set([
    'rowtotal',
    'value',
    'amount',
    'metric',
    'measure',
]);

const GENERIC_LABELS = new Set([
    'group',
    'groups',
    'label',
    'labels',
    'series',
    'serieslabel',
    'serieslabels',
    'serieskey',
    'value',
    'amount',
    'metric',
    'measure',
]);

const TOP_BY_PATTERN = /^\s*top\s+(.+?)\s+by\s+(.+?)\s*$/i;
const BY_PATTERN = /^\s*(.+?)\s+by\s+(.+?)\s*$/i;
const CROSS_TAB_DESCRIPTION_PATTERN = /^\s*cross-tabulation of (.+?) across (.+?) \(rows\) and (.+?) \(columns\)\.?\s*$/i;
const SERIES_LABEL_LAYER_PATTERN = /^serieslabell(\d+)$/i;

// System-internal terms that should not appear in user-facing titles.
const SYSTEM_TERM_PATTERN = /\b(matrix grains?|sum \d+|pc \d+|grain\b)/gi;
// Double-colon separators from AI raw output (e.g., "END USER NAME :: Matrix Grains").
const DOUBLE_COLON_PATTERN = /\s*::\s*/g;

const normalizeKey = (value: string | undefined) => (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Remove system-internal terms and double-colon separators from a title. */
const sanitizeTitleSystemTerms = (title: string): string => {
    let result = title
        .replace(DOUBLE_COLON_PATTERN, ' — ')
        .replace(SYSTEM_TERM_PATTERN, '')
        .replace(/\s*—\s*$/g, '')
        .replace(/^\s*—\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    // If sanitization stripped everything meaningful, fall back to the original.
    if (!result || result === '—') return title.replace(DOUBLE_COLON_PATTERN, ' — ').trim();
    return result;
};

const sanitizeTechnicalDescriptionTerms = (description: string): string => {
    let result = description
        .replace(
            /^\s*COUNT\(\*\)\s+grouped by\s+(.+?)(?=\s+(?:Review|The result|This result)|$)/i,
            'Count of rows grouped by $1.',
        )
        .replace(
            /^\s*SUM\((.+)\)\s+grouped by\s+(.+?)(?=\s+(?:Review|The result|This result)|$)/i,
            'Total $1 grouped by $2.',
        )
        .replace(/\bSQL[- ]first\b/gi, 'query-based')
        .replace(/\bSQL evidence\b/gi, 'result')
        .replace(/\bSQL\b/gi, 'query')
        .replace(/\s+([.,])/g, '$1')
        .replace(/([.!?])(?=[A-Z])/g, '$1 ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!result) {
        return description;
    }
    return result;
};

const sanitizePhrase = (value: string | undefined): string | null => {
    const normalized = value?.replace(/[`"'()]/g, ' ').replace(/\s+/g, ' ').trim();
    return normalized ? normalized : null;
};

const singularizeLabel = (value: string): string => {
    if (!value || /[\u3400-\u9FBF]/.test(value)) {
        return value;
    }

    const words = value.split(' ');
    const lastWord = words[words.length - 1];

    let singularLast = lastWord;
    if (/^series$/i.test(lastWord)) {
        singularLast = lastWord;
    } else if (/ies$/i.test(lastWord) && lastWord.length > 3) {
        singularLast = `${lastWord.slice(0, -3)}y`;
    } else if (/(ches|shes|xes|zes|ses)$/i.test(lastWord) && lastWord.length > 3) {
        singularLast = lastWord.slice(0, -2);
    } else if (/s$/i.test(lastWord) && !/ss$/i.test(lastWord) && lastWord.length > 1) {
        singularLast = lastWord.slice(0, -1);
    }

    words[words.length - 1] = singularLast;
    return words.join(' ');
};

const pluralizeTitleGroupLabel = (value: string) =>
    /^series label\b/i.test(value) || /^source /i.test(value)
        ? value
        : pluralizeLabel(value);

const getFallbackDisplayLabel = (value: string | undefined, fallback: string): string => {
    if (!value) return fallback;

    const normalized = normalizeKey(value);
    const seriesLabelMatch = normalized.match(SERIES_LABEL_LAYER_PATTERN);
    if (seriesLabelMatch) {
        return `Series Label ${seriesLabelMatch[1]}`;
    }

    if (normalized === 'sourcecolumnname') return 'Source Column';
    if (normalized === 'sourcerowindex') return 'Source Row';
    if (normalized === 'serieskey') return 'Series Key';
    if (normalized === 'rowclass') return 'Row Class';
    if (normalized === 'hierarchydepth') return 'Hierarchy Depth';

    return toDisplayLabel(value, fallback);
};

const isMeaningfulLabel = (value: string | null, blocked: Set<string>) => {
    if (!value) return false;
    const normalized = normalizeKey(value);
    return Boolean(normalized) && !blocked.has(normalized) && !GENERIC_LABELS.has(normalized);
};

const extractTitleHints = (title: string | undefined) => {
    const sanitizedTitle = sanitizePhrase(title);
    if (!sanitizedTitle) return {};

    const topMatch = sanitizedTitle.match(TOP_BY_PATTERN);
    if (topMatch) {
        return {
            groupLabel: singularizeLabel(topMatch[1]),
            metricLabel: topMatch[2],
        };
    }

    const byMatch = sanitizedTitle.match(BY_PATTERN);
    if (byMatch) {
        return {
            metricLabel: byMatch[1],
            groupLabel: singularizeLabel(byMatch[2]),
        };
    }

    return {};
};

type DisplayPlanSource = Pick<AnalysisPlan, 'title' | 'description' | 'groupByColumn' | 'valueColumn' | 'artifactMetadata'>;

const extractCrossTabHints = (description: string | undefined) => {
    const sanitizedDescription = sanitizePhrase(description);
    if (!sanitizedDescription) return {};
    const match = sanitizedDescription.match(CROSS_TAB_DESCRIPTION_PATTERN);
    if (!match) return {};

    return {
        metricLabel: match[1],
        groupLabel: match[2],
        columnLabel: match[3],
    };
};

const getPivotMetadataHints = (plan: DisplayPlanSource) => {
    const metadata = plan.artifactMetadata;
    if (metadata?.artifactType !== 'pivot_matrix') {
        return {};
    }

    return {
        groupLabel: sanitizePhrase(metadata.matrixRowLabel),
        columnLabel: sanitizePhrase(metadata.matrixColumnLabel),
        metricLabel: sanitizePhrase(metadata.matrixMetricLabel),
    };
};

const getPlanHints = (plan: DisplayPlanSource) => {
    const titleHints = extractTitleHints(plan.title);
    const descriptionHints = extractTitleHints(plan.description);
    const crossTabHints = extractCrossTabHints(plan.description);
    const metadataHints = getPivotMetadataHints(plan);
    return {
        groupLabel: metadataHints.groupLabel ?? crossTabHints.groupLabel ?? titleHints.groupLabel ?? descriptionHints.groupLabel ?? null,
        columnLabel: metadataHints.columnLabel ?? crossTabHints.columnLabel ?? null,
        metricLabel: metadataHints.metricLabel ?? crossTabHints.metricLabel ?? titleHints.metricLabel ?? descriptionHints.metricLabel ?? null,
    };
};

const pickMostCommonLabel = (values: string[]): string | null => {
    const counts = new Map<string, number>();
    values.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1));

    let bestValue: string | null = null;
    let bestCount = -1;
    counts.forEach((count, value) => {
        if (count > bestCount) {
            bestValue = value;
            bestCount = count;
        }
    });
    return bestValue;
};

const replaceWholeWord = (text: string, search: string | undefined, replacement: string) => {
    if (!search) return text;
    return text.replace(new RegExp(`\\b${escapeRegExp(search)}\\b`, 'g'), replacement);
};

export const resolvePlanGroupLabel = (plan: DisplayPlanSource): string => {
    const fallback = getFallbackDisplayLabel(plan.groupByColumn, 'Group');
    if (!plan.groupByColumn || !INTERNAL_GROUP_COLUMNS.has(normalizeKey(plan.groupByColumn))) {
        return fallback;
    }

    const hints = getPlanHints(plan);
    if (
        isMeaningfulLabel(hints.groupLabel ?? null, INTERNAL_GROUP_COLUMNS)
        && !isHelperLikeGroupHint(plan.groupByColumn, hints.groupLabel ?? null)
    ) {
        return toDisplayLabel(hints.groupLabel, 'Group');
    }

    return fallback;
};

export const resolvePlanMetricLabel = (plan: DisplayPlanSource): string | null => {
    if (!plan.valueColumn) return null;

    const fallback = getFallbackDisplayLabel(plan.valueColumn, 'Metric');
    if (!INTERNAL_METRIC_COLUMNS.has(normalizeKey(plan.valueColumn))) {
        return fallback;
    }

    const hints = getPlanHints(plan);
    if (isMeaningfulLabel(hints.metricLabel ?? null, INTERNAL_METRIC_COLUMNS)) {
        return toDisplayLabel(hints.metricLabel, 'Metric');
    }

    return fallback;
};

export const resolveDisplayPlanTitle = (
    plan: DisplayPlanSource,
): string => {
    const rawTitle = sanitizePhrase(plan.title) ?? 'AI Generated Analysis';
    const title = sanitizeTitleSystemTerms(rawTitle)
        .replace(/\b(by|per|vs)(?=[A-Z])/g, '$1 ');
    const metricLabel = resolvePlanMetricLabel(plan);
    const groupLabel = resolvePlanGroupLabel(plan);
    const columnLabel = getPlanHints(plan).columnLabel;
    const topMatch = title.match(TOP_BY_PATTERN);

    if (topMatch && metricLabel) {
        return `Top ${pluralizeTitleGroupLabel(groupLabel)} by ${metricLabel}`;
    }

    if (
        plan.artifactMetadata?.artifactType === 'pivot_matrix'
        && metricLabel
        && groupLabel
        && isMeaningfulLabel(groupLabel, INTERNAL_GROUP_COLUMNS)
        && columnLabel
        && isMeaningfulLabel(columnLabel, INTERNAL_GROUP_COLUMNS)
    ) {
        return `${metricLabel} by ${groupLabel} and ${toDisplayLabel(columnLabel, 'Column')}`;
    }

    const byMatch = title.match(BY_PATTERN);
    if (byMatch) {
        return `${metricLabel ?? sanitizePhrase(byMatch[1]) ?? byMatch[1]} by ${groupLabel}`;
    }

    let nextTitle = title;
    if (plan.groupByColumn) {
        nextTitle = replaceWholeWord(nextTitle, plan.groupByColumn, groupLabel);
    }
    if (plan.valueColumn && metricLabel) {
        nextTitle = replaceWholeWord(nextTitle, plan.valueColumn, metricLabel);
    }
    return nextTitle;
};

export const resolveDisplayPlanDescription = (
    plan: DisplayPlanSource,
): string => {
    const description = sanitizeTechnicalDescriptionTerms(
        sanitizeTitleSystemTerms(plan.description ?? ''),
    );
    const metricLabel = resolvePlanMetricLabel(plan);
    const groupLabel = resolvePlanGroupLabel(plan);
    const columnLabel = getPlanHints(plan).columnLabel;

    if (
        plan.artifactMetadata?.artifactType === 'pivot_matrix'
        && metricLabel
        && columnLabel
        && isMeaningfulLabel(groupLabel, INTERNAL_GROUP_COLUMNS)
        && isMeaningfulLabel(columnLabel, INTERNAL_GROUP_COLUMNS)
    ) {
        return `Cross-tabulation of ${metricLabel} across ${groupLabel} (rows) and ${toDisplayLabel(columnLabel, 'Column')} (columns).`;
    }

    if (!description) return description;

    let nextDescription = description;

    if (plan.groupByColumn) {
        nextDescription = replaceWholeWord(nextDescription, plan.groupByColumn, groupLabel);
    }
    if (plan.valueColumn && metricLabel) {
        nextDescription = replaceWholeWord(nextDescription, plan.valueColumn, metricLabel);
    }

    return nextDescription;
};

export const resolveColumnDisplayLabel = (
    column: string,
    plans: DisplayPlanSource[] = [],
): string => {
    const normalized = normalizeKey(column);
    const fallback = getFallbackDisplayLabel(column, column);

    if (INTERNAL_GROUP_COLUMNS.has(normalized)) {
        const candidates = plans
            .filter(plan => normalizeKey(plan.groupByColumn) === normalized)
            .map(resolvePlanGroupLabel)
            .filter(label => isMeaningfulLabel(label, INTERNAL_GROUP_COLUMNS) && !isHelperLikeGroupHint(column, label));
        return pickMostCommonLabel(candidates) ?? fallback;
    }

    if (INTERNAL_METRIC_COLUMNS.has(normalized)) {
        const candidates = plans
            .filter(plan => normalizeKey(plan.valueColumn) === normalized)
            .map(resolvePlanMetricLabel)
            .filter((label): label is string => Boolean(label) && isMeaningfulLabel(label, INTERNAL_METRIC_COLUMNS));
        return pickMostCommonLabel(candidates) ?? fallback;
    }

    return fallback;
};

export const buildColumnDisplayLabels = (
    columns: string[],
    plans: DisplayPlanSource[] = [],
    inferredLabels: Record<string, string> = {},
): Record<string, string> =>
    Object.fromEntries(columns.map(column => [
        column,
        // AI-inferred labels (from harness Phase 4) take priority for unnamed columns
        inferredLabels[column] ?? resolveColumnDisplayLabel(column, plans),
    ]));

export const formatColumnDisplayHints = (
    columns: Array<{ name: string }>,
    plans: DisplayPlanSource[] = [],
): string =>
    columns
        .map(column => {
            const displayLabel = resolveColumnDisplayLabel(column.name, plans);
            return displayLabel !== column.name
                ? `- ${column.name} -> ${displayLabel}`
                : `- ${column.name}`;
        })
        .join('\n');
