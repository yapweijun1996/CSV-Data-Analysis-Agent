// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    compileWorkspaceDataQuery,
    createDefaultWorkspaceQueryDrafts,
} from '../services/agent/execution/workspaceDataQuery';
import { buildSemanticDatasetVersion } from '../services/agent/datasetSemantics';
import { createDataSlice } from '../store/slices/dataSlice';
import { buildDatasetId } from '../utils/datasetId';

const {
    executeStructuredDataQueryMock,
    primeDuckDbDatasetMock,
} = vi.hoisted(() => ({
    executeStructuredDataQueryMock: vi.fn(),
    primeDuckDbDatasetMock: vi.fn(),
}));

vi.mock('../services/agent/execution/dataQueryExecution', () => ({
    executeStructuredDataQuery: executeStructuredDataQueryMock,
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    primeDuckDbDataset: primeDuckDbDatasetMock,
}));

const allowedColumns = ['Code', 'Project_ID', 'Amount', 'Region'];
const columnCapabilities = {
    selectableColumns: allowedColumns,
    groupableColumns: ['Code', 'Project_ID', 'Region'],
};
const baseCsvData = {
    fileName: 'report.csv',
    data: [{ Code: '501001', Project_ID: 10009, Amount: 10, Region: 'East' }],
};
const baseDatasetVersion = buildDatasetId(baseCsvData.fileName, baseCsvData.data);

const createSliceHarness = (overrides: Record<string, unknown> = {}) => {
    let state: Record<string, any> = {
        csvData: baseCsvData,
        columnProfiles: allowedColumns.map(name => ({ name })),
        duckDbSessionStatus: {
            status: 'ready',
            engine: 'duckdb',
            tableName: 'session_clean_dataset',
            loadVersion: baseDatasetVersion,
            fallbackReason: null,
            lastSyncedAt: new Date('2026-03-10T00:00:00.000Z'),
        },
        datasetSemanticSnapshot: null,
        semanticDatasetVersion: null,
        logAgentToolUsage: vi.fn(),
        addProgress: vi.fn(),
        ...overrides,
    };

    const setState = (update: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>)) => {
        const partial = typeof update === 'function' ? update(state) : update;
        state = { ...state, ...partial };
    };
    const getState = () => state;
    const slice = createDataSlice(setState as never, getState as never, {} as never);
    state = { ...state, ...slice };

    return {
        getState,
        setState,
    };
};

describe('workspace data query compiler', () => {
    it('compiles all analyst workspace templates into bounded query plans', () => {
        expect(compileWorkspaceDataQuery({
            templateId: 'preview_rows',
            columns: ['Code', 'Amount'],
            orderBy: { column: 'Code', direction: 'asc' },
            limit: 25,
        }, columnCapabilities).plan).toMatchObject({
            select: ['Code', 'Amount'],
            orderBy: [{ column: 'Code', direction: 'asc' }],
            limit: 25,
        });

        expect(compileWorkspaceDataQuery({
            templateId: 'filter_lookup',
            columns: ['Code', 'Amount'],
            predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
            groups: [{ predicates: [{ column: 'Region', operator: 'eq', value: 'East' }] }],
            orderBy: { column: 'Code', direction: 'asc' },
            limit: 25,
        }, columnCapabilities).plan).toMatchObject({
            select: ['Code', 'Amount'],
            where: {
                predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
                groups: [{ predicates: [{ column: 'Region', operator: 'eq', value: 'East' }] }],
            },
            orderBy: [{ column: 'Code', direction: 'asc' }],
            limit: 25,
        });

        expect(compileWorkspaceDataQuery({
            templateId: 'aggregate_breakdown',
            groupBy: ['Region'],
            aggregate: { function: 'sum', column: 'Amount', as: 'total_amount' },
            orderBy: { column: 'total_amount', direction: 'desc' },
            limit: 50,
        }, columnCapabilities).plan).toMatchObject({
            select: ['Region', 'total_amount'],
            groupBy: ['Region'],
            aggregates: [{ function: 'sum', column: 'Amount', as: 'total_amount' }],
            orderBy: [{ column: 'total_amount', direction: 'desc' }],
            limit: 50,
        });

        expect(compileWorkspaceDataQuery({
            templateId: 'duplicate_candidates',
            keyColumns: ['Code', 'Project_ID'],
            countAlias: 'duplicate_count',
            limit: 25,
        }, columnCapabilities).plan).toMatchObject({
            select: ['Code', 'Project_ID', 'duplicate_count'],
            groupBy: ['Code', 'Project_ID'],
            aggregates: [{ function: 'count', as: 'duplicate_count' }],
            orderBy: [{ column: 'duplicate_count', direction: 'desc' }],
            limit: 25,
        });

        expect(compileWorkspaceDataQuery({
            templateId: 'null_blank_scan',
            column: 'Region',
            resultMode: 'count',
            limit: 25,
        }, columnCapabilities).plan).toMatchObject({
            select: ['null_blank_count'],
            where: {
                predicates: [{ column: 'Region', operator: 'is_null' }],
            },
            aggregates: [{ function: 'count', as: 'null_blank_count' }],
            limit: 1,
        });
    });

    it('rejects query shapes that would violate bounded workspace rules', () => {
        expect(() => compileWorkspaceDataQuery({
            templateId: 'preview_rows',
            columns: ['Code'],
            orderBy: { column: 'Amount', direction: 'asc' },
            limit: 25,
        }, columnCapabilities)).toThrow(/must also appear in the result columns/i);

        expect(() => compileWorkspaceDataQuery({
            templateId: 'aggregate_breakdown',
            groupBy: [],
            aggregate: { function: 'count', column: null, as: 'row_count' },
            orderBy: { column: 'row_count', direction: 'desc' },
            limit: 25,
        }, columnCapabilities)).toThrow(/requires at least one group-by column/i);

        expect(() => compileWorkspaceDataQuery({
            templateId: 'aggregate_breakdown',
            groupBy: ['Region'],
            aggregate: { function: 'sum', column: null, as: 'total_amount' },
            orderBy: { column: 'total_amount', direction: 'desc' },
            limit: 25,
        }, columnCapabilities)).toThrow(/requires a source column for sum/i);
    });

    it('rejects blocked group-by dimensions for aggregate and duplicate templates', () => {
        const blockedCapabilities = {
            selectableColumns: allowedColumns,
            groupableColumns: ['Code', 'Region'],
        };

        expect(() => compileWorkspaceDataQuery({
            templateId: 'aggregate_breakdown',
            groupBy: ['Project_ID'],
            aggregate: { function: 'count', column: null, as: 'row_count' },
            orderBy: { column: 'row_count', direction: 'desc' },
            limit: 25,
        }, blockedCapabilities)).toThrow(/missing column: Project_ID/i);

        expect(() => compileWorkspaceDataQuery({
            templateId: 'duplicate_candidates',
            keyColumns: ['Code', 'Project_ID'],
            countAlias: 'duplicate_count',
            limit: 25,
        }, blockedCapabilities)).toThrow(/missing column: Project_ID/i);
    });

    it('builds default drafts from selectable and groupable capabilities separately', () => {
        const drafts = createDefaultWorkspaceQueryDrafts({
            selectableColumns: ['Code', 'BlockedOnly', 'Amount'],
            groupableColumns: ['Code'],
        });
        const previewDraft = drafts.preview_rows as Extract<typeof drafts.preview_rows, { templateId: 'preview_rows' }>;
        const aggregateDraft = drafts.aggregate_breakdown as Extract<typeof drafts.aggregate_breakdown, { templateId: 'aggregate_breakdown' }>;
        const duplicateDraft = drafts.duplicate_candidates as Extract<typeof drafts.duplicate_candidates, { templateId: 'duplicate_candidates' }>;
        const nullBlankDraft = drafts.null_blank_scan as Extract<typeof drafts.null_blank_scan, { templateId: 'null_blank_scan' }>;

        expect(previewDraft.columns).toEqual(['Code', 'BlockedOnly', 'Amount']);
        expect(aggregateDraft.groupBy).toEqual(['Code']);
        expect(duplicateDraft.keyColumns).toEqual(['Code']);
        expect(nullBlankDraft.column).toBe('');
    });

    it('leaves aggregate and duplicate drafts empty when no groupable columns are available', () => {
        const drafts = createDefaultWorkspaceQueryDrafts({
            selectableColumns: ['Amount'],
            groupableColumns: [],
        });
        const aggregateDraft = drafts.aggregate_breakdown as Extract<typeof drafts.aggregate_breakdown, { templateId: 'aggregate_breakdown' }>;
        const duplicateDraft = drafts.duplicate_candidates as Extract<typeof drafts.duplicate_candidates, { templateId: 'duplicate_candidates' }>;
        const nullBlankDraft = drafts.null_blank_scan as Extract<typeof drafts.null_blank_scan, { templateId: 'null_blank_scan' }>;

        expect(aggregateDraft.groupBy).toEqual([]);
        expect(duplicateDraft.keyColumns).toEqual([]);
        expect(nullBlankDraft.column).toBe('');
    });
});

describe('workspace data slice actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const query = {
            explanation: 'Preview rows',
            plan: { select: ['Code'], limit: 25 },
            result: {
                rows: [{ Code: '501001' }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Code'],
                appliedOrderBy: [],
                appliedLimit: 25,
                durationMs: 10,
            },
            appliedAt: new Date('2026-03-10T00:00:00.000Z'),
            source: 'execute_data_query',
            engine: 'duckdb',
            sqlPreview: 'select "Code" from dataset limit 25',
            tableName: 'session_clean_dataset',
            loadVersion: baseDatasetVersion,
            fallbackReason: null,
            fallbackFilterOperation: null,
        };
        executeStructuredDataQueryMock.mockImplementation(async (store, options) => {
            const trace = {
                id: 'workspace-trace-1',
                phase: 'analysis',
                origin: 'workspace',
                explanation: query.explanation,
                plan: query.plan,
                engine: query.engine,
                sqlPreview: query.sqlPreview,
                tableName: query.tableName,
                loadVersion: query.loadVersion,
                fallbackReason: null,
                appliedAt: query.appliedAt,
                templateId: options.templateId,
                formSnapshot: options.formSnapshot,
                result: {
                    ...query.result,
                    previewRows: query.result.rows,
                },
            };
            store.setState({
                activeDataQuery: query,
                queryHistory: [trace],
            });
            options.onTraceCommitted?.(trace);
            return query;
        });
        primeDuckDbDatasetMock.mockResolvedValue({
            engine: 'duckdb',
            tableName: 'session_clean_dataset',
            loadVersion: baseDatasetVersion,
            fallbackReason: null,
        });
    });

    it('runs workspace-origin queries through the deterministic read-only execution path', async () => {
        const harness = createSliceHarness();

        const outcome = await harness.getState().runWorkspaceDataQuery({
            templateId: 'preview_rows',
            columns: ['Code'],
            orderBy: { column: 'Code', direction: 'asc' },
            limit: 25,
        });

        expect(outcome).toMatchObject({
            query: expect.objectContaining({
                explanation: 'Preview rows',
                loadVersion: baseDatasetVersion,
            }),
            traceId: 'workspace-trace-1',
            committedAt: new Date('2026-03-10T00:00:00.000Z'),
        });
        expect(executeStructuredDataQueryMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                origin: 'workspace',
                phase: 'analysis',
                allowNativeFallback: false,
                templateId: 'preview_rows',
                formSnapshot: {
                    templateId: 'preview_rows',
                    columns: ['Code'],
                    orderBy: { column: 'Code', direction: 'asc' },
                    limit: 25,
                },
            }),
        );
    });

    it('surfaces and logs a workspace query whose result was not committed', async () => {
        executeStructuredDataQueryMock.mockImplementationOnce(async () => ({
            explanation: 'Preview rows',
            plan: { select: ['Code'], limit: 25 },
            result: {
                rows: [{ Code: '501001' }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Code'],
                appliedOrderBy: [],
                appliedLimit: 25,
                durationMs: 10,
            },
            appliedAt: new Date('2026-03-10T00:00:00.000Z'),
            source: 'execute_data_query',
            engine: 'duckdb',
            sqlPreview: 'select "Code" from dataset limit 25',
            tableName: 'session_clean_dataset',
            loadVersion: baseDatasetVersion,
        }));
        const logAgentToolUsage = vi.fn();
        const harness = createSliceHarness({ logAgentToolUsage });

        await expect(harness.getState().runWorkspaceDataQuery({
            templateId: 'preview_rows',
            columns: ['Code'],
            orderBy: null,
            limit: 25,
        })).rejects.toThrow(/query_result_not_committed/i);

        expect(logAgentToolUsage).toHaveBeenCalledWith(expect.objectContaining({
            detail: expect.objectContaining({ errorCode: 'query_result_not_committed' }),
        }));
    });

    it('rejects workspace aggregate breakdowns that use blocked group-by dimensions', async () => {
        const harness = createSliceHarness({
            latestAnalysisSession: {
                analysisSteering: {
                    blockGroupBy: ['Project_ID'],
                },
            },
        });

        await expect(harness.getState().runWorkspaceDataQuery({
            templateId: 'aggregate_breakdown',
            groupBy: ['Project_ID'],
            aggregate: { function: 'count', column: null, as: 'row_count' },
            orderBy: { column: 'row_count', direction: 'desc' },
            limit: 25,
        })).rejects.toThrow(/missing column: Project_ID/i);
    });

    it('blocks workspace-origin queries when the DuckDB session cannot be rebound to a ready state', async () => {
        primeDuckDbDatasetMock.mockResolvedValueOnce({
            engine: 'native',
            tableName: 'session_clean_dataset',
            loadVersion: baseDatasetVersion,
            fallbackReason: 'duckdb_disabled',
            fallbackStage: 'duckdb_disabled',
        });
        const harness = createSliceHarness({
            duckDbSessionStatus: {
                status: 'degraded',
                engine: 'native',
                tableName: 'session_clean_dataset',
                loadVersion: baseDatasetVersion,
                fallbackReason: 'duckdb_disabled',
                lastSyncedAt: new Date('2026-03-10T00:00:00.000Z'),
            },
        });

        await expect(harness.getState().runWorkspaceDataQuery({
            templateId: 'preview_rows',
            columns: ['Code'],
            orderBy: { column: 'Code', direction: 'asc' },
            limit: 25,
        })).rejects.toThrow(/DuckDB session is not ready/i);

        expect(executeStructuredDataQueryMock).not.toHaveBeenCalled();
    });

    it('refreshes the DuckDB session state from the latest binding result', async () => {
        const harness = createSliceHarness({
            duckDbSessionStatus: {
                status: 'idle',
                engine: null,
                tableName: null,
                loadVersion: null,
                fallbackReason: null,
                fallbackStage: null,
                lastSyncedAt: null,
            },
        });

        const nextStatus = await harness.getState().refreshDuckDbSession();

        expect(primeDuckDbDatasetMock).toHaveBeenCalledOnce();
        expect(nextStatus).toMatchObject({
            status: 'ready',
            engine: 'duckdb',
            tableName: 'session_clean_dataset',
            loadVersion: baseDatasetVersion,
        });
        expect(harness.getState().duckDbSessionStatus).toMatchObject({
            status: 'ready',
            engine: 'duckdb',
        });
    });

    it('skips rebinding when the current DuckDB session already matches the active dataset', async () => {
        const harness = createSliceHarness();

        const nextStatus = await harness.getState().refreshDuckDbSession();

        expect(nextStatus).toMatchObject({
            status: 'ready',
            engine: 'duckdb',
            tableName: 'session_clean_dataset',
            loadVersion: baseDatasetVersion,
        });
        expect(primeDuckDbDatasetMock).not.toHaveBeenCalled();
    });

    it('records a degraded session with an explicit bind-failed stage when refresh falls back to native', async () => {
        primeDuckDbDatasetMock.mockResolvedValueOnce({
            engine: 'native',
            tableName: 'session_clean_dataset',
            loadVersion: baseDatasetVersion,
            fallbackReason: 'worker asset fetch failed',
            fallbackStage: 'bind_failed',
        });
        const harness = createSliceHarness({
            duckDbSessionStatus: {
                status: 'idle',
                engine: null,
                tableName: null,
                loadVersion: null,
                fallbackReason: null,
                fallbackStage: null,
                lastSyncedAt: null,
            },
        });

        const nextStatus = await harness.getState().refreshDuckDbSession();

        expect(nextStatus).toMatchObject({
            status: 'degraded',
            engine: 'native',
            loadVersion: baseDatasetVersion,
            fallbackStage: 'bind_failed',
        });
        expect(harness.getState().duckDbSessionStatus).toMatchObject({
            status: 'degraded',
            engine: 'native',
            fallbackStage: 'bind_failed',
        });
    });

    it('rebinds workspace queries against the semantic analysis view when the active session is stale', async () => {
        const rawReportDataset = {
            fileName: 'report.csv',
            data: [
                { Code: 'TOTAL', Project_ID: 0, Amount: 10, Region: 'All' },
                { Code: '501001', Project_ID: 10009, Amount: 10, Region: 'East' },
            ],
        };
        const semanticDataset = {
            fileName: 'report.csv',
            data: [{ Code: '501001', Project_ID: 10009, Amount: 10, Region: 'East' }],
        };
        const semanticDatasetVersion = buildSemanticDatasetVersion(semanticDataset as never);
        const semanticLoadVersion = buildDatasetId(semanticDataset.fileName, semanticDataset.data);
        const rawDatasetVersion = buildSemanticDatasetVersion(rawReportDataset as never);
        primeDuckDbDatasetMock.mockResolvedValueOnce({
            engine: 'duckdb',
            tableName: 'session_clean_dataset',
            loadVersion: semanticLoadVersion,
            fallbackReason: null,
        });
        const harness = createSliceHarness({
            csvData: rawReportDataset,
            datasetSemanticSnapshot: {
                datasetRole: 'mixed_report',
                rowAnnotations: [{ rowIndex: 0, rowRole: 'grand_total', confidence: 0.95, reason: 'Aggregate row.' }],
                columnAnnotations: [],
                recommendedAnalysisView: {
                    mode: 'soft_exclude',
                    includedRowIndices: [1],
                    excludedRowIndices: [0],
                    includedRowCount: 1,
                    excludedRowCount: 1,
                    reason: 'Hide totals.',
                },
                summary: 'Hide total row.',
                generatedAt: '2026-03-15T00:00:00.000Z',
                modelId: 'gemini-test',
                sourceDatasetVersion: rawDatasetVersion,
            },
            semanticDatasetVersion: rawDatasetVersion,
            duckDbSessionStatus: {
                status: 'idle',
                engine: null,
                tableName: null,
                loadVersion: null,
                fallbackReason: null,
                fallbackStage: null,
                lastSyncedAt: null,
            },
        });

        await harness.getState().runWorkspaceDataQuery({
            templateId: 'preview_rows',
            columns: ['Code'],
            orderBy: { column: 'Code', direction: 'asc' },
            limit: 25,
        });

        expect(primeDuckDbDatasetMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: [{ Code: '501001', Project_ID: 10009, Amount: 10, Region: 'East' }],
            }),
            undefined,
            expect.anything(),
            undefined,
            expect.anything(),
        );
        expect(executeStructuredDataQueryMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                datasetOverride: expect.objectContaining({
                    data: [{ Code: '501001', Project_ID: 10009, Amount: 10, Region: 'East' }],
                }),
            }),
        );
    });

    it('re-resolves and rebinds when the preferred dataset changes during session refresh', async () => {
        const nextDataset = {
            fileName: 'report.csv',
            data: [
                { Code: '501001', Project_ID: 10009, Amount: 10, Region: 'East' },
                { Code: '501002', Project_ID: 10010, Amount: 20, Region: 'West' },
            ],
        };
        const nextDatasetVersion = buildDatasetId(nextDataset.fileName, nextDataset.data);
        const harness = createSliceHarness({
            duckDbSessionStatus: {
                status: 'idle',
                engine: null,
                tableName: null,
                loadVersion: null,
                fallbackReason: null,
                fallbackStage: null,
                lastSyncedAt: null,
            },
        });
        primeDuckDbDatasetMock
            .mockImplementationOnce(async () => {
                harness.setState({ csvData: nextDataset });
                return {
                    engine: 'duckdb',
                    tableName: 'session_clean_dataset',
                    loadVersion: baseDatasetVersion,
                    fallbackReason: null,
                };
            })
            .mockResolvedValueOnce({
                engine: 'duckdb',
                tableName: 'session_clean_dataset',
                loadVersion: nextDatasetVersion,
                fallbackReason: null,
            });

        await harness.getState().runWorkspaceDataQuery({
            templateId: 'preview_rows',
            columns: ['Code'],
            orderBy: { column: 'Code', direction: 'asc' },
            limit: 25,
        });

        expect(primeDuckDbDatasetMock).toHaveBeenCalledTimes(2);
        expect(executeStructuredDataQueryMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                datasetOverride: nextDataset,
            }),
        );
    });
});
