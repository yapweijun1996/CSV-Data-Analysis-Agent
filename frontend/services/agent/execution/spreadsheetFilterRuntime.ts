import type {
    ActiveSpreadsheetFilter,
    AppLanguage,
    FilterPredicate,
    FilterRowsOperation,
    SpreadsheetFilterObservation,
    SpreadsheetFilterOrigin,
} from '../../../types';
import { generateFilterFunction } from '../../aiService';
import { isProviderConfigured } from '../../ai/providerConfig';
import { emitAgentEvent } from '../monitoring/agentMonitor';
import { isRuntimeAbortError, throwIfAborted } from '../runtime/runtimeAbort';
import type { StoreApi } from '../types';
import { createQueryPlanFromFilterOperation } from './dataOperationRunner';
import { executeDataQueryWithWorker } from '../../workers/dataWorkerClient';
import { getTranslation } from '../../../utils/localization';
import { createWorkerDiagnosticsTelemetryReporter } from '../../workers/workerDiagnostics';
import { hasFilterOperationClauses } from './dataQueryContract';
import { createId } from '../../../utils/createId';

const LOG_PREFIX = '[SpreadsheetFilterRuntime]';
const PREVIEW_ROW_LIMIT = 20;

const createRequestId = () => createId('spreadsheet-filter');

const logFlowEvent = (
    store: StoreApi,
    requestId: string,
    step: 'intent' | 'tool_args' | 'observation' | 'final_reply',
    message: string,
    detail: Record<string, unknown>,
) => {
    emitAgentEvent(store, {
        phase: step === 'intent' || step === 'final_reply' ? 'chat' : 'execution',
        step: `spreadsheet_filter_${step}`,
        status: 'done',
        message,
        detail: {
            requestId,
            flowStage: step,
            ...detail,
        },
    });
};

const logFlowTool = (
    store: StoreApi,
    requestId: string,
    step: 'intent' | 'tool_args' | 'observation' | 'final_reply',
    description: string,
    detail: Record<string, unknown>,
) => {
    store.getState().logAgentToolUsage({
        tool: 'spreadsheet.filter',
        description,
        stage: 'analysis',
        category: 'spreadsheet',
        risk: 'low',
        policyDecision: 'allowed',
        policyReason: 'Spreadsheet filter executed through controlled runtime.',
        detail: {
            requestId,
            flowStage: step,
            ...detail,
        },
    });
};

const getSinglePredicate = (operation: FilterRowsOperation): FilterPredicate | null => {
    const predicates = Array.isArray(operation.predicates) ? operation.predicates : [];
    const hasGroups = Array.isArray(operation.groups) && operation.groups.length > 0;
    if (hasGroups || predicates.length !== 1) {
        return null;
    }
    return predicates[0] ?? null;
};

const quoteValue = (value: unknown) => {
    if (Array.isArray(value)) {
        return value.map(item => quoteValue(item)).join(', ');
    }
    if (typeof value === 'string') {
        return `"${value}"`;
    }
    return String(value);
};

const describeOperator = (operator: FilterPredicate['operator'], language: AppLanguage) =>
    getTranslation(`filter_op_${operator}`, language);

const buildFinalReply = (
    language: AppLanguage,
    operation: FilterRowsOperation,
    observation: SpreadsheetFilterObservation,
) => {
    const singlePredicate = getSinglePredicate(operation);
    const matchedCount = observation.matchedRowCount;
    const matchedLabel = getTranslation(matchedCount === 1 ? 'row_label_singular' : 'row_label_plural', language);

    if (!singlePredicate) {
        return matchedCount === 0
            ? getTranslation('spreadsheet_filter_reply_none', language)
            : getTranslation('spreadsheet_filter_reply_some', language, { count: matchedCount, rowsLabel: matchedLabel });
    }

    const operatorText = describeOperator(singlePredicate.operator, language);
    const hasValue = singlePredicate.value !== undefined;
    const valueText = hasValue ? ` ${quoteValue(singlePredicate.value)}` : '';
    return matchedCount === 0
        ? getTranslation('spreadsheet_filter_row_none', language, { column: singlePredicate.column, operator: operatorText, value: valueText })
        : getTranslation('spreadsheet_filter_row_some', language, { column: singlePredicate.column, operator: operatorText, value: valueText, count: matchedCount, rowsLabel: matchedLabel });
};

const buildObservation = async (
    store: StoreApi,
    operation: FilterRowsOperation,
    abortSignal?: AbortSignal,
): Promise<SpreadsheetFilterObservation> => {
    throwIfAborted(abortSignal);
    const queryResult = await executeDataQueryWithWorker(
        store.getState().csvData!.data,
        createQueryPlanFromFilterOperation(operation, { limit: PREVIEW_ROW_LIMIT }),
        {
            allowedColumns: store.getState().columnProfiles.map(profile => profile.name),
            maxRows: PREVIEW_ROW_LIMIT,
            maxColumns: Math.max(store.getState().columnProfiles.length, PREVIEW_ROW_LIMIT),
            maxOrderBy: 3,
            timeoutMs: 1500,
            abortSignal,
            reportDiagnostics: createWorkerDiagnosticsTelemetryReporter(store),
        },
    );
    throwIfAborted(abortSignal);
    const singlePredicate = getSinglePredicate(operation);

    return {
        selectedColumn: singlePredicate?.column ?? null,
        operator: singlePredicate?.operator ?? null,
        value: singlePredicate?.value ?? null,
        matchedRowCount: queryResult.totalMatchedRows,
        previewRows: queryResult.rows.slice(0, PREVIEW_ROW_LIMIT),
    };
};

export const runSpreadsheetFilter = async (
    query: string,
    store: StoreApi,
    options?: { origin?: SpreadsheetFilterOrigin },
    abortSignal?: AbortSignal,
): Promise<ActiveSpreadsheetFilter> => {
    const { getState, setState } = store;
    const origin = options?.origin ?? 'chat';
    const requestId = createRequestId();
    const settings = getState().settings;

    if (!isProviderConfigured(settings) || !getState().csvData) {
        getState().addProgress('Cannot execute AI query: Missing API Key or data.', 'error');
        throw new Error('Cannot execute spreadsheet.filter without provider configuration and dataset.');
    }

    setState({
        isAiFiltering: true,
        spreadsheetFilterFunction: null,
        activeSpreadsheetFilter: null,
        aiFilterExplanation: null,
    });
    getState().addProgress(`AI is processing your data query: "${query}"...`, 'system', settings.complexModel);
    console.log(`${LOG_PREFIX} Starting controlled spreadsheet filter request.`, { requestId, origin, query });

    logFlowEvent(store, requestId, 'intent', 'Registered spreadsheet filter intent.', { origin, query });
    logFlowTool(store, requestId, 'intent', 'Registered spreadsheet filter intent.', { origin, query });

    try {
        throwIfAborted(abortSignal);
        const response = await generateFilterFunction(
            query,
            getState().columnProfiles,
            getState().csvData!.data.slice(0, 5),
            settings,
            getState(),
            abortSignal,
        );
        throwIfAborted(abortSignal);

        if (response.operation?.type !== 'filter_rows' || !hasFilterOperationClauses(response.operation)) {
            throw new Error('AI did not return a deterministic filter_rows operation.');
        }

        logFlowEvent(store, requestId, 'tool_args', 'Generated spreadsheet filter arguments.', {
            origin,
            query,
            toolName: 'spreadsheet.filter',
            args: { query },
            operation: response.operation,
            explanation: response.explanation,
        });
        logFlowTool(store, requestId, 'tool_args', 'Generated spreadsheet filter arguments.', {
            origin,
            query,
            toolName: 'spreadsheet.filter',
            args: { query },
            operation: response.operation,
            explanation: response.explanation,
        });

        const observation = await buildObservation(store, response.operation, abortSignal);
        throwIfAborted(abortSignal);
        const finalReply = buildFinalReply(settings.language, response.operation, observation);
        const activeSpreadsheetFilter: ActiveSpreadsheetFilter = {
            requestId,
            origin,
            query,
            operation: response.operation,
            observation,
            finalReply,
            appliedAt: new Date(),
        };

        throwIfAborted(abortSignal);
        setState({
            activeDataQuery: null,
            activeSpreadsheetFilter,
            spreadsheetFilterFunction: response.operation,
            aiFilterExplanation: finalReply,
            isSpreadsheetVisible: true,
        });

        throwIfAborted(abortSignal);
        logFlowEvent(store, requestId, 'observation', 'Observed spreadsheet filter result.', {
            origin,
            observation,
        });
        logFlowTool(store, requestId, 'observation', 'Observed spreadsheet filter result.', {
            origin,
            observation,
        });
        throwIfAborted(abortSignal);
        logFlowEvent(store, requestId, 'final_reply', 'Built spreadsheet filter final reply.', {
            origin,
            finalReply,
        });
        logFlowTool(store, requestId, 'final_reply', 'Built spreadsheet filter final reply.', {
            origin,
            finalReply,
        });

        throwIfAborted(abortSignal);
        getState().addProgress(`AI filter applied: ${finalReply}`);
        return activeSpreadsheetFilter;
    } catch (error) {
        console.error(`${LOG_PREFIX} Controlled spreadsheet filter failed.`, { requestId, origin, query, error });
        if (isRuntimeAbortError(error, abortSignal)) {
            throw error;
        }
        getState().addProgress(`AI query failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
        throw error;
    } finally {
        setState({ isAiFiltering: false });
    }
};
