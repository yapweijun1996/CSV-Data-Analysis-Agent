/**
 * Intent Classification Harness — AI-first.
 *
 * Every user message is classified by the AI model (simpleModel).
 * No hardcoded regex intent decisions — the AI describes the request.
 *
 * Harness pattern:
 *   Phase 1 — AI classification (simpleModel, lightweight call)
 *   Phase 2 — Structured signal extraction (enrich findings for downstream)
 *   Phase 3 — Produce intent findings + query understanding artifact
 *
 * AGENT-101: The rich classifier produces a QueryUnderstandingArtifact
 * that the contract builder consumes directly, eliminating regex re-derivation.
 *
 * Fallback: if AI is unavailable (no API key, timeout, error),
 * leave the findings uncertain for the Pi runtime.
 */

import { generateText, streamText } from 'ai';
import type { LanguageModel } from 'ai';
import type { Settings } from '../../../types';
import { createProviderModel, createFallbackProviderModel } from '../../ai/providerConfig';
import { isProviderConfigured } from '../../ai/providerConfig';
import { isTransientProviderError } from '../../ai/transientRetry';
import type {
    ChatIntentCategory,
    ChatRoutingDirective,
    IntentClassificationFindings,
    QueryUnderstandingArtifact,
    QueryTimeScope,
    QueryComparisonScope,
} from './intentClassificationTypes';
import { LOG_PREFIX, INTENT_AI_TIMEOUT_MS, projectToIntentFindings } from './intentClassificationTypes';
import { isProviderTimeoutError, raceWithActivityTimeout } from '../../ai/providerActivityGuards';
import { buildIntentClassificationPrompt, buildQueryUnderstandingPrompt } from '../../prompts/intentClassificationPrompts';
import { isValidTaskSignal, isValidExpectedOutput } from './queryUnderstandingResolver';

// ─── Phase 1a: Rich AI classification (AGENT-101) ──────────────────────

interface RawAiArtifact {
    intent?: string;
    confidence?: string;
    taskSignal?: string;
    expectedOutput?: string;
    referencedColumns?: string[];
    aggregationFunctions?: string[];
    groupingColumns?: string[];
    filterDescription?: string | null;
    subjectRefs?: string[];
    timeScope?: { kind?: string; value?: string };
    comparisonScope?: { kind?: string; value?: string };
    unresolvedReferences?: string[];
    reason?: string;
}

const parseAiArtifact = (text: string): RawAiArtifact | null => {
    // Strip markdown fences if present
    const cleaned = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();

    try {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as RawAiArtifact;
        }
    } catch {
        // JSON parse failed — not a structured response
    }
    return null;
};

const VALID_INTENTS: ReadonlySet<string> = new Set<ChatIntentCategory>([
    'batch_analysis', 'precise_card', 'data_query', 'conversation',
]);

const safeStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
};

// ─── Confidence validation ─────────────────────────────────────────────

const VALID_CONFIDENCE_VALUES: ReadonlySet<string> = new Set(['high', 'medium', 'low']);
const VALID_TIME_SCOPE_KINDS: ReadonlySet<string> = new Set(['explicit', 'relative', 'dataset_relative', 'none']);
const VALID_COMPARISON_SCOPE_KINDS: ReadonlySet<string> = new Set(['previous_card', 'previous_result', 'previous_period', 'none']);

/**
 * Validate artifact completeness and compute final confidence.
 *
 * Rules:
 * - Start from AI-reported confidence (if valid), otherwise 'medium'
 * - Degrade to 'medium' if expectedOutput is missing
 * - Degrade to 'low' if intent or taskSignal is missing/invalid
 * - Degrade to 'low' if needsGrounding=true but no unresolvedReferences given
 * - Degrade one level if AI reports 'high' but artifact has structural gaps
 *   (e.g. taskSignal='create_chart' but no referencedColumns and no aggregationFunctions)
 * - 'low' confidence artifacts will NOT override the regex fallback path
 */
const validateArtifactConfidence = (
    raw: RawAiArtifact,
    parsedIntent: ChatIntentCategory | null,
    parsedTaskSignal: string | null,
    parsedExpectedOutput: string | null,
    unresolvedRefs: string[],
    needsGrounding: boolean,
    referencedColumns: string[],
    aggregationFunctions: string[],
): 'high' | 'medium' | 'low' => {
    // Start from AI-reported confidence or default to 'medium'
    let level: 'high' | 'medium' | 'low' =
        typeof raw.confidence === 'string' && VALID_CONFIDENCE_VALUES.has(raw.confidence)
            ? raw.confidence as 'high' | 'medium' | 'low'
            : 'medium';

    // Missing critical fields → low
    if (!parsedIntent || !parsedTaskSignal) {
        return 'low';
    }

    // Missing expectedOutput → cap at medium
    if (!parsedExpectedOutput && level === 'high') {
        level = 'medium';
    }

    // needsGrounding=true but no unresolved references listed → inconsistent → cap at medium
    if (needsGrounding && unresolvedRefs.length === 0 && level === 'high') {
        level = 'medium';
    }

    // Structural gap: create_chart / inspect_data but no columns, no aggregation, no grouping
    // → the AI is guessing without evidence → cap at medium
    if (
        level === 'high'
        && (parsedTaskSignal === 'create_chart' || parsedTaskSignal === 'inspect_data')
        && referencedColumns.length === 0
        && aggregationFunctions.length === 0
    ) {
        level = 'medium';
    }

    return level;
};

// ─── Grounding field parsing ───────────────────────────────────────────

const parseTimeScope = (raw: RawAiArtifact['timeScope']): QueryTimeScope => {
    if (raw && typeof raw === 'object' && typeof raw.kind === 'string' && VALID_TIME_SCOPE_KINDS.has(raw.kind)) {
        return {
            kind: raw.kind as QueryTimeScope['kind'],
            value: typeof raw.value === 'string' ? raw.value : undefined,
        };
    }
    return { kind: 'none' };
};

const parseComparisonScope = (raw: RawAiArtifact['comparisonScope']): QueryComparisonScope => {
    if (raw && typeof raw === 'object' && typeof raw.kind === 'string' && VALID_COMPARISON_SCOPE_KINDS.has(raw.kind)) {
        return {
            kind: raw.kind as QueryComparisonScope['kind'],
            value: typeof raw.value === 'string' ? raw.value : undefined,
        };
    }
    return { kind: 'none' };
};

// ─── Artifact builder ──────────────────────────────────────────────────

const buildArtifactFromAiResponse = (
    raw: RawAiArtifact,
    message: string,
    modelId: string,
    signals: ReturnType<typeof extractStructuralSignals>,
): QueryUnderstandingArtifact | null => {
    const intent = typeof raw.intent === 'string' && VALID_INTENTS.has(raw.intent)
        ? raw.intent as ChatIntentCategory
        : null;
    const taskSignal = typeof raw.taskSignal === 'string' && isValidTaskSignal(raw.taskSignal)
        ? raw.taskSignal
        : null;
    const expectedOutput = typeof raw.expectedOutput === 'string' && isValidExpectedOutput(raw.expectedOutput)
        ? raw.expectedOutput
        : null;

    // Require at least intent + taskSignal to consider the response valid
    if (!intent || !taskSignal) {
        return null;
    }

    const referencedColumns = safeStringArray(raw.referencedColumns);
    const aggregationFunctions = safeStringArray(raw.aggregationFunctions);
    const groupingColumns = safeStringArray(raw.groupingColumns);
    const subjectRefs = safeStringArray(raw.subjectRefs);
    const unresolvedReferences = safeStringArray(raw.unresolvedReferences);
    const timeScope = parseTimeScope(raw.timeScope);
    const comparisonScope = parseComparisonScope(raw.comparisonScope);
    // needsGrounding = true ONLY when the message contains references that
    // require prior-turn context to resolve. Explicit entities (named columns,
    // concrete campaign codes like "TRF_CBE_2025") do NOT need grounding.
    //
    // Drivers:
    //   - unresolvedReferences: AI flagged phrases that need context ("this", "that", "previous")
    //   - relative/dataset_relative time scope: "this month", "last quarter" need calendar/dataset context
    //   - comparison scope that depends on prior state: "previous card", "previous result"
    //
    // NOT drivers:
    //   - subjectRefs alone: identifying entities is not the same as needing resolution
    //   - explicit time scope: "Q1 2024" is self-contained, no grounding needed
    //   - comparisonScope='previous_period': may be self-contained if time scope is explicit
    const needsGrounding = unresolvedReferences.length > 0
        || timeScope.kind === 'relative'
        || timeScope.kind === 'dataset_relative'
        || comparisonScope.kind === 'previous_card'
        || comparisonScope.kind === 'previous_result';

    const confidence = validateArtifactConfidence(
        raw, intent, taskSignal, expectedOutput,
        unresolvedReferences, needsGrounding,
        referencedColumns, aggregationFunctions,
    );

    return {
        intent,
        confidence,
        taskSignal,
        expectedOutput: expectedOutput ?? 'text_answer',
        referencedColumns,
        aggregationFunctions,
        groupingColumns,
        filterDescription: typeof raw.filterDescription === 'string' ? raw.filterDescription : null,
        subjectRefs,
        timeScope,
        comparisonScope,
        needsGrounding,
        unresolvedReferences,
        reason: typeof raw.reason === 'string' ? raw.reason : `AI classified as ${intent}/${taskSignal} (model: ${modelId})`,
        classifiedBy: 'ai',
        // Backward compat booleans — combine AI response + regex signals
        hasExplicitColumns: referencedColumns.length > 0 || signals.hasColumnRef || signals.hasAggFunction || signals.hasGroupBy,
        hasAggregationFunction: aggregationFunctions.length > 0 || signals.hasAggFunction,
        hasGroupingDirective: groupingColumns.length > 0 || signals.hasGroupBy,
        hasFilterCondition: raw.filterDescription != null || signals.hasFilter,
    };
};

const classifyWithAiRich = async (
    message: string,
    settings: Settings,
    columnSummary?: string,
    abortSignal?: AbortSignal,
): Promise<{ findings: IntentClassificationFindings; artifact?: QueryUnderstandingArtifact } | null> => {
    if (!isProviderConfigured(settings)) {
        return null;
    }

    const signals = extractStructuralSignals(message);

    try {
        const { model, modelId } = createProviderModel(settings, settings.simpleModel);
        const prompt = buildQueryUnderstandingPrompt(message, columnSummary);

        // Use streamText + activity-aware timeout so that Gemma's thinking
        // tokens (reasoning-delta) reset the idle timer instead of starving
        // a fixed-deadline timeout.  Falls back to generateText for providers
        // where streaming adds no benefit (same 8 s idle budget).
        const callModel = async (m: unknown): Promise<Awaited<ReturnType<typeof generateText>>> => {
            // Own controller so an idle timeout also cancels the SSE stream
            // instead of leaving it to consume tokens in the background.
            const controller = new AbortController();
            const onExternalAbort = () => controller.abort();
            abortSignal?.addEventListener('abort', onExternalAbort, { once: true });
            if (abortSignal?.aborted) controller.abort();
            const stream = streamText({
                model: m as LanguageModel,
                messages: [
                    { role: 'system', content: prompt.system },
                    { role: 'user', content: prompt.user },
                ],
                abortSignal: controller.signal,
            });
            const { promise, signalActivity } = raceWithActivityTimeout(
                (async () => {
                    // Drain fullStream so every SSE chunk (including
                    // reasoning-delta) resets the idle timer.
                    for await (const part of stream.fullStream) {
                        signalActivity();
                        // We only need the final text — no accumulation needed
                        // since stream.text resolves with the complete output.
                        void part;
                    }
                    const [text, finishReason] = await Promise.all([
                        stream.text,
                        stream.finishReason,
                    ]);
                    return { text, finishReason } as Awaited<ReturnType<typeof generateText>>;
                })(),
                INTENT_AI_TIMEOUT_MS,
            );
            return promise
                .catch(error => {
                    controller.abort();
                    throw error;
                })
                .finally(() => abortSignal?.removeEventListener('abort', onExternalAbort));
        };

        let result: Awaited<ReturnType<typeof generateText>>;
        let usedModelId = modelId;
        try {
            result = await callModel(model);
        } catch (primaryErr) {
            // On transient error (503/429), try fallback model before giving up
            if (isTransientProviderError(primaryErr)) {
                const fallback = createFallbackProviderModel(settings, modelId);
                if (fallback) {
                    console.warn(`${LOG_PREFIX} Primary model "${modelId}" transient error, retrying with fallback "${fallback.modelId}"`);
                    result = await callModel(fallback.model);
                    usedModelId = fallback.modelId;
                } else {
                    throw primaryErr;
                }
            } else {
                throw primaryErr;
            }
        }

        // Try to parse as structured JSON artifact
        const rawArtifact = parseAiArtifact(result.text);
        if (rawArtifact) {
            const artifact = buildArtifactFromAiResponse(rawArtifact, message, usedModelId, signals);
            if (artifact) {
                console.log(`${LOG_PREFIX} Rich: ${artifact.intent}/${artifact.taskSignal} → ${artifact.expectedOutput} (model: ${usedModelId})`);
                return { findings: projectToIntentFindings(artifact), artifact };
            }
        }

        // Fallback: try to parse as legacy single-word intent
        const legacyIntent = parseAiIntent(result.text);
        if (legacyIntent) {
            console.log(`${LOG_PREFIX} Legacy parse: ${legacyIntent} (model: ${usedModelId})`);
            const findings = buildLegacyFindings(legacyIntent, message, usedModelId);
            return { findings };
        }

        // Retry with fallback model on parse failure (only if primary model was used)
        if (usedModelId === modelId) {
            const parseFallback = createFallbackProviderModel(settings, modelId);
            if (parseFallback) {
                console.log(`${LOG_PREFIX} Retrying with fallback model "${parseFallback.modelId}" (parse failure)...`);
                const retryResult = await callModel(parseFallback.model);

                const retryRaw = parseAiArtifact(retryResult.text);
                if (retryRaw) {
                    const retryArtifact = buildArtifactFromAiResponse(retryRaw, message, parseFallback.modelId, signals);
                    if (retryArtifact) {
                        return { findings: projectToIntentFindings(retryArtifact), artifact: retryArtifact };
                    }
                }

                const retryIntent = parseAiIntent(retryResult.text);
                if (retryIntent) {
                    return { findings: buildLegacyFindings(retryIntent, message, parseFallback.modelId) };
                }
            }
        }

        // All attempts failed — return uncertain findings (BUG-RUNTIME-201)
        // instead of hardcoded 'conversation' so downstream can resolve via dataset context.
        console.warn(`${LOG_PREFIX} AI returned unparseable response: "${result.text.slice(0, 100)}" (model: ${usedModelId})`);
        return { findings: buildUncertainFindings(message, usedModelId, 'parse_failure') };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`${LOG_PREFIX} AI classification failed: ${msg}`);
        const reason: IntentClassificationFindings['uncertaintyReason'] =
            isProviderTimeoutError(error) || msg.toLowerCase().includes('timed out') ? 'timeout' : 'ai_error';
        return { findings: buildUncertainFindings(message, 'unknown', reason) };
    }
};

// ─── Phase 1b: Legacy AI classification (fallback) ──────────────────────

const parseAiIntent = (text: string): ChatIntentCategory | null => {
    const trimmed = text.trim().toLowerCase().replace(/[^a-z_]/g, '');
    const valid: ChatIntentCategory[] = ['batch_analysis', 'precise_card', 'data_query', 'conversation'];
    return valid.find(v => trimmed.includes(v)) ?? null;
};

// ─── Phase 2: Structured signal extraction ─────────────────────────────

// Lightweight signal extraction — NOT used for routing decisions,
// only to enrich findings for downstream consumers.
const AGG_FUNCTION_RE = /\b(SUM|COUNT|AVG|AVERAGE|MIN|MAX|MEDIAN|STDEV)\s*\(/i;
const GROUP_BY_RE = /\b(group(?:ed)?[\s_-]*by)\s+\S/i;
const WHERE_CLAUSE_RE = /\bwhere\b.+[=<>!]/i;
const ZH_AGG_RE = /求和|计数|平均|最大值|最小值/;
const ZH_GROUP_RE = /按.{1,20}分组/;
const ZH_FILTER_RE = /筛选|过滤|条件/;
const COLUMN_REF_RE = /\b[A-Z][A-Z\s]{2,}[A-Z]\b|"[^"]{2,}"|`[^`]{2,}`/;

const extractStructuralSignals = (message: string) => ({
    hasAggFunction: AGG_FUNCTION_RE.test(message) || ZH_AGG_RE.test(message),
    hasGroupBy: GROUP_BY_RE.test(message) || ZH_GROUP_RE.test(message),
    hasFilter: WHERE_CLAUSE_RE.test(message) || ZH_FILTER_RE.test(message),
    hasColumnRef: COLUMN_REF_RE.test(message),
});

const buildLegacyFindings = (
    intent: ChatIntentCategory,
    message: string,
    modelId: string,
): IntentClassificationFindings => {
    const signals = extractStructuralSignals(message);
    return {
        intent,
        confidence: 'high',
        hasExplicitColumns: signals.hasColumnRef || signals.hasAggFunction || signals.hasGroupBy,
        hasAggregationFunction: signals.hasAggFunction,
        hasGroupingDirective: signals.hasGroupBy,
        hasFilterCondition: signals.hasFilter,
        reason: `AI classified as ${intent} (model: ${modelId})`,
        classifiedBy: 'ai',
    };
};

/**
 * BUG-RUNTIME-201: Build uncertain findings when AI classification fails
 * (timeout, parse failure, AI unavailable). Returns `data_query` as the
 * intent (safer than `conversation` when dataset is present) with
 * `classificationState: 'uncertain'` so downstream can use dataset/query
 * context to resolve routing.
 */
const buildUncertainFindings = (
    message: string,
    modelId: string,
    uncertaintyReason: IntentClassificationFindings['uncertaintyReason'],
): IntentClassificationFindings => {
    const signals = extractStructuralSignals(message);
    return {
        intent: 'data_query',
        confidence: 'low',
        hasExplicitColumns: signals.hasColumnRef || signals.hasAggFunction || signals.hasGroupBy,
        hasAggregationFunction: signals.hasAggFunction,
        hasGroupingDirective: signals.hasGroupBy,
        hasFilterCondition: signals.hasFilter,
        reason: `AI classification uncertain (${uncertaintyReason}) — grounded resolution needed (model: ${modelId})`,
        classifiedBy: 'deterministic',
        classificationState: 'uncertain',
        needsGroundedResolution: true,
        fallbackIntent: 'conversation',
        uncertaintyReason,
    };
};

// ─── Phase 3: Produce intent directive ─────────────────────────────────

const buildDirective = (
    findings: IntentClassificationFindings,
    artifact?: QueryUnderstandingArtifact,
): ChatRoutingDirective => {
    return { findings, artifact };
};

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Classify a chat message and produce Pi request context with
 * a rich QueryUnderstandingArtifact (AGENT-101).
 *
 * AI-first: every message is classified by the simpleModel.
 * The artifact carries taskSignal + expectedOutput so the contract builder
 * can consume them directly without regex re-derivation.
 *
 * If AI is unavailable, returns uncertain findings with no artifact.
 */
export const classifyChatIntent = async (
    message: string,
    settings: Settings,
    hasDataset: boolean,
    columnSummary?: string,
    abortSignal?: AbortSignal,
): Promise<ChatRoutingDirective> => {
    // No dataset → conversation findings (nothing to analyse)
    if (!hasDataset) {
        return buildDirective({
            intent: 'conversation',
            confidence: 'high',
            hasExplicitColumns: false,
            hasAggregationFunction: false,
            hasGroupingDirective: false,
            hasFilterCondition: false,
            reason: 'No dataset loaded — analysis is unavailable',
            classifiedBy: 'deterministic',
        });
    }

    // Phase 1: Rich AI classification (produces artifact when possible)
    const aiResult = await classifyWithAiRich(message, settings, columnSummary, abortSignal);
    if (aiResult) {
        console.log(`${LOG_PREFIX} AI: ${aiResult.findings.intent} (${aiResult.findings.reason})${aiResult.artifact ? ' [artifact]' : ''}`);
        return buildDirective(aiResult.findings, aiResult.artifact);
    }

    // Fallback: AI unavailable — return uncertain findings (BUG-RUNTIME-201)
    // so downstream can use dataset/query context to interpret the request.
    // Do not infer batch_analysis without AI confirmation.
    const fallback = buildUncertainFindings(message, 'none', 'ai_unavailable');
    console.log(`${LOG_PREFIX} Fallback: ${fallback.reason}`);
    return buildDirective(fallback);
};
