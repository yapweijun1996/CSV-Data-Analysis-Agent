import type {
    CsvData,
    DatasetBundle,
    SandboxTransformationOutcome,
    SandboxTransformationProposal,
    TransformationProgram,
} from '../../types';
import { getCsvDatasetVersion } from '../../utils/datasetId';
import { assessDatasetRelationship, inferDatasetTableSchema } from './datasetBundle';
import { registerSandboxTableRows } from './sandboxTableRegistry';

const hashText = (value: string): string => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

export const commitVerifiedSandboxTransformation = (input: {
    bundle: DatasetBundle | null | undefined;
    preparedData: CsvData;
    proposal: SandboxTransformationProposal;
    outcome: SandboxTransformationOutcome;
    runId: string | null;
    now?: string;
}): DatasetBundle | null => {
    if (!input.bundle
        || input.outcome.status !== 'completed'
        || input.outcome.validation.decision !== 'trusted'
        || !input.outcome.output) return input.bundle ?? null;
    const now = input.now ?? new Date().toISOString();
    const outputVersion = getCsvDatasetVersion(input.preparedData);
    const committedOutput = {
        ...input.outcome.output,
        tables: input.outcome.output.tables.map(table => table.tableId === input.proposal.primaryTableId
            ? { ...table, rows: input.preparedData.data.map(row => ({ ...row })) }
            : { ...table, rows: table.rows.map(row => ({ ...row })) }),
    };
    const tables = committedOutput.tables.map(table => ({
        tableId: table.tableId,
        bundleId: input.bundle!.bundleId,
        name: table.name,
        role: table.role,
        schema: inferDatasetTableSchema(table.rows),
        rowCount: table.rows.length,
        storage: { mode: 'memory' as const, ephemeral: true },
        sourceRange: null,
        datasetVersion: outputVersion,
    }));
    const relationships = input.outcome.output.relationships.map(relationship => {
        const fromTable = tables.find(table => table.tableId === relationship.fromTableId)!;
        const toTable = tables.find(table => table.tableId === relationship.toTableId)!;
        const fromRows = committedOutput.tables.find(table => table.tableId === relationship.fromTableId)!.rows;
        const toRows = committedOutput.tables.find(table => table.tableId === relationship.toTableId)!.rows;
        return assessDatasetRelationship({
            fromTable,
            toTable,
            fromRows,
            toRows,
            fromKeys: relationship.fromKeys,
            toKeys: relationship.toKeys,
        }, now);
    });
    if (relationships.some(relationship => relationship.decision !== 'trusted')) return input.bundle;
    const idempotencyKey = `${input.bundle.bundleId}:${input.outcome.codeRef}:${outputVersion}`;
    const existing = input.bundle.transformationPrograms.find(program => program.idempotencyKey === idempotencyKey);
    const program: TransformationProgram = existing ?? {
        programId: `program-${hashText(idempotencyKey)}`,
        bundleId: input.bundle.bundleId,
        inputVersion: input.bundle.datasetVersion,
        outputVersion,
        idempotencyKey,
        status: 'committed',
        createdAt: now,
        steps: [{
            stepId: `${input.outcome.codeRef}-${input.outcome.attempt}`,
            kind: input.outcome.language === 'javascript' ? 'sandbox_js' : 'sandbox_python',
            sandboxCodeRef: input.outcome.codeRef,
            inputTableIds: [input.bundle.primaryTableId],
            outputTableIds: tables.map(table => table.tableId),
            idempotencyKey: `${input.runId ?? 'cleaning'}:${input.outcome.codeRef}`,
        }],
    };
    registerSandboxTableRows(input.bundle.bundleId, committedOutput);
    return {
        ...input.bundle,
        datasetVersion: outputVersion,
        primaryTableId: input.proposal.primaryTableId,
        tables,
        relationships,
        relationshipSetId: `relationships-${hashText(relationships.map(item => item.relationshipId).sort().join('|') || 'none')}`,
        transformationPrograms: existing
            ? input.bundle.transformationPrograms
            : [...input.bundle.transformationPrograms, program],
        structureResolution: {
            status: 'trusted',
            reasonCodes: ['sandbox_transformation_verified'],
            recoveryGuidance: [],
            bundleId: input.bundle.bundleId,
            primaryTableId: input.proposal.primaryTableId,
        },
        updatedAt: now,
    };
};
