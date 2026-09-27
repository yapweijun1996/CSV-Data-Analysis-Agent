import type { CsvCellValue } from './intake';
import type { DataOperation } from './operations';

export const DATASET_BUNDLE_SCHEMA_VERSION = 1 as const;

export type DatasetTableRole = 'fact' | 'dimension' | 'bridge' | 'reference' | 'unknown';
export type DatasetColumnType = 'string' | 'number' | 'boolean' | 'date' | 'unknown';
export type DatasetRelationshipCardinality =
    | 'one_to_one'
    | 'one_to_many'
    | 'many_to_one'
    | 'many_to_many'
    | 'unknown';
export type DatasetTrustDecision = 'trusted' | 'needs_confirmation' | 'blocked';

export type DatasetRelationshipReasonCode =
    | 'relationship_keys_missing'
    | 'relationship_no_matching_keys'
    | 'relationship_partial_coverage'
    | 'relationship_many_to_many'
    | 'relationship_duplicate_amplification'
    | 'relationship_safe';

export interface DatasetColumnSchema {
    name: string;
    dataType: DatasetColumnType;
    nullable: boolean;
}

export type DatasetStorageBacking =
    | { mode: 'memory'; ephemeral: boolean }
    | {
        mode: 'duckdb';
        loadVersion: string;
        tableName: string | null;
        opfsPath?: string | null;
        ephemeral: true;
    }
    | {
        mode: 'opfs';
        path: string;
        loadVersion: string;
        ephemeral: true;
    };

export interface DatasetSourceRange {
    startRow: number;
    endRow: number;
    headerRowIndexes: number[];
}

export interface DatasetTable {
    tableId: string;
    bundleId: string;
    name: string;
    role: DatasetTableRole;
    schema: DatasetColumnSchema[];
    rowCount: number;
    storage: DatasetStorageBacking;
    sourceRange: DatasetSourceRange | null;
    datasetVersion: string;
}

export interface DatasetRelationship {
    relationshipId: string;
    fromTableId: string;
    toTableId: string;
    fromKeys: string[];
    toKeys: string[];
    cardinality: DatasetRelationshipCardinality;
    fromKeyUniqueness: number;
    toKeyUniqueness: number;
    foreignKeyCoverage: number;
    duplicateAmplification: number;
    decision: DatasetTrustDecision;
    reasonCodes: DatasetRelationshipReasonCode[];
    validatedAt: string;
}

export interface DatasetScopeBinding {
    tableId: string;
    datasetVersion: string;
    relationshipSetId: string;
}

export type TransformationProgramStepKind = 'declarative' | 'sandbox_js' | 'sandbox_python';

export interface TransformationProgramStep {
    stepId: string;
    kind: TransformationProgramStepKind;
    operation?: DataOperation;
    sandboxCodeRef?: string;
    inputTableIds: string[];
    outputTableIds: string[];
    idempotencyKey: string;
}

export interface TransformationProgram {
    programId: string;
    bundleId: string;
    inputVersion: string;
    outputVersion: string;
    steps: TransformationProgramStep[];
    idempotencyKey: string;
    status: 'proposed' | 'verified' | 'committed' | 'rejected';
    createdAt: string;
}

export interface StructureResolutionOutcome {
    status: DatasetTrustDecision;
    reasonCodes: string[];
    recoveryGuidance: string[];
    bundleId: string;
    primaryTableId: string | null;
}

export interface DatasetBundleSource {
    fileName: string;
    fingerprint: string;
    byteSize: number;
    lastModified: number;
}

/**
 * Metadata-only dataset graph. Row payloads deliberately live in the declared
 * backing store so large datasets are never duplicated into Zustand.
 */
export interface DatasetBundle {
    schemaVersion: typeof DATASET_BUNDLE_SCHEMA_VERSION;
    bundleId: string;
    source: DatasetBundleSource;
    datasetVersion: string;
    tables: DatasetTable[];
    primaryTableId: string;
    relationships: DatasetRelationship[];
    relationshipSetId: string;
    transformationPrograms: TransformationProgram[];
    structureResolution: StructureResolutionOutcome;
    createdAt: string;
    updatedAt: string;
}

export interface DatasetRelationshipAssessmentInput {
    fromTable: DatasetTable;
    toTable: DatasetTable;
    fromRows: Array<Record<string, CsvCellValue>>;
    toRows: Array<Record<string, CsvCellValue>>;
    fromKeys: string[];
    toKeys: string[];
}
