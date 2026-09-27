import type {
    AiAction,
    AnalysisCardData,
    AnalysisPlan,
    ChartType,
    ClarificationRequest,
    CohortRetentionRequest,
    MetricMappingValidationRequest,
    PeriodCompareRequest,
    PivotMatrixRequest,
    RootCauseBreakdownRequest,
    SqlAnalysisPlan,
    StatisticalAnalysisRequest,
    SpreadsheetFilterOrigin,
    ToolExecutionResult,
} from '../../../types';
import type { StoreApi } from '../types';
import { getTranslation } from '../../../utils/localization';
import { extractMentionedCardIds } from '../../../utils/cardMentionParser';
import { navigateToCardNarrative } from '../../../utils/cardNavigation';
import { executeCorrelationAction, executeDataOperationsAction, executeDataQueryAction, executeFilterAction, executeReshapeAction, executeKeepWideAction } from './executorDataActions';
import { executeDataDescribeAction, executeDataValueCountsAction, executeDataOutliersAction, executeDataMissingAction } from './diagnosticDataActions';
import { buildCreatePlanExecutionResult } from './createPlanExecutionResult';
import { executeWorkspaceFileAction } from './executorWorkspaceActions';
import { executeMetricMappingValidationAction } from './metricMappingValidator';
import { executePlanAndCreateCard } from './cardExecutor';
import { createNewCard } from './cardCreator';
import { executeSqlPlanAndCreateCard, mapSqlAnalysisPlanToAnalysisPlan } from './sqlCardExecutor';
import { resolveCurrentDuckDbBinding } from '../datasetBinding';
import { validateClarification } from '../tools/toolManifestSupport';
import { createChatMessage } from '../../../utils/messageState';
import { navigateToCard } from '../../../utils/cardNavigation';
import {
    executeCohortRetentionAnalysis,
    executePeriodCompareAnalysis,
    executePivotMatrixAnalysis,
    executeRootCauseBreakdownAnalysis,
} from './analysisSkillExecutor';
import { resolveClarificationOriginalUserRequest } from '../runtime/runtimeClarificationPolicy';
import { executePresentationUpgrade } from './presentationSkill';
import { buildClarificationQuestionFingerprint } from '../runtime/runtimeOodae';

const LOG_PREFIX = '[ExecutorAgent]';

const requestClarification = (action: AiAction, store: StoreApi): ToolExecutionResult => {
    if (action.type !== 'tool_call' || !action.args) {
        return {
            status: 'error',
            toolName: 'conversation.request_clarification',
            message: 'Clarification payload is missing.',
            shouldStop: false,
            retryHint: 'Return a clarification payload with question and options.',
        };
    }

    const clarificationRequest = action.args as ClarificationRequest;
    // When the AI omits the required "question" field, recover by deriving a
    // contextual fallback from the user's original message rather than blocking
    // and wasting an LLM retry round-trip.
    if (!clarificationRequest.question || !clarificationRequest.question.trim()) {
        const userMessage = store.getState().activeTurn?.userMessage ?? '';
        clarificationRequest.question = userMessage
            ? getTranslation('clarification_follow_up_prompt', store.getState().settings.language, { question: userMessage })
            : getTranslation('chat_placeholder_clarification', store.getState().settings.language);
    }
    const validationErrors = validateClarification(clarificationRequest);
    if (validationErrors.length > 0) {
        return {
            status: 'blocked',
            toolName: 'conversation.request_clarification',
            message: validationErrors.join(' '),
            shouldStop: false,
            retryHint: 'Return a clarification question with 1-3 labeled options, or provide a question-only free-text clarification.',
            observation: {
                type: 'tool_result',
                status: 'blocked',
                summary: validationErrors.join(' '),
                toolName: 'conversation.request_clarification',
                code: 'validation_failed',
                retryHint: 'Return a clarification question with 1-3 labeled options, or provide a question-only free-text clarification.',
            },
        };
    }

    console.log(`${LOG_PREFIX} Clarification requested.`);
    store.setState(prev => ({
        pendingClarification: {
            ...clarificationRequest,
            resumeContext: {
                ...clarificationRequest.resumeContext,
                originalUserRequest: resolveClarificationOriginalUserRequest(
                    clarificationRequest.resumeContext?.originalUserRequest,
                    clarificationRequest.resumeContext?.resumeOriginalUserMessage,
                    prev.activeTurn?.userMessage,
                ),
                resumeOriginalUserMessage: resolveClarificationOriginalUserRequest(
                    clarificationRequest.resumeContext?.resumeOriginalUserMessage,
                    clarificationRequest.resumeContext?.originalUserRequest,
                    prev.activeTurn?.userMessage,
                ),
                selectedPath: clarificationRequest.resumeContext?.selectedPath
                    ?? prev.activeTurn?.runtimeCommitment?.selectedPath
                    ?? undefined,
                mustPreserveOutcome: clarificationRequest.resumeContext?.mustPreserveOutcome
                    ?? prev.activeTurn?.runtimeCommitment?.mustPreserveOutcome
                    ?? 'answer',
                clarificationQuestionFingerprint: clarificationRequest.resumeContext?.clarificationQuestionFingerprint
                    ?? buildClarificationQuestionFingerprint(clarificationRequest.question)
                    ?? undefined,
                blockedReason: clarificationRequest.resumeContext?.blockedReason
                    ?? prev.activeTurn?.recoveryState?.lastBlockedReason
                    ?? undefined,
                resumeTargetRunId: clarificationRequest.resumeContext?.resumeTargetRunId
                    ?? prev.activeTurn?.runId
                    ?? '',
                resumeTargetTurnId: clarificationRequest.resumeContext?.resumeTargetTurnId
                    ?? prev.activeTurn?.turnId
                    ?? undefined,
                // AGENT-107: Capture structured evidence at clarification time
                priorEvidence: clarificationRequest.resumeContext?.priorEvidence ?? {
                    queryExplanation: prev.activeDataQuery?.explanation ?? null,
                    queryColumns: prev.activeDataQuery?.result?.selectedColumns ?? null,
                    sampleRows: prev.activeDataQuery?.result?.rows?.slice(0, 5) ?? null,
                    queryTraceSummary: prev.activeDataQuery
                        ? `${prev.activeDataQuery.engine} | ${prev.activeDataQuery.result?.returnedRows ?? 0}/${prev.activeDataQuery.result?.totalMatchedRows ?? 0} rows | columns: ${(prev.activeDataQuery.result?.selectedColumns ?? []).join(', ')}`
                        : null,
                    qualityContext: prev.activeTurn?.lastObservation?.summary ?? null,
                },
            },
        },
        chatHistory: [
            ...prev.chatHistory,
            createChatMessage({
                sender: 'ai',
                text: clarificationRequest.question,
                timestamp: new Date(),
                type: 'ai_clarification',
                clarificationRequest,
            }),
        ],
        isBusy: false,
    }));

    return {
        status: 'success',
        toolName: action.toolName,
        message: 'Clarification requested.',
        shouldStop: true,
        observation: {
            type: 'clarification',
            status: 'success',
            summary: clarificationRequest.question,
            toolName: action.toolName,
        },
    };
};

const executeCleaningControl = async (
    toolName: 'cleaning.resume' | 'cleaning.restart',
    store: StoreApi,
): Promise<ToolExecutionResult> => {
    if (toolName === 'cleaning.resume') {
        await store.getState().resumeCleaningRun();
        return {
            status: 'success',
            toolName,
            message: 'Resumed the cleaning runtime.',
            shouldStop: true,
            observation: {
                type: 'tool_result',
                status: 'success',
                summary: 'Resumed the cleaning runtime.',
                toolName,
            },
        };
    }

    await store.getState().restartCleaningRun();
    return {
        status: 'success',
        toolName,
        message: 'Restarted the cleaning runtime.',
        shouldStop: true,
        observation: {
            type: 'tool_result',
            status: 'success',
            summary: 'Restarted the cleaning runtime.',
            toolName,
        },
    };
};

const executeSuggestionAction = async (
    toolName: 'card.suggestion.apply' | 'card.suggestion.dismiss',
    suggestionId: string | undefined,
    store: StoreApi,
): Promise<ToolExecutionResult> => {
    if (!suggestionId) {
        return {
            status: 'error',
            toolName,
            message: 'Suggestion id is missing.',
            shouldStop: false,
            retryHint: 'Return suggestionId for the target suggestion.',
        };
    }

    if (toolName === 'card.suggestion.apply') {
        await store.getState().applyCardEnhancementSuggestion(suggestionId);
        return {
            status: 'success',
            toolName,
            message: 'Applied the requested card suggestion.',
            shouldStop: false,
            observation: {
                type: 'tool_result',
                status: 'success',
                summary: 'Applied the requested card suggestion.',
                toolName,
                detail: { suggestionId },
            },
        };
    }

    store.getState().dismissCardEnhancementSuggestion(suggestionId);
    return {
        status: 'success',
        toolName,
        message: 'Dismissed the requested card suggestion.',
        shouldStop: false,
        observation: {
            type: 'tool_result',
            status: 'success',
            summary: 'Dismissed the requested card suggestion.',
            toolName,
            detail: { suggestionId },
        },
    };
};

const executeCardRefineAction = (action: AiAction, store: StoreApi): ToolExecutionResult => {
    if (action.type !== 'tool_call' || !action.args) {
        return {
            status: 'error',
            toolName: 'card.refine',
            message: 'card.refine payload is missing.',
            shouldStop: false,
            retryHint: 'Provide cardId and a changes object.',
        };
    }

    let { cardId, changes } = action.args as {
        cardId: string;
        changes: {
            topN?: number;
            chartType?: ChartType;
            filter?: { column: string; values: (string | number)[] };
            isDataVisible?: boolean;
            summary?: string;
        };
    };

    const { getState, setState } = store;
    const state = getState();

    // Harness: auto-inject cardId from @mention when AI omits it
    if (!cardId) {
        const mentionedIds = extractMentionedCardIds(state.activeTurn?.userMessage ?? '');
        if (mentionedIds.length === 1) {
            cardId = mentionedIds[0];
            console.log(`${LOG_PREFIX} card.refine: auto-injected cardId from @mention: ${cardId}`);
        }
    }

    const cardIndex = state.analysisCards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
        return {
            status: 'error',
            toolName: 'card.refine',
            message: `Card "${cardId}" not found.`,
            shouldStop: false,
            retryHint: `Use one of the current cardIds: [${state.analysisCards.map(c => c.id).join(', ')}].`,
        };
    }

    const appliedChanges: string[] = [];

    setState(prev => {
        const newCards = [...prev.analysisCards];
        const card = { ...newCards[cardIndex] };

        if (changes.topN !== undefined) {
            card.topN = changes.topN;
            appliedChanges.push(`topN → ${changes.topN}`);
        }
        if (changes.chartType !== undefined) {
            card.displayChartType = changes.chartType;
            appliedChanges.push(`chartType → ${changes.chartType}`);
        }
        if (changes.filter !== undefined) {
            card.filter = changes.filter.values.length > 0
                ? { column: changes.filter.column, values: changes.filter.values }
                : undefined;
            appliedChanges.push(changes.filter.values.length > 0
                ? `filter → ${changes.filter.column} in [${changes.filter.values.join(', ')}]`
                : 'filter cleared');
        }
        if (changes.isDataVisible !== undefined) {
            card.isDataVisible = changes.isDataVisible;
            appliedChanges.push(`isDataVisible → ${changes.isDataVisible}`);
        }
        if (changes.summary !== undefined) {
            const lang = prev.settings?.language ?? card.summary.language ?? 'English';
            card.summary = { language: lang, text: changes.summary };
            appliedChanges.push('summary updated');
        }

        newCards[cardIndex] = card;
        return { analysisCards: newCards };
    });

    const cardTitle = state.analysisCards[cardIndex]?.plan?.title ?? cardId;
    const changeDesc = appliedChanges.join(', ');
    const friendlyMessage = appliedChanges.length > 0
        ? `Updated "${cardTitle}" — ${changeDesc}.`
        : `No changes applied to "${cardTitle}".`;

    console.log(`${LOG_PREFIX} card.refine: ${friendlyMessage}`);

    // Auto-scroll to the refined section and highlight it
    if (appliedChanges.length > 0) {
        if (changes.summary !== undefined) {
            // Summary changed → navigate to the AI Narrative section specifically
            navigateToCardNarrative(cardId);
        } else {
            getState().handleShowCardFromChat(cardId);
        }
    }

    return {
        status: 'success',
        toolName: 'card.refine',
        message: friendlyMessage,
        shouldStop: true,
        observation: {
            type: 'tool_result',
            status: 'success',
            summary: friendlyMessage,
            toolName: 'card.refine',
            detail: { cardId, changes },
        },
    };
};

// --- Merged from executorPlanActions.ts ---

export const isSqlAnalysisPlanLike = (plan: unknown): plan is SqlAnalysisPlan => {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
        return false;
    }
    const candidate = plan as Partial<SqlAnalysisPlan>;
    // A plan is SQL-first if it has queryMode + query structure.
    // bindings is optional chart-rendering metadata — not a prerequisite for SQL execution.
    return (candidate.queryMode === 'aggregate' || candidate.queryMode === 'rowset')
        && Boolean(candidate.query && typeof candidate.query === 'object' && !Array.isArray(candidate.query));
};

const resolveSqlBinding = (store: StoreApi) => {
    const state = store.getState();
    return resolveCurrentDuckDbBinding({
        mode: 'analysis',
        csvData: state.csvData,
        snapshot: state.datasetSemanticSnapshot,
        semanticDatasetVersion: state.semanticDatasetVersion,
        sessionStatus: state.duckDbSessionStatus,
        activeDataQuery: state.activeDataQuery ?? null,
    });
};

export const executePlanAction = async (
    plan: AnalysisPlan | SqlAnalysisPlan,
    store: StoreApi,
    options?: { throwOnSoftFailure?: boolean },
): Promise<AnalysisCardData | null> => {
    const { getState, setState } = store;
    if (!getState().csvData) return null;
    console.log(`${LOG_PREFIX} Executing plan: "${plan.title}"`);

    // UX-201: If GroupByTest provided precomputed data, skip SQL/aggregation entirely.
    const precomputed = getState().pendingPrecomputedCardData;
    if (precomputed && precomputed.length > 0) {
        setState({ pendingPrecomputedCardData: null });
        console.log(`${LOG_PREFIX} Using precomputed data (${precomputed.length} rows) from GroupByTest for "${plan.title}".`);
        const normalizedPlan = isSqlAnalysisPlanLike(plan)
            ? mapSqlAnalysisPlanToAnalysisPlan(plan)
            : plan as AnalysisPlan;
        return createNewCard(normalizedPlan, precomputed, store);
    }

    if (isSqlAnalysisPlanLike(plan)) {
        const binding = resolveSqlBinding(store);
        return executeSqlPlanAndCreateCard(plan, store, binding);
    }
    return executePlanAndCreateCard(plan, getState().csvData, store, options);
};

const executeAggregateTableAction = async (action: AiAction, store: StoreApi) => {
    const { getState } = store;
    if (action.type !== 'tool_call') return;
    const tableAction = action.args;
    if (!tableAction) return;
    if (!getState().csvData) {
        throw new Error('No dataset available for aggregation.');
    }

    const baseCard = tableAction.cardId
        ? getState().analysisCards.find(card => card.id === tableAction.cardId)
        : null;

    const fallbackTitle = tableAction.title
        || baseCard?.plan.title
        || 'AI Aggregate Result';

    const derivedPlan: AnalysisPlan = {
        chartType: tableAction.chartType || baseCard?.plan.chartType || 'bar',
        title: fallbackTitle,
        description: tableAction.description || baseCard?.plan.description || `Quick aggregation for ${fallbackTitle}`,
        aggregation: tableAction.aggregation || baseCard?.plan.aggregation || (tableAction.valueColumn ? 'sum' : 'count'),
        groupByColumn: tableAction.groupByColumn || baseCard?.plan.groupByColumn,
        valueColumn: tableAction.valueColumn || baseCard?.plan.valueColumn,
        xValueColumn: baseCard?.plan.xValueColumn,
        yValueColumn: baseCard?.plan.yValueColumn,
        secondaryValueColumn: baseCard?.plan.secondaryValueColumn,
        secondaryAggregation: baseCard?.plan.secondaryAggregation,
        defaultTopN: baseCard?.plan.defaultTopN,
        defaultHideOthers: baseCard?.plan.defaultHideOthers,
        preFilter: tableAction.preFilter || baseCard?.plan.preFilter,
        isFallback: false,
    };

    console.log(`${LOG_PREFIX} Quick aggregate requested for card ${tableAction.cardId ?? 'n/a'}.`);
    await executePlanAndCreateCard(derivedPlan, getState().csvData!, store);
};

const executeDomAction = (toolName: 'ui.highlight_card' | 'ui.change_chart_type' | 'ui.show_card_data' | 'ui.filter_card', args: Record<string, any>, store: StoreApi) => {
    const { getState, setState } = store;
    console.log(`${LOG_PREFIX} DOM action: ${toolName}`, args);
    getState().addProgress(`AI is performing action: ${toolName}...`);
    setState(prev => {
        const cardIndex = prev.analysisCards.findIndex(c => c.id === args.cardId);
        if (cardIndex === -1) {
            console.warn(`${LOG_PREFIX} Card "${args.cardId}" not found.`);
            return {};
        }
        const newCards = [...prev.analysisCards];
        switch (toolName) {
            case 'ui.highlight_card': {
                navigateToCard(args.cardId);
                break;
            }
            case 'ui.change_chart_type':
                newCards[cardIndex].displayChartType = args.newType as ChartType;
                break;
            case 'ui.show_card_data':
                newCards[cardIndex].isDataVisible = args.visible;
                break;
            case 'ui.filter_card':
                newCards[cardIndex].filter = args.values.length > 0
                    ? { column: args.column, values: args.values }
                    : undefined;
                break;
        }
        return { analysisCards: newCards };
    });
};

// ---

export const handleExecutorAction = async (
    action: AiAction,
    store: StoreApi,
    options?: { spreadsheetFilterOrigin?: SpreadsheetFilterOrigin; abortSignal?: AbortSignal },
): Promise<ToolExecutionResult> => {
    if (action.type !== 'tool_call') {
        return {
            status: 'error',
            toolName: 'assistant_message',
            message: 'Executor received a non-tool action.',
            shouldStop: false,
        };
    }

    switch (action.toolName) {
        case 'analysis.create_plan':
            if (action.args?.plan) {
                const rawPlan = action.args.plan as AnalysisPlan | SqlAnalysisPlan;
                const createdCard = await executePlanAction(rawPlan, store);
                return buildCreatePlanExecutionResult(
                    isSqlAnalysisPlanLike(rawPlan)
                        ? mapSqlAnalysisPlanToAnalysisPlan(rawPlan)
                        : rawPlan as AnalysisPlan,
                    createdCard,
                );
            }
            break;
        case 'analysis.correlation':
            if (action.args) {
                return executeCorrelationAction(action as AiAction & { args: StatisticalAnalysisRequest }, store);
            }
            break;
        case 'analysis.pivot_matrix':
            if (action.args) {
                return executePivotMatrixAnalysis(action.args as PivotMatrixRequest, store);
            }
            break;
        case 'analysis.period_compare':
            if (action.args) {
                return executePeriodCompareAnalysis(action.args as PeriodCompareRequest, store);
            }
            break;
        case 'analysis.cohort_retention':
            if (action.args) {
                return executeCohortRetentionAnalysis(action.args as CohortRetentionRequest, store);
            }
            break;
        case 'analysis.root_cause_breakdown':
            if (action.args) {
                return executeRootCauseBreakdownAnalysis(action.args as RootCauseBreakdownRequest, store);
            }
            break;
        case 'analysis.validate_metric_mapping':
            if (action.args?.metricName) {
                return executeMetricMappingValidationAction(action.args as MetricMappingValidationRequest, store);
            }
            break;
        case 'analysis.presentation_upgrade':
            if (action.args?.cardId) {
                return executePresentationUpgrade({ cardId: action.args.cardId as string }, store);
            }
            break;
        case 'card.refine':
            return executeCardRefineAction(action, store);
        case 'card.aggregate_table':
            await executeAggregateTableAction(action, store);
            break;
        case 'card.add_calculated_column':
            if (action.args) {
                const { cardId, newColumnName, formula, updateChart } = action.args;
                store.getState().addCalculatedColumnToCard(cardId, newColumnName, formula, updateChart);
            }
            break;
        case 'card.delete':
            if (action.args?.cardId) {
                store.getState().deleteAnalysisCard(action.args.cardId);
            }
            break;
        case 'card.review':
            if (typeof store.getState().runCardEnhancementReview === 'function') {
                await store.getState().runCardEnhancementReview();
            } else {
                console.warn(`${LOG_PREFIX} runCardEnhancementReview not found on store.`);
            }
            break;
        case 'card.suggestion.apply':
        case 'card.suggestion.dismiss':
            return executeSuggestionAction(action.toolName, action.args?.suggestionId, store);
        case 'ui.highlight_card':
        case 'ui.change_chart_type':
        case 'ui.show_card_data':
        case 'ui.filter_card':
            executeDomAction(action.toolName, action.args ?? {}, store);
            break;
        case 'cleaning.resume':
        case 'cleaning.restart':
            return executeCleaningControl(action.toolName, store);
        case 'data.mutate':
            return executeDataOperationsAction(action, store, options?.abortSignal);
        case 'data.reshape':
            return executeReshapeAction(action, store, options?.abortSignal);
        case 'data.keep_wide':
            return executeKeepWideAction(action, store);
        case 'data.query':
            return executeDataQueryAction(action, store, options?.abortSignal);
        case 'data.describe':
            return executeDataDescribeAction(action, store);
        case 'data.value_counts':
            return executeDataValueCountsAction(action, store);
        case 'data.outliers':
            return executeDataOutliersAction(action, store);
        case 'data.missing':
            return executeDataMissingAction(action, store);
        case 'spreadsheet.filter': {
            const query = action.args?.query?.trim() || action.thought?.trim();
            if (query) {
                return executeFilterAction(query, store, options?.spreadsheetFilterOrigin ?? 'chat', options?.abortSignal);
            }
            console.warn(`${LOG_PREFIX} spreadsheet.filter action missing query and thought.`);
            store.getState().addProgress('AI tried to filter the data explorer but did not specify a query.', 'error');
            return {
                status: 'error',
                toolName: 'spreadsheet.filter',
                message: 'spreadsheet.filter action missing query.',
                shouldStop: false,
                retryHint: 'Provide args.query for spreadsheet.filter.',
            };
        }
        case 'workspace.list':
        case 'workspace.tree':
        case 'workspace.read':
        case 'workspace.search':
        case 'workspace.grep':
        case 'workspace.head':
        case 'workspace.diff':
        case 'workspace.replace':
        case 'workspace.write':
        case 'workspace.append': {
            const workspaceResult = await executeWorkspaceFileAction(action, store, { abortSignal: options?.abortSignal });
            return {
                status: 'success',
                toolName: action.toolName,
                message: `Executed ${action.toolName}`,
                shouldStop: false,
                payload: workspaceResult?.payload,
                observation: {
                    type: 'tool_result',
                    status: 'success',
                    summary: `Executed ${action.toolName}.`,
                    toolName: action.toolName,
                    detail: workspaceResult?.payload,
                },
            };
        }
        case 'conversation.request_clarification':
            return requestClarification(action, store);
    }

    return {
        status: 'success',
        toolName: action.toolName,
        message: `Executed ${action.toolName}`,
        shouldStop: false,
        observation: {
            type: 'tool_result',
            status: 'success',
            summary: `Executed ${action.toolName}.`,
            toolName: action.toolName,
        },
    };
};
