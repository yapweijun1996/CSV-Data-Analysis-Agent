import type { ActiveDataQuery, QueryTraceEntry, WorkspaceQueryRunOutcome } from '../../types';

export const ACTIVE_QUERY_ACTIVITY_ID = '__active_data_query__';

export interface DatabaseModalQueryActivity {
    id: string;
    source: 'active' | 'history';
    phase: QueryTraceEntry['phase'];
    origin: QueryTraceEntry['origin'];
    explanation: string;
    engine: QueryTraceEntry['engine'];
    sqlPreview: string | null;
    tableName: string | null;
    loadVersion: string | null;
    fallbackReason: string | null;
    appliedAt: Date;
    templateId?: QueryTraceEntry['templateId'];
    formSnapshot?: QueryTraceEntry['formSnapshot'];
    result: QueryTraceEntry['result'];
    traceContract?: QueryTraceEntry['traceContract'];
}

const toDate = (value: Date) => value instanceof Date ? value : new Date(value);

const getActivitySignature = (activity: Pick<DatabaseModalQueryActivity, 'appliedAt' | 'engine' | 'sqlPreview' | 'tableName' | 'loadVersion'>) => [
    toDate(activity.appliedAt).toISOString(),
    activity.engine,
    activity.sqlPreview ?? '',
    activity.tableName ?? '',
    activity.loadVersion ?? '',
].join('::');

const toActivityFromQueryTrace = (entry: QueryTraceEntry): DatabaseModalQueryActivity => ({
    id: entry.id,
    source: 'history',
    phase: entry.phase,
    origin: entry.origin,
    explanation: entry.explanation,
    engine: entry.engine,
    sqlPreview: entry.sqlPreview,
    tableName: entry.tableName,
    loadVersion: entry.loadVersion,
    fallbackReason: entry.fallbackReason ?? null,
    appliedAt: toDate(entry.appliedAt),
    templateId: entry.templateId,
    formSnapshot: entry.formSnapshot,
    result: entry.result,
    traceContract: entry.traceContract,
});

const toActivityFromActiveQuery = (
    query: ActiveDataQuery,
    matchingTrace?: QueryTraceEntry,
): DatabaseModalQueryActivity => ({
    id: matchingTrace?.id ?? ACTIVE_QUERY_ACTIVITY_ID,
    source: 'active',
    phase: matchingTrace?.phase ?? 'analysis',
    origin: matchingTrace?.origin ?? 'analysis',
    explanation: query.explanation,
    engine: query.engine,
    sqlPreview: query.sqlPreview,
    tableName: query.tableName,
    loadVersion: query.loadVersion,
    fallbackReason: query.fallbackReason ?? null,
    appliedAt: toDate(query.appliedAt),
    templateId: matchingTrace?.templateId,
    formSnapshot: matchingTrace?.formSnapshot,
    traceContract: matchingTrace?.traceContract,
    result: {
        totalMatchedRows: query.result.totalMatchedRows,
        returnedRows: query.result.returnedRows,
        truncated: query.result.truncated,
        selectedColumns: query.result.selectedColumns,
        appliedOrderBy: query.result.appliedOrderBy,
        appliedLimit: query.result.appliedLimit,
        durationMs: query.result.durationMs,
        previewRows: query.result.rows.slice(0, 20),
    },
});

export const buildDatabaseModalQueryActivityFromOutcome = (
    outcome: WorkspaceQueryRunOutcome,
): DatabaseModalQueryActivity => ({
    ...toActivityFromActiveQuery(outcome.query),
    id: outcome.traceId,
    origin: 'workspace',
    appliedAt: new Date(outcome.committedAt),
});

export const buildDatabaseModalQueryActivities = (
    activeDataQuery: ActiveDataQuery | null,
    queryHistory: QueryTraceEntry[],
): DatabaseModalQueryActivity[] => {
    const historyActivities = [...queryHistory]
        .reverse()
        .map(toActivityFromQueryTrace);

    if (!activeDataQuery) {
        return historyActivities;
    }

    const matchingTrace = queryHistory.find(entry =>
        getActivitySignature(toActivityFromQueryTrace(entry)) === getActivitySignature(toActivityFromActiveQuery(activeDataQuery)),
    );
    const activeActivity = toActivityFromActiveQuery(activeDataQuery, matchingTrace);
    const activeSignature = getActivitySignature(activeActivity);
    const dedupedHistory = historyActivities.filter(entry => getActivitySignature(entry) !== activeSignature);

    return [activeActivity, ...dedupedHistory];
};
