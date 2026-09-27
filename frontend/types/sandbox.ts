import type { CsvRow } from './intake';
import type { DatasetRelationshipCardinality, DatasetTableRole, DatasetTrustDecision } from './datasetBundle';

export type SandboxLanguage = 'javascript' | 'python';

export interface SandboxTableContract {
    tableId: string;
    name: string;
    role: DatasetTableRole;
    mergeKeys?: string[];
}

export interface SandboxTransformationProposal {
    language: SandboxLanguage;
    explanation: string;
    code: string;
    primaryTableId: string;
    tables: SandboxTableContract[];
    preserveRowCount: boolean;
    maxRowDropRatio: number;
    preserveNumericColumns: string[];
    derivedFields?: SandboxDerivedFieldContract[];
}

export interface SandboxDerivedFieldContract {
    tableId: string;
    fieldName: string;
    operation: 'ratio' | 'difference' | 'sum' | 'product';
    inputColumns: string[];
    unit: string;
    grain: string;
    allowNull: boolean;
    zeroDenominator: 'null' | 'zero';
}

export interface SandboxRelationshipOutput {
    relationshipId: string;
    fromTableId: string;
    toTableId: string;
    fromKeys: string[];
    toKeys: string[];
    expectedCardinality?: DatasetRelationshipCardinality;
}

export interface SandboxTableOutput extends SandboxTableContract {
    rows: CsvRow[];
}

export interface SandboxRowLineage {
    outputTableId: string;
    outputRowIndex: number;
    inputTableId: string;
    inputRowIndexes: number[];
}

export interface SandboxTransformationOutput {
    tables: SandboxTableOutput[];
    lineage: SandboxRowLineage[];
    relationships: SandboxRelationshipOutput[];
    notes?: string[];
}

export interface SandboxExecutionLimits {
    timeoutMs: number;
    maxOutputBytes: number;
    maxRowsPerBatch: number;
}

export interface SandboxValidationReport {
    decision: DatasetTrustDecision;
    reasonCodes: string[];
    warnings: string[];
    inputRowCount: number;
    outputRowCount: number;
    outputBytes: number;
    preservedNumericTotals: Record<string, { before: number; after: number; relativeDelta: number }>;
}

export interface SandboxTransformationOutcome {
    status: 'completed' | 'blocked' | 'failed' | 'cancelled';
    runId: string;
    attempt: 2 | 3;
    language: SandboxLanguage;
    codeRef: string;
    durationMs: number;
    output: SandboxTransformationOutput | null;
    validation: SandboxValidationReport;
    error: string | null;
}
