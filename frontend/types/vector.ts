import type {
    DisplayAnalysisIrHelperExposureLevel,
    DisplayAnalysisIrNarrativeEligibility,
    DisplayAnalysisIrSemanticRole,
} from './analysis';

export interface VectorStoreDocumentMetadata {
    kind: 'dataset' | 'analysis_card' | 'chat_insight' | 'column_annotation' | 'analysis_pattern' | 'accepted_decision';
    cardId?: string;
    semanticRole?: DisplayAnalysisIrSemanticRole;
    helperExposureLevel?: DisplayAnalysisIrHelperExposureLevel;
    narrativeEligibility?: DisplayAnalysisIrNarrativeEligibility;
    memoryFormatVersion: 'ir-v1';
    /** Schema fingerprint for cross-session template matching. */
    schemaFingerprint?: string;
    /** Chart type used for this card. */
    chartType?: string;
    /** Aggregation function used. */
    aggregation?: string;
    /** Turn number when the chat insight was extracted (for recency decay). */
    extractedAtTurn?: number;
    /** ISO timestamp when the chat insight was created. */
    extractedAt?: string;
    /**
     * MEMORY-201 retrieval boundary. Documents without a scope are legacy
     * records and must be normalized by the owning saved report before use.
     */
    scope?: ReportMemoryScope;
    /** Reader-facing explanation of where this memory came from. */
    origin?: ReportMemoryOrigin;
}

export interface ReportMemoryScope {
    reportId: string;
    datasetId: string;
    datasetVersion: string;
}

export type ReportMemoryOriginKind =
    | 'dataset_import'
    | 'analysis_card'
    | 'chat_insight'
    | 'column_annotation'
    | 'analysis_pattern'
    | 'resolved_clarification'
    | 'agent_run'
    | 'legacy_report';

export interface ReportMemoryOrigin {
    kind: ReportMemoryOriginKind;
    label: string;
    sourceId?: string;
    createdAt: string;
}

export interface VectorStoreDocument {
    id: string;
    text: string;
    embedding: number[];
    metadata?: VectorStoreDocumentMetadata;
}

export interface VectorSearchMatch {
    id: string;
    text: string;
    score: number;
    metadata?: VectorStoreDocumentMetadata;
}
