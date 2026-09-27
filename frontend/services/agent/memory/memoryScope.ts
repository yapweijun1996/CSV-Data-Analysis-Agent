import type {
    CsvData,
    AgentMemoryRun,
    PendingVectorMemoryDoc,
    ReportMemoryOrigin,
    ReportMemoryOriginKind,
    ReportMemoryScope,
    VectorStoreDocument,
    VectorStoreDocumentMetadata,
} from '../../../types';
import { buildDatasetId, buildDatasetVersionId } from '../../../utils/datasetId';

export type MemoryScopeState = {
    sessionId: string;
    currentDatasetId: string | null;
    reportMemoryScope?: ReportMemoryScope | null;
    rawCsvData: CsvData | null;
    canonicalCsvData: CsvData | null;
    csvData: CsvData | null;
};

const resolveSourceDataset = (state: MemoryScopeState): CsvData | null =>
    state.rawCsvData ?? state.csvData ?? state.canonicalCsvData;

const resolveMaterialDataset = (state: MemoryScopeState): CsvData | null =>
    state.canonicalCsvData ?? state.csvData ?? state.rawCsvData;

export const resolveReportMemoryScope = (
    state: MemoryScopeState,
): ReportMemoryScope | null => {
    const source = resolveSourceDataset(state);
    const material = resolveMaterialDataset(state);
    const reportId = state.reportMemoryScope?.reportId?.trim()
        || state.sessionId?.trim();
    if (!source || !material || !reportId) return null;

    return {
        reportId,
        datasetId: state.currentDatasetId
            ?? state.reportMemoryScope?.datasetId
            ?? buildDatasetId(source.fileName, source.data),
        datasetVersion: buildDatasetVersionId(material.fileName, material.data),
    };
};

export const isSameReportMemoryScope = (
    candidate: ReportMemoryScope | null | undefined,
    expected: ReportMemoryScope | null | undefined,
): boolean => Boolean(
    candidate
    && expected
    && candidate.reportId === expected.reportId
    && candidate.datasetId === expected.datasetId
    && candidate.datasetVersion === expected.datasetVersion
);

const encodeScopePart = (value: string): string =>
    encodeURIComponent(value);

export const buildScopedMemoryDocumentId = (
    scope: ReportMemoryScope,
    localId: string,
): string => [
    'memory',
    encodeScopePart(scope.reportId),
    encodeScopePart(scope.datasetId),
    encodeScopePart(scope.datasetVersion),
    encodeScopePart(localId),
].join(':');

export const createReportMemoryOrigin = (
    kind: ReportMemoryOriginKind,
    label: string,
    sourceId?: string,
    createdAt = new Date(),
): ReportMemoryOrigin => ({
    kind,
    label,
    ...(sourceId ? { sourceId } : {}),
    createdAt: createdAt.toISOString(),
});

export const scopePendingMemoryDocument = (
    document: PendingVectorMemoryDoc,
    scope: ReportMemoryScope,
    origin: ReportMemoryOrigin,
): PendingVectorMemoryDoc => ({
    ...document,
    id: buildScopedMemoryDocumentId(scope, origin.sourceId ?? document.id),
    metadata: {
        ...document.metadata,
        scope,
        origin,
    } as VectorStoreDocumentMetadata,
});

/**
 * Saved v8 reports own their embedded vector snapshot. Missing scope can
 * therefore be migrated safely to that report, while already-scoped records
 * keep their original provenance untouched.
 */
export const normalizeSavedReportMemoryDocuments = (
    documents: VectorStoreDocument[],
    scope: ReportMemoryScope,
): VectorStoreDocument[] => documents.map(document => {
    if (document.metadata?.scope) return document;
    const sourceId = document.metadata?.cardId ?? document.id;
    return {
        ...document,
        id: buildScopedMemoryDocumentId(scope, sourceId),
        metadata: {
            ...document.metadata,
            scope,
            origin: document.metadata?.origin ?? createReportMemoryOrigin(
                'legacy_report',
                'Migrated from this saved report',
                sourceId,
            ),
        } as VectorStoreDocumentMetadata,
    };
});

export const normalizeSavedReportPendingMemoryDocuments = (
    documents: PendingVectorMemoryDoc[] | null | undefined,
    scope: ReportMemoryScope,
): PendingVectorMemoryDoc[] => (documents ?? []).map(document => {
    if (document.metadata?.scope) return document;
    const sourceId = document.metadata?.cardId ?? document.id;
    return scopePendingMemoryDocument(
        document,
        scope,
        document.metadata?.origin ?? createReportMemoryOrigin(
            'legacy_report',
            'Migrated pending memory from this saved report',
            sourceId,
        ),
    );
});

export const filterDocumentsForMemoryScope = (
    documents: VectorStoreDocument[],
    scope: ReportMemoryScope | null,
): VectorStoreDocument[] => {
    if (!scope) return [];
    return documents.filter(document =>
        isSameReportMemoryScope(document.metadata?.scope, scope));
};

export const normalizeSavedAgentMemoryRun = (
    run: AgentMemoryRun | null | undefined,
    scope: ReportMemoryScope,
): AgentMemoryRun | null => {
    if (!run) return null;
    if (run.reportId && run.datasetVersion) return run;
    return {
        ...run,
        datasetId: scope.datasetId,
        reportId: scope.reportId,
        datasetVersion: scope.datasetVersion,
        origin: run.origin ?? createReportMemoryOrigin(
            'legacy_report',
            'Migrated agent run from this saved report',
            run.runId,
            run.createdAt instanceof Date ? run.createdAt : new Date(run.createdAt),
        ),
    };
};

export const normalizeSavedAgentMemoryRuns = (
    runs: AgentMemoryRun[] | null | undefined,
    scope: ReportMemoryScope,
): AgentMemoryRun[] => (runs ?? [])
    .map(run => normalizeSavedAgentMemoryRun(run, scope))
    .filter((run): run is AgentMemoryRun => Boolean(run));
