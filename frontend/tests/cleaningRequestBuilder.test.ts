// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildCleaningRequest } from '../services/agent/orchestration/cleaningRequestBuilder';
import { WORKSPACE_REPORT_CONTEXT_JSON } from '../services/agent/workspaceFileUtils';

const createStore = (intakeDetection?: Record<string, unknown>) => ({
    getState: () => ({
        sessionId: 'session-test',
        currentView: 'analysis_dashboard',
        currentDatasetId: 'dataset-test',
        settings: {
            provider: 'google',
            geminiApiKey: 'key',
            openAIApiKey: '',
            simpleModel: 'gemini-3-flash-preview',
            complexModel: 'gemini-3-flash-preview',
            language: 'English',
            autoConfirmGoal: false,
            runtimeAccessControl: {
                permissionMode: 'balanced',
                toolOverrides: {},
                workspaceRules: { deniedPathPrefixes: [] },
            },
        },
        columnProfiles: [
            { name: 'Region', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Revenue', type: 'numerical', missingPercentage: 0, valueRange: [10, 20] },
        ],
        dataPreparationPlan: null,
        dataQualityIssues: [],
        initialDataSample: null,
        reportContextResolution: null,
        agentEvents: [],
        agentToolLogs: [],
        telemetryEvents: [],
        rawCsvData: {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: '10' }],
            metadataRows: [],
            summaryRows: [],
            headerDepth: 1,
            intakeDetection,
        },
        csvData: {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 10 }],
            metadataRows: [],
            summaryRows: [],
            headerDepth: 1,
        },
        activeSpreadsheetFilter: null,
        spreadsheetFilterFunction: null,
        aiFilterExplanation: null,
        activeDataQuery: null,
        workspaceFiles: {
            [WORKSPACE_REPORT_CONTEXT_JSON]: '{"reportTitle":"Sales Report"}',
        },
        workspaceActionHistory: [],
        analysisCards: [],
        cleaningRun: null,
    }),
    setState: () => undefined,
});

const strategyDecision = {
    kind: 'llm_guided',
    targetShape: 'row_table',
    reason: 'Inspect and normalize the current dataset.',
    verificationGap: null,
    promptGuidance: 'Inspect the raw structure before deciding the next deterministic edit.',
    preferredAction: null,
} as any;

describe('buildCleaningRequest intake diagnostics guidance', () => {
    it('injects csv intake diagnostics and inspect-first guidance for blocked structure warnings', () => {
        const store = createStore({
            strategy: 'papaparse_auto_fallback',
            confidence: 'low',
            delimiter: ';',
            quoteChar: null,
            warnings: [
                {
                    code: 'parse_errors',
                    message: 'Parser reported 2 issues while evaluating the selected CSV dialect.',
                },
            ],
            candidateCount: 5,
            parserErrorCount: 2,
            sampledNonEmptyLines: 12,
            topScore: 0.62,
            runnerUpScore: 0.58,
        });

        const { request } = buildCleaningRequest(store as never, { phase: 'inspect' } as never, null, strategyDecision);
        const userMessage = String(request.messages[1]?.content ?? '');

        expect(userMessage).toContain('**phase context**');
        expect(userMessage).toContain('"parserErrorCount": 2');
        expect(userMessage).toContain('do not assume the current header boundary is final');
        expect(userMessage).toContain('do not treat cleaned.csv as query-ready');
        expect(userMessage).not.toContain('**report shape detector (advisory only)**');
        expect(userMessage).not.toContain('**reshape hypotheses**');
    });

    it('keeps the diagnostics section but avoids blocking guidance for clean inputs', () => {
        const store = createStore({
            strategy: 'scored_candidate',
            confidence: 'high',
            delimiter: ',',
            quoteChar: '"',
            warnings: [],
            candidateCount: 5,
            parserErrorCount: 0,
            sampledNonEmptyLines: 8,
            topScore: 0.96,
            runnerUpScore: 0.3,
        });

        const { request } = buildCleaningRequest(store as never, { phase: 'inspect' } as never, null, strategyDecision);
        const userMessage = String(request.messages[1]?.content ?? '');

        expect(userMessage).toContain('**phase context**');
        expect(userMessage).not.toContain('inspect raw.csv and report_context.json before deciding any mutate step');
        expect(userMessage).not.toContain('do not treat cleaned.csv as query-ready');
    });
});
