import type { AnalystRoleDefinition } from '../reporting/analystRoles';
import type { ReportEvidenceBriefing } from '../reporting/reportEvidenceHarness';
import type { AnalystMemo, ReportEvidenceBundle, Settings } from '../../types';

const buildPromptBundleView = (bundle: ReportEvidenceBundle) => ({
    dataset: bundle.dataset,
    workflow: {
        topWarnings: bundle.workflow.topWarnings,
        verification: bundle.workflow.verification,
        diff: bundle.workflow.diff,
    },
    summaries: bundle.summaries,
    query: bundle.query,
    cards: bundle.cards.map(card => ({
        evidenceId: card.evidenceId,
        title: card.title,
        displayTitle: card.displayTitle,
        description: card.description,
        artifactType: card.artifactType,
        chartType: card.chartType,
        groupByColumn: card.groupByColumn,
        valueColumn: card.valueColumn,
        aggregation: card.aggregation,
        rowCount: card.rowCount,
        summary: card.summary,
        aggregatedDataSample: card.aggregatedDataSample,
        semanticRole: card.semanticRole,
        helperExposureLevel: card.helperExposureLevel,
        businessMeaningConfidence: card.businessMeaningConfidence,
        aggregationQualityFlags: card.aggregationQualityFlags,
    })),
    evidenceCatalog: bundle.evidenceCatalog,
});

export const createAnalystMemoPrompt = (
    roleDefinition: AnalystRoleDefinition,
    bundle: ReportEvidenceBundle,
    language: Settings['language'],
    briefing?: ReportEvidenceBriefing | null,
): string => `
You are the ${roleDefinition.label} in a bounded multi-analyst report workflow.

Your objective:
- ${roleDefinition.objective}

Your focus areas:
${roleDefinition.focusAreas.map(area => `- ${area}`).join('\n')}

Operating rules:
- Use only the evidence ids listed in the EVIDENCE_CATALOG.
- Every finding must cite at least one evidence id.
- If evidence is weak or incomplete, downgrade the claim into a caveat or blocker instead of guessing.
- Keep the memo bounded: prefer 2-4 findings, 0-3 blockers, and 1-4 recommended next checks.
- Do not invent new datasets, metrics, cards, or workflow steps that are not present in the evidence bundle.
- Write user-facing prose in ${language} where possible.
- Use uppercase ISO currency codes (SGD, USD, EUR — never sgd, usd, eur).
- Replace null or missing category labels with "Unclassified" in user-facing text.
- Avoid internal column names, reason codes, or enum values. Use business-friendly language.
- Use "X times" for ratios instead of "X.Xx" notation.
- Return a single JSON object matching the provided schema.
${briefing ? `
EVIDENCE BRIEFING (harness-generated — use this to guide your analysis focus):
${briefing.briefingMarkdown}
` : ''}
EVIDENCE BUNDLE JSON:
${JSON.stringify(buildPromptBundleView(bundle), null, 2)}
`;

const buildPromptMemoView = (memos: AnalystMemo[]) => memos.map(memo => ({
    role: memo.role,
    headline: memo.headline,
    summary: memo.summary,
    findings: memo.findings,
    blockers: memo.blockers,
    caveats: memo.caveats,
    confidence: memo.confidence,
    recommendedNextChecks: memo.recommendedNextChecks,
}));

export const createForumSummaryPrompt = (
    memos: AnalystMemo[],
    bundle: ReportEvidenceBundle,
    language: Settings['language'],
    briefing?: ReportEvidenceBriefing | null,
): string => `
You are the forum aggregator in a bounded multi-analyst report workflow.

Your job:
- merge the analyst memos into a structured forum summary
- preserve disagreements instead of flattening them away
- promote only evidence-backed findings into consensusFindings

Operating rules:
- Use only the analyst memos and evidence ids provided below.
- Do not invent new evidence ids, roles, datasets, cards, or metrics.
- Every consensus finding must include at least one evidence ref.
- Use disagreements when analyst positions materially diverge or confidence remains mixed.
- Keep the forum summary bounded: prefer 2-5 consensus findings, 0-3 disagreements, and 2-5 recommended actions.
- Write user-facing prose in ${language} where possible.
- Use uppercase ISO currency codes (SGD, USD, EUR — never sgd, usd, eur).
- Replace null or missing category labels with "Unclassified" in user-facing text.
- Avoid technical terms like "helper exposure", "narrative ineligible", or "row expansion ratio" in user-facing text.
- Phrase each recommended action as a single clear sentence starting with a verb. Do not prefix actions with numbers.
- The executiveSummary should read like a professional analyst briefing for senior management.
- Return a single JSON object matching the provided schema.
${briefing ? `
EVIDENCE BRIEFING (harness-generated — use these insights to frame the executive summary):
${briefing.briefingMarkdown}
` : ''}
ANALYST MEMOS JSON:
${JSON.stringify(buildPromptMemoView(memos), null, 2)}

EVIDENCE BUNDLE JSON:
${JSON.stringify(buildPromptBundleView(bundle), null, 2)}
`;
