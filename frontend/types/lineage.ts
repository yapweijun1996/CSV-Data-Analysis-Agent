import type { CsvData } from './intake';
import type { DataOperation } from './operations';
import type { DerivedMetricEvidenceReference } from './validation';

export const DATASET_LINEAGE_SCHEMA_VERSION = 1 as const;

export type DatasetVersionKind = 'original' | 'prepared' | 'derived';
export type TransformationKind = 'migration' | 'cleaning' | 'mutation' | 'derived_metric';
export type TransformationStatus = 'committed' | 'reverted' | 'failed';
export type LineageVerificationStatus = 'pending' | 'passed' | 'warning' | 'failed';

export interface DatasetLineageManifest {
    schemaVersion: typeof DATASET_LINEAGE_SCHEMA_VERSION;
    reportId: string;
    sessionId: string;
    datasetId: string;
    sourceFingerprint: string;
    originalVersionId: string;
    currentVersionId: string;
    versionIds: string[];
    transformationIds: string[];
    createdAt: Date;
    updatedAt: Date;
    migratedFrom?: 'legacy-report-v8';
}

export interface DatasetVersionDescriptor {
    versionId: string;
    datasetId: string;
    reportId: string;
    parentVersionId: string | null;
    kind: DatasetVersionKind;
    contentFingerprint: string;
    schemaFingerprint: string;
    rowCount: number;
    columnNames: string[];
    createdAt: Date;
    createdByRunId: string | null;
    recoverable: boolean;
}

export interface DatasetVersionRecord extends DatasetVersionDescriptor {
    recordId: string;
    recordKind: 'version';
    snapshot: CsvData;
}

export interface TransformationVerification {
    status: LineageVerificationStatus;
    reasons: string[];
}

export interface DatasetTransformationRecord {
    recordId: string;
    recordKind: 'transformation';
    transformationId: string;
    datasetId: string;
    reportId: string;
    runId: string;
    kind: TransformationKind;
    inputVersionId: string;
    outputVersionId: string;
    rollbackVersionId: string;
    operations: DataOperation[];
    status: TransformationStatus;
    verification: TransformationVerification;
    evidenceReferences?: DerivedMetricEvidenceReference[];
    createdAt: Date;
    completedAt: Date;
}

export type DatasetLineageRecord = DatasetVersionRecord | DatasetTransformationRecord;
