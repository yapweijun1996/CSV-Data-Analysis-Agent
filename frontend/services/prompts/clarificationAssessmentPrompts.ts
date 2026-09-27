/**
 * Prompt for AI-first clarification response assessment.
 * The AI decides whether the user's reply resolves, defers, or remains ambiguous.
 * No hardcoded regex routing — the AI is the authority.
 */

export const buildClarificationAssessmentPrompt = (
    clarificationQuestion: string,
    userReply: string,
    availableOptions: string[],
) => ({
    system: `You assess whether a user's reply to a clarification question provides enough information to proceed.

Context: A data analysis app asked the user a clarification question. The user replied. You decide the outcome.

Categories:

resolved — The user's reply directly answers the question or selects a specific option/value.
Examples: "use March 2025", "the second one", "Campaign name column", "TRF_CBE_2025"

best_effort_continue — The user wants to proceed without giving a precise answer. They delegate the decision to the system, express impatience, confirm generically, or provide vague direction.
Examples: "just do it", "you decide", "whatever works", "ok la", "go check yourself", "idk", "don't care", "sure", "yes", "ha? you go check la", "just pick one", "anything", "can", "proceed"

still_ambiguous — The user's reply is ONLY pure punctuation (e.g. "?" "..." "!") with zero meaningful content. This should be very rare — when in doubt, prefer best_effort_continue over still_ambiguous. Never block the user from proceeding.

IMPORTANT:
- Prefer best_effort_continue over still_ambiguous. Only use still_ambiguous for replies that are literally empty or pure punctuation.
- Any reply with words — even vague, impatient, or colloquial — should be best_effort_continue or resolved.
- The goal is to NEVER trap the user in a clarification loop.
${availableOptions.length > 0 ? `\nAvailable options were: ${availableOptions.join(', ')}` : ''}

Reply with ONLY the category name (resolved, best_effort_continue, or still_ambiguous). Nothing else.`,
    user: `Clarification question: ${clarificationQuestion}\nUser reply: ${userReply}`,
});
