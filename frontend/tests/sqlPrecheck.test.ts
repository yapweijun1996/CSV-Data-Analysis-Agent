import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnProfile, CsvData, Settings } from '../types';
import { runSqlPrecheck } from '../services/agent/execution/sqlPrecheck';
import { createTestSettings } from './testSettings';

const { executeManagedDataQueryMock, evaluateAiSqlPrecheckMock } = vi.hoisted(() => ({
    executeManagedDataQueryMock: vi.fn(),
    evaluateAiSqlPrecheckMock: vi.fn(),
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    executeManagedDataQuery: executeManagedDataQueryMock,
}));

vi.mock('../services/ai/sqlPrecheckEvaluator', () => ({
    evaluateAiSqlPrecheck: evaluateAiSqlPrecheckMock,
}));

describe('runSqlPrecheck', () => {
    const settings: Settings = createTestSettings({
        provider: 'google',
        geminiApiKey: 'key',
        simpleModel: 'gemini-3.1-flash-lite-preview',
        complexModel: 'gemini-3.1-flash-lite-preview',
        language: 'English',
        autoConfirmGoal: true,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        evaluateAiSqlPrecheckMock.mockResolvedValue(null);
    });

    it('passes through when AI precheck is unavailable', async () => {
        const dataset: CsvData = {
            fileName: 'finance.csv',
            data: [
                { Project: 'A', Amount: 0 },
                { Project: 'B', Amount: 0 },
            ],
        };
        const profiles: ColumnProfile[] = [
            { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Amount', type: 'currency', missingPercentage: 0, valueRange: [0, 0] },
        ];

        executeManagedDataQueryMock.mockResolvedValue({
            result: { rows: [{ Project: 'A', avg_Amount: 0 }, { Project: 'B', avg_Amount: 0 }] },
        });

        const report = await runSqlPrecheck(dataset, profiles);

        expect(report.status).toBe('passed');
        expect(report.summary).toContain('AI SQL precheck was unavailable');
        expect(report.findings.some(finding => finding.severity === 'warn')).toBe(true);
        expect(report.plannerGuidance?.nextAction).toBe('skip_sql_gate');
        expect(report.evaluatedPairs).toEqual([]);
        expect(executeManagedDataQueryMock).not.toHaveBeenCalled();
    });

    it('returns warning guidance when AI finds no confirmed grouped path', async () => {
        const dataset: CsvData = {
            fileName: 'finance.csv',
            data: [
                { Project: 'A', ProfitPct: 10 },
                { Project: 'B', ProfitPct: 10 },
            ],
        };
        const profiles: ColumnProfile[] = [
            { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'ProfitPct', type: 'percentage', missingPercentage: 0, valueRange: [10, 10] },
        ];

        evaluateAiSqlPrecheckMock.mockResolvedValue({
            status: 'blocked',
            summary: 'No stable grouped path was identified.',
            candidatePairs: [],
            findings: [
                {
                    kind: 'constant_metric',
                    severity: 'warn',
                    metric: 'ProfitPct',
                    message: 'ProfitPct is flat across the sample.',
                },
            ],
        });

        const report = await runSqlPrecheck(dataset, profiles, settings);

        expect(report.status).toBe('warning');
        expect(report.findings.some(finding => finding.kind === 'constant_metric')).toBe(true);
        expect(report.findings.some(finding => finding.kind === 'low_distinct_dimension')).toBe(false);
        expect(report.plannerGuidance?.nextAction).toBe('continue_with_degraded_guidance');
        expect(report.plannerGuidance?.preferredPairs).toEqual([]);
        expect(executeManagedDataQueryMock).not.toHaveBeenCalled();
    });

    it('does not query numeric identifier columns when AI nominates a business pair', async () => {
        const dataset: CsvData = {
            fileName: 'cleaned.csv',
            data: [
                { SeriesKey: 'P1', Code: 501001, SourceRowIndex: 0, Value: 100 },
                { SeriesKey: 'P2', Code: 501002, SourceRowIndex: 1, Value: 250 },
            ],
        };
        const profiles: ColumnProfile[] = [
            { name: 'SeriesKey', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Code', type: 'numerical', uniqueValues: 2, missingPercentage: 0, valueRange: [501001, 501002] },
            { name: 'SourceRowIndex', type: 'numerical', uniqueValues: 2, missingPercentage: 0, valueRange: [0, 1] },
            { name: 'Value', type: 'currency', uniqueValues: 2, missingPercentage: 0, valueRange: [100, 250] },
        ];

        evaluateAiSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'Value by SeriesKey looks viable.',
            findings: [],
            candidatePairs: [
                {
                    dimension: 'SeriesKey',
                    metric: 'Value',
                    confidence: 'high',
                    reason: 'SeriesKey splits the business rows and Value is the amount field.',
                },
            ],
        });
        executeManagedDataQueryMock.mockImplementation(async (_dataset, plan) => ({
            result: {
                rows: [
                    { SeriesKey: 'P1', [plan.aggregates?.[0]?.as ?? 'avg_Value']: 100 },
                    { SeriesKey: 'P2', [plan.aggregates?.[0]?.as ?? 'avg_Value']: 250 },
                ],
            },
        }));

        const report = await runSqlPrecheck(dataset, profiles, settings);

        expect(report.status).toBe('passed');
        expect(report.plannerGuidance?.nextAction).toBe('continue_sql_analysis');
        expect(report.plannerGuidance?.preferredPairs).toHaveLength(1);
        expect(report.evaluatedPairs?.[0]?.verificationStatus).toBe('viable');
        expect(report.findings.some(finding => finding.metric === 'Code')).toBe(false);
        expect(report.findings.some(finding => finding.metric === 'SourceRowIndex')).toBe(false);
        expect(executeManagedDataQueryMock).toHaveBeenCalledTimes(1);
        expect(executeManagedDataQueryMock.mock.calls[0]?.[1]?.aggregates?.[0]?.column).toBe('Value');
    });

    it('passes when AI leaves at least one grouped metric-dimension pair viable after verification', async () => {
        const dataset: CsvData = {
            fileName: 'statement.csv',
            data: [
                { Description: 'Revenue', Value: 1200, MarginPct: 50 },
                { Description: 'Cost of Sales', Value: 900, MarginPct: 50 },
                { Description: 'Gross Profit', Value: 300, MarginPct: 50 },
            ],
        };
        const profiles: ColumnProfile[] = [
            { name: 'Description', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
            { name: 'MarginPct', type: 'percentage', uniqueValues: 1, missingPercentage: 0, valueRange: [50, 50] },
            { name: 'Value', type: 'currency', uniqueValues: 3, missingPercentage: 0, valueRange: [300, 1200] },
        ];

        evaluateAiSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'Value by Description looks viable, MarginPct is less useful.',
            findings: [
                {
                    kind: 'constant_metric',
                    severity: 'warn',
                    metric: 'MarginPct',
                    message: 'MarginPct is flat across the sample.',
                },
            ],
            candidatePairs: [
                {
                    dimension: 'Description',
                    metric: 'Value',
                    confidence: 'high',
                    reason: 'Description contains business labels and Value is the amount field.',
                },
            ],
        });
        executeManagedDataQueryMock.mockImplementation(async (_dataset, plan) => {
            return {
                result: {
                    rows: [
                        { Description: 'Revenue', avg_Value: 1200 },
                        { Description: 'Cost of Sales', avg_Value: 900 },
                        { Description: 'Gross Profit', avg_Value: 300 },
                    ],
                },
            };
        });

        const report = await runSqlPrecheck(dataset, profiles, settings);

        expect(report.status).toBe('passed');
        expect(report.findings.some(finding => finding.metric === 'MarginPct' && finding.severity === 'warn')).toBe(true);
        expect(report.plannerGuidance?.preferredPairs.map(pair => `${pair.metric}:${pair.dimension}`)).toEqual(['Value:Description']);
        expect(executeManagedDataQueryMock).toHaveBeenCalledTimes(1);
    });

    it('prefers AI-nominated pairs when settings are available', async () => {
        const dataset: CsvData = {
            fileName: 'statement.csv',
            data: [
                { Description: 'Revenue', Value: 1200, Code: 501001 },
                { Description: 'Cost of Sales', Value: 900, Code: 501002 },
            ],
        };
        const profiles: ColumnProfile[] = [
            { name: 'Description', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Value', type: 'currency', uniqueValues: 2, missingPercentage: 0, valueRange: [900, 1200] },
            { name: 'Code', type: 'numerical', uniqueValues: 2, missingPercentage: 0, valueRange: [501001, 501002] },
        ];

        evaluateAiSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'AI found one stable grouped path.',
            findings: [],
            candidatePairs: [
                {
                    dimension: 'Description',
                    metric: 'Value',
                    confidence: 'high',
                    reason: 'Business labels grouped by the numeric amount column.',
                },
            ],
        });
        executeManagedDataQueryMock.mockResolvedValue({
            result: {
                rows: [
                    { Description: 'Revenue', avg_Value: 1200 },
                    { Description: 'Cost of Sales', avg_Value: 900 },
                ],
            },
        });

        const report = await runSqlPrecheck(dataset, profiles, settings);

        expect(report.status).toBe('passed');
        expect(evaluateAiSqlPrecheckMock).toHaveBeenCalledTimes(1);
        expect(executeManagedDataQueryMock).toHaveBeenCalledTimes(1);
        expect(report.plannerGuidance?.nextAction).toBe('continue_sql_analysis');
        expect(executeManagedDataQueryMock.mock.calls[0]?.[1]?.groupBy).toEqual(['Description']);
        expect(executeManagedDataQueryMock.mock.calls[0]?.[1]?.aggregates?.[0]?.column).toBe('Value');
    });

    it('returns retry guidance when only some AI-nominated pairs survive query validation', async () => {
        const dataset: CsvData = {
            fileName: 'statement.csv',
            data: [
                { Description: 'Revenue', Value: 1200, MarginPct: 50 },
                { Description: 'Cost of Sales', Value: 900, MarginPct: 50 },
                { Description: 'Gross Profit', Value: 300, MarginPct: 50 },
            ],
        };
        const profiles: ColumnProfile[] = [
            { name: 'Description', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
            { name: 'Value', type: 'currency', uniqueValues: 3, missingPercentage: 0, valueRange: [300, 1200] },
            { name: 'MarginPct', type: 'percentage', uniqueValues: 1, missingPercentage: 0, valueRange: [50, 50] },
        ];

        evaluateAiSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'Value by Description looks viable, MarginPct should be checked.',
            findings: [],
            candidatePairs: [
                {
                    dimension: 'Description',
                    metric: 'Value',
                    confidence: 'high',
                    reason: 'Description contains business labels and Value is the amount field.',
                },
                {
                    dimension: 'Description',
                    metric: 'MarginPct',
                    confidence: 'medium',
                    reason: 'MarginPct is numeric but may be too flat.',
                },
            ],
        });
        executeManagedDataQueryMock
            .mockResolvedValueOnce({
                result: {
                    rows: [
                        { Description: 'Revenue', avg_Value: 1200 },
                        { Description: 'Cost of Sales', avg_Value: 900 },
                        { Description: 'Gross Profit', avg_Value: 300 },
                    ],
                },
            })
            .mockResolvedValueOnce({
                result: {
                    rows: [
                        { Description: 'Revenue', avg_MarginPct: 50 },
                        { Description: 'Cost of Sales', avg_MarginPct: 50 },
                        { Description: 'Gross Profit', avg_MarginPct: 50 },
                    ],
                },
            });

        const report = await runSqlPrecheck(dataset, profiles, settings);

        expect(report.status).toBe('passed');
        expect(report.plannerGuidance?.nextAction).toBe('retry_with_verified_pairs_only');
        expect(report.plannerGuidance?.preferredPairs.map(pair => pair.metric)).toEqual(['Value']);
        expect(report.plannerGuidance?.rejectedPairs.map(pair => pair.metric)).toEqual(['MarginPct']);
        expect(report.evaluatedPairs?.find(pair => pair.metric === 'MarginPct')?.verificationStatus).toBe('quality_warning');
    });

    it('falls back to native verification when DuckDB workers are unavailable in node-like environments', async () => {
        const dataset: CsvData = {
            fileName: 'statement.csv',
            data: [
                { Description: 'Revenue', Value: 1200 },
                { Description: 'Cost of Sales', Value: 900 },
                { Description: 'Gross Profit', Value: 300 },
            ],
        };
        const profiles: ColumnProfile[] = [
            { name: 'Description', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
            { name: 'Value', type: 'currency', uniqueValues: 3, missingPercentage: 0, valueRange: [300, 1200] },
        ];

        evaluateAiSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'Value by Description looks viable.',
            findings: [],
            candidatePairs: [
                {
                    dimension: 'Description',
                    metric: 'Value',
                    confidence: 'high',
                    reason: 'Description contains business labels and Value is the amount field.',
                },
            ],
        });
        executeManagedDataQueryMock
            .mockRejectedValueOnce(new Error('Worker is not defined'))
            .mockResolvedValueOnce({
                result: {
                    rows: [
                        { Description: 'Revenue', avg_Value: 1200 },
                        { Description: 'Cost of Sales', avg_Value: 900 },
                        { Description: 'Gross Profit', avg_Value: 300 },
                    ],
                },
                engine: 'native',
            });

        const report = await runSqlPrecheck(dataset, profiles, settings);

        expect(report.status).toBe('passed');
        expect(report.evaluatedPairs?.[0]?.verificationStatus).toBe('viable');
        expect(report.evaluatedPairs?.[0]?.verificationMessage).toContain('native fallback');
        expect(report.findings.some(finding => finding.kind === 'parse_failures_remaining')).toBe(false);
        expect(executeManagedDataQueryMock).toHaveBeenCalledTimes(2);
        expect(executeManagedDataQueryMock.mock.calls[0]?.[3]?.allowNativeFallback).toBe(false);
        expect(executeManagedDataQueryMock.mock.calls[1]?.[3]?.allowNativeFallback).toBe(true);
    });

    it('returns warning guidance when query validation leaves no usable pair', async () => {
        const dataset: CsvData = {
            fileName: 'statement.csv',
            data: [
                { Description: 'Revenue', MarginPct: 50 },
                { Description: 'Cost of Sales', MarginPct: 50 },
            ],
        };
        const profiles: ColumnProfile[] = [
            { name: 'Description', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'MarginPct', type: 'percentage', uniqueValues: 1, missingPercentage: 0, valueRange: [50, 50] },
        ];

        evaluateAiSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'MarginPct by Description needs verification.',
            findings: [],
            candidatePairs: [
                {
                    dimension: 'Description',
                    metric: 'MarginPct',
                    confidence: 'medium',
                    reason: 'Description is the only business dimension.',
                },
            ],
        });
        executeManagedDataQueryMock.mockResolvedValue({
            result: {
                rows: [
                    { Description: 'Revenue', avg_MarginPct: 50 },
                    { Description: 'Cost of Sales', avg_MarginPct: 50 },
                ],
            },
        });

        const report = await runSqlPrecheck(dataset, profiles, settings);

        expect(report.status).toBe('warning');
        expect(report.plannerGuidance?.nextAction).toBe('continue_with_degraded_guidance');
        expect(report.plannerGuidance?.preferredPairs).toEqual([]);
        expect(report.evaluatedPairs?.[0]?.verificationStatus).toBe('quality_warning');
        expect(report.findings.every(finding => finding.severity === 'warn')).toBe(true);
    });
});
