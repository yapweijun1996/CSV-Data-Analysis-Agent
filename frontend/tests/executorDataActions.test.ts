// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { validateMetricDerivationPreflight } from '../services/agent/execution/metricDerivationPreflight';

describe('executeDataOperationsAction', () => {
    it('blocks derive_metric_by_label when the requested mapping does not match detected metric semantics', async () => {
        const result = validateMetricDerivationPreflight({
            columnProfiles: [
                { name: 'Project', type: 'categorical' },
                { name: 'Description', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ] as never,
            csvData: {
                fileName: 'dataset.csv',
                data: [
                    { Project: 'Alpha', Description: 'Revenue', Value: 100 },
                    { Project: 'Alpha', Description: 'Cost of Sales', Value: 40 },
                ],
            },
            dataPreparationPlan: {
                explanation: 'Already reshaped.',
                operations: [{ id: 'reshape', type: 'unpivot_columns', reason: 'Reshape report.', sourceColumns: ['Description'], keyColumn: 'MetricName', valueColumn: 'Amount' }],
                outputColumns: [],
                planStatus: 'operations',
                consistencyIssues: [],
            },
            operation: {
                id: 'derive-profit',
                type: 'derive_metric_by_label',
                reason: 'Append profit rows.',
                metricName: 'profit',
                groupByColumns: ['Project'],
                labelColumn: 'MetricName',
                valueColumn: 'Amount',
                outputMetricLabel: 'Profit',
                formula: {
                    kind: 'linear_combination',
                    components: [
                        { operator: 'add', matchAny: ['revenue'] },
                        { operator: 'subtract', matchAny: ['cost'] },
                    ],
                },
            },
        });

        expect(result).not.toBeNull();
        expect(result).toMatchObject({
            status: 'blocked',
            toolName: 'data.mutate',
            retryHint: expect.stringContaining('Repair the metric mapping'),
            observation: {
                code: 'validation_failed',
            },
            artifactMetadata: {
                artifactType: 'dataset_mutation_attempt',
                targetMetric: 'Profit',
            },
        });
        expect(result?.observation?.detail).toMatchObject({
            validationIssues: expect.arrayContaining([
                expect.objectContaining({
                    code: 'metric_definition_missing',
                    severity: 'error',
                }),
            ]),
            artifactMetadata: expect.objectContaining({
                artifactType: 'dataset_mutation_attempt',
            }),
        });
    });

    it('returns null when derive_metric_by_label aligns with detected row-label semantics', () => {
        const result = validateMetricDerivationPreflight({
            columnProfiles: [
                { name: 'Project', type: 'categorical' },
                { name: 'Description', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ] as never,
            csvData: {
                fileName: 'dataset.csv',
                data: [
                    { Project: 'Alpha', Description: 'Revenue', Value: 100 },
                    { Project: 'Alpha', Description: 'Cost of Sales', Value: 40 },
                ],
            },
            dataPreparationPlan: {
                explanation: 'Already reshaped.',
                operations: [{ id: 'reshape', type: 'unpivot_columns', reason: 'Reshape report.', sourceColumns: ['Description'], keyColumn: 'Description', valueColumn: 'Value' }],
                outputColumns: [],
                planStatus: 'operations',
                consistencyIssues: [],
            },
            operation: {
                id: 'derive-profit',
                type: 'derive_metric_by_label',
                reason: 'Append profit rows.',
                metricName: 'profit',
                groupByColumns: ['Project'],
                labelColumn: 'Description',
                valueColumn: 'Value',
                outputMetricLabel: 'Profit',
                expectedInputs: ['Revenue', 'Cost of Sales'],
                formula: {
                    kind: 'linear_combination',
                    components: [
                        { operator: 'add', matchAny: ['revenue'] },
                        { operator: 'subtract', matchAny: ['cost'] },
                    ],
                },
            },
        });

        expect(result).toBeNull();
    });

    it('returns null for plural cost-form labels that fall outside word-boundary cost patterns', () => {
        // "PROJECT COSTS OF SALES" uses plural "COSTS" which does not match
        // the word-boundary pattern /\bcost\b/i used in formula polarity
        // checks. The brief still creates a profit definition (from revenue
        // bindings alone), and all structural checks pass, so validation
        // returns null.
        const result = validateMetricDerivationPreflight({
            columnProfiles: [
                { name: 'Project', type: 'categorical' },
                { name: 'Description', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ] as never,
            csvData: {
                fileName: 'dataset.csv',
                data: [
                    { Project: 'Alpha', Description: 'Revenue', Value: 100 },
                    { Project: 'Alpha', Description: 'PROJECT COSTS OF SALES', Value: 40 },
                ],
            },
            dataPreparationPlan: {
                explanation: 'Already reshaped.',
                operations: [{ id: 'reshape', type: 'unpivot_columns', reason: 'Reshape report.', sourceColumns: ['Description'], keyColumn: 'Description', valueColumn: 'Value' }],
                outputColumns: [],
                planStatus: 'operations',
                consistencyIssues: [],
            },
            operation: {
                id: 'derive-profit',
                type: 'derive_metric_by_label',
                reason: 'Append profit rows.',
                metricName: 'profit',
                groupByColumns: ['Project'],
                labelColumn: 'Description',
                valueColumn: 'Value',
                outputMetricLabel: 'Profit',
                expectedInputs: ['Revenue', 'PROJECT COSTS OF SALES'],
                formula: {
                    kind: 'linear_combination',
                    components: [
                        { operator: 'add', matchAny: ['Revenue', 'PROJECT COSTS OF SALES'] },
                    ],
                },
            },
        });

        expect(result).toBeNull();
    });
});
