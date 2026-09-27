// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { AppStore } from '../store/useAppStore';
import { buildWorkspaceBundle } from '../services/agent/buildWorkspaceBundle';

describe('buildWorkspaceBundle data query artifacts', () => {
    it('includes a bounded data query bundle file when a read-only query is active', () => {
        const state = {
            sessionId: 'session-1',
            currentDatasetId: 'dataset-1',
            confirmedAnalysisGoal: 'Inspect top revenue rows',
            settings: {
                provider: 'google',
                geminiApiKey: 'key',
                openAIApiKey: '',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'English',
                autoConfirmGoal: true,
            },
            csvData: {
                fileName: 'sales.csv',
                data: [{ Region: 'East', Revenue: 1200 }],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            rawCsvData: {
                fileName: 'sales.csv',
                data: [{ Region: 'East', Revenue: '1200' }],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
                intakeDetection: {
                    strategy: 'scored_candidate',
                    confidence: 'high',
                    delimiter: ',',
                    quoteChar: '"',
                    warnings: [],
                    candidateCount: 5,
                    parserErrorCount: 0,
                    sampledNonEmptyLines: 1,
                    topScore: 1,
                    runnerUpScore: 0.25,
                },
            },
            initialDataSample: [{ Region: 'East', Revenue: '1200' }],
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Revenue', type: 'numerical', missingPercentage: 0, valueRange: [1200, 1200] },
            ],
            analysisCards: [],
            chatHistory: [],
            dataPreparationPlan: null,
            activeDataQuery: {
                explanation: 'Top revenue rows.',
                plan: {
                    select: ['Region', 'Revenue'],
                    orderBy: [{ column: 'Revenue', direction: 'desc' }],
                    limit: 5,
                },
                result: {
                    rows: [{ Region: 'East', Revenue: 1200 }],
                    totalMatchedRows: 1,
                    returnedRows: 1,
                    truncated: false,
                    selectedColumns: ['Region', 'Revenue'],
                    appliedOrderBy: [{ column: 'Revenue', direction: 'desc' }],
                    appliedLimit: 5,
                    durationMs: 4,
                },
                appliedAt: new Date('2026-03-10T00:00:00.000Z'),
                source: 'execute_data_query',
                engine: 'duckdb',
                sqlPreview: 'SELECT "Region", "Revenue" FROM "session_clean_dataset"',
                tableName: 'session_clean_dataset',
                loadVersion: 'dataset-1',
                fallbackReason: null,
                fallbackFilterOperation: null,
            },
            dataQualityIssues: [],
            finalSummary: null,
            agentEvents: [],
            agentToolLogs: [],
            telemetryEvents: [],
            currentView: 'analysis_dashboard',
            spreadsheetFilterFunction: null,
            activeSpreadsheetFilter: {
                requestId: 'spreadsheet-filter-1',
                origin: 'spreadsheet_panel',
                query: 'East',
                operation: {
                    id: 'filter-east',
                    type: 'filter_rows',
                    reason: 'Keep East rows.',
                    predicates: [{ column: 'Region', operator: 'eq', value: 'East' }],
                },
                observation: {
                    selectedColumn: 'Region',
                    operator: 'eq',
                    value: 'East',
                    matchedRowCount: 1,
                    previewRows: [{ Region: 'East', Revenue: 1200 }],
                },
                finalReply: 'I applied a temporary data filter in the raw data explorer for rows where Region equals "East". It matched 1 row.',
                appliedAt: new Date('2026-03-10T00:00:03.000Z'),
            },
            aiFilterExplanation: null,
            workspaceFiles: {
                '/workspace/notes.md': '# Notes',
                '/workspace/report_context.json': '{"reportTitle":"Revenue Report"}',
            },
            workspaceActionHistory: [],
            queryHistory: [
                {
                    id: 'query-1',
                    phase: 'analysis',
                    explanation: 'Top revenue rows.',
                    engine: 'duckdb',
                    sqlPreview: 'SELECT * FROM session_clean_dataset',
                    tableName: 'session_clean_dataset',
                    loadVersion: 'dataset-1',
                    fallbackReason: null,
                    appliedAt: new Date('2026-03-10T00:00:02.000Z'),
                    plan: {
                        select: ['Region', 'Revenue'],
                        limit: 5,
                    },
                    result: {
                        totalMatchedRows: 1,
                        returnedRows: 1,
                        truncated: false,
                        selectedColumns: ['Region', 'Revenue'],
                        appliedOrderBy: [],
                        appliedLimit: 5,
                        durationMs: 4,
                        previewRows: [{ Region: 'East', Revenue: 1200 }],
                    },
                },
            ],
        } as unknown as AppStore;

        const bundle = buildWorkspaceBundle(state);
        const file = bundle.files.find(entry => entry.path === '/chat/data-query.json');
        const queryHistoryFile = bundle.files.find(entry => entry.path === '/chat/query-history.json');
        const workspaceFile = bundle.primaryFiles.find(entry => entry.path === '/workspace/notes.md');
        const datasetFile = bundle.primaryFiles.find(entry => entry.path === '/dataset/cleaned.csv');
        const debugFile = bundle.debugFiles.find(entry => entry.path === '/chat/data-query.json');
        const cardSnapshotFile = bundle.debugFiles.find(entry => entry.path === '/analysis/card-snapshot.json');
        const toolPolicyFile = bundle.debugFiles.find(entry => entry.path === '/context/tool-policy.json');
        const toolDiagnosticsFile = bundle.debugFiles.find(entry => entry.path === '/context/tool-diagnostics.json');
        const intakeDiagnosticsFile = bundle.debugFiles.find(entry => entry.path === '/cleaning/intake-diagnostics.json');

        expect(file).toBeTruthy();
        expect(queryHistoryFile?.content).toContain('"phase": "analysis"');
        expect(queryHistoryFile?.content).toContain('"policyDecision": "allowed"');
        expect(queryHistoryFile?.content).toContain('"correlation"');
        expect(file?.content).toContain('"active": true');
        expect(file?.content).toContain('"engine": "duckdb"');
        expect(file?.content).toContain('"correlation"');
        expect(file?.content).toContain('"sqlPreview"');
        expect(file?.content).toContain('"selectedColumns"');
        expect(file?.content).toContain('"previewRows"');
        expect(bundle.files.find(entry => entry.path === '/chat/spreadsheet-filter.json')?.content).toContain('"requestId": "spreadsheet-filter-1"');
        expect(bundle.files.find(entry => entry.path === '/chat/spreadsheet-filter.json')?.content).toContain('"matchedRowCount": 1');
        expect(datasetFile?.group).toBe('dataset');
        expect(workspaceFile?.group).toBe('workspace');
        expect(debugFile?.group).toBe('debug');
        expect(cardSnapshotFile).toBeTruthy();
        expect(intakeDiagnosticsFile?.content).toContain('"strategy": "scored_candidate"');
        expect(intakeDiagnosticsFile?.content).toContain('"confidence": "high"');
        expect(intakeDiagnosticsFile?.content).toContain('"delimiter": ","');
        expect(intakeDiagnosticsFile?.content).toContain('"warnings": []');
        expect(intakeDiagnosticsFile?.content).toContain('"rawRowCount": 1');
        expect(toolPolicyFile?.content).toContain('"stage": "analysis"');
        expect(toolDiagnosticsFile).toBeTruthy();
        expect(bundle.primaryFiles.some(entry => entry.path === '/chat/data-query.json')).toBe(false);
        expect(bundle.editableFiles.map(entry => entry.path)).toEqual(expect.arrayContaining([
            '/workspace/notes.md',
            '/workspace/report_context.json',
            '/dataset/cleaned.csv',
        ]));
        expect(bundle.primaryFiles.map(entry => entry.path)).toEqual(expect.arrayContaining([
            '/dataset/raw.csv',
            '/dataset/cleaned.csv',
            '/workspace/report_context.json',
        ]));
        expect(bundle.summary.reportTitle).toBe('Region Revenue');
    });
});
