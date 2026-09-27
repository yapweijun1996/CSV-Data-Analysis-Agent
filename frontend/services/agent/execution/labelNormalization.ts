import type {
    ColumnProfile,
    CsvData,
    CsvRow,
    DataOperation,
    LabelNormalizationAppliedCluster,
    LabelNormalizationDeferredSuggestion,
    LabelNormalizationMetadata,
} from '../../../types';

const MAX_ELIGIBLE_DISTINCT_VALUES = 300;
const MIN_ELIGIBLE_DISTINCT_VALUES = 2;
const MAX_AVERAGE_LABEL_LENGTH = 80;
const MAX_DEFERRED_SUGGESTIONS = 50;
const DASH_PATTERN = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
const SINGLE_QUOTE_PATTERN = /[\u2018\u2019\u201B\u2032\u0060\u00B4]/g;
const DOUBLE_QUOTE_PATTERN = /[\u201C\u201D\u201F\u2033]/g;
const INTERNAL_WHITESPACE_PATTERN = /\s+/g;
const SPACELESS_SEPARATOR_PATTERN = /\s*([/@&+\-_])\s*/g;
const TRAILING_PUNCTUATION_PATTERN = /[.,;:!?]+$/g;
const LOOSE_KEY_PATTERN = /[^a-z0-9]+/g;
const OPERATION_PREFIX = 'normalize-label-aliases';

type VariantStat = {
    originalValue: string;
    trimmedValue: string;
    count: number;
    canonicalKey: string;
    looseKey: string;
};

export interface PreparedLabelNormalizationResult {
    data: CsvData;
    operations: DataOperation[];
    metadata: LabelNormalizationMetadata | null;
}

const slugify = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'column';

const normalizeFormatOnly = (value: string) =>
    value
        .replace(DASH_PATTERN, '-')
        .replace(SINGLE_QUOTE_PATTERN, '\'')
        .replace(DOUBLE_QUOTE_PATTERN, '"')
        .trim()
        .replace(INTERNAL_WHITESPACE_PATTERN, ' ')
        .replace(SPACELESS_SEPARATOR_PATTERN, '$1')
        .replace(TRAILING_PUNCTUATION_PATTERN, '')
        .trim();

const toCanonicalKey = (value: string) => normalizeFormatOnly(value).toLowerCase();
const toLooseKey = (value: string) => normalizeFormatOnly(value).toLowerCase().replace(LOOSE_KEY_PATTERN, '');

const getStringValues = (rows: CsvRow[], column: string) =>
    rows
        .map(row => row[column])
        .filter((value): value is string => typeof value === 'string')
        .map(value => ({
            originalValue: value,
            trimmedValue: value.trim(),
        }))
        .filter(entry => entry.trimmedValue.length > 0);

const buildVariantStats = (rows: CsvRow[], column: string) => {
    const stats = new Map<string, VariantStat>();
    getStringValues(rows, column).forEach(entry => {
        const existing = stats.get(entry.originalValue);
        if (existing) {
            existing.count += 1;
            return;
        }

        stats.set(entry.originalValue, {
            originalValue: entry.originalValue,
            trimmedValue: entry.trimmedValue,
            count: 1,
            canonicalKey: toCanonicalKey(entry.originalValue),
            looseKey: toLooseKey(entry.originalValue),
        });
    });
    return [...stats.values()];
};

const pickCanonicalValue = (variants: VariantStat[]) =>
    [...variants]
        .sort((left, right) => {
            if (right.count !== left.count) {
                return right.count - left.count;
            }
            if (right.trimmedValue.length !== left.trimmedValue.length) {
                return right.trimmedValue.length - left.trimmedValue.length;
            }
            return 0;
        })[0]?.trimmedValue ?? variants[0]?.trimmedValue ?? '';

const isEligibleColumn = (profile: ColumnProfile, rows: CsvRow[]) => {
    if (profile.type !== 'categorical') {
        return false;
    }

    const values = getStringValues(rows, profile.name);
    if (values.length === 0) {
        return false;
    }

    const distinctCount = new Set(values.map(entry => entry.trimmedValue)).size;
    if (distinctCount < MIN_ELIGIBLE_DISTINCT_VALUES || distinctCount > MAX_ELIGIBLE_DISTINCT_VALUES) {
        return false;
    }

    const averageLength = values.reduce((sum, entry) => sum + entry.trimmedValue.length, 0) / values.length;
    return averageLength <= MAX_AVERAGE_LABEL_LENGTH;
};

const buildDeferredSuggestions = (
    column: string,
    variants: VariantStat[],
    autoAppliedKeys: Set<string>,
): LabelNormalizationDeferredSuggestion[] => {
    const groups = new Map<string, VariantStat[]>();

    variants.forEach(variant => {
        if (variant.looseKey.length < 4 || autoAppliedKeys.has(variant.canonicalKey)) {
            return;
        }
        const bucket = groups.get(variant.looseKey) ?? [];
        bucket.push(variant);
        groups.set(variant.looseKey, bucket);
    });

    return [...groups.values()]
        .filter(bucket => bucket.length > 1)
        .filter(bucket => new Set(bucket.map(variant => variant.canonicalKey)).size > 1)
        .slice(0, MAX_DEFERRED_SUGGESTIONS)
        .map(bucket => ({
            column,
            suggestedCanonicalValue: pickCanonicalValue(bucket),
            candidateValues: bucket.map(variant => variant.trimmedValue),
            reason: 'Similar after removing punctuation and spacing, but not safe enough for automatic merge.',
        }));
};

const applyCluster = (
    rows: CsvRow[],
    column: string,
    canonicalValue: string,
    variants: VariantStat[],
): {
    rows: CsvRow[];
    replacements: Array<{ from: string; to: string }>;
    appliedCluster: LabelNormalizationAppliedCluster | null;
} => {
    const replacements = variants
        .filter(variant => variant.originalValue !== canonicalValue)
        .map(variant => ({ from: variant.originalValue, to: canonicalValue }));

    if (replacements.length === 0) {
        return {
            rows,
            replacements: [],
            appliedCluster: null,
        };
    }

    const replacementLookup = new Map(replacements.map(entry => [entry.from, entry.to]));
    let rewrittenRowCount = 0;
    const nextRows = rows.map(row => {
        const current = row[column];
        if (typeof current !== 'string' || !replacementLookup.has(current)) {
            return row;
        }
        rewrittenRowCount += 1;
        return {
            ...row,
            [column]: replacementLookup.get(current) ?? current,
        };
    });

    return {
        rows: nextRows,
        replacements,
        appliedCluster: {
            column,
            canonicalValue,
            replacedValues: replacements.map(entry => entry.from),
            rowCount: rewrittenRowCount,
        },
    };
};

const buildSummary = (
    appliedClusters: LabelNormalizationAppliedCluster[],
    appliedColumns: string[],
    appliedReplacementCount: number,
    deferredSuggestions: LabelNormalizationDeferredSuggestion[],
) => {
    if (appliedClusters.length === 0 && deferredSuggestions.length === 0) {
        return '';
    }

    const appliedSummary = appliedClusters.length > 0
        ? `Auto-merged ${appliedClusters.length} alias group(s) across ${appliedColumns.length} column(s) using ${appliedReplacementCount} replacement rule(s).`
        : 'No high-confidence label alias groups were auto-merged.';
    const deferredSummary = deferredSuggestions.length > 0
        ? `Deferred ${deferredSuggestions.length} lower-confidence alias suggestion(s) for review.`
        : 'No lower-confidence alias suggestions were deferred.';
    return `${appliedSummary} ${deferredSummary}`.trim();
};

export const applyPreparedLabelNormalization = (
    data: CsvData,
    columnProfiles: ColumnProfile[],
): PreparedLabelNormalizationResult => {
    const eligibleColumns = columnProfiles.filter(profile => isEligibleColumn(profile, data.data));
    if (eligibleColumns.length === 0) {
        return { data, operations: [], metadata: null };
    }

    let nextRows = data.data.map(row => ({ ...row }));
    const operations: DataOperation[] = [];
    const appliedClusters: LabelNormalizationAppliedCluster[] = [];
    const deferredSuggestions: LabelNormalizationDeferredSuggestion[] = [];

    eligibleColumns.forEach((profile, profileIndex) => {
        const variants = buildVariantStats(nextRows, profile.name);
        const groups = new Map<string, VariantStat[]>();
        variants.forEach(variant => {
            const bucket = groups.get(variant.canonicalKey) ?? [];
            bucket.push(variant);
            groups.set(variant.canonicalKey, bucket);
        });

        const autoAppliedClusters = [...groups.entries()]
            .map(([canonicalKey, bucket]) => ({ canonicalKey, variants: bucket }))
            .filter(cluster => cluster.variants.length > 1);
        const autoAppliedKeys = new Set(autoAppliedClusters.map(cluster => cluster.canonicalKey));

        autoAppliedClusters.forEach((cluster, clusterIndex) => {
            const canonicalValue = pickCanonicalValue(cluster.variants);
            const applied = applyCluster(nextRows, profile.name, canonicalValue, cluster.variants);
            nextRows = applied.rows;
            if (applied.replacements.length === 0 || !applied.appliedCluster) {
                return;
            }

            appliedClusters.push(applied.appliedCluster);
            operations.push({
                id: `${OPERATION_PREFIX}-${slugify(profile.name)}-${profileIndex + 1}-${clusterIndex + 1}`,
                type: 'replace_values',
                reason: `Normalize high-confidence label aliases in "${profile.name}" to "${canonicalValue}".`,
                column: profile.name,
                caseSensitive: true,
                replacements: applied.replacements,
            });
        });

        buildDeferredSuggestions(profile.name, variants, autoAppliedKeys).forEach(suggestion => {
            if (deferredSuggestions.length < MAX_DEFERRED_SUGGESTIONS) {
                deferredSuggestions.push(suggestion);
            }
        });
    });

    if (operations.length === 0 && deferredSuggestions.length === 0) {
        return { data, operations: [], metadata: null };
    }

    const appliedColumns = [...new Set(appliedClusters.map(cluster => cluster.column))];
    const appliedReplacementCount = operations.reduce((sum, operation) =>
        sum + (operation.type === 'replace_values' ? operation.replacements.length : 0), 0);
    const metadata: LabelNormalizationMetadata = {
        appliedColumns,
        appliedReplacementCount,
        appliedClusters,
        deferredSuggestions,
        summary: buildSummary(appliedClusters, appliedColumns, appliedReplacementCount, deferredSuggestions),
    };

    return {
        data: {
            ...data,
            data: nextRows,
        },
        operations,
        metadata,
    };
};
