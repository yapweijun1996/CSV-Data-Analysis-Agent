import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from '../ai/streamGenerateText';
import { prepareSchemaForProvider } from '../ai/googleSchemaAdapter';
import type { ModelMessage } from 'ai';
import type {
    AnalystConfidence,
    AnalystMemo,
    AnalystRole,
    ForumDisagreement,
    ForumDisagreementPosition,
    ForumFinding,
    ForumSummary,
    ReportEvidenceBundle,
    Settings,
} from '../../types';
import { robustlyParseJsonObject } from '../../utils/jsonParser';
import { createProviderModel, isProviderConfigured } from '../ai/providerConfig';
import { withTransientRetry } from '../ai/transientRetry';
import { isRuntimeAbortError } from '../agent/runtime/runtimeAbort';
import { forumSummarySchema } from '../ai/schemas/agentSchemas';
import { createForumSummaryPrompt } from '../prompts/reportingPrompts';
import type { ReportEvidenceBriefing } from './reportEvidenceHarness';

export interface ForumSummaryGenerationDiagnostics {
    llmUsed: boolean;
    usedFallback: boolean;
    fallbackReason: string | null;
}

export interface ForumSummaryGenerationResult {
    forum: ForumSummary;
    diagnostics: ForumSummaryGenerationDiagnostics;
}

const MAX_CONSENSUS_FINDINGS = 5;
const MAX_DISAGREEMENTS = 3;
const MAX_SUPPORTED_ROLES = 3;
const MAX_EVIDENCE_REFS = 5;
const MAX_CAVEATS = 5;
const MAX_POSITIONS = 3;
const MAX_ACTIONS = 5;

const VALID_ROLES: AnalystRole[] = ['data_quality', 'business', 'risk'];

const trimText = (value: unknown): string => String(value ?? '').trim();

const isAnalystRole = (value: unknown): value is AnalystRole =>
    typeof value === 'string' && VALID_ROLES.includes(value as AnalystRole);

const dedupeStrings = (
    values: Array<string | null | undefined>,
    limit: number,
): string[] => {
    const seen = new Set<string>();
    const output: string[] = [];

    for (const value of values) {
        const normalized = trimText(value);
        if (!normalized) {
            continue;
        }

        const key = normalized.toLowerCase();
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        output.push(normalized);
        if (output.length >= limit) {
            break;
        }
    }

    return output;
};

const dedupeRoles = (roles: Array<unknown>, limit = MAX_SUPPORTED_ROLES): AnalystRole[] => {
    const seen = new Set<AnalystRole>();
    const output: AnalystRole[] = [];

    for (const role of roles) {
        if (!isAnalystRole(role) || seen.has(role)) {
            continue;
        }

        seen.add(role);
        output.push(role);
        if (output.length >= limit) {
            break;
        }
    }

    return output;
};

const resolveOverallConfidence = (
    memos: AnalystMemo[],
    bundle: ReportEvidenceBundle,
): AnalystConfidence => {
    if (bundle.dataset.reportReadiness === 'blocked') {
        return 'low';
    }

    const memoConfidences = memos.map(memo => memo.confidence);
    if (memoConfidences.includes('low')) {
        return memoConfidences.includes('high') ? 'medium' : 'low';
    }

    if (bundle.dataset.reportReadiness === 'partial') {
        return 'medium';
    }

    if (memoConfidences.every(confidence => confidence === 'high') && bundle.dataset.caveats.length === 0) {
        return 'high';
    }

    return 'medium';
};

const createRoleEvidenceFallback = (
    role: AnalystRole,
    memos: AnalystMemo[],
    bundle: ReportEvidenceBundle,
): string[] => {
    const memo = memos.find(candidate => candidate.role === role);
    const evidenceRefs = memo?.findings.flatMap(finding => finding.evidenceRefs) ?? [];
    const fallbackRefs = role === 'business'
        ? ['summary.core', 'summary.final', ...bundle.cards.map(card => card.evidenceId)]
        : role === 'risk'
            ? ['workflow.verification', 'dataset.readiness']
            : ['dataset.context', 'workflow.preparation', 'workflow.verification'];

    const allowedEvidenceIds = new Set(bundle.evidenceCatalog.map(entry => entry.id));
    return dedupeStrings([...evidenceRefs, ...fallbackRefs].filter(id => allowedEvidenceIds.has(id)), MAX_EVIDENCE_REFS);
};

const buildFallbackConsensusFindings = (
    memos: AnalystMemo[],
    bundle: ReportEvidenceBundle,
): ForumFinding[] => {
    const allowedEvidenceIds = new Set(bundle.evidenceCatalog.map(entry => entry.id));
    const primaryFindings = memos
        .flatMap(memo => memo.findings.slice(0, 1).map(finding => ({ memo, finding })))
        .slice(0, MAX_CONSENSUS_FINDINGS);

    const derivedFindings = primaryFindings.map(({ memo, finding }, index): ForumFinding => {
        const evidenceRefs = dedupeStrings(
            finding.evidenceRefs.filter(id => allowedEvidenceIds.has(id)),
            MAX_EVIDENCE_REFS,
        );

        return {
            id: `forum.finding.${index + 1}`,
            claim: trimText(finding.claim) || trimText(memo.summary) || `${memo.role} memo provided one bounded finding.`,
            supportedByRoles: [memo.role],
            evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : createRoleEvidenceFallback(memo.role, memos, bundle),
            caveats: dedupeStrings([
                finding.caveat,
                ...memo.caveats,
            ], MAX_CAVEATS),
        };
    });

    if (derivedFindings.length > 0) {
        return derivedFindings;
    }

    return [{
        id: 'forum.finding.1',
        claim: `Report readiness is ${bundle.dataset.reportReadiness} for the current verified dataset.`,
        supportedByRoles: dedupeRoles(memos.map(memo => memo.role)),
        evidenceRefs: dedupeStrings(['dataset.readiness', 'dataset.context'], MAX_EVIDENCE_REFS),
        caveats: dedupeStrings(bundle.dataset.caveats, MAX_CAVEATS),
    }];
};

const buildFallbackDisagreements = (
    memos: AnalystMemo[],
    bundle: ReportEvidenceBundle,
): ForumDisagreement[] => {
    const uniqueConfidences = Array.from(new Set(memos.map(memo => memo.confidence)));
    if (uniqueConfidences.length <= 1 && bundle.dataset.reportReadiness !== 'blocked') {
        return [];
    }

    const positions: ForumDisagreementPosition[] = memos
        .slice(0, MAX_POSITIONS)
        .map(memo => ({
            role: memo.role,
            stance: trimText(memo.summary) || `${memo.role} confidence is ${memo.confidence}.`,
            evidenceRefs: createRoleEvidenceFallback(memo.role, memos, bundle),
        }));

    return [{
        id: 'forum.disagreement.1',
        topic: 'Overall report confidence and readiness',
        positions,
        resolution: bundle.dataset.reportReadiness === 'blocked'
            ? 'unresolved'
            : uniqueConfidences.length > 1
                ? 'partially_resolved'
                : 'resolved',
    }];
};

const buildFallbackForumSummary = (
    memos: AnalystMemo[],
    bundle: ReportEvidenceBundle,
    reason?: string,
): ForumSummary => {
    const failureReason = trimText(reason);
    const consensusFindings = buildFallbackConsensusFindings(memos, bundle);
    const disagreements = buildFallbackDisagreements(memos, bundle);
    const recommendedActions = dedupeStrings([
        ...memos.flatMap(memo => memo.recommendedNextChecks),
        bundle.dataset.reportReadiness !== 'ready' ? bundle.dataset.reportReadinessReason : null,
        failureReason ? `Forum summary fallback used: ${failureReason}` : null,
    ], MAX_ACTIONS);
    const roleList = dedupeRoles(memos.map(memo => memo.role));

    return {
        consensusFindings,
        disagreements,
        overallConfidence: resolveOverallConfidence(memos, bundle),
        executiveSummary: failureReason
            ? `The forum aggregator used a deterministic fallback because a validated aggregation response was not available. ${roleList.length} analyst memo(s) were merged against a dataset with ${bundle.dataset.reportReadiness} readiness.`
            : `${roleList.length} analyst memo(s) were merged into a bounded forum summary for a dataset with ${bundle.dataset.reportReadiness} readiness.`,
        recommendedActions,
    };
};

const sanitizeForumFinding = (
    rawFinding: Partial<ForumFinding> | null | undefined,
    index: number,
    memos: AnalystMemo[],
    bundle: ReportEvidenceBundle,
): ForumFinding | null => {
    const allowedEvidenceIds = new Set(bundle.evidenceCatalog.map(entry => entry.id));
    const supportedByRoles = dedupeRoles(
        Array.isArray(rawFinding?.supportedByRoles) ? rawFinding!.supportedByRoles : [],
    );
    const fallbackRoles = supportedByRoles.length > 0 ? supportedByRoles : dedupeRoles(memos.map(memo => memo.role));
    const evidenceRefs = dedupeStrings(
        Array.isArray(rawFinding?.evidenceRefs)
            ? rawFinding!.evidenceRefs.filter(id => allowedEvidenceIds.has(id))
            : [],
        MAX_EVIDENCE_REFS,
    );
    const claim = trimText(rawFinding?.claim);

    if (!claim) {
        return null;
    }

    const resolvedRoles: AnalystRole[] = fallbackRoles.length > 0 ? fallbackRoles : ['business'];
    const fallbackEvidence = createRoleEvidenceFallback(resolvedRoles[0], memos, bundle);

    return {
        id: trimText(rawFinding?.id) || `forum.finding.${index + 1}`,
        claim,
        supportedByRoles: resolvedRoles,
        evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : fallbackEvidence,
        caveats: dedupeStrings(
            Array.isArray(rawFinding?.caveats) ? rawFinding!.caveats : [],
            MAX_CAVEATS,
        ),
    };
};

const sanitizeDisagreementPosition = (
    rawPosition: Partial<ForumDisagreementPosition> | null | undefined,
    memos: AnalystMemo[],
    bundle: ReportEvidenceBundle,
): ForumDisagreementPosition | null => {
    const role = isAnalystRole(rawPosition?.role)
        ? rawPosition.role
        : null;
    const stance = trimText(rawPosition?.stance);

    if (!role || !stance) {
        return null;
    }

    const allowedEvidenceIds = new Set(bundle.evidenceCatalog.map(entry => entry.id));
    const evidenceRefs = dedupeStrings(
        Array.isArray(rawPosition?.evidenceRefs)
            ? rawPosition!.evidenceRefs.filter(id => allowedEvidenceIds.has(id))
            : [],
        MAX_EVIDENCE_REFS,
    );

    return {
        role,
        stance,
        evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : createRoleEvidenceFallback(role, memos, bundle),
    };
};

const sanitizeForumDisagreement = (
    rawDisagreement: Partial<ForumDisagreement> | null | undefined,
    index: number,
    memos: AnalystMemo[],
    bundle: ReportEvidenceBundle,
): ForumDisagreement | null => {
    const topic = trimText(rawDisagreement?.topic);
    if (!topic) {
        return null;
    }

    const positions = Array.isArray(rawDisagreement?.positions)
        ? rawDisagreement.positions
            .map(position => sanitizeDisagreementPosition(position, memos, bundle))
            .filter((position): position is ForumDisagreementPosition => position !== null)
            .filter((position, positionIndex, values) =>
                values.findIndex(candidate => candidate.role === position.role) === positionIndex)
            .slice(0, MAX_POSITIONS)
        : [];

    if (positions.length === 0) {
        return null;
    }

    const resolution = rawDisagreement?.resolution === 'resolved'
        || rawDisagreement?.resolution === 'partially_resolved'
        || rawDisagreement?.resolution === 'unresolved'
        ? rawDisagreement.resolution
        : 'unresolved';

    return {
        id: trimText(rawDisagreement?.id) || `forum.disagreement.${index + 1}`,
        topic,
        positions,
        resolution,
    };
};

const sanitizeForumSummary = (
    rawSummary: Partial<ForumSummary> | null | undefined,
    memos: AnalystMemo[],
    bundle: ReportEvidenceBundle,
): ForumSummary => {
    const fallback = buildFallbackForumSummary(memos, bundle);
    const consensusFindings = Array.isArray(rawSummary?.consensusFindings)
        ? rawSummary.consensusFindings
            .map((finding, index) => sanitizeForumFinding(finding, index, memos, bundle))
            .filter((finding): finding is ForumFinding => finding !== null)
            .slice(0, MAX_CONSENSUS_FINDINGS)
        : [];
    const disagreements = Array.isArray(rawSummary?.disagreements)
        ? rawSummary.disagreements
            .map((disagreement, index) => sanitizeForumDisagreement(disagreement, index, memos, bundle))
            .filter((disagreement): disagreement is ForumDisagreement => disagreement !== null)
            .slice(0, MAX_DISAGREEMENTS)
        : [];

    return {
        consensusFindings: consensusFindings.length > 0 ? consensusFindings : fallback.consensusFindings,
        disagreements,
        overallConfidence: rawSummary?.overallConfidence === 'high'
            || rawSummary?.overallConfidence === 'medium'
            || rawSummary?.overallConfidence === 'low'
            ? rawSummary.overallConfidence
            : fallback.overallConfidence,
        executiveSummary: trimText(rawSummary?.executiveSummary) || fallback.executiveSummary,
        recommendedActions: dedupeStrings(
            Array.isArray(rawSummary?.recommendedActions)
                ? [...rawSummary!.recommendedActions, ...memos.flatMap(memo => memo.recommendedNextChecks)]
                : fallback.recommendedActions,
            MAX_ACTIONS,
        ),
    };
};

export const generateForumSummaryWithDiagnostics = async (
    memos: AnalystMemo[],
    bundle: ReportEvidenceBundle,
    settings: Settings,
    briefing?: ReportEvidenceBriefing | null,
    abortSignal?: AbortSignal,
): Promise<ForumSummaryGenerationResult> => {
    if (!isProviderConfigured(settings)) {
        return {
            forum: buildFallbackForumSummary(memos, bundle, 'No model provider is configured.'),
            diagnostics: {
                llmUsed: false,
                usedFallback: true,
                fallbackReason: 'No model provider is configured.',
            },
        };
    }

    try {
        const systemPrompt = [
            'You are the bounded forum aggregator in a multi-analyst report workflow.',
            'Your job is to merge the analyst memos into one structured forum summary. Never invent evidence that does not appear in the memos or evidence bundle.',
            'Quality standards:',
            '- STRONG consensus: a finding is promoted to consensusFindings only when 2 or more analysts support it with overlapping evidence refs.',
            '- WEAK consensus: if only 1 analyst supports a claim, include it only if it cites high-confidence evidence (business confidence >= 0.75). Otherwise, omit it or note it as a caveat.',
            '- When analyst positions materially diverge on the same metric or topic, preserve the disagreement rather than forcing consensus. Use the disagreements array.',
            '- The executiveSummary should read like a 2-3 sentence professional analyst briefing for senior management — lead with the most actionable insight, then the main risk.',
            '- Order consensusFindings by business impact, not by analyst order.',
            '- Each recommended action must be a single clear sentence starting with a verb. Order actions by urgency.',
            '- If all memos have low confidence, set overallConfidence to "low" and explain why in the executiveSummary.',
            '- Avoid technical jargon like "helper exposure", "narrative ineligible", "row expansion ratio", or "parser confidence" in any user-facing text.',
            '- Keep the forum summary bounded: prefer 2-5 consensus findings, 0-3 disagreements, and 2-5 recommended actions.',
        ].join('\n');
        const promptContent = createForumSummaryPrompt(memos, bundle, settings.language, briefing);
        const { model, modelId } = createProviderModel(settings, settings.complexModel);
        const messages: ModelMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: promptContent },
        ];

        const result = await withTransientRetry(
            (fb) => streamGenerateText({
                model: fb ?? model,
                messages,
                output: Output.object({ schema: jsonSchema(prepareSchemaForProvider(forumSummarySchema, settings.provider) as Parameters<typeof jsonSchema>[0]) }),
            }),
            { settings, primaryModelId: modelId, label: 'forumSummaryGenerator', abortSignal },
        );

        const parsed = result.output !== undefined
            ? result.output as ForumSummary
            : robustlyParseJsonObject(result.text);
        return {
            forum: sanitizeForumSummary(parsed, memos, bundle),
            diagnostics: {
                llmUsed: true,
                usedFallback: false,
                fallbackReason: null,
            },
        };
    } catch (error) {
        if (isRuntimeAbortError(error, abortSignal)) throw error;
        const message = error instanceof Error ? error.message : 'Unknown forum summary generation failure.';
        console.error('Failed to generate forum summary:', error);
        return {
            forum: buildFallbackForumSummary(memos, bundle, message),
            diagnostics: {
                llmUsed: true,
                usedFallback: true,
                fallbackReason: message,
            },
        };
    }
};

export const generateForumSummary = async (
    memos: AnalystMemo[],
    bundle: ReportEvidenceBundle,
    settings: Settings,
): Promise<ForumSummary> => {
    const result = await generateForumSummaryWithDiagnostics(memos, bundle, settings);
    return result.forum;
};
