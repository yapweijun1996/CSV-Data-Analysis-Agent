import { describe, expect, it } from 'vitest';
import type { AiCleaningProgram, CleaningStrategyCandidate, CsvData } from '../types';
import { evaluateCleaningStrategyEligibility } from '../services/agent/orchestration/cleaningStrategyRecovery';

const baseProgram: AiCleaningProgram = {
    programId: 'program-hierarchy',
    explanation: 'Preserve hierarchy.',
    source: 'llm_generated',
    outputColumns: [],
    steps: [{
        id: 'step-1',
        mode: 'reshape',
        reason: 'Preserve hierarchy.',
        operations: [{
            id: 'annotate_hierarchy_fallback',
            type: 'annotate_hierarchy',
            reason: 'Preserve hierarchy.',
            rowClassColumn: 'RowClass',
            hierarchyDepthColumn: 'HierarchyDepth',
            sourceRowIndexColumn: 'SourceRowIndex',
        }],
    }],
};

const hierarchyCandidate: CleaningStrategyCandidate = {
    strategyId: 'hierarchy-candidate',
    source: 'agent_primary',
    program: baseProgram,
    plan: {
        explanation: baseProgram.explanation,
        operations: baseProgram.steps.flatMap(step => step.operations),
        outputColumns: [],
        planStatus: 'operations',
        consistencyIssues: [],
    },
    intentSummary: baseProgram.explanation,
    requires: ['hierarchical_shape'],
    priority: 1,
};

describe('evaluateCleaningStrategyEligibility', () => {
    it('blocks hierarchy-only strategies when the current working dataset is not executable hierarchy shape', () => {
        const workingData: CsvData = {
            fileName: 'marketing-export.csv',
            data: [
                { Campaign: 'A', Spend: 100, Clicks: 20 },
                { Campaign: 'B', Spend: 200, Clicks: 30 },
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };

        const result = evaluateCleaningStrategyEligibility(workingData, hierarchyCandidate, {
            currentRound: 1,
            attemptedStrategies: [],
            disallowedRequirements: [],
        });

        expect(result.executable).toBe(false);
        expect(result.reasonCode).toBe('hierarchy_shape_missing');
    });

    it('puts hierarchy-only strategies on cooldown after a recent hierarchy mismatch', () => {
        const workingData: CsvData = {
            fileName: 'sales.csv',
            data: [{ Customer: 'A', Amount: 100 }],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };

        const result = evaluateCleaningStrategyEligibility(workingData, hierarchyCandidate, {
            currentRound: 3,
            attemptedStrategies: [{
                strategyId: 'old-hierarchy',
                source: 'agent_primary',
                requirement: 'hierarchical_shape',
                round: 2,
                reasonCode: 'hierarchy_shape_missing',
                executed: false,
            }],
            disallowedRequirements: [],
        });

        expect(result.executable).toBe(false);
        expect(result.reasonCode).toBe('hierarchy_shape_cooldown');
    });
});
