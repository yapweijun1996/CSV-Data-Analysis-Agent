import { ALL_RUNTIME_TOOLS } from './runtimeToolExposurePolicy';

const CLARIFICATION_RESUME_MARKER = 'Continue the original request using the user clarification below.';
const PLACEHOLDER_ORIGINAL_REQUEST_VALUES = new Set(['?', '？']);
const LOW_INFORMATION_FOLLOW_UP_PATTERNS: RegExp[] = [
    /^(tell me more|tell me more about (?:this|that|it)|more details?|more info(?:rmation)?|details?|continue|go on|keep going|elaborate|expand|explain more|break (?:this|that|it) down|why|how|what else)$/i,
    /^(?:can you )?(?:elaborate|expand|go deeper|drill down)(?: on (?:this|that|it))?$/i,
];
const LOW_INFORMATION_CLARIFICATION_SELECTION_PATTERNS: RegExp[] = [
    /^(yes|yeah|yep|ok|okay|agree|agreed|sure)$/i,
    /^(go|go ahead|continue|carry on|proceed|do it)$/i,
    /^(?:anything|whatever)(?:\s+works?)?$/i,
    /\bup\s*to\s*you\b/i,
    /\byou decide\b/i,
    /\byour call\b/i,
    /\bnot sure\b/i,
    /\bidk\b/i,
    /\bi do(?:\s+not|n't)\s+know\b/i,
];
const AMBIGUOUS_FRAGMENT_TOKENS = new Set([
    'can',
    'could',
    'would',
    'should',
    'may',
    'maybe',
    'perhaps',
    'what',
    'which',
    'where',
    'when',
    'who',
    'whom',
    'whose',
    'is',
    'are',
    'was',
    'were',
    'do',
    'does',
    'did',
    'have',
    'has',
    'had',
    'and',
    'so',
    'then',
]);
const INTERNAL_TOOL_NAME_TOKENS = new Set<string>([
    ...ALL_RUNTIME_TOOLS,
    'assistant_message',
].map(value => value.toLowerCase()));

const extractClarificationResumeField = (message: string, label: string) => {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = message.match(new RegExp(`^${escapedLabel}:\\s*(.+)$`, 'mi'));
    return match?.[1]?.trim() ?? '';
};

export const unwrapClarificationResumeMessage = (message: string): string | null => {
    const clarificationResume = parseClarificationResumeMessage(message);
    if (!clarificationResume?.originalUserRequest) {
        const trimmed = message.trim();
        return trimmed || null;
    }

    if (clarificationResume.originalUserRequest.includes(CLARIFICATION_RESUME_MARKER)) {
        return unwrapClarificationResumeMessage(clarificationResume.originalUserRequest);
    }

    return clarificationResume.originalUserRequest.trim() || null;
};

const normalizeClarificationOriginalUserRequest = (message: string | null | undefined): string | null => {
    const trimmed = message?.trim() ?? '';
    if (!trimmed || PLACEHOLDER_ORIGINAL_REQUEST_VALUES.has(trimmed)) {
        return null;
    }

    const unwrapped = unwrapClarificationResumeMessage(trimmed) ?? trimmed;
    const normalized = unwrapped.trim();
    if (!normalized || PLACEHOLDER_ORIGINAL_REQUEST_VALUES.has(normalized)) {
        return null;
    }

    return normalized;
};

export const resolveClarificationOriginalUserRequest = (...candidates: Array<string | null | undefined>): string => {
    for (const candidate of candidates) {
        const normalized = normalizeClarificationOriginalUserRequest(candidate);
        if (normalized) {
            return normalized;
        }
    }

    return '';
};

export const parseClarificationResumeMessage = (message: string): {
    originalUserRequest: string;
    clarificationQuestion: string;
    selectedOption: string;
    selectedPath?: string;
    mustPreserveOutcome?: 'answer' | 'table' | 'card' | 'derived_metric';
    clarificationAssessment?: 'resolved' | 'best_effort_continue' | 'still_ambiguous';
    assumptionSummary?: string;
    clarificationQuestionFingerprint?: string;
    blockedReason?: string;
    /** AGENT-107: Prior evidence from the clarification turn. */
    priorQueryEvidence?: string;
    priorQueryColumns?: string[];
    priorQueryTrace?: string;
    /** Structured sample rows recovered from prior turn (safe JSON parse). */
    priorSampleRows?: Record<string, unknown>[];
    priorQualityContext?: string;
} | null => {
    if (!message.includes(CLARIFICATION_RESUME_MARKER)) {
        return null;
    }

    const originalUserRequest = extractClarificationResumeField(message, 'Original user request');
    const clarificationQuestion = extractClarificationResumeField(message, 'Clarification question');
    const selectedOption = extractClarificationResumeField(message, 'Selected option');
    const selectedPath = extractClarificationResumeField(message, 'Selected path');
    const mustPreserveOutcome = extractClarificationResumeField(message, 'Must preserve outcome');
    const clarificationAssessment = extractClarificationResumeField(message, 'Clarification assessment');
    const assumptionSummary = extractClarificationResumeField(message, 'Assumption summary');
    const clarificationQuestionFingerprint = extractClarificationResumeField(message, 'Clarification question fingerprint');
    const blockedReason = extractClarificationResumeField(message, 'Blocked reason');
    // AGENT-107: Prior evidence fields
    const priorQueryEvidence = extractClarificationResumeField(message, 'Prior query evidence');
    const priorQueryColumnsRaw = extractClarificationResumeField(message, 'Prior query columns');
    const priorQueryTrace = extractClarificationResumeField(message, 'Prior query trace');
    const priorSampleRowsRaw = extractClarificationResumeField(message, 'Prior sample rows');
    const priorQualityContext = extractClarificationResumeField(message, 'Prior quality context');
    if (!originalUserRequest || !selectedOption) {
        return null;
    }

    const priorQueryColumns = priorQueryColumnsRaw
        ? priorQueryColumnsRaw.split(',').map(c => c.trim()).filter(Boolean)
        : undefined;

    // AGENT-107C: Safe JSON parse — only accept arrays of objects
    let priorSampleRows: Record<string, unknown>[] | undefined;
    if (priorSampleRowsRaw) {
        try {
            const parsed = JSON.parse(priorSampleRowsRaw);
            if (Array.isArray(parsed) && parsed.every(row => row && typeof row === 'object' && !Array.isArray(row))) {
                priorSampleRows = parsed;
            }
        } catch {
            // Invalid JSON — silently degrade to undefined
        }
    }

    return {
        originalUserRequest,
        clarificationQuestion,
        selectedOption,
        selectedPath: selectedPath || undefined,
        mustPreserveOutcome: mustPreserveOutcome === 'table'
            || mustPreserveOutcome === 'card'
            || mustPreserveOutcome === 'derived_metric'
            || mustPreserveOutcome === 'answer'
            ? mustPreserveOutcome
            : undefined,
        clarificationAssessment: clarificationAssessment === 'best_effort_continue' || clarificationAssessment === 'still_ambiguous'
            ? clarificationAssessment
            : 'resolved',
        assumptionSummary: assumptionSummary || undefined,
        clarificationQuestionFingerprint: clarificationQuestionFingerprint || undefined,
        blockedReason: blockedReason || undefined,
        priorQueryEvidence: priorQueryEvidence || undefined,
        priorQueryColumns: priorQueryColumns?.length ? priorQueryColumns : undefined,
        priorQueryTrace: priorQueryTrace || undefined,
        priorSampleRows: priorSampleRows?.length ? priorSampleRows : undefined,
        priorQualityContext: priorQualityContext || undefined,
    };
};

const isWeakClarificationOriginRequest = (message: string) => {
    const normalized = message.trim();
    if (!normalized || PLACEHOLDER_ORIGINAL_REQUEST_VALUES.has(normalized)) {
        return true;
    }

    return isLowInformationFollowUp(normalized)
        || isAmbiguousFollowUpFragment(normalized);
};

const isLowInformationClarificationSelection = (message: string) => {
    const normalized = message.trim();
    if (!normalized || PLACEHOLDER_ORIGINAL_REQUEST_VALUES.has(normalized)) {
        return true;
    }

    return LOW_INFORMATION_CLARIFICATION_SELECTION_PATTERNS.some(pattern => pattern.test(normalized))
        || isLowInformationFollowUp(normalized)
        || isAmbiguousFollowUpFragment(normalized);
};

const buildQuestionDerivedClarificationIntent = (
    clarificationQuestion: string,
    selectedOption: string,
) => {
    const normalizedQuestion = clarificationQuestion.trim();
    const normalizedSelection = selectedOption.trim();

    if (!normalizedQuestion) {
        return normalizedSelection || null;
    }

    if (!normalizedSelection) {
        return normalizedQuestion;
    }

    return `${normalizedQuestion}\nUser clarification reply: ${normalizedSelection}`;
};

export const resolveClarificationIntentMessage = (
    clarificationResume: ReturnType<typeof parseClarificationResumeMessage>,
): string | null => {
    if (!clarificationResume) {
        return null;
    }

    const originalUserRequest = clarificationResume.originalUserRequest.trim();
    const clarificationQuestion = clarificationResume.clarificationQuestion.trim();
    const selectedOption = clarificationResume.selectedOption.trim();
    const selectedPath = clarificationResume.selectedPath?.trim() ?? '';

    if (!originalUserRequest && !selectedOption) {
        return null;
    }

    if (!selectedOption) {
        return originalUserRequest || null;
    }

    if (isWeakClarificationOriginRequest(originalUserRequest)) {
        if (!isLowInformationClarificationSelection(selectedOption)) {
            return selectedOption;
        }

        if (selectedPath) {
            return selectedPath;
        }

        const derivedIntent = buildQuestionDerivedClarificationIntent(clarificationQuestion, selectedOption);
        if (derivedIntent) {
            return derivedIntent;
        }

        return selectedOption;
    }

    if (!originalUserRequest) {
        return selectedOption;
    }

    return `${originalUserRequest}\nClarified follow-up: ${selectedOption}`;
};

export const summarizeGoal = (message: string) => {
    const clarificationResume = parseClarificationResumeMessage(message);
    if (!clarificationResume) {
        return message.trim();
    }

    return [
        clarificationResume.originalUserRequest.trim(),
        clarificationResume.selectedPath ? `Selected path: ${clarificationResume.selectedPath}` : '',
        clarificationResume.selectedOption ? `Clarification selected: ${clarificationResume.selectedOption}` : '',
        clarificationResume.assumptionSummary ? `Assumption: ${clarificationResume.assumptionSummary}` : '',
    ]
        .filter(Boolean)
        .join(' | ');
};

export const isLowInformationFollowUp = (message: string) => {
    const normalized = message.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!normalized || normalized.length > 80) {
        return false;
    }

    return LOW_INFORMATION_FOLLOW_UP_PATTERNS.some(pattern => pattern.test(normalized));
};

export const isAmbiguousFollowUpFragment = (message: string) => {
    const normalized = message.trim().toLowerCase().replace(/[?!.,]+$/g, '').replace(/\s+/g, ' ');
    if (!normalized) {
        return true;
    }

    const tokens = normalized.split(' ').filter(Boolean);
    if (tokens.length > 2) {
        return false;
    }

    if (tokens.every(token => AMBIGUOUS_FRAGMENT_TOKENS.has(token))) {
        return true;
    }

    return tokens.length === 1 && /^[a-z]{1,3}$/.test(tokens[0] ?? '');
};

export const isInternalToolNameFragment = (message: string) => {
    const normalized = message.trim().toLowerCase().replace(/[?!.,]+$/g, '');
    if (!normalized) {
        return false;
    }

    return INTERNAL_TOOL_NAME_TOKENS.has(normalized);
};

export const isContextDependentFollowUp = (message: string) => {
    const normalized = message.trim();
    if (!normalized) {
        return false;
    }

    if (parseClarificationResumeMessage(normalized)) {
        return false;
    }

    if (isLowInformationFollowUp(normalized) || isAmbiguousFollowUpFragment(normalized)) {
        return true;
    }

    const compact = normalized.replace(/\s+/g, ' ');
    if (/^\d+$/.test(compact)) {
        return true;
    }

    const tokens = compact.split(' ').filter(Boolean);
    return tokens.length <= 2 && compact.length <= 12;
};
