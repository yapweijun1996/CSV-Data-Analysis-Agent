import type { AnalystRole, ReportEvidenceBundle } from '../../types';

export interface AnalystRoleDefinition {
    role: AnalystRole;
    label: string;
    objective: string;
    focusAreas: string[];
    preferredEvidenceIds: string[];
    fallbackNextChecks: string[];
}

const commonEvidenceIds = ['dataset.context', 'dataset.readiness'] as const;

export const analystRoleDefinitions: Record<AnalystRole, AnalystRoleDefinition> = {
    data_quality: {
        role: 'data_quality',
        label: 'Data Quality Analyst',
        objective: 'Assess whether the prepared dataset is trustworthy enough for report synthesis.',
        focusAreas: [
            'dataset readiness and analysis eligibility',
            'preparation workflow warnings and verification outcomes',
            'structural caveats that could distort downstream interpretation',
        ],
        preferredEvidenceIds: [...commonEvidenceIds, 'workflow.preparation', 'workflow.verification'],
        fallbackNextChecks: [
            'Review intake warnings and parser confidence before promoting the dataset to report mode.',
            'Verify that preparation issues and SQL verification warnings are resolved or explicitly accepted.',
        ],
    },
    business: {
        role: 'business',
        label: 'Business Analyst',
        objective: 'Extract only the strongest business-facing findings supported by trusted analysis cards.',
        focusAreas: [
            'commercially meaningful patterns in trusted cards',
            'high-signal summaries already present in the evidence bundle',
            'actions that stay within the verified evidence boundary',
        ],
        preferredEvidenceIds: [...commonEvidenceIds, 'summary.core', 'summary.final', 'query.active'],
        fallbackNextChecks: [
            'Validate that the most important cards align with the intended business question before drafting a report.',
            'Add or refresh trusted cards if the current card set does not support a concrete business conclusion.',
        ],
    },
    risk: {
        role: 'risk',
        label: 'Risk Analyst',
        objective: 'Surface uncertainty, downside exposure, and unsupported inference risk before a report is finalized.',
        focusAreas: [
            'confidence limits caused by warnings, caveats, or sparse evidence',
            'claims that should remain conditional rather than definitive',
            'follow-up checks that reduce decision risk before export',
        ],
        preferredEvidenceIds: [...commonEvidenceIds, 'workflow.verification', 'workflow.preparation', 'query.active'],
        fallbackNextChecks: [
            'Inspect unresolved caveats before treating any finding as report-ready.',
            'Confirm that high-impact conclusions are backed by explicit evidence ids rather than summary-only language.',
        ],
    },
};

export const analystRoles = Object.freeze(
    Object.keys(analystRoleDefinitions) as AnalystRole[],
);

export const getAnalystRoleDefinition = (role: AnalystRole): AnalystRoleDefinition =>
    analystRoleDefinitions[role];

export const resolvePreferredEvidenceIds = (
    role: AnalystRole,
    bundle: ReportEvidenceBundle,
): string[] => {
    const allowedEvidenceIds = new Set(bundle.evidenceCatalog.map(entry => entry.id));
    const roleDefinition = getAnalystRoleDefinition(role);
    const roleScopedCardIds = role === 'business'
        ? bundle.cards.map(card => card.evidenceId)
        : bundle.cards.slice(0, 2).map(card => card.evidenceId);

    return [...roleDefinition.preferredEvidenceIds, ...roleScopedCardIds]
        .filter(id => allowedEvidenceIds.has(id))
        .filter((id, index, values) => values.indexOf(id) === index);
};
