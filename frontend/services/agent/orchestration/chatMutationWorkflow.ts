import type {
    AnalysisEngine,
    CsvData,
    DataPreparationPlan,
    DropRowsByConditionOperation,
    FilterRowsOperation,
    PendingMutationConfirmation,
    QueryPlan,
} from '../../../types';
import { generateFilterFunction } from '../../aiService';
import { executeManagedDataQuery } from '../../duckdb/queryEngine';
import { createWorkerDiagnosticsTelemetryReporter } from '../../workers/workerDiagnostics';
import { executeDeterministicMutationPlan } from '../execution/deterministicMutationExecutor';
import { createQueryPlanFromFilterOperation } from '../execution/dataOperationRunner';
import type { StoreApi } from '../types';
import { getMutationConfirmationCommand } from './rowDeleteIntent';
import { createChatMessage } from '../../../utils/messageState';
import { repairRowDeleteFilterOperation } from './rowDeleteFilterRepair';

const PREVIEW_ROW_LIMIT = 20;
const PREVIEW_COLUMN_LIMIT = 12;

const appendAiMessage = (
    store: StoreApi,
    text: string,
    extras?: Partial<{
        isError: boolean;
        suggestedActions: { label: string; action: string }[];
        type: 'ai_message' | 'ai_mutation_confirmation';
        mutationConfirmation: PendingMutationConfirmation;
    }>,
) => {
    store.setState(prev => ({
        chatHistory: [
            ...prev.chatHistory,
            createChatMessage({
                sender: 'ai',
                text,
                timestamp: new Date(),
                type: extras?.type ?? 'ai_message',
                isError: extras?.isError,
                suggestedActions: extras?.suggestedActions,
                mutationConfirmation: extras?.mutationConfirmation,
            }),
        ],
    }));
};

const getDatasetColumns = (data: CsvData, fallbackColumns: string[]) => {
    if (fallbackColumns.length > 0) {
        return fallbackColumns;
    }
    const columns = new Set<string>();
    data.data.forEach(row => {
        Object.keys(row).forEach(column => columns.add(column));
    });
    return [...columns];
};

const extractFilterColumns = (operation: FilterRowsOperation) => [
    ...(operation.predicates?.map(predicate => predicate.column) ?? []),
    ...(operation.groups?.flatMap(group => group.predicates.map(predicate => predicate.column)) ?? []),
];

const hasFilterClauses = (operation: FilterRowsOperation) =>
    (operation.predicates?.length ?? 0) > 0 || (operation.groups?.length ?? 0) > 0;

const buildPreviewPlan = (operation: FilterRowsOperation, columns: string[]): QueryPlan => {
    const filterColumns = extractFilterColumns(operation);
    const previewColumns = [...new Set([...filterColumns, ...columns])].slice(0, PREVIEW_COLUMN_LIMIT);
    return createQueryPlanFromFilterOperation(operation, {
        select: previewColumns,
        limit: PREVIEW_ROW_LIMIT,
    });
};

const formatJsonBlock = (value: unknown) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

const formatEngineLine = (label: string, engine: AnalysisEngine, fallbackReason?: string | null) =>
    fallbackReason
        ? `${label}: \`${engine}\` (DuckDB fallback: \`${fallbackReason}\`)`
        : `${label}: \`${engine}\``;

const buildDeleteFilterPrompt = (request: string) =>
    `Match the rows that should be deleted for this request. Return the rows to delete, not the rows to keep.\nIf the user states Column = Value or Column is Value, do not invert the condition with neq.\nUser request: ${request}`;

const buildMutationOperation = (
    filterRows: FilterRowsOperation,
    request: string,
): DropRowsByConditionOperation => ({
    id: `drop_${filterRows.id || 'chat_delete_rows'}`,
    type: 'drop_rows_by_condition',
    reason: `Confirmed chat row deletion for request: ${request}`,
    ...(filterRows.predicates?.length ? { predicates: filterRows.predicates } : {}),
    ...(filterRows.groups?.length ? { groups: filterRows.groups } : {}),
});

const buildConfirmationMessage = (pending: PendingMutationConfirmation) => [
    `I found ${pending.matchedRowCount} matching row${pending.matchedRowCount === 1 ? '' : 's'} in the cleaned dataset. No changes have been made yet.`,
    '',
    'Delete target filter:',
    formatJsonBlock(pending.filterRows),
    '',
    `Preview rows (up to ${PREVIEW_ROW_LIMIT}):`,
    formatJsonBlock(pending.previewRows),
    '',
    formatEngineLine('Preflight engine', pending.engine, pending.fallbackReason),
    '',
    'Reply with `confirm delete` to remove these rows, or `cancel delete` to keep the dataset unchanged.',
].join('\n');

const buildNoMatchMessage = (
    filterRows: FilterRowsOperation,
    engine: AnalysisEngine,
    fallbackReason?: string | null,
) => [
    'No matching rows were found in the cleaned dataset. No changes were made.',
    '',
    'Filter checked:',
    formatJsonBlock(filterRows),
    '',
    formatEngineLine('Preflight engine', engine, fallbackReason),
].join('\n');

const buildMutationResultMessage = (input: {
    matchedRowCount: number;
    verificationPassed: boolean;
    verifyMatchedRowCount: number;
    preflightEngine: AnalysisEngine;
    preflightFallbackReason?: string | null;
    verifyEngine: AnalysisEngine;
    verifyFallbackReason?: string | null;
}) => {
    const summary = input.verificationPassed
        ? `Deleted ${input.matchedRowCount} row${input.matchedRowCount === 1 ? '' : 's'} from the cleaned dataset.`
        : `Deleted ${input.matchedRowCount} row${input.matchedRowCount === 1 ? '' : 's'}, but verification still found ${input.verifyMatchedRowCount} matching row${input.verifyMatchedRowCount === 1 ? '' : 's'}.`;
    const verificationLine = input.verificationPassed
        ? 'Verification: passed. 0 matching rows remain.'
        : `Verification: warning. ${input.verifyMatchedRowCount} matching rows still remain.`;

    return [
        summary,
        verificationLine,
        formatEngineLine('Preflight engine', input.preflightEngine, input.preflightFallbackReason),
        formatEngineLine('Verification engine', input.verifyEngine, input.verifyFallbackReason),
    ].join('\n');
};

export const runRowDeletePreflight = async (request: string, store: StoreApi): Promise<void> => {
    const { getState, setState } = store;
    const data = getState().csvData;
    if (!data) {
        throw new Error('No cleaned dataset is available.');
    }

    setState({ isBusy: true, pendingClarification: null });

    try {
        const columns = getDatasetColumns(data, getState().columnProfiles.map(profile => profile.name));
        const filterResponse = await generateFilterFunction(
            buildDeleteFilterPrompt(request),
            getState().columnProfiles,
            data.data.slice(0, 8),
            getState().settings,
            getState(),
        );
        const filterRows = repairRowDeleteFilterOperation(
            filterResponse.operation as FilterRowsOperation,
            request,
            data,
            columns,
        );

        if (filterRows.type !== 'filter_rows' || !hasFilterClauses(filterRows)) {
            setState({ isBusy: false, pendingMutationConfirmation: null });
            appendAiMessage(
                store,
                'I could not derive a stable row condition to delete. Please restate the request with a clear condition, for example `remove rows where Code = 501001`.',
                { isError: true },
            );
            return;
        }

        const queryPlan = buildPreviewPlan(filterRows, columns);
        const preflight = await executeManagedDataQuery(data, queryPlan, columns, {
            reportDiagnostics: createWorkerDiagnosticsTelemetryReporter(store),
        });
        const matchedRowCount = preflight.result.totalMatchedRows;

        getState().logAgentToolUsage({
            tool: 'data.query',
            description: 'Preflight row-delete query',
            detail: {
                request,
                filterRows,
                queryPlan,
                engine: preflight.engine,
                fallbackReason: preflight.fallbackReason,
                totalMatchedRows: matchedRowCount,
                previewRows: preflight.result.rows,
            },
        });

        if (matchedRowCount === 0) {
            setState({ isBusy: false, pendingMutationConfirmation: null });
            appendAiMessage(store, buildNoMatchMessage(filterRows, preflight.engine, preflight.fallbackReason));
            return;
        }

        const pending: PendingMutationConfirmation = {
            request,
            filterRows,
            mutationOperation: buildMutationOperation(filterRows, request),
            queryPlan,
            matchedRowCount,
            previewRows: preflight.result.rows,
            engine: preflight.engine,
            fallbackReason: preflight.fallbackReason,
            createdAt: new Date(),
        };

        setState({ isBusy: false, pendingMutationConfirmation: pending });
        getState().recordAgentEvent?.({
            phase: 'chat',
            step: 'mutation_approval_requested',
            status: 'pending',
            message: `Waiting for approval to delete ${matchedRowCount} matching row${matchedRowCount === 1 ? '' : 's'}.`,
            activity: {
                kind: 'approval',
                lifecycle: 'waiting',
                source: 'approval',
                eventType: 'mutation_approval_requested',
                title: 'Mutation Approval Required',
                explanation: 'No dataset changes have been made.',
            },
            detail: {
                matchedRowCount,
                request,
            },
        });
        appendAiMessage(store, buildConfirmationMessage(pending), {
            type: 'ai_mutation_confirmation',
            mutationConfirmation: pending,
            suggestedActions: [
                { label: 'Confirm delete', action: 'confirm delete' },
                { label: 'Cancel delete', action: 'cancel delete' },
            ],
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setState({ isBusy: false, pendingMutationConfirmation: null });
        appendAiMessage(store, `Row delete preflight failed: ${errorMessage}`, { isError: true });
    }
};

export const tryHandlePendingMutationConfirmation = async (
    message: string,
    store: StoreApi,
): Promise<boolean> => {
    const { getState, setState } = store;
    const pending = getState().pendingMutationConfirmation;
    if (!pending) {
        return false;
    }

    const command = getMutationConfirmationCommand(message);
    if (!command) {
        return false;
    }

    if (command === 'cancel') {
        setState({ isBusy: false, pendingMutationConfirmation: null });
        getState().recordAgentEvent?.({
            phase: 'chat',
            step: 'mutation_approval_cancelled',
            status: 'done',
            message: 'The pending row deletion was cancelled without changing the dataset.',
            activity: {
                kind: 'approval',
                lifecycle: 'cancelled',
                source: 'approval',
                eventType: 'mutation_approval_cancelled',
                title: 'Mutation Cancelled',
            },
        });
        appendAiMessage(store, 'Cancelled the pending row deletion. The cleaned dataset was not changed.');
        return true;
    }

    setState({ isBusy: true, pendingMutationConfirmation: null });

    try {
        const data = getState().csvData;
        if (!data) {
            throw new Error('No cleaned dataset is available.');
        }
        const columns = getDatasetColumns(data, getState().columnProfiles.map(profile => profile.name));
        const plan: DataPreparationPlan = {
            explanation: `Delete rows confirmed from chat request: ${pending.request}`,
            operations: [pending.mutationOperation],
            outputColumns: getState().columnProfiles,
            planStatus: 'operations',
            consistencyIssues: [],
        };

        await executeDeterministicMutationPlan(plan, store);

        const updatedData = getState().csvData;
        if (!updatedData) {
            throw new Error('The cleaned dataset is unavailable after deletion.');
        }

        const verifyPlan = createQueryPlanFromFilterOperation(pending.filterRows, {
            select: pending.queryPlan.select,
            limit: 1,
        });
        const verification = await executeManagedDataQuery(updatedData, verifyPlan, columns);
        const verificationPassed = verification.result.totalMatchedRows === 0;

        getState().logAgentToolUsage({
            tool: 'data.query',
            description: 'Verify row-delete query',
            detail: {
                request: pending.request,
                filterRows: pending.filterRows,
                queryPlan: verifyPlan,
                engine: verification.engine,
                fallbackReason: verification.fallbackReason,
                totalMatchedRows: verification.result.totalMatchedRows,
            },
        });

        setState({ isBusy: false });
        appendAiMessage(
            store,
            buildMutationResultMessage({
                matchedRowCount: pending.matchedRowCount,
                verificationPassed,
                verifyMatchedRowCount: verification.result.totalMatchedRows,
                preflightEngine: pending.engine,
                preflightFallbackReason: pending.fallbackReason,
                verifyEngine: verification.engine,
                verifyFallbackReason: verification.fallbackReason,
            }),
            { isError: !verificationPassed },
        );
        getState().recordAgentEvent?.({
            phase: 'chat',
            step: 'mutation_approval_executed',
            status: verificationPassed ? 'done' : 'error',
            message: verificationPassed
                ? `Approved row deletion completed and removed ${pending.matchedRowCount} row${pending.matchedRowCount === 1 ? '' : 's'}.`
                : 'Approved row deletion completed with a verification warning.',
            activity: {
                kind: 'approval',
                lifecycle: verificationPassed ? 'completed' : 'degraded',
                source: 'approval',
                eventType: 'mutation_approval_executed',
                title: verificationPassed ? 'Approved Mutation Completed' : 'Approved Mutation Needs Review',
            },
        });
        return true;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setState({ isBusy: false, pendingMutationConfirmation: pending });
        getState().recordAgentEvent?.({
            phase: 'chat',
            step: 'mutation_approval_failed',
            status: 'error',
            message: 'The approved row deletion failed and remains pending.',
            activity: {
                kind: 'approval',
                lifecycle: 'failed',
                source: 'approval',
                eventType: 'mutation_approval_failed',
                title: 'Approved Mutation Failed',
                explanation: errorMessage,
            },
        });
        appendAiMessage(store, `Confirmed row deletion failed: ${errorMessage}`, { isError: true });
        return true;
    }
};
