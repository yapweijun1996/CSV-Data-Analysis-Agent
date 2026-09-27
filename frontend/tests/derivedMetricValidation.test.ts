// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { DeriveColumnOperation } from '../types';
import {
    buildDerivedMetricDeclaration,
    isDerivedMetricWarningExplicitlyConfirmed,
    validateDerivedMetricOperation,
} from '../services/agent/execution/derivedMetricValidation';
import { normalizeDataMutatePayload } from '../services/agent/execution/dataOperationRunner';
import { executeDataOperationsAction } from '../services/agent/execution/executorDataActions';
import { buildDatasetVersionId } from '../utils/datasetId';

const ratioOperation = (validationMode: 'strict' | 'warn' = 'strict'): DeriveColumnOperation => ({
    id: 'derive-margin',
    type: 'derive_column',
    reason: 'Measure profit relative to revenue.',
    newColumn: 'Margin',
    expression: {
        kind: 'ratio',
        numerator: { kind: 'column', column: 'Profit' },
        denominator: { kind: 'column', column: 'Revenue' },
    },
    validationMode,
});

describe('derived metric declaration and validation', () => {
    it('normalizes every derived metric into an inspectable declaration before execution', () => {
        const normalized = normalizeDataMutatePayload({
            explanation: 'Derive margin.',
            operations: [ratioOperation()],
            outputColumns: [],
        }).plan;
        const operation = normalized?.operations[0];

        expect(operation).toMatchObject({
            type: 'derive_column',
            validationMode: 'strict',
            declaration: {
                metricName: 'Margin',
                operation: 'ratio',
                sourceColumns: ['Profit', 'Revenue'],
                grain: ['source row'],
                units: 'ratio',
                assumptions: expect.arrayContaining([
                    'Measure profit relative to revenue.',
                ]),
                businessMeaning: 'Measure profit relative to revenue.',
            },
        });
        expect((operation as DeriveColumnOperation).declaration?.formula).toContain('"kind":"ratio"');
    });

    it('rejects malformed derived expressions without crashing declaration normalization', () => {
        const normalized = normalizeDataMutatePayload({
            explanation: 'Attempt an unsupported expression.',
            operations: [{
                id: 'derive-bad',
                type: 'derive_column',
                reason: 'Unsupported expression.',
                newColumn: 'Bad',
                expression: { kind: 'constant', value: 99 },
            }],
            outputColumns: [],
        });

        expect(normalized.rawOperationCount).toBe(1);
        expect(normalized.plan?.operations).toEqual([]);
    });

    it('uses tolerance bands for denominator safety and requires confirmation for a warning', () => {
        const rows = Array.from({ length: 100 }, (_, index) => ({
            Profit: 10,
            Revenue: index < 3 ? 0 : 100,
        }));
        const inputVersionId = buildDatasetVersionId('margin.csv', rows);
        const validation = validateDerivedMetricOperation({
            inputRows: rows,
            operation: ratioOperation(),
            inputVersionId,
        });

        expect(validation.status).toBe('warn');
        expect(validation.requiresConfirmation).toBe(true);
        expect(validation.signals).toEqual(expect.arrayContaining([
            expect.objectContaining({
                code: 'denominator_safety',
                status: 'warn',
                measuredRate: 0.03,
                passThreshold: 0.02,
                warnThreshold: 0.05,
            }),
        ]));
    });

    it('fails unsafe denominator behavior above the warning tolerance', () => {
        const rows = Array.from({ length: 100 }, (_, index) => ({
            Profit: 10,
            Revenue: index < 6 ? 0 : 100,
        }));
        const validation = validateDerivedMetricOperation({
            inputRows: rows,
            operation: ratioOperation(),
            inputVersionId: buildDatasetVersionId('margin.csv', rows),
        });

        expect(validation.status).toBe('fail');
        expect(validation.requiresConfirmation).toBe(false);
        expect(validation.signals.find(signal => signal.code === 'denominator_safety'))
            .toMatchObject({ status: 'fail', measuredRate: 0.06 });
    });

    it('reconciles preview output and records both recoverable version references', () => {
        const rows = [
            { Profit: 20, Revenue: 100 },
            { Profit: 15, Revenue: 50 },
        ];
        const outputRows = [
            { Profit: 20, Revenue: 100, Margin: 0.2 },
            { Profit: 15, Revenue: 50, Margin: 0.3 },
        ];
        const inputVersionId = buildDatasetVersionId('margin.csv', rows);
        const outputVersionId = buildDatasetVersionId('margin.csv', outputRows);
        const validation = validateDerivedMetricOperation({
            inputRows: rows,
            outputRows,
            operation: ratioOperation(),
            inputVersionId,
            outputVersionId,
        });

        expect(validation.status).toBe('pass');
        expect(validation.signals.find(signal => signal.code === 'reconciliation'))
            .toMatchObject({ status: 'pass', measuredRate: 0 });
        expect(validation.evidenceReferences).toEqual(expect.arrayContaining([
            { kind: 'dataset_version', id: inputVersionId, label: 'Input dataset version' },
            { kind: 'dataset_version', id: outputVersionId, label: 'Output dataset version' },
            expect.objectContaining({ kind: 'operation', id: 'derive-margin' }),
        ]));
    });

    it('keeps an ambiguous strict proposal inspectable without mutating store state', async () => {
        const rows = Array.from({ length: 100 }, (_, index) => ({
            Profit: 10,
            Revenue: index < 3 ? 0 : 100,
        }));
        const setState = vi.fn();
        const logAgentToolUsage = vi.fn();
        const result = await executeDataOperationsAction({
            type: 'tool_call',
            thought: 'Derive margin safely.',
            toolName: 'data.mutate',
            args: {
                explanation: 'Derive margin.',
                operations: [ratioOperation()],
                outputColumns: [],
            },
        }, {
            getState: () => ({
                csvData: { fileName: 'margin.csv', data: rows },
                logAgentToolUsage,
            }),
            setState,
        } as never);

        expect(result).toMatchObject({
            status: 'blocked',
            toolName: 'data.mutate',
            shouldStop: true,
            observation: {
                code: 'confirmation_required',
                detail: {
                    derivedMetricValidations: [
                        expect.objectContaining({
                            status: 'warn',
                            requiresConfirmation: true,
                        }),
                    ],
                },
            },
        });
        expect(setState).not.toHaveBeenCalled();
        expect(logAgentToolUsage).toHaveBeenCalledWith(expect.objectContaining({
            tool: 'data.mutate',
            detail: expect.objectContaining({
                status: 'confirmation_required',
                derivedMetricValidations: [
                    expect.objectContaining({ status: 'warn' }),
                ],
            }),
        }));
    });

    it('requires the current user turn to explicitly confirm a warning override', () => {
        expect(isDerivedMetricWarningExplicitlyConfirmed('continue')).toBe(false);
        expect(isDerivedMetricWarningExplicitlyConfirmed('validationMode warn')).toBe(false);
        expect(isDerivedMetricWarningExplicitlyConfirmed('I confirm the warning and approve this metric.')).toBe(true);
        expect(isDerivedMetricWarningExplicitlyConfirmed('我确认这个警告，请继续。')).toBe(true);
    });

    it('honors a complete explicit declaration instead of replacing its business semantics', () => {
        const operation = ratioOperation();
        operation.declaration = {
            metricName: 'Gross margin',
            formula: '(Revenue - Cost) / Revenue',
            operation: 'ratio',
            sourceColumns: ['Profit', 'Revenue'],
            grain: ['Invoice'],
            units: 'percent',
            assumptions: ['Revenue excludes tax.'],
            businessMeaning: 'Share of revenue retained after direct cost.',
        };

        expect(buildDerivedMetricDeclaration(operation)).toEqual(operation.declaration);
    });

    it('reconciles grouped label/value metrics and preserves semantic mapping fields', () => {
        const rows = [
            { Project: 'Alpha', Description: 'Revenue', Value: 100 },
            { Project: 'Alpha', Description: 'Cost of Sales', Value: 40 },
            { Project: 'Beta', Description: 'Revenue', Value: 80 },
            { Project: 'Beta', Description: 'Cost of Sales', Value: 30 },
        ];
        const normalized = normalizeDataMutatePayload({
            explanation: 'Derive profit by project.',
            operations: [{
                id: 'derive-profit',
                type: 'derive_metric_by_label',
                reason: 'Revenue less direct cost.',
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
            }],
            outputColumns: [],
        }).plan;
        const operation = normalized?.operations[0];
        expect(operation).toMatchObject({
            metricName: 'profit',
            expectedInputs: ['Revenue', 'Cost of Sales'],
            declaration: {
                metricName: 'Profit',
                sourceColumns: ['Project', 'Description', 'Value'],
                grain: ['Project'],
                units: 'same as Value',
            },
        });
        const outputRows = [
            ...rows,
            { Project: 'Alpha', Description: 'Profit', Value: 60 },
            { Project: 'Beta', Description: 'Profit', Value: 50 },
        ];
        const validation = validateDerivedMetricOperation({
            inputRows: rows,
            outputRows,
            operation: operation as never,
            inputVersionId: buildDatasetVersionId('profit.csv', rows),
            outputVersionId: buildDatasetVersionId('profit.csv', outputRows),
        });

        expect(validation.status).toBe('pass');
        expect(validation.signals.find(signal => signal.code === 'reconciliation'))
            .toMatchObject({ status: 'pass', measuredRate: 0 });
    });
});
