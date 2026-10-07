import type {
    AggregationHint,
    ColumnProfile,
    ColumnRegistry,
    ColumnRegistryEntry,
    CsvData,
    DatasetSemanticSnapshot,
    UserColumnAnnotation,
} from '../../types';
import { getCsvDatasetLoadVersion } from '../../utils/datasetId';
import { isStructuralMetadataColumn } from '../agent/structuralMetadata';

type ColumnRegistrySteering = {
    preferGroupBy?: string[];
    blockGroupBy?: string[];
    inferredColumnLabels?: Record<string, string>;
};

export interface BuildColumnRegistryOptions {
    data: CsvData | null | undefined;
    columnProfiles?: ColumnProfile[] | null | undefined;
    semanticSnapshot?: DatasetSemanticSnapshot | null | undefined;
    userColumnAnnotations?: Record<string, UserColumnAnnotation> | null | undefined;
    steering?: ColumnRegistrySteering | null | undefined;
    existingRegistry?: ColumnRegistry | null | undefined;
}

export interface EffectiveColumnRegistryState {
    csvData?: CsvData | null | undefined;
    canonicalCsvData?: CsvData | null | undefined;
    columnProfiles?: ColumnProfile[] | null | undefined;
    datasetSemanticSnapshot?: DatasetSemanticSnapshot | null | undefined;
    userColumnAnnotations?: Record<string, UserColumnAnnotation> | null | undefined;
    latestAnalysisSession?: {
        analysisSteering?: ColumnRegistrySteering | null | undefined;
    } | null | undefined;
    columnRegistry?: ColumnRegistry | null | undefined;
}

export interface BuildEffectiveColumnRegistryOptions {
    datasetOverride?: CsvData | null | undefined;
    columnProfilesOverride?: ColumnProfile[] | null | undefined;
    semanticSnapshotOverride?: DatasetSemanticSnapshot | null | undefined;
}

const DETAIL_ROW_COLUMN_EQUIVALENTS: Record<string, string> = {
    rowrole: 'RowClass',
    rowclass: 'RowRole',
};

/**
 * Conservative, industry-standard abbreviations that can be resolved without
 * guessing dataset-specific business meaning. Keep this list intentionally
 * narrow: an alias must identify exactly one physical column before it is used.
 */
const STANDARD_COLUMN_ALIASES: Record<string, string[]> = {
    ccy: ['currency', 'currency code'],
    uom: ['unit of measure'],
};

const normalizeColumnName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

const slugifyColumnName = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'column';

export const collectOrderedColumnNames = (
    rows: Array<Record<string, unknown>> | null | undefined,
    preferredOrder?: string[] | null | undefined,
): string[] => {
    const ordered: string[] = [];
    const seen = new Set<string>();

    const push = (column: string) => {
        if (typeof column !== 'string' || column.trim().length === 0) {
            return;
        }
        const normalized = normalizeColumnName(column);
        if (seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        ordered.push(column);
    };

    (preferredOrder ?? []).forEach(push);
    (rows ?? []).forEach(row => {
        Object.keys(row ?? {}).forEach(push);
    });

    return ordered;
};

const resolveColumnProfile = (
    column: string,
    profiles: ColumnProfile[] | null | undefined,
): ColumnProfile | undefined => {
    const normalized = normalizeColumnName(column);
    return (profiles ?? []).find(profile => normalizeColumnName(profile.name) === normalized);
};

const resolveExistingEntry = (
    column: string,
    existingRegistry: ColumnRegistry | null | undefined,
): ColumnRegistryEntry | undefined => {
    const normalized = normalizeColumnName(column);
    return existingRegistry?.columns.find(entry => normalizeColumnName(entry.physicalName) === normalized);
};

const dedupeAliases = (aliases: Array<string | null | undefined>): string[] => {
    const ordered: string[] = [];
    const seen = new Set<string>();

    aliases.forEach(alias => {
        if (typeof alias !== 'string' || alias.trim().length === 0) {
            return;
        }
        const normalized = normalizeColumnName(alias);
        if (seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        ordered.push(alias);
    });

    return ordered;
};

export const getKnownColumnAliases = (physicalName: string): string[] => {
    const normalized = normalizeColumnName(physicalName);
    const equivalent = DETAIL_ROW_COLUMN_EQUIVALENTS[normalized];
    return [
        ...(equivalent ? [equivalent] : []),
        ...(STANDARD_COLUMN_ALIASES[normalized] ?? []),
    ];
};

const resolveDisplayLabel = (
    physicalName: string,
    semanticSnapshot: DatasetSemanticSnapshot | null | undefined,
    userColumnAnnotations: Record<string, UserColumnAnnotation> | null | undefined,
    steering: ColumnRegistrySteering | null | undefined,
    existingEntry: ColumnRegistryEntry | undefined,
): string => {
    const userAnnotation = Object.values(userColumnAnnotations ?? {}).find(annotation =>
        normalizeColumnName(annotation.columnName) === normalizeColumnName(physicalName),
    );
    if (userAnnotation?.businessLabel?.trim()) {
        return userAnnotation.businessLabel.trim();
    }

    const inferredLabel = Object.entries(steering?.inferredColumnLabels ?? {}).find(([column]) =>
        normalizeColumnName(column) === normalizeColumnName(physicalName),
    )?.[1];
    if (typeof inferredLabel === 'string' && inferredLabel.trim().length > 0) {
        return inferredLabel.trim();
    }

    const semanticLabel = (semanticSnapshot?.columnAnnotations ?? []).find(annotation =>
        normalizeColumnName(annotation.columnName) === normalizeColumnName(physicalName),
    )?.businessLabel;
    if (typeof semanticLabel === 'string' && semanticLabel.trim().length > 0) {
        return semanticLabel.trim();
    }

    if (existingEntry?.displayLabel?.trim()) {
        return existingEntry.displayLabel.trim();
    }

    return physicalName;
};

const resolveAnalysisRole = (
    physicalName: string,
    profile: ColumnProfile | undefined,
    semanticSnapshot: DatasetSemanticSnapshot | null | undefined,
    userColumnAnnotations: Record<string, UserColumnAnnotation> | null | undefined,
    steering: ColumnRegistrySteering | null | undefined,
): ColumnRegistryEntry['analysisRole'] => {
    const normalized = normalizeColumnName(physicalName);
    const blocked = new Set((steering?.blockGroupBy ?? []).map(normalizeColumnName));
    const preferred = new Set((steering?.preferGroupBy ?? []).map(normalizeColumnName));
    const semanticAnnotation = (semanticSnapshot?.columnAnnotations ?? []).find(annotation =>
        normalizeColumnName(annotation.columnName) === normalized,
    );
    const userRole = Object.values(userColumnAnnotations ?? {}).find(annotation =>
        normalizeColumnName(annotation.columnName) === normalized,
    )?.businessRole;

    if (isStructuralMetadataColumn(physicalName)) {
        return 'structural_metadata';
    }
    if (userRole === 'metric') return 'business_metric';
    if (userRole === 'dimension') return 'business_dimension';
    if (userRole === 'identifier') return 'blocked_dimension';
    if (userRole === 'helper') return 'helper_dimension';
    if (blocked.has(normalized)) {
        return 'blocked_dimension';
    }
    if (
        preferred.has(normalized)
        || semanticAnnotation?.semanticRole === 'business_dimension'
        || semanticAnnotation?.semanticRole === 'time_dimension'
        || semanticAnnotation?.semanticRole === 'business_entity'
        || semanticAnnotation?.semanticRole === 'entity'
        || semanticAnnotation?.semanticRole === 'date'
        || semanticAnnotation?.semanticRole === 'label'
    ) {
        return 'business_dimension';
    }
    if (
        semanticAnnotation?.semanticRole === 'helper_dimension'
        || semanticAnnotation?.semanticRole === 'descriptor'
        || semanticAnnotation?.semanticRole === 'code'
        || semanticAnnotation?.semanticRole === 'note'
    ) {
        return 'helper_dimension';
    }
    if (semanticAnnotation?.semanticRole === 'metric') {
        return 'business_metric';
    }
    if (['numerical', 'currency', 'percentage'].includes(profile?.type ?? '')) {
        return 'business_metric';
    }
    if (['categorical', 'date', 'time'].includes(profile?.type ?? '')) {
        return 'business_dimension';
    }
    return 'unknown';
};

/** Detect non-additive metrics by column name patterns.
 *
 * This is the deterministic safety floor for metrics whose row-level values
 * cannot be summed meaningfully. It covers:
 * - rates, ratios, percentages, averages, and per-unit values
 * - common rate/cost acronyms used across business datasets
 * - configuration/snapshot values such as a set-level budget
 *
 * Uses separator-aware matching because `_` is a word character in JS regex.
 * Broad budget names such as "Budget" or "Project Budget" remain additive;
 * only names that explicitly describe a configured/snapshot budget match.
 */
const NON_ADDITIVE_NAME_PATTERNS = [
    /%/,
    /(^|[\s_\-.])(avg|average|mean|rate|ratio|margin|yield|pct|percent|index|score)([\s_\-.]|$)/i,
    /(^|[\s_\-.])(roas|roi|ctr|cvr|cpc|cpm|cpa|cpv)([\s_\-.]|$)/i,
    /(^|[\s_\-.])per([\s_\-.]|$)/i,
    /(^|[\s_\-.])(unit|average)[\s_\-.]+price([\s_\-.]|$)/i,
    /(^|[\s_\-.])(opening|closing|ending|beginning|available|remaining|daily|weekly|monthly|annual|lifetime|allocated|approved|set)[\s_\-.]+(amount[\s_\-.]+)?(balance|budget|capacity|headcount|inventory|stock|quota|target)([\s_\-.]|$)/i,
];

export const isNonAdditiveMetricName = (physicalName: string): boolean =>
    NON_ADDITIVE_NAME_PATTERNS.some(pattern => pattern.test(physicalName));

/**
 * Whether a metric's values cannot be summed. Order of evidence: a percentage
 * column is never summable (a fact about the data); then Pi's judgement from
 * looking at the column (`profile.additivity`); only without either, the
 * column-name keywords above act as a prior.
 */
export const isNonAdditiveMetric = (physicalName: string, profile?: ColumnProfile | null): boolean => {
    if (profile?.type === 'percentage') return true;
    if (profile?.additivity) return profile.additivity.kind === 'non_additive';
    return isNonAdditiveMetricName(physicalName);
};

const resolveAggregationHint = (
    analysisRole: ColumnRegistryEntry['analysisRole'],
    profile?: ColumnProfile,
    physicalName?: string,
): AggregationHint => {
    if (analysisRole === 'business_dimension' || analysisRole === 'helper_dimension') {
        return 'dimension_only';
    }
    if (analysisRole === 'structural_metadata' || analysisRole === 'blocked_dimension') {
        return 'unrestricted';
    }
    if (physicalName ? isNonAdditiveMetric(physicalName, profile) : profile?.type === 'percentage') {
        return 'non_additive';
    }
    if (analysisRole === 'business_metric') {
        return 'additive';
    }
    return 'unrestricted';
};

const buildAllowedUsages = (
    physicalName: string,
    analysisRole: ColumnRegistryEntry['analysisRole'],
    profile?: ColumnProfile,
): ColumnRegistryEntry['allowedUsages'] => {
    const isSynthetic = isStructuralMetadataColumn(physicalName);
    return {
        groupBy: !isSynthetic && analysisRole !== 'business_metric' && analysisRole !== 'blocked_dimension',
        filter: true,
        select: true,
        orderBy: true,
        aggregationHint: resolveAggregationHint(analysisRole, profile, physicalName),
    };
};

export const buildColumnRegistry = ({
    data,
    columnProfiles,
    semanticSnapshot,
    userColumnAnnotations,
    steering,
    existingRegistry,
}: BuildColumnRegistryOptions): ColumnRegistry | null => {
    if (!data?.data) {
        return null;
    }

    const presentColumns = collectOrderedColumnNames(data.data);
    const presentColumnSet = new Set(presentColumns.map(normalizeColumnName));
    const preferredOrder = [
        ...(existingRegistry?.columns.map(entry => entry.physicalName) ?? []),
        ...(columnProfiles ?? []).map(profile => profile.name),
    ];
    const orderedColumns = collectOrderedColumnNames(data.data, preferredOrder)
        .filter(column => presentColumnSet.has(normalizeColumnName(column)));
    const parsedHeaderSet = new Set(collectOrderedColumnNames((data.data ?? []).slice(0, 1)).map(normalizeColumnName));
    const datasetVersion = getCsvDatasetLoadVersion(data);

    const columns = orderedColumns.map((physicalName, index) => {
        const existingEntry = resolveExistingEntry(physicalName, existingRegistry);
        const profile = resolveColumnProfile(physicalName, columnProfiles);
        const displayLabel = resolveDisplayLabel(
            physicalName,
            semanticSnapshot,
            userColumnAnnotations,
            steering,
            existingEntry,
        );
        const source: ColumnRegistryEntry['source'] = isStructuralMetadataColumn(physicalName)
            ? 'synthetic'
            : parsedHeaderSet.has(normalizeColumnName(physicalName))
                ? 'parsed_header'
                : 'sparse_discovered';
        const analysisRole = resolveAnalysisRole(
            physicalName,
            profile,
            semanticSnapshot,
            userColumnAnnotations,
            steering,
        );
        return {
            columnId: existingEntry?.columnId ?? `col_${slugifyColumnName(physicalName)}_${index + 1}`,
            physicalName,
            displayLabel,
            aliases: dedupeAliases([
                physicalName,
                displayLabel !== physicalName ? displayLabel : null,
                ...(existingEntry?.aliases ?? []),
                ...getKnownColumnAliases(physicalName),
            ]),
            source: existingEntry?.source === 'renamed' && normalizeColumnName(existingEntry.physicalName) === normalizeColumnName(physicalName)
                ? existingEntry.source
                : source,
            analysisRole,
            allowedUsages: buildAllowedUsages(physicalName, analysisRole, profile),
            isSynthetic: isStructuralMetadataColumn(physicalName),
            isExposedToAi: true,
            ...(profile ? { profile } : {}),
        } satisfies ColumnRegistryEntry;
    });

    return {
        datasetVersion,
        generatedAt: new Date().toISOString(),
        columns,
    };
};

export const resolveColumnReference = (
    input: string | null | undefined,
    registry: ColumnRegistry | null | undefined,
): string | null => {
    if (typeof input !== 'string' || input.trim().length === 0 || !registry) {
        return null;
    }
    const normalized = normalizeColumnName(input);
    const exactPhysicalMatch = registry.columns.find(entry => normalizeColumnName(entry.physicalName) === normalized);
    if (exactPhysicalMatch) {
        return exactPhysicalMatch.physicalName;
    }

    const aliasMatches = registry.columns.filter(entry =>
        entry.aliases.some(alias => normalizeColumnName(alias) === normalized),
    );
    if (aliasMatches.length === 1) {
        return aliasMatches[0].physicalName;
    }
    return null;
};

export const buildEffectiveColumnRegistryFromState = (
    state: EffectiveColumnRegistryState,
    options: BuildEffectiveColumnRegistryOptions = {},
): ColumnRegistry | null =>
    buildColumnRegistry({
        data: options.datasetOverride ?? state.canonicalCsvData ?? state.csvData,
        columnProfiles: options.columnProfilesOverride ?? state.columnProfiles,
        semanticSnapshot: options.semanticSnapshotOverride !== undefined
            ? options.semanticSnapshotOverride
            : state.datasetSemanticSnapshot,
        userColumnAnnotations: state.userColumnAnnotations,
        steering: state.latestAnalysisSession?.analysisSteering,
        existingRegistry: state.columnRegistry,
    });

export const getAllowedColumns = (
    registry: ColumnRegistry | null | undefined,
    usage: keyof ColumnRegistryEntry['allowedUsages'] = 'select',
): string[] => {
    if (!registry) {
        return [];
    }
    return registry.columns
        .filter(entry => entry.allowedUsages[usage])
        .map(entry => entry.physicalName);
};

export const getDisplayColumns = (
    registry: ColumnRegistry | null | undefined,
): Array<{ physicalName: string; displayLabel: string }> => {
    if (!registry) {
        return [];
    }
    return registry.columns.map(entry => ({
        physicalName: entry.physicalName,
        displayLabel: entry.displayLabel,
    }));
};

export const buildDisplayLabelMap = (
    registry: ColumnRegistry | null | undefined,
): Record<string, string> =>
    Object.fromEntries(
        getDisplayColumns(registry).map(entry => [entry.physicalName, entry.displayLabel]),
    );

export const ensureColumnRegistry = (
    currentRegistry: ColumnRegistry | null | undefined,
    options: BuildColumnRegistryOptions,
): ColumnRegistry | null => {
    const rebuilt = buildColumnRegistry({
        ...options,
        existingRegistry: currentRegistry ?? options.existingRegistry,
    });
    if (!rebuilt) {
        return currentRegistry ?? null;
    }
    return rebuilt;
};
