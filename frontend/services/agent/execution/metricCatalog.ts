import type {
    CohortRetentionRequest,
    MetricCatalogDefinition,
    MetricCatalogFieldRequirement,
    MetricCatalogMetricName,
    MetricCatalogResolution,
} from '../../../types';

const buildFieldRequirement = (
    semanticRole: MetricCatalogFieldRequirement['semanticRole'],
    required: boolean,
    acceptedPatterns: RegExp[],
): MetricCatalogFieldRequirement => ({
    semanticRole,
    required,
    acceptedPatterns: acceptedPatterns.map(pattern => pattern.source),
});

const METRIC_CATALOG_DEFINITIONS: Record<MetricCatalogMetricName, MetricCatalogDefinition> = {
    active_user_count: {
        metricName: 'active_user_count',
        label: 'Active User Count',
        description: 'Distinct active users by analysis period.',
        requiredFields: [
            buildFieldRequirement('date', true, [/(^|_)(date|activity_date|event_date|timestamp)$/i, /(activity|event|usage|visit)/i]),
            buildFieldRequirement('user_id', true, [/(user|customer|member|account).*(id)/i, /(^|_)(uid|user_id|customer_id|member_id)$/i]),
            buildFieldRequirement('segment', false, [/(segment|plan|region|country|channel|source|category|group)/i]),
        ],
        artifactType: 'period_compare',
    },
    retention: {
        metricName: 'retention',
        label: 'Retention',
        description: 'Cohort retention based on signup date, activity date, and user id.',
        requiredFields: [
            buildFieldRequirement('date', true, [/(activity|event|usage|visit).*(date|time)/i, /(^|_)(date|activity_date|event_date)$/i]),
            buildFieldRequirement('user_id', true, [/(user|customer|member|account).*(id)/i, /(^|_)(uid|user_id|customer_id|member_id)$/i]),
            buildFieldRequirement('user_signup_date', true, [/(signup|register|created|first).*(date|time)/i, /(cohort).*(date|month|week)/i]),
            buildFieldRequirement('segment', false, [/(segment|plan|region|country|channel|source|category|group)/i]),
        ],
        artifactType: 'cohort_retention',
    },
    churn: {
        metricName: 'churn',
        label: 'Churn',
        description: 'Cohort churn derived from retention inputs.',
        requiredFields: [
            buildFieldRequirement('date', true, [/(activity|event|usage|visit).*(date|time)/i, /(^|_)(date|activity_date|event_date)$/i]),
            buildFieldRequirement('user_id', true, [/(user|customer|member|account).*(id)/i, /(^|_)(uid|user_id|customer_id|member_id)$/i]),
            buildFieldRequirement('user_signup_date', true, [/(signup|register|created|first).*(date|time)/i, /(cohort).*(date|month|week)/i]),
            buildFieldRequirement('segment', false, [/(segment|plan|region|country|channel|source|category|group)/i]),
        ],
        artifactType: 'cohort_retention',
    },
    new_user_count: {
        metricName: 'new_user_count',
        label: 'New User Count',
        description: 'Distinct users by signup period.',
        requiredFields: [
            buildFieldRequirement('user_signup_date', true, [/(signup|register|created|first).*(date|time)/i, /(cohort).*(date|month|week)/i]),
            buildFieldRequirement('user_id', true, [/(user|customer|member|account).*(id)/i, /(^|_)(uid|user_id|customer_id|member_id)$/i]),
            buildFieldRequirement('segment', false, [/(segment|plan|region|country|channel|source|category|group)/i]),
        ],
        artifactType: 'period_compare',
    },
};

const normalizeColumnName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

const scoreCandidateColumn = (columnName: string, patterns: RegExp[]) => {
    const normalized = normalizeColumnName(columnName);
    return patterns.reduce((score, pattern) => {
        if (pattern.test(columnName)) {
            return score + 3;
        }
        if (pattern.test(normalized)) {
            return score + 2;
        }
        return score;
    }, 0);
};

const resolveFieldCandidate = (
    columns: string[],
    explicitValue: string | undefined,
    requirement: MetricCatalogFieldRequirement,
): string | null => {
    if (typeof explicitValue === 'string' && explicitValue.trim().length > 0) {
        return explicitValue.trim();
    }

    const patterns = requirement.acceptedPatterns.map(pattern => new RegExp(pattern, 'i'));
    let bestMatch: { column: string; score: number } | null = null;

    columns.forEach(columnName => {
        const score = scoreCandidateColumn(columnName, patterns);
        if (!bestMatch || score > bestMatch.score) {
            bestMatch = { column: columnName, score };
        }
    });

    return bestMatch && bestMatch.score > 0 ? bestMatch.column : null;
};

export const resolveMetricCatalog = (
    columns: string[],
    request: Pick<CohortRetentionRequest, 'metricName' | 'dateColumn' | 'userIdColumn' | 'signupDateColumn' | 'segmentColumn'>,
): MetricCatalogResolution => {
    const metricName = request.metricName ?? 'retention';
    const definition = METRIC_CATALOG_DEFINITIONS[metricName];
    const resolvedFields: Record<string, string> = {};
    const blockers: string[] = [];

    definition.requiredFields.forEach(requirement => {
        const explicitValue = requirement.semanticRole === 'date'
            ? request.dateColumn
            : requirement.semanticRole === 'user_id'
                ? request.userIdColumn
                : requirement.semanticRole === 'user_signup_date'
                    ? request.signupDateColumn
                    : requirement.semanticRole === 'segment'
                        ? request.segmentColumn
                        : undefined;
        const resolved = resolveFieldCandidate(columns, explicitValue, requirement);
        if (resolved) {
            resolvedFields[requirement.semanticRole] = resolved;
        } else if (requirement.required) {
            blockers.push(`Metric "${definition.label}" requires a ${requirement.semanticRole.replace(/_/g, ' ')} column.`);
        }
    });

    return {
        definition,
        resolvedFields,
        blockers,
    };
};
