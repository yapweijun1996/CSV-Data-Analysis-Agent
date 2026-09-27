import { Agent, type AgentEvent, type AgentTool, type StreamFn } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream, createModels, Type, type AssistantMessage } from '@earendil-works/pi-ai';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { PROVIDER_CONTEXT_WINDOW_CAP } from '../../../../config/agentDefaults';
import type { ColumnRegistry, CsvData, QueryPlan } from '../../../../types';
import { fetchWithoutForbiddenUserAgent } from '../../../ai/browserProviderFetch';
import { getAllowedColumns } from '../../../data/columnRegistry';
import { executeManagedDataQuery } from '../../../duckdb/queryEngine';
import { createPiProviderContextCompactor } from './piContextCompaction';

export const PI_TEST_MODEL = 'gpt-5.4-mini';
const MAX_PROVIDER_TURNS = 6;
const MAX_GROUPS = 30;

export interface PiDatasetContext {
    dataset: CsvData;
    columnRegistry: ColumnRegistry;
    numericColumns: string[];
}

const models = createModels();
models.setProvider(openaiProvider());

const emptyUsage = {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const mockStream: StreamFn = (model, context) => {
    const stream = createAssistantMessageEventStream();
    const results = context.messages.filter(message => message.role === 'toolResult');
    const inspectContent = results[0]?.content[0];
    const metric = inspectContent?.type === 'text'
        ? (JSON.parse(inspectContent.text) as { numericColumns: string[] }).numericColumns[0]
        : undefined;
    const content = results.length === 0
        ? [{ type: 'toolCall' as const, id: 'mock-inspect', name: 'inspect_dataset', arguments: {} }]
        : results.length === 1
            ? [{ type: 'toolCall' as const, id: 'mock-aggregate', name: 'aggregate_rows', arguments: metric ? { metric } : {} }]
            : [{ type: 'text' as const, text: `Mock Pi tool cycle completed: ${results.at(-1)?.content.map(part => part.type === 'text' ? part.text : '').join(' ') ?? ''}` }];
    const reason = results.length < 2 ? 'toolUse' : 'stop';
    const message: AssistantMessage = {
        role: 'assistant' as const, content, api: model.api, provider: model.provider,
        model: model.id, usage: emptyUsage, stopReason: reason, timestamp: Date.now(),
    };
    stream.push({ type: 'start', partial: message });
    stream.push({ type: 'done', reason, message });
    return stream;
};

const requireColumn = (name: string, allowed: string[]): string => {
    const actual = allowed.find(column => column.toLowerCase() === name.trim().toLowerCase());
    if (!actual) throw new Error(`Column is unavailable: ${name}`);
    return actual;
};

export const createPiDatasetTools = ({ dataset, columnRegistry, numericColumns }: PiDatasetContext): AgentTool[] => {
    const selectable = getAllowedColumns(columnRegistry, 'select');
    const groupable = getAllowedColumns(columnRegistry, 'groupBy');
    if (selectable.length === 0) throw new Error('The current dataset has no selectable columns.');

    const aggregateParameters = Type.Object({
        metric: Type.Optional(Type.String({ description: 'Numeric column to sum; omit for row counts.' })),
        groupBy: Type.Optional(Type.String({ description: 'Column to group by.' })),
        filters: Type.Optional(Type.Array(Type.Object({
            column: Type.String(),
            operator: Type.String({ description: 'equals or starts_with' }),
            value: Type.String(),
        }))),
    });
    const inspectTool: AgentTool = {
        name: 'inspect_dataset',
        label: 'Inspect dataset',
        description: 'Return the current dataset column names, likely numeric columns, and complete row count. No raw rows are returned.',
        parameters: Type.Object({}),
        executionMode: 'sequential',
        execute: async () => ({ details: undefined, content: [{ type: 'text', text: JSON.stringify({
            rowCount: dataset.backing?.rowCount ?? dataset.data.length,
            columns: selectable,
            numericColumns: numericColumns.filter(column => selectable.includes(column)),
        }) }] }),
    };
    const aggregateTool: AgentTool<typeof aggregateParameters> = {
        name: 'aggregate_rows',
        label: 'Aggregate rows',
        description: 'Query all local dataset rows with optional equals/starts_with filters and group-by. Returns row count and optional numeric sum. At most 30 groups; raw rows are never returned.',
        parameters: aggregateParameters,
        executionMode: 'sequential',
        execute: async (_id, args, signal) => {
            if ((args.filters?.length ?? 0) > 6) throw new Error('Use at most six filters.');
            for (const filter of args.filters ?? []) {
                if (filter.operator !== 'equals' && filter.operator !== 'starts_with') {
                    throw new Error(`Unsupported filter operator: ${filter.operator}`);
                }
            }
            const metric = args.metric ? requireColumn(args.metric, selectable) : null;
            if (metric && !numericColumns.some(column => column.toLowerCase() === metric.toLowerCase())) {
                throw new Error(`Metric is not profiled as numeric: ${metric}`);
            }
            const groupBy = args.groupBy ? requireColumn(args.groupBy, groupable) : null;
            const plan: QueryPlan = {
                select: [...(groupBy ? [groupBy] : []), 'row_count', ...(metric ? ['metric_sum'] : [])],
                ...(groupBy ? { groupBy: [groupBy] } : {}),
                aggregates: [
                    { function: 'count', as: 'row_count' },
                    ...(metric ? [{ function: 'sum' as const, column: metric, as: 'metric_sum' }] : []),
                ],
                ...(args.filters?.length ? { where: { predicates: args.filters.map(filter => ({
                    column: requireColumn(filter.column, selectable),
                    operator: filter.operator === 'equals' ? 'eq' as const : 'starts_with' as const,
                    value: filter.value,
                })) } } : {}),
                limit: MAX_GROUPS,
            };
            const execution = await executeManagedDataQuery(dataset, plan, selectable, {
                columnRegistry,
                allowNativeFallback: !dataset.backing,
                abortSignal: signal,
            });
            if (execution.result.truncated) {
                throw new Error(`The query has more than ${MAX_GROUPS} groups. Add a filter.`);
            }
            return { details: undefined, content: [{ type: 'text', text: JSON.stringify({
                metric, groupBy, engine: execution.engine,
                groups: execution.result.rows,
            }) }] };
        },
    };
    return [inspectTool, aggregateTool];
};

export const createPiBrowserAgent = (options: {
    mode: 'mock' | 'live';
    context: PiDatasetContext;
    apiKey?: string;
    onEvent?: (event: AgentEvent) => void;
}): Agent => {
    const catalogModel = models.getModel('openai', PI_TEST_MODEL);
    if (!catalogModel) throw new Error(`Pi model ${PI_TEST_MODEL} is unavailable.`);
    const model = { ...catalogModel, contextWindow: Math.min(catalogModel.contextWindow, PROVIDER_CONTEXT_WINDOW_CAP) };
    const apiKey = options.apiKey?.trim() ?? '';
    if (options.mode === 'live' && !apiKey) throw new Error('Set an OpenAI API key in Settings first.');
    let turns = 0;
    const streamFn: StreamFn = options.mode === 'mock'
        ? mockStream
        : (requestedModel, context, settings) => {
            turns += 1;
            if (turns > MAX_PROVIDER_TURNS) throw new Error('Pi stopped after six provider turns.');
            return models.streamSimple(requestedModel, context, {
                ...settings, apiKey, fetch: fetchWithoutForbiddenUserAgent,
            });
        };
    const agent = new Agent({
        initialState: {
            systemPrompt: 'You are a browser CSV research assistant. Inspect the dataset before making claims. Use aggregate_rows for every count or sum. Dataset rows stay local; only schema and bounded aggregate results are available. Do not infer an average from sum and row count when values may be missing. Mention filters, grouping, and any tool error. Keep the answer concise.',
            model,
            thinkingLevel: 'medium',
            tools: createPiDatasetTools(options.context),
        },
        streamFn,
        transformContext: options.mode === 'live'
            ? createPiProviderContextCompactor(model, models, apiKey, fetchWithoutForbiddenUserAgent)
            : undefined,
        toolExecution: 'sequential',
    });
    if (options.onEvent) agent.subscribe(options.onEvent);
    return agent;
};

export const getPiFinalText = (agent: Agent): string => {
    const last = [...agent.state.messages].reverse().find(message => message.role === 'assistant');
    return last?.content.filter(part => part.type === 'text').map(part => part.text).join('\n') ?? '';
};
