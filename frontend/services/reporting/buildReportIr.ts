import type {
    AnalystFindingImportance,
    AnalystConfidence,
    AnalystMemo,
    ForumFinding,
    ForumSummary,
    ReportCardEvidence,
    ReportContentsItem,
    ReportDatasetSection,
    ReportEvidenceBundle,
    ReportEvidenceSection,
    ReportFindingSection,
    ReportIr,
    ReportKpiHighlight,
    ReportSection,
    ReportSummarySection,
} from '../../types';
import { buildReportVisualSelection } from './buildReportVisualSelection';
import { buildNarrativeSemanticKey, normalizeReportNarrative } from './normalizeReportNarrative';
import { runReportQualityHarness, type ReportQualityDirectives } from './reportQualityHarness';
import { synthesizeCrossCardInsights } from './synthesizeCrossCardInsights';

const MAX_CAVEATS = 6;
const MAX_RECOMMENDED_ACTIONS = 5;
const MAX_MANAGEMENT_HIGHLIGHTS = 4;
const MAX_KPI_HIGHLIGHTS = 4;

const trimText = (value: unknown): string => String(value ?? '').trim();

const dedupeStrings = (
    values: Array<string | null | undefined>,
    limit?: number,
): string[] => {
    const seen = new Set<string>();
    const output: string[] = [];

    for (const value of values) {
        const normalized = trimText(value);
        if (!normalized) {
            continue;
        }

        const key = normalized.toLowerCase();
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        output.push(normalized);
        if (typeof limit === 'number' && output.length >= limit) {
            break;
        }
    }

    return output;
};

const buildReportId = (bundle: ReportEvidenceBundle): string => {
    const normalizedTimestamp = bundle.generatedAt.replace(/[^0-9]/g, '');
    const datasetSegment = trimText(bundle.datasetId) || 'no_dataset';
    return `report.${bundle.sessionId}.${datasetSegment}.${normalizedTimestamp}`;
};

const resolveDisplayedReadiness = (
    readiness: ReportEvidenceBundle['dataset']['reportReadiness'],
    confidence: AnalystConfidence,
): ReportEvidenceBundle['dataset']['reportReadiness'] =>
    readiness === 'ready' && confidence === 'low' ? 'partial' : readiness;

const buildDisplayedReadinessReason = (
    bundle: ReportEvidenceBundle,
    displayedReadiness: ReportEvidenceBundle['dataset']['reportReadiness'],
    overallConfidence: AnalystConfidence,
): string => {
    if (bundle.dataset.reportReadiness === 'ready' && displayedReadiness === 'partial' && overallConfidence === 'low') {
        return 'Usable for bounded synthesis, but low forum confidence still limits executive certainty.';
    }

    return bundle.dataset.reportReadinessReason;
};

const buildDatasetSection = (
    bundle: ReportEvidenceBundle,
    forum: ForumSummary,
    directives?: ReportQualityDirectives,
): ReportDatasetSection => {
    const workflowStatusParts = [
        `prep=${bundle.dataset.preparationState}`,
        `analysis=${bundle.dataset.analysisState}`,
        `intake=${bundle.dataset.intakeGateStatus}`,
        `cards=${bundle.dataset.cardsCount}`,
    ];
    const shapeSummaryParts = [
        `${bundle.dataset.rawRowCount} raw row(s)`,
        `${bundle.dataset.cleanedRowCount} cleaned row(s)`,
        `${bundle.dataset.metadataRowCount} metadata row(s)`,
        `${bundle.dataset.summaryRowCount} summary row(s)`,
        `header depth ${bundle.dataset.headerDepth}`,
    ];
    const displayedReadiness = resolveDisplayedReadiness(bundle.dataset.reportReadiness, forum.overallConfidence);
    const readinessRisks = dedupeStrings([
        ...bundle.dataset.readinessRisks,
        bundle.dataset.reportReadiness === 'ready' && displayedReadiness === 'partial' && forum.overallConfidence === 'low'
            ? 'Forum overall confidence remained low, so displayed readiness was downgraded to partial.'
            : null,
    ], MAX_CAVEATS);

    return {
        title: 'Dataset Readiness',
        datasetName: bundle.dataset.reportTitle || bundle.dataset.fileName,
        datasetVersion: bundle.dataset.datasetVersion ?? null,
        readiness: displayedReadiness,
        readinessReason: buildDisplayedReadinessReason(bundle, displayedReadiness, forum.overallConfidence),
        generationGate: bundle.dataset.reportGenerationGate,
        generationBlockers: dedupeStrings(bundle.dataset.reportGenerationBlockers, MAX_CAVEATS),
        workflowStatus: workflowStatusParts.join(' | '),
        shapeSummary: shapeSummaryParts.join(' | '),
        readinessDrivers: dedupeStrings(bundle.dataset.readinessDrivers, MAX_CAVEATS),
        readinessRisks: directives
            ? readinessRisks.map(risk => directives.caveatRewrites.get(risk) ?? risk)
            : readinessRisks,
        structuralSignals: bundle.dataset.structuralSignals,
        caveats: directives
            ? dedupeStrings(bundle.dataset.caveats, MAX_CAVEATS).map(c => directives.caveatRewrites.get(c) ?? c)
            : dedupeStrings(bundle.dataset.caveats, MAX_CAVEATS),
        trustedCardsCount: bundle.dataset.trustedCardsCount,
        excludedEvidenceCount: bundle.excludedEvidence.length,
    };
};

const resolveFindingImportance = (
    finding: ForumFinding,
    memos: AnalystMemo[],
): AnalystFindingImportance => {
    let resolved: AnalystFindingImportance = 'medium';
    const ranking: Record<AnalystFindingImportance, number> = {
        low: 0,
        medium: 1,
        high: 2,
    };

    for (const memo of memos) {
        for (const memoFinding of memo.findings) {
            const hasMatchingEvidence = memoFinding.evidenceRefs.some(ref => finding.evidenceRefs.includes(ref));
            const hasMatchingClaim = trimText(memoFinding.claim).toLowerCase() === trimText(finding.claim).toLowerCase();
            if (!hasMatchingEvidence && !hasMatchingClaim) {
                continue;
            }

            if (ranking[memoFinding.importance] > ranking[resolved]) {
                resolved = memoFinding.importance;
            }
        }
    }

    return resolved;
};

const buildFindingSection = (
    memos: AnalystMemo[],
    forum: ForumSummary,
): ReportFindingSection | null => {
    const findings = forum.consensusFindings.map(finding => ({
        id: finding.id,
        claim: normalizeReportNarrative(finding.claim, { maxSentences: 1, fallback: finding.claim }),
        importance: resolveFindingImportance(finding, memos),
        supportedByRoles: finding.supportedByRoles,
        caveats: dedupeStrings(finding.caveats, MAX_CAVEATS),
        evidenceRefs: finding.evidenceRefs,
    })).filter(finding => finding.evidenceRefs.length > 0);

    if (findings.length === 0) {
        return null;
    }

    return {
        type: 'findings',
        title: 'Key Findings',
        items: findings,
    };
};

const buildEvidenceWhyItMatters = (
    card: ReportCardEvidence,
    forum: ForumSummary,
    memos: AnalystMemo[],
): string => {
    const forumMatch = forum.consensusFindings.find(finding => finding.evidenceRefs.includes(card.evidenceId));
    if (forumMatch) {
        return normalizeReportNarrative(forumMatch.claim, { maxSentences: 1, fallback: forumMatch.claim });
    }

    const memoMatch = memos
        .flatMap(memo => memo.findings)
        .find(finding => finding.evidenceRefs.includes(card.evidenceId));
    if (memoMatch) {
        return normalizeReportNarrative(memoMatch.claim, { maxSentences: 1, fallback: memoMatch.claim });
    }

    return normalizeReportNarrative(card.summary?.text || card.description || card.displayTitle, {
        maxSentences: 1,
        fallback: card.displayTitle,
    });
};

const buildEvidenceSection = (
    bundle: ReportEvidenceBundle,
    forum: ForumSummary,
    memos: AnalystMemo[],
): ReportEvidenceSection | null => {
    if (bundle.cards.length === 0) {
        return null;
    }

    return {
        type: 'evidence',
        title: 'Evidence Appendix Highlights',
        cards: bundle.cards.map(card => ({
            cardId: card.cardId,
            title: card.displayTitle,
            artifactType: card.artifactType,
            whyItMatters: buildEvidenceWhyItMatters(card, forum, memos),
        })),
    };
};

const buildManagementHighlights = (
    forum: ForumSummary,
    memos: AnalystMemo[],
    crossCardInsights: string[] = [],
): string[] => {
    const ranked = [
        ...forum.consensusFindings.map(finding => ({
            text: normalizeReportNarrative(finding.claim, { maxSentences: 1, fallback: finding.claim }),
            key: buildNarrativeSemanticKey(finding.claim),
            score: 3,
        })),
        ...memos.map(memo => ({
            text: normalizeReportNarrative(memo.headline, { maxSentences: 1, fallback: memo.headline }),
            key: buildNarrativeSemanticKey(memo.headline),
            score: memo.confidence === 'high' ? 2 : 1,
        })),
    ].filter(entry => entry.text);

    const selected: string[] = [];
    const seen = new Set<string>();

    // Cross-card insights are prepended at score 4 (above forum findings at 3)
    for (const insight of crossCardInsights) {
        const key = buildNarrativeSemanticKey(insight);
        if (!seen.has(key)) {
            seen.add(key);
            selected.push(insight);
            if (selected.length >= MAX_MANAGEMENT_HIGHLIGHTS) {
                break;
            }
        }
    }

    for (const entry of ranked.sort((left, right) => right.score - left.score)) {
        if (seen.has(entry.key)) {
            continue;
        }
        seen.add(entry.key);
        selected.push(entry.text);
        if (selected.length >= MAX_MANAGEMENT_HIGHLIGHTS) {
            break;
        }
    }

    return selected;
};

const buildSummarySection = (
    bundle: ReportEvidenceBundle,
    memos: AnalystMemo[],
    forum: ForumSummary,
): ReportSummarySection => {
    const executivePosition = normalizeReportNarrative(
        forum.executiveSummary || bundle.dataset.reportReadinessReason,
        { maxSentences: 2, fallback: bundle.dataset.reportReadinessReason },
    );
    const topImplication = normalizeReportNarrative(
        forum.consensusFindings[0]?.claim || memos.find(memo => memo.role === 'business')?.headline || executivePosition,
        { maxSentences: 2, fallback: executivePosition },
    );
    const mainCaution = normalizeReportNarrative(
        forum.consensusFindings.flatMap(finding => finding.caveats)[0]
        || memos.find(memo => memo.role === 'risk')?.headline
        || bundle.dataset.reportReadinessReason,
        { maxSentences: 2, fallback: bundle.dataset.reportReadinessReason },
    );

    return {
        title: 'Executive Summary',
        executiveSummary: [executivePosition, topImplication, mainCaution].filter(Boolean).join(' '),
        executivePosition,
        topImplication,
        mainCaution,
        overallConfidence: forum.overallConfidence,
        managementHighlights: buildManagementHighlights(forum, memos, synthesizeCrossCardInsights(bundle.cards).map(i => i.insight)),
        recommendedActions: dedupeStrings(
            forum.recommendedActions.map(action => normalizeReportNarrative(action, { maxSentences: 1, fallback: action })),
            MAX_RECOMMENDED_ACTIONS,
        ),
    };
};

const buildSections = (
    bundle: ReportEvidenceBundle,
    memos: AnalystMemo[],
    forum: ForumSummary,
): ReportSection[] => {
    const sections: ReportSection[] = [];
    const findings = buildFindingSection(memos, forum);
    if (findings) {
        sections.push(findings);
    }

    if (forum.disagreements.length > 0) {
        sections.push({
            type: 'disagreements',
            title: 'Open Disagreements',
            items: forum.disagreements.map(disagreement => ({
                id: disagreement.id,
                topic: normalizeReportNarrative(disagreement.topic, { maxSentences: 1, fallback: disagreement.topic }),
                resolution: disagreement.resolution,
                positions: disagreement.positions.map(position => ({
                    ...position,
                    stance: normalizeReportNarrative(position.stance, { maxSentences: 2, fallback: position.stance }),
                })),
            })),
        });
    }

    const evidence = buildEvidenceSection(bundle, forum, memos);
    if (evidence) {
        sections.push(evidence);
    }

    return sections;
};

const buildKpiHighlightsFallback = (
    bundle: ReportEvidenceBundle,
    visuals: ReportIr['reportVisuals'],
): ReportKpiHighlight[] => {
    const highlights: ReportKpiHighlight[] = [];

    const firstVisual = visuals[0];
    if (firstVisual?.calloutValue) {
        highlights.push({
            label: 'Top visual value',
            value: firstVisual.calloutValue,
            supportingNote: firstVisual.businessTitle,
            tone: 'good',
        });
    }

    if (bundle.dataset.caveats.length > 0 || bundle.dataset.readinessRisks.length > 0) {
        highlights.push({
            label: 'Material caveats',
            value: String(bundle.dataset.caveats.length + bundle.dataset.readinessRisks.length),
            supportingNote: 'Caveats and readiness risks still active.',
            tone: 'warning',
        });
    }

    if (bundle.cards.length > 0) {
        highlights.push({
            label: 'Analysis views',
            value: String(bundle.cards.length),
            supportingNote: 'Visual evidence included in this report.',
            tone: 'neutral',
        });
    }

    return highlights.slice(0, MAX_KPI_HIGHLIGHTS);
};

const buildKpiHighlights = (
    bundle: ReportEvidenceBundle,
    visuals: ReportIr['reportVisuals'],
    directives?: ReportQualityDirectives,
): ReportKpiHighlight[] => {
    if (directives?.businessKpis && directives.businessKpis.length > 0) {
        return directives.businessKpis.slice(0, MAX_KPI_HIGHLIGHTS);
    }
    return buildKpiHighlightsFallback(bundle, visuals);
};

const buildContents = (): ReportContentsItem[] => ([
    { id: 'key-takeaways', label: 'Key Takeaways' },
    { id: 'kpi-strip', label: 'KPI Snapshot' },
    { id: 'key-findings', label: 'Key Findings' },
    { id: 'risks-caveats', label: 'Risks & Caveats' },
    { id: 'recommended-actions', label: 'Recommended Actions' },
    { id: 'appendix', label: 'Appendix' },
]);

export const buildReportIr = (
    bundle: ReportEvidenceBundle,
    memos: AnalystMemo[],
    forum: ForumSummary,
): ReportIr => {
    const directives = runReportQualityHarness(bundle);
    const reportVisuals = buildReportVisualSelection(bundle, forum, memos);

    return {
        version: 'report_ir_v1',
        reportId: buildReportId(bundle),
        generatedAt: bundle.generatedAt,
        dataset: buildDatasetSection(bundle, forum, directives),
        summary: buildSummarySection(bundle, memos, forum),
        contents: buildContents(),
        kpiHighlights: buildKpiHighlights(bundle, reportVisuals, directives),
        reportVisuals,
        sections: buildSections(bundle, memos, forum),
        appendix: {
            title: 'Evidence Catalog',
            evidenceCatalog: bundle.evidenceCatalog,
            excludedEvidence: bundle.excludedEvidence,
        },
    };
};
