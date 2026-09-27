import type {
    AnalysisCardData,
    ColumnProfile,
    CsvData,
    DataPreparationPlan,
    PendingVectorMemoryDoc,
    ReportMemoryScope,
    ResolvedClarification,
    UserColumnAnnotation,
    VectorMemoryState,
} from '../../../types';
import { vectorStore } from '../../vectorStore';
import { buildDatasetMemoryDocuments } from '../contextBuilder';
import { buildCardMemoryProjectionList } from './cardMemoryProjection';
import type { ChatInsightDocument } from './chatInsightExtractor';
import type { AnalysisPatternDocument } from './analysisPatternExtractor';
import {
    buildScopedMemoryDocumentId,
    createReportMemoryOrigin,
    resolveReportMemoryScope,
    scopePendingMemoryDocument,
} from './memoryScope';

type MemorySyncStore = {
    getState: () => {
        analysisCards: AnalysisCardData[];
        columnProfiles: ColumnProfile[];
        csvData: CsvData | null;
        rawCsvData: CsvData | null;
        canonicalCsvData: CsvData | null;
        sessionId: string;
        currentDatasetId: string | null;
        reportMemoryScope: ReportMemoryScope | null;
        dataPreparationPlan: DataPreparationPlan | null;
        vectorStoreDocuments: unknown[];
        vectorMemoryState: VectorMemoryState;
        pendingVectorMemoryDocs: PendingVectorMemoryDoc[];
        addProgress?: (message: string, type?: 'system' | 'warning' | 'error') => void;
    };
    setState: (partial: Record<string, unknown> | ((state: Record<string, unknown>) => Record<string, unknown>)) => void;
};

const LOG_PREFIX = '[VectorMemorySync]';

const buildCardMemoryDocuments = (
    cards: AnalysisCardData[],
    columnProfiles: ColumnProfile[],
    scope: ReportMemoryScope,
) => buildCardMemoryProjectionList(cards, columnProfiles).map(projection =>
    scopePendingMemoryDocument({
        id: projection.cardId,
        text: projection.memoryText,
        metadata: projection.metadata,
    }, scope, createReportMemoryOrigin(
        'analysis_card',
        `Analysis card: ${projection.displayTitle}`,
        projection.cardId,
    )));

const resolveScope = (state: ReturnType<MemorySyncStore['getState']>) =>
    resolveReportMemoryScope(state);

/**
 * Enqueue dataset memory documents into the pending queue without triggering
 * ONNX model initialization. Called during file import (PERF-101).
 */
export const enqueueDatasetMemoryDocs = (store: MemorySyncStore) => {
    const state = store.getState();
    const scope = resolveScope(state);
    if (!scope) return;
    const datasetDocs = buildDatasetMemoryDocuments({
        csvData: state.csvData,
        dataPreparationPlan: state.dataPreparationPlan,
        columnProfiles: state.columnProfiles,
    });
    if (datasetDocs.length === 0) return;
    const scopedDatasetDocs = datasetDocs.map(document =>
        scopePendingMemoryDocument(document, scope, createReportMemoryOrigin(
            'dataset_import',
            `Dataset import: ${state.csvData?.fileName ?? 'dataset'}`,
            'dataset-summary',
        )));

    store.setState((prev: Record<string, unknown>) => ({
        pendingVectorMemoryDocs: [
            ...(prev.pendingVectorMemoryDocs as PendingVectorMemoryDoc[] ?? []),
            ...scopedDatasetDocs,
        ],
    }));
};

/**
 * Enqueue a single card memory document into the pending queue.
 * If memory is ready, writes directly to the vector store instead.
 */
export const upsertCardMemoryDocument = async (
    store: MemorySyncStore,
    cardId: string,
) => {
    const state = store.getState();
    const scope = resolveScope(state);
    if (!scope) return;
    const card = state.analysisCards.find(candidate => candidate.id === cardId);
    if (!card) return;

    const projection = buildCardMemoryProjectionList(state.analysisCards, state.columnProfiles)
        .find(candidate => candidate.cardId === cardId);
    if (!projection) return;

    const doc = scopePendingMemoryDocument({
        id: projection.cardId,
        text: projection.memoryText,
        metadata: projection.metadata,
    }, scope, createReportMemoryOrigin(
        'analysis_card',
        `Analysis card: ${projection.displayTitle}`,
        projection.cardId,
    ));

    // If memory is ready, write directly to vector store (PERF-102).
    if (state.vectorMemoryState === 'ready') {
        await vectorStore.addDocument(doc);
        vectorStore.schedulePersist();
        // PERF-308: Skip setState({ vectorStoreDocuments }) during batch upsert.
        // This snapshot is only used for debug display (AgentMemoryView).
        // Avoiding 2.3s React re-render per card saves ~9s during post-analysis
        // memory upsert. The snapshot refreshes on next panel open.
        return;
    }

    // Otherwise, enqueue for later flush.
    store.setState((prev: Record<string, unknown>) => ({
        pendingVectorMemoryDocs: [
            ...(prev.pendingVectorMemoryDocs as PendingVectorMemoryDoc[] ?? []).filter(
                (d: PendingVectorMemoryDoc) =>
                    d.id !== doc.id && d.metadata?.cardId !== cardId,
            ),
            doc,
        ],
    }));
};

/**
 * Flush all pending vector memory documents to the vector store.
 * Called after memory becomes ready (PERF-104). Uses small batches
 * to avoid long-running single tasks.
 */
const FLUSH_BATCH_SIZE = 10;

export const flushPendingVectorMemoryDocs = async (store: MemorySyncStore) => {
    const { pendingVectorMemoryDocs } = store.getState();
    if (pendingVectorMemoryDocs.length === 0) return;

    console.log(`${LOG_PREFIX} Flushing ${pendingVectorMemoryDocs.length} pending vector memory docs.`);

    // Take a snapshot of docs to flush and clear the queue immediately
    // so new docs added during flush go into a fresh queue.
    store.setState({ pendingVectorMemoryDocs: [] });

    for (let i = 0; i < pendingVectorMemoryDocs.length; i += FLUSH_BATCH_SIZE) {
        const batch = pendingVectorMemoryDocs.slice(i, i + FLUSH_BATCH_SIZE);
        try {
            await vectorStore.addDocumentBatch(batch);
        } catch (error) {
            console.warn(`${LOG_PREFIX} Batch flush failed (non-blocking):`, error);
        }
    }

    vectorStore.schedulePersist();

    try {
        store.setState({ vectorStoreDocuments: await vectorStore.getDocuments() });
    } catch {
        // Snapshot fetch timed out — stale local cache is acceptable.
    }
};

/**
 * Full rebuild from store state — used when loading historical reports
 * or when explicit rebuild is needed. This still triggers init if not ready.
 */
export const rebuildVectorMemoryFromState = async (
    store: MemorySyncStore,
    options: {
        reset?: boolean;
        includeDatasetDocs?: boolean;
        progressMessage?: string;
    } = {},
) => {
    const { getState, setState } = store;
    const {
        reset = true,
        includeDatasetDocs = true,
        progressMessage,
    } = options;
    const state = getState();
    const scope = resolveScope(state);
    if (!scope) return;

    if (reset) {
        await vectorStore.clear();
        setState({ vectorStoreDocuments: [] });
    }

    if (progressMessage) {
        state.addProgress?.(progressMessage);
    }

    const datasetDocs = includeDatasetDocs
        ? buildDatasetMemoryDocuments({
            csvData: state.csvData,
            dataPreparationPlan: state.dataPreparationPlan,
            columnProfiles: state.columnProfiles,
        }).map(document => scopePendingMemoryDocument(
            document,
            scope,
            createReportMemoryOrigin(
                'dataset_import',
                `Dataset import: ${state.csvData?.fileName ?? 'dataset'}`,
                'dataset-summary',
            ),
        ))
        : [];
    const cardDocs = buildCardMemoryDocuments(state.analysisCards, state.columnProfiles, scope);

    const allDocs = [...datasetDocs, ...cardDocs];
    // Batch all documents to the worker in one call — the worker runs on a
    // separate thread so there is no main-thread ONNX blocking to yield from.
    if (allDocs.length > 0) {
        await vectorStore.addDocumentBatch(allDocs);
        vectorStore.schedulePersist();
    }

    try {
        setState({ vectorStoreDocuments: await vectorStore.getDocuments() });
    } catch {
        // Snapshot fetch timed out — stale local cache is acceptable.
    }
};

export const removeCardMemoryDocument = async (
    store: MemorySyncStore,
    cardId: string,
) => {
    const scope = resolveScope(store.getState());
    // Always purge from the pending queue, regardless of memory state.
    // This prevents a deleted card from being flushed back into the vector
    // store after memory activation (Ticket: pending-queue-sync).
    store.setState((prev: Record<string, unknown>) => {
        const pending = prev.pendingVectorMemoryDocs as PendingVectorMemoryDoc[] ?? [];
        const filtered = pending.filter((doc: PendingVectorMemoryDoc) =>
            doc.id !== cardId && doc.metadata?.cardId !== cardId);
        if (filtered.length === pending.length) return {};
        return { pendingVectorMemoryDocs: filtered };
    });

    try {
        const deleted = scope
            ? await vectorStore.deleteDocument(buildScopedMemoryDocumentId(scope, cardId))
            : false;
        if (deleted) {
            vectorStore.schedulePersist();
            store.setState({ vectorStoreDocuments: await vectorStore.getDocuments() });
        }
    } catch (error) {
        console.warn(`${LOG_PREFIX} removeCardMemoryDocument failed (non-blocking):`, error);
    }
};

/**
 * Write chat insight documents to vector memory.
 * If memory is ready, writes directly; otherwise enqueues for later flush.
 */
export const upsertChatInsightDocs = async (
    store: MemorySyncStore,
    insights: ChatInsightDocument[],
) => {
    if (insights.length === 0) return;

    const state = store.getState();
    const scope = resolveScope(state);
    if (!scope) return;
    const scopedInsights = insights.map(insight =>
        scopePendingMemoryDocument(insight, scope, createReportMemoryOrigin(
            'chat_insight',
            'Chat insight extracted from this report',
            insight.id,
        )));

    if (state.vectorMemoryState === 'ready') {
        try {
            await vectorStore.addDocumentBatch(scopedInsights);
            vectorStore.schedulePersist();
            store.setState({ vectorStoreDocuments: await vectorStore.getDocuments() });
        } catch (error) {
            console.warn(`${LOG_PREFIX} upsertChatInsightDocs failed (non-blocking):`, error);
        }
        return;
    }

    // Enqueue for later flush when memory becomes ready.
    store.setState((prev: Record<string, unknown>) => {
        const pending = prev.pendingVectorMemoryDocs as PendingVectorMemoryDoc[] ?? [];
        const insightIds = new Set(scopedInsights.map(i => i.id));
        const filtered = pending.filter((d: PendingVectorMemoryDoc) => !insightIds.has(d.id));
        return { pendingVectorMemoryDocs: [...filtered, ...scopedInsights] };
    });
};

/**
 * Persist a user correction or accepted clarification as durable report
 * learning. The stable key replaces earlier answers to the same question.
 */
export const upsertAcceptedDecisionDoc = async (
    store: MemorySyncStore,
    decision: ResolvedClarification,
) => {
    const state = store.getState();
    const scope = resolveScope(state);
    if (!scope) return;

    const sourceId = `accepted-decision-${decision.key}`;
    const doc = scopePendingMemoryDocument({
        id: sourceId,
        text: [
            '[Accepted Decision]',
            `Question: ${decision.question}`,
            `User answer: ${decision.value}`,
            `Accepted at turn: ${decision.resolvedAtTurn}`,
        ].join('\n'),
        metadata: {
            kind: 'accepted_decision',
            memoryFormatVersion: 'ir-v1',
            extractedAtTurn: decision.resolvedAtTurn,
            extractedAt: new Date().toISOString(),
        },
    }, scope, createReportMemoryOrigin(
        'resolved_clarification',
        `Accepted user decision: ${decision.question}`,
        sourceId,
    ));

    if (state.vectorMemoryState === 'ready') {
        await vectorStore.addDocument(doc);
        vectorStore.schedulePersist();
        store.setState({ vectorStoreDocuments: await vectorStore.getDocuments() });
        return;
    }

    store.setState((prev: Record<string, unknown>) => {
        const pending = prev.pendingVectorMemoryDocs as PendingVectorMemoryDoc[] ?? [];
        return {
            pendingVectorMemoryDocs: [
                ...pending.filter((candidate: PendingVectorMemoryDoc) =>
                    candidate.id !== doc.id
                    && candidate.metadata?.origin?.sourceId !== sourceId),
                doc,
            ],
        };
    });
};

// --- Column annotation (data dictionary) ---

const buildAnnotationDocId = (columnName: string) => `col-annotation-${columnName}`;

const buildAnnotationMemoryText = (annotation: UserColumnAnnotation): string => [
    `[Column Annotation] ${annotation.columnName}`,
    `Label: ${annotation.businessLabel}`,
    annotation.description ? `Description: ${annotation.description}` : null,
    annotation.businessRole ? `Role: ${annotation.businessRole}` : null,
].filter(Boolean).join('\n');

/** Write a user column annotation to vector memory. */
export const upsertColumnAnnotationDoc = async (
    store: MemorySyncStore,
    annotation: UserColumnAnnotation,
) => {
    const state = store.getState();
    const scope = resolveScope(state);
    if (!scope) return;
    const sourceId = buildAnnotationDocId(annotation.columnName);
    const doc = scopePendingMemoryDocument({
        id: sourceId,
        text: buildAnnotationMemoryText(annotation),
        metadata: {
            kind: 'column_annotation',
            memoryFormatVersion: 'ir-v1',
        },
    }, scope, createReportMemoryOrigin(
        'column_annotation',
        `Column annotation: ${annotation.columnName}`,
        sourceId,
    ));

    if (state.vectorMemoryState === 'ready') {
        try {
            await vectorStore.addDocument(doc);
            vectorStore.schedulePersist();
        } catch (error) {
            console.warn(`${LOG_PREFIX} upsertColumnAnnotationDoc failed (non-blocking):`, error);
        }
        return;
    }

    store.setState((prev: Record<string, unknown>) => {
        const pending = prev.pendingVectorMemoryDocs as PendingVectorMemoryDoc[] ?? [];
        return {
            pendingVectorMemoryDocs: [
                ...pending.filter((d: PendingVectorMemoryDoc) => d.id !== doc.id),
                doc,
            ],
        };
    });
};

/** Remove a column annotation from vector memory. */
export const removeColumnAnnotationDoc = async (
    store: MemorySyncStore,
    columnName: string,
) => {
    const sourceId = buildAnnotationDocId(columnName);

    store.setState((prev: Record<string, unknown>) => {
        const pending = prev.pendingVectorMemoryDocs as PendingVectorMemoryDoc[] ?? [];
        const filtered = pending.filter((d: PendingVectorMemoryDoc) =>
            d.id !== sourceId && d.metadata?.origin?.sourceId !== sourceId);
        if (filtered.length === pending.length) return {};
        return { pendingVectorMemoryDocs: filtered };
    });

    try {
        const scope = resolveScope(store.getState());
        const deleted = scope
            ? await vectorStore.deleteDocument(buildScopedMemoryDocumentId(scope, sourceId))
            : false;
        if (deleted) vectorStore.schedulePersist();
    } catch (error) {
        console.warn(`${LOG_PREFIX} removeColumnAnnotationDoc failed (non-blocking):`, error);
    }
};

// --- Analysis pattern (report-scoped learning) ---

/** Write an analysis pattern document to vector memory. */
export const upsertAnalysisPatternDoc = async (
    store: MemorySyncStore,
    pattern: AnalysisPatternDocument,
) => {
    const state = store.getState();
    const scope = resolveScope(state);
    if (!scope) return;
    const scopedPattern = scopePendingMemoryDocument(
        pattern,
        scope,
        createReportMemoryOrigin(
            'analysis_pattern',
            'Analysis pattern accepted in this report',
            pattern.id,
        ),
    );
    if (state.vectorMemoryState === 'ready') {
        try {
            await vectorStore.addDocument(scopedPattern);
            vectorStore.schedulePersist();
        } catch (error) {
            console.warn(`${LOG_PREFIX} upsertAnalysisPatternDoc failed (non-blocking):`, error);
        }
        return;
    }

    store.setState((prev: Record<string, unknown>) => {
        const pending = prev.pendingVectorMemoryDocs as PendingVectorMemoryDoc[] ?? [];
        return {
            pendingVectorMemoryDocs: [
                ...pending.filter((d: PendingVectorMemoryDoc) =>
                    d.id !== scopedPattern.id
                    && d.metadata?.origin?.sourceId !== pattern.id),
                scopedPattern,
            ],
        };
    });
};
