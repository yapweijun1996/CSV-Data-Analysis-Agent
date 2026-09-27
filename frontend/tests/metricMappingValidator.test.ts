// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { AppStore } from '../store/useAppStore';
import { executeMetricMappingValidationAction } from '../services/agent/execution/metricMappingValidator';
import type { StoreApi } from '../services/agent/types';

const createStore = (overrides: Partial<AppStore>): { store: StoreApi; state: AppStore } => {
    const state = {
        csvData: null,
        columnProfiles: [],
        dataPreparationPlan: null,
        activeMetricMappingValidation: null,
        ...overrides,
    } as unknown as AppStore;

    const store: StoreApi = {
        getState: () => state,
        setState: (partial) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
    };

    return { store, state };
};

describe('executeMetricMappingValidationAction', () => {
    it('returns derive_metric for profit on metric-column datasets', () => {
        const { store, state } = createStore({
            csvData: {
                data: [
                    { Project: 'Alpha', Revenue: 100, Cost: 40 },
                    { Project: 'Beta', Revenue: 140, Cost: 70 },
                ],
            } as never,
            columnProfiles: [
                { name: 'Project', type: 'categorical' },
                { name: 'Revenue', type: 'currency' },
                { name: 'Cost', type: 'currency' },
            ] as never,
        });

        const result = executeMetricMappingValidationAction({
            validationKind: 'derived',
            metricName: 'profit',
            requestedGrain: ['Project'],
        }, store);

        expect(result.status).toBe('success');
        expect(result.toolName).toBe('analysis.validate_metric_mapping');
        expect(result.artifactMetadata).toMatchObject({
            artifactType: 'metric_mapping_validation',
            metricName: 'profit',
            recommendedAction: 'derive_metric',
            suggestedNextTool: 'data.mutate',
        });
        expect(state.activeMetricMappingValidation).toMatchObject({
            metricName: 'profit',
            recommendedAction: 'derive_metric',
        });
    });

    it('returns a deriveMetricTemplate for row-label profit mappings', () => {
        const { store } = createStore({
            csvData: {
                data: [
                    { Project: 'Alpha', Description: 'Revenue', Value: 100 },
                    { Project: 'Alpha', Description: 'Cost of Sales', Value: 40 },
                ],
            } as never,
            columnProfiles: [
                { name: 'Project', type: 'categorical' },
                { name: 'Description', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ] as never,
            dataPreparationPlan: {
                explanation: 'Already reshaped into a long metric table.',
                operations: [{ id: 'reshape', type: 'unpivot_columns', reason: 'Reshape report.' }],
                outputColumns: [],
            } as never,
        });

        const result = executeMetricMappingValidationAction({
            validationKind: 'derived',
            metricName: 'profit',
        }, store);

        expect(result.status).toBe('success');
        expect(result.artifactMetadata).toMatchObject({
            recommendedAction: 'derive_metric',
            deriveMetricTemplate: {
                labelColumn: 'Description',
                valueColumn: 'Value',
                outputMetricLabel: 'Profit',
            },
        });
    });

    it('returns blockers and clarification when the mapping is unstable', () => {
        const { store } = createStore({
            csvData: {
                data: [
                    { Project: 'Alpha', Description: 'Amount', Value: 100 },
                    { Project: 'Beta', Description: 'Amount', Value: 70 },
                ],
            } as never,
            columnProfiles: [
                { name: 'Project', type: 'categorical' },
                { name: 'Description', type: 'categorical' },
                { name: 'Value', type: 'currency' },
            ] as never,
        });

        const result = executeMetricMappingValidationAction({
            validationKind: 'derived',
            metricName: 'profit',
        }, store);

        expect(result.status).toBe('blocked');
        expect(result.observation?.code).toBe('validation_failed');
        expect(result.artifactMetadata).toMatchObject({
            recommendedAction: 'clarify',
            suggestedNextTool: 'conversation.request_clarification',
        });
        expect((result.artifactMetadata as any).blockers.length).toBeGreaterThan(0);
    });

    it('can recommend a direct answer for stable base metrics', () => {
        const { store } = createStore({
            csvData: {
                data: [
                    { Project: 'Alpha', Revenue: 100 },
                    { Project: 'Beta', Revenue: 140 },
                ],
            } as never,
            columnProfiles: [
                { name: 'Project', type: 'categorical' },
                { name: 'Revenue', type: 'currency' },
            ] as never,
        });

        const result = executeMetricMappingValidationAction({
            validationKind: 'base',
            metricName: 'revenue',
        }, store);

        expect(result.status).toBe('success');
        expect(result.artifactMetadata).toMatchObject({
            recommendedAction: 'answer',
            suggestedNextTool: 'assistant_message',
        });
    });
});
