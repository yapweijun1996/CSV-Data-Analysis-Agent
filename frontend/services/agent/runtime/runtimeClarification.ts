import type { AppState, ClarificationOption, ClarificationRequest, ClarificationResponseAssessment, Settings } from '../../../types';
import { getTranslation } from '../../../utils/localization';
import type { LanguageModel } from 'ai';
import { createProviderModel, isProviderConfigured } from '../../ai/providerConfig';
import { withTransientRetry } from '../../ai/transientRetry';
import { streamGenerateText } from '../../ai/streamGenerateText';
import { buildClarificationAssessmentPrompt } from '../../prompts/clarificationAssessmentPrompts';

const LOG_PREFIX = '[ClarificationAssessment]';
const AI_TIMEOUT_MS = 10_000;

const normalizeOption = (option: unknown): ClarificationOption | null => {
    if (!option || typeof option !== 'object') {
        return null;
    }

    const record = option as Record<string, unknown>;
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const value = typeof record.value === 'string' ? record.value.trim() : '';
    return label && value ? { label, value } : null;
};

const normalizeQuestion = (value: unknown, fallbacks: unknown[]) => {
    if (typeof value === 'string' && value.trim()) {
        return value.trim();
    }

    for (const fallback of fallbacks) {
        if (typeof fallback === 'string' && fallback.trim()) {
            return fallback.trim();
        }
    }

    return '';
};

const normalizeReplyText = (userChoice: ClarificationOption) => {
    const normalizedLabel = userChoice.label.trim();
    const normalizedValue = userChoice.value.trim();
    if (normalizedValue && normalizedValue !== normalizedLabel) {
        return `${normalizedLabel} ${normalizedValue}`.trim();
    }
    return normalizedLabel || normalizedValue;
};

const cleanOptionText = (value: string) =>
    value
        .replace(/^\*\*|\*\*$/g, '')
        .replace(/^(\d+[.)、]|[-*])\s*/u, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[;,]+$/g, '')
        .trim();

const OPTION_LINE_PATTERN = /^(\d+[.)、]|[-*])\s*/u;

const normalizeExtractedOption = (value: string): ClarificationOption | null => {
    const cleaned = cleanOptionText(value);
    return cleaned ? { label: cleaned, value: cleaned } : null;
};

const extractMultilineOptions = (question: string): { question: string; options: ClarificationOption[] } | null => {
    const rawLines = question.split('\n').map(line => line.trim()).filter(Boolean);
    const optionLines = rawLines.filter(line => OPTION_LINE_PATTERN.test(line));
    if (optionLines.length < 2 || optionLines.length > 5) {
        return null;
    }

    const options = optionLines
        .map(line => line.replace(OPTION_LINE_PATTERN, ''))
        .map(normalizeExtractedOption)
        .filter((option): option is ClarificationOption => Boolean(option));
    if (options.length < 2) {
        return null;
    }

    const questionStem = rawLines
        .filter(line => !OPTION_LINE_PATTERN.test(line))
        .join(' ')
        .replace(/[:：]\s*$/u, '')
        .trim();
    return {
        question: questionStem || question,
        options,
    };
};

const extractInlineNumberedOptions = (question: string): { question: string; options: ClarificationOption[] } | null => {
    const matches = Array.from(
        question.matchAll(/(?:^|[\s:：;；,，(（\[])(\d+)([.)、])\s*(.+?)(?=(?:[\s:：;；,，(（\[]\d+[.)、]\s*)|$)/gsu),
    );
    if (matches.length < 2 || matches.length > 5) {
        return null;
    }

    const options = matches
        .map(match => normalizeExtractedOption(match[3] ?? ''))
        .filter((option): option is ClarificationOption => Boolean(option));
    if (options.length < 2) {
        return null;
    }

    const firstMatchIndex = matches[0]?.index ?? 0;
    const questionStem = question
        .slice(0, firstMatchIndex)
        .replace(/[:：]\s*$/u, '')
        .trim();
    return {
        question: questionStem || question,
        options,
    };
};

const extractStructuredOptions = (question: string): { question: string; options: ClarificationOption[] } | null =>
    extractMultilineOptions(question) ?? extractInlineNumberedOptions(question);

const buildCandidatePhrases = (clarification: ClarificationRequest) =>
    Array.from(new Set(clarification.options.flatMap(option => [option.label, option.value]).filter(Boolean)));

const findReferencedValues = (reply: string, candidates: string[]) => {
    const normalizedReply = reply.toLowerCase();
    return candidates.filter(candidate => normalizedReply.includes(candidate.toLowerCase()));
};

const countMeaningfulWords = (reply: string) =>
    reply
        .trim()
        .split(/\s+/)
        .map(token => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
        .filter(Boolean).length;

export const normalizeClarificationRequest = (
    request: Partial<ClarificationRequest> | null | undefined,
    fallbackQuestionSources: unknown[] = [],
): ClarificationRequest => {
    const normalizedQuestion = normalizeQuestion(request?.question, fallbackQuestionSources);
    const normalizedOptions = Array.isArray(request?.options)
        ? request.options.map(normalizeOption).filter((option): option is ClarificationOption => Boolean(option))
        : [];
    const extractedOptions = normalizedOptions.length === 0 && normalizedQuestion
        ? extractStructuredOptions(normalizedQuestion)
        : null;
    const finalOptions = extractedOptions?.options ?? normalizedOptions;
    const allowFreeText = Boolean(request?.allowFreeText) || finalOptions.length === 0;

    return {
        question: extractedOptions?.question ?? normalizedQuestion,
        options: finalOptions,
        allowFreeText,
        clarificationMode: allowFreeText ? 'free_text' : 'options',
        interactionKind: request?.interactionKind,
        pendingPlan: request?.pendingPlan,
        targetProperty: request?.targetProperty,
        resumeContext: request?.resumeContext,
    };
};

export const resolveEffectivePendingClarification = (
    state: Pick<AppState, 'pendingClarification' | 'activeTurn'>,
): ClarificationRequest | null => {
    const pendingClarification = state.pendingClarification ?? state.activeTurn?.pendingClarificationRequest ?? null;
    return pendingClarification ? normalizeClarificationRequest(pendingClarification) : null;
};

// ─── Structural signal extraction (enrich, not route) ──────────────────

const isPurePunctuation = (reply: string) => /^[?!.…\s]+$/u.test(reply);

const extractStructuralSignals = (
    normalizedReply: string,
    clarification: ClarificationRequest,
    availableColumns: string[],
) => ({
    referencedColumns: findReferencedValues(normalizedReply, availableColumns),
    referencedCandidates: findReferencedValues(normalizedReply, buildCandidatePhrases(clarification)),
    isPurePunctuation: isPurePunctuation(normalizedReply),
    meaningfulWordCount: countMeaningfulWords(normalizedReply),
});

// ─── AI classification (primary authority) ─────────────────────────────

type ClarificationAssessmentStatus = ClarificationResponseAssessment['status'];

const parseAiAssessment = (text: string): ClarificationAssessmentStatus | null => {
    const trimmed = text.trim().toLowerCase().replace(/[^a-z_]/g, '');
    const valid: ClarificationAssessmentStatus[] = ['resolved', 'best_effort_continue', 'still_ambiguous'];
    return valid.find(v => trimmed.includes(v)) ?? null;
};

const classifyWithAi = async (
    clarificationQuestion: string,
    userReply: string,
    availableOptions: string[],
    settings: Settings,
): Promise<ClarificationAssessmentStatus | null> => {
    try {
        if (!settings?.provider || !isProviderConfigured(settings)) return null;
    } catch {
        return null;
    }

    try {
        const { model, modelId } = createProviderModel(settings, settings.simpleModel);
        const prompt = buildClarificationAssessmentPrompt(clarificationQuestion, userReply, availableOptions);

        const result = await withTransientRetry(
            (fb) => streamGenerateText({
                model: (fb ?? model) as LanguageModel,
                messages: [
                    { role: 'system', content: prompt.system },
                    { role: 'user', content: prompt.user },
                ],
                activityTimeoutMs: AI_TIMEOUT_MS,
            }),
            { settings, primaryModelId: modelId, label: 'runtimeClarification' },
        );

        const assessment = parseAiAssessment(result.text);
        if (assessment) {
            console.log(`${LOG_PREFIX} AI: ${assessment} (model: ${modelId})`);
            return assessment;
        }
        console.warn(`${LOG_PREFIX} AI returned unparseable assessment: "${result.text}" (model: ${modelId})`);
        return null;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`${LOG_PREFIX} AI classification failed: ${msg}`);
        return null;
    }
};

// ─── Deterministic fast-path (no LLM needed) ──────────────────────────

const tryDeterministicAssessment = (
    normalizedReply: string,
    signals: ReturnType<typeof extractStructuralSignals>,
): ClarificationAssessmentStatus | null => {
    // Empty reply → still_ambiguous (no AI needed)
    if (!normalizedReply) return 'still_ambiguous';

    // Exact option/column match → resolved (no AI needed)
    if (signals.referencedCandidates.length > 0) return 'resolved';
    if (signals.referencedColumns.length > 0) return 'resolved';

    // Pure punctuation → best_effort_continue (don't trap user)
    if (signals.isPurePunctuation) return 'best_effort_continue';

    // Everything else → let the AI decide
    return null;
};

/**
 * Structural fallback when AI is unavailable.
 * Uses word count and option presence — no hardcoded phrase lists.
 * Biased toward best_effort_continue to avoid trapping the user.
 */
const structuralFallback = (
    signals: ReturnType<typeof extractStructuralSignals>,
    hasOptions: boolean,
): ClarificationAssessmentStatus => {
    if (hasOptions) {
        // With structured options: substantive multi-word replies indicate a meaningful answer
        return signals.meaningfulWordCount >= 2 ? 'resolved' : 'still_ambiguous';
    }
    // Free-text mode: any non-empty reply is enough to proceed
    return 'best_effort_continue';
};

// ─── Public API ────────────────────────────────────────────────────────

const buildAssumptionSummary = (status: ClarificationAssessmentStatus): string | undefined => {
    if (status === 'best_effort_continue') {
        return 'The user did not provide a precise constraint. Continue with the most defensible assumption and state it explicitly before giving the answer.';
    }
    return undefined;
};

/**
 * AI-first clarification response assessment.
 *
 * Phase 1 — Deterministic fast-path for clear-cut cases (empty, exact match, punctuation)
 * Phase 2 — AI classification via simpleModel (primary routing authority)
 * Phase 3 — Fallback to best_effort_continue if AI unavailable (never trap the user)
 */
export const evaluateClarificationResponse = async ({
    clarification,
    userChoice,
    availableColumns,
    settings,
}: {
    clarification: ClarificationRequest;
    userChoice: ClarificationOption;
    availableColumns: string[];
    settings: Settings;
}): Promise<ClarificationResponseAssessment> => {
    const normalizedReply = normalizeReplyText(userChoice).trim();
    const signals = extractStructuralSignals(normalizedReply, clarification, availableColumns);

    // Phase 1: Deterministic fast-path
    const deterministicResult = tryDeterministicAssessment(normalizedReply, signals);
    if (deterministicResult) {
        console.log(`${LOG_PREFIX} Deterministic: ${deterministicResult}`);
        return {
            status: deterministicResult,
            normalizedReply,
            ...(deterministicResult === 'still_ambiguous' ? { missingInfoSummary: clarification.question } : {}),
            assumptionSummary: buildAssumptionSummary(deterministicResult),
        };
    }

    // Phase 2: AI classification (primary authority)
    const optionLabels = clarification.options.map(o => o.label);
    const aiStatus = await classifyWithAi(clarification.question, normalizedReply, optionLabels, settings);
    if (aiStatus) {
        return {
            status: aiStatus,
            normalizedReply,
            ...(aiStatus === 'still_ambiguous' ? { missingInfoSummary: clarification.question } : {}),
            assumptionSummary: buildAssumptionSummary(aiStatus),
        };
    }

    // Phase 3: Structural fallback — word count + option presence, no phrase lists
    const hasOptions = clarification.options.length > 0;
    const fallbackStatus = structuralFallback(signals, hasOptions);
    console.log(`${LOG_PREFIX} Structural fallback: ${fallbackStatus}`);
    return {
        status: fallbackStatus,
        normalizedReply,
        ...(fallbackStatus === 'still_ambiguous' ? { missingInfoSummary: clarification.question } : {}),
        assumptionSummary: buildAssumptionSummary(fallbackStatus),
    };
};

export const buildClarificationFollowUpPrompt = (
    clarification: ClarificationRequest,
    language: AppState['settings']['language'],
) => getTranslation('clarification_follow_up_prompt', language, { question: clarification.question });
