import type { AppStore } from '../../../store/useAppStore';
import {
    isAggregationType,
    type ActiveDataQuery,
    type AnalysisCardData,
    type AnalysisPlan,
    type ColumnProfile,
    type CsvData,
    type DataQueryResult,
    type EvidenceValueGateResult,
    type QueryPlan,
    type QueryTraceEntry,
    type SqlAnalysisPlan,
    type SqlEvidenceQueryPlan,
    type SqlEvidenceQueryResultSummary,
    type SqlPresentationPlan,
} from '../../../types';
import { executeManagedDataQuery } from '../../duckdb/queryEngine';
import { compileQueryPlanToDuckDbSql } from '../../duckdb/queryCompiler';
import { DEFAULT_DIMENSION_NORMALIZATION, buildColumnTypeGate } from '../../duckdb/dimensionNormalization';
import { duckDbWorkerClient } from '../../workers/duckDbWorkerClient';
import { createNewCard } from './cardCreator';
import { evaluateAggregationQuality } from './aggregationQuality';
import { appendQueryHistory, createQueryTraceEntry } from '../queryTraceState';
import { emitAgentEvent } from '../monitoring/agentMonitor';
import { agentMemoryCollector } from '../memory/agentMemoryCollector';
import { SqlAutoAnalysisError } from '../planning/planGenerator';
import { mergeEvidencePreFilterIntoQuery } from '../planning/evidenceQuerySemantics';
import { tryChronologicalSort } from '../../../utils/chronologicalSort';
import { isStructuralMetadataColumn } from '../structuralMetadata';
import { buildPivotToolQuerySignature, buildPivotToolSemanticSignature } from '../evidenceValueGate';
import type { ExistingAcceptedEvidence } from '../evidenceValueGate';
import { resolveDatasetScopeBinding } from '../../data/datasetBundle';
import { resolveDuckDbQueryTimeoutMs } from '../../duckdb/queryTimeout';

export const mapSqlAnalysisPlanToAnalysisPlan = (plan: SqlAnalysisPlan): AnalysisPlan => {
    const bindings = plan.bindings ?? {};
    // When bindings is missing or incomplete, infer from query structure
    const groupByColumn = bindings.groupByColumn ?? plan.query?.groupBy?.[0];
    const firstAggregate = plan.query?.aggregates?.[0];
    const valueColumn = bindings.valueColumn
        ?? (plan.aggregation === 'count' ? undefined : firstAggregate?.as ?? firstAggregate?.column);
    // Infer valueColumns from query.aggregates aliases when bindings.valueColumns is absent
    const valueColumns = bindings.valueColumns
        ?? (plan.query?.aggregates?.length >= 2
            ? plan.query.aggregates.map((agg: { as?: string; column?: string }) => agg.as ?? agg.column).filter(Boolean) as string[]
            : undefined);

    const base: AnalysisPlan = {
        chartType: plan.chartType,
        title: plan.title,
        description: plan.description,
        aggregation: plan.aggregation ?? firstAggregate?.function,
        groupByColumn,
        valueColumn: plan.aggregation === 'count' && valueColumn === 'count' ? undefined : valueColumn,
        valueColumns,
        xValueColumn: bindings.xValueColumn,
        yValueColumn: bindings.yValueColumn,
        secondaryValueColumn: bindings.secondaryValueColumn,
        secondaryAggregation: plan.secondaryAggregation,
        defaultTopN: plan.defaultTopN,
        defaultHideOthers: plan.defaultHideOthers,
        preFilter: plan.preFilter,
    };

    // When AI specifies valueColumns (multi-series), map to matrixValueColumns
    // so the chart rendering pipeline picks them up automatically.
    if (base.valueColumns && base.valueColumns.length >= 2) {
        base.artifactMetadata = {
            ...base.artifactMetadata,
            matrixValueColumns: base.valueColumns,
        };
    }

    return base;
};
import { createWorkerDiagnosticsTelemetryReporter } from '../../workers/workerDiagnostics';
import { resolveDatasetBindingTarget } from '../datasetBinding';
import { evaluateAutoAnalysisCards } from '../autoAnalysisEvaluation';
import { buildAnalysisPlanFromPresentation } from '../planning/sqlPresentationPlanner';
import { executePivotMatrixAnalysis } from './analysisSkillExecutor';
import { getPreferredAnalysisDataset } from '../reportStructureState';
import { buildAnalysisArtifactProvenance } from '../artifactProvenance';

type StoreApi = {
    getState: () => AppStore;
    setState: (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;
};

interface DuckDbAnalysisBinding {
    tableName: string;
    loadVersion: string;
}

const LOG_PREFIX = '[SqlCardExecutor]';
const SOFT_FAILURE_CODES = new Set(['empty_result']);

const appendQueryTrace = (store: StoreApi, trace: QueryTraceEntry) => {
    store.setState(prev => ({
        queryHistory: appendQueryHistory(prev.queryHistory ?? [], trace),
    }));
};

interface SqlEvidenceQueryExecution {
    result: DataQueryResult;
    execution: Awaited<ReturnType<typeof executeManagedDataQuery>>;
    activeDataQuery: ActiveDataQuery;
    queryTrace: QueryTraceEntry;
    binding: DuckDbAnalysisBinding | null;
    allowedColumns: string[];
}

export interface SqlPresentationExecutionResult {
    card: AnalysisCardData | null;
    presentationPlan: SqlPresentationPlan;
    evidenceSummary: SqlEvidenceQueryResultSummary;
    activeDataQuery: ActiveDataQuery;
}

const buildEvidenceCompatibleSqlPlan = (
    evidencePlan: SqlEvidenceQueryPlan,
    presentationPlan: SqlPresentationPlan,
): SqlAnalysisPlan | null => {
    if (!presentationPlan.chartType || !presentationPlan.bindings) {
        return null;
    }
    const primaryAggregate = evidencePlan.query.aggregates?.[0]?.function;
    const secondaryAggregate = evidencePlan.query.aggregates?.[1]?.function;
    return {
        chartType: presentationPlan.chartType,
        title: presentationPlan.title,
        description: presentationPlan.description,
        queryMode: evidencePlan.queryMode,
        query: evidencePlan.query,
        bindings: presentationPlan.bindings,
        aggregation: isAggregationType(primaryAggregate) ? primaryAggregate : undefined,
        secondaryAggregation: isAggregationType(secondaryAggregate) ? secondaryAggregate : undefined,
        defaultTopN: presentationPlan.defaultTopN,
        defaultHideOthers: presentationPlan.defaultHideOthers,
        preFilter: evidencePlan.preFilter,
    };
};

const inferNumericColumns = (rows: Record<string, unknown>[], columns: string[], profiles: ColumnProfile[]) => {
    const profileMap = new Map(profiles.map(profile => [profile.name, profile]));
    return columns.filter(column => {
        const profile = profileMap.get(column);
        if (profile && ['numerical', 'currency', 'percentage'].includes(profile.type)) {
            return true;
        }
        return rows.some(row => typeof row[column] === 'number');
    });
};

const inferTimeColumns = (columns: string[], profiles: ColumnProfile[]) => {
    const profileMap = new Map(profiles.map(profile => [profile.name, profile]));
    return columns.filter(column => {
        const profile = profileMap.get(column);
        return profile ? ['date', 'time'].includes(profile.type) : false;
    });
};

const inferCategoricalColumns = (columns: string[], numericColumns: string[], timeColumns: string[]) => {
    const numericSet = new Set(numericColumns);
    const timeSet = new Set(timeColumns);
    return columns.filter(column => !numericSet.has(column) && !timeSet.has(column));
};

const getDatasetColumns = (dataset: CsvData | null | undefined, fallbackColumns: string[]): string[] => {
    if (!dataset || !Array.isArray(dataset.data) || dataset.data.length === 0) {
        return fallbackColumns;
    }

    const columns = new Set<string>();
    dataset.data.forEach(row => {
        Object.keys(row ?? {}).forEach(column => columns.add(column));
    });

    return columns.size > 0 ? Array.from(columns) : fallbackColumns;
};

export const buildEvidenceResultSummary = (
    evidencePlan: SqlEvidenceQueryPlan,
    result: DataQueryResult,
    profiles: ColumnProfile[],
): SqlEvidenceQueryResultSummary => {
    const columns = result.selectedColumns ?? [];
    const numericColumns = inferNumericColumns(result.rows, columns, profiles);
    const timeColumns = inferTimeColumns(columns, profiles);
    const categoricalColumns = inferCategoricalColumns(columns, numericColumns, timeColumns);
    const groupByColumn = evidencePlan.query.groupBy?.[0];
    const primaryMetric = (evidencePlan.query.aggregates ?? [])
        .map(aggregate => aggregate.as?.trim())
        .find((value): value is string => Boolean(value))
        ?? numericColumns[0]
        ?? null;

    const distinctGroupCount = groupByColumn
        ? new Set(result.rows.map(row => String(row[groupByColumn] ?? ''))).size
        : null;
    const totalValue = primaryMetric
        ? Number(result.rows.reduce((sum, row) => sum + (typeof row[primaryMetric] === 'number' ? Number(row[primaryMetric]) : 0), 0))
        : null;
    const hasNegativeValues = primaryMetric
        ? result.rows.some(row => typeof row[primaryMetric] === 'number' && Number(row[primaryMetric]) < 0)
        : false;

    return {
        queryMode: evidencePlan.queryMode,
        preferredResultShape: evidencePlan.preferredResultShape,
        rowCount: result.rows.length,
        columnCount: columns.length,
        columns,
        numericColumns,
        categoricalColumns,
        timeColumns,
        distinctGroupCount,
        totalValue: Number.isFinite(totalValue) ? totalValue : null,
        isTimeSeriesCandidate: Boolean(
            groupByColumn
            && result.rows.length >= 2
            && (
                timeColumns.includes(groupByColumn)
                || evidencePlan.preferredResultShape === 'time_series'
            ),
        ),
        isWideCategorySet: evidencePlan.preferredResultShape !== 'time_series'
            && (distinctGroupCount ?? result.rows.length) > 30,
        hasSecondaryMetric: numericColumns.length >= 2,
        hasNegativeValues,
        previewRows: result.rows.slice(0, 5),
    };
};

export const executeEvidenceQuery = async (
    evidencePlan: SqlEvidenceQueryPlan,
    store: StoreApi,
    binding?: DuckDbAnalysisBinding | null,
    options?: {
        topic?: string | null;
        dataset?: CsvData | null;
        suppressQueryStateUpdates?: boolean;
        abortSignal?: AbortSignal;
    },
): Promise<SqlEvidenceQueryExecution> => {
    const { getState } = store;
    const state = getState();
    const dataset = options?.dataset ?? getPreferredAnalysisDataset(state);
    if (!dataset) {
        throw new SqlAutoAnalysisError('duckdb_unavailable', 'Automatic analysis requires a cleaned dataset loaded into DuckDB.');
    }
    const bindingTarget = resolveDatasetBindingTarget({
        mode: 'analysis',
        csvData: dataset,
        snapshot: state.datasetSemanticSnapshot,
        semanticDatasetVersion: state.semanticDatasetVersion,
    });
    if (!bindingTarget) {
        throw new SqlAutoAnalysisError('duckdb_unavailable', 'Automatic analysis requires a prepared dataset binding target.', {
            title: evidencePlan.title,
        });
    }
    if (!binding || binding.loadVersion !== bindingTarget.datasetVersion) {
        binding = null;
    }

    const _sqlT0 = performance.now();
    const allowedColumns = getDatasetColumns(dataset, state.columnProfiles.map(profile => profile.name));
    const reportDiagnostics = createWorkerDiagnosticsTelemetryReporter(store);
    const executableQuery = mergeEvidencePreFilterIntoQuery(evidencePlan.query, evidencePlan.preFilter);
    const dimensionNormalization = {
        ...DEFAULT_DIMENSION_NORMALIZATION,
        shouldNormalize: buildColumnTypeGate(state.columnProfiles),
    };
    const execution = await (binding
        ? (() => {
            const compiled = (() => {
                try {
                    return compileQueryPlanToDuckDbSql(executableQuery, {
                        allowedColumns,
                        tableName: binding!.tableName,
                        maxRows: evidencePlan.queryMode === 'rowset'
                            || evidencePlan.preferredResultShape === 'time_series'
                            ? 500
                            : 100,
                        maxColumns: 50,
                        maxOrderBy: 3,
                        dimensionNormalization,
                    });
                } catch (error) {
                    throw new SqlAutoAnalysisError(
                        'sql_compile_failed',
                        error instanceof Error ? error.message : String(error),
                        { title: evidencePlan.title },
                    );
                }
            })();

            emitAgentEvent(store, {
                phase: 'execution',
                step: 'sql_query_compile',
                status: 'done',
                message: `Compiled DuckDB SQL for "${evidencePlan.title}".`,
                detail: {
                    sqlPreview: compiled.sql,
                    sqlChars: compiled.sql.length,
                    countSqlChars: compiled.countSql.length,
                    analysisEngine: 'duckdb',
                    duckDbRequired: true,
                    preFilter: evidencePlan.preFilter ?? [],
                },
            });

            return duckDbWorkerClient.executeCompiledQuery({
                sql: compiled.sql,
                countSql: compiled.countSql,
                selectedColumns: compiled.selectedColumns,
                appliedOrderBy: compiled.appliedOrderBy,
                appliedLimit: compiled.appliedLimit,
            }, resolveDuckDbQueryTimeoutMs(dataset), options?.abortSignal, reportDiagnostics).then(result => ({
                result,
                engine: 'duckdb' as const,
                sqlPreview: compiled.sql,
                tableName: binding!.tableName,
                loadVersion: binding!.loadVersion,
                fallbackReason: null,
                fallbackStage: null,
            }));
        })()
        : executeManagedDataQuery(
            bindingTarget.dataset,
            executableQuery,
            allowedColumns,
            {
                allowNativeFallback: true,
                reportDiagnostics,
                dimensionNormalization,
            },
        ));

    console.log(`[Perf:SQL] DuckDB query: ${Math.round(performance.now() - _sqlT0)}ms | "${evidencePlan.title?.slice(0, 40)}"`);
    const result = execution.result;
    const activeDataQuery: ActiveDataQuery = {
        ...resolveDatasetScopeBinding(getState().datasetBundle),
        sessionId: getState().sessionId,
        turnId: getState().activeTurn?.turnId,
        stepId: getState().activeTurn?.steps.at(-1)?.stepId,
        explanation: `Automatic SQL-first evidence query for "${evidencePlan.title}"`,
        plan: {
            ...executableQuery,
            select: result.selectedColumns,
            orderBy: result.appliedOrderBy,
            limit: result.appliedLimit,
        } as QueryPlan,
        result,
        appliedAt: new Date(),
        source: 'execute_data_query',
        engine: execution.engine,
        sqlPreview: execution.sqlPreview,
        tableName: execution.tableName,
        loadVersion: execution.loadVersion,
        fallbackReason: execution.fallbackReason,
        fallbackFilterOperation: null,
    };
    const queryTrace = createQueryTraceEntry(activeDataQuery, 'analysis', {
        origin: 'analysis',
        policyReason: 'SQL-first automatic analysis',
    });
    // PERF-301: During analysis hypothesis loop, skip queryHistory and
    // activeDataQuery setState (~2.3s each) — they are only used by debug
    // panels and SpreadsheetPanel which are not visible during analysis.
    if (!options?.suppressQueryStateUpdates) {
        appendQueryTrace(store, queryTrace);
        const _setT0 = performance.now();
        store.setState({ activeDataQuery });
        console.log(`[Perf:SQL] setState(activeDataQuery): ${Math.round(performance.now() - _setT0)}ms`);
    }
    getState().logAgentToolUsage?.({
        tool: 'duckdb_query_engine',
        description: `Executed SQL-first evidence query for "${evidencePlan.title}".`,
        detail: {
            sqlPreview: execution.sqlPreview,
            tableName: execution.tableName,
            loadVersion: execution.loadVersion,
            engine: execution.engine,
            fallbackReason: execution.fallbackReason,
            fallbackStage: execution.fallbackStage,
            totalMatchedRows: result.totalMatchedRows,
            returnedRows: result.returnedRows,
            sourceTopic: options?.topic ?? null,
            preFilter: evidencePlan.preFilter ?? [],
        },
    });

    return {
        result,
        execution,
        activeDataQuery,
        queryTrace,
        binding,
        allowedColumns,
    };
};

export const executePresentationPlanAndCreateCard = async (
    evidencePlan: SqlEvidenceQueryPlan,
    presentationPlan: SqlPresentationPlan,
    store: StoreApi,
    evidenceSummary: SqlEvidenceQueryResultSummary,
    executionResult: SqlEvidenceQueryExecution,
    options?: {
        topic?: string | null;
        valueGate?: EvidenceValueGateResult | null;
        sourceStepIds?: string[];
        analysisSessionRunId?: string | null;
        existingAcceptedOutputs?: ExistingAcceptedEvidence[];
    },
): Promise<SqlPresentationExecutionResult> => {
    const { getState } = store;
    let effectivePresentationPlan = presentationPlan;
    if (presentationPlan.pivotDecision === 'prefer_pivot' && presentationPlan.pivotRequest) {
        // Dedup check: skip pivot if same signature already exists
        const pivotQSig = buildPivotToolQuerySignature(presentationPlan.pivotRequest);
        const pivotSSig = buildPivotToolSemanticSignature(presentationPlan.pivotRequest);
        const isDupPivot = (options?.existingAcceptedOutputs ?? []).some(
            o => o.querySignature === pivotQSig || o.semanticSignature === pivotSSig,
        );
        if (isDupPivot) {
            console.log('[SqlCardExecutor] Pivot dedup: skipping duplicate pivot matrix, falling back to chart.');
            effectivePresentationPlan = {
                ...presentationPlan,
                pivotDecision: undefined,
                pivotPresentation: undefined,
                pivotRequest: undefined,
            };
        } else {
            const pivotResult = await executePivotMatrixAnalysis(presentationPlan.pivotRequest, store);
            const pivotCardId = pivotResult.artifacts?.cardId;
            const pivotCard = typeof pivotCardId === 'string'
                ? getState().analysisCards.find(card => card.id === pivotCardId) ?? null
                : null;
            if (pivotResult.status === 'success' && pivotCard) {
                const cardWithQueryEvidence: AnalysisCardData = {
                    ...pivotCard,
                    provenance: buildAnalysisArtifactProvenance(pivotCard.plan, getState(), {
                        queryTrace: executionResult.queryTrace,
                        sourceStepIds: pivotCard.sourceStepIds,
                        qualityWarnings: pivotCard.qualityWarnings,
                        evidenceGateDecision: pivotCard.evidenceValueGate?.decision ?? null,
                    }),
                };
                store.setState(previous => ({
                    analysisCards: previous.analysisCards.map(card =>
                        card.id === cardWithQueryEvidence.id ? cardWithQueryEvidence : card),
                }));
                return {
                    card: cardWithQueryEvidence,
                    presentationPlan,
                    evidenceSummary,
                    activeDataQuery: executionResult.activeDataQuery,
                };
            }
            effectivePresentationPlan = {
                ...presentationPlan,
                pivotDecision: undefined,
                pivotPresentation: undefined,
                pivotRequest: undefined,
            };
        }
    }

    const compatiblePlan = buildEvidenceCompatibleSqlPlan(evidencePlan, effectivePresentationPlan);
    const uiPlan = compatiblePlan
        ? mapSqlAnalysisPlanToAnalysisPlan(compatiblePlan)
        : buildAnalysisPlanFromPresentation(evidencePlan, effectivePresentationPlan, evidenceSummary);

    if (!uiPlan) {
        emitAgentEvent(store, {
            phase: 'execution',
            step: 'card_generation',
            status: 'done',
            message: `Preserved SQL-first evidence table for "${presentationPlan.title}" without generating a chart card.`,
            detail: {
                presentationMode: presentationPlan.presentationMode,
                pivotDecision: effectivePresentationPlan.pivotDecision ?? null,
                sourceTopic: options?.topic ?? null,
                evidenceColumns: evidenceSummary.columns,
            },
        });
        return {
            card: null,
            presentationPlan: effectivePresentationPlan,
            evidenceSummary,
            activeDataQuery: executionResult.activeDataQuery,
        };
    }

    const normalizedPlan: AnalysisPlan = {
        ...uiPlan,
        title: effectivePresentationPlan.title,
        description: effectivePresentationPlan.description,
        defaultTopN: effectivePresentationPlan.defaultTopN ?? uiPlan.defaultTopN,
        defaultHideOthers: effectivePresentationPlan.defaultHideOthers ?? uiPlan.defaultHideOthers,
        defaultDataVisible: false,
        artifactMetadata: {
            ...(uiPlan.artifactMetadata ?? {}),
            artifactType: uiPlan.artifactMetadata?.artifactType ?? 'distribution',
            dataTableFirst: false,
            sourceStepIds: options?.sourceStepIds ?? uiPlan.artifactMetadata?.sourceStepIds ?? [],
            analysisSessionRunId: options?.analysisSessionRunId ?? uiPlan.artifactMetadata?.analysisSessionRunId ?? null,
        },
    };

    const groupByKey = normalizedPlan.groupByColumn ?? evidencePlan.query?.groupBy?.[0] ?? null;
    const chronologicalRows = groupByKey
        ? tryChronologicalSort(executionResult.result.rows, groupByKey) ?? executionResult.result.rows
        : executionResult.result.rows;

    const _cardT0 = performance.now();
    const card = await createNewCard(normalizedPlan, chronologicalRows, store, {
        sourceTopic: options?.topic ?? null,
        sourceStepIds: options?.sourceStepIds ?? [],
        analysisSessionRunId: options?.analysisSessionRunId ?? null,
        evidenceValueGate: options?.valueGate
            ? {
                ...options.valueGate,
                evaluatedAt: new Date().toISOString(),
                source: 'evidence_value_gate_v1',
            }
            : null,
        autoAnalysisEvaluation: null,
        queryTrace: executionResult.queryTrace,
    });
    console.log(`[Perf:CardExec] createNewCard: ${Math.round(performance.now() - _cardT0)}ms | "${normalizedPlan.title?.slice(0, 40)}"`);
    const cardEvaluation = evaluateAutoAnalysisCards([card]).cards[0] ?? null;
    emitAgentEvent(store, {
        phase: 'execution',
        step: 'card_generation',
        status: 'done',
        message: `Generated SQL-first ${presentationPlan.presentationMode === 'chart' ? 'chart' : 'table-first'} card "${card.plan.title}".`,
        detail: {
            chartType: card.plan.chartType,
            presentationMode: effectivePresentationPlan.presentationMode,
            sourceTopic: options?.topic ?? null,
            evidenceVerdict: cardEvaluation?.verdict ?? null,
            evidenceReasonCodes: cardEvaluation?.reasonCodes ?? [],
            evidenceColumns: evidenceSummary.columns,
        },
    });
    return {
        card,
        presentationPlan: effectivePresentationPlan,
        evidenceSummary,
        activeDataQuery: executionResult.activeDataQuery,
    };
};

export const executeSqlPlanAndCreateCard = async (
    plan: SqlAnalysisPlan,
    store: StoreApi,
    binding?: DuckDbAnalysisBinding | null,
    options?: { topic?: string | null },
): Promise<AnalysisCardData> => {
    const { getState } = store;
    const state = getState();
    let explorationId: string | null = null;
    const uiPlan = mapSqlAnalysisPlanToAnalysisPlan(plan);

    explorationId = agentMemoryCollector.beginExploration({
        planTitle: uiPlan.title,
        groupBy: uiPlan.groupByColumn ? [uiPlan.groupByColumn] : [],
        metric: uiPlan.valueColumn ?? uiPlan.yValueColumn ?? null,
        aggregation: uiPlan.aggregation,
    });

    try {
        const execution = await executeEvidenceQuery({
            title: plan.title,
            queryMode: plan.queryMode,
            query: plan.query,
            intentSummary: plan.description,
            preFilter: plan.preFilter,
        }, store, binding, options);
        const result = execution.result;

        if (result.rows.length === 0) {
            agentMemoryCollector.completeExploration(explorationId, {
                verdict: 'no_data',
                commentary: 'DuckDB query returned no rows.',
            });
            throw new SqlAutoAnalysisError('empty_result', `SQL query for "${plan.title}" returned no rows.`, {
                sqlPreview: execution.execution.sqlPreview ?? undefined,
            });
        }

        const insights = evaluateAggregationQuality(uiPlan, result.rows);
        emitAgentEvent(store, {
            phase: 'evaluation',
            step: 'aggregation_result',
            status: 'done',
            message: insights.description,
            detail: {
                metrics: insights.metrics,
                tablePreview: insights.tablePreview,
                columns: insights.columns,
                analysisEngine: execution.execution.engine,
                duckDbRequired: execution.execution.engine === 'duckdb',
                sqlPreview: execution.execution.sqlPreview,
            },
        });
        emitAgentEvent(store, {
            phase: 'evaluation',
            step: 'insight_evaluation',
            status: insights.qualityWarning ? 'error' : 'done',
            message: insights.commentary,
            detail: {
                metrics: insights.metrics,
                qualityWarning: insights.qualityWarning,
                analysisEngine: execution.execution.engine,
                duckDbRequired: execution.execution.engine === 'duckdb',
                sqlPreview: execution.execution.sqlPreview,
            },
        });
        agentMemoryCollector.completeExploration(explorationId, {
            verdict: insights.verdict,
            qualityWarning: insights.qualityWarning,
            metrics: insights.metrics,
            commentary: insights.commentary,
        });

        const groupByKey2 = uiPlan.groupByColumn ?? plan.query?.groupBy?.[0] ?? null;
        const chronologicalRows2 = groupByKey2
            ? tryChronologicalSort(result.rows, groupByKey2) ?? result.rows
            : result.rows;

        // Quality warnings are passed as metadata — they no longer block card creation.
        const qualityWarnings = insights.qualityWarning ? [insights.qualityWarning] : [];
        const card = await createNewCard(uiPlan, chronologicalRows2, store, {
            sourceTopic: options?.topic ?? null,
            autoAnalysisEvaluation: null,
            qualityWarnings,
            queryTrace: execution.queryTrace,
        });
        const cardEvaluation = evaluateAutoAnalysisCards([card]).cards[0] ?? null;
        agentMemoryCollector.markExplorationAsCard(explorationId);
        emitAgentEvent(store, {
            phase: 'execution',
            step: 'card_generation',
            status: 'done',
            message: `Generated SQL-first card "${card.plan.title}".`,
            detail: {
                chartType: card.plan.chartType,
                analysisEngine: execution.execution.engine,
                duckDbRequired: execution.execution.engine === 'duckdb',
                sqlPreview: execution.execution.sqlPreview,
                sourceTopic: options?.topic ?? null,
                evidenceVerdict: cardEvaluation?.verdict ?? null,
                evidenceReasonCodes: cardEvaluation?.reasonCodes ?? [],
            },
        });
        return card;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof SqlAutoAnalysisError) {
            if (!SOFT_FAILURE_CODES.has(error.code)) {
                agentMemoryCollector.failExploration(explorationId, message);
            }
            throw error;
        }
        agentMemoryCollector.failExploration(explorationId, message);
        throw new SqlAutoAnalysisError('duckdb_query_failed', message, {
            title: plan.title,
            tableName: binding?.tableName ?? null,
        });
    }
};
