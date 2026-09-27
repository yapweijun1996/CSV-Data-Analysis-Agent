export const runtimeEvaluationSchema = {
    type: 'object',
    properties: {
        decision: {
            type: 'string',
            enum: ['accept', 'retry', 'clarify'],
            description: 'Whether the last completed runtime step should be accepted, retried, or redirected to clarification.',
        },
        reason: {
            type: 'string',
            description: 'A concise explanation grounded in the last action and observation.',
        },
        retryHint: {
            type: 'string',
            description: 'Optional guidance for the next runtime step when decision is retry or clarify.',
        },
        isFinalEnough: {
            type: 'boolean',
            description: 'Whether the current request could reasonably end after this accepted step.',
        },
        needsExplanation: {
            type: 'boolean',
            description: 'Whether the accepted step still needs a grounded assistant_message to explain it to the user.',
        },
        scorecard: {
            type: 'object',
            description: 'Qualitative self-evaluation scorecard for the step. Optional — omit when confidence is low.',
            properties: {
                goalMatch: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'How well the step output matches the user goal.',
                },
                evidenceQuality: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'Quality of the evidence produced by this step.',
                },
                toolFit: {
                    type: 'string',
                    enum: ['poor', 'adequate', 'strong'],
                    description: 'How well the chosen tool matched the task.',
                },
                repeatRisk: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'Risk that retrying would produce the same outcome.',
                },
                completionReadiness: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'How close the task is to being fully complete.',
                },
                failurePattern: {
                    type: 'string',
                    enum: ['none', 'semantic_miss', 'tool_mismatch', 'tool_contract', 'tool_policy', 'weak_evidence', 'premature_answer', 'parse_failure', 'unknown'],
                    description: 'Identified failure pattern if the step did not fully succeed.',
                },
                insightValue: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'Business insight value of the result. low = all values nearly identical (flat metric), medium = some variation exists, high = clear pattern or outlier visible.',
                },
            },
            required: ['goalMatch', 'evidenceQuality', 'toolFit', 'repeatRisk', 'completionReadiness', 'failurePattern'],
        },
        finalReadiness: {
            type: 'string',
            enum: ['ready', 'needs_response', 'partial_only', 'not_ready'],
            description: 'Overall readiness to finalize the task after this step.',
        },
        recommendedNextMode: {
            type: 'string',
            enum: ['accept', 'retry', 'clarify', 'fallback_answer', 'repair', 'replan', 'stop'],
            description: 'Recommended next action mode. May differ from decision when richer recovery is available.',
        },
    },
    required: ['decision', 'reason'],
};
