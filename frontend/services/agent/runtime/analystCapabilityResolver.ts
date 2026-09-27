import {
    ANALYST_CAPABILITY_RECIPES,
    ANALYST_CAPABILITY_SKILLS,
} from '../../../config/analystCapabilityPackages';
import type {
    AnalystCapabilityContextKey,
    AnalystCapabilitySelection,
    AppState,
    RuntimeStepContract,
    ToolName,
} from '../../../types';

type ResolverState = Pick<
AppState,
| 'activeDataQuery'
| 'activeSpreadsheetFilter'
| 'analysisCards'
| 'contextualSummary'
| 'queryHistory'
>;

const DATA_QUALITY_PATTERNS = [
    /\b(clean|cleanliness|quality|dirty|messy)\b/i,
    /\b(null|missing|blank|duplicate|duplicates)\b/i,
    /\b(schema|column quality|data issue|issues)\b/i,
];

const QUERY_VALIDATION_PATTERNS = [
    /\b(show|list|find|check|count|verify|validate|inspect|lookup)\b/i,
    /\b(rows?|records?|duplicates?|top|bottom|highest|lowest)\b/i,
    /\b(group|filter|match|where)\b/i,
];

const CHART_REVIEW_PATTERNS = [
    /\b(review|recheck|inspect|improve|recommend)\b/i,
    /\b(chart|card|visual|visualization|fallback)\b/i,
    /\b(summary|label|axis|axes|legend)\b/i,
];

const PIVOT_MATRIX_PATTERNS = [
    /\b(pivot|matrix|crosstab|cross[-\s]?tab|two[-\s]?way table)\b/i,
    /\b(rows?|columns?|segments?|breakdown)\b/i,
];

const PERIOD_COMPARE_PATTERNS = [
    /\b(yoy|year over year|mom|month over month|wow|week over week|qoq|quarter over quarter)\b/i,
    /\b(period[-\s]?over[-\s]?period|previous period|previous year)\b/i,
    /\b(compare|comparison|variance|change|delta)\b.*\b(previous|prior|last|current|this)\b.*\b(day|week|month|quarter|year)\b/i,
    /\b(previous|prior|last|current|this)\b.*\b(day|week|month|quarter|year)\b.*\b(compare|comparison|variance|change|delta)\b/i,
];

const COHORT_PATTERNS = [
    /\b(cohort|retention|churn|new users?|active users?)\b/i,
    /\b(users?|signup|registered|activity|returning)\b/i,
];

const ROOT_CAUSE_PATTERNS = [
    /\b(root cause|driver|drivers|contributor|contributors|what drove|why did)\b/i,
    /\b(change|variance|increase|decrease|drop|spike)\b/i,
];

const STATISTICAL_PATTERNS = [
    /\b(correlation|regression|distribution|outlier|trend|anomaly|skew|scatter)\b/i,
];

const dedupeTools = (toolNames: ToolName[]) => Array.from(new Set(toolNames));

const formatContextLabel = (contextKey: AnalystCapabilityContextKey) => contextKey.replace(/_/g, ' ');

const hasVisibleInspectionEvidence = (state?: Partial<ResolverState>) => Boolean(
    state?.activeDataQuery
    || state?.activeSpreadsheetFilter
    || (state?.analysisCards?.length ?? 0) > 0
    || (state?.queryHistory?.length ?? 0) > 0
    || state?.contextualSummary?.trim(),
);

const matchesAll = (message: string, patterns: RegExp[]) => patterns.every(pattern => pattern.test(message));
const matchesAny = (message: string, patterns: RegExp[]) => patterns.some(pattern => pattern.test(message));

const resolveDataQualitySelection = (message: string) => {
    if (!matchesAny(message, DATA_QUALITY_PATTERNS)) {
        return null;
    }

    return {
        skill: ANALYST_CAPABILITY_SKILLS.find(skill => skill.id === 'analyst.skill.data_quality_verification') ?? null,
        recipe: ANALYST_CAPABILITY_RECIPES.find(recipe => recipe.id === 'analyst.recipe.dataset_quality_triage') ?? null,
        rationale: [
            'The request is framed as dataset cleanliness or quality verification.',
            'Use the packaged quality triage workflow instead of broad analysis exploration.',
        ],
    };
};

const resolveChartReviewSelection = (message: string, state?: Partial<ResolverState>) => {
    if ((state?.analysisCards?.length ?? 0) === 0) {
        return null;
    }

    if (!matchesAll(message, [CHART_REVIEW_PATTERNS[0], CHART_REVIEW_PATTERNS[1]])) {
        return null;
    }

    return {
        skill: ANALYST_CAPABILITY_SKILLS.find(skill => skill.id === 'analyst.skill.chart_recommendation_review') ?? null,
        recipe: ANALYST_CAPABILITY_RECIPES.find(recipe => recipe.id === 'analyst.recipe.chart_review_followup') ?? null,
        rationale: [
            'The user is reviewing or refining an existing card/chart rather than asking for a new plan from scratch.',
            'Use the packaged chart-review workflow and stay inside review-first tools.',
        ],
    };
};

const resolveValidationQuerySelection = (
    message: string,
    contract: RuntimeStepContract,
    state?: Partial<ResolverState>,
) => {
    if (contract.taskMode !== 'inspect' || !contract.allowedToolNames?.includes('data.query')) {
        return null;
    }

    if (!matchesAny(message, QUERY_VALIDATION_PATTERNS) && !hasVisibleInspectionEvidence(state)) {
        return null;
    }

    return {
        skill: ANALYST_CAPABILITY_SKILLS.find(skill => skill.id === 'analyst.skill.duckdb_validation_query') ?? null,
        recipe: ANALYST_CAPABILITY_RECIPES.find(recipe => recipe.id === 'analyst.recipe.read_only_duckdb_validation') ?? null,
        rationale: [
            'The request fits a read-only validation or lookup workflow.',
            'Use the packaged DuckDB validation recipe to ground the grouped evidence first, while still allowing a later chart step if the request truly needs one.',
        ],
    };
};

const resolvePivotMatrixSelection = (message: string, contract: RuntimeStepContract) => {
    if (contract.pivotPreference !== 'explicit_preferred' && !matchesAll(message, PIVOT_MATRIX_PATTERNS)) {
        return null;
    }

    return {
        skill: ANALYST_CAPABILITY_SKILLS.find(skill => skill.id === 'analyst.skill.pivot_matrix_analysis') ?? null,
        recipe: ANALYST_CAPABILITY_RECIPES.find(recipe => recipe.id === 'analyst.recipe.read_only_pivot_matrix') ?? null,
        rationale: [
            'The request is asking for a pivot, matrix, or crosstab style output.',
            'Use the packaged pivot workflow to stabilize the matrix result first instead of jumping straight into generic chart planning.',
        ],
    };
};

const resolvePeriodCompareSelection = (message: string, contract: RuntimeStepContract) => {
    if (contract.taskMode !== 'period_compare' && !matchesAny(message, PERIOD_COMPARE_PATTERNS)) {
        return null;
    }

    return {
        skill: ANALYST_CAPABILITY_SKILLS.find(skill => skill.id === 'analyst.skill.period_compare_analysis') ?? null,
        recipe: ANALYST_CAPABILITY_RECIPES.find(recipe => recipe.id === 'analyst.recipe.period_compare_variance') ?? null,
        rationale: [
            'The request is framed as a period-over-period comparison.',
            'Use the packaged variance workflow to ground the comparison first instead of forcing a generic inspect or chart path.',
        ],
    };
};

const resolveCohortSelection = (message: string, contract: RuntimeStepContract) => {
    if (contract.taskMode !== 'cohort_retention' && !matchesAll(message, COHORT_PATTERNS)) {
        return null;
    }

    return {
        skill: ANALYST_CAPABILITY_SKILLS.find(skill => skill.id === 'analyst.skill.cohort_retention_analysis') ?? null,
        recipe: ANALYST_CAPABILITY_RECIPES.find(recipe => recipe.id === 'analyst.recipe.catalog_backed_cohort_analysis') ?? null,
        rationale: [
            'The request needs a cohort-oriented retention or churn workflow.',
            'Use the catalog-backed cohort package to produce a grounded cohort result before deciding whether any charting is still useful.',
        ],
    };
};

const resolveRootCauseSelection = (message: string, contract: RuntimeStepContract) => {
    if (contract.taskMode !== 'root_cause_breakdown' && !matchesAll(message, ROOT_CAUSE_PATTERNS)) {
        return null;
    }

    return {
        skill: ANALYST_CAPABILITY_SKILLS.find(skill => skill.id === 'analyst.skill.root_cause_breakdown') ?? null,
        recipe: ANALYST_CAPABILITY_RECIPES.find(recipe => recipe.id === 'analyst.recipe.root_cause_driver_breakdown') ?? null,
        rationale: [
            'The request is asking what drove a change.',
            'Use the packaged contributor-breakdown workflow instead of a generic comparison response.',
        ],
    };
};

const resolveStatisticalSelection = (message: string, contract: RuntimeStepContract) => {
    if (contract.taskMode !== 'statistical_analysis' && !matchesAny(message, STATISTICAL_PATTERNS)) {
        return null;
    }

    return {
        skill: ANALYST_CAPABILITY_SKILLS.find(skill => skill.id === 'analyst.skill.bounded_statistical_analysis') ?? null,
        recipe: ANALYST_CAPABILITY_RECIPES.find(recipe => recipe.id === 'analyst.recipe.bounded_statistical_followup') ?? null,
        rationale: [
            'The request fits a supported bounded statistical workflow.',
            'Use the packaged statistical tool contract instead of open-ended analysis planning.',
        ],
    };
};

export const resolveAnalystCapabilitySelection = ({
    message,
    contract,
    state,
}: {
    message: string;
    contract: RuntimeStepContract;
    state?: Partial<ResolverState>;
}): AnalystCapabilitySelection | null => {
    const qualitySelection = resolveDataQualitySelection(message);
    const chartReviewSelection = resolveChartReviewSelection(message, state);
    const validationQuerySelection = resolveValidationQuerySelection(message, contract, state);
    const pivotMatrixSelection = resolvePivotMatrixSelection(message, contract);
    const periodCompareSelection = resolvePeriodCompareSelection(message, contract);
    const cohortSelection = resolveCohortSelection(message, contract);
    const rootCauseSelection = resolveRootCauseSelection(message, contract);
    const statisticalSelection = resolveStatisticalSelection(message, contract);
    const selected = qualitySelection
        ?? chartReviewSelection
        ?? pivotMatrixSelection
        ?? periodCompareSelection
        ?? cohortSelection
        ?? rootCauseSelection
        ?? statisticalSelection
        ?? validationQuerySelection;

    if (!selected || (!selected.skill && !selected.recipe)) {
        return null;
    }

    const resolvedToolNames = dedupeTools(
        (selected.recipe?.allowedToolNames ?? selected.skill?.allowedToolNames ?? [])
            .filter(toolName => contract.allowedToolNames?.includes(toolName)),
    );

    return {
        skill: selected.skill,
        recipe: selected.recipe,
        rationale: selected.rationale,
        resolvedToolNames,
    };
};

// ─── AGENT-112: Capability Steering ─────────────────────────────

export interface CapabilitySteeringDirectives {
    taskMode: RuntimeStepContract['taskMode'] | null;
    expectedOutcome: RuntimeStepContract['expectedOutcome'] | null;
    doneCriteria: string[] | null;
    instructionPrefix: string | null;
    preferredFallback: 'answer' | 'clarify' | 'replan' | null;
}

const EMPTY_STEERING: CapabilitySteeringDirectives = {
    taskMode: null,
    expectedOutcome: null,
    doneCriteria: null,
    instructionPrefix: null,
    preferredFallback: null,
};

/**
 * Derive steering directives from a capability selection.
 * The active package (recipe ?? skill) provides overrideTaskMode,
 * overrideExpectedOutcome, preferredFallback, and completionChecks.
 */
export const deriveCapabilitySteeringDirectives = (
    selection: AnalystCapabilitySelection | null,
): CapabilitySteeringDirectives => {
    if (!selection) return EMPTY_STEERING;
    // Prefer skill overrides (recipes inherit tool sets but don't override steering)
    const pkg = selection.skill ?? selection.recipe;
    if (!pkg) return EMPTY_STEERING;
    return {
        taskMode: pkg.overrideTaskMode ?? null,
        expectedOutcome: pkg.overrideExpectedOutcome ?? null,
        doneCriteria: pkg.completionChecks.length > 0 ? [...pkg.completionChecks] : null,
        instructionPrefix: `[${pkg.label}] ${pkg.intent}`,
        preferredFallback: pkg.preferredFallback ?? null,
    };
};

/**
 * Early capability resolution — FALLBACK when AI artifact is absent or low-confidence.
 *
 * AGENT-106: When QueryUnderstandingArtifact provides medium/high confidence
 * taskSignal, the contract builder skips this resolver entirely. This function
 * is only called when artifactTaskMode is null (AI unavailable or low confidence).
 *
 * Uses message patterns only, without contract.taskMode guards.
 */
export const resolveEarlyCapabilitySelection = (
    message: string,
    state?: Partial<ResolverState>,
): AnalystCapabilitySelection | null => {
    // Run pattern matchers without contract dependency
    const qualitySelection = resolveDataQualitySelection(message);
    const chartReviewSelection = resolveChartReviewSelection(message, state);
    const pivotMatrixSelection = matchesAll(message, PIVOT_MATRIX_PATTERNS)
        ? {
            skill: ANALYST_CAPABILITY_SKILLS.find(s => s.id === 'analyst.skill.pivot_matrix_analysis') ?? null,
            recipe: ANALYST_CAPABILITY_RECIPES.find(r => r.id === 'analyst.recipe.read_only_pivot_matrix') ?? null,
            rationale: ['The request is asking for a pivot, matrix, or crosstab style output.'],
        }
        : null;
    const periodCompareSelection = matchesAny(message, PERIOD_COMPARE_PATTERNS)
        ? {
            skill: ANALYST_CAPABILITY_SKILLS.find(s => s.id === 'analyst.skill.period_compare_analysis') ?? null,
            recipe: ANALYST_CAPABILITY_RECIPES.find(r => r.id === 'analyst.recipe.period_compare_variance') ?? null,
            rationale: ['The request is framed as a period-over-period comparison.'],
        }
        : null;
    const cohortSelection = matchesAll(message, COHORT_PATTERNS)
        ? {
            skill: ANALYST_CAPABILITY_SKILLS.find(s => s.id === 'analyst.skill.cohort_retention_analysis') ?? null,
            recipe: ANALYST_CAPABILITY_RECIPES.find(r => r.id === 'analyst.recipe.catalog_backed_cohort_analysis') ?? null,
            rationale: ['The request needs a cohort-oriented retention or churn workflow.'],
        }
        : null;
    const rootCauseSelection = matchesAll(message, ROOT_CAUSE_PATTERNS)
        ? {
            skill: ANALYST_CAPABILITY_SKILLS.find(s => s.id === 'analyst.skill.root_cause_breakdown') ?? null,
            recipe: ANALYST_CAPABILITY_RECIPES.find(r => r.id === 'analyst.recipe.root_cause_driver_breakdown') ?? null,
            rationale: ['The request is asking what drove a change.'],
        }
        : null;
    const statisticalSelection = matchesAny(message, STATISTICAL_PATTERNS)
        ? {
            skill: ANALYST_CAPABILITY_SKILLS.find(s => s.id === 'analyst.skill.bounded_statistical_analysis') ?? null,
            recipe: ANALYST_CAPABILITY_RECIPES.find(r => r.id === 'analyst.recipe.bounded_statistical_followup') ?? null,
            rationale: ['The request fits a supported bounded statistical workflow.'],
        }
        : null;
    // Validation query: require at least 2 pattern groups to match (not just "show")
    // to avoid false positives on generic messages like "show revenue by project"
    const validationPatternMatchCount = QUERY_VALIDATION_PATTERNS.filter(p => p.test(message)).length;
    const validationQuerySelection = validationPatternMatchCount >= 2
        ? {
            skill: ANALYST_CAPABILITY_SKILLS.find(s => s.id === 'analyst.skill.duckdb_validation_query') ?? null,
            recipe: ANALYST_CAPABILITY_RECIPES.find(r => r.id === 'analyst.recipe.read_only_duckdb_validation') ?? null,
            rationale: ['The request fits a read-only validation or lookup workflow.'],
        }
        : null;

    const selected = qualitySelection
        ?? chartReviewSelection
        ?? pivotMatrixSelection
        ?? periodCompareSelection
        ?? cohortSelection
        ?? rootCauseSelection
        ?? statisticalSelection
        ?? validationQuerySelection;

    if (!selected || (!selected.skill && !selected.recipe)) {
        return null;
    }

    // Early resolution doesn't narrow tools (no contract yet) — use package tools as-is
    const resolvedToolNames = dedupeTools(
        selected.recipe?.allowedToolNames ?? selected.skill?.allowedToolNames ?? [],
    );

    return {
        skill: selected.skill,
        recipe: selected.recipe,
        rationale: selected.rationale,
        resolvedToolNames,
    };
};

export const formatAnalystCapabilitySelection = (
    selection: AnalystCapabilitySelection | null | undefined,
): string => {
    if (!selection) {
        return 'No packaged analyst skill or recipe is active for this step.';
    }

    const activePackage = selection.recipe ?? selection.skill;
    const requiredContext = activePackage?.requiredContext.map(formatContextLabel).join(', ') || 'none';
    const completionChecks = activePackage?.completionChecks.join(' | ') || 'none';

    return [
        `Skill: ${selection.skill?.label ?? 'None'}`,
        `Recipe: ${selection.recipe?.label ?? 'None'}`,
        `Intent: ${activePackage?.intent ?? 'None'}`,
        `Required context: ${requiredContext}`,
        `Resolved tool calls: ${selection.resolvedToolNames.join(', ') || 'None'}`,
        `Completion checks: ${completionChecks}`,
        `Selection rationale: ${selection.rationale.join(' | ') || 'None'}`,
    ].join('\n');
};
