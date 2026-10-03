import type {
    AnalysisCardData,
    SqlEvidenceQueryPlan,
} from '../../../../types';
import { evaluateEvidenceValue, type ExistingAcceptedEvidence } from '../../evidenceValueGate';
import { buildEvidenceResultSummary } from '../../execution/sqlCardExecutor';
import { emitSilentFailure } from '../../monitoring/silentFailureTracker';
import type { StoreApi } from '../../types';

export interface PiCardGateRejection {
    cardId: string;
    title: string;
    detail: string;
}

export interface PiCardGateOutcome {
    rejected: PiCardGateRejection[];
    tableOnlyIds: string[];
}

/**
 * Re-run the topic pipeline's evidence value gate on cards Pi created.
 *
 * Pi saves the card inside `analysis.create_plan`, so the gate runs after the
 * fact: `reject` removes the card, `table_only` keeps it and is stored on the
 * card so the automatic quality evaluator and trust labels see it. A card is
 * left untouched when the gate cannot be evaluated (no semantic understanding
 * from an initial analysis, or no query trace) or throws.
 */
export const gatePiCreatedCards = (store: StoreApi, cardIds: string[]): PiCardGateOutcome => {
    const outcome: PiCardGateOutcome = { rejected: [], tableOnlyIds: [] };
    for (const cardId of cardIds) {
        try {
            const state = store.getState();
            const card = state.analysisCards.find(candidate => candidate.id === cardId);
            const semanticUnderstanding = state.latestAnalysisSession?.semanticUnderstanding ?? null;
            const traceId = card?.provenance?.queryEvidence?.traceId;
            const trace = traceId ? state.queryHistory?.find(entry => entry.id === traceId) : undefined;
            if (!card || !semanticUnderstanding || !trace) continue;

            const evidencePlan: SqlEvidenceQueryPlan = {
                title: card.plan.title,
                queryMode: (trace.plan.aggregates?.length ?? 0) > 0 ? 'aggregate' : 'rowset',
                query: trace.plan,
                intentSummary: card.plan.description,
            };
            const evidenceSummary = buildEvidenceResultSummary(evidencePlan, {
                rows: card.aggregatedData,
                totalMatchedRows: trace.result.totalMatchedRows,
                returnedRows: card.aggregatedData.length,
                truncated: trace.result.truncated,
                selectedColumns: trace.result.selectedColumns,
                appliedOrderBy: [],
                appliedLimit: 0,
                durationMs: 0,
            }, state.columnProfiles ?? []);
            const existingAcceptedOutputs = state.analysisCards
                .filter((other: AnalysisCardData) =>
                    other.id !== cardId
                    && other.evidenceValueGate
                    && other.evidenceValueGate.decision !== 'reject')
                .map((other): ExistingAcceptedEvidence => ({
                    querySignature: other.evidenceValueGate!.querySignature,
                    semanticSignature: other.evidenceValueGate!.semanticSignature,
                    decision: other.evidenceValueGate!.decision,
                    title: other.plan.title,
                }));

            const gate = evaluateEvidenceValue({
                semanticUnderstanding,
                evidencePlan,
                evidenceSummary,
                existingAcceptedOutputs,
            });
            if (gate.decision === 'reject') {
                state.deleteAnalysisCard(cardId);
                outcome.rejected.push({ cardId, title: card.plan.title, detail: gate.detail });
                continue;
            }
            if (gate.decision === 'table_only') outcome.tableOnlyIds.push(cardId);
            store.setState(current => ({
                analysisCards: current.analysisCards.map(candidate => candidate.id === cardId
                    ? {
                        ...candidate,
                        evidenceValueGate: {
                            ...gate,
                            evaluatedAt: new Date().toISOString(),
                            source: 'evidence_value_gate_v1',
                        },
                    }
                    : candidate),
            }));
        } catch (error) {
            // The card stays visible with the automatic quality verdict only.
            emitSilentFailure(store, error, {
                component: 'PiCardEvidenceGate',
                recoveryAction: 'card_kept_without_value_gate',
                userNotified: false,
                detail: { cardId },
            });
        }
    }
    return outcome;
};
