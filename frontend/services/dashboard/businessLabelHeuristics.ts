const GENERIC_QUALIFIER_PREFIXES = [
    'primary',
    'secondary',
    'tertiary',
    'fiscal',
    'financial',
    'report',
    'row',
    'distinct',
    'different',
    'grouped',
    'aggregate',
    'aggregated',
    'overall',
    'general',
];

const HELPER_SUFFIXES_BY_COLUMN: Record<string, string[]> = {
    serieskey: ['serieskey', 'seriesidentifier', 'seriesidentifiers', 'identifier', 'identifiers', 'key', 'keys', 'series'],
    serieslabell1: ['serieslabel', 'serieslabels', 'label', 'labels', 'category', 'categories'],
    serieslabell2: ['serieslabel', 'serieslabels', 'label', 'labels', 'category', 'categories'],
    serieslabell3: ['serieslabel', 'serieslabels', 'label', 'labels', 'category', 'categories'],
    rowclass: ['rowclass', 'classification', 'class'],
    sourcecolumnname: ['sourcecolumn', 'sourcecolumnname', 'reportcolumn', 'column'],
    sourcerowindex: ['sourcerow', 'sourcerowindex', 'rowindex'],
    hierarchydepth: ['hierarchydepth', 'depth'],
};

const normalizeKey = (value: string | undefined) => (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const stripGenericQualifierPrefixes = (value: string) => {
    let nextValue = value;
    let changed = true;

    while (changed) {
        changed = false;
        for (const prefix of GENERIC_QUALIFIER_PREFIXES) {
            if (nextValue.startsWith(prefix) && nextValue.length > prefix.length) {
                nextValue = nextValue.slice(prefix.length);
                changed = true;
                break;
            }
        }
    }

    return nextValue;
};

export const isHelperLikeGroupHint = (column: string | undefined, label: string | null): boolean => {
    const helperSuffixes = HELPER_SUFFIXES_BY_COLUMN[normalizeKey(column)];
    if (!helperSuffixes || !label) {
        return false;
    }

    const normalizedLabel = normalizeKey(label);
    const strippedLabel = stripGenericQualifierPrefixes(normalizedLabel);
    return helperSuffixes.some(suffix => strippedLabel === suffix);
};
