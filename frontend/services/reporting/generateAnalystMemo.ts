import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from '../ai/streamGenerateText';
import { prepareSchemaForProvider } from '../ai/googleSchemaAdapter';
import type { ModelMessage } from 'ai';
import type {
    AnalystConfidence,
    AnalystFinding,
    AnalystMemo,
    AnalystRole,
    ReportEvidenceBundle,
    Settings,
} from '../../types';
import { robustlyParseJsonObject } from '../../utils/jsonParser';
import { createProviderModel, isProviderConfigured } from '../ai/providerConfig';
import { withTransientRetry } from '../ai/transientRetry';
import { isRuntimeAbortError } from '../agent/runtime/runtimeAbort';
import { analystMemoSchema } from '../ai/schemas/agentSchemas';
import { createAnalystMemoPrompt } from '../prompts/reportingPrompts';
import { getAnalystRoleDefinition, resolvePreferredEvidenceIds } from './analystRoles';
import type { ReportEvidenceBriefing } from './reportEvidenceHarness';

export interface AnalystMemoGenerationDiagnostics {
    llmUsed: boolean;
    usedFallback: boolean;
    fallbackReason: string | null;
}

export interface AnalystMemoGenerationResult {
    memo: AnalystMemo;
    diagnostics: AnalystMemoGenerationDiagnostics;
}

const MAX_FINDINGS = 4;
const MAX_EVIDENCE_REFS = 4;
const MAX_METRIC_REFS = 6;
const MAX_BLOCKERS = 4;
const MAX_CAVEATS = 6;
const MAX_NEXT_CHECKS = 4;

const trimText = (value: unknown): string => String(value ?? '').trim();

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

const resolveFallbackConfidence = (
    role: AnalystRole,
    bundle: ReportEvidenceBundle,
): AnalystConfidence => {
    if (bundle.dataset.reportReadiness === 'blocked') {
        return 'low';
    }

    if (bundle.dataset.reportReadiness === 'partial') {
        return role === 'business' ? 'low' : 'medium';
    }

    if (bundle.workflow.topWarnings.length > 0 || bundle.dataset.caveats.length > 0) {
        return 'medium';
    }

    return 'high';
};

const buildFallbackFinding = (
    role: AnalystRole,
    bundle: ReportEvidenceBundle,
    preferredEvidenceIds: string[],
): AnalystFinding => {
    const cardEvidenceIds = bundle.cards.map(card => card.evidenceId);

    if (role === 'business') {
        const evidenceRefs = dedupeStrings(
            [...preferredEvidenceIds, ...cardEvidenceIds],
            MAX_EVIDENCE_REFS,
        );
        const includedCardsCount = bundle.dataset.includedCardsCount ?? bundle.cards.length;
        const trustedCardsCount = bundle.dataset.trustedCardsCount;

        return {
            id: `${role}.finding.1`,
            claim: trustedCardsCount > 0
                ? `${trustedCardsCount} trusted analysis card(s) are available for business interpretation.`
                : includedCardsCount > 0
                    ? `${includedCardsCount} caveated analysis card(s) are available, so business synthesis should remain provisional.`
                    : 'No trusted analysis cards exist yet, so business synthesis remains preliminary.',
            importance: includedCardsCount > 0 ? 'medium' : 'high',
            evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : ['dataset.readiness'],
            metricRefs: dedupeStrings(bundle.cards.flatMap(card => [card.valueColumn, card.groupByColumn]), MAX_METRIC_REFS),
            caveat: trustedCardsCount > 0
                ? bundle.dataset.caveats[0]
                : includedCardsCount > 0
                    ? 'Business conclusions should stay caveated until at least one trusted card is available.'
                    : 'Business conclusions should wait until trusted cards exist.',
        };
    }

    if (role === 'risk') {
        return {
            id: `${role}.finding.1`,
            claim: `Report confidence is constrained by ${bundle.dataset.caveats.length} caveat(s) and ${bundle.workflow.topWarnings.length} workflow warning(s).`,
            importance: 'high',
            evidenceRefs: dedupeStrings(preferredEvidenceIds, MAX_EVIDENCE_REFS),
            metricRefs: [],
            caveat: bundle.dataset.reportReadiness === 'ready'
                ? bundle.dataset.caveats[0]
                : bundle.dataset.reportReadinessReason,
        };
    }

    return {
        id: `${role}.finding.1`,
        claim: `Dataset readiness is ${bundle.dataset.reportReadiness} and analysis eligibility is ${bundle.dataset.canAnalyze ? 'enabled' : 'blocked'}.`,
        importance: 'high',
        evidenceRefs: dedupeStrings(preferredEvidenceIds, MAX_EVIDENCE_REFS),
        metricRefs: [],
        caveat: bundle.dataset.reportReadinessReason,
    };
};

const buildFallbackMemo = (
    role: AnalystRole,
    bundle: ReportEvidenceBundle,
    reason?: string,
): AnalystMemo => {
    const roleDefinition = getAnalystRoleDefinition(role);
    const preferredEvidenceIds = resolvePreferredEvidenceIds(role, bundle);
    const failureReason = trimText(reason);
    const blockers = dedupeStrings([
        bundle.dataset.reportReadiness === 'blocked' ? bundle.dataset.reportReadinessReason : null,
        failureReason ? `Memo generation fallback used: ${failureReason}` : null,
    ], MAX_BLOCKERS);

    return {
        role,
        headline: `${roleDefinition.label}: bounded fallback memo`,
        summary: failureReason
            ? `The ${roleDefinition.label.toLowerCase()} could not complete a validated AI memo, so this fallback summary only reflects deterministic evidence from the current bundle.`
            : `This fallback memo summarizes the current verified evidence bundle without adding new inference.`,
        findings: [buildFallbackFinding(role, bundle, preferredEvidenceIds)],
        blockers,
        caveats: dedupeStrings(bundle.dataset.caveats, MAX_CAVEATS),
        confidence: resolveFallbackConfidence(role, bundle),
        recommendedNextChecks: dedupeStrings(roleDefinition.fallbackNextChecks, MAX_NEXT_CHECKS),
    };
};

const sanitizeFinding = (
    role: AnalystRole,
    bundle: ReportEvidenceBundle,
    rawFinding: Partial<AnalystFinding> | null | undefined,
    index: number,
): AnalystFinding => {
    const preferredEvidenceIds = resolvePreferredEvidenceIds(role, bundle);
    const allowedEvidenceIds = new Set(bundle.evidenceCatalog.map(entry => entry.id));
    const evidenceRefs = dedupeStrings(
        Array.isArray(rawFinding?.evidenceRefs)
            ? rawFinding!.evidenceRefs.filter(id => allowedEvidenceIds.has(id))
            : [],
        MAX_EVIDENCE_REFS,
    );
    const metricRefs = dedupeStrings(
        Array.isArray(rawFinding?.metricRefs) ? rawFinding!.metricRefs : [],
        MAX_METRIC_REFS,
    );
    const claim = trimText(rawFinding?.claim);
    const caveat = trimText(rawFinding?.caveat);
    const importance = rawFinding?.importance === 'high' || rawFinding?.importance === 'medium' || rawFinding?.importance === 'low'
        ? rawFinding.importance
        : 'medium';

    return {
        id: trimText(rawFinding?.id) || `${role}.finding.${index + 1}`,
        claim: claim || buildFallbackFinding(role, bundle, preferredEvidenceIds).claim,
        importance,
        evidenceRefs: evidenceRefs.length > 0
            ? evidenceRefs
            : preferredEvidenceIds.slice(0, MAX_EVIDENCE_REFS),
        metricRefs,
        caveat: caveat || undefined,
    };
};

const sanitizeMemo = (
    role: AnalystRole,
    bundle: ReportEvidenceBundle,
    rawMemo: Partial<AnalystMemo> | null | undefined,
): AnalystMemo => {
    const fallbackMemo = buildFallbackMemo(role, bundle);
    const findings = Array.isArray(rawMemo?.findings)
        ? rawMemo.findings.slice(0, MAX_FINDINGS).map((finding, index) =>
            sanitizeFinding(role, bundle, finding, index))
        : [];

    return {
        role,
        headline: trimText(rawMemo?.headline) || fallbackMemo.headline,
        summary: trimText(rawMemo?.summary) || fallbackMemo.summary,
        findings: findings.length > 0 ? findings : fallbackMemo.findings,
        blockers: dedupeStrings(
            Array.isArray(rawMemo?.blockers) ? rawMemo!.blockers : fallbackMemo.blockers,
            MAX_BLOCKERS,
        ),
        caveats: dedupeStrings(
            Array.isArray(rawMemo?.caveats)
                ? [...rawMemo!.caveats, ...bundle.dataset.caveats]
                : fallbackMemo.caveats,
            MAX_CAVEATS,
        ),
        confidence: rawMemo?.confidence === 'high' || rawMemo?.confidence === 'medium' || rawMemo?.confidence === 'low'
            ? rawMemo.confidence
            : fallbackMemo.confidence,
        recommendedNextChecks: dedupeStrings(
            Array.isArray(rawMemo?.recommendedNextChecks)
                ? [...rawMemo!.recommendedNextChecks, ...getAnalystRoleDefinition(role).fallbackNextChecks]
                : fallbackMemo.recommendedNextChecks,
            MAX_NEXT_CHECKS,
        ),
    };
};

export const generateAnalystMemoWithDiagnostics = async (
    role: AnalystRole,
    bundle: ReportEvidenceBundle,
    settings: Settings,
    briefing?: ReportEvidenceBriefing | null,
    abortSignal?: AbortSignal,
): Promise<AnalystMemoGenerationResult> => {
    if (!isProviderConfigured(settings)) {
        return {
            memo: buildFallbackMemo(role, bundle, 'No model provider is configured.'),
            diagnostics: {
                llmUsed: false,
                usedFallback: true,
                fallbackReason: 'No model provider is configured.',
            },
        };
    }

    try {
        const roleDefinition = getAnalystRoleDefinition(role);
        const systemPrompt = [
            `You are the ${roleDefinition.label} in a bounded multi-analyst report workflow.`,
            `Produce one structured memo that stays strictly inside the provided evidence bundle.`,
            `Quality standards:`,
            `- A finding is STRONG when it is backed by a card with business confidence >= 0.75 and the pattern accounts for a material share (>20%) of the total.`,
            `- A finding is PRELIMINARY when evidence is sparse, caveated, or the pattern share is below 20%. Mark it as importance "medium" or "low".`,
            `- If two signals conflict (e.g., revenue up but profit down), report both sides rather than choosing one. Use a caveat to flag the tension.`,
            `- Downgrade any claim to a caveat or blocker if the supporting card has aggregation quality warnings or low business confidence.`,
            `- Order your findings by business impact — lead with the insight that would most change a decision-maker's action.`,
            `- Each finding must cite at least one evidence id from the EVIDENCE_CATALOG. Never cite an id that does not appear in the catalog.`,
            `- Keep your memo bounded: prefer 2-4 findings, 0-3 blockers, and 1-4 recommended next checks.`,
            `- Write concise, business-friendly prose. Avoid internal jargon, column names, enum values, or system terminology.`,
            `- If the evidence bundle is too thin to support any finding, return an empty findings array and explain why in a blocker.`,
        ].join('\n');
        const promptContent = createAnalystMemoPrompt(roleDefinition, bundle, settings.language, briefing);
        const { model, modelId } = createProviderModel(settings, settings.complexModel);
        const messages: ModelMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: promptContent },
        ];

        const result = await withTransientRetry(
            (fb) => streamGenerateText({
                model: fb ?? model,
                messages,
                output: Output.object({ schema: jsonSchema(prepareSchemaForProvider(analystMemoSchema, settings.provider) as Parameters<typeof jsonSchema>[0]) }),
            }),
            { settings, primaryModelId: modelId, label: 'analystMemoGenerator', abortSignal },
        );

        const parsed = result.output !== undefined
            ? result.output as AnalystMemo
            : robustlyParseJsonObject(result.text);
        return {
            memo: sanitizeMemo(role, bundle, parsed),
            diagnostics: {
                llmUsed: true,
                usedFallback: false,
                fallbackReason: null,
            },
        };
    } catch (error) {
        if (isRuntimeAbortError(error, abortSignal)) throw error;
        const message = error instanceof Error ? error.message : 'Unknown analyst memo generation failure.';
        console.error('Failed to generate analyst memo:', error);
        return {
            memo: buildFallbackMemo(role, bundle, message),
            diagnostics: {
                llmUsed: true,
                usedFallback: true,
                fallbackReason: message,
            },
        };
    }
};

export const generateAnalystMemo = async (
    role: AnalystRole,
    bundle: ReportEvidenceBundle,
    settings: Settings,
): Promise<AnalystMemo> => {
    const result = await generateAnalystMemoWithDiagnostics(role, bundle, settings);
    return result.memo;
};
