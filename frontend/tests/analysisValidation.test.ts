// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildAnalysisIntentBrief } from '../services/agent/analysisBrief';
import { validateAnalysisBrief, validateDeriveMetricOperationAgainstBrief } from '../services/agent/analysisValidation';

describe('analysisValidation', () => {
    it('keeps stable metric-column profit semantics free of blocking issues', () => {
        const brief = buildAnalysisIntentBrief({
            columns: [
                { name: 'Project', type: 'categorical' },
                { name: 'Revenue', type: 'currency' },
                { name: 'Cost', type: 'currency' },
            ] as never,
            csvData: {
                data: [
                    { Project: 'Alpha', Revenue: 100, Cost: 40 },
                    { Project: 'Beta', Revenue: 80, Cost: 30 },
                ],
            } as never,
            dataPreparationPlan: null,
        });

        const issues = validateAnalysisBrief(brief, ['profit']);

        expect(issues).toEqual([]);
    });

    it('flags missing metric definitions when the requested business metric cannot be validated', () => {
        const brief = buildAnalysisIntentBrief({
            columns: [
                { name: 'Project', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ] as never,
            csvData: {
                data: [
                    { Project: 'Alpha', Value: 100 },
                    { Project: 'Beta', Value: 80 },
                ],
            } as never,
            dataPreparationPlan: null,
        });

        const issues = validateAnalysisBrief(brief, ['profit']);

        expect(issues).toEqual([
            expect.objectContaining({
                code: 'metric_definition_missing',
                severity: 'error',
                metricName: 'profit',
            }),
        ]);
    });

    it('flags derive_metric_by_label plans that do not align with detected semantics', () => {
        const brief = buildAnalysisIntentBrief({
            columns: [
                { name: 'Project', type: 'categorical' },
                { name: 'Description', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ] as never,
            csvData: {
                data: [
                    { Project: 'Alpha', Description: 'Revenue', Value: 100 },
                    { Project: 'Alpha', Description: 'Cost of Sales', Value: 40 },
                ],
            } as never,
            dataPreparationPlan: {
                explanation: 'Already reshaped.',
                operations: [{ id: 'reshape', type: 'unpivot_columns', reason: 'Reshape report.' }],
                outputColumns: [],
            } as never,
        });

        const issues = validateDeriveMetricOperationAgainstBrief(brief, {
            id: 'derive-profit',
            type: 'derive_metric_by_label',
            reason: 'Append profit rows.',
            metricName: 'profit',
            groupByColumns: ['Project'],
            labelColumn: 'MetricName',
            valueColumn: 'Amount',
            outputMetricLabel: 'Profit',
            expectedInputs: ['Revenue', 'Cost of Sales'],
            formula: {
                kind: 'linear_combination',
                components: [
                    { operator: 'add', matchAny: ['revenue'] },
                    { operator: 'subtract', matchAny: ['cost'] },
                ],
            },
        });

        expect(issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                code: 'metric_definition_missing',
                severity: 'error',
                message: expect.stringContaining('labelColumn "MetricName"'),
            }),
            expect.objectContaining({
                code: 'missing_numeric_value',
                severity: 'error',
                message: expect.stringContaining('valueColumn "Amount"'),
            }),
        ]));
    });
});
