/**
 * Query planning, workspace query templates, and query execution result types.
 */

import type { CsvCellValue, CsvRow } from './intake';
import type { FilterPredicate, FilterPredicateGroup, FilterRowsOperation } from './operations';
import type { ToolCategory } from './ai';
import type { RuntimeEventContractDetail } from './runtime';

export interface QueryWhereClause {
    predicates?: FilterPredicate[];
    groups?: FilterPredicateGroup[];
}

export interface QueryOrderByClause {
    column: string;
    direction: 'asc' | 'desc';
}

export type QueryAggregateFunction = 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'percentile';

export interface QueryAggregateClause {
    function: QueryAggregateFunction;
    column?: string;
    as: string;
    percentile?: number;
    where?: QueryWhereClause;
}

export interface QueryPostAggregatePredicate {
    column: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'is_null' | 'not_null';
    value?: CsvCellValue | CsvCellValue[];
}

export interface QueryPostAggregateClause {
    predicates?: QueryPostAggregatePredicate[];
    groups?: Array<{
        predicates: QueryPostAggregatePredicate[];
    }>;
}

export interface QueryPlan {
    select?: string[];
    where?: QueryWhereClause;
    groupBy?: string[];
    aggregates?: QueryAggregateClause[];
    postAggregateFilter?: QueryPostAggregateClause;
    orderBy?: QueryOrderByClause[];
    limit?: number;
    /** Raw SQL passthrough — when present, bypasses structured compilation.
     *  The query must be read-only (SELECT only). `select` becomes output alias metadata. */
    rawSql?: string;
}

export type QueryTraceOrigin = 'analysis' | 'chat' | 'workspace';

export type WorkspaceQueryTemplateId =
    | 'preview_rows'
    | 'filter_lookup'
    | 'aggregate_breakdown'
    | 'duplicate_candidates'
    | 'null_blank_scan';

export type AnalysisEngine = 'duckdb' | 'arquero' | 'native';

export type DuckDbFallbackStage =
    | 'duckdb_disabled'
    | 'no_dataset'
    | 'bind_failed'
    | 'query_failed'
    | 'arquero_fallback';

export interface DuckDbSessionStatus {
    status: 'idle' | 'binding' | 'ready' | 'degraded' | 'error';
    engine: AnalysisEngine | null;
    tableName: string | null;
    loadVersion: string | null;
    fallbackReason: string | null;
    fallbackStage?: DuckDbFallbackStage | null;
    lastSyncedAt: Date | null;
}

export interface WorkspaceQueryPredicateDraft {
    column: string;
    operator: FilterPredicate['operator'];
    value?: string;
    secondaryValue?: string;
}

export interface WorkspaceQueryPredicateGroupDraft {
    predicates: WorkspaceQueryPredicateDraft[];
}

export interface WorkspacePreviewRowsQueryRequest {
    templateId: 'preview_rows';
    columns: string[];
    orderBy?: QueryOrderByClause | null;
    limit: number;
}

export interface WorkspaceFilterLookupQueryRequest {
    templateId: 'filter_lookup';
    columns: string[];
    predicates: WorkspaceQueryPredicateDraft[];
    groups?: WorkspaceQueryPredicateGroupDraft[];
    orderBy?: QueryOrderByClause | null;
    limit: number;
}

export interface WorkspaceAggregateBreakdownQueryRequest {
    templateId: 'aggregate_breakdown';
    groupBy: string[];
    aggregate: {
        function: QueryAggregateFunction;
        column?: string | null;
        as: string;
    };
    orderBy?: QueryOrderByClause | null;
    limit: number;
}

export interface WorkspaceDuplicateCandidatesQueryRequest {
    templateId: 'duplicate_candidates';
    keyColumns: string[];
    countAlias?: string;
    limit: number;
}

export interface WorkspaceNullBlankScanQueryRequest {
    templateId: 'null_blank_scan';
    column: string;
    resultMode: 'preview' | 'count';
    limit: number;
}

export type WorkspaceDataQueryRequest =
    | WorkspacePreviewRowsQueryRequest
    | WorkspaceFilterLookupQueryRequest
    | WorkspaceAggregateBreakdownQueryRequest
    | WorkspaceDuplicateCandidatesQueryRequest
    | WorkspaceNullBlankScanQueryRequest;

export interface DataQueryResult {
    rows: CsvRow[];
    totalMatchedRows: number;
    returnedRows: number;
    truncated: boolean;
    selectedColumns: string[];
    appliedOrderBy: QueryOrderByClause[];
    appliedLimit: number;
    durationMs: number;
}

export interface ActiveDataQuery {
    sessionId?: string;
    runId?: string;
    turnId?: string;
    stepId?: string;
    toolCallId?: string;
    explanation: string;
    plan: QueryPlan;
    result: DataQueryResult;
    appliedAt: Date;
    source: 'execute_data_query';
    engine: AnalysisEngine;
    sqlPreview: string | null;
    tableName: string | null;
    loadVersion: string | null;
    tableId?: string | null;
    datasetVersion?: string | null;
    relationshipSetId?: string | null;
    fallbackReason?: string | null;
    fallbackStage?: DuckDbFallbackStage | null;
    fallbackFilterOperation?: FilterRowsOperation | null;
}

export interface WorkspaceQueryRunOutcome {
    query: ActiveDataQuery;
    traceId: string;
    committedAt: Date;
}

export interface QueryTraceEntry {
    id: string;
    sessionId?: string;
    runId?: string;
    turnId?: string;
    stepId?: string;
    toolCallId?: string;
    phase: 'verify' | 'analysis';
    origin: QueryTraceOrigin;
    explanation: string;
    plan: QueryPlan;
    engine: AnalysisEngine;
    sqlPreview: string | null;
    tableName: string | null;
    loadVersion: string | null;
    tableId?: string | null;
    datasetVersion?: string | null;
    relationshipSetId?: string | null;
    fallbackReason?: string | null;
    fallbackStage?: DuckDbFallbackStage | null;
    appliedAt: Date;
    templateId?: WorkspaceQueryTemplateId;
    formSnapshot?: WorkspaceDataQueryRequest;
    toolCategory?: ToolCategory | 'unknown';
    policyDecision?: 'allowed' | 'blocked';
    policyReason?: string | null;
    result: {
        totalMatchedRows: number;
        returnedRows: number;
        truncated: boolean;
        selectedColumns: string[];
        appliedOrderBy: QueryOrderByClause[];
        appliedLimit: number;
        durationMs: number;
        previewRows: CsvRow[];
    };
    traceContract?: RuntimeEventContractDetail;
}

export interface SortConfig {
    key: string;
    direction: 'ascending' | 'descending';
}
