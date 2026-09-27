import { AiAction, ToolName } from '../../../types';
import { hasSemanticQueryPlan, normalizeDataQueryPlanLike } from '../execution/dataQueryContract';
import { normalizeQueryWhereClauseLike } from '../execution/dataOperationNormalization';
import { normalizeClarificationRequest } from '../runtime/runtimeClarification';

const DOM_TOOL_MAP: Record<string, ToolName> = {
    highlightCard: 'ui.highlight_card',
    changeCardChartType: 'ui.change_chart_type',
    showCardData: 'ui.show_card_data',
    filterCard: 'ui.filter_card',
};

const TOOL_NAME_PREFIXES = ['analysis.', 'card.', 'ui.', 'data.', 'spreadsheet.', 'workspace.', 'conversation.'];

const isToolNameLike = (value: unknown): value is ToolName =>
    typeof value === 'string' && TOOL_NAME_PREFIXES.some(prefix => value.startsWith(prefix));

const stripMarkdownCodeFence = (content: string) => {
    const trimmed = content.trim();
    const markdownMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    return markdownMatch?.[1]?.trim() || trimmed;
};

const tryParseObject = (value: unknown): Record<string, any> | null => {
    if (!value) return null;
    if (typeof value === 'object') return value as Record<string, any>;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : null;
        } catch {
            return null;
        }
    }
    return null;
};

const asPlainObject = (value: unknown): Record<string, any> | null => {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, any>
        : null;
};

const parsePlanCandidate = (value: unknown): Record<string, any> | null => {
    const objectValue = asPlainObject(tryParseObject(value));
    if (!objectValue) return null;

    const nestedPlan = asPlainObject(objectValue.plan);
    if (nestedPlan) {
        const normalizedNestedPlan = normalizeQueryPlan(nestedPlan);
        return hasSemanticQueryPlan(normalizedNestedPlan) ? normalizedNestedPlan : null;
    }

    const normalizedPlan = normalizeQueryPlan(objectValue);
    return hasSemanticQueryPlan(normalizedPlan) ? normalizedPlan : null;
};

const normalizeQueryPlan = (plan: Record<string, any>): Record<string, any> => {
    const normalizedPlan = normalizeDataQueryPlanLike(plan) ?? {};
    const normalizedWhere = normalizedPlan.where ?? normalizeQueryWhereClauseLike(plan.where);
    return {
        ...normalizedPlan,
        ...(normalizedWhere ? { where: normalizedWhere } : {}),
    };
};

const parseMutateCandidate = (value: unknown): Record<string, any> | null => {
    const objectValue = asPlainObject(tryParseObject(value));
    if (!objectValue) return null;

    if (asPlainObject(objectValue.dataOperations)) {
        return parseMutateCandidate(objectValue.dataOperations);
    }
    if (asPlainObject(objectValue.dataPreparationPlan)) {
        return parseMutateCandidate(objectValue.dataPreparationPlan);
    }
    if (asPlainObject(objectValue.mutationPlan)) {
        return parseMutateCandidate(objectValue.mutationPlan);
    }
    if (asPlainObject(objectValue.plan) && (
        Array.isArray((objectValue.plan as Record<string, unknown>).operations)
        || 'operation' in (objectValue.plan as Record<string, unknown>)
        || typeof (objectValue.plan as Record<string, unknown>).explanation === 'string'
    )) {
        return objectValue.plan as Record<string, any>;
    }

    return (
        Array.isArray(objectValue.operations)
        || 'operation' in objectValue
        || typeof objectValue.explanation === 'string'
        || Array.isArray(objectValue.outputColumns)
    )
        ? objectValue
        : null;
};

const normalizeDataQueryArgs = (rawArgs: Record<string, any> | null, thought?: string): Record<string, any> => {
    const source = rawArgs ?? {};
    const plan = parsePlanCandidate(source.plan)
        ?? parsePlanCandidate(source.queryPlan)
        ?? parsePlanCandidate(source.query);

    return {
        ...(typeof source.query === 'string' && source.query.trim() ? { query: source.query } : {}),
        explanation: (() => {
            if (typeof source.explanation === 'string' && source.explanation.trim()) {
                return source.explanation;
            }
            if (typeof source.queryPlan?.explanation === 'string' && source.queryPlan.explanation.trim()) {
                return source.queryPlan.explanation;
            }
            if (typeof source.query?.explanation === 'string' && source.query.explanation.trim()) {
                return source.query.explanation;
            }
            if (thought && thought.trim()) {
                return thought.trim();
            }
            return 'Run a read-only data query.';
        })(),
        ...(plan ? { plan } : {}),
        ...(typeof source.fallbackFilterOperation === 'object' && source.fallbackFilterOperation
            ? { fallbackFilterOperation: source.fallbackFilterOperation }
            : {}),
    };
};

const stringifySpreadsheetFilterValue = (value: unknown): string => {
    if (Array.isArray(value)) {
        return value.map(item => stringifySpreadsheetFilterValue(item)).filter(Boolean).join(', ');
    }
    if (value === null || value === undefined) {
        return '';
    }
    const text = String(value).trim();
    return /\s/.test(text) ? `'${text}'` : text;
};

const normalizeSpreadsheetFilterArgs = (rawArgs: Record<string, any> | null, thought?: string): Record<string, any> => {
    const source = rawArgs ?? {};
    if (typeof source.query === 'string' && source.query.trim()) {
        return { query: source.query.trim() };
    }

    const normalizedWhere = normalizeQueryWhereClauseLike(source.filter ?? source.filters ?? source.where);
    if (normalizedWhere?.predicates?.length) {
        const query = normalizedWhere.predicates
            .map(predicate => {
                const operator = predicate.operator === 'eq' ? '=' : predicate.operator;
                const value = predicate.operator === 'is_null' || predicate.operator === 'not_null'
                    ? ''
                    : ` ${stringifySpreadsheetFilterValue(predicate.value)}`;
                return `${predicate.column} ${operator}${value}`.trim();
            })
            .join(' AND ');
        if (query) {
            return { query };
        }
    }

    if (thought?.trim()) {
        return { query: thought.trim() };
    }

    return source;
};

const normalizeDataMutateArgs = (rawArgs: Record<string, any> | null, thought?: string): Record<string, any> => {
    const source = parseMutateCandidate(rawArgs) ?? {};
    const operations = Array.isArray(source.operations)
        ? source.operations
        : ('operation' in source && source.operation !== undefined ? [source.operation] : []);

    return {
        explanation: (() => {
            if (typeof source.explanation === 'string' && source.explanation.trim()) {
                return source.explanation;
            }
            if (thought && thought.trim()) {
                return thought.trim();
            }
            return 'Apply deterministic dataset changes.';
        })(),
        operations,
        ...(Array.isArray(source.outputColumns) ? { outputColumns: source.outputColumns } : {}),
    };
};

const ANALYSIS_PLAN_KEYS = [
    'chartType',
    'chart',
    'title',
    'description',
    'queryMode',
    'query',
    'bindings',
    'aggregation',
    'groupBy',
    'groupByColumn',
    'xAxis',
    'yAxis',
    'values',
    'metrics',
    'columns',
    'valueColumns',
    'valueColumn',
    'xValueColumn',
    'yValueColumn',
    'secondaryValueColumn',
    'secondaryAggregation',
    'defaultTopN',
    'defaultHideOthers',
    'preFilter',
];

const normalizeCreatePlanArgs = (rawArgs: Record<string, any> | null): Record<string, any> => {
    const source = rawArgs ?? {};
    const nestedPlan = asPlainObject(source.plan);
    if (nestedPlan) {
        return {
            ...source,
            plan: nestedPlan,
        };
    }

    const directPlan = Object.fromEntries(
        ANALYSIS_PLAN_KEYS
            .filter(key => source[key] !== undefined)
            .map(key => [key, source[key]]),
    );

    if (Object.keys(directPlan).length === 0) {
        return source;
    }

    return {
        ...omitKeys(source, ANALYSIS_PLAN_KEYS),
        plan: directPlan,
    };
};

const normalizeToolArgs = (
    toolName: ToolName,
    rawArgs: Record<string, any> | null,
    thought?: string,
    sourceJson?: Record<string, any>,
): Record<string, any> => {
    if (toolName === 'analysis.create_plan') {
        return normalizeCreatePlanArgs(rawArgs);
    }
    if (toolName === 'data.query') {
        return normalizeDataQueryArgs(rawArgs, thought);
    }
    if (toolName === 'data.mutate') {
        return normalizeDataMutateArgs(rawArgs, thought);
    }
    if (toolName === 'spreadsheet.filter') {
        return normalizeSpreadsheetFilterArgs(rawArgs, thought);
    }
    if (toolName === 'conversation.request_clarification') {
        return normalizeClarificationArgs({
            ...(sourceJson ?? {}),
            ...(rawArgs ? { args: rawArgs } : {}),
        });
    }
    return rawArgs ?? {};
};

const normalizeClarificationArgs = (parsedJson: Record<string, any>): Record<string, any> => {
    const clarificationArgs = asPlainObject(tryParseObject(parsedJson.clarification));
    if (clarificationArgs) {
        return normalizeClarificationRequest(clarificationArgs, [
            parsedJson.question,
            parsedJson.message,
            parsedJson.text,
        ]);
    }

    const explicitArgs = asPlainObject(tryParseObject(parsedJson.args));
    if (explicitArgs) {
        return normalizeClarificationRequest(explicitArgs, [
            parsedJson.question,
            parsedJson.message,
            parsedJson.text,
        ]);
    }

    const fallbackArgs = omitKeys(parsedJson, [
        'thought',
        'tool_call',
        'type',
        'responseType',
        'message',
        'text',
        'cardId',
        'suggestedActions',
    ]);
    return normalizeClarificationRequest(fallbackArgs, [
        parsedJson.question,
        parsedJson.message,
        parsedJson.text,
    ]);
};

const omitKeys = (input: Record<string, any>, keys: string[]) => Object.fromEntries(
    Object.entries(input).filter(([key, value]) => !keys.includes(key) && value !== undefined),
);

const pickLooseArgs = (parsedJson: Record<string, any>, toolCall: Record<string, any>): Record<string, any> => {
    const explicitArgs = tryParseObject(
        toolCall.args
        ?? toolCall.arguments
        ?? toolCall.input
        ?? toolCall.parameters
        ?? toolCall.function?.arguments
        ?? parsedJson.args
        ?? parsedJson.tool_args
        ?? parsedJson.toolArgs,
    );

    if (explicitArgs) {
        return explicitArgs;
    }

    const nestedFallback = omitKeys(toolCall, ['toolName', 'name', 'tool', 'function']);
    if (Object.keys(nestedFallback).length > 0) {
        return nestedFallback;
    }

    return omitKeys(parsedJson, [
        'thought',
        'tool_call',
        'type',
        'responseType',
        'message',
        'text',
        'cardId',
        'suggestedActions',
    ]);
};

const inferToolName = (toolCall: Record<string, any>, parsedJson: Record<string, any>): ToolName | null => {
    const explicit = toolCall.toolName ?? toolCall.name ?? toolCall.tool ?? toolCall.function?.name;
    if (typeof explicit === 'string' && explicit.trim()) {
        return explicit.trim() as ToolName;
    }

    const mergedArgs = {
        ...omitKeys(toolCall, ['toolName', 'name', 'tool', 'function']),
        ...omitKeys(parsedJson, ['thought', 'tool_call', 'type', 'responseType', 'message', 'text', 'cardId', 'suggestedActions']),
    };

    if (typeof mergedArgs.query === 'string' && mergedArgs.query.trim()) {
        return 'workspace.search';
    }
    if (typeof mergedArgs.path === 'string' && mergedArgs.path.trim()) {
        if (mergedArgs.content !== undefined || mergedArgs.oldText !== undefined || mergedArgs.newText !== undefined) {
            return null;
        }
        return 'workspace.read';
    }
    return null;
};

const normalizeDirectToolCall = (parsedJson: Record<string, any>): AiAction | null => {
    const toolCall = parsedJson.tool_call;
    if (!toolCall) return null;

    if (typeof toolCall === 'string') {
        const toolName = toolCall.trim();
        return toolName
            ? {
                type: 'tool_call',
                thought: parsedJson.thought,
                toolName: toolName as ToolName,
                args: normalizeToolArgs(toolName as ToolName, pickLooseArgs(parsedJson, {}), parsedJson.thought, parsedJson),
            }
            : null;
    }

    if (typeof toolCall !== 'object') return null;

    const toolNameCandidate = inferToolName(toolCall, parsedJson);
    if (!toolNameCandidate) {
        return null;
    }

    return {
        type: 'tool_call',
        thought: parsedJson.thought,
        toolName: toolNameCandidate,
        args: normalizeToolArgs(toolNameCandidate, pickLooseArgs(parsedJson, toolCall), parsedJson.thought, parsedJson),
    };
};

const normalizeToolKeyAction = (parsedJson: Record<string, any>): AiAction | null => {
    const toolEntry = Object.entries(parsedJson).find(([key]) => TOOL_NAME_PREFIXES.some(prefix => key.startsWith(prefix)));
    if (!toolEntry) return null;

    const [toolName, rawArgs] = toolEntry;
    const parsedArgs = tryParseObject(rawArgs);
    return {
        type: 'tool_call',
        thought: parsedJson.thought,
        toolName: toolName as ToolName,
        args: normalizeToolArgs(toolName as ToolName, parsedArgs ?? {}, parsedJson.thought, parsedJson),
    };
};

const normalizeLegacyAction = (parsedJson: Record<string, any>): AiAction | null => {
    const directToolCall = normalizeDirectToolCall(parsedJson);
    if (directToolCall) {
        return directToolCall;
    }
    const toolKeyAction = normalizeToolKeyAction(parsedJson);
    if (toolKeyAction) {
        return toolKeyAction;
    }
    if (!parsedJson.responseType) {
        return null;
    }

    const normalizedQueryArgs = normalizeDataQueryArgs({
        ...(parsedJson.plan ? { plan: parsedJson.plan } : {}),
        ...(parsedJson.queryPlan ? { queryPlan: parsedJson.queryPlan } : {}),
        ...(parsedJson.query ? { query: parsedJson.query } : {}),
        ...(typeof parsedJson.fallbackFilterOperation === 'object' ? { fallbackFilterOperation: parsedJson.fallbackFilterOperation } : {}),
        ...(typeof parsedJson.explanation === 'string' ? { explanation: parsedJson.explanation } : {}),
    }, parsedJson.thought);

    switch (parsedJson.responseType) {
        case 'text_response':
            return {
                type: 'assistant_message',
                thought: parsedJson.thought,
                message: parsedJson.text ?? '',
                cardId: parsedJson.cardId,
                suggestedActions: parsedJson.suggestedActions,
            };
        case 'plan_creation':
            return { type: 'tool_call', thought: parsedJson.thought, toolName: 'analysis.create_plan', args: { plan: parsedJson.plan } };
        case 'statistical_analysis':
            return { type: 'tool_call', thought: parsedJson.thought, toolName: 'analysis.correlation', args: parsedJson.statisticalAnalysis ?? {} };
        case 'aggregate_table':
            return { type: 'tool_call', thought: parsedJson.thought, toolName: 'card.aggregate_table', args: parsedJson.tableAction ?? {} };
        case 'add_calculated_column':
            return { type: 'tool_call', thought: parsedJson.thought, toolName: 'card.add_calculated_column', args: parsedJson.calculatedColumnAction ?? {} };
        case 'review_cards':
            return { type: 'tool_call', thought: parsedJson.thought, toolName: 'card.review', args: parsedJson.reviewCards ?? {} };
        case 'dom_action': {
            const toolName = DOM_TOOL_MAP[parsedJson.domAction?.toolName ?? ''];
            if (!toolName) return null;
            return { type: 'tool_call', thought: parsedJson.thought, toolName, args: parsedJson.domAction?.args ?? {} };
        }
        case 'execute_data_operations':
            return {
                type: 'tool_call',
                thought: parsedJson.thought,
                toolName: 'data.mutate',
                args: normalizeDataMutateArgs(parsedJson.dataOperations ?? parsedJson, parsedJson.thought),
            };
        case 'execute_data_query':
            return { type: 'tool_call', thought: parsedJson.thought, toolName: 'data.query', args: normalizedQueryArgs };
        case 'filter_spreadsheet':
            return {
                type: 'tool_call',
                thought: parsedJson.thought,
                toolName: 'spreadsheet.filter',
                args: normalizeSpreadsheetFilterArgs(parsedJson.args ?? parsedJson, parsedJson.thought),
            };
        case 'clarification_request':
            return {
                type: 'tool_call',
                thought: parsedJson.thought,
                toolName: 'conversation.request_clarification',
                args: normalizeClarificationArgs(parsedJson),
            };
        case 'workspace_file': {
            const operation = parsedJson.workspaceFileAction?.operation;
            const toolName = operation ? `workspace.${operation}` as ToolName : null;
            if (!toolName) return null;
            const { operation: _operation, ...rest } = parsedJson.workspaceFileAction ?? {};
            return { type: 'tool_call', thought: parsedJson.thought, toolName, args: rest };
        }
        default:
            return null;
    }
};

const normalizeAiAction = (parsedJson: any): AiAction | null => {
    if (parsedJson?.action && typeof parsedJson.action === 'object') {
        return normalizeAiAction({
            thought: parsedJson.thought,
            ...parsedJson.action,
        });
    }
    if (parsedJson?.type === 'assistant_message') {
        return typeof parsedJson.message === 'string' ? parsedJson as AiAction : null;
    }
    if (parsedJson?.type === 'tool_call') {
        const normalized = normalizeDirectToolCall(parsedJson);
        if (normalized) return normalized;

        if (typeof parsedJson.toolName === 'string' && parsedJson.toolName.trim()) {
            const toolName = parsedJson.toolName.trim() as ToolName;
            const args = pickLooseArgs(parsedJson, {});
            return {
                type: 'tool_call',
                thought: parsedJson.thought,
                toolName,
                args: normalizeToolArgs(toolName, args, parsedJson.thought, parsedJson),
            };
        }
        return null;
    }
    if (isToolNameLike(parsedJson?.type)) {
        const toolName = parsedJson.type;
        const args = pickLooseArgs(parsedJson, {});
        return {
            type: 'tool_call',
            thought: parsedJson.thought,
            toolName,
            args: normalizeToolArgs(toolName, args, parsedJson.thought, parsedJson),
        };
    }
    if (parsedJson && typeof parsedJson === 'object') {
        return normalizeLegacyAction(parsedJson as Record<string, any>);
    }
    return null;
};

const buildFallbackThought = (action: AiAction): string => {
    if (action.type === 'assistant_message') {
        const message = typeof action.message === 'string' ? action.message.trim() : '';
        return message ? `Respond directly to the user: ${message.slice(0, 160)}` : 'Respond directly to the user.';
    }

    const explanation = typeof action.args?.explanation === 'string' ? action.args.explanation.trim() : '';
    if (explanation) {
        return explanation;
    }

    switch (action.toolName) {
        case 'analysis.create_plan': {
            const title = typeof action.args?.plan?.title === 'string' ? action.args.plan.title.trim() : '';
            return title ? `Create the analysis plan "${title}".` : 'Create a bounded analysis plan.';
        }
        case 'data.query':
            return 'Run a structured read-only data query.';
        case 'spreadsheet.filter': {
            const query = typeof action.args?.query === 'string' ? action.args.query.trim() : '';
            return query ? `Filter the spreadsheet for: ${query}` : 'Filter the spreadsheet with a controlled query.';
        }
        case 'conversation.request_clarification': {
            const question = typeof action.args?.question === 'string' ? action.args.question.trim() : '';
            return question ? `Ask the user for clarification: ${question}` : 'Ask the user for clarification.';
        }
        default:
            return `Execute ${action.toolName}.`;
    }
};

const ensureActionThought = (action: AiAction): AiAction => {
    if (typeof action.thought === 'string' && action.thought.trim()) {
        return {
            ...action,
            thought: action.thought.trim(),
        };
    }

    return {
        ...action,
        thought: buildFallbackThought(action),
    };
};

const normalizeActionPayload = (parsedJson: any): AiAction[] => {
    if (Array.isArray(parsedJson)) {
        return parsedJson
            .map(normalizeAiAction)
            .map(action => action ? ensureActionThought(action) : null)
            .filter((action): action is AiAction => Boolean(action));
    }

    if (parsedJson && typeof parsedJson === 'object' && Array.isArray(parsedJson.actions)) {
        return parsedJson.actions
            .map(normalizeAiAction)
            .map(action => action ? ensureActionThought(action) : null)
            .filter((action): action is AiAction => Boolean(action));
    }

    const action = normalizeAiAction(parsedJson);
    return action ? [ensureActionThought(action)] : [];
};

const extractTopLevelJsonValues = (content: string) => {
    const values: string[] = [];
    let startIndex = -1;
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let index = 0; index < content.length; index += 1) {
        const char = content[index];

        if (startIndex === -1) {
            if (char === '{' || char === '[') {
                startIndex = index;
                depth = 1;
            }
            continue;
        }

        if (inString) {
            if (isEscaped) {
                isEscaped = false;
            } else if (char === '\\') {
                isEscaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === '{' || char === '[') {
            depth += 1;
            continue;
        }

        if (char === '}' || char === ']') {
            depth -= 1;
            if (depth === 0) {
                values.push(content.slice(startIndex, index + 1));
                startIndex = -1;
            }
        }
    }

    const trailingFragment = startIndex === -1 ? null : content.slice(startIndex).trim();
    return { values, trailingFragment };
};

export const parseAiActionResponse = (content: string): { actions: AiAction[]; partialParseError: Error | null } => {
    const normalizedContent = stripMarkdownCodeFence(content);
    const { values, trailingFragment } = extractTopLevelJsonValues(normalizedContent);

    if (values.length === 0) {
        throw new Error(`Failed to parse AI action JSON: no complete JSON object found. Content: ${normalizedContent.substring(0, 120)}...`);
    }

    const actions: AiAction[] = [];
    for (const value of values) {
        try {
            const parsedJson = JSON.parse(value);
            actions.push(...normalizeActionPayload(parsedJson));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse AI action JSON: ${message}. Content: ${value.substring(0, 120)}...`);
        }
    }

    if (actions.length === 0) {
        throw new Error(`Failed to parse AI action JSON: no valid actions found. Content: ${normalizedContent.substring(0, 120)}...`);
    }

    const partialParseError = trailingFragment
        ? new Error(`Ignored trailing incomplete JSON chunk: ${trailingFragment.substring(0, 120)}...`)
        : null;

    return {
        actions,
        partialParseError,
    };
};
