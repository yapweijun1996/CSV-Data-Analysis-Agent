import type {
    ReportArtifactManifest,
    ReportIr,
    ReportSection,
    Settings,
} from '../../types';
import { getShellText, type ShellText } from './reportLocalization';
import {
    dedupeStrings,
    normalizeReportTemplate,
    filterBusinessFindingSections,
} from './htmlUtils';
import {
    renderStructuralSignals,
    renderParagraphBlock,
    renderTextParagraph,
    renderNumberedList,
    renderList,
    renderProwHeader,
    renderPaddtSection,
    buildDistinctParagraphBlocks,
} from './htmlRenderers';
import {
    renderFindingRows,
    renderDisagreementPtac,
    renderEvidenceHighlightRows,
    renderAppendix,
    buildSummarySection,
    buildKpiSection,
    buildFindingsSection,
    buildRisksSection,
    buildActionsSection,
    buildTraceabilitySection,
    buildCompactAppendixSection,
} from './reportSections';

export interface RenderHtmlReportOptions {
    language?: Settings['language'];
    manifest?: ReportArtifactManifest;
    reportTemplate?: Settings['reportTemplate'];
}

export const assembleReportData = (ir: ReportIr, options?: RenderHtmlReportOptions) => {
    const text = getShellText(options?.language);
    const reportTemplate = normalizeReportTemplate(options?.reportTemplate ?? 'management_review');
    const documentTitle = ir.dataset.datasetName
        ? `${ir.dataset.datasetName} Analyst Report`
        : 'Analyst Report';
    const structuralSignals = renderStructuralSignals(ir.dataset.structuralSignals);
    const risksAndCaveats = dedupeStrings([...ir.dataset.readinessRisks, ...ir.dataset.caveats]);
    const findingSections = ir.sections.filter(section => section.type === 'findings');
    const disagreementSections = ir.sections.filter(
        (section): section is Extract<ReportSection, { type: 'disagreements' }> => section.type === 'disagreements',
    );
    const evidenceSections = ir.sections.filter(
        (section): section is Extract<ReportSection, { type: 'evidence' }> => section.type === 'evidence',
    );
    const shouldRenderWarningBanner = options?.manifest?.artifactStatus === 'partial';
    const reportVisuals = reportTemplate === 'executive_brief'
        ? ir.reportVisuals.slice(0, 1)
        : reportTemplate === 'management_review'
            ? ir.reportVisuals.slice(0, 2)
            : ir.reportVisuals;
    const findingSectionsForTemplate = reportTemplate === 'audit_appendix'
        ? findingSections
        : findingSections
            .map(section => ({
                ...section,
                items: section.items.slice(0, reportTemplate === 'executive_brief' ? 2 : 3),
            }))
            .filter(section => section.items.length > 0);
    const businessFindingSections = reportTemplate === 'audit_appendix'
        ? findingSectionsForTemplate
        : filterBusinessFindingSections(
            findingSectionsForTemplate,
            reportVisuals.map(visual => visual.businessTitle),
        );
    const heroStats = [
        { label: 'Dataset', value: ir.dataset.datasetName || 'Untitled' },
        { label: 'Dataset version', value: ir.dataset.datasetVersion || 'Unverified' },
        { label: 'Trusted evidence', value: String(ir.dataset.trustedCardsCount) },
        { label: 'Visuals', value: String(reportVisuals.length) },
        { label: 'Material caveats', value: String(risksAndCaveats.length) },
    ];

    const auditSummaryParagraphs = [
        renderParagraphBlock(text.overallPosition, ir.summary.executivePosition),
        renderParagraphBlock(text.topBusinessImplication, ir.summary.topImplication),
        renderParagraphBlock(text.mainCaution, ir.summary.mainCaution),
        renderParagraphBlock(text.deliveryReadiness, ir.dataset.readinessReason),
        ...ir.summary.managementHighlights.map(renderTextParagraph),
        ...(ir.dataset.readinessDrivers.length > 0
            ? [renderParagraphBlock(text.support, ir.dataset.readinessDrivers.join(' | '))]
            : []),
        ...(ir.dataset.readinessRisks.length > 0
            ? [renderParagraphBlock(text.risks, ir.dataset.readinessRisks.join(' | '))]
            : []),
        ...(structuralSignals.length > 0
            ? [renderParagraphBlock(text.structuralRiskSignals, structuralSignals.join(' | '))]
            : []),
    ];
    const executiveBriefSummaryParagraphs = buildDistinctParagraphBlocks([
        { label: text.overallPosition, value: ir.summary.executivePosition },
        { label: text.topBusinessImplication, value: ir.summary.topImplication },
        { label: text.mainCaution, value: ir.summary.mainCaution },
    ], 2);
    const managementReviewSummaryParagraphs = buildDistinctParagraphBlocks([
        { label: text.overallPosition, value: ir.summary.executivePosition },
        { label: text.topBusinessImplication, value: ir.summary.topImplication },
        { label: text.mainCaution, value: ir.summary.mainCaution },
        { label: text.deliveryReadiness, value: ir.dataset.readinessReason },
    ], 4);
    const businessContext = dedupeStrings([
        ir.summary.executivePosition,
        ir.summary.topImplication,
        ...reportVisuals.map(visual => visual.businessTitle),
        ...businessFindingSections.flatMap(section => section.items.map(item => item.claim)),
    ]);

    const findingsMarkup = renderFindingRows(reportVisuals, text, businessFindingSections, {
        reportTemplate,
        maxItems: reportTemplate === 'executive_brief' ? 2 : reportTemplate === 'management_review' ? 4 : undefined,
    });
    const disagreementsMarkup = disagreementSections.map((section, index) => renderDisagreementPtac(section, text, {
        id: index === 0 ? 'open-disagreements' : undefined,
    })).join('');
    const evidenceHighlights = evidenceSections.map(section => renderEvidenceHighlightRows(section, text));
    const evidenceRows = evidenceHighlights.some(result => result.rows)
        ? [
            renderProwHeader(text.appendixHighlights, text.appendixHighlights),
            ...evidenceHighlights.map(result => result.rows),
        ].join('')
        : '';
    const appendix = renderAppendix(ir, text);

    const dedupedActions = dedupeStrings(ir.summary.recommendedActions)
        .map(action => action.replace(/^\d+[\.\)]\s*/, '').trim())
        .filter(Boolean);
    const recommendationParagraphs = dedupedActions.length > 1
        ? [renderNumberedList(dedupedActions)]
        : dedupedActions.map(renderTextParagraph);

    const evidenceLongForm = evidenceHighlights.flatMap(result => result.longForm);
    const briefRiskItems = risksAndCaveats.slice(0, 3);
    const executiveBriefRiskParagraphs = [
        ...(briefRiskItems.length > 1 ? [renderList(briefRiskItems, 'bullet-list')] : briefRiskItems.map(renderTextParagraph)),
        ...(disagreementSections.length > 0
            ? [renderTextParagraph('Open disagreements remain and should be reviewed in the audit appendix layout.')]
            : []),
    ];
    const mgmtRiskItems = risksAndCaveats.slice(0, 4);
    const managementReviewRiskParagraphs = [
        ...(mgmtRiskItems.length > 1 ? [renderList(mgmtRiskItems, 'bullet-list')] : mgmtRiskItems.map(renderTextParagraph)),
        ...(disagreementSections.length > 0
            ? [renderTextParagraph('Open disagreements remain and should be reviewed in the audit appendix layout.')]
            : []),
    ];
    const auditRiskParagraphs = risksAndCaveats.map(renderTextParagraph);
    const auditTraceabilityParagraphs = [
        renderParagraphBlock(text.workflowStatus, ir.dataset.workflowStatus),
        renderParagraphBlock(text.datasetShape, ir.dataset.shapeSummary),
        ...(ir.dataset.generationBlockers.length > 0
            ? [renderParagraphBlock(text.generationBlockers, ir.dataset.generationBlockers.join(' | '))]
            : []),
    ];
    const activeContents = reportTemplate === 'audit_appendix'
        ? [
            { id: 'key-takeaways', label: text.managementSummary },
            { id: 'traceability', label: text.traceability },
            { id: 'kpi-strip', label: text.kpiSnapshot },
            { id: 'key-findings', label: text.keyFindings },
            { id: 'risks-caveats', label: text.decisionGuardrails },
            { id: 'recommended-actions', label: text.recommendedActions },
            ...(disagreementsMarkup ? [{ id: 'open-disagreements', label: text.openQuestions }] : []),
            { id: 'appendix', label: text.evidenceCatalog },
        ]
        : [
            { id: 'key-takeaways', label: text.managementSummary },
            { id: 'kpi-strip', label: text.kpiSnapshot },
            { id: 'key-findings', label: text.keyFindings },
            { id: 'risks-caveats', label: text.decisionGuardrails },
            { id: 'recommended-actions', label: text.recommendedActions },
            { id: 'appendix', label: text.appendixHighlights },
        ];
    const shouldRepeatRowHeader = reportTemplate === 'audit_appendix';
    const reportBody = reportTemplate === 'audit_appendix'
        ? [
            buildSummarySection(ir, text, auditSummaryParagraphs),
            buildTraceabilitySection(text, auditTraceabilityParagraphs),
            buildKpiSection(text, ir.kpiHighlights ?? []),
            buildFindingsSection(text, findingsMarkup),
            buildRisksSection(text, auditRiskParagraphs),
            buildActionsSection(text, recommendationParagraphs),
            disagreementsMarkup,
            evidenceRows,
            appendix.rows,
            renderPaddtSection(text.evidenceCatalog, text.appendixHighlights, evidenceLongForm, { id: 'appendix-highlights' }),
            appendix.longForm,
        ].filter(Boolean).join('')
        : reportTemplate === 'executive_brief'
            ? [
                buildSummarySection(ir, text, executiveBriefSummaryParagraphs, { compact: true }),
                buildKpiSection(text, ir.kpiHighlights ?? [], { compactIntro: true, businessContext }),
                buildFindingsSection(text, findingsMarkup, { compactIntro: true }),
                buildRisksSection(text, executiveBriefRiskParagraphs, { compact: true }),
                buildActionsSection(text, recommendationParagraphs.slice(0, 3), { compact: true }),
                buildCompactAppendixSection(text, ir),
            ].filter(Boolean).join('')
        : [
            buildSummarySection(ir, text, managementReviewSummaryParagraphs, { compact: true }),
            buildKpiSection(text, ir.kpiHighlights ?? [], { compactIntro: true, businessContext }),
            buildFindingsSection(text, findingsMarkup, { compactIntro: true }),
            buildRisksSection(text, managementReviewRiskParagraphs, { compact: true }),
            buildActionsSection(text, recommendationParagraphs.slice(0, 4), { compact: true }),
            buildCompactAppendixSection(text, ir),
        ].filter(Boolean).join('');

    return {
        text,
        reportTemplate,
        documentTitle,
        structuralSignals,
        risksAndCaveats,
        findingSections,
        disagreementSections,
        evidenceSections,
        shouldRenderWarningBanner,
        reportVisuals,
        findingSectionsForTemplate,
        businessFindingSections,
        heroStats,
        auditSummaryParagraphs,
        executiveBriefSummaryParagraphs,
        managementReviewSummaryParagraphs,
        businessContext,
        findingsMarkup,
        disagreementsMarkup,
        evidenceHighlights,
        evidenceRows,
        appendix,
        dedupedActions,
        recommendationParagraphs,
        evidenceLongForm,
        executiveBriefRiskParagraphs,
        managementReviewRiskParagraphs,
        auditRiskParagraphs,
        auditTraceabilityParagraphs,
        activeContents,
        shouldRepeatRowHeader,
        reportBody,
    };
};
