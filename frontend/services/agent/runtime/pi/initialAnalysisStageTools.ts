import type {
    ToolAvailabilityContext,
    ToolManifest,
    ToolPolicyDecision,
} from '../../../../types';
import type { StoreApi } from '../../types';
import {
    buildInitialAnalysisToolRegistry,
} from '../../tools/toolRegistry';
import {
    resolveToolGovernance,
} from '../../tools/toolGovernance';
import type {
    InitialAnalysisStageToolName,
} from '../../tools/manifests/initialAnalysisStageManifests';
import type {
    InitialAnalysisPhase,
    InitialAnalysisRunRequest,
} from './initialAnalysisTypes';

export type InitialAnalysisStageDecision = 'pass' | 'warn' | 'fail';

export interface InitialAnalysisStageActionResult {
    decision: InitialAnalysisStageDecision;
    phase: InitialAnalysisPhase;
    toolName: InitialAnalysisStageToolName;
    datasetVersion: string;
    summary: string;
    warningCodes: string[];
    artifactRefs: string[];
    transformationIds: string[];
    cardIds: string[];
}

export interface InitialAnalysisStageExecutionContext {
    request: InitialAnalysisRunRequest;
    store: StoreApi;
    signal: AbortSignal;
}

export type InitialAnalysisStageExecutor = (
    context: InitialAnalysisStageExecutionContext,
    args: Record<string, unknown>,
) => Promise<InitialAnalysisStageActionResult>;

export type InitialAnalysisStageExecutorMap = Record<
    InitialAnalysisStageToolName,
    InitialAnalysisStageExecutor
>;

export class InitialAnalysisStageToolError extends Error {
    constructor(
        public readonly code:
            | 'initial_stage_unknown_tool'
            | 'initial_stage_blocked'
            | 'initial_stage_invalid_args'
            | 'initial_stage_phase_mismatch',
        message: string,
        public readonly policyDecision?: ToolPolicyDecision,
    ) {
        super(message);
        this.name = 'InitialAnalysisStageToolError';
    }
}

const registry = buildInitialAnalysisToolRegistry();

const getManifest = (
    toolName: InitialAnalysisStageToolName,
): ToolManifest & {
    initialAnalysis?: { phase?: InitialAnalysisPhase };
} => {
    const manifest = registry.manifests.find(
        candidate => candidate.name === toolName,
    );
    if (!manifest) {
        throw new InitialAnalysisStageToolError(
            'initial_stage_unknown_tool',
            `Unknown initial-analysis stage tool "${toolName}".`,
        );
    }
    return manifest;
};

export const resolveInitialAnalysisStageGovernance = (params: {
    toolName: InitialAnalysisStageToolName;
    availability: ToolAvailabilityContext;
}): ToolPolicyDecision => {
    const manifest = getManifest(params.toolName);
    const stage = manifest.stageAvailability?.[0];
    const governance = resolveToolGovernance(registry, {
        ...params.availability,
        toolStage: stage,
    });
    return governance.decisions[params.toolName];
};

export const executeInitialAnalysisStageTool = async (params: {
    toolName: InitialAnalysisStageToolName;
    phase: InitialAnalysisPhase;
    args: Record<string, unknown>;
    availability: ToolAvailabilityContext;
    context: InitialAnalysisStageExecutionContext;
    executors: InitialAnalysisStageExecutorMap;
}): Promise<InitialAnalysisStageActionResult> => {
    const manifest = getManifest(params.toolName);
    if (manifest.initialAnalysis?.phase !== params.phase) {
        throw new InitialAnalysisStageToolError(
            'initial_stage_phase_mismatch',
            `Tool "${params.toolName}" does not belong to phase "${params.phase}".`,
        );
    }

    const decision = resolveInitialAnalysisStageGovernance({
        toolName: params.toolName,
        availability: params.availability,
    });
    if (!decision.allowed) {
        throw new InitialAnalysisStageToolError(
            'initial_stage_blocked',
            decision.reason,
            decision,
        );
    }

    const validationErrors = manifest.validate?.(
        params.args,
        params.availability,
    ) ?? [];
    if (validationErrors.length > 0) {
        throw new InitialAnalysisStageToolError(
            'initial_stage_invalid_args',
            validationErrors.join(' '),
            decision,
        );
    }

    return params.executors[params.toolName](
        params.context,
        params.args,
    );
};
