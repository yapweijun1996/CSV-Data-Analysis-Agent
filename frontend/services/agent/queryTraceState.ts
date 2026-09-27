import type { ActiveDataQuery, QueryTraceEntry, QueryTraceOrigin, ToolCategory, WorkspaceDataQueryRequest, WorkspaceQueryTemplateId } from '../../types';
import { MAX_QUERY_HISTORY } from '../../utils/storeLimits';
import { createId } from '../../utils/createId';
import { buildSurfaceTraceContract } from './runtime/runtimeControlPlaneContract';

interface CreateQueryTraceEntryOptions {
    origin?: QueryTraceOrigin;
    templateId?: WorkspaceQueryTemplateId;
    formSnapshot?: WorkspaceDataQueryRequest;
    toolCategory?: ToolCategory | 'unknown';
    policyDecision?: 'allowed' | 'blocked';
    policyReason?: string | null;
    sessionId?: string;
    runId?: string;
    turnId?: string;
    stepId?: string;
    toolCallId?: string;
}

export const createQueryTraceEntry = (
    query: ActiveDataQuery,
    phase: QueryTraceEntry['phase'],
    options: string | CreateQueryTraceEntryOptions | null = null,
): QueryTraceEntry => {
    const normalizedOptions: CreateQueryTraceEntryOptions = typeof options === 'string'
        ? { policyReason: options }
        : (options ?? {});

    return {
        origin: normalizedOptions.origin ?? 'analysis',
        ...(normalizedOptions.templateId ? { templateId: normalizedOptions.templateId } : {}),
        ...(normalizedOptions.formSnapshot ? { formSnapshot: normalizedOptions.formSnapshot } : {}),
        toolCategory: normalizedOptions.toolCategory ?? 'data',
        policyDecision: normalizedOptions.policyDecision ?? 'allowed',
        policyReason: normalizedOptions.policyReason ?? null,
        id: createId('query-trace'),
        sessionId: normalizedOptions.sessionId ?? query.sessionId,
        runId: normalizedOptions.runId ?? query.runId,
        turnId: normalizedOptions.turnId ?? query.turnId,
        stepId: normalizedOptions.stepId ?? query.stepId,
        toolCallId: normalizedOptions.toolCallId ?? query.toolCallId,
        phase,
        explanation: query.explanation,
        plan: query.plan,
        engine: query.engine,
        sqlPreview: query.sqlPreview,
        tableName: query.tableName,
        loadVersion: query.loadVersion,
        tableId: query.tableId ?? null,
        datasetVersion: query.datasetVersion ?? null,
        relationshipSetId: query.relationshipSetId ?? null,
        fallbackReason: query.fallbackReason ?? null,
        fallbackStage: query.fallbackStage ?? null,
        appliedAt: query.appliedAt,
        result: {
            totalMatchedRows: query.result.totalMatchedRows,
            returnedRows: query.result.returnedRows,
            truncated: query.result.truncated,
            selectedColumns: [...query.result.selectedColumns],
            appliedOrderBy: [...query.result.appliedOrderBy],
            appliedLimit: query.result.appliedLimit,
            durationMs: query.result.durationMs,
            previewRows: query.result.rows.slice(0, 20),
        },
        traceContract: buildSurfaceTraceContract({
            detail: {
                phase,
                engine: query.engine,
                fallbackStage: query.fallbackStage ?? null,
                selectedColumns: query.result.selectedColumns,
                returnedRows: query.result.returnedRows,
                totalMatchedRows: query.result.totalMatchedRows,
            },
            reasonCode: query.fallbackReason ? 'query_fallback_recorded' : 'query_trace_recorded',
            source: 'query_trace',
        }),
    };
};

export const appendQueryHistory = (
    history: QueryTraceEntry[],
    entry: QueryTraceEntry,
): QueryTraceEntry[] => [...history, entry].slice(-MAX_QUERY_HISTORY);
