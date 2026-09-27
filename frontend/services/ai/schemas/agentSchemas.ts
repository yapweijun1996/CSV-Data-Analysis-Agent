import { analysisPlanObjectSchema } from "./analysisSchemas";

export const proactiveInsightSchema = {
    type: 'object',
    properties: {
        insight: { type: 'string', description: "A concise, user-facing message describing the single most important finding." },
        cardId: { type: 'string', description: "The ID of the card where this insight was observed." },
    },
    required: ['insight', 'cardId'],
} as const;

export const nextStepSchema = {
    type: 'object',
    properties: {
        thought: {
            type: 'string',
            description: "Your detailed reasoning. First, summarize how the last observation updates your understanding. Then, explain why you are choosing the specific next action."
        },
        updatedContextualSummary: {
            type: 'string',
            description: "The new, updated version of your 'Working Memory' after incorporating the latest findings."
        },
        nextAction: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['EXECUTE_PLAN', 'CREATE_AND_EXECUTE_PLAN', 'FINISH_AND_SUMMARIZE'],
                    description: "The type of action to perform next."
                },
                plan: {
                    ...analysisPlanObjectSchema,
                    description: "The plan to execute. Required for 'EXECUTE_PLAN' and 'CREATE_AND_EXECUTE_PLAN'."
                },
                reasonForFinishing: {
                    type: 'string',
                    description: "A brief reason why the analysis is considered complete. Required for 'FINISH_AND_SUMMARIZE'."
                }
            },
            required: ['type']
        }
    },
    required: ['thought', 'updatedContextualSummary', 'nextAction']
} as const;

export const analysisGoalCandidateSchema = {
    type: 'object',
    properties: {
        goals: {
            type: 'array',
            description: "An array of 2-3 distinct analysis goal candidates.",
            items: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: "A short, clear title for the goal (e.g., 'Analyze Regional Sales Performance')." },
                    description: { type: 'string', description: "A one-sentence explanation of what this goal entails." },
                    confidence: { type: 'number', description: "A score from 0.0 to 1.0 indicating your confidence that this is the user's primary goal." }
                },
                required: ['title', 'description', 'confidence']
            }
        }
    },
    required: ['goals']
} as const;

export const cardEnhancementSuggestionsSchema = {
    type: 'object',
    properties: {
        suggestions: {
            type: 'array',
            description: 'Up to three suggested improvements for the existing analysis cards.',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'Optional unique id for the suggestion.' },
                    cardId: { type: 'string', description: 'The target card ID that should be enhanced.' },
                    cardTitle: { type: 'string', description: 'Optional. Human-readable title of the card.' },
                    rationale: { type: 'string', description: 'Why this enhancement matters.' },
                    priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'How important this enhancement is.' },
                    action: { type: 'string', enum: ['add_calculated_column', 'none'], description: 'Which tool to apply. Start with calculated columns; use "none" for informational suggestions.' },
                    proposedColumnName: { type: 'string', description: 'If action is add_calculated_column, name of the new column.' },
                    formula: { type: 'string', description: 'Formula referencing existing columns with single quotes, e.g., "(\'Revenue\' - \'Cost\') / \'Revenue\'".' },
                    updateChart: {
                        type: 'object',
                        description: 'Optional chart update instructions when adding a new column.',
                        properties: {
                            useAs: { type: 'string', enum: ['primaryY', 'secondaryY'] },
                            newChartType: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut', 'scatter', 'combo', 'radar', 'bubble'] },
                        },
                        required: ['useAs'],
                    },
                },
                required: ['cardId', 'rationale', 'priority', 'action'],
            },
        },
    },
    required: ['suggestions'],
} as const;

export const analystMemoSchema = {
    type: 'object',
    properties: {
        role: {
            type: 'string',
            enum: ['data_quality', 'business', 'risk'],
            description: 'The fixed analyst role that produced this memo.',
        },
        headline: {
            type: 'string',
            description: 'A short headline that captures the role-specific conclusion.',
        },
        summary: {
            type: 'string',
            description: 'A concise summary of the analyst view.',
        },
        findings: {
            type: 'array',
            description: 'Role-specific findings grounded in the evidence bundle.',
            items: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'A stable identifier for this finding.',
                    },
                    claim: {
                        type: 'string',
                        description: 'The actual finding claim.',
                    },
                    importance: {
                        type: 'string',
                        enum: ['low', 'medium', 'high'],
                        description: 'How important the finding is.',
                    },
                    evidenceRefs: {
                        type: 'array',
                        description: 'Evidence ids from the provided evidence catalog.',
                        items: { type: 'string' },
                    },
                    metricRefs: {
                        type: 'array',
                        description: 'Metric or column labels referenced by the finding.',
                        items: { type: 'string' },
                    },
                    caveat: {
                        type: 'string',
                        description: 'Optional caveat that tempers the claim.',
                    },
                },
                required: ['id', 'claim', 'importance', 'evidenceRefs', 'metricRefs'],
            },
        },
        blockers: {
            type: 'array',
            description: 'Material blockers that prevent stronger conclusions.',
            items: { type: 'string' },
        },
        caveats: {
            type: 'array',
            description: 'Non-blocking caveats that limit confidence.',
            items: { type: 'string' },
        },
        confidence: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Overall confidence for this memo.',
        },
        recommendedNextChecks: {
            type: 'array',
            description: 'Concrete next checks for the user or a later bounded report step.',
            items: { type: 'string' },
        },
    },
    required: ['role', 'headline', 'summary', 'findings', 'blockers', 'caveats', 'confidence', 'recommendedNextChecks'],
} as const;

export const forumSummarySchema = {
    type: 'object',
    properties: {
        consensusFindings: {
            type: 'array',
            description: 'Merged findings that can be carried into the report as consensus or near-consensus statements.',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'Stable identifier for the merged finding.' },
                    claim: { type: 'string', description: 'Merged claim text suitable for the report.' },
                    supportedByRoles: {
                        type: 'array',
                        description: 'The analyst roles that support this claim.',
                        items: {
                            type: 'string',
                            enum: ['data_quality', 'business', 'risk'],
                        },
                    },
                    evidenceRefs: {
                        type: 'array',
                        description: 'Evidence ids from the evidence catalog.',
                        items: { type: 'string' },
                    },
                    caveats: {
                        type: 'array',
                        description: 'Caveats that should stay attached to the finding.',
                        items: { type: 'string' },
                    },
                },
                required: ['id', 'claim', 'supportedByRoles', 'evidenceRefs', 'caveats'],
            },
        },
        disagreements: {
            type: 'array',
            description: 'Explicit unresolved or partially resolved disagreements across analysts.',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'Stable identifier for the disagreement.' },
                    topic: { type: 'string', description: 'Short topic for the disagreement.' },
                    positions: {
                        type: 'array',
                        description: 'Role-specific positions on the topic.',
                        items: {
                            type: 'object',
                            properties: {
                                role: {
                                    type: 'string',
                                    enum: ['data_quality', 'business', 'risk'],
                                },
                                stance: { type: 'string', description: 'How the role characterizes the issue.' },
                                evidenceRefs: {
                                    type: 'array',
                                    description: 'Evidence ids backing that stance.',
                                    items: { type: 'string' },
                                },
                            },
                            required: ['role', 'stance', 'evidenceRefs'],
                        },
                    },
                    resolution: {
                        type: 'string',
                        enum: ['unresolved', 'partially_resolved', 'resolved'],
                        description: 'Whether the disagreement is still open after aggregation.',
                    },
                },
                required: ['id', 'topic', 'positions', 'resolution'],
            },
        },
        overallConfidence: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Overall confidence for the merged forum summary.',
        },
        executiveSummary: {
            type: 'string',
            description: 'An executive summary that explains the final merged take.',
        },
        recommendedActions: {
            type: 'array',
            description: 'Concrete actions to reduce risk or improve report readiness.',
            items: { type: 'string' },
        },
    },
    required: ['consensusFindings', 'disagreements', 'overallConfidence', 'executiveSummary', 'recommendedActions'],
} as const;
