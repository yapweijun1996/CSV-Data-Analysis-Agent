import type { ToolManifest, ToolName } from '../../../../types';
import type { InitialAnalysisPhase } from '../../runtime/pi/initialAnalysisTypes';
import { requireDataset } from '../toolManifestSupport';

export type InitialAnalysisStageToolName =
    | 'dataset.profileStructure'
    | 'dataset.detectNoiseRows'
    | 'dataset.suggestCleaningPlan'
    | 'dataset.applyTransform'
    | 'dataset.validatePreparedData'
    | 'dataset.bindQueryEngine'
    | 'analysis.researchQuestions'
    | 'analysis.executeEvidence'
    | 'analysis.finalizeArtifacts';

export interface InitialAnalysisStageManifest extends ToolManifest {
    name: InitialAnalysisStageToolName;
    initialAnalysis: {
        phase: InitialAnalysisPhase;
        capabilityOwner:
            | 'report_structure'
            | 'cleaning'
            | 'verification'
            | 'duckdb'
            | 'research'
            | 'evidence'
            | 'reporting';
    };
}

const FORBIDDEN_STAGE_PAYLOAD_FIELDS = new Set([
    'apiKey',
    'csvData',
    'file',
    'fileContents',
    'prompt',
    'queryResults',
    'rawCsvData',
    'rows',
]);

const stageIdentitySchema = {
    type: 'object',
    properties: {
        datasetId: { type: 'string', minLength: 1 },
        datasetVersion: { type: 'string', minLength: 1 },
        runtimeRunId: { type: 'string', minLength: 1 },
        traceId: { type: 'string', minLength: 1 },
        phaseAttempt: { type: 'integer', minimum: 1 },
        idempotencyKey: { type: 'string', minLength: 1 },
    },
    required: [
        'datasetId',
        'datasetVersion',
        'runtimeRunId',
        'traceId',
        'phaseAttempt',
        'idempotencyKey',
    ],
    additionalProperties: true,
};

const validateStageIdentity = (args: Record<string, unknown>): string[] => {
    const errors: string[] = [];
    for (const field of stageIdentitySchema.required) {
        const value = args?.[field];
        if (
            field === 'phaseAttempt'
                ? !Number.isInteger(value) || Number(value) < 1
                : typeof value !== 'string' || value.trim().length === 0
        ) {
            errors.push(`"${field}" is required.`);
        }
    }
    for (const field of FORBIDDEN_STAGE_PAYLOAD_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(args ?? {}, field)) {
            errors.push(`"${field}" is not allowed in an initial-analysis stage action.`);
        }
    }
    return errors;
};

const manifest = (params: {
    name: InitialAnalysisStageToolName;
    description: string;
    phase: InitialAnalysisPhase;
    capabilityOwner: InitialAnalysisStageManifest['initialAnalysis']['capabilityOwner'];
    category: 'data' | 'analysis';
    risk?: 'low' | 'medium';
    group:
        | 'cleaning.inspect'
        | 'cleaning.edit'
        | 'cleaning.verify'
        | 'data.query'
        | 'analysis.plan'
        | 'card.review';
    resultShape: string;
    mutatesState?: boolean;
}): InitialAnalysisStageManifest => ({
    name: params.name,
    description: params.description,
    category: params.category,
    risk: params.risk ?? 'low',
    enabledByDefault: true,
    defaultPolicy: 'allow',
    inputSchema: stageIdentitySchema,
    groups: [params.group],
    stageAvailability: params.phase === 'inspect_structure'
        || params.phase === 'propose_cleaning'
        || params.phase === 'apply_safe_cleaning'
        || params.phase === 'verify_prepared_data'
        ? ['cleaning']
        : ['analysis'],
    requiresCleaningCompleted:
        params.phase === 'bind_query_engine'
        || params.phase === 'research_questions'
        || params.phase === 'execute_evidence'
        || params.phase === 'finalize_artifacts',
    resultShape: params.resultShape,
    capabilities: {
        initialAnalysisStage: true,
        governed: true,
        ...(params.mutatesState
            ? { mutatesState: true, safeTransformationsOnly: true }
            : { readOnly: true }),
    },
    isAvailable: requireDataset,
    validate: args => validateStageIdentity(args ?? {}),
    initialAnalysis: {
        phase: params.phase,
        capabilityOwner: params.capabilityOwner,
    },
});

export const createInitialAnalysisStageToolManifests = (
): InitialAnalysisStageManifest[] => [
    manifest({
        name: 'dataset.profileStructure',
        description: 'Resolve a version-bound report structure assessment using current deterministic signals and bounded model proposals.',
        phase: 'inspect_structure',
        capabilityOwner: 'report_structure',
        category: 'data',
        group: 'cleaning.inspect',
        resultShape: 'Returns structure, boundary, shape, and confidence references without raw rows.',
    }),
    manifest({
        name: 'dataset.detectNoiseRows',
        description: 'Inspect the current dataset for explainable header, footer, blank, summary-like, and report-noise candidates.',
        phase: 'inspect_structure',
        capabilityOwner: 'report_structure',
        category: 'data',
        group: 'cleaning.inspect',
        resultShape: 'Returns bounded noise candidate references, counts, and confidence bands without deleting rows.',
    }),
    manifest({
        name: 'dataset.suggestCleaningPlan',
        description: 'Produce a constrained cleaning proposal using the existing operation catalog and cleaning policy.',
        phase: 'propose_cleaning',
        capabilityOwner: 'cleaning',
        category: 'data',
        group: 'cleaning.inspect',
        resultShape: 'Returns safe, ambiguous, and rejected operation references plus rollback intent.',
    }),
    manifest({
        name: 'dataset.applyTransform',
        description: 'Apply only app-verified safe and reversible cleaning operations through the existing mutation and lineage owner.',
        phase: 'apply_safe_cleaning',
        capabilityOwner: 'cleaning',
        category: 'data',
        risk: 'medium',
        group: 'cleaning.edit',
        resultShape: 'Returns the committed dataset version and transformation IDs, or an unchanged version.',
        mutatesState: true,
    }),
    manifest({
        name: 'dataset.validatePreparedData',
        description: 'Evaluate prepared-data structure, numeric, and query-readiness signals using tiered pass, warn, or fail bands.',
        phase: 'verify_prepared_data',
        capabilityOwner: 'verification',
        category: 'data',
        group: 'cleaning.verify',
        resultShape: 'Returns pass, warn, or fail with signal references and no zero-tolerance statistical gate.',
    }),
    manifest({
        name: 'dataset.bindQueryEngine',
        description: 'Bind the current prepared dataset version to the existing DuckDB session owner.',
        phase: 'bind_query_engine',
        capabilityOwner: 'duckdb',
        category: 'data',
        group: 'data.query',
        resultShape: 'Returns the bound dataset version and query-engine session reference.',
    }),
    manifest({
        name: 'analysis.researchQuestions',
        description: 'Build a bounded, prioritized research brief from the current goal and prepared dataset.',
        phase: 'research_questions',
        capabilityOwner: 'research',
        category: 'analysis',
        group: 'analysis.plan',
        resultShape: 'Returns at most eight version-bound research question references.',
    }),
    manifest({
        name: 'analysis.executeEvidence',
        description: 'Execute bounded evidence queries through the existing planner, query, evaluator, dedupe, and card executors.',
        phase: 'execute_evidence',
        capabilityOwner: 'evidence',
        category: 'analysis',
        risk: 'medium',
        group: 'analysis.plan',
        resultShape: 'Returns accepted and rejected evidence references and at most five accepted card IDs.',
    }),
    manifest({
        name: 'analysis.finalizeArtifacts',
        description: 'Finalize trust, summaries, report readiness, and the visible terminal outcome from committed evidence.',
        phase: 'finalize_artifacts',
        capabilityOwner: 'reporting',
        category: 'analysis',
        group: 'card.review',
        resultShape: 'Returns completed or degraded artifact references and trust warnings.',
    }),
];

export const INITIAL_ANALYSIS_STAGE_TOOL_NAMES = Object.freeze(
    createInitialAnalysisStageToolManifests().map(
        item => item.name as ToolName,
    ),
);
