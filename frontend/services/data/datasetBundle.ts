import type {
    CsvCellValue,
    CsvData,
    CsvRow,
    DatasetBundle,
    DatasetColumnSchema,
    DatasetColumnType,
    DatasetRelationship,
    DatasetRelationshipAssessmentInput,
    DatasetRelationshipCardinality,
    DatasetScopeBinding,
    DatasetRelationshipReasonCode,
    DatasetStorageBacking,
    DatasetTable,
    DatasetTableRole,
    StructureResolutionOutcome,
    TransformationProgram,
    TransformationProgramStep,
} from '../../types';
import { DATASET_BUNDLE_SCHEMA_VERSION } from '../../types';
import { buildDatasetFingerprint, getCsvDataRowCount, getCsvDatasetVersion } from '../../utils/datasetId';
import { buildDuckDbFileIdentity } from './duckDbFileIntake';

const RELATIONSHIP_TRUSTED_COVERAGE = 0.98;
const RELATIONSHIP_NO_MATCH_COVERAGE = 0.02;
const RELATIONSHIP_MAX_AMPLIFICATION = 1.02;

const stableHash = (value: string): string => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

const normalizeIdentifier = (value: string): string =>
    value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'table';

const inferValueType = (value: CsvCellValue): DatasetColumnType => {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value !== 'string' || value.trim() === '') return 'unknown';
    if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(value.trim())) return 'date';
    return 'string';
};

export const inferDatasetTableSchema = (rows: CsvRow[]): DatasetColumnSchema[] => {
    const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
    return columns.map(name => {
        let resolvedType: DatasetColumnType = 'unknown';
        let nullable = false;
        for (const row of rows.slice(0, 2_000)) {
            const value = row[name];
            if (value === null || value === undefined || value === '') {
                nullable = true;
                continue;
            }
            const candidate = inferValueType(value);
            if (resolvedType === 'unknown') {
                resolvedType = candidate;
            } else if (candidate !== resolvedType) {
                resolvedType = 'string';
            }
        }
        return { name, dataType: resolvedType, nullable };
    });
};

const resolveStorage = (data: CsvData): DatasetStorageBacking => data.backing
    ? {
        mode: 'duckdb',
        loadVersion: data.backing.loadVersion,
        tableName: null,
        opfsPath: data.backing.opfsPath ?? null,
        ephemeral: true,
    }
    : { mode: 'memory', ephemeral: false };

export const createSingleTableDatasetBundle = (input: {
    datasetId: string;
    sourceFingerprint: string;
    file: Pick<File, 'name' | 'size' | 'lastModified'>;
    data: CsvData;
    structureResolution?: Omit<StructureResolutionOutcome, 'bundleId' | 'primaryTableId'>;
    now?: string;
}): DatasetBundle => {
    const now = input.now ?? new Date().toISOString();
    const datasetVersion = getCsvDatasetVersion(input.data);
    const bundleId = `bundle-${stableHash(`${input.datasetId}|${input.sourceFingerprint}`)}`;
    const tableId = `${bundleId}-table-${normalizeIdentifier(input.file.name.replace(/\.csv$/i, ''))}`;
    const table: DatasetTable = {
        tableId,
        bundleId,
        name: input.file.name.replace(/\.csv$/i, '') || 'Imported table',
        role: 'fact',
        schema: inferDatasetTableSchema(input.data.data),
        rowCount: getCsvDataRowCount(input.data),
        storage: resolveStorage(input.data),
        sourceRange: null,
        datasetVersion,
    };
    const relationshipSetId = `relationships-${stableHash(`${bundleId}|none`)}`;

    return {
        schemaVersion: DATASET_BUNDLE_SCHEMA_VERSION,
        bundleId,
        source: {
            fileName: input.file.name,
            fingerprint: input.sourceFingerprint,
            byteSize: input.file.size,
            lastModified: input.file.lastModified,
        },
        datasetVersion,
        tables: [table],
        primaryTableId: tableId,
        relationships: [],
        relationshipSetId,
        transformationPrograms: [],
        structureResolution: {
            status: input.structureResolution?.status ?? 'trusted',
            reasonCodes: input.structureResolution?.reasonCodes ?? ['single_table_structure'],
            recoveryGuidance: input.structureResolution?.recoveryGuidance ?? [],
            bundleId,
            primaryTableId: tableId,
        },
        createdAt: now,
        updatedAt: now,
    };
};

export interface DatasetTableDraft {
    name: string;
    role: DatasetTableRole;
    data: CsvData;
    sourceRange: DatasetTable['sourceRange'];
}

/**
 * Creates a multi-table metadata graph from verified table boundaries. It does
 * not retain the supplied row arrays; they are used only for schema inference.
 */
export const createMultiTableDatasetBundle = (input: {
    datasetId: string;
    sourceFingerprint: string;
    file: Pick<File, 'name' | 'size' | 'lastModified'>;
    tables: DatasetTableDraft[];
    primaryTableIndex: number;
    relationships?: DatasetRelationship[];
    structureResolution: Omit<StructureResolutionOutcome, 'bundleId' | 'primaryTableId'>;
    now?: string;
}): DatasetBundle => {
    if (input.tables.length === 0) throw new Error('dataset_bundle_tables_required');
    if (!input.tables[input.primaryTableIndex]) throw new Error('dataset_bundle_primary_table_invalid');
    const now = input.now ?? new Date().toISOString();
    const bundleId = `bundle-${stableHash(`${input.datasetId}|${input.sourceFingerprint}`)}`;
    const usedIds = new Set<string>();
    const tables = input.tables.map((draft, index): DatasetTable => {
        const baseId = `${bundleId}-table-${normalizeIdentifier(draft.name)}`;
        const tableId = usedIds.has(baseId) ? `${baseId}-${index + 1}` : baseId;
        usedIds.add(tableId);
        return {
            tableId,
            bundleId,
            name: draft.name,
            role: draft.role,
            schema: inferDatasetTableSchema(draft.data.data),
            rowCount: getCsvDataRowCount(draft.data),
            storage: resolveStorage(draft.data),
            sourceRange: draft.sourceRange,
            datasetVersion: getCsvDatasetVersion(draft.data),
        };
    });
    const primaryTableId = tables[input.primaryTableIndex].tableId;
    const relationships = input.relationships ?? [];
    return {
        schemaVersion: DATASET_BUNDLE_SCHEMA_VERSION,
        bundleId,
        source: {
            fileName: input.file.name,
            fingerprint: input.sourceFingerprint,
            byteSize: input.file.size,
            lastModified: input.file.lastModified,
        },
        datasetVersion: tables[input.primaryTableIndex].datasetVersion,
        tables,
        primaryTableId,
        relationships,
        relationshipSetId: createRelationshipSetId(relationships),
        transformationPrograms: [],
        structureResolution: {
            ...input.structureResolution,
            bundleId,
            primaryTableId,
        },
        createdAt: now,
        updatedAt: now,
    };
};

const keyForRow = (row: Record<string, CsvCellValue>, keys: string[]): string | null => {
    const values = keys.map(key => row[key]);
    if (values.some(value => value === null || value === undefined || value === '')) return null;
    return JSON.stringify(values);
};

const keyStats = (rows: Array<Record<string, CsvCellValue>>, keys: string[]) => {
    const counts = new Map<string, number>();
    let nonNullCount = 0;
    for (const row of rows) {
        const key = keyForRow(row, keys);
        if (key === null) continue;
        nonNullCount += 1;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return {
        counts,
        nonNullCount,
        uniqueness: nonNullCount === 0 ? 0 : counts.size / nonNullCount,
    };
};

const resolveCardinality = (
    fromUnique: boolean,
    toUnique: boolean,
): DatasetRelationshipCardinality => {
    if (fromUnique && toUnique) return 'one_to_one';
    if (fromUnique) return 'one_to_many';
    if (toUnique) return 'many_to_one';
    return 'many_to_many';
};

export const assessDatasetRelationship = (
    input: DatasetRelationshipAssessmentInput,
    now = new Date().toISOString(),
): DatasetRelationship => {
    const keysMissing = input.fromKeys.length === 0
        || input.fromKeys.length !== input.toKeys.length
        || input.fromKeys.some(key => !input.fromTable.schema.some(column => column.name === key))
        || input.toKeys.some(key => !input.toTable.schema.some(column => column.name === key));
    const fromStats = keyStats(input.fromRows, input.fromKeys);
    const toStats = keyStats(input.toRows, input.toKeys);
    const fromUnique = fromStats.nonNullCount > 0 && fromStats.counts.size === fromStats.nonNullCount;
    const toUnique = toStats.nonNullCount > 0 && toStats.counts.size === toStats.nonNullCount;
    const cardinality = keysMissing ? 'unknown' : resolveCardinality(fromUnique, toUnique);
    let matchedFromRows = 0;
    let joinedRows = 0;
    for (const [key, count] of fromStats.counts) {
        const targetCount = toStats.counts.get(key) ?? 0;
        if (targetCount > 0) matchedFromRows += count;
        joinedRows += count * targetCount;
    }
    const foreignKeyCoverage = fromStats.nonNullCount === 0 ? 0 : matchedFromRows / fromStats.nonNullCount;
    const duplicateAmplification = fromStats.nonNullCount === 0 ? 0 : joinedRows / fromStats.nonNullCount;
    const reasonCodes: DatasetRelationshipReasonCode[] = [];
    let decision: DatasetRelationship['decision'] = 'trusted';

    if (keysMissing) {
        decision = 'blocked';
        reasonCodes.push('relationship_keys_missing');
    } else if (foreignKeyCoverage <= RELATIONSHIP_NO_MATCH_COVERAGE) {
        decision = 'blocked';
        reasonCodes.push('relationship_no_matching_keys');
    } else if (cardinality === 'many_to_many') {
        decision = 'blocked';
        reasonCodes.push('relationship_many_to_many');
    } else if (duplicateAmplification > RELATIONSHIP_MAX_AMPLIFICATION) {
        decision = 'blocked';
        reasonCodes.push('relationship_duplicate_amplification');
    } else if (foreignKeyCoverage < RELATIONSHIP_TRUSTED_COVERAGE || cardinality === 'one_to_many') {
        decision = 'needs_confirmation';
        reasonCodes.push('relationship_partial_coverage');
    } else {
        reasonCodes.push('relationship_safe');
    }

    const relationshipId = `relationship-${stableHash([
        input.fromTable.tableId,
        input.toTable.tableId,
        input.fromKeys.join(','),
        input.toKeys.join(','),
    ].join('|'))}`;
    return {
        relationshipId,
        fromTableId: input.fromTable.tableId,
        toTableId: input.toTable.tableId,
        fromKeys: [...input.fromKeys],
        toKeys: [...input.toKeys],
        cardinality,
        fromKeyUniqueness: fromStats.uniqueness,
        toKeyUniqueness: toStats.uniqueness,
        foreignKeyCoverage,
        duplicateAmplification,
        decision,
        reasonCodes,
        validatedAt: now,
    };
};

export const canExecuteDatasetRelationship = (relationship: DatasetRelationship): boolean =>
    relationship.decision === 'trusted';

export const resolveDatasetScopeBinding = (
    bundle: DatasetBundle | null | undefined,
): Partial<DatasetScopeBinding> => bundle
    ? {
        tableId: bundle.primaryTableId,
        datasetVersion: bundle.datasetVersion,
        relationshipSetId: bundle.relationshipSetId,
    }
    : {};

export const createRelationshipSetId = (relationships: DatasetRelationship[]): string =>
    `relationships-${stableHash(relationships
        .map(relationship => `${relationship.relationshipId}:${relationship.decision}:${relationship.validatedAt}`)
        .sort()
        .join('|'))}`;

export const validateTransformationProgram = (program: TransformationProgram): string[] => {
    const errors: string[] = [];
    if (!program.programId || !program.bundleId || !program.idempotencyKey) {
        errors.push('program_identity_missing');
    }
    const stepIds = new Set<string>();
    const idempotencyKeys = new Set<string>();
    for (const step of program.steps) {
        if (!step.stepId || stepIds.has(step.stepId)) errors.push('step_id_invalid');
        if (!step.idempotencyKey || idempotencyKeys.has(step.idempotencyKey)) errors.push('step_idempotency_key_invalid');
        if (step.inputTableIds.length === 0 || step.outputTableIds.length === 0) errors.push('step_table_binding_missing');
        if (step.kind === 'declarative' && !step.operation) errors.push('declarative_operation_missing');
        if (step.kind !== 'declarative' && !step.sandboxCodeRef) errors.push('sandbox_code_reference_missing');
        stepIds.add(step.stepId);
        idempotencyKeys.add(step.idempotencyKey);
    }
    return Array.from(new Set(errors));
};

export const validateDatasetBundle = (bundle: DatasetBundle): string[] => {
    const errors: string[] = [];
    if (bundle.schemaVersion !== DATASET_BUNDLE_SCHEMA_VERSION) errors.push('bundle_schema_unsupported');
    if (!bundle.tables.some(table => table.tableId === bundle.primaryTableId)) errors.push('primary_table_missing');
    if (new Set(bundle.tables.map(table => table.tableId)).size !== bundle.tables.length) errors.push('duplicate_table_id');
    const tableIds = new Set(bundle.tables.map(table => table.tableId));
    for (const relationship of bundle.relationships) {
        if (!tableIds.has(relationship.fromTableId) || !tableIds.has(relationship.toTableId)) {
            errors.push('relationship_table_missing');
        }
    }
    for (const program of bundle.transformationPrograms) {
        errors.push(...validateTransformationProgram(program));
    }
    return Array.from(new Set(errors));
};

export const verifyDatasetBundleSource = async (input: {
    bundle: DatasetBundle;
    file: File;
    parsedData?: CsvData;
}): Promise<{ matches: boolean; fingerprint: string | null; reasonCode: string }> => {
    if (input.file.name !== input.bundle.source.fileName || input.file.size !== input.bundle.source.byteSize) {
        return { matches: false, fingerprint: null, reasonCode: 'source_metadata_mismatch' };
    }
    const expected = input.bundle.source.fingerprint;
    const fingerprint = expected.startsWith('dataset-file-')
        ? (await buildDuckDbFileIdentity(input.file)).loadVersion
        : input.parsedData
            ? buildDatasetFingerprint(input.file.name, input.parsedData.data)
            : null;
    if (!fingerprint) return { matches: false, fingerprint: null, reasonCode: 'source_parse_required' };
    return fingerprint === expected
        ? { matches: true, fingerprint, reasonCode: 'source_verified' }
        : { matches: false, fingerprint, reasonCode: 'source_fingerprint_mismatch' };
};

export const commitVerifiedPrimaryTableTransformation = (input: {
    bundle: DatasetBundle | null | undefined;
    data: CsvData;
    operations: NonNullable<TransformationProgramStep['operation']>[];
    runId: string | null;
    now?: string;
}): DatasetBundle | null => {
    if (!input.bundle) return null;
    const now = input.now ?? new Date().toISOString();
    const outputVersion = getCsvDatasetVersion(input.data);
    const idempotencyKey = [
        input.bundle.bundleId,
        outputVersion,
        ...input.operations.map(operation => operation.id),
    ].join(':');
    const existingProgram = input.bundle.transformationPrograms.find(program =>
        program.idempotencyKey === idempotencyKey);
    const primaryTable = input.bundle.tables.find(table => table.tableId === input.bundle!.primaryTableId);
    if (!primaryTable) return input.bundle;
    const program: TransformationProgram = existingProgram ?? {
        programId: `program-${stableHash(idempotencyKey)}`,
        bundleId: input.bundle.bundleId,
        inputVersion: input.bundle.datasetVersion,
        outputVersion,
        idempotencyKey,
        status: 'committed',
        createdAt: now,
        steps: input.operations.map((operation, index) => ({
            stepId: operation.id,
            kind: 'declarative',
            operation,
            inputTableIds: [primaryTable.tableId],
            outputTableIds: [primaryTable.tableId],
            idempotencyKey: `${input.runId ?? 'cleaning'}:${index}:${operation.id}`,
        })),
    };
    return {
        ...input.bundle,
        datasetVersion: outputVersion,
        tables: input.bundle.tables.map(table => table.tableId === primaryTable.tableId
            ? {
                ...table,
                schema: inferDatasetTableSchema(input.data.data),
                rowCount: getCsvDataRowCount(input.data),
                storage: resolveStorage(input.data),
                datasetVersion: outputVersion,
            }
            : table),
        transformationPrograms: existingProgram
            ? input.bundle.transformationPrograms
            : [...input.bundle.transformationPrograms, program],
        updatedAt: now,
    };
};
