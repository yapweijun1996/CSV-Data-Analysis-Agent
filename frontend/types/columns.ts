import type { ColumnProfile } from './analysis';

export type ColumnRegistrySource =
    | 'parsed_header'
    | 'sparse_discovered'
    | 'synthetic'
    | 'renamed';

export type ColumnAnalysisRole =
    | 'business_dimension'
    | 'helper_dimension'
    | 'blocked_dimension'
    | 'business_metric'
    | 'structural_metadata'
    | 'unknown';

export type AggregationHint = 'additive' | 'non_additive' | 'dimension_only' | 'unrestricted';

export interface ColumnAllowedUsages {
    groupBy: boolean;
    filter: boolean;
    select: boolean;
    orderBy: boolean;
    aggregationHint: AggregationHint;
}

export interface ColumnRegistryEntry {
    columnId: string;
    physicalName: string;
    displayLabel: string;
    aliases: string[];
    source: ColumnRegistrySource;
    analysisRole: ColumnAnalysisRole;
    allowedUsages: ColumnAllowedUsages;
    isSynthetic: boolean;
    isExposedToAi: boolean;
    profile?: ColumnProfile;
}

export interface ColumnRegistry {
    datasetVersion: string | null;
    generatedAt: string;
    columns: ColumnRegistryEntry[];
}
