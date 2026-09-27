import { describe, expect, it, vi } from 'vitest';
import {
    createInitialAnalysisStageToolManifests,
} from '../services/agent/tools/manifests/initialAnalysisStageManifests';
import {
    buildBuiltinToolRegistry,
    buildInitialAnalysisToolRegistry,
} from '../services/agent/tools/toolRegistry';
import {
    InitialAnalysisStageToolError,
    executeInitialAnalysisStageTool,
    resolveInitialAnalysisStageGovernance,
    type InitialAnalysisStageExecutorMap,
} from '../services/agent/runtime/pi/initialAnalysisStageTools';
import type { InitialAnalysisRunRequest } from '../services/agent/runtime/pi/initialAnalysisTypes';
import type { ToolAvailabilityContext } from '../types';

const availability = (overrides: Partial<ToolAvailabilityContext> = {}) => ({
    cardIds: [],
    columnNames: ['Town', 'Amount'],
    csvData: {
        fileName: 'sample.csv',
        data: [{ Town: 'A', Amount: 1 }],
    },
    hasCsvData: true,
    hasCards: false,
    hasCleaningRun: true,
    cleaningRunStatus: 'running',
    cleaningCompleted: false,
    sessionId: 'session-1',
    datasetId: 'dataset-1',
    ...overrides,
} satisfies ToolAvailabilityContext);

const request: InitialAnalysisRunRequest = {
    appSessionId: 'session-1',
    datasetId: 'dataset-1',
    datasetVersion: 'version-1',
    researchGoal: 'Find notable patterns.',
    provider: {
        provider: 'default',
        modelId: 'gpt-5.4-mini',
    },
};

const stageArgs = {
    datasetId: 'dataset-1',
    datasetVersion: 'version-1',
    runtimeRunId: 'runtime-1',
    traceId: 'trace-1',
    phaseAttempt: 1,
    idempotencyKey: 'session-1:version-1:inspect_structure:1',
};

const createExecutors = () => Object.fromEntries(
    createInitialAnalysisStageToolManifests().map(manifest => [
        manifest.name,
        vi.fn(async () => ({
            decision: 'pass' as const,
            phase: manifest.initialAnalysis.phase,
            toolName: manifest.name,
            datasetVersion: 'version-1',
            summary: `${manifest.name} completed`,
            warningCodes: [],
            artifactRefs: [],
            transformationIds: [],
            cardIds: [],
        })),
    ]),
) as unknown as InitialAnalysisStageExecutorMap;

describe('Pi governed initial-analysis stage tools', () => {
    it('declares every accepted capability and phase without registry diagnostics', () => {
        const manifests = createInitialAnalysisStageToolManifests();
        const registry = buildInitialAnalysisToolRegistry();

        expect(manifests.map(manifest => [
            manifest.name,
            manifest.initialAnalysis.phase,
        ])).toEqual([
            ['dataset.profileStructure', 'inspect_structure'],
            ['dataset.detectNoiseRows', 'inspect_structure'],
            ['dataset.suggestCleaningPlan', 'propose_cleaning'],
            ['dataset.applyTransform', 'apply_safe_cleaning'],
            ['dataset.validatePreparedData', 'verify_prepared_data'],
            ['dataset.bindQueryEngine', 'bind_query_engine'],
            ['analysis.researchQuestions', 'research_questions'],
            ['analysis.executeEvidence', 'execute_evidence'],
            ['analysis.finalizeArtifacts', 'finalize_artifacts'],
        ]);
        expect(registry.diagnostics).toEqual([]);
    });

    it('keeps initial-analysis stage tools out of the follow-up builtin registry', () => {
        const followUpNames = buildBuiltinToolRegistry(['Town', 'Amount'])
            .manifests
            .map(manifest => manifest.name);

        expect(followUpNames).not.toContain('dataset.profileStructure');
        expect(followUpNames).not.toContain('analysis.executeEvidence');
    });

    it('governs cleaning and analysis phases against the current app state', () => {
        expect(resolveInitialAnalysisStageGovernance({
            toolName: 'dataset.profileStructure',
            availability: availability(),
        }).allowed).toBe(true);
        expect(resolveInitialAnalysisStageGovernance({
            toolName: 'analysis.executeEvidence',
            availability: availability({
                cleaningCompleted: true,
                cleaningRunStatus: 'completed',
            }),
        }).allowed).toBe(true);
    });

    it('executes only the executor bound to the governed manifest', async () => {
        const executors = createExecutors();
        const result = await executeInitialAnalysisStageTool({
            toolName: 'dataset.profileStructure',
            phase: 'inspect_structure',
            args: stageArgs,
            availability: availability(),
            context: {
                request,
                store: {} as never,
                signal: new AbortController().signal,
            },
            executors,
        });

        expect(result).toMatchObject({
            decision: 'pass',
            phase: 'inspect_structure',
            toolName: 'dataset.profileStructure',
        });
        expect(executors['dataset.profileStructure']).toHaveBeenCalledOnce();
        expect(executors['dataset.detectNoiseRows']).not.toHaveBeenCalled();
    });

    it('rejects raw rows, credentials, and other duplicate stage payloads', async () => {
        const executors = createExecutors();
        const execution = executeInitialAnalysisStageTool({
            toolName: 'dataset.profileStructure',
            phase: 'inspect_structure',
            args: {
                ...stageArgs,
                rows: [{ amount: 1 }],
                apiKey: 'not-allowed',
            },
            availability: availability(),
            context: {
                request,
                store: {} as never,
                signal: new AbortController().signal,
            },
            executors,
        });

        await expect(execution).rejects.toMatchObject({
            code: 'initial_stage_invalid_args',
        } satisfies Partial<InitialAnalysisStageToolError>);
        expect(executors['dataset.profileStructure']).not.toHaveBeenCalled();
    });

    it('rejects a tool invoked under the wrong lifecycle phase', async () => {
        await expect(executeInitialAnalysisStageTool({
            toolName: 'dataset.applyTransform',
            phase: 'verify_prepared_data',
            args: stageArgs,
            availability: availability(),
            context: {
                request,
                store: {} as never,
                signal: new AbortController().signal,
            },
            executors: createExecutors(),
        })).rejects.toMatchObject({
            code: 'initial_stage_phase_mismatch',
        } satisfies Partial<InitialAnalysisStageToolError>);
    });

    it('marks the only mutating stage as safe-transform-only', () => {
        const manifests = createInitialAnalysisStageToolManifests();
        const mutating = manifests.filter(
            manifest => manifest.capabilities?.mutatesState,
        );

        expect(mutating.map(manifest => manifest.name))
            .toEqual(['dataset.applyTransform']);
        expect(mutating[0].capabilities?.safeTransformationsOnly).toBe(true);
        expect(mutating[0].risk).toBe('medium');
    });
});
