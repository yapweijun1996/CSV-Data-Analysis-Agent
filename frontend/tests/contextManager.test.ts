// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { AnalysisCardData, ChatMessage, DatasetKnowledge, QueryTraceEntry, WorkspaceActionHistoryEntry } from '../types';
import {
    buildDeterministicContextualSummary,
    buildManagedContext,
    createContextSection,
    estimateTokens,
    formatCardContext,
    formatCompactVisibleEvidenceSummary,
    formatDetailedRecentQueryTrace,
    formatDatasetKnowledge,
    formatRecentWorkspaceActionEvidence,
    formatRows,
    formatVisibleEvidenceSummary,
    markContextualSummaryRefreshed,
    reportContextCompaction,
    reportContextDiagnostics,
    shouldRefreshContextualSummary,
    prepareManagedContext,
} from '../services/ai/contextManager';
import { createTestSettings } from './testSettings';

const asEnglishText = (text: string) => ({ language: 'English' as const, text });

const makeMessage = (sender: 'user' | 'ai', text: string): ChatMessage => ({
    id: `${sender}-${text.toLowerCase().replace(/\W+/g, '-')}`,
    sender,
    text,
    timestamp: new Date('2026-03-10T00:00:00.000Z'),
    type: sender === 'user' ? 'user_message' : 'ai_message',
});

const makeCard = (title: string): AnalysisCardData => ({
    id: title.toLowerCase().replace(/\s+/g, '-'),
    plan: {
        chartType: 'bar',
        title,
        description: `${title} description`,
        aggregation: 'sum',
        groupByColumn: 'Region',
        valueColumn: 'Revenue',
    },
    aggregatedData: [{ Region: 'East', Revenue: 100 }],
    summary: asEnglishText(`${title} summary`),
    displayChartType: 'bar',
    isDataVisible: false,
    topN: null,
    hideOthers: false,
});

const makeQueryTrace = (index: number): QueryTraceEntry => ({
    id: `query-${index}`,
    phase: 'analysis',
    origin: 'chat',
    explanation: `Query ${index}`,
    plan: { select: ['Region'], limit: 5 },
    engine: 'duckdb',
    sqlPreview: `select region from dataset limit ${index}`,
    tableName: 'dataset',
    loadVersion: 'load-1',
    fallbackReason: null,
    appliedAt: new Date('2026-03-10T00:00:00.000Z'),
    toolCategory: 'data',
    policyDecision: 'allowed',
    policyReason: null,
    result: {
        totalMatchedRows: index,
        returnedRows: index,
        truncated: false,
        selectedColumns: ['Region'],
        appliedOrderBy: [],
        appliedLimit: 5,
        durationMs: 10,
        previewRows: [{ Region: `R${index}` }],
    },
});

const makeWorkspaceAction = (index: number): WorkspaceActionHistoryEntry => ({
    timestamp: new Date(`2026-03-10T00:00:0${index}.000Z`),
    operation: 'read',
    path: `/tmp/file-${index}.csv`,
    success: true,
    message: `workspace action ${index}`,
});

describe('contextManager', () => {
    it('estimates tokens deterministically', () => {
        expect(estimateTokens('abcd')).toBe(1);
        expect(estimateTokens('abcdefgh')).toBe(2);
        expect(estimateTokens('abcdefgh')).toBe(estimateTokens('abcdefgh'));
    });

    it('never drops required sections under budget pressure', () => {
        const managed = buildManagedContext({
            callType: 'summary',
            systemText: 'system',
            baseUserText: 'base',
            sections: [
                createContextSection('must_keep', 'M'.repeat(9000), 'required', 'sticky'),
                createContextSection('raw_data_sample', 'R'.repeat(9000), 'low', 'prunable'),
            ],
        });

        expect(managed.includedSections.some(section => section.key === 'must_keep')).toBe(true);
        expect(managed.droppedSections).toContainEqual({ key: 'raw_data_sample', reason: 'budget' });
        expect(managed.diagnostics.estimatedPromptTokens).toBe(managed.estimatedPromptTokens);
        expect(managed.diagnostics.budget).toBe(3500);
    });

    it('drops low-value sections first according to pruning order', () => {
        const managed = buildManagedContext({
            callType: 'summary',
            systemText: 'system',
            baseUserText: 'base',
            sections: [
                createContextSection('related_cards', 'A'.repeat(7000), 'medium', 'prunable'),
                createContextSection('raw_data_sample', 'B'.repeat(7000), 'low', 'prunable'),
                createContextSection('card_context', 'C'.repeat(7000), 'medium', 'prunable'),
            ],
        });

        expect(managed.droppedSections[0]).toEqual({ key: 'related_cards', reason: 'budget' });
        expect(managed.includedSections.some(section => section.key === 'raw_data_sample')).toBe(true);
    });

    it('removes duplicate sections when content overlaps', () => {
        const managed = buildManagedContext({
            callType: 'goal',
            systemText: 'system prompt',
            baseUserText: 'Columns available: Revenue, Cost, Region',
            sections: [
                createContextSection('dataset_columns', 'Columns available: Revenue, Cost, Region', 'required', 'sticky'),
                createContextSection('sample_data', 'Sample rows', 'high', 'prunable'),
            ],
        });

        expect(managed.droppedSections).toContainEqual({ key: 'dataset_columns', reason: 'duplicate' });
        expect(managed.includedSections.some(section => section.key === 'sample_data')).toBe(true);
    });

    it('tracks contextual summary refresh thresholds by session', () => {
        const sessionId = 'session-context-test';

        expect(shouldRefreshContextualSummary(sessionId, 5)).toBe(false);
        expect(shouldRefreshContextualSummary(sessionId, 15)).toBe(true);

        markContextualSummaryRefreshed(sessionId, 15);

        expect(shouldRefreshContextualSummary(sessionId, 18)).toBe(false);
        expect(shouldRefreshContextualSummary(sessionId, 21)).toBe(true);
    });

    it('applies the tool output cutoff when formatting long-session evidence', () => {
        const queryHistory = [1, 2, 3, 4].map(makeQueryTrace);
        const workspaceActionHistory = [1, 2, 3].map(makeWorkspaceAction);

        const visibleEvidence = formatVisibleEvidenceSummary({
            contextualSummary: null,
            activeDataQuery: null,
            activeMetricMappingValidation: null,
            activeSpreadsheetFilter: null,
            analysisCards: [],
            queryHistory,
            chatHistory: [],
        }, {
            toolOutputCutoff: 2,
        });

        const detailedQueryTrace = formatDetailedRecentQueryTrace(queryHistory, {
            toolOutputCutoff: 2,
        });
        const workspaceEvidence = formatRecentWorkspaceActionEvidence(workspaceActionHistory, {
            toolOutputCutoff: 2,
        });

        expect(visibleEvidence).toContain('Older query traces summarized: 2 earlier item(s) were omitted from detailed context.');
        expect(visibleEvidence).toContain('Query 4');
        expect(visibleEvidence).not.toContain('Query 1');
        expect(detailedQueryTrace).toContain('Older database tool outputs summarized: 2 earlier item(s) were omitted from detailed context.');
        expect(detailedQueryTrace).toContain('Query 4');
        expect(detailedQueryTrace).not.toContain('Query 1');
        expect(workspaceEvidence).toContain('Older workspace tool outputs summarized: 1 earlier item(s) were omitted from detailed context.');
        expect(workspaceEvidence).toContain('/tmp/file-3.csv');
        expect(workspaceEvidence).not.toContain('/tmp/file-1.csv');
    });

    it('includes every row from a bounded untruncated active query', () => {
        const rows = Array.from({ length: 12 }, (_, index) => ({
            UOM: `UOM-${index + 1}`,
            total_amount: index + 1,
        }));
        const visibleEvidence = formatVisibleEvidenceSummary({
            activeDataQuery: {
                explanation: 'List every UOM total',
                engine: 'duckdb',
                result: {
                    selectedColumns: ['UOM', 'total_amount'],
                    returnedRows: 12,
                    totalMatchedRows: 12,
                    appliedOrderBy: [],
                    rows,
                    truncated: false,
                },
            },
        } as any);

        expect(visibleEvidence).toContain('Result rows (complete):');
        expect(visibleEvidence).toContain('"UOM": "UOM-12"');
    });

    it('keeps large active query evidence as an explicitly partial preview', () => {
        const rows = Array.from({ length: 30 }, (_, index) => ({ id: index + 1 }));
        const visibleEvidence = formatVisibleEvidenceSummary({
            activeDataQuery: {
                explanation: 'Large result',
                engine: 'duckdb',
                result: {
                    selectedColumns: ['id'],
                    returnedRows: 30,
                    totalMatchedRows: 30,
                    appliedOrderBy: [],
                    rows,
                    truncated: false,
                },
            },
        } as any);

        expect(visibleEvidence).toContain('Preview rows (partial):');
        const previewEvidence = visibleEvidence.split('Preview rows (partial):')[1];
        expect(previewEvidence).toContain('"id": 3');
        expect(previewEvidence).not.toContain('"id": 4');
    });

    it('records collapsed sections when prompt trimming swaps in compact history', () => {
        const managed = buildManagedContext({
            callType: 'summary',
            systemText: 'system',
            baseUserText: 'base',
            sections: [
                createContextSection('recent_history', 'R'.repeat(20000), 'high', 'prunable'),
            ],
            collapsedSections: {
                recent_history: 'Short history block',
            },
        });

        expect(managed.diagnostics.usedCollapsedSections).toContain('recent_history');
        expect(managed.includedSections.find(section => section.key === 'recent_history')?.text).toBe('Short history block');
    });

    it('uses model-aware budgets for gemini chat contexts', () => {
        const managed = buildManagedContext({
            callType: 'chat',
            systemText: 'system',
            baseUserText: 'base',
            sections: [
                createContextSection('dataset_columns', 'Revenue, Cost, Profit', 'required', 'sticky'),
            ],
            settings: {
                provider: 'google',
                language: 'English',
                simpleModel: 'gemini-3.1-flash-lite-preview',
                complexModel: 'gemini-3.1-flash-lite-preview',
            } as never,
            modelId: 'gemini-3.1-flash-lite-preview',
        });

        expect(managed.diagnostics.budgetStrategy).toBe('model_aware');
        expect(managed.diagnostics.contextWindow).toBe(200000);
        expect(managed.diagnostics.softBudget).toBeGreaterThan(7000);
        expect(managed.diagnostics.softBudget).toBeLessThanOrEqual(32000);
    });

    it('shrinks history-like sections before raw data samples when history share is too large', () => {
        const managed = buildManagedContext({
            callType: 'chat',
            systemText: 'system',
            baseUserText: 'base',
            sections: [
                createContextSection('workspace_actions', 'W'.repeat(32000), 'low', 'prunable'),
                createContextSection('recent_history', 'H'.repeat(32000), 'high', 'prunable'),
                createContextSection('raw_data_sample', 'R'.repeat(12000), 'low', 'prunable'),
            ],
            settings: {
                provider: 'google',
                language: 'English',
                simpleModel: 'gemini-3.1-flash-lite-preview',
                complexModel: 'gemini-3.1-flash-lite-preview',
            } as never,
            modelId: 'gemini-3.1-flash-lite-preview',
        });

        expect(managed.diagnostics.historyPruneApplied).toBe(true);
        expect(managed.diagnostics.usedCollapsedSections.some(key => key === 'workspace_actions' || key === 'recent_history')).toBe(true);
        expect(managed.includedSections.some(section => section.key === 'raw_data_sample')).toBe(true);
    });

    it('builds a deterministic contextual summary fallback', () => {
        const summary = buildDeterministicContextualSummary({
            confirmedGoal: 'Find top-performing regions',
            aiCoreAnalysisSummary: 'Revenue is concentrated in the East region.',
            datasetKnowledge: undefined,
            chatHistory: [
                makeMessage('user', 'Show me the strongest region'),
                makeMessage('ai', 'East is leading so far'),
                makeMessage('user', 'Why is East ahead?'),
                makeMessage('ai', 'High revenue concentration'),
            ],
            analysisCards: [makeCard('Revenue by Region')],
        });

        expect(summary).toContain('Goal: Find top-performing regions');
        expect(summary).toContain('Cards: Revenue by Region');
        expect(summary).toContain('Recent messages:');
    });

    it('preserves the latest runtime blocker and cleaning verification gap in visible evidence', () => {
        const visibleEvidence = formatVisibleEvidenceSummary({
            contextualSummary: 'Need to finish reshaping the report.',
            chatHistory: [
                makeMessage('user', 'Fix the cleaning issue'),
                makeMessage('ai', 'Inspecting the current staged table'),
            ],
            cleaningRun: {
                runId: 'cleaning-run-1',
                status: 'failed',
                currentStep: 3,
                steps: [],
                lastModelResponse: null,
                startedAt: new Date('2026-03-12T00:00:00.000Z'),
                updatedAt: new Date('2026-03-12T00:10:00.000Z'),
                targetPath: '/dataset/cleaned.csv',
                lastError: 'The staged reshape dropped label layers.',
                shouldAutoResume: false,
                strategyKind: 'deterministic_reshape',
                lastVerificationReason: 'Multi-header label layers were not preserved during reshaping.',
            },
            activeTurn: {
                turnId: 'turn-1',
                userMessage: 'Continue cleaning',
                status: 'failed',
                startedAt: new Date('2026-03-12T00:00:00.000Z'),
                completedAt: new Date('2026-03-12T00:10:00.000Z'),
                finalMessage: null,
                pendingClarificationRequest: null,
                budgetStatus: {
                    maxSteps: 8,
                    stepsUsed: 4,
                    retryCounts: {},
                    exhausted: false,
                },
                steps: [],
                lastObservation: {
                    type: 'runtime_error',
                    status: 'blocked',
                    summary: 'Repair the current verification gap before continuing.',
                    toolName: 'assistant_message',
                    retryHint: 'Rebuild the unpivot with labelColumns from the raw report.',
                },
            },
        } as any);

        expect(visibleEvidence).toContain('Latest runtime blocker:');
        expect(visibleEvidence).toContain('Repair the current verification gap before continuing.');
        expect(visibleEvidence).toContain('Cleaning runtime:');
        expect(visibleEvidence).toContain('Multi-header label layers were not preserved during reshaping.');
    });

    it('keeps sticky runtime blocker evidence in the compact visible evidence summary', () => {
        const compactEvidence = formatCompactVisibleEvidenceSummary({
            contextualSummary: 'Need to recover the label layer.',
            chatHistory: [
                makeMessage('user', 'Continue cleaning'),
                makeMessage('ai', 'Checking the staged file'),
            ],
            queryHistory: [1, 2, 3].map(makeQueryTrace),
            cleaningRun: {
                runId: 'cleaning-run-1',
                status: 'failed',
                currentStep: 3,
                steps: [],
                lastModelResponse: null,
                startedAt: new Date('2026-03-12T00:00:00.000Z'),
                updatedAt: new Date('2026-03-12T00:10:00.000Z'),
                targetPath: '/dataset/cleaned.csv',
                lastError: 'The staged reshape dropped label layers.',
                shouldAutoResume: false,
                strategyKind: 'deterministic_reshape',
                lastVerificationReason: 'Multi-header label layers were not preserved during reshaping.',
            },
            activeTurn: {
                turnId: 'turn-1',
                userMessage: 'Continue cleaning',
                status: 'failed',
                startedAt: new Date('2026-03-12T00:00:00.000Z'),
                completedAt: new Date('2026-03-12T00:10:00.000Z'),
                finalMessage: null,
                pendingClarificationRequest: null,
                budgetStatus: {
                    maxSteps: 8,
                    stepsUsed: 4,
                    retryCounts: {},
                    exhausted: false,
                },
                steps: [],
                lastObservation: {
                    type: 'runtime_error',
                    status: 'blocked',
                    summary: 'Repair the current verification gap before continuing.',
                    toolName: 'assistant_message',
                    retryHint: 'Rebuild the unpivot with labelColumns from the raw report.',
                },
            },
        } as any, {
            toolOutputCutoff: 2,
        });

        expect(compactEvidence).toContain('Latest runtime blocker:');
        expect(compactEvidence).toContain('Rebuild the unpivot with labelColumns from the raw report.');
        expect(compactEvidence).toContain('Cleaning runtime:');
        expect(compactEvidence).toContain('Query 3');
        expect(compactEvidence).not.toContain('Query 1');
        expect(compactEvidence).not.toContain('Recent conversation:');
    });

    it('includes auto-analysis evidence verdicts in visible card summaries', () => {
        const visibleEvidence = formatCompactVisibleEvidenceSummary({
            contextualSummary: null,
            analysisCards: [{
                ...makeCard('Value by SeriesLabelL1'),
                plan: {
                    chartType: 'bar',
                    title: 'Value by SeriesLabelL1',
                    description: 'Compare Value by SeriesLabelL1.',
                    aggregation: 'sum',
                    groupByColumn: 'SeriesLabelL1',
                    valueColumn: 'Value',
                },
                aggregatedData: [
                    { SeriesLabelL1: 'Alpha', Value: 100 },
                    { SeriesLabelL1: 'Beta', Value: 80 },
                ],
            }],
            queryHistory: [],
            chatHistory: [],
            cleaningRun: null,
            activeTurn: null,
            activeDataQuery: null,
            activeMetricMappingValidation: null,
            activeSpreadsheetFilter: null,
        } as any);

        expect(visibleEvidence).toContain('Visible cards:');
        expect(visibleEvidence).toContain('Evidence: weak');
        expect(visibleEvidence).toContain('helperExposure=');
    });

    it('formats legacy dataset knowledge insights without throwing when groupBy is missing', () => {
        const legacyKnowledge = {
            facts: {
                originalRowCount: 100,
                originalColumnCount: 5,
                cleanedRowCount: 100,
                cleanedColumnCount: 5,
                primaryDimensions: ['Region'],
                primaryMetrics: ['Revenue'],
            },
            columns: [],
            dimensionMap: {
                project: [],
                account: [],
                allocation: [],
                keys: [],
                otherDimensions: ['Region'],
                metrics: ['Revenue'],
            },
            highValueDimensions: [],
            suspiciousMetrics: [],
            groupByInsights: [
                {
                    groupByColumn: 'Region',
                    metric: 'Revenue',
                    verdict: 'useful',
                    commentary: 'Legacy persisted insight',
                },
                {
                    metric: 'Profit',
                    verdict: 'flat_metric',
                    dropReason: 'flat_metric',
                },
            ],
            summary: asEnglishText('Legacy dataset knowledge'),
        } as unknown as DatasetKnowledge;

        const formatted = formatDatasetKnowledge(legacyKnowledge);

        expect(formatted).toContain('• Region vs Revenue -> useful (Legacy persisted insight)');
        expect(formatted).toContain('• n/a vs Profit -> flat_metric (flat_metric)');
    });

    it('formats row and card context payloads even when bigint values are present', () => {
        const rows = [{ Project_ID: 10001, Total_Amount: 12n }] as any;
        const cardContext = [{
            id: 'card-1',
            title: 'Revenue by Project',
            aggregatedDataSample: rows,
        }] as any;

        expect(formatRows(rows)).toContain('"Total_Amount": 12');
        expect(formatCardContext(cardContext)).toContain('"Total_Amount": 12');
    });

    it('reports context diagnostics into telemetry and agent tool logs', () => {
        const telemetryEvents: Array<Record<string, unknown>> = [];
        const toolLogs: Array<Record<string, unknown>> = [];
        const managed = buildManagedContext({
            callType: 'goal',
            systemText: 'system prompt',
            baseUserText: 'base prompt',
            sections: [
                createContextSection('dataset_columns', 'Revenue, Region', 'required', 'sticky'),
            ],
        });

        reportContextDiagnostics(
            {
                logTelemetryEvent: event => telemetryEvents.push(event as unknown as Record<string, unknown>),
                logAgentToolUsage: entry => toolLogs.push(entry as unknown as Record<string, unknown>),
            },
            managed.diagnostics,
        );

        expect(telemetryEvents).toHaveLength(1);
        expect(telemetryEvents[0].stage).toBe('context_prepared');
        expect((telemetryEvents[0].meta as Record<string, unknown>).estimatedPromptTokens).toBe(managed.estimatedPromptTokens);
        expect((telemetryEvents[0].meta as Record<string, unknown>).systemPromptChars).toBeTypeOf('number');
        expect((telemetryEvents[0].meta as Record<string, unknown>).userPromptChars).toBeTypeOf('number');
        expect((telemetryEvents[0].meta as Record<string, unknown>).droppedSectionKeys).toEqual([]);
        expect(toolLogs).toHaveLength(1);
        expect(toolLogs[0].tool).toBe('context_manager');
    });

    it('truncates long SQL previews and workspace action messages in detailed context output', () => {
        const queryHistory: QueryTraceEntry[] = [{
            phase: 'analysis',
            explanation: 'Inspect recent rows.',
            engine: 'duckdb',
            plan: { select: ['Description'] },
            sqlPreview: `SELECT * FROM dataset WHERE description LIKE '%${'x'.repeat(500)}%'`,
            fallbackReason: null,
            result: {
                rows: [],
                previewRows: [],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Description'],
                appliedOrderBy: [],
                appliedLimit: 25,
                durationMs: 3,
            },
        }] as any;
        const workspaceActions: WorkspaceActionHistoryEntry[] = [{
            timestamp: new Date('2026-03-12T00:00:00.000Z'),
            operation: 'replace',
            path: '/dataset/cleaned.csv',
            success: false,
            message: `Workspace replace failed because ${'y'.repeat(500)}`,
        }] as any;

        const queryTrace = formatDetailedRecentQueryTrace(queryHistory);
        const workspaceTrace = formatRecentWorkspaceActionEvidence(workspaceActions);

        expect(queryTrace).toContain('[truncated]');
        expect(workspaceTrace).toContain('[truncated]');
    });

    it('reports compaction events and flags deterministic fallback usage', () => {
        const telemetryEvents: Array<Record<string, unknown>> = [];
        const agentEvents: Array<Record<string, unknown>> = [];
        const diagnostics = buildManagedContext({
            callType: 'summary',
            systemText: 'system prompt',
            baseUserText: 'base prompt',
            sections: [
                createContextSection('recent_history', 'User: hi', 'high', 'prunable'),
            ],
        }).diagnostics;

        reportContextCompaction(
            {
                logTelemetryEvent: event => telemetryEvents.push(event as unknown as Record<string, unknown>),
                recordAgentEvent: event => {
                    agentEvents.push(event as unknown as Record<string, unknown>);
                    return event;
                },
            },
            diagnostics,
            {
                usedFallback: true,
                reason: 'fallback_error',
                summaryLength: 128,
            },
        );

        expect(telemetryEvents).toHaveLength(1);
        expect(telemetryEvents[0].stage).toBe('context_compacted');
        expect((telemetryEvents[0].meta as Record<string, unknown>).usedFallback).toBe(true);
        expect(agentEvents).toHaveLength(1);
        expect(agentEvents[0].step).toBe('context_compacted');
    });

    it('refreshes oversized history into a compacted summary for non-summary calls', async () => {
        const managed = await prepareManagedContext({
            callType: 'chat',
            systemText: 'system',
            baseUserText: 'base',
            sections: [
                createContextSection('dataset_columns', 'Revenue, Cost, Profit\n'.repeat(900), 'required', 'sticky'),
                createContextSection('recent_history', 'H'.repeat(120000), 'high', 'prunable'),
                createContextSection('recent_query_trace', 'Q'.repeat(120000), 'high', 'prunable'),
            ],
            settings: createTestSettings({
                provider: 'google',
                language: 'English',
                simpleModel: 'custom-model',
                complexModel: 'custom-model',
                autoConfirmGoal: false,
            }),
            modelId: 'custom-model',
        });

        expect(managed.diagnostics.summaryRefreshTriggered).toBe(true);
        expect(managed.includedSections.some(section => section.key === 'compacted_history_summary')).toBe(true);
        expect(managed.estimatedPromptTokens).toBeLessThanOrEqual(managed.diagnostics.softBudget);
    });

    it('sanitizes technical messages to summary lines and truncates to per-entry cap', async () => {
        const { sanitizeChatHistoryForModel } = await import('../services/ai/contextManager');

        const messages: ChatMessage[] = [
            makeMessage('user', 'delete old rows'),
            {
                ...makeMessage('ai', 'Preview rows:\n' + JSON.stringify([{ id: 1, amount: 200 }]) + '\nConfirm delete / cancel delete.'),
                type: 'ai_mutation_confirmation',
                mutationConfirmation: {
                    request: 'delete old rows',
                    matchedRowCount: 42,
                    previewRows: [{ id: 1, amount: 200 }],
                } as never,
            },
            {
                ...makeMessage('ai', 'A'.repeat(500)),
                type: 'ai_cleaning_failure',
            },
        ];

        const sanitized = sanitizeChatHistoryForModel(messages);

        expect(sanitized).toHaveLength(3);
        expect(sanitized[0].text).toBe('delete old rows');
        expect(sanitized[1].text).toContain('staged a row deletion confirmation for 42 rows');
        expect(sanitized[1].text).not.toContain('Preview rows');
        expect(sanitized[2].text.length).toBeLessThanOrEqual(284);
    });

    it('collapses adjacent duplicate technical summaries', async () => {
        const { sanitizeChatHistoryForModel } = await import('../services/ai/contextManager');

        const traceMessage = (index: number): ChatMessage => ({
            ...makeMessage('ai', `Query ${index} ran`),
            type: 'ai_query_trace',
            queryTrace: {
                phase: 'analysis' as const,
                engine: 'duckdb' as const,
                returnedRows: 5,
                totalMatchedRows: 10,
                durationMs: 12,
            },
        });

        const messages: ChatMessage[] = [
            traceMessage(1),
            traceMessage(2),
        ];

        const sanitized = sanitizeChatHistoryForModel(messages);

        expect(sanitized).toHaveLength(1);
    });

    it('hides ai_thinking and ai_thought messages from model transcript', async () => {
        const { sanitizeChatHistoryForModel } = await import('../services/ai/contextManager');

        const messages: ChatMessage[] = [
            makeMessage('user', 'analyze revenue'),
            {
                ...makeMessage('ai', 'Thinking about the data...'),
                type: 'ai_thinking',
            },
            {
                ...makeMessage('ai', 'Internal thought process'),
                type: 'ai_thought',
            },
            {
                ...makeMessage('ai', 'Plan begins'),
                type: 'ai_plan_start',
            },
            makeMessage('ai', 'Revenue is $500k.'),
        ];

        const sanitized = sanitizeChatHistoryForModel(messages);

        expect(sanitized).toHaveLength(2);
        expect(sanitized[0].text).toBe('analyze revenue');
        expect(sanitized[1].text).toBe('Revenue is $500k.');
    });

    it('collapsed recent_history still works with sanitized content', async () => {
        const { formatCollapsedChatHistory: formatCollapsedChatHistoryDirect } = await import('../services/ai/contextManager');

        const messages: ChatMessage[] = [
            makeMessage('user', 'show data'),
            {
                ...makeMessage('ai', 'Internal thought'),
                type: 'ai_thinking',
            },
            makeMessage('ai', 'Here is the data.'),
        ];

        const collapsed = formatCollapsedChatHistoryDirect(messages);

        expect(collapsed).toContain('User: show data');
        expect(collapsed).toContain('Assistant: Here is the data.');
        expect(collapsed).not.toContain('Internal thought');
    });

    it('does not include Recent conversation in formatVisibleEvidenceSummary', () => {
        const visibleEvidence = formatVisibleEvidenceSummary({
            contextualSummary: null,
            activeDataQuery: null,
            activeMetricMappingValidation: null,
            activeSpreadsheetFilter: null,
            analysisCards: [],
            queryHistory: [],
            chatHistory: [
                makeMessage('user', 'hello'),
                makeMessage('ai', 'hi there'),
            ],
            cleaningRun: null,
            activeTurn: null,
        } as any);

        expect(visibleEvidence).not.toContain('Recent conversation');
    });
});
