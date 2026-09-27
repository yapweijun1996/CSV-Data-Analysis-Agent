import type {
    DataAnalysisHypothesis,
    DataAnalysisSessionState,
    DataResearchBrief,
    DataResearchFinding,
    DataResearchQuestionStatus,
} from '../../../types';
import { createId } from '../../../utils/createId';

const DEFAULT_STOP_CONDITIONS = [
    'accepted_card_limit_reached',
    'step_budget_exhausted',
    'all_hypotheses_exhausted',
    'insufficient_step_budget',
    'user_cancelled',
];

export const buildDataResearchBrief = (params: {
    goal: string;
    datasetVersionId: string | null;
    hypotheses: DataAnalysisHypothesis[];
    clarificationReason?: string | null;
}): DataResearchBrief => ({
    goal: params.goal,
    datasetVersionId: params.datasetVersionId,
    questions: params.hypotheses.map(hypothesis => ({
        id: createId('research-question'),
        hypothesisId: hypothesis.id,
        question: hypothesis.topic,
        priority: hypothesis.priority,
        status: 'pending',
    })),
    stopConditions: [...DEFAULT_STOP_CONDITIONS],
    clarification: params.clarificationReason
        ? {
            reason: params.clarificationReason,
            question: 'Which business grain or metric should the research run prioritize?',
        }
        : null,
    createdAt: new Date(),
});

const resolveQuestionStatus = (
    session: DataAnalysisSessionState,
    hypothesisId: string,
): DataResearchQuestionStatus => {
    if (session.status === 'cancelled') return 'cancelled';
    if (session.acceptedOutputs.some(output => output.sourceHypothesisId === hypothesisId)) return 'supported';
    if (session.rejectedOutputs.some(output => output.sourceHypothesisId === hypothesisId)) return 'unsupported';
    const hypothesis = session.hypotheses.find(candidate => candidate.id === hypothesisId);
    return hypothesis?.status === 'active' ? 'investigating' : 'pending';
};

export const syncDataResearchBrief = (
    session: DataAnalysisSessionState,
): DataAnalysisSessionState => {
    if (!session.researchBrief) return session;
    return {
        ...session,
        researchBrief: {
            ...session.researchBrief,
            questions: session.researchBrief.questions.map(question => ({
                ...question,
                status: resolveQuestionStatus(session, question.hypothesisId),
            })),
        },
    };
};

export const buildDataResearchFindings = (
    session: DataAnalysisSessionState,
): DataResearchFinding[] => {
    const questionsByHypothesis = new Map(
        session.researchBrief?.questions.map(question => [question.hypothesisId, question]) ?? [],
    );

    const supported = session.acceptedOutputs.map(output => {
        const hypothesis = session.hypotheses.find(candidate => candidate.id === output.sourceHypothesisId);
        const question = questionsByHypothesis.get(output.sourceHypothesisId);
        return {
            id: createId('research-finding'),
            questionId: question?.id ?? output.sourceHypothesisId,
            hypothesisId: output.sourceHypothesisId,
            claim: hypothesis?.topic ?? 'Accepted research finding',
            status: 'supported' as const,
            evidenceRefs: [
                { kind: 'query' as const, ref: output.querySignature },
                { kind: 'card' as const, ref: output.cardId },
                ...output.sourceStepIds.map(ref => ({ kind: 'step' as const, ref })),
            ],
            reasonCodes: output.valueReasonCodes ?? [],
        };
    });

    const supportedHypothesisIds = new Set(
        session.acceptedOutputs.map(output => output.sourceHypothesisId),
    );
    const rejected = session.rejectedOutputs
        .filter(output => !supportedHypothesisIds.has(output.sourceHypothesisId))
        .map(output => {
            const hypothesis = session.hypotheses.find(candidate => candidate.id === output.sourceHypothesisId);
            const question = questionsByHypothesis.get(output.sourceHypothesisId);
            const hasEvidence = Boolean(output.querySignature && !output.querySignature.endsWith(':none'));
            return {
                id: createId('research-finding'),
                questionId: question?.id ?? output.sourceHypothesisId,
                hypothesisId: output.sourceHypothesisId,
                claim: hypothesis?.topic ?? output.reason,
                status: hasEvidence ? 'rejected' as const : 'hypothesis' as const,
                evidenceRefs: [
                    ...(hasEvidence ? [{ kind: 'query' as const, ref: output.querySignature }] : []),
                    ...output.sourceStepIds.map(ref => ({ kind: 'step' as const, ref })),
                ],
                reasonCodes: output.valueReasonCodes?.length
                    ? output.valueReasonCodes
                    : [output.reason],
            };
        });

    const recordedHypotheses = new Set([
        ...supported.map(finding => finding.hypothesisId),
        ...rejected.map(finding => finding.hypothesisId),
    ]);
    const unresolved = session.hypotheses
        .filter(hypothesis => !recordedHypotheses.has(hypothesis.id))
        .map(hypothesis => {
            const question = questionsByHypothesis.get(hypothesis.id);
            return {
                id: createId('research-finding'),
                questionId: question?.id ?? hypothesis.id,
                hypothesisId: hypothesis.id,
                claim: hypothesis.topic,
                status: 'hypothesis' as const,
                evidenceRefs: [],
                reasonCodes: session.status === 'cancelled' ? ['user_cancelled'] : ['unsupported_hypothesis'],
            };
        });

    return [...supported, ...rejected, ...unresolved];
};
